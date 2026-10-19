import { describe, expect, it } from 'vitest';
import { fixtureTimeline, FIXTURE_PB_M, FIXTURE_POOL_M } from './fixtures';
import { socialCutFrameSvg } from './index';
import { prepareDive } from './model';
import { socialVideoPlacement } from './socialCanvas';

describe('socialVideoPlacement', () => {
  it('covers the canvas with a portrait source, centre-cropped', () => {
    const p = socialVideoPlacement({ width: 1080, height: 1974 });
    expect(p).toMatchObject({ mode: 'cover', scaleW: 1080, scaleH: 1974, cropX: 0, cropY: 27, cropW: 1080, cropH: 1920, x: 0, y: 0 });
  });

  it('scales up small portrait sources', () => {
    const p = socialVideoPlacement({ width: 720, height: 1280 });
    expect(p).toMatchObject({ mode: 'cover', scaleW: 1080, scaleH: 1920, cropY: 0 });
  });

  it('puts a 16:9 landscape source in the clear band', () => {
    const p = socialVideoPlacement({ width: 1920, height: 1080 });
    expect(p).toMatchObject({ mode: 'band', scaleW: 1080, scaleH: 608, cropY: 0, cropH: 608 });
    expect(p.y).toBeGreaterThanOrEqual(600);
    expect(p.y + p.cropH).toBeLessThanOrEqual(1230);
  });

  it('crops 4:3 and square sources to the band height', () => {
    for (const source of [{ width: 1440, height: 1080 }, { width: 1080, height: 1080 }]) {
      const p = socialVideoPlacement(source);
      expect(p.mode).toBe('band');
      expect(p.cropH).toBe(630);
      expect(p.cropY).toBe(Math.round((p.scaleH - 630) / 2));
      expect(p.y).toBe(600);
    }
  });

  it('keeps every size even for yuv420p', () => {
    for (const source of [{ width: 1279, height: 721 }, { width: 721, height: 1279 }]) {
      const p = socialVideoPlacement(source);
      for (const v of [p.scaleW, p.scaleH, p.cropW, p.cropH, p.y]) expect(v % 2).toBe(0);
    }
  });
});

describe('socialCutFrameSvg', () => {
  const dive = prepareDive(fixtureTimeline(), {
    poolLengthM: FIXTURE_POOL_M,
    discipline: 'DYN',
    pbBeforeM: FIXTURE_PB_M,
    athleteName: null,
    dateLabel: null,
    branding: 'subtle',
    firstLengthDirection: 'ltr'
  });
  const canvas = { width: 1080, height: 1920 };

  it('shows the hook before GO and the badge while fast-forwarding', () => {
    expect(socialCutFrameSvg(dive, { outputMs: 0, sourceMs: 13_000, speed: 1, cardAtMs: null }, canvas, { hook: true })).toContain('PB ATTEMPT');
    expect(socialCutFrameSvg(dive, { outputMs: 0, sourceMs: 13_000, speed: 1, cardAtMs: null }, canvas, { hook: false })).not.toContain('PB ATTEMPT');
    expect(socialCutFrameSvg(dive, { outputMs: 9_000, sourceMs: 60_000, speed: 12, cardAtMs: null }, canvas, { hook: true })).toContain('12×');
  });

  it('never shows the hook once the dive is under way', () => {
    expect(socialCutFrameSvg(dive, { outputMs: 1_000, sourceMs: 16_000, speed: 1, cardAtMs: null }, canvas, { hook: true })).not.toContain('PB ATTEMPT');
  });

  it('draws the result card without extras during the card', () => {
    const svg = socialCutFrameSvg(dive, { outputMs: 40_000, sourceMs: 191_000, speed: 1, cardAtMs: 190_000 }, canvas, { hook: true });
    expect(svg).toContain('METRES');
    expect(svg).not.toContain('×</text>');
  });
});
