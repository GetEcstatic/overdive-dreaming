// Seed Historical Training Logs
// Generates realistic training data spanning several months for testing analytics
//
// Usage: npm run seed:logs -- YOUR_USER_ID
// Example: npm run seed:logs -- abc123xyz456

import { initializeApp } from 'firebase/app';
import {
	getFirestore,
	collection,
	doc,
	setDoc,
	Timestamp,
	serverTimestamp
} from 'firebase/firestore';
import type { RoutineLog, Discipline, TimeOfDay } from '../src/lib/types';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

// Initialize Firebase
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

// ============================================================================
// CONFIGURATION
// ============================================================================

interface TrainingSession {
	date: Date;
	routineId: string;
	discipline: Discipline;
	timeOfDay: TimeOfDay;
	data: Partial<RoutineLog>;
}

// Helper to get random element from array
const random = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// Helper to get random number in range
const randomInt = (min: number, max: number): number =>
	Math.floor(Math.random() * (max - min + 1)) + min;

// Helper to add variance to a baseline value
const withVariance = (base: number, variance: number): number => {
	const change = base * variance * (Math.random() * 2 - 1); // -variance to +variance
	return Math.round(base + change);
};

// ============================================================================
// DATA GENERATORS
// ============================================================================

// Generate progressive DYN max attempts
function generateDYNMaxAttempts(
	startDate: Date,
	sessions: number,
	userId: string
): TrainingSession[] {
	const results: TrainingSession[] = [];
	let baseDistance = 75; // Starting PB: 75m
	const improvementRate = 0.02; // 2% improvement per session on average

	for (let i = 0; i < sessions; i++) {
		// Schedule sessions roughly every 10-14 days
		const daysOffset = i * randomInt(10, 14);
		const sessionDate = new Date(startDate);
		sessionDate.setDate(sessionDate.getDate() - daysOffset);

		// Gradual improvement with variance
		baseDistance = Math.round(baseDistance * (1 + improvementRate * Math.random()));
		const distance = withVariance(baseDistance, 0.08); // ±8% variance

		const timeOfDay = random<TimeOfDay>(['morning', 'afternoon', 'evening']);

		results.push({
			date: sessionDate,
			routineId: 'system-dynamic-max',
			discipline: 'DYN',
			timeOfDay,
			data: {
				userId,
				disciplineUsed: 'DYN',
				poolLength: 25,
				totalDistance: distance,
				totalTime: Math.round(distance * 1.5), // ~1.5 sec per meter
				initialBreatheUpTime: randomInt(90, 180),
				breathingTechnique: random(['tidal', 'hyperventilation', 'hypoventilation']),
				rpe: randomInt(7, 10),
				joyScale: randomInt(6, 10),
				hoursSinceLastMeal: randomInt(2, 5),
				notes: distance > baseDistance * 0.95 ? 'Good session, felt strong' : undefined
			}
		});
	}

	return results;
}

// Generate DNF max attempts
function generateDNFMaxAttempts(
	startDate: Date,
	sessions: number,
	userId: string
): TrainingSession[] {
	const results: TrainingSession[] = [];
	let baseDistance = 50; // Starting PB: 50m DNF
	const improvementRate = 0.015; // 1.5% improvement

	for (let i = 0; i < sessions; i++) {
		const daysOffset = i * randomInt(12, 16);
		const sessionDate = new Date(startDate);
		sessionDate.setDate(sessionDate.getDate() - daysOffset);

		baseDistance = Math.round(baseDistance * (1 + improvementRate * Math.random()));
		const distance = withVariance(baseDistance, 0.1);

		results.push({
			date: sessionDate,
			routineId: 'system-dynamic-max',
			discipline: 'DNF',
			timeOfDay: random<TimeOfDay>(['morning', 'afternoon', 'evening']),
			data: {
				userId,
				disciplineUsed: 'DNF',
				poolLength: 25,
				totalDistance: distance,
				totalTime: Math.round(distance * 2), // ~2 sec per meter (slower than DYN)
				initialBreatheUpTime: randomInt(90, 180),
				breathingTechnique: random(['tidal', 'hyperventilation']),
				rpe: randomInt(7, 10),
				joyScale: randomInt(5, 9),
				hoursSinceLastMeal: randomInt(2, 5)
			}
		});
	}

	return results;
}

// Generate DYNB max attempts
function generateDYNBMaxAttempts(
	startDate: Date,
	sessions: number,
	userId: string
): TrainingSession[] {
	const results: TrainingSession[] = [];
	let baseDistance = 65; // Starting PB: 65m DYNB

	for (let i = 0; i < sessions; i++) {
		const daysOffset = i * randomInt(14, 20);
		const sessionDate = new Date(startDate);
		sessionDate.setDate(sessionDate.getDate() - daysOffset);

		baseDistance = Math.round(baseDistance * (1 + 0.018 * Math.random()));
		const distance = withVariance(baseDistance, 0.09);

		results.push({
			date: sessionDate,
			routineId: 'system-dynamic-max',
			discipline: 'DYNB',
			timeOfDay: random<TimeOfDay>(['morning', 'afternoon', 'evening']),
			data: {
				userId,
				disciplineUsed: 'DYNB',
				poolLength: 25,
				totalDistance: distance,
				totalTime: Math.round(distance * 1.6),
				initialBreatheUpTime: randomInt(90, 180),
				breathingTechnique: random(['tidal', 'hyperventilation']),
				rpe: randomInt(7, 10),
				joyScale: randomInt(6, 9),
				hoursSinceLastMeal: randomInt(2, 5)
			}
		});
	}

	return results;
}

// Generate STA max attempts
function generateSTAMaxAttempts(
	startDate: Date,
	sessions: number,
	userId: string
): TrainingSession[] {
	const results: TrainingSession[] = [];
	let baseTime = 150; // Starting PB: 2:30

	for (let i = 0; i < sessions; i++) {
		const daysOffset = i * randomInt(10, 14);
		const sessionDate = new Date(startDate);
		sessionDate.setDate(sessionDate.getDate() - daysOffset);

		baseTime = Math.round(baseTime * (1 + 0.025 * Math.random())); // 2.5% improvement
		const time = withVariance(baseTime, 0.08);

		results.push({
			date: sessionDate,
			routineId: 'system-static-max',
			discipline: 'STA',
			timeOfDay: random<TimeOfDay>(['morning', 'afternoon', 'evening']),
			data: {
				userId,
				disciplineUsed: 'STA',
				totalTime: time,
				initialBreatheUpTime: randomInt(120, 240),
				breathingTechnique: random(['tidal', 'hyperventilation', 'hypoventilation']),
				rpe: randomInt(7, 10),
				joyScale: randomInt(6, 10),
				hoursSinceLastMeal: randomInt(2, 6),
				notes: time > baseTime * 0.95 ? 'Personal best!' : undefined
			}
		});
	}

	return results;
}

// Generate Sweet 16 interval sessions
function generateSweet16Sessions(
	startDate: Date,
	sessions: number,
	userId: string
): TrainingSession[] {
	const results: TrainingSession[] = [];

	for (let i = 0; i < sessions; i++) {
		const daysOffset = i * randomInt(7, 10);
		const sessionDate = new Date(startDate);
		sessionDate.setDate(sessionDate.getDate() - daysOffset);

		const discipline = random<Discipline>(['DYN', 'DNF', 'DYNB']);
		const repsCompleted = randomInt(12, 16); // Sometimes don't complete all 16
		const avgTimePerRep = randomInt(40, 55); // 40-55 sec per 50m rep

		results.push({
			date: sessionDate,
			routineId: 'system-sweet-16',
			discipline,
			timeOfDay: random<TimeOfDay>(['morning', 'afternoon', 'evening']),
			data: {
				userId,
				disciplineUsed: discipline,
				poolLength: 25,
				repsCompleted,
				totalTime: repsCompleted * avgTimePerRep,
				initialBreatheUpTime: randomInt(60, 120),
				rpe: randomInt(6, 9),
				joyScale: randomInt(5, 8),
				hoursSinceLastMeal: randomInt(2, 5),
				notes: repsCompleted === 16 ? 'Completed all reps!' : undefined
			}
		});
	}

	return results;
}

// Generate Gentle 2-Breath static sessions
function generateGentle2BreathSessions(
	startDate: Date,
	sessions: number,
	userId: string
): TrainingSession[] {
	const results: TrainingSession[] = [];

	for (let i = 0; i < sessions; i++) {
		const daysOffset = i * randomInt(5, 8);
		const sessionDate = new Date(startDate);
		sessionDate.setDate(sessionDate.getDate() - daysOffset);

		const repsCompleted = randomInt(8, 10);
		const repDuration = randomInt(75, 95); // 1:15 to 1:35 per rep

		results.push({
			date: sessionDate,
			routineId: 'system-gentle-2-breath',
			discipline: 'STA',
			timeOfDay: random<TimeOfDay>(['morning', 'afternoon', 'evening']),
			data: {
				userId,
				disciplineUsed: 'STA',
				repsCompleted,
				repDuration,
				initialBreatheUpTime: randomInt(60, 120),
				breathingTechnique: random(['tidal', 'hypoventilation']),
				rpe: randomInt(4, 7),
				joyScale: randomInt(6, 9),
				hoursSinceLastMeal: randomInt(2, 5),
				notes: 'Easy recovery session'
			}
		});
	}

	return results;
}

// ============================================================================
// MAIN SEED FUNCTION
// ============================================================================

async function seedHistoricalLogs(userId: string) {
	console.log('\n🌱 Generating historical training data...\n');
	console.log(`User ID: ${userId}\n`);
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

	const now = new Date();
	const allSessions: TrainingSession[] = [];

	// Generate different types of training data
	console.log('📊 Generating sessions...');

	// Max attempts (fewer, more spread out)
	allSessions.push(...generateDYNMaxAttempts(now, 8, userId));
	console.log('  ✅ DYN max attempts: 8 sessions');

	allSessions.push(...generateDNFMaxAttempts(now, 6, userId));
	console.log('  ✅ DNF max attempts: 6 sessions');

	allSessions.push(...generateDYNBMaxAttempts(now, 5, userId));
	console.log('  ✅ DYNB max attempts: 5 sessions');

	allSessions.push(...generateSTAMaxAttempts(now, 8, userId));
	console.log('  ✅ STA max attempts: 8 sessions');

	// Interval training (more frequent)
	allSessions.push(...generateSweet16Sessions(now, 12, userId));
	console.log('  ✅ Sweet 16 sessions: 12 sessions');

	allSessions.push(...generateGentle2BreathSessions(now, 15, userId));
	console.log('  ✅ Gentle 2-Breath sessions: 15 sessions\n');

	// Sort by date (newest first)
	allSessions.sort((a, b) => b.date.getTime() - a.date.getTime());

	console.log(`📝 Total sessions to create: ${allSessions.length}\n`);
	console.log('💾 Writing to Firestore...\n');

	// Write to Firestore
	let count = 0;
	for (const session of allSessions) {
		const logRef = doc(collection(db, 'routineLogs'));

		const logData: any = {
			routineId: session.routineId,
			userId: session.data.userId!,
			date: Timestamp.fromDate(session.date),
			disciplineUsed: session.discipline,
			timeOfDay: session.timeOfDay,
			...session.data
		};

		// Remove undefined values (Firestore doesn't allow them)
		Object.keys(logData).forEach((key) => {
			if (logData[key] === undefined) {
				delete logData[key];
			}
		});

		await setDoc(logRef, logData);
		count++;

		if (count % 10 === 0) {
			console.log(`  ⏳ Progress: ${count}/${allSessions.length} sessions`);
		}
	}

	console.log(`  ✅ Complete: ${count}/${allSessions.length} sessions\n`);
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
	console.log('✨ Historical data seeded successfully!\n');
	console.log('📈 Date range:');
	console.log(`  Oldest: ${allSessions[allSessions.length - 1].date.toLocaleDateString()}`);
	console.log(`  Newest: ${allSessions[0].date.toLocaleDateString()}\n`);
	console.log('📊 Analytics breakdown:');
	console.log(
		`  DYN: ${allSessions.filter((s) => s.discipline === 'DYN').length} sessions`
	);
	console.log(
		`  DNF: ${allSessions.filter((s) => s.discipline === 'DNF').length} sessions`
	);
	console.log(
		`  DYNB: ${allSessions.filter((s) => s.discipline === 'DYNB').length} sessions`
	);
	console.log(
		`  STA: ${allSessions.filter((s) => s.discipline === 'STA').length} sessions\n`
	);
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
	const userId = process.argv[2];

	if (!userId) {
		console.error('\n❌ Error: User ID required');
		console.error('\nUsage: npm run seed:logs -- YOUR_USER_ID');
		console.error('\nTo find your User ID:');
		console.error('  1. Sign in to the app');
		console.error('  2. Open browser console');
		console.error('  3. Run: firebase.auth().currentUser.uid\n');
		process.exit(1);
	}

	try {
		await seedHistoricalLogs(userId);
		console.log('🚀 You can now view analytics with historical data!\n');
		process.exit(0);
	} catch (error) {
		console.error('\n❌ Error seeding historical logs:', error);
		process.exit(1);
	}
}

main();
