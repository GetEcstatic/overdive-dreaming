/**
 * Metrics calculation utilities for dive session data
 *
 * Provides helper functions to calculate derived metrics from routine logs,
 * such as totals, averages, and aggregations across laps/reps.
 */

import type { RoutineLog, RoutineTemplate, MetricType } from '$lib/types';
import { formatTime } from './time';

/**
 * Calculate total breath hold time (sum of all hold durations)
 * Used for static interval routines like Gentle 2-Breath
 */
export function calculateTotalBreathHoldTime(
	log: RoutineLog,
	routine: RoutineTemplate
): number {
	// If detailed per-lap data exists, sum actual times
	if (log.laps && log.laps.length > 0) {
		return log.laps.reduce((sum, lap) => sum + (lap.timeSeconds || 0), 0);
	}

	// If using fixed rep duration (e.g., Gentle 2-Breath = 90s per rep)
	if (routine.repDuration && log.summary?.lapsCompleted) {
		return routine.repDuration * log.summary.lapsCompleted;
	}

	return 0;
}

/**
 * Calculate total breathing/rest time (sum of all rest periods)
 * Used for interval routines to track CO₂ tolerance
 */
export function calculateTotalBreathingTime(log: RoutineLog): number {
	if (log.laps && log.laps.length > 0) {
		return log.laps.reduce((sum, lap) => sum + (lap.restAfterSeconds || 0), 0);
	}
	return 0;
}

/**
 * Calculate average time per lap/rep
 * Returns seconds, or 0 if no data available
 */
export function calculateAvgTimePerLap(log: RoutineLog): number {
	// Check if already calculated in summary
	if (log.summary?.averageTimePerLap) {
		return log.summary.averageTimePerLap;
	}

	// Calculate from detailed lap data
	if (log.laps && log.laps.length > 0) {
		const total = log.laps.reduce((sum, lap) => sum + (lap.timeSeconds || 0), 0);
		return total / log.laps.length;
	}

	// Calculate from total time and laps completed
	if (log.totalTime && log.summary?.lapsCompleted) {
		return log.totalTime / log.summary.lapsCompleted;
	}

	return 0;
}

/**
 * Calculate average rest time between laps/reps
 * Returns seconds, or 0 if no data available
 */
export function calculateAvgRestBetweenLaps(log: RoutineLog): number {
	if (log.laps && log.laps.length > 0) {
		const totalRest = log.laps.reduce((sum, lap) => sum + (lap.restAfterSeconds || 0), 0);
		return totalRest / log.laps.length;
	}
	return 0;
}

/**
 * Get a metric value from a routine log
 * Handles both direct fields and calculated metrics
 */
export function getMetricValue(
	metricType: MetricType,
	log: RoutineLog,
	routine: RoutineTemplate
): number {
	switch (metricType) {
		case 'totalDistance':
			return log.totalDistance || 0;

		case 'totalTime':
			return log.totalTime || 0;

		case 'lapsCompleted':
			return log.summary?.lapsCompleted || 0;

		case 'avgTimePerLap':
			return calculateAvgTimePerLap(log);

		case 'avgRestBetweenLaps':
			return calculateAvgRestBetweenLaps(log);

		case 'totalBreathHoldTime':
			return calculateTotalBreathHoldTime(log, routine);

		case 'totalBreathingTime':
			return calculateTotalBreathingTime(log);

		case 'poolLength':
			return log.poolLength || 0;

		case 'initialBreatheUpTime':
			return log.initialBreatheUpTime || 0;

		default:
			return 0;
	}
}

/**
 * Format a metric value for display
 * Returns formatted string with appropriate units
 */
export function formatMetricValue(metricType: MetricType, value: number): string {
	switch (metricType) {
		case 'totalDistance':
		case 'poolLength':
			return `${value}m`;

		case 'totalTime':
		case 'avgTimePerLap':
		case 'avgRestBetweenLaps':
		case 'totalBreathHoldTime':
		case 'totalBreathingTime':
		case 'initialBreatheUpTime':
			return formatTime(value);

		case 'lapsCompleted':
			return value.toString();

		default:
			return value.toString();
	}
}

/**
 * Get formatted metric for display (value + label)
 */
export function getFormattedMetric(
	metricType: MetricType,
	label: string,
	log: RoutineLog,
	routine: RoutineTemplate
): { value: string; label: string } {
	const rawValue = getMetricValue(metricType, log, routine);
	const formattedValue = formatMetricValue(metricType, rawValue);

	return {
		value: formattedValue,
		label
	};
}
