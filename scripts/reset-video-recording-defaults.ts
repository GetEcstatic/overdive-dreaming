/**
 * Migration Script: reset every user's saved dive video resolution and quality.
 *
 * The recorder used to save the last-used resolution/quality after every
 * capture, so most users have 720p/high stored without having chosen it.
 * Deleting the fields makes them follow the app default (1080p standard,
 * `recordingVideoSettings`). Users can choose again in Profile.
 *
 * Usage:
 *   npm run migrate:video-defaults:dry
 *   npm run migrate:video-defaults
 */

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import 'dotenv/config';

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const projectId = process.env.FIREBASE_PROJECT_ID
	?? process.env.PUBLIC_FIREBASE_PROJECT_ID
	?? process.env.GCLOUD_PROJECT
	?? process.env.GOOGLE_CLOUD_PROJECT;

initializeApp({
	credential: serviceAccountPath ? cert(serviceAccountPath) : applicationDefault(),
	projectId
});

const db = getFirestore();
const isDryRun = process.argv.includes('--dry-run');
const BATCH_LIMIT = 400;

async function migrate(): Promise<void> {
	const snapshot = await db.collection('users').get();
	const targets = snapshot.docs.filter((userDoc) => {
		const settings = userDoc.data().settings as Record<string, unknown> | undefined;
		return settings?.defaultVideoResolution !== undefined || settings?.defaultVideoQualityPreset !== undefined;
	});

	for (const userDoc of targets) {
		const settings = userDoc.data().settings as Record<string, unknown>;
		console.log(
			`${isDryRun ? 'Would reset' : 'Resetting'} ${userDoc.id}: ${settings.defaultVideoResolution ?? '-'} / ${settings.defaultVideoQualityPreset ?? '-'}`
		);
	}

	if (!isDryRun) {
		for (let i = 0; i < targets.length; i += BATCH_LIMIT) {
			const batch = db.batch();
			for (const userDoc of targets.slice(i, i + BATCH_LIMIT)) {
				batch.update(userDoc.ref, {
					'settings.defaultVideoResolution': FieldValue.delete(),
					'settings.defaultVideoQualityPreset': FieldValue.delete(),
					updatedAt: FieldValue.serverTimestamp()
				});
			}
			await batch.commit();
		}
	}

	console.log(
		`\nScanned ${snapshot.size} users; ${isDryRun ? 'would reset' : 'reset'} ${targets.length}.${isDryRun ? ' (dry run, nothing written)' : ''}`
	);
}

migrate().catch((err) => {
	console.error(err);
	process.exit(1);
});
