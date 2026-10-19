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
	deleteField,
	deleteDoc,
	query,
	where,
	orderBy,
	limit,
	onSnapshot,
	Timestamp,
	serverTimestamp,
	type Unsubscribe
} from 'firebase/firestore';
import {
	ref as storageRef,
	uploadBytesResumable,
	getDownloadURL,
	deleteObject,
	type UploadTask
} from 'firebase/storage';
import { auth, db, storage } from '$lib/firebase';
import { functions } from '$lib/firebase';
import { httpsCallable } from 'firebase/functions';
import {
	createWasabiUpload,
	deleteWasabiObject,
	getWasabiReadUrl,
	requestWasabiOverlayDownload,
	requestWasabiSocialCut,
	saveWasabiDiveVideoTimelineCorrection,
	uploadWithSignedUrl
} from '$lib/media/client';
import {
	initialDiveVideoProcessingState,
	SERVER_OVERLAY_STYLE_VERSION
} from '$lib/media/processing';
import { pbBeforeFromRecords, shareDateLabel } from '$lib/media/shareContext';
import { getUserPBRecords, getUserPBs } from '$lib/utils/personalBests';
import type {
	DiveVideo,
	DiveVideoFormData,
	DiveVideoGiftStatus,
	DiveTimeline,
	DiveVideoShareContext,
	DiveVideoShareEdit,
	DiveVideoUploadStatus
} from '$lib/types';
import { getUserSettings, updateUserSettings } from '$lib/firestore';
import type { SocialCutRenderOptions } from '$lib/media/overlayStyle';

const COLLECTION = 'diveVideos';

function fileExtensionFor(mimeType: string): string {
	if (mimeType.includes('mp4')) return 'mp4';
	if (mimeType.includes('webm')) return 'webm';
	return 'bin';
}

function cleanPathFor(userId: string, videoId: string, mimeType: string): string {
	return `users/${userId}/videos/${videoId}/clean.${fileExtensionFor(mimeType)}`;
}

function stripUndefinedFields(value: unknown): unknown {
	if (value === undefined) return undefined;
	if (value === null) return null;
	if (value instanceof Timestamp) return value;
	if (Array.isArray(value)) {
		return value
			.map((item) => stripUndefinedFields(item))
			.filter((item) => item !== undefined);
	}
	if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
		const cleaned: Record<string, unknown> = {};
		for (const [key, nested] of Object.entries(value)) {
			const stripped = stripUndefinedFields(nested);
			if (stripped !== undefined) cleaned[key] = stripped;
		}
		return cleaned;
	}
	return value;
}

function thumbnailPathFor(userId: string, videoId: string): string {
	return `users/${userId}/videos/${videoId}/thumb.jpg`;
}

function artifactMediaKind(kind: string | undefined):
	| 'dive-video-clean'
	| 'dive-video-thumb'
	| 'dive-video-playback-proxy'
	| 'dive-video-burned'
	| 'dive-video-social'
	| null {
	if (kind === 'master') return 'dive-video-clean';
	if (kind === 'thumbnail') return 'dive-video-thumb';
	if (kind === 'playback-proxy') return 'dive-video-playback-proxy';
	if (kind === 'overlay-download' || kind === 'overlay-preview') return 'dive-video-burned';
	if (kind === 'social-cut') return 'dive-video-social';
	return null;
}

const SHARE_CONTEXT_TIMEOUT_MS = 3_000;

/**
 * Share HUD snapshot (PB before this dive, athlete name, date) for a new
 * video. Best effort: returns undefined on any failure or after 3 s, so it
 * never blocks saving (e.g. offline, or a coach without access to the
 * athlete's PBs).
 */
async function resolveShareContext(
	videoData: Pick<DiveVideoFormData, 'userId' | 'ownerId' | 'athleteId' | 'discipline' | 'routineLogId' | 'recordedAt'>
): Promise<DiveVideoShareContext | undefined> {
	const athleteId = videoData.athleteId ?? videoData.userId;
	const selfRecorded = athleteId === videoData.ownerId;
	const lookup = (async (): Promise<DiveVideoShareContext> => {
		const [records, legacy] = await Promise.all([getUserPBRecords(athleteId), getUserPBs(athleteId)]);
		const pb = pbBeforeFromRecords({ records, legacy, discipline: videoData.discipline, routineLogId: videoData.routineLogId });
		const athleteName = selfRecorded ? auth.currentUser?.displayName?.trim() : undefined;
		const recordedAt = videoData.recordedAt?.toDate?.() ?? new Date();
		return {
			...pb,
			...(athleteName ? { athleteName } : {}),
			dateLabel: shareDateLabel(recordedAt)
		};
	})();
	const timeout = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), SHARE_CONTEXT_TIMEOUT_MS));
	try {
		return await Promise.race([lookup, timeout]);
	} catch {
		return undefined;
	}
}

/** The owner's last chosen graph direction, as the new video's share edit. Best effort, like the share context. */
async function resolveShareEdit(ownerId: string): Promise<DiveVideoShareEdit | undefined> {
	const lookup = getUserSettings(ownerId).then((settings) => {
		const direction = settings?.shareHud?.firstLengthDirection;
		return direction ? { firstLengthDirection: direction } : undefined;
	});
	const timeout = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), SHARE_CONTEXT_TIMEOUT_MS));
	try {
		return await Promise.race([lookup, timeout]);
	} catch {
		return undefined;
	}
}

/**
 * Flip the speed graph's first-length direction for one video and remember it
 * as the owner's default for new videos. Changes the video's overlay render
 * key, so its HUD download is regenerated on the next request.
 */
export async function setDiveVideoGraphDirection(args: {
	videoId: string;
	ownerId: string;
	direction: 'ltr' | 'rtl';
}): Promise<void> {
	await Promise.all([
		updateDoc(doc(db, COLLECTION, args.videoId), {
			'shareEdit.firstLengthDirection': args.direction,
			updatedAt: serverTimestamp()
		}),
		updateUserSettings(args.ownerId, { shareHud: { firstLengthDirection: args.direction } })
	]);
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
	const cleanVideoData = stripUndefinedFields(videoData) as typeof videoData;

	const storagePathClean =
		cleanVideoData.storagePathClean ??
		cleanPathFor(cleanVideoData.userId, videoId, cleanVideoData.mimeType);

	const [shareContext, shareEdit] = await Promise.all([
		cleanVideoData.shareContext ?? resolveShareContext(cleanVideoData),
		cleanVideoData.shareEdit ?? resolveShareEdit(cleanVideoData.ownerId ?? cleanVideoData.userId)
	]);

	const payload = {
		...cleanVideoData,
		...(shareContext ? { shareContext } : {}),
		...(shareEdit ? { shareEdit } : {}),
		id: videoId,
		storagePathClean,
		processingState: cleanVideoData.processingState ?? initialDiveVideoProcessingState(),
		overlayStyleVersion: cleanVideoData.overlayStyleVersion ?? SERVER_OVERLAY_STYLE_VERSION,
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

export async function getDiveVideoDirectDownloadUrl(
	video: DiveVideo,
	downloadFileName: string
): Promise<string> {
	if (video.storageProvider === 'wasabi' || video.cleanObject?.provider === 'wasabi') {
		const read = await getWasabiReadUrl({
			kind: 'dive-video-clean',
			videoId: video.id,
			key: video.cleanObject?.key ?? video.storagePathClean,
			bucket: video.cleanObject?.bucket,
			downloadFileName
		});
		return read.url;
	}
	return getDownloadURL(storageRef(storage, video.storagePathClean));
}

export async function getDiveVideoThumbnailUrl(video: DiveVideo): Promise<string> {
	if (video.storageProvider === 'wasabi' || video.thumbnailObject?.provider === 'wasabi') {
		const read = await getWasabiReadUrl({
			kind: 'dive-video-thumb',
			videoId: video.id,
			key: video.thumbnailObject?.key ?? video.thumbnailPath,
			bucket: video.thumbnailObject?.bucket
		});
		return read.url;
	}
	if (!video.thumbnailPath) throw new Error('Dive video has no thumbnail');
	return getDownloadURL(storageRef(storage, video.thumbnailPath));
}

export async function getDiveVideoPlaybackProxyUrl(video: DiveVideo): Promise<string> {
	const proxy = video.artifacts?.find((artifact) => artifact.kind === 'playback-proxy');
	if (!proxy?.object?.key) throw new Error('Dive video has no playback proxy');
	const read = await getWasabiReadUrl({
		kind: 'dive-video-playback-proxy',
		videoId: video.id,
		key: proxy.object.key,
		bucket: proxy.object.bucket
	});
	return read.url;
}

export async function getDiveVideoBurnedDownloadUrl(video: DiveVideo): Promise<string> {
	if (!video.burnedObject?.key && !video.storagePathBurned) {
		throw new Error('Dive video has no burned overlay export');
	}
	if (video.storageProvider === 'wasabi' || video.burnedObject?.provider === 'wasabi') {
		const read = await getWasabiReadUrl({
			kind: 'dive-video-burned',
			videoId: video.id,
			key: video.burnedObject?.key ?? video.storagePathBurned,
			bucket: video.burnedObject?.bucket,
			downloadFileName: `overdive-overlay-${video.discipline}-${video.id}.mp4`
		});
		return read.url;
	}
	return getDownloadURL(storageRef(storage, video.storagePathBurned as string));
}

export async function getPreferredDiveVideoPlaybackUrl(video: DiveVideo): Promise<string> {
	if (video.processingState?.playbackProxy === 'ready') {
		try {
			return await getDiveVideoPlaybackProxyUrl(video);
		} catch {
			// Fall through to the canonical master if the derivative is stale/missing.
		}
	}
	return getDiveVideoDownloadUrl(video);
}

export async function requestDiveVideoOverlayDownload(videoId: string): Promise<void> {
	await requestWasabiOverlayDownload(videoId);
}

export async function requestDiveVideoSocialCut(videoId: string, options: SocialCutRenderOptions): Promise<void> {
	await requestWasabiSocialCut(videoId, options);
}

export async function getDiveVideoSocialCutUrl(video: DiveVideo): Promise<string> {
	const artifact = video.artifacts?.find((candidate) => candidate.kind === 'social-cut');
	if (!artifact?.object?.key) throw new Error('This dive has no social cut yet');
	const read = await getWasabiReadUrl({
		kind: 'dive-video-social',
		videoId: video.id,
		key: artifact.object.key,
		bucket: artifact.object.bucket,
		downloadFileName: socialCutFileName(video)
	});
	return read.url;
}

export function socialCutFileName(video: Pick<DiveVideo, 'id' | 'discipline'>): string {
	return `overdive-reel-${video.discipline}-${video.id}.mp4`;
}

/** Owner's protocol-end override for the social cut, or null to use the recorder's tap / default. */
export async function setDiveVideoProtocolEnd(videoId: string, protocolEndMs: number | null): Promise<void> {
	await updateDoc(doc(db, COLLECTION, videoId), {
		'shareEdit.protocolEndMs': protocolEndMs === null ? deleteField() : Math.round(protocolEndMs),
		updatedAt: serverTimestamp()
	});
}

/** Social cut toggles, remembered for the owner's next share. */
export async function saveSocialCutOptions(uid: string, options: SocialCutRenderOptions): Promise<void> {
	await updateUserSettings(uid, {
		shareHud: { showName: options.showName, showPb: options.showPb, socialHook: options.hook }
	});
}

export async function saveDiveVideoTimelineCorrection(args: {
	videoId: string;
	timeline: DiveTimeline;
}): Promise<void> {
	await saveWasabiDiveVideoTimelineCorrection(args);
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

export function subscribeDiveVideosForSession(
	sessionId: string,
	onVideos: (videos: DiveVideo[]) => void,
	onError?: (error: Error) => void
): Unsubscribe {
	const q = query(
		collection(db, COLLECTION),
		where('sessionId', '==', sessionId),
		orderBy('recordedAt', 'desc')
	);
	return onSnapshot(
		q,
		(snap) => {
			onVideos(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DiveVideo, 'id'>) })));
		},
		(error) => onError?.(error)
	);
}

/**
 * Delete the Firestore doc + Storage objects for a video. Used by the user
 * from the UI; the retention reaper uses the Admin SDK and bypasses rules.
 */
export async function deleteDiveVideo(video: DiveVideo): Promise<void> {
	const deletions: Promise<unknown>[] = [];
	const deletedWasabiKeys = new Set<string>();
	const deletedStoragePaths = new Set<string>();

	function deleteWasabiOnce(args: {
		kind: 'dive-video-clean' | 'dive-video-thumb' | 'dive-video-playback-proxy' | 'dive-video-burned' | 'dive-video-social';
		key?: string;
		bucket?: string;
	}): void {
		if (!args.key) return;
		const id = `${args.bucket ?? ''}:${args.key}`;
		if (deletedWasabiKeys.has(id)) return;
		deletedWasabiKeys.add(id);
		deletions.push(
			deleteWasabiObject({
				kind: args.kind,
				videoId: video.id,
				key: args.key,
				bucket: args.bucket
			}).catch(() => null)
		);
	}

	function deleteStorageOnce(path: string | undefined): void {
		if (!path || deletedStoragePaths.has(path)) return;
		deletedStoragePaths.add(path);
		deletions.push(deleteObject(storageRef(storage, path)).catch(() => null));
	}

	if (video.storageProvider === 'wasabi' || video.cleanObject?.provider === 'wasabi') {
		deleteWasabiOnce({
			kind: 'dive-video-clean',
			key: video.cleanObject?.key ?? video.storagePathClean,
			bucket: video.cleanObject?.bucket
		});
		if (video.burnedObject || video.storagePathBurned) {
			deleteWasabiOnce({
				kind: 'dive-video-burned',
				key: video.burnedObject?.key ?? video.storagePathBurned,
				bucket: video.burnedObject?.bucket
			});
		}
		if (video.thumbnailObject || video.thumbnailPath) {
			deleteWasabiOnce({
				kind: 'dive-video-thumb',
				key: video.thumbnailObject?.key ?? video.thumbnailPath,
				bucket: video.thumbnailObject?.bucket
			});
		}
		for (const artifact of video.artifacts ?? []) {
			const kind = artifactMediaKind(artifact.kind);
			if (!kind || artifact.object?.provider !== 'wasabi') continue;
			deleteWasabiOnce({ kind, key: artifact.object.key, bucket: artifact.object.bucket });
		}
	} else {
		deleteStorageOnce(video.storagePathClean);
		deleteStorageOnce(video.storagePathBurned);
		deleteStorageOnce(video.thumbnailPath);
		for (const artifact of video.artifacts ?? []) {
			if (artifact.object?.provider === 'wasabi') {
				const kind = artifactMediaKind(artifact.kind);
				if (kind) deleteWasabiOnce({ kind, key: artifact.object.key, bucket: artifact.object.bucket });
			} else if (artifact.object?.key) {
				deleteStorageOnce(artifact.object.key);
			}
		}
	}
	await Promise.all(deletions);
	await deleteDoc(doc(db, COLLECTION, video.id));
}

export async function deleteDiveVideosForSession(sessionId: string): Promise<number> {
	const videos = await listDiveVideosForSession(sessionId);
	await Promise.all(videos.map((video) => deleteDiveVideo(video)));
	return videos.length;
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
	qualityPreset?: DiveVideo['qualityPreset'];
	requestedVideoBitrateBps?: number;
	actualAverageBitrateBps?: number;
	actualFrameRate?: number;
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
		qualityPreset: args.qualityPreset,
		requestedVideoBitrateBps: args.requestedVideoBitrateBps,
		actualAverageBitrateBps: args.actualAverageBitrateBps,
		actualFrameRate: args.actualFrameRate,
		retentionTier: 'keep-last-5',
		uploadStatus: 'pending',
		processingState: initialDiveVideoProcessingState(),
		overlayStyleVersion: SERVER_OVERLAY_STYLE_VERSION,
		timeline: args.timeline
	};
}
