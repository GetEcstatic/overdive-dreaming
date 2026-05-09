import { describe, expect, it } from 'vitest';
import type { RoutineLog, RoutineTemplate } from '$lib/types';
import { formatMetricValue, getMetricValue } from './metrics';

const routine = {} as RoutineTemplate;

describe('metric value resolution', () => {
	it('calculates cumulative distance from laps', () => {
		const log = {
			laps: [{ distanceMeters: 25 }, { distanceMeters: 50 }, { distanceMeters: 25 }]
		} as RoutineLog;

		expect(getMetricValue('cumulativeDistance', log, routine)).toBe(100);
		expect(formatMetricValue('cumulativeDistance', 100)).toBe('100m');
	});

	it('rolls up P0 biometric display metrics from lap data', () => {
		const log = {
			laps: [
				{ spo2Min: 91, hrMin: 58, timeBelow70: 0 },
				{ spo2Min: 84, hrMin: 52, timeBelow70: 8 },
				{ spo2Min: 87, hrMin: 55, timeBelow70: 4 }
			]
		} as RoutineLog;

		expect(getMetricValue('minimumSpO2', log, routine)).toBe(84);
		expect(getMetricValue('minimumHR', log, routine)).toBe(52);
		expect(getMetricValue('timeBelowSpO2Threshold', log, routine)).toBe(12);
	});

	it('calculates fastest and slowest lap speed from lap distance and time', () => {
		const log = {
			laps: [
				{ distanceMeters: 25, timeSeconds: 25 },
				{ distanceMeters: 25, timeSeconds: 20 },
				{ distanceMeters: 25, timeSeconds: 50 }
			]
		} as RoutineLog;

		expect(getMetricValue('fastestLapSpeedMs', log, routine)).toBe(1.25);
		expect(getMetricValue('slowestLapSpeedMs', log, routine)).toBe(0.5);
	});
});
