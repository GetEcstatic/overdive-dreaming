/**
 * DiveRecorder state machine — plain data + pure reducer.
 *
 * This module holds NO side-effects. The Svelte component wires these
 * types up to camera/recorder/wake-lock imperative APIs and dispatches
 * events into `recorderReducer`. All timeline math is delegated to the
 * existing pure helpers in `timeline.ts`.
 *
 * See docs/DYNAMIC_RECORDER_UX_PLAN.md for the end-to-end design.
 */

import type {
	DiveTimeline,
	DiveVideoDiscipline,
	DiveVideoResolution,
	CameraPreference
} from '$lib/types';
import {
	createEmptyTimeline,
	finalizeTimeline,
	removeLastTap
} from './timeline';
import type { LapEvent } from '$lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Phase =
	| 'arming' //   requesting camera
	| 'ready' //    camera live, nothing recording
	| 'prepping' // MediaRecorder running, dive clock NOT started
	| 'diving' //   dive clock running
	| 'ended' //    dive clock stopped, recorder still running (surface protocol)
	| 'stopping' // finalising MediaRecorder
	| 'error';

export interface RecorderConfig {
	poolLengthM: number;
	waypointsPerLap: number;
	discipline: DiveVideoDiscipline;
	resolution: DiveVideoResolution;
	/** Metres of over-run past the next waypoint before auto-advance. */
	autoAdvanceThresholdM: number;
	cameraPreference: CameraPreference;
}

export interface RecorderClocks {
	/** `performance.now()` of MediaRecorder start. 0 before recording. */
	recordingStartedPerfMs: number;
	/** `performance.now()` of the Start-dive tap. 0 before the dive begins. */
	diveStartedPerfMs: number;
	/** `performance.now()` of the End-dive tap. 0 while diving. */
	diveEndedPerfMs: number;
}

export interface AutoAdvanceBanner {
	/** perf-clock timestamp of the auto-advance event. */
	atPerfMs: number;
	/** How many waypoints were auto-advanced at once (≥1). */
	count: number;
	/** Distance of the first skipped waypoint. */
	fromDistanceM?: number;
	/** Distance now expected after the auto-advance. */
	toDistanceM?: number;
}

export type WaypointCursorHistoryEntry =
	| { kind: 'manual'; index: number }
	| { kind: 'auto'; fromIndex: number; toIndex: number };

export interface WaypointCursor {
	expectedIndex: number;
	lastManualIndex: number;
	autoAdvancedIndexes: number[];
	history: WaypointCursorHistoryEntry[];
}

export interface RecorderState {
	phase: Phase;
	config: RecorderConfig;
	clocks: RecorderClocks;
	timeline: DiveTimeline;
	waypointCursor: WaypointCursor;
	autoAdvance: AutoAdvanceBanner | null;
	errorMessage: string | null;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type RecorderEvent =
	| { type: 'arm/started' }
	| { type: 'arm/succeeded' }
	| { type: 'arm/failed'; message: string }
	| { type: 'recording/started'; atPerfMs: number }
	| { type: 'dive/started'; atPerfMs: number }
	/** v1 event — now routes to either wall/tapped or split/tapped
	 *  based on the expected-slot rule in the reducer. Kept for
	 *  call-sites that haven't migrated yet. */
	| { type: 'waypoint/tapped'; atPerfMs: number }
	| { type: 'waypoint/manualTapped'; atPerfMs: number; index?: number }
	| { type: 'waypoint/autoAdvanced'; atPerfMs: number; fromIndex: number; toIndex: number }
	| { type: 'wall/tapped'; atPerfMs: number }
	| { type: 'split/tapped'; atPerfMs: number }
	| { type: 'waypoint/auto'; atPerfMs: number; count: number }
	| { type: 'waypoint/undone' }
	| { type: 'sample/recorded'; atPerfMs: number; distanceM: number; speedMs: number }
	| { type: 'dive/ended'; atPerfMs: number }
	| { type: 'recording/stopping' }
	| { type: 'recording/stopped' }
	| { type: 'banner/cleared' }
	| { type: 'error/raised'; message: string }
	| { type: 'config/updated'; patch: Partial<RecorderConfig> }
	| { type: 'reset' };

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export function initialRecorderState(config: RecorderConfig): RecorderState {
	return {
		phase: 'arming',
		config,
		clocks: {
			recordingStartedPerfMs: 0,
			diveStartedPerfMs: 0,
			diveEndedPerfMs: 0
		},
		timeline: createEmptyTimeline(0),
		waypointCursor: initialWaypointCursor(),
		autoAdvance: null,
		errorMessage: null
	};
}

export function initialWaypointCursor(): WaypointCursor {
	return {
		expectedIndex: 1,
		lastManualIndex: 0,
		autoAdvancedIndexes: [],
		history: []
	};
}

/** Metres added per waypoint tap. */
export function waypointSpacingM(config: RecorderConfig): number {
	return config.waypointsPerLap > 0
		? config.poolLengthM / config.waypointsPerLap
		: config.poolLengthM;
}

export function waypointDistanceM(config: RecorderConfig, index: number): number {
	return Math.max(0, index) * waypointSpacingM(config);
}

export function tapKindForWaypointIndex(
	config: RecorderConfig,
	index: number
): 'wall' | 'split' {
	if (config.waypointsPerLap <= 1) return 'wall';
	return index % config.waypointsPerLap === 0 ? 'wall' : 'split';
}

function lastTap(timeline: DiveTimeline): LapEvent | null {
	const lastWall = timeline.laps[timeline.laps.length - 1] ?? null;
	const subs = timeline.subSplits ?? [];
	const lastSub = subs[subs.length - 1] ?? null;
	if (!lastWall && !lastSub) return null;
	if (lastWall && (!lastSub || lastWall.atMs >= lastSub.atMs)) return lastWall;
	return lastSub;
}

function lapNumberForWaypoint(config: RecorderConfig, index: number): number {
	return Math.max(1, Math.ceil(index / Math.max(1, config.waypointsPerLap)));
}

function splitIndexForWaypoint(config: RecorderConfig, index: number): number {
	const wpl = Math.max(1, config.waypointsPerLap);
	const mod = index % wpl;
	return mod === 0 ? wpl : mod;
}

function appendManualWaypoint(
	timeline: DiveTimeline,
	atMs: number,
	config: RecorderConfig,
	index: number
): DiveTimeline {
	const previous = lastTap(timeline);
	const previousAtMs = previous?.atMs ?? timeline.diveStartMs;
	const distanceM = waypointDistanceM(config, index);
	const entry: LapEvent = {
		lapNumber: splitIndexForWaypoint(config, index),
		atMs,
		splitMs: Math.max(0, atMs - previousAtMs),
		cumulativeDistanceM: distanceM
	};

	if (tapKindForWaypointIndex(config, index) === 'wall') {
		const previousWallM = Math.max(0, distanceM - config.poolLengthM);
		const subSplits = (timeline.subSplits ?? []).filter(
			(s) => s.cumulativeDistanceM <= previousWallM || s.cumulativeDistanceM > distanceM
		);
		return {
			...timeline,
			subSplits,
			laps: [
				...timeline.laps,
				{ ...entry, lapNumber: lapNumberForWaypoint(config, index) }
			]
		};
	}

	return {
		...timeline,
		subSplits: [...(timeline.subSplits ?? []), entry]
	};
}

function commitManualWaypoint(
	state: RecorderState,
	atPerfMs: number,
	index: number
): RecorderState {
	const safeIndex = Math.max(1, index);
	const atMs = atPerfMs - state.clocks.recordingStartedPerfMs;
	return {
		...state,
		timeline: appendManualWaypoint(state.timeline, atMs, state.config, safeIndex),
		waypointCursor: {
			...state.waypointCursor,
			expectedIndex: safeIndex + 1,
			lastManualIndex: safeIndex,
			history: [...state.waypointCursor.history, { kind: 'manual', index: safeIndex }]
		},
		autoAdvance: null
	};
}

function applyWaypointAutoAdvance(
	state: RecorderState,
	atPerfMs: number,
	fromIndex: number,
	toIndex: number
): RecorderState {
	const safeFrom = Math.max(1, fromIndex);
	const safeTo = Math.max(safeFrom + 1, toIndex);
	const skipped = Array.from(
		{ length: safeTo - safeFrom },
		(_value, offset) => safeFrom + offset
	);
	return {
		...state,
		waypointCursor: {
			...state.waypointCursor,
			expectedIndex: safeTo,
			autoAdvancedIndexes: [
				...state.waypointCursor.autoAdvancedIndexes,
				...skipped
			],
			history: [
				...state.waypointCursor.history,
				{ kind: 'auto', fromIndex: safeFrom, toIndex: safeTo }
			]
		},
		autoAdvance: {
			atPerfMs,
			count: safeTo - safeFrom,
			fromDistanceM: waypointDistanceM(state.config, safeFrom),
			toDistanceM: waypointDistanceM(state.config, safeTo)
		}
	};
}

function undoWaypointCursor(state: RecorderState): RecorderState {
	const history = state.waypointCursor.history;
	const last = history[history.length - 1];
	if (!last) return state;

	if (last.kind === 'manual') {
		const remainingHistory = history.slice(0, -1);
		const previousManual = [...remainingHistory]
			.reverse()
			.find((entry): entry is Extract<WaypointCursorHistoryEntry, { kind: 'manual' }> =>
				entry.kind === 'manual'
			);
		return {
			...state,
			timeline: removeLastTap(state.timeline),
			waypointCursor: {
				...state.waypointCursor,
				expectedIndex: last.index,
				lastManualIndex: previousManual?.index ?? 0,
				history: remainingHistory
			},
			autoAdvance: null
		};
	}

	return {
		...state,
		waypointCursor: {
			...state.waypointCursor,
			expectedIndex: last.fromIndex,
			autoAdvancedIndexes: state.waypointCursor.autoAdvancedIndexes.filter(
				(index) => index < last.fromIndex || index >= last.toIndex
			),
			history: history.slice(0, -1)
		},
		autoAdvance: null
	};
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/**
 * Pure reducer. Illegal events are no-ops (same reference returned).
 */
export function recorderReducer(
	state: RecorderState,
	event: RecorderEvent
): RecorderState {
	switch (event.type) {
		case 'arm/started':
			return { ...state, phase: 'arming', errorMessage: null };

		case 'arm/succeeded':
			if (state.phase !== 'arming') return state;
			return { ...state, phase: 'ready' };

		case 'arm/failed':
			return { ...state, phase: 'error', errorMessage: event.message };

		case 'recording/started': {
			if (state.phase !== 'ready') return state;
			return {
				...state,
				phase: 'prepping',
				clocks: {
					...state.clocks,
					recordingStartedPerfMs: event.atPerfMs
				},
				// provisional — diveStartMs updated on dive/started
				timeline: createEmptyTimeline(0)
			};
		}

		case 'dive/started': {
			if (state.phase !== 'prepping') return state;
			const diveStartOffsetMs =
				event.atPerfMs - state.clocks.recordingStartedPerfMs;
			return {
				...state,
				phase: 'diving',
				clocks: { ...state.clocks, diveStartedPerfMs: event.atPerfMs },
				timeline: createEmptyTimeline(diveStartOffsetMs),
				waypointCursor: initialWaypointCursor(),
				autoAdvance: null
			};
		}

		case 'waypoint/tapped': {
			if (state.phase !== 'diving') return state;
			return commitManualWaypoint(state, event.atPerfMs, state.waypointCursor.expectedIndex);
		}

		case 'waypoint/manualTapped': {
			if (state.phase !== 'diving') return state;
			return commitManualWaypoint(
				state,
				event.atPerfMs,
				event.index ?? state.waypointCursor.expectedIndex
			);
		}

		case 'wall/tapped': {
			if (state.phase !== 'diving') return state;
			const wpl = Math.max(1, state.config.waypointsPerLap);
			const index = Math.ceil(state.waypointCursor.expectedIndex / wpl) * wpl;
			return commitManualWaypoint(state, event.atPerfMs, index);
		}

		case 'split/tapped': {
			if (state.phase !== 'diving') return state;
			if (state.config.waypointsPerLap <= 1) return state;
			let index = state.waypointCursor.expectedIndex;
			if (tapKindForWaypointIndex(state.config, index) === 'wall') {
				return state;
			}
			return commitManualWaypoint(state, event.atPerfMs, index);
		}

		case 'sample/recorded': {
			if (state.phase !== 'diving') return state;
			const atMs = event.atPerfMs - state.clocks.recordingStartedPerfMs;
			const samples = state.timeline.samples ?? [];
			// Simple monotonic guard — drop samples that arrive out of order.
			if (samples.length > 0 && samples[samples.length - 1].atMs >= atMs) {
				return state;
			}
			return {
				...state,
				timeline: {
					...state.timeline,
					samples: [
						...samples,
						{ atMs, distanceM: event.distanceM, speedMs: event.speedMs }
					]
				}
			};
		}

		case 'waypoint/auto': {
			if (state.phase !== 'diving' || event.count < 1) return state;
			const fromIndex = state.waypointCursor.expectedIndex;
			return applyWaypointAutoAdvance(
				state,
				event.atPerfMs,
				fromIndex,
				fromIndex + event.count
			);
		}

		case 'waypoint/autoAdvanced': {
			if (state.phase !== 'diving' || event.toIndex <= event.fromIndex) return state;
			return applyWaypointAutoAdvance(state, event.atPerfMs, event.fromIndex, event.toIndex);
		}

		case 'waypoint/undone': {
			if (state.phase !== 'diving') return state;
			return undoWaypointCursor(state);
		}

		case 'dive/ended': {
			if (state.phase !== 'diving') return state;
			const endOffsetMs =
				event.atPerfMs - state.clocks.recordingStartedPerfMs;
			return {
				...state,
				phase: 'ended',
				clocks: { ...state.clocks, diveEndedPerfMs: event.atPerfMs },
				timeline: finalizeTimeline(state.timeline, endOffsetMs)
			};
		}

		case 'recording/stopping': {
			if (
				state.phase !== 'prepping' &&
				state.phase !== 'diving' &&
				state.phase !== 'ended'
			) {
				return state;
			}
			// If the user bails before starting the dive, record a
			// zero-length dive at the current offset so downstream code
			// has sane diveStart/diveEnd values.
			if (state.phase === 'prepping') {
				const nowOffset = 0; // no dive — the edge layer owns timing here
				return {
					...state,
					phase: 'stopping',
					timeline: finalizeTimeline(
						{ ...state.timeline, diveStartMs: nowOffset },
						nowOffset
					)
				};
			}
			// Diving → close the dive at the same instant.
			if (state.phase === 'diving') {
				return {
					...state,
					phase: 'stopping',
					timeline: finalizeTimeline(
						state.timeline,
						state.timeline.diveStartMs // no measured end yet; edge will pass dive/ended first in practice
					)
				};
			}
			return { ...state, phase: 'stopping' };
		}

		case 'recording/stopped':
			return { ...state, phase: 'ready' };

		case 'banner/cleared':
			return state.autoAdvance === null
				? state
				: { ...state, autoAdvance: null };

		case 'error/raised':
			return { ...state, phase: 'error', errorMessage: event.message };

		case 'config/updated':
			return { ...state, config: { ...state.config, ...event.patch } };

		case 'reset':
			return initialRecorderState(state.config);

		default: {
			// Exhaustiveness
			const _never: never = event;
			void _never;
			return state;
		}
	}
}
