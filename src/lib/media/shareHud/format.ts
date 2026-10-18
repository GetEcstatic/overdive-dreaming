/**
 * Number and label formatting for the share HUD (plan §4.7). Pure, no imports
 * outside this folder: shared with the Cloud Functions bundle.
 */

export type HudDiscipline = 'DYN' | 'DNF' | 'DYNB';

const MINUS = '\u2212';

/** `m:ss.t`, or `s.t` under a minute. Truncates, so the clock never runs ahead. */
export function formatHudTime(ms: number): string {
	const tenthsTotal = Math.floor(Math.max(0, ms) / 100);
	const tenths = tenthsTotal % 10;
	const totalSeconds = Math.floor(tenthsTotal / 10);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes === 0) return `${seconds}.${tenths}`;
	return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`;
}

/** Live distance: whole metres, floored (never shows distance not yet swum). */
export function formatLiveDistance(distanceM: number): string {
	return `${Math.floor(Math.max(0, distanceM) + 1e-6)}`;
}

/** Final distance: whole metres unless the realised distance has a fraction. */
export function formatFinalDistance(distanceM: number): string {
	const rounded = Math.round(distanceM * 10) / 10;
	return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

export function formatSpeed(speedMs: number): string {
	return Math.max(0, speedMs).toFixed(2);
}

/** Signed difference with a true minus sign; `=` when it rounds to zero. */
export function formatSignedDelta(value: number, decimals: number): string {
	const rounded = Number(Math.abs(value).toFixed(decimals));
	if (rounded === 0) return '=';
	return `${value > 0 ? '+' : MINUS}${rounded.toFixed(decimals)}`;
}

/** Split time in seconds with one decimal, e.g. `43.0 s` (or `1:02.3` past a minute). */
export function formatSplit(ms: number): string {
	return ms >= 60_000 ? formatHudTime(ms) : `${(Math.floor(ms / 100) / 10).toFixed(1)} s`;
}

export const DISCIPLINE_LABELS: Readonly<Record<HudDiscipline, string>> = {
	DYN: 'Dynamic with fins',
	DNF: 'Dynamic no fins',
	DYNB: 'Dynamic bi-fins'
};

export function disciplineLabel(discipline: HudDiscipline): string {
	return DISCIPLINE_LABELS[discipline] ?? discipline;
}
