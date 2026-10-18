/**
 * Share HUD snapshot for a new dive video (plan §5.1–5.2). Pure helpers; the
 * Firestore reads live in `services/diveVideos.ts`.
 */
import type { DiveVideoDiscipline, DiveVideoShareContext, PersonalBestRecords, PersonalBests } from '$lib/types';

/**
 * Best standard distance PB before this dive. A record set by this dive's own
 * routine log is skipped, so the HUD compares against the previous best.
 */
export function pbBeforeFromRecords(args: {
	records: PersonalBestRecords | undefined;
	legacy: PersonalBests | undefined;
	discipline: DiveVideoDiscipline;
	routineLogId?: string;
}): Pick<DiveVideoShareContext, 'pbBeforeM' | 'pbSource'> {
	const best = Object.values(args.records ?? {})
		.filter(
			(record) =>
				record.discipline === args.discipline &&
				record.metric === 'distance' &&
				record.isStandard &&
				Number.isFinite(record.value) &&
				record.value > 0 &&
				!(args.routineLogId && record.routineLogId === args.routineLogId)
		)
		.sort((a, b) => b.value - a.value)[0];
	if (best) return { pbBeforeM: best.value, pbSource: 'record' };
	const legacy = args.legacy?.[args.discipline];
	// The legacy single-value PB cannot tell whether this dive set it, so only use it before a log exists.
	if (!args.routineLogId && typeof legacy === 'number' && Number.isFinite(legacy) && legacy > 0) {
		return { pbBeforeM: legacy, pbSource: 'legacy' };
	}
	return { pbBeforeM: null, pbSource: 'none' };
}

/** `17 Oct 2026`, in the device's time zone. */
export function shareDateLabel(date: Date): string {
	return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
