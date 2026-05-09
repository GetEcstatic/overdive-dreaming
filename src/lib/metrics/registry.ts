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
	| 'volume'
	| 'temperature'
	| 'heartRate'
	| 'variability'
	| 'percent'
	| 'scale'
	| 'status'
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

export type MetricSelectionOption = {
	value: MetricType;
	label: string;
	category: MetricCategory;
	description: string;
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
	entry('minimumSpO2', 'Minimum SpO2', 'Min SpO2', 'biometrics', 'percent', '%', ['minSpO2'], ['trackMinimumSpO2', 'trackPerRepSpO2'], 'Lowest SpO2 recorded for the session or across reps.'),
	entry('minimumHR', 'Minimum HR', 'Min HR', 'biometrics', 'heartRate', 'bpm', ['minHeartRate'], ['trackMinimumHR', 'trackPerRepHR'], 'Lowest heart rate recorded for the session or across reps.'),
	entry('timeBelowSpO2Threshold', 'Time Below SpO2', 'Below SpO2', 'biometrics', 'time', 'seconds', ['timeBelowSpO2Threshold'], ['trackSpO2Thresholds'], 'Time spent below the configured or standard SpO2 threshold.', true),
	entry('kicksPerLap', 'Kicks Per Lap', 'Kicks', 'technique', 'count', 'count', ['kicksPerLap'], ['trackKicksPerLap'], 'Kicks recorded for a lap or rep.', true),
	entry('armPullsPerLap', 'Arm Pulls Per Lap', 'Pulls', 'technique', 'count', 'count', ['armPullsPerLap'], ['trackArmPullsPerLap'], 'Arm pulls recorded for a lap or rep.', true),
	entry('averageKicksPerLap', 'Average Kicks', 'Avg Kicks', 'technique', 'count', 'count', ['kicksPerLap'], ['trackKicksPerLap'], 'Average kicks across recorded laps or reps.', true),
	entry('averageArmPullsPerLap', 'Average Arm Pulls', 'Avg Pulls', 'technique', 'count', 'count', ['armPullsPerLap'], ['trackArmPullsPerLap'], 'Average arm pulls across recorded laps or reps.', true),
	entry('equipment', 'Equipment', 'Equipment', 'context', 'text', 'text', ['equipment'], ['trackEquipmentUsed'], 'Equipment used for the routine or session.'),
	entry('facialGear', 'Facial Gear', 'Facial Gear', 'context', 'text', 'text', ['facialGear'], ['trackFacialGear'], 'Mask, goggles, noseclip, or other facial gear used.'),
	entry('fvcLiters', 'FVC', 'FVC', 'biometrics', 'volume', 'L', ['fvcLiters'], ['trackFVC'], 'Forced vital capacity in liters.'),
	entry('fvcWithPackingLiters', 'FVC With Packing', 'FVC Packed', 'biometrics', 'volume', 'L', ['fvcWithPackingLiters'], ['trackFVCWithPacking'], 'Forced vital capacity with packing in liters.'),
	entry('gasMix', 'Gas Mix', 'Gas', 'context', 'text', 'text', ['gasMix'], ['trackGasMix'], 'Breathing gas mix used before the hold.'),
	entry('endSpO2', 'End SpO2', 'End SpO2', 'biometrics', 'percent', '%', ['endSpO2'], ['trackEndSpO2'], 'SpO2 at the end of the hold.'),
	entry('recoveryQuality', 'Recovery Quality', 'Recovery', 'recovery', 'scale', 'scale', ['recoveryQuality'], ['trackRecoveryQuality'], 'Recovery breathing quality rating.'),
	entry('urgeToBreathe', 'Urge To Breathe', 'Urge', 'biometrics', 'scale', 'scale', ['urgeToBreathe'], ['trackUrgeToBreathe'], 'Urge-to-breathe intensity rating.', true),
	entry('lucidity', 'Lucidity', 'Lucidity', 'biometrics', 'scale', 'scale', ['lucidity'], ['trackLucidity'], 'Mental clarity rating during the hold.'),
	entry('contractions', 'Contractions Intensity', 'Contractions', 'biometrics', 'scale', 'scale', ['contractions'], ['trackContractions'], 'Contractions intensity rating.', true),
	entry('safetyOutcome', 'Safety Outcome', 'Safety', 'context', 'text', 'text', ['safetyOutcome'], ['trackSambaBO'], 'Safety outcome or samba/BO status for the session.'),
	entry('lungVolume', 'Lung Volume', 'Lung Volume', 'context', 'text', 'text', ['lungVolume'], ['trackLungVolume'], 'Starting lung volume used for the routine or rep.'),
	entry('competitionStatus', 'Competition Status', 'Competition', 'context', 'status', 'status', ['competitionStatus'], ['trackCompetitionStatus'], 'Competition vs training status for comparison.'),
	entry('cardColor', 'Card Color', 'Card', 'context', 'status', 'status', ['cardColor'], ['trackCardColor'], 'White, yellow, or red card result for max attempts.'),
	entry('recordTag', 'Record Tag', 'Record', 'context', 'status', 'status', ['recordTag'], ['trackRecordTag'], 'NR, CR, or WR record tag for max attempts.'),
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
	minSpO2: 'minimumSpO2',
	minHeartRate: 'minimumHR',
	timeBelowSpO2Threshold: 'timeBelowSpO2Threshold',
	kicksPerLap: 'averageKicksPerLap',
	armPullsPerLap: 'averageArmPullsPerLap',
	equipment: 'equipment',
	facialGear: 'facialGear',
	fvcLiters: 'fvcLiters',
	fvcWithPackingLiters: 'fvcWithPackingLiters',
	gasMix: 'gasMix',
	endSpO2: 'endSpO2',
	recoveryQuality: 'recoveryQuality',
	urgeToBreathe: 'urgeToBreathe',
	lucidity: 'lucidity',
	contractions: 'contractions',
	safetyOutcome: 'safetyOutcome',
	lungVolume: 'lungVolume',
	competitionStatus: 'competitionStatus',
	cardColor: 'cardColor',
	recordTag: 'recordTag',
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

export function isRegisteredMetricType(metricType: unknown): metricType is MetricType {
	return typeof metricType === 'string' && metricType in metricRegistryByKey;
}

export function metricTypeForCanonicalKey(canonicalKey: CanonicalMetricKey | undefined): MetricType | undefined {
	return canonicalKey ? canonicalToMetricType.get(canonicalKey) : undefined;
}

export function isTimeMetricType(metricType: MetricType): boolean {
	return getMetricRegistryEntry(metricType).valueKind === 'time';
}

export function getSelectableMetricOptionsForTrackingConfig(trackingConfig: TrackingConfig | undefined): MetricSelectionOption[] {
	return metricRegistry
		.filter((metric) => !trackingConfig || metric.trackingFlags.some((flag) => trackingConfig[flag] === true))
		.map((metric) => ({
			value: metric.key,
			label: metric.label,
			category: metric.category,
			description: metric.description
		}));
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
