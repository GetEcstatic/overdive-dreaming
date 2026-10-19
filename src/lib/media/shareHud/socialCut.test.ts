import { describe, expect, it } from 'vitest';
import { fixtureTimeline } from './fixtures';
import { prepareDive } from './model';
import {
  resolveProtocolEndMs,
  socialCutEditList,
  socialCutInputForDive,
  socialCutOutputAt,
  socialCutSourceAt,
  socialCutTicks,
  type SocialCutInput
} from './socialCut';

// The spec's worked example: 165 s dive, 3 turns, protocol done 10 s after surfacing.
const example: SocialCutInput = {
  diveStartMs: 10_000,
  diveEndMs: 175_000,
  wallsMs: [50_000, 95_000, 140_000],
  pbCrossedAtMs: null,
  recordingDurationMs: 200_000,
  timelineProtocolEndMs: 185_000
};

describe('socialCutEditList', () => {
  it('plays the start, every turn and the finish to the protocol end at 1×', () => {
    const edl = socialCutEditList(example);
    expect(edl.segments.filter((s) => s.speed === 1).map((s) => [s.kind, s.fromMs, s.toMs])).toEqual([
      ['start', 8_000, 13_000],
      ['turn', 48_500, 51_500],
      ['turn', 93_500, 96_500],
      ['turn', 138_500, 141_500],
      ['finish', 173_000, 185_000]
    ]);
    expect(edl.segments.filter((s) => s.kind === 'fast-forward').every((s) => s.speed === 12)).toBe(true);
    expect(edl.fastForwardFactor).toBe(12);
    // 26 s at 1×, 151 s at 12× (~12.6 s), 3 s card: about 42 s.
    expect(edl.outputDurationMs / 1000).toBeCloseTo(41.6, 1);
  });

  it('covers the source without gaps and lays segments end to end in the output', () => {
    const edl = socialCutEditList(example);
    edl.segments.forEach((s, i) => {
      if (i > 0) expect(s.fromMs).toBe(edl.segments[i - 1].toMs);
      if (i > 0) expect(s.outFromMs).toBeCloseTo(edl.segments[i - 1].outFromMs + (edl.segments[i - 1].toMs - edl.segments[i - 1].fromMs) / edl.segments[i - 1].speed);
    });
    expect(edl.segments[0].fromMs).toBe(8_000);
    expect(edl.segments.at(-1)?.toMs).toBe(185_000);
  });

  it('uses the smallest factor that fits the target', () => {
    const short = socialCutEditList({ ...example, diveEndMs: 60_000, wallsMs: [35_000], timelineProtocolEndMs: 70_000 });
    expect(short.fastForwardFactor).toBe(4);
    expect(short.outputDurationMs).toBeLessThanOrEqual(45_000);
  });

  it('keeps only the first turn, the turn before the PB and the last turn on long dives', () => {
    const walls = Array.from({ length: 12 }, (_, i) => 10_000 + (i + 1) * 21_000);
    const edl = socialCutEditList({
      ...example,
      diveEndMs: 280_000,
      wallsMs: walls,
      pbCrossedAtMs: 200_000,
      recordingDurationMs: 300_000,
      timelineProtocolEndMs: 290_000
    });
    const turns = edl.segments.filter((s) => s.kind === 'turn').map((s) => s.fromMs + 1_500);
    expect(turns).toEqual([31_000, 199_000, 262_000]);
  });

  it('jump-cuts the longest fast-forward stretches when 16× is not enough', () => {
    const edl = socialCutEditList({
      diveStartMs: 5_000,
      diveEndMs: 605_000,
      wallsMs: [300_000],
      pbCrossedAtMs: null,
      recordingDurationMs: 620_000,
      timelineProtocolEndMs: 615_000
    });
    expect(edl.fastForwardFactor).toBe(16);
    expect(edl.segments.some((s) => s.jumpIn)).toBe(true);
    expect(edl.outputDurationMs).toBeLessThanOrEqual(45_001);
    // Every fast-forward piece keeps some footage either side of the cut.
    edl.segments.filter((s) => s.kind === 'fast-forward').forEach((s) => expect(s.toMs - s.fromMs).toBeGreaterThan(1_000));
  });

  it('has no fast-forward when the dive is all 1× windows', () => {
    const edl = socialCutEditList({ ...example, diveEndMs: 14_000, wallsMs: [], timelineProtocolEndMs: 20_000 });
    expect(edl.fastForwardFactor).toBe(1);
    expect(edl.segments).toHaveLength(1);
    expect(edl.segments[0].kind).toBe('finish');
  });
});

describe('resolveProtocolEndMs', () => {
  it('prefers the override, then the recorder tap, then diveEnd + 15 s', () => {
    expect(resolveProtocolEndMs({ ...example, protocolEndOverrideMs: 190_000 })).toBe(190_000);
    expect(resolveProtocolEndMs(example)).toBe(185_000);
    expect(resolveProtocolEndMs({ ...example, timelineProtocolEndMs: null })).toBe(190_000);
  });

  it('clamps to the dive end and the recording', () => {
    expect(resolveProtocolEndMs({ ...example, protocolEndOverrideMs: 999_000 })).toBe(200_000);
    expect(resolveProtocolEndMs({ ...example, protocolEndOverrideMs: 1_000 })).toBe(175_000);
    expect(resolveProtocolEndMs({ ...example, timelineProtocolEndMs: null, recordingDurationMs: 180_000 })).toBe(180_000);
  });
});

describe('output ↔ source mapping', () => {
  const edl = socialCutEditList(example);

  it('maps output time through 1× and fast-forward segments', () => {
    expect(socialCutSourceAt(edl, 0).sourceMs).toBe(8_000);
    expect(socialCutSourceAt(edl, 4_000)).toMatchObject({ sourceMs: 12_000, speed: 1 });
    expect(socialCutSourceAt(edl, 6_000)).toMatchObject({ sourceMs: 13_000 + 1_000 * 12, speed: 12 });
  });

  it('holds the protocol end during the card', () => {
    const atCard = socialCutSourceAt(edl, edl.clipDurationMs + 500);
    expect(atCard.inCard).toBe(true);
    expect(atCard.sourceMs).toBe(185_500);
  });

  it('round-trips kept source times', () => {
    for (const sourceMs of [9_000, 30_000, 95_000, 180_000]) {
      expect(socialCutSourceAt(edl, socialCutOutputAt(edl, sourceMs)).sourceMs).toBeCloseTo(sourceMs, 6);
    }
  });

  it('emits HUD ticks with the card start once the clip ends', () => {
    const ticks = socialCutTicks(edl, 100);
    expect(ticks).toHaveLength(Math.ceil(edl.outputDurationMs / 100));
    expect(ticks[0]).toMatchObject({ outputMs: 0, sourceMs: 8_000, cardAtMs: null });
    expect(ticks.at(-1)?.cardAtMs).toBe(185_000);
  });
});

describe('socialCutInputForDive', () => {
  it('takes walls and the PB crossing from the prepared dive', () => {
    const dive = prepareDive(fixtureTimeline(), {
      poolLengthM: 50,
      discipline: 'DYN',
      pbBeforeM: 175,
      athleteName: null,
      dateLabel: null,
      branding: 'subtle',
      firstLengthDirection: 'ltr'
    });
    const input = socialCutInputForDive(dive, 198_000, null);
    expect(input.wallsMs).toEqual(dive.walls.map((w) => w.atMs));
    expect(input.pbCrossedAtMs).toBe(dive.pbCrossedAtMs);
    expect(socialCutEditList(input).outputDurationMs).toBeLessThanOrEqual(45_000);
  });
});
