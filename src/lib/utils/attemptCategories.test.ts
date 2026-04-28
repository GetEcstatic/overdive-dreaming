import { describe, expect, it } from 'vitest';
import {
	deriveAttemptCategory,
	formatAttemptCategoryLabel,
	resultForPB
} from './attemptCategories';

describe('deriveAttemptCategory', () => {
	it('keeps a normal static in the standard STA bucket', () => {
		expect(deriveAttemptCategory({ disciplineUsed: 'STA' })).toMatchObject({
			key: 'STA:standard',
			label: 'STA',
			isStandard: true,
			metric: 'time'
		});
	});

	it('uses an explicit O2 assisted category for static attempts', () => {
		expect(
			deriveAttemptCategory({
				disciplineUsed: 'STA',
				attemptConditions: { kind: 'o2-assisted', breathingGas: 'oxygen', gasMix: '100% O2' }
			})
		).toMatchObject({
			key: 'STA:o2-assisted',
			label: 'O2 STA',
			isStandard: false,
			conditions: { gasMix: '100% O2' }
		});
	});

	it('infers O2 assisted from legacy gas mix text', () => {
		expect(deriveAttemptCategory({ disciplineUsed: 'STA', gasMix: '50% O2' })).toMatchObject({
			key: 'STA:o2-assisted',
			label: 'O2 STA',
			isStandard: false,
			conditions: { breathingGas: 'oxygen', gasMix: '50% O2' }
		});
	});

	it('infers FRC and RV categories from default lung volume', () => {
		expect(deriveAttemptCategory({ disciplineUsed: 'DYN', defaultLungVolume: 'FRC' })).toMatchObject({
			key: 'DYN:frc',
			label: 'FRC DYN',
			metric: 'distance'
		});
		expect(deriveAttemptCategory({ disciplineUsed: 'STA', defaultLungVolume: 'RV' })).toMatchObject({
			key: 'STA:rv',
			label: 'RV STA'
		});
	});

	it('formats custom labels', () => {
		expect(formatAttemptCategoryLabel('DNF', { kind: 'custom', label: 'Hypoxic' })).toBe(
			'Hypoxic DNF'
		);
	});
});

describe('resultForPB', () => {
	it('uses time for STA and distance for dynamic disciplines', () => {
		expect(resultForPB('STA', { totalTime: 780 })).toBe(780);
		expect(resultForPB('DYNB', { totalDistance: 125 })).toBe(125);
	});
});

