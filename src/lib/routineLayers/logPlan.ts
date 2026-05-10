import type { LapData, RoutineTemplate, RoutineLogPlanRow, RoutineLogResultRow } from '$lib/types';
import { buildRoutineLayerReadModel } from './readModel';
import { storedDisciplineForLayer, type ExpandedRoutinePlanRow } from './model';

export function buildRoutineLogPlanRows(routine: RoutineTemplate): RoutineLogPlanRow[] {
	return buildRoutineLayerReadModel(routine).expandedRows.map(projectExpandedRowToLogPlanRow);
}

export type InitialRoutineLogResultInput = {
	repsCompleted?: number;
	totalTimeSeconds?: number;
	totalDistanceMeters?: number;
	repDurationSeconds?: number;
	repDistanceMeters?: number;
};

export function buildInitialRoutineLogResultRows(
	plannedRows: RoutineLogPlanRow[],
	input: InitialRoutineLogResultInput = {}
): RoutineLogResultRow[] {
	const completedCount = input.repsCompleted ?? plannedRows.length;
	const singleRow = plannedRows.length === 1;

	return plannedRows.map((row) => ({
		planRowId: row.planRowId,
		sourceLayerId: row.sourceLayerId,
		repIndex: row.repIndex,
		globalRowIndex: row.globalRowIndex,
		completed: row.globalRowIndex <= completedCount,
		actualDurationSeconds: singleRow ? input.totalTimeSeconds : input.repDurationSeconds,
		actualDistanceMeters: singleRow ? input.totalDistanceMeters : input.repDistanceMeters
	}));
}

export function buildRoutineLogResultRowsFromLapData(
	plannedRows: RoutineLogPlanRow[],
	laps: LapData[]
): RoutineLogResultRow[] {
	const lapsByNumber = new Map(laps.map((lap) => [lap.lapNumber, lap]));

	return plannedRows.map((row) => {
		const lap = lapsByNumber.get(row.globalRowIndex) ?? laps[row.globalRowIndex - 1];
		return {
			planRowId: row.planRowId,
			sourceLayerId: row.sourceLayerId,
			repIndex: row.repIndex,
			globalRowIndex: row.globalRowIndex,
			completed: lap?.completed ?? false,
			actualDurationSeconds: lap?.timeSeconds,
			actualDistanceMeters: lap?.distanceMeters,
			actualRestSeconds: lap?.restAfterSeconds,
			notes: lap?.notes
		};
	});
}

function projectExpandedRowToLogPlanRow(row: ExpandedRoutinePlanRow): RoutineLogPlanRow {
	return {
		planRowId: row.planRowId,
		sourceLayerId: row.sourceLayerId,
		layerName: row.name,
		repIndex: row.repIndex,
		globalRowIndex: row.globalRowIndex,
		discipline: storedDisciplineForLayer(row.discipline),
		plannedBreatheUpSeconds: row.breatheUp.mode === 'fixed' ? row.breatheUp.seconds : undefined,
		plannedDurationSeconds: row.dive.duration?.mode === 'fixed' ? row.dive.duration.seconds : undefined,
		plannedDistanceMeters: row.dive.distance?.mode === 'fixed' ? row.dive.distance.meters : undefined,
		diveCapabilities: row.diveCapabilities ? [...row.diveCapabilities] : undefined,
		lungVolume: row.attributes.lungVolume,
		effort: row.attributes.effort,
		environment: row.attributes.environment,
		analyticsRole: row.analyticsRole
	};
}