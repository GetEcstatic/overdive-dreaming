import type { Discipline } from '$lib/types';
import type { RoutineLayerExample } from '$lib/routineLayers/defaults';
import {
	dynamicMaxExample,
	dynamicSweet16Example,
	staticMaxExample,
	staticTwoBreathTableExample
} from '$lib/routineLayers/defaults';

export type PublicPresetKind = 'max-attempt' | 'co2-table' | 'increasing-intervals';

export type PublicRoutinePreset = {
	id: string;
	name: string;
	kind: PublicPresetKind;
	disciplines: Discipline[];
	description: string;
	coachingCue: string;
	shareEmphasis: 'time' | 'distance' | 'completion';
	example: RoutineLayerExample;
};

const fixedDuration = (seconds: number) => ({ mode: 'fixed' as const, seconds });
const fixedDistance = (meters: number) => ({ mode: 'fixed' as const, meters });
const openDuration = { mode: 'open' as const };

export const increasingStaticIntervalsExample: RoutineLayerExample = {
	id: 'public-increasing-static-intervals',
	name: 'Increasing Static Intervals',
	purpose: 'Build confidence with progressively longer static holds.',
	layers: [60, 75, 90, 105, 120].map((seconds, index) => ({
		id: `public-increasing-static-layer-${index + 1}`,
		name: `${Math.round(seconds / 60 * 10) / 10} min hold`,
		discipline: 'STA',
		disciplineSelectionMode: 'fixed',
		breatheUp: fixedDuration(index === 0 ? 180 : 60),
		dive: { duration: fixedDuration(seconds) },
		attributes: {
			lungVolume: 'FL',
			effort: 'standard',
			environment: 'wet',
			repeatCount: 1
		},
		analyticsRole: index === 0 ? 'warmup' : 'working-rep',
		locks: {}
	})),
	standardMetrics: ['repsCompleted', 'durationSeconds', 'cumulativeDiveTimeSeconds', 'notes'],
	geekMetrics: ['heartRateSeries', 'spO2Series', 'minHeartRate', 'minSpO2', 'contractionsOnsetSeconds'],
	display: { hero: 'cumulativeDiveTimeSeconds', secondary: 'longestHoldSeconds', tertiary: 'repsCompleted' },
	defaultTags: ['static', 'intervals', 'beginner'],
	selectableTags: ['easy', 'hard', 'technique'],
	safetyContext: ['buddyName', 'safetyOutcome']
};

export const increasingDynamicIntervalsExample: RoutineLayerExample = {
	id: 'public-increasing-dynamic-intervals',
	name: 'Increasing Dynamic Intervals',
	purpose: 'Build dynamic distance gradually across a simple ladder.',
	layers: [25, 50, 75, 100].map((meters, index) => ({
		id: `public-increasing-dynamic-layer-${index + 1}`,
		name: `${meters}m dynamic`,
		discipline: 'DYN',
		disciplineSelectionMode: 'log-time-selectable',
		allowedDisciplines: ['DYN', 'DYNB', 'DNF'],
		breatheUp: fixedDuration(index === 0 ? 120 : 90),
		dive: {
			duration: openDuration,
			distance: fixedDistance(meters)
		},
		diveCapabilities: ['recording-link'],
		attributes: {
			lungVolume: 'FL',
			effort: 'standard',
			environment: 'wet',
			repeatCount: 1
		},
		analyticsRole: index === 0 ? 'warmup' : 'working-rep',
		locks: {}
	})),
	standardMetrics: ['repsCompleted', 'distanceMeters', 'durationSeconds', 'poolLengthMeters', 'notes'],
	geekMetrics: ['lapTimes', 'speedPerLap', 'kicksPerLap', 'heartRateSeries', 'minHeartRate', 'minSpO2'],
	display: { hero: 'distanceMeters', secondary: 'durationSeconds', tertiary: 'speedPerLap' },
	defaultTags: ['dynamic', 'intervals', 'beginner'],
	selectableTags: ['technique', 'easy', 'hard'],
	safetyContext: ['poolLengthMeters', 'buddyName', 'safetyOutcome']
};

export const publicRoutinePresets: PublicRoutinePreset[] = [
	{
		id: 'dynamic-max',
		name: 'Dynamic Max',
		kind: 'max-attempt',
		disciplines: ['DYN', 'DYNB', 'DNF'],
		description: 'A single best-distance dynamic attempt.',
		coachingCue: 'Pick your pool length, record the attempt, and save the clean result.',
		shareEmphasis: 'distance',
		example: dynamicMaxExample
	},
	{
		id: 'static-max',
		name: 'Static Max',
		kind: 'max-attempt',
		disciplines: ['STA'],
		description: 'A single best-time static apnea attempt.',
		coachingCue: 'Log the hold time and how it felt afterwards.',
		shareEmphasis: 'time',
		example: staticMaxExample
	},
	{
		id: 'static-two-breath-co2',
		name: 'Two-Breath Static CO2',
		kind: 'co2-table',
		disciplines: ['STA'],
		description: 'A constrained-breath static table with repeated 90 second holds.',
		coachingCue: 'Keep recovery calm and consistent between holds.',
		shareEmphasis: 'completion',
		example: staticTwoBreathTableExample
	},
	{
		id: 'dynamic-sweet-16-co2',
		name: 'Dynamic Sweet 16 CO2',
		kind: 'co2-table',
		disciplines: ['DYN'],
		description: 'Sixteen repeated dynamic reps for CO2 and endurance tolerance.',
		coachingCue: 'Stay smooth and repeatable rather than chasing one hard rep.',
		shareEmphasis: 'completion',
		example: dynamicSweet16Example
	},
	{
		id: 'increasing-static-intervals',
		name: 'Increasing Static Intervals',
		kind: 'increasing-intervals',
		disciplines: ['STA'],
		description: 'A simple static ladder with holds that get longer each round.',
		coachingCue: 'Stop before form or relaxation falls apart.',
		shareEmphasis: 'time',
		example: increasingStaticIntervalsExample
	},
	{
		id: 'increasing-dynamic-intervals',
		name: 'Increasing Dynamic Intervals',
		kind: 'increasing-intervals',
		disciplines: ['DYN', 'DYNB', 'DNF'],
		description: 'A dynamic distance ladder for building confidence across reps.',
		coachingCue: 'Use the early reps to settle pace before the longer swims.',
		shareEmphasis: 'distance',
		example: increasingDynamicIntervalsExample
	}
];

export function getPublicRoutinePreset(id: string): PublicRoutinePreset | undefined {
	return publicRoutinePresets.find((preset) => preset.id === id);
}