/**
 * Recorder framing guide (docs/video/share-hud-redesign.md §4.9.2).
 *
 * Maps the share HUD's clear band, defined on the recorded frame, into the
 * viewfinder. The viewfinder shows the stream with `object-fit: cover`, so it
 * is itself cropped: the zones have to come from the recorded frame, not the
 * screen. Pure: plain numbers in, rectangles in viewport CSS pixels out.
 */

import { liveHudClearZone, type HudRect } from '$lib/media/shareHud';

export type FramingPosture = 'portrait' | 'landscape';

export interface FramingGuide {
	/** Areas the HUD (or Instagram's UI) will cover, clipped to the viewport. */
	readonly masks: readonly HudRect[];
	/** Where to keep the diver, clipped to the viewport. */
	readonly band: HudRect;
}

/** Smallest band height (CSS px) worth drawing brackets around. */
const MIN_BAND_PX = 24;

function clip(r: HudRect, w: number, h: number): HudRect | null {
	const x0 = Math.max(0, r.x);
	const y0 = Math.max(0, r.y);
	const x1 = Math.min(w, r.x + r.w);
	const y1 = Math.min(h, r.y + r.h);
	return x1 - x0 > 0.5 && y1 - y0 > 0.5 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/**
 * `null` when there's nothing trustworthy to draw: no stream or viewport size
 * yet, or a landscape stream filmed with the phone upright. The player rotates
 * that clip into portrait (`decideDisplayOrientation`), so the export's HUD
 * would not line up with what the viewfinder shows.
 */
export function framingGuide(
	streamW: number,
	streamH: number,
	viewportW: number,
	viewportH: number,
	posture: FramingPosture
): FramingGuide | null {
	if (!(streamW > 0 && streamH > 0 && viewportW > 0 && viewportH > 0)) return null;
	if (streamW >= streamH && posture === 'portrait') return null;

	const zone = liveHudClearZone({ width: streamW, height: streamH });
	const s = Math.max(viewportW / streamW, viewportH / streamH);
	const ox = (viewportW - streamW * s) / 2;
	const oy = (viewportH - streamH * s) / 2;
	const toViewport = (r: HudRect): HudRect => ({ x: ox + r.x * s, y: oy + r.y * s, w: r.w * s, h: r.h * s });

	const band = clip(toViewport(zone.band), viewportW, viewportH);
	if (!band || band.h < MIN_BAND_PX) return null;
	const masks = zone.covered.map((r) => clip(toViewport(r), viewportW, viewportH)).filter((r): r is HudRect => r !== null);
	return { masks, band };
}

/** SVG path for corner brackets just inside the band (open L shapes, no edges). */
export function bracketPath(band: HudRect, inset = 6, maxArm = 28): string {
	const x0 = band.x + inset;
	const y0 = band.y + inset;
	const x1 = band.x + band.w - inset;
	const y1 = band.y + band.h - inset;
	const a = Math.max(0, Math.min(maxArm, (x1 - x0) / 4, (y1 - y0) / 4));
	const f = (v: number) => (Number.isInteger(v) ? `${v}` : v.toFixed(1));
	return [
		`M ${f(x0)} ${f(y0 + a)} V ${f(y0)} H ${f(x0 + a)}`,
		`M ${f(x1 - a)} ${f(y0)} H ${f(x1)} V ${f(y0 + a)}`,
		`M ${f(x1)} ${f(y1 - a)} V ${f(y1)} H ${f(x1 - a)}`,
		`M ${f(x0 + a)} ${f(y1)} H ${f(x0)} V ${f(y1 - a)}`
	].join(' ');
}
