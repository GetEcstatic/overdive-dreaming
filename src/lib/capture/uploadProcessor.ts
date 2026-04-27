/**
 * Drains the IndexedDB upload queue by resumable-uploading each blob to
 * Firebase Storage and writing the corresponding Firestore `DiveVideo`.
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
	updateDiveVideoUploadStatus,
	uploadDiveVideoBlob
} from '$lib/services/diveVideos';
import {
	listPendingUploads,
	markAttempt,
	removePendingUpload,
	updatePendingUpload,
	type PendingUpload
} from './uploadQueue';
import { logUploadDiagnostic } from './uploadDiagnostics';

const MAX_ATTEMPTS = 5;

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

	// 2. Resumable upload.
	const { task, storagePath } = uploadDiveVideoBlob(
		entry.metadata.userId,
		videoId,
		entry.blob,
		entry.mimeType
	);
	await updatePendingUpload(entry.localId, { intendedStoragePath: storagePath });
	logUploadDiagnostic({
		level: 'info',
		step: 'storage:start',
		message: 'Starting Firebase Storage upload',
		localId: entry.localId,
		videoId,
		details: { storagePath }
	});

	await updateDiveVideoUploadStatus(videoId, 'uploading', {
		storagePathClean: storagePath
	});

	await new Promise<void>((resolve, reject) => {
		task.on(
			'state_changed',
			(snapshot) => {
				onProgress?.({
					localId: entry.localId,
					bytesSent: snapshot.bytesTransferred,
					bytesTotal: snapshot.totalBytes,
					fraction:
						snapshot.totalBytes > 0
							? snapshot.bytesTransferred / snapshot.totalBytes
							: 0
				});
			},
			(err) => reject(err),
			() => resolve()
		);
	});
	logUploadDiagnostic({
		level: 'info',
		step: 'storage:complete',
		message: 'Firebase Storage upload completed',
		localId: entry.localId,
		videoId,
		details: { storagePath }
	});

	// 3. Flip status to 'uploaded' and remove from queue.
	await updateDiveVideoUploadStatus(videoId, 'uploaded');
	logUploadDiagnostic({
		level: 'info',
		step: 'firestore:uploaded',
		message: 'Marked diveVideos document as uploaded',
		localId: entry.localId,
		videoId
	});
	await removePendingUpload(entry.localId);

	// 4. Best-effort retention reap (keep 20 newest non-pinned for this owner).
	try {
		const reaped = await reapOwnedDiveVideos(entry.metadata.ownerId, 20, [videoId]);
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
 * Install a window-level listener that drains the queue whenever the app
 * comes back online. Safe to call once at app boot.
 */
export function installOnlineDrainer(): () => void {
	if (typeof window === 'undefined') return () => undefined;
	const handler = () => {
		drainUploadQueue().catch((err) => {
			// eslint-disable-next-line no-console
			console.warn('[uploadProcessor] drain failed', err);
		});
	};
	window.addEventListener('online', handler);
	return () => window.removeEventListener('online', handler);
}
