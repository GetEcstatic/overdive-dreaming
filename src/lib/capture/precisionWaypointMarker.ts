import type { DiveTimeline, LapEvent } from '$lib/types';

export type PrecisionMarkingPhase = 'start' | 'waypoints' | 'ended';
export type PrecisionWaypointKind = 'split' | 'wall';
export type PrecisionWaypointWarning = 'fast-segment' | 'slow-segment' | 'duplicate-time' | 'close-to-end';

export interface PrecisionMarkerConfig {
	poolLengthM: number;
	waypointsPerLap: number;
	defaultSpeedMs?: number;
	plausibleMaxSpeedMs?: number;
	fastSegmentRatio?: number;
	duplicateThresholdMs?: number;
	closeToEndThresholdMs?: number;
}

export interface InferredPrecisionMarkerConfig {
	poolLengthM: number;
	waypointsPerLap: number;
}

export interface PrecisionWaypoint {
	id: string;
	index: number;
	kind: PrecisionWaypointKind;
	atMs: number;
	splitMs: number;
	cumulativeDistanceM: number;
	distanceFromLapStartM: number;
	speedMs: number;
	warnings: PrecisionWaypointWarning[];
}

export interface PrecisionMarkingState {
	phase: PrecisionMarkingPhase;
	poolLengthM: number;
	waypointsPerLap: number;
	spacingM: number;
	defaultSpeedMs: number;
	diveStartMs?: number;
	diveEndMs?: number;
	waypointTimesMs: number[];
	nextWaypointIndex: number;
	nextDistanceM: number;
	nextKind: PrecisionWaypointKind;
}

export interface PrecisionMarkingSummary {
	totalDistanceM: number;
	totalTimeSeconds: number;
	averageSpeedMs: number;
	waypointCount: number;
	warnings: PrecisionWaypointWarning[];
	waypoints: PrecisionWaypoint[];
}

const DEFAULT_MAX_SPEED_MS = 3;
const DEFAULT_FAST_RATIO = 2.5;
const DEFAULT_DUPLICATE_THRESHOLD_MS = 250;
const DEFAULT_CLOSE_TO_END_THRESHOLD_MS = 500;

function safeNumber(value: number | undefined, fallback: number): number {
	return Number.isFinite(value) && value !== undefined ? value : fallback;
}

function safeConfig(config: PrecisionMarkerConfig): Required<PrecisionMarkerConfig> {
	return {
		poolLengthM: Math.max(1, safeNumber(config.poolLengthM, 25)),
		waypointsPerLap: Math.max(1, Math.round(safeNumber(config.waypointsPerLap, 1))),
		defaultSpeedMs: Math.max(0, safeNumber(config.defaultSpeedMs, 1)),
		plausibleMaxSpeedMs: Math.max(0.1, safeNumber(config.plausibleMaxSpeedMs, DEFAULT_MAX_SPEED_MS)),
		fastSegmentRatio: Math.max(1, safeNumber(config.fastSegmentRatio, DEFAULT_FAST_RATIO)),
		duplicateThresholdMs: Math.max(0, safeNumber(config.duplicateThresholdMs, DEFAULT_DUPLICATE_THRESHOLD_MS)),
		closeToEndThresholdMs: Math.max(0, safeNumber(config.closeToEndThresholdMs, DEFAULT_CLOSE_TO_END_THRESHOLD_MS))
	};
}

function positiveNumber(value: number | undefined): value is number {
	return Number.isFinite(value) && value !== undefined && value > 0;
}

function sortedEvents(events: readonly LapEvent[] | undefined): LapEvent[] {
	return [...(events ?? [])]
		.filter((event) => positiveNumber(event.cumulativeDistanceM))
		.sort((a, b) => a.atMs - b.atMs || a.cumulativeDistanceM - b.cumulativeDistanceM);
}

export function inferPrecisionMarkerConfig(
	timeline: DiveTimeline,
	fallbackPoolLengthM: number = 25
): InferredPrecisionMarkerConfig {
	const safeFallbackPoolLengthM = Math.max(1, safeNumber(fallbackPoolLengthM, 25));
	const walls = sortedEvents(timeline.laps);
	const firstWall = walls[0];

	if (!firstWall) {
		return { poolLengthM: safeFallbackPoolLengthM, waypointsPerLap: 1 };
	}

	const poolLengthM = firstWall.cumulativeDistanceM;
	const firstLapEvents = sortedEvents([...(timeline.subSplits ?? []), firstWall])
		.filter((event) => event.atMs <= firstWall.atMs && event.cumulativeDistanceM <= poolLengthM);
	const distances = firstLapEvents.map((event) => event.cumulativeDistanceM);
	const segmentDistances = distances
		.map((distance, index) => distance - (distances[index - 1] ?? 0))
		.filter((distance) => Number.isFinite(distance) && distance > 0);
	const spacingM = segmentDistances.length > 0 ? Math.min(...segmentDistances) : poolLengthM;
	const waypointsPerLap = spacingM > 0 ? Math.max(1, Math.round(poolLengthM / spacingM)) : 1;

	return { poolLengthM, waypointsPerLap };
}

export function precisionElapsedMs(state: PrecisionMarkingState, currentVideoMs: number): number {
	if (state.diveStartMs === undefined) return 0;
	const currentMs = Math.max(0, Math.round(currentVideoMs));
	const endMs = state.diveEndMs ?? currentMs;
	return Math.max(0, Math.min(currentMs, endMs) - state.diveStartMs);
}

function kindForIndex(index: number, waypointsPerLap: number): PrecisionWaypointKind {
	return index % waypointsPerLap === 0 ? 'wall' : 'split';
}

function nextShape(index: number, spacingM: number, waypointsPerLap: number) {
	return {
		nextWaypointIndex: index,
		nextDistanceM: index * spacingM,
		nextKind: kindForIndex(index, waypointsPerLap)
	};
}

function withNext(state: Omit<PrecisionMarkingState, 'nextWaypointIndex' | 'nextDistanceM' | 'nextKind'>): PrecisionMarkingState {
	return {
		...state,
		...nextShape(state.waypointTimesMs.length + 1, state.spacingM, state.waypointsPerLap)
	};
}

function uniqueWarnings(warnings: PrecisionWaypointWarning[]): PrecisionWaypointWarning[] {
	return [...new Set(warnings)];
}

function median(values: number[]): number {
	const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
	if (sorted.length === 0) return 0;
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function createPrecisionMarkingState(config: PrecisionMarkerConfig): PrecisionMarkingState {
	const safe = safeConfig(config);
	return withNext({
		phase: 'start',
		poolLengthM: safe.poolLengthM,
		waypointsPerLap: safe.waypointsPerLap,
		spacingM: safe.poolLengthM / safe.waypointsPerLap,
		defaultSpeedMs: safe.defaultSpeedMs,
		waypointTimesMs: []
	});
}

export function markDiveStart(state: PrecisionMarkingState, currentVideoMs: number): PrecisionMarkingState {
	const diveStartMs = Math.max(0, Math.round(currentVideoMs));
	return withNext({
		...state,
		phase: 'waypoints',
		diveStartMs,
		diveEndMs: undefined,
		waypointTimesMs: []
	});
}

export function markNextWaypoint(state: PrecisionMarkingState, currentVideoMs: number): PrecisionMarkingState {
	if (state.phase !== 'waypoints' || state.diveStartMs === undefined) return state;
	const previousMs = state.waypointTimesMs.at(-1) ?? state.diveStartMs;
	const atMs = Math.max(previousMs + 1, Math.round(currentVideoMs));
	return withNext({
		...state,
		waypointTimesMs: [...state.waypointTimesMs, atMs]
	});
}

export function endDive(state: PrecisionMarkingState, currentVideoMs: number): PrecisionMarkingState {
	if (state.phase !== 'waypoints' || state.diveStartMs === undefined) return state;
	const previousMs = state.waypointTimesMs.at(-1) ?? state.diveStartMs;
	return withNext({
		...state,
		phase: 'ended',
		diveEndMs: Math.max(previousMs + 1, Math.round(currentVideoMs))
	});
}

export function undoLastMark(state: PrecisionMarkingState): PrecisionMarkingState {
	if (state.phase === 'start') return state;
	if (state.phase === 'ended') {
		return withNext({
			...state,
			phase: 'waypoints',
			diveEndMs: undefined
		});
	}
	if (state.waypointTimesMs.length > 0) {
		return withNext({
			...state,
			waypointTimesMs: state.waypointTimesMs.slice(0, -1)
		});
	}
	return withNext({
		...state,
		phase: 'start',
		diveStartMs: undefined
	});
}

export function restartMarking(state: PrecisionMarkingState): PrecisionMarkingState {
	return createPrecisionMarkingState({
		poolLengthM: state.poolLengthM,
		waypointsPerLap: state.waypointsPerLap,
		defaultSpeedMs: state.defaultSpeedMs
	});
}

export function precisionWaypoints(
	state: PrecisionMarkingState,
	config: PrecisionMarkerConfig = state
): PrecisionWaypoint[] {
	const safe = safeConfig(config);
	const diveStartMs = state.diveStartMs ?? 0;
	const raw = state.waypointTimesMs.map((atMs, index) => {
		const waypointIndex = index + 1;
		const previousAtMs = index === 0 ? diveStartMs : state.waypointTimesMs[index - 1];
		const splitMs = Math.max(0, atMs - previousAtMs);
		const speedMs = splitMs > 0 ? state.spacingM / (splitMs / 1000) : state.defaultSpeedMs;
		return { atMs, waypointIndex, splitMs, speedMs };
	});
	const medianSpeed = median(raw.map((row) => row.speedMs));
	return raw.map((row, index) => {
		const warnings: PrecisionWaypointWarning[] = [];
		const previous = raw[index - 1];
		if (previous && row.atMs - previous.atMs <= safe.duplicateThresholdMs) warnings.push('duplicate-time');
		if (row.speedMs > safe.plausibleMaxSpeedMs) warnings.push('fast-segment');
		if (medianSpeed > 0 && row.speedMs > medianSpeed * safe.fastSegmentRatio) warnings.push('fast-segment');
		if (state.diveEndMs !== undefined && state.diveEndMs - row.atMs <= safe.closeToEndThresholdMs) {
			warnings.push('close-to-end');
		}
		const inLapIndex = ((row.waypointIndex - 1) % state.waypointsPerLap) + 1;
		return {
			id: `wp-${row.waypointIndex}`,
			index: row.waypointIndex,
			kind: kindForIndex(row.waypointIndex, state.waypointsPerLap),
			atMs: row.atMs,
			splitMs: row.splitMs,
			cumulativeDistanceM: row.waypointIndex * state.spacingM,
			distanceFromLapStartM: inLapIndex * state.spacingM,
			speedMs: row.speedMs,
			warnings: uniqueWarnings(warnings)
		};
	});
}

export function projectPrecisionStateToTimeline(state: PrecisionMarkingState): DiveTimeline {
	const diveStartMs = state.diveStartMs ?? 0;
	const diveEndMs = state.diveEndMs ?? state.waypointTimesMs.at(-1) ?? diveStartMs;
	const rows = precisionWaypoints(state);
	const events = rows.map((waypoint): { kind: PrecisionWaypointKind; event: LapEvent } => ({
		kind: waypoint.kind,
		event: {
			lapNumber: waypoint.kind === 'wall'
				? waypoint.index / state.waypointsPerLap
				: ((waypoint.index - 1) % state.waypointsPerLap) + 1,
			atMs: waypoint.atMs,
			splitMs: waypoint.splitMs,
			cumulativeDistanceM: waypoint.cumulativeDistanceM
		}
	}));
	return {
		diveStartMs,
		diveEndMs,
		laps: events.filter((row) => row.kind === 'wall').map((row) => row.event),
		subSplits: events.filter((row) => row.kind === 'split').map((row) => row.event),
		events: []
	};
}

export function summarisePrecisionState(state: PrecisionMarkingState): PrecisionMarkingSummary {
	const waypoints = precisionWaypoints(state);
	const diveStartMs = state.diveStartMs ?? 0;
	const diveEndMs = state.diveEndMs ?? waypoints.at(-1)?.atMs ?? diveStartMs;
	const totalMs = Math.max(0, diveEndMs - diveStartMs);
	const lastDistanceM = waypoints.at(-1)?.cumulativeDistanceM ?? 0;
	return {
		totalDistanceM: lastDistanceM,
		totalTimeSeconds: totalMs / 1000,
		averageSpeedMs: totalMs > 0 ? lastDistanceM / (totalMs / 1000) : 0,
		waypointCount: waypoints.length,
		warnings: uniqueWarnings(waypoints.flatMap((waypoint) => waypoint.warnings)),
		waypoints
	};
}

export function precisionPrimaryLabel(state: PrecisionMarkingState): string {
	if (state.phase === 'start') return 'Start dive';
	if (state.phase === 'ended') return 'Review';
	const distance = Number.isInteger(state.nextDistanceM) ? `${state.nextDistanceM}` : state.nextDistanceM.toFixed(1);
	return state.nextKind === 'wall' ? `${distance} m wall` : `${distance} m`;
}
