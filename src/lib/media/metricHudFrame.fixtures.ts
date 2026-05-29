import type { DiveTimeline } from '$lib/types';
import type { HudRenderMode } from './hudDesign';

export interface MetricHudFrameFixture {
	readonly name: string;
	readonly mode: HudRenderMode;
	readonly widthPx: number;
	readonly poolLengthM: number;
	readonly atMs: number;
	readonly timeline: DiveTimeline;
}

const fixtureTimeline: DiveTimeline = {
	diveStartMs: 1_000,
	diveEndMs: 64_000,
	laps: [
		{ lapNumber: 1, atMs: 21_000, splitMs: 20_000, cumulativeDistanceM: 25 },
		{ lapNumber: 2, atMs: 42_000, splitMs: 21_000, cumulativeDistanceM: 50 },
		{ lapNumber: 3, atMs: 64_000, splitMs: 22_000, cumulativeDistanceM: 75 }
	],
	samples: [
		{ atMs: 1_000, distanceM: 0, speedMs: 0 },
		{ atMs: 11_000, distanceM: 12.5, speedMs: 1.25 },
		{ atMs: 21_000, distanceM: 25, speedMs: 1.25 },
		{ atMs: 32_000, distanceM: 38.1, speedMs: 1.19 },
		{ atMs: 42_000, distanceM: 50, speedMs: 1.19 }
	]
};

export const metricHudFrameFixtures: readonly MetricHudFrameFixture[] = [
	{
		name: 'portrait 720p mid-dive frame',
		mode: 'portrait',
		widthPx: 720,
		poolLengthM: 25,
		atMs: 32_000,
		timeline: fixtureTimeline
	},
	{
		name: 'landscape 1080p mid-dive frame',
		mode: 'landscape',
		widthPx: 1920,
		poolLengthM: 25,
		atMs: 32_000,
		timeline: fixtureTimeline
	}
];