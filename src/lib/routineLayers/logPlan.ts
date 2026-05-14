import type { LapData, RepEditorData, RoutineLog, RoutineTemplate, RoutineLogPlanRow, RoutineLogResultRow } from '$lib/types';
import { buildRoutineLayerReadModel } from './readModel';
import { storedDisciplineForLayer, type ExpandedRoutinePlanRow } from './model';

export type RoutineLogRowSummary = {
	completedCount: number;
	totalDurationSeconds?: number;
	dynamicDurationSeconds?: number;
	dynamicDistanceMeters?: number;
	averageDynamicSpeedMs?: number;
	uniformRepDurationSeconds?: number;
	uniformRepDistanceMeters?: number;
	longestHoldSeconds?: number;
	cumulativeHoldSeconds?: number;
	totalRestSeconds?: number;
};

export type RoutineLogRowDisplay = {
	plan: RoutineLogPlanRow;
	result?: RoutineLogResultRow;
	lap?: LapData;
	rep: RepEditorData;
	isDynamic: boolean;
};

export type RoutineLogResultReadModel = RoutineLogRowSummary & {
	hasRowResults: boolean;
	rows: RoutineLogRowDisplay[];
	layerGroups: {
		sourceLayerId: string;
		name: string;
		rows: RoutineLogRowDisplay[];
		disciplines: RoutineLogPlanRow['discipline'][];
	}[];
	legacyFallbacksUsed: boolean;
};

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
		actualDistanceMeters: isDynamicPlanRow(row)
			? singleRow ? input.totalDistanceMeters : input.repDistanceMeters
			: undefined
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
			actualDistanceMeters: isDynamicPlanRow(row) ? lap?.distanceMeters : undefined,
			actualRestSeconds: lap?.restAfterSeconds,
			notes: lap?.notes
		};
	});
}

export function routineLogRowsToRepEditorData(
	plannedRows: RoutineLogPlanRow[] | undefined,
	resultRows: RoutineLogResultRow[] | undefined,
	laps: LapData[] | undefined
): RepEditorData[] {
	const resultByPlanId = new Map((resultRows ?? []).map((result) => [result.planRowId, result]));
	const resultByIndex = new Map((resultRows ?? []).map((result) => [result.globalRowIndex, result]));
	const lapByNumber = new Map((laps ?? []).map((lap) => [lap.lapNumber, lap]));

	if (plannedRows && plannedRows.length > 0) {
		return plannedRows.map((row) => {
			const result = resultByPlanId.get(row.planRowId) ?? resultByIndex.get(row.globalRowIndex);
			const lap = lapByNumber.get(row.globalRowIndex) ?? laps?.[row.globalRowIndex - 1];
			return repEditorRowFromSources(row.globalRowIndex, row, result, lap);
		});
	}

	return (laps ?? []).map((lap) => repEditorRowFromSources(lap.lapNumber, undefined, undefined, lap));
}

export function repEditorDataToLapData(
	plannedRows: RoutineLogPlanRow[] | undefined,
	reps: RepEditorData[]
): LapData[] {
	const rowByIndex = new Map((plannedRows ?? []).map((row) => [row.globalRowIndex, row]));

	return reps.map((rep) => {
		const row = rowByIndex.get(rep.repNumber);
		const isDynamic = !row || isDynamicPlanRow(row);
		const distanceMeters = isDynamic ? rep.actualDistance : undefined;
		const timeSeconds = rep.actualDuration;

		return {
			lapNumber: rep.repNumber,
			timeSeconds,
			distanceMeters,
			restAfterSeconds: rep.actualRest,
			kicks: isDynamic ? rep.kicks : undefined,
			armPulls: isDynamic ? rep.armPulls : undefined,
			speedMs: isDynamic && distanceMeters && timeSeconds ? distanceMeters / timeSeconds : undefined,
			completed: rep.completed,
			notes: rep.notes?.trim() || undefined,
			lungVolume: rep.lungVolume,
			spo2Min: rep.spo2Min,
			spo2Avg: rep.spo2Avg,
			hrMin: rep.hrMin,
			hrMax: rep.hrMax,
			hrAvg: rep.hrAvg,
			timeBelow70: rep.timeBelow70,
			timeBelow60: rep.timeBelow60,
			timeBelow50: rep.timeBelow50,
			timeBelow40: rep.timeBelow40
		};
	});
}

export function repEditorDataToRoutineLogRows(
	plannedRows: RoutineLogPlanRow[],
	reps: RepEditorData[]
): { laps: LapData[]; resultRows: RoutineLogResultRow[] } {
	const laps = repEditorDataToLapData(plannedRows, reps);
	return {
		laps,
		resultRows: buildRoutineLogResultRowsFromLapData(plannedRows, laps)
	};
}

export function deriveRoutineLogSummaryFromRows(
	plannedRows: RoutineLogPlanRow[],
	resultRows: RoutineLogResultRow[]
): RoutineLogRowSummary {
	const rowByPlanId = new Map(plannedRows.map((row) => [row.planRowId, row]));
	const rowByIndex = new Map(plannedRows.map((row) => [row.globalRowIndex, row]));
	const completedRows = resultRows.filter((result) => result.completed);
	let totalDurationSeconds = 0;
	let hasAnyDuration = false;
	let dynamicDurationSeconds = 0;
	let dynamicDistanceMeters = 0;
	let totalRestSeconds = 0;
	let hasAnyRest = false;
	const completedDurations: number[] = [];
	const completedDistances: number[] = [];

	for (const result of completedRows) {
		const row = rowByPlanId.get(result.planRowId) ?? rowByIndex.get(result.globalRowIndex);
		const duration = result.actualDurationSeconds;
		const distance = result.actualDistanceMeters;

		if (duration !== undefined) {
			totalDurationSeconds += duration;
			hasAnyDuration = true;
			completedDurations.push(duration);
		}

		if (result.actualRestSeconds !== undefined) {
			totalRestSeconds += result.actualRestSeconds;
			hasAnyRest = true;
		}

		if (row && isDynamicPlanRow(row)) {
			if (duration !== undefined) dynamicDurationSeconds += duration;
			if (distance !== undefined) {
				dynamicDistanceMeters += distance;
				completedDistances.push(distance);
			}
		}
	}

	return {
		completedCount: completedRows.length,
		totalDurationSeconds: hasAnyDuration ? totalDurationSeconds : undefined,
		dynamicDurationSeconds: dynamicDurationSeconds > 0 ? dynamicDurationSeconds : undefined,
		dynamicDistanceMeters: dynamicDistanceMeters > 0 ? dynamicDistanceMeters : undefined,
		averageDynamicSpeedMs: dynamicDurationSeconds > 0 && dynamicDistanceMeters > 0
			? dynamicDistanceMeters / dynamicDurationSeconds
			: undefined,
		uniformRepDurationSeconds: uniformNumber(completedDurations),
		uniformRepDistanceMeters: uniformNumber(completedDistances),
		longestHoldSeconds: completedDurations.length > 0 ? Math.max(...completedDurations) : undefined,
		cumulativeHoldSeconds: hasAnyDuration ? totalDurationSeconds : undefined,
		totalRestSeconds: hasAnyRest ? totalRestSeconds : undefined
	};
}

export function buildRoutineLogResultReadModel(
	log: RoutineLog,
	routine?: RoutineTemplate
): RoutineLogResultReadModel {
	const plannedRows = log.plannedRows && log.plannedRows.length > 0
		? log.plannedRows
		: routine?.disciplines?.length ? buildRoutineLogPlanRows(routine) : [];
	const resultRows = log.resultRows && log.resultRows.length > 0
		? log.resultRows
		: plannedRows.length > 0 && log.laps && log.laps.length > 0
			? buildRoutineLogResultRowsFromLapData(plannedRows, log.laps)
			: [];
	const reps = routineLogRowsToRepEditorData(plannedRows, resultRows, log.laps);
	const resultByPlanId = new Map(resultRows.map((result) => [result.planRowId, result]));
	const resultByIndex = new Map(resultRows.map((result) => [result.globalRowIndex, result]));
	const lapByNumber = new Map((log.laps ?? []).map((lap) => [lap.lapNumber, lap]));

	const rows = plannedRows.map((plan, index) => ({
		plan,
		result: resultByPlanId.get(plan.planRowId) ?? resultByIndex.get(plan.globalRowIndex),
		lap: lapByNumber.get(plan.globalRowIndex) ?? log.laps?.[plan.globalRowIndex - 1],
		rep: reps[index],
		isDynamic: isDynamicPlanRow(plan)
	}));
	const summary = deriveRoutineLogSummaryFromRows(plannedRows, resultRows);

	return {
		...summary,
		hasRowResults: resultRows.length > 0 || rows.some((row) => row.lap),
		rows,
		layerGroups: buildResultLayerGroups(rows),
		legacyFallbacksUsed: !(log.resultRows && log.resultRows.length > 0)
	};
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

function repEditorRowFromSources(
	repNumber: number,
	row: RoutineLogPlanRow | undefined,
	result: RoutineLogResultRow | undefined,
	lap: LapData | undefined
): RepEditorData {
	const isDynamic = !row || isDynamicPlanRow(row);

	return {
		repNumber,
		plannedDuration: row?.plannedDurationSeconds,
		plannedDistance: isDynamic ? row?.plannedDistanceMeters : undefined,
		plannedRest: row?.plannedBreatheUpSeconds,
		actualDuration: result?.actualDurationSeconds ?? lap?.timeSeconds ?? row?.plannedDurationSeconds,
		actualDistance: isDynamic ? result?.actualDistanceMeters ?? lap?.distanceMeters ?? row?.plannedDistanceMeters : undefined,
		actualRest: result?.actualRestSeconds ?? lap?.restAfterSeconds ?? row?.plannedBreatheUpSeconds,
		completed: result?.completed ?? lap?.completed ?? true,
		notes: result?.notes ?? lap?.notes,
		kicks: isDynamic ? lap?.kicks : undefined,
		armPulls: isDynamic ? lap?.armPulls : undefined,
		lungVolume: lap?.lungVolume ?? row?.lungVolume,
		spo2Min: lap?.spo2Min,
		spo2Avg: lap?.spo2Avg,
		hrMin: lap?.hrMin,
		hrMax: lap?.hrMax,
		hrAvg: lap?.hrAvg,
		timeBelow70: lap?.timeBelow70,
		timeBelow60: lap?.timeBelow60,
		timeBelow50: lap?.timeBelow50,
		timeBelow40: lap?.timeBelow40
	};
}

function buildResultLayerGroups(rows: RoutineLogRowDisplay[]): RoutineLogResultReadModel['layerGroups'] {
	const groups = new Map<string, RoutineLogRowDisplay[]>();
	for (const row of rows) {
		groups.set(row.plan.sourceLayerId, [...(groups.get(row.plan.sourceLayerId) ?? []), row]);
	}

	return [...groups.entries()].map(([sourceLayerId, groupRows]) => ({
		sourceLayerId,
		name: groupRows[0]?.plan.layerName ?? `Layer ${sourceLayerId}`,
		rows: groupRows,
		disciplines: unique(groupRows.map((row) => row.plan.discipline))
	}));
}

function isDynamicPlanRow(row: RoutineLogPlanRow): boolean {
	return row.discipline !== 'STA';
}

function uniformNumber(values: number[]): number | undefined {
	if (values.length === 0) return undefined;
	const [first, ...rest] = values;
	return rest.every((value) => value === first) ? first : undefined;
}

function unique<T>(values: T[]): T[] {
	return [...new Set(values)];
}