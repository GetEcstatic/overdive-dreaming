import { FieldValue, getFirestore } from 'firebase-admin/firestore';

export type DiveVideoProcessingJob =
	| 'probe-master'
	| 'generate-thumbnail'
	| 'generate-playback-proxy'
	| 'generate-overlay-preview'
	| 'generate-overlay-download';

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

export function mediaProcessingJobId(videoId: string, type: DiveVideoProcessingJob): string {
	return `${videoId}_${type}`;
}

export async function enqueueUploadProcessingJobs(args: {
	videoId: string;
	ownerId: string;
}): Promise<void> {
	const db = getFirestore();
	const refs = LIGHTWEIGHT_UPLOAD_JOBS.map((type) =>
		db.collection('mediaProcessingJobs').doc(mediaProcessingJobId(args.videoId, type))
	);
	const existingSnaps = await db.getAll(...refs);
	const batch = db.batch();
	for (let index = 0; index < LIGHTWEIGHT_UPLOAD_JOBS.length; index += 1) {
		const snap = existingSnaps[index];
		if (snap.exists) continue;
		const type = LIGHTWEIGHT_UPLOAD_JOBS[index];
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