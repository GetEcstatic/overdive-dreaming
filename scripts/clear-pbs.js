// Clear Personal Bests Script
// Run with: node scripts/clear-pbs.js

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, deleteField } from 'firebase/firestore';

// Firebase config from environment
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

async function clearAllPBs() {
	try {
		console.log('Fetching all users...');
		const usersRef = collection(db, 'users');
		const usersSnapshot = await getDocs(usersRef);

		console.log(`Found ${usersSnapshot.size} users`);

		for (const userDoc of usersSnapshot.docs) {
			const userId = userDoc.id;
			const userData = userDoc.data();

			if (userData.personalBests) {
				console.log(`Clearing PBs for user: ${userData.displayName || userId}`);
				const userRef = doc(db, 'users', userId);
				await updateDoc(userRef, {
					personalBests: deleteField()
				});
				console.log(`✓ Cleared PBs for ${userData.displayName || userId}`);
			} else {
				console.log(`- No PBs found for ${userData.displayName || userId}`);
			}
		}

		console.log('\n✅ All PBs cleared successfully!');
		process.exit(0);
	} catch (error) {
		console.error('❌ Error clearing PBs:', error);
		process.exit(1);
	}
}

clearAllPBs();
