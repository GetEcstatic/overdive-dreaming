import type { RoutineAuthoringLayer } from './model';

export type RoutineLayerExample = {
	id: string;
	name: string;
	purpose: string;
	layers: RoutineAuthoringLayer[];
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
			discipline: 'DYN',
			disciplineSelectionMode: 'log-time-selectable',
			allowedDisciplines: ['DYN', 'DYNB', 'DNF', 'TORT'],
			breatheUp: openDuration,
			dive: {
				duration: openDuration,
				distance: openDistance
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
	]
};

export const staticMaxExample: RoutineLayerExample = {
	id: 'static-max',
	name: 'Static Max',
	purpose: 'Measure best static apnea hold duration.',
	layers: [
		{
			id: 'static-max-layer-1',
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
	]
};

export const starterMaxRoutineExamples = [dynamicMaxExample, staticMaxExample] as const;