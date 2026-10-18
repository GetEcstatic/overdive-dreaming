import { describe, expect, it } from 'vitest';
import { evenPx, scaleToShortEdge } from './exportDimensions';

describe('scaleToShortEdge', () => {
	it('scales landscape by height', () => {
		expect(scaleToShortEdge({ width: 1280, height: 720 }, 1080)).toEqual({ width: 1920, height: 1080 });
	});

	it('scales portrait by width, so portrait exports reach Reels resolution', () => {
		expect(scaleToShortEdge({ width: 720, height: 1280 }, 1080)).toEqual({ width: 1080, height: 1920 });
		// The audit clip: 464×848 used to export at 590×1080.
		expect(scaleToShortEdge({ width: 464, height: 848 }, 1080)).toEqual({ width: 1080, height: 1974 });
	});

	it('keeps square sources square', () => {
		expect(scaleToShortEdge({ width: 500, height: 500 }, 1080)).toEqual({ width: 1080, height: 1080 });
	});
});

describe('evenPx', () => {
	it('rounds to an even size of at least 2', () => {
		expect(evenPx(591.4)).toBe(590);
		expect(evenPx(1)).toBe(2);
		expect(evenPx(1081)).toBe(1080);
	});
});
