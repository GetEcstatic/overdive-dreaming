import { describe, expect, it } from 'vitest';
import type { RoutineTemplate } from '$lib/types';
import {
	dryRvTableExample,
	dynamicMaxExample,
	dynamicSweet16Example,
	staticMaxExample,
	staticTwoBreathTableExample
} from './defaults';
import { buildBlankRoutineLayer, buildLayerRoutineCreateData } from './create';
import { buildQuickLogReadModel } from './quickLogReadModel';

function routineFromLayers(name: string, layers: Parameters<typeof buildLayerRoutineCreateData>[0]['layers']): RoutineTemplate {
	const createData = buildLayerRoutineCreateData({ name, description: '', layers });
	return {
		id: name.toLowerCase().replaceAll(' ', '-'),
		createdBy: 'system',
		isPublic: true,
		createdAt: null as unknown as RoutineTemplate['createdAt'],
		updatedAt: null as unknown as RoutineTemplate['updatedAt'],
		...createData
	};
}

function controlIds(routine: RoutineTemplate): string[] {
	return buildQuickLogReadModel(routine).standardControls.map((control) => control.id);
}

describe('quick log read model', () => {
	it('builds a compact dynamic max logging surface', () => {
		const model = buildQuickLogReadModel(routineFromLayers('Dynamic max', dynamicMaxExample.layers));

		expect(model.plannedRows).toHaveLength(1);
		expect(model.layerGroups).toHaveLength(1);
		expect(model.layerGroups[0]).toMatchObject({ name: 'Max attempt', rowCount: 1, effort: 'max' });
		expect(controlIds(routineFromLayers('Dynamic max', dynamicMaxExample.layers))).toEqual(
			expect.arrayContaining(['total-distance', 'total-time', 'pool-length', 'lap-splits', 'kicks-per-lap'])
		);
		expect(model.hasManualSplitEntry).toBe(true);
		expect(model.hasTechniqueEntry).toBe(true);
		expect(model.defaultAdvancedOpen).toBe(false);
	});

	it('keeps static max focused on time, breathe-up, and safety context', () => {
		const model = buildQuickLogReadModel(routineFromLayers('Static max', staticMaxExample.layers));
		const ids = model.standardControls.map((control) => control.id);

		expect(model.plannedRows).toHaveLength(1);
		expect(ids).toEqual(expect.arrayContaining(['total-time', 'initial-breathe-up', 'rpe', 'joy-scale', 'notes']));
		expect(ids).not.toContain('total-distance');
		expect(model.hasManualSplitEntry).toBe(false);
	});

	it('groups Static 2-Breath rows by v2 source layer', () => {
		const model = buildQuickLogReadModel(routineFromLayers('Static 2-Breath', staticTwoBreathTableExample.layers));

		expect(model.plannedRows).toHaveLength(10);
		expect(model.layerGroups.map((group) => [group.name, group.rowCount])).toEqual([
			['Initial breathe-up and hold', 1],
			['2-breath reps', 9]
		]);
		expect(model.standardControls.map((control) => control.id)).toEqual(
			expect.arrayContaining(['row-results', 'reps-completed', 'rep-duration'])
		);
	});

	it('opens advanced entry for dry physiology routines', () => {
		const model = buildQuickLogReadModel(routineFromLayers('Dry RV Table', dryRvTableExample.layers));

		expect(model.defaultAdvancedOpen).toBe(true);
		expect(model.advancedControls.map((control) => control.id)).toEqual(
			expect.arrayContaining(['biometric-import', 'per-rep-spo2', 'per-rep-hr'])
		);
	});

	it('models repeated dynamic technique and split controls', () => {
		const model = buildQuickLogReadModel(routineFromLayers('Dynamic Sweet 16', dynamicSweet16Example.layers));

		expect(model.plannedRows).toHaveLength(16);
		expect(model.layerGroups[0].rowCount).toBe(16);
		expect(model.standardControls.map((control) => control.id)).toEqual(
			expect.arrayContaining(['row-results', 'lap-splits', 'kicks-per-lap'])
		);
		expect(model.hasTechniqueEntry).toBe(true);
	});

	it('handles a blank custom layer routine without unsupported metric gaps', () => {
		const model = buildQuickLogReadModel(routineFromLayers('Blank Custom', [buildBlankRoutineLayer()]));

		expect(model.plannedRows).toHaveLength(1);
		expect(model.layerGroups[0].name).toBe('Blank layer');
		expect(model.unsupportedMetricInputs).toEqual([]);
	});
});