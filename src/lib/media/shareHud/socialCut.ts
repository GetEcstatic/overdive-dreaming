/**
 * Social cut edit decision list (plan docs/video/social-cut-implementation.md
 * §3, spec share-hud-redesign.md §4.2.1): which parts of the recording play at
 * 1×, which are fast-forwarded, and where the result card goes. Pure: the
 * worker renders it with FFmpeg and the share sheet previews it in the browser.
 */

import type { ShareHudDive } from './model';

export type SocialCutSegmentKind = 'start' | 'turn' | 'finish' | 'fast-forward';

export const SOCIAL_CUT_FACTORS = [4, 6, 8, 12, 16] as const;
export type SocialCutSpeed = 1 | (typeof SOCIAL_CUT_FACTORS)[number];

export const SOCIAL_CUT_TARGET_MS = 45_000;
export const SOCIAL_CUT_CARD_MS = 3_000;
/** AIDA's surface protocol window; the default protocol end when none was marked. */
export const PROTOCOL_FALLBACK_MS = 15_000;
/** Above this (1× pieces plus card), only the key turns keep their 1× windows. */
export const LONG_DIVE_ONE_X_MS = 33_000;
/** The PB hook shows over the first 1.5 s of the cut (spec §4.6) and fades out over its last 400 ms. */
export const HOOK_MS = 1_500;
const HOOK_FADE_MS = 400;

export function hookOpacity(outputMs: number): number {
  if (outputMs < 0 || outputMs >= HOOK_MS) return 0;
  return Math.min(1, (HOOK_MS - outputMs) / HOOK_FADE_MS);
}

/** Fast-forward kept either side of a jump cut, in source time. */
const JUMP_KEEP_MS = 2_000;

export interface SocialCutSegment {
  readonly fromMs: number;
  readonly toMs: number;
  readonly speed: SocialCutSpeed;
  readonly kind: SocialCutSegmentKind;
  /** Where the segment starts in the output. */
  readonly outFromMs: number;
  /** The segment starts straight after a jump cut (source time skipped). */
  readonly jumpIn: boolean;
}

export interface SocialCutInput {
  readonly diveStartMs: number;
  readonly diveEndMs: number;
  /** Wall touches (end of each full pool length), source time. */
  readonly wallsMs: readonly number[];
  /** When the diver passed the previous PB, or null. */
  readonly pbCrossedAtMs: number | null;
  /** Length of the source recording. */
  readonly recordingDurationMs: number;
  /** Protocol done tap from the recorder. */
  readonly timelineProtocolEndMs?: number | null;
  /** The user's override from the share sheet. */
  readonly protocolEndOverrideMs?: number | null;
}

export interface SocialCutOptions {
  readonly targetMaxMs?: number;
  readonly cardDurationMs?: number;
}

export interface SocialCutEditDecisionList {
  readonly segments: readonly SocialCutSegment[];
  readonly protocolEndMs: number;
  readonly cardDurationMs: number;
  /** Fast-forward factor for the whole cut, or 1 if nothing is fast-forwarded. */
  readonly fastForwardFactor: SocialCutSpeed;
  /** Output time where the clip ends and the card hold starts. */
  readonly clipDurationMs: number;
  readonly outputDurationMs: number;
}

interface Window {
  fromMs: number;
  toMs: number;
  kind: Exclude<SocialCutSegmentKind, 'fast-forward'>;
}

interface Piece {
  readonly fromMs: number;
  readonly toMs: number;
  readonly speed: SocialCutSpeed;
  readonly kind: SocialCutSegmentKind;
  readonly jumpIn: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Override, then the recorder's Protocol done tap, then `diveEnd + 15 s`; always inside the recording. */
export function resolveProtocolEndMs(input: SocialCutInput): number {
  const duration = Math.max(input.diveEndMs, input.recordingDurationMs);
  const fallback = Math.min(duration, input.diveEndMs + PROTOCOL_FALLBACK_MS);
  const chosen = input.protocolEndOverrideMs ?? input.timelineProtocolEndMs ?? fallback;
  return clamp(chosen, input.diveEndMs, duration);
}

/** The edit input for a prepared HUD dive. */
export function socialCutInputForDive(
  dive: ShareHudDive,
  recordingDurationMs: number,
  protocolEndOverrideMs?: number | null
): SocialCutInput {
  return {
    diveStartMs: dive.timeline.diveStartMs,
    diveEndMs: dive.timeline.diveEndMs,
    wallsMs: dive.walls.map((wall) => wall.atMs),
    pbCrossedAtMs: dive.pbCrossedAtMs,
    recordingDurationMs,
    timelineProtocolEndMs: dive.timeline.protocolEndMs ?? null,
    protocolEndOverrideMs: protocolEndOverrideMs ?? null
  };
}

const KIND_RANK: Record<Window['kind'], number> = { turn: 0, start: 1, finish: 2 };

function mergeWindows(windows: readonly Window[]): Window[] {
  return windows
    .filter((window) => window.toMs > window.fromMs)
    .slice()
    .sort((a, b) => a.fromMs - b.fromMs)
    .reduce<Window[]>((merged, current) => {
      const previous = merged[merged.length - 1];
      if (!previous || current.fromMs > previous.toMs) {
        merged.push({ ...current });
      } else {
        previous.toMs = Math.max(previous.toMs, current.toMs);
        if (KIND_RANK[current.kind] > KIND_RANK[previous.kind]) previous.kind = current.kind;
      }
      return merged;
    }, []);
}

function totalMs(windows: readonly { fromMs: number; toMs: number }[]): number {
  return windows.reduce((sum, w) => sum + w.toMs - w.fromMs, 0);
}

/** First turn, the last turn before the PB crossing, and the last turn (spec §4.2.1, long dives). */
function keyTurns(wallsMs: readonly number[], pbCrossedAtMs: number | null): number[] {
  if (wallsMs.length <= 2) return [...wallsMs];
  const beforePb = pbCrossedAtMs === null ? [] : wallsMs.filter((at) => at < pbCrossedAtMs);
  const picked = new Set([wallsMs[0], beforePb[beforePb.length - 1], wallsMs[wallsMs.length - 1]]);
  return wallsMs.filter((at) => picked.has(at));
}

/** Split fast-forward gaps around their middle to remove `removeMs` of source in total, longest gaps first. */
function jumpCut(gaps: readonly Piece[], removeMs: number): Piece[] {
  const removable = gaps.map((gap) => Math.max(0, gap.toMs - gap.fromMs - 2 * JUMP_KEEP_MS));
  const available = removable.reduce((a, b) => a + b, 0);
  if (available <= 0 || removeMs <= 0) return [...gaps];
  // Fill from the longest down: every gap is trimmed to a common "kept" length.
  const order = removable.map((r, i) => ({ r, i })).sort((a, b) => b.r - a.r);
  let need = Math.min(removeMs, available);
  const cut = new Array<number>(gaps.length).fill(0);
  for (let k = 0; k < order.length && need > 0; k++) {
    const next = order[k + 1]?.r ?? 0;
    const level = order[k].r - next;
    const take = Math.min(need, level * (k + 1));
    for (let j = 0; j <= k; j++) cut[order[j].i] += take / (k + 1);
    need -= take;
  }
  return gaps.flatMap((gap, i): Piece[] => {
    const r = cut[i];
    if (r < 1) return [gap];
    const mid = (gap.fromMs + gap.toMs) / 2;
    return [
      { ...gap, toMs: mid - r / 2 },
      { ...gap, fromMs: mid + r / 2, jumpIn: true }
    ];
  });
}

function outputLength(pieces: readonly Piece[]): number {
  return pieces.reduce((sum, p) => sum + (p.toMs - p.fromMs) / p.speed, 0);
}

/** Build the social cut's edit decision list. */
export function socialCutEditList(input: SocialCutInput, options: SocialCutOptions = {}): SocialCutEditDecisionList {
  const cardDurationMs = Math.max(0, options.cardDurationMs ?? SOCIAL_CUT_CARD_MS);
  const targetMaxMs = Math.max(cardDurationMs, options.targetMaxMs ?? SOCIAL_CUT_TARGET_MS);
  const endMs = resolveProtocolEndMs(input);
  const startMs = clamp(input.diveStartMs - 2_000, 0, endMs);
  const inRange = (at: number) => at > startMs && at < endMs;
  const walls = input.wallsMs.filter(inRange);
  const windowsFor = (turns: readonly number[]): Window[] =>
    mergeWindows([
      { fromMs: startMs, toMs: Math.min(endMs, input.diveStartMs + 3_000), kind: 'start' },
      ...turns.map((at) => ({ fromMs: Math.max(startMs, at - 1_500), toMs: Math.min(endMs, at + 1_500), kind: 'turn' as const })),
      { fromMs: clamp(input.diveEndMs - 2_000, startMs, endMs), toMs: endMs, kind: 'finish' }
    ]);
  let windows = windowsFor(walls);
  if (totalMs(windows) + cardDurationMs > LONG_DIVE_ONE_X_MS) windows = windowsFor(keyTurns(walls, input.pbCrossedAtMs));

  const gaps: Piece[] = [];
  let cursor = startMs;
  for (const window of windows) {
    if (window.fromMs > cursor) gaps.push({ fromMs: cursor, toMs: window.fromMs, speed: 1, kind: 'fast-forward', jumpIn: false });
    cursor = window.toMs;
  }
  const oneXMs = totalMs(windows);
  const gapMs = totalMs(gaps);
  const factor: SocialCutSpeed =
    gapMs === 0
      ? 1
      : SOCIAL_CUT_FACTORS.find((f) => oneXMs + gapMs / f + cardDurationMs <= targetMaxMs) ?? 16;
  let ffPieces: Piece[] = gaps.map((gap) => ({ ...gap, speed: factor }));
  if (factor === 16) {
    const excessMs = oneXMs + gapMs / 16 + cardDurationMs - targetMaxMs;
    if (excessMs > 0) ffPieces = jumpCut(ffPieces, excessMs * 16);
  }

  const pieces: Piece[] = [
    ...windows.map((w): Piece => ({ fromMs: w.fromMs, toMs: w.toMs, speed: 1, kind: w.kind, jumpIn: false })),
    ...ffPieces
  ].sort((a, b) => a.fromMs - b.fromMs);
  let outMs = 0;
  const segments = pieces.map((piece): SocialCutSegment => {
    const segment = { ...piece, outFromMs: outMs };
    outMs += (piece.toMs - piece.fromMs) / piece.speed;
    return segment;
  });
  const clipDurationMs = outputLength(pieces);
  return {
    segments,
    protocolEndMs: endMs,
    cardDurationMs,
    fastForwardFactor: factor,
    clipDurationMs,
    outputDurationMs: clipDurationMs + cardDurationMs
  };
}

export interface SocialCutPosition {
  /** Source time to show (the protocol end during the card, plus the card's elapsed time). */
  readonly sourceMs: number;
  readonly segmentIndex: number;
  readonly speed: SocialCutSpeed;
  readonly inCard: boolean;
}

/** Output time → source time. */
export function socialCutSourceAt(edl: SocialCutEditDecisionList, outputMs: number): SocialCutPosition {
  const segments = edl.segments;
  if (outputMs >= edl.clipDurationMs || segments.length === 0) {
    return {
      sourceMs: edl.protocolEndMs + Math.max(0, outputMs - edl.clipDurationMs),
      segmentIndex: segments.length - 1,
      speed: 1,
      inCard: true
    };
  }
  let index = 0;
  while (index < segments.length - 1 && segments[index + 1].outFromMs <= outputMs) index++;
  const segment = segments[index];
  const sourceMs = Math.min(segment.toMs, segment.fromMs + Math.max(0, outputMs - segment.outFromMs) * segment.speed);
  return { sourceMs, segmentIndex: index, speed: segment.speed, inCard: false };
}

/** Source time → output time (the nearest kept moment when the source time was cut). */
export function socialCutOutputAt(edl: SocialCutEditDecisionList, sourceMs: number): number {
  for (const segment of edl.segments) {
    if (sourceMs < segment.fromMs) return segment.outFromMs;
    if (sourceMs <= segment.toMs) return segment.outFromMs + (sourceMs - segment.fromMs) / segment.speed;
  }
  return edl.clipDurationMs;
}

export interface SocialCutTick {
  readonly outputMs: number;
  readonly sourceMs: number;
  readonly speed: SocialCutSpeed;
  /** Source time the card starts at, or null before the card. */
  readonly cardAtMs: number | null;
}

/** One HUD tick per `tickMs` of output, including the card hold. */
export function socialCutTicks(edl: SocialCutEditDecisionList, tickMs: number): SocialCutTick[] {
  const count = Math.max(1, Math.ceil(edl.outputDurationMs / tickMs));
  return Array.from({ length: count }, (_, i) => {
    const outputMs = i * tickMs;
    const position = socialCutSourceAt(edl, outputMs);
    return {
      outputMs,
      sourceMs: position.sourceMs,
      speed: position.speed,
      cardAtMs: position.inCard ? edl.protocolEndMs : null
    };
  });
}
