import { describe, expect, it } from 'vitest';
import { dynamicMaxExample, staticTwoBreathTableExample } from './defaults';
import { ROUTINE_TEMPLATE_LAYER_VERSION } from './contract';
import { buildBlankRoutineLayer, buildLayerRoutineCreateData } from './create';

describe('buildLayerRoutineCreateData', () => {
	it('creates Dynamic Max data with v2 layers and legacy-compatible fields', () => {
		const data = buildLayerRoutineCreateData({
			name: '  Dynamic Max Custom  ',
			description: '  Max attempt from create flow  ',
			layers: dynamicMaxExample.layers
		});

		expect(data.name).toBe('Dynamic Max Custom');
		expect(data.description).toBe('Max attempt from create flow');
		expect(data.routineTemplateVersion).toBe(ROUTINE_TEMPLATE_LAYER_VERSION);
		expect(data.layers).toEqual(dynamicMaxExample.layers);
		expect(data.layers).not.toBe(dynamicMaxExample.layers);
		expect(data.layers[0].diveCapabilities).toEqual(['recording-link']);
		expect(data.disciplines).toEqual(['DYN', 'DYNB', 'DNF']);
		expect(data.layers[0].allowedDisciplines).toContain('TORT');
		expect(data.tags).toEqual(expect.arrayContaining(['dynamic', 'max']));
		expect(data.trackingConfig.trackTotalDistance).toBe(true);
		expect(data.trackingConfig.trackPoolLength).toBe(true);
		expect(data.displayConfig.heroMetric).toBe('totalDistance');
	});

	it('creates table compatibility fields for Static 2-Breath data', () => {
		const data = buildLayerRoutineCreateData({
			name: 'Static table',
			description: '',
			layers: staticTwoBreathTableExample.layers
		});

		expect(data.routineTemplateVersion).toBe(ROUTINE_TEMPLATE_LAYER_VERSION);
		expect(data.table?.rows).toHaveLength(10);
		expect(data.table?.rows[0]).toMatchObject({ restBefore: 240, targetDuration: 90 });
		expect(data.trackingConfig.trackTotalTime).toBe(true);
		expect(data.trackingConfig.trackRepsCompleted).toBe(true);
		expect(data.trackingConfig.trackRepDuration).toBe(true);
		expect(data.trackingConfig.trackBreathsBetweenReps).toBe(true);
		expect(data.trackingConfig.trackPerRepSpO2).toBe(true);
		expect(data.numberOfReps).toBeUndefined();
		expect(data.restBetweenReps).toBeUndefined();
		expect(data.displayConfig.heroMetric).toBe('cumulativeHoldTime');
	});

	it('creates valid data from a blank single-layer scaffold', () => {
		const blankLayer = buildBlankRoutineLayer();
		const data = buildLayerRoutineCreateData({
			name: 'Blank routine',
			description: 'Start small',
			layers: [blankLayer]
		});

		expect(data.routineTemplateVersion).toBe(ROUTINE_TEMPLATE_LAYER_VERSION);
		expect(data.layers).toEqual([blankLayer]);
		expect(data.disciplines).toEqual(['STA']);
		expect(data.activityType).toBe('free-training');
		expect(data.tags).toEqual(['static', 'dry']);
		expect(data.trackingConfig.trackTotalTime).toBe(true);
		expect(data.trackingConfig.trackRepsCompleted).toBe(false);
		expect(data.displayConfig.heroMetric).toBe('totalTime');
		expect(data.displayConfig.tertiaryMetric).toBe('minimumHR');
		expect(data.displayConfig.tertiaryMetricLabel).toBe('Minimum HR');
	});

	it('creates dynamic blank layers when requested', () => {
		const blankLayer = buildBlankRoutineLayer('blank-dyn-layer', 'DYN');
		const data = buildLayerRoutineCreateData({
			name: 'Blank dynamic routine',
			description: 'Start dynamic',
			layers: [blankLayer]
		});

		expect(data.layers[0].discipline).toBe('DYN');
		expect(data.layers[0].dive.distance).toEqual({ mode: 'open' });
		expect(data.disciplines).toEqual(['DYN']);
		expect(data.trackingConfig.trackTotalDistance).toBe(true);
		expect(data.trackingConfig.trackAvgSpeed).toBe(true);
		expect(data.trackingConfig.trackFVC).toBe(true);
		expect(data.displayConfig.heroMetric).toBe('totalDistance');
	});
});