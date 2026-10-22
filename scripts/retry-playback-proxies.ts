// Re-queue the 720p playback proxy for uploaded dive videos that have none
// because the job failed (until 22 Oct 2026, iPhone spatial-audio tracks made
// every proxy job fail). Jobs run one at a time: the general media worker has a
// single instance. When a proxy lands, the worker also queues the reel.
// Usage: tsx scripts/retry-playback-proxies.ts [--dry-run] [--limit N]

import dotenv from 'dotenv';
import admin from 'firebase-admin';

dotenv.config();

if (!admin.apps.length) {
	admin.initializeApp({
		projectId: process.env.PUBLIC_FIREBASE_PROJECT_ID ?? 'overdive-dreaming-fb'
	});
}

const db = admin.firestore();
const { FieldValue } = admin.firestore;
const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.indexOf('--limit');
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;
const JOB_TYPE = 'generate-playback-proxy';
const WAIT_MS = 9 * 60 * 1000;

interface VideoDoc {
	ownerId?: string;
	userId?: string;
	uploadStatus?: string;
	sizeBytes?: number;
	processingState?: { playbackProxy?: string };
	artifacts?: { kind?: string }[];
}

function needsProxy(video: VideoDoc): boolean {
	if (video.uploadStatus !== 'uploaded') return false;
	if (video.artifacts?.some((artifact) => artifact.kind === 'playback-proxy')) return false;
	const state = video.processingState?.playbackProxy;
	return state === 'retryable' || state === 'failed';
}

async function waitForJob(jobId: string): Promise<string> {
	const deadline = Date.now() + WAIT_MS;
	for (;;) {
		const status = (await db.collection('mediaProcessingJobs').doc(jobId).get()).data()?.status as string | undefined;
		if (status === 'ready' || status === 'retryable' || status === 'failed') return status;
		if (Date.now() > deadline) return `still ${status ?? 'missing'}`;
		await new Promise((resolve) => setTimeout(resolve, 10_000));
	}
}

const snap = await db.collection('diveVideos').get();
const targets = snap.docs.filter((doc) => needsProxy(doc.data() as VideoDoc)).slice(0, limit);
console.log(`${snap.size} videos checked; ${targets.length} need a playback proxy${dryRun ? ' (dry run)' : ''}`);

let ready = 0;
let failed = 0;
for (const doc of targets) {
	const video = doc.data() as VideoDoc;
	const ownerId = video.ownerId ?? video.userId;
	const sizeMb = Math.round((video.sizeBytes ?? 0) / 1e6);
	if (!ownerId) {
		console.log(`  ${doc.id}: no owner, skipped`);
		continue;
	}
	if (dryRun) {
		console.log(`  ${doc.id}: would re-queue (${sizeMb} MB, owner ${ownerId})`);
		continue;
	}
	const jobId = `${doc.id}_${JOB_TYPE}`;
	const jobRef = db.collection('mediaProcessingJobs').doc(jobId);
	// The worker runs on document creation, so replace the failed job rather than update it.
	await jobRef.delete();
	await doc.ref.update({
		'processingState.playbackProxy': 'queued',
		'processingState.pendingJobs': FieldValue.arrayUnion(JOB_TYPE),
		updatedAt: FieldValue.serverTimestamp()
	});
	await jobRef.create({
		videoId: doc.id,
		ownerId,
		type: JOB_TYPE,
		status: 'queued',
		attempts: 0,
		createdAt: FieldValue.serverTimestamp(),
		updatedAt: FieldValue.serverTimestamp()
	});
	const status = await waitForJob(jobId);
	if (status === 'ready') ready += 1;
	else failed += 1;
	console.log(`  ${doc.id}: ${status} (${sizeMb} MB)`);
}

if (!dryRun) console.log(`Done: ${ready} ready, ${failed} not ready`);
process.exit(0);
