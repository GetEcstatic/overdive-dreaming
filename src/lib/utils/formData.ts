// Form Data Conversion Utilities
// Helpers for converting between RoutineLog and form data structures

import type { RoutineLog, Discipline, BreathingTechnique } from '$lib/types';
import type { LogFormData } from '$lib/components/QuickLogForm.svelte';

/**
 * Convert a RoutineLog to LogFormData for pre-populating edit forms
 * @param log - The routine log to convert
 * @returns Form data object ready for editing
 */
export function routineLogToFormData(log: RoutineLog): LogFormData {
	// Convert Firestore Timestamp to YYYY-MM-DD format
	const logDate = log.date.toDate();
	const sessionDate = logDate.toISOString().split('T')[0];
	const sessionTime = logDate.toTimeString().slice(0, 5);

	return {
		disciplineUsed: log.disciplineUsed,
		sessionDate,
		sessionTime,
		timeOfDay: log.timeOfDay,
		isCompetition: log.isCompetition || false,
		compeitionOrg: log.compeitionOrg ?? undefined,
		cardTag: log.cardTag ?? undefined,
		recordTag: log.recordTag ?? undefined,
		visibility: log.visibility ?? 'private',

		// Session context
		isDrySession: log.isDrySession,
		poolLength: log.poolLength,
		initialBreatheUpTime: log.initialBreatheUpTime,

		// Performance metrics
		totalDistance: log.totalDistance,
		totalTime: log.totalTime,
		repsCompleted: log.summary?.repsCompleted,
		repDuration: log.repDuration,

		// Training context
		breathingTechnique: log.breathingTechnique,
		waterTemperature: log.waterTemperature,
		contractionsOnsetTime: log.contractionsOnsetTime,
		equipmentUsed: log.equipmentUsed,
		buddyName: log.buddyName,
		restingHeartRate: log.restingHeartRate,
		hrv: log.hrv,
		poolType: log.poolType,
		sambaBO: log.sambaBO,
		breathsBetweenReps: log.breathsBetweenReps,
		breathingTechniqueLevel: log.breathingTechniqueLevel,
		rpe: log.rpe,
		joyScale: log.joyScale,
		hoursSinceLastMeal: log.hoursSinceLastMeal,
		notes: log.notes,

		// NEW METRICS - Phase 1
		menstrualCycleDay: log.menstrualCycleDay,
		facialGear: log.facialGear,
		basalMood: log.basalMood,
		minimumSpO2: log.minimumSpO2,
		minimumHR: log.minimumHR,
		bodyWeight: log.bodyWeight,

		// Lung capacity
		fvc: log.fvc,
		fvcWithPacking: log.fvcWithPacking,

		// Session-level default lung volume (FL/RV/FRC)
		defaultLungVolume: log.defaultLungVolume,

		// Biometric tracking data (from CSV import)
		laps: log.laps,
		hasBiometricData: log.hasBiometricData,
		longestHold: log.longestHold,
		cumulativeHoldTime: log.cumulativeHoldTime,
		lowestSpO2: log.lowestSpO2,
		sessionAvgSpO2: log.sessionAvgSpO2,
		sessionMinHR: log.sessionMinHR,
		sessionMaxHR: log.sessionMaxHR,
		totalTimeBelow70: log.totalTimeBelow70,
		totalTimeBelow60: log.totalTimeBelow60,
		totalTimeBelow50: log.totalTimeBelow50,
		totalTimeBelow40: log.totalTimeBelow40,

		// Media - don't include in form data, handled separately
		photoFile: undefined,
		youtubeUrl: log.youtubeUrl
	};
}

/**
 * Convert seconds to minutes and seconds for mm:ss time inputs
 * @param seconds - Total seconds
 * @returns Object with minutes and seconds, or undefined if input is undefined
 */
export function convertSecondsToTimeFields(
	seconds?: number
): { minutes?: number; seconds?: number } {
	if (seconds === undefined) {
		return { minutes: undefined, seconds: undefined };
	}

	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = Math.floor(seconds % 60);

	return {
		minutes,
		seconds: remainingSeconds
	};
}

/**
 * Convert minutes and seconds from time inputs to total seconds
 * @param minutes - Number of minutes
 * @param seconds - Number of seconds
 * @returns Total seconds, or undefined if both inputs are undefined
 */
export function convertTimeFieldsToSeconds(
	minutes?: number,
	seconds?: number
): number | undefined {
	if (minutes === undefined && seconds === undefined) {
		return undefined;
	}

	const mins = minutes ?? 0;
	const secs = seconds ?? 0;

	return mins * 60 + secs;
}
