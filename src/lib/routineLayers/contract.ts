import type { ActivityType, Discipline, DisplayConfig, MetricType, RoutineTemplate, TableRow, TrackingConfig, TrainingEnvironment } from '$lib/types';
import { getMetricLabel, metricTypeForCanonicalKey } from '$lib/metrics/registry';
import { projectLegacyRoutineToLayers } from './legacy';
import {
	deriveDefaultTags,
	deriveDisplayMetrics,
	deriveMetricProfile,
	deriveRoutineClassifications,
	expandRoutineLayers,
	isDynamicDiscipline,
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

export type LayerLegacyRoutineTemplateFields = {
	disciplines: Discipline[];
	activityType: ActivityType;
	trainingEnvironment?: TrainingEnvironment;
	restBetweenReps?: number;
	repDistance?: number;
	numberOfReps?: number;
	table?: { rows: TableRow[] };
	tags: string[];
	defaultTags: string[];
	trackingConfig: TrackingConfig;
	displayConfig: DisplayConfig;
};

export type LayerRoutineTemplateWriteProjection = LayerRoutineTemplateContract & LayerLegacyRoutineTemplateFields;

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

export function buildLayerRoutineTemplateWriteProjection(
	layers: RoutineAuthoringLayer[]
): LayerRoutineTemplateWriteProjection {
	return {
		...projectLayersToLegacyRoutineTemplateFields(layers),
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

export function projectLayersToLegacyRoutineTemplateFields(
	layers: RoutineAuthoringLayer[]
): LayerLegacyRoutineTemplateFields {
	const projection = projectLayersToLegacyRoutineProjection(layers);
	const heroMetric = metricTypeForCanonical(projection.display.hero, 'totalTime');
	const secondaryMetric = metricTypeForCanonical(
		projection.display.secondary,
		heroMetric === 'totalDistance' ? 'totalTime' : 'totalDistance'
	);
	const tertiaryMetric = projection.display.tertiary
		? metricTypeForCanonical(projection.display.tertiary, undefined)
		: undefined;

	return {
		disciplines: projection.disciplines,
		activityType: projection.activityType,
		trainingEnvironment: projection.trainingEnvironment,
		restBetweenReps: projection.restBetweenReps,
		repDistance: projection.repDistance,
		numberOfReps: projection.numberOfReps,
		table: projection.table,
		tags: projection.defaultTags,
		defaultTags: projection.defaultTags,
		trackingConfig: deriveTrackingConfigFromLayers(layers),
		displayConfig: {
			heroMetric,
			heroMetricLabel: getMetricLabel(heroMetric),
			secondaryMetric,
			secondaryMetricLabel: getMetricLabel(secondaryMetric),
			tertiaryMetric,
			tertiaryMetricLabel: tertiaryMetric ? getMetricLabel(tertiaryMetric) : undefined
		}
	};
}

export function deriveTrackingConfigFromLayers(layers: RoutineAuthoringLayer[]): TrackingConfig {
	const hasDynamic = layers.some((layer) => isDynamicDiscipline(layer.discipline));
	const hasStatic = layers.some((layer) => layer.discipline === 'STA');
	const hasRepeated = layers.some((layer) => layer.attributes.repeatCount > 1) || layers.length > 1;
	const hasBreatheUp = layers.some((layer) => layer.breatheUp.mode === 'fixed' || layer.breatheUp.mode === 'open');
	const hasDistance = layers.some((layer) => layer.dive.distance !== undefined);
	const hasDuration = layers.some((layer) => layer.dive.duration !== undefined);
	const hasDryLayer = layers.some((layer) => layer.attributes.environment === 'dry');
	const isDryTraining = layers.every((layer) => layer.attributes.environment === 'dry');
	const hasWetCapableLayer = layers.some((layer) => layer.attributes.environment === 'wet' || layer.attributes.environment === 'both');
	const hasDnf = layers.some((layer) => layer.discipline === 'DNF' || layer.allowedDisciplines?.includes('DNF'));
	const hasNonFullLungLayer = layers.some((layer) => layer.attributes.lungVolume !== 'FL');

	return {
		trackPoolLength: hasDynamic,
		trackInitialBreatheUpTime: hasBreatheUp,
		trackTotalDistance: hasDistance,
		trackTotalTime: hasDuration,
		trackRepsCompleted: hasRepeated,
		trackRepDuration: hasDuration && hasRepeated,
		trackRepDistance: hasDistance && hasRepeated,
		trackTimePerLap: hasDynamic,
		trackRestBetweenLaps: hasRepeated,
		trackKicksPerLap: hasDynamic,
		trackArmPullsPerLap: hasDnf,
		trackAvgSpeed: hasDynamic,
		trackSpeedPerLap: hasDynamic,
		totalDistanceSource: hasDynamic ? 'either' : 'manual',
		totalTimeSource: 'either',
		timePerLapSource: hasDynamic ? 'recorder' : 'manual',
		speedPerLapSource: hasDynamic ? 'recorder' : 'manual',
		avgSpeedSource: hasDynamic ? 'either' : 'manual',
		trackBreathingTechnique: true,
		trackRPE: true,
		trackJoyScale: true,
		trackHoursSinceLastMeal: true,
		trackNotes: true,
		trackWaterTemperature: hasDynamic && hasWetCapableLayer,
		trackContractionsOnsetTime: hasStatic,
		trackEquipmentUsed: hasDynamic || hasStatic,
		trackBuddyName: hasWetCapableLayer,
		trackRestingHeartRate: true,
		trackHRV: true,
		trackPoolType: hasDynamic,
		trackSambaBO: hasWetCapableLayer,
		trackBreathsBetweenReps: hasRepeated,
		trackMenstrualCycleDay: false,
		trackFacialGear: hasDynamic || hasStatic,
		trackBasalMood: true,
		trackMinimumSpO2: hasDynamic || hasStatic || hasDryLayer,
		trackMinimumHR: hasDynamic || hasStatic || hasDryLayer,
		trackBodyWeight: true,
		trackPerRepSpO2: isDryTraining || hasRepeated,
		trackPerRepHR: isDryTraining || hasRepeated,
		trackSpO2Thresholds: isDryTraining || hasRepeated,
		isDryTraining,
		trackFVC: hasDynamic || hasStatic,
		trackFVCWithPacking: hasDynamic || hasStatic,
		trackPackingVolume: hasDynamic || hasStatic,
		trackLungVolume: hasDynamic || hasStatic || hasNonFullLungLayer
	};
}

function metricTypeForCanonical(canonical: Parameters<typeof metricTypeForCanonicalKey>[0], fallback: MetricType): MetricType;
function metricTypeForCanonical(canonical: Parameters<typeof metricTypeForCanonicalKey>[0], fallback: undefined): MetricType | undefined;
function metricTypeForCanonical(canonical: Parameters<typeof metricTypeForCanonicalKey>[0], fallback: MetricType | undefined): MetricType | undefined {
	return metricTypeForCanonicalKey(canonical) ?? fallback;
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
		diveCapabilities: layer.diveCapabilities ? [...layer.diveCapabilities] : undefined,
		breatheUp: { ...layer.breatheUp },
		dive: {
			duration: layer.dive.duration ? { ...layer.dive.duration } : undefined,
			distance: layer.dive.distance ? { ...layer.dive.distance } : undefined
		},
		attributes: { ...layer.attributes },
		locks: { ...layer.locks }
	};
}