import { describe, expect, it } from 'vitest';
import { socialCutEditList } from './socialCut';

const timeline = {
  diveStartMs: 10_000,
  diveEndMs: 175_000,
  protocolEndMs: 185_000,
  laps: [
    { lapNumber: 1, atMs: 50_000, cumulativeDistanceM: 25, splitMs: 40_000 },
    { lapNumber: 2, atMs: 95_000, cumulativeDistanceM: 50, splitMs: 45_000 },
    { lapNumber: 3, atMs: 140_000, cumulativeDistanceM: 75, splitMs: 45_000 }
  ]
};

describe('socialCutEditList', () => {
  it('keeps the start, turns and finish at real speed', () => {
    const edit = socialCutEditList(timeline, { recordingDurationMs: 200_000 });
    expect(edit.segments.filter((segment) => segment.speed === 1).map((segment) => segment.kind)).toEqual([
      'start',
      'turn',
      'turn',
      'turn',
      'finish'
    ]);
    expect(edit.segments.some((segment) => segment.kind === 'fast-forward' && segment.audio === 'muted')).toBe(true);
    expect(edit.protocolEndMs).toBe(185_000);
    expect(edit.outputDurationMs).toBeLessThanOrEqual(45_000);
  });

  it('uses the recorded protocol end and appends the card after it', () => {
    const edit = socialCutEditList(timeline, { recordingDurationMs: 200_000, cardDurationMs: 3_000 });
    const lastSourceSegment = edit.segments.at(-1)!;
    expect(lastSourceSegment.toMs).toBe(185_000);
    expect(edit.outputDurationMs).toBeGreaterThan(3_000);
  });

  it('falls back to at most fifteen seconds after the dive when SP was not marked', () => {
    const edit = socialCutEditList({ ...timeline, protocolEndMs: undefined }, { recordingDurationMs: 200_000 });
    expect(edit.protocolEndMs).toBe(190_000);
  });

  it('honours a draggable protocol-end override and clamps it to the source', () => {
    const edit = socialCutEditList(timeline, { recordingDurationMs: 180_000, protocolEndMs: 999_000 });
    expect(edit.protocolEndMs).toBe(180_000);
    expect(edit.segments.at(-1)?.toMs).toBe(180_000);
  });

  it('does not exceed the fast-forward cap', () => {
    const edit = socialCutEditList(
      { ...timeline, laps: Array.from({ length: 30 }, (_, index) => ({
        lapNumber: index + 1,
        atMs: 10_000 + index * 6_000,
        cumulativeDistanceM: (index + 1) * 12.5,
        splitMs: 6_000
      })) },
      { recordingDurationMs: 220_000 }
    );
    expect(edit.fastForwardFactor).toBeLessThanOrEqual(16);
    expect(edit.outputDurationMs).toBeLessThanOrEqual(45_000);
  });
});
