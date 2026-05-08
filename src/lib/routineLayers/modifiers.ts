import type {
	DisciplineGroup,
	LayerDiscipline,
	LayerDiveCapability,
	LayerIngredient,
	LayerValueMode,
	RoutineAuthoringLayer,
	TrainingEnvironment
} from './model';
import { groupDiscipline, isDynamicDiscipline } from './model';

export type LayerModifierSegmentKey = 'discipline' | 'breatheUp' | 'dive' | 'setup' | 'reps';

export type LayerModifierDependency = {
	disciplines?: LayerDiscipline[];
	disciplineGroups?: DisciplineGroup[];
	environments?: TrainingEnvironment[];
	requiresRepeat?: boolean;
	requiresDynamicDive?: boolean;
	requiresStaticDive?: boolean;
	requiresDiveCapability?: LayerDiveCapability;
	targetModes?: LayerValueMode[];
};

export type LayerModifierDefinition = {
	key: string;
	segment: LayerModifierSegmentKey;
	label: string;
	defaultLabel: string;
	lockable: boolean;
	lockIngredient?: LayerIngredient;
	dependencies?: LayerModifierDependency;
};

export type SelectedLayerModifier = LayerModifierDefinition & {
	summary: string;
	details: string[];
	locked: boolean;
};

export const layerModifierDefinitions: LayerModifierDefinition[] = [
	{
		key: 'discipline.default',
		segment: 'discipline',
		label: 'Default discipline',
		defaultLabel: 'DYN',
		lockable: true,
		lockIngredient: 'discipline'
	},
	{
		key: 'discipline.selectionMode',
		segment: 'discipline',
		label: 'Selection mode',
		defaultLabel: 'fixed discipline',
		lockable: true,
		lockIngredient: 'discipline'
	},
	{
		key: 'breatheUp.duration',
		segment: 'breatheUp',
		label: 'Duration',
		defaultLabel: 'open duration',
		lockable: true,
		lockIngredient: 'breatheUp'
	},
	{
		key: 'dive.distance',
		segment: 'dive',
		label: 'Distance target',
		defaultLabel: 'open distance',
		lockable: true,
		lockIngredient: 'dive',
		dependencies: { requiresDynamicDive: true }
	},
	{
		key: 'dive.duration',
		segment: 'dive',
		label: 'Duration target',
		defaultLabel: 'open duration',
		lockable: true,
		lockIngredient: 'dive'
	},
	{
		key: 'dive.recordingLink',
		segment: 'dive',
		label: 'Recording link',
		defaultLabel: 'not linked',
		lockable: false,
		dependencies: { requiresDynamicDive: true, requiresDiveCapability: 'recording-link' }
	},
	{
		key: 'setup.lungVolume',
		segment: 'setup',
		label: 'Lung volume',
		defaultLabel: 'FL',
		lockable: true,
		lockIngredient: 'attributes'
	},
	{
		key: 'setup.effort',
		segment: 'setup',
		label: 'Effort',
		defaultLabel: 'standard',
		lockable: true,
		lockIngredient: 'attributes'
	},
	{
		key: 'setup.environment',
		segment: 'setup',
		label: 'Environment',
		defaultLabel: 'wet',
		lockable: true,
		lockIngredient: 'attributes'
	},
	{
		key: 'reps.count',
		segment: 'reps',
		label: 'Repeat count',
		defaultLabel: 'single',
		lockable: true,
		lockIngredient: 'repeat'
	},
	{
		key: 'reps.shape',
		segment: 'reps',
		label: 'Repeat shape',
		defaultLabel: 'uniform layer repeat',
		lockable: true,
		lockIngredient: 'repeat',
		dependencies: { requiresRepeat: true }
	}
];

export function deriveLayerModifiers(
	layer: RoutineAuthoringLayer,
	definitions: LayerModifierDefinition[] = layerModifierDefinitions
): SelectedLayerModifier[] {
	return definitions
		.filter((definition) => appliesToLayer(definition, layer))
		.map((definition) => ({
			...definition,
			summary: summarizeModifier(definition, layer),
			details: detailModifier(definition, layer),
			locked: isModifierLocked(definition, layer)
		}));
}

export function groupModifiersBySegment(
	modifiers: SelectedLayerModifier[]
): Record<LayerModifierSegmentKey, SelectedLayerModifier[]> {
	return {
		discipline: modifiers.filter((modifier) => modifier.segment === 'discipline'),
		breatheUp: modifiers.filter((modifier) => modifier.segment === 'breatheUp'),
		dive: modifiers.filter((modifier) => modifier.segment === 'dive'),
		setup: modifiers.filter((modifier) => modifier.segment === 'setup'),
		reps: modifiers.filter((modifier) => modifier.segment === 'reps')
	};
}

function appliesToLayer(definition: LayerModifierDefinition, layer: RoutineAuthoringLayer): boolean {
	const dependencies = definition.dependencies;

	if (!dependencies) return true;
	if (dependencies.disciplines && !dependencies.disciplines.includes(layer.discipline)) return false;
	if (dependencies.disciplineGroups && !dependencies.disciplineGroups.includes(groupDiscipline(layer.discipline))) return false;
	if (dependencies.environments && !dependencies.environments.includes(layer.attributes.environment)) return false;
	if (dependencies.requiresRepeat && layer.attributes.repeatCount <= 1) return false;
	if (dependencies.requiresDynamicDive && !isDynamicDiscipline(layer.discipline)) return false;
	if (dependencies.requiresStaticDive && layer.discipline !== 'STA') return false;
	if (dependencies.requiresDiveCapability && !layer.diveCapabilities?.includes(dependencies.requiresDiveCapability)) return false;
	if (dependencies.targetModes && !layerHasTargetMode(layer, dependencies.targetModes)) return false;

	return true;
}

function summarizeModifier(definition: LayerModifierDefinition, layer: RoutineAuthoringLayer): string {
	switch (definition.key) {
		case 'discipline.default':
			return `default ${layer.discipline}`;
		case 'discipline.selectionMode':
			return layer.disciplineSelectionMode === 'log-time-selectable'
				? `selectable ${formatList(layer.allowedDisciplines ?? [])}`
				: 'fixed discipline';
		case 'breatheUp.duration':
			return formatDurationTarget(layer.breatheUp, 'duration');
		case 'dive.distance':
			return layer.dive.distance ? formatDistanceTarget(layer.dive.distance, 'distance') : 'open distance';
		case 'dive.duration':
			return layer.dive.duration ? formatDurationTarget(layer.dive.duration, 'duration') : 'open duration';
		case 'dive.recordingLink':
			return 'recording link enabled';
		case 'setup.lungVolume':
			return layer.attributes.lungVolume;
		case 'setup.effort':
			return layer.attributes.effort;
		case 'setup.environment':
			return layer.attributes.environment;
		case 'reps.count':
			return layer.attributes.repeatCount === 1 ? 'single' : `repeat ${layer.attributes.repeatCount}x`;
		case 'reps.shape':
			return 'uniform layer repeat';
		default:
			return definition.defaultLabel;
	}
}

function detailModifier(definition: LayerModifierDefinition, layer: RoutineAuthoringLayer): string[] {
	if (definition.key === 'discipline.selectionMode' && layer.disciplineSelectionMode === 'log-time-selectable') {
		return [`selectable ${formatList(layer.allowedDisciplines ?? [])}`];
	}

	if (definition.key === 'dive.recordingLink') {
		return ['attach recording media to result rows'];
	}

	return [summarizeModifier(definition, layer)];
}

function isModifierLocked(definition: LayerModifierDefinition, layer: RoutineAuthoringLayer): boolean {
	return Boolean(definition.lockIngredient && layer.locks[definition.lockIngredient]);
}

function layerHasTargetMode(layer: RoutineAuthoringLayer, modes: LayerValueMode[]): boolean {
	return [layer.breatheUp, layer.dive.distance, layer.dive.duration].some(
		(target) => target && modes.includes(target.mode)
	);
}

function formatDurationTarget(target: { mode: 'open' } | { mode: 'fixed'; seconds: number }, noun: string): string {
	if (target.mode === 'open') return `open ${noun}`;
	return `fixed ${noun} ${formatSeconds(target.seconds)}`;
}

function formatDistanceTarget(target: { mode: 'open' } | { mode: 'fixed'; meters: number }, noun: string): string {
	if (target.mode === 'open') return `open ${noun}`;
	return `fixed ${noun} ${target.meters}m`;
}

function formatSeconds(seconds: number): string {
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;

	return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function formatList(items: string[]): string {
	return items.length ? items.join('/') : 'none';
}