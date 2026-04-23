/**
 * Helpers for the Dynamic analytics view.
 *
 * All functions are pure and operate on a list of RoutineLog records.
 * Dynamic disciplines are DYN, DYNB, DNF.
 */

import type { RoutineLog, Discipline } from '$lib/types';

const DYNAMIC: Discipline[] = ['DYN', 'DYNB', 'DNF'];

export function isDynamicLog(log: RoutineLog): boolean {
	return DYNAMIC.includes(log.disciplineUsed);
}

/** Read avgSpeedMs, falling back to the deprecated avgSpeed alias. */
export function readAvgSpeed(log: RoutineLog): number | undefined {
	return log.avgSpeedMs ?? log.avgSpeed;
}

/** Read fastest lap speed, falling back to the deprecated maxRepSpeed alias. */
export function readFastestLapSpeed(log: RoutineLog): number | undefined {
	return log.fastestLapSpeedMs ?? log.maxRepSpeed;
}

/** Read slowest lap speed, falling back to the deprecated minRepSpeed alias. */
export function readSlowestLapSpeed(log: RoutineLog): number | undefined {
	return log.slowestLapSpeedMs ?? log.minRepSpeed;
}

interface SeriesPoint {
	date: Date;
	value: number;
	discipline: Discipline;
}

function sortedByDate(logs: RoutineLog[]): RoutineLog[] {
	return [...logs].sort((a, b) => a.date.toDate().getTime() - b.date.toDate().getTime());
}

const DISCIPLINE_COLOR: Record<Discipline, { border: string; fill: string }> = {
	DYN: { border: '#14b8a6', fill: 'rgba(20, 184, 166, 0.15)' },
	DNF: { border: '#38bdf8', fill: 'rgba(56, 189, 248, 0.15)' },
	DYNB: { border: '#fbbf24', fill: 'rgba(251, 191, 36, 0.15)' },
	STA: { border: '#a78bfa', fill: 'rgba(167, 139, 250, 0.15)' }
};

/**
 * Line chart: avg speed over time, one series per dynamic discipline.
 */
export function buildAvgSpeedSeries(logs: RoutineLog[]) {
	const dynamicLogs = sortedByDate(logs.filter(isDynamicLog));
	const byDisc: Record<string, SeriesPoint[]> = {};
	for (const log of dynamicLogs) {
		const v = readAvgSpeed(log);
		if (v === undefined || !isFinite(v)) continue;
		(byDisc[log.disciplineUsed] ??= []).push({
			date: log.date.toDate(),
			value: v,
			discipline: log.disciplineUsed
		});
	}

	const allDates = dynamicLogs
		.filter((log) => readAvgSpeed(log) !== undefined)
		.map((log) => log.date.toDate());
	const labels = allDates.map((d) => d.toISOString().slice(0, 10));

	const datasets = Object.entries(byDisc).map(([disc, points]) => {
		const color = DISCIPLINE_COLOR[disc as Discipline];
		return {
			label: disc,
			data: labels.map((label) => {
				const pt = points.find((p) => p.date.toISOString().slice(0, 10) === label);
				return pt ? pt.value : null;
			}),
			borderColor: color.border,
			backgroundColor: color.fill,
			spanGaps: true,
			tension: 0.3
		};
	});

	return { labels, datasets, hasData: datasets.length > 0 && labels.length > 0 };
}

/**
 * Scatter: fastest lap speed per log, x=date index, y=m/s, one series per discipline.
 */
export function buildFastestLapScatter(logs: RoutineLog[]) {
	const dynamicLogs = sortedByDate(logs.filter(isDynamicLog));
	const byDisc: Record<string, { x: number; y: number }[]> = {};
	for (const log of dynamicLogs) {
		const v = readFastestLapSpeed(log);
		if (v === undefined || !isFinite(v)) continue;
		(byDisc[log.disciplineUsed] ??= []).push({
			x: log.date.toDate().getTime(),
			y: v
		});
	}
	const datasets = Object.entries(byDisc).map(([disc, points]) => {
		const color = DISCIPLINE_COLOR[disc as Discipline];
		return {
			label: disc,
			data: points,
			borderColor: color.border,
			backgroundColor: color.border,
			pointRadius: 5
		};
	});
	return { datasets, hasData: datasets.some((d) => d.data.length > 0) };
}

/**
 * Scatter: avgSpeed vs totalDistance, one series per discipline.
 */
export function buildSpeedVsDistance(logs: RoutineLog[]) {
	const dynamicLogs = logs.filter(isDynamicLog);
	const byDisc: Record<string, { x: number; y: number }[]> = {};
	for (const log of dynamicLogs) {
		const speed = readAvgSpeed(log);
		const dist = log.totalDistance ?? log.diveDistance;
		if (speed === undefined || dist === undefined || !isFinite(speed) || !isFinite(dist)) continue;
		(byDisc[log.disciplineUsed] ??= []).push({ x: dist, y: speed });
	}
	const datasets = Object.entries(byDisc).map(([disc, points]) => {
		const color = DISCIPLINE_COLOR[disc as Discipline];
		return {
			label: disc,
			data: points,
			borderColor: color.border,
			backgroundColor: color.border,
			pointRadius: 5
		};
	});
	return { datasets, hasData: datasets.some((d) => d.data.length > 0) };
}

/**
 * Pacing profile: average per-lap speed curve over the N most recent dives,
 * one series per dynamic discipline (not averaged across disciplines).
 *
 * The x-axis is the lap number (1-based). For each discipline we take the
 * last `limit` logs with per-lap data and average lap N across those logs.
 */
export function buildPacingProfile(logs: RoutineLog[], limit = 10) {
	const dynamicLogs = sortedByDate(logs.filter(isDynamicLog));
	const byDisc: Record<string, RoutineLog[]> = {};
	for (const log of dynamicLogs) {
		if (!log.laps || log.laps.length === 0) continue;
		(byDisc[log.disciplineUsed] ??= []).push(log);
	}

	// Keep last `limit` per discipline.
	for (const key of Object.keys(byDisc)) {
		byDisc[key] = byDisc[key].slice(-limit);
	}

	// Figure out max lap count across all retained logs.
	let maxLaps = 0;
	for (const list of Object.values(byDisc)) {
		for (const log of list) {
			maxLaps = Math.max(maxLaps, log.laps?.length ?? 0);
		}
	}

	const labels = Array.from({ length: maxLaps }, (_, i) => String(i + 1));

	const datasets = Object.entries(byDisc).map(([disc, list]) => {
		const color = DISCIPLINE_COLOR[disc as Discipline];
		const avgByLap: (number | null)[] = [];
		for (let i = 0; i < maxLaps; i++) {
			const values: number[] = [];
			for (const log of list) {
				const lap = log.laps?.[i];
				if (!lap) continue;
				// Prefer explicit speed; fall back to distance/time.
				let v: number | undefined;
				if (typeof lap.speedMs === 'number') {
					v = lap.speedMs;
				} else if (
					typeof lap.distanceMeters === 'number' &&
					typeof lap.timeSeconds === 'number' &&
					lap.timeSeconds > 0
				) {
					v = lap.distanceMeters / lap.timeSeconds;
				}
				if (v !== undefined && isFinite(v)) values.push(v);
			}
			avgByLap.push(values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
		}
		return {
			label: `${disc} (last ${list.length})`,
			data: avgByLap,
			borderColor: color.border,
			backgroundColor: color.fill,
			spanGaps: true,
			tension: 0.3
		};
	});

	return { labels, datasets, hasData: labels.length > 0 && datasets.length > 0 };
}
