import type { MetricType, TrackingConfig } from '$lib/types';
import type { CanonicalMetricKey } from '$lib/routineLayers/model';

export type MetricCategory =
	| 'performance'
	| 'workload'
	| 'technique'
	| 'biometrics'
	| 'environment'
	| 'recovery'
	| 'context';

export type MetricValueKind =
	| 'distance'
	| 'time'
	| 'count'
	| 'speed'
	| 'temperature'
	| 'heartRate'
	| 'variability'
	| 'percent'
	| 'text';

export type MetricRegistryEntry = {
	key: MetricType;
	label: string;
	shortLabel: string;
	category: MetricCategory;
	valueKind: MetricValueKind;
	unit: string;
	canonicalKeys: CanonicalMetricKey[];
	trackingFlags: (keyof TrackingConfig)[];
	description: string;
	lowerIsBetter?: boolean;
};

export const metricRegistry = [
	entry('totalDistance', 'Distance', 'Distance', 'performance', 'distance', 'm', ['distanceMeters'], ['trackTotalDistance'], 'Total distance covered in a single dynamic attempt.'),
	entry('totalTime', 'Time', 'Time', 'performance', 'time', 'seconds', ['durationSeconds'], ['trackTotalTime'], 'Total duration of a single hold or dive.'),
	entry('repsCompleted', 'Reps', 'Reps', 'workload', 'count', 'count', ['repsCompleted'], ['trackRepsCompleted'], 'Number of completed reps.'),
	entry('totalRepDistance', 'Total Rep Distance', 'Rep Distance', 'workload', 'distance', 'm', ['distanceMeters'], ['trackRepDistance'], 'Total distance accumulated across repeated dynamic reps.'),
	entry('repDuration', 'Rep Duration', 'Rep Time', 'performance', 'time', 'seconds', ['durationSeconds'], ['trackRepDuration'], 'Duration of a repeated hold or dynamic rep.'),
	entry('avgTimePerLap', 'Avg Lap Time', 'Lap Time', 'performance', 'time', 'seconds', ['lapTimes'], ['trackTimePerLap'], 'Average time per lap or row.', true),
	entry('avgTimePerRep', 'Avg Rep Time', 'Rep Time', 'performance', 'time', 'seconds', ['lapTimes'], ['trackTimePerLap', 'trackRepDuration'], 'Average time per completed rep.', true),
	entry('avgRestBetweenLaps', 'Rest', 'Rest', 'recovery', 'time', 'seconds', ['restSeconds'], ['trackRestBetweenLaps'], 'Average rest or breathing time between reps.'),
	entry('totalBreathHoldTime', 'Breath Hold Time', 'Hold Total', 'workload', 'time', 'seconds', ['cumulativeDiveTimeSeconds'], ['trackRepDuration'], 'Total breath-hold time accumulated across reps.'),
	entry('totalBreathingTime', 'Breathing Time', 'Breathing', 'recovery', 'time', 'seconds', ['cumulativeRestSeconds'], ['trackRestBetweenLaps'], 'Total breathing or rest time across the routine.'),
	entry('totalBreaths', 'Breaths', 'Breaths', 'recovery', 'count', 'count', [], ['trackBreathsBetweenReps'], 'Estimated total breaths in constrained-breath protocols.'),
	entry('poolLength', 'Pool Length', 'Pool', 'environment', 'distance', 'm', ['poolLengthMeters'], ['trackPoolLength'], 'Pool length used for the session.'),
	entry('initialBreatheUpTime', 'Breathe-up', 'Breathe-up', 'recovery', 'time', 'seconds', ['breatheUpSeconds'], ['trackInitialBreatheUpTime'], 'Initial breathe-up time before the dive or hold.'),
	entry('waterTemperature', 'Water Temperature', 'Water Temp', 'environment', 'temperature', 'degC', ['waterTemperatureCelsius'], ['trackWaterTemperature'], 'Pool or water temperature.'),
	entry('contractionsOnsetTime', 'Contractions', 'Contractions', 'biometrics', 'time', 'seconds', ['contractionsOnsetSeconds'], ['trackContractionsOnsetTime'], 'Time when contractions started.'),
	entry('restingHeartRate', 'Resting HR', 'Resting HR', 'biometrics', 'heartRate', 'bpm', ['restingHeartRate'], ['trackRestingHeartRate'], 'Resting heart rate before the session.', true),
	entry('hrv', 'HRV', 'HRV', 'biometrics', 'variability', 'ms', ['hrv'], ['trackHRV'], 'Heart-rate variability before the session.'),
	entry('packingVolume', 'Packing', 'Packing', 'biometrics', 'percent', '%', ['packingVolumePercent'], ['trackPackingVolume'], 'Packing volume percentage.'),
	entry('diveDuration', 'Dive Duration', 'Duration', 'performance', 'time', 'seconds', ['durationSeconds'], ['trackTotalTime'], 'Clear alias for single-dive duration.'),
	entry('diveDistance', 'Dive Distance', 'Distance', 'performance', 'distance', 'm', ['distanceMeters'], ['trackTotalDistance'], 'Clear alias for single-dive distance.'),
	entry('holdDuration', 'Hold Duration', 'Hold', 'performance', 'time', 'seconds', ['durationSeconds'], ['trackRepDuration', 'trackTotalTime'], 'Clear alias for hold duration.'),
	entry('lapDistance', 'Lap Distance', 'Lap Dist.', 'performance', 'distance', 'm', ['distanceMeters'], ['trackRepDistance'], 'Distance covered in a lap or repeated row.'),
	entry('cumulativeHoldTime', 'Cumulative Hold', 'Hold Total', 'workload', 'time', 'seconds', ['cumulativeDiveTimeSeconds'], ['trackRepDuration'], 'Total hold time accumulated across repeated rows.'),
	entry('cumulativeDistance', 'Cumulative Distance', 'Distance Total', 'workload', 'distance', 'm', ['distanceMeters'], ['trackRepDistance'], 'Total distance accumulated across repeated rows.'),
	entry('sessionDuration', 'Session Duration', 'Session', 'workload', 'time', 'seconds', ['totalRoutineTimeSeconds'], ['trackTotalTime', 'trackRestBetweenLaps'], 'Total elapsed routine/session duration.'),
	entry('longestHold', 'Longest Hold', 'Longest', 'performance', 'time', 'seconds', ['longestHoldSeconds'], ['trackRepDuration', 'trackPerRepSpO2', 'trackPerRepHR'], 'Longest hold found in repeated or biometric rows.'),
	entry('avgSpeed', 'Avg Speed', 'Speed', 'performance', 'speed', 'm/s', ['speedPerLap'], ['trackAvgSpeed'], 'Deprecated alias for average speed.'),
	entry('maxRepSpeed', 'Fastest Rep', 'Fastest', 'performance', 'speed', 'm/s', ['speedPerLap'], ['trackSpeedPerLap'], 'Deprecated alias for fastest rep speed.'),
	entry('minRepSpeed', 'Slowest Rep', 'Slowest', 'performance', 'speed', 'm/s', ['speedPerLap'], ['trackSpeedPerLap'], 'Deprecated alias for slowest rep speed.', true),
	entry('avgSpeedMs', 'Avg Speed', 'Speed', 'performance', 'speed', 'm/s', ['speedPerLap'], ['trackAvgSpeed'], 'Average speed in meters per second.'),
	entry('fastestLapSpeedMs', 'Fastest Lap', 'Fastest', 'performance', 'speed', 'm/s', ['speedPerLap'], ['trackSpeedPerLap'], 'Fastest lap speed in meters per second.'),
	entry('slowestLapSpeedMs', 'Slowest Lap', 'Slowest', 'performance', 'speed', 'm/s', ['speedPerLap'], ['trackSpeedPerLap'], 'Slowest lap speed in meters per second.', true),
	entry('breathingTechnique', 'Breathing Technique', 'Breathing', 'technique', 'text', 'text', ['breathingTechnique'], ['trackBreathingTechnique'], 'Breathing technique or breath-control level used.')
] as const satisfies readonly MetricRegistryEntry[];

export const metricRegistryByKey: Readonly<Record<MetricType, MetricRegistryEntry>> = Object.fromEntries(
	metricRegistry.map((metric) => [metric.key, metric])
) as Record<MetricType, MetricRegistryEntry>;

const preferredMetricTypeByCanonicalKey: Partial<Record<CanonicalMetricKey, MetricType>> = {
	durationSeconds: 'totalTime',
	distanceMeters: 'totalDistance',
	repsCompleted: 'repsCompleted',
	restSeconds: 'avgRestBetweenLaps',
	breatheUpSeconds: 'initialBreatheUpTime',
	lapTimes: 'avgTimePerLap',
	speedPerLap: 'avgSpeedMs',
	breathingTechnique: 'breathingTechnique',
	waterTemperatureCelsius: 'waterTemperature',
	hrv: 'hrv',
	restingHeartRate: 'restingHeartRate',
	packingVolumePercent: 'packingVolume',
	totalRoutineTimeSeconds: 'sessionDuration',
	cumulativeDiveTimeSeconds: 'cumulativeHoldTime',
	longestHoldSeconds: 'longestHold',
	contractionsOnsetSeconds: 'contractionsOnsetTime'
};

const canonicalToMetricType = new Map<CanonicalMetricKey, MetricType>();

for (const metric of metricRegistry) {
	for (const canonicalKey of metric.canonicalKeys) {
		if (!canonicalToMetricType.has(canonicalKey)) {
			canonicalToMetricType.set(canonicalKey, metric.key);
		}
	}
}

for (const [canonicalKey, metricType] of Object.entries(preferredMetricTypeByCanonicalKey)) {
	canonicalToMetricType.set(canonicalKey as CanonicalMetricKey, metricType);
}

export function getMetricRegistryEntry(metricType: MetricType): MetricRegistryEntry {
	return metricRegistryByKey[metricType];
}

export function getMetricLabel(metricType: MetricType): string {
	return getMetricRegistryEntry(metricType).label;
}

export function metricTypeForCanonicalKey(canonicalKey: CanonicalMetricKey | undefined): MetricType | undefined {
	return canonicalKey ? canonicalToMetricType.get(canonicalKey) : undefined;
}

export function isTimeMetricType(metricType: MetricType): boolean {
	return getMetricRegistryEntry(metricType).valueKind === 'time';
}

function entry(
	key: MetricType,
	label: string,
	shortLabel: string,
	category: MetricCategory,
	valueKind: MetricValueKind,
	unit: string,
	canonicalKeys: CanonicalMetricKey[],
	trackingFlags: (keyof TrackingConfig)[],
	description: string,
	lowerIsBetter = false
): MetricRegistryEntry {
	return { key, label, shortLabel, category, valueKind, unit, canonicalKeys, trackingFlags, description, lowerIsBetter };
}
