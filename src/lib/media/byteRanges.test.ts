import { describe, expect, it } from 'vitest';
import { byteRanges } from './byteRanges';

describe('byteRanges', () => {
	it('covers every byte exactly once with inclusive ends', () => {
		expect(byteRanges(10, 4)).toEqual([
			{ start: 0, end: 3 },
			{ start: 4, end: 7 },
			{ start: 8, end: 9 }
		]);
	});

	it('returns one range when the object fits in a part', () => {
		expect(byteRanges(4, 4)).toEqual([{ start: 0, end: 3 }]);
	});

	it('returns nothing for empty or invalid sizes', () => {
		expect(byteRanges(0, 4)).toEqual([]);
		expect(byteRanges(10, 0)).toEqual([]);
		expect(byteRanges(Number.NaN, 4)).toEqual([]);
	});
});
