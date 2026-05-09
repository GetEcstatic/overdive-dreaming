import { describe, expect, it } from 'vitest';
import type { RoutineLog, RoutineTemplate } from '$lib/types';
import { getSelectableMetricOptionsForTrackingConfig } from '$lib/metrics/registry';
import { getFormattedMetric } from '$lib/utils/metrics';
import { deriveTrackingConfigFromLayers } from './contract';
import { buildBlankRoutineLayer } from './create';
import { dynamicMaxExample, dynamicSweet16Example, staticMaxExample, staticTwoBreathTableExample } from './defaults';

describe('routine display metric options', () => {
	it('exposes dry/static biometric metrics for static routines', () => {
		const trackingConfig = deriveTrackingConfigFromLayers(staticTwoBreathTableExample.layers);
		const optionKeys = getSelectableMetricOptionsForTrackingConfig(trackingConfig).map((option) => option.value);

		expect(optionKeys).toEqual(expect.arrayContaining([
			'cumulativeHoldTime',
			'longestHold',
			'repsCompleted',
			'minimumSpO2',
			'minimumHR',
			'timeBelowSpO2Threshold',
			'fvcLiters',
			'fvcWithPackingLiters',
			'lungVolume'
		]));
	});

	it('exposes dynamic speed and technique metrics for dynamic routines', () => {
		const trackingConfig = deriveTrackingConfigFromLayers(dynamicMaxExample.layers);
		const optionKeys = getSelectableMetricOptionsForTrackingConfig(trackingConfig).map((option) => option.value);

		expect(optionKeys).toEqual(expect.arrayContaining([
			'totalDistance',
			'totalTime',
			'avgSpeedMs',
			'fastestLapSpeedMs',
			'slowestLapSpeedMs',
			'averageKicksPerLap',
			'averageArmPullsPerLap',
			'equipment',
			'facialGear',
			'competitionStatus',
			'cardColor',
			'recordTag'
		]));
	});

	it('exposes competition comparison metrics for static max attempts', () => {
		const trackingConfig = deriveTrackingConfigFromLayers(staticMaxExample.layers);
		const optionKeys = getSelectableMetricOptionsForTrackingConfig(trackingConfig).map((option) => option.value);

		expect(optionKeys).toEqual(expect.arrayContaining(['competitionStatus', 'cardColor', 'recordTag']));
	});

	it('does not expose competition comparison metrics for tables', () => {
		const trackingConfig = deriveTrackingConfigFromLayers(dynamicSweet16Example.layers);
		const optionKeys = getSelectableMetricOptionsForTrackingConfig(trackingConfig).map((option) => option.value);

		expect(optionKeys).not.toContain('competitionStatus');
		expect(optionKeys).not.toContain('cardColor');
		expect(optionKeys).not.toContain('recordTag');
	});

	it('resolves all selectable metrics safely for an empty log', () => {
		const trackingConfig = deriveTrackingConfigFromLayers([
			buildBlankRoutineLayer('static-blank', 'STA'),
			buildBlankRoutineLayer('dynamic-blank', 'DNF')
		]);
		const emptyLog = {} as RoutineLog;
		const routine = { trackingConfig } as RoutineTemplate;

		for (const option of getSelectableMetricOptionsForTrackingConfig(trackingConfig)) {
			expect(() => getFormattedMetric(option.value, option.label, emptyLog, routine)).not.toThrow();
		}
	});
});