import type { RoutineTemplateFormData } from '$lib/types';
import { buildLayerRoutineTemplateWriteProjection, type LayerRoutineTemplateWriteProjection } from './contract';
import type { RoutineAuthoringLayer } from './model';

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
		...buildLayerRoutineTemplateWriteProjection(input.layers)
	});
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
	return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}