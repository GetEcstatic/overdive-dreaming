import type { ActivityType, Discipline, RoutineTemplate, TableRow, TrainingEnvironment } from '$lib/types';
import { projectLegacyRoutineToLayers } from './legacy';
import {
	deriveDefaultTags,
	deriveDisplayMetrics,
	deriveMetricProfile,
	deriveRoutineClassifications,
	expandRoutineLayers,
	validateRoutineLayers
} from './model';
import type {
	DisplayMetricSuggestion,
	RoutineAuthoringLayer,
	RoutineClassifications,
	RoutineLayerValidationIssue,
	RoutineMetricProfile
} from './model';

export const ROUTINE_TEMPLATE_LAYER_VERSION = 2 as const;

export type RoutineTemplateLayerVersion = typeof ROUTINE_TEMPLATE_LAYER_VERSION;

export type LayerRoutineTemplateContract = {
	routineTemplateVersion: RoutineTemplateLayerVersion;
	layers: RoutineAuthoringLayer[];
	layerMetricProfile: RoutineMetricProfile;
	layerClassifications: RoutineClassifications;
	layerDisplay: DisplayMetricSuggestion;
	layerDefaultTags: string[];
};

export type RoutineTemplateWithLayers = RoutineTemplate & LayerRoutineTemplateContract;

export type LayerRoutineContractIssue =
	| RoutineLayerValidationIssue
	| {
			layerId: 'routine';
			code: 'missing-layers' | 'unsupported-version';
			message: string;
	  };

export type LegacyRoutineProjection = {
	disciplines: Discipline[];
	activityType: ActivityType;
	trainingEnvironment?: TrainingEnvironment;
	restBetweenReps?: number;
	repDistance?: number;
	numberOfReps?: number;
	table?: { rows: TableRow[] };
	defaultTags: string[];
	display: DisplayMetricSuggestion;
	metricProfile: RoutineMetricProfile;
};

export function buildLayerRoutineTemplateContract(layers: RoutineAuthoringLayer[]): LayerRoutineTemplateContract {
	return {
		routineTemplateVersion: ROUTINE_TEMPLATE_LAYER_VERSION,
		layers: layers.map(cloneLayer),
		layerMetricProfile: deriveMetricProfile(layers),
		layerClassifications: deriveRoutineClassifications(layers),
		layerDisplay: deriveDisplayMetrics(layers),
		layerDefaultTags: deriveDefaultTags(layers)
	};
}

export function withLayerRoutineTemplateContract(
	routine: RoutineTemplate,
	layers: RoutineAuthoringLayer[]
): RoutineTemplateWithLayers {
	return {
		...routine,
		...buildLayerRoutineTemplateContract(layers)
	};
}

export function hasLayerRoutineTemplateContract(
	routine: Partial<RoutineTemplateWithLayers>
): routine is RoutineTemplateWithLayers {
	return routine.routineTemplateVersion === ROUTINE_TEMPLATE_LAYER_VERSION && Array.isArray(routine.layers);
}

export function validateLayerRoutineTemplateContract(
	routine: Partial<RoutineTemplateWithLayers>
): LayerRoutineContractIssue[] {
	if (routine.routineTemplateVersion !== undefined && routine.routineTemplateVersion !== ROUTINE_TEMPLATE_LAYER_VERSION) {
		return [
			{
				layerId: 'routine',
				code: 'unsupported-version',
				message: `Unsupported routine template layer version: ${routine.routineTemplateVersion}.`
			}
		];
	}

	if (!routine.layers?.length) {
		return [
			{
				layerId: 'routine',
				code: 'missing-layers',
				message: 'Layer routine templates need at least one authoring layer.'
			}
		];
	}

	return validateRoutineLayers(routine.layers);
}

export function getRoutineTemplateLayers(routine: RoutineTemplate | RoutineTemplateWithLayers): RoutineAuthoringLayer[] {
	if (hasLayerRoutineTemplateContract(routine)) {
		return routine.layers.map(cloneLayer);
	}

	return projectLegacyRoutineToLayers(routine);
}

export function projectLayersToLegacyRoutineProjection(layers: RoutineAuthoringLayer[]): LegacyRoutineProjection {
	const expandedRows = expandRoutineLayers(layers);
	const firstLayer = layers[0];
	const uniformLayer = layers.length === 1 ? layers[0] : undefined;
	const uniformDistance = uniformLayer?.dive.distance?.mode === 'fixed' ? uniformLayer.dive.distance.meters : undefined;
	const uniformRest = uniformLayer?.breatheUp.mode === 'fixed' ? uniformLayer.breatheUp.seconds : undefined;
	const uniformRepeatCount = uniformLayer ? Math.max(1, Math.floor(uniformLayer.attributes.repeatCount)) : undefined;
	const tableRows = expandedRows.map<TableRow>((row) => ({
		repNumber: row.globalRowIndex,
		restBefore: row.breatheUp.mode === 'fixed' ? row.breatheUp.seconds : 0,
		targetDuration: row.dive.duration?.mode === 'fixed' ? row.dive.duration.seconds : undefined,
		targetDistance: row.dive.distance?.mode === 'fixed' ? row.dive.distance.meters : undefined
	}));

	return {
		disciplines: projectDisciplines(layers),
		activityType: projectActivityType(layers),
		trainingEnvironment: firstLayer?.attributes.environment,
		restBetweenReps: uniformRest,
		repDistance: uniformDistance,
		numberOfReps: uniformRepeatCount,
		table: uniformLayer ? undefined : { rows: tableRows },
		defaultTags: deriveDefaultTags(layers),
		display: deriveDisplayMetrics(layers),
		metricProfile: deriveMetricProfile(layers)
	};
}

function projectDisciplines(layers: RoutineAuthoringLayer[]): Discipline[] {
	const projected = layers
		.flatMap((layer) => [layer.discipline, ...(layer.allowedDisciplines ?? [])])
		.filter((discipline): discipline is Discipline => discipline !== 'TORT');
	const fallbackDisciplines: Discipline[] = ['DYN'];

	return [...new Set(projected.length ? projected : fallbackDisciplines)];
}

function projectActivityType(layers: RoutineAuthoringLayer[]): ActivityType {
	const classifications = deriveRoutineClassifications(layers);
	const hasMaxLayer = layers.some((layer) => layer.analyticsRole === 'max-attempt' || layer.attributes.effort === 'max');
	const hasSubmaxLayer = layers.some((layer) => layer.analyticsRole === 'submax-attempt' || layer.attributes.effort === 'submax');
	const expandedRowCount = expandRoutineLayers(layers).length;

	if (expandedRowCount === 1 && hasMaxLayer) return 'max-attempt';
	if (expandedRowCount === 1 && hasSubmaxLayer) return 'submax-attempt';
	if (classifications.tableLike || classifications.intervalLike) return 'structured-intervals';
	return 'free-training';
}

function cloneLayer(layer: RoutineAuthoringLayer): RoutineAuthoringLayer {
	return {
		...layer,
		allowedDisciplines: layer.allowedDisciplines ? [...layer.allowedDisciplines] : undefined,
		breatheUp: { ...layer.breatheUp },
		dive: {
			duration: layer.dive.duration ? { ...layer.dive.duration } : undefined,
			distance: layer.dive.distance ? { ...layer.dive.distance } : undefined
		},
		attributes: { ...layer.attributes },
		locks: { ...layer.locks }
	};
}