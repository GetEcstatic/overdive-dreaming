import type { DiveTimeline, LapEvent } from '$lib/types';

export type WaypointKind = 'split' | 'wall';
export type WaypointWarning =
	| 'fast-segment'
	| 'slow-segment'
	| 'close-to-end'
	| 'out-of-order'
	| 'duplicate-time'
	| 'after-end';

export interface WaypointEditorConfig {
	poolLengthM: number;
	waypointsPerLap: number;
	defaultSpeedMs?: number;
	plausibleMaxSpeedMs?: number;
	fastSegmentRatio?: number;
	slowSegmentRatio?: number;
	duplicateThresholdMs?: number;
	closeToEndThresholdMs?: number;
}

export interface EditableWaypoint {
	id: string;
	index: number;
	lapIndex: number;
	inLapIndex: number;
	kind: WaypointKind;
	atMs: number;
	distanceFromLapStartM: number;
	cumulativeDistanceM: number;
	splitMs: number;
	speedMs: number;
	warnings: WaypointWarning[];
}

export interface EditableLap {
	id: string;
	lapIndex: number;
	startDistanceM: number;
	endDistanceM: number;
	isComplete: boolean;
	startMs: number;
	endMs?: number;
	durationMs?: number;
	averageSpeedMs?: number;
	waypoints: EditableWaypoint[];
	warnings: WaypointWarning[];
}

export interface WaypointEditorModel {
	diveStartMs: number;
	diveEndMs: number;
	poolLengthM: number;
	waypointsPerLap: number;
	spacingM: number;
	waypoints: EditableWaypoint[];
	laps: EditableLap[];
	warnings: WaypointWarning[];
}

export interface WaypointEditResult {
	model: WaypointEditorModel;
	timeline: DiveTimeline;
}

const DEFAULT_MAX_SPEED_MS = 3;
const DEFAULT_FAST_RATIO = 2.5;
const DEFAULT_SLOW_RATIO = 0.35;
const DEFAULT_DUPLICATE_THRESHOLD_MS = 250;
const DEFAULT_CLOSE_TO_END_THRESHOLD_MS = 500;

function safeConfig(config: WaypointEditorConfig): Required<WaypointEditorConfig> {
	return {
		poolLengthM: Math.max(1, config.poolLengthM),
		waypointsPerLap: Math.max(1, Math.round(config.waypointsPerLap)),
		defaultSpeedMs: Math.max(0, config.defaultSpeedMs ?? 1),
		plausibleMaxSpeedMs: Math.max(0.1, config.plausibleMaxSpeedMs ?? DEFAULT_MAX_SPEED_MS),
		fastSegmentRatio: Math.max(1, config.fastSegmentRatio ?? DEFAULT_FAST_RATIO),
		slowSegmentRatio: Math.max(0, Math.min(1, config.slowSegmentRatio ?? DEFAULT_SLOW_RATIO)),
		duplicateThresholdMs: Math.max(0, config.duplicateThresholdMs ?? DEFAULT_DUPLICATE_THRESHOLD_MS),
		closeToEndThresholdMs: Math.max(0, config.closeToEndThresholdMs ?? DEFAULT_CLOSE_TO_END_THRESHOLD_MS)
	};
}

export function waypointTimesFromTimeline(timeline: DiveTimeline): number[] {
	return [...timeline.laps, ...(timeline.subSplits ?? [])]
		.map((event) => event.atMs)
		.filter((atMs) => atMs > timeline.diveStartMs && atMs < timeline.diveEndMs)
		.sort((a, b) => a - b);
}

function kindForIndex(index: number, waypointsPerLap: number): WaypointKind {
	return index % waypointsPerLap === 0 ? 'wall' : 'split';
}

function inLapIndexForIndex(index: number, waypointsPerLap: number): number {
	const mod = index % waypointsPerLap;
	return mod === 0 ? waypointsPerLap : mod;
}

function lapIndexForIndex(index: number, waypointsPerLap: number): number {
	return Math.max(1, Math.ceil(index / waypointsPerLap));
}

function median(values: number[]): number {
	const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
	if (sorted.length === 0) return 0;
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function uniqueWarnings(warnings: WaypointWarning[]): WaypointWarning[] {
	return [...new Set(warnings)];
}

export function buildWaypointEditorModel(
	timeline: DiveTimeline,
	config: WaypointEditorConfig
): WaypointEditorModel {
	const safe = safeConfig(config);
	const spacingM = safe.poolLengthM / safe.waypointsPerLap;
	const times = waypointTimesFromTimeline(timeline);
	const rawRows = times.map((atMs, index) => {
		const waypointIndex = index + 1;
		const previousAtMs = index === 0 ? timeline.diveStartMs : times[index - 1];
		const splitMs = Math.max(0, atMs - previousAtMs);
		const speedMs = splitMs > 0 ? spacingM / (splitMs / 1000) : safe.defaultSpeedMs;
		return {
			atMs,
			index: waypointIndex,
			splitMs,
			speedMs
		};
	});
	const medianSpeed = median(rawRows.map((row) => row.speedMs));
	const waypoints: EditableWaypoint[] = rawRows.map((row, arrayIndex) => {
		const warnings: WaypointWarning[] = [];
		const previous = rawRows[arrayIndex - 1];
		if (previous && row.atMs <= previous.atMs) warnings.push('out-of-order');
		if (previous && row.atMs - previous.atMs <= safe.duplicateThresholdMs) warnings.push('duplicate-time');
		if (row.atMs >= timeline.diveEndMs) warnings.push('after-end');
		if (timeline.diveEndMs - row.atMs <= safe.closeToEndThresholdMs) warnings.push('close-to-end');
		if (row.speedMs > safe.plausibleMaxSpeedMs) warnings.push('fast-segment');
		if (medianSpeed > 0 && row.speedMs > medianSpeed * safe.fastSegmentRatio) warnings.push('fast-segment');
		if (medianSpeed > 0 && row.speedMs < medianSpeed * safe.slowSegmentRatio) warnings.push('slow-segment');
		return {
			id: `wp-${row.index}`,
			index: row.index,
			lapIndex: lapIndexForIndex(row.index, safe.waypointsPerLap),
			inLapIndex: inLapIndexForIndex(row.index, safe.waypointsPerLap),
			kind: kindForIndex(row.index, safe.waypointsPerLap),
			atMs: row.atMs,
			distanceFromLapStartM: inLapIndexForIndex(row.index, safe.waypointsPerLap) * spacingM,
			cumulativeDistanceM: row.index * spacingM,
			splitMs: row.splitMs,
			speedMs: row.speedMs,
			warnings: uniqueWarnings(warnings)
		};
	});
	const lapCount = Math.max(1, Math.ceil(Math.max(waypoints.length, 1) / safe.waypointsPerLap));
	const laps: EditableLap[] = Array.from({ length: lapCount }, (_, index) => {
		const lapIndex = index + 1;
		const lapWaypoints = waypoints.filter((waypoint) => waypoint.lapIndex === lapIndex);
		const lapStartDistanceM = index * safe.poolLengthM;
		const finalDistanceM = lapWaypoints[lapWaypoints.length - 1]?.cumulativeDistanceM ?? lapStartDistanceM;
		const lapStartMs = index === 0
			? timeline.diveStartMs
			: waypoints.find((waypoint) => waypoint.index === index * safe.waypointsPerLap)?.atMs ?? timeline.diveStartMs;
		const lapEndMs = lapWaypoints[lapWaypoints.length - 1]?.atMs;
		const durationMs = lapEndMs === undefined ? undefined : Math.max(0, lapEndMs - lapStartMs);
		const distanceM = Math.max(0, finalDistanceM - lapStartDistanceM);
		return {
			id: `lap-${lapIndex}`,
			lapIndex,
			startDistanceM: lapStartDistanceM,
			endDistanceM: Math.min(lapStartDistanceM + safe.poolLengthM, finalDistanceM || lapStartDistanceM + safe.poolLengthM),
			isComplete: lapWaypoints.length >= safe.waypointsPerLap,
			startMs: lapStartMs,
			endMs: lapEndMs,
			durationMs,
			averageSpeedMs: durationMs && durationMs > 0 ? distanceM / (durationMs / 1000) : undefined,
			waypoints: lapWaypoints,
			warnings: uniqueWarnings(lapWaypoints.flatMap((waypoint) => waypoint.warnings))
		};
	});
	return {
		diveStartMs: timeline.diveStartMs,
		diveEndMs: timeline.diveEndMs,
		poolLengthM: safe.poolLengthM,
		waypointsPerLap: safe.waypointsPerLap,
		spacingM,
		waypoints,
		laps,
		warnings: uniqueWarnings(waypoints.flatMap((waypoint) => waypoint.warnings))
	};
}

export function projectWaypointTimesToTimeline(
	timeline: DiveTimeline,
	waypointTimesMs: readonly number[],
	config: WaypointEditorConfig
): DiveTimeline {
	const safe = safeConfig(config);
	const spacingM = safe.poolLengthM / safe.waypointsPerLap;
	const sortedTimes = [...waypointTimesMs]
		.map((atMs) => Math.max(timeline.diveStartMs, Math.min(timeline.diveEndMs, Math.round(atMs))))
		.filter((atMs) => atMs > timeline.diveStartMs && atMs < timeline.diveEndMs)
		.sort((a, b) => a - b);
	const rows = sortedTimes.map((atMs, index) => {
		const waypointIndex = index + 1;
		const previousAtMs = index === 0 ? timeline.diveStartMs : sortedTimes[index - 1];
		const event: LapEvent = {
			lapNumber: kindForIndex(waypointIndex, safe.waypointsPerLap) === 'wall'
				? lapIndexForIndex(waypointIndex, safe.waypointsPerLap)
				: inLapIndexForIndex(waypointIndex, safe.waypointsPerLap),
			atMs,
			splitMs: Math.max(0, atMs - previousAtMs),
			cumulativeDistanceM: waypointIndex * spacingM
		};
		return { event, kind: kindForIndex(waypointIndex, safe.waypointsPerLap) };
	});
	const { samples: _samples, ...rest } = timeline;
	void _samples;
	return {
		...rest,
		laps: rows.filter((row) => row.kind === 'wall').map((row) => row.event),
		subSplits: rows.filter((row) => row.kind === 'split').map((row) => row.event)
	};
}

function updateWaypointTimes(
	timeline: DiveTimeline,
	config: WaypointEditorConfig,
	update: (times: number[]) => number[]
): WaypointEditResult {
	const nextTimeline = projectWaypointTimesToTimeline(
		timeline,
		update(waypointTimesFromTimeline(timeline)),
		config
	);
	return {
		model: buildWaypointEditorModel(nextTimeline, config),
		timeline: nextTimeline
	};
}

export function moveWaypoint(
	timeline: DiveTimeline,
	config: WaypointEditorConfig,
	waypointId: string,
	nextAtMs: number
): WaypointEditResult {
	return updateWaypointTimes(timeline, config, (times) => {
		const index = Number(waypointId.replace('wp-', '')) - 1;
		if (!Number.isInteger(index) || index < 0 || index >= times.length) return times;
		const previousLimit = index === 0 ? timeline.diveStartMs + 1 : times[index - 1] + 1;
		const nextLimit = index === times.length - 1 ? timeline.diveEndMs - 1 : times[index + 1] - 1;
		const clamped = Math.max(previousLimit, Math.min(nextLimit, Math.round(nextAtMs)));
		return times.map((atMs, currentIndex) => currentIndex === index ? clamped : atMs);
	});
}

export function deleteWaypoint(
	timeline: DiveTimeline,
	config: WaypointEditorConfig,
	waypointId: string
): WaypointEditResult {
	return updateWaypointTimes(timeline, config, (times) => {
		const index = Number(waypointId.replace('wp-', '')) - 1;
		if (!Number.isInteger(index) || index < 0 || index >= times.length) return times;
		return times.filter((_, currentIndex) => currentIndex !== index);
	});
}

export function removeLastWaypoint(
	timeline: DiveTimeline,
	config: WaypointEditorConfig
): WaypointEditResult {
	return updateWaypointTimes(timeline, config, (times) => times.slice(0, -1));
}

export function setDiveEnd(
	timeline: DiveTimeline,
	config: WaypointEditorConfig,
	nextDiveEndMs: number
): WaypointEditResult {
	const nextEnd = Math.max(timeline.diveStartMs + 100, Math.round(nextDiveEndMs));
	const nextTimeline = projectWaypointTimesToTimeline(
		{ ...timeline, diveEndMs: nextEnd },
		waypointTimesFromTimeline(timeline),
		config
	);
	return {
		model: buildWaypointEditorModel(nextTimeline, config),
		timeline: nextTimeline
	};
}

export function setDiveStart(
	timeline: DiveTimeline,
	config: WaypointEditorConfig,
	nextDiveStartMs: number
): WaypointEditResult {
	const nextStart = Math.min(Math.round(nextDiveStartMs), timeline.diveEndMs - 100);
	const nextTimeline = projectWaypointTimesToTimeline(
		{ ...timeline, diveStartMs: nextStart },
		waypointTimesFromTimeline(timeline),
		config
	);
	return {
		model: buildWaypointEditorModel(nextTimeline, config),
		timeline: nextTimeline
	};
}
