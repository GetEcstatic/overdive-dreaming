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
import { dynamicMaxExample, staticMaxExample, starterMaxRoutineExamples } from './defaults';
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
		expect(profile.geek).toEqual(expect.arrayContaining(['minSpO2', 'minHeartRate']));
		expect(deriveDefaultTags(layers)).toEqual(expect.arrayContaining(['static', 'max']));
		expect(deriveDisplayMetrics(layers)).toEqual({
			hero: 'durationSeconds',
			secondary: 'safetyOutcome',
			tertiary: 'rpe'
		});
	});

	it('keeps the starter fixture set limited to Dynamic Max and Static Max', () => {
		expect(starterMaxRoutineExamples.map((example) => example.id)).toEqual(['dynamic-max', 'static-max']);

		for (const example of starterMaxRoutineExamples) {
			expect(validateRoutineLayers(example.layers)).toEqual([]);
			expect(expandRoutineLayers(example.layers)).toHaveLength(1);
			expect(deriveRoutineClassifications(example.layers).maxLike).toBe(true);
		}
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