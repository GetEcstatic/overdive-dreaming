/**
 * Synthetic test dive for share HUD tests and fixture renders (not real
 * footage data): DYN in a 50 m pool, 190 m in 2:45.0, taps every 12.5 m,
 * fast off each wall and fading through each length. PB before the dive: 175 m.
 */
import type { DiveTimeline } from '../../capture/timelineTypes';

const DIVE_START_MS = 15_000;
const MARKS: readonly (readonly [number, number])[] = [
	[25_000, 12.5], [35_500, 25], [46_500, 37.5], [57_000, 50],
	[66_500, 62.5], [77_000, 75], [88_500, 87.5], [100_000, 100],
	[109_800, 112.5], [120_500, 125], [131_800, 137.5], [143_000, 150],
	[153_000, 162.5], [164_600, 175], [180_000, 190]
];

export const FIXTURE_POOL_M = 50;
export const FIXTURE_PB_M = 175;
export const FIXTURE_RECORDING_MS = 198_000;

export function fixtureTimeline(): DiveTimeline {
	const walls = MARKS.filter(([, d]) => d % 50 === 0);
	return {
		diveStartMs: DIVE_START_MS,
		diveEndMs: 180_000,
		protocolEndMs: 190_000,
		laps: walls.map(([atMs, d], i) => ({
			lapNumber: i + 1,
			atMs,
			splitMs: atMs - (i === 0 ? DIVE_START_MS : walls[i - 1][0]),
			cumulativeDistanceM: d
		})),
		subSplits: MARKS.filter(([, d]) => d % 50 !== 0).map(([atMs, d], i) => ({
			lapNumber: i + 1,
			atMs,
			splitMs: 0,
			cumulativeDistanceM: d
		}))
	};
}
