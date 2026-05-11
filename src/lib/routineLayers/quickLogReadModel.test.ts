import { describe, expect, it } from 'vitest';
import type { RoutineTemplate } from '$lib/types';
import {
	dryRvTableExample,
	dynamicMaxExample,
	dynamicSweet16Example,
	o2StaticMaxExample,
	staticMaxExample,
	staticTwoBreathTableExample
} from './defaults';
import { buildBlankRoutineLayer, buildLayerRoutineCreateData } from './create';
import { buildQuickLogReadModel, deriveQuickLogRowSummary } from './quickLogReadModel';
import type { RoutineAuthoringLayer } from './model';

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

const mixedStaticDynamicLayers: RoutineAuthoringLayer[] = [
	{
		id: 'mixed-layer-1',
		name: 'Static entry',
		discipline: 'STA',
		disciplineSelectionMode: 'fixed',
		breatheUp: { mode: 'open' },
		dive: { duration: { mode: 'open' } },
		attributes: { lungVolume: 'FL', effort: 'standard', environment: 'wet', repeatCount: 1 },
		analyticsRole: 'working-rep',
		locks: {}
	},
	{
		id: 'mixed-layer-2',
		name: 'Dynamic exit',
		discipline: 'DYN',
		disciplineSelectionMode: 'fixed',
		breatheUp: { mode: 'fixed', seconds: 0 },
		dive: { duration: { mode: 'open' }, distance: { mode: 'open' } },
		attributes: { lungVolume: 'FL', effort: 'standard', environment: 'wet', repeatCount: 1 },
		analyticsRole: 'working-rep',
		locks: {}
	}
];

describe('quick log read model', () => {
	it('builds a compact dynamic max logging surface', () => {
		const model = buildQuickLogReadModel(routineFromLayers('Dynamic max', dynamicMaxExample.layers));

		expect(model.plannedRows).toHaveLength(1);
		expect(model.layerGroups).toHaveLength(1);
		expect(model.layerGroups[0]).toMatchObject({ name: 'Max attempt', rowCount: 1, effort: 'max' });
		expect(model.layerGroups[0].selectableDisciplines).toEqual(['DYN', 'DYNB', 'DNF', 'TORT']);
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

	it('defaults O2 static routines into advanced O2 entry', () => {
		const model = buildQuickLogReadModel(routineFromLayers('O2 Static Max', o2StaticMaxExample.layers));

		expect(model.isO2StaticRoutine).toBe(true);
		expect(model.defaultAdvancedOpen).toBe(true);
		expect(model.advancedControls.map((control) => control.id)).toEqual(
			expect.arrayContaining(['gas-mix', 'etco2', 'end-spo2', 'breathe-up-type', 'lucidity'])
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

	it('uses row-first rules for mixed static-to-dynamic routines', () => {
		const model = buildQuickLogReadModel(routineFromLayers('Pingu style', mixedStaticDynamicLayers));

		expect(model.plannedRows.map((row) => row.discipline)).toEqual(['STA', 'DYN']);
		expect(model.hasMixedRowDisciplines).toBe(true);
		expect(model.attemptOptions.map((option) => option.kind)).not.toContain('o2-assisted');
		expect(model.canUseRecordingCapture).toBe(false);
		expect(model.showRepDurationShortcut).toBe(false);
		expect(model.showRepDistanceShortcut).toBe(false);
	});

	it('keeps recording capture scoped to a single dynamic max attempt', () => {
		const dynamicModel = buildQuickLogReadModel(routineFromLayers('Dynamic max', dynamicMaxExample.layers));
		const sweet16Model = buildQuickLogReadModel(routineFromLayers('Sweet 16', dynamicSweet16Example.layers));

		expect(dynamicModel.canUseRecordingCapture).toBe(true);
		expect(sweet16Model.canUseRecordingCapture).toBe(false);
	});

	it('summarizes completed rows with dynamic-only speed math', () => {
		const plannedRows = buildQuickLogReadModel(routineFromLayers('Pingu style', mixedStaticDynamicLayers)).plannedRows;
		const summary = deriveQuickLogRowSummary(plannedRows, [
			{ repNumber: 1, completed: true, actualDuration: 120, actualDistance: 0 },
			{ repNumber: 2, completed: true, actualDuration: 40, actualDistance: 50 }
		]);

		expect(summary.completedCount).toBe(2);
		expect(summary.totalDurationSeconds).toBe(160);
		expect(summary.dynamicDistanceMeters).toBe(50);
		expect(summary.dynamicDurationSeconds).toBe(40);
		expect(summary.averageDynamicSpeedMs).toBe(1.25);
	});
});
