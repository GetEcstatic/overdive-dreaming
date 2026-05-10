import type { Discipline, RoutineTemplate, TableRow } from '$lib/types';
import type {
	LayerDiscipline,
	LayerDiveTarget,
	LayerEffort,
	RoutineAuthoringLayer,
	TrainingEnvironment
} from './model';
import { isStaticDiscipline } from './model';

const dynamicDisciplines: LayerDiscipline[] = ['DYN', 'DYNB', 'DNF', 'TORT'];

export function projectLegacyRoutineToLayers(routine: RoutineTemplate): RoutineAuthoringLayer[] {
	if (routine.table?.rows.length) {
		return routine.table.rows.map((row) => projectTableRow(routine, row));
	}

	return [projectUniformOrSingleRoutine(routine)];
}

function projectUniformOrSingleRoutine(routine: RoutineTemplate): RoutineAuthoringLayer {
	const discipline = inferLayerDiscipline(routine);
	const repeatCount = routine.numberOfReps && routine.numberOfReps > 0 ? routine.numberOfReps : 1;

	return {
		id: `${routine.id || 'legacy-routine'}:layer-1`,
		discipline,
		...disciplineSelection(routine, discipline),
		breatheUp: routine.restBetweenReps ? { mode: 'fixed', seconds: routine.restBetweenReps } : { mode: 'open' },
		dive: uniformDiveTarget(routine, discipline),
		attributes: {
			lungVolume: 'FL',
			effort: inferEffort(routine),
			environment: projectEnvironment(routine.trainingEnvironment),
			repeatCount
		},
		analyticsRole: inferAnalyticsRole(routine),
		locks: {}
	};
}

function projectTableRow(routine: RoutineTemplate, row: TableRow): RoutineAuthoringLayer {
	const discipline = inferLayerDiscipline(routine);

	return {
		id: `${routine.id || 'legacy-routine'}:row-${row.repNumber}`,
		discipline,
		...disciplineSelection(routine, discipline),
		breatheUp: row.restBefore ? { mode: 'fixed', seconds: row.restBefore } : { mode: 'open' },
		dive: tableRowDiveTarget(row, discipline),
		attributes: {
			lungVolume: 'FL',
			effort: inferEffort(routine, row.repNumber),
			environment: projectEnvironment(routine.trainingEnvironment),
			repeatCount: 1
		},
		analyticsRole: inferAnalyticsRole(routine, row.repNumber),
		locks: {}
	};
}

function uniformDiveTarget(routine: RoutineTemplate, discipline: LayerDiscipline): LayerDiveTarget {
	if (isStaticDiscipline(discipline)) {
		return { duration: { mode: 'open' } };
	}

	return {
		distance: routine.repDistance ? { mode: 'fixed', meters: routine.repDistance } : { mode: 'open' },
		duration: { mode: 'open' }
	};
}

function tableRowDiveTarget(row: TableRow, discipline: LayerDiscipline): LayerDiveTarget {
	if (isStaticDiscipline(discipline)) {
		return {
			duration: row.targetDuration ? { mode: 'fixed', seconds: row.targetDuration } : { mode: 'open' }
		};
	}

	return {
		distance: row.targetDistance ? { mode: 'fixed', meters: row.targetDistance } : { mode: 'open' },
		duration: row.targetTime ? { mode: 'fixed', seconds: row.targetTime } : { mode: 'open' }
	};
}

function disciplineSelection(routine: RoutineTemplate, defaultDiscipline: LayerDiscipline): Pick<RoutineAuthoringLayer, 'disciplineSelectionMode' | 'allowedDisciplines'> {
	const allowedDisciplines = routine.disciplines.filter(isSupportedDiscipline) as LayerDiscipline[];

	if (allowedDisciplines.length > 1) {
		return {
			disciplineSelectionMode: 'log-time-selectable',
			allowedDisciplines: allowedDisciplines.includes(defaultDiscipline)
				? allowedDisciplines
				: [defaultDiscipline, ...allowedDisciplines]
		};
	}

	return { disciplineSelectionMode: 'fixed' };
}

function firstSupportedDiscipline(disciplines: Discipline[]): LayerDiscipline {
	return disciplines.find(isSupportedDiscipline) ?? 'DYN';
}

function inferLayerDiscipline(routine: RoutineTemplate): LayerDiscipline {
	const discipline = firstSupportedDiscipline(routine.disciplines);
	return discipline === 'STA' && hasO2StaticSignal(routine) ? 'O2STA' : discipline;
}

function isSupportedDiscipline(discipline: Discipline | LayerDiscipline): discipline is LayerDiscipline {
	return discipline === 'STA' || dynamicDisciplines.includes(discipline as LayerDiscipline);
}

function inferEffort(routine: RoutineTemplate, repNumber?: number): LayerEffort {
	if (routine.maxDiveRepNumber && repNumber && routine.maxDiveRepNumber === repNumber) return 'max';
	if (routine.activityType === 'max-attempt') return 'max';
	if (routine.activityType === 'submax-attempt') return 'submax';
	if (hasAnyTag(routine, ['max', 'max-attempt', 'pb', 'pb-attempt'])) return 'max';
	if (hasAnyTag(routine, ['submax', 'sub-max', 'submax-attempt'])) return 'submax';
	return 'standard';
}

function inferAnalyticsRole(routine: RoutineTemplate, repNumber?: number): RoutineAuthoringLayer['analyticsRole'] {
	const effort = inferEffort(routine, repNumber);
	if (effort === 'max') return 'max-attempt';
	if (effort === 'submax') return 'submax-attempt';
	return routine.numberOfReps || routine.table ? 'working-rep' : undefined;
}

function hasAnyTag(routine: RoutineTemplate, tags: string[]): boolean {
	const allTags = [...routine.tags, ...(routine.routineTags ?? []), ...(routine.defaultTags ?? [])];
	return tags.some((tag) => allTags.includes(tag));
}

function hasO2StaticSignal(routine: RoutineTemplate): boolean {
	const searchable = [routine.id, routine.name, routine.description, ...routine.tags, ...(routine.routineTags ?? []), ...(routine.defaultTags ?? [])]
		.filter(Boolean)
		.join(' ')
		.toLowerCase();
	const config = routine.trackingConfig;

	return (
		/\bo2\b/.test(searchable) ||
		searchable.includes('o2-assisted') ||
		searchable.includes('oxygen') ||
		searchable.includes('nitrox') ||
		searchable.includes('zero-nitrogen') ||
		config.trackGasMix === true ||
		config.trackETCO2 === true ||
		config.trackEndSpO2 === true ||
		config.trackBreatheUpType === true
	);
}

function projectEnvironment(environment: RoutineTemplate['trainingEnvironment']): TrainingEnvironment {
	return environment ?? 'wet';
}