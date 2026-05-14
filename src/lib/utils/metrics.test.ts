import { describe, expect, it } from 'vitest';
import type { RoutineLog, RoutineTemplate } from '$lib/types';
import { formatMetricValue, getFormattedMetric, getMetricValue } from './metrics';

const routine = {} as RoutineTemplate;

describe('metric value resolution', () => {
	it('calculates cumulative distance from laps', () => {
		const log = {
			laps: [{ distanceMeters: 25 }, { distanceMeters: 50 }, { distanceMeters: 25 }]
		} as RoutineLog;

		expect(getMetricValue('cumulativeDistance', log, routine)).toBe(100);
		expect(formatMetricValue('cumulativeDistance', 100)).toBe('100m');
	});

	it('prefers saved row results for mixed routine totals', () => {
		const log = {
			totalDistance: 999,
			totalTime: 999,
			plannedRows: [
				{
					planRowId: 'static:1',
					sourceLayerId: 'static',
					repIndex: 1,
					globalRowIndex: 1,
					discipline: 'STA',
					lungVolume: 'FL',
					effort: 'standard',
					environment: 'wet'
				},
				{
					planRowId: 'dynamic:1',
					sourceLayerId: 'dynamic',
					repIndex: 1,
					globalRowIndex: 2,
					discipline: 'DYN',
					lungVolume: 'FL',
					effort: 'standard',
					environment: 'wet'
				}
			],
			resultRows: [
				{
					planRowId: 'static:1',
					sourceLayerId: 'static',
					repIndex: 1,
					globalRowIndex: 1,
					completed: true,
					actualDurationSeconds: 90,
					actualDistanceMeters: 25
				},
				{
					planRowId: 'dynamic:1',
					sourceLayerId: 'dynamic',
					repIndex: 1,
					globalRowIndex: 2,
					completed: true,
					actualDurationSeconds: 50,
					actualDistanceMeters: 50
				}
			]
		} as RoutineLog;

		expect(getMetricValue('totalDistance', log, routine)).toBe(50);
		expect(getMetricValue('totalTime', log, routine)).toBe(140);
		expect(getMetricValue('avgSpeedMs', log, routine)).toBe(1);
		expect(getMetricValue('cumulativeHoldTime', log, routine)).toBe(140);
		expect(getMetricValue('longestHold', log, routine)).toBe(90);
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

	it('rolls up P1 technique metrics from laps', () => {
		const log = {
			laps: [
				{ kicks: 10, armPulls: 6 },
				{ kicks: 12, armPulls: 8 }
			]
		} as RoutineLog;

		expect(getMetricValue('averageKicksPerLap', log, routine)).toBe(11);
		expect(getMetricValue('averageArmPullsPerLap', log, routine)).toBe(7);
	});

	it('formats P1 status metrics directly from log text fields', () => {
		const log = {
			equipmentUsed: 'bifins',
			facialGear: ['noseclip', 'goggles']
		} as RoutineLog;

		expect(getFormattedMetric('equipment', 'Equipment', log, routine)).toEqual({ value: 'bifins', label: 'Equipment' });
		expect(getFormattedMetric('facialGear', 'Facial Gear', log, routine)).toEqual({ value: 'noseclip, goggles', label: 'Facial Gear' });
	});

	it('formats P2 advanced static metrics from direct log fields', () => {
		const log = {
			fvc: 5.21,
			fvcWithPacking: 6.12,
			endSpO2: 72,
			recoveryQuality: 8,
			urgeToBreathe: 6,
			lucidity: 9,
			contractions: 5
		} as RoutineLog;

		expect(formatMetricValue('fvcLiters', getMetricValue('fvcLiters', log, routine))).toBe('5.2L');
		expect(formatMetricValue('fvcWithPackingLiters', getMetricValue('fvcWithPackingLiters', log, routine))).toBe('6.1L');
		expect(formatMetricValue('endSpO2', getMetricValue('endSpO2', log, routine))).toBe('72%');
		expect(formatMetricValue('recoveryQuality', getMetricValue('recoveryQuality', log, routine))).toBe('8/10');
		expect(formatMetricValue('urgeToBreathe', getMetricValue('urgeToBreathe', log, routine))).toBe('6/10');
		expect(formatMetricValue('lucidity', getMetricValue('lucidity', log, routine))).toBe('9/10');
		expect(formatMetricValue('contractions', getMetricValue('contractions', log, routine))).toBe('5/10');
	});

	it('formats P3 status metrics from routine log status fields', () => {
		const log = {
			gasMix: '100% O2',
			sambaBO: false,
			defaultLungVolume: 'FRC',
			isCompetition: true,
			cardTag: 'white',
			recordTag: 'NR'
		} as RoutineLog;

		expect(getFormattedMetric('gasMix', 'Gas', log, routine)).toEqual({ value: '100% O2', label: 'Gas' });
		expect(getFormattedMetric('safetyOutcome', 'Safety', log, routine)).toEqual({ value: 'Clean', label: 'Safety' });
		expect(getFormattedMetric('lungVolume', 'Lung Volume', log, routine)).toEqual({ value: 'FRC', label: 'Lung Volume' });
		expect(getFormattedMetric('competitionStatus', 'Competition', log, routine)).toEqual({ value: 'Competition', label: 'Competition' });
		expect(getFormattedMetric('cardColor', 'Card', log, routine)).toEqual({ value: 'white', label: 'Card' });
		expect(getFormattedMetric('recordTag', 'Record', log, routine)).toEqual({ value: 'NR', label: 'Record' });
	});
});
