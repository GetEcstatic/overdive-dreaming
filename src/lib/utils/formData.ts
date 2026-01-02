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
	return {
		disciplineUsed: log.disciplineUsed,

		// Session context
		poolLength: log.poolLength,
		initialBreatheUpTime: log.initialBreatheUpTime,

		// Performance metrics
		totalDistance: log.totalDistance,
		totalTime: log.totalTime,
		repsCompleted: log.summary?.repsCompleted,
		repDuration: log.repDuration,

		// Training context
		breathingTechnique: log.breathingTechnique,
		rpe: log.rpe,
		joyScale: log.joyScale,
		hoursSinceLastMeal: log.hoursSinceLastMeal,
		notes: log.notes,

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
