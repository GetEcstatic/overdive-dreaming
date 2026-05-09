import type { DisplayConfig, RoutineTemplate, TrackingConfig } from '$lib/types';
import {
	buildLayerRoutineTemplateWriteProjection,
	hasLayerRoutineTemplateContract,
	validateLayerRoutineTemplateContract,
	type LayerRoutineTemplateWriteProjection
} from './contract';

export type RoutineMetricAttachmentStatus = 'current' | 'needs-update' | 'not-layered' | 'invalid-layers';

export type RoutineProjectionDiff = {
	path: string;
	current: unknown;
	projected: unknown;
};

export type RoutineMetricAttachmentAudit = {
	routineId: string;
	routineName: string;
	status: RoutineMetricAttachmentStatus;
	trackingConfigChanges: RoutineProjectionDiff[];
	displayConfigChanges: RoutineProjectionDiff[];
	issueMessages: string[];
	updateProjection?: LayerRoutineTemplateWriteProjection;
};

export function auditRoutineMetricAttachment(
	routine: Partial<RoutineTemplate> & { id?: string; name?: string }
): RoutineMetricAttachmentAudit {
	const routineId = routine.id ?? '(unknown)';
	const routineName = routine.name ?? '(unnamed routine)';

	if (!hasLayerRoutineTemplateContract(routine)) {
		return emptyAudit(routineId, routineName, 'not-layered');
	}

	const issues = validateLayerRoutineTemplateContract(routine);
	if (issues.length > 0) {
		return {
			...emptyAudit(routineId, routineName, 'invalid-layers'),
			issueMessages: issues.map((issue) => issue.message)
		};
	}

	const updateProjection = buildLayerRoutineTemplateWriteProjection(routine.layers);
	const trackingConfigChanges = diffFlatObject(
		'trackingConfig',
		routine.trackingConfig ?? {},
		updateProjection.trackingConfig
	);
	const displayConfigChanges = diffFlatObject(
		'displayConfig',
		routine.displayConfig ?? {},
		updateProjection.displayConfig
	);

	return {
		routineId,
		routineName,
		status: trackingConfigChanges.length || displayConfigChanges.length ? 'needs-update' : 'current',
		trackingConfigChanges,
		displayConfigChanges,
		issueMessages: [],
		updateProjection
	};
}

function emptyAudit(
	routineId: string,
	routineName: string,
	status: RoutineMetricAttachmentStatus
): RoutineMetricAttachmentAudit {
	return {
		routineId,
		routineName,
		status,
		trackingConfigChanges: [],
		displayConfigChanges: [],
		issueMessages: []
	};
}

function diffFlatObject(pathPrefix: string, current: object, projected: object): RoutineProjectionDiff[] {
	const currentRecord = current as Record<string, unknown>;
	const projectedRecord = projected as Record<string, unknown>;
	const keys = new Set([...Object.keys(currentRecord), ...Object.keys(projectedRecord)]);
	return [...keys]
		.sort()
		.filter((key) => !valuesEqual(currentRecord[key], projectedRecord[key]))
		.map((key) => ({
			path: `${pathPrefix}.${key}`,
			current: currentRecord[key],
			projected: projectedRecord[key]
		}));
}

function valuesEqual(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}
