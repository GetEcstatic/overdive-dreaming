import type { CanonicalMetricKey, DisplayMetricSuggestion, RoutineAuthoringLayer } from './model';
import type { RoutineTemplate } from '$lib/types';

export type RoutineLayerExample = {
	id: string;
	name: string;
	purpose: string;
	layers: RoutineAuthoringLayer[];
	standardMetrics: CanonicalMetricKey[];
	geekMetrics: CanonicalMetricKey[];
	display: DisplayMetricSuggestion;
	defaultTags: string[];
	selectableTags: string[];
	safetyContext: string[];
};

const openDuration = { mode: 'open' } as const;
const openDistance = { mode: 'open' } as const;

export const dynamicMaxExample: RoutineLayerExample = {
	id: 'dynamic-max',
	name: 'Dynamic Max',
	purpose: 'Measure best dynamic performance by distance and duration.',
	layers: [
		{
			id: 'dynamic-max-layer-1',
			name: 'Max attempt',
			discipline: 'DYN',
			disciplineSelectionMode: 'log-time-selectable',
			allowedDisciplines: ['DYN', 'DYNB', 'DNF', 'TORT'],
			breatheUp: openDuration,
			dive: {
				duration: openDuration,
				distance: openDistance
			},
			diveCapabilities: ['recording-link'],
			attributes: {
				lungVolume: 'FL',
				effort: 'max',
				environment: 'wet',
				repeatCount: 1
			},
			analyticsRole: 'max-attempt',
			locks: {}
		}
	],
	standardMetrics: ['distanceMeters', 'durationSeconds', 'poolLengthMeters', 'notes', 'safetyOutcome', 'breatheUpSeconds', 'rpe', 'joyScale', 'basalMood', 'buddyName'],
	geekMetrics: ['lapTimes', 'speedPerLap', 'kicksPerLap', 'heartRateSeries', 'spO2Series', 'minHeartRate', 'minSpO2', 'breathingTechnique', 'hoursSinceLastMeal', 'waterTemperatureCelsius', 'hrv', 'restingHeartRate', 'equipment', 'facialGear', 'bodyWeightKg', 'fvcLiters', 'fvcWithPackingLiters', 'packingVolumePercent'],
	display: { hero: 'distanceMeters', secondary: 'durationSeconds', tertiary: 'speedPerLap' },
	defaultTags: ['max', 'dynamic'],
	selectableTags: ['pb-attempt', 'competition', 'technique', 'fun', 'experimental'],
	safetyContext: ['buddyName', 'safetyOutcome']
};

export const staticMaxExample: RoutineLayerExample = {
	id: 'static-max',
	name: 'Static Max',
	purpose: 'Measure best static apnea hold duration.',
	layers: [
		{
			id: 'static-max-layer-1',
			name: 'Static max attempt',
			discipline: 'STA',
			disciplineSelectionMode: 'fixed',
			breatheUp: openDuration,
			dive: {
				duration: openDuration
			},
			attributes: {
				lungVolume: 'FL',
				effort: 'max',
				environment: 'wet',
				repeatCount: 1
			},
			analyticsRole: 'max-attempt',
			locks: {}
		}
	],
	standardMetrics: ['durationSeconds', 'notes', 'safetyOutcome', 'breatheUpSeconds', 'rpe', 'joyScale', 'basalMood', 'buddyName'],
	geekMetrics: ['heartRateSeries', 'spO2Series', 'minHeartRate', 'minSpO2', 'breathingTechnique', 'hoursSinceLastMeal', 'waterTemperatureCelsius', 'hrv', 'restingHeartRate', 'equipment', 'facialGear', 'bodyWeightKg', 'fvcLiters', 'fvcWithPackingLiters', 'packingVolumePercent', 'contractionsOnsetSeconds'],
	display: { hero: 'durationSeconds', secondary: 'breathingTechnique', tertiary: 'minHeartRate' },
	defaultTags: ['max', 'static'],
	selectableTags: ['pb-attempt', 'competition', 'dry', 'wet', 'experimental'],
	safetyContext: ['buddyName', 'safetyOutcome']
};

export const o2StaticMaxExample: RoutineLayerExample = {
	id: 'o2-static-max',
	name: 'O2 Assisted Static Max',
	purpose: 'Measure O2-assisted static apnea hold duration with gas and physiology context.',
	layers: [
		{
			id: 'o2-static-max-layer-1',
			name: 'O2 assisted static max attempt',
			discipline: 'O2STA',
			disciplineSelectionMode: 'fixed',
			breatheUp: openDuration,
			dive: {
				duration: openDuration
			},
			attributes: {
				lungVolume: 'FL',
				effort: 'max',
				environment: 'wet',
				repeatCount: 1
			},
			analyticsRole: 'max-attempt',
			locks: {}
		}
	],
	standardMetrics: ['durationSeconds', 'breatheUpSeconds', 'rpe', 'joyScale', 'basalMood', 'buddyName', 'safetyOutcome', 'notes'],
	geekMetrics: ['gasMix', 'endSpO2', 'recoveryQuality', 'lucidity', 'urgeToBreathe', 'contractions', 'heartRateSeries', 'spO2Series', 'minHeartRate', 'minSpO2', 'breathingTechnique', 'hoursSinceLastMeal', 'hrv', 'restingHeartRate', 'equipment', 'facialGear', 'bodyWeightKg', 'fvcLiters', 'fvcWithPackingLiters', 'packingVolumePercent', 'contractionsOnsetSeconds'],
	display: { hero: 'durationSeconds', secondary: 'gasMix', tertiary: 'endSpO2' },
	defaultTags: ['static', 'o2', 'max'],
	selectableTags: ['pb-attempt', 'experimental', 'wet', 'dry'],
	safetyContext: ['buddyName', 'safetyOutcome', 'gasMix']
};

export const dynamicSweet16Example: RoutineLayerExample = {
	id: 'dynamic-sweet-16',
	name: 'Dynamic Sweet 16',
	purpose: 'Repeated dynamic work for CO2 and endurance tolerance.',
	layers: [
		{
			id: 'dynamic-sweet-16-layer-1',
			name: '16 dynamic reps',
			discipline: 'DYN',
			disciplineSelectionMode: 'fixed',
			breatheUp: openDuration,
			dive: {
				duration: openDuration,
				distance: openDistance
			},
			attributes: {
				lungVolume: 'FL',
				effort: 'standard',
				environment: 'wet',
				repeatCount: 16
			},
			analyticsRole: 'working-rep',
			locks: {}
		}
	],
	standardMetrics: ['repsCompleted', 'distanceMeters', 'totalRoutineTimeSeconds', 'restSeconds', 'notes'],
	geekMetrics: ['lapTimes', 'speedPerLap', 'kicksPerLap', 'heartRateSeries', 'minHeartRate', 'minSpO2', 'breathingTechnique', 'hoursSinceLastMeal', 'waterTemperatureCelsius', 'hrv', 'restingHeartRate', 'equipment', 'facialGear', 'bodyWeightKg', 'fvcLiters', 'fvcWithPackingLiters', 'packingVolumePercent', 'cumulativeDiveTimeSeconds', 'cumulativeRestSeconds'],
	display: { hero: 'totalRoutineTimeSeconds', secondary: 'distanceMeters', tertiary: 'speedPerLap' },
	defaultTags: ['co2', 'endurance', 'dynamic'],
	selectableTags: ['technique', 'co2-training', 'resilience', 'lactic-training', 'hard', 'easy', 'experimental'],
	safetyContext: ['poolLengthMeters', 'buddyName', 'safetyOutcome']
};

export const staticTwoBreathTableExample: RoutineLayerExample = {
	id: 'static-two-breath-table',
	name: 'Static 2-Breath Table',
	purpose: 'Static table using constrained two-breath recovery.',
	layers: [
		{
			id: 'static-two-breath-table-layer-1',
			name: 'Initial breathe-up and hold',
			discipline: 'STA',
			disciplineSelectionMode: 'fixed',
			breatheUp: { mode: 'fixed', seconds: 240 },
			dive: {
				duration: { mode: 'fixed', seconds: 90 }
			},
			attributes: {
				lungVolume: 'FL',
				effort: 'standard',
				environment: 'wet',
				repeatCount: 1
			},
			analyticsRole: 'warmup',
			locks: {}
		},
		{
			id: 'static-two-breath-table-layer-2',
			name: '2-breath reps',
			discipline: 'STA',
			disciplineSelectionMode: 'fixed',
			breatheUp: { mode: 'fixed', seconds: 30 },
			dive: {
				duration: { mode: 'fixed', seconds: 90 }
			},
			attributes: {
				lungVolume: 'FL',
				effort: 'standard',
				environment: 'wet',
				repeatCount: 9
			},
			analyticsRole: 'working-rep',
			locks: {}
		}
	],
	standardMetrics: ['repsCompleted', 'durationSeconds', 'cumulativeDiveTimeSeconds', 'notes'],
	geekMetrics: ['contractionsOnsetSeconds', 'spO2Series', 'heartRateSeries', 'timeBelowSpO2Threshold', 'minSpO2', 'minHeartRate'],
	display: { hero: 'cumulativeDiveTimeSeconds', secondary: 'longestHoldSeconds', tertiary: 'repsCompleted' },
	defaultTags: ['co2', 'static', 'table'],
	selectableTags: ['rv', 'frc', 'submax', 'technique', 'hard', 'easy'],
	safetyContext: ['buddyName', 'safetyOutcome']
};

export const dryRvTableExample: RoutineLayerExample = {
	id: 'dry-rv-table',
	name: 'Dry RV Table',
	purpose: 'Dry residual-volume static table with physiology tracking.',
	layers: [
		{
			id: 'dry-rv-table-layer-1',
			name: 'Dry RV reps',
			discipline: 'STA',
			disciplineSelectionMode: 'fixed',
			breatheUp: openDuration,
			dive: {
				duration: openDuration
			},
			attributes: {
				lungVolume: 'RV',
				effort: 'standard',
				environment: 'dry',
				repeatCount: 8
			},
			analyticsRole: 'working-rep',
			locks: {}
		}
	],
	standardMetrics: ['durationSeconds', 'repsCompleted', 'minSpO2', 'minHeartRate', 'notes'],
	geekMetrics: ['spO2Series', 'heartRateSeries', 'timeBelowSpO2Threshold', 'contractionsOnsetSeconds'],
	display: { hero: 'longestHoldSeconds', secondary: 'cumulativeDiveTimeSeconds', tertiary: 'timeBelowSpO2Threshold' },
	defaultTags: ['dry', 'rv', 'static', 'table'],
	selectableTags: ['max', 'submax', 'o2', 'co2', 'experimental'],
	safetyContext: ['sensorAvailability', 'notes']
};

export const defaultRoutineExamples = [
	dynamicMaxExample,
	staticMaxExample,
	o2StaticMaxExample,
	dynamicSweet16Example,
	staticTwoBreathTableExample,
	dryRvTableExample
] as const;

export const starterMaxRoutineExamples = [dynamicMaxExample, staticMaxExample] as const;

const defaultRoutineExampleMatches: Record<string, RoutineLayerExample> = {
	'system-dynamic-max': dynamicMaxExample,
	'system-static-max': staticMaxExample,
	'system-o2-static-max': o2StaticMaxExample,
	'system-o2-assisted-static': o2StaticMaxExample,
	'system-sweet-16': dynamicSweet16Example,
	'system-gentle-2-breath': staticTwoBreathTableExample,
	'system-rv-breath-hold': dryRvTableExample
};

const defaultRoutineNameMatches: Record<string, RoutineLayerExample> = {
	'dynamic max': dynamicMaxExample,
	'dynamic max attempt': dynamicMaxExample,
	'static max': staticMaxExample,
	'static max attempt': staticMaxExample,
	'o2 assisted static max': o2StaticMaxExample,
	'o2-assisted static max': o2StaticMaxExample,
	'o2 assisted static': o2StaticMaxExample,
	'o2-assisted static': o2StaticMaxExample,
	'dynamic sweet 16': dynamicSweet16Example,
	'sweet 16': dynamicSweet16Example,
	'static 2-breath table': staticTwoBreathTableExample,
	'gentle 2-breath': staticTwoBreathTableExample,
	'gentle 2-breath table': staticTwoBreathTableExample,
	'dry rv table': dryRvTableExample,
	'rv breath hold': dryRvTableExample
};

export function findDefaultRoutineLayerExample(routine: Pick<RoutineTemplate, 'id' | 'name'>): RoutineLayerExample | undefined {
	return defaultRoutineExampleMatches[routine.id] ?? defaultRoutineNameMatches[routine.name.trim().toLowerCase()];
}