import { describe, expect, it } from 'vitest';
import type { DiveTimeline } from '$lib/types';
import {
	buildWaypointEditorModel,
	deleteWaypoint,
	moveWaypoint,
	projectWaypointTimesToTimeline,
	removeLastWaypoint,
	setDiveEnd,
	waypointTimesFromTimeline
} from './waypointEditor';

const CONFIG = { poolLengthM: 50, waypointsPerLap: 10, defaultSpeedMs: 1.2 };

function timeline230m(): DiveTimeline {
	return projectWaypointTimesToTimeline(
		{
			diveStartMs: 0,
			diveEndMs: 187_200,
			laps: [],
			samples: [
				{ atMs: 0, distanceM: 0, speedMs: 1.2 },
				{ atMs: 10_000, distanceM: 12, speedMs: 1.2 }
			]
		},
		Array.from({ length: 46 }, (_, index) => (index + 1) * 4_000),
		CONFIG
	);
}

describe('waypointEditor — projectWaypointTimesToTimeline', () => {
	it('projects dense 5 m waypoints into split and wall events', () => {
		const timeline = timeline230m();
		expect(timeline.laps).toHaveLength(4);
		expect(timeline.subSplits).toHaveLength(42);
		expect(timeline.laps[0]).toMatchObject({ lapNumber: 1, atMs: 40_000, cumulativeDistanceM: 50 });
		expect(timeline.laps[3]).toMatchObject({ lapNumber: 4, atMs: 160_000, cumulativeDistanceM: 200 });
		expect(timeline.subSplits?.at(-1)).toMatchObject({ lapNumber: 6, atMs: 184_000, cumulativeDistanceM: 230 });
		expect(timeline.samples).toBeUndefined();
	});

	it('returns waypoint times in strict time order', () => {
		const timeline = projectWaypointTimesToTimeline(
			{ diveStartMs: 0, diveEndMs: 20_000, laps: [] },
			[15_000, 5_000, 10_000],
			{ poolLengthM: 25, waypointsPerLap: 2 }
		);
		expect(waypointTimesFromTimeline(timeline)).toEqual([5_000, 10_000, 15_000]);
	});
});

describe('waypointEditor — buildWaypointEditorModel', () => {
	it('builds lap rulers for a 230 m dynamic dive', () => {
		const model = buildWaypointEditorModel(timeline230m(), CONFIG);
		expect(model.spacingM).toBe(5);
		expect(model.waypoints).toHaveLength(46);
		expect(model.laps).toHaveLength(5);
		expect(model.laps[0]).toMatchObject({ lapIndex: 1, startDistanceM: 0, endDistanceM: 50, isComplete: true });
		expect(model.laps[4]).toMatchObject({ lapIndex: 5, startDistanceM: 200, endDistanceM: 230, isComplete: false });
		expect(model.waypoints[44]).toMatchObject({ id: 'wp-45', lapIndex: 5, inLapIndex: 5, cumulativeDistanceM: 225 });
	});

	it('flags implausibly fast duplicate-ish segments', () => {
		const timeline = projectWaypointTimesToTimeline(
			{ diveStartMs: 0, diveEndMs: 20_000, laps: [] },
			[5_000, 10_000, 10_100],
			{ poolLengthM: 25, waypointsPerLap: 2 }
		);
		const model = buildWaypointEditorModel(timeline, { poolLengthM: 25, waypointsPerLap: 2 });
		expect(model.waypoints[2].warnings).toContain('duplicate-time');
		expect(model.waypoints[2].warnings).toContain('fast-segment');
		expect(model.warnings).toContain('duplicate-time');
	});
});

describe('waypointEditor — edits', () => {
	it('moves a waypoint while preserving ordering', () => {
		const timeline = projectWaypointTimesToTimeline(
			{ diveStartMs: 0, diveEndMs: 30_000, laps: [] },
			[5_000, 10_000, 15_000],
			{ poolLengthM: 25, waypointsPerLap: 2 }
		);
		const { timeline: next } = moveWaypoint(timeline, { poolLengthM: 25, waypointsPerLap: 2 }, 'wp-2', 14_000);
		expect(waypointTimesFromTimeline(next)).toEqual([5_000, 14_000, 15_000]);
	});

	it('clamps a moved waypoint before the next neighbor', () => {
		const timeline = projectWaypointTimesToTimeline(
			{ diveStartMs: 0, diveEndMs: 30_000, laps: [] },
			[5_000, 10_000, 15_000],
			{ poolLengthM: 25, waypointsPerLap: 2 }
		);
		const { timeline: next } = moveWaypoint(timeline, { poolLengthM: 25, waypointsPerLap: 2 }, 'wp-2', 20_000);
		expect(waypointTimesFromTimeline(next)).toEqual([5_000, 14_999, 15_000]);
	});

	it('deletes a waypoint and reindexes wall/split distances', () => {
		const { timeline: next, model } = deleteWaypoint(timeline230m(), CONFIG, 'wp-10');
		expect(waypointTimesFromTimeline(next)).toHaveLength(45);
		expect(model.waypoints[9]).toMatchObject({ index: 10, kind: 'wall', cumulativeDistanceM: 50 });
	});

	it('removes the last waypoint as a quick-fix action', () => {
		const { timeline: next, model } = removeLastWaypoint(timeline230m(), CONFIG);
		expect(waypointTimesFromTimeline(next)).toHaveLength(45);
		expect(model.laps.at(-1)?.endDistanceM).toBe(225);
	});

	it('setting dive end drops waypoints beyond the new end', () => {
		const { timeline: next, model } = setDiveEnd(timeline230m(), CONFIG, 170_000);
		expect(next.diveEndMs).toBe(170_000);
		expect(waypointTimesFromTimeline(next).at(-1)).toBeLessThan(170_000);
		expect(model.waypoints.at(-1)?.cumulativeDistanceM).toBe(210);
	});
});
