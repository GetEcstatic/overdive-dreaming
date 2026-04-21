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
	const path = thumbnailPathFor(userId, videoId);
	const ref = storageRef(storage, path);
	const task = uploadBytesResumable(ref, thumbBlob, { contentType: 'image/jpeg' });
	await task;
	const url = await getDownloadURL(ref);
	return { path, url };
}

export async function getDiveVideoDownloadUrl(storagePath: string): Promise<string> {
	return getDownloadURL(storageRef(storage, storagePath));
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

export async function pinDiveVideo(videoId: string, pinned: boolean): Promise<void> {
	await updateDoc(doc(db, COLLECTION, videoId), {
		retentionTier: pinned ? 'pinned' : 'keep-last-5',
		updatedAt: serverTimestamp()
	});
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
	deletions.push(deleteObject(storageRef(storage, video.storagePathClean)).catch(() => null));
	if (video.storagePathBurned) {
		deletions.push(
			deleteObject(storageRef(storage, video.storagePathBurned)).catch(() => null)
		);
	}
	if (video.thumbnailPath) {
		deletions.push(deleteObject(storageRef(storage, video.thumbnailPath)).catch(() => null));
	}
	await Promise.all(deletions);
	await deleteDoc(doc(db, COLLECTION, video.id));
}

/**
 * Client-side retention reaper.
 *
 * Keeps the 5 most recent `retentionTier === 'keep-last-5'` videos for the
 * given owner and deletes the rest (Firestore doc + Storage blobs). Videos
 * with `retentionTier === 'pinned'` are always preserved and do NOT count
 * against the 5-video budget.
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
	keepCount = 5
): Promise<string[]> {
	const all = await listOwnedDiveVideos(ownerId, 100);
	const keepCandidates = all.filter((v) => v.retentionTier !== 'pinned');
	const toReap = keepCandidates.slice(keepCount);
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
	routineLogId?: string;
	diveId?: string;
}): DiveVideoFormData {
	const storagePathClean = cleanPathFor(args.userId, 'pending', args.mimeType);
	return {
		sessionId: args.sessionId,
		userId: args.userId,
		ownerId: args.ownerId,
		athleteId: args.athleteId,
		giftStatus: args.athleteId && args.athleteId !== args.ownerId ? 'pending' : undefined,
		routineLogId: args.routineLogId,
		diveId: args.diveId,
		discipline: args.discipline,
		storagePathClean,
		durationSeconds: args.durationSeconds,
		widthPx: args.widthPx,
		heightPx: args.heightPx,
		mimeType: args.mimeType,
		sizeBytes: args.sizeBytes,
		recordedAt: Timestamp.now(),
		poolLength: args.poolLength,
		deviceLabel: args.deviceLabel,
		orientation: 'portrait',
		aspectRatio: '9:16',
		resolutionPreset: args.resolutionPreset,
		retentionTier: 'keep-last-5',
		uploadStatus: 'pending',
		timeline: args.timeline
	};
}
