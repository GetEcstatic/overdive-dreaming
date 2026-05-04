// Backfill routineLogId onto existing diveVideos whose sessionId already
// points at a routineLogs document.
// Usage: tsx scripts/backfill-dive-video-routine-logs.ts [--dry-run]

import dotenv from 'dotenv';
import admin from 'firebase-admin';

dotenv.config();

if (!admin.apps.length) {
	admin.initializeApp({
		projectId: process.env.PUBLIC_FIREBASE_PROJECT_ID
	});
}

const db = admin.firestore();
const dryRun = process.argv.includes('--dry-run');

interface DiveVideoDoc {
	sessionId?: unknown;
	routineLogId?: unknown;
}

let checked = 0;
let updated = 0;
let skippedAlreadyLinked = 0;
let skippedNoSessionId = 0;
let skippedNoRoutineLog = 0;

const videosSnap = await db.collection('diveVideos').get();

for (const videoDoc of videosSnap.docs) {
	checked += 1;
	const video = videoDoc.data() as DiveVideoDoc;

	if (typeof video.routineLogId === 'string' && video.routineLogId.trim().length > 0) {
		skippedAlreadyLinked += 1;
		continue;
	}

	if (typeof video.sessionId !== 'string' || video.sessionId.trim().length === 0) {
		skippedNoSessionId += 1;
		continue;
	}

	const routineLogId = video.sessionId.trim();
	const routineLogSnap = await db.collection('routineLogs').doc(routineLogId).get();
	if (!routineLogSnap.exists) {
		skippedNoRoutineLog += 1;
		continue;
	}

	console.log(`${dryRun ? '[dry-run] ' : ''}${videoDoc.id}: routineLogId <- ${routineLogId}`);

	if (!dryRun) {
		await videoDoc.ref.update({
			routineLogId,
			updatedAt: admin.firestore.FieldValue.serverTimestamp()
		});
	}

	updated += 1;
}

console.log('Dive video routineLogId backfill complete');
console.log(`  Checked:              ${checked}`);
console.log(`  Updated:              ${updated}${dryRun ? ' (dry-run)' : ''}`);
console.log(`  Already linked:       ${skippedAlreadyLinked}`);
console.log(`  Missing sessionId:    ${skippedNoSessionId}`);
console.log(`  No matching log:      ${skippedNoRoutineLog}`);