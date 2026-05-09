import { describe, expect, it } from 'vitest';
import type { RoutineTemplate } from '$lib/types';
import { dynamicMaxExample, dynamicSweet16Example } from './defaults';
import { auditLegacyRoutineMetricAttachment, auditRoutineMetricAttachment } from './attachmentAudit';
import { buildLayerRoutineTemplateWriteProjection, type RoutineTemplateWithLayers } from './contract';

function layeredRoutine(layers = dynamicMaxExample.layers): RoutineTemplateWithLayers {
	const projection = buildLayerRoutineTemplateWriteProjection(layers);
	return {
		id: 'routine-1',
		name: 'Routine',
		description: '',
		createdBy: 'system',
		isPublic: true,
		createdAt: null as unknown as RoutineTemplate['createdAt'],
		updatedAt: null as unknown as RoutineTemplate['updatedAt'],
		...projection
	};
}

describe('routine metric attachment audit', () => {
	it('reports current when a v2 routine already matches its layer projection', () => {
		const audit = auditRoutineMetricAttachment(layeredRoutine());

		expect(audit.status).toBe('current');
		expect(audit.trackingConfigChanges).toEqual([]);
		expect(audit.displayConfigChanges).toEqual([]);
	});

	it('reports missing metric tracking flags for existing v2 max routines', () => {
		const routine = layeredRoutine();
		delete routine.trackingConfig.trackCompetitionStatus;
		delete routine.trackingConfig.trackCardColor;
		delete routine.trackingConfig.trackRecordTag;

		const audit = auditRoutineMetricAttachment(routine);

		expect(audit.status).toBe('needs-update');
		expect(audit.trackingConfigChanges).toEqual(expect.arrayContaining([
			expect.objectContaining({ path: 'trackingConfig.trackCompetitionStatus', current: undefined, projected: true }),
			expect.objectContaining({ path: 'trackingConfig.trackCardColor', current: undefined, projected: true }),
			expect.objectContaining({ path: 'trackingConfig.trackRecordTag', current: undefined, projected: true })
		]));
	});

	it('does not inflate competition flags for existing v2 table routines', () => {
		const routine = layeredRoutine(dynamicSweet16Example.layers);
		delete routine.trackingConfig.trackCompetitionStatus;
		delete routine.trackingConfig.trackCardColor;
		delete routine.trackingConfig.trackRecordTag;

		const audit = auditRoutineMetricAttachment(routine);

		expect(audit.trackingConfigChanges).toEqual(expect.arrayContaining([
			expect.objectContaining({ path: 'trackingConfig.trackCompetitionStatus', projected: false }),
			expect.objectContaining({ path: 'trackingConfig.trackCardColor', projected: false }),
			expect.objectContaining({ path: 'trackingConfig.trackRecordTag', projected: false })
		]));
	});

	it('reports display config drift from the layer projection', () => {
		const routine = layeredRoutine();
		routine.displayConfig.heroMetric = 'totalTime';
		routine.displayConfig.heroMetricLabel = 'Time';

		const audit = auditRoutineMetricAttachment(routine);

		expect(audit.status).toBe('needs-update');
		expect(audit.displayConfigChanges).toEqual(expect.arrayContaining([
			expect.objectContaining({ path: 'displayConfig.heroMetric', current: 'totalTime', projected: 'totalDistance' }),
			expect.objectContaining({ path: 'displayConfig.heroMetricLabel', current: 'Time', projected: 'Distance' })
		]));
	});

	it('skips legacy routines until a legacy attachment strategy is chosen', () => {
		const audit = auditRoutineMetricAttachment({
			id: 'legacy-1',
			name: 'Legacy routine',
			trackingConfig: {} as RoutineTemplate['trackingConfig'],
			displayConfig: {} as RoutineTemplate['displayConfig']
		});

		expect(audit.status).toBe('not-layered');
		expect(audit.updateProjection).toBeUndefined();
	});

	it('reports legacy projection candidates without creating a write projection', () => {
		const report = auditLegacyRoutineMetricAttachment({
			id: 'legacy-dyn-table',
			name: 'Legacy Dynamic Table',
			description: '',
			disciplines: ['DYN'],
			tags: [],
			numberOfReps: 4,
			repDistance: 50,
			restBetweenReps: 45,
			trackingConfig: {} as RoutineTemplate['trackingConfig'],
			displayConfig: {} as RoutineTemplate['displayConfig'],
			createdBy: 'system',
			isPublic: true,
			createdAt: null as unknown as RoutineTemplate['createdAt'],
			updatedAt: null as unknown as RoutineTemplate['updatedAt']
		});

		expect(report).toMatchObject({
			routineId: 'legacy-dyn-table',
			routineName: 'Legacy Dynamic Table',
			layerCount: 1,
			issueMessages: []
		});
		expect(report?.trackingConfigChanges).toEqual(expect.arrayContaining([
			expect.objectContaining({ path: 'trackingConfig.trackRepDistance', projected: true }),
			expect.objectContaining({ path: 'trackingConfig.trackCompetitionStatus', projected: false })
		]));
	});
});
