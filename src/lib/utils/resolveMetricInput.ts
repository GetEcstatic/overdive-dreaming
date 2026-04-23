/**
 * Resolve how a metric's form input should behave in the dive-log form.
 *
 * The routine declares, per metric, whether it is captured manually, from
 * the in-app dive recorder, or "either" (default). The log form then uses
 * this helper to decide whether to show an editable input, a read-only
 * display, or a CTA prompting the user to record a dive.
 */

import type { CaptureSource, TrackingConfig } from '$lib/types';

export type MetricInputKey =
	| 'totalDistance'
	| 'totalTime'
	| 'timePerLap'
	| 'speedPerLap'
	| 'avgSpeed';

/**
 * The decision returned to the form per metric.
 *
 * - `editable-empty`: normal input, no pre-filled value.
 * - `editable-prefilled`: normal input, pre-filled from the recorder seed.
 * - `readonly-from-recorder`: value came from the recorder and can't be edited.
 * - `disabled-needs-recorder`: source is "recorder" but no seed exists;
 *   show a CTA to record a dive.
 */
export type MetricInputMode =
	| 'editable-empty'
	| 'editable-prefilled'
	| 'readonly-from-recorder'
	| 'disabled-needs-recorder';

export interface MetricInputDecision {
	mode: MetricInputMode;
	source: CaptureSource;
	/** True when a recorder-seeded value is available for this metric. */
	hasSeed: boolean;
}

const SOURCE_FIELD: Record<MetricInputKey, keyof TrackingConfig> = {
	totalDistance: 'totalDistanceSource',
	totalTime: 'totalTimeSource',
	timePerLap: 'timePerLapSource',
	speedPerLap: 'speedPerLapSource',
	avgSpeed: 'avgSpeedSource'
};

/**
 * Pure decision helper.
 *
 * @param config - The routine's `TrackingConfig`.
 * @param metric - Which metric is being rendered.
 * @param hasSeed - Whether the form has a recorder-seeded value for this metric.
 */
export function resolveMetricInput(
	config: TrackingConfig | undefined | null,
	metric: MetricInputKey,
	hasSeed: boolean
): MetricInputDecision {
	const sourceKey = SOURCE_FIELD[metric];
	const rawSource = config
		? ((config as unknown as Record<string, unknown>)[sourceKey] as CaptureSource | undefined)
		: undefined;
	const source: CaptureSource = rawSource ?? 'either';

	let mode: MetricInputMode;
	if (source === 'manual') {
		mode = hasSeed ? 'editable-prefilled' : 'editable-empty';
	} else if (source === 'recorder') {
		mode = hasSeed ? 'readonly-from-recorder' : 'disabled-needs-recorder';
	} else {
		// 'either'
		mode = hasSeed ? 'editable-prefilled' : 'editable-empty';
	}

	return { mode, source, hasSeed };
}
