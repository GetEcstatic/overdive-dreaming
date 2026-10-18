/**
 * Share HUD frame model (plan §4.6, §4.7, §6.1): everything the HUD shows at
 * one moment, as plain values. Motion is a pure function of `atMs`, so
 * playback, export and scrubbing always agree.
 */

import type { DiveTimeline } from '../../capture/timelineTypes';
import type { HudDiscipline } from './format';
import {
	cardLengths,
	diveSegments,
	distanceOnSegments,
	finalDistanceM,
	lengthCount,
	speedGraphFrame,
	speedScale,
	timeAtDistance,
	type CardLength,
	type GraphDirection,
	type SpeedGraphFrame,
	type SpeedScale,
	type SpeedSegment
} from './speedGraph';

export interface ShareHudContext {
	readonly poolLengthM: number;
	readonly discipline: HudDiscipline;
	/** Best standard distance PB before this dive, or null (no PB elements). */
	readonly pbBeforeM: number | null;
	readonly athleteName: string | null;
	/** Pre-formatted, e.g. `17 Oct 2026`. */
	readonly dateLabel: string | null;
	readonly branding: 'subtle' | 'off';
	readonly firstLengthDirection: GraphDirection;
	/** Discipline default speed, used before the first tap. */
	readonly defaultSpeedMs?: number;
}

export const SPLIT_TOAST_IN_MS = 250;
export const SPLIT_TOAST_HOLD_MS = 3_800;
export const SPLIT_TOAST_OUT_MS = 400;
export const PB_TOAST_MS = 3_000;
export const CARD_FADE_MS = 400;

/** Dive-wide data derived once per video and reused for every frame. */
export interface ShareHudDive {
	readonly timeline: DiveTimeline;
	readonly context: ShareHudContext;
	readonly segments: readonly SpeedSegment[];
	readonly scale: SpeedScale;
	readonly finalM: number;
	readonly lengths: number;
	/** When the diver passed `pbBeforeM`, or null. */
	readonly pbCrossedAtMs: number | null;
	/** Wall touches (end of each full length) with split and delta vs the previous length. */
	readonly walls: readonly { readonly length: number; readonly atMs: number; readonly splitMs: number; readonly deltaMs: number | null }[];
}

export function prepareDive(timeline: DiveTimeline, context: ShareHudContext): ShareHudDive {
	const segments = diveSegments(timeline, context.defaultSpeedMs ?? 1);
	const finalM = finalDistanceM(segments);
	const pool = context.poolLengthM;
	const pb = context.pbBeforeM;
	const walls: ShareHudDive['walls'][number][] = [];
	let previousAtMs = timeline.diveStartMs;
	for (let n = 1; n * pool <= finalM + 1e-9; n++) {
		const atMs = timeAtDistance(segments, n * pool);
		if (atMs === null) break;
		const splitMs = atMs - previousAtMs;
		const prev = walls[walls.length - 1];
		walls.push({ length: n, atMs, splitMs, deltaMs: prev ? splitMs - prev.splitMs : null });
		previousAtMs = atMs;
	}
	return {
		timeline,
		context,
		segments,
		scale: speedScale(segments),
		finalM,
		lengths: lengthCount(finalM, pool),
		pbCrossedAtMs: pb !== null && pb > 0 && finalM >= pb ? timeAtDistance(segments, pb) : null,
		walls
	};
}

export type HudPhase = 'pre' | 'live' | 'finish' | 'card';

export type HudToast =
	| {
			readonly kind: 'split';
			readonly length: number;
			readonly splitMs: number;
			readonly deltaMs: number | null;
			readonly opacity: number;
			/** Slide-in offset in reference pixels (negative = from the left). */
			readonly offsetX: number;
	  }
	| { readonly kind: 'pb'; readonly opacity: number };

export interface ShareHudFrame {
	readonly phase: HudPhase;
	readonly elapsedMs: number;
	readonly distanceM: number;
	/** Live segment speed; the dive average in `finish` and `card`; 0 before the dive. */
	readonly speedMs: number;
	/** Current length, 1-based (never `n/total`). */
	readonly length: number;
	readonly pb: { readonly targetM: number; readonly passed: boolean; readonly beyondM: number } | null;
	readonly toast: HudToast | null;
	readonly graph: SpeedGraphFrame;
	/** Result card opacity when it is showing. */
	readonly cardOpacity: number;
}

export interface FrameOptions {
	/** Recording time at which the result card starts fading in, or null for never. */
	readonly cardAtMs: number | null;
}

function clamp01(v: number): number {
	return Math.min(1, Math.max(0, v));
}

function splitToast(dive: ShareHudDive, atMs: number): HudToast | null {
	for (let i = dive.walls.length - 1; i >= 0; i--) {
		const wall = dive.walls[i];
		const since = atMs - wall.atMs;
		if (since < 0) continue;
		if (since > SPLIT_TOAST_HOLD_MS) return null;
		const fadeIn = clamp01(since / SPLIT_TOAST_IN_MS);
		const fadeOut = clamp01((SPLIT_TOAST_HOLD_MS - since) / SPLIT_TOAST_OUT_MS);
		return {
			kind: 'split',
			length: wall.length,
			splitMs: wall.splitMs,
			deltaMs: wall.deltaMs,
			opacity: Math.min(fadeIn, fadeOut),
			offsetX: (1 - fadeIn) * -40
		};
	}
	return null;
}

function pbToast(dive: ShareHudDive, atMs: number): HudToast | null {
	if (dive.pbCrossedAtMs === null) return null;
	const since = atMs - dive.pbCrossedAtMs;
	if (since < 0 || since > PB_TOAST_MS) return null;
	return { kind: 'pb', opacity: Math.min(clamp01(since / 200), clamp01((PB_TOAST_MS - since) / SPLIT_TOAST_OUT_MS)) };
}

export function shareHudFrame(dive: ShareHudDive, atMs: number, options: FrameOptions): ShareHudFrame {
	const { timeline, context } = dive;
	const pool = context.poolLengthM;
	const ended = atMs >= timeline.diveEndMs;
	const phase: HudPhase =
		options.cardAtMs !== null && atMs >= options.cardAtMs
			? 'card'
			: atMs < timeline.diveStartMs
				? 'pre'
				: ended
					? 'finish'
					: 'live';
	const t = Math.min(atMs, timeline.diveEndMs);
	const distanceM = ended ? dive.finalM : distanceOnSegments(dive.segments, t);
	const elapsedMs = Math.max(0, t - timeline.diveStartMs);
	const graph = speedGraphFrame(
		{
			segments: dive.segments,
			scale: dive.scale,
			poolLengthM: pool,
			firstLengthDirection: context.firstLengthDirection,
			pbBeforeM: context.pbBeforeM
		},
		atMs
	);
	const live = phase === 'live';
	const totalMs = timeline.diveEndMs - timeline.diveStartMs;
	// After the finish the speed line shows the dive average instead.
	const speedMs = live
		? graph.cursor?.speedMs ?? 0
		: phase === 'pre' || totalMs <= 0
			? 0
			: dive.finalM / (totalMs / 1000);
	const pbTarget = context.pbBeforeM;
	const pb =
		pbTarget !== null && pbTarget > 0
			? { targetM: pbTarget, passed: distanceM >= pbTarget, beyondM: distanceM - pbTarget }
			: null;
	const toast = live ? pbToast(dive, atMs) ?? splitToast(dive, atMs) : null;
	const cardOpacity = phase === 'card' && options.cardAtMs !== null ? clamp01((atMs - options.cardAtMs) / CARD_FADE_MS) : 0;

	return {
		phase,
		elapsedMs,
		distanceM,
		speedMs,
		length: Math.min(dive.lengths, Math.floor(distanceM / pool + 1e-9) + 1),
		pb,
		toast,
		graph,
		cardOpacity
	};
}

export interface ResultCardModel {
	readonly discipline: HudDiscipline;
	readonly finalM: number;
	readonly totalMs: number;
	readonly avgSpeedMs: number;
	/** `new` beat the PB by `deltaM`; `short` was `deltaM` short of it. */
	readonly pb: { readonly kind: 'new' | 'short'; readonly targetM: number; readonly deltaM: number } | null;
	readonly lengths: readonly CardLength[];
	readonly segments: readonly SpeedSegment[];
	readonly scale: SpeedScale;
	readonly poolLengthM: number;
	readonly footer: string;
}

export function resultCard(dive: ShareHudDive): ResultCardModel {
	const { timeline, context } = dive;
	const totalMs = Math.max(0, timeline.diveEndMs - timeline.diveStartMs);
	const target = context.pbBeforeM;
	const pb =
		target !== null && target > 0
			? dive.finalM > target + 1e-9
				? { kind: 'new' as const, targetM: target, deltaM: dive.finalM - target }
				: { kind: 'short' as const, targetM: target, deltaM: target - dive.finalM }
			: null;
	const footer = [context.athleteName, context.dateLabel, context.branding === 'subtle' ? 'overdive.app' : null]
		.filter((part): part is string => Boolean(part && part.trim()))
		.join(' · ');
	return {
		discipline: context.discipline,
		finalM: dive.finalM,
		totalMs,
		avgSpeedMs: totalMs > 0 ? dive.finalM / (totalMs / 1000) : 0,
		pb,
		lengths: cardLengths(dive.segments, context.poolLengthM),
		segments: dive.segments,
		scale: dive.scale,
		poolLengthM: context.poolLengthM,
		footer
	};
}
