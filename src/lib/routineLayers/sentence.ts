import type { LayerDistanceTarget, LayerDurationTarget, LayerIngredient, RoutineAuthoringLayer } from './model';

export type LayerSentenceSegmentKey = 'discipline' | 'breatheUp' | 'dive' | 'setup' | 'reps';

export type LayerSentenceSegment = {
	key: LayerSentenceSegmentKey;
	label: string;
	summary: string;
	details: string[];
	locked: boolean;
};

export type LayerSentence = {
	layerId: string;
	label: string;
	segments: LayerSentenceSegment[];
};

const segmentLabels: Record<LayerSentenceSegmentKey, string> = {
	discipline: 'Discipline',
	breatheUp: 'Breathe-up',
	dive: 'Dive',
	setup: 'Setup',
	reps: 'Reps'
};

const lockIngredientBySegment: Record<LayerSentenceSegmentKey, LayerIngredient> = {
	discipline: 'discipline',
	breatheUp: 'breatheUp',
	dive: 'dive',
	setup: 'attributes',
	reps: 'repeat'
};

export function buildLayerSentence(layer: RoutineAuthoringLayer, layerIndex: number): LayerSentence {
	const segments: LayerSentenceSegment[] = [
		buildDisciplineSegment(layer),
		buildBreatheUpSegment(layer),
		buildDiveSegment(layer),
		buildSetupSegment(layer),
		buildRepsSegment(layer)
	];

	return {
		layerId: layer.id,
		label: `Layer ${layerIndex + 1}`,
		segments
	};
}

function buildDisciplineSegment(layer: RoutineAuthoringLayer): LayerSentenceSegment {
	const details = [`default ${layer.discipline}`];

	if (layer.disciplineSelectionMode === 'log-time-selectable') {
		details.push(`selectable ${formatList(layer.allowedDisciplines ?? [])}`);
	} else {
		details.push('fixed discipline');
	}

	return segment(layer, 'discipline', details[0], details);
}

function buildBreatheUpSegment(layer: RoutineAuthoringLayer): LayerSentenceSegment {
	const summary = formatDurationTarget(layer.breatheUp, 'duration');
	return segment(layer, 'breatheUp', summary, [summary]);
}

function buildDiveSegment(layer: RoutineAuthoringLayer): LayerSentenceSegment {
	const targetParts = [
		layer.dive.distance ? formatDistanceTarget(layer.dive.distance, 'distance') : undefined,
		layer.dive.duration ? formatDurationTarget(layer.dive.duration, 'duration') : undefined
	].filter(Boolean) as string[];
	const summary = targetParts.length ? targetParts.join(' + ') : 'no dive target';
	const details = [...targetParts];

	if (details.length === 0) details.push('missing dive target');

	return segment(layer, 'dive', summary, details);
}

function buildSetupSegment(layer: RoutineAuthoringLayer): LayerSentenceSegment {
	const details = [
		layer.attributes.lungVolume,
		layer.attributes.effort,
		layer.attributes.environment
	];

	return segment(layer, 'setup', details.join(' · '), details);
}

function buildRepsSegment(layer: RoutineAuthoringLayer): LayerSentenceSegment {
	const repeatCount = layer.attributes.repeatCount;
	const summary = repeatCount === 1 ? 'single' : `repeat ${repeatCount}x`;
	const details = repeatCount === 1 ? ['single'] : [`repeat ${repeatCount}x`, 'uniform layer repeat'];

	return segment(layer, 'reps', summary, details);
}

function segment(
	layer: RoutineAuthoringLayer,
	key: LayerSentenceSegmentKey,
	summary: string,
	details: string[]
): LayerSentenceSegment {
	const locked = Boolean(layer.locks[lockIngredientBySegment[key]]);

	return {
		key,
		label: segmentLabels[key],
		summary,
		details: [...details, locked ? 'locked' : 'unlocked'],
		locked
	};
}

function formatDurationTarget(target: LayerDurationTarget, noun: string): string {
	if (target.mode === 'open') return `open ${noun}`;
	return `fixed ${noun} ${formatSeconds(target.seconds)}`;
}

function formatDistanceTarget(target: LayerDistanceTarget, noun: string): string {
	if (target.mode === 'open') return `open ${noun}`;
	return `fixed ${noun} ${target.meters}m`;
}

function formatSeconds(seconds: number): string {
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;

	if (minutes === 0) return `${remainingSeconds}s`;
	return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function formatList(items: string[]): string {
	return items.length ? items.join('/') : 'none';
}