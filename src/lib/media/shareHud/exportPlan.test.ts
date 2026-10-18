import { describe, expect, it } from 'vitest';
import { hudFullDurationSeconds, hudFullTicks } from './exportPlan';

describe('hudFullTicks', () => {
	it('covers the recording, then holds the card for 3 s', () => {
		const ticks = hudFullTicks(1_050);
		expect(ticks.slice(0, 11).every((t) => t.cardAtMs === null)).toBe(true);
		expect(ticks[10].atMs).toBe(1_000);
		expect(ticks[11]).toEqual({ atMs: 1_100, cardAtMs: 1_100 });
		expect(ticks).toHaveLength(11 + 30);
	});

	it('reports the output length', () => {
		expect(hudFullDurationSeconds(198_000)).toBeCloseTo(201, 6);
	});
});
