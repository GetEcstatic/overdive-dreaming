// Backfill public profiles for community feed
// Usage: tsx scripts/backfill-public-profiles.ts [--dry-run]

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

const usersSnap = await db.collection('users').get();
const authUsers = new Map<string, { displayName?: string; photoURL?: string }>();

let nextPageToken: string | undefined = undefined;
do {
	const result = await admin.auth().listUsers(1000, nextPageToken);
	for (const user of result.users) {
		if (user.displayName || user.photoURL) {
			authUsers.set(user.uid, {
				displayName: user.displayName ?? undefined,
				photoURL: user.photoURL ?? undefined
			});
		}
	}
	nextPageToken = result.pageToken;
} while (nextPageToken);

let updated = 0;
let skipped = 0;

for (const doc of usersSnap.docs) {
	const data = doc.data();
	const authProfile = authUsers.get(doc.id);
	const rawName =
		typeof authProfile?.displayName === 'string'
			? authProfile.displayName.trim()
			: typeof data.displayName === 'string'
				? data.displayName.trim()
				: '';
	const displayName = rawName || 'Diver';
	const rawPhoto =
		typeof authProfile?.photoURL === 'string'
			? authProfile.photoURL.trim()
			: typeof data.photoURL === 'string'
				? data.photoURL.trim()
				: '';
	const photoURL = rawPhoto || null;

	if (dryRun) {
		console.log(`[dry-run] ${doc.id}: ${displayName}${photoURL ? ' (photo)' : ''}`);
		skipped += 1;
		continue;
	}

	await db.collection('usersPublic').doc(doc.id).set(
		{
			userId: doc.id,
			displayName,
			photoURL,
			updatedAt: admin.firestore.FieldValue.serverTimestamp()
		},
		{ merge: true }
	);

	updated += 1;
}

console.log(`Public profile backfill complete. Updated: ${updated}, Dry-run: ${skipped}`);
