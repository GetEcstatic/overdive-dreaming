/**
 * Drains the IndexedDB upload queue by resumable-uploading each blob to
 * Wasabi object storage and writing the corresponding Firestore `DiveVideo`.
 *
 * Triggered:
 * - explicitly by the capture-save flow (best path — user just finished recording)
 * - opportunistically when the app comes online (`window.addEventListener('online')`)
 * - on app boot if there are pending items.
 *
 * See docs/Dynamic video feature.md §7.
 */

import {
	createDiveVideo,
	reapOwnedDiveVideos,
	updateDiveVideoUploadStatus
} from '$lib/services/diveVideos';
import {
	completeWasabiMultipartUpload,
	createWasabiMultipartUpload,
	uploadWasabiPart,
	type UploadedPart
} from '$lib/media/client';
import {
	masterDiveVideoArtifact,
	uploadedDiveVideoProcessingState
} from '$lib/media/processing';
import {
	listPendingUploads,
	markAttempt,
	removePendingUpload,
	updatePendingUpload,
	type PendingUpload
} from './uploadQueue';
import { logUploadDiagnostic } from './uploadDiagnostics';

const MAX_ATTEMPTS = 50;
const DEFAULT_PART_SIZE_BYTES = 8 * 1024 * 1024;
const RETENTION_KEEP_COUNT = 100;
let automaticDrain: Promise<unknown> | null = null;

export interface UploadProgress {
	localId: string;
	bytesSent: number;
	bytesTotal: number;
	fraction: number;
}

export type UploadProgressListener = (p: UploadProgress) => void;

async function uploadOne(
	entry: PendingUpload,
	onProgress?: UploadProgressListener
): Promise<void> {
	logUploadDiagnostic({
		level: 'info',
		step: 'upload:start',
		message: 'Starting queued upload',
		localId: entry.localId,
		videoId: entry.remoteVideoId,
		details: {
			sizeBytes: entry.sizeBytes,
			mimeType: entry.mimeType,
			attempts: entry.attempts
		}
	});

	// 1. Create the Firestore doc once, then reuse it on retry. Without this,
	// every failed retry creates another pending/orphan diveVideos document.
	const videoId = entry.remoteVideoId ?? (await createDiveVideo({ ...entry.metadata }));
	if (!entry.remoteVideoId) {
		await updatePendingUpload(entry.localId, { remoteVideoId: videoId });
		logUploadDiagnostic({
			level: 'info',
			step: 'firestore:create',
			message: 'Created diveVideos document',
			localId: entry.localId,
			videoId
		});
	} else {
		logUploadDiagnostic({
			level: 'info',
			step: 'firestore:reuse',
			message: 'Reusing existing diveVideos document',
			localId: entry.localId,
			videoId
		});
	}

	// 2. Multipart object upload to Wasabi.
	const wasabiUpload =
		entry.wasabiUpload ??
		(await createWasabiMultipartUpload({
			videoId,
			contentType: entry.mimeType,
			sizeBytes: entry.blob.size,
			partSizeBytes: DEFAULT_PART_SIZE_BYTES
		}));
	const cleanObject = {
		provider: 'wasabi' as const,
		bucket: wasabiUpload.bucket,
		key: wasabiUpload.key,
		contentType: entry.mimeType,
		sizeBytes: entry.blob.size
	};
	await updatePendingUpload(entry.localId, {
		intendedStoragePath: wasabiUpload.key,
		wasabiUpload: {
			bucket: wasabiUpload.bucket,
			key: wasabiUpload.key,
			uploadId: wasabiUpload.uploadId,
			partSizeBytes: wasabiUpload.partSizeBytes,
			uploadedParts: entry.wasabiUpload?.uploadedParts ?? []
		}
	});
	logUploadDiagnostic({
		level: 'info',
		step: 'storage:start',
		message: 'Starting Wasabi multipart upload',
		localId: entry.localId,
		videoId,
		details: {
			storagePath: wasabiUpload.key,
			bucket: wasabiUpload.bucket,
			uploadId: wasabiUpload.uploadId,
			partSizeBytes: wasabiUpload.partSizeBytes
		}
	});

	await updateDiveVideoUploadStatus(videoId, 'uploading', {
		storageProvider: 'wasabi',
		storagePathClean: wasabiUpload.key,
		cleanObject
	});

	const uploadedParts = new Map<number, UploadedPart>();
	for (const part of entry.wasabiUpload?.uploadedParts ?? []) {
		uploadedParts.set(part.partNumber, part);
	}
	const partCount = Math.ceil(entry.blob.size / wasabiUpload.partSizeBytes);
	for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
		if (uploadedParts.has(partNumber)) continue;
		const start = (partNumber - 1) * wasabiUpload.partSizeBytes;
		const end = Math.min(start + wasabiUpload.partSizeBytes, entry.blob.size);
		const partBlob = entry.blob.slice(start, end, entry.mimeType);
		const uploadedPart = await uploadWasabiPart({
			videoId,
			bucket: wasabiUpload.bucket,
			key: wasabiUpload.key,
			uploadId: wasabiUpload.uploadId,
			partNumber,
			blob: partBlob
		});
		uploadedParts.set(partNumber, uploadedPart);
		const parts = Array.from(uploadedParts.values()).sort((a, b) => a.partNumber - b.partNumber);
		await updatePendingUpload(entry.localId, {
			wasabiUpload: {
				bucket: wasabiUpload.bucket,
				key: wasabiUpload.key,
				uploadId: wasabiUpload.uploadId,
				partSizeBytes: wasabiUpload.partSizeBytes,
				uploadedParts: parts
			}
		});
		const bytesSent = parts.reduce((sum, part) => sum + part.sizeBytes, 0);
		onProgress?.({
			localId: entry.localId,
			bytesSent,
			bytesTotal: entry.blob.size,
			fraction: entry.blob.size > 0 ? bytesSent / entry.blob.size : 0
		});
		logUploadDiagnostic({
			level: 'info',
			step: 'storage:part',
			message: 'Wasabi multipart part uploaded',
			localId: entry.localId,
			videoId,
			details: { partNumber, partCount, sizeBytes: uploadedPart.sizeBytes }
		});
	}

	const completedParts = Array.from(uploadedParts.values()).sort((a, b) => a.partNumber - b.partNumber);
	await completeWasabiMultipartUpload({
		videoId,
		bucket: wasabiUpload.bucket,
		key: wasabiUpload.key,
		uploadId: wasabiUpload.uploadId,
		parts: completedParts
	});
	logUploadDiagnostic({
		level: 'info',
		step: 'storage:complete',
		message: 'Wasabi multipart upload completed',
		localId: entry.localId,
		videoId,
		details: { storagePath: wasabiUpload.key, bucket: wasabiUpload.bucket }
	});

	// 3. Flip status to 'uploaded', queue lightweight server-side processing,
	// and remove from the local queue. The actual worker lands separately.
	await updateDiveVideoUploadStatus(videoId, 'uploaded', {
		processingState: uploadedDiveVideoProcessingState(),
		artifacts: [
			masterDiveVideoArtifact({
				object: cleanObject,
				widthPx: entry.metadata.widthPx,
				heightPx: entry.metadata.heightPx,
				durationSeconds: entry.metadata.durationSeconds,
				sizeBytes: entry.blob.size,
				contentType: entry.mimeType
			})
		]
	});
	logUploadDiagnostic({
		level: 'info',
		step: 'firestore:uploaded',
		message: 'Marked diveVideos document as uploaded',
		localId: entry.localId,
		videoId
	});
	await removePendingUpload(entry.localId);

	// 4. Best-effort retention reap (keep newest non-pinned videos for this owner).
	try {
		const reaped = await reapOwnedDiveVideos(entry.metadata.ownerId, RETENTION_KEEP_COUNT, [videoId]);
		if (reaped.length > 0) {
			// eslint-disable-next-line no-console
			console.info(
				`[uploadProcessor] retention reaper removed ${reaped.length} old video(s)`
			);
			logUploadDiagnostic({
				level: 'warn',
				step: 'reaper:removed',
				message: 'Retention reaper removed old uploaded videos',
				localId: entry.localId,
				videoId,
				details: { reapedIds: reaped }
			});
		}
	} catch (err) {
		// Non-fatal — retention is enforced again on the next successful upload.
		// eslint-disable-next-line no-console
		console.warn('[uploadProcessor] reaper failed', err);
		logUploadDiagnostic({
			level: 'warn',
			step: 'reaper:failed',
			message: 'Retention reaper failed after upload',
			localId: entry.localId,
			videoId,
			details: { error: err instanceof Error ? err.message : String(err) }
		});
	}
}

/**
 * Attempt to upload every pending item. Returns the number of items that
 * successfully uploaded.
 */
export async function drainUploadQueue(
	onProgress?: UploadProgressListener,
	options: { localIds?: string[] } = {}
): Promise<{ uploaded: number; failed: number; skipped: number; errors: string[] }> {
	const requested = options.localIds ? new Set(options.localIds) : null;
	const items = (await listPendingUploads()).filter((item) =>
		requested ? requested.has(item.localId) : true
	);
	const shouldLogDrain = items.length > 0 || Boolean(requested);
	if (shouldLogDrain) {
		logUploadDiagnostic({
			level: 'info',
			step: 'drain:start',
			message: 'Draining upload queue',
			details: {
				itemCount: items.length,
				localIds: items.map((item) => item.localId),
				filtered: Boolean(requested)
			}
		});
	}
	let uploaded = 0;
	let failed = 0;
	let skipped = 0;
	const errors: string[] = [];

	for (const entry of items) {
		if (entry.attempts >= MAX_ATTEMPTS) {
			skipped += 1;
			continue;
		}
		try {
			await uploadOne(entry, onProgress);
			uploaded += 1;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			// eslint-disable-next-line no-console
			console.error('[uploadProcessor] upload failed', entry.localId, err);
			await markAttempt(entry.localId, message);
			logUploadDiagnostic({
				level: 'error',
				step: 'upload:failed',
				message: 'Queued upload failed',
				localId: entry.localId,
				videoId: entry.remoteVideoId,
				details: {
					error: message,
					name: err instanceof Error ? err.name : undefined
				}
			});
			failed += 1;
			errors.push(message);
			// Continue with next entry; we try again on the next drain.
		}
	}

	if (shouldLogDrain) {
		logUploadDiagnostic({
			level: failed > 0 ? 'warn' : 'info',
			step: 'drain:complete',
			message: 'Upload queue drain finished',
			details: { uploaded, failed, skipped, errors }
		});
	}
	return { uploaded, failed, skipped, errors };
}

/**
 * Install window-level listeners that drain the queue whenever the app gets
 * a useful resume signal. Safe to call once at app boot.
 */
export function installOnlineDrainer(): () => void {
	if (typeof window === 'undefined') return () => undefined;
	const handler = () => {
		if (automaticDrain) return;
		automaticDrain = drainUploadQueue().catch((err) => {
			// eslint-disable-next-line no-console
			console.warn('[uploadProcessor] drain failed', err);
		}).finally(() => {
			automaticDrain = null;
		});
	};
	const visibilityHandler = () => {
		if (document.visibilityState === 'visible') handler();
	};
	window.addEventListener('online', handler);
	window.addEventListener('focus', handler);
	window.addEventListener('pageshow', handler);
	document.addEventListener('visibilitychange', visibilityHandler);
	return () => {
		window.removeEventListener('online', handler);
		window.removeEventListener('focus', handler);
		window.removeEventListener('pageshow', handler);
		document.removeEventListener('visibilitychange', visibilityHandler);
	};
}
