import type { AttemptOption } from '$lib/utils/attemptCategories';
import { attemptOptionsForDiscipline } from '$lib/utils/attemptCategories';
import type { Discipline, MetricType, RepEditorData, RoutineLogPlanRow, RoutineTemplate, TrackingConfig } from '$lib/types';
import { metricRegistry, type MetricRegistryEntry } from '$lib/metrics/registry';
import { buildRoutineLogPlanRows } from './logPlan';
import { buildRoutineLayerReadModel } from './readModel';
import type { LayerDiscipline } from './model';

export type QuickLogControlPriority = 'standard' | 'advanced';
export type QuickLogControlGroup = 'session' | 'results' | 'row-details' | 'context' | 'advanced' | 'media';

export type QuickLogControlId =
	| 'discipline'
	| 'date-time'
	| 'visibility'
	| 'tags'
	| 'pool-length'
	| 'initial-breathe-up'
	| 'competition'
	| 'card-color'
	| 'record-tag'
	| 'total-distance'
	| 'total-time'
	| 'average-speed'
	| 'reps-completed'
	| 'rep-duration'
	| 'rep-distance'
	| 'breaths-between-reps'
	| 'row-results'
	| 'lap-splits'
	| 'kicks-per-lap'
	| 'arm-pulls-per-lap'
	| 'lung-volume'
	| 'breathing-technique'
	| 'rpe'
	| 'joy-scale'
	| 'meal-timing'
	| 'notes'
	| 'water-temperature'
	| 'equipment'
	| 'buddy'
	| 'pool-type'
	| 'safety-outcome'
	| 'resting-heart-rate'
	| 'hrv'
	| 'body-weight'
	| 'basal-mood'
	| 'facial-gear'
	| 'menstrual-cycle'
	| 'minimum-spo2'
	| 'minimum-hr'
	| 'contractions-onset'
	| 'biometric-import'
	| 'per-rep-spo2'
	| 'per-rep-hr'
	| 'spo2-thresholds'
	| 'fvc'
	| 'fvc-with-packing'
	| 'packing-volume'
	| 'lucidity'
	| 'urge-to-breathe'
	| 'contractions'
	| 'etco2'
	| 'expired-air'
	| 'lung-volume-loss'
	| 'gas-mix'
	| 'co2-tremor-onset'
	| 'mental-change-time'
	| 'recovery-quality'
	| 'end-spo2'
	| 'breathe-up-type'
	| 'photo'
	| 'youtube';

export type QuickLogControl = {
	id: QuickLogControlId;
	label: string;
	group: QuickLogControlGroup;
	priority: QuickLogControlPriority;
	reason: string;
};

export type QuickLogLayerGroup = {
	sourceLayerId: string;
	name: string;
	rows: RoutineLogPlanRow[];
	disciplines: Discipline[];
	selectableDisciplines: LayerDiscipline[];
	rowCount: number;
	environment: RoutineLogPlanRow['environment'];
	effort: RoutineLogPlanRow['effort'];
	analyticsRoles: string[];
};

export type QuickLogFieldGroup = {
	id: QuickLogControlGroup;
	label: string;
	controls: QuickLogControl[];
};

export type QuickLogUnsupportedMetricInput = {
	metric: MetricRegistryEntry;
	reason: string;
};

export type QuickLogReadModel = {
	plannedRows: RoutineLogPlanRow[];
	layerGroups: QuickLogLayerGroup[];
	fieldGroups: QuickLogFieldGroup[];
	standardControls: QuickLogControl[];
	advancedControls: QuickLogControl[];
	attemptOptions: AttemptOption[];
	defaultAdvancedOpen: boolean;
	isO2StaticRoutine: boolean;
	canUseRecordingCapture: boolean;
	showRepDurationShortcut: boolean;
	showRepDistanceShortcut: boolean;
	hasMixedRowDisciplines: boolean;
	hasRowFirstPlan: boolean;
	hasManualSplitEntry: boolean;
	hasTechniqueEntry: boolean;
	unsupportedMetricInputs: QuickLogUnsupportedMetricInput[];
};

const groupLabels: Record<QuickLogControlGroup, string> = {
	session: 'Session',
	results: 'Results',
	'row-details': 'Row details',
	context: 'Context',
	advanced: 'Advanced',
	media: 'Media'
};

const directMetricControlIds: Partial<Record<MetricType, QuickLogControlId>> = {
	totalDistance: 'total-distance',
	diveDistance: 'total-distance',
	totalTime: 'total-time',
	diveDuration: 'total-time',
	repsCompleted: 'reps-completed',
	repDuration: 'rep-duration',
	holdDuration: 'rep-duration',
	lapDistance: 'rep-distance',
	avgSpeed: 'average-speed',
	avgSpeedMs: 'average-speed',
	poolLength: 'pool-length',
	initialBreatheUpTime: 'initial-breathe-up',
	waterTemperature: 'water-temperature',
	contractionsOnsetTime: 'contractions-onset',
	restingHeartRate: 'resting-heart-rate',
	hrv: 'hrv',
	packingVolume: 'packing-volume',
	minimumSpO2: 'minimum-spo2',
	minimumHR: 'minimum-hr',
	kicksPerLap: 'kicks-per-lap',
	averageKicksPerLap: 'kicks-per-lap',
	armPullsPerLap: 'arm-pulls-per-lap',
	averageArmPullsPerLap: 'arm-pulls-per-lap',
	equipment: 'equipment',
	facialGear: 'facial-gear',
	fvcLiters: 'fvc',
	fvcWithPackingLiters: 'fvc-with-packing',
	gasMix: 'gas-mix',
	endSpO2: 'end-spo2',
	recoveryQuality: 'recovery-quality',
	urgeToBreathe: 'urge-to-breathe',
	lucidity: 'lucidity',
	contractions: 'contractions',
	safetyOutcome: 'safety-outcome',
	lungVolume: 'lung-volume',
	competitionStatus: 'competition',
	cardColor: 'card-color',
	recordTag: 'record-tag',
	breathingTechnique: 'breathing-technique'
};

const derivedMetricControlIds: Partial<Record<MetricType, QuickLogControlId>> = {
	totalRepDistance: 'row-results',
	avgTimePerLap: 'lap-splits',
	avgTimePerRep: 'row-results',
	avgRestBetweenLaps: 'row-results',
	totalBreathHoldTime: 'row-results',
	totalBreathingTime: 'row-results',
	totalBreaths: 'row-results',
	cumulativeHoldTime: 'row-results',
	cumulativeDistance: 'row-results',
	sessionDuration: 'row-results',
	longestHold: 'row-results',
	maxRepSpeed: 'lap-splits',
	minRepSpeed: 'lap-splits',
	fastestLapSpeedMs: 'lap-splits',
	slowestLapSpeedMs: 'lap-splits',
	timeBelowSpO2Threshold: 'spo2-thresholds'
};

const controlIdByTrackingFlag: Partial<Record<keyof TrackingConfig, QuickLogControlId>> = {
	trackTotalDistance: 'total-distance',
	trackTotalTime: 'total-time',
	trackRepsCompleted: 'reps-completed',
	trackRepDuration: 'rep-duration',
	trackRepDistance: 'rep-distance',
	trackRestBetweenLaps: 'row-results',
	trackBreathsBetweenReps: 'breaths-between-reps',
	trackPoolLength: 'pool-length',
	trackInitialBreatheUpTime: 'initial-breathe-up',
	trackAvgSpeed: 'average-speed',
	trackTimePerLap: 'lap-splits',
	trackSpeedPerLap: 'lap-splits',
	trackKicksPerLap: 'kicks-per-lap',
	trackArmPullsPerLap: 'arm-pulls-per-lap',
	trackBreathingTechnique: 'breathing-technique',
	trackRPE: 'rpe',
	trackJoyScale: 'joy-scale',
	trackHoursSinceLastMeal: 'meal-timing',
	trackNotes: 'notes',
	trackWaterTemperature: 'water-temperature',
	trackContractionsOnsetTime: 'contractions-onset',
	trackEquipmentUsed: 'equipment',
	trackBuddyName: 'buddy',
	trackRestingHeartRate: 'resting-heart-rate',
	trackHRV: 'hrv',
	trackPoolType: 'pool-type',
	trackSambaBO: 'safety-outcome',
	trackMenstrualCycleDay: 'menstrual-cycle',
	trackFacialGear: 'facial-gear',
	trackBasalMood: 'basal-mood',
	trackMinimumSpO2: 'minimum-spo2',
	trackMinimumHR: 'minimum-hr',
	trackBodyWeight: 'body-weight',
	trackPerRepSpO2: 'per-rep-spo2',
	trackPerRepHR: 'per-rep-hr',
	trackSpO2Thresholds: 'spo2-thresholds',
	trackFVC: 'fvc',
	trackFVCWithPacking: 'fvc-with-packing',
	trackPackingVolume: 'packing-volume',
	trackLungVolume: 'lung-volume',
	trackLucidity: 'lucidity',
	trackUrgeToBreathe: 'urge-to-breathe',
	trackContractions: 'contractions',
	trackETCO2: 'etco2',
	trackExpiredAirPostHold: 'expired-air',
	trackLungVolumeLossPerMin: 'lung-volume-loss',
	trackGasMix: 'gas-mix',
	trackCO2TremorOnset: 'co2-tremor-onset',
	trackMentalChangeTime: 'mental-change-time',
	trackRecoveryQuality: 'recovery-quality',
	trackEndSpO2: 'end-spo2',
	trackBreatheUpType: 'breathe-up-type',
	trackCompetitionStatus: 'competition',
	trackCardColor: 'card-color',
	trackRecordTag: 'record-tag'
};

export function buildQuickLogReadModel(routine: RoutineTemplate): QuickLogReadModel {
	const plannedRows = buildRoutineLogPlanRows(routine);
	const layerReadModel = buildRoutineLayerReadModel(routine);
	const layerGroups = buildLayerGroups(plannedRows, layerReadModel.layers);
	const controls = buildControls(routine, plannedRows);
	const controlIds = new Set(controls.map((control) => control.id));
	const standardControls = controls.filter((control) => control.priority === 'standard');
	const advancedControls = controls.filter((control) => control.priority === 'advanced');
	const isO2StaticRoutine = routineHasO2StaticIntent(routine);
	const hasDynamicRows = plannedRows.some(isDynamicRow);
	const hasStaticRows = plannedRows.some(isStaticRow);
	const hasMixedRowDisciplines = hasDynamicRows && hasStaticRows;

	return {
		plannedRows,
		layerGroups,
		fieldGroups: buildFieldGroups(controls),
		standardControls,
		advancedControls,
		attemptOptions: buildAttemptOptions(routine, plannedRows),
		defaultAdvancedOpen: isO2StaticRoutine || shouldOpenAdvancedByDefault(routine.trackingConfig, plannedRows),
		isO2StaticRoutine,
		canUseRecordingCapture: canUseRecordingCapture(plannedRows),
		showRepDurationShortcut: shouldShowRepDurationShortcut(routine.trackingConfig, plannedRows),
		showRepDistanceShortcut: shouldShowRepDistanceShortcut(routine.trackingConfig, plannedRows),
		hasMixedRowDisciplines,
		hasRowFirstPlan: plannedRows.length > 0,
		hasManualSplitEntry: controlIds.has('lap-splits'),
		hasTechniqueEntry: controlIds.has('kicks-per-lap') || controlIds.has('arm-pulls-per-lap'),
		unsupportedMetricInputs: findUnsupportedMetricInputs(routine.trackingConfig, controlIds)
	};
}

export type QuickLogRowSummary = {
	completedCount: number;
	totalDurationSeconds?: number;
	dynamicDurationSeconds?: number;
	dynamicDistanceMeters?: number;
	averageDynamicSpeedMs?: number;
	uniformRepDurationSeconds?: number;
	uniformRepDistanceMeters?: number;
};

export function deriveQuickLogRowSummary(plannedRows: RoutineLogPlanRow[], reps: RepEditorData[]): QuickLogRowSummary {
	const rowsByIndex = new Map(plannedRows.map((row) => [row.globalRowIndex, row]));
	const completedReps = reps.filter((rep) => rep.completed);
	let totalDurationSeconds = 0;
	let hasAnyDuration = false;
	let dynamicDurationSeconds = 0;
	let dynamicDistanceMeters = 0;
	const completedDurations: number[] = [];
	const completedDistances: number[] = [];

	for (const rep of completedReps) {
		const row = rowsByIndex.get(rep.repNumber);
		const duration = rep.actualDuration;
		const distance = rep.actualDistance;

		if (duration !== undefined) {
			totalDurationSeconds += duration;
			hasAnyDuration = true;
			completedDurations.push(duration);
		}

		if (row && isDynamicRow(row)) {
			if (duration !== undefined) dynamicDurationSeconds += duration;
			if (distance !== undefined) dynamicDistanceMeters += distance;
			if (distance !== undefined) completedDistances.push(distance);
		}
	}

	return {
		completedCount: completedReps.length,
		totalDurationSeconds: hasAnyDuration ? totalDurationSeconds : undefined,
		dynamicDurationSeconds: dynamicDurationSeconds > 0 ? dynamicDurationSeconds : undefined,
		dynamicDistanceMeters: dynamicDistanceMeters > 0 ? dynamicDistanceMeters : undefined,
		averageDynamicSpeedMs: dynamicDurationSeconds > 0 && dynamicDistanceMeters > 0
			? dynamicDistanceMeters / dynamicDurationSeconds
			: undefined,
		uniformRepDurationSeconds: uniformNumber(completedDurations),
		uniformRepDistanceMeters: uniformNumber(completedDistances)
	};
}

export function routineHasO2StaticIntent(routine: RoutineTemplate): boolean {
	const layers = (routine as RoutineTemplate & { layers?: { discipline?: string; allowedDisciplines?: string[] }[] }).layers ?? [];
	const hasO2StaticLayer = layers.some((layer) => layer.discipline === 'O2STA' || layer.allowedDisciplines?.includes('O2STA'));
	const config = routine.trackingConfig;
	const hasO2Tracking = Boolean(config.trackGasMix || config.trackETCO2 || config.trackEndSpO2 || config.trackBreatheUpType);
	const hasO2Tag = [...routine.tags, ...(routine.defaultTags ?? []), ...(routine.routineTags ?? [])].some((tag) => /^o2$|^o2-|^oxygen$|^nitrox$/.test(tag.toLowerCase()));

	return hasO2StaticLayer || (routine.disciplines.includes('STA') && (hasO2Tracking || hasO2Tag));
}

function buildLayerGroups(
	rows: RoutineLogPlanRow[],
	layers: ReturnType<typeof buildRoutineLayerReadModel>['layers']
): QuickLogLayerGroup[] {
	const groups = new Map<string, RoutineLogPlanRow[]>();
	const layersById = new Map(layers.map((layer) => [layer.id, layer]));

	for (const row of rows) {
		groups.set(row.sourceLayerId, [...(groups.get(row.sourceLayerId) ?? []), row]);
	}

	return [...groups.entries()].map(([sourceLayerId, groupRows]) => {
		const firstRow = groupRows[0];
		const sourceLayer = layersById.get(sourceLayerId);
		const selectableDisciplines = sourceLayer?.disciplineSelectionMode === 'log-time-selectable'
			? unique(sourceLayer.allowedDisciplines ?? [sourceLayer.discipline])
			: [];

		return {
			sourceLayerId,
			name: firstRow.layerName ?? `Layer ${sourceLayerId}`,
			rows: groupRows,
			disciplines: unique(groupRows.map((row) => row.discipline)),
			selectableDisciplines,
			rowCount: groupRows.length,
			environment: firstRow.environment,
			effort: firstRow.effort,
			analyticsRoles: unique(groupRows.map((row) => row.analyticsRole).filter(Boolean) as string[])
		};
	});
}

function buildControls(routine: RoutineTemplate, plannedRows: RoutineLogPlanRow[]): QuickLogControl[] {
	const config = routine.trackingConfig;
	const showRepDurationShortcut = shouldShowRepDurationShortcut(config, plannedRows);
	const showRepDistanceShortcut = shouldShowRepDistanceShortcut(config, plannedRows);
	const controls: QuickLogControl[] = [
		control('date-time', 'Date and time', 'session', 'standard', 'Every quick log needs a session timestamp.'),
		control('visibility', 'Visibility', 'session', 'standard', 'Visibility is saved with the routine log.'),
		control('photo', 'Photo', 'media', 'advanced', 'Optional media can be attached after the core result.'),
		control('youtube', 'YouTube', 'media', 'advanced', 'Optional video links belong after the core result.')
	];

	if (routine.disciplines.length > 1) controls.push(control('discipline', 'Discipline', 'session', 'standard', 'The routine supports multiple log-time disciplines.'));
	if ((routine.selectableTags?.length ?? 0) > 0) controls.push(control('tags', 'Tags', 'session', 'standard', 'The routine defines selectable tags.'));
	if (config.trackPoolLength) controls.push(control('pool-length', 'Pool length', 'session', 'standard', 'Tracked by the routine metric profile.'));
	if (config.trackInitialBreatheUpTime) controls.push(control('initial-breathe-up', 'Initial breathe-up', 'session', 'standard', 'Tracked by the routine metric profile.'));
	if (config.trackCompetitionStatus) controls.push(control('competition', 'Competition', 'session', 'standard', 'Max-attempt comparison metadata is enabled.'));
	if (config.trackCardColor) controls.push(control('card-color', 'Card color', 'session', 'standard', 'Competition card comparison metadata is enabled.'));
	if (config.trackRecordTag) controls.push(control('record-tag', 'Record tag', 'session', 'standard', 'Record comparison metadata is enabled.'));

	if (config.trackTotalDistance) controls.push(control('total-distance', 'Total distance', 'results', 'standard', 'Primary dynamic result field.'));
	if (config.trackTotalTime) controls.push(control('total-time', 'Total time', 'results', 'standard', 'Primary static or dynamic duration field.'));
	if (config.trackAvgSpeed) controls.push(control('average-speed', 'Average speed', 'results', 'standard', 'Average speed can be recorded or reviewed from video.'));
	if (config.trackRepsCompleted) controls.push(control('reps-completed', 'Reps completed', 'results', 'standard', 'Repeated routines need completion count.'));
	if (showRepDurationShortcut) controls.push(control('rep-duration', 'Rep duration', 'results', 'standard', 'Repeated holds use row durations.'));
	if (showRepDistanceShortcut) controls.push(control('rep-distance', 'Rep distance', 'results', 'standard', 'Repeated dynamic rows use row distance.'));

	if (plannedRows.length > 1 || config.trackRepDuration || config.trackRepDistance || config.trackRestBetweenLaps) {
		controls.push(control('row-results', 'Row results', 'row-details', 'standard', 'The routine expands into row-level plan/results.'));
	}
	if (config.trackTimePerLap || config.trackSpeedPerLap) controls.push(control('lap-splits', 'Lap splits', 'row-details', 'standard', 'Lap times and speeds are collected at row level.'));
	if (config.trackKicksPerLap) controls.push(control('kicks-per-lap', 'Kicks', 'row-details', 'standard', 'Dynamic technique metrics are enabled.'));
	if (config.trackArmPullsPerLap) controls.push(control('arm-pulls-per-lap', 'Arm pulls', 'row-details', 'standard', 'DNF technique metrics are enabled.'));
	if (config.trackLungVolume || plannedRows.some((row) => row.lungVolume !== 'FL')) controls.push(control('lung-volume', 'Lung volume', 'row-details', 'standard', 'Lung-volume category affects analytics.'));

	if (config.trackBreathingTechnique) controls.push(control('breathing-technique', 'Breathing technique', 'context', 'advanced', 'Technique context is useful but not required for a fast poolside save.'));
	if (config.trackRPE) controls.push(control('rpe', 'RPE', 'context', 'standard', 'Perceived exertion is a common post-attempt rating.'));
	if (config.trackJoyScale) controls.push(control('joy-scale', 'Joy', 'context', 'standard', 'Enjoyment is a common post-attempt rating.'));
	if (config.trackHoursSinceLastMeal) controls.push(control('meal-timing', 'Meal timing', 'context', 'advanced', 'Nutrition timing is supporting context.'));
	if (config.trackNotes) controls.push(control('notes', 'Notes', 'context', 'standard', 'Notes capture the session context that metrics miss.'));
	if (config.trackBreathsBetweenReps) controls.push(control('breaths-between-reps', 'Breaths between reps', 'context', 'standard', 'Constrained-breath routines need their recovery breath count.'));
	if (config.trackWaterTemperature) controls.push(control('water-temperature', 'Water temperature', 'context', 'advanced', 'Environment values should not crowd the core result.'));
	if (config.trackEquipmentUsed) controls.push(control('equipment', 'Equipment', 'context', 'advanced', 'Equipment is useful comparison context.'));
	if (config.trackBuddyName) controls.push(control('buddy', 'Buddy', 'context', 'standard', 'Buddy/safety context is part of the session record.'));
	if (config.trackPoolType) controls.push(control('pool-type', 'Pool type', 'context', 'advanced', 'Pool type is supporting environment context.'));
	if (config.trackSambaBO) controls.push(control('safety-outcome', 'Safety outcome', 'context', 'standard', 'Safety outcome should remain visible when tracked.'));

	if (config.trackRestingHeartRate) controls.push(control('resting-heart-rate', 'Resting HR', 'advanced', 'advanced', 'Physiology context belongs in advanced entry.'));
	if (config.trackHRV) controls.push(control('hrv', 'HRV', 'advanced', 'advanced', 'Physiology context belongs in advanced entry.'));
	if (config.trackBodyWeight) controls.push(control('body-weight', 'Body weight', 'advanced', 'advanced', 'Body-weight context belongs in advanced entry.'));
	if (config.trackBasalMood) controls.push(control('basal-mood', 'Basal mood', 'advanced', 'advanced', 'Baseline mood is advanced context.'));
	if (config.trackFacialGear) controls.push(control('facial-gear', 'Facial gear', 'advanced', 'advanced', 'Gear detail belongs in advanced entry.'));
	if (config.trackMenstrualCycleDay) controls.push(control('menstrual-cycle', 'Cycle day', 'advanced', 'advanced', 'Cycle context belongs in advanced entry.'));
	if (config.trackMinimumSpO2) controls.push(control('minimum-spo2', 'Minimum SpO2', 'advanced', 'advanced', 'Manual SpO2 entry is physiology detail.'));
	if (config.trackMinimumHR) controls.push(control('minimum-hr', 'Minimum HR', 'advanced', 'advanced', 'Manual HR entry is physiology detail.'));
	if (config.trackContractionsOnsetTime) controls.push(control('contractions-onset', 'Contractions onset', 'advanced', 'advanced', 'Contraction timing is detailed physiology.'));
	if (config.trackPerRepSpO2 || config.trackPerRepHR || config.isDryTraining) controls.push(control('biometric-import', 'Biometric import', 'advanced', 'advanced', 'Dry static routines can import pulse-oximeter rows.'));
	if (config.trackPerRepSpO2) controls.push(control('per-rep-spo2', 'Per-rep SpO2', 'advanced', 'advanced', 'SpO2 values are collected per row.'));
	if (config.trackPerRepHR) controls.push(control('per-rep-hr', 'Per-rep HR', 'advanced', 'advanced', 'Heart-rate values are collected per row.'));
	if (config.trackSpO2Thresholds) controls.push(control('spo2-thresholds', 'SpO2 thresholds', 'advanced', 'advanced', 'Threshold totals come from biometric rows.'));
	if (config.trackFVC) controls.push(control('fvc', 'FVC', 'advanced', 'advanced', 'Lung-capacity context belongs in advanced entry.'));
	if (config.trackFVCWithPacking) controls.push(control('fvc-with-packing', 'FVC with packing', 'advanced', 'advanced', 'Lung-capacity context belongs in advanced entry.'));
	if (config.trackPackingVolume) controls.push(control('packing-volume', 'Packing volume', 'advanced', 'advanced', 'Packing detail belongs in advanced entry.'));
	if (config.trackLucidity) controls.push(control('lucidity', 'Lucidity', 'advanced', 'advanced', 'O2/static physiology detail belongs in advanced entry.'));
	if (config.trackUrgeToBreathe) controls.push(control('urge-to-breathe', 'Urge to breathe', 'advanced', 'advanced', 'O2/static physiology detail belongs in advanced entry.'));
	if (config.trackContractions) controls.push(control('contractions', 'Contractions', 'advanced', 'advanced', 'O2/static physiology detail belongs in advanced entry.'));
	if (config.trackETCO2) controls.push(control('etco2', 'ETCO2', 'advanced', 'advanced', 'O2/static physiology detail belongs in advanced entry.'));
	if (config.trackExpiredAirPostHold) controls.push(control('expired-air', 'Expired air', 'advanced', 'advanced', 'O2/static physiology detail belongs in advanced entry.'));
	if (config.trackLungVolumeLossPerMin) controls.push(control('lung-volume-loss', 'Lung volume loss', 'advanced', 'advanced', 'O2/static physiology detail belongs in advanced entry.'));
	if (config.trackGasMix) controls.push(control('gas-mix', 'Gas mix', 'advanced', 'advanced', 'Gas mix is O2/static attempt detail.'));
	if (config.trackCO2TremorOnset) controls.push(control('co2-tremor-onset', 'CO2 tremor onset', 'advanced', 'advanced', 'O2/static physiology detail belongs in advanced entry.'));
	if (config.trackMentalChangeTime) controls.push(control('mental-change-time', 'Mental change', 'advanced', 'advanced', 'O2/static physiology detail belongs in advanced entry.'));
	if (config.trackRecoveryQuality) controls.push(control('recovery-quality', 'Recovery quality', 'advanced', 'advanced', 'O2/static physiology detail belongs in advanced entry.'));
	if (config.trackEndSpO2) controls.push(control('end-spo2', 'End SpO2', 'advanced', 'advanced', 'O2/static physiology detail belongs in advanced entry.'));
	if (config.trackBreatheUpType) controls.push(control('breathe-up-type', 'Breathe-up type', 'advanced', 'advanced', 'O2/static physiology detail belongs in advanced entry.'));

	return uniqueControls(controls);
}

function buildAttemptOptions(routine: RoutineTemplate, plannedRows: RoutineLogPlanRow[]): AttemptOption[] {
	const defaultDiscipline = routine.disciplines[0] ?? plannedRows[0]?.discipline ?? 'STA';
	const hasDynamic = plannedRows.some(isDynamicRow) || routine.disciplines.some((discipline) => discipline !== 'STA');
	const isSingleStaticMax = plannedRows.length === 1 && plannedRows[0]?.discipline === 'STA' && plannedRows[0]?.effort === 'max';

	return attemptOptionsForDiscipline(defaultDiscipline).filter((option) => (
		option.kind !== 'o2-assisted' || (isSingleStaticMax && !hasDynamic)
	));
}

function canUseRecordingCapture(plannedRows: RoutineLogPlanRow[]): boolean {
	return plannedRows.length === 1 && isDynamicRow(plannedRows[0]) && plannedRows[0].effort === 'max';
}

function shouldShowRepDurationShortcut(config: TrackingConfig, plannedRows: RoutineLogPlanRow[]): boolean {
	if (!config.trackRepDuration) return false;
	const durationRows = plannedRows.filter((row) => row.plannedDurationSeconds !== undefined);
	return durationRows.length > 1 && uniformNumber(durationRows.map((row) => row.plannedDurationSeconds)) !== undefined;
}

function shouldShowRepDistanceShortcut(config: TrackingConfig, plannedRows: RoutineLogPlanRow[]): boolean {
	if (!config.trackRepDistance) return false;
	const distanceRows = plannedRows.filter((row) => isDynamicRow(row) && row.plannedDistanceMeters !== undefined);
	return distanceRows.length > 1 && uniformNumber(distanceRows.map((row) => row.plannedDistanceMeters)) !== undefined;
}

function isStaticRow(row: RoutineLogPlanRow): boolean {
	return row.discipline === 'STA';
}

function isDynamicRow(row: RoutineLogPlanRow): boolean {
	return row.discipline !== 'STA';
}

function uniformNumber(values: Array<number | undefined>): number | undefined {
	const numbers = values.filter((value): value is number => value !== undefined);
	if (numbers.length === 0) return undefined;
	const [first] = numbers;
	return numbers.every((value) => value === first) ? first : undefined;
}

function buildFieldGroups(controls: QuickLogControl[]): QuickLogFieldGroup[] {
	return (Object.keys(groupLabels) as QuickLogControlGroup[])
		.map((id) => ({ id, label: groupLabels[id], controls: controls.filter((control) => control.group === id) }))
		.filter((group) => group.controls.length > 0);
}

function shouldOpenAdvancedByDefault(config: TrackingConfig, plannedRows: RoutineLogPlanRow[]): boolean {
	return (
		config.isDryTraining ||
		config.trackPerRepSpO2 ||
		config.trackPerRepHR ||
		config.trackGasMix ||
		config.trackLucidity ||
		plannedRows.some((row) => row.environment === 'dry')
	);
}

function findUnsupportedMetricInputs(config: TrackingConfig, controlIds: Set<QuickLogControlId>): QuickLogUnsupportedMetricInput[] {
	return metricRegistry
		.filter((metric) => metric.trackingFlags.some((flag) => config[flag] === true))
		.filter((metric) => {
			const candidateControlIds = [
				directMetricControlIds[metric.key],
				derivedMetricControlIds[metric.key],
				...metric.trackingFlags.map((flag) => controlIdByTrackingFlag[flag])
			].filter(Boolean) as QuickLogControlId[];
			return !candidateControlIds.some((controlId) => controlIds.has(controlId));
		})
		.map((metric) => ({ metric, reason: 'No direct Quick Log input or derived row source is registered for this metric.' }));
}

function control(
	id: QuickLogControlId,
	label: string,
	group: QuickLogControlGroup,
	priority: QuickLogControlPriority,
	reason: string
): QuickLogControl {
	return { id, label, group, priority, reason };
}

function uniqueControls(controls: QuickLogControl[]): QuickLogControl[] {
	const seen = new Set<QuickLogControlId>();
	return controls.filter((control) => {
		if (seen.has(control.id)) return false;
		seen.add(control.id);
		return true;
	});
}

function unique<T>(values: T[]): T[] {
	return [...new Set(values)];
}