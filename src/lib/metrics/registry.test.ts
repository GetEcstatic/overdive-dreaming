import { describe, expect, it } from 'vitest';
import type { MetricType } from '$lib/types';
import {
	getMetricLabel,
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
		expect(metricTypeForCanonicalKey('minSpO2')).toBeUndefined();
	});

	it('identifies time metrics from value kind', () => {
		expect(isTimeMetricType('totalTime')).toBe(true);
		expect(isTimeMetricType('avgRestBetweenLaps')).toBe(true);
		expect(isTimeMetricType('totalDistance')).toBe(false);
		expect(isTimeMetricType('breathingTechnique')).toBe(false);
	});
});
