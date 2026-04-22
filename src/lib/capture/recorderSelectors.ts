/**
 * Derived selectors for `RecorderState` — pure functions.
 *
 * Consumed by the Svelte view via `$derived`. No side-effects.
 */

import type { RecorderState } from './recorderState';
import { waypointSpacingM } from './recorderState';

/** ms elapsed since Start-dive. 0 before the dive begins. */
export function diveElapsedMs(state: RecorderState, nowPerfMs: number): number {
	const { phase, clocks } = state;
	if (phase === 'diving') {
		return Math.max(0, nowPerfMs - clocks.diveStartedPerfMs);
	}
	if (phase === 'ended' || phase === 'stopping') {
		return Math.max(0, clocks.diveEndedPerfMs - clocks.diveStartedPerfMs);
	}
	return 0;
}

/** ms elapsed since the MediaRecorder started. */
export function recordingElapsedMs(
	state: RecorderState,
	nowPerfMs: number
): number {
	if (state.clocks.recordingStartedPerfMs === 0) return 0;
	return Math.max(0, nowPerfMs - state.clocks.recordingStartedPerfMs);
}

/** Waypoints tapped so far. */
export function waypointCount(state: RecorderState): number {
	return state.timeline.laps.length;
}

/** Cumulative distance of the next waypoint target (metres). */
export function nextWaypointM(state: RecorderState): number {
	return (waypointCount(state) + 1) * waypointSpacingM(state.config);
}

/** Live speed in m/s. Defaults to 1 m/s before the first waypoint. */
export function liveSpeedMs(state: RecorderState): number {
	const { phase, timeline, config } = state;
	if (phase !== 'diving' && phase !== 'ended' && phase !== 'stopping') return 0;
	const count = timeline.laps.length;
	if (count === 0) return 1;
	const last = timeline.laps[count - 1];
	if (last.splitMs <= 0) return 0;
	return waypointSpacingM(config) / (last.splitMs / 1000);
}

/**
 * Interpolated cumulative distance at `nowPerfMs`. Starts from dive-start at
 * 1 m/s until the first waypoint; thereafter interpolates from the last
 * waypoint using the most recent measured pace. Capped at the next waypoint
 * target so the UI doesn't visibly "jump back" on a late tap.
 */
export function cumulativeDistanceM(
	state: RecorderState,
	nowPerfMs: number
): number {
	const { phase, timeline, clocks } = state;
	const count = timeline.laps.length;

	if (phase !== 'diving') {
		return count === 0 ? 0 : timeline.laps[count - 1].cumulativeDistanceM;
	}

	const lastLap = count === 0 ? null : timeline.laps[count - 1];
	const baseAtMs =
		lastLap === null
			? clocks.diveStartedPerfMs - clocks.recordingStartedPerfMs
			: lastLap.atMs;
	const baseDistance = lastLap?.cumulativeDistanceM ?? 0;
	const elapsedSinceBaseMs = Math.max(
		0,
		nowPerfMs - clocks.recordingStartedPerfMs - baseAtMs
	);
	const speed = liveSpeedMs(state) > 0 ? liveSpeedMs(state) : 1;
	const interpolated = baseDistance + (elapsedSinceBaseMs / 1000) * speed;
	return Math.min(interpolated, nextWaypointM(state));
}

/**
 * True when the interpolated distance exceeds the next waypoint by at least
 * the configured threshold — i.e. the user likely missed a tap.
 */
export function shouldAutoAdvance(
	state: RecorderState,
	nowPerfMs: number
): boolean {
	if (state.phase !== 'diving') return false;
	// Raw (uncapped) interpolated distance:
	const count = state.timeline.laps.length;
	const lastLap = count === 0 ? null : state.timeline.laps[count - 1];
	const baseAtMs =
		lastLap === null
			? state.clocks.diveStartedPerfMs - state.clocks.recordingStartedPerfMs
			: lastLap.atMs;
	const baseDistance = lastLap?.cumulativeDistanceM ?? 0;
	const elapsedSinceBaseMs = Math.max(
		0,
		nowPerfMs - state.clocks.recordingStartedPerfMs - baseAtMs
	);
	const speed = liveSpeedMs(state) > 0 ? liveSpeedMs(state) : 1;
	const raw = baseDistance + (elapsedSinceBaseMs / 1000) * speed;
	const target = nextWaypointM(state);
	return raw - target >= state.config.autoAdvanceThresholdM;
}

/** Can the user undo the last waypoint? */
export function canUndo(state: RecorderState): boolean {
	return state.phase === 'diving' && state.timeline.laps.length > 0;
}

// ---------------------------------------------------------------------------
// Button-layout data (rendered verbatim by the view)
// ---------------------------------------------------------------------------

export type ButtonKind =
	| 'cancel'
	| 'record'
	| 'stopRecording'
	| 'startDive'
	| 'waypoint'
	| 'undoWaypoint'
	| 'endDive';

export interface ButtonSpec {
	kind: ButtonKind;
	label: string;
	sub?: string;
	disabled?: boolean;
	/** Relative visual weight: 1 = small, 2 = medium, 3 = big/primary. */
	weight: 1 | 2 | 3;
}

export interface ButtonLayout {
	buttons: ButtonSpec[];
	hint: string | null;
}

export function buttonLayout(state: RecorderState): ButtonLayout {
	switch (state.phase) {
		case 'ready':
			return {
				buttons: [
					{ kind: 'cancel', label: 'Cancel', weight: 1 },
					{ kind: 'record', label: '● Record', weight: 3 }
				],
				hint: 'Press ● Record to start capturing the breathe-up.'
			};

		case 'prepping':
			return {
				buttons: [
					{ kind: 'stopRecording', label: '■ Stop', weight: 1 },
					{ kind: 'startDive', label: '▶ Start dive', weight: 3 }
				],
				hint: 'Press Start dive when the diver leaves the wall.'
			};

		case 'diving': {
			const target = nextWaypointM(state);
			const n = waypointCount(state);
			return {
				buttons: [
					{
						kind: 'undoWaypoint',
						label: 'Undo',
						weight: 1,
						disabled: !canUndo(state)
					},
					{
						kind: 'waypoint',
						label: `Waypoint ${n + 1}`,
						sub: `at ${formatMetersPlain(target)} m`,
						weight: 3
					},
					{ kind: 'endDive', label: 'End dive', weight: 1 }
				],
				hint: null
			};
		}

		case 'ended':
			return {
				buttons: [
					{ kind: 'stopRecording', label: '■ Stop recording', weight: 3 }
				],
				hint:
					'Dive clock stopped. Keep the camera on the diver for the ' +
					'surface protocol, then tap Stop recording.'
			};

		default:
			return { buttons: [], hint: null };
	}
}

function formatMetersPlain(m: number): string {
	return Number.isInteger(m) ? `${m}` : m.toFixed(1);
}
