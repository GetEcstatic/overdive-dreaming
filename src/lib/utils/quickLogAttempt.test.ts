import { describe, expect, it } from 'vitest';
import { buildQuickLogAttemptConditions } from './quickLogAttempt';

describe('buildQuickLogAttemptConditions', () => {
	it('builds standard air full-lung conditions', () => {
		expect(
			buildQuickLogAttemptConditions({
				attemptKind: 'standard',
				breathingGas: 'air',
				defaultLungVolume: 'FL'
			})
		).toEqual({ kind: 'standard', lungVolume: 'FL', breathingGas: 'air', gasMix: undefined, countsForStandardPB: true });
	});

	it('promotes standard FRC and RV lung volumes to their category', () => {
		expect(
			buildQuickLogAttemptConditions({
				attemptKind: 'standard',
				breathingGas: 'oxygen',
				gasMix: '100% O2',
				defaultLungVolume: 'FRC'
			})
		).toEqual({ kind: 'frc', lungVolume: 'FRC', breathingGas: 'air', gasMix: undefined });

		expect(
			buildQuickLogAttemptConditions({
				attemptKind: 'standard',
				breathingGas: 'nitrox',
				gasMix: '50%',
				defaultLungVolume: 'RV'
			})
		).toEqual({ kind: 'rv', lungVolume: 'RV', breathingGas: 'air', gasMix: undefined });
	});

	it('keeps O2-assisted gas explicit and defaults the mix', () => {
		expect(
			buildQuickLogAttemptConditions({
				attemptKind: 'o2-assisted',
				breathingGas: 'oxygen',
				defaultLungVolume: 'FL'
			})
		).toEqual({ kind: 'o2-assisted', lungVolume: 'FL', breathingGas: 'oxygen', gasMix: '100% O2' });
	});

	it('preserves custom label, gas, and lung volume without implying standard PB', () => {
		expect(
			buildQuickLogAttemptConditions({
				attemptKind: 'custom',
				customAttemptLabel: '  Hypoxic ',
				breathingGas: 'custom',
				gasMix: 'low O2',
				defaultLungVolume: 'FRC'
			})
		).toEqual({
				kind: 'custom',
				label: 'Hypoxic',
				lungVolume: 'FRC',
				breathingGas: 'custom',
				gasMix: 'low O2'
			});
	});
});