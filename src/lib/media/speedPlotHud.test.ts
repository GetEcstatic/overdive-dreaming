import { describe, expect, it } from 'vitest';
import type { DiveTimeline } from '$lib/types';
import {
	createSpeedPlotFrame,
	projectSpeedPlot,
	realizedDistanceM,
	samplesFromTimeline,
	speedPlotDomain
} from './speedPlotHud';

const timeline: DiveTimeline = {
	diveStartMs: 1_000,
	diveEndMs: 61_000,
	laps: [
		{ lapNumber: 1, atMs: 31_000, cumulativeDistanceM: 25, splitMs: 30_000 },
		{ lapNumber: 2, atMs: 61_000, cumulativeDistanceM: 50, splitMs: 30_000 }
	],
	subSplits: [
		{ lapNumber: 1, atMs: 16_000, cumulativeDistanceM: 12.5, splitMs: 15_000 },
		{ lapNumber: 1, atMs: 46_000, cumulativeDistanceM: 37.5, splitMs: 15_000 }
	]
};

describe('speedPlotHud', () => {
	it('uses the larger of discipline PB plus padding or realised distance plus padding', () => {
		expect(speedPlotDomain(100, 150)).toBeCloseTo(180);
		expect(speedPlotDomain(180, 120)).toBeCloseTo(216);
	});

	it('falls back to a 200m discipline scale when no PB exists', () => {
		expect(speedPlotDomain(null, 50)).toBeCloseTo(240);
	});

	it('derives speed samples from waypoint segments', () => {
		const samples = samplesFromTimeline(timeline, 25);

		expect(samples[0]).toMatchObject({ atMs: 1_000, distanceM: 0 });
		expect(samples).toHaveLength(5);
		expect(samples[1]).toMatchObject({ atMs: 16_000, distanceM: 12.5 });
		expect(samples[1].speedMs).toBeCloseTo(12.5 / 15);
	});

	it('reveals only the active line and interpolates the current point', () => {
		const frame = createSpeedPlotFrame({
			timeline,
			poolLengthM: 25,
			currentVideoMs: 23_500,
			pbDistanceM: 100
		});

		expect(frame.samples.at(-1)?.atMs).toBe(23_500);
		expect(frame.currentDistanceM).toBeCloseTo(18.75);
		expect(frame.samples.every((sample) => sample.atMs <= 23_500)).toBe(true);
	});

	it('prefers dense recorded samples for a stepped trace', () => {
		const denseTimeline: DiveTimeline = {
			...timeline,
			samples: [
				{ atMs: 2_000, distanceM: 1.2, speedMs: 1.1 },
				{ atMs: 3_000, distanceM: 2.5, speedMs: 1.3 }
			]
		};

		const samples = samplesFromTimeline(denseTimeline, 25);

		expect(samples).toHaveLength(3);
		expect(samples[1]).toMatchObject({ atMs: 2_000, distanceM: 1.2, speedMs: 1.1 });
	});

	it('projects PB marker and points inside the plot at common widths', () => {
		const frame = createSpeedPlotFrame({ timeline, poolLengthM: 25, currentVideoMs: 61_000, pbDistanceM: 100 });
		const model720 = projectSpeedPlot(frame, 720, 1280);
		const model1080 = projectSpeedPlot(frame, 1080, 1920);
		const model4k = projectSpeedPlot(frame, 3840, 2160);

		expect(model720.bandRect.height).toBeCloseTo((285 * 720) / 1080);
		expect(model720.pbMarker?.x).toBeGreaterThan(model720.plotRect.x);
		expect(model720.pbMarker?.x).toBeLessThan(model720.plotRect.x + model720.plotRect.width);
		expect(model1080.bandRect.height / model720.bandRect.height).toBeCloseTo(1080 / 720);
		expect(model4k.speedLine.length).toBe(frame.samples.length);
	});

	it('draws a visible first segment when only the current point is available', () => {
		const model = projectSpeedPlot(
			{
				domainDistanceM: 240,
				pbDistanceM: null,
				samples: [{ atMs: 1_000, distanceM: 0, speedMs: 0.8 }],
				currentDistanceM: 8,
				currentSpeedMs: 0.8
			},
			390,
			103
		);

		expect(model.speedLine).toHaveLength(2);
		expect(model.speedLine[0].x).toBeLessThan(model.speedLine[1].x);
		expect(model.speedLine[0].y).toBeCloseTo(model.speedLine[1].y);
	});

	it('computes realised distance from sub-splits and dense samples', () => {
		const denseTimeline: DiveTimeline = {
			...timeline,
			diveEndMs: 62_000,
			samples: [{ atMs: 61_000, distanceM: 58, speedMs: 1 }]
		};

		expect(realizedDistanceM(denseTimeline, 25)).toBeCloseTo(59);
	});
});