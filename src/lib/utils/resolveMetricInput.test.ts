import { describe, it, expect } from 'vitest';
import { resolveMetricInput } from './resolveMetricInput';
import type { TrackingConfig } from '$lib/types';

function cfg(overrides: Partial<TrackingConfig> = {}): TrackingConfig {
	// Minimal valid TrackingConfig skeleton; tests only care about source fields.
	return {
		trackPoolLength: false,
		trackInitialBreatheUpTime: false,
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
		trackMinimumSpO2: false,
		trackMinimumHR: false,
		trackBodyWeight: false,
		trackPerRepSpO2: false,
		trackPerRepHR: false,
		trackSpO2Thresholds: false,
		isDryTraining: false,
		trackFVC: false,
		trackFVCWithPacking: false,
		trackPackingVolume: false,
		...overrides
	};
}

describe('resolveMetricInput — source: manual', () => {
	it('editable-empty when manual and no seed', () => {
		const d = resolveMetricInput(cfg({ totalDistanceSource: 'manual' }), 'totalDistance', false);
		expect(d.source).toBe('manual');
		expect(d.mode).toBe('editable-empty');
		expect(d.hasSeed).toBe(false);
	});

	it('editable-prefilled when manual but a seed was provided anyway', () => {
		const d = resolveMetricInput(cfg({ totalDistanceSource: 'manual' }), 'totalDistance', true);
		expect(d.mode).toBe('editable-prefilled');
	});
});

describe('resolveMetricInput — source: recorder', () => {
	it('disabled-needs-recorder when no seed', () => {
		const d = resolveMetricInput(cfg({ speedPerLapSource: 'recorder' }), 'speedPerLap', false);
		expect(d.source).toBe('recorder');
		expect(d.mode).toBe('disabled-needs-recorder');
	});

	it('readonly-from-recorder when a seed is present', () => {
		const d = resolveMetricInput(cfg({ timePerLapSource: 'recorder' }), 'timePerLap', true);
		expect(d.mode).toBe('readonly-from-recorder');
	});
});

describe('resolveMetricInput — source: either (default)', () => {
	it('editable-empty when neither source set and no seed (default "either")', () => {
		const d = resolveMetricInput(cfg(), 'avgSpeed', false);
		expect(d.source).toBe('either');
		expect(d.mode).toBe('editable-empty');
	});

	it('editable-prefilled when either + seed', () => {
		const d = resolveMetricInput(cfg({ avgSpeedSource: 'either' }), 'avgSpeed', true);
		expect(d.mode).toBe('editable-prefilled');
	});
});

describe('resolveMetricInput — robustness', () => {
	it('treats missing config as all-either', () => {
		const d = resolveMetricInput(null, 'totalTime', false);
		expect(d.source).toBe('either');
		expect(d.mode).toBe('editable-empty');
	});

	it('treats undefined config as all-either', () => {
		const d = resolveMetricInput(undefined, 'totalTime', true);
		expect(d.mode).toBe('editable-prefilled');
	});
});
