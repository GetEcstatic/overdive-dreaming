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

	// If using logged rep duration (e.g., Gentle 2-Breath actual rep duration)
	// Check both locations where repsCompleted might be stored
	const repsCompleted = log.repsCompleted || log.summary?.repsCompleted || 0;
	if (log.repDuration && repsCompleted) {
		return log.repDuration * repsCompleted;
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
 * Calculate total breaths taken during interval routine
 * For Gentle 2-Breath: (repsCompleted - 1) × 2
 * Used for static interval routines where you take a fixed number of breaths between reps
 */
export function calculateTotalBreaths(log: RoutineLog): number {
	const repsCompleted = log.repsCompleted || log.summary?.repsCompleted || 0;
	if (repsCompleted > 1) {
		return (repsCompleted - 1) * 2;
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

	// Calculate from total time and reps completed
	if (log.totalTime && log.summary?.repsCompleted) {
		return log.totalTime / log.summary.repsCompleted;
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
 * Calculate total rep distance (repsCompleted × repDistance)
 * Used for interval routines where each rep covers a specific distance
 * Returns meters, or 0 if no data available
 */
export function calculateTotalRepDistance(log: RoutineLog): number {
	const repsCompleted = log.repsCompleted || log.summary?.repsCompleted || 0;
	const repDistance = log.repDistance || 0;

	if (repsCompleted > 0 && repDistance > 0) {
		return repsCompleted * repDistance;
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

		case 'repsCompleted':
			return log.repsCompleted || log.summary?.repsCompleted || 0;

		case 'totalRepDistance':
			return calculateTotalRepDistance(log);

		case 'repDuration':
			return log.repDuration || 0;

		case 'avgTimePerLap':
		case 'avgTimePerRep':
			return calculateAvgTimePerLap(log);

		case 'avgRestBetweenLaps':
			return calculateAvgRestBetweenLaps(log);

		case 'totalBreathHoldTime':
			return calculateTotalBreathHoldTime(log, routine);

		case 'totalBreathingTime':
			return calculateTotalBreathingTime(log);

		case 'totalBreaths':
			return calculateTotalBreaths(log);

		case 'poolLength':
			return log.poolLength || 0;

		case 'initialBreatheUpTime':
			return log.initialBreatheUpTime || 0;

		case 'waterTemperature':
			return log.waterTemperature || 0;

		case 'contractionsOnsetTime':
			return log.contractionsOnsetTime || 0;

		case 'restingHeartRate':
			return log.restingHeartRate || 0;

		case 'hrv':
			return log.hrv || 0;

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
		case 'totalRepDistance':
		case 'poolLength':
			return `${value}m`;

		case 'totalTime':
		case 'repDuration':
		case 'avgTimePerLap':
		case 'avgTimePerRep':
		case 'avgRestBetweenLaps':
		case 'totalBreathHoldTime':
		case 'totalBreathingTime':
		case 'initialBreatheUpTime':
		case 'contractionsOnsetTime':
			return formatTime(value);

		case 'repsCompleted':
		case 'totalBreaths':
			return value.toString();

		case 'waterTemperature':
			return `${value}°C`;

		case 'restingHeartRate':
			return `${value} bpm`;

		case 'hrv':
			return `${value}ms`;

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
