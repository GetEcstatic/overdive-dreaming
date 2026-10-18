import { describe, expect, it } from 'vitest';
import type { DiveTimeline } from '../../capture/timelineTypes';
import { fixtureTimeline, FIXTURE_PB_M, FIXTURE_POOL_M } from './fixtures';
import {
	cardLengths,
	diveSegments,
	distanceOnSegments,
	speedGraphFrame,
	speedScale,
	timeAtDistance,
	TURN_FLIP_MS,
	TURN_HOLD_MS,
	type SpeedGraphInput
} from './speedGraph';

const tl = fixtureTimeline();
const segments = diveSegments(tl);
const input: SpeedGraphInput = {
	segments,
	scale: speedScale(segments),
	poolLengthM: FIXTURE_POOL_M,
	firstLengthDirection: 'ltr',
	pbBeforeM: FIXTURE_PB_M
};

describe('diveSegments', () => {
	it('builds one segment per tap', () => {
		expect(segments).toHaveLength(15);
		expect(segments[0]).toMatchObject({ fromM: 0, toM: 12.5, startMs: 15_000, endMs: 25_000, estimated: false });
		expect(segments[0].speedMs).toBeCloseTo(1.25, 5);
	});

	it('adds an estimated tail when the dive ends between taps', () => {
		const t: DiveTimeline = { ...tl, diveEndMs: 190_000 };
		const tail = diveSegments(t).at(-1)!;
		expect(tail.estimated).toBe(true);
		expect(tail.fromM).toBe(190);
		expect(tail.endMs).toBe(190_000);
	});

	it('distance on segments matches the taps', () => {
		expect(distanceOnSegments(segments, 57_000)).toBeCloseTo(50, 6);
		expect(distanceOnSegments(segments, 10_000)).toBe(0);
		expect(timeAtDistance(segments, 50)).toBe(57_000);
	});
});

describe('speedScale', () => {
	it('pads the dive range to 0.1 m/s with two guides', () => {
		const s = speedScale(segments);
		expect(s.lo).toBeLessThan(Math.min(...segments.map((x) => x.speedMs)));
		expect(s.hi).toBeGreaterThan(Math.max(...segments.map((x) => x.speedMs)));
		expect(s.guides.length).toBeGreaterThan(0);
		expect(s.guides.length).toBeLessThanOrEqual(2);
		for (const g of s.guides) expect(g > s.lo && g < s.hi).toBe(true);
	});

	it('keeps a minimum height for very even dives', () => {
		const s = speedScale([{ fromM: 0, toM: 50, speedMs: 1, startMs: 0, endMs: 50_000, estimated: false }]);
		expect(s.hi - s.lo).toBeGreaterThanOrEqual(0.3 - 1e-9);
	});
});

describe('speedGraphFrame', () => {
	it('has no cursor before the dive', () => {
		const f = speedGraphFrame(input, 5_000);
		expect(f.length).toBe(1);
		expect(f.segments).toHaveLength(0);
		expect(f.cursor).toBeNull();
	});

	it('labels completed segments and leaves the current one unlabelled', () => {
		const f = speedGraphFrame(input, 40_000); // length 1, in the third segment
		expect(f.length).toBe(1);
		expect(f.segments.map((s) => s.label !== null)).toEqual([true, true, false]);
		expect(f.segments[0].label?.deltaMs).toBeNull(); // nothing to compare in length 1
		expect(f.cursor?.showTag).toBe(true);
	});

	it('holds the finished length at the wall, then flips the ghost', () => {
		const wall = 57_000;
		const hold = speedGraphFrame(input, wall + TURN_HOLD_MS / 2);
		expect(hold.phase).toBe('hold');
		expect(hold.length).toBe(1);
		expect(hold.segments.every((s) => s.label !== null)).toBe(true);
		expect(hold.cursor).toMatchObject({ distanceM: 50, showTag: false });

		const flip = speedGraphFrame(input, wall + TURN_HOLD_MS + TURN_FLIP_MS / 2);
		expect(flip.phase).toBe('flip');
		expect(flip.length).toBe(2);
		expect(flip.ghost?.flip).toBeCloseTo(0.5, 5);
		expect(flip.ghost?.showLabel).toBe(false);

		const settled = speedGraphFrame(input, wall + TURN_HOLD_MS + TURN_FLIP_MS + 1);
		expect(settled.phase).toBe('live');
		expect(settled.ghost).toMatchObject({ length: 1, flip: 1, dashed: true, showLabel: true });
	});

	it('alternates direction each length from the video setting', () => {
		expect(speedGraphFrame(input, 40_000).direction).toBe('ltr');
		expect(speedGraphFrame(input, 80_000).direction).toBe('rtl');
		expect(speedGraphFrame({ ...input, firstLengthDirection: 'rtl' }, 40_000).direction).toBe('rtl');
	});

	it('measures deltas against the same stretch of the previous length', () => {
		const f = speedGraphFrame(input, 99_000); // length 2, three segments done
		const first = f.segments[0];
		const ref = segments[0];
		expect(first.label?.deltaMs).toBeCloseTo(first.speedMs - ref.speedMs, 6);
	});

	it('shows the PB post only in the length containing the PB', () => {
		expect(speedGraphFrame(input, 120_000).pbPost).toBeNull(); // length 3
		const before = speedGraphFrame(input, 155_000); // length 4, 165 m
		expect(before.pbPost).toEqual({ distanceM: 175, passed: false });
		expect(speedGraphFrame(input, 170_000).pbPost?.passed).toBe(true);
	});

	it('freezes on the final length at the dive end', () => {
		const f = speedGraphFrame(input, 185_000);
		expect(f.length).toBe(4);
		expect(f.cursor).toMatchObject({ distanceM: 190, showTag: false });
		expect(f.segments.every((s) => s.label !== null)).toBe(true);
	});
});

describe('cardLengths', () => {
	it('summarises each length with split and average speed', () => {
		const lengths = cardLengths(segments, FIXTURE_POOL_M);
		expect(lengths.map((l) => l.n)).toEqual([1, 2, 3, 4]);
		expect(lengths[0].splitMs).toBeCloseTo(42_000, 3);
		expect(lengths[3]).toMatchObject({ partial: true, distanceM: 40 });
		expect(lengths[3].avgSpeedMs).toBeCloseTo(40 / 37, 5);
	});
});
