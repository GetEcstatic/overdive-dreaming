/**
 * Pure helpers for rendering a per-lap/per-rep table for dynamic dives.
 *
 * Given a list of `LapData` and the pool length, build a `LapTableRow[]`
 * with split time, cumulative time, distance, cumulative distance, and
 * speed. Kept in a standalone module so it is trivially unit-testable.
 */

import type { LapData } from '$lib/types';

export interface LapTableRow {
	lapNumber: number;
	splitSeconds: number | null;
	cumulativeSeconds: number | null;
	distanceMeters: number | null;
	cumulativeDistanceMeters: number | null;
	speedMs: number | null;
	isFastest: boolean;
	isSlowest: boolean;
}

/**
 * Build display rows for a dynamic dive's per-lap table.
 *
 * - Split time prefers `lap.timeSeconds`.
 * - Distance prefers `lap.distanceMeters`, falls back to `poolLength`.
 * - Cumulative time/distance is a running sum of the split values.
 * - Speed prefers `lap.speedMs`, falls back to `distance / splitTime`.
 * - The fastest and slowest laps are flagged (based on speed, or split
 *   time as a fallback when speed isn't available).
 */
export function buildLapTableRows(
	laps: LapData[] | undefined | null,
	poolLength?: number
): LapTableRow[] {
	if (!laps || laps.length === 0) return [];

	let cumulativeSeconds = 0;
	let cumulativeDistance = 0;
	let cumulativeSecondsValid = true;
	let cumulativeDistanceValid = true;

	const rows: LapTableRow[] = laps.map((lap) => {
		const splitSeconds =
			typeof lap.timeSeconds === 'number' && isFinite(lap.timeSeconds)
				? lap.timeSeconds
				: null;
		const distanceMeters =
			typeof lap.distanceMeters === 'number' && isFinite(lap.distanceMeters)
				? lap.distanceMeters
				: typeof poolLength === 'number' && poolLength > 0
					? poolLength
					: null;

		if (splitSeconds !== null) cumulativeSeconds += splitSeconds;
		else cumulativeSecondsValid = false;

		if (distanceMeters !== null) cumulativeDistance += distanceMeters;
		else cumulativeDistanceValid = false;

		let speedMs: number | null = null;
		if (typeof lap.speedMs === 'number' && isFinite(lap.speedMs) && lap.speedMs > 0) {
			speedMs = lap.speedMs;
		} else if (distanceMeters !== null && splitSeconds !== null && splitSeconds > 0) {
			speedMs = distanceMeters / splitSeconds;
		}

		return {
			lapNumber: lap.lapNumber,
			splitSeconds,
			cumulativeSeconds: cumulativeSecondsValid ? cumulativeSeconds : null,
			distanceMeters,
			cumulativeDistanceMeters: cumulativeDistanceValid ? cumulativeDistance : null,
			speedMs,
			isFastest: false,
			isSlowest: false
		};
	});

	// Flag fastest/slowest by speed (preferred) or split time (fallback).
	const rowsBySpeed = rows
		.map((r, i) => ({ i, v: r.speedMs }))
		.filter((x): x is { i: number; v: number } => x.v !== null);
	if (rowsBySpeed.length >= 2) {
		const maxSpeed = Math.max(...rowsBySpeed.map((r) => r.v));
		const minSpeed = Math.min(...rowsBySpeed.map((r) => r.v));
		if (maxSpeed !== minSpeed) {
			rows[rowsBySpeed.find((r) => r.v === maxSpeed)!.i].isFastest = true;
			rows[rowsBySpeed.find((r) => r.v === minSpeed)!.i].isSlowest = true;
		}
	} else {
		const rowsBySplit = rows
			.map((r, i) => ({ i, v: r.splitSeconds }))
			.filter((x): x is { i: number; v: number } => x.v !== null);
		if (rowsBySplit.length >= 2) {
			const minSplit = Math.min(...rowsBySplit.map((r) => r.v));
			const maxSplit = Math.max(...rowsBySplit.map((r) => r.v));
			if (minSplit !== maxSplit) {
				rows[rowsBySplit.find((r) => r.v === minSplit)!.i].isFastest = true;
				rows[rowsBySplit.find((r) => r.v === maxSplit)!.i].isSlowest = true;
			}
		}
	}

	return rows;
}
