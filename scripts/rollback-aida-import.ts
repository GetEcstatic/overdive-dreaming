// Roll back AIDA imports for a user.
// Usage: npm run rollback:aida -- USER_ID [--commit]

import { initializeApp } from 'firebase/app';
import {
	getFirestore,
	collection,
	getDocs,
	query,
	where,
	writeBatch
} from 'firebase/firestore';
import dotenv from 'dotenv';

dotenv.config();

const userId = process.argv[2];
const commit = process.argv.includes('--commit');

if (!userId) {
	console.error('Missing user ID. Usage: npm run rollback:aida -- USER_ID [--commit]');
	process.exit(1);
}

const firebaseConfig = {
	apiKey: process.env.PUBLIC_FIREBASE_API_KEY,
	authDomain: process.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
	projectId: process.env.PUBLIC_FIREBASE_PROJECT_ID,
	storageBucket: process.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
	messagingSenderId: process.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
	appId: process.env.PUBLIC_FIREBASE_APP_ID,
	measurementId: process.env.PUBLIC_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
	const logsRef = collection(db, 'routineLogs');
	const logsQuery = query(
		logsRef,
		where('userId', '==', userId),
		where('isCompetition', '==', true),
		where('compeitionOrg', '==', 'AIDA')
	);

	const snapshot = await getDocs(logsQuery);

	if (snapshot.empty) {
		console.log('No AIDA competition logs found for this user.');
		return;
	}

	console.log(`Found ${snapshot.size} AIDA competition logs for user ${userId}.`);

	const preview = snapshot.docs.slice(0, 5).map((docSnap) => {
		const data = docSnap.data();
		const date = data.date?.toDate?.()?.toISOString?.() ?? 'unknown date';
		return `${docSnap.id} (${date})`;
	});

	console.log('Sample docs:');
	preview.forEach((line) => console.log(`  - ${line}`));

	if (!commit) {
		console.log('Dry run only. Re-run with --commit to delete these logs.');
		return;
	}

	let deleted = 0;
	const docs = snapshot.docs;

	for (let i = 0; i < docs.length; i += 500) {
		const batch = writeBatch(db);
		docs.slice(i, i + 500).forEach((docSnap) => batch.delete(docSnap.ref));
		await batch.commit();
		deleted += Math.min(500, docs.length - i);
	}

	console.log(`Deleted ${deleted} AIDA competition logs.`);
}

run().catch((error) => {
	console.error('Rollback failed:', error);
	process.exit(1);
});
