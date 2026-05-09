import type { RoutineTemplateFormData } from '$lib/types';
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