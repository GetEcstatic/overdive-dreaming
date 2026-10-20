/**
 * Where the source video sits on the social cut's 1080×1920 canvas (plan
 * docs/video/social-cut-implementation.md §2, spec §4.2). Shared by the FFmpeg
 * worker and the in-app preview.
 *
 * - Portrait sources fill the canvas (scale to cover, centre crop).
 * - Landscape and square sources sit in a full-width band centred on the
 *   live HUD's clear band, on the deep-navy canvas. The band avoids every
 *   HUD element, so the diver is never covered.
 */

import { isPortraitCanvas, liveHudClearZone, type HudCanvas } from './layout';

export const SOCIAL_CANVAS: HudCanvas = { width: 1080, height: 1920 };
export const SOCIAL_BACKGROUND = '#0b1220';

export interface SocialVideoPlacement {
  readonly mode: 'cover' | 'band';
  /** Scale the (display-oriented) source to this size... */
  readonly scaleW: number;
  readonly scaleH: number;
  /** ...crop this window from the scaled frame... */
  readonly cropX: number;
  readonly cropY: number;
  readonly cropW: number;
  readonly cropH: number;
  /** ...and place it here on the canvas. */
  readonly x: number;
  readonly y: number;
}

function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

export function socialVideoPlacement(source: HudCanvas, canvas: HudCanvas = SOCIAL_CANVAS): SocialVideoPlacement {
  const sw = Math.max(1, source.width);
  const sh = Math.max(1, source.height);
  if (isPortraitCanvas({ width: sw, height: sh })) {
    const scale = Math.max(canvas.width / sw, canvas.height / sh);
    const scaleW = even(sw * scale);
    const scaleH = even(sh * scale);
    return {
      mode: 'cover',
      scaleW,
      scaleH,
      cropX: Math.round((scaleW - canvas.width) / 2),
      cropY: Math.round((scaleH - canvas.height) / 2),
      cropW: canvas.width,
      cropH: canvas.height,
      x: 0,
      y: 0
    };
  }
  const band = liveHudClearZone(canvas).band;
  const scaleW = even(canvas.width);
  const scaleH = even((sh / sw) * canvas.width);
  const cropH = Math.min(scaleH, even(band.h));
  return {
    mode: 'band',
    scaleW,
    scaleH,
    cropX: 0,
    cropY: Math.round((scaleH - cropH) / 2),
    cropW: scaleW,
    cropH,
    x: 0,
    y: even(band.y + (band.h - cropH) / 2)
  };
}

/** The video fields that decide how a clip is displayed (structural: app and worker types both fit). */
export interface DisplayFields {
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly displayOrientation?: 'landscape' | 'portrait-left' | 'portrait-right';
  readonly displayRotationDeg?: 0 | 90 | 180 | 270;
}

/** Rotation applied to show the clip upright (portrait clips stored sideways). */
export function displayRotationDeg(video: DisplayFields): 0 | 90 | 180 | 270 {
  if (video.displayOrientation === 'portrait-left') return video.displayRotationDeg ?? 90;
  if (video.displayOrientation === 'portrait-right') return video.displayRotationDeg ?? 270;
  return 0;
}

/** Size of the clip as displayed (after rotation), forced to the display orientation. */
export function displaySize(video: DisplayFields): HudCanvas {
  const w = video.widthPx && video.widthPx > 0 ? video.widthPx : 1280;
  const h = video.heightPx && video.heightPx > 0 ? video.heightPx : 720;
  const rotation = displayRotationDeg(video);
  const rotated = rotation === 90 || rotation === 270 ? { width: h, height: w } : { width: w, height: h };
  const portrait = video.displayOrientation === 'portrait-left' || video.displayOrientation === 'portrait-right';
  if (portrait === rotated.width > rotated.height) return { width: rotated.height, height: rotated.width };
  return rotated;
}
