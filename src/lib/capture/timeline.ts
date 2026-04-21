/**
 * Pure timeline math helpers for the dynamic video capture feature.
 *
 * All times are in milliseconds. The timeline is expressed relative to the
 * START of the media recording so it stays in sync with the video's own
 * playback clock.
 *
 * See docs/Dynamic video feature.md §6 for the data model.
 */

import type { DiveTimeline, LapEvent } from '$lib/types';

/**
 * Build an empty timeline that will be populated during capture.
 */
export function createEmptyTimeline(diveStartMs: number): DiveTimeline {
	return {
		diveStartMs,
		diveEndMs: diveStartMs, // provisional; STOP updates this
		laps: [],
		events: []
	};
}

/**
 * Append a wall-touch event to the timeline.
 *
 * Returns a NEW timeline (immutable update) with the lap appended and
 * derived fields (split, cumulative distance) populated.
 */
export function appendLap(
	timeline: DiveTimeline,
	atMs: number,
	poolLengthM: number
): DiveTimeline {
	const lapNumber = timeline.laps.length + 1;
	const previousAtMs =
		timeline.laps.length === 0
			? timeline.diveStartMs
			: timeline.laps[timeline.laps.length - 1].atMs;

	const lap: LapEvent = {
		lapNumber,
		atMs,
		splitMs: Math.max(0, atMs - previousAtMs),
		cumulativeDistanceM: lapNumber * poolLengthM
	};

	return {
		...timeline,
		laps: [...timeline.laps, lap]
	};
}

/**
 * Remove the most recently tapped lap (undo).
 */
export function removeLastLap(timeline: DiveTimeline): DiveTimeline {
	if (timeline.laps.length === 0) return timeline;
	return { ...timeline, laps: timeline.laps.slice(0, -1) };
}

/**
 * Finalise the timeline when STOP is pressed.
 */
export function finalizeTimeline(timeline: DiveTimeline, diveEndMs: number): DiveTimeline {
	return { ...timeline, diveEndMs };
}

/**
 * Total dive time in milliseconds (GO to STOP).
 */
export function totalTimeMs(timeline: DiveTimeline): number {
	return Math.max(0, timeline.diveEndMs - timeline.diveStartMs);
}

/**
 * Total distance covered in meters, based on the laps tapped.
 */
export function totalDistanceM(timeline: DiveTimeline): number {
	if (timeline.laps.length === 0) return 0;
	return timeline.laps[timeline.laps.length - 1].cumulativeDistanceM;
}

/**
 * Average speed (m/s) across the whole dive, or 0 if the dive has no duration.
 */
export function averageSpeedMs(timeline: DiveTimeline): number {
	const totalMs = totalTimeMs(timeline);
	if (totalMs <= 0) return 0;
	return totalDistanceM(timeline) / (totalMs / 1000);
}

/**
 * Instantaneous (windowed) speed at a given point in time, used by the HUD.
 *
 * Strategy: take the most recent completed lap before `atMs` and use its
 * split as the basis. If no lap yet, fall back to the running average from
 * diveStart → atMs (which will read 0 until the first lap).
 */
export function speedAt(timeline: DiveTimeline, atMs: number, poolLengthM: number): number {
	// Find laps that happened at or before atMs.
	const completedLaps = timeline.laps.filter((l) => l.atMs <= atMs);
	if (completedLaps.length === 0) return 0;

	const lastLap = completedLaps[completedLaps.length - 1];
	if (lastLap.splitMs <= 0) return 0;
	return poolLengthM / (lastLap.splitMs / 1000);
}

/**
 * Distance covered at a given moment in time (for HUD display while diving).
 *
 * We use a stepwise model: distance jumps by `poolLengthM` on each wall tap.
 * Between taps we linearly interpolate based on the current-lap pace estimate
 * so the on-screen number rises smoothly rather than in hard jumps.
 */
export function distanceAt(
	timeline: DiveTimeline,
	atMs: number,
	poolLengthM: number
): number {
	const completedLaps = timeline.laps.filter((l) => l.atMs <= atMs);
	const baseDistance =
		completedLaps.length === 0 ? 0 : completedLaps[completedLaps.length - 1].cumulativeDistanceM;

	// Interpolate toward the next wall using the pace of the last completed lap.
	if (completedLaps.length === 0) {
		// Before the first lap: we don't know pace yet.
		return baseDistance;
	}

	const lastLap = completedLaps[completedLaps.length - 1];
	if (lastLap.splitMs <= 0) return baseDistance;

	const timeSinceLastWallMs = atMs - lastLap.atMs;
	const lapProgress = Math.min(1, timeSinceLastWallMs / lastLap.splitMs);
	return baseDistance + lapProgress * poolLengthM;
}

/**
 * Derived summary used when persisting the dive as a RoutineLog/Dive.
 */
export interface TimelineSummary {
	totalTimeSeconds: number;
	totalDistanceM: number;
	averageSpeedMs: number;
	lapCount: number;
	avgSplitSeconds: number;
	fastestLapSeconds: number | null;
	slowestLapSeconds: number | null;
}

export function summariseTimeline(timeline: DiveTimeline): TimelineSummary {
	const totalMs = totalTimeMs(timeline);
	const distance = totalDistanceM(timeline);
	const lapCount = timeline.laps.length;

	const splitSecs = timeline.laps.map((l) => l.splitMs / 1000);
	const avgSplit = splitSecs.length ? splitSecs.reduce((a, b) => a + b, 0) / splitSecs.length : 0;
	const fastest = splitSecs.length ? Math.min(...splitSecs) : null;
	const slowest = splitSecs.length ? Math.max(...splitSecs) : null;

	return {
		totalTimeSeconds: totalMs / 1000,
		totalDistanceM: distance,
		averageSpeedMs: averageSpeedMs(timeline),
		lapCount,
		avgSplitSeconds: avgSplit,
		fastestLapSeconds: fastest,
		slowestLapSeconds: slowest
	};
}
