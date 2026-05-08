import { describe, expect, it } from 'vitest';
import type { RoutineTemplate } from '$lib/types';
import { dynamicMaxExample, staticTwoBreathTableExample } from './defaults';
import { ROUTINE_TEMPLATE_LAYER_VERSION, withLayerRoutineTemplateContract } from './contract';
import { buildRoutineTemplateTransferData } from './transfer';

function routineTemplate(overrides: Partial<RoutineTemplate> = {}): RoutineTemplate {
	return {
		id: 'routine-1',
		name: 'Routine',
		description: 'Routine description',
		disciplines: ['DYN'],
		tags: ['training'],
		trackingConfig: {} as RoutineTemplate['trackingConfig'],
		displayConfig: {} as RoutineTemplate['displayConfig'],
		createdBy: 'system',
		isPublic: true,
		createdAt: null as unknown as RoutineTemplate['createdAt'],
		updatedAt: null as unknown as RoutineTemplate['updatedAt'],
		...overrides
	};
}

describe('buildRoutineTemplateTransferData', () => {
	it('keeps legacy routine sends and copies on the legacy payload shape', () => {
		const payload = buildRoutineTemplateTransferData(
			routineTemplate({ numberOfReps: 16, repDistance: 50, restBetweenReps: 45 })
		);

		expect(payload).toMatchObject({
			name: 'Routine',
			disciplines: ['DYN'],
			numberOfReps: 16,
			repDistance: 50,
			restBetweenReps: 45
		});
		expect(payload).not.toHaveProperty('routineTemplateVersion');
		expect(payload).not.toHaveProperty('layers');
	});

	it('preserves v2 layer contracts when sending or copying routines', () => {
		const routine = withLayerRoutineTemplateContract(routineTemplate(), dynamicMaxExample.layers);
		const payload = buildRoutineTemplateTransferData(routine);

		expect(payload.routineTemplateVersion).toBe(ROUTINE_TEMPLATE_LAYER_VERSION);
		expect(payload.layers).toEqual(dynamicMaxExample.layers);
		expect(payload.layers).not.toBe(dynamicMaxExample.layers);
		expect(payload.layerDefaultTags).toEqual(expect.arrayContaining(['dynamic', 'max']));
		expect(payload.disciplines).toEqual(['DYN', 'DYNB', 'DNF']);
		expect(payload.layers?.[0].allowedDisciplines).toEqual(['DYN', 'DYNB', 'DNF', 'TORT']);
		expect(payload.defaultTags).toEqual(expect.arrayContaining(['dynamic', 'max']));
		expect(payload.displayConfig.heroMetric).toBe('totalDistance');
	});

	it('includes compatibility table fields for v2 table routines', () => {
		const routine = withLayerRoutineTemplateContract(routineTemplate(), staticTwoBreathTableExample.layers);
		const payload = buildRoutineTemplateTransferData(routine);

		expect(payload.routineTemplateVersion).toBe(ROUTINE_TEMPLATE_LAYER_VERSION);
		expect(payload.table?.rows).toHaveLength(10);
		expect(payload.numberOfReps).toBeUndefined();
		expect(payload.restBetweenReps).toBeUndefined();
		expect(payload.displayConfig.heroMetric).toBe('cumulativeHoldTime');
	});
});