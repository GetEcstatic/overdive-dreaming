import { describe, expect, it } from 'vitest';
import { fixtureTimeline, FIXTURE_PB_M, FIXTURE_POOL_M, FIXTURE_RECORDING_MS } from './fixtures';
import { geometry, layoutLiveHud, layoutResultCard, REEL_SAFE, type HudCanvas } from './layout';
import { prepareDive, resultCard, shareHudFrame, type ShareHudContext } from './model';
import type { HudPrimitive } from './svg';

const context: ShareHudContext = {
	poolLengthM: FIXTURE_POOL_M,
	discipline: 'DYN',
	pbBeforeM: FIXTURE_PB_M,
	athleteName: 'Test Diver',
	dateLabel: '17 Oct 2026',
	branding: 'subtle',
	firstLengthDirection: 'ltr'
};
const REEL: HudCanvas = { width: 1080, height: 1920 };

interface Box {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}

/** Rough bounds; text width is estimated at 0.5 em per character (condensed face). */
function bounds(p: HudPrimitive): Box[] {
	switch (p.kind) {
		case 'rect':
			return [{ x0: p.x, y0: p.y, x1: p.x + p.w, y1: p.y + p.h }];
		case 'circle':
			return [{ x0: p.cx - p.r, y0: p.cy - p.r, x1: p.cx + p.r, y1: p.cy + p.r }];
		case 'line':
			return [{ x0: Math.min(p.x1, p.x2), y0: Math.min(p.y1, p.y2), x1: Math.max(p.x1, p.x2), y1: Math.max(p.y1, p.y2) }];
		case 'text': {
			const w = p.text.length * p.size * 0.5 + (p.tracking ?? 0) * p.text.length;
			const x0 = p.anchor === 'end' ? p.x - w : p.anchor === 'middle' ? p.x - w / 2 : p.x;
			return [{ x0, y0: p.y - p.size * 0.72, x1: x0 + w, y1: p.y + p.size * 0.2 }];
		}
		case 'path': {
			const nums = (p.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
			if (!/^M [\d.-]+ [\d.-]+( L [\d.-]+ [\d.-]+)*( Z)?$/.test(p.d.replace(/\s+/g, ' ').trim())) return [];
			const xs = nums.filter((_, i) => i % 2 === 0);
			const ys = nums.filter((_, i) => i % 2 === 1);
			return [{ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }];
		}
		case 'group':
			// Mirrored ghost stays inside the graph box; transforms other than the flip are not used here.
			return p.children.flatMap(bounds);
	}
}

/** Live elements, excluding the full-width scrims (backgrounds, allowed anywhere). */
function liveBoxes(atMs: number): Box[] {
	const dive = prepareDive(fixtureTimeline(), context);
	const prims = layoutLiveHud(dive, shareHudFrame(dive, atMs, { cardAtMs: null }), REEL);
	return prims.filter((p) => !(p.kind === 'rect' && p.w >= 1080)).flatMap(bounds);
}

describe('reel layout safe zones', () => {
	const samples = Array.from({ length: Math.ceil(FIXTURE_RECORDING_MS / 500) }, (_, i) => i * 500);

	it('keeps every live element inside the Instagram safe area for the whole dive', () => {
		for (const atMs of samples) {
			for (const b of liveBoxes(atMs)) {
				const where = `${atMs} ms ${JSON.stringify(b)}`;
				expect(b.y0, where).toBeGreaterThanOrEqual(REEL_SAFE.top);
				expect(b.y1, where).toBeLessThanOrEqual(REEL_SAFE.bottom);
				expect(b.x0, where).toBeGreaterThanOrEqual(REEL_SAFE.side - 1);
				expect(b.x1, where).toBeLessThanOrEqual(1080 - REEL_SAFE.side + 1);
				if (b.y1 > REEL_SAFE.actionColumnTopY) expect(b.x1, where).toBeLessThanOrEqual(REEL_SAFE.actionColumnX);
			}
		}
	});

	it('leaves the diver band (y 600–1230) clear', () => {
		for (const atMs of samples) {
			for (const b of liveBoxes(atMs)) {
				expect(b.y1 <= 600 || b.y0 >= 1230, `${atMs} ms ${JSON.stringify(b)}`).toBe(true);
			}
		}
	});
});

describe('layout geometry', () => {
	it('pins the graph to the bottom on taller portrait canvases', () => {
		expect(geometry({ width: 1080, height: 1974 }).graph.base - geometry(REEL).graph.base).toBeCloseTo(54, 6);
	});

	it('scales landscape canvases from a 1080 short edge', () => {
		const g = geometry({ width: 3840, height: 2160 });
		expect(g.portrait).toBe(false);
		expect(g.scale).toBe(2);
		expect(g.rh).toBe(1080);
	});

	it('keeps the clock at a fixed x so digits never shift', () => {
		const dive = prepareDive(fixtureTimeline(), context);
		const clockX = (atMs: number) => {
			const prims = layoutLiveHud(dive, shareHudFrame(dive, atMs, { cardAtMs: null }), REEL);
			const clock = prims.find((p) => p.kind === 'text' && /^\d+(:\d\d)?\.\d$/.test(p.text));
			return clock?.kind === 'text' ? [clock.x, clock.anchor ?? 'start'] : null;
		};
		expect(clockX(40_000)).toEqual([70, 'start']);
		expect(clockX(120_000)).toEqual([70, 'start']);
	});

	it('omits branding when it is off', () => {
		const dive = prepareDive(fixtureTimeline(), { ...context, branding: 'off' });
		const texts = JSON.stringify(layoutLiveHud(dive, shareHudFrame(dive, 40_000, { cardAtMs: null }), REEL));
		expect(texts).not.toContain('OVERDIVE');
		const card = JSON.stringify(layoutResultCard(resultCard(dive), null, REEL));
		expect(card).not.toContain('overdive.app');
	});
});
