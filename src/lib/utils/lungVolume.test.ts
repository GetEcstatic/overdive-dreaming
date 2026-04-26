import { describe, it, expect } from 'vitest';
import type { RepEditorData } from '$lib/types';
import {
	LUNG_VOLUME_OPTIONS,
	applyDefaultLungVolume,
	formatLungVolume
} from './lungVolume';

const baseRep = (n: number, partial: Partial<RepEditorData> = {}): RepEditorData => ({
	repNumber: n,
	completed: true,
	...partial
});

describe('lungVolume', () => {
	describe('LUNG_VOLUME_OPTIONS', () => {
		it('contains exactly FL, RV, FRC in that order', () => {
			expect(LUNG_VOLUME_OPTIONS).toEqual(['FL', 'RV', 'FRC']);
		});
	});

	describe('formatLungVolume', () => {
		it('returns the long-form label for each value', () => {
			expect(formatLungVolume('FL')).toBe('Full Lung');
			expect(formatLungVolume('RV')).toBe('Residual Volume');
			expect(formatLungVolume('FRC')).toBe('Functional Residual Capacity');
		});

		it('returns an empty string for undefined', () => {
			expect(formatLungVolume(undefined)).toBe('');
		});
	});

	describe('applyDefaultLungVolume', () => {
		it('fills in undefined slots with the default', () => {
			const reps = [baseRep(1), baseRep(2)];
			const result = applyDefaultLungVolume(reps, 'FRC');
			expect(result).toEqual([
				baseRep(1, { lungVolume: 'FRC' }),
				baseRep(2, { lungVolume: 'FRC' })
			]);
		});

		it('preserves explicit per-rep values', () => {
			const reps = [
				baseRep(1, { lungVolume: 'FL' }),
				baseRep(2),
				baseRep(3, { lungVolume: 'RV' })
			];
			const result = applyDefaultLungVolume(reps, 'FRC');
			expect(result.map((r) => r.lungVolume)).toEqual(['FL', 'FRC', 'RV']);
		});

		it('is a no-op (but a new array) when defaultVol is undefined', () => {
			const reps = [baseRep(1, { lungVolume: 'FL' }), baseRep(2)];
			const result = applyDefaultLungVolume(reps, undefined);
			expect(result).toEqual(reps);
			expect(result).not.toBe(reps); // still a new array
		});

		it('does not mutate the input array or its items', () => {
			const reps = [baseRep(1), baseRep(2)];
			const snapshot = JSON.parse(JSON.stringify(reps));
			applyDefaultLungVolume(reps, 'FL');
			expect(reps).toEqual(snapshot);
		});
	});
});
