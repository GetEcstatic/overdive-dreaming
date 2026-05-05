import { httpsCallable } from 'firebase/functions';
import { functions } from '$lib/firebase';
import type { MediaObjectRef } from '$lib/types';
import type { MediaKind, SignedRead, SignedUpload } from './keys';

interface CreateUploadArgs {
	kind: MediaKind;
	userId: string;
	routineLogId?: string;
	videoId?: string;
	contentType: string;
	sizeBytes: number;
}

interface MultipartUpload {
	provider: 'wasabi';
	bucket: string;
	key: string;
	uploadId: string;
	partSizeBytes: number;
	object: MediaObjectRef;
}

export interface UploadedPart {
	partNumber: number;
	etag: string;
	sizeBytes: number;
}

const createMediaUploadFn = httpsCallable<CreateUploadArgs, SignedUpload>(
	functions,
	'createMediaUpload'
);
const getMediaReadUrlFn = httpsCallable<
	{
		kind: MediaKind;
		routineLogId?: string;
		videoId?: string;
		key?: string;
		bucket?: string;
		downloadFileName?: string;
	},
	SignedRead
>(functions, 'getMediaReadUrl');
const deleteMediaObjectFn = httpsCallable<
	{ kind: MediaKind; routineLogId?: string; videoId?: string; key?: string; bucket?: string },
	{ deleted: boolean }
>(functions, 'deleteMediaObject');
const createMultipartUploadFn = httpsCallable<
	{ videoId: string; contentType: string; sizeBytes: number; partSizeBytes: number },
	MultipartUpload
>(functions, 'createDiveVideoMultipartUpload');
const signDiveVideoPartFn = httpsCallable<
	{ videoId: string; bucket: string; key: string; uploadId: string; partNumbers: number[] },
	{ parts: Array<{ partNumber: number; uploadUrl: string; expiresAt: number }> }
>(functions, 'signDiveVideoPart');
const completeMultipartUploadFn = httpsCallable<
	{
		videoId: string;
		bucket: string;
		key: string;
		uploadId: string;
		parts: Array<{ partNumber: number; etag: string }>;
	},
	{ uploaded: boolean }
>(functions, 'completeDiveVideoMultipartUpload');
const abortMultipartUploadFn = httpsCallable<
	{ videoId: string; bucket: string; key: string; uploadId: string },
	{ aborted: boolean }
>(functions, 'abortDiveVideoMultipartUpload');
const requestOverlayDownloadFn = httpsCallable<
	{ videoId: string },
	{ jobId: string; queued: boolean }
>(functions, 'requestOverlayDownload');

export async function createWasabiUpload(args: CreateUploadArgs): Promise<SignedUpload> {
	return (await createMediaUploadFn(args)).data;
}

export async function getWasabiReadUrl(args: {
	kind: MediaKind;
	routineLogId?: string;
	videoId?: string;
	key?: string;
	bucket?: string;
	downloadFileName?: string;
}): Promise<SignedRead> {
	return (await getMediaReadUrlFn(args)).data;
}

export async function deleteWasabiObject(args: {
	kind: MediaKind;
	routineLogId?: string;
	videoId?: string;
	key?: string;
	bucket?: string;
}): Promise<boolean> {
	return (await deleteMediaObjectFn(args)).data.deleted;
}

export function uploadWithSignedUrl(
	upload: SignedUpload,
	body: Blob,
	onProgress?: (progress: number) => void
): Promise<void> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('PUT', upload.uploadUrl);
		const headers = upload.requiredHeaders ?? {};
		for (const [key, value] of Object.entries(headers)) {
			xhr.setRequestHeader(key, value);
		}
		xhr.upload.onprogress = (event) => {
			if (event.lengthComputable) onProgress?.((event.loaded / event.total) * 100);
		};
		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) resolve();
			else reject(new Error(`Upload failed with HTTP ${xhr.status}`));
		};
		xhr.onerror = () => reject(new Error('Upload failed'));
		xhr.send(body);
	});
}

export async function createWasabiMultipartUpload(args: {
	videoId: string;
	contentType: string;
	sizeBytes: number;
	partSizeBytes: number;
}): Promise<MultipartUpload> {
	return (await createMultipartUploadFn(args)).data;
}

export async function uploadWasabiPart(args: {
	videoId: string;
	bucket: string;
	key: string;
	uploadId: string;
	partNumber: number;
	blob: Blob;
}): Promise<UploadedPart> {
	const signed = (await signDiveVideoPartFn({
		videoId: args.videoId,
		bucket: args.bucket,
		key: args.key,
		uploadId: args.uploadId,
		partNumbers: [args.partNumber]
	})).data.parts[0];
	const response = await fetch(signed.uploadUrl, {
		method: 'PUT',
		body: args.blob
	});
	if (!response.ok) {
		throw new Error(`Part ${args.partNumber} upload failed with HTTP ${response.status}`);
	}
	const etag = response.headers.get('etag') ?? response.headers.get('ETag');
	if (!etag) throw new Error(`Part ${args.partNumber} upload did not return an ETag`);
	return { partNumber: args.partNumber, etag, sizeBytes: args.blob.size };
}

export async function completeWasabiMultipartUpload(args: {
	videoId: string;
	bucket: string;
	key: string;
	uploadId: string;
	parts: UploadedPart[];
}): Promise<void> {
	await completeMultipartUploadFn({
		videoId: args.videoId,
		bucket: args.bucket,
		key: args.key,
		uploadId: args.uploadId,
		parts: args.parts.map((part) => ({ partNumber: part.partNumber, etag: part.etag }))
	});
}

export async function abortWasabiMultipartUpload(args: {
	videoId: string;
	bucket: string;
	key: string;
	uploadId: string;
}): Promise<void> {
	await abortMultipartUploadFn(args);
}

export async function requestWasabiOverlayDownload(videoId: string): Promise<{
	jobId: string;
	queued: boolean;
}> {
	return (await requestOverlayDownloadFn({ videoId })).data;
}
