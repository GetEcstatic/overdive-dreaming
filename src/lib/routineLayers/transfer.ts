import type { RoutineTemplate, RoutineTemplateFormData } from '$lib/types';
import {
	buildLayerRoutineTemplateWriteProjection,
	hasLayerRoutineTemplateContract,
	type LayerRoutineTemplateWriteProjection,
	type RoutineTemplateWithLayers
} from './contract';

export type RoutineTemplateTransferData = RoutineTemplateFormData & Partial<LayerRoutineTemplateWriteProjection>;

export function buildRoutineTemplateTransferData(routine: RoutineTemplate | RoutineTemplateWithLayers): RoutineTemplateTransferData {
	const baseData: RoutineTemplateFormData = stripUndefined({
		name: routine.name,
		description: routine.description,
		activityType: routine.activityType,
		protocolType: routine.protocolType,
		disciplines: routine.disciplines,
		tags: routine.tags,
		restBetweenReps: routine.restBetweenReps,
		repDistance: routine.repDistance,
		numberOfReps: routine.numberOfReps,
		table: routine.table,
		maxDivePosition: routine.maxDivePosition,
		maxDiveRepNumber: routine.maxDiveRepNumber,
		trainingEnvironment: routine.trainingEnvironment,
		routineTags: routine.routineTags,
		defaultTags: routine.defaultTags,
		selectableTags: routine.selectableTags,
		trackingConfig: routine.trackingConfig,
		displayConfig: routine.displayConfig,
		instructionalVideoUrl: routine.instructionalVideoUrl
	});

	if (!hasLayerRoutineTemplateContract(routine)) return baseData;

	return stripUndefined({
		...baseData,
		...buildLayerRoutineTemplateWriteProjection(routine.layers)
	});
}

export function mergeRoutineTemplateFormDataWithLayerContract(
	source: RoutineTemplate | RoutineTemplateWithLayers,
	formData: RoutineTemplateFormData
): RoutineTemplateTransferData {
	if (!hasLayerRoutineTemplateContract(source)) return stripUndefined(formData);

	return stripUndefined({
		...formData,
		...buildLayerRoutineTemplateWriteProjection(source.layers),
		name: formData.name,
		description: formData.description,
		trackingConfig: formData.trackingConfig,
		instructionalVideoUrl: formData.instructionalVideoUrl
	});
}

function stripUndefined<T>(value: T): T {
	return stripUndefinedValue(value) as T;
}

function stripUndefinedValue(value: unknown): unknown {
	if (value === undefined) return undefined;
	if (Array.isArray(value)) {
		return value.map(stripUndefinedValue).filter((entry) => entry !== undefined);
	}
	if (value !== null && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.map(([key, entry]) => [key, stripUndefinedValue(entry)] as const)
				.filter(([, entry]) => entry !== undefined)
		);
	}
	return value;
}