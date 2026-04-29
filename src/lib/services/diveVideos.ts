/**
 * Firestore + Storage service for DiveVideo records.
 *
 * Collection: /diveVideos/{videoId}
 * Storage layout: users/{userId}/videos/{videoId}/{clean.ext | burned.ext | thumb.jpg}
 *
 * See docs/Dynamic video feature.md §6 and §7.
 */

import {
	collection,
	doc,
	addDoc,
	getDoc,
	getDocs,
	updateDoc,
	deleteDoc,
	query,
	where,
	orderBy,
	limit,
	Timestamp,
	serverTimestamp
} from 'firebase/firestore';
import {
	ref as storageRef,
	uploadBytesResumable,
	getDownloadURL,
	deleteObject,
	type UploadTask
} from 'firebase/storage';
import { db, storage } from '$lib/firebase';
import { functions } from '$lib/firebase';
import { httpsCallable } from 'firebase/functions';
import {
	createWasabiUpload,
	deleteWasabiObject,
	getWasabiReadUrl,
	uploadWithSignedUrl
} from '$lib/media/client';
import type {
	DiveVideo,
	DiveVideoFormData,
	DiveVideoGiftStatus,
	DiveVideoUploadStatus
} from '$lib/types';

const COLLECTION = 'diveVideos';

function fileExtensionFor(mimeType: string): string {
	if (mimeType.includes('mp4')) return 'mp4';
	if (mimeType.includes('webm')) return 'webm';
	return 'bin';
}

function cleanPathFor(userId: string, videoId: string, mimeType: string): string {
	return `users/${userId}/videos/${videoId}/clean.${fileExtensionFor(mimeType)}`;
}

function thumbnailPathFor(userId: string, videoId: string): string {
	return `users/${userId}/videos/${videoId}/thumb.jpg`;
}

/**
 * Create the Firestore `DiveVideo` document. Upload of the actual media blob
 * is a separate step so callers can wire it up to a progress UI.
 */
export async function createDiveVideo(
	videoData: Omit<DiveVideoFormData, 'storagePathClean'> & { storagePathClean?: string }
): Promise<string> {
	const docRef = doc(collection(db, COLLECTION));
	const videoId = docRef.id;

	const storagePathClean =
		videoData.storagePathClean ??
		cleanPathFor(videoData.userId, videoId, videoData.mimeType);

	const payload = {
		...videoData,
		id: videoId,
		storagePathClean,
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp()
	};

	const { id: _discardId, ...writePayload } = payload as Record<string, unknown> & {
		id: string;
	};
	// Use addDoc-style create via setDoc to preserve the pre-generated id.
	await (await import('firebase/firestore')).setDoc(docRef, writePayload);
	return videoId;
}

/**
 * Upload the raw video blob to Firebase Storage using a resumable upload.
 * Returns the UploadTask so callers can attach progress listeners.
 */
export function uploadDiveVideoBlob(
	userId: string,
	videoId: string,
	blob: Blob,
	mimeType: string
): { task: UploadTask; storagePath: string } {
	const storagePath = cleanPathFor(userId, videoId, mimeType);
	const ref = storageRef(storage, storagePath);
	const task = uploadBytesResumable(ref, blob, { contentType: mimeType });
	return { task, storagePath };
}

export async function uploadDiveVideoThumbnail(
	userId: string,
	videoId: string,
	thumbBlob: Blob
): Promise<{ path: string; url: string }> {
	const upload = await createWasabiUpload({
		kind: 'dive-video-thumb',
		userId,
		videoId,
		contentType: 'image/jpeg',
		sizeBytes: thumbBlob.size
	});
	await uploadWithSignedUrl(upload, thumbBlob);
	await updateDoc(doc(db, COLLECTION, videoId), {
		storageProvider: 'wasabi',
		thumbnailPath: upload.key,
		thumbnailObject: upload.object,
		updatedAt: serverTimestamp()
	});
	const read = await getWasabiReadUrl({
		kind: 'dive-video-thumb',
		videoId,
		key: upload.key,
		bucket: upload.bucket
	});
	return { path: upload.key, url: read.url };
}

export async function uploadDiveVideoThumbnailFirebase(
	userId: string,
	videoId: string,
	thumbBlob: Blob
): Promise<{ path: string; url: string }> {
	const path = thumbnailPathFor(userId, videoId);
	const ref = storageRef(storage, path);
	const task = uploadBytesResumable(ref, thumbBlob, { contentType: 'image/jpeg' });
	await task;
	const url = await getDownloadURL(ref);
	return { path, url };
}

export async function getDiveVideoDownloadUrl(videoOrStoragePath: DiveVideo | string): Promise<string> {
	if (typeof videoOrStoragePath !== 'string') {
		const video = videoOrStoragePath;
		if (video.storageProvider === 'wasabi' || video.cleanObject?.provider === 'wasabi') {
			const read = await getWasabiReadUrl({
				kind: 'dive-video-clean',
				videoId: video.id,
				key: video.cleanObject?.key ?? video.storagePathClean,
				bucket: video.cleanObject?.bucket
			});
			return read.url;
		}
		return getDownloadURL(storageRef(storage, video.storagePathClean));
	}
	return getDownloadURL(storageRef(storage, videoOrStoragePath));
}

export async function updateDiveVideoUploadStatus(
	videoId: string,
	status: DiveVideoUploadStatus,
	extra: Partial<DiveVideo> = {}
): Promise<void> {
	await updateDoc(doc(db, COLLECTION, videoId), {
		uploadStatus: status,
		...extra,
		updatedAt: serverTimestamp()
	});
}

export async function updateDiveVideoGiftStatus(
	videoId: string,
	status: DiveVideoGiftStatus
): Promise<void> {
	await updateDoc(doc(db, COLLECTION, videoId), {
		giftStatus: status,
		updatedAt: serverTimestamp()
	});
}

/**
 * Accept a gifted dive video. Calls the `acceptDiveGift` Cloud Function
 * which atomically:
 *   - synthesises a `RoutineLog` from the video's timeline + metadata
 *     (no athlete input required),
 *   - sets `routineLogId` and re-links `sessionId` on the dive video,
 *   - flips `giftStatus` from `'pending'` to `'accepted'`.
 *
 * The athlete's client cannot do this directly because the Firestore
 * rule on `diveVideos/{videoId}` only lets the recipient change
 * `giftStatus` — not `routineLogId`.
 *
 * Idempotent: if the gift has already been accepted, returns the
 * existing `routineLogId` with `alreadyAccepted: true`.
 */
export async function acceptDiveGift(
	videoId: string
): Promise<{ routineLogId: string; alreadyAccepted: boolean }> {
	const callable = httpsCallable<
		{ videoId: string },
		{ routineLogId: string; alreadyAccepted: boolean }
	>(functions, 'acceptDiveGift');
	const result = await callable({ videoId });
	return result.data;
}

export async function pinDiveVideo(videoId: string, pinned: boolean): Promise<void> {
	await updateDoc(doc(db, COLLECTION, videoId), {
		retentionTier: pinned ? 'pinned' : 'keep-last-5',
		updatedAt: serverTimestamp()
	});
}

/**
 * Re-link every diveVideo created against `fromSessionId` to a new
 * `toSessionId`. Used by the dynamic dive recorder flow: videos are first
 * saved with an ad-hoc recorder session id, then re-linked onto the
 * freshly-created routineLog id so session detail / feed cards can find
 * them via `listDiveVideosForSession(routineLogId)`.
 */
export async function reassignDiveVideoSession(
	fromSessionId: string,
	toSessionId: string
): Promise<number> {
	const q = query(
		collection(db, COLLECTION),
		where('sessionId', '==', fromSessionId)
	);
	const snap = await getDocs(q);
	await Promise.all(
		snap.docs.map((d) =>
			updateDoc(d.ref, {
				sessionId: toSessionId,
				updatedAt: serverTimestamp()
			})
		)
	);
	return snap.size;
}

export async function getDiveVideo(videoId: string): Promise<DiveVideo | null> {
	const snap = await getDoc(doc(db, COLLECTION, videoId));
	if (!snap.exists()) return null;
	return { id: snap.id, ...(snap.data() as Omit<DiveVideo, 'id'>) };
}

/**
 * List videos owned (recorded) by a given user, newest first.
 */
export async function listOwnedDiveVideos(
	ownerId: string,
	limitCount = 50
): Promise<DiveVideo[]> {
	const q = query(
		collection(db, COLLECTION),
		where('ownerId', '==', ownerId),
		orderBy('recordedAt', 'desc'),
		limit(limitCount)
	);
	const snap = await getDocs(q);
	return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DiveVideo, 'id'>) }));
}

/**
 * List videos gifted to a given athlete (i.e. athleteId === uid AND
 * ownerId !== athleteId). Pending + accepted only.
 */
export async function listGiftedDiveVideos(
	athleteId: string,
	limitCount = 50
): Promise<DiveVideo[]> {
	const q = query(
		collection(db, COLLECTION),
		where('athleteId', '==', athleteId),
		orderBy('recordedAt', 'desc'),
		limit(limitCount)
	);
	const snap = await getDocs(q);
	return snap.docs
		.map((d) => ({ id: d.id, ...(d.data() as Omit<DiveVideo, 'id'>) }))
		.filter((v) => v.ownerId !== v.athleteId);
}

/**
 * List videos for a given session (owner-only view, used by session detail).
 */
export async function listDiveVideosForSession(sessionId: string): Promise<DiveVideo[]> {
	const q = query(
		collection(db, COLLECTION),
		where('sessionId', '==', sessionId),
		orderBy('recordedAt', 'desc')
	);
	const snap = await getDocs(q);
	return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DiveVideo, 'id'>) }));
}

/**
 * Delete the Firestore doc + Storage objects for a video. Used by the user
 * from the UI; the retention reaper uses the Admin SDK and bypasses rules.
 */
export async function deleteDiveVideo(video: DiveVideo): Promise<void> {
	const deletions: Promise<unknown>[] = [];
	if (video.storageProvider === 'wasabi' || video.cleanObject?.provider === 'wasabi') {
		deletions.push(
			deleteWasabiObject({
				kind: 'dive-video-clean',
				videoId: video.id,
				key: video.cleanObject?.key ?? video.storagePathClean,
				bucket: video.cleanObject?.bucket
			}).catch(() => null)
		);
		if (video.burnedObject || video.storagePathBurned) {
			deletions.push(
				deleteWasabiObject({
					kind: 'dive-video-burned',
					videoId: video.id,
					key: video.burnedObject?.key ?? video.storagePathBurned,
					bucket: video.burnedObject?.bucket
				}).catch(() => null)
			);
		}
		if (video.thumbnailObject || video.thumbnailPath) {
			deletions.push(
				deleteWasabiObject({
					kind: 'dive-video-thumb',
					videoId: video.id,
					key: video.thumbnailObject?.key ?? video.thumbnailPath,
					bucket: video.thumbnailObject?.bucket
				}).catch(() => null)
			);
		}
	} else {
		deletions.push(deleteObject(storageRef(storage, video.storagePathClean)).catch(() => null));
		if (video.storagePathBurned) {
			deletions.push(
				deleteObject(storageRef(storage, video.storagePathBurned)).catch(() => null)
			);
		}
		if (video.thumbnailPath) {
			deletions.push(deleteObject(storageRef(storage, video.thumbnailPath)).catch(() => null));
		}
	}
	await Promise.all(deletions);
	await deleteDoc(doc(db, COLLECTION, video.id));
}

/**
 * Client-side retention reaper.
 *
 * Keeps the 20 most recent `retentionTier === 'keep-last-5'` videos for the
 * given owner and deletes the rest (Firestore doc + Storage blobs). Videos
 * with `retentionTier === 'pinned'` are always preserved and do NOT count
 * against the 20-video budget.
 *
 * Returns the list of video ids that were reaped.
 *
 * This is a best-effort client-side implementation called after a successful
 * upload. A server-side Cloud Function (Admin SDK) will eventually take over
 * so retention is enforced even when the uploader never returns to the app;
 * until then, this keeps the typical user within budget.
 *
 * See docs/Dynamic video feature.md §7 (retention) and T12.
 */
export async function reapOwnedDiveVideos(
	ownerId: string,
	keepCount = 20,
	protectedVideoIds: string[] = []
): Promise<string[]> {
	const all = await listOwnedDiveVideos(ownerId, 100);
	const protectedIds = new Set(protectedVideoIds);
	const keepCandidates = all.filter((v) => v.retentionTier !== 'pinned');
	const toReap = keepCandidates
		.slice(keepCount)
		.filter((video) => !protectedIds.has(video.id));
	const reapedIds: string[] = [];
	for (const video of toReap) {
		try {
			await deleteDiveVideo(video);
			reapedIds.push(video.id);
		} catch (err) {
			// eslint-disable-next-line no-console
			console.warn('[reaper] failed to delete', video.id, err);
		}
	}
	return reapedIds;
}

/**
 * Convenience: convert a captured result into a `DiveVideoFormData` shape
 * with sensible defaults. Caller still decides on pool length, athleteId etc.
 */
export function buildDiveVideoFormData(args: {
	sessionId: string;
	userId: string;
	ownerId: string;
	athleteId?: string;
	discipline: DiveVideo['discipline'];
	poolLength: number;
	mimeType: string;
	sizeBytes: number;
	widthPx: number;
	heightPx: number;
	durationSeconds: number;
	resolutionPreset: DiveVideo['resolutionPreset'];
	timeline: DiveVideo['timeline'];
	deviceLabel?: string;
	cameraDeviceId?: string;
	cameraPreference?: DiveVideo['cameraPreference'];
	cameraFacing?: DiveVideo['cameraFacing'];
	routineLogId?: string;
	diveId?: string;
	capturePosture?: DiveVideo['capturePosture'];
	displayOrientation?: DiveVideo['displayOrientation'];
	displayRotationDeg?: DiveVideo['displayRotationDeg'];
}): DiveVideoFormData {
	const storagePathClean = cleanPathFor(args.userId, 'pending', args.mimeType);

	// Derive the asset's physical orientation from the encoded dimensions
	// (the only source of truth that's not lying on iOS Safari).
	const assetOrientation: DiveVideo['assetOrientation'] =
		args.widthPx >= args.heightPx ? 'landscape' : 'portrait';
	const assetAspectRatio: DiveVideo['assetAspectRatio'] =
		assetOrientation === 'landscape' ? '16:9' : '9:16';

	// Default display follows the asset unless the recorder told us
	// otherwise (e.g. user held phone vertically but file is 16:9).
	const displayOrientation: DiveVideo['displayOrientation'] =
		args.displayOrientation ?? (assetOrientation === 'landscape' ? 'landscape' : 'portrait-left');
	const displayAspectRatio: DiveVideo['displayAspectRatio'] =
		displayOrientation === 'landscape' ? '16:9' : '9:16';
	const displayRotationDeg: DiveVideo['displayRotationDeg'] = args.displayRotationDeg ?? 0;

	return {
		sessionId: args.sessionId,
		userId: args.userId,
		ownerId: args.ownerId,
		athleteId: args.athleteId,
		giftStatus: args.athleteId && args.athleteId !== args.ownerId ? 'pending' : undefined,
		routineLogId: args.routineLogId,
		diveId: args.diveId,
		discipline: args.discipline,
		storageProvider: 'wasabi',
		storagePathClean,
		durationSeconds: args.durationSeconds,
		widthPx: args.widthPx,
		heightPx: args.heightPx,
		mimeType: args.mimeType,
		sizeBytes: args.sizeBytes,
		recordedAt: Timestamp.now(),
		poolLength: args.poolLength,
		deviceLabel: args.deviceLabel,
		cameraDeviceId: args.cameraDeviceId,
		cameraPreference: args.cameraPreference,
		cameraFacing: args.cameraFacing,
		// Legacy display-facing shorthand kept in sync with displayOrientation.
		orientation: displayOrientation === 'landscape' ? 'landscape' : 'portrait',
		aspectRatio: displayAspectRatio,
		assetOrientation,
		assetRotationDeg: 0,
		assetAspectRatio,
		displayOrientation,
		displayRotationDeg,
		displayAspectRatio,
		capturePosture: args.capturePosture,
		resolutionPreset: args.resolutionPreset,
		retentionTier: 'keep-last-5',
		uploadStatus: 'pending',
		timeline: args.timeline
	};
}
