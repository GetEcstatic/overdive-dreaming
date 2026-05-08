import { describe, expect, it } from 'vitest';
import {
	deriveDefaultTags,
	deriveDisplayMetrics,
	deriveMetricProfile,
	deriveRoutineClassifications,
	expandRoutineLayers,
	groupDiscipline,
	validateRoutineLayers
} from './model';
import { defaultRoutineExamples, dynamicMaxExample, staticMaxExample, staticTwoBreathTableExample } from './defaults';
import { findDefaultRoutineLayerExample } from './defaults';
import type { RoutineAuthoringLayer } from './model';

const openDuration = { mode: 'open' } as const;
const openDistance = { mode: 'open' } as const;

function dynamicMaxLayer(overrides: Partial<RoutineAuthoringLayer> = {}): RoutineAuthoringLayer {
	return {
		id: 'dynamic-max',
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
		locks: {},
		...overrides
	};
}

describe('groupDiscipline', () => {
	it('separates official static, dynamic, and TORT training disciplines', () => {
		expect(groupDiscipline('STA')).toBe('static');
		expect(groupDiscipline('DYN')).toBe('dynamic');
		expect(groupDiscipline('DYNB')).toBe('dynamic');
		expect(groupDiscipline('DNF')).toBe('dynamic');
		expect(groupDiscipline('TORT')).toBe('dynamicTraining');
	});
});

describe('expandRoutineLayers', () => {
	it('keeps a Dynamic Max routine as one loggable row', () => {
		const rows = expandRoutineLayers(dynamicMaxExample.layers);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			planRowId: 'dynamic-max-layer-1:1',
			sourceLayerId: 'dynamic-max-layer-1',
			repIndex: 1,
			globalRowIndex: 1
		});
	});

	it('keeps a Static Max routine as one loggable row', () => {
		const rows = expandRoutineLayers(staticMaxExample.layers);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			planRowId: 'static-max-layer-1:1',
			sourceLayerId: 'static-max-layer-1',
			repIndex: 1,
			globalRowIndex: 1
		});
	});
});

describe('deriveRoutineClassifications', () => {
	it('classifies Dynamic Max as max-like and TORT-capable through allowed choices', () => {
		expect(deriveRoutineClassifications(dynamicMaxExample.layers)).toMatchObject({
			maxLike: true,
			intervalLike: false,
			tableLike: false,
			hybridLike: false,
			mixedDiscipline: true,
			dryCapable: false,
			containsTort: true,
			disciplineGroups: ['dynamic', 'dynamicTraining']
		});
	});

	it('classifies Static Max as a single static max attempt', () => {
		expect(deriveRoutineClassifications(staticMaxExample.layers)).toMatchObject({
			maxLike: true,
			intervalLike: false,
			tableLike: false,
			hybridLike: false,
			mixedDiscipline: false,
			dryCapable: false,
			containsTort: false,
			disciplineGroups: ['static']
		});
	});
});

describe('deriveMetricProfile / tags / display', () => {
	it('suggests Dynamic Max metrics, tags, and display defaults', () => {
		const layers = dynamicMaxExample.layers;
		const profile = deriveMetricProfile(layers);

		expect(profile.standard).toEqual(
			expect.arrayContaining(['distanceMeters', 'durationSeconds', 'breatheUpSeconds', 'rpe', 'joyScale', 'buddyName'])
		);
		expect(profile.geek).toEqual(expect.arrayContaining(['lapTimes', 'speedPerLap', 'heartRateSeries', 'spO2Series']));
		expect(deriveDefaultTags(layers)).toEqual(expect.arrayContaining(['dynamic', 'tort', 'max']));
		expect(deriveDisplayMetrics(layers)).toEqual({
			hero: 'distanceMeters',
			secondary: 'durationSeconds',
			tertiary: 'speedPerLap'
		});
	});

	it('suggests Static Max metrics, tags, and display defaults', () => {
		const layers = staticMaxExample.layers;
		const profile = deriveMetricProfile(layers);

		expect(profile.standard).toEqual(expect.arrayContaining(['durationSeconds', 'breatheUpSeconds', 'safetyOutcome']));
		expect(profile.standard).not.toContain('distanceMeters');
		expect(profile.geek).toEqual(expect.arrayContaining(['minSpO2', 'minHeartRate', 'contractionsOnsetSeconds']));
		expect(deriveDefaultTags(layers)).toEqual(expect.arrayContaining(['static', 'max']));
		expect(deriveDisplayMetrics(layers)).toEqual({
			hero: 'durationSeconds',
			secondary: 'breathingTechnique',
			tertiary: 'minHeartRate'
		});
	});

	it('validates and classifies all completed default routine fixtures', () => {
		expect(defaultRoutineExamples.map((example) => example.id)).toEqual([
			'dynamic-max',
			'static-max',
			'dynamic-sweet-16',
			'static-two-breath-table',
			'dry-rv-table'
		]);

		for (const example of defaultRoutineExamples) {
			expect(validateRoutineLayers(example.layers)).toEqual([]);
			expect(example.standardMetrics.length).toBeGreaterThan(0);
			expect(example.geekMetrics.length).toBeGreaterThan(0);
			expect(example.defaultTags.length).toBeGreaterThan(0);
		}

		expect(expandRoutineLayers(defaultRoutineExamples[0].layers)).toHaveLength(1);
		expect(expandRoutineLayers(defaultRoutineExamples[1].layers)).toHaveLength(1);
		expect(expandRoutineLayers(defaultRoutineExamples[2].layers)).toHaveLength(16);
		expect(expandRoutineLayers(defaultRoutineExamples[3].layers)).toHaveLength(10);
		expect(expandRoutineLayers(defaultRoutineExamples[4].layers)).toHaveLength(8);

		expect(deriveRoutineClassifications(defaultRoutineExamples[2].layers)).toMatchObject({
			intervalLike: true,
			tableLike: true,
			disciplineGroups: ['dynamic']
		});
		expect(deriveRoutineClassifications(defaultRoutineExamples[4].layers)).toMatchObject({
			intervalLike: true,
			tableLike: true,
			dryCapable: true,
			disciplineGroups: ['static']
		});
	});

	it('matches current system default routines to v2 layer fixtures', () => {
		expect(findDefaultRoutineLayerExample({ id: 'system-dynamic-max', name: 'Dynamic Max Attempt' })?.id).toBe('dynamic-max');
		expect(findDefaultRoutineLayerExample({ id: 'system-static-max', name: 'Static Max Attempt' })?.id).toBe('static-max');
		expect(findDefaultRoutineLayerExample({ id: 'system-sweet-16', name: 'Sweet 16' })?.id).toBe('dynamic-sweet-16');
		expect(findDefaultRoutineLayerExample({ id: 'system-gentle-2-breath', name: 'Gentle 2-Breath' })?.id).toBe('static-two-breath-table');
		expect(findDefaultRoutineLayerExample({ id: 'system-rv-breath-hold', name: 'RV Breath Hold' })?.id).toBe('dry-rv-table');
	});

	it('models Static 2-Breath as a prep layer followed by repeated two-breath recoveries', () => {
		const rows = expandRoutineLayers(staticTwoBreathTableExample.layers);

		expect(staticTwoBreathTableExample.layers).toHaveLength(2);
		expect(staticTwoBreathTableExample.layers[0]).toMatchObject({
			id: 'static-two-breath-table-layer-1',
			name: 'Initial breathe-up and hold',
			breatheUp: { mode: 'fixed', seconds: 240 },
			attributes: { repeatCount: 1 }
		});
		expect(staticTwoBreathTableExample.layers[1]).toMatchObject({
			id: 'static-two-breath-table-layer-2',
			name: '2-breath reps',
			breatheUp: { mode: 'fixed', seconds: 30 },
			attributes: { repeatCount: 9 }
		});
		expect(rows).toHaveLength(10);
		expect(rows.map((row) => row.sourceLayerId)).toEqual([
			'static-two-breath-table-layer-1',
			'static-two-breath-table-layer-2',
			'static-two-breath-table-layer-2',
			'static-two-breath-table-layer-2',
			'static-two-breath-table-layer-2',
			'static-two-breath-table-layer-2',
			'static-two-breath-table-layer-2',
			'static-two-breath-table-layer-2',
			'static-two-breath-table-layer-2',
			'static-two-breath-table-layer-2'
		]);
	});
});

describe('validateRoutineLayers', () => {
	it('rejects impossible static distance targets', () => {
		const layer = dynamicMaxLayer({
			discipline: 'STA',
			disciplineSelectionMode: 'fixed',
			allowedDisciplines: undefined,
			dive: { duration: openDuration, distance: openDistance }
		});

		expect(validateRoutineLayers([layer])).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					layerId: 'dynamic-max',
					code: 'static-distance-target'
				})
			])
		);
	});

	it('requires selectable layers to include the default discipline', () => {
		const layer = dynamicMaxLayer({ allowedDisciplines: ['DYNB', 'DNF'] });

		expect(validateRoutineLayers([layer])).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'default-discipline-not-selectable'
				})
			])
		);
	});
});