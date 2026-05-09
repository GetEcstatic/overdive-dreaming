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
 * Supports new metric aliases for clearer naming
 */
export function getMetricValue(
	metricType: MetricType,
	log: RoutineLog,
	routine: RoutineTemplate
): number {
	switch (metricType) {
		// Distance metrics
		case 'totalDistance':
		case 'diveDistance': // New alias
			return log.totalDistance || log.diveDistance || 0;

		case 'cumulativeDistance':
			if (log.cumulativeDistance) return log.cumulativeDistance;
			if (log.laps && log.laps.length > 0) {
				return log.laps.reduce((sum, lap) => sum + (lap.distanceMeters || 0), 0);
			}
			return calculateTotalRepDistance(log);

		// Time metrics
		case 'totalTime':
		case 'diveDuration': // New alias
			return log.totalTime || log.diveDuration || 0;

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
		case 'cumulativeHoldTime': // New alias
			// Try direct field first, then calculate from laps, then from routine template
			if (log.cumulativeHoldTime) return log.cumulativeHoldTime;
			if (log.laps && log.laps.length > 0) {
				return log.laps.reduce((sum, lap) => sum + (lap.timeSeconds || 0), 0);
			}
			return calculateTotalBreathHoldTime(log, routine);

		case 'longestHold':
			// Try direct field first, then calculate from laps
			if (log.longestHold) return log.longestHold;
			if (log.laps && log.laps.length > 0) {
				return Math.max(...log.laps.map(lap => lap.timeSeconds || 0));
			}
			return 0;

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

		case 'packingVolume':
			return log.packingVolume || 0;

		case 'minimumSpO2':
			return log.minimumSpO2 ?? log.lowestSpO2 ?? minLapValue(log, (lap) => lap.spo2Min) ?? 0;

		case 'minimumHR':
			return log.minimumHR ?? log.sessionMinHR ?? minLapValue(log, (lap) => lap.hrMin) ?? 0;

		case 'timeBelowSpO2Threshold':
			return log.totalTimeBelow70 ?? sumLapValue(log, (lap) => lap.timeBelow70);

		case 'kicksPerLap':
		case 'averageKicksPerLap':
			return averageLapValue(log, (lap) => lap.kicks);

		case 'armPullsPerLap':
		case 'averageArmPullsPerLap':
			return averageLapValue(log, (lap) => lap.armPulls);

		case 'fvcLiters':
			return log.fvc ?? 0;

		case 'fvcWithPackingLiters':
			return log.fvcWithPacking ?? 0;

		case 'endSpO2':
			return log.endSpO2 ?? 0;

		case 'recoveryQuality':
			return log.recoveryQuality ?? 0;

		case 'urgeToBreathe':
			return log.urgeToBreathe ?? 0;

		case 'lucidity':
			return log.lucidity ?? 0;

		case 'contractions':
			return log.contractions ?? 0;

		// Speed metrics (new canonical *Ms names preferred; old names kept as aliases)
		case 'avgSpeed':
		case 'avgSpeedMs':
			return log.avgSpeedMs ?? log.avgSpeed ?? calculateAvgSpeed(log);

		case 'maxRepSpeed':
		case 'fastestLapSpeedMs':
			return log.fastestLapSpeedMs ?? log.maxRepSpeed ?? maxLapValue(log, speedForLap) ?? 0;

		case 'minRepSpeed':
		case 'slowestLapSpeedMs':
			return log.slowestLapSpeedMs ?? log.minRepSpeed ?? minLapValue(log, speedForLap) ?? 0;

		case 'breathingTechnique':
		case 'equipment':
		case 'facialGear':
		case 'gasMix':
		case 'safetyOutcome':
		case 'lungVolume':
		case 'competitionStatus':
		case 'cardColor':
		case 'recordTag':
			// String metric - return 0 as placeholder, handled in getFormattedMetric
			return 0;

		default:
			return 0;
	}
}

/**
 * Calculate average speed for dynamic disciplines
 * Returns meters per second
 */
function calculateAvgSpeed(log: RoutineLog): number {
	const distance = log.totalDistance || log.diveDistance || 0;
	const time = log.totalTime || log.diveDuration || 0;
	
	if (distance > 0 && time > 0) {
		return distance / time;
	}
	return 0;
}

function sumLapValue(log: RoutineLog, selector: (lap: NonNullable<RoutineLog['laps']>[number]) => number | undefined): number {
	return log.laps?.reduce((sum, lap) => sum + (selector(lap) ?? 0), 0) ?? 0;
}

function minLapValue(log: RoutineLog, selector: (lap: NonNullable<RoutineLog['laps']>[number]) => number | undefined): number | undefined {
	const values = log.laps?.map(selector).filter((value): value is number => value !== undefined) ?? [];
	return values.length > 0 ? Math.min(...values) : undefined;
}

function maxLapValue(log: RoutineLog, selector: (lap: NonNullable<RoutineLog['laps']>[number]) => number | undefined): number | undefined {
	const values = log.laps?.map(selector).filter((value): value is number => value !== undefined) ?? [];
	return values.length > 0 ? Math.max(...values) : undefined;
}

function averageLapValue(log: RoutineLog, selector: (lap: NonNullable<RoutineLog['laps']>[number]) => number | undefined): number {
	const values = log.laps?.map(selector).filter((value): value is number => value !== undefined) ?? [];
	return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function speedForLap(lap: NonNullable<RoutineLog['laps']>[number]): number | undefined {
	if (lap.speedMs !== undefined) return lap.speedMs;
	if (lap.distanceMeters && lap.timeSeconds) return lap.distanceMeters / lap.timeSeconds;
	return undefined;
}

/**
 * Format a metric value for display
 * Returns formatted string with appropriate units
 */
export function formatMetricValue(metricType: MetricType, value: number): string {
	switch (metricType) {
		// Distance metrics
		case 'totalDistance':
		case 'diveDistance':
		case 'totalRepDistance':
		case 'cumulativeDistance':
		case 'poolLength':
			return `${value}m`;

		// Time metrics
		case 'totalTime':
		case 'diveDuration':
		case 'repDuration':
		case 'avgTimePerLap':
		case 'avgTimePerRep':
		case 'avgRestBetweenLaps':
		case 'totalBreathHoldTime':
		case 'cumulativeHoldTime':
		case 'longestHold':
		case 'totalBreathingTime':
		case 'initialBreatheUpTime':
		case 'contractionsOnsetTime':
		case 'timeBelowSpO2Threshold':
			return formatTime(value);

		// Count metrics
		case 'repsCompleted':
		case 'totalBreaths':
		case 'kicksPerLap':
		case 'armPullsPerLap':
		case 'averageKicksPerLap':
		case 'averageArmPullsPerLap':
			return value.toString();

		// Speed metrics (m/s)
		case 'avgSpeed':
		case 'avgSpeedMs':
		case 'maxRepSpeed':
		case 'fastestLapSpeedMs':
		case 'minRepSpeed':
		case 'slowestLapSpeedMs':
			return `${value.toFixed(2)} m/s`;

		// Temperature
		case 'waterTemperature':
			return `${value}°C`;

		// Heart rate
		case 'restingHeartRate':
		case 'minimumHR':
			return `${value} bpm`;

		case 'fvcLiters':
		case 'fvcWithPackingLiters':
			return `${value.toFixed(1)}L`;

		// HRV
		case 'hrv':
			return `${value}ms`;

		// Packing volume (percentage)
		case 'packingVolume':
		case 'minimumSpO2':
		case 'endSpO2':
			return `${value.toFixed(0)}%`;

		case 'recoveryQuality':
		case 'urgeToBreathe':
		case 'lucidity':
		case 'contractions':
			return `${value}/10`;

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
	// Handle string-based metrics
	if (metricType === 'breathingTechnique') {
		// Prefer breathingTechniqueLevel (newer numeric field) over old enum
		if (log.breathingTechniqueLevel !== undefined && log.breathingTechniqueLevel !== null) {
			const level = log.breathingTechniqueLevel;
			let technique: string;
			if (level === 0) technique = 'Tidal';
			else if (level < 0) technique = `Hypoventilation (${level})`;
			else technique = `Hyperventilation (+${level})`;
			return { value: technique, label };
		}
		const technique = log.breathingTechnique || '—';
		return { value: technique, label };
	}

	if (metricType === 'equipment') {
		return { value: log.equipmentUsed || '—', label };
	}

	if (metricType === 'facialGear') {
		return { value: log.facialGear?.join(', ') || '—', label };
	}

	if (metricType === 'gasMix') {
		return { value: log.gasMix || log.attemptConditions?.gasMix || log.attemptConditions?.breathingGas || '—', label };
	}

	if (metricType === 'safetyOutcome') {
		if (log.sambaBO === undefined) return { value: '—', label };
		return { value: log.sambaBO ? 'Samba/BO' : 'Clean', label };
	}

	if (metricType === 'lungVolume') {
		return { value: log.defaultLungVolume ?? log.laps?.find((lap) => lap.lungVolume)?.lungVolume ?? '—', label };
	}

	if (metricType === 'competitionStatus') {
		return { value: log.isCompetition ? 'Competition' : 'Training', label };
	}

	if (metricType === 'cardColor') {
		return { value: log.cardTag ?? '—', label };
	}

	if (metricType === 'recordTag') {
		return { value: log.recordTag ?? '—', label };
	}

	const rawValue = getMetricValue(metricType, log, routine);
	const formattedValue = formatMetricValue(metricType, rawValue);

	return {
		value: formattedValue,
		label
	};
}
