import type { ActivityType, Discipline, DisplayConfig, MetricType, RoutineTemplate, TableRow, TrainingEnvironment } from '$lib/types';
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
	CanonicalMetricKey,
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
	displayConfig: DisplayConfig;
};

export type LayerRoutineTemplateWriteProjection = LayerRoutineTemplateContract & LayerLegacyRoutineTemplateFields;

const metricTypeByCanonicalKey: Partial<Record<CanonicalMetricKey, MetricType>> = {
	durationSeconds: 'totalTime',
	distanceMeters: 'totalDistance',
	repsCompleted: 'repsCompleted',
	restSeconds: 'avgRestBetweenLaps',
	breatheUpSeconds: 'initialBreatheUpTime',
	lapTimes: 'avgTimePerLap',
	speedPerLap: 'avgSpeedMs',
	breathingTechnique: 'breathingTechnique',
	waterTemperatureCelsius: 'waterTemperature',
	hrv: 'hrv',
	restingHeartRate: 'restingHeartRate',
	packingVolumePercent: 'packingVolume',
	totalRoutineTimeSeconds: 'sessionDuration',
	cumulativeDiveTimeSeconds: 'cumulativeHoldTime',
	longestHoldSeconds: 'longestHold',
	contractionsOnsetSeconds: 'contractionsOnsetTime'
};

const metricLabels: Record<MetricType, string> = {
	totalDistance: 'Distance',
	totalTime: 'Time',
	repsCompleted: 'Reps',
	totalRepDistance: 'Total Rep Distance',
	repDuration: 'Rep Duration',
	avgTimePerLap: 'Avg Lap Time',
	avgTimePerRep: 'Avg Rep Time',
	avgRestBetweenLaps: 'Rest',
	totalBreathHoldTime: 'Breath Hold Time',
	totalBreathingTime: 'Breathing Time',
	totalBreaths: 'Breaths',
	poolLength: 'Pool Length',
	initialBreatheUpTime: 'Breathe-up',
	waterTemperature: 'Water Temperature',
	contractionsOnsetTime: 'Contractions',
	restingHeartRate: 'Resting HR',
	hrv: 'HRV',
	packingVolume: 'Packing',
	diveDuration: 'Dive Duration',
	diveDistance: 'Dive Distance',
	holdDuration: 'Hold Duration',
	lapDistance: 'Lap Distance',
	cumulativeHoldTime: 'Cumulative Hold',
	cumulativeDistance: 'Cumulative Distance',
	sessionDuration: 'Session Duration',
	longestHold: 'Longest Hold',
	avgSpeed: 'Avg Speed',
	maxRepSpeed: 'Fastest Rep',
	minRepSpeed: 'Slowest Rep',
	avgSpeedMs: 'Avg Speed',
	fastestLapSpeedMs: 'Fastest Lap',
	slowestLapSpeedMs: 'Slowest Lap',
	breathingTechnique: 'Breathing Technique'
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
		displayConfig: {
			heroMetric,
			heroMetricLabel: metricLabels[heroMetric],
			secondaryMetric,
			secondaryMetricLabel: metricLabels[secondaryMetric],
			tertiaryMetric,
			tertiaryMetricLabel: tertiaryMetric ? metricLabels[tertiaryMetric] : undefined
		}
	};
}

function metricTypeForCanonical(canonical: CanonicalMetricKey | undefined, fallback: MetricType): MetricType;
function metricTypeForCanonical(canonical: CanonicalMetricKey | undefined, fallback: undefined): MetricType | undefined;
function metricTypeForCanonical(canonical: CanonicalMetricKey | undefined, fallback: MetricType | undefined): MetricType | undefined {
	return canonical ? metricTypeByCanonicalKey[canonical] ?? fallback : fallback;
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