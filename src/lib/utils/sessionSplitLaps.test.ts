import { describe, expect, it } from 'vitest';
import { deriveDynamicSplitLaps } from './sessionSplitLaps';

describe('deriveDynamicSplitLaps', () => {
	it('prefers recorded video lap splits over a whole-dive read-model row', () => {
		const result = deriveDynamicSplitLaps(
			[
				{ lapNumber: 1, timeSeconds: 22, distanceMeters: 25, completed: true },
				{ lapNumber: 2, timeSeconds: 24, distanceMeters: 25, completed: true },
				{ lapNumber: 3, timeSeconds: 26, distanceMeters: 25, completed: true }
			],
			[
				{
					isDynamic: true,
					plan: { globalRowIndex: 1 },
					result: {
						actualDurationSeconds: 72,
						actualDistanceMeters: 75,
						completed: true
					}
				}
			],
			25
		);

		expect(result).toHaveLength(3);
		expect(result.map((lap) => lap.timeSeconds)).toEqual([22, 24, 26]);
		expect(result.map((lap) => lap.distanceMeters)).toEqual([25, 25, 25]);
		expect(result[0].speedMs).toBeCloseTo(25 / 22, 5);
	});

	it('falls back to dynamic read-model rows when no recorded laps exist', () => {
		const result = deriveDynamicSplitLaps(
			undefined,
			[
				{
					isDynamic: true,
					plan: { globalRowIndex: 1 },
					result: { actualDurationSeconds: 30, actualDistanceMeters: 25 }
				},
				{
					isDynamic: false,
					plan: { globalRowIndex: 2 },
					result: { actualDurationSeconds: 10, actualDistanceMeters: 0 }
				}
			],
			25
		);

		expect(result).toEqual([
			expect.objectContaining({
				lapNumber: 1,
				timeSeconds: 30,
				distanceMeters: 25,
				speedMs: 25 / 30,
				completed: true
			})
		]);
	});
});