import { describe, expect, it } from 'vitest';
import type { RoutineTemplate } from '$lib/types';
import { projectLegacyRoutineToLayers } from './legacy';
import { expandRoutineLayers, validateRoutineLayers } from './model';

function legacyRoutine(overrides: Partial<RoutineTemplate>): RoutineTemplate {
	return {
		id: 'legacy-routine',
		name: 'Legacy routine',
		description: '',
		disciplines: ['DYN'],
		tags: [],
		trackingConfig: {} as RoutineTemplate['trackingConfig'],
		displayConfig: {} as RoutineTemplate['displayConfig'],
		createdBy: 'system',
		isPublic: true,
		createdAt: null as unknown as RoutineTemplate['createdAt'],
		updatedAt: null as unknown as RoutineTemplate['updatedAt'],
		...overrides
	};
}

describe('projectLegacyRoutineToLayers', () => {
	it('projects a legacy dynamic max attempt to one open max layer', () => {
		const layers = projectLegacyRoutineToLayers(
			legacyRoutine({
				activityType: 'max-attempt',
				disciplines: ['DYN', 'DYNB', 'DNF'],
				tags: ['dynamic', 'max']
			})
		);

		expect(layers).toHaveLength(1);
		expect(validateRoutineLayers(layers)).toEqual([]);
		expect(layers[0]).toMatchObject({
			discipline: 'DYN',
			disciplineSelectionMode: 'log-time-selectable',
			allowedDisciplines: ['DYN', 'DYNB', 'DNF'],
			attributes: { effort: 'max', repeatCount: 1 },
			analyticsRole: 'max-attempt'
		});
		expect(layers[0].dive).toEqual({ distance: { mode: 'open' }, duration: { mode: 'open' } });
	});

	it('projects a uniform dynamic interval to one repeated fixed-distance layer', () => {
		const layers = projectLegacyRoutineToLayers(
			legacyRoutine({
				activityType: 'structured-intervals',
				numberOfReps: 16,
				repDistance: 50,
				restBetweenReps: 45
			})
		);

		expect(validateRoutineLayers(layers)).toEqual([]);
		expect(layers[0]).toMatchObject({
			breatheUp: { mode: 'fixed', seconds: 45 },
			dive: { distance: { mode: 'fixed', meters: 50 }, duration: { mode: 'open' } },
			attributes: { effort: 'standard', repeatCount: 16 },
			analyticsRole: 'working-rep'
		});
		expect(expandRoutineLayers(layers)).toHaveLength(16);
	});

	it('projects legacy static table rows to one layer per row', () => {
		const layers = projectLegacyRoutineToLayers(
			legacyRoutine({
				disciplines: ['STA'],
				trainingEnvironment: 'both',
				table: {
					rows: [
						{ repNumber: 1, restBefore: 30, targetDuration: 60 },
						{ repNumber: 2, restBefore: 30, targetDuration: 75 }
					]
				}
			})
		);

		expect(layers).toHaveLength(2);
		expect(validateRoutineLayers(layers)).toEqual([]);
		expect(layers[0]).toMatchObject({
			id: 'legacy-routine:row-1',
			discipline: 'STA',
			dive: { duration: { mode: 'fixed', seconds: 60 } },
			attributes: { environment: 'both', repeatCount: 1 }
		});
		expect(layers[1].dive).toEqual({ duration: { mode: 'fixed', seconds: 75 } });
	});

	it('infers O2 static layers from high-confidence legacy O2 signals', () => {
		const layers = projectLegacyRoutineToLayers(
			legacyRoutine({
				id: 'system-o2-assisted-static',
				name: 'O2-Assisted Static',
				disciplines: ['STA'],
				tags: ['static', 'o2'],
				trackingConfig: {
					trackTotalTime: true,
					trackGasMix: true,
					trackETCO2: true,
					trackEndSpO2: true
				} as RoutineTemplate['trackingConfig']
			})
		);

		expect(validateRoutineLayers(layers)).toEqual([]);
		expect(layers[0]).toMatchObject({
			discipline: 'O2STA',
			dive: { duration: { mode: 'open' } },
			attributes: { effort: 'standard', repeatCount: 1 }
		});
	});

	it('marks a legacy hybrid max rep as the max-attempt layer', () => {
		const layers = projectLegacyRoutineToLayers(
			legacyRoutine({
				activityType: 'structured-intervals',
				maxDiveRepNumber: 2,
				table: {
					rows: [
						{ repNumber: 1, restBefore: 30, targetDistance: 50 },
						{ repNumber: 2, restBefore: 60 },
						{ repNumber: 3, restBefore: 30, targetDistance: 50 }
					]
				}
			})
		);

		expect(validateRoutineLayers(layers)).toEqual([]);
		expect(layers.map((layer) => layer.attributes.effort)).toEqual(['standard', 'max', 'standard']);
		expect(layers.map((layer) => layer.analyticsRole)).toEqual(['working-rep', 'max-attempt', 'working-rep']);
	});
});