import { FieldValue, getFirestore } from 'firebase-admin/firestore';

export type DiveVideoProcessingJob =
	| 'probe-master'
	| 'generate-thumbnail'
	| 'generate-playback-proxy'
	| 'generate-overlay-preview'
	| 'generate-overlay-download'
	| 'generate-social-cut';

export type DiveVideoProcessingStatus =
	| 'not-requested'
	| 'queued'
	| 'processing'
	| 'ready'
	| 'failed'
	| 'retryable';

export interface DiveVideoProcessingState {
	master: DiveVideoProcessingStatus;
	thumbnail: DiveVideoProcessingStatus;
	playbackProxy: DiveVideoProcessingStatus;
	overlayPreview: DiveVideoProcessingStatus;
	overlayDownload: DiveVideoProcessingStatus;
	socialCut?: DiveVideoProcessingStatus;
	socialCutKey?: string;
	/** 0–1 while the reel renders; also its heartbeat. */
	socialCutProgress?: number;
	pendingJobs?: DiveVideoProcessingJob[];
	lastError?: string;
	lastErrorAt?: FirebaseFirestore.FieldValue;
}

export interface MediaProcessingJobPayload {
	videoId: string;
	ownerId: string;
	type: DiveVideoProcessingJob;
	status: Extract<DiveVideoProcessingStatus, 'queued' | 'processing' | 'ready' | 'failed' | 'retryable'>;
	attempts: number;
	createdAt: FirebaseFirestore.FieldValue;
	updatedAt: FirebaseFirestore.FieldValue;
	claimedAt?: FirebaseFirestore.FieldValue;
	completedAt?: FirebaseFirestore.FieldValue;
	lastError?: string;
}

const LIGHTWEIGHT_UPLOAD_JOBS: DiveVideoProcessingJob[] = [
	'probe-master',
	'generate-thumbnail',
	'generate-playback-proxy',
	'generate-overlay-download'
];

export function uploadedDiveVideoProcessingState(): DiveVideoProcessingState {
	return {
		master: 'ready',
		thumbnail: 'queued',
		playbackProxy: 'queued',
		overlayPreview: 'not-requested',
		overlayDownload: 'queued',
		pendingJobs: LIGHTWEIGHT_UPLOAD_JOBS
	};
}

/**
 * Queued (state "queued") at upload but created only when the playback proxy
 * job finishes, so the export renders from the proxy rather than a 4K original.
 */
const AFTER_PROXY_UPLOAD_JOBS: readonly DiveVideoProcessingJob[] = ['generate-overlay-download'];

/**
 * The probe and thumbnail run inside the proxy job, from its one download of
 * the original; separate jobs each downloaded it again (about a minute each
 * for a 4K clip). Their job types remain for re-running one step on its own.
 */
const RUN_BY_PROXY_JOB: readonly DiveVideoProcessingJob[] = ['probe-master', 'generate-thumbnail'];

export function mediaProcessingJobId(videoId: string, type: DiveVideoProcessingJob): string {
	return `${videoId}_${type}`;
}

export async function enqueueUploadProcessingJobs(args: {
	videoId: string;
	ownerId: string;
}): Promise<void> {
	const db = getFirestore();
	const types = LIGHTWEIGHT_UPLOAD_JOBS.filter(
		(type) => !AFTER_PROXY_UPLOAD_JOBS.includes(type) && !RUN_BY_PROXY_JOB.includes(type)
	);
	const refs = types.map((type) =>
		db.collection('mediaProcessingJobs').doc(mediaProcessingJobId(args.videoId, type))
	);
	const existingSnaps = await db.getAll(...refs);
	const batch = db.batch();
	for (let index = 0; index < types.length; index += 1) {
		const snap = existingSnaps[index];
		if (snap.exists) continue;
		const type = types[index];
		const ref = refs[index];
		batch.set(
			ref,
			{
				videoId: args.videoId,
				ownerId: args.ownerId,
				type,
				status: 'queued',
				attempts: 0,
				createdAt: FieldValue.serverTimestamp(),
				updatedAt: FieldValue.serverTimestamp()
			} satisfies MediaProcessingJobPayload,
		);
	}
	await batch.commit();
}

/** Create the upload jobs that wait for the proxy. Idempotent: an existing job is left alone. */
export async function enqueueAfterProxyJobs(args: { videoId: string; ownerId: string }): Promise<void> {
	const db = getFirestore();
	await Promise.all(
		AFTER_PROXY_UPLOAD_JOBS.map((type) =>
			db
				.collection('mediaProcessingJobs')
				.doc(mediaProcessingJobId(args.videoId, type))
				.create({
					videoId: args.videoId,
					ownerId: args.ownerId,
					type,
					status: 'queued',
					attempts: 0,
					createdAt: FieldValue.serverTimestamp(),
					updatedAt: FieldValue.serverTimestamp()
				} satisfies MediaProcessingJobPayload)
				.catch((err: { code?: number }) => {
					// 6 = ALREADY_EXISTS
					if (err?.code !== 6) throw err;
				})
		)
	);
}