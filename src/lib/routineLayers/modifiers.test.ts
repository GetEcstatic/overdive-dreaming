import { describe, expect, it } from 'vitest';
import { dynamicMaxExample, staticMaxExample, staticTwoBreathTableExample } from './defaults';
import { deriveLayerModifiers } from './modifiers';
import { buildLayerSentence } from './sentence';

describe('deriveLayerModifiers', () => {
	it('selects dynamic-only distance modifiers for dynamic layers', () => {
		const modifiers = deriveLayerModifiers(dynamicMaxExample.layers[0]);

		expect(modifiers.map((modifier) => modifier.key)).toContain('dive.distance');
		expect(modifiers.find((modifier) => modifier.key === 'dive.distance')?.summary).toBe('open distance');
	});

	it('filters dynamic-only distance modifiers from static layers', () => {
		const modifiers = deriveLayerModifiers(staticMaxExample.layers[0]);

		expect(modifiers.map((modifier) => modifier.key)).not.toContain('dive.distance');
		expect(modifiers.find((modifier) => modifier.key === 'dive.duration')?.summary).toBe('open duration');
	});

	it('selects repeat shape only for repeated layers', () => {
		const singleLayerModifiers = deriveLayerModifiers(dynamicMaxExample.layers[0]);
		const repeatedLayerModifiers = deriveLayerModifiers(staticTwoBreathTableExample.layers[0]);

		expect(singleLayerModifiers.map((modifier) => modifier.key)).not.toContain('reps.shape');
		expect(repeatedLayerModifiers.find((modifier) => modifier.key === 'reps.shape')?.summary).toBe(
			'uniform layer repeat'
		);
	});

	it('lets the sentence renderer pick up new modifier definitions without renderer changes', () => {
		const sentence = buildLayerSentence(dynamicMaxExample.layers[0], 0, {
			modifierDefinitions: [
				{
					key: 'setup.safetyConstraint',
					segment: 'setup',
					label: 'Safety constraint',
					defaultLabel: 'coach-supervised',
					lockable: false,
					dependencies: { environments: ['wet'] }
				}
			]
		});

		expect(sentence.segments.find((segment) => segment.key === 'setup')?.summary).toBe(
			'coach-supervised'
		);
	});
});