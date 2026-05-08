import { describe, expect, it } from 'vitest';
import { dynamicMaxExample, dryRvTableExample, staticTwoBreathTableExample } from './defaults';
import { buildLayerSentence } from './sentence';

describe('buildLayerSentence', () => {
	it('renders selectable discipline freedom and lock state for Dynamic Max', () => {
		const sentence = buildLayerSentence(dynamicMaxExample.layers[0], 0);
		const discipline = sentence.segments.find((segment) => segment.key === 'discipline');

		expect(sentence.label).toBe('Layer 1');
		expect(discipline).toMatchObject({
			label: 'Discipline',
			summary: 'default DYN',
			locked: false
		});
		expect(discipline?.details).toEqual(['default DYN', 'selectable DYN/DYNB/DNF/TORT', 'unlocked']);
		expect(discipline?.modifiers).toEqual([
			{
				key: 'discipline.default',
				label: 'Default discipline',
				summary: 'default DYN',
				locked: false
			},
			{
				key: 'discipline.selectionMode',
				label: 'Selection mode',
				summary: 'selectable DYN/DYNB/DNF/TORT',
				locked: false
			}
		]);
	});

	it('renders fixed static duration values in the dive segment', () => {
		const sentence = buildLayerSentence(staticTwoBreathTableExample.layers[0], 0);
		const dive = sentence.segments.find((segment) => segment.key === 'dive');

		expect(dive).toMatchObject({
			label: 'Dive',
			summary: 'fixed duration 1:30'
		});
		expect(dive?.details).toContain('fixed duration 1:30');
	});

	it('renders environment and repeat information for dry repeated layers', () => {
		const sentence = buildLayerSentence(dryRvTableExample.layers[0], 0);
		const setup = sentence.segments.find((segment) => segment.key === 'setup');
		const reps = sentence.segments.find((segment) => segment.key === 'reps');

		expect(setup?.summary).toBe('RV · standard · dry');
		expect(reps?.summary).toBe('repeat 8x');
		expect(reps?.details).toEqual(['repeat 8x', 'uniform layer repeat', 'unlocked']);
	});

	it('marks locked segments when layer locks are set', () => {
		const layer = {
			...dynamicMaxExample.layers[0],
			locks: { discipline: true, attributes: true }
		};
		const sentence = buildLayerSentence(layer, 0);

		expect(sentence.segments.find((segment) => segment.key === 'discipline')?.details).toContain('locked');
		expect(sentence.segments.find((segment) => segment.key === 'setup')?.details).toContain('locked');
		expect(sentence.segments.find((segment) => segment.key === 'dive')?.details).toContain('unlocked');
	});
});