import { describe, expect, it } from 'vitest';
import { bracketPath, framingGuide } from './framingGuide';

describe('framingGuide', () => {
	it('maps the reel band straight through when the viewport matches the stream', () => {
		const g = framingGuide(1080, 1920, 1080, 1920, 'portrait');
		expect(g?.band).toEqual({ x: 0, y: 600, w: 1080, h: 630 });
		// The HUD's top and bottom covered areas remain visible throughout the dive.
		expect(g?.masks).toHaveLength(2);
	});

	it('scales a 9:16 stream into a 9:16 phone viewport', () => {
		const g = framingGuide(720, 1280, 360, 640, 'portrait');
		expect(g?.band.y).toBeCloseTo(200, 6);
		expect(g?.band.h).toBeCloseTo(210, 6);
	});

	it('accounts for the cover crop on a taller phone screen', () => {
		// 9:16 stream on a 390×844 viewport: scaled to 844 tall, 474.75 wide, 42.4 px cropped each side.
		const g = framingGuide(1080, 1920, 390, 844, 'portrait');
		const s = 844 / 1920;
		expect(g?.band).toEqual({ x: 0, y: 600 * s, w: 390, h: 630 * s });
		expect(g?.masks).toHaveLength(2);
		expect(g?.masks.every((m) => m.x === 0 && m.w === 390)).toBe(true);
	});

	it('keeps band and masks inside the viewport', () => {
		for (const [sw, sh, vw, vh, posture] of [
			[1080, 1920, 390, 844, 'portrait'],
			[1920, 1080, 844, 390, 'landscape'],
			[1440, 1080, 844, 390, 'landscape'],
			[1080, 1440, 390, 844, 'portrait']
		] as const) {
			const g = framingGuide(sw, sh, vw, vh, posture)!;
			for (const r of [g.band, ...g.masks]) {
				expect(r.x).toBeGreaterThanOrEqual(0);
				expect(r.y).toBeGreaterThanOrEqual(0);
				expect(r.x + r.w).toBeLessThanOrEqual(vw + 1e-9);
				expect(r.y + r.h).toBeLessThanOrEqual(vh + 1e-9);
			}
		}
	});

	it('uses the native landscape layout for a 16:9 landscape stream', () => {
		const g = framingGuide(1920, 1080, 1920, 1080, 'landscape');
		expect(g?.band.y).toBe(380);
		expect(g?.band.y! + g?.band.h!).toBe(722);
		// No Instagram action column on landscape exports.
		expect(g?.masks).toHaveLength(2);
	});

	it('handles a 4:3 landscape stream cropped by a wide viewport', () => {
		// 1440×1080 into 844×390: width-bound, scale 844/1440, 52.8 px cropped top and bottom.
		const g = framingGuide(1440, 1080, 844, 390, 'landscape');
		const s = 844 / 1440;
		const oy = (390 - 1080 * s) / 2;
		expect(g?.band.y).toBeCloseTo(oy + 380 * s, 6);
		expect(g?.band.h).toBeCloseTo(342 * s, 6);
	});

	it('hides the guide for a 16:9 stream with the phone upright (export rotates it)', () => {
		expect(framingGuide(1920, 1080, 390, 844, 'portrait')).toBeNull();
	});

	it('hides the guide until the stream and viewport have sizes', () => {
		expect(framingGuide(0, 0, 390, 844, 'portrait')).toBeNull();
		expect(framingGuide(1080, 1920, 0, 0, 'portrait')).toBeNull();
	});

	it('fills the viewport with the band when the crop shows only the middle', () => {
		// A portrait stream in a very wide viewport keeps only the centre (inside the band).
		const g = framingGuide(1080, 1920, 1600, 120, 'landscape');
		expect(g?.band).toEqual({ x: 0, y: 0, w: 1600, h: 120 });
		expect(g?.masks).toEqual([]);
	});
});

describe('bracketPath', () => {
	it('draws four corners inset from the band', () => {
		expect(bracketPath({ x: 0, y: 100, w: 400, h: 200 })).toBe(
			'M 6 134 V 106 H 34 M 366 106 H 394 V 134 M 394 266 V 294 H 366 M 34 294 H 6 V 266'
		);
	});

	it('shortens the arms on a small band', () => {
		expect(bracketPath({ x: 0, y: 0, w: 52, h: 52 })).toContain('M 6 16 V 6 H 16');
	});
});
