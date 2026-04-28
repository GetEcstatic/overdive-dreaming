import type {
	AttemptCategoryKind,
	AttemptConditions,
	BreathingGas,
	Discipline,
	LungVolume,
	RoutineLog
} from '$lib/types';

export interface AttemptCategoryInfo {
	key: string;
	label: string;
	isStandard: boolean;
	conditions: AttemptConditions;
	metric: 'time' | 'distance';
}

export interface AttemptOption {
	kind: AttemptCategoryKind;
	label: string;
	hint: string;
}

type AttemptSource = Partial<
	Pick<
		RoutineLog,
		| 'disciplineUsed'
		| 'attemptConditions'
		| 'defaultLungVolume'
		| 'gasMix'
		| 'breatheUpType'
	>
> & {
	disciplineUsed: Discipline;
};

export const DEFAULT_O2_GAS_MIX = '100% O2';

export function attemptOptionsForDiscipline(discipline: Discipline): AttemptOption[] {
	const base: AttemptOption[] = [
		{ kind: 'standard', label: 'Standard', hint: 'Air, normal starting volume' },
		{ kind: 'frc', label: 'FRC', hint: 'Relaxed exhale start' },
		{ kind: 'rv', label: 'RV', hint: 'Full exhale start' }
	];

	if (discipline === 'STA') {
		return [
			base[0],
			{ kind: 'o2-assisted', label: 'O2 assisted', hint: 'Oxygen or nitrox breathe-up' },
			base[1],
			base[2],
			{ kind: 'custom', label: 'Custom', hint: 'Another non-standard category' }
		];
	}

	return [
		...base,
		{ kind: 'custom', label: 'Custom', hint: 'Another non-standard category' }
	];
}

export function defaultConditionsForKind(
	kind: AttemptCategoryKind,
	existing?: Partial<AttemptConditions>
): AttemptConditions {
	switch (kind) {
		case 'o2-assisted':
			return {
				kind,
				breathingGas: existing?.breathingGas && existing.breathingGas !== 'air'
					? existing.breathingGas
					: 'oxygen',
				gasMix: existing?.gasMix || DEFAULT_O2_GAS_MIX,
				lungVolume: 'FL'
			};
		case 'frc':
			return { kind, lungVolume: 'FRC', breathingGas: 'air' };
		case 'rv':
			return { kind, lungVolume: 'RV', breathingGas: 'air' };
		case 'custom':
			return {
				kind,
				label: existing?.label,
				lungVolume: existing?.lungVolume,
				breathingGas: existing?.breathingGas,
				gasMix: existing?.gasMix
			};
		case 'standard':
		default:
			return { kind: 'standard', lungVolume: 'FL', breathingGas: 'air', countsForStandardPB: true };
	}
}

export function deriveAttemptCategory(source: AttemptSource): AttemptCategoryInfo {
	const conditions = normalizeConditions(source);
	const metric = source.disciplineUsed === 'STA' ? 'time' : 'distance';
	const isStandard =
		conditions.kind === 'standard' || conditions.countsForStandardPB === true;
	const key = `${source.disciplineUsed}:${conditions.kind}`;
	const label = formatAttemptCategoryLabel(source.disciplineUsed, conditions);

	return { key, label, isStandard, conditions, metric };
}

export function formatAttemptCategoryLabel(
	discipline: Discipline,
	conditions?: AttemptConditions
): string {
	const kind = conditions?.kind ?? 'standard';
	if (kind === 'standard') return discipline;
	if (kind === 'o2-assisted') return `O2 ${discipline}`;
	if (kind === 'frc') return `FRC ${discipline}`;
	if (kind === 'rv') return `RV ${discipline}`;
	const customLabel = conditions?.label?.trim();
	return customLabel ? `${customLabel} ${discipline}` : `Custom ${discipline}`;
}

export function formatAttemptBadge(
	log: Pick<RoutineLog, 'disciplineUsed' | 'pbCategoryLabel' | 'attemptConditions'>
): string | null {
	if (log.attemptConditions?.kind && log.attemptConditions.kind !== 'standard') {
		return formatAttemptCategoryLabel(log.disciplineUsed, log.attemptConditions).replace(
			new RegExp(`\\s${log.disciplineUsed}$`),
			''
		);
	}

	if (log.pbCategoryLabel && !/^(STA|DYN|DNF|DYNB)$/.test(log.pbCategoryLabel)) {
		return log.pbCategoryLabel.replace(/\s(STA|DYN|DNF|DYNB)$/, '');
	}

	return null;
}

export function resultForPB(
	discipline: Discipline,
	log: Pick<RoutineLog, 'totalTime' | 'diveDuration' | 'totalDistance' | 'diveDistance'>
): number | undefined {
	const value =
		discipline === 'STA'
			? log.totalTime ?? log.diveDuration
			: log.totalDistance ?? log.diveDistance;
	return typeof value === 'number' && value > 0 ? value : undefined;
}

function normalizeConditions(source: AttemptSource): AttemptConditions {
	if (source.attemptConditions?.kind) {
		const explicit = source.attemptConditions;
		return {
			...defaultConditionsForKind(explicit.kind, explicit),
			...explicit
		};
	}

	const inferredGas = inferBreathingGas(source.gasMix);
	if (inferredGas && inferredGas !== 'air') {
		return defaultConditionsForKind('o2-assisted', {
			breathingGas: inferredGas,
			gasMix: source.gasMix
		});
	}

	if (source.defaultLungVolume === 'FRC') return defaultConditionsForKind('frc');
	if (source.defaultLungVolume === 'RV') return defaultConditionsForKind('rv');

	return defaultConditionsForKind('standard');
}

function inferBreathingGas(gasMix?: string): BreathingGas | undefined {
	const normalized = gasMix?.trim().toLowerCase();
	if (!normalized) return undefined;
	if (normalized === 'air') return 'air';
	if (normalized.includes('nitrox')) return 'nitrox';
	if (normalized.includes('o2') || normalized.includes('oxygen')) return 'oxygen';
	if (/\b[3-9]\d\s*%/.test(normalized) || normalized.includes('%')) return 'nitrox';
	return 'custom';
}
