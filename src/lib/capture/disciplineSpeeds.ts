/**
 * Default initial dive speeds (m/s) per dynamic discipline.
 *
 * These values seed the live HUD distance counter and pre-first-waypoint
 * fallback in post-capture analysis. Once the diver taps the first
 * waypoint, real measured pace takes over and the default no longer
 * matters.
 *
 * Values are calibrated for typical pool freediving paces:
 *   - DYN  (with fins)        : 1.1 m/s
 *   - DYNB (bifins)           : 1.0 m/s
 *   - DNF  (no fins)          : 0.8 m/s
 *
 * If you change this table, mirror the change in
 * `functions/src/lib/disciplineSpeeds.ts` (vendored 1:1 for Cloud
 * Functions, which cannot import from `src/lib/`).
 */

import type { DiveVideoDiscipline } from '$lib/types';

export const DISCIPLINE_DEFAULT_SPEED_MS: Readonly<
	Record<DiveVideoDiscipline, number>
> = Object.freeze({
	DYN: 1.1,
	DYNB: 1.0,
	DNF: 0.8
});

/**
 * Initial speed to assume before the first measurement is available, in
 * m/s. Falls back to 1.0 if the discipline is not recognised — keeping
 * the historical default behaviour.
 */
export function defaultSpeedMs(discipline: DiveVideoDiscipline): number {
	return DISCIPLINE_DEFAULT_SPEED_MS[discipline] ?? 1.0;
}
