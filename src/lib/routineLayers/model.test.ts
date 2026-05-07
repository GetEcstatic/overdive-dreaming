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
		const rows = expandRoutineLayers([dynamicMaxLayer()]);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			planRowId: 'dynamic-max:1',
			sourceLayerId: 'dynamic-max',
			repIndex: 1,
			globalRowIndex: 1
		});
	});

	it('expands a compact Sweet 16 layer into stable per-rep rows', () => {
		const sweet16 = dynamicMaxLayer({
			id: 'sweet-16',
			disciplineSelectionMode: 'fixed',
			allowedDisciplines: undefined,
			attributes: {
				lungVolume: 'FL',
				effort: 'standard',
				environment: 'wet',
				repeatCount: 16
			},
			analyticsRole: 'working-rep'
		});

		const rows = expandRoutineLayers([sweet16]);

		expect(rows).toHaveLength(16);
		expect(rows[0].planRowId).toBe('sweet-16:1');
		expect(rows[15].planRowId).toBe('sweet-16:16');
		expect(rows[15].globalRowIndex).toBe(16);
	});
});

describe('deriveRoutineClassifications', () => {
	it('classifies Dynamic Max as max-like and TORT-capable through allowed choices', () => {
		expect(deriveRoutineClassifications([dynamicMaxLayer()])).toMatchObject({
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

	it('classifies a dry RV table with an embedded max layer as hybrid-like', () => {
		const dryRvWork: RoutineAuthoringLayer = {
			id: 'dry-rv-work',
			discipline: 'STA',
			disciplineSelectionMode: 'fixed',
			breatheUp: { mode: 'fixed', seconds: 30 },
			dive: { duration: { mode: 'fixed', seconds: 90 } },
			attributes: {
				lungVolume: 'RV',
				effort: 'standard',
				environment: 'dry',
				repeatCount: 4
			},
			analyticsRole: 'working-rep',
			locks: {}
		};
		const dryRvMax = dynamicMaxLayer({
			id: 'dry-rv-max',
			discipline: 'STA',
			disciplineSelectionMode: 'fixed',
			allowedDisciplines: undefined,
			dive: { duration: openDuration },
			attributes: {
				lungVolume: 'RV',
				effort: 'max',
				environment: 'dry',
				repeatCount: 1
			}
		});

		expect(deriveRoutineClassifications([dryRvWork, dryRvMax])).toMatchObject({
			maxLike: false,
			intervalLike: false,
			tableLike: true,
			hybridLike: true,
			dryCapable: true,
			disciplineGroups: ['static']
		});
	});
});

describe('deriveMetricProfile / tags / display', () => {
	it('suggests Dynamic Max metrics, tags, and display defaults', () => {
		const layers = [dynamicMaxLayer()];
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

	it('suggests dry physiology metrics for dry routines', () => {
		const layer = dynamicMaxLayer({
			discipline: 'STA',
			disciplineSelectionMode: 'fixed',
			allowedDisciplines: undefined,
			dive: { duration: openDuration },
			attributes: {
				lungVolume: 'RV',
				effort: 'standard',
				environment: 'dry',
				repeatCount: 3
			}
		});
		const profile = deriveMetricProfile([layer]);

		expect(profile.standard).toEqual(expect.arrayContaining(['minSpO2', 'repsCompleted']));
		expect(profile.geek).toEqual(expect.arrayContaining(['timeBelowSpO2Threshold', 'minHeartRate', 'restSeconds']));
		expect(deriveDefaultTags([layer])).toEqual(expect.arrayContaining(['static', 'dry', 'table']));
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