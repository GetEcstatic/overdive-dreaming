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
 * Total distance covered in meters.
 *
 * Mirrors the HUD "Distance" counter (`cumulativeDistanceM` in
 * `recorderSelectors.ts`) so the post-save summary reports the same
 * number the diver saw on screen when they tapped End-dive.
 *
 * Includes a "tail" past the last waypoint: if the dive ended mid-lap, the
 * diver covered additional distance between the last waypoint tap and
 * End-dive. We estimate that tail using the most recent lap's measured
 * speed (metres per second) and the elapsed time from the last waypoint
 * to `diveEndMs`. When there are no waypoints yet (diver ended before the
 * first tap, or coach forgot to tap), we fall back to the same default
 * speed of 1 m/s used by the live HUD counter so distance is never 0 for
 * a dive that actually happened.
 */
export function totalDistanceM(timeline: DiveTimeline): number {
	const diveDurationMs = Math.max(0, timeline.diveEndMs - timeline.diveStartMs);

	if (timeline.laps.length === 0) {
		// No waypoints tapped — fall back to the HUD's default pace of 1 m/s.
		// diveStartMs / diveEndMs are offsets from recording start, so the
		// delta is the dive's elapsed time.
		return (diveDurationMs / 1000) * 1;
	}

	const lastLap = timeline.laps[timeline.laps.length - 1];
	const base = lastLap.cumulativeDistanceM;
	const tailMs = Math.max(0, timeline.diveEndMs - lastLap.atMs);
	if (tailMs <= 0) return base;

	// Estimate speed from the last lap: (lap distance) / (lap split).
	// Falls back to 1 m/s (same default as the HUD) if the split is zero.
	const prevCumulative =
		timeline.laps.length === 1
			? 0
			: timeline.laps[timeline.laps.length - 2].cumulativeDistanceM;
	const lapDistance = base - prevCumulative;
	const speedMs =
		lastLap.splitMs > 0 ? lapDistance / (lastLap.splitMs / 1000) : 1;
	return base + speedMs * (tailMs / 1000);
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
 * split as the basis. Before the first waypoint — but after the dive has
 * started — fall back to the live-HUD default of 1 m/s (mirrors
 * `liveSpeedMs` in recorderSelectors.ts and the tail-estimate in
 * `totalDistanceM`) so replays of short dives that ended before the first
 * waypoint show a plausible running speed instead of 0.
 */
export function speedAt(timeline: DiveTimeline, atMs: number, poolLengthM: number): number {
	// Find laps that happened at or before atMs.
	const completedLaps = timeline.laps.filter((l) => l.atMs <= atMs);
	if (completedLaps.length === 0) {
		// Before any waypoint: 1 m/s default while the dive is in progress.
		if (atMs > timeline.diveStartMs && atMs <= timeline.diveEndMs) return 1;
		return 0;
	}

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
 *
 * Before the first waypoint — but after the dive has started — we fall back
 * to a default pace of 1 m/s so the HUD shows a running distance for dives
 * that ended before the first tap. This mirrors the recorder's live HUD
 * (`cumulativeDistanceM` in recorderSelectors.ts) and the finalized
 * `totalDistanceM`, so a replay of a short dive matches the recorded
 * distance instead of reading 0m.
 */
export function distanceAt(
	timeline: DiveTimeline,
	atMs: number,
	poolLengthM: number
): number {
	const completedLaps = timeline.laps.filter((l) => l.atMs <= atMs);

	if (completedLaps.length === 0) {
		// No waypoints yet. Before dive start → 0. After dive start → 1 m/s
		// running estimate, clamped to the dive's end so we don't keep
		// growing after the diver stopped.
		if (atMs <= timeline.diveStartMs) return 0;
		const effectiveAtMs = Math.min(atMs, timeline.diveEndMs);
		const elapsedSinceDiveStartMs = Math.max(0, effectiveAtMs - timeline.diveStartMs);
		return (elapsedSinceDiveStartMs / 1000) * 1;
	}

	const lastLap = completedLaps[completedLaps.length - 1];
	const baseDistance = lastLap.cumulativeDistanceM;
	if (lastLap.splitMs <= 0) return baseDistance;

	const timeSinceLastWallMs = atMs - lastLap.atMs;
	const lapProgress = Math.min(1, timeSinceLastWallMs / lastLap.splitMs);
	return baseDistance + lapProgress * poolLengthM;
}

/**
 * Per-waypoint split row used by the pre-filled dive-log form.
 */
export interface LapSplit {
	lapNumber: number;
	splitSeconds: number;
	avgSpeedMs: number;
	cumulativeDistanceM: number;
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
	perLap: LapSplit[];
}

export function summariseTimeline(timeline: DiveTimeline): TimelineSummary {
	const totalMs = totalTimeMs(timeline);
	const distance = totalDistanceM(timeline);
	const lapCount = timeline.laps.length;

	const splitSecs = timeline.laps.map((l) => l.splitMs / 1000);
	const avgSplit = splitSecs.length ? splitSecs.reduce((a, b) => a + b, 0) / splitSecs.length : 0;
	const fastest = splitSecs.length ? Math.min(...splitSecs) : null;
	const slowest = splitSecs.length ? Math.max(...splitSecs) : null;

	const perLap: LapSplit[] = timeline.laps.map((lap, i) => {
		const prevDistance = i === 0 ? 0 : timeline.laps[i - 1].cumulativeDistanceM;
		const lapDistance = lap.cumulativeDistanceM - prevDistance;
		const splitSeconds = lap.splitMs / 1000;
		return {
			lapNumber: lap.lapNumber,
			splitSeconds,
			avgSpeedMs: splitSeconds > 0 ? lapDistance / splitSeconds : 0,
			cumulativeDistanceM: lap.cumulativeDistanceM
		};
	});

	return {
		totalTimeSeconds: totalMs / 1000,
		totalDistanceM: distance,
		averageSpeedMs: averageSpeedMs(timeline),
		lapCount,
		avgSplitSeconds: avgSplit,
		fastestLapSeconds: fastest,
		slowestLapSeconds: slowest,
		perLap
	};
}
