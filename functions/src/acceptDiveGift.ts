/**
 * Callable Cloud Function: `acceptDiveGift`.
 *
 * The athlete (giftee) calls this after watching a coach-recorded video on
 * the gift review page. It:
 *
 *   1. Verifies the caller is the athlete the gift was sent to and the
 *      gift is still pending (or already accepted with a routine log
 *      attached, in which case this is a no-op for idempotency).
 *   2. Synthesises a `RoutineLog` from the data the coach already
 *      captured: `DiveVideo.discipline`, `poolLength`, `recordedAt`,
 *      `durationSeconds`, and the dense `timeline` (laps + walls).
 *      See `./lib/timelineToRoutineLog.ts` for the pure projection.
 *   3. Atomically writes the routine log under the athlete's ownership
 *      AND updates the dive video so `routineLogId` points at it,
 *      `sessionId` is re-linked to the new routine log id, and
 *      `giftStatus` flips to `'accepted'`.
 *
 * Why server-side: the Firestore rule on `diveVideos/{videoId}` only
 * lets the athlete change `giftStatus` directly. Setting `routineLogId`
 * has to be done with admin credentials to keep that rule strict.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import {
	projectTimelineToRoutineLog,
	type DiveTimeline,
	type DiveVideoDiscipline
} from './lib/timelineToRoutineLog.js';

interface DiveVideoDoc {
	ownerId: string;
	athleteId?: string;
	giftStatus?: 'pending' | 'accepted' | 'declined';
	routineLogId?: string;
	sessionId: string;
	discipline: DiveVideoDiscipline;
	poolLength: number;
	durationSeconds: number;
	recordedAt: Timestamp;
	timeline: DiveTimeline;
}

interface UserDoc {
	displayName?: string;
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

export const acceptDiveGift = onCall(
	{ timeoutSeconds: 60, memory: '256MiB', maxInstances: 5 },
	async (request) => {
	const uid = requireUid(request.auth);
	const data = asRecord(request.data);
	const videoId = requiredString(data, 'videoId');

	const db = getFirestore();
	const videoRef = db.collection('diveVideos').doc(videoId);

	// Read the current state outside the transaction for the coach name
	// lookup (an extra read inside the txn would needlessly inflate
	// retries on contention).
	const initialSnap = await videoRef.get();
	if (!initialSnap.exists) {
		throw new HttpsError('not-found', 'Dive video not found');
	}
	const video = initialSnap.data() as DiveVideoDoc;

	if (video.athleteId !== uid) {
		throw new HttpsError('permission-denied', 'You are not the gift recipient');
	}

	// Idempotency: already accepted with a routine log → return existing id.
	if (video.giftStatus === 'accepted' && video.routineLogId) {
		return { routineLogId: video.routineLogId, alreadyAccepted: true };
	}

	if (video.giftStatus === 'declined') {
		throw new HttpsError(
			'failed-precondition',
			'This gift was declined and cannot be accepted'
		);
	}

	if (video.giftStatus !== 'pending') {
		throw new HttpsError(
			'failed-precondition',
			`Cannot accept a gift in status "${video.giftStatus ?? 'unknown'}"`
		);
	}

	// Resolve the coach's display name for the default note, best-effort.
	let coachDisplayName: string | undefined;
	try {
		const coachSnap = await db.collection('users').doc(video.ownerId).get();
		if (coachSnap.exists) {
			coachDisplayName = (coachSnap.data() as UserDoc).displayName;
		}
	} catch (err) {
		logger.warn('acceptDiveGift: failed to read coach user doc', {
			ownerId: video.ownerId,
			err
		});
	}

	const projection = projectTimelineToRoutineLog({
		timeline: video.timeline,
		discipline: video.discipline,
		poolLength: video.poolLength,
		recordedAt: video.recordedAt.toDate(),
		durationSeconds: video.durationSeconds,
		coachDisplayName
	});

	const routineLogRef = db.collection('routineLogs').doc();
	const routineLogId = routineLogRef.id;
	const now = FieldValue.serverTimestamp();

	const routineLogPayload: Record<string, unknown> = {
		routineId: projection.routineId,
		userId: uid,
		date: Timestamp.fromDate(projection.date),
		timeOfDay: projection.timeOfDay,
		sessionGroup: projection.sessionGroup,
		disciplineUsed: projection.disciplineUsed,
		poolLength: projection.poolLength,
		totalTime: projection.totalTime,
		totalDistance: projection.totalDistance,
		laps: projection.laps,
		notes: projection.notes,
		hasDetailedData: projection.hasDetailedData,
		createdAt: now,
		updatedAt: now
	};
	if (projection.avgSpeedMs !== undefined) {
		routineLogPayload.avgSpeedMs = projection.avgSpeedMs;
	}
	if (projection.fastestLapSpeedMs !== undefined) {
		routineLogPayload.fastestLapSpeedMs = projection.fastestLapSpeedMs;
	}
	if (projection.slowestLapSpeedMs !== undefined) {
		routineLogPayload.slowestLapSpeedMs = projection.slowestLapSpeedMs;
	}

	// Atomic two-step: create the log, then point the video at it. We use
	// a transaction so that on contention we re-check `giftStatus` and
	// avoid creating a duplicate routine log if the athlete double-tapped.
	const finalRoutineLogId = await db.runTransaction(async (tx) => {
		const freshSnap = await tx.get(videoRef);
		if (!freshSnap.exists) {
			throw new HttpsError('not-found', 'Dive video disappeared during accept');
		}
		const fresh = freshSnap.data() as DiveVideoDoc;
		if (fresh.giftStatus === 'accepted' && fresh.routineLogId) {
			return fresh.routineLogId; // someone else won the race
		}
		if (fresh.giftStatus === 'declined') {
			throw new HttpsError(
				'failed-precondition',
				'This gift was declined while you were accepting'
			);
		}
		tx.set(routineLogRef, routineLogPayload);
		tx.update(videoRef, {
			routineLogId,
			sessionId: routineLogId,
			giftStatus: 'accepted',
			updatedAt: now
		});
		return routineLogId;
	});

	logger.info('acceptDiveGift: gift accepted', {
		uid,
		videoId,
		routineLogId: finalRoutineLogId,
		discipline: video.discipline,
		hasDetailedData: projection.hasDetailedData
	});

	return {
		routineLogId: finalRoutineLogId,
		alreadyAccepted: finalRoutineLogId !== routineLogId
	};
}
);
