import { describe, it, expect } from 'vitest';
import {
	appendLap,
	averageSpeedMs,
	createEmptyTimeline,
	distanceAt,
	diveElapsedAt,
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

	it('diveElapsedAt is 0 before dive start', () => {
		const t = finalizeTimeline(createEmptyTimeline(10_000), 20_000);
		expect(diveElapsedAt(t, 5_000)).toBe(0);
	});

	it('diveElapsedAt freezes at dive end during surface-protocol playback', () => {
		const t = finalizeTimeline(createEmptyTimeline(10_000), 20_000);
		expect(diveElapsedAt(t, 15_000)).toBe(5_000);
		expect(diveElapsedAt(t, 30_000)).toBe(10_000);
	});

	it('totalDistanceM uses the last lap cumulative distance', () => {
		const t = buildFourLap50s();
		expect(totalDistanceM(t)).toBe(200);
	});

	it('totalDistanceM estimates distance when the dive ends before the first waypoint', () => {
		// 8s dive, no waypoint taps. Use the 1 m/s default → 8m.
		const t = finalizeTimeline(createEmptyTimeline(0), 8_000);
		expect(totalDistanceM(t)).toBe(8);
	});

	it('totalDistanceM adds a tail estimate when the dive ends mid-lap', () => {
		// 25m pool. First waypoint at 20s (1.25 m/s). Dive ends at 30s —
		// 10s after the last waypoint → expected 25m + 10 * 1.25 = 37.5m.
		let t = createEmptyTimeline(0);
		t = appendLap(t, 20_000, 25);
		t = finalizeTimeline(t, 30_000);
		expect(totalDistanceM(t)).toBeCloseTo(37.5, 5);
	});

	it('totalDistanceM uses the most recent lap pace for the tail (between waypoints)', () => {
		// Two waypoints @ 50m each: 0→20s (2.5 m/s), 20→30s (5 m/s).
		// Dive ends 10s after 2nd waypoint → expected 100m + 10 * 5 = 150m.
		let t = createEmptyTimeline(0);
		t = appendLap(t, 20_000, 50);
		t = appendLap(t, 30_000, 50);
		t = finalizeTimeline(t, 40_000);
		expect(totalDistanceM(t)).toBeCloseTo(150, 5);
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

	it('speedAt uses the first known waypoint segment before the first tap during replay', () => {
		expect(speedAt(t, 5_000, 50)).toBeCloseTo(50 / 30, 5);
	});

	it('speedAt returns 0 before dive start', () => {
		const late = finalizeTimeline(createEmptyTimeline(10_000), 20_000);
		expect(speedAt(late, 5_000, 50)).toBe(0);
	});

	it('speedAt uses the most recent completed lap split', () => {
		// After first lap at 30s — 50m / 30s = 1.666 m/s
		expect(speedAt(t, 30_000, 50)).toBeCloseTo(50 / 30, 5);
		expect(speedAt(t, 45_000, 50)).toBeCloseTo(50 / 30, 5);
	});

	it('distanceAt interpolates toward the first known waypoint during replay', () => {
		expect(distanceAt(t, 5_000, 50)).toBeCloseTo((50 / 30) * 5, 5);
	});

	it('distanceAt is 0 before dive start', () => {
		const late = finalizeTimeline(createEmptyTimeline(10_000), 20_000);
		expect(distanceAt(late, 5_000, 50)).toBe(0);
	});

	it('distanceAt for a dive that ended before the first waypoint matches totalDistanceM', () => {
		// 8s dive, no waypoints. Regression test: HUD used to read 0m during
		// playback while the recorded total was 8m.
		const short = finalizeTimeline(createEmptyTimeline(0), 8_000);
		expect(distanceAt(short, 8_000, 25)).toBeCloseTo(totalDistanceM(short), 5);
		expect(distanceAt(short, 8_000, 25)).toBeCloseTo(8, 5);
	});

	it('distanceAt clamps to the dive end when no waypoints were tapped', () => {
		// After End-dive, the HUD should freeze at the recorded distance rather
		// than keep growing for frames past diveEndMs.
		const short = finalizeTimeline(createEmptyTimeline(0), 8_000);
		expect(distanceAt(short, 12_000, 25)).toBeCloseTo(8, 5);
	});

	it('distanceAt interpolates linearly between wall taps', () => {
		// Halfway between lap 1 (30s, 50m) and lap 2 (60s, 100m).
		expect(distanceAt(t, 45_000, 50)).toBeCloseTo(75, 5);
	});

	it('distanceAt projects past the last waypoint at the latest measured segment speed', () => {
		let long = createEmptyTimeline(0);
		long = appendLap(long, 5_000, 50);
		long = finalizeTimeline(long, 15_000);
		expect(distanceAt(long, 15_000, 50)).toBeCloseTo(150, 5);
	});

	it('distanceAt and speedAt use sub-split waypoints between wall taps', () => {
		const splitTimeline: DiveTimeline = {
			diveStartMs: 0,
			diveEndMs: 30_000,
			laps: [
				{ lapNumber: 1, atMs: 20_000, splitMs: 10_000, cumulativeDistanceM: 25 }
			],
			subSplits: [
				{ lapNumber: 1, atMs: 10_000, splitMs: 10_000, cumulativeDistanceM: 12.5 }
			]
		};

		expect(speedAt(splitTimeline, 15_000, 25)).toBeCloseTo(1.25, 5);
		expect(distanceAt(splitTimeline, 15_000, 25)).toBeCloseTo(18.75, 5);
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

describe('timeline — samples-preferred replay (v2)', () => {
	function sampleTimeline() {
		return {
			diveStartMs: 0,
			diveEndMs: 30_000,
			laps: [
				// Two walls that happen to disagree with the samples (e.g.
				// miss-tap recovery): samples should win during replay.
				{ lapNumber: 1, atMs: 10_000, splitMs: 10_000, cumulativeDistanceM: 25 }
			],
			samples: [
				{ atMs: 0, distanceM: 0, speedMs: 1 },
				{ atMs: 10_000, distanceM: 15, speedMs: 1.5 },
				{ atMs: 20_000, distanceM: 30, speedMs: 1.5 }
			]
		};
	}

	it('distanceAt interpolates linearly between samples (not lap-based)', () => {
		const t = sampleTimeline();
		// Half-way between sample[0]=0m and sample[1]=15m at t=5000ms → 7.5m.
		// Lap-based would say ~12.5m (half of first lap).
		expect(distanceAt(t, 5000, 25)).toBeCloseTo(7.5, 5);
	});

	it('speedAt linearly interpolates sample speeds', () => {
		const t = sampleTimeline();
		// t=5000 lies between speed 1 and speed 1.5 → 1.25 m/s.
		expect(speedAt(t, 5000, 25)).toBeCloseTo(1.25, 5);
	});

	it('distanceAt projects past the last sample at its speed, up to diveEndMs', () => {
		const t = sampleTimeline();
		// Last sample at t=20000, distance=30, speed=1.5 → at t=25000 → 37.5m.
		expect(distanceAt(t, 25_000, 25)).toBeCloseTo(37.5, 5);
	});

	it('totalDistanceM uses samples tail estimate when samples exist', () => {
		const t = sampleTimeline();
		// dive ends at 30000, last sample at 20000, speed 1.5 → 30 + 10s*1.5 = 45m.
		expect(totalDistanceM(t)).toBeCloseTo(45, 5);
	});

	it('falls back to lap-based interp when samples are absent (legacy clips)', () => {
		let t = createEmptyTimeline(0);
		t = appendLap(t, 20_000, 25); // wall at t=20s, distance=25m
		t = appendLap(t, 40_000, 25); // wall at t=40s, distance=50m
		t = finalizeTimeline(t, 40_000);
		// Legacy stepwise model: at t=30000 (mid-lap 2), last lap ended at
		// 20s with 25m base, splitMs=20000, progress=(30000-20000)/20000=0.5
		// → 25 + 0.5*25 = 37.5m.
		expect(distanceAt(t, 30_000, 25)).toBeCloseTo(37.5, 5);
	});
});
