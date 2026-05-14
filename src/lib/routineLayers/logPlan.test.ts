import { describe, expect, it } from 'vitest';
import type { RoutineTemplate } from '$lib/types';
import { staticTwoBreathTableExample, dynamicMaxExample } from './defaults';
import { withLayerRoutineTemplateContract } from './contract';
import {
	buildRoutineLogResultReadModel,
	buildInitialRoutineLogResultRows,
	deriveRoutineLogSummaryFromRows,
	buildRoutineLogPlanRows,
	buildRoutineLogResultRowsFromLapData,
	repEditorDataToRoutineLogRows,
	routineLogRowsToRepEditorData
} from './logPlan';

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

	it('maps O2 static plan rows to stored static discipline for current log compatibility', () => {
		const routine = withLayerRoutineTemplateContract(routineTemplate(), [
			{
				...staticTwoBreathTableExample.layers[0],
				id: 'o2-static-layer-1',
				discipline: 'O2STA',
				disciplineSelectionMode: 'fixed',
				allowedDisciplines: undefined
			}
		]);
		const rows = buildRoutineLogPlanRows(routine);

		expect(rows[0].sourceLayerId).toBe('o2-static-layer-1');
		expect(rows[0].discipline).toBe('STA');
		expect(rows[0].plannedDurationSeconds).toBe(90);
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

	it('builds result rows from edited lap data while preserving layer IDs', () => {
		const routine = withLayerRoutineTemplateContract(routineTemplate(), staticTwoBreathTableExample.layers);
		const plannedRows = buildRoutineLogPlanRows(routine);
		const resultRows = buildRoutineLogResultRowsFromLapData(plannedRows, [
			{ lapNumber: 1, timeSeconds: 91, restAfterSeconds: 240, completed: true },
			{ lapNumber: 2, timeSeconds: 88, restAfterSeconds: 30, completed: true, notes: 'clean' },
			{ lapNumber: 3, completed: false }
		]);

		expect(resultRows[0]).toMatchObject({
			planRowId: 'static-two-breath-table-layer-1:1',
			sourceLayerId: 'static-two-breath-table-layer-1',
			completed: true,
			actualDurationSeconds: 91,
			actualRestSeconds: 240
		});
		expect(resultRows[1]).toMatchObject({
			sourceLayerId: 'static-two-breath-table-layer-2',
			completed: true,
			actualDurationSeconds: 88,
			notes: 'clean'
		});
		expect(resultRows[2]).toMatchObject({
			sourceLayerId: 'static-two-breath-table-layer-2',
			completed: false
		});
	});

	it('hydrates rep editor rows from saved result rows before falling back to laps', () => {
		const routine = withLayerRoutineTemplateContract(routineTemplate(), staticTwoBreathTableExample.layers);
		const plannedRows = buildRoutineLogPlanRows(routine);
		const resultRows = buildRoutineLogResultRowsFromLapData(plannedRows, [
			{ lapNumber: 1, timeSeconds: 90, restAfterSeconds: 240, completed: true },
			{ lapNumber: 2, timeSeconds: 60, restAfterSeconds: 30, completed: true, notes: 'old lap' }
		]);
		resultRows[1] = {
			...resultRows[1],
			actualDurationSeconds: 75,
			notes: 'saved result'
		};

		const reps = routineLogRowsToRepEditorData(plannedRows, resultRows, [
			{ lapNumber: 2, timeSeconds: 60, restAfterSeconds: 30, completed: true, notes: 'old lap', spo2Min: 82 }
		]);

		expect(reps[1]).toMatchObject({
			repNumber: 2,
			actualDuration: 75,
			actualRest: 30,
			notes: 'saved result',
			spo2Min: 82
		});
	});

	it('converts edited mixed rows to laps and result rows without static distance artifacts', () => {
		const routine = withLayerRoutineTemplateContract(routineTemplate(), staticTwoBreathTableExample.layers);
		const plannedRows = buildRoutineLogPlanRows(routine);
		plannedRows[1] = { ...plannedRows[1], discipline: 'DYN', plannedDistanceMeters: 50 };

		const { laps, resultRows } = repEditorDataToRoutineLogRows(plannedRows.slice(0, 2), [
			{ repNumber: 1, actualDuration: 92, actualDistance: 10, actualRest: 240, kicks: 5, completed: true },
			{ repNumber: 2, actualDuration: 44, actualDistance: 50, actualRest: 30, kicks: 18, completed: true }
		]);

		expect(laps[0]).toMatchObject({
			lapNumber: 1,
			timeSeconds: 92,
			distanceMeters: undefined,
			kicks: undefined
		});
		expect(laps[1]).toMatchObject({
			lapNumber: 2,
			distanceMeters: 50,
			kicks: 18
		});
		expect(resultRows[0].actualDistanceMeters).toBeUndefined();
		expect(resultRows[1].actualDistanceMeters).toBe(50);
	});

	it('derives saved row summaries from dynamic rows only for distance and speed', () => {
		const routine = withLayerRoutineTemplateContract(routineTemplate(), staticTwoBreathTableExample.layers);
		const plannedRows = buildRoutineLogPlanRows(routine).slice(0, 2);
		plannedRows[1] = { ...plannedRows[1], discipline: 'DYN', plannedDistanceMeters: 50 };
		const resultRows = buildRoutineLogResultRowsFromLapData(plannedRows, [
			{ lapNumber: 1, timeSeconds: 90, distanceMeters: 20, restAfterSeconds: 240, completed: true },
			{ lapNumber: 2, timeSeconds: 50, distanceMeters: 50, restAfterSeconds: 30, completed: true }
		]);

		const summary = deriveRoutineLogSummaryFromRows(plannedRows, resultRows);

		expect(summary).toMatchObject({
			completedCount: 2,
			totalDurationSeconds: 140,
			dynamicDurationSeconds: 50,
			dynamicDistanceMeters: 50,
			averageDynamicSpeedMs: 1,
			longestHoldSeconds: 90,
			cumulativeHoldSeconds: 140,
			totalRestSeconds: 270
		});
	});

	it('builds a saved log result read model grouped by layer', () => {
		const routine = withLayerRoutineTemplateContract(routineTemplate(), staticTwoBreathTableExample.layers);
		const plannedRows = buildRoutineLogPlanRows(routine).slice(0, 2);
		const resultRows = buildRoutineLogResultRowsFromLapData(plannedRows, [
			{ lapNumber: 1, timeSeconds: 90, restAfterSeconds: 240, completed: true },
			{ lapNumber: 2, timeSeconds: 88, restAfterSeconds: 30, completed: true }
		]);
		const log = {
			id: 'log-1',
			routineId: routine.id,
			userId: 'user-1',
			date: null,
			disciplineUsed: 'STA',
			plannedRows,
			resultRows
		} as never;

		const readModel = buildRoutineLogResultReadModel(log, routine);

		expect(readModel.hasRowResults).toBe(true);
		expect(readModel.rows).toHaveLength(2);
		expect(readModel.layerGroups).toHaveLength(2);
		expect(readModel.completedCount).toBe(2);
	});
});