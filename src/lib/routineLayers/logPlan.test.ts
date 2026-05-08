import { describe, expect, it } from 'vitest';
import type { RoutineTemplate } from '$lib/types';
import { staticTwoBreathTableExample, dynamicMaxExample } from './defaults';
import { withLayerRoutineTemplateContract } from './contract';
import { buildInitialRoutineLogResultRows, buildRoutineLogPlanRows } from './logPlan';

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

describe('routine log plan rows', () => {
	it('builds expanded logging plan rows with source layer IDs from v2 layers', () => {
		const routine = withLayerRoutineTemplateContract(routineTemplate(), staticTwoBreathTableExample.layers);
		const rows = buildRoutineLogPlanRows(routine);

		expect(rows).toHaveLength(10);
		expect(rows[0]).toMatchObject({
			planRowId: 'static-two-breath-table-layer-1:1',
			sourceLayerId: 'static-two-breath-table-layer-1',
			layerName: 'Initial breathe-up and hold',
			repIndex: 1,
			globalRowIndex: 1,
			plannedBreatheUpSeconds: 240,
			plannedDurationSeconds: 90
		});
		expect(rows[1]).toMatchObject({
			planRowId: 'static-two-breath-table-layer-2:1',
			sourceLayerId: 'static-two-breath-table-layer-2',
			globalRowIndex: 2,
			plannedBreatheUpSeconds: 30
		});
	});

	it('projects legacy routines into log plan rows too', () => {
		const rows = buildRoutineLogPlanRows(routineTemplate({ numberOfReps: 3, repDistance: 50, restBetweenReps: 45 }));

		expect(rows).toHaveLength(3);
		expect(rows[0]).toMatchObject({
			sourceLayerId: 'routine-1:layer-1',
			plannedBreatheUpSeconds: 45,
			plannedDistanceMeters: 50
		});
	});

	it('maps TORT plan rows to a stored dynamic discipline for current log compatibility', () => {
		const routine = withLayerRoutineTemplateContract(routineTemplate(), dynamicMaxExample.layers);
		const rows = buildRoutineLogPlanRows(routine);

		expect(rows[0].sourceLayerId).toBe('dynamic-max-layer-1');
		expect(rows[0].discipline).toBe('DYN');
		expect(rows[0].diveCapabilities).toEqual(['recording-link']);
	});

	it('builds initial result rows from quick-log actuals while preserving source layer IDs', () => {
		const routine = withLayerRoutineTemplateContract(routineTemplate(), staticTwoBreathTableExample.layers);
		const plannedRows = buildRoutineLogPlanRows(routine);
		const resultRows = buildInitialRoutineLogResultRows(plannedRows, {
			repsCompleted: 2,
			repDurationSeconds: 90
		});

		expect(resultRows).toHaveLength(10);
		expect(resultRows[0]).toMatchObject({
			planRowId: 'static-two-breath-table-layer-1:1',
			sourceLayerId: 'static-two-breath-table-layer-1',
			completed: true,
			actualDurationSeconds: 90
		});
		expect(resultRows[2]).toMatchObject({
			sourceLayerId: 'static-two-breath-table-layer-2',
			completed: false,
			actualDurationSeconds: 90
		});
	});

	it('uses total quick-log actuals for single-row routines', () => {
		const routine = withLayerRoutineTemplateContract(routineTemplate(), dynamicMaxExample.layers);
		const plannedRows = buildRoutineLogPlanRows(routine);
		const resultRows = buildInitialRoutineLogResultRows(plannedRows, {
			totalTimeSeconds: 125,
			totalDistanceMeters: 100
		});

		expect(resultRows[0]).toMatchObject({
			actualDurationSeconds: 125,
			actualDistanceMeters: 100,
			completed: true
		});
	});
});