import { describe, it, expect } from 'vitest';
import { buildLapTableRows } from './lapTable';
import type { LapData } from '$lib/types';

describe('lapTable — buildLapTableRows', () => {
	it('returns an empty array for undefined/empty input', () => {
		expect(buildLapTableRows(undefined)).toEqual([]);
		expect(buildLapTableRows([])).toEqual([]);
	});

	it('fills cumulative time and distance with a running sum', () => {
		const laps: LapData[] = [
			{ lapNumber: 1, timeSeconds: 20, distanceMeters: 25, speedMs: 1.25 },
			{ lapNumber: 2, timeSeconds: 22, distanceMeters: 25, speedMs: 25 / 22 },
			{ lapNumber: 3, timeSeconds: 24, distanceMeters: 25, speedMs: 25 / 24 }
		];
		const rows = buildLapTableRows(laps);
		expect(rows).toHaveLength(3);
		expect(rows[0].cumulativeSeconds).toBe(20);
		expect(rows[1].cumulativeSeconds).toBe(42);
		expect(rows[2].cumulativeSeconds).toBe(66);
		expect(rows[0].cumulativeDistanceMeters).toBe(25);
		expect(rows[1].cumulativeDistanceMeters).toBe(50);
		expect(rows[2].cumulativeDistanceMeters).toBe(75);
	});

	it('falls back to poolLength for lap distance when not set', () => {
		const laps: LapData[] = [
			{ lapNumber: 1, timeSeconds: 20 },
			{ lapNumber: 2, timeSeconds: 22 }
		];
		const rows = buildLapTableRows(laps, 50);
		expect(rows[0].distanceMeters).toBe(50);
		expect(rows[1].distanceMeters).toBe(50);
		expect(rows[1].cumulativeDistanceMeters).toBe(100);
	});

	it('derives speed from distance / time when speedMs is missing', () => {
		const laps: LapData[] = [
			{ lapNumber: 1, timeSeconds: 25, distanceMeters: 50 }
		];
		const rows = buildLapTableRows(laps);
		expect(rows[0].speedMs).toBeCloseTo(2, 5);
	});

	it('flags the fastest and slowest laps by speed', () => {
		const laps: LapData[] = [
			{ lapNumber: 1, timeSeconds: 20, distanceMeters: 25 }, // 1.25 m/s (fastest)
			{ lapNumber: 2, timeSeconds: 25, distanceMeters: 25 }, // 1.00 m/s
			{ lapNumber: 3, timeSeconds: 30, distanceMeters: 25 }  // 0.83 m/s (slowest)
		];
		const rows = buildLapTableRows(laps);
		expect(rows[0].isFastest).toBe(true);
		expect(rows[2].isSlowest).toBe(true);
		expect(rows[1].isFastest).toBe(false);
		expect(rows[1].isSlowest).toBe(false);
	});

	it('does not flag fastest/slowest when all speeds are equal', () => {
		const laps: LapData[] = [
			{ lapNumber: 1, timeSeconds: 20, distanceMeters: 25 },
			{ lapNumber: 2, timeSeconds: 20, distanceMeters: 25 }
		];
		const rows = buildLapTableRows(laps);
		expect(rows[0].isFastest).toBe(false);
		expect(rows[1].isFastest).toBe(false);
	});

	it('leaves cumulative null when a split value is missing', () => {
		const laps: LapData[] = [
			{ lapNumber: 1, timeSeconds: 20, distanceMeters: 25 },
			{ lapNumber: 2, distanceMeters: 25 }, // missing time
			{ lapNumber: 3, timeSeconds: 22, distanceMeters: 25 }
		];
		const rows = buildLapTableRows(laps);
		expect(rows[0].cumulativeSeconds).toBe(20);
		expect(rows[1].cumulativeSeconds).toBeNull();
		// once invalidated, subsequent cumulatives also stay null
		expect(rows[2].cumulativeSeconds).toBeNull();
	});
});
