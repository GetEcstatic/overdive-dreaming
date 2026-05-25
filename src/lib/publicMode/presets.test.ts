import { describe, expect, it } from 'vitest';
import {
	buildPublicPresetRoutineCreateData,
	getPublicRoutinePreset,
	increasingDynamicIntervalsExample,
	increasingStaticIntervalsExample,
	publicRoutinePresets
} from './presets';

describe('publicRoutinePresets', () => {
	it('includes the planned six public presets in order', () => {
		expect(publicRoutinePresets.map((preset) => preset.id)).toEqual([
			'dynamic-max',
			'static-max',
			'static-two-breath-co2',
			'dynamic-sweet-16-co2',
			'increasing-static-intervals',
			'increasing-dynamic-intervals'
		]);
	});

	it('keeps all preset copy public-facing', () => {
		expect(publicRoutinePresets.every((preset) => preset.coachingCue.length > 0)).toBe(true);
		expect(publicRoutinePresets.map((preset) => preset.name).join(' ')).not.toMatch(/layer|contract|read model/i);
	});

	it('finds presets by stable id', () => {
		expect(getPublicRoutinePreset('dynamic-max')?.name).toBe('Dynamic Max');
		expect(getPublicRoutinePreset('missing')).toBeUndefined();
	});

	it('defines increasing static intervals as progressively longer holds', () => {
		const durations = increasingStaticIntervalsExample.layers.map((layer) => layer.dive.duration?.mode === 'fixed' ? layer.dive.duration.seconds : 0);
		expect(durations).toEqual([60, 75, 90, 105, 120]);
	});

	it('defines increasing dynamic intervals as progressively longer distances', () => {
		const distances = increasingDynamicIntervalsExample.layers.map((layer) => layer.dive.distance?.mode === 'fixed' ? layer.dive.distance.meters : 0);
		expect(distances).toEqual([25, 50, 75, 100]);
	});

	it('projects presets into routine create data', () => {
		const data = buildPublicPresetRoutineCreateData(publicRoutinePresets[4]);

		expect(data.name).toBe('Increasing Static Intervals');
		expect(data.description).toBe('A simple static ladder with holds that get longer each round.');
		expect(data.disciplines).toEqual(['STA']);
		expect(data.layers).toHaveLength(5);
		expect(data.trackingConfig.trackRepsCompleted).toBe(true);
		expect(data.displayConfig.heroMetric).toBe('cumulativeHoldTime');
		expect(data).toMatchObject({ publicPresetId: 'increasing-static-intervals' });
	});
});