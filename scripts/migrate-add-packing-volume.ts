/**
 * Migration Script: Enable Packing Volume tracking on all existing routines
 *
 * Sets `trackingConfig.trackPackingVolume = true` on every routine document
 * (system + user custom) so that existing routines retrospectively get the
 * new metric switched ON.
 *
 * RUN BACKUP FIRST: npm run backup
 *
 * Usage:
 *   npm run migrate:packing-volume
 *   npm run migrate:packing-volume:dry
 *
 *   (Or directly: tsx scripts/migrate-add-packing-volume.ts [--dry-run])
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import type { RoutineTemplate } from '../src/lib/types';

// Initialize Firebase Admin
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!serviceAccountPath) {
	console.error('ERROR: GOOGLE_APPLICATION_CREDENTIALS environment variable not set');
	console.error('Set it to the path of your Firebase service account JSON file');
	process.exit(1);
}

const app = initializeApp({
	credential: cert(serviceAccountPath)
});

const db = getFirestore(app);

const isDryRun = process.argv.includes('--dry-run');
if (isDryRun) {
	console.log('🔍 DRY RUN MODE - No changes will be made to Firestore\n');
}

async function migrate(): Promise<{ updated: number; skipped: number; errors: number }> {
	console.log('\n📋 Enabling trackPackingVolume on all routines...\n');

	let updated = 0;
	let skipped = 0;
	let errors = 0;

	try {
		const routinesSnapshot = await db.collection('routines').get();

		for (const routineDoc of routinesSnapshot.docs) {
			try {
				const routine = routineDoc.data() as RoutineTemplate;
				const current = routine.trackingConfig?.trackPackingVolume;

				if (current === true) {
					console.log(`  ⏭  ${routine.name}: already enabled`);
					skipped++;
					continue;
				}

				console.log(`  → ${routine.name} (${routine.createdBy}): enabling trackPackingVolume`);

				if (!isDryRun) {
					await db.collection('routines').doc(routineDoc.id).update({
						'trackingConfig.trackPackingVolume': true,
						updatedAt: Timestamp.now()
					});
				}

				updated++;
			} catch (err) {
				console.error(`  ✗ Error updating ${routineDoc.id}:`, err);
				errors++;
			}
		}
	} catch (err) {
		console.error('Error reading routines collection:', err);
		throw err;
	}

	return { updated, skipped, errors };
}

(async () => {
	try {
		const result = await migrate();
		console.log('\n✅ Migration complete');
		console.log(`   Updated: ${result.updated}`);
		console.log(`   Skipped: ${result.skipped}`);
		console.log(`   Errors:  ${result.errors}`);
		if (isDryRun) {
			console.log('\n(dry-run — no writes performed)');
		}
		process.exit(result.errors > 0 ? 1 : 0);
	} catch (err) {
		console.error('Migration failed:', err);
		process.exit(1);
	}
})();
