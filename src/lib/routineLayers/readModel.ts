import type { RoutineTemplate } from '$lib/types';
import {
	getRoutineTemplateLayers,
	hasLayerRoutineTemplateContract,
	projectLayersToLegacyRoutineProjection
} from './contract';
import type { LegacyRoutineProjection, RoutineTemplateWithLayers } from './contract';
import { expandRoutineLayers, validateRoutineLayers } from './model';
import type { ExpandedRoutinePlanRow, RoutineAuthoringLayer, RoutineLayerValidationIssue } from './model';

export type RoutineLayerReadSource = 'versioned-template' | 'legacy-projection';

export type RoutineLayerReadModel = {
	routine: RoutineTemplate | RoutineTemplateWithLayers;
	source: RoutineLayerReadSource;
	layers: RoutineAuthoringLayer[];
	expandedRows: ExpandedRoutinePlanRow[];
	validationIssues: RoutineLayerValidationIssue[];
	legacyProjection: LegacyRoutineProjection;
};

export function buildRoutineLayerReadModel(
	routine: RoutineTemplate | RoutineTemplateWithLayers
): RoutineLayerReadModel {
	const layers = getRoutineTemplateLayers(routine);

	return {
		routine,
		source: hasLayerRoutineTemplateContract(routine) ? 'versioned-template' : 'legacy-projection',
		layers,
		expandedRows: expandRoutineLayers(layers),
		validationIssues: validateRoutineLayers(layers),
		legacyProjection: projectLayersToLegacyRoutineProjection(layers)
	};
}