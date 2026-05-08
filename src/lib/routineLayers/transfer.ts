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

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
	return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}