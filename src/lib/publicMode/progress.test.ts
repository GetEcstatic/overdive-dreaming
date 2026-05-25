import { describe, expect, it } from 'vitest';
import type { Discipline, RoutineLog } from '$lib/types';
import { buildPublicProgressReadModel } from './progress';

function timestamp(date: string) {
	return { toDate: () => new Date(date) } as RoutineLog['date'];
}

function log(overrides: Partial<RoutineLog> & Pick<RoutineLog, 'id' | 'disciplineUsed' | 'date'>): RoutineLog {
	return {
		routineId: 'routine-1',
		userId: 'user-1',
		hasDetailedData: false,
		createdAt: overrides.date,
		updatedAt: overrides.date,
		...overrides
	} as RoutineLog;
}

describe('buildPublicProgressReadModel', () => {
	it('returns recent logs newest first', () => {
		const model = buildPublicProgressReadModel([
			log({ id: 'old', disciplineUsed: 'STA', date: timestamp('2026-01-01'), totalTime: 90 }),
			log({ id: 'new', disciplineUsed: 'STA', date: timestamp('2026-01-03'), totalTime: 100 })
		]);

		expect(model.recentLogs.map((entry) => entry.id)).toEqual(['new', 'old']);
	});

	it('builds bests by discipline', () => {
		const model = buildPublicProgressReadModel([
			log({ id: 'dyn-1', disciplineUsed: 'DYN', date: timestamp('2026-01-01'), totalDistance: 75 }),
			log({ id: 'dyn-2', disciplineUsed: 'DYN', date: timestamp('2026-01-02'), totalDistance: 100 }),
			log({ id: 'sta-1', disciplineUsed: 'STA', date: timestamp('2026-01-03'), totalTime: 180 })
		]);

		expect(best(model.bests, 'DYN')).toMatchObject({ metric: 'distance', value: 100, routineLogId: 'dyn-2' });
		expect(best(model.bests, 'STA')).toMatchObject({ metric: 'time', value: 180, routineLogId: 'sta-1' });
	});

	it('summarizes public time windows', () => {
		const model = buildPublicProgressReadModel([
			log({ id: 'recent-dyn', disciplineUsed: 'DYN', date: timestamp('2026-05-20'), totalDistance: 100 }),
			log({ id: 'recent-sta', disciplineUsed: 'STA', date: timestamp('2026-05-18'), totalTime: 120 }),
			log({ id: 'old-dyn', disciplineUsed: 'DYN', date: timestamp('2026-01-01'), totalDistance: 200 })
		], new Date('2026-05-25'));

		expect(model.totals['30d']).toEqual({ sessions: 2, dynamicDistanceMeters: 100, staticHoldSeconds: 120 });
		expect(model.totals['365d']).toEqual({ sessions: 3, dynamicDistanceMeters: 300, staticHoldSeconds: 120 });
	});

	it('detects simple public milestones chronologically', () => {
		const model = buildPublicProgressReadModel([
			log({ id: 'first', disciplineUsed: 'DYN', date: timestamp('2026-01-01'), totalDistance: 80 }),
			log({ id: 'hundred', disciplineUsed: 'DYN', date: timestamp('2026-01-02'), totalDistance: 100 }),
			log({ id: 'static', disciplineUsed: 'STA', date: timestamp('2026-01-03'), totalTime: 180 })
		]);

		expect(model.milestones.map((milestone) => milestone.id)).toEqual([
			'first-session',
			'first-100m',
			'first-120s-static',
			'first-180s-static'
		]);
	});
});

function best(bests: ReturnType<typeof buildPublicProgressReadModel>['bests'], discipline: Discipline) {
	return bests.find((entry) => entry.discipline === discipline);
}