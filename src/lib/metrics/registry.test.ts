import { describe, expect, it } from 'vitest';
import type { MetricType } from '$lib/types';
import {
	getMetricLabel,
	getSelectableMetricOptionsForTrackingConfig,
	isTimeMetricType,
	metricRegistry,
	metricRegistryByKey,
	metricTypeForCanonicalKey
} from './registry';

describe('metric registry', () => {
	it('has unique metric keys', () => {
		const keys = metricRegistry.map((metric) => metric.key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it('provides labels for current display metric keys', () => {
		const currentMetricKeys: MetricType[] = [
			'totalDistance',
			'totalTime',
			'repsCompleted',
			'cumulativeHoldTime',
			'sessionDuration',
			'avgSpeedMs',
			'minimumSpO2',
			'minimumHR',
			'timeBelowSpO2Threshold',
			'averageKicksPerLap',
			'averageArmPullsPerLap',
			'equipment',
			'facialGear',
			'breathingTechnique'
		];

		for (const metricKey of currentMetricKeys) {
			expect(metricRegistryByKey[metricKey]).toBeDefined();
			expect(getMetricLabel(metricKey).length).toBeGreaterThan(0);
		}
	});

	it('maps canonical layer metrics to current display metric keys', () => {
		expect(metricTypeForCanonicalKey('durationSeconds')).toBe('totalTime');
		expect(metricTypeForCanonicalKey('distanceMeters')).toBe('totalDistance');
		expect(metricTypeForCanonicalKey('cumulativeDiveTimeSeconds')).toBe('cumulativeHoldTime');
		expect(metricTypeForCanonicalKey('speedPerLap')).toBe('avgSpeedMs');
		expect(metricTypeForCanonicalKey('minSpO2')).toBe('minimumSpO2');
		expect(metricTypeForCanonicalKey('minHeartRate')).toBe('minimumHR');
		expect(metricTypeForCanonicalKey('timeBelowSpO2Threshold')).toBe('timeBelowSpO2Threshold');
		expect(metricTypeForCanonicalKey('kicksPerLap')).toBe('averageKicksPerLap');
		expect(metricTypeForCanonicalKey('armPullsPerLap')).toBe('averageArmPullsPerLap');
	});

	it('identifies time metrics from value kind', () => {
		expect(isTimeMetricType('totalTime')).toBe(true);
		expect(isTimeMetricType('avgRestBetweenLaps')).toBe(true);
		expect(isTimeMetricType('totalDistance')).toBe(false);
		expect(isTimeMetricType('breathingTechnique')).toBe(false);
	});

	it('generates selectable options from tracking config flags', () => {
		const options = getSelectableMetricOptionsForTrackingConfig({
			trackPoolLength: false,
			trackInitialBreatheUpTime: false,
			trackMinimumSpO2: true,
			trackMinimumHR: true,
			trackSpO2Thresholds: true,
			trackTotalDistance: false,
			trackTotalTime: false,
			trackRepsCompleted: false,
			trackRepDuration: false,
			trackRepDistance: false,
			trackTimePerLap: false,
			trackRestBetweenLaps: false,
			trackKicksPerLap: false,
			trackArmPullsPerLap: false,
			trackBreathingTechnique: false,
			trackRPE: false,
			trackJoyScale: false,
			trackHoursSinceLastMeal: false,
			trackNotes: false,
			trackWaterTemperature: false,
			trackContractionsOnsetTime: false,
			trackEquipmentUsed: false,
			trackBuddyName: false,
			trackRestingHeartRate: false,
			trackHRV: false,
			trackPoolType: false,
			trackSambaBO: false,
			trackBreathsBetweenReps: false,
			trackMenstrualCycleDay: false,
			trackFacialGear: false,
			trackBasalMood: false,
			trackBodyWeight: false,
			trackPerRepSpO2: false,
			trackPerRepHR: false,
			isDryTraining: false,
			trackFVC: false,
			trackFVCWithPacking: false,
			trackPackingVolume: false,
			trackLungVolume: false
		});

		expect(options.map((option) => option.value)).toEqual([
			'minimumSpO2',
			'minimumHR',
			'timeBelowSpO2Threshold'
		]);
	});
});
