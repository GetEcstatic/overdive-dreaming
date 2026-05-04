import { randomUUID } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
	abortMultipartUpload,
	completeMultipartUpload,
	createMultipartUpload,
	deleteObject,
	getWasabiConfig,
	signGetObject,
	signPutObject,
	signUploadPart,
	WASABI_ACCESS_KEY_ID,
	WASABI_SECRET_ACCESS_KEY
} from './wasabiClient.js';

const UPLOAD_URL_EXPIRES_SECONDS = 15 * 60;
const READ_URL_EXPIRES_SECONDS = 60 * 60;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MIN_PART_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_PART_SIZE_BYTES = 8 * 1024 * 1024;

type MediaKind =
	| 'session-photo'
	| 'dive-video-clean'
	| 'dive-video-thumb'
	| 'dive-video-burned';

interface MediaObjectRef {
	provider: 'wasabi';
	bucket: string;
	key: string;
	contentType?: string;
	sizeBytes?: number;
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

function optionalString(data: Record<string, unknown>, key: string): string | undefined {
	const value = data[key];
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function requiredNumber(data: Record<string, unknown>, key: string): number {
	const value = data[key];
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
		throw new HttpsError('invalid-argument', `Invalid ${key}`);
	}
	return value;
}

function extensionForContentType(contentType: string): string {
	const lower = contentType.toLowerCase();
	if (lower.includes('jpeg') || lower.includes('jpg')) return 'jpg';
	if (lower.includes('png')) return 'png';
	if (lower.includes('webp')) return 'webp';
	if (lower.includes('mp4')) return 'mp4';
	if (lower.includes('webm')) return 'webm';
	return 'bin';
}

function validateMediaPolicy(kind: MediaKind, contentType: string, sizeBytes: number): void {
	if (kind === 'session-photo' || kind === 'dive-video-thumb') {
		if (!contentType.startsWith('image/')) {
			throw new HttpsError('invalid-argument', 'Object must be an image');
		}
		if (sizeBytes > MAX_PHOTO_BYTES) {
			throw new HttpsError('invalid-argument', 'Image must be under 5 MB');
		}
		return;
	}
	if (kind === 'dive-video-clean' || kind === 'dive-video-burned') {
		if (!contentType.startsWith('video/')) {
			throw new HttpsError('invalid-argument', 'Object must be a video');
		}
		return;
	}
	throw new HttpsError('invalid-argument', 'Unsupported media kind');
}

function objectRef(args: {
	bucket: string;
	key: string;
	contentType?: string;
	sizeBytes?: number;
}): MediaObjectRef {
	return {
		provider: 'wasabi',
		bucket: args.bucket,
		key: args.key,
		contentType: args.contentType,
		sizeBytes: args.sizeBytes
	};
}

function photoKey(uid: string, routineLogId: string, contentType: string): string {
	return `users/${uid}/routineLogs/${routineLogId}/photos/${randomUUID()}.${extensionForContentType(contentType)}`;
}

function videoCleanKey(uid: string, videoId: string, contentType: string): string {
	return `users/${uid}/videos/${videoId}/clean.${extensionForContentType(contentType)}`;
}

function videoThumbKey(uid: string, videoId: string): string {
	return `users/${uid}/videos/${videoId}/thumb.jpg`;
}

function videoBurnedKey(uid: string, videoId: string): string {
	return `users/${uid}/videos/${videoId}/burned.mp4`;
}

async function assertRoutineLogAccess(args: {
	uid: string;
	routineLogId: string;
	write?: boolean;
}): Promise<FirebaseFirestore.DocumentSnapshot> {
	const snap = await getFirestore().collection('routineLogs').doc(args.routineLogId).get();
	if (!snap.exists) throw new HttpsError('not-found', 'Routine log not found');
	const data = snap.data() as { userId?: string; visibility?: string };
	const canRead = data.userId === args.uid || data.visibility === 'public';
	const canWrite = data.userId === args.uid;
	if (args.write ? !canWrite : !canRead) {
		throw new HttpsError('permission-denied', 'You do not have access to this routine log');
	}
	return snap;
}

function routineLogOwner(snap: FirebaseFirestore.DocumentSnapshot): string {
	const userId = (snap.data() as { userId?: string } | undefined)?.userId;
	if (!userId) throw new HttpsError('failed-precondition', 'Routine log owner is missing');
	return userId;
}

async function assertDiveVideoAccess(args: {
	uid: string;
	videoId: string;
	write?: boolean;
}): Promise<FirebaseFirestore.DocumentSnapshot> {
	const snap = await getFirestore().collection('diveVideos').doc(args.videoId).get();
	if (!snap.exists) throw new HttpsError('not-found', 'Dive video not found');
	const data = snap.data() as { ownerId?: string; userId?: string; athleteId?: string };
	const isOwner = data.ownerId === args.uid || data.userId === args.uid;
	const isAthlete = data.athleteId === args.uid;
	if (args.write ? !isOwner : !isOwner && !isAthlete) {
		throw new HttpsError('permission-denied', 'You do not have access to this video');
	}
	return snap;
}

function diveVideoOwner(snap: FirebaseFirestore.DocumentSnapshot): string {
	const data = snap.data() as { ownerId?: string; userId?: string } | undefined;
	const ownerId = data?.ownerId ?? data?.userId;
	if (!ownerId) throw new HttpsError('failed-precondition', 'Dive video owner is missing');
	return ownerId;
}

function assertWasabiKey(args: { bucket: string; key: string; expectedPrefix: string }): void {
	if (args.bucket !== getWasabiConfig().bucket || !args.key.startsWith(args.expectedPrefix)) {
		throw new HttpsError('permission-denied', 'Media object is outside the allowed path');
	}
}

function resolveObjectRef(args: {
	ref?: MediaObjectRef;
	requestedBucket?: string;
	requestedKey?: string;
	expectedPrefix: string;
}): { bucket: string; key: string } {
	const bucket = args.requestedBucket ?? args.ref?.bucket ?? getWasabiConfig().bucket;
	const key = args.requestedKey ?? args.ref?.key;
	if (!key) throw new HttpsError('not-found', 'Media object key not found');
	assertWasabiKey({ bucket, key, expectedPrefix: args.expectedPrefix });
	return { bucket, key };
}

function assertExistingDiveVideoObject(args: {
	snap: FirebaseFirestore.DocumentSnapshot;
	kind: MediaKind;
	bucket: string;
	key: string;
}): void {
	const video = args.snap.data() as {
		cleanObject?: MediaObjectRef;
		thumbnailObject?: MediaObjectRef;
		burnedObject?: MediaObjectRef;
	} | undefined;
	const ref =
		args.kind === 'dive-video-thumb'
			? video?.thumbnailObject
			: args.kind === 'dive-video-burned'
				? video?.burnedObject
				: video?.cleanObject;
	if (ref && (ref.bucket !== args.bucket || ref.key !== args.key)) {
		throw new HttpsError('permission-denied', 'Media object does not match the video document');
	}
}

const callableOptions = {
	secrets: [WASABI_ACCESS_KEY_ID, WASABI_SECRET_ACCESS_KEY]
};

function rethrowMediaBackendError(step: string, err: unknown): never {
	if (err instanceof HttpsError) throw err;
	const message = err instanceof Error && err.message ? err.message : String(err);
	console.error(`[mediaSigning] ${step} failed`, err);
	throw new HttpsError('unavailable', `${step} failed: ${message}`);
}

export const createMediaUpload = onCall(callableOptions, async (request) => {
	const uid = requireUid(request.auth);
	const data = asRecord(request.data);
	const kind = requiredString(data, 'kind') as MediaKind;
	const contentType = requiredString(data, 'contentType');
	const sizeBytes = requiredNumber(data, 'sizeBytes');
	validateMediaPolicy(kind, contentType, sizeBytes);

	const bucket = getWasabiConfig().bucket;
	let key: string;
	if (kind === 'session-photo') {
		const routineLogId = requiredString(data, 'routineLogId');
		await assertRoutineLogAccess({ uid, routineLogId, write: true });
		key = photoKey(uid, routineLogId, contentType);
	} else {
		const videoId = requiredString(data, 'videoId');
		await assertDiveVideoAccess({ uid, videoId, write: true });
		if (kind === 'dive-video-thumb') key = videoThumbKey(uid, videoId);
		else if (kind === 'dive-video-burned') key = videoBurnedKey(uid, videoId);
		else key = videoCleanKey(uid, videoId, contentType);
	}

	let uploadUrl: string;
	try {
		uploadUrl = await signPutObject({
			bucket,
			key,
			contentType,
			expiresInSeconds: UPLOAD_URL_EXPIRES_SECONDS
		});
	} catch (err) {
		rethrowMediaBackendError('create signed upload URL', err);
	}
	return {
		provider: 'wasabi',
		bucket,
		key,
		uploadUrl,
		expiresAt: Date.now() + UPLOAD_URL_EXPIRES_SECONDS * 1000,
		requiredHeaders: { 'Content-Type': contentType },
		object: objectRef({ bucket, key, contentType, sizeBytes })
	};
});

export const getMediaReadUrl = onCall(callableOptions, async (request) => {
	const uid = requireUid(request.auth);
	const data = asRecord(request.data);
	const kind = requiredString(data, 'kind') as MediaKind;
	let ref: MediaObjectRef | undefined;
	let expectedPrefix: string;
	if (kind === 'session-photo') {
		const routineLogId = requiredString(data, 'routineLogId');
		const snap = await assertRoutineLogAccess({ uid, routineLogId });
		ref = (snap.data() as { photoObject?: MediaObjectRef }).photoObject;
		expectedPrefix = `users/${routineLogOwner(snap)}/routineLogs/${routineLogId}/photos/`;
	} else {
		const videoId = requiredString(data, 'videoId');
		const snap = await assertDiveVideoAccess({ uid, videoId });
		const video = snap.data() as {
			cleanObject?: MediaObjectRef;
			thumbnailObject?: MediaObjectRef;
			burnedObject?: MediaObjectRef;
		};
		ref =
			kind === 'dive-video-thumb'
				? video.thumbnailObject
				: kind === 'dive-video-burned'
					? video.burnedObject
					: video.cleanObject;
		expectedPrefix = `users/${diveVideoOwner(snap)}/videos/${videoId}/`;
	}
	const { bucket, key } = resolveObjectRef({
		ref,
		requestedBucket: optionalString(data, 'bucket'),
		requestedKey: optionalString(data, 'key'),
		expectedPrefix
	});
	let url: string;
	try {
		url = await signGetObject({
			bucket,
			key,
			expiresInSeconds: READ_URL_EXPIRES_SECONDS
		});
	} catch (err) {
		rethrowMediaBackendError('create signed read URL', err);
	}
	return { url, expiresAt: Date.now() + READ_URL_EXPIRES_SECONDS * 1000 };
});

export const deleteMediaObject = onCall(callableOptions, async (request) => {
	const uid = requireUid(request.auth);
	const data = asRecord(request.data);
	const kind = requiredString(data, 'kind') as MediaKind;
	let ref: MediaObjectRef | undefined;
	let expectedPrefix: string;
	let videoSnap: FirebaseFirestore.DocumentSnapshot | undefined;
	if (kind === 'session-photo') {
		const routineLogId = requiredString(data, 'routineLogId');
		const snap = await assertRoutineLogAccess({ uid, routineLogId, write: true });
		ref = (snap.data() as { photoObject?: MediaObjectRef }).photoObject;
		expectedPrefix = `users/${routineLogOwner(snap)}/routineLogs/${routineLogId}/photos/`;
	} else {
		const videoId = requiredString(data, 'videoId');
		const snap = await assertDiveVideoAccess({ uid, videoId, write: true });
		videoSnap = snap;
		const video = snap.data() as {
			cleanObject?: MediaObjectRef;
			thumbnailObject?: MediaObjectRef;
			burnedObject?: MediaObjectRef;
		};
		ref =
			kind === 'dive-video-thumb'
				? video.thumbnailObject
				: kind === 'dive-video-burned'
					? video.burnedObject
					: video.cleanObject;
		expectedPrefix = `users/${diveVideoOwner(snap)}/videos/${videoId}/`;
	}
	const requestedKey = optionalString(data, 'key');
	const { bucket, key } = resolveObjectRef({
		ref,
		requestedBucket: optionalString(data, 'bucket'),
		requestedKey,
		expectedPrefix
	});
	if (videoSnap) assertExistingDiveVideoObject({ snap: videoSnap, kind, bucket, key });
	try {
		await deleteObject({ bucket, key });
	} catch (err) {
		rethrowMediaBackendError('delete media object', err);
	}
	return { deleted: true };
});

export const createDiveVideoMultipartUpload = onCall(callableOptions, async (request) => {
	const uid = requireUid(request.auth);
	const data = asRecord(request.data);
	const videoId = requiredString(data, 'videoId');
	const contentType = requiredString(data, 'contentType');
	const sizeBytes = requiredNumber(data, 'sizeBytes');
	const requestedPartSize = requiredNumber(data, 'partSizeBytes');
	validateMediaPolicy('dive-video-clean', contentType, sizeBytes);
	await assertDiveVideoAccess({ uid, videoId, write: true });

	const bucket = getWasabiConfig().bucket;
	const key = videoCleanKey(uid, videoId, contentType);
	const partSizeBytes = Math.max(requestedPartSize || DEFAULT_PART_SIZE_BYTES, MIN_PART_SIZE_BYTES);
	let uploadId: string;
	try {
		uploadId = await createMultipartUpload({ bucket, key, contentType });
	} catch (err) {
		rethrowMediaBackendError('create multipart upload', err);
	}

	await getFirestore().collection('diveVideos').doc(videoId).update({
		storageProvider: 'wasabi',
		storagePathClean: key,
		cleanObject: objectRef({ bucket, key, contentType, sizeBytes }),
		uploadStatus: 'uploading',
		updatedAt: FieldValue.serverTimestamp()
	});

	return {
		provider: 'wasabi',
		bucket,
		key,
		uploadId,
		partSizeBytes,
		object: objectRef({ bucket, key, contentType, sizeBytes })
	};
});

export const signDiveVideoPart = onCall(callableOptions, async (request) => {
	const uid = requireUid(request.auth);
	const data = asRecord(request.data);
	const videoId = requiredString(data, 'videoId');
	const bucket = requiredString(data, 'bucket');
	const key = requiredString(data, 'key');
	const uploadId = requiredString(data, 'uploadId');
	const partNumbers = data.partNumbers;
	if (!Array.isArray(partNumbers) || partNumbers.some((part) => typeof part !== 'number')) {
		throw new HttpsError('invalid-argument', 'partNumbers must be an array of numbers');
	}
	const snap = await assertDiveVideoAccess({ uid, videoId, write: true });
	const expectedPrefix = `users/${diveVideoOwner(snap)}/videos/${videoId}/`;
	assertWasabiKey({ bucket, key, expectedPrefix });
	assertExistingDiveVideoObject({ snap, kind: 'dive-video-clean', bucket, key });
	let parts: Array<{ partNumber: number; uploadUrl: string; expiresAt: number }>;
	try {
		parts = await Promise.all(
			partNumbers.map(async (partNumber) => ({
				partNumber,
				uploadUrl: await signUploadPart({
					bucket,
					key,
					uploadId,
					partNumber,
					expiresInSeconds: UPLOAD_URL_EXPIRES_SECONDS
				}),
				expiresAt: Date.now() + UPLOAD_URL_EXPIRES_SECONDS * 1000
			}))
		);
	} catch (err) {
		rethrowMediaBackendError('sign multipart upload part', err);
	}
	return { parts };
});

export const completeDiveVideoMultipartUpload = onCall(callableOptions, async (request) => {
	const uid = requireUid(request.auth);
	const data = asRecord(request.data);
	const videoId = requiredString(data, 'videoId');
	const bucket = requiredString(data, 'bucket');
	const key = requiredString(data, 'key');
	const uploadId = requiredString(data, 'uploadId');
	const parts = data.parts;
	if (
		!Array.isArray(parts) ||
		parts.some(
			(part) =>
				!part ||
				typeof part !== 'object' ||
				typeof (part as { partNumber?: unknown }).partNumber !== 'number' ||
				typeof (part as { etag?: unknown }).etag !== 'string'
		)
	) {
		throw new HttpsError('invalid-argument', 'parts must include partNumber and etag');
	}
	const snap = await assertDiveVideoAccess({ uid, videoId, write: true });
	const expectedPrefix = `users/${diveVideoOwner(snap)}/videos/${videoId}/`;
	assertWasabiKey({ bucket, key, expectedPrefix });
	assertExistingDiveVideoObject({ snap, kind: 'dive-video-clean', bucket, key });
	const existingCleanObject = (snap.data() as { cleanObject?: MediaObjectRef } | undefined)?.cleanObject;
	try {
		await completeMultipartUpload({
			bucket,
			key,
			uploadId,
			parts: parts.map((part) => ({
				partNumber: (part as { partNumber: number }).partNumber,
				etag: (part as { etag: string }).etag
			}))
		});
	} catch (err) {
		rethrowMediaBackendError('complete multipart upload', err);
	}
	await getFirestore().collection('diveVideos').doc(videoId).update({
		uploadStatus: 'uploaded',
		storageProvider: 'wasabi',
		storagePathClean: key,
		cleanObject:
			existingCleanObject?.bucket === bucket && existingCleanObject.key === key
				? existingCleanObject
				: { provider: 'wasabi', bucket, key },
		updatedAt: FieldValue.serverTimestamp()
	});
	return { uploaded: true };
});

export const abortDiveVideoMultipartUpload = onCall(callableOptions, async (request) => {
	const uid = requireUid(request.auth);
	const data = asRecord(request.data);
	const videoId = requiredString(data, 'videoId');
	const bucket = requiredString(data, 'bucket');
	const key = requiredString(data, 'key');
	const uploadId = requiredString(data, 'uploadId');
	const snap = await assertDiveVideoAccess({ uid, videoId, write: true });
	const expectedPrefix = `users/${diveVideoOwner(snap)}/videos/${videoId}/`;
	assertWasabiKey({ bucket, key, expectedPrefix });
	assertExistingDiveVideoObject({ snap, kind: 'dive-video-clean', bucket, key });
	try {
		await abortMultipartUpload({ bucket, key, uploadId });
	} catch (err) {
		rethrowMediaBackendError('abort multipart upload', err);
	}
	return { aborted: true };
});
