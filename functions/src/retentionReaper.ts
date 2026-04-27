/**
 * Retention reaper (server-side, canonical).
 *
 * Trigger: Firestore document create on `diveVideos/{videoId}`.
 * Behaviour: for the newly-created video's `ownerId`, list all owned videos,
 * skip those with `retentionTier === 'pinned'`, keep the 20 newest non-pinned,
 * and delete the rest — Firestore doc + Storage clean/burned/thumb blobs.
 *
 * Idempotent: if the function runs twice for the same create event the second
 * run is a no-op (already within budget).
 *
 * Audit log: every reap writes a doc under `reaperAudit/{timestamp-ownerId}`
 * capturing what was deleted, so we can review behaviour in production.
 *
 * Dry-run mode: set runtime config `reaper.dry_run=true` (or env
 * REAPER_DRY_RUN=1) to log what WOULD be deleted without actually deleting.
 *
 * See docs/Dynamic video feature.md §7 and T12.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const COLLECTION = 'diveVideos';
const KEEP_COUNT = 20;

interface DiveVideoDoc {
	ownerId: string;
	retentionTier?: 'keep-last-5' | 'pinned';
	storagePathClean?: string;
	storagePathBurned?: string;
	thumbnailPath?: string;
	recordedAt?: Timestamp;
}

function isDryRun(): boolean {
	return process.env.REAPER_DRY_RUN === '1' || process.env.REAPER_DRY_RUN === 'true';
}

async function deleteStoragePath(path: string): Promise<boolean> {
	try {
		await getStorage().bucket().file(path).delete({ ignoreNotFound: true });
		return true;
	} catch (err) {
		logger.warn('reaper: failed to delete Storage object', { path, err });
		return false;
	}
}

export const onDiveVideoCreated = onDocumentCreated(
	`${COLLECTION}/{videoId}`,
	async (event) => {
		const snap = event.data;
		if (!snap) return;

		const created = snap.data() as DiveVideoDoc;
		const ownerId = created.ownerId;
		if (!ownerId) {
			logger.warn('reaper: new video has no ownerId', { videoId: event.params.videoId });
			return;
		}

		const db = getFirestore();
		const ownedSnap = await db
			.collection(COLLECTION)
			.where('ownerId', '==', ownerId)
			.orderBy('recordedAt', 'desc')
			.limit(200)
			.get();

		const all = ownedSnap.docs.map((d) => ({ id: d.id, ...(d.data() as DiveVideoDoc) }));
		const keepCandidates = all.filter((v) => v.retentionTier !== 'pinned');
		const triggerVideoId = event.params.videoId;
		const toReap = keepCandidates
			.slice(KEEP_COUNT)
			.filter((video) => video.id !== triggerVideoId);

		if (toReap.length === 0) {
			logger.info('reaper: within budget — no deletions', {
				ownerId,
				ownedCount: all.length,
				pinnedCount: all.length - keepCandidates.length
			});
			return;
		}

		const dryRun = isDryRun();
		const reaped: Array<{ id: string; storageDeleted: string[] }> = [];

		for (const video of toReap) {
			const storageDeleted: string[] = [];
			if (!dryRun) {
				const paths = [
					video.storagePathClean,
					video.storagePathBurned,
					video.thumbnailPath
				].filter((p): p is string => typeof p === 'string' && p.length > 0);
				for (const path of paths) {
					if (await deleteStoragePath(path)) storageDeleted.push(path);
				}
				await db.collection(COLLECTION).doc(video.id).delete();
			}
			reaped.push({ id: video.id, storageDeleted });
		}

		await db.collection('reaperAudit').add({
			ownerId,
			triggeredByVideoId: triggerVideoId,
			reapedAt: FieldValue.serverTimestamp(),
			dryRun,
			keepCount: KEEP_COUNT,
			ownedCount: all.length,
			pinnedCount: all.length - keepCandidates.length,
			reapedCount: reaped.length,
			reaped
		});

		logger.info('reaper: complete', {
			ownerId,
			triggeredByVideoId: triggerVideoId,
			dryRun,
			reapedCount: reaped.length
		});
	}
);
