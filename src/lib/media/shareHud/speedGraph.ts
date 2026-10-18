/**
 * Speed graph model for the share HUD (plan §4.8). Pure data in metres,
 * metres per second and milliseconds; `layout.ts` turns it into pixels.
 *
 * Speed is only known per waypoint segment (time between two taps over the
 * distance between them), so the graph is a stepped line.
 */

import type { DiveTimeline, LapEvent } from '../../capture/timelineTypes';
import { distanceAt } from '../../capture/timeline';

export type GraphDirection = 'ltr' | 'rtl';

export interface SpeedSegment {
	readonly fromM: number;
	readonly toM: number;
	readonly speedMs: number;
	readonly startMs: number;
	readonly endMs: number;
	/** Extrapolated after the last tap (dive ended mid-length). Drawn dashed. */
	readonly estimated: boolean;
}

export interface SpeedScale {
	readonly lo: number;
	readonly hi: number;
	/** Guide-line values to label, inside [lo, hi]. */
	readonly guides: readonly number[];
}

/** Completed length is held on screen this long after the wall touch. */
export const TURN_HOLD_MS = 500;
/** Then it flips (or fades) into the ghost over this long. */
export const TURN_FLIP_MS = 600;
/** Ghost opacity once the flip completes. */
export const GHOST_OPACITY = 0.38;
/** Segments at least this long get a speed label (one 12.5 m waypoint gap and up). */
const LABEL_MIN_SEGMENT_M = 10;

function waypoints(timeline: DiveTimeline): LapEvent[] {
	return [...timeline.laps, ...(timeline.subSplits ?? [])]
		.filter((e) => e.atMs > timeline.diveStartMs && e.atMs <= timeline.diveEndMs)
		.sort((a, b) => a.atMs - b.atMs || a.cumulativeDistanceM - b.cumulativeDistanceM);
}

/**
 * Whole-dive waypoint segments, plus an estimated tail from the last tap to
 * the dive end when the dive ended between taps.
 */
export function diveSegments(timeline: DiveTimeline, defaultSpeedMs = 1): SpeedSegment[] {
	const out: SpeedSegment[] = [];
	let previousAtMs = timeline.diveStartMs;
	let previousM = 0;
	for (const event of waypoints(timeline)) {
		const distance = event.cumulativeDistanceM - previousM;
		const durationMs = event.atMs - previousAtMs;
		if (distance <= 0 || durationMs <= 0) continue;
		out.push({
			fromM: previousM,
			toM: event.cumulativeDistanceM,
			speedMs: distance / (durationMs / 1000),
			startMs: previousAtMs,
			endMs: event.atMs,
			estimated: false
		});
		previousAtMs = event.atMs;
		previousM = event.cumulativeDistanceM;
	}
	if (timeline.diveEndMs > previousAtMs) {
		const endM = distanceAt(timeline, timeline.diveEndMs, 0, defaultSpeedMs);
		if (endM > previousM + 0.05) {
			out.push({
				fromM: previousM,
				toM: endM,
				speedMs: (endM - previousM) / ((timeline.diveEndMs - previousAtMs) / 1000),
				startMs: previousAtMs,
				endMs: timeline.diveEndMs,
				estimated: true
			});
		}
	}
	return out;
}

/** Final distance implied by the segments (matches `totalDistanceM` without samples). */
export function finalDistanceM(segments: readonly SpeedSegment[]): number {
	return segments.length > 0 ? segments[segments.length - 1].toM : 0;
}

/**
 * Dive-wide y scale, fixed for the whole video: floor(min − 0.05) … ceil(max + 0.05)
 * to 0.1 m/s, at least 0.3 m/s tall. Two guide lines.
 */
export function speedScale(segments: readonly SpeedSegment[]): SpeedScale {
	const speeds = segments.map((s) => s.speedMs);
	const min = speeds.length > 0 ? Math.min(...speeds) : 0.8;
	const max = speeds.length > 0 ? Math.max(...speeds) : 1.2;
	let lo = Math.max(0, Math.floor((min - 0.05) * 10) / 10);
	let hi = Math.ceil((max + 0.05) * 10) / 10;
	if (hi - lo < 0.3) {
		const pad = (0.3 - (hi - lo)) / 2;
		lo = Math.max(0, Math.round((lo - pad) * 10) / 10);
		hi = Math.round((lo + 0.3 + Math.max(0, hi - lo - 0.3)) * 10) / 10;
	}
	const ticks: number[] = [];
	for (let v = Math.round(lo * 10) + 1; v < Math.round(hi * 10); v += 1) ticks.push(v / 10);
	const step = Math.max(1, Math.round(ticks.length / 3));
	const guides = ticks.filter((_, i) => i % step === Math.floor(step / 2)).slice(0, 2);
	return { lo, hi, guides };
}

/** Segments revealed up to `distanceM`, the last one truncated at it. */
export function revealedSegments(segments: readonly SpeedSegment[], distanceM: number): SpeedSegment[] {
	const out: SpeedSegment[] = [];
	for (const s of segments) {
		if (s.fromM >= distanceM - 1e-9) break;
		out.push(s.toM <= distanceM ? s : { ...s, toM: distanceM });
	}
	return out;
}

/** Segments inside length `n` (1-based), clipped to its walls. */
export function lengthSegments(
	segments: readonly SpeedSegment[],
	n: number,
	poolLengthM: number
): SpeedSegment[] {
	const a = (n - 1) * poolLengthM;
	const b = n * poolLengthM;
	return segments
		.filter((s) => s.toM > a + 1e-9 && s.fromM < b - 1e-9)
		.map((s) => ({ ...s, fromM: Math.max(a, s.fromM), toM: Math.min(b, s.toM) }));
}

/** Time the diver reached `distanceM` (interpolated within its segment), or null. */
export function timeAtDistance(segments: readonly SpeedSegment[], distanceM: number): number | null {
	for (const s of segments) {
		if (distanceM <= s.toM + 1e-9 && distanceM >= s.fromM - 1e-9) {
			const f = s.toM > s.fromM ? (distanceM - s.fromM) / (s.toM - s.fromM) : 1;
			return s.startMs + f * (s.endMs - s.startMs);
		}
	}
	return null;
}

export function lengthCount(finalM: number, poolLengthM: number): number {
	return Math.max(1, Math.ceil(finalM / poolLengthM - 1e-9));
}

export function lengthDirection(n: number, firstLength: GraphDirection): GraphDirection {
	return n % 2 === 1 ? firstLength : firstLength === 'ltr' ? 'rtl' : 'ltr';
}

export interface GraphSegmentLabel {
	readonly speedMs: number;
	/** Speed change vs the same stretch of the previous length (m/s), or null. */
	readonly deltaMs: number | null;
}

export interface LiveGraphSegment extends SpeedSegment {
	/** Present when the segment is complete and wide enough to label. */
	readonly label: GraphSegmentLabel | null;
}

export type TurnPhase = 'live' | 'hold' | 'flip';

export interface SpeedGraphFrame {
	readonly scale: SpeedScale;
	readonly poolLengthM: number;
	/** 1-based length shown. */
	readonly length: number;
	readonly startM: number;
	readonly endM: number;
	readonly direction: GraphDirection;
	readonly segments: readonly LiveGraphSegment[];
	readonly cursor: { readonly distanceM: number; readonly speedMs: number; readonly showTag: boolean } | null;
	readonly ghost: {
		readonly length: number;
		readonly direction: GraphDirection;
		readonly segments: readonly SpeedSegment[];
		/** 0 = drawn where it was swum, 1 = mirrored into the ghost position. */
		readonly flip: number;
		readonly opacity: number;
		readonly dashed: boolean;
		readonly showLabel: boolean;
	} | null;
	readonly pbPost: { readonly distanceM: number; readonly passed: boolean } | null;
	readonly phase: TurnPhase;
}

export interface SpeedGraphInput {
	readonly segments: readonly SpeedSegment[];
	readonly scale: SpeedScale;
	readonly poolLengthM: number;
	readonly firstLengthDirection: GraphDirection;
	readonly pbBeforeM: number | null;
}

function easeInOut(p: number): number {
	return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function labelled(
	segs: readonly SpeedSegment[],
	previous: readonly SpeedSegment[],
	startM: number,
	prevStartM: number,
	labelLast: boolean
): LiveGraphSegment[] {
	return segs.map((s, i) => {
		const complete = labelLast || i < segs.length - 1;
		if (!complete || s.toM - s.fromM < LABEL_MIN_SEGMENT_M || s.estimated) return { ...s, label: null };
		const ref = previous.find(
			(p) =>
				Math.abs(p.fromM - prevStartM - (s.fromM - startM)) < 0.5 &&
				Math.abs(p.toM - p.fromM - (s.toM - s.fromM)) < 0.5 &&
				!p.estimated
		);
		return { ...s, label: { speedMs: s.speedMs, deltaMs: ref ? s.speedMs - ref.speedMs : null } };
	});
}

/** Live graph state at `atMs` (recording clock). */
export function speedGraphFrame(input: SpeedGraphInput, atMs: number): SpeedGraphFrame {
	const { segments, poolLengthM } = input;
	const finalM = finalDistanceM(segments);
	const total = lengthCount(finalM, poolLengthM);
	const diveStartMs = segments[0]?.startMs ?? 0;
	const diveEndMs = segments[segments.length - 1]?.endMs ?? 0;
	const t = Math.min(atMs, diveEndMs);
	const distanceM = atMs <= diveStartMs ? 0 : distanceOnSegments(segments, t);

	let length = Math.min(total, Math.floor(distanceM / poolLengthM + 1e-9) + 1);
	let shownM = distanceM;
	let phase: TurnPhase = 'live';
	let sinceWallMs = Infinity;
	if (length > 1) {
		const wallAt = timeAtDistance(segments, (length - 1) * poolLengthM);
		if (wallAt !== null) {
			sinceWallMs = t - wallAt;
			if (sinceWallMs < TURN_HOLD_MS) {
				length -= 1;
				shownM = length * poolLengthM;
				phase = 'hold';
			} else if (sinceWallMs < TURN_HOLD_MS + TURN_FLIP_MS) {
				phase = 'flip';
			}
		}
	}
	const ended = atMs >= diveEndMs && segments.length > 0;
	const startM = (length - 1) * poolLengthM;
	const direction = lengthDirection(length, input.firstLengthDirection);
	const revealed = lengthSegments(revealedSegments(segments, shownM), length, poolLengthM);
	const previous = length > 1 ? lengthSegments(segments, length - 1, poolLengthM) : [];
	const atWall = phase === 'hold' || ended;
	const segs = labelled(revealed, previous, startM, startM - poolLengthM, atWall);

	// The ghost is the previous length. It flips into place after the hold;
	// during a hold (and once settled) it sits mirrored at ghost opacity.
	let ghost: SpeedGraphFrame['ghost'] = null;
	if (previous.length > 0) {
		const p = phase === 'flip' ? (sinceWallMs - TURN_HOLD_MS) / TURN_FLIP_MS : 1;
		const e = easeInOut(Math.min(1, Math.max(0, p)));
		ghost = {
			length: length - 1,
			direction: lengthDirection(length - 1, input.firstLengthDirection),
			segments: previous,
			flip: e,
			opacity: 1 - (1 - GHOST_OPACITY) * e,
			dashed: e > 0.5,
			showLabel: e >= 1 && phase !== 'hold'
		};
	}

	const pb = input.pbBeforeM;
	const pbPost =
		pb !== null && pb > startM && pb < startM + poolLengthM ? { distanceM: pb, passed: shownM >= pb } : null;
	const cursorSpeed = segs.length > 0 ? segs[segs.length - 1].speedMs : 0;

	return {
		scale: input.scale,
		poolLengthM,
		length,
		startM,
		endM: startM + poolLengthM,
		direction,
		segments: segs,
		cursor: atMs <= diveStartMs ? null : { distanceM: shownM, speedMs: cursorSpeed, showTag: !atWall },
		ghost,
		pbPost,
		phase
	};
}

/** Distance at `atMs` from the segments (same model as `distanceAt` without samples). */
export function distanceOnSegments(segments: readonly SpeedSegment[], atMs: number): number {
	if (segments.length === 0 || atMs <= segments[0].startMs) return 0;
	for (const s of segments) {
		if (atMs <= s.endMs) {
			const f = s.endMs > s.startMs ? (atMs - s.startMs) / (s.endMs - s.startMs) : 1;
			return s.fromM + f * (s.toM - s.fromM);
		}
	}
	return segments[segments.length - 1].toM;
}

export interface CardLength {
	readonly n: number;
	readonly startM: number;
	readonly endM: number;
	readonly distanceM: number;
	readonly splitMs: number;
	readonly avgSpeedMs: number;
	readonly partial: boolean;
}

/** Per-length summary for the result card graph (§4.8.4). */
export function cardLengths(segments: readonly SpeedSegment[], poolLengthM: number): CardLength[] {
	const finalM = finalDistanceM(segments);
	const out: CardLength[] = [];
	for (let n = 1; n <= lengthCount(finalM, poolLengthM); n++) {
		const segs = lengthSegments(segments, n, poolLengthM);
		const distanceM = segs.reduce((t, s) => t + s.toM - s.fromM, 0);
		if (distanceM <= 0) continue;
		const splitMs = segs.reduce((t, s) => t + ((s.toM - s.fromM) / s.speedMs) * 1000, 0);
		out.push({
			n,
			startM: (n - 1) * poolLengthM,
			endM: (n - 1) * poolLengthM + distanceM,
			distanceM,
			splitMs,
			avgSpeedMs: distanceM / (splitMs / 1000),
			partial: distanceM < poolLengthM - 0.05
		});
	}
	return out;
}
