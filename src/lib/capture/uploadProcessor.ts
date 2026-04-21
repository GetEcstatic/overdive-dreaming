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
	type PendingUpload
} from './uploadQueue';

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
	// 1. Create Firestore doc (status='pending', storagePathClean is a placeholder).
	const videoId = await createDiveVideo({ ...entry.metadata });

	// 2. Resumable upload.
	const { task, storagePath } = uploadDiveVideoBlob(
		entry.metadata.userId,
		videoId,
		entry.blob,
		entry.mimeType
	);

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

	// 3. Flip status to 'uploaded' and remove from queue.
	await updateDiveVideoUploadStatus(videoId, 'uploaded');
	await removePendingUpload(entry.localId);

	// 4. Best-effort retention reap (keep 5 newest non-pinned for this owner).
	try {
		const reaped = await reapOwnedDiveVideos(entry.metadata.ownerId);
		if (reaped.length > 0) {
			// eslint-disable-next-line no-console
			console.info(
				`[uploadProcessor] retention reaper removed ${reaped.length} old video(s)`
			);
		}
	} catch (err) {
		// Non-fatal — retention is enforced again on the next successful upload.
		// eslint-disable-next-line no-console
		console.warn('[uploadProcessor] reaper failed', err);
	}
}

/**
 * Attempt to upload every pending item. Returns the number of items that
 * successfully uploaded.
 */
export async function drainUploadQueue(
	onProgress?: UploadProgressListener
): Promise<{ uploaded: number; failed: number; skipped: number }> {
	const items = await listPendingUploads();
	let uploaded = 0;
	let failed = 0;
	let skipped = 0;

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
			await markAttempt(entry.localId, message);
			failed += 1;
			// Continue with next entry; we try again on the next drain.
		}
	}

	return { uploaded, failed, skipped };
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
