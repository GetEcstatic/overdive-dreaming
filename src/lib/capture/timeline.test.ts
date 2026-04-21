import { describe, it, expect } from 'vitest';
import {
	appendLap,
	averageSpeedMs,
	createEmptyTimeline,
	distanceAt,
	finalizeTimeline,
	removeLastLap,
	speedAt,
	summariseTimeline,
	totalDistanceM,
	totalTimeMs
} from './timeline';
import type { DiveTimeline } from '$lib/types';

function buildFourLap50s(): DiveTimeline {
	// A 200m DYN in a 50m pool: 4 laps, 30s/lap, STOP at 120s.
	let t = createEmptyTimeline(0);
	t = appendLap(t, 30_000, 50);
	t = appendLap(t, 60_000, 50);
	t = appendLap(t, 90_000, 50);
	t = appendLap(t, 120_000, 50);
	t = finalizeTimeline(t, 120_000);
	return t;
}

describe('timeline — createEmptyTimeline', () => {
	it('seeds start and end to the same value with no laps', () => {
		const t = createEmptyTimeline(1234);
		expect(t.diveStartMs).toBe(1234);
		expect(t.diveEndMs).toBe(1234);
		expect(t.laps).toEqual([]);
		expect(t.events).toEqual([]);
	});
});

describe('timeline — appendLap', () => {
	it('assigns sequential lap numbers and cumulative distance', () => {
		let t = createEmptyTimeline(0);
		t = appendLap(t, 20_000, 25);
		t = appendLap(t, 40_000, 25);
		expect(t.laps).toHaveLength(2);
		expect(t.laps[0].lapNumber).toBe(1);
		expect(t.laps[0].cumulativeDistanceM).toBe(25);
		expect(t.laps[0].splitMs).toBe(20_000);
		expect(t.laps[1].lapNumber).toBe(2);
		expect(t.laps[1].cumulativeDistanceM).toBe(50);
		expect(t.laps[1].splitMs).toBe(20_000);
	});

	it('clamps negative splits to 0 (defensive against clock skew)', () => {
		let t = createEmptyTimeline(0);
		t = appendLap(t, 10_000, 25);
		t = appendLap(t, 5_000, 25); // tap arrived "before" previous
		expect(t.laps[1].splitMs).toBe(0);
	});

	it('is immutable — does not mutate the input timeline', () => {
		const a = createEmptyTimeline(0);
		const b = appendLap(a, 10_000, 25);
		expect(a.laps).toHaveLength(0);
		expect(b.laps).toHaveLength(1);
	});
});

describe('timeline — removeLastLap', () => {
	it('drops the most recent lap', () => {
		let t = createEmptyTimeline(0);
		t = appendLap(t, 10_000, 25);
		t = appendLap(t, 20_000, 25);
		t = removeLastLap(t);
		expect(t.laps).toHaveLength(1);
		expect(t.laps[0].lapNumber).toBe(1);
	});

	it('is a no-op when there are no laps', () => {
		const t = createEmptyTimeline(0);
		expect(removeLastLap(t)).toEqual(t);
	});
});

describe('timeline — totals', () => {
	it('totalTimeMs clamps negative to 0', () => {
		const t = finalizeTimeline(createEmptyTimeline(1000), 500);
		expect(totalTimeMs(t)).toBe(0);
	});

	it('totalDistanceM uses the last lap cumulative distance', () => {
		const t = buildFourLap50s();
		expect(totalDistanceM(t)).toBe(200);
	});

	it('averageSpeedMs matches distance / time', () => {
		const t = buildFourLap50s();
		expect(averageSpeedMs(t)).toBeCloseTo(200 / 120, 5);
	});

	it('averageSpeedMs is 0 when total time is 0', () => {
		const t = createEmptyTimeline(0);
		expect(averageSpeedMs(t)).toBe(0);
	});
});

describe('timeline — speedAt / distanceAt', () => {
	const t = buildFourLap50s();

	it('speedAt returns 0 before the first lap', () => {
		expect(speedAt(t, 5_000, 50)).toBe(0);
	});

	it('speedAt uses the most recent completed lap split', () => {
		// After first lap at 30s — 50m / 30s = 1.666 m/s
		expect(speedAt(t, 30_000, 50)).toBeCloseTo(50 / 30, 5);
		expect(speedAt(t, 45_000, 50)).toBeCloseTo(50 / 30, 5);
	});

	it('distanceAt is 0 before the first lap', () => {
		expect(distanceAt(t, 5_000, 50)).toBe(0);
	});

	it('distanceAt interpolates linearly between wall taps', () => {
		// Halfway between lap 1 (30s, 50m) and lap 2 (60s, 100m).
		expect(distanceAt(t, 45_000, 50)).toBeCloseTo(75, 5);
	});

	it('distanceAt never overshoots the next wall (capped at lap progress = 1)', () => {
		// Pretend 10s after a 5s lap — progress should cap at 1.
		let long = createEmptyTimeline(0);
		long = appendLap(long, 5_000, 50);
		// No next lap yet; interpolation would want 2× lap distance but is clamped.
		expect(distanceAt(long, 15_000, 50)).toBeCloseTo(100, 5); // 50 + 50*1
	});
});

describe('timeline — summariseTimeline', () => {
	it('produces consistent totals, fastest/slowest, and average split', () => {
		const s = summariseTimeline(buildFourLap50s());
		expect(s.lapCount).toBe(4);
		expect(s.totalTimeSeconds).toBe(120);
		expect(s.totalDistanceM).toBe(200);
		expect(s.avgSplitSeconds).toBeCloseTo(30, 5);
		expect(s.fastestLapSeconds).toBeCloseTo(30, 5);
		expect(s.slowestLapSeconds).toBeCloseTo(30, 5);
		expect(s.averageSpeedMs).toBeCloseTo(200 / 120, 5);
	});

	it('returns null fastest/slowest for empty timelines', () => {
		const s = summariseTimeline(createEmptyTimeline(0));
		expect(s.lapCount).toBe(0);
		expect(s.fastestLapSeconds).toBeNull();
		expect(s.slowestLapSeconds).toBeNull();
	});

	it('identifies fastest and slowest split correctly for uneven laps', () => {
		let t = createEmptyTimeline(0);
		t = appendLap(t, 20_000, 50); // 20s (fastest)
		t = appendLap(t, 55_000, 50); // 35s (slowest)
		t = appendLap(t, 80_000, 50); // 25s
		t = finalizeTimeline(t, 80_000);
		const s = summariseTimeline(t);
		expect(s.fastestLapSeconds).toBeCloseTo(20, 5);
		expect(s.slowestLapSeconds).toBeCloseTo(35, 5);
		expect(s.avgSplitSeconds).toBeCloseTo((20 + 35 + 25) / 3, 5);
	});
});
