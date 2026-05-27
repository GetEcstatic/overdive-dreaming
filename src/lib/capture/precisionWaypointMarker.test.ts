import { describe, expect, it } from 'vitest';
import {
	createPrecisionMarkingState,
	endDive,
	inferPrecisionMarkerConfig,
	markDiveStart,
	markNextWaypoint,
	precisionElapsedMs,
	precisionPrimaryLabel,
	projectPrecisionStateToTimeline,
	restartMarking,
	summarisePrecisionState,
	undoLastMark
} from './precisionWaypointMarker';

const CONFIG = { poolLengthM: 50, waypointsPerLap: 4, defaultSpeedMs: 1.2 };

describe('precisionWaypointMarker', () => {
	it('starts at Start dive with the first waypoint queued', () => {
		const state = createPrecisionMarkingState(CONFIG);
		expect(state.phase).toBe('start');
		expect(state.nextDistanceM).toBe(12.5);
		expect(precisionPrimaryLabel(state)).toBe('Start dive');
	});

	it('marks start and advances through split and wall labels', () => {
		let state = createPrecisionMarkingState(CONFIG);
		state = markDiveStart(state, 10_000);
		expect(state.phase).toBe('waypoints');
		expect(state.diveStartMs).toBe(10_000);
		expect(precisionPrimaryLabel(state)).toBe('12.5 m');
		state = markNextWaypoint(state, 20_000);
		expect(precisionPrimaryLabel(state)).toBe('25 m');
		state = markNextWaypoint(state, 30_000);
		state = markNextWaypoint(state, 40_000);
		expect(precisionPrimaryLabel(state)).toBe('50 m wall');
	});

	it('projects committed precision marks to DiveTimeline split and wall events', () => {
		let state = createPrecisionMarkingState(CONFIG);
		state = markDiveStart(state, 10_000);
		state = markNextWaypoint(state, 20_000);
		state = markNextWaypoint(state, 30_000);
		state = markNextWaypoint(state, 40_000);
		state = markNextWaypoint(state, 50_000);
		state = endDive(state, 60_000);
		const timeline = projectPrecisionStateToTimeline(state);
		expect(timeline.diveStartMs).toBe(10_000);
		expect(timeline.diveEndMs).toBe(60_000);
		expect(timeline.subSplits).toHaveLength(3);
		expect(timeline.laps).toHaveLength(1);
		expect(timeline.laps[0]).toMatchObject({ lapNumber: 1, atMs: 50_000, cumulativeDistanceM: 50 });
	});

	it('undoes end, waypoints, and start in order', () => {
		let state = createPrecisionMarkingState(CONFIG);
		state = markDiveStart(state, 10_000);
		state = markNextWaypoint(state, 20_000);
		state = endDive(state, 25_000);
		state = undoLastMark(state);
		expect(state.phase).toBe('waypoints');
		expect(state.diveEndMs).toBeUndefined();
		state = undoLastMark(state);
		expect(state.waypointTimesMs).toEqual([]);
		expect(precisionPrimaryLabel(state)).toBe('12.5 m');
		state = undoLastMark(state);
		expect(state.phase).toBe('start');
		expect(state.diveStartMs).toBeUndefined();
	});

	it('restarts all precision marks while keeping pool config', () => {
		let state = createPrecisionMarkingState(CONFIG);
		state = markDiveStart(state, 10_000);
		state = markNextWaypoint(state, 20_000);
		state = restartMarking(state);
		expect(state.phase).toBe('start');
		expect(state.poolLengthM).toBe(50);
		expect(state.spacingM).toBe(12.5);
		expect(state.waypointTimesMs).toEqual([]);
	});

	it('summarises distance, duration, average speed, and warnings', () => {
		let state = createPrecisionMarkingState(CONFIG);
		state = markDiveStart(state, 0);
		state = markNextWaypoint(state, 10_000);
		state = markNextWaypoint(state, 10_100);
		state = endDive(state, 20_000);
		const summary = summarisePrecisionState(state);
		expect(summary.totalDistanceM).toBe(25);
		expect(summary.totalTimeSeconds).toBe(20);
		expect(summary.averageSpeedMs).toBeCloseTo(1.25, 5);
		expect(summary.warnings).toContain('duplicate-time');
		expect(summary.warnings).toContain('fast-segment');
	});

	it('infers a one-waypoint 25m pool from timeline walls over a stale fallback', () => {
		const inferred = inferPrecisionMarkerConfig(
			{
				diveStartMs: 0,
				diveEndMs: 60_000,
				laps: [
					{ lapNumber: 1, atMs: 30_000, splitMs: 30_000, cumulativeDistanceM: 25 },
					{ lapNumber: 2, atMs: 60_000, splitMs: 30_000, cumulativeDistanceM: 50 }
				]
			},
			50
		);

		expect(inferred).toEqual({ poolLengthM: 25, waypointsPerLap: 1 });
	});

	it('infers multiple waypoints per lap from sub-splits before the first wall', () => {
		const inferred = inferPrecisionMarkerConfig({
			diveStartMs: 0,
			diveEndMs: 30_000,
			laps: [
				{ lapNumber: 1, atMs: 30_000, splitMs: 10_000, cumulativeDistanceM: 25 }
			],
			subSplits: [
				{ lapNumber: 1, atMs: 10_000, splitMs: 10_000, cumulativeDistanceM: 8.333 },
				{ lapNumber: 2, atMs: 20_000, splitMs: 10_000, cumulativeDistanceM: 16.667 }
			]
		});

		expect(inferred.poolLengthM).toBe(25);
		expect(inferred.waypointsPerLap).toBe(3);
	});

	it('keeps elapsed time at zero until dive start is marked', () => {
		let state = createPrecisionMarkingState(CONFIG);
		expect(precisionElapsedMs(state, 12_000)).toBe(0);

		state = markDiveStart(state, 10_000);
		expect(precisionElapsedMs(state, 12_000)).toBe(2_000);

		state = endDive(state, 15_000);
		expect(precisionElapsedMs(state, 20_000)).toBe(5_000);
	});
});
