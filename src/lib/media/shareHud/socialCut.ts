import type { DiveTimeline } from '../../capture/timelineTypes';

export type SocialCutSegmentKind = 'start' | 'turn' | 'finish' | 'fast-forward';

export interface SocialCutSegment {
  readonly fromMs: number;
  readonly toMs: number;
  readonly speed: 1 | 4 | 6 | 8 | 12 | 16;
  readonly kind: SocialCutSegmentKind;
  readonly audio: 'original' | 'muted';
}

export interface SocialCutOptions {
  /** Full source duration, including the pre-dive and surface-protocol tail. */
  readonly recordingDurationMs: number;
  readonly protocolEndMs?: number;
  readonly targetMaxMs?: number;
  readonly cardDurationMs?: number;
  readonly fastForwardFactors?: readonly [4, 6, 8, 12, 16];
}

export interface SocialCutEditDecisionList {
  readonly segments: readonly SocialCutSegment[];
  readonly protocolEndMs: number;
  readonly cardDurationMs: number;
  readonly fastForwardFactor: 1 | 4 | 6 | 8 | 12 | 16;
  readonly outputDurationMs: number;
}

interface Window {
  fromMs: number;
  toMs: number;
  kind: Exclude<SocialCutSegmentKind, 'fast-forward'>;
}

const DEFAULT_FACTORS = [4, 6, 8, 12, 16] as const;
const DEFAULT_TARGET_MAX_MS = 45_000;
const DEFAULT_CARD_MS = 3_000;
const PROTOCOL_FALLBACK_MS = 15_000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mergeWindows(windows: Window[]): Window[] {
  return windows
    .filter((window) => window.toMs > window.fromMs)
    .sort((a, b) => a.fromMs - b.fromMs)
    .reduce<Window[]>((merged, current) => {
      const previous = merged[merged.length - 1];
      if (!previous || current.fromMs > previous.toMs) {
        merged.push({ ...current });
      } else {
        previous.toMs = Math.max(previous.toMs, current.toMs);
        if (previous.kind !== 'start' && current.kind === 'finish') previous.kind = 'finish';
      }
      return merged;
    }, []);
}

function normalDuration(windows: readonly Window[]): number {
  return windows.reduce((total, window) => total + window.toMs - window.fromMs, 0);
}

/** Keep the opening, closing and evenly spaced turn windows when normal time alone is too long. */
function fitNormalWindows(windows: Window[], budgetMs: number): Window[] {
  const maxFastForward = 16;
  const projectedDuration = (candidate: readonly Window[]): number => {
    const normal = normalDuration(candidate);
    const span = (candidate.at(-1)?.toMs ?? 0) - (candidate[0]?.fromMs ?? 0);
    return normal + Math.max(0, span - normal) / maxFastForward;
  };
  if (projectedDuration(windows) <= budgetMs || windows.length <= 2) return windows;
  const first = windows[0];
  const last = windows[windows.length - 1];
  const kept: Window[] = [first];
  for (const turn of windows.slice(1, -1)) {
    const candidate = [...kept, turn, last];
    if (projectedDuration(candidate) > budgetMs) break;
    kept.push(turn);
  }
  kept.push(last);
  return kept.sort((a, b) => a.fromMs - b.fromMs);
}

function protocolEnd(timeline: DiveTimeline, options: SocialCutOptions): number {
  const duration = Math.max(0, options.recordingDurationMs);
  const fallback = Math.min(duration, Math.max(timeline.diveEndMs, 0) + PROTOCOL_FALLBACK_MS);
  return clamp(options.protocolEndMs ?? timeline.protocolEndMs ?? fallback, timeline.diveEndMs, duration);
}

/** Build the Reel edit list without touching video, audio or browser APIs. */
export function socialCutEditList(
  timeline: DiveTimeline,
  options: SocialCutOptions
): SocialCutEditDecisionList {
  const duration = Math.max(0, options.recordingDurationMs);
  const cardDurationMs = Math.max(0, options.cardDurationMs ?? DEFAULT_CARD_MS);
  const targetMaxMs = Math.max(cardDurationMs, options.targetMaxMs ?? DEFAULT_TARGET_MAX_MS);
  const endMs = protocolEnd(timeline, options);
  const startMs = clamp(Math.max(0, timeline.diveStartMs - 2_000), 0, endMs);
  const windows: Window[] = [
    { fromMs: startMs, toMs: Math.min(endMs, timeline.diveStartMs + 3_000), kind: 'start' },
    ...timeline.laps.map((lap) => ({
      fromMs: Math.max(startMs, lap.atMs - 1_500),
      toMs: Math.min(endMs, lap.atMs + 1_500),
      kind: 'turn' as const
    })),
    { fromMs: Math.max(startMs, timeline.diveEndMs - 2_000), toMs: endMs, kind: 'finish' }
  ];
  const merged = mergeWindows(windows);
  const fitted = fitNormalWindows(merged, Math.max(0, targetMaxMs - cardDurationMs));
  const factors = options.fastForwardFactors ?? DEFAULT_FACTORS;
  const gapsMs = Math.max(0, (fitted[fitted.length - 1]?.toMs ?? endMs) - startMs - normalDuration(fitted));
  const normalMs = normalDuration(fitted);
  const factor = factors.find((candidate) => normalMs + gapsMs / candidate + cardDurationMs <= targetMaxMs) ?? factors[factors.length - 1];
  const segments: SocialCutSegment[] = [];
  let cursor = startMs;
  for (const window of fitted) {
    if (window.fromMs > cursor) {
      segments.push({ fromMs: cursor, toMs: window.fromMs, speed: factor, kind: 'fast-forward', audio: 'muted' });
    }
    segments.push({ fromMs: window.fromMs, toMs: window.toMs, speed: 1, kind: window.kind, audio: 'original' });
    cursor = window.toMs;
  }
  if (cursor < endMs) {
    segments.push({ fromMs: cursor, toMs: endMs, speed: factor, kind: 'fast-forward', audio: 'muted' });
  }
  const outputDurationMs = segments.reduce(
    (total, segment) => total + (segment.toMs - segment.fromMs) / segment.speed,
    cardDurationMs
  );
  return {
    segments,
    protocolEndMs: endMs,
    cardDurationMs,
    fastForwardFactor: factor,
    outputDurationMs: Math.round(outputDurationMs)
  };
}
