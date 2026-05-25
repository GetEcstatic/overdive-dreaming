import type { Discipline, RoutineLog } from '$lib/types';

export type PublicProgressWindow = '30d' | '90d' | '365d';

export type PublicProgressTotals = {
	sessions: number;
	dynamicDistanceMeters: number;
	staticHoldSeconds: number;
};

export type PublicProgressBest = {
	discipline: Discipline;
	metric: 'distance' | 'time';
	value: number;
	routineLogId: string;
	date: Date;
};

export type PublicProgressMilestone = {
	id: string;
	label: string;
	routineLogId: string;
	date: Date;
};

export type PublicProgressReadModel = {
	recentLogs: RoutineLog[];
	bests: PublicProgressBest[];
	totals: Record<PublicProgressWindow, PublicProgressTotals>;
	milestones: PublicProgressMilestone[];
};

const WINDOWS: Record<PublicProgressWindow, number> = {
	'30d': 30,
	'90d': 90,
	'365d': 365
};

const DYNAMIC_DISTANCE_MILESTONES = [100, 150, 200];
const STATIC_TIME_MILESTONES = [120, 180, 240];

export function buildPublicProgressReadModel(
	logs: RoutineLog[],
	now = new Date()
): PublicProgressReadModel {
	const sortedLogs = [...logs].sort((a, b) => logDate(b).getTime() - logDate(a).getTime());

	return {
		recentLogs: sortedLogs.slice(0, 8),
		bests: buildBests(sortedLogs),
		totals: {
			'30d': buildTotalsForWindow(sortedLogs, now, WINDOWS['30d']),
			'90d': buildTotalsForWindow(sortedLogs, now, WINDOWS['90d']),
			'365d': buildTotalsForWindow(sortedLogs, now, WINDOWS['365d'])
		},
		milestones: buildMilestones(sortedLogs)
	};
}

function buildBests(logs: RoutineLog[]): PublicProgressBest[] {
	const bests = new Map<Discipline, PublicProgressBest>();

	for (const log of logs) {
		const result = primaryResult(log);
		if (!result) continue;

		const current = bests.get(log.disciplineUsed);
		if (!current || result.value > current.value) {
			bests.set(log.disciplineUsed, {
				discipline: log.disciplineUsed,
				metric: result.metric,
				value: result.value,
				routineLogId: log.id,
				date: logDate(log)
			});
		}
	}

	return [...bests.values()].sort((a, b) => a.discipline.localeCompare(b.discipline));
}

function buildTotalsForWindow(logs: RoutineLog[], now: Date, days: number): PublicProgressTotals {
	const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
	const windowLogs = logs.filter((log) => logDate(log) >= cutoff && logDate(log) <= now);

	return windowLogs.reduce<PublicProgressTotals>((totals, log) => ({
		sessions: totals.sessions + 1,
		dynamicDistanceMeters: totals.dynamicDistanceMeters + (isDynamic(log.disciplineUsed) ? dynamicDistance(log) : 0),
		staticHoldSeconds: totals.staticHoldSeconds + (log.disciplineUsed === 'STA' ? staticHoldTime(log) : 0)
	}), {
		sessions: 0,
		dynamicDistanceMeters: 0,
		staticHoldSeconds: 0
	});
}

function buildMilestones(logs: RoutineLog[]): PublicProgressMilestone[] {
	const chronologicalLogs = [...logs].sort((a, b) => logDate(a).getTime() - logDate(b).getTime());
	const milestones: PublicProgressMilestone[] = [];
	const seen = new Set<string>();

	for (const log of chronologicalLogs) {
		if (!seen.has('first-session')) {
			seen.add('first-session');
			milestones.push({
				id: 'first-session',
				label: 'First logged session',
				routineLogId: log.id,
				date: logDate(log)
			});
		}

		const distance = dynamicDistance(log);
		for (const threshold of DYNAMIC_DISTANCE_MILESTONES) {
			const id = `first-${threshold}m`;
			if (distance >= threshold && !seen.has(id)) {
				seen.add(id);
				milestones.push({ id, label: `First ${threshold}m dynamic`, routineLogId: log.id, date: logDate(log) });
			}
		}

		const holdSeconds = staticHoldTime(log);
		for (const threshold of STATIC_TIME_MILESTONES) {
			const id = `first-${threshold}s-static`;
			if (holdSeconds >= threshold && !seen.has(id)) {
				seen.add(id);
				milestones.push({ id, label: `First ${formatMinutes(threshold)} static`, routineLogId: log.id, date: logDate(log) });
			}
		}
	}

	return milestones;
}

function primaryResult(log: RoutineLog): { metric: 'distance' | 'time'; value: number } | undefined {
	if (isDynamic(log.disciplineUsed)) {
		const value = dynamicDistance(log);
		return value > 0 ? { metric: 'distance', value } : undefined;
	}

	const value = staticHoldTime(log);
	return value > 0 ? { metric: 'time', value } : undefined;
}

function dynamicDistance(log: RoutineLog): number {
	return log.totalDistance ?? log.diveDistance ?? log.cumulativeDistance ?? sumLaps(log, (lap) => lap.distanceMeters) ?? 0;
}

function staticHoldTime(log: RoutineLog): number {
	return log.totalTime ?? log.diveDuration ?? log.longestHold ?? log.cumulativeHoldTime ?? sumLaps(log, (lap) => lap.timeSeconds) ?? 0;
}

function sumLaps(log: RoutineLog, selector: (lap: NonNullable<RoutineLog['laps']>[number]) => number | undefined): number | undefined {
	if (!log.laps?.length) return undefined;
	return log.laps.reduce((sum, lap) => sum + (selector(lap) ?? 0), 0);
}

function isDynamic(discipline: Discipline): boolean {
	return discipline !== 'STA';
}

function logDate(log: RoutineLog): Date {
	return log.date.toDate();
}

function formatMinutes(seconds: number): string {
	return `${Math.round(seconds / 60)} minute`;
}