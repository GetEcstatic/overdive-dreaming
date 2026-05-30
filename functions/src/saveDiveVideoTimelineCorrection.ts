import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
	projectTimelineToRoutineLog,
	type DiveTimeline,
	type DiveVideoDiscipline
} from './lib/timelineToRoutineLog.js';

interface DiveVideoDoc {
	ownerId?: string;
	userId?: string;
	athleteId?: string;
	routineLogId?: string;
	discipline?: DiveVideoDiscipline;
	poolLength?: number;
	durationSeconds?: number;
	recordedAt?: FirebaseFirestore.Timestamp;
	artifacts?: Array<{ kind?: string }>;
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

function finiteNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function validateLapEvent(value: unknown): DiveTimeline['laps'][number] {
	const row = asRecord(value);
	const lapNumber = finiteNumber(row.lapNumber);
	const atMs = finiteNumber(row.atMs);
	const cumulativeDistanceM = finiteNumber(row.cumulativeDistanceM);
	const splitMs = finiteNumber(row.splitMs);
	if (
		lapNumber === null ||
		atMs === null ||
		cumulativeDistanceM === null ||
		splitMs === null ||
		lapNumber <= 0 ||
		atMs < 0 ||
		cumulativeDistanceM < 0 ||
		splitMs < 0
	) {
		throw new HttpsError('invalid-argument', 'Invalid timeline waypoint');
	}
	return { lapNumber, atMs, cumulativeDistanceM, splitMs };
}

function validateTimeline(value: unknown): DiveTimeline {
	const data = asRecord(value);
	const diveStartMs = finiteNumber(data.diveStartMs);
	const diveEndMs = finiteNumber(data.diveEndMs);
	if (diveStartMs === null || diveEndMs === null || diveStartMs < 0 || diveEndMs <= diveStartMs) {
		throw new HttpsError('invalid-argument', 'Invalid timeline start/end');
	}
	const lapsRaw = data.laps;
	if (!Array.isArray(lapsRaw)) throw new HttpsError('invalid-argument', 'Timeline laps must be an array');
	const subSplitsRaw = data.subSplits;
	if (subSplitsRaw !== undefined && !Array.isArray(subSplitsRaw)) {
		throw new HttpsError('invalid-argument', 'Timeline subSplits must be an array');
	}
	const laps = lapsRaw.map(validateLapEvent);
	const subSplits = subSplitsRaw?.map(validateLapEvent);
	const ordered = [...laps, ...(subSplits ?? [])].sort((a, b) => a.atMs - b.atMs);
	let previousAtMs = diveStartMs;
	let previousDistanceM = 0;
	for (const waypoint of ordered) {
		if (waypoint.atMs <= previousAtMs || waypoint.atMs > diveEndMs) {
			throw new HttpsError('invalid-argument', 'Timeline waypoints must be ordered within the dive');
		}
		if (waypoint.cumulativeDistanceM <= previousDistanceM) {
			throw new HttpsError('invalid-argument', 'Timeline distances must increase');
		}
		previousAtMs = waypoint.atMs;
		previousDistanceM = waypoint.cumulativeDistanceM;
	}
	return {
		diveStartMs,
		diveEndMs,
		laps,
		...(subSplits && subSplits.length > 0 ? { subSplits } : {}),
		events: []
	};
}

function canCorrect(uid: string, video: DiveVideoDoc): boolean {
	return uid === video.ownerId || uid === video.userId || uid === video.athleteId;
}

function dateFromVideo(video: DiveVideoDoc): Date {
	return video.recordedAt?.toDate?.() ?? new Date();
}

function routineLogUpdatePayload(args: { video: DiveVideoDoc; timeline: DiveTimeline }): Record<string, unknown> {
	const discipline = args.video.discipline ?? 'DYN';
	const poolLength = args.video.poolLength ?? 25;
	const projection = projectTimelineToRoutineLog({
		timeline: args.timeline,
		discipline,
		poolLength,
		recordedAt: dateFromVideo(args.video),
		durationSeconds: args.video.durationSeconds ?? 0
	});
	const payload: Record<string, unknown> = {
		date: Timestamp.fromDate(projection.date),
		timeOfDay: projection.timeOfDay,
		sessionGroup: projection.sessionGroup,
		disciplineUsed: projection.disciplineUsed,
		poolLength: projection.poolLength,
		totalTime: projection.totalTime,
		totalDistance: projection.totalDistance,
		summary: {
			repsCompleted: projection.laps.length,
			totalTimeSeconds: projection.totalTime,
			averageTimePerRep: projection.laps.length > 0 ? projection.totalTime / projection.laps.length : null
		},
		laps: projection.laps,
		hasDetailedData: projection.hasDetailedData,
		updatedAt: FieldValue.serverTimestamp()
	};
	if (projection.avgSpeedMs !== undefined) payload.avgSpeedMs = projection.avgSpeedMs;
	else payload.avgSpeedMs = FieldValue.delete();
	if (projection.fastestLapSpeedMs !== undefined) payload.fastestLapSpeedMs = projection.fastestLapSpeedMs;
	else payload.fastestLapSpeedMs = FieldValue.delete();
	if (projection.slowestLapSpeedMs !== undefined) payload.slowestLapSpeedMs = projection.slowestLapSpeedMs;
	else payload.slowestLapSpeedMs = FieldValue.delete();
	return payload;
}

function withoutOverlayDownloadArtifacts(video: DiveVideoDoc): unknown[] {
	return (video.artifacts ?? []).filter((artifact) => artifact.kind !== 'overlay-download');
}

export const saveDiveVideoTimelineCorrection = onCall(
	{ timeoutSeconds: 60, memory: '256MiB', maxInstances: 5 },
	async (request) => {
	const uid = requireUid(request.auth);
	const data = asRecord(request.data);
	const videoId = requiredString(data, 'videoId');
	const timeline = validateTimeline(data.timeline);
	const db = getFirestore();
	const videoRef = db.collection('diveVideos').doc(videoId);

	await db.runTransaction(async (transaction) => {
		const videoSnap = await transaction.get(videoRef);
		if (!videoSnap.exists) throw new HttpsError('not-found', 'Dive video not found');
		const video = videoSnap.data() as DiveVideoDoc;
		if (!canCorrect(uid, video)) {
			throw new HttpsError('permission-denied', 'You cannot edit waypoints for this video');
		}

		const now = FieldValue.serverTimestamp();
		transaction.update(videoRef, {
			timeline,
			waypointCorrection: {
				correctedAt: now,
				correctedBy: uid,
				source: 'stored-video-scrub'
			},
			artifacts: withoutOverlayDownloadArtifacts(video),
			storagePathBurned: FieldValue.delete(),
			burnedObject: FieldValue.delete(),
			'processingState.overlayDownload': 'not-requested',
			'processingState.pendingJobs': FieldValue.arrayRemove('generate-overlay-download'),
			updatedAt: now
		});

		if (video.routineLogId) {
			transaction.update(
				db.collection('routineLogs').doc(video.routineLogId),
				routineLogUpdatePayload({ video, timeline })
			);
		}
	});

	return { saved: true, overlayDownload: 'not-requested' };
}
);