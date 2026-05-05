import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import {
	getObjectBytes,
	putObjectBytes,
	WASABI_ACCESS_KEY_ID,
	WASABI_SECRET_ACCESS_KEY
} from './wasabiClient.js';
import type { DiveVideoProcessingJob } from './mediaProcessingJobs.js';

const require = createRequire(import.meta.url);
const ffmpegPath = require('ffmpeg-static') as string | null;
const ffprobeStatic = require('ffprobe-static') as { path?: string };
const execFileAsync = promisify(execFile);

interface MediaObjectRef {
	provider?: 'wasabi';
	bucket?: string;
	key: string;
	contentType?: string;
	sizeBytes?: number;
}

interface MediaProcessingJobDoc {
	videoId: string;
	ownerId: string;
	type: DiveVideoProcessingJob;
	status: 'queued' | 'processing' | 'ready' | 'failed' | 'retryable';
	attempts?: number;
}

interface DiveVideoDoc {
	ownerId?: string;
	userId?: string;
	storagePathClean?: string;
	cleanObject?: MediaObjectRef;
	storageProvider?: 'wasabi' | 'firebase-storage';
	mimeType?: string;
	sizeBytes?: number;
	widthPx?: number;
	heightPx?: number;
	durationSeconds?: number;
	actualFrameRate?: number;
}

interface ProbeSideData {
	rotation?: number;
}

interface ProbeStream {
	codec_type?: string;
	codec_name?: string;
	width?: number;
	height?: number;
	r_frame_rate?: string;
	avg_frame_rate?: string;
	tags?: {
		rotate?: string;
	};
	side_data_list?: ProbeSideData[];
}

interface ProbeOutput {
	streams?: ProbeStream[];
	format?: {
		duration?: string;
		size?: string;
		format_name?: string;
	};
}

function requireUid(auth?: { uid: string }): string {
	if (!auth?.uid) throw new HttpsError('unauthenticated', 'Sign in is required');
	return auth.uid;
}

function asRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new HttpsError('invalid-argument', 'Expected an object payload');
	}
	return value as Record<string, unknown>;
}

function requiredString(data: Record<string, unknown>, key: string): string {
	const value = data[key];
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new HttpsError('invalid-argument', `Missing ${key}`);
	}
	return value.trim();
}

function stateKeyFor(type: DiveVideoProcessingJob): string | null {
	if (type === 'probe-master') return 'master';
	if (type === 'generate-thumbnail') return 'thumbnail';
	if (type === 'generate-playback-proxy') return 'playbackProxy';
	if (type === 'generate-overlay-preview') return 'overlayPreview';
	if (type === 'generate-overlay-download') return 'overlayDownload';
	return null;
}

function isImplementedAutomaticJob(type: DiveVideoProcessingJob): boolean {
	return type === 'probe-master' || type === 'generate-thumbnail';
}

function frameRate(value: string | undefined): number | undefined {
	if (!value || value === '0/0') return undefined;
	const [numeratorRaw, denominatorRaw] = value.split('/');
	const numerator = Number(numeratorRaw);
	const denominator = Number(denominatorRaw ?? '1');
	if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
		return undefined;
	}
	return numerator / denominator;
}

function normalizedRotation(value: number | undefined): 0 | 90 | 180 | 270 | undefined {
	if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
	const normalized = ((Math.round(value) % 360) + 360) % 360;
	if (normalized === 0 || normalized === 90 || normalized === 180 || normalized === 270) {
		return normalized;
	}
	return undefined;
}

function streamRotation(stream: ProbeStream | undefined): 0 | 90 | 180 | 270 | undefined {
	if (!stream) return undefined;
	const tagRotation = Number(stream.tags?.rotate);
	const sideDataRotation = stream.side_data_list
		?.map((sideData) => normalizedRotation(sideData.rotation))
		.find((rotation) => rotation !== undefined);
	return normalizedRotation(tagRotation) ?? sideDataRotation;
}

function withoutUndefined(fields: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(fields).filter(([, value]) => value !== undefined)
	);
}

function masterObject(video: DiveVideoDoc): { bucket: string; key: string; contentType?: string } {
	if (video.cleanObject?.bucket && video.cleanObject.key) {
		return {
			bucket: video.cleanObject.bucket,
			key: video.cleanObject.key,
			contentType: video.cleanObject.contentType
		};
	}
	throw new HttpsError('failed-precondition', 'Dive video has no Wasabi clean object');
}

function assertWorkerBinaries(): { ffmpeg: string; ffprobe: string } {
	if (!ffmpegPath) throw new HttpsError('failed-precondition', 'ffmpeg binary is unavailable');
	if (!ffprobeStatic.path) throw new HttpsError('failed-precondition', 'ffprobe binary is unavailable');
	return { ffmpeg: ffmpegPath, ffprobe: ffprobeStatic.path };
}

async function claimJob(args: {
	uid?: string;
	jobId: string;
}): Promise<MediaProcessingJobDoc & { id: string }> {
	const db = getFirestore();
	const jobRef = db.collection('mediaProcessingJobs').doc(args.jobId);
	return db.runTransaction(async (transaction) => {
		const snap = await transaction.get(jobRef);
		if (!snap.exists) throw new HttpsError('not-found', 'Media processing job not found');
		const job = snap.data() as MediaProcessingJobDoc;
		if (args.uid && job.ownerId !== args.uid) {
			throw new HttpsError('permission-denied', 'You do not own this media processing job');
		}
		if (job.status === 'ready') return { ...job, id: snap.id };
		if (job.status === 'processing') {
			throw new HttpsError('failed-precondition', 'Media processing job is already running');
		}
		transaction.update(jobRef, {
			status: 'processing',
			attempts: FieldValue.increment(1),
			claimedAt: FieldValue.serverTimestamp(),
			updatedAt: FieldValue.serverTimestamp()
		});
		return { ...job, id: snap.id };
	});
}

async function withMasterFile<T>(video: DiveVideoDoc, fn: (path: string) => Promise<T>): Promise<T> {
	const object = masterObject(video);
	const bytes = await getObjectBytes({ bucket: object.bucket, key: object.key });
	const ext = object.contentType?.includes('webm') || video.mimeType?.includes('webm') ? 'webm' : 'mp4';
	const inputPath = join(tmpdir(), `overdive-${randomUUID()}.${ext}`);
	await writeFile(inputPath, bytes);
	try {
		return await fn(inputPath);
	} finally {
		await rm(inputPath, { force: true });
	}
}

async function probeMaster(video: DiveVideoDoc): Promise<Record<string, unknown>> {
	const { ffprobe } = assertWorkerBinaries();
	return withMasterFile(video, async (inputPath) => {
		const { stdout } = await execFileAsync(ffprobe, [
			'-v',
			'error',
			'-print_format',
			'json',
			'-show_format',
			'-show_streams',
			inputPath
		]);
		const output = JSON.parse(stdout) as ProbeOutput;
		const videoStream = output.streams?.find((stream) => stream.codec_type === 'video');
		const audioStream = output.streams?.find((stream) => stream.codec_type === 'audio');
		const durationSeconds = Number(output.format?.duration);
		const sizeBytes = Number(output.format?.size);
		return withoutUndefined({
			widthPx: videoStream?.width ?? video.widthPx,
			heightPx: videoStream?.height ?? video.heightPx,
			durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : video.durationSeconds,
			sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : video.sizeBytes,
			actualFrameRate:
				frameRate(videoStream?.avg_frame_rate) ??
				frameRate(videoStream?.r_frame_rate) ??
				video.actualFrameRate,
			probeFormatName: output.format?.format_name,
			probeVideoCodec: videoStream?.codec_name,
			probeAudioCodec: audioStream?.codec_name,
			probeRotationDeg: streamRotation(videoStream)
		});
	});
}

async function generateThumbnail(args: {
	videoId: string;
	video: DiveVideoDoc;
}): Promise<{ bucket: string; key: string; sizeBytes: number }> {
	const { ffmpeg } = assertWorkerBinaries();
	const object = masterObject(args.video);
	return withMasterFile(args.video, async (inputPath) => {
		const outputPath = join(tmpdir(), `overdive-thumb-${randomUUID()}.jpg`);
		try {
			await execFileAsync(ffmpeg, [
				'-y',
				'-i',
				inputPath,
				'-vf',
				'scale=480:-2',
				'-frames:v',
				'1',
				'-q:v',
				'4',
				outputPath
			]);
			const bytes = await readFile(outputPath);
			const ownerId = args.video.ownerId ?? args.video.userId;
			if (!ownerId) throw new HttpsError('failed-precondition', 'Dive video has no owner');
			const key = `users/${ownerId}/videos/${args.videoId}/thumb.jpg`;
			await putObjectBytes({ bucket: object.bucket, key, body: bytes, contentType: 'image/jpeg' });
			return { bucket: object.bucket, key, sizeBytes: bytes.byteLength };
		} finally {
			await rm(outputPath, { force: true });
		}
	});
}

async function markFailed(args: {
	jobId: string;
	videoId: string;
	type: DiveVideoProcessingJob;
	error: unknown;
}): Promise<void> {
	const message = args.error instanceof Error ? args.error.message : String(args.error);
	const db = getFirestore();
	const stateKey = stateKeyFor(args.type);
	const videoUpdate: Record<string, unknown> = {
		'processingState.lastError': message,
		'processingState.lastErrorAt': FieldValue.serverTimestamp(),
		updatedAt: FieldValue.serverTimestamp()
	};
	if (stateKey) videoUpdate[`processingState.${stateKey}`] = 'retryable';
	await Promise.all([
		db.collection('mediaProcessingJobs').doc(args.jobId).update({
			status: 'retryable',
			lastError: message,
			updatedAt: FieldValue.serverTimestamp()
		}),
		db.collection('diveVideos').doc(args.videoId).update(videoUpdate)
	]);
}

async function runMediaJob(args: { jobId: string; uid?: string }): Promise<{
	jobId: string;
	status: 'ready';
	type?: DiveVideoProcessingJob;
	alreadyComplete?: boolean;
}> {
	const db = getFirestore();
	const job = await claimJob({ uid: args.uid, jobId: args.jobId });
	if (job.status === 'ready') return { jobId: args.jobId, status: 'ready', alreadyComplete: true };

	try {
		const videoRef = db.collection('diveVideos').doc(job.videoId);
		const videoSnap = await videoRef.get();
		if (!videoSnap.exists) throw new HttpsError('not-found', 'Dive video not found');
		const video = videoSnap.data() as DiveVideoDoc;
		const ownerId = video.ownerId ?? video.userId;
		if (ownerId !== job.ownerId) {
			throw new HttpsError('failed-precondition', 'Media job owner does not match dive video owner');
		}
		if (args.uid && ownerId !== args.uid) {
			throw new HttpsError('permission-denied', 'You do not own this dive video');
		}

		if (job.type === 'probe-master') {
			const probe = await probeMaster(video);
			await videoRef.update({
				...probe,
				'processingState.master': 'ready',
				updatedAt: FieldValue.serverTimestamp()
			});
		} else if (job.type === 'generate-thumbnail') {
			const thumbnail = await generateThumbnail({ videoId: job.videoId, video });
			await videoRef.update({
				thumbnailPath: thumbnail.key,
				thumbnailObject: {
					provider: 'wasabi',
					bucket: thumbnail.bucket,
					key: thumbnail.key,
					contentType: 'image/jpeg',
					sizeBytes: thumbnail.sizeBytes
				},
				'processingState.thumbnail': 'ready',
				updatedAt: FieldValue.serverTimestamp()
			});
		} else {
			throw new HttpsError(
				'failed-precondition',
				`Media job type ${job.type} is queued but not implemented yet`
			);
		}

		await db.collection('mediaProcessingJobs').doc(args.jobId).update({
			status: 'ready',
			completedAt: FieldValue.serverTimestamp(),
			updatedAt: FieldValue.serverTimestamp()
		});
		return { jobId: args.jobId, status: 'ready', type: job.type };
	} catch (err) {
		logger.error('processMediaJob failed', { jobId: args.jobId, err });
		await markFailed({ jobId: args.jobId, videoId: job.videoId, type: job.type, error: err });
		throw err;
	}
}

export const processMediaJob = onCall(
	{
		secrets: [WASABI_ACCESS_KEY_ID, WASABI_SECRET_ACCESS_KEY],
		timeoutSeconds: 540,
		memory: '1GiB'
	},
	async (request) => {
		const uid = requireUid(request.auth);
		const data = asRecord(request.data);
		const jobId = requiredString(data, 'jobId');
		return runMediaJob({ jobId, uid });
	}
);

export const onMediaProcessingJobCreated = onDocumentCreated(
	{
		document: 'mediaProcessingJobs/{jobId}',
		secrets: [WASABI_ACCESS_KEY_ID, WASABI_SECRET_ACCESS_KEY],
		timeoutSeconds: 540,
		memory: '1GiB'
	},
	async (event) => {
		const snap = event.data;
		if (!snap) return;
		const job = snap.data() as MediaProcessingJobDoc;
		if (!isImplementedAutomaticJob(job.type)) {
			logger.info('media job queued for later worker implementation', {
				jobId: event.params.jobId,
				type: job.type
			});
			return;
		}
		await runMediaJob({ jobId: event.params.jobId });
	}
);