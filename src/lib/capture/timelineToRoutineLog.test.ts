import { describe, expect, it } from 'vitest';
import type { DiveTimeline } from '$lib/types';
import {
	defaultRoutineForDiscipline,
	projectTimelineToRoutineLog,
	sessionGroupFor,
	timeOfDayFor
} from './timelineToRoutineLog';

const POOL_LENGTH = 25;

function buildTimeline(overrides: Partial<DiveTimeline> = {}): DiveTimeline {
	return {
		diveStartMs: 0,
		diveEndMs: 0,
		laps: [],
		events: [],
		...overrides
	};
}

describe('timeOfDayFor', () => {
	it('buckets morning between 06:00 and 11:59', () => {
		expect(timeOfDayFor(new Date(2026, 0, 1, 6, 0))).toBe('morning');
		expect(timeOfDayFor(new Date(2026, 0, 1, 11, 59))).toBe('morning');
	});
	it('buckets afternoon between 12:00 and 17:59', () => {
		expect(timeOfDayFor(new Date(2026, 0, 1, 12, 0))).toBe('afternoon');
		expect(timeOfDayFor(new Date(2026, 0, 1, 17, 59))).toBe('afternoon');
	});
	it('buckets evening for the rest of the day', () => {
		expect(timeOfDayFor(new Date(2026, 0, 1, 18, 0))).toBe('evening');
		expect(timeOfDayFor(new Date(2026, 0, 1, 23, 30))).toBe('evening');
		expect(timeOfDayFor(new Date(2026, 0, 1, 5, 30))).toBe('evening');
	});
});

describe('sessionGroupFor', () => {
	it('formats as YYYY-MM-DD-{period}', () => {
		expect(sessionGroupFor(new Date(2026, 0, 1, 10, 0))).toBe('2026-01-01-morning');
		expect(sessionGroupFor(new Date(2026, 11, 31, 14, 0))).toBe('2026-12-31-afternoon');
	});
});

describe('defaultRoutineForDiscipline', () => {
	it('always returns the dynamic max template for any dynamic discipline', () => {
		expect(defaultRoutineForDiscipline('DYN')).toBe('system-dynamic-max');
		expect(defaultRoutineForDiscipline('DYNB')).toBe('system-dynamic-max');
		expect(defaultRoutineForDiscipline('DNF')).toBe('system-dynamic-max');
	});
});

describe('projectTimelineToRoutineLog', () => {
	const recordedAt = new Date(2026, 0, 1, 10, 0); // Jan 1 2026, 10:00

	it('synthesises a complete routine log from a 2-lap dive', () => {
		const timeline = buildTimeline({
			diveStartMs: 0,
			diveEndMs: 60_000,
			laps: [
				{ lapNumber: 1, atMs: 30_000, splitMs: 30_000, cumulativeDistanceM: 25 },
				{ lapNumber: 2, atMs: 60_000, splitMs: 30_000, cumulativeDistanceM: 50 }
			]
		});

		const result = projectTimelineToRoutineLog({
			timeline,
			discipline: 'DYN',
			poolLength: POOL_LENGTH,
			recordedAt,
			durationSeconds: 60,
			coachDisplayName: 'Coach Pat'
		});

		expect(result.routineId).toBe('system-dynamic-max');
		expect(result.disciplineUsed).toBe('DYN');
		expect(result.poolLength).toBe(25);
		expect(result.totalTime).toBe(60);
		expect(result.totalDistance).toBe(50);
		expect(result.laps).toHaveLength(2);
		expect(result.laps[0]).toMatchObject({
			lapNumber: 1,
			timeSeconds: 30,
			distanceMeters: 25,
			completed: true
		});
		expect(result.laps[1]).toMatchObject({
			lapNumber: 2,
			timeSeconds: 30,
			distanceMeters: 25
		});
		expect(result.hasDetailedData).toBe(true);
		expect(result.sessionGroup).toBe('2026-01-01-morning');
		expect(result.timeOfDay).toBe('morning');
		expect(result.notes).toBe('Gifted by Coach Pat');
	});

	it('falls back to durationSeconds when the timeline has no end time', () => {
		const timeline = buildTimeline(); // empty
		const result = projectTimelineToRoutineLog({
			timeline,
			discipline: 'DNF',
			poolLength: POOL_LENGTH,
			recordedAt,
			durationSeconds: 42
		});
		expect(result.totalTime).toBe(42);
		expect(result.totalDistance).toBe(0);
		expect(result.laps).toHaveLength(0);
		expect(result.hasDetailedData).toBe(false);
	});

	it('uses lapCount * poolLength when totalDistanceM is zero', () => {
		const timeline = buildTimeline({
			diveStartMs: 0,
			diveEndMs: 60_000,
			laps: [
				{ lapNumber: 1, atMs: 30_000, splitMs: 30_000, cumulativeDistanceM: 25 },
				{ lapNumber: 2, atMs: 60_000, splitMs: 30_000, cumulativeDistanceM: 50 }
			]
		});
		const result = projectTimelineToRoutineLog({
			timeline,
			discipline: 'DYNB',
			poolLength: 25,
			recordedAt,
			durationSeconds: 60
		});
		expect(result.totalDistance).toBeGreaterThan(0);
	});

	it('falls back to a generic note when no coach name is provided', () => {
		const timeline = buildTimeline();
		const result = projectTimelineToRoutineLog({
			timeline,
			discipline: 'DYN',
			poolLength: POOL_LENGTH,
			recordedAt,
			durationSeconds: 30
		});
		expect(result.notes).toBe('Gifted dive');
	});

	it('computes fastest and slowest lap speeds from the laps array', () => {
		const timeline = buildTimeline({
			diveStartMs: 0,
			diveEndMs: 60_000,
			laps: [
				// 25m in 20s → 1.25 m/s
				{ lapNumber: 1, atMs: 20_000, splitMs: 20_000, cumulativeDistanceM: 25 },
				// 25m in 40s → 0.625 m/s
				{ lapNumber: 2, atMs: 60_000, splitMs: 40_000, cumulativeDistanceM: 50 }
			]
		});
		const result = projectTimelineToRoutineLog({
			timeline,
			discipline: 'DYN',
			poolLength: 25,
			recordedAt,
			durationSeconds: 60
		});
		expect(result.fastestLapSpeedMs).toBeCloseTo(1.25, 3);
		expect(result.slowestLapSpeedMs).toBeCloseTo(0.625, 3);
	});
});
