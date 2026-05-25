/**
 * Migration Script: Preserve full beta access for existing users.
 *
 * Existing users had access to the full app before public mode existed. This
 * migration stamps user documents that do not yet have settings.publicModeAccess
 * with "advanced" so new public-mode defaults only apply to new users.
 *
 * Usage:
 *   npm run migrate:public-mode-access:dry
 *   npm run migrate:public-mode-access
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!serviceAccountPath) {
	console.error('ERROR: GOOGLE_APPLICATION_CREDENTIALS environment variable not set');
	console.error('Set it to the path of your Firebase service account JSON file');
	process.exit(1);
}

initializeApp({ credential: cert(serviceAccountPath) });

const db = getFirestore();
const isDryRun = process.argv.includes('--dry-run');

type MigrationStats = {
	scanned: number;
	wouldUpdate: number;
	updated: number;
	skipped: number;
};

async function migrate(): Promise<MigrationStats> {
	const stats: MigrationStats = { scanned: 0, wouldUpdate: 0, updated: 0, skipped: 0 };
	const snapshot = await db.collection('users').get();
	const batch = db.batch();
	let pendingWrites = 0;

	for (const userDoc of snapshot.docs) {
		stats.scanned += 1;
		const settings = userDoc.data().settings as { publicModeAccess?: string } | undefined;
		if (settings?.publicModeAccess) {
			stats.skipped += 1;
			continue;
		}

		stats.wouldUpdate += 1;
		console.log(`${isDryRun ? 'Would grant' : 'Granting'} advanced access: ${userDoc.id}`);
		if (!isDryRun) {
			batch.set(userDoc.ref, {
				settings: { publicModeAccess: 'advanced' },
				updatedAt: FieldValue.serverTimestamp()
			}, { merge: true });
			pendingWrites += 1;
		}
	}

	if (!isDryRun && pendingWrites > 0) {
		await batch.commit();
		stats.updated = pendingWrites;
	}

	return stats;
}

migrate()
	.then((stats) => {
		console.log('\nPublic mode access migration complete');
		console.log(JSON.stringify(stats, null, 2));
	})
	.catch((error) => {
		console.error('Public mode access migration failed:', error);
		process.exit(1);
	});