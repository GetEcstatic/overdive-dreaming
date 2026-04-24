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
	// Speed metrics
	trackAvgSpeed: true,
	trackSpeedPerLap: true,
	// Capture sources for recorder-capable metrics
	totalDistanceSource: 'either',
	totalTimeSource: 'either',
	timePerLapSource: 'recorder',
	speedPerLapSource: 'recorder',
	avgSpeedSource: 'either',
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
	trackBodyWeight: false,
	// LUNG CAPACITY
	trackFVC: false,
	trackFVCWithPacking: false,
	trackPackingVolume: false,
	// BIOMETRIC TRACKING
	trackPerRepSpO2: false,
	trackPerRepHR: false,
	trackSpO2Thresholds: false,
	isDryTraining: false
};

// Tracking for static max attempts (dry training with biometric CSV import support)
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
	trackContractionsOnsetTime: true,
	trackEquipmentUsed: false,
	trackBuddyName: false,
	trackRestingHeartRate: true,
	trackHRV: true,
	trackPoolType: false,
	trackSambaBO: true,
	trackBreathsBetweenReps: false,
	// NEW METRICS - Phase 1 (Additional from testing)
	trackMenstrualCycleDay: false,
	trackFacialGear: false,
	trackBasalMood: true,
	trackMinimumSpO2: true,
	trackMinimumHR: true,
	trackBodyWeight: false,
	// LUNG CAPACITY
	trackFVC: false,
	trackFVCWithPacking: false,
	trackPackingVolume: false,
	// BIOMETRIC TRACKING - Enabled for dry static
	trackPerRepSpO2: true,
	trackPerRepHR: true,
	trackSpO2Thresholds: true,
	isDryTraining: true
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
	// Speed metrics
	trackAvgSpeed: true,
	trackSpeedPerLap: true,
	// Capture sources for recorder-capable metrics
	totalTimeSource: 'either',
	timePerLapSource: 'recorder',
	speedPerLapSource: 'recorder',
	avgSpeedSource: 'either',
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
	trackBodyWeight: false,
	// LUNG CAPACITY
	trackFVC: false,
	trackFVCWithPacking: false,
	trackPackingVolume: false,
	// BIOMETRIC TRACKING
	trackPerRepSpO2: false,
	trackPerRepHR: false,
	trackSpO2Thresholds: false,
	isDryTraining: false
};

// Tracking for static interval routines (Gentle 2-Breath, etc.) - dry training with biometric CSV import support
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
	trackContractionsOnsetTime: true,
	trackEquipmentUsed: false,
	trackBuddyName: false,
	trackRestingHeartRate: true,
	trackHRV: true,
	trackPoolType: false,
	trackSambaBO: true,
	trackBreathsBetweenReps: false,
	// NEW METRICS - Phase 1 (Additional from testing)
	trackMenstrualCycleDay: false,
	trackFacialGear: false,
	trackBasalMood: true,
	trackMinimumSpO2: true,
	trackMinimumHR: true,
	trackBodyWeight: false,
	// LUNG CAPACITY
	trackFVC: false,
	trackFVCWithPacking: false,
	trackPackingVolume: false,
	// BIOMETRIC TRACKING - Enabled for dry static
	trackPerRepSpO2: true,
	trackPerRepHR: true,
	trackSpO2Thresholds: true,
	isDryTraining: true
};

// Tracking for dry static breath hold training with biometrics (RV Breath Hold Series, etc.)
const dryStaticBiometricTracking: TrackingConfig = {
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
	trackBreathingTechnique: false,
	trackRPE: true,
	trackJoyScale: true,
	trackHoursSinceLastMeal: true,
	trackNotes: true,
	// NEW METRICS (Custom routine builder)
	trackWaterTemperature: false,
	trackContractionsOnsetTime: true,
	trackEquipmentUsed: false,
	trackBuddyName: false,
	trackRestingHeartRate: true,
	trackHRV: true,
	trackPoolType: false,
	trackSambaBO: true,
	trackBreathsBetweenReps: false,
	// NEW METRICS - Phase 1 (Additional from testing)
	trackMenstrualCycleDay: false,
	trackFacialGear: false,
	trackBasalMood: true,
	trackMinimumSpO2: true,
	trackMinimumHR: true,
	trackBodyWeight: false,
	// LUNG CAPACITY
	trackFVC: false,
	trackFVCWithPacking: false,
	trackPackingVolume: false,
	// BIOMETRIC TRACKING - Enabled for dry static
	trackPerRepSpO2: true,
	trackPerRepHR: true,
	trackSpO2Thresholds: true,
	isDryTraining: true
};

const o2AssistedStaticTracking: TrackingConfig = {
	trackPoolLength: false,
	trackInitialBreatheUpTime: true,
	trackTotalDistance: false,
	trackTotalTime: true,
	trackRepsCompleted: false,
	trackRepDuration: false,
	trackRepDistance: false,
	trackTimePerLap: false,
	trackRestBetweenLaps: false,
	trackKicksPerLap: false,
	trackArmPullsPerLap: false,
	trackBreathingTechnique: false,
	trackRPE: true,
	trackJoyScale: true,
	trackHoursSinceLastMeal: true,
	trackNotes: true,
	trackWaterTemperature: false,
	trackContractionsOnsetTime: true,
	trackEquipmentUsed: false,
	trackBuddyName: true,
	trackRestingHeartRate: true,
	trackHRV: false,
	trackPoolType: false,
	trackSambaBO: true,
	trackBreathsBetweenReps: false,
	trackMenstrualCycleDay: true,
	trackFacialGear: false,
	trackBasalMood: true,
	trackMinimumSpO2: false,
	trackMinimumHR: false,
	trackBodyWeight: false,
	trackFVC: true,
	trackFVCWithPacking: true,
	trackPackingVolume: true,
	trackPerRepSpO2: false,
	trackPerRepHR: false,
	trackSpO2Thresholds: false,
	isDryTraining: false,
	trackLucidity: true,
	trackUrgeToBreathe: true,
	trackContractions: true,
	trackETCO2: true,
	trackExpiredAirPostHold: true,
	trackLungVolumeLossPerMin: true,
	trackGasMix: true,
	trackCO2TremorOnset: true,
	trackMentalChangeTime: true,
	trackRecoveryQuality: true,
	trackEndSpO2: true,
	trackBreatheUpType: true
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
	},

	// 5. RV Breath Hold Series (Dry Static with Biometric Tracking)
	{
		id: 'system-rv-breath-hold',
		name: 'RV Breath Hold Series',
		description:
			'Dry static breath hold training with residual volume (RV) exhales. Track SpO2 and heart rate per rep using a pulse oximeter. Designed for progressive desaturation training and monitoring hypoxic tolerance.',
		activityType: 'structured-intervals',
		disciplines: ['STA'],
		tags: ['dry', 'o2', 'advanced', 'biometric'],
		numberOfReps: 11,
		restBetweenReps: 180, // 3 minutes default rest
		trackingConfig: dryStaticBiometricTracking,
		displayConfig: {
			heroMetric: 'longestHold',
			heroMetricLabel: 'Longest Hold',
			secondaryMetric: 'repsCompleted',
			secondaryMetricLabel: 'Rounds'
		},
		createdBy: 'system',
		isPublic: true
	},
	// 6. Zero-Nitrogen Static (Guinness WR Training)
	{
		id: 'system-o2-assisted-static',
		name: 'Zero-Nitrogen Static',
		description:
			'Zero-nitrogen static apnea max attempt with comprehensive physiological tracking. Designed for coached world record training with detailed breathe-up, lung capacity, CO₂ response, and recovery metrics.',
		activityType: 'max-attempt',
		disciplines: ['STA'],
		tags: ['o2', 'max-attempt', 'advanced', 'world-record'],
		trackingConfig: o2AssistedStaticTracking,
		displayConfig: {
			heroMetric: 'totalTime',
			heroMetricLabel: 'Hold Duration',
			secondaryMetric: 'contractionsOnsetTime',
			secondaryMetricLabel: '1st Contraction',
			tertiaryMetric: 'initialBreatheUpTime',
			tertiaryMetricLabel: 'Breathe-Up'
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
