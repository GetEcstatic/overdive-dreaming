import { describe, expect, it } from 'vitest';
import { collapseFrameRuns, concatListForRuns } from './frameRuns';

describe('collapseFrameRuns', () => {
	it('groups consecutive identical frames', () => {
		expect(collapseFrameRuns(['a', 'a', 'a', 'b', 'c', 'c'])).toEqual([
			{ startIndex: 0, length: 3 },
			{ startIndex: 3, length: 1 },
			{ startIndex: 4, length: 2 }
		]);
	});

	it('does not merge equal frames that are not adjacent', () => {
		expect(collapseFrameRuns(['a', 'b', 'a'])).toHaveLength(3);
	});

	it('handles an empty sequence', () => {
		expect(collapseFrameRuns([])).toEqual([]);
	});
});

describe('concatListForRuns', () => {
	it('writes durations from run lengths and repeats the final file', () => {
		const list = concatListForRuns(
			[
				{ startIndex: 0, length: 150 },
				{ startIndex: 150, length: 1 }
			],
			100,
			(i) => `/tmp/f-${i}.png`
		);
		expect(list).toBe(
			"file '/tmp/f-0.png'\nduration 15.000\nfile '/tmp/f-150.png'\nduration 0.100\nfile '/tmp/f-150.png'\n"
		);
	});

	it('keeps the total duration equal to ticks × tick length', () => {
		const runs = collapseFrameRuns(Array.from({ length: 1981 }, (_, i) => (i < 150 || i > 1800 ? 'idle' : `t${i}`)));
		const total = concatListForRuns(runs, 100, (i) => `${i}`)
			.split('\n')
			.filter((line) => line.startsWith('duration'))
			.reduce((sum, line) => sum + Number(line.split(' ')[1]), 0);
		expect(total).toBeCloseTo(198.1, 3);
	});
});
