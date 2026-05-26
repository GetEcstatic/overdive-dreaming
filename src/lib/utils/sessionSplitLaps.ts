import type { LapData } from '$lib/types';

export interface DynamicSplitReadModelRow {
	isDynamic: boolean;
	plan: {
		globalRowIndex: number;
	};
	lap?: LapData;
	result?: {
		actualDurationSeconds?: number;
		actualDistanceMeters?: number;
		actualRestSeconds?: number;
		completed?: boolean;
		notes?: string;
	};
}

function finiteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function lapDistance(lap: LapData, poolLength?: number): number | undefined {
	if (finiteNumber(lap.distanceMeters)) return lap.distanceMeters;
	return finiteNumber(poolLength) && poolLength > 0 ? poolLength : undefined;
}

function withDerivedSpeed(lap: LapData, poolLength?: number): LapData {
	const distanceMeters = lapDistance(lap, poolLength);
	const timeSeconds = lap.timeSeconds;
	return {
		...lap,
		distanceMeters,
		speedMs: finiteNumber(lap.speedMs)
			? lap.speedMs
			: distanceMeters && finiteNumber(timeSeconds) && timeSeconds > 0
				? distanceMeters / timeSeconds
				: undefined,
		completed: lap.completed ?? true
	};
}

export function deriveDynamicSplitLaps(
	logLaps: readonly LapData[] | undefined,
	readModelRows: readonly DynamicSplitReadModelRow[],
	poolLength?: number
): LapData[] {
	const recordedLaps = (logLaps ?? [])
		.filter((lap) => finiteNumber(lap.timeSeconds))
		.map((lap) => withDerivedSpeed(lap, poolLength));

	if (recordedLaps.length > 0) return recordedLaps;

	return readModelRows
		.filter((row) => row.isDynamic)
		.map((row) => {
			const timeSeconds = row.result?.actualDurationSeconds ?? row.lap?.timeSeconds;
			const distanceMeters = row.result?.actualDistanceMeters ?? row.lap?.distanceMeters;

			return withDerivedSpeed(
				{
					...(row.lap ?? {}),
					lapNumber: row.plan.globalRowIndex,
					timeSeconds,
					distanceMeters,
					restAfterSeconds: row.result?.actualRestSeconds ?? row.lap?.restAfterSeconds,
					completed: row.result?.completed ?? row.lap?.completed ?? true,
					notes: row.result?.notes ?? row.lap?.notes
				},
				poolLength
			);
		})
		.filter((lap) => finiteNumber(lap.timeSeconds));
}