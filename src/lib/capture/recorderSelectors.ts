/**
 * Derived selectors for `RecorderState` — pure functions.
 *
 * Consumed by the Svelte view via `$derived`. No side-effects.
 */

import type { RecorderState } from './recorderState';
import { waypointSpacingM } from './recorderState';
import type { LapEvent } from '../types';
import { defaultSpeedMs } from './disciplineSpeeds';

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

/** Wall taps so far (completed lengths). */
export function waypointCount(state: RecorderState): number {
	return state.timeline.laps.length;
}

// ---------------------------------------------------------------------------
// v2 helpers — unified wall+split view
// ---------------------------------------------------------------------------

/**
 * The most recent tap on the timeline — wall or split — whichever has the
 * later `atMs`. Null if the diver hasn't tapped anything yet.
 */
function lastTap(state: RecorderState): LapEvent | null {
	const { laps, subSplits } = state.timeline;
	const lastWall = laps.length > 0 ? laps[laps.length - 1] : null;
	const subs = subSplits ?? [];
	const lastSub = subs.length > 0 ? subs[subs.length - 1] : null;
	if (!lastWall && !lastSub) return null;
	if (lastWall && (!lastSub || lastWall.atMs >= lastSub.atMs)) return lastWall;
	return lastSub;
}

/** Number of sub-splits that belong to the current (incomplete) lap. */
function inLapSubSplitCount(state: RecorderState): number {
	const completedWalls = state.timeline.laps.length;
	const thresholdM = completedWalls * state.config.poolLengthM;
	return (state.timeline.subSplits ?? []).filter(
		(s) => s.cumulativeDistanceM > thresholdM
	).length;
}

/** What kind of tap is next expected under the smart-button rule? */
export function nextTapKind(state: RecorderState): 'wall' | 'split' {
	const wpl = state.config.waypointsPerLap;
	if (wpl <= 1) return 'wall';
	return inLapSubSplitCount(state) + 1 < wpl ? 'split' : 'wall';
}

/** Cumulative distance (m) of the next expected tap. */
export function nextWaypointM(state: RecorderState): number {
	const completedWalls = state.timeline.laps.length;
	const wallBaseM = completedWalls * state.config.poolLengthM;
	if (nextTapKind(state) === 'wall') {
		return wallBaseM + state.config.poolLengthM;
	}
	const spacing = waypointSpacingM(state.config);
	return wallBaseM + (inLapSubSplitCount(state) + 1) * spacing;
}

/** Cumulative distance (m) of the next WALL — the next integer length. */
export function nextWallM(state: RecorderState): number {
	return (state.timeline.laps.length + 1) * state.config.poolLengthM;
}

/**
 * Live speed in m/s. Derived from the gap between the two most recent taps
 * (of any kind), or from the single tap's split (time since dive start)
 * if there is only one. Defaults to the discipline-specific initial speed
 * (see `disciplineSpeeds.ts`) before the first tap.
 */
export function liveSpeedMs(state: RecorderState): number {
	const { phase, timeline, config } = state;
	if (phase !== 'diving' && phase !== 'ended' && phase !== 'stopping') return 0;

	const initial = defaultSpeedMs(config.discipline);

	// Merge walls + subSplits by atMs.
	const subs = timeline.subSplits ?? [];
	const merged = [...timeline.laps, ...subs].sort((a, b) => a.atMs - b.atMs);
	if (merged.length === 0) return initial;

	if (merged.length === 1) {
		const only = merged[0];
		if (only.splitMs <= 0) return 0;
		return only.cumulativeDistanceM / (only.splitMs / 1000);
	}

	const last = merged[merged.length - 1];
	const prev = merged[merged.length - 2];
	const dt = (last.atMs - prev.atMs) / 1000;
	const dx = last.cumulativeDistanceM - prev.cumulativeDistanceM;
	if (dt <= 0) return initial;
	// Negative dx shouldn't happen (events are append-only with monotonic
	// cumulative distance) but guard just in case.
	if (dx < 0) return waypointSpacingM(config) / Math.max(dt, 0.001);
	return dx / dt;
}

/**
 * Interpolated cumulative distance at `nowPerfMs`. UNCAPPED in v2 — the HUD
 * keeps advancing past the next expected waypoint when the diver misses a
 * tap, instead of pinning. The reducer corrects the base on the next real
 * wall tap (snap-to-integer). Starts from dive-start at the discipline-
 * specific default speed (DYN/DYNB/DNF) until the first tap.
 */
export function cumulativeDistanceM(
	state: RecorderState,
	nowPerfMs: number
): number {
	const { phase, timeline, clocks, config } = state;
	const initial = defaultSpeedMs(config.discipline);

	if (phase === 'ended' || phase === 'stopping') {
		const anchor = lastTap(state);
		const baseAtMs =
			anchor === null
				? clocks.diveStartedPerfMs - clocks.recordingStartedPerfMs
				: anchor.atMs;
		const baseDistance = anchor?.cumulativeDistanceM ?? 0;
		const endAtMs = clocks.diveEndedPerfMs - clocks.recordingStartedPerfMs;
		const elapsedSinceBaseMs = Math.max(0, endAtMs - baseAtMs);
		const speed = liveSpeedMs(state) > 0 ? liveSpeedMs(state) : initial;
		return baseDistance + (elapsedSinceBaseMs / 1000) * speed;
	}

	if (phase !== 'diving') {
		const anchor = lastTap(state);
		return anchor?.cumulativeDistanceM ?? 0;
	}

	const anchor = lastTap(state);
	const baseAtMs =
		anchor === null
			? clocks.diveStartedPerfMs - clocks.recordingStartedPerfMs
			: anchor.atMs;
	const baseDistance = anchor?.cumulativeDistanceM ?? 0;
	const elapsedSinceBaseMs = Math.max(
		0,
		nowPerfMs - clocks.recordingStartedPerfMs - baseAtMs
	);
	const speed = liveSpeedMs(state) > 0 ? liveSpeedMs(state) : initial;
	// v2: UNCAPPED — no Math.min against the next-waypoint target. A missed
	// tap lets the HUD drift past the target so the coach can see it; the
	// diver's next wall tap will snap the base back to the correct integer.
	return baseDistance + (elapsedSinceBaseMs / 1000) * speed;
	void timeline; // referenced for consistency with earlier signature
}

/**
 * True when the interpolated distance exceeds the NEXT WALL by at least the
 * configured threshold — i.e. the coach likely missed a wall tap entirely.
 * In v2 this is signal-only: raising the banner is all that happens. The
 * next real wall tap is ground truth.
 */
export function shouldAutoAdvance(
	state: RecorderState,
	nowPerfMs: number
): boolean {
	if (state.phase !== 'diving') return false;
	const raw = cumulativeDistanceM(state, nowPerfMs);
	const target = nextWallM(state);
	return raw - target >= state.config.autoAdvanceThresholdM;
}

/** Can the user undo the last tap (wall or split)? */
export function canUndo(state: RecorderState): boolean {
	if (state.phase !== 'diving') return false;
	const hasWall = state.timeline.laps.length > 0;
	const hasSub = (state.timeline.subSplits?.length ?? 0) > 0;
	return hasWall || hasSub;
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

export type PrimaryRecorderAction =
	| 'record'
	| 'startDive'
	| 'waypoint'
	| 'stopRecording'
	| 'disabled';

export interface PrimaryActionSpec {
	action: PrimaryRecorderAction;
	label: string;
	sub?: string;
	disabled: boolean;
	supportsLongPressEndDive: boolean;
}

export function primaryActionSpec(state: RecorderState): PrimaryActionSpec {
	switch (state.phase) {
		case 'ready':
			return {
				action: 'record',
				label: 'Record',
				sub: 'start capture',
				disabled: false,
				supportsLongPressEndDive: false
			};

		case 'prepping':
			return {
				action: 'startDive',
				label: 'Start dive',
				sub: 'leave wall',
				disabled: false,
				supportsLongPressEndDive: false
			};

		case 'diving': {
			const kind = nextTapKind(state);
			const targetM = nextWaypointM(state);
			const completedWalls = state.timeline.laps.length;
			return {
				action: 'waypoint',
				label: kind === 'wall' ? `Wall ${completedWalls + 1}` : 'Split',
				sub:
					kind === 'wall'
						? `${formatMetersPlain(targetM)} m`
						: `mid-lap ${formatMetersPlain(targetM)} m`,
				disabled: false,
				supportsLongPressEndDive: true
			};
		}

		case 'ended':
			return {
				action: 'stopRecording',
				label: 'Stop',
				sub: 'save video',
				disabled: false,
				supportsLongPressEndDive: false
			};

		case 'stopping':
			return {
				action: 'disabled',
				label: 'Finalising',
				disabled: true,
				supportsLongPressEndDive: false
			};

		default:
			return {
				action: 'disabled',
				label: state.phase === 'arming' ? 'Arming' : 'Unavailable',
				disabled: true,
				supportsLongPressEndDive: false
			};
	}
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
			const kind = nextTapKind(state);
			const targetM = nextWaypointM(state);
			const completedWalls = state.timeline.laps.length;
			const label =
				kind === 'wall'
					? `Wall ${completedWalls + 1}`
					: `Split`;
			const sub =
				kind === 'wall'
					? `at ${formatMetersPlain(targetM)} m`
					: `mid-lap · ${formatMetersPlain(targetM)} m`;
			return {
				buttons: [
					{
						kind: 'undoWaypoint',
						label: 'Undo',
						weight: 1,
						disabled: !canUndo(state)
					},
					{ kind: 'waypoint', label, sub, weight: 3 },
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
