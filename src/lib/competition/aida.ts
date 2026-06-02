import type {
	AidaCompetitionAttempt,
	AidaDisqualificationCode,
	AidaDisqualificationReason,
	AidaPenalty,
	AidaPenaltyCode,
	CardTag,
	Discipline,
	RecordTag,
	RoutineLog
} from '$lib/types';

export const AIDA_PENALTY_CODES: readonly AidaPenaltyCode[] = [
	'EARLY_START',
	'LATE_START',
	'UNDER_AP',
	'START',
	'TURN',
	'PULL'
];

export const AIDA_DISQUALIFICATION_CODES: readonly AidaDisqualificationCode[] = [
	'DQBO',
	'DQSP',
	'DQAIRWAYS',
	'DQTOUCH',
	'DQ_LATE_START',
	'DQOTHER'
];

export const AIDA_DQ_DETAIL_OPTIONS: Readonly<Record<Exclude<AidaDisqualificationCode, 'DQOTHER'>, readonly string[]>> = {
	DQBO: [
		'Cardiac arrest',
		'Involuntary respiratory arrest',
		'Loss of consciousness'
	],
	DQSP: [
		'Equipment removal missing or out of order',
		'Visual OK missing, unclear, repeated, double, or returned from below surface',
		'Verbal OK missing, not English at World Apnea event, or before visual OK',
		'SP completed after 15.0 seconds',
		'Extra cue, motion, or repeated facial wipe after SP begins'
	],
	DQAIRWAYS: [
		'Nose or mouth fully dips below surface before verdict'
	],
	DQTOUCH: [
		'Supportive touch after performance start',
		'Touch after airway emerges',
		'Touch of athlete or equipment after start'
	],
	DQ_LATE_START: [
		'Start more than 30 seconds after OT'
	]
};

const DQ_OTHER_REFERENCE_ALL = [
	'Flotation device used to assist after surfacing',
	'Coach fully immersed during performance',
	'Any other pool rule violation recorded by the judges'
] as const;

const DQ_OTHER_REFERENCE_DYNAMIC = [
	'Airway not submerged within 1.5 m of the wall',
	'Turn made more than 1 m short of the wall without touching',
	'Surfaced outside the original performance zone or impeded another athlete',
	'Swam a complete length at the surface',
	'Above-surface arm recovery'
] as const;

const DQ_OTHER_REFERENCE_DYNB = [
	'Dolphin kick while wearing bifins, except one allowed at the turn'
] as const;

export function dqOtherReferenceItems(discipline: Discipline): string[] {
	const items: string[] = [...DQ_OTHER_REFERENCE_ALL];
	if (discipline === 'DYN' || discipline === 'DNF' || discipline === 'DYNB') {
		items.push(...DQ_OTHER_REFERENCE_DYNAMIC);
	}
	if (discipline === 'DYNB') {
		items.push(...DQ_OTHER_REFERENCE_DYNB);
	}
	return items;
}

export function rawAidaPoints(discipline: Discipline, seconds?: number, meters?: number): number | undefined {
	if (discipline === 'STA') {
		return seconds === undefined ? undefined : roundPoints(Math.floor(seconds) * 0.2);
	}
	return meters === undefined ? undefined : roundPoints(Math.floor(meters) * 0.5);
}

export function deriveAidaStartPenalty(startOffsetSeconds?: number): AidaPenalty | AidaDisqualificationReason | undefined {
	if (startOffsetSeconds === undefined || startOffsetSeconds === 0) return undefined;
	if (startOffsetSeconds < 0) {
		const seconds = Math.abs(startOffsetSeconds);
		return {
			code: 'EARLY_START',
			seconds,
			points: Math.ceil(seconds / 5)
		};
	}
	if (startOffsetSeconds > 30) {
		return {
			code: 'DQ_LATE_START',
			details: ['Start more than 30 seconds after OT']
		};
	}
	if (startOffsetSeconds > 10) {
		const seconds = startOffsetSeconds - 10;
		return {
			code: 'LATE_START',
			seconds,
			points: Math.ceil(seconds / 5)
		};
	}
	return undefined;
}

export function deriveUnderApPenalty(
	discipline: Discipline,
	announcedSeconds?: number,
	realizedSeconds?: number,
	announcedMeters?: number,
	realizedMeters?: number
): AidaPenalty | undefined {
	if (discipline === 'STA') {
		if (announcedSeconds === undefined || realizedSeconds === undefined || realizedSeconds >= announcedSeconds) {
			return undefined;
		}
		const seconds = Math.floor(announcedSeconds - realizedSeconds);
		return {
			code: 'UNDER_AP',
			seconds,
			points: roundPoints(seconds * 0.2)
		};
	}

	if (announcedMeters === undefined || realizedMeters === undefined || realizedMeters >= announcedMeters) {
		return undefined;
	}
	const meters = Math.floor(announcedMeters - realizedMeters);
	return {
		code: 'UNDER_AP',
		meters,
		points: roundPoints(meters * 0.5)
	};
}

export function deriveCardFromOutcome(outcome: {
	penalties?: readonly AidaPenalty[];
	disqualificationReasons?: readonly AidaDisqualificationReason[];
}): CardTag {
	if ((outcome.disqualificationReasons?.length ?? 0) > 0) return 'red';
	if ((outcome.penalties?.length ?? 0) > 0) return 'yellow';
	return 'white';
}

export function scoreAidaPerformance(attempt: AidaCompetitionAttempt): AidaCompetitionAttempt {
	const rawPoints = rawAidaPoints(
		attempt.discipline,
		attempt.realizedPerformanceSeconds,
		attempt.realizedPerformanceMeters
	);
	const penaltyPoints = roundPoints(
		(attempt.penalties ?? []).reduce((sum, penalty) => sum + (penalty.points ?? 0), 0)
	);
	const hasDisqualification = (attempt.disqualificationReasons?.length ?? 0) > 0 || attempt.card === 'red';
	const finalPoints = rawPoints === undefined
		? undefined
		: hasDisqualification
			? 0
			: roundPoints(Math.max(0, rawPoints - penaltyPoints));

	return {
		...attempt,
		rawPoints,
		penaltyPoints,
		finalPoints,
		card: attempt.card ?? deriveCardFromOutcome(attempt)
	};
}

export function competitionCompatibilityFields(attempt?: AidaCompetitionAttempt): Pick<RoutineLog, 'isCompetition' | 'compeitionOrg' | 'cardTag' | 'recordTag'> {
	if (!attempt) return {};
	return {
		isCompetition: attempt.mode === 'official-competition',
		compeitionOrg: attempt.mode === 'official-competition' ? 'AIDA' : null,
		cardTag: attempt.card,
		recordTag: attempt.recordTag
	};
}

export function normalizeAidaCompetitionAttempt(log: Partial<RoutineLog>): AidaCompetitionAttempt | undefined {
	if (log.aidaCompetition) {
		return scoreAidaPerformance(log.aidaCompetition);
	}

	const hasLegacyCompetition = Boolean(log.isCompetition || log.compeitionOrg || log.cardTag || log.recordTag);
	if (!hasLegacyCompetition || !log.disciplineUsed) return undefined;
	if (log.compeitionOrg && log.compeitionOrg.toUpperCase() !== 'AIDA') return undefined;

	return scoreAidaPerformance({
		mode: 'official-competition',
		discipline: log.disciplineUsed,
		realizedPerformanceSeconds: log.totalTime ?? log.diveDuration,
		realizedPerformanceMeters: log.totalDistance ?? log.diveDistance,
		card: log.cardTag ?? undefined,
		recordTag: log.recordTag ?? undefined
	});
}

export function buildAidaAttempt(input: {
	mode: AidaCompetitionAttempt['mode'];
	discipline: Discipline;
	startOffsetSeconds?: number;
	announcedPerformanceSeconds?: number;
	announcedPerformanceMeters?: number;
	realizedPerformanceSeconds?: number;
	realizedPerformanceMeters?: number;
	card?: CardTag;
	recordTag?: RecordTag;
	manualPenalties?: AidaPenalty[];
	disqualificationReasons?: AidaDisqualificationReason[];
	surfaceProtocol?: AidaCompetitionAttempt['surfaceProtocol'];
	judgeNotes?: string;
}): AidaCompetitionAttempt {
	const penalties: AidaPenalty[] = [...(input.manualPenalties ?? [])];
	const disqualificationReasons: AidaDisqualificationReason[] = [...(input.disqualificationReasons ?? [])];
	const startOutcome = deriveAidaStartPenalty(input.startOffsetSeconds);
	if (startOutcome) {
		if (isAidaDisqualificationReason(startOutcome)) disqualificationReasons.push(startOutcome);
		else penalties.push(startOutcome);
	}
	const underApPenalty = deriveUnderApPenalty(
		input.discipline,
		input.announcedPerformanceSeconds,
		input.realizedPerformanceSeconds,
		input.announcedPerformanceMeters,
		input.realizedPerformanceMeters
	);
	if (underApPenalty) penalties.push(underApPenalty);

	return scoreAidaPerformance({
		mode: input.mode,
		discipline: input.discipline,
		startOffsetSeconds: input.startOffsetSeconds,
		announcedPerformanceSeconds: input.announcedPerformanceSeconds,
		announcedPerformanceMeters: input.announcedPerformanceMeters,
		realizedPerformanceSeconds: input.realizedPerformanceSeconds,
		realizedPerformanceMeters: input.realizedPerformanceMeters,
		card: input.card,
		penalties: penalties.length > 0 ? penalties : undefined,
		disqualificationReasons: disqualificationReasons.length > 0 ? disqualificationReasons : undefined,
		surfaceProtocol: input.surfaceProtocol,
		recordTag: input.recordTag,
		judgeNotes: input.judgeNotes
	});
}

function roundPoints(value: number): number {
	return Math.round(value * 10) / 10;
}

function isAidaDisqualificationReason(
	value: AidaPenalty | AidaDisqualificationReason
): value is AidaDisqualificationReason {
	return AIDA_DISQUALIFICATION_CODES.includes(value.code as AidaDisqualificationCode);
}
