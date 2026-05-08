import { describe, expect, it } from 'vitest';
import type { RoutineTemplate } from '$lib/types';
import { dynamicMaxExample, staticTwoBreathTableExample } from './defaults';
import { withLayerRoutineTemplateContract } from './contract';
import { buildRoutineLayerReadModel } from './readModel';

function routineTemplate(overrides: Partial<RoutineTemplate> = {}): RoutineTemplate {
	return {
		id: 'routine-1',
		name: 'Routine',
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

describe('buildRoutineLayerReadModel', () => {
	it('reads stored v2 layers without projecting legacy fields first', () => {
		const routine = withLayerRoutineTemplateContract(routineTemplate(), staticTwoBreathTableExample.layers);
		const readModel = buildRoutineLayerReadModel(routine);

		expect(readModel.source).toBe('versioned-template');
		expect(readModel.layers).toHaveLength(2);
		expect(readModel.expandedRows).toHaveLength(10);
		expect(readModel.validationIssues).toEqual([]);
		expect(readModel.legacyProjection.table?.rows).toHaveLength(10);
	});

	it('projects legacy routines into the same read model shape', () => {
		const readModel = buildRoutineLayerReadModel(
			routineTemplate({
				activityType: 'max-attempt',
				disciplines: ['DYN', 'DYNB', 'DNF'],
				tags: ['dynamic', 'max']
			})
		);

		expect(readModel.source).toBe('legacy-projection');
		expect(readModel.layers).toHaveLength(1);
		expect(readModel.layers[0]).toMatchObject({
			discipline: 'DYN',
			analyticsRole: 'max-attempt'
		});
		expect(readModel.legacyProjection.activityType).toBe('max-attempt');
	});

	it('keeps dynamic max recording-capable routines recognizable through read projection', () => {
		const readModel = buildRoutineLayerReadModel(
			withLayerRoutineTemplateContract(routineTemplate(), dynamicMaxExample.layers)
		);

		expect(readModel.layers.some((layer) => layer.analyticsRole === 'max-attempt')).toBe(true);
		expect(readModel.legacyProjection.disciplines).toEqual(['DYN', 'DYNB', 'DNF']);
	});
});