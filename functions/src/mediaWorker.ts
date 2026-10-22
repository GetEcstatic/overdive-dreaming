import { randomUUID } from 'node:crypto';
import { execFile, fork, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import {
	getObjectBytes,
	putObjectBytes,
	WASABI_ACCESS_KEY_ID,
	WASABI_SECRET_ACCESS_KEY
} from './wasabiClient.js';
import { enqueueAfterProxyJobs, type DiveVideoProcessingJob } from './mediaProcessingJobs.js';
import type { DiveTimeline } from './lib/timelineToRoutineLog.js';
import {
	DEFAULT_SOCIAL_CUT_OPTIONS,
	SERVER_OVERLAY_STYLE_VERSION,
	overlayRenderKey,
	socialRenderKey,
	type SocialCutRenderOptions
} from '../../src/lib/media/overlayStyle';
import { OVERLAY_EXPORT_SHORT_EDGE_PX, scaleToShortEdge } from '../../src/lib/media/exportDimensions';
import { decodableAudioIndex } from '../../src/lib/media/audioStreams';
import { collapseFrameRuns, concatListForRuns } from '../../src/lib/media/frameRuns';
import {
	prepareDive,
	SOCIAL_BACKGROUND,
	SOCIAL_CANVAS,
	shareHudContextForVideo,
	shareHudSvg,
	socialCutEditList,
	socialCutFrameSvg,
	socialCutInputForDive,
	socialCutTicks,
	socialHudContext,
	socialVideoPlacement,
	displaySize
} from '../../src/lib/media/shareHud/index';
import { socialCutFilter } from '../../src/lib/media/socialCutFilter';
import { HUD_TICK_MS, hudFullTicks } from '../../src/lib/media/shareHud/exportPlan';
import { HUD_DEFAULT_FONT_FAMILY, hudFontFiles } from './hudFonts.js';
import type { HudRenderBatch } from './hudRenderChild.js';

const require = createRequire(import.meta.url);
const ffmpegPath = require('ffmpeg-static') as string | null;
const ffprobeStatic = require('ffprobe-static') as { path?: string };
const execFileAsync = promisify(execFile);
const OVERLAY_STYLE_VERSION = SERVER_OVERLAY_STYLE_VERSION;
const OVERLAY_REQUEST_LOCK_STALE_MS = 10 * 60 * 1000;
const OVERLAY_EXPORT_CRF = '20';
const OVERLAY_EXPORT_PRESET = 'veryfast';
// Instagram re-encodes Reels at about 3.5–5 Mbps: a higher cap only makes the phone download slower.
const SOCIAL_CUT_MAXRATE = '4M';
const SOCIAL_CUT_BUFSIZE = '8M';
const SOCIAL_CUT_PRESET = 'superfast';
/** A reel normally renders in well under a minute; past this it has died and the owner can retry. */
const SOCIAL_CUT_BUDGET_MS = 180 * 1000;
const SOCIAL_CUT_LOCK_STALE_MS = 5 * 60 * 1000;
const SOCIAL_PROGRESS_WRITE_MS = 2000;
// Time an overlay export may spend (download, HUD frames, FFmpeg) inside the
// 540 s processMediaJob timeout, leaving about 60 s to upload and record the
// artifact. FFmpeg gets whatever is left, so it fails cleanly instead of the
// function being killed mid-encode.
const OVERLAY_EXPORT_BUDGET_MS = 480 * 1000;
const OVERLAY_MIN_ENCODE_TIMEOUT_MS = 30 * 1000;
const MEDIA_JOB_PROCESSING_STALE_MS = 10 * 60 * 1000;

const HUD_REFERENCE_SHORT_EDGE_PX = 390;
const CSS_PX_PER_REM = 16;
const SPEED_PLOT_REFERENCE_WIDTH_PX = 1080;
const SPEED_PLOT_DEFAULT_DOMAIN_M = 200;
const SPEED_PLOT_DOMAIN_PADDING_RATIO = 1.2;
const SPEED_PLOT_MAX_SPEED_MS = 2;
const SPEED_PLOT_FIRST_ACCELERATION_M = 3;
const SPEED_PLOT_SEGMENT_STEP_EPSILON_MS = 0.01;

function rem(value: number): number {
	return value * CSS_PX_PER_REM;
}

function scaledCssPx(value: number, scale: number): number {
	return Math.round(value * scale);
}

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
	claimedAt?: FirebaseFirestore.Timestamp;
	/** Social cut only: the owner's toggles and the render key at request time. */
	options?: SocialCutRenderOptions;
	renderKey?: string;
}

type MediaProcessingResult = {
	jobId: string;
	status: 'ready' | 'retryable';
	type?: DiveVideoProcessingJob;
	alreadyComplete?: boolean;
};

interface OverlayRequestLockDoc {
	jobId?: string;
	renderKey?: string;
	status?: 'queued' | 'processing' | 'ready' | 'failed' | 'retryable';
	updatedAt?: FirebaseFirestore.Timestamp;
}

export interface DiveVideoDoc {
	ownerId?: string;
	userId?: string;
	storagePathClean?: string;
	cleanObject?: MediaObjectRef;
	artifacts?: DiveVideoArtifactRef[];
	storageProvider?: 'wasabi' | 'firebase-storage';
	mimeType?: string;
	sizeBytes?: number;
	actualAverageBitrateBps?: number;
	probeAudioCodec?: string;
	widthPx?: number;
	heightPx?: number;
	durationSeconds?: number;
	actualFrameRate?: number;
	discipline?: 'DYN' | 'DYNB' | 'DNF';
	poolLength?: number;
	timeline?: DiveTimeline;
	overlayStyleVersion?: string;
	displayOrientation?: 'landscape' | 'portrait-left' | 'portrait-right';
	displayRotationDeg?: 0 | 90 | 180 | 270;
	assetOrientation?: 'landscape' | 'portrait';
	probeRotationDeg?: 0 | 90 | 180 | 270;
	recordedAt?: FirebaseFirestore.Timestamp;
	/** Snapshot taken when the video is saved (plan §5.1–5.2). */
	shareContext?: { pbBeforeM?: number | null; athleteName?: string | null; dateLabel?: string | null };
	shareEdit?: { firstLengthDirection?: 'ltr' | 'rtl'; protocolEndMs?: number };
}

interface DiveVideoArtifactRef {
	kind: 'master' | 'thumbnail' | 'playback-proxy' | 'overlay-preview' | 'overlay-download' | 'social-cut' | 'hls-manifest';
	profile:
		| 'original'
		| 'thumb-jpeg'
		| 'mp4-720p'
		| 'mp4-1080p'
		| 'hls-adaptive'
		| 'overlay-mp4-540p'
		| 'overlay-mp4-720p'
		| 'overlay-mp4-1080p'
		| 'social-mp4-1080x1920';
	object: MediaObjectRef;
	widthPx?: number;
	heightPx?: number;
	durationSeconds?: number;
	sizeBytes?: number;
	contentType?: string;
	styleVersion?: string;
	disposable?: boolean;
	expiresAt?: FirebaseFirestore.Timestamp;
	createdAt?: FirebaseFirestore.Timestamp;
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
	if (type === 'generate-social-cut') return 'socialCut';
	return null;
}

function isImplementedAutomaticJob(type: DiveVideoProcessingJob): boolean {
	return (
		type === 'probe-master' ||
		type === 'generate-thumbnail' ||
		type === 'generate-playback-proxy' ||
		type === 'generate-overlay-download' ||
		type === 'generate-social-cut'
	);
}

function isStaleProcessingJob(job: MediaProcessingJobDoc, nowMs = Date.now()): boolean {
	const claimedAt = job.claimedAt;
	if (!claimedAt || typeof claimedAt.toMillis !== 'function') return false;
	return nowMs - claimedAt.toMillis() > MEDIA_JOB_PROCESSING_STALE_MS;
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

function formatAssTime(seconds: number): string {
	const clamped = Math.max(0, seconds);
	const hours = Math.floor(clamped / 3600);
	const minutes = Math.floor((clamped % 3600) / 60);
	const secs = Math.floor(clamped % 60);
	const centiseconds = Math.floor((clamped % 1) * 100);
	return `${hours}:${minutes.toString().padStart(2, '0')}:${secs
		.toString()
		.padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}

function escapeAssText(value: string): string {
	return value.replace(/[{}]/g, '').replace(/\r?\n/g, ' ');
}

function formatHudTime(ms: number): string {
	const seconds = Math.floor(Math.max(0, ms) / 1000);
	const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
	const secs = (seconds % 60).toString().padStart(2, '0');
	const tenths = Math.floor((Math.max(0, ms) % 1000) / 100);
	return `${minutes}:${secs}.${tenths}`;
}

function displayRotationDeg(video: DiveVideoDoc): 0 | 90 | 180 | 270 {
	if (video.displayOrientation === 'portrait-left') return video.displayRotationDeg ?? 90;
	if (video.displayOrientation === 'portrait-right') return video.displayRotationDeg ?? 270;
	return 0;
}

function displayRotationFilters(video: DiveVideoDoc): string[] {
	const rotation = displayRotationDeg(video);
	if (rotation === 90) return ['transpose=1'];
	if (rotation === 270) return ['transpose=2'];
	if (rotation === 180) return ['hflip', 'vflip'];
	return [];
}

function rotatedDimensions(video: DiveVideoDoc): { width: number; height: number } {
	const sourceWidth = video.widthPx && video.widthPx > 0 ? video.widthPx : 1280;
	const sourceHeight = video.heightPx && video.heightPx > 0 ? video.heightPx : 720;
	const rotation = displayRotationDeg(video);
	if (rotation === 90 || rotation === 270) {
		return { width: sourceHeight, height: sourceWidth };
	}
	return { width: sourceWidth, height: sourceHeight };
}

function displayDimensions(video: DiveVideoDoc): { width: number; height: number } {
	const dimensions = rotatedDimensions(video);
	const shouldDisplayPortrait =
		video.displayOrientation === 'portrait-left' || video.displayOrientation === 'portrait-right';
	if (shouldDisplayPortrait && dimensions.width > dimensions.height) {
		return { width: dimensions.height, height: dimensions.width };
	}
	if (!shouldDisplayPortrait && dimensions.height > dimensions.width) {
		return { width: dimensions.height, height: dimensions.width };
	}
	return dimensions;
}

/** 720p when rendering from the playback proxy (never upscale), 1080p from an original. */
function overlayExportProfile(fromProxy: boolean): {
	shortEdgePx: number;
	profile: 'overlay-mp4-720p' | 'overlay-mp4-1080p';
} {
	return fromProxy
		? { shortEdgePx: OVERLAY_EXPORT_PROXY_SHORT_EDGE_PX, profile: 'overlay-mp4-720p' }
		: { shortEdgePx: OVERLAY_EXPORT_SHORT_EDGE_PX, profile: 'overlay-mp4-1080p' };
}

const OVERLAY_EXPORT_PROXY_SHORT_EDGE_PX = 720;

function diveElapsedAt(timeline: DiveTimeline, atMs: number): number {
	if (atMs <= timeline.diveStartMs) return 0;
	const end = timeline.diveEndMs > 0 ? timeline.diveEndMs : atMs;
	return Math.max(0, Math.min(atMs, end) - timeline.diveStartMs);
}

function sortedWaypointEvents(timeline: DiveTimeline) {
	return [...timeline.laps, ...(timeline.subSplits ?? [])]
		.filter((event) => event.atMs >= timeline.diveStartMs && event.atMs <= timeline.diveEndMs)
		.sort((a, b) => a.atMs - b.atMs || a.cumulativeDistanceM - b.cumulativeDistanceM);
}

function segmentSpeedMs(previous: { atMs: number; cumulativeDistanceM: number } | null, next: { atMs: number; cumulativeDistanceM: number }, timeline: DiveTimeline): number {
	const previousAtMs = previous?.atMs ?? timeline.diveStartMs;
	const previousDistanceM = previous?.cumulativeDistanceM ?? 0;
	const segmentMs = Math.max(0, next.atMs - previousAtMs);
	const segmentDistanceM = Math.max(0, next.cumulativeDistanceM - previousDistanceM);
	return segmentMs > 0 ? segmentDistanceM / (segmentMs / 1000) : 1;
}

function distanceAt(timeline: DiveTimeline, atMs: number, poolLength: number): number {
	void poolLength;
	const samples = timeline.samples;
	if (samples && samples.length > 0) {
		const before = [...samples].reverse().find((sample) => sample.atMs <= atMs);
		const after = samples.find((sample) => sample.atMs >= atMs);
		if (!before) {
			if (atMs <= timeline.diveStartMs) return 0;
			const first = samples[0];
			const effectiveAtMs = Math.min(atMs, first.atMs);
			return ((effectiveAtMs - timeline.diveStartMs) / 1000) * first.speedMs;
		}
		if (!after || after.atMs === before.atMs) return before.distanceM;
		const progress = (atMs - before.atMs) / (after.atMs - before.atMs);
		return before.distanceM + (after.distanceM - before.distanceM) * progress;
	}

	if (atMs <= timeline.diveStartMs) return 0;
	const effectiveAtMs = Math.min(atMs, timeline.diveEndMs);
	const waypoints = sortedWaypointEvents(timeline);
	if (waypoints.length === 0) return (effectiveAtMs - timeline.diveStartMs) / 1000;
	const nextIndex = waypoints.findIndex((event) => event.atMs >= effectiveAtMs);
	if (nextIndex >= 0) {
		const previous = waypoints[nextIndex - 1] ?? null;
		const next = waypoints[nextIndex];
		const previousAtMs = previous?.atMs ?? timeline.diveStartMs;
		const previousDistanceM = previous?.cumulativeDistanceM ?? 0;
		return previousDistanceM + segmentSpeedMs(previous, next, timeline) * ((effectiveAtMs - previousAtMs) / 1000);
	}
	const last = waypoints[waypoints.length - 1];
	return last.cumulativeDistanceM + segmentSpeedMs(waypoints[waypoints.length - 2] ?? null, last, timeline) * ((effectiveAtMs - last.atMs) / 1000);
}

function speedAt(timeline: DiveTimeline, atMs: number, poolLength: number): number {
	void poolLength;
	const samples = timeline.samples;
	if (samples && samples.length > 0) {
		const closest = [...samples].reverse().find((sample) => sample.atMs <= atMs) ?? samples[0];
		return closest.speedMs;
	}
	if (atMs <= timeline.diveStartMs || atMs > timeline.diveEndMs) return 0;
	const waypoints = sortedWaypointEvents(timeline);
	if (waypoints.length === 0) return 1;
	const nextIndex = waypoints.findIndex((event) => event.atMs >= Math.min(atMs, timeline.diveEndMs));
	if (nextIndex >= 0) return segmentSpeedMs(waypoints[nextIndex - 1] ?? null, waypoints[nextIndex], timeline);
	const last = waypoints[waypoints.length - 1];
	return segmentSpeedMs(waypoints[waypoints.length - 2] ?? null, last, timeline);
}

function roundedRectAssPath(width: number, height: number, radius: number): string {
	const r = Math.min(radius, width / 2, height / 2);
	return [
		`m ${r} 0`,
		`l ${width - r} 0`,
		`b ${width} 0 ${width} 0 ${width} ${r}`,
		`l ${width} ${height - r}`,
		`b ${width} ${height} ${width} ${height} ${width - r} ${height}`,
		`l ${r} ${height}`,
		`b 0 ${height} 0 ${height} 0 ${height - r}`,
		`l 0 ${r}`,
		`b 0 0 0 0 ${r} 0`
	].join(' ');
}

function rectAssPath(x: number, y: number, width: number, height: number): string {
	const x2 = x + width;
	const y2 = y + height;
	return `m ${x} ${y} l ${x2} ${y} l ${x2} ${y2} l ${x} ${y2}`;
}

function totalRealizedDistanceM(timeline: DiveTimeline, poolLength: number): number {
	return Math.max(
		0,
		distanceAt(timeline, timeline.diveEndMs, poolLength),
		...(timeline.samples?.map((sample) => sample.distanceM).filter(Number.isFinite) ?? []),
		...timeline.laps.map((lap) => lap.cumulativeDistanceM),
		...(timeline.subSplits?.map((split) => split.cumulativeDistanceM) ?? [])
	);
}

function speedPlotDomainM(timeline: DiveTimeline, poolLength: number): number {
	return Math.max(SPEED_PLOT_DEFAULT_DOMAIN_M, totalRealizedDistanceM(timeline, poolLength), 1) * SPEED_PLOT_DOMAIN_PADDING_RATIO;
}

function speedSamplesFromTimeline(timeline: DiveTimeline): { distanceM: number; speedMs: number; atMs: number }[] {
	if (timeline.samples && timeline.samples.length > 0) {
		const first = timeline.samples[0];
		const start = timeline.diveStartMs < first.atMs
			? [{ atMs: timeline.diveStartMs, distanceM: 0, speedMs: first.speedMs }]
			: [];
		return [...start, ...timeline.samples]
			.filter((sample) => Number.isFinite(sample.atMs) && Number.isFinite(sample.distanceM) && Number.isFinite(sample.speedMs))
			.sort((a, b) => a.atMs - b.atMs);
	}

	const waypoints = sortedWaypointEvents(timeline);
	const samples: { distanceM: number; speedMs: number; atMs: number }[] = [];
	let previousAtMs = timeline.diveStartMs;
	let previousDistanceM = 0;
	for (const waypoint of waypoints) {
		const segmentMs = Math.max(1, waypoint.atMs - previousAtMs);
		const segmentDistanceM = Math.max(0, waypoint.cumulativeDistanceM - previousDistanceM);
		const segmentSpeedMs = segmentDistanceM / (segmentMs / 1000);
		const segmentStartAtMs = samples.length === 0 ? previousAtMs : previousAtMs + SPEED_PLOT_SEGMENT_STEP_EPSILON_MS;
		samples.push({ atMs: segmentStartAtMs, distanceM: previousDistanceM, speedMs: segmentSpeedMs });
		samples.push({ atMs: waypoint.atMs, distanceM: waypoint.cumulativeDistanceM, speedMs: segmentSpeedMs });
		previousAtMs = waypoint.atMs;
		previousDistanceM = waypoint.cumulativeDistanceM;
	}
	return samples;
}

function speedLineSamplesAt(args: {
	timeline: DiveTimeline;
	poolLength: number;
	atMs: number;
}): { distanceM: number; speedMs: number }[] {
	const currentDistanceM = distanceAt(args.timeline, args.atMs, args.poolLength);
	const currentSpeedMs = speedAt(args.timeline, args.atMs, args.poolLength);
	if (currentDistanceM <= 0) return [];
	const revealed = speedSamplesFromTimeline(args.timeline)
		.filter((sample) => sample.atMs <= args.atMs)
		.map((sample) => ({ distanceM: sample.distanceM, speedMs: sample.speedMs }));
	const hasRevealedPositiveWaypoint = revealed.some(
		(sample) => sample.distanceM > 0.001 && sample.distanceM < currentDistanceM - 0.001
	);
	if (!hasRevealedPositiveWaypoint) {
		const accelerationDistanceM = Math.min(SPEED_PLOT_FIRST_ACCELERATION_M, currentDistanceM);
		const firstSegment = [
			{ distanceM: 0, speedMs: 0 },
			{ distanceM: accelerationDistanceM, speedMs: currentSpeedMs }
		];
		if (currentDistanceM > accelerationDistanceM + 0.001) {
			firstSegment.push({ distanceM: currentDistanceM, speedMs: currentSpeedMs });
		}
		return firstSegment;
	}
	const last = revealed[revealed.length - 1];
	if (!last || currentDistanceM > last.distanceM + 0.001) {
		revealed.push({ distanceM: currentDistanceM, speedMs: currentSpeedMs });
	}
	return withFirstSpeedSegmentAcceleration(revealed, currentDistanceM, currentSpeedMs);
}

/**
 * vCPUs for the media worker. Cloud Run bills vCPU-seconds while a job runs, so
 * more CPUs cost about the same per export as long as the work parallelises
 * (HUD frames: one render child per vCPU; x264 uses every core).
 */
const MEDIA_WORKER_CPU = 8;
/**
 * Frames per render child. Each frame leaks ~8 MB of resvg native memory, so 8
 * frames keep a child near 120 MB and 8 children under 1 GB. That leaves room
 * in 4 GiB for /tmp (in memory on Cloud Run), which holds the source: a 4K
 * iPhone clip is up to ~1 GB. 16 frames per child ran out of memory on one.
 */
const HUD_FRAMES_PER_CHILD = 8;
const HUD_RENDER_CONCURRENCY = MEDIA_WORKER_CPU;
/** Exports are capped at 30 fps; higher-rate sources would otherwise be decoded and scaled only to be dropped. */
const OVERLAY_EXPORT_FPS = 30;

function hudRenderChildPath(): { path: string; execArgv: string[] } {
	// Bundled: lib/hudRenderChild.js next to lib/index.js. From source (local harness): run the .ts via tsx.
	const fromSource = import.meta.url.endsWith('.ts');
	return {
		path: fileURLToPath(new URL(fromSource ? './hudRenderChild.ts' : './hudRenderChild.js', import.meta.url)),
		execArgv: fromSource ? ['--import', 'tsx'] : []
	};
}

function renderBatchInChild(batch: HudRenderBatch): Promise<void> {
	const child = hudRenderChildPath();
	return new Promise((resolve, reject) => {
		const proc = fork(child.path, [], { execArgv: child.execArgv, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
		let settled = false;
		proc.once('message', (message: { ok: boolean; error?: string }) => {
			settled = true;
			if (message.ok) resolve();
			else reject(new Error(`HUD render child failed: ${message.error ?? 'unknown error'}`));
		});
		proc.once('error', (err) => {
			if (!settled) reject(err);
			settled = true;
		});
		proc.once('exit', (code) => {
			if (!settled) reject(new Error(`HUD render child exited with code ${code}`));
			settled = true;
		});
		proc.send(batch);
	});
}

async function writeHudFrameSequence(svgs: readonly string[]): Promise<{
	framesDir: string;
	concatListPath: string;
	renderedFrames: number;
	tickFrames: number;
}> {
	const fontFiles = hudFontFiles();
	const framesDir = join(tmpdir(), `overdive-overlay-frames-${randomUUID()}`);
	await mkdir(framesDir, { recursive: true });
	// Identical consecutive frames (before GO, after the finish, the card hold) are rendered once.
	const runs = collapseFrameRuns(svgs);
	const fileName = (index: number) => join(framesDir, `frame-${index.toString().padStart(6, '0')}.png`);
	const frames = runs.map((run) => ({ svg: svgs[run.startIndex], path: fileName(run.startIndex) }));
	const batches: HudRenderBatch[] = [];
	for (let i = 0; i < frames.length; i += HUD_FRAMES_PER_CHILD) {
		batches.push({ fontFiles, defaultFontFamily: HUD_DEFAULT_FONT_FAMILY, frames: frames.slice(i, i + HUD_FRAMES_PER_CHILD) });
	}
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(HUD_RENDER_CONCURRENCY, batches.length) }, async () => {
			while (next < batches.length) {
				const batch = batches[next];
				next += 1;
				await renderBatchInChild(batch);
			}
		})
	);
	const concatListPath = join(framesDir, 'frames.txt');
	await writeFile(concatListPath, concatListForRuns(runs, HUD_TICK_MS, fileName));
	return { framesDir, concatListPath, renderedFrames: runs.length, tickFrames: svgs.length };
}


function withFirstSpeedSegmentAcceleration(
	samples: { distanceM: number; speedMs: number }[],
	currentDistanceM: number,
	currentSpeedMs: number
): { distanceM: number; speedMs: number }[] {
	const firstPositive = samples.find((sample) => sample.distanceM > 0.001);
	const anchorSpeedMs = firstPositive?.speedMs ?? currentSpeedMs;
	const accelerationDistanceM = Math.min(
		SPEED_PLOT_FIRST_ACCELERATION_M,
		currentDistanceM,
		firstPositive?.distanceM ?? currentDistanceM
	);
	return [
		{ distanceM: 0, speedMs: 0 },
		{ distanceM: accelerationDistanceM, speedMs: anchorSpeedMs },
		...samples.filter((sample) => sample.distanceM > accelerationDistanceM + 0.001)
	];
}

function speedPlotAssEvents(args: {
	timeline: DiveTimeline;
	poolLength: number;
	durationSeconds: number;
	width: number;
	height: number;
}): string[] {
	const durationSeconds = Math.max(args.durationSeconds, args.timeline.diveEndMs / 1000, 1);
	const scale = Math.max(0.35, Math.min(1.25, args.width / SPEED_PLOT_REFERENCE_WIDTH_PX));
	const bandHeight = Math.min(Math.round(315 * scale), Math.round(args.height * 0.3));
	const safeX = Math.round(24 * scale);
	const bottomInset = Math.round(32 * scale);
	const bandX = safeX;
	const bandY = Math.max(0, args.height - bandHeight - bottomInset);
	const bandW = Math.max(1, args.width - safeX * 2);
	const padLeft = Math.round(150 * scale);
	const padRight = Math.round(96 * scale);
	const padTop = Math.round(44 * scale);
	const padBottom = Math.round(82 * scale);
	const plotX = bandX + padLeft;
	const plotY = bandY + padTop;
	const plotW = Math.max(1, bandW - padLeft - padRight);
	const plotH = Math.max(1, bandHeight - padTop - padBottom);
	const domainDistanceM = speedPlotDomainM(args.timeline, args.poolLength);
	const axisSize = Math.max(8, Math.round(24 * scale));
	const lineWidth = Math.max(2, Math.round(4.5 * scale));
	const gridWidth = Math.max(1, Math.round(1.35 * scale));
	const radius = Math.round(18 * scale);
	const events: string[] = [];
	const fullStart = formatAssTime(0);
	const fullEnd = formatAssTime(durationSeconds);
	const toX = (distanceM: number) => plotX + (Math.max(0, Math.min(domainDistanceM, distanceM)) / domainDistanceM) * plotW;
	const toY = (speedMs: number) => plotY + (1 - Math.max(0, Math.min(SPEED_PLOT_MAX_SPEED_MS, speedMs)) / SPEED_PLOT_MAX_SPEED_MS) * plotH;
	const xTicks = [0, 50, 100, 150, 200].filter((tick) => tick <= domainDistanceM);
	const yTicks = [0, 0.5, 1, 1.5, 2];

	events.push(`Dialogue: 0,${fullStart},${fullEnd},SpeedPlotBG,,0,0,0,,{\\an7\\pos(${bandX},${bandY})\\p1}${roundedRectAssPath(bandW, bandHeight, radius)}`);
	for (const tick of xTicks) {
		const x = Math.round(toX(tick));
		events.push(`Dialogue: 1,${fullStart},${fullEnd},SpeedPlotGrid,,0,0,0,,{\\an7\\pos(0,0)\\p1}${rectAssPath(x, plotY, gridWidth, plotH)}`);
		events.push(`Dialogue: 3,${fullStart},${fullEnd},SpeedPlotAxis,,0,0,0,,{\\an5\\pos(${x},${Math.round(plotY + plotH + axisSize * 1.35)})}${tick}m`);
	}
	for (const tick of yTicks) {
		const y = Math.round(toY(tick));
		events.push(`Dialogue: 1,${fullStart},${fullEnd},SpeedPlotGrid,,0,0,0,,{\\an7\\pos(0,0)\\p1}${rectAssPath(plotX, y, plotW, gridWidth)}`);
		events.push(`Dialogue: 3,${fullStart},${fullEnd},SpeedPlotAxis,,0,0,0,,{\\an6\\pos(${Math.round(plotX - axisSize * 0.55)},${Math.round(y + axisSize * 0.15)})}${tick % 1 === 0 ? tick.toFixed(0) : tick.toFixed(1)}`);
	}
	events.push(`Dialogue: 3,${fullStart},${fullEnd},SpeedPlotAxis,,0,0,0,,{\\an5\\pos(${Math.round(bandX + axisSize * 2)},${Math.round(plotY + plotH / 2)})\\frz270}speed [m/s]`);

	for (let tick = 0; tick < Math.ceil(durationSeconds * 10); tick += 1) {
		const startSeconds = tick / 10;
		const atMs = startSeconds * 1000;
		const endSeconds = Math.min(durationSeconds, (tick + 1) / 10);
		const lineSamples = speedLineSamplesAt({ timeline: args.timeline, poolLength: args.poolLength, atMs });
		if (lineSamples.length < 2) continue;
		const projected = lineSamples.map((sample) => ({ x: toX(sample.distanceM), y: toY(sample.speedMs) }));
		const stepped = [projected[0]];
		for (let i = 0; i < projected.length - 1; i += 1) {
			const current = projected[i];
			const next = projected[i + 1];
			stepped.push({ x: next.x, y: current.y }, next);
		}
		const linePath = stepped.slice(0, -1).map((point, index) => {
			const next = stepped[index + 1];
			const x = Math.min(point.x, next.x) - lineWidth / 2;
			const y = Math.min(point.y, next.y) - lineWidth / 2;
			const width = Math.max(lineWidth, Math.abs(next.x - point.x) + lineWidth);
			const height = Math.max(lineWidth, Math.abs(next.y - point.y) + lineWidth);
			return rectAssPath(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
		}).join(' ');
		events.push(`Dialogue: 2,${formatAssTime(startSeconds)},${formatAssTime(endSeconds)},SpeedPlotLine,,0,0,0,,{\\an7\\pos(0,0)\\p1}${linePath}`);
	}

	return events;
}

function overlayAss(args: {
	timeline: DiveTimeline;
	poolLength: number;
	discipline: string;
	durationSeconds: number;
	width: number;
	height: number;
}): string {
	const durationSeconds = Math.max(args.durationSeconds, args.timeline.diveEndMs / 1000, 1);
	const events: string[] = [];
	const isPortrait = args.height > args.width;
	const scale = Math.max(
		0.5,
		Math.min(2.5, (isPortrait ? args.width : args.height) / HUD_REFERENCE_SHORT_EDGE_PX)
	);
	const boxX = scaledCssPx(isPortrait ? rem(0.75) : rem(0.5), scale);
	const boxY = scaledCssPx(rem(0.75), scale);
	const boxW = isPortrait
		? args.width - 2 * boxX
		: Math.min(Math.round(args.width * 0.62), args.width - boxX * 2);
	const padX = scaledCssPx(isPortrait ? rem(1.05) : rem(0.85), scale);
	const padY = scaledCssPx(isPortrait ? rem(0.75) : rem(0.55), scale);
	const labelSize = scaledCssPx(isPortrait ? rem(0.7) : rem(0.64), scale);
	const valueSize = scaledCssPx(isPortrait ? rem(1.9) : rem(1.35), scale);
	const subSize = scaledCssPx(isPortrait ? rem(0.85) : rem(0.76), scale);
	const labelLineHeight = scaledCssPx((isPortrait ? rem(0.7) : rem(0.64)) * 1.2, scale);
	const valueLineHeight = scaledCssPx((isPortrait ? rem(1.9) : rem(1.35)) * 1.1, scale);
	const subLineHeight = scaledCssPx((isPortrait ? rem(0.85) : rem(0.76)) * 1.2, scale);
	const subMarginTop = scaledCssPx(rem(0.4), scale);
	const watermarkSize = scaledCssPx(isPortrait ? rem(0.68) : rem(0.62), scale);
	const watermarkMargin = scaledCssPx(rem(0.75), scale);
	const boxH = padY * 2 + labelLineHeight + valueLineHeight + subMarginTop + subLineHeight;
	const radius = scaledCssPx(14, scale);
	const labelSpacing = Math.max(0, labelSize * 0.08).toFixed(2);
	const innerX = boxX + padX;
	const innerY = boxY + padY;
	const rightX = boxX + boxW - padX;
	const valueY = innerY + labelLineHeight;
	const subY = valueY + valueLineHeight + subMarginTop;
	const watermarkX = watermarkMargin;
	const watermarkY = args.height - watermarkMargin;

	for (let tick = 0; tick < Math.ceil(durationSeconds * 10); tick += 1) {
		const startSeconds = tick / 10;
		const atMs = startSeconds * 1000;
		const endSeconds = Math.min(durationSeconds, (tick + 1) / 10);
		const distance = distanceAt(args.timeline, atMs, args.poolLength);
		const speed = speedAt(args.timeline, atMs, args.poolLength);
		const laps = args.timeline.laps.filter((lap) => lap.atMs <= atMs).length;
		const start = formatAssTime(startSeconds);
		const end = formatAssTime(endSeconds);
		const bgShape = roundedRectAssPath(boxW, boxH, radius);
		events.push(
			`Dialogue: 0,${start},${end},HUDBG,,0,0,0,,{\\an7\\pos(${boxX},${boxY})\\p1}${bgShape}`,
			`Dialogue: 1,${start},${end},HUDLabel,,0,0,0,,{\\an7\\pos(${innerX},${innerY})}TIME`,
			`Dialogue: 1,${start},${end},HUDLabel,,0,0,0,,{\\an9\\pos(${rightX},${innerY})}DISTANCE`,
			`Dialogue: 1,${start},${end},HUDValue,,0,0,0,,{\\an7\\pos(${innerX},${valueY})}${escapeAssText(formatHudTime(diveElapsedAt(args.timeline, atMs)))}`,
			`Dialogue: 1,${start},${end},HUDValue,,0,0,0,,{\\an9\\pos(${rightX},${valueY})}${escapeAssText(`${distance.toFixed(1)} m`)}`,
			`Dialogue: 1,${start},${end},HUDSub,,0,0,0,,{\\an7\\pos(${innerX},${subY})}${escapeAssText(`Lap ${laps}/${args.timeline.laps.length}`)}`,
			`Dialogue: 1,${start},${end},HUDSubMono,,0,0,0,,{\\an9\\pos(${rightX},${subY})}${escapeAssText(`${speed.toFixed(2)} m/s`)}`
		);
	}

	events.push(...speedPlotAssEvents({
		timeline: args.timeline,
		poolLength: args.poolLength,
		durationSeconds,
		width: args.width,
		height: args.height
	}));

	events.push(
		`Dialogue: 2,${formatAssTime(0)},${formatAssTime(durationSeconds)},Watermark,,0,0,0,,{\\an1\\pos(${watermarkX},${watermarkY})}${escapeAssText('Overdive.app')}`
	);

	return `[Script Info]
ScriptType: v4.00+
PlayResX: ${args.width}
PlayResY: ${args.height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: HUDBG,Arial,1,&H732A170F,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: HUDLabel,DejaVu Sans,${labelSize},&H00E1D5CB,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,${labelSpacing},0,1,0,0,7,0,0,0,1
Style: HUDValue,DejaVu Sans Mono,${valueSize},&H00F9F5F1,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: HUDSub,DejaVu Sans,${subSize},&H00E1D5CB,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: HUDSubMono,DejaVu Sans Mono,${subSize},&H00E1D5CB,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: SpeedPlotBG,Arial,1,&H73000000,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: SpeedPlotGrid,Arial,1,&HCCFFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: SpeedPlotLine,Arial,1,&H00BFD42D,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: SpeedPlotAxis,DejaVu Sans,${Math.max(8, Math.round(24 * Math.max(0.35, Math.min(1.25, args.width / SPEED_PLOT_REFERENCE_WIDTH_PX))))},&H2EE1D5CB,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: Watermark,DejaVu Sans,${watermarkSize},&H66F9F5F1,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,1,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join('\n')}
`;
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
		if (job.status === 'processing' && !isStaleProcessingJob(job)) {
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
	const ext = object.contentType?.includes('webm') || video.mimeType?.includes('webm') ? 'webm' : 'mp4';
	return withObjectFile(object, ext, fn);
}

async function withObjectFile<T>(
	object: { bucket: string; key: string },
	ext: string,
	fn: (path: string) => Promise<T>
): Promise<T> {
	const inputPath = join(tmpdir(), `overdive-${randomUUID()}.${ext}`);
	await downloadObjectFile(object, inputPath);
	try {
		return await fn(inputPath);
	} finally {
		await rm(inputPath, { force: true });
	}
}

async function downloadObjectFile(object: { bucket: string; key: string }, path: string): Promise<void> {
	const bytes = await getObjectBytes({ bucket: object.bucket, key: object.key });
	await writeFile(path, bytes);
}

/**
 * The 720p playback proxy when there is one: a fraction of the original's size,
 * so renders download and decode quickly and stay far inside the memory limit
 * (4K originals in /tmp, which is RAM, ran it out). Used by the reel (1080 wide;
 * the proxy upscales cleanly and Instagram re-encodes anyway) and the HUD export
 * (kept at 720p). The proxy is already upright from the file's rotation tag,
 * exactly as FFmpeg decodes the original, so `displayRotationFilters` still
 * applies once on top.
 */
function renderSource(video: DiveVideoDoc): { bucket: string; key: string; ext: string; durationSeconds?: number; proxy: boolean } {
	const proxy = video.artifacts?.find((artifact) => artifact.kind === 'playback-proxy' && artifact.object?.key);
	if (proxy?.object) {
		const master = masterObject(video);
		return {
			bucket: proxy.object.bucket ?? master.bucket,
			key: proxy.object.key,
			ext: 'mp4',
			durationSeconds: proxy.durationSeconds,
			proxy: true
		};
	}
	const master = masterObject(video);
	return {
		bucket: master.bucket,
		key: master.key,
		ext: master.contentType?.includes('webm') || video.mimeType?.includes('webm') ? 'webm' : 'mp4',
		durationSeconds: video.durationSeconds,
		proxy: false
	};
}

/** Run ffmpeg with `-progress`, reporting the output position in seconds. */
function runFfmpegWithProgress(
	ffmpeg: string,
	args: readonly string[],
	options: { timeoutMs: number; onOutSeconds?: (seconds: number) => void }
): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(ffmpeg, ['-nostats', '-progress', 'pipe:1', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
		let stderr = '';
		let pending = '';
		const timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs);
		child.stdout.on('data', (chunk: Buffer) => {
			pending += chunk.toString();
			const lines = pending.split('\n');
			pending = lines.pop() ?? '';
			for (const line of lines) {
				const match = /^out_time_us=(\d+)/.exec(line) ?? /^out_time_ms=(\d+)/.exec(line);
				if (match) options.onOutSeconds?.(Number(match[1]) / 1_000_000);
			}
		});
		child.stderr.on('data', (chunk: Buffer) => {
			stderr = (stderr + chunk.toString()).slice(-8000);
		});
		child.on('error', (err) => {
			clearTimeout(timer);
			reject(err);
		});
		child.on('close', (code, signal) => {
			clearTimeout(timer);
			if (code === 0) resolve();
			else reject(new Error(`ffmpeg exited with ${signal ?? code}: ${stderr.slice(-1500)}`));
		});
	});
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

async function generatePlaybackProxy(args: {
	videoId: string;
	video: DiveVideoDoc;
}): Promise<DiveVideoArtifactRef> {
	const { ffmpeg, ffprobe } = assertWorkerBinaries();
	const object = masterObject(args.video);
	return withMasterFile(args.video, async (inputPath) => {
		const outputPath = join(tmpdir(), `overdive-proxy-${randomUUID()}.mp4`);
		try {
			const sourceProbe = await probeMasterFile({ ffprobe, inputPath });
			await execFileAsync(ffmpeg, [
				'-y',
				'-i',
				inputPath,
				'-map',
				'0:v:0',
				...audioMapArgs(sourceProbe),
				'-vf',
				'scale=1280:1280:force_original_aspect_ratio=decrease:force_divisible_by=2',
				'-c:v',
				'libx264',
				'-preset',
				'veryfast',
				'-crf',
				'28',
				'-pix_fmt',
				'yuv420p',
				'-c:a',
				'aac',
				'-b:a',
				'96k',
				'-movflags',
				'+faststart',
				outputPath
			]);

			const bytes = await readFile(outputPath);
			const ownerId = args.video.ownerId ?? args.video.userId;
			if (!ownerId) throw new HttpsError('failed-precondition', 'Dive video has no owner');
			const key = `users/${ownerId}/videos/${args.videoId}/proxy/720p.mp4`;
			await putObjectBytes({ bucket: object.bucket, key, body: bytes, contentType: 'video/mp4' });

			const probe = await probeMasterFile({ ffprobe, inputPath: outputPath });
			return withoutUndefined({
				kind: 'playback-proxy',
				profile: 'mp4-720p',
				object: {
					provider: 'wasabi',
					bucket: object.bucket,
					key,
					contentType: 'video/mp4',
					sizeBytes: bytes.byteLength
				},
				widthPx: probe.widthPx,
				heightPx: probe.heightPx,
				durationSeconds: probe.durationSeconds,
				sizeBytes: bytes.byteLength,
				contentType: 'video/mp4'
			}) as unknown as DiveVideoArtifactRef;
		} finally {
			await rm(outputPath, { force: true });
		}
	});
}

/**
 * Render the share HUD over the whole recording, append the result card hold,
 * and encode to `outputPath`. Exported for the local export harness.
 */
export async function encodeHudFullVideo(args: {
	ffmpeg: string;
	ffprobe: string;
	inputPath: string;
	outputPath: string;
	videoId: string;
	video: DiveVideoDoc;
	outputDimensions: { width: number; height: number };
	timeoutMs: () => number;
	onFramesDir: (dir: string) => void;
}): Promise<void> {
	const { ffmpeg, ffprobe, inputPath, outputPath, outputDimensions, onFramesDir } = args;
	const framesStartedAt = Date.now();
	const timeline = args.video.timeline as DiveTimeline;
	// Use the real file length so the card lands exactly after the last frame.
	const sourceProbe = await probeMasterFile({ ffprobe, inputPath });
	const recordingMs = Math.round(
		Number(sourceProbe.durationSeconds ?? args.video.durationSeconds ?? 0) * 1000
	);
	const dive = prepareDive(timeline, shareHudContextForVideo(args.video));
	const ticks = hudFullTicks(Math.max(recordingMs, timeline.diveEndMs, 1_000));
	const overlayFrames = await writeHudFrameSequence(
		ticks.map((tick) => shareHudSvg(dive, tick.atMs, outputDimensions, { cardAtMs: tick.cardAtMs }))
	);
	onFramesDir(overlayFrames.framesDir);
	const outputSeconds = (ticks.length * HUD_TICK_MS) / 1000;
	const cardAtSeconds = (ticks.find((tick) => tick.cardAtMs !== null)?.atMs ?? 0) / 1000;
	logger.info('Overlay HUD frames rendered', {
		videoId: args.videoId,
		width: outputDimensions.width,
		height: outputDimensions.height,
		renderedFrames: overlayFrames.renderedFrames,
		tickFrames: overlayFrames.tickFrames,
		ms: Date.now() - framesStartedAt
	});
	const encodeStartedAt = Date.now();
	const baseFilter = [
		`fps=${OVERLAY_EXPORT_FPS}`,
		...displayRotationFilters(args.video),
		`scale=${outputDimensions.width}:${outputDimensions.height}:flags=lanczos`
	].join(',');
	// Trim the source at the card start, then clone its last frame under the card hold.
	const holdSeconds = Math.max(0.1, outputSeconds - cardAtSeconds);
	const filterComplex =
		`[0:v]trim=end=${cardAtSeconds.toFixed(3)},setpts=PTS-STARTPTS,${baseFilter},` +
		`tpad=stop_mode=clone:stop_duration=${holdSeconds.toFixed(3)}[base];` +
		`[1:v]format=rgba[overlay];[base][overlay]overlay=0:0:shortest=1,format=yuv420p[v]`;
	await execFileAsync(ffmpeg, [
		'-y',
		'-fflags',
		'+genpts',
		'-i',
		inputPath,
		'-f',
		'concat',
		'-safe',
		'0',
		'-i',
		overlayFrames.concatListPath,
		'-t',
		outputSeconds.toFixed(3),
		'-filter_complex',
		filterComplex,
		'-map',
		'[v]',
		...audioMapArgs(sourceProbe),
		'-c:v',
		'libx264',
		'-preset',
		OVERLAY_EXPORT_PRESET,
		'-crf',
		OVERLAY_EXPORT_CRF,
		'-pix_fmt',
		'yuv420p',
		// Silence under the card hold.
		'-af',
		`atrim=end=${cardAtSeconds.toFixed(3)},apad`,
		'-c:a',
		'aac',
		'-b:a',
		'96k',
		'-max_muxing_queue_size',
		'1024',
		'-movflags',
		'+faststart',
		outputPath
	], { timeout: args.timeoutMs(), maxBuffer: 10 * 1024 * 1024 });
	logger.info('Overlay video encoded', {
		videoId: args.videoId,
		ms: Date.now() - encodeStartedAt,
		outputSeconds,
		cpus: availableParallelism()
	});
}

/**
 * Render the social cut (plan docs/video/social-cut-implementation.md): the
 * edit list over the 1080×1920 reel canvas with the HUD at each moment's real
 * dive time, then the result card after the surface protocol. Exported for the
 * local export harness.
 */
interface SocialCutPlan {
	readonly dive: ReturnType<typeof prepareDive>;
	readonly edl: ReturnType<typeof socialCutEditList>;
}

export function planSocialCut(video: DiveVideoDoc, options: SocialCutRenderOptions, recordingMs: number): SocialCutPlan {
	const timeline = video.timeline as DiveTimeline;
	const dive = prepareDive(timeline, socialHudContext(shareHudContextForVideo(video), options));
	const edl = socialCutEditList(
		socialCutInputForDive(dive, Math.max(recordingMs, timeline.diveEndMs), video.shareEdit?.protocolEndMs ?? null)
	);
	return { dive, edl };
}

export async function renderSocialCutFrames(args: {
	videoId: string;
	plan: SocialCutPlan;
	hook: boolean;
}): Promise<Awaited<ReturnType<typeof writeHudFrameSequence>>> {
	const startedAt = Date.now();
	const ticks = socialCutTicks(args.plan.edl, HUD_TICK_MS);
	const frames = await writeHudFrameSequence(
		ticks.map((tick) => socialCutFrameSvg(args.plan.dive, tick, SOCIAL_CANVAS, { hook: args.hook }))
	);
	logger.info('Social cut HUD frames rendered', {
		videoId: args.videoId,
		renderedFrames: frames.renderedFrames,
		tickFrames: frames.tickFrames,
		ms: Date.now() - startedAt
	});
	return frames;
}

/** Cut, place and burn the HUD over `inputPath` into `outputPath`. Exported for the local harness. */
export async function encodeSocialCut(args: {
	ffmpeg: string;
	inputPath: string;
	outputPath: string;
	videoId: string;
	video: DiveVideoDoc;
	plan: SocialCutPlan;
	concatListPath: string;
	hasAudio: boolean;
	audioStream?: number;
	timeoutMs: number;
	preset?: string;
	onProgress?: (fraction: number) => void;
}): Promise<{ outputSeconds: number; fastForwardFactor: number }> {
	const { edl } = args.plan;
	const inputStartMs = edl.segments[0]?.fromMs ?? 0;
	// Decode only the span the edit uses: never the wait before GO or anything after the protocol.
	const spanMs = edl.protocolEndMs - inputStartMs + 500;
	const filter = socialCutFilter({
		edl,
		inputStartMs,
		placement: socialVideoPlacement(displaySize(args.video)),
		rotation: displayRotationFilters(args.video),
		canvas: SOCIAL_CANVAS,
		background: SOCIAL_BACKGROUND,
		fps: OVERLAY_EXPORT_FPS,
		hasAudio: args.hasAudio,
		audioStream: args.audioStream
	});
	const startedAt = Date.now();
	await runFfmpegWithProgress(args.ffmpeg, [
		'-y',
		'-fflags',
		'+genpts',
		'-ss',
		(inputStartMs / 1000).toFixed(3),
		'-t',
		(spanMs / 1000).toFixed(3),
		'-i',
		args.inputPath,
		'-f',
		'concat',
		'-safe',
		'0',
		'-i',
		args.concatListPath,
		'-filter_complex',
		filter.filterComplex,
		'-map',
		filter.videoLabel,
		...(filter.audioLabel ? ['-map', filter.audioLabel, '-c:a', 'aac', '-b:a', '128k'] : []),
		'-t',
		filter.outputSeconds.toFixed(3),
		'-c:v',
		'libx264',
		'-preset',
		args.preset ?? SOCIAL_CUT_PRESET,
		'-crf',
		OVERLAY_EXPORT_CRF,
		'-maxrate',
		SOCIAL_CUT_MAXRATE,
		'-bufsize',
		SOCIAL_CUT_BUFSIZE,
		'-pix_fmt',
		'yuv420p',
		'-max_muxing_queue_size',
		'1024',
		'-movflags',
		'+faststart',
		args.outputPath
	], {
		timeoutMs: args.timeoutMs,
		onOutSeconds: (seconds) => args.onProgress?.(Math.min(1, seconds / filter.outputSeconds))
	});
	logger.info('Social cut encoded', {
		videoId: args.videoId,
		ms: Date.now() - startedAt,
		outputSeconds: filter.outputSeconds,
		fastForwardFactor: edl.fastForwardFactor,
		segments: edl.segments.length
	});
	return { outputSeconds: filter.outputSeconds, fastForwardFactor: edl.fastForwardFactor };
}

/**
 * Render the reel. The HUD frames render while the source downloads; progress
 * runs 0–0.3 for that, 0.3–0.95 for the encode, then the upload.
 */
async function generateSocialCut(args: {
	videoId: string;
	video: DiveVideoDoc;
	options: SocialCutRenderOptions;
	onProgress: (fraction: number) => void;
}): Promise<DiveVideoArtifactRef> {
	const { ffmpeg, ffprobe } = assertWorkerBinaries();
	if (!args.video.timeline) {
		throw new HttpsError('failed-precondition', 'Dive video has no timeline for a social cut');
	}
	const ownerId = args.video.ownerId ?? args.video.userId;
	if (!ownerId) throw new HttpsError('failed-precondition', 'Dive video has no owner');
	const bucket = masterObject(args.video).bucket;
	const deadline = Date.now() + SOCIAL_CUT_BUDGET_MS;
	const source = renderSource(args.video);
	const inputPath = join(tmpdir(), `overdive-social-src-${randomUUID()}.${source.ext}`);
	const outputPath = join(tmpdir(), `overdive-social-${randomUUID()}.mp4`);
	let framesDir: string | null = null;
	const startedAt = Date.now();
	try {
		const download = downloadObjectFile(source, inputPath).then(() => probeMasterFile({ ffprobe, inputPath }));
		const knownMs = Math.round(Number(source.durationSeconds ?? 0) * 1000);
		// The edit only needs the recording length; with it known, draw the HUD during the download.
		const plan = knownMs > 0
			? planSocialCut(args.video, args.options, knownMs)
			: planSocialCut(args.video, args.options, Math.round(Number((await download).durationSeconds ?? 0) * 1000));
		const framesPromise = renderSocialCutFrames({ videoId: args.videoId, plan, hook: args.options.hook }).then((frames) => {
			framesDir = frames.framesDir;
			return frames;
		});
		const [probe, frames] = await Promise.all([download, framesPromise]);
		logger.info('Social cut inputs ready', {
			videoId: args.videoId,
			proxy: source.proxy,
			ms: Date.now() - startedAt
		});
		args.onProgress(0.3);
		await encodeSocialCut({
			ffmpeg,
			inputPath,
			outputPath,
			videoId: args.videoId,
			video: args.video,
			plan,
			concatListPath: frames.concatListPath,
			hasAudio: probe.hasAudio === true,
			audioStream: typeof probe.audioIndex === 'number' ? probe.audioIndex : undefined,
			timeoutMs: Math.max(OVERLAY_MIN_ENCODE_TIMEOUT_MS, deadline - Date.now()),
			onProgress: (fraction) => args.onProgress(0.3 + 0.65 * fraction)
		});
		args.onProgress(0.95);
		const bytes = await readFile(outputPath);
		const key = `users/${ownerId}/videos/${args.videoId}/overlay/social.mp4`;
		await putObjectBytes({ bucket, key, body: bytes, contentType: 'video/mp4' });
		const outputProbe = await probeMasterFile({ ffprobe, inputPath: outputPath });
		logger.info('Social cut ready', { videoId: args.videoId, ms: Date.now() - startedAt, sizeBytes: bytes.byteLength });
		return withoutUndefined({
			kind: 'social-cut',
			profile: 'social-mp4-1080x1920',
			object: {
				provider: 'wasabi',
				bucket,
				key,
				contentType: 'video/mp4',
				sizeBytes: bytes.byteLength
			},
			widthPx: outputProbe.widthPx,
			heightPx: outputProbe.heightPx,
			durationSeconds: outputProbe.durationSeconds,
			sizeBytes: bytes.byteLength,
			contentType: 'video/mp4',
			styleVersion: socialRenderKey(args.video, args.options),
			disposable: true
		}) as unknown as DiveVideoArtifactRef;
	} finally {
		await Promise.all([
			rm(inputPath, { force: true }),
			rm(outputPath, { force: true }),
			framesDir ? rm(framesDir, { recursive: true, force: true }) : Promise.resolve()
		]);
	}
}

async function generateOverlayDownload(args: {
	videoId: string;
	video: DiveVideoDoc;
}): Promise<DiveVideoArtifactRef> {
	const { ffmpeg, ffprobe } = assertWorkerBinaries();
	const object = masterObject(args.video);
	if (!args.video.timeline) {
		throw new HttpsError('failed-precondition', 'Dive video has no timeline for overlay export');
	}
	const ownerId = args.video.ownerId ?? args.video.userId;
	if (!ownerId) throw new HttpsError('failed-precondition', 'Dive video has no owner');
	const exportDeadline = Date.now() + OVERLAY_EXPORT_BUDGET_MS;
	const encodeTimeoutMs = () => Math.max(OVERLAY_MIN_ENCODE_TIMEOUT_MS, exportDeadline - Date.now());
	// Long 4K originals ran the 4 GiB worker out of memory; the proxy is a fraction of the size.
	const source = renderSource(args.video);
	const exportProfile = overlayExportProfile(source.proxy);
	const outputDimensions = scaleToShortEdge(displayDimensions(args.video), exportProfile.shortEdgePx);
	const boundedDurationSeconds = Math.max(1, Math.ceil((args.video.durationSeconds ?? 0) + 1));
	logger.info('Overlay export source', { videoId: args.videoId, proxy: source.proxy, profile: exportProfile.profile });
	return withObjectFile(source, source.ext, async (inputPath) => {
		const outputPath = join(tmpdir(), `overdive-overlay-${randomUUID()}.mp4`);
		let assPath: string | null = null;
		let svgFramesDir: string | null = null;
		try {
			try {
				await encodeHudFullVideo({
					ffmpeg,
					ffprobe,
					inputPath,
					outputPath,
					videoId: args.videoId,
					video: args.video,
					outputDimensions,
					timeoutMs: encodeTimeoutMs,
					onFramesDir: (dir) => {
						svgFramesDir = dir;
					}
				});
			} catch (err) {
				logger.warn('SVG overlay render failed; falling back to ASS renderer', {
					videoId: args.videoId,
					error: err instanceof Error ? err.message : String(err)
				});
				assPath = join(tmpdir(), `overdive-overlay-${randomUUID()}.ass`);
				await writeFile(
					assPath,
					overlayAss({
						timeline: args.video.timeline as DiveTimeline,
						poolLength: args.video.poolLength ?? 25,
						discipline: args.video.discipline ?? 'DYN',
						durationSeconds: args.video.durationSeconds ?? 0,
						width: outputDimensions.width,
						height: outputDimensions.height
					})
				);
				const filterChain = [
					`fps=${OVERLAY_EXPORT_FPS}`,
					...displayRotationFilters(args.video),
					`scale=${outputDimensions.width}:${outputDimensions.height}:flags=lanczos`,
					`subtitles=${assPath}`
				].join(',');
				await execFileAsync(ffmpeg, [
					'-y',
					'-fflags',
					'+genpts',
					'-i',
					inputPath,
					'-t',
					String(boundedDurationSeconds),
					'-map',
					'0:v:0',
					...audioMapArgs(await probeMasterFile({ ffprobe, inputPath })),
					'-vf',
					filterChain,
					'-c:v',
					'libx264',
					'-preset',
					OVERLAY_EXPORT_PRESET,
					'-crf',
					OVERLAY_EXPORT_CRF,
					'-pix_fmt',
					'yuv420p',
					'-c:a',
					'aac',
					'-b:a',
					'96k',
					'-shortest',
					'-max_muxing_queue_size',
					'1024',
					'-movflags',
					'+faststart',
					outputPath
				], { timeout: encodeTimeoutMs(), maxBuffer: 10 * 1024 * 1024 });
			}

			const bytes = await readFile(outputPath);
			const key = `users/${ownerId}/videos/${args.videoId}/overlay/download.mp4`;
			await putObjectBytes({ bucket: object.bucket, key, body: bytes, contentType: 'video/mp4' });
			const probe = await probeMasterFile({ ffprobe, inputPath: outputPath });
			return withoutUndefined({
				kind: 'overlay-download',
				profile: exportProfile.profile,
				object: {
					provider: 'wasabi',
					bucket: object.bucket,
					key,
					contentType: 'video/mp4',
					sizeBytes: bytes.byteLength
				},
				widthPx: probe.widthPx,
				heightPx: probe.heightPx,
				durationSeconds: probe.durationSeconds,
				sizeBytes: bytes.byteLength,
				contentType: 'video/mp4',
				styleVersion: overlayRenderKey(args.video),
				disposable: true
			}) as unknown as DiveVideoArtifactRef;
		} finally {
			await Promise.all([
				rm(outputPath, { force: true }),
				assPath ? rm(assPath, { force: true }) : Promise.resolve(),
				svgFramesDir ? rm(svgFramesDir, { recursive: true, force: true }) : Promise.resolve()
			]);
		}
	});
}

/** Map only the first audio track FFmpeg can decode (never iPhone spatial audio), or none. */
function audioMapArgs(probe: Record<string, unknown>): string[] {
	return typeof probe.audioIndex === 'number' ? ['-map', `0:a:${probe.audioIndex}`] : [];
}

async function probeMasterFile(args: {
	ffprobe: string;
	inputPath: string;
}): Promise<Record<string, unknown>> {
	const { stdout } = await execFileAsync(args.ffprobe, [
		'-v',
		'error',
		'-print_format',
		'json',
		'-show_format',
		'-show_streams',
		args.inputPath
	]);
	const output = JSON.parse(stdout) as ProbeOutput;
	const videoStream = output.streams?.find((stream) => stream.codec_type === 'video');
	const durationSeconds = Number(output.format?.duration);
	const audioIndex = decodableAudioIndex(output.streams);
	return withoutUndefined({
		widthPx: videoStream?.width,
		heightPx: videoStream?.height,
		durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : undefined,
		hasAudio: audioIndex !== null,
		audioIndex: audioIndex ?? undefined
	});
}

function withArtifact(
	artifacts: DiveVideoArtifactRef[] | undefined,
	artifact: DiveVideoArtifactRef
): DiveVideoArtifactRef[] {
	return [
		...(artifacts ?? []).filter((existing) => existing.kind !== artifact.kind),
		artifact
	];
}

/**
 * Add an artifact against the latest document. Jobs for one video run on
 * different workers, so the copy read when a job started can be stale.
 */
async function saveArtifact(
	videoRef: FirebaseFirestore.DocumentReference,
	artifact: DiveVideoArtifactRef,
	fields: Record<string, unknown>
): Promise<void> {
	await getFirestore().runTransaction(async (transaction) => {
		const latest = (await transaction.get(videoRef)).data() as DiveVideoDoc | undefined;
		transaction.update(videoRef, {
			...fields,
			artifacts: withArtifact(latest?.artifacts, artifact),
			updatedAt: FieldValue.serverTimestamp()
		});
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
	await db.collection('mediaProcessingJobs').doc(args.jobId).update({
		status: 'retryable',
		lastError: message,
		updatedAt: FieldValue.serverTimestamp()
	});

	const videoRef = db.collection('diveVideos').doc(args.videoId);
	const videoSnap = await videoRef.get();
	if (!videoSnap.exists) {
		logger.warn('media job failed for missing dive video', {
			jobId: args.jobId,
			videoId: args.videoId,
			type: args.type,
			message
		});
		return;
	}

	// Reels and HUD exports can be re-requested while an older job is still
	// running. A late failure of a superseded job (a timeout recovered after a
	// newer render finished) must not overwrite the newer job's state.
	const locked = args.type === 'generate-overlay-download' || args.type === 'generate-social-cut';
	if (locked) {
		const lock = await videoRef.collection('processingLocks').doc(stateKey as string).get();
		const currentJobId = lock.exists ? (lock.data() as { jobId?: string }).jobId : undefined;
		if (currentJobId && currentJobId !== args.jobId) {
			logger.info('Superseded media job failed; video state left alone', { jobId: args.jobId, videoId: args.videoId, type: args.type });
			return;
		}
	}

	const videoUpdate: Record<string, unknown> = {
		'processingState.lastError': message,
		'processingState.lastErrorAt': FieldValue.serverTimestamp(),
		updatedAt: FieldValue.serverTimestamp()
	};
	if (stateKey) videoUpdate[`processingState.${stateKey}`] = 'retryable';
	const updates: Promise<unknown>[] = [
		videoRef.update(videoUpdate)
	];
	if (locked) {
		updates.push(
			videoRef.collection('processingLocks').doc(stateKey as string).set({
				jobId: args.jobId,
				status: 'retryable',
				updatedAt: FieldValue.serverTimestamp()
			}, { merge: true })
		);
	}
	await Promise.all(updates);
}

async function runMediaJob(args: { jobId: string; uid?: string; throwOnFailure?: boolean }): Promise<MediaProcessingResult> {
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
				'processingState.pendingJobs': FieldValue.arrayRemove(job.type),
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
				'processingState.pendingJobs': FieldValue.arrayRemove(job.type),
				updatedAt: FieldValue.serverTimestamp()
			});
		} else if (job.type === 'generate-playback-proxy') {
			const proxy = await generatePlaybackProxy({ videoId: job.videoId, video });
			await saveArtifact(videoRef, proxy, {
				'processingState.playbackProxy': 'ready',
				'processingState.pendingJobs': FieldValue.arrayRemove(job.type)
			});
			// Make the reel now, from the proxy, so it is ready before the owner taps Share.
			await autoQueueSocialCut(job.videoId);
			await queueAfterProxyJobs(job);
		} else if (job.type === 'generate-overlay-download') {
			const lockRef = videoRef.collection('processingLocks').doc('overlayDownload');
			const lockSnap = await lockRef.get();
			const lock = lockSnap.exists ? lockSnap.data() as OverlayRequestLockDoc : null;
			const currentOverlay = video.artifacts?.find(
				(artifact) => artifact.kind === 'overlay-download' && artifact.styleVersion === overlayRenderKey(video)
			);
			if (currentOverlay) {
				await Promise.all([
					db.collection('mediaProcessingJobs').doc(args.jobId).update({
						status: 'ready',
						completedAt: FieldValue.serverTimestamp(),
						updatedAt: FieldValue.serverTimestamp()
					}),
					lockRef.set({
						status: 'ready',
						updatedAt: FieldValue.serverTimestamp()
					}, { merge: true })
				]);
				return { jobId: args.jobId, status: 'ready', type: job.type, alreadyComplete: true };
			}
			if (lock?.jobId && lock.jobId !== args.jobId) {
				await db.collection('mediaProcessingJobs').doc(args.jobId).update({
					status: 'ready',
					supersededByJobId: lock.jobId,
					completedAt: FieldValue.serverTimestamp(),
					updatedAt: FieldValue.serverTimestamp()
				});
				return { jobId: args.jobId, status: 'ready', type: job.type, alreadyComplete: true };
			}
			await lockRef.set({
				jobId: args.jobId,
				status: 'processing',
				updatedAt: FieldValue.serverTimestamp()
			}, { merge: true });
			const overlay = await generateOverlayDownload({ videoId: job.videoId, video });
			await saveArtifact(videoRef, overlay, {
				storagePathBurned: overlay.object.key,
				burnedObject: overlay.object,
				overlayStyleVersion: OVERLAY_STYLE_VERSION,
				'processingState.overlayDownload': 'ready',
				'processingState.pendingJobs': FieldValue.arrayRemove(job.type)
			});
			await videoRef.collection('processingLocks').doc('overlayDownload').set({
				jobId: args.jobId,
				status: 'ready',
				updatedAt: FieldValue.serverTimestamp()
			}, { merge: true });
		} else if (job.type === 'generate-social-cut') {
			const options = job.options ?? DEFAULT_SOCIAL_CUT_OPTIONS;
			const renderKey = socialRenderKey(video, options);
			const lockRef = videoRef.collection('processingLocks').doc('socialCut');
			const lockSnap = await lockRef.get();
			const lock = lockSnap.exists ? lockSnap.data() as OverlayRequestLockDoc : null;
			const current = video.artifacts?.some((artifact) => artifact.kind === 'social-cut' && artifact.styleVersion === renderKey);
			// Already rendered for these settings, or a newer request replaced this one.
			if (current || (lock?.jobId && lock.jobId !== args.jobId)) {
				await db.collection('mediaProcessingJobs').doc(args.jobId).update({
					status: 'ready',
					...(current ? {} : { supersededByJobId: lock?.jobId }),
					completedAt: FieldValue.serverTimestamp(),
					updatedAt: FieldValue.serverTimestamp()
				});
				if (current) {
					await videoRef.update({
						'processingState.socialCut': 'ready',
						'processingState.pendingJobs': FieldValue.arrayRemove(job.type),
						updatedAt: FieldValue.serverTimestamp()
					});
				}
				return { jobId: args.jobId, status: 'ready', type: job.type, alreadyComplete: true };
			}
			await Promise.all([
				lockRef.set({ jobId: args.jobId, renderKey, status: 'processing', updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
				videoRef.update({
					'processingState.socialCut': 'processing',
					'processingState.socialCutProgress': 0.05,
					updatedAt: FieldValue.serverTimestamp()
				})
			]);
			// Progress doubles as a heartbeat: the app treats a reel with no update for a few minutes as failed.
			let lastWriteAt = 0;
			let lastWrite: Promise<unknown> = Promise.resolve();
			const onProgress = (fraction: number) => {
				const now = Date.now();
				if (now - lastWriteAt < SOCIAL_PROGRESS_WRITE_MS) return;
				lastWriteAt = now;
				lastWrite = videoRef
					.update({
						'processingState.socialCutProgress': Math.round(fraction * 100) / 100,
						updatedAt: FieldValue.serverTimestamp()
					})
					.catch(() => undefined);
			};
			const social = await generateSocialCut({ videoId: job.videoId, video, options, onProgress });
			await lastWrite;
			await saveArtifact(videoRef, social, {
				'processingState.socialCut': 'ready',
				'processingState.socialCutProgress': FieldValue.delete(),
				'processingState.pendingJobs': FieldValue.arrayRemove(job.type)
			});
			await lockRef.set({ jobId: args.jobId, renderKey, status: 'ready', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
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
		// Without a proxy the HUD export falls back to the original.
		if (job.type === 'generate-playback-proxy') await queueAfterProxyJobs(job);
		if (args.throwOnFailure === false) {
			return { jobId: args.jobId, status: 'retryable', type: job.type };
		}
		throw err;
	}
}

export const requestOverlayDownload = onCall(
	{
		secrets: [WASABI_ACCESS_KEY_ID, WASABI_SECRET_ACCESS_KEY],
		timeoutSeconds: 60,
		memory: '256MiB',
		maxInstances: 5
	},
	async (request) => {
		const uid = requireUid(request.auth);
		const data = asRecord(request.data);
		const videoId = requiredString(data, 'videoId');
		if (data.kind === 'social-cut') return enqueueSocialCut({ uid, videoId, options: socialOptionsFrom(data.options) });
		const db = getFirestore();
		const videoRef = db.collection('diveVideos').doc(videoId);
		const lockRef = videoRef.collection('processingLocks').doc('overlayDownload');
		return db.runTransaction(async (transaction) => {
			const [videoSnap, lockSnap] = await Promise.all([
				transaction.get(videoRef),
				transaction.get(lockRef)
			]);
			if (!videoSnap.exists) throw new HttpsError('not-found', 'Dive video not found');
			const video = videoSnap.data() as DiveVideoDoc;
			const ownerId = video.ownerId ?? video.userId;
			if (ownerId !== uid) {
				throw new HttpsError('permission-denied', 'Only the video owner can request overlay export');
			}

			const currentOverlay = video.artifacts?.find(
				(artifact) => artifact.kind === 'overlay-download' && artifact.styleVersion === overlayRenderKey(video)
			);
			if (currentOverlay) {
				transaction.set(lockRef, {
					status: 'ready',
					updatedAt: FieldValue.serverTimestamp()
				}, { merge: true });
				return { queued: false, ready: true };
			}

			const lock = lockSnap.exists ? lockSnap.data() as OverlayRequestLockDoc : null;
			const lockUpdatedAt = lock?.updatedAt?.toMillis?.() ?? 0;
			const lockIsActive =
				(lock?.status === 'queued' || lock?.status === 'processing') &&
				Date.now() - lockUpdatedAt < OVERLAY_REQUEST_LOCK_STALE_MS;
			if (lockIsActive && lock?.jobId) {
				return { jobId: lock.jobId, queued: true, existing: true };
			}

			const jobRef = db.collection('mediaProcessingJobs').doc();
			const jobId = jobRef.id;
			transaction.set(jobRef, {
				videoId,
				ownerId,
				type: 'generate-overlay-download',
				status: 'queued',
				attempts: 0,
				createdAt: FieldValue.serverTimestamp(),
				updatedAt: FieldValue.serverTimestamp()
			});
			transaction.set(lockRef, {
				jobId,
				status: 'queued',
				updatedAt: FieldValue.serverTimestamp()
			}, { merge: true });
			transaction.update(videoRef, {
				'processingState.overlayDownload': 'queued',
				'processingState.pendingJobs': FieldValue.arrayUnion('generate-overlay-download'),
				updatedAt: FieldValue.serverTimestamp()
			});
			return { jobId, queued: true };
		});
	}
);


function socialOptionsFrom(value: unknown): SocialCutRenderOptions {
	const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
	const flag = (key: keyof SocialCutRenderOptions) =>
		typeof record[key] === 'boolean' ? record[key] as boolean : DEFAULT_SOCIAL_CUT_OPTIONS[key];
	return { showName: flag('showName'), showPb: flag('showPb'), hook: flag('hook') };
}

/**
 * Queue a social cut for the given toggles (plan docs/video/social-cut-implementation.md
 * §2). A request for the key already rendering returns that job; a different key
 * supersedes it.
 */
async function enqueueSocialCut(args: {
	videoId: string;
	options: SocialCutRenderOptions;
	/** When set, only this user may queue it. */
	uid?: string;
}): Promise<{ jobId?: string; queued: boolean; ready?: boolean; existing?: boolean }> {
	const db = getFirestore();
	const videoRef = db.collection('diveVideos').doc(args.videoId);
	const lockRef = videoRef.collection('processingLocks').doc('socialCut');
	return db.runTransaction(async (transaction) => {
		const [videoSnap, lockSnap] = await Promise.all([transaction.get(videoRef), transaction.get(lockRef)]);
		if (!videoSnap.exists) throw new HttpsError('not-found', 'Dive video not found');
		const video = videoSnap.data() as DiveVideoDoc;
		const ownerId = video.ownerId ?? video.userId;
		if (!ownerId) throw new HttpsError('failed-precondition', 'Dive video has no owner');
		if (args.uid && ownerId !== args.uid) throw new HttpsError('permission-denied', 'Only the video owner can create a social cut');
		if (!video.timeline) throw new HttpsError('failed-precondition', 'Dive video has no timeline for a social cut');
		const renderKey = socialRenderKey(video, args.options);
		if (video.artifacts?.some((artifact) => artifact.kind === 'social-cut' && artifact.styleVersion === renderKey)) {
			transaction.update(videoRef, { 'processingState.socialCut': 'ready', 'processingState.socialCutKey': renderKey });
			return { queued: false, ready: true };
		}
		const lock = lockSnap.exists ? lockSnap.data() as OverlayRequestLockDoc : null;
		const lockActive =
			(lock?.status === 'queued' || lock?.status === 'processing') &&
			Date.now() - (lock?.updatedAt?.toMillis?.() ?? 0) < SOCIAL_CUT_LOCK_STALE_MS;
		if (lockActive && lock?.jobId && lock.renderKey === renderKey) {
			return { jobId: lock.jobId, queued: true, existing: true };
		}
		const jobRef = db.collection('mediaProcessingJobs').doc();
		transaction.set(jobRef, {
			videoId: args.videoId,
			ownerId,
			type: 'generate-social-cut',
			status: 'queued',
			attempts: 0,
			options: args.options,
			renderKey,
			createdAt: FieldValue.serverTimestamp(),
			updatedAt: FieldValue.serverTimestamp()
		});
		transaction.set(lockRef, { jobId: jobRef.id, renderKey, status: 'queued', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
		transaction.update(videoRef, {
			'processingState.socialCut': 'queued',
			'processingState.socialCutKey': renderKey,
			'processingState.socialCutProgress': 0,
			'processingState.pendingJobs': FieldValue.arrayUnion('generate-social-cut'),
			updatedAt: FieldValue.serverTimestamp()
		});
		return { jobId: jobRef.id, queued: true };
	});
}

/** The owner's remembered reel toggles (UserSettings.shareHud). */
async function ownerSocialCutOptions(ownerId: string): Promise<SocialCutRenderOptions> {
	const snap = await getFirestore().collection('users').doc(ownerId).get();
	const shareHud = asRecord(asRecord(snap.data()?.settings).shareHud);
	return socialOptionsFrom({ showName: shareHud.showName, showPb: shareHud.showPb, hook: shareHud.socialHook });
}

/** After upload: queue the reel with the owner's toggles. Never fails the calling job. */
async function queueAfterProxyJobs(job: { videoId: string; ownerId: string }): Promise<void> {
	try {
		await enqueueAfterProxyJobs({ videoId: job.videoId, ownerId: job.ownerId });
	} catch (err) {
		logger.warn('Could not queue the HUD export after the proxy', {
			videoId: job.videoId,
			error: err instanceof Error ? err.message : String(err)
		});
	}
}

async function autoQueueSocialCut(videoId: string): Promise<void> {
	try {
		const video = (await getFirestore().collection('diveVideos').doc(videoId).get()).data() as DiveVideoDoc | undefined;
		const ownerId = video?.ownerId ?? video?.userId;
		if (!video?.timeline || !ownerId) return;
		await enqueueSocialCut({ videoId, options: await ownerSocialCutOptions(ownerId) });
	} catch (err) {
		logger.warn('Could not queue the reel after upload', { videoId, error: err instanceof Error ? err.message : String(err) });
	}
}

export const processMediaJob = onCall(
	{
		secrets: [WASABI_ACCESS_KEY_ID, WASABI_SECRET_ACCESS_KEY],
		timeoutSeconds: 540,
		memory: '4GiB',
		cpu: MEDIA_WORKER_CPU,
		concurrency: 1,
		maxInstances: 1
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
		memory: '4GiB',
		cpu: MEDIA_WORKER_CPU,
		concurrency: 1,
		maxInstances: 1
	},
	async (event) => {
		const snap = event.data;
		if (!snap) return;
		const job = snap.data() as MediaProcessingJobDoc;
		// Reels have their own worker so they never queue behind full-length exports.
		if (job.type === 'generate-social-cut') return;
		if (!isImplementedAutomaticJob(job.type)) {
			logger.info('media job queued for later worker implementation', {
				jobId: event.params.jobId,
				type: job.type
			});
			return;
		}
		await runMediaJob({ jobId: event.params.jobId, throwOnFailure: false });
	}
);

/**
 * Reel worker. Separate instances from the general media worker (which runs one
 * job at a time) so a reel starts at once; a render takes well under a minute.
 */
export const onSocialCutJobCreated = onDocumentCreated(
	{
		document: 'mediaProcessingJobs/{jobId}',
		secrets: [WASABI_ACCESS_KEY_ID, WASABI_SECRET_ACCESS_KEY],
		timeoutSeconds: 240,
		memory: '4GiB',
		cpu: MEDIA_WORKER_CPU,
		concurrency: 1,
		maxInstances: 5
	},
	async (event) => {
		const job = event.data?.data() as MediaProcessingJobDoc | undefined;
		if (job?.type !== 'generate-social-cut') return;
		await runMediaJob({ jobId: event.params.jobId, throwOnFailure: false });
	}
);

export const recoverStaleMediaProcessingJobs = onSchedule(
	{
		schedule: 'every 10 minutes',
		timeZone: 'Etc/UTC',
		timeoutSeconds: 60,
		memory: '256MiB',
		maxInstances: 1
	},
	async () => {
		const db = getFirestore();
		const staleBeforeMs = Date.now() - MEDIA_JOB_PROCESSING_STALE_MS;
		const snap = await db.collection('mediaProcessingJobs')
			.where('status', '==', 'processing')
			.limit(50)
			.get();
		let recovered = 0;
		for (const doc of snap.docs) {
			const job = doc.data() as MediaProcessingJobDoc;
			if (!job.claimedAt?.toMillis || job.claimedAt.toMillis() >= staleBeforeMs) continue;
			await markFailed({
				jobId: doc.id,
				videoId: job.videoId,
				type: job.type,
				error: new Error('Media processing job timed out and was recovered automatically')
			});
			recovered += 1;
		}
		if (recovered > 0) {
			logger.warn('recovered stale media processing jobs', { recovered });
		}
	}
);