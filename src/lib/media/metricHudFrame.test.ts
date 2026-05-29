import { describe, expect, it } from 'vitest';
import { scaleHudModeDesign } from './hudDesign';
import { createMetricHudFrame, formatMetricHudTime } from './metricHudFrame';
import { metricHudFrameFixtures } from './metricHudFrame.fixtures';

describe('metricHudFrame', () => {
	it('formats HUD time with tenths', () => {
		expect(formatMetricHudTime(0)).toBe('00:00.0');
		expect(formatMetricHudTime(61_490)).toBe('01:01.4');
		expect(formatMetricHudTime(-10)).toBe('00:00.0');
	});

	it.each(metricHudFrameFixtures)('creates stable values for $name', (fixture) => {
		const frame = createMetricHudFrame(fixture);
		const text = Object.fromEntries(frame.textRuns.map((run) => [run.key, run.text]));

		expect(text['time-label']).toBe('TIME');
		expect(text['distance-label']).toBe('DISTANCE');
		expect(text['time-value']).toBe('00:31.0');
		expect(text['distance-value']).toBe('38.1 m');
		expect(text['lap-sub']).toBe('Lap 1/3');
		expect(text['speed-sub']).toBe('1.19 m/s');
		expect(frame.values.elapsedMs).toBe(31_000);
		expect(frame.values.distanceM).toBeCloseTo(38.1);
		expect(frame.values.speedMs).toBeCloseTo(1.19);
	});

	it('projects portrait HUD geometry from the shared design data', () => {
		const fixture = metricHudFrameFixtures[0];
		const frame = createMetricHudFrame(fixture);
		const design = scaleHudModeDesign(fixture.widthPx, fixture.mode);

		expect(frame.box.x).toBe(Math.round(design.offsetXPx));
		expect(frame.box.width).toBe(fixture.widthPx - frame.box.x * 2);
		expect(frame.box.radius).toBe(Math.round(design.radiusPx));
		expect(frame.background).toBe(design.background);
		expect(frame.textRuns.find((run) => run.key === 'distance-value')?.align).toBe('right');
	});

	it('projects landscape HUD width from the shared max-width ratio', () => {
		const fixture = metricHudFrameFixtures[1];
		const frame = createMetricHudFrame(fixture);
		const design = scaleHudModeDesign(fixture.widthPx, fixture.mode);
		const expectedWidth = Math.min(
			Math.round(fixture.widthPx * (design.maxWidthRatio ?? 1)),
			fixture.widthPx - frame.box.x * 2
		);

		expect(frame.box.width).toBe(expectedWidth);
		expect(frame.box.width).toBeLessThan(fixture.widthPx);
		expect(frame.textRuns.find((run) => run.key === 'lap-sub')?.style).toEqual(design.sub);
		expect(frame.textRuns.find((run) => run.key === 'speed-sub')?.style).toEqual(design.mono);
	});
});