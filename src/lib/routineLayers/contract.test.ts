import { describe, expect, it } from 'vitest';
import type { RoutineTemplate } from '$lib/types';
import { dynamicMaxExample, dynamicSweet16Example, staticTwoBreathTableExample } from './defaults';
import {
	ROUTINE_TEMPLATE_LAYER_VERSION,
	buildLayerRoutineTemplateContract,
	buildLayerRoutineTemplateWriteProjection,
	deriveTrackingConfigFromLayers,
	getRoutineTemplateLayers,
	hasLayerRoutineTemplateContract,
	projectLayersToLegacyRoutineProjection,
	projectLayersToLegacyRoutineTemplateFields,
	validateLayerRoutineTemplateContract,
	withLayerRoutineTemplateContract
} from './contract';

function routineTemplate(overrides: Partial<RoutineTemplate> = {}): RoutineTemplate {
	return {
		id: 'routine-1',
		name: 'Routine',
		description: '',
		disciplines: ['DYN'],
		tags: [],
		trackingConfig: {} as RoutineTemplate['trackingConfig'],
		displayConfig: {} as RoutineTemplate['displayConfig'],
		createdBy: 'system',
		isPublic: true,
		createdAt: null as unknown as RoutineTemplate['createdAt'],
		updatedAt: null as unknown as RoutineTemplate['updatedAt'],
		...overrides
	};
}

describe('layer routine template contract', () => {
	it('builds a versioned compact authoring-layer contract with derived data', () => {
		const contract = buildLayerRoutineTemplateContract(dynamicMaxExample.layers);

		expect(contract.routineTemplateVersion).toBe(ROUTINE_TEMPLATE_LAYER_VERSION);
		expect(contract.layers).toEqual(dynamicMaxExample.layers);
		expect(contract.layers).not.toBe(dynamicMaxExample.layers);
		expect(contract.layerDefaultTags).toEqual(expect.arrayContaining(['dynamic', 'tort', 'max']));
		expect(contract.layerDisplay.hero).toBe('distanceMeters');
		expect(contract.layerMetricProfile.standard).toEqual(expect.arrayContaining(['distanceMeters']));
	});

	it('attaches the contract to existing routine templates without removing legacy fields', () => {
		const routine = withLayerRoutineTemplateContract(
			routineTemplate({ id: 'dynamic-max', name: 'Dynamic Max', disciplines: ['DYN', 'DYNB', 'DNF'] }),
			dynamicMaxExample.layers
		);

		expect(hasLayerRoutineTemplateContract(routine)).toBe(true);
		expect(routine.id).toBe('dynamic-max');
		expect(routine.disciplines).toEqual(['DYN', 'DYNB', 'DNF']);
		expect(routine.layers[0].name).toBe('Max attempt');
		expect(validateLayerRoutineTemplateContract(routine)).toEqual([]);
	});

	it('projects v2 routines from stored layers and legacy routines through the same reader', () => {
		const layeredRoutine = withLayerRoutineTemplateContract(routineTemplate(), staticTwoBreathTableExample.layers);
		const legacyRoutine = routineTemplate({ numberOfReps: 16, repDistance: 50, restBetweenReps: 45 });

		expect(getRoutineTemplateLayers(layeredRoutine)).toHaveLength(2);
		expect(getRoutineTemplateLayers(legacyRoutine)[0]).toMatchObject({
			attributes: { repeatCount: 16 },
			dive: { distance: { mode: 'fixed', meters: 50 } }
		});
	});

	it('projects compact layers back to current routine display assumptions', () => {
		const projection = projectLayersToLegacyRoutineProjection(dynamicSweet16Example.layers);

		expect(projection).toMatchObject({
			disciplines: ['DYN'],
			activityType: 'structured-intervals',
			trainingEnvironment: 'wet',
			numberOfReps: 16,
			defaultTags: ['dynamic', 'table']
		});
		expect(projection.repDistance).toBeUndefined();
		expect(projection.table).toBeUndefined();
		expect(projection.display.hero).toBe('totalRoutineTimeSeconds');
	});

	it('projects multi-layer routines to table rows for legacy readers', () => {
		const projection = projectLayersToLegacyRoutineProjection(staticTwoBreathTableExample.layers);

		expect(projection.activityType).toBe('structured-intervals');
		expect(projection.disciplines).toEqual(['STA']);
		expect(projection.table?.rows).toHaveLength(10);
		expect(projection.table?.rows[0]).toMatchObject({
			repNumber: 1,
			restBefore: 240,
			targetDuration: 90
		});
		expect(projection.table?.rows[1]).toMatchObject({
			repNumber: 2,
			restBefore: 30,
			targetDuration: 90
		});
	});

	it('projects layers to legacy routine template fields for compatibility writes', () => {
		const fields = projectLayersToLegacyRoutineTemplateFields(staticTwoBreathTableExample.layers);

		expect(fields.disciplines).toEqual(['STA']);
		expect(fields.activityType).toBe('structured-intervals');
		expect(fields.tags).toEqual(['static', 'table']);
		expect(fields.defaultTags).toEqual(['static', 'table']);
		expect(fields.table?.rows).toHaveLength(10);
		expect(fields.numberOfReps).toBeUndefined();
		expect(fields.displayConfig).toMatchObject({
			heroMetric: 'cumulativeHoldTime',
			heroMetricLabel: 'Cumulative Hold',
			secondaryMetric: 'longestHold',
			secondaryMetricLabel: 'Longest Hold',
			tertiaryMetric: 'repsCompleted',
			tertiaryMetricLabel: 'Reps'
		});
	});

	it('builds a v2 write projection while preserving legacy compatibility fields', () => {
		const writeProjection = buildLayerRoutineTemplateWriteProjection(staticTwoBreathTableExample.layers);

		expect(writeProjection.routineTemplateVersion).toBe(ROUTINE_TEMPLATE_LAYER_VERSION);
		expect(writeProjection.layers).toEqual(staticTwoBreathTableExample.layers);
		expect(writeProjection.layerDefaultTags).toEqual(['static', 'table']);
		expect(writeProjection.disciplines).toEqual(['STA']);
		expect(writeProjection.activityType).toBe('structured-intervals');
		expect(writeProjection.trackingConfig.trackTotalTime).toBe(true);
		expect(writeProjection.trackingConfig.trackRepDuration).toBe(true);
		expect(writeProjection.trackingConfig.trackPerRepSpO2).toBe(true);
		expect(writeProjection.table?.rows).toHaveLength(10);
		expect(writeProjection.displayConfig.heroMetric).toBe('cumulativeHoldTime');
	});

	it('derives collection-first tracking from layer discipline and repeat shape', () => {
		const trackingConfig = deriveTrackingConfigFromLayers(dynamicSweet16Example.layers);

		expect(trackingConfig.trackTotalDistance).toBe(true);
		expect(trackingConfig.trackTotalTime).toBe(true);
		expect(trackingConfig.trackRepDistance).toBe(true);
		expect(trackingConfig.trackRepDuration).toBe(true);
		expect(trackingConfig.trackTimePerLap).toBe(true);
		expect(trackingConfig.trackSpeedPerLap).toBe(true);
		expect(trackingConfig.trackPerRepSpO2).toBe(true);
		expect(trackingConfig.trackFVC).toBe(true);
		expect(trackingConfig.trackHoursSinceLastMeal).toBe(true);
	});

	it('projects O2 static layers as stored STA while preserving O2 tracking intent', () => {
		const o2StaticLayer = {
			...staticTwoBreathTableExample.layers[0],
			id: 'o2-static-layer-1',
			discipline: 'O2STA' as const,
			disciplineSelectionMode: 'fixed' as const,
			allowedDisciplines: undefined
		};
		const fields = projectLayersToLegacyRoutineTemplateFields([o2StaticLayer]);

		expect(fields.disciplines).toEqual(['STA']);
		expect(fields.tags).toEqual(expect.arrayContaining(['static', 'o2']));
		expect(fields.trackingConfig.trackTotalTime).toBe(true);
		expect(fields.trackingConfig.trackGasMix).toBe(true);
		expect(fields.trackingConfig.trackETCO2).toBe(true);
		expect(fields.trackingConfig.trackEndSpO2).toBe(true);
		expect(fields.trackingConfig.trackBreatheUpType).toBe(true);
		expect(fields.displayConfig.heroMetric).toBe('totalTime');
	});

	it('rejects empty layer contracts before any Firestore write path uses them', () => {
		expect(validateLayerRoutineTemplateContract({ routineTemplateVersion: ROUTINE_TEMPLATE_LAYER_VERSION, layers: [] })).toEqual([
			expect.objectContaining({ code: 'missing-layers' })
		]);
	});
});