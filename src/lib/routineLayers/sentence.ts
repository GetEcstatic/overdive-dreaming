import type { RoutineAuthoringLayer } from './model';
import { deriveLayerModifiers, groupModifiersBySegment } from './modifiers';
import type { LayerModifierDefinition, LayerModifierSegmentKey, SelectedLayerModifier } from './modifiers';

export type LayerSentenceSegmentKey = LayerModifierSegmentKey;

export type LayerSentenceSegment = {
	key: LayerSentenceSegmentKey;
	label: string;
	summary: string;
	modifiers: LayerSentenceModifier[];
	details: string[];
	locked: boolean;
};

export type LayerSentenceModifier = {
	key: string;
	label: string;
	summary: string;
	locked: boolean;
};

export type LayerSentence = {
	layerId: string;
	label: string;
	segments: LayerSentenceSegment[];
};

export type LayerSentenceOptions = {
	modifierDefinitions?: LayerModifierDefinition[];
};

const segmentLabels: Record<LayerSentenceSegmentKey, string> = {
	discipline: 'Discipline',
	breatheUp: 'Breathe-up',
	dive: 'Dive',
	setup: 'Setup',
	reps: 'Reps'
};

const segmentOrder: LayerSentenceSegmentKey[] = ['discipline', 'breatheUp', 'dive', 'setup', 'reps'];

export function buildLayerSentence(
	layer: RoutineAuthoringLayer,
	layerIndex: number,
	options: LayerSentenceOptions = {}
): LayerSentence {
	const modifiersBySegment = groupModifiersBySegment(
		deriveLayerModifiers(layer, options.modifierDefinitions)
	);
	const segments = segmentOrder.map((key) => buildSegment(key, modifiersBySegment[key]));

	return {
		layerId: layer.id,
		label: `Layer ${layerIndex + 1}`,
		segments
	};
}

function buildSegment(key: LayerSentenceSegmentKey, modifiers: SelectedLayerModifier[]): LayerSentenceSegment {
	const summary = summarizeSegment(key, modifiers);
	const modifierDetails = modifiers.flatMap((modifier) => modifier.details);
	const locked = modifiers.some((modifier) => modifier.locked);

	return {
		key,
		label: segmentLabels[key],
		summary,
		modifiers: modifiers.map((modifier) => ({
			key: modifier.key,
			label: modifier.label,
			summary: modifier.summary,
			locked: modifier.locked
		})),
		details: [...modifierDetails, locked ? 'locked' : 'unlocked'],
		locked
	};
}

function summarizeSegment(key: LayerSentenceSegmentKey, modifiers: SelectedLayerModifier[]): string {
	if (modifiers.length === 0) return 'not applicable';

	if (key === 'dive') {
		const activeTargets = modifiers
			.map((modifier) => modifier.summary)
			.filter((summary) => !summary.startsWith('no '));

		return activeTargets.length ? activeTargets.join(' + ') : 'no dive target';
	}

	if (key === 'setup') return modifiers.map((modifier) => modifier.summary).join(' · ');
	if (key === 'reps') return modifiers[0].summary;

	return modifiers[0].summary;
}