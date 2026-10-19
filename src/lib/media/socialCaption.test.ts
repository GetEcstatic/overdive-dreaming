import { describe, expect, it } from 'vitest';
import { socialCaption } from './socialCaption';

describe('socialCaption', () => {
	it('leads with the result and a new PB', () => {
		expect(socialCaption({ discipline: 'DYN', finalM: 190, totalMs: 165_000, pb: { kind: 'new', deltaM: 15 } })).toBe(
			'190 m DYN · 2:45.0 · new PB (+15 m)\nTracked with overdive.app\n#freediving #apnea #dynamicapnea'
		);
	});

	it('does not mention a PB the diver missed or hid', () => {
		expect(socialCaption({ discipline: 'DNF', finalM: 87.5, totalMs: 95_300, pb: { kind: 'short', deltaM: 12 } })).toBe(
			'87.5 m DNF · 1:35.3\nTracked with overdive.app\n#freediving #apnea #dynamicnofins'
		);
		expect(socialCaption({ discipline: 'DYNB', finalM: 100, totalMs: 80_000, pb: null })).toContain('100 m DYNB · 1:20.0\n');
	});
});
