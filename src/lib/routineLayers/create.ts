import type { RoutineTemplateFormData, TrackingConfig } from '$lib/types';
import { buildLayerRoutineTemplateWriteProjection, type LayerRoutineTemplateWriteProjection } from './contract';
import { isDynamicDiscipline, type LayerDiscipline, type RoutineAuthoringLayer } from './model';

export type CreateLayerRoutineInput = {
	name: string;
	description: string;
	layers: RoutineAuthoringLayer[];
};

export type LayerRoutineCreateData = RoutineTemplateFormData & LayerRoutineTemplateWriteProjection;

export function buildLayerRoutineCreateData(input: CreateLayerRoutineInput): LayerRoutineCreateData {
	return stripUndefined({
		name: input.name.trim(),
		description: input.description.trim(),
		trackingConfig: deriveTrackingConfig(input.layers),
		...buildLayerRoutineTemplateWriteProjection(input.layers)
	});
}

export function buildBlankRoutineLayer(id = 'blank-layer-1', discipline: LayerDiscipline = 'STA'): RoutineAuthoringLayer {
	return {
		id,
		name: 'Blank layer',
		discipline,
		disciplineSelectionMode: 'fixed',
		breatheUp: { mode: 'open' },
		dive: {
			duration: { mode: 'open' },
			distance: isDynamicDiscipline(discipline) ? { mode: 'open' } : undefined
		},
		attributes: {
			lungVolume: 'FL',
			effort: 'standard',
			environment: 'both',
			repeatCount: 1
		},
		locks: {}
	};
}

function deriveTrackingConfig(layers: RoutineAuthoringLayer[]): TrackingConfig {
	const hasDynamic = layers.some((layer) => isDynamicDiscipline(layer.discipline));
	const hasStatic = layers.some((layer) => layer.discipline === 'STA');
	const hasRepeated = layers.some((layer) => layer.attributes.repeatCount > 1) || layers.length > 1;
	const hasFixedOrOpenBreatheUp = layers.some((layer) => layer.breatheUp.mode === 'fixed' || layer.breatheUp.mode === 'open');
	const hasDistance = layers.some((layer) => layer.dive.distance !== undefined);
	const hasDuration = layers.some((layer) => layer.dive.duration !== undefined);
	const isDryTraining = layers.every((layer) => layer.attributes.environment === 'dry');

	return {
		trackPoolLength: hasDynamic,
		trackInitialBreatheUpTime: hasFixedOrOpenBreatheUp,
		trackTotalDistance: hasDistance && !hasRepeated,
		trackTotalTime: hasDuration && !hasRepeated,
		trackRepsCompleted: hasRepeated,
		trackRepDuration: hasDuration && hasRepeated,
		trackRepDistance: hasDistance && hasRepeated,
		trackTimePerLap: hasDynamic,
		trackRestBetweenLaps: hasRepeated,
		trackKicksPerLap: hasDynamic,
		trackArmPullsPerLap: hasDynamic,
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
		trackHoursSinceLastMeal: false,
		trackNotes: true,
		trackWaterTemperature: hasDynamic,
		trackContractionsOnsetTime: hasStatic,
		trackEquipmentUsed: false,
		trackBuddyName: !isDryTraining,
		trackRestingHeartRate: false,
		trackHRV: false,
		trackPoolType: hasDynamic,
		trackSambaBO: !isDryTraining,
		trackBreathsBetweenReps: false,
		trackMenstrualCycleDay: false,
		trackFacialGear: false,
		trackBasalMood: true,
		trackMinimumSpO2: isDryTraining || hasStatic,
		trackMinimumHR: isDryTraining || hasStatic,
		trackBodyWeight: false,
		trackPerRepSpO2: isDryTraining,
		trackPerRepHR: isDryTraining,
		trackSpO2Thresholds: isDryTraining,
		isDryTraining,
		trackFVC: false,
		trackFVCWithPacking: false,
		trackPackingVolume: false,
		trackLungVolume: layers.some((layer) => layer.attributes.lungVolume !== 'FL')
	};
}

function stripUndefined<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map((entry) => stripUndefined(entry)) as T;
	}

	if (value !== null && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value)
				.filter(([, entry]) => entry !== undefined)
				.map(([key, entry]) => [key, stripUndefined(entry)])
		) as T;
	}

	return value;
}