/**
 * Metrics calculation utilities for dive session data
 *
 * Provides helper functions to calculate derived metrics from routine logs,
 * such as totals, averages, and aggregations across laps/reps.
 */

import type { RoutineLog, RoutineTemplate, MetricType } from '$lib/types';
import { getMetricRegistryEntry } from '$lib/metrics/registry';
import { buildRoutineLogResultReadModel } from '$lib/routineLayers/logPlan';
import { formatTime } from './time';

type MetricValueResolver = (log: RoutineLog, routine: RoutineTemplate) => number;
type FormattedMetricResolver = (
	log: RoutineLog,
	routine: RoutineTemplate,
	label: string
) => { value: string; label: string };

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

const metricValueResolvers = {
	totalDistance: (log, routine) => rowMetric(log, routine, (row) => row.dynamicDistanceMeters) ?? log.totalDistance ?? log.diveDistance ?? 0,
	diveDistance: (log, routine) => rowMetric(log, routine, (row) => row.dynamicDistanceMeters) ?? log.totalDistance ?? log.diveDistance ?? 0,
	cumulativeDistance: (log, routine) => {
		const rowDistance = rowMetric(log, routine, (row) => row.dynamicDistanceMeters);
		if (rowDistance !== undefined) return rowDistance;
		if (log.cumulativeDistance) return log.cumulativeDistance;
		if (log.laps && log.laps.length > 0) {
			return log.laps.reduce((sum, lap) => sum + (lap.distanceMeters || 0), 0);
		}
		return calculateTotalRepDistance(log);
	},
	totalTime: (log, routine) => rowMetric(log, routine, (row) => row.totalDurationSeconds) ?? log.totalTime ?? log.diveDuration ?? 0,
	diveDuration: (log, routine) => rowMetric(log, routine, (row) => row.totalDurationSeconds) ?? log.totalTime ?? log.diveDuration ?? 0,
	repsCompleted: (log, routine) => rowMetric(log, routine, (row) => row.completedCount) ?? log.repsCompleted ?? log.summary?.repsCompleted ?? 0,
	totalRepDistance: (log, routine) => rowMetric(log, routine, (row) => row.dynamicDistanceMeters) ?? calculateTotalRepDistance(log),
	repDuration: (log) => log.repDuration || 0,
	holdDuration: (log, routine) => rowMetric(log, routine, (row) => row.longestHoldSeconds) ?? log.repDuration ?? log.totalTime ?? log.diveDuration ?? 0,
	lapDistance: (log) => log.repDistance || 0,
	avgTimePerLap: (log, routine) => averageRowDuration(log, routine) ?? calculateAvgTimePerLap(log),
	avgTimePerRep: (log, routine) => averageRowDuration(log, routine) ?? calculateAvgTimePerLap(log),
	avgRestBetweenLaps: (log, routine) => averageRowRest(log, routine) ?? calculateAvgRestBetweenLaps(log),
	totalBreathHoldTime: (log, routine) => resolveCumulativeHoldTime(log, routine),
	cumulativeHoldTime: (log, routine) => resolveCumulativeHoldTime(log, routine),
	longestHold: (log, routine) => rowMetric(log, routine, (row) => row.longestHoldSeconds) ?? log.longestHold ?? maxLapValue(log, (lap) => lap.timeSeconds) ?? 0,
	totalBreathingTime: (log, routine) => rowMetric(log, routine, (row) => row.totalRestSeconds) ?? calculateTotalBreathingTime(log),
	sessionDuration: (log, routine) => rowSessionDuration(log, routine) ?? log.sessionDuration ?? log.totalTime ?? log.diveDuration ?? 0,
	totalBreaths: (log) => calculateTotalBreaths(log),
	poolLength: (log) => log.poolLength || 0,
	initialBreatheUpTime: (log) => log.initialBreatheUpTime || 0,
	waterTemperature: (log) => log.waterTemperature || 0,
	contractionsOnsetTime: (log) => log.contractionsOnsetTime || 0,
	restingHeartRate: (log) => log.restingHeartRate || 0,
	hrv: (log) => log.hrv || 0,
	packingVolume: (log) => log.packingVolume || 0,
	minimumSpO2: (log) => log.minimumSpO2 ?? log.lowestSpO2 ?? minLapValue(log, (lap) => lap.spo2Min) ?? 0,
	minimumHR: (log) => log.minimumHR ?? log.sessionMinHR ?? minLapValue(log, (lap) => lap.hrMin) ?? 0,
	timeBelowSpO2Threshold: (log) => log.totalTimeBelow70 ?? sumLapValue(log, (lap) => lap.timeBelow70),
	kicksPerLap: (log) => averageLapValue(log, (lap) => lap.kicks),
	averageKicksPerLap: (log) => averageLapValue(log, (lap) => lap.kicks),
	armPullsPerLap: (log) => averageLapValue(log, (lap) => lap.armPulls),
	averageArmPullsPerLap: (log) => averageLapValue(log, (lap) => lap.armPulls),
	fvcLiters: (log) => log.fvc ?? 0,
	fvcWithPackingLiters: (log) => log.fvcWithPacking ?? 0,
	endSpO2: (log) => log.endSpO2 ?? 0,
	recoveryQuality: (log) => log.recoveryQuality ?? 0,
	urgeToBreathe: (log) => log.urgeToBreathe ?? 0,
	lucidity: (log) => log.lucidity ?? 0,
	contractions: (log) => log.contractions ?? 0,
	avgSpeed: (log, routine) => rowMetric(log, routine, (row) => row.averageDynamicSpeedMs) ?? log.avgSpeedMs ?? log.avgSpeed ?? calculateAvgSpeed(log),
	avgSpeedMs: (log, routine) => rowMetric(log, routine, (row) => row.averageDynamicSpeedMs) ?? log.avgSpeedMs ?? log.avgSpeed ?? calculateAvgSpeed(log),
	maxRepSpeed: (log) => log.fastestLapSpeedMs ?? log.maxRepSpeed ?? maxLapValue(log, speedForLap) ?? 0,
	fastestLapSpeedMs: (log) => log.fastestLapSpeedMs ?? log.maxRepSpeed ?? maxLapValue(log, speedForLap) ?? 0,
	minRepSpeed: (log) => log.slowestLapSpeedMs ?? log.minRepSpeed ?? minLapValue(log, speedForLap) ?? 0,
	slowestLapSpeedMs: (log) => log.slowestLapSpeedMs ?? log.minRepSpeed ?? minLapValue(log, speedForLap) ?? 0,
	breathingTechnique: zeroMetric,
	equipment: zeroMetric,
	facialGear: zeroMetric,
	gasMix: zeroMetric,
	safetyOutcome: zeroMetric,
	lungVolume: zeroMetric,
	competitionStatus: zeroMetric,
	cardColor: zeroMetric,
	recordTag: zeroMetric
} satisfies Record<MetricType, MetricValueResolver>;

const formattedMetricResolvers: Partial<Record<MetricType, FormattedMetricResolver>> = {
	breathingTechnique: (log, _routine, label) => {
		if (log.breathingTechniqueLevel !== undefined && log.breathingTechniqueLevel !== null) {
			const level = log.breathingTechniqueLevel;
			let technique: string;
			if (level === 0) technique = 'Tidal';
			else if (level < 0) technique = `Hypoventilation (${level})`;
			else technique = `Hyperventilation (+${level})`;
			return { value: technique, label };
		}

		return { value: log.breathingTechnique || '—', label };
	},
	equipment: (log, _routine, label) => ({ value: log.equipmentUsed || '—', label }),
	facialGear: (log, _routine, label) => ({ value: log.facialGear?.join(', ') || '—', label }),
	gasMix: (log, _routine, label) => ({
		value: log.gasMix || log.attemptConditions?.gasMix || log.attemptConditions?.breathingGas || '—',
		label
	}),
	safetyOutcome: (log, _routine, label) => {
		if (log.sambaBO === undefined) return { value: '—', label };
		return { value: log.sambaBO ? 'Samba/BO' : 'Clean', label };
	},
	lungVolume: (log, _routine, label) => ({
		value: log.defaultLungVolume ?? log.laps?.find((lap) => lap.lungVolume)?.lungVolume ?? '—',
		label
	}),
	competitionStatus: (log, _routine, label) => ({ value: log.isCompetition ? 'Competition' : 'Training', label }),
	cardColor: (log, _routine, label) => ({ value: log.cardTag ?? '—', label }),
	recordTag: (log, _routine, label) => ({ value: log.recordTag ?? '—', label })
};

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
	return metricValueResolvers[metricType](log, routine);
}

function resolveCumulativeHoldTime(log: RoutineLog, routine: RoutineTemplate): number {
	const rowHold = rowMetric(log, routine, (row) => row.cumulativeHoldSeconds);
	if (rowHold !== undefined) return rowHold;
	if (log.cumulativeHoldTime) return log.cumulativeHoldTime;
	if (log.laps && log.laps.length > 0) {
		return log.laps.reduce((sum, lap) => sum + (lap.timeSeconds || 0), 0);
	}
	return calculateTotalBreathHoldTime(log, routine);
}

function rowMetric(
	log: RoutineLog,
	routine: RoutineTemplate,
	selector: (readModel: ReturnType<typeof buildRoutineLogResultReadModel>) => number | undefined
): number | undefined {
	const readModel = buildRoutineLogResultReadModel(log, routine);
	if (!readModel.hasRowResults) return undefined;
	return selector(readModel);
}

function averageRowDuration(log: RoutineLog, routine: RoutineTemplate): number | undefined {
	const readModel = buildRoutineLogResultReadModel(log, routine);
	if (!readModel.hasRowResults || !readModel.completedCount || readModel.totalDurationSeconds === undefined) return undefined;
	return readModel.totalDurationSeconds / readModel.completedCount;
}

function averageRowRest(log: RoutineLog, routine: RoutineTemplate): number | undefined {
	const readModel = buildRoutineLogResultReadModel(log, routine);
	if (!readModel.hasRowResults || !readModel.completedCount || readModel.totalRestSeconds === undefined) return undefined;
	return readModel.totalRestSeconds / readModel.completedCount;
}

function rowSessionDuration(log: RoutineLog, routine: RoutineTemplate): number | undefined {
	const readModel = buildRoutineLogResultReadModel(log, routine);
	if (!readModel.hasRowResults) return undefined;
	return (readModel.totalDurationSeconds ?? 0) + (readModel.totalRestSeconds ?? 0) || undefined;
}

function zeroMetric(): number {
	return 0;
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
	const metric = getMetricRegistryEntry(metricType);

	switch (metric.valueKind) {
		case 'distance':
			return `${value}m`;
		case 'time':
			return formatTime(value);
		case 'count':
			return value.toString();
		case 'speed':
			return `${value.toFixed(2)} m/s`;
		case 'temperature':
			return `${value}°C`;
		case 'heartRate':
			return `${value} bpm`;
		case 'volume':
			return `${value.toFixed(1)}L`;
		case 'variability':
			return `${value}ms`;
		case 'percent':
			return `${value.toFixed(0)}%`;
		case 'scale':
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
	const formattedResolver = formattedMetricResolvers[metricType];
	if (formattedResolver) return formattedResolver(log, routine, label);

	const rawValue = getMetricValue(metricType, log, routine);
	const formattedValue = formatMetricValue(metricType, rawValue);

	return {
		value: formattedValue,
		label
	};
}
