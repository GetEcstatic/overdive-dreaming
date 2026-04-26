/**
 * Pure helpers for the LungVolume tag (FL / RV / FRC).
 *
 * Kept side-effect free — see "Data-oriented design" in claude.md.
 * The data shape is `LungVolume` from $lib/types; this module owns the
 * label/option metadata and the small array transforms used by the UI.
 */

import type { LungVolume, RepEditorData } from '$lib/types';

export const LUNG_VOLUME_OPTIONS: readonly LungVolume[] = ['FL', 'RV', 'FRC'] as const;

/** Long-form label for tooltips and accessible names. */
export function formatLungVolume(v: LungVolume | undefined): string {
	switch (v) {
		case 'FL':
			return 'Full Lung';
		case 'RV':
			return 'Residual Volume';
		case 'FRC':
			return 'Functional Residual Capacity';
		default:
			return '';
	}
}

/**
 * Pure reducer: fill in missing `lungVolume` on every rep with
 * `defaultVol`. Reps that already have an explicit value are untouched.
 * Returns a new array; the input is not mutated.
 */
export function applyDefaultLungVolume(
	reps: readonly RepEditorData[],
	defaultVol: LungVolume | undefined
): RepEditorData[] {
	if (!defaultVol) return reps.slice();
	return reps.map((r) =>
		r.lungVolume === undefined ? { ...r, lungVolume: defaultVol } : r
	);
}
