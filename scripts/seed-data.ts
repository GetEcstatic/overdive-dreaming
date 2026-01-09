// Seed Data Script
// Run this once to populate Firestore with default routines and config
//
// Usage: npm run seed (add this to package.json scripts)
// Or run directly: npx tsx scripts/seed-data.ts

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import type { RoutineTemplate, SuggestedTags, TrackingConfig } from '../src/lib/types';

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
// DEFAULT ROUTINE TRACKING CONFIGS
// ============================================================================

// Tracking for dynamic max attempts
const dynamicMaxTracking: TrackingConfig = {
	// Session context
	trackPoolLength: true,
	trackInitialBreatheUpTime: true,
	// Performance metrics
	trackTotalDistance: true,
	trackTotalTime: true,
	trackRepsCompleted: false,
	trackRepDuration: false,
	trackRepDistance: false,
	trackTimePerLap: true,
	trackRestBetweenLaps: false,
	trackKicksPerLap: true,
	trackArmPullsPerLap: true,
	// Training context
	trackBreathingTechnique: true,
	trackRPE: true,
	trackJoyScale: true,
	trackHoursSinceLastMeal: true,
	trackNotes: true,
	// NEW METRICS (Custom routine builder)
	trackWaterTemperature: false,
	trackContractionsOnsetTime: false,
	trackEquipmentUsed: false,
	trackBuddyName: false,
	trackRestingHeartRate: false,
	trackHRV: false,
	trackPoolType: false,
	trackSambaBO: false,
	trackBreathsBetweenReps: false,
	// NEW METRICS - Phase 1 (Additional from testing)
	trackMenstrualCycleDay: false,
	trackFacialGear: false,
	trackBasalMood: false,
	trackMinimumSpO2: false,
	trackMinimumHR: false,
	trackBodyWeight: false
};

// Tracking for static max attempts
const staticMaxTracking: TrackingConfig = {
	// Session context
	trackPoolLength: false,
	trackInitialBreatheUpTime: true,
	// Performance metrics
	trackTotalDistance: false,
	trackTotalTime: true,
	trackRepsCompleted: false,
	trackRepDuration: false,
	trackRepDistance: false,
	trackTimePerLap: false,
	trackRestBetweenLaps: false,
	trackKicksPerLap: false,
	trackArmPullsPerLap: false,
	// Training context
	trackBreathingTechnique: true,
	trackRPE: true,
	trackJoyScale: true,
	trackHoursSinceLastMeal: true,
	trackNotes: true,
	// NEW METRICS (Custom routine builder)
	trackWaterTemperature: false,
	trackContractionsOnsetTime: false,
	trackEquipmentUsed: false,
	trackBuddyName: false,
	trackRestingHeartRate: false,
	trackHRV: false,
	trackPoolType: false,
	trackSambaBO: false,
	trackBreathsBetweenReps: false,
	// NEW METRICS - Phase 1 (Additional from testing)
	trackMenstrualCycleDay: false,
	trackFacialGear: false,
	trackBasalMood: false,
	trackMinimumSpO2: false,
	trackMinimumHR: false,
	trackBodyWeight: false
};

// Tracking for interval routines (Sweet 16, etc.)
const intervalTracking: TrackingConfig = {
	// Session context
	trackPoolLength: true,
	trackInitialBreatheUpTime: true,
	// Performance metrics
	trackTotalDistance: false,
	trackTotalTime: true,
	trackRepsCompleted: true,
	trackRepDuration: false,
	trackRepDistance: false,
	trackTimePerLap: true,
	trackRestBetweenLaps: true,
	trackKicksPerLap: false,
	trackArmPullsPerLap: false,
	// Training context
	trackBreathingTechnique: false,
	trackRPE: true,
	trackJoyScale: true,
	trackHoursSinceLastMeal: true,
	trackNotes: true,
	// NEW METRICS (Custom routine builder)
	trackWaterTemperature: false,
	trackContractionsOnsetTime: false,
	trackEquipmentUsed: false,
	trackBuddyName: false,
	trackRestingHeartRate: false,
	trackHRV: false,
	trackPoolType: false,
	trackSambaBO: false,
	trackBreathsBetweenReps: false,
	// NEW METRICS - Phase 1 (Additional from testing)
	trackMenstrualCycleDay: false,
	trackFacialGear: false,
	trackBasalMood: false,
	trackMinimumSpO2: false,
	trackMinimumHR: false,
	trackBodyWeight: false
};

// Tracking for static interval routines (Gentle 2-Breath, etc.)
const staticIntervalTracking: TrackingConfig = {
	// Session context
	trackPoolLength: false,
	trackInitialBreatheUpTime: true,
	// Performance metrics
	trackTotalDistance: false,
	trackTotalTime: false,
	trackRepsCompleted: true,
	trackRepDuration: true,
	trackRepDistance: false,
	trackTimePerLap: false,
	trackRestBetweenLaps: true,
	trackKicksPerLap: false,
	trackArmPullsPerLap: false,
	// Training context
	trackBreathingTechnique: true,
	trackRPE: true,
	trackJoyScale: true,
	trackHoursSinceLastMeal: true,
	trackNotes: true,
	// NEW METRICS (Custom routine builder)
	trackWaterTemperature: false,
	trackContractionsOnsetTime: false,
	trackEquipmentUsed: false,
	trackBuddyName: false,
	trackRestingHeartRate: false,
	trackHRV: false,
	trackPoolType: false,
	trackSambaBO: false,
	trackBreathsBetweenReps: false,
	// NEW METRICS - Phase 1 (Additional from testing)
	trackMenstrualCycleDay: false,
	trackFacialGear: false,
	trackBasalMood: false,
	trackMinimumSpO2: false,
	trackMinimumHR: false,
	trackBodyWeight: false
};

// ============================================================================
// DEFAULT ROUTINES (4 System Routines)
// ============================================================================

const defaultRoutines: Omit<RoutineTemplate, 'createdAt' | 'updatedAt'>[] = [
	// 1. Dynamic Max Attempt
	{
		id: 'system-dynamic-max',
		name: 'Dynamic Max Attempt',
		description:
			'Single maximal effort dive with own-time breathe-up. Track your personal best for DYN, DYNB, or DNF.',
		disciplines: ['DYN', 'DYNB', 'DNF'],
		tags: ['max-attempt', 'pb'],
		trackingConfig: dynamicMaxTracking,
		displayConfig: {
			heroMetric: 'totalDistance',
			heroMetricLabel: 'Distance',
			secondaryMetric: 'totalTime',
			secondaryMetricLabel: 'Time'
		},
		createdBy: 'system',
		isPublic: true
	},

	// 2. Static Max Attempt
	{
		id: 'system-static-max',
		name: 'Static Max Attempt',
		description:
			'Single maximal static breath-hold with own-time breathe-up. Track your personal best for STA.',
		disciplines: ['STA'],
		tags: ['max-attempt', 'pb'],
		trackingConfig: staticMaxTracking,
		displayConfig: {
			heroMetric: 'totalTime',
			heroMetricLabel: 'Time',
			secondaryMetric: 'initialBreatheUpTime',
			secondaryMetricLabel: 'Breathe-Up'
		},
		createdBy: 'system',
		isPublic: true
	},

	// 3. Sweet 16
	{
		id: 'system-sweet-16',
		name: 'Sweet 16',
		description:
			'Sixteen 50-meter reps with user-defined rest intervals. Classic CO₂ tolerance builder for dynamic disciplines.',
		disciplines: ['DYN', 'DYNB', 'DNF'],
		tags: ['co2', 'endurance'],
		repDistance: 50, // 50 meters per rep
		numberOfReps: 16,
		trackingConfig: intervalTracking,
		displayConfig: {
			heroMetric: 'totalTime',
			heroMetricLabel: 'Total Time',
			secondaryMetric: 'avgTimePerRep',
			secondaryMetricLabel: 'Avg/Rep'
		},
		createdBy: 'system',
		isPublic: true
	},

	// 4. Gentle 2-Breath
	{
		id: 'system-gentle-2-breath',
		name: 'Gentle 2-Breath',
		description:
			'Ten static holds (target 1:30 each) with recovery periods long enough for just two breaths. Gentle CO₂ tolerance training.',
		disciplines: ['STA'],
		tags: ['co2', 'beginner'],
		numberOfReps: 10,
		trackingConfig: staticIntervalTracking,
		displayConfig: {
			heroMetric: 'totalBreathHoldTime',
			heroMetricLabel: 'Total Hold',
			secondaryMetric: 'totalBreaths',
			secondaryMetricLabel: 'Total Breaths'
		},
		createdBy: 'system',
		isPublic: true
	}
];

// ============================================================================
// SUGGESTED TAGS CONFIG
// ============================================================================

const suggestedTags: SuggestedTags = {
	trainingAdaptations: ['co2', 'o2', 'technique', 'mental', 'endurance', 'power'],
	diveTypes: ['max-attempt', 'sub-max', 'warm-up', 'recovery', 'dry'],
	difficultyLevels: ['beginner', 'intermediate', 'advanced', 'expert'],
	specialCategories: ['competition', 'fun', 'experimental']
};

// ============================================================================
// SEED FUNCTIONS
// ============================================================================

async function seedRoutines() {
	console.log('🌱 Seeding default routines...');

	for (const routine of defaultRoutines) {
		const routineRef = doc(db, 'routines', routine.id);

		const routineData = {
			...routine,
			createdAt: serverTimestamp(),
			updatedAt: serverTimestamp()
		};

		await setDoc(routineRef, routineData);
		console.log(`  ✅ Created: ${routine.name}`);
	}

	console.log(`✨ Successfully seeded ${defaultRoutines.length} default routines\n`);
}

async function seedConfig() {
	console.log('🌱 Seeding config...');

	const configRef = doc(db, 'config', 'suggestedTags');
	await setDoc(configRef, suggestedTags);

	console.log('  ✅ Created: suggestedTags config');
	console.log(
		`  📊 Total tags: ${Object.values(suggestedTags).flat().length} across 4 categories\n`
	);
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
	console.log('\n🚀 Starting seed script for Overdive Dreaming\n');
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

	try {
		await seedRoutines();
		await seedConfig();

		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
		console.log('✨ Seed script completed successfully!\n');
		console.log('You can now:');
		console.log('  1. Check Firebase Console to verify data');
		console.log('  2. Start the dev server: npm run dev');
		console.log('  3. Sign in and browse default routines\n');

		process.exit(0);
	} catch (error) {
		console.error('\n❌ Error seeding data:', error);
		process.exit(1);
	}
}

main();
