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
	appendLap,
	appendSplit,
	appendWall,
	createEmptyTimeline,
	finalizeTimeline,
	removeLastTap
} from './timeline';

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
}

export interface RecorderState {
	phase: Phase;
	config: RecorderConfig;
	clocks: RecorderClocks;
	timeline: DiveTimeline;
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
		autoAdvance: null,
		errorMessage: null
	};
}

/** Metres added per waypoint tap. */
export function waypointSpacingM(config: RecorderConfig): number {
	return config.waypointsPerLap > 0
		? config.poolLengthM / config.waypointsPerLap
		: config.poolLengthM;
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
				timeline: createEmptyTimeline(diveStartOffsetMs)
			};
		}

		case 'waypoint/tapped': {
			// v1 back-compat: treat every tap as a wall under the legacy
			// model where `laps` == every waypoint at `lapNumber*spacing`.
			// New call-sites should dispatch wall/tapped or split/tapped
			// directly. The v2 UI uses the smart-button classifier (see
			// DiveRecorder.svelte) and will never dispatch this variant.
			if (state.phase !== 'diving') return state;
			const atMs = event.atPerfMs - state.clocks.recordingStartedPerfMs;
			return {
				...state,
				timeline: appendLap(state.timeline, atMs, waypointSpacingM(state.config))
			};
		}

		case 'wall/tapped': {
			if (state.phase !== 'diving') return state;
			const atMs = event.atPerfMs - state.clocks.recordingStartedPerfMs;
			// Clear any mid-lap sub-splits that logically belong to the
			// just-completed lap — the wall is authoritative. Keeping the
			// sub-splits is also valid (they still carry a timestamp), but
			// we prefer a clean "one lap = one wall + N splits within it"
			// model going forward. Implementation choice: DROP in-lap
			// splits when the wall is tapped; analytics can reconstruct
			// speed between walls from `samples` instead. This avoids
			// ambiguity when a split was tapped slightly AFTER the diver
			// crossed the wall.
			const completedWallCount = state.timeline.laps.length;
			const currentWallM = completedWallCount * state.config.poolLengthM;
			const prunedSubSplits = (state.timeline.subSplits ?? []).filter(
				(s) => s.cumulativeDistanceM <= currentWallM
			);
			return {
				...state,
				timeline: appendWall(
					{ ...state.timeline, subSplits: prunedSubSplits },
					atMs,
					state.config.poolLengthM
				),
				autoAdvance: null
			};
		}

		case 'split/tapped': {
			if (state.phase !== 'diving') return state;
			const atMs = event.atPerfMs - state.clocks.recordingStartedPerfMs;
			// Count existing in-lap sub-splits to derive splitIndex.
			const completedWallCount = state.timeline.laps.length;
			const currentWallM = completedWallCount * state.config.poolLengthM;
			const inLapSubs = (state.timeline.subSplits ?? []).filter(
				(s) => s.cumulativeDistanceM > currentWallM
			);
			const splitIndex = inLapSubs.length + 1;
			// waypointsPerLap === 1 is a degenerate config for splits; guard.
			if (state.config.waypointsPerLap <= 1) return state;
			// Don't let a split overshoot the wall it's preceding.
			if (splitIndex >= state.config.waypointsPerLap) return state;
			return {
				...state,
				timeline: appendSplit(
					state.timeline,
					atMs,
					state.config.poolLengthM,
					state.config.waypointsPerLap,
					splitIndex
				)
			};
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
			// v2 semantics: signal-only. Raise the banner so the UI can
			// hint "you may have missed a wall" — but do NOT stamp a lap.
			// Ground truth is preserved for the next real wall tap.
			if (state.phase !== 'diving' || event.count < 1) return state;
			return {
				...state,
				autoAdvance: { atPerfMs: event.atPerfMs, count: event.count }
			};
		}

		case 'waypoint/undone': {
			if (state.phase !== 'diving') return state;
			const hasWall = state.timeline.laps.length > 0;
			const hasSub = (state.timeline.subSplits?.length ?? 0) > 0;
			if (!hasWall && !hasSub) return state;
			return {
				...state,
				timeline: removeLastTap(state.timeline),
				autoAdvance: null
			};
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
