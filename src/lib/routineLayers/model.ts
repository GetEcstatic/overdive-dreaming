export type LayerDiscipline = 'STA' | 'DYN' | 'DYNB' | 'DNF' | 'TORT';
export type DisciplineGroup = 'static' | 'dynamic' | 'dynamicTraining';
export type DisciplineSelectionMode = 'fixed' | 'log-time-selectable';
export type LayerValueMode = 'fixed' | 'open';
export type LayerEffort = 'max' | 'submax' | 'standard';
export type LayerDiveCapability = 'recording-link';
export type LungVolume = 'FL' | 'FRC' | 'RV';
export type TrainingEnvironment = 'wet' | 'dry' | 'both';
export type LayerIngredient = 'discipline' | 'breatheUp' | 'dive' | 'attributes' | 'repeat';
export type LayerAnalyticsRole =
	| 'warmup'
	| 'working-rep'
	| 'max-attempt'
	| 'submax-attempt'
	| 'recovery'
	| 'test-set';

export type CanonicalMetricKey =
	| 'durationSeconds'
	| 'distanceMeters'
	| 'repsCompleted'
	| 'restSeconds'
	| 'breatheUpSeconds'
	| 'lapTimes'
	| 'speedPerLap'
	| 'kicksPerLap'
	| 'armPullsPerLap'
	| 'heartRateSeries'
	| 'spO2Series'
	| 'minSpO2'
	| 'minHeartRate'
	| 'timeBelowSpO2Threshold'
	| 'breathingTechnique'
	| 'hoursSinceLastMeal'
	| 'waterTemperatureCelsius'
	| 'hrv'
	| 'restingHeartRate'
	| 'bodyWeightKg'
	| 'equipment'
	| 'facialGear'
	| 'fvcLiters'
	| 'fvcWithPackingLiters'
	| 'gasMix'
	| 'endSpO2'
	| 'recoveryQuality'
	| 'urgeToBreathe'
	| 'lucidity'
	| 'contractions'
	| 'packingVolumePercent'
	| 'lungVolume'
	| 'buddyName'
	| 'safetyOutcome'
	| 'competitionStatus'
	| 'cardColor'
	| 'recordTag'
	| 'rpe'
	| 'joyScale'
	| 'basalMood'
	| 'notes'
	| 'poolLengthMeters'
	| 'totalRoutineTimeSeconds'
	| 'cumulativeDiveTimeSeconds'
	| 'cumulativeRestSeconds'
	| 'longestHoldSeconds'
	| 'contractionsOnsetSeconds';

export type LayerDurationTarget =
	| { mode: 'open' }
	| { mode: 'fixed'; seconds: number };

export type LayerDistanceTarget =
	| { mode: 'open' }
	| { mode: 'fixed'; meters: number };

export type LayerDiveTarget = {
	duration?: LayerDurationTarget;
	distance?: LayerDistanceTarget;
};

export type LayerAttributes = {
	lungVolume: LungVolume;
	effort: LayerEffort;
	environment: TrainingEnvironment;
	repeatCount: number;
};

export type LayerLocks = Partial<Record<LayerIngredient, boolean>>;

export type RoutineMetricProfile = {
	standard: CanonicalMetricKey[];
	geek: CanonicalMetricKey[];
	byLayerRole?: Partial<Record<LayerAnalyticsRole, CanonicalMetricKey[]>>;
};

export type RoutineAuthoringLayer = {
	id: string;
	name?: string;
	discipline: LayerDiscipline;
	disciplineSelectionMode: DisciplineSelectionMode;
	allowedDisciplines?: LayerDiscipline[];
	breatheUp: LayerDurationTarget;
	dive: LayerDiveTarget;
	diveCapabilities?: LayerDiveCapability[];
	attributes: LayerAttributes;
	analyticsRole?: LayerAnalyticsRole;
	metricProfileId?: string;
	locks: LayerLocks;
};

export type ExpandedRoutinePlanRow = RoutineAuthoringLayer & {
	planRowId: string;
	sourceLayerId: string;
	repIndex: number;
	globalRowIndex: number;
	plannedMetricProfile: RoutineMetricProfile;
};

export type RoutineClassifications = {
	maxLike: boolean;
	intervalLike: boolean;
	tableLike: boolean;
	hybridLike: boolean;
	mixedDiscipline: boolean;
	dryCapable: boolean;
	containsTort: boolean;
	disciplineGroups: DisciplineGroup[];
};

export type DisplayMetricSuggestion = {
	hero: CanonicalMetricKey;
	secondary?: CanonicalMetricKey;
	tertiary?: CanonicalMetricKey;
};

export type RoutineLayerValidationIssue = {
	layerId: string;
	code:
		| 'invalid-repeat-count'
		| 'static-distance-target'
		| 'missing-dive-target'
		| 'invalid-fixed-duration'
		| 'invalid-fixed-distance'
		| 'missing-selectable-disciplines'
		| 'default-discipline-not-selectable';
	message: string;
};

const dynamicDisciplines: LayerDiscipline[] = ['DYN', 'DYNB', 'DNF'];
const dynamicTrainingDisciplines: LayerDiscipline[] = ['TORT'];

export function groupDiscipline(discipline: LayerDiscipline): DisciplineGroup {
	if (discipline === 'STA') return 'static';
	if (dynamicTrainingDisciplines.includes(discipline)) return 'dynamicTraining';
	return 'dynamic';
}

export function expandRoutineLayers(layers: RoutineAuthoringLayer[]): ExpandedRoutinePlanRow[] {
	const metricProfile = deriveMetricProfile(layers);
	let globalRowIndex = 0;

	return layers.flatMap((layer) => {
		const repeatCount = Math.max(1, Math.floor(layer.attributes.repeatCount));

		return Array.from({ length: repeatCount }, (_, repOffset) => {
			globalRowIndex += 1;
			const repIndex = repOffset + 1;

			return {
				...layer,
				planRowId: `${layer.id}:${repIndex}`,
				sourceLayerId: layer.id,
				repIndex,
				globalRowIndex,
				plannedMetricProfile: metricProfile
			};
		});
	});
}

export function validateRoutineLayers(layers: RoutineAuthoringLayer[]): RoutineLayerValidationIssue[] {
	return layers.flatMap((layer) => validateLayer(layer));
}

export function deriveRoutineClassifications(layers: RoutineAuthoringLayer[]): RoutineClassifications {
	const expandedRowCount = layers.reduce(
		(total, layer) => total + Math.max(1, Math.floor(layer.attributes.repeatCount)),
		0
	);
	const plannedDisciplines = new Set(layers.map((layer) => layer.discipline));
	const selectableDisciplines = layers.flatMap((layer) => layer.allowedDisciplines ?? []);
	const allPossibleDisciplines = new Set([...plannedDisciplines, ...selectableDisciplines]);
	const groups = unique([...allPossibleDisciplines].map(groupDiscipline));
	const hasMaxLayer = layers.some(
		(layer) => layer.attributes.effort === 'max' || layer.analyticsRole === 'max-attempt'
	);
	const hasSubmaxLayer = layers.some(
		(layer) => layer.attributes.effort === 'submax' || layer.analyticsRole === 'submax-attempt'
	);

	return {
		maxLike: expandedRowCount === 1 && hasMaxLayer,
		intervalLike: layers.length === 1 && expandedRowCount > 1,
		tableLike: layers.length > 1 || expandedRowCount > 1,
		hybridLike: expandedRowCount > 1 && (hasMaxLayer || hasSubmaxLayer),
		mixedDiscipline: groups.length > 1 || plannedDisciplines.size > 1,
		dryCapable: layers.some((layer) => layer.attributes.environment === 'dry' || layer.attributes.environment === 'both'),
		containsTort: allPossibleDisciplines.has('TORT'),
		disciplineGroups: groups
	};
}

export function deriveMetricProfile(layers: RoutineAuthoringLayer[]): RoutineMetricProfile {
	const groups = unique(layers.map((layer) => groupDiscipline(layer.discipline)));
	const hasDynamic = groups.includes('dynamic') || groups.includes('dynamicTraining');
	const hasStatic = groups.includes('static');
	const hasDry = layers.some((layer) => layer.attributes.environment === 'dry');
	const hasRepeat = layers.some((layer) => layer.attributes.repeatCount > 1);
	const hasDnf = layers.some((layer) => layer.discipline === 'DNF' || layer.allowedDisciplines?.includes('DNF'));

	const standard: CanonicalMetricKey[] = ['durationSeconds', 'breatheUpSeconds', 'rpe', 'joyScale', 'basalMood', 'buddyName', 'safetyOutcome', 'notes'];
	const geek: CanonicalMetricKey[] = ['heartRateSeries', 'spO2Series', 'breathingTechnique', 'hoursSinceLastMeal', 'hrv', 'restingHeartRate', 'bodyWeightKg', 'equipment', 'facialGear', 'fvcLiters', 'fvcWithPackingLiters', 'packingVolumePercent'];

	if (hasDynamic) {
		standard.push('distanceMeters', 'poolLengthMeters');
		geek.push('lapTimes', 'speedPerLap', 'kicksPerLap', 'waterTemperatureCelsius');
	}

	if (hasDnf) {
		geek.push('armPullsPerLap');
	}

	if (hasStatic) {
		geek.push('minSpO2', 'minHeartRate', 'contractionsOnsetSeconds');
	}

	if (hasDry) {
		standard.push('minSpO2', 'minHeartRate');
		geek.push('timeBelowSpO2Threshold', 'minHeartRate');
	}

	if (hasRepeat) {
		standard.push('repsCompleted', 'restSeconds', 'totalRoutineTimeSeconds', 'cumulativeDiveTimeSeconds');
		geek.push('cumulativeRestSeconds');
	}

	return {
		standard: unique(standard),
		geek: unique(geek),
		byLayerRole: {
			'max-attempt': ['durationSeconds', 'distanceMeters', 'breatheUpSeconds', 'safetyOutcome'],
			'submax-attempt': ['durationSeconds', 'distanceMeters', 'rpe', 'notes'],
			'working-rep': ['durationSeconds', 'distanceMeters', 'repsCompleted']
		}
	};
}

export function deriveDefaultTags(layers: RoutineAuthoringLayer[]): string[] {
	const classifications = deriveRoutineClassifications(layers);
	const tags: string[] = [];

	if (classifications.disciplineGroups.includes('static')) tags.push('static');
	if (classifications.disciplineGroups.includes('dynamic')) tags.push('dynamic');
	if (classifications.containsTort) tags.push('tort');
	if (classifications.dryCapable) tags.push('dry');
	if (classifications.intervalLike || classifications.tableLike) tags.push('table');
	if (layers.some((layer) => layer.attributes.effort === 'max')) tags.push('max');
	if (layers.some((layer) => layer.attributes.effort === 'submax')) tags.push('submax');

	return unique(tags);
}

export function deriveDisplayMetrics(layers: RoutineAuthoringLayer[]): DisplayMetricSuggestion {
	const classifications = deriveRoutineClassifications(layers);
	const hasDynamic = classifications.disciplineGroups.includes('dynamic') || classifications.disciplineGroups.includes('dynamicTraining');

	if (classifications.intervalLike || classifications.tableLike) {
		if (!hasDynamic && classifications.dryCapable) {
			return {
				hero: 'longestHoldSeconds',
				secondary: 'cumulativeDiveTimeSeconds',
				tertiary: 'timeBelowSpO2Threshold'
			};
		}

		return {
			hero: hasDynamic ? 'totalRoutineTimeSeconds' : 'cumulativeDiveTimeSeconds',
			secondary: hasDynamic ? 'distanceMeters' : 'longestHoldSeconds',
			tertiary: hasDynamic ? 'speedPerLap' : 'repsCompleted'
		};
	}

	if (hasDynamic) {
		return {
			hero: 'distanceMeters',
			secondary: 'durationSeconds',
			tertiary: 'speedPerLap'
		};
	}

	return {
		hero: 'durationSeconds',
		secondary: 'breathingTechnique',
		tertiary: 'minHeartRate'
	};
}

function validateLayer(layer: RoutineAuthoringLayer): RoutineLayerValidationIssue[] {
	const issues: RoutineLayerValidationIssue[] = [];

	if (!Number.isInteger(layer.attributes.repeatCount) || layer.attributes.repeatCount < 1) {
		issues.push({
			layerId: layer.id,
			code: 'invalid-repeat-count',
			message: 'Repeat count must be a positive whole number.'
		});
	}

	if (!layer.dive.duration && !layer.dive.distance) {
		issues.push({
			layerId: layer.id,
			code: 'missing-dive-target',
			message: 'Every layer needs at least one dive target.'
		});
	}

	if (layer.discipline === 'STA' && layer.dive.distance) {
		issues.push({
			layerId: layer.id,
			code: 'static-distance-target',
			message: 'Static layers cannot have a distance target.'
		});
	}

	for (const target of [layer.breatheUp, layer.dive.duration]) {
		if (target?.mode === 'fixed' && target.seconds <= 0) {
			issues.push({
				layerId: layer.id,
				code: 'invalid-fixed-duration',
				message: 'Fixed duration targets must be greater than zero seconds.'
			});
		}
	}

	if (layer.dive.distance?.mode === 'fixed' && layer.dive.distance.meters <= 0) {
		issues.push({
			layerId: layer.id,
			code: 'invalid-fixed-distance',
			message: 'Fixed distance targets must be greater than zero meters.'
		});
	}

	if (layer.disciplineSelectionMode === 'log-time-selectable') {
		if (!layer.allowedDisciplines?.length) {
			issues.push({
				layerId: layer.id,
				code: 'missing-selectable-disciplines',
				message: 'Selectable discipline layers need allowed disciplines.'
			});
		} else if (!layer.allowedDisciplines.includes(layer.discipline)) {
			issues.push({
				layerId: layer.id,
				code: 'default-discipline-not-selectable',
				message: 'Allowed disciplines must include the default discipline.'
			});
		}
	}

	return issues;
}

function unique<T>(items: T[]): T[] {
	return [...new Set(items)];
}

export function isDynamicDiscipline(discipline: LayerDiscipline): boolean {
	return dynamicDisciplines.includes(discipline) || dynamicTrainingDisciplines.includes(discipline);
}