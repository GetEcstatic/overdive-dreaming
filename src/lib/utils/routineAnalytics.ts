/**
 * Per-routine analytics utilities.
 *
 * Pure functions (no Firestore, no DOM) used by the routine analytics page
 * and its sub-components. Implements:
 *   - getAvailableMetricsForRoutine   — which metrics make sense for a routine
 *   - bucketLogsBy                    — generic N-way grouping helper
 *   - summariseGroup                  — per-group stats (mean/median/stdev/PB/trend)
 *   - linearRegression / suggestCorrelations — scatter explorer support
 *   - averageRepCurve / repFadePercent — rep-level decay detection
 */

import type {
	RoutineLog,
	RoutineTemplate,
	MetricType,
	Discipline,
	TimeOfDay
} from '$lib/types';
import { getMetricValue } from './metrics';

// ============================================================================
// Metric catalog
// ============================================================================

/**
 * A metric that can be shown in charts / stat cards.
 */
export interface MetricDescriptor {
	key: MetricType;
	label: string;
	unit: 'meters' | 'seconds' | 'count' | 'speed' | '°C' | 'bpm' | 'ms' | 'percent' | 'liters' | 'mmHg' | 'scale' | 'days' | 'hours';
	/** Time metrics format as mm:ss in chart axes and tooltips. */
	isTime: boolean;
	/** True when lower values represent better performance (e.g. per-rep time in interval training). */
	lowerIsBetter: boolean;
}

const TIME_METRIC_KEYS = new Set<MetricType>([
	'totalTime',
	'diveDuration',
	'repDuration',
	'avgTimePerLap',
	'avgTimePerRep',
	'avgRestBetweenLaps',
	'totalBreathHoldTime',
	'cumulativeHoldTime',
	'totalBreathingTime',
	'longestHold',
	'initialBreatheUpTime',
	'contractionsOnsetTime',
	'holdDuration',
	'sessionDuration'
]);

export function isTimeMetric(key: MetricType): boolean {
	return TIME_METRIC_KEYS.has(key);
}

/**
 * Returns the metrics that make sense to plot for the given routine,
 * based on its `trackingConfig` plus standard calculated metrics.
 *
 * `hiddenMetrics` (from UserSettings) is filtered out everywhere so the
 * user can hide metrics they don't care about globally.
 */
export function getAvailableMetricsForRoutine(
	routine: RoutineTemplate,
	hiddenMetrics: string[] = []
): MetricDescriptor[] {
	const hidden = new Set(hiddenMetrics);
	const cfg = routine.trackingConfig;
	const tags = routine.tags ?? [];
	const isMaxAttempt = tags.includes('max-attempt') || tags.includes('pb');

	const out: MetricDescriptor[] = [];

	const add = (d: MetricDescriptor) => {
		if (!hidden.has(d.key)) out.push(d);
	};

	// Core performance
	if (cfg.trackTotalDistance) {
		add({ key: 'totalDistance', label: 'Dive distance', unit: 'meters', isTime: false, lowerIsBetter: false });
	}
	if (cfg.trackTotalTime) {
		add({
			key: 'totalTime',
			label: 'Dive duration',
			unit: 'seconds',
			isTime: true,
			// For interval training lower time per rep is better, but totalTime at the
			// session level is still "more = more work done" so higher is better.
			lowerIsBetter: false
		});
	}
	if (cfg.trackRepsCompleted) {
		add({ key: 'repsCompleted', label: 'Reps completed', unit: 'count', isTime: false, lowerIsBetter: false });
	}
	if (cfg.trackRepDuration) {
		add({ key: 'repDuration', label: 'Rep duration', unit: 'seconds', isTime: true, lowerIsBetter: !isMaxAttempt });
	}
	if (cfg.trackRepDistance) {
		add({ key: 'totalRepDistance', label: 'Total rep distance', unit: 'meters', isTime: false, lowerIsBetter: false });
	}
	if (cfg.trackTimePerLap) {
		add({ key: 'avgTimePerLap', label: 'Avg time per lap', unit: 'seconds', isTime: true, lowerIsBetter: !isMaxAttempt });
	}
	if (cfg.trackRestBetweenLaps) {
		add({ key: 'avgRestBetweenLaps', label: 'Avg rest between laps', unit: 'seconds', isTime: true, lowerIsBetter: false });
	}

	// Calculated / biometric
	if (cfg.trackRepDuration && cfg.trackRepsCompleted) {
		add({
			key: 'totalBreathHoldTime',
			label: 'Cumulative hold time',
			unit: 'seconds',
			isTime: true,
			lowerIsBetter: false
		});
	}
	if (cfg.trackSpO2Thresholds || cfg.trackPerRepSpO2 || cfg.trackPerRepHR) {
		add({ key: 'longestHold', label: 'Longest hold', unit: 'seconds', isTime: true, lowerIsBetter: false });
	}

	// Session context
	if (cfg.trackPoolLength) {
		add({ key: 'poolLength', label: 'Pool length', unit: 'meters', isTime: false, lowerIsBetter: false });
	}
	if (cfg.trackInitialBreatheUpTime) {
		add({
			key: 'initialBreatheUpTime',
			label: 'Breathe-up time',
			unit: 'seconds',
			isTime: true,
			lowerIsBetter: false
		});
	}
	if (cfg.trackWaterTemperature) {
		add({ key: 'waterTemperature', label: 'Water temperature', unit: '°C', isTime: false, lowerIsBetter: false });
	}
	if (cfg.trackContractionsOnsetTime) {
		add({
			key: 'contractionsOnsetTime',
			label: 'Contractions onset',
			unit: 'seconds',
			isTime: true,
			lowerIsBetter: false
		});
	}
	if (cfg.trackRestingHeartRate) {
		add({ key: 'restingHeartRate', label: 'Resting HR', unit: 'bpm', isTime: false, lowerIsBetter: true });
	}
	if (cfg.trackHRV) {
		add({ key: 'hrv', label: 'HRV', unit: 'ms', isTime: false, lowerIsBetter: false });
	}

	// Speed — calculated when both distance and time are captured
	if (cfg.trackTotalDistance && cfg.trackTotalTime) {
		add({ key: 'avgSpeed', label: 'Avg speed', unit: 'speed', isTime: false, lowerIsBetter: false });
	}

	return out;
}

/**
 * Numeric metrics suitable for X/Y scatter analysis.
 * We strip ordinal-style keys like `poolLength` by default because they cluster
 * into a handful of values and produce degenerate regressions.
 */
export function getScatterMetrics(
	routine: RoutineTemplate,
	hiddenMetrics: string[] = []
): MetricDescriptor[] {
	const blockedForScatter = new Set<MetricType>(['poolLength']);
	return getAvailableMetricsForRoutine(routine, hiddenMetrics).filter(
		(m) => !blockedForScatter.has(m.key)
	);
}

// ============================================================================
// Generic N-way grouping (bucketLogsBy)
// ============================================================================

/**
 * Dimensions users can split logs by in the Compare card. The dimension decides
 * how a given log is turned into a string bucket value.
 */
export type CompareDimension =
	| 'facialGear'
	| 'poolType'
	| 'poolLength'
	| 'timeOfDay'
	| 'isCompetition'
	| 'breathingTechniqueLevel'
	| 'hoursSinceLastMeal'
	| 'menstrualCycleDay'
	| 'discipline'
	| 'rpeZone';

export interface CompareDimensionDescriptor {
	key: CompareDimension;
	label: string;
	/** Returns the bucket label for a single log, or null if the log has no data for this dimension. */
	bucketFor(log: RoutineLog): string | null;
}

function rpeZoneLabel(rpe: number): string {
	if (rpe <= 4) return 'Recovery (1–4)';
	if (rpe <= 6) return 'Gray (5–6)';
	return 'High intensity (7–10)';
}

function fastingBand(hours: number): string {
	if (hours < 3) return '<3h';
	if (hours < 8) return '3–8h';
	if (hours < 14) return '8–14h';
	return '>14h';
}

function cyclePhase(day: number): string {
	if (day <= 10) return 'Days 1–10';
	if (day <= 20) return 'Days 11–20';
	return 'Days 21+';
}

function timeOfDayLabel(tod: TimeOfDay): string {
	return tod.charAt(0).toUpperCase() + tod.slice(1);
}

export const COMPARE_DIMENSIONS: Record<CompareDimension, CompareDimensionDescriptor> = {
	facialGear: {
		key: 'facialGear',
		label: 'Facial gear',
		bucketFor: (log) => {
			const gear = log.facialGear;
			if (!gear || gear.length === 0) return null;
			// Use the first gear (sorted for stable grouping) so mask+noseclip and noseclip+mask land together.
			const sorted = [...gear].sort().join('+');
			return sorted || null;
		}
	},
	poolType: {
		key: 'poolType',
		label: 'Pool type',
		bucketFor: (log) => log.poolType ?? null
	},
	poolLength: {
		key: 'poolLength',
		label: 'Pool length',
		bucketFor: (log) => (log.poolLength ? `${log.poolLength}m` : null)
	},
	timeOfDay: {
		key: 'timeOfDay',
		label: 'Time of day',
		bucketFor: (log) => (log.timeOfDay ? timeOfDayLabel(log.timeOfDay) : null)
	},
	isCompetition: {
		key: 'isCompetition',
		label: 'Competition vs training',
		bucketFor: (log) => (log.isCompetition ? 'Competition' : 'Training')
	},
	breathingTechniqueLevel: {
		key: 'breathingTechniqueLevel',
		label: 'Breathing technique',
		bucketFor: (log) => {
			if (log.breathingTechniqueLevel !== undefined && log.breathingTechniqueLevel !== null) {
				const level = log.breathingTechniqueLevel;
				if (level === 0) return 'Tidal (0)';
				if (level < 0) return `Hypo (${level})`;
				return `Hyper (+${level})`;
			}
			if (log.breathingTechnique) {
				const t = log.breathingTechnique;
				if (t === 'tidal') return 'Tidal';
				if (t === 'hypoventilation') return 'Hypo';
				if (t === 'hyperventilation') return 'Hyper';
			}
			return null;
		}
	},
	hoursSinceLastMeal: {
		key: 'hoursSinceLastMeal',
		label: 'Hours since last meal',
		bucketFor: (log) =>
			log.hoursSinceLastMeal !== undefined && log.hoursSinceLastMeal !== null
				? fastingBand(log.hoursSinceLastMeal)
				: null
	},
	menstrualCycleDay: {
		key: 'menstrualCycleDay',
		label: 'Menstrual cycle',
		bucketFor: (log) =>
			log.menstrualCycleDay !== undefined && log.menstrualCycleDay !== null
				? cyclePhase(log.menstrualCycleDay)
				: null
	},
	discipline: {
		key: 'discipline',
		label: 'Discipline',
		bucketFor: (log) => log.disciplineUsed ?? null
	},
	rpeZone: {
		key: 'rpeZone',
		label: 'RPE zone',
		bucketFor: (log) => (log.rpe !== undefined && log.rpe !== null ? rpeZoneLabel(log.rpe) : null)
	}
};

/**
 * Returns the list of dimensions that have at least `minNonEmptyValues` distinct
 * bucket values across the provided logs — so we only offer dimensions the user
 * can actually compare.
 */
export function getAvailableDimensions(
	logs: RoutineLog[],
	minDistinctValues = 2
): CompareDimensionDescriptor[] {
	const out: CompareDimensionDescriptor[] = [];
	for (const dim of Object.values(COMPARE_DIMENSIONS)) {
		const distinct = new Set<string>();
		for (const log of logs) {
			const b = dim.bucketFor(log);
			if (b !== null) distinct.add(b);
			if (distinct.size >= minDistinctValues) break;
		}
		if (distinct.size >= minDistinctValues) out.push(dim);
	}
	return out;
}

/**
 * Groups logs into buckets keyed by dimension value.
 * Logs with no data for the dimension are dropped.
 */
export function bucketLogsBy(
	logs: RoutineLog[],
	dimension: CompareDimension | CompareDimensionDescriptor
): Map<string, RoutineLog[]> {
	const desc = typeof dimension === 'string' ? COMPARE_DIMENSIONS[dimension] : dimension;
	const buckets = new Map<string, RoutineLog[]>();
	for (const log of logs) {
		const bucket = desc.bucketFor(log);
		if (bucket === null) continue;
		let arr = buckets.get(bucket);
		if (!arr) {
			arr = [];
			buckets.set(bucket, arr);
		}
		arr.push(log);
	}
	return buckets;
}

// ============================================================================
// Summary statistics
// ============================================================================

export interface GroupSummary {
	n: number;
	mean: number;
	median: number;
	stdev: number;
	min: number;
	max: number;
	/** Best value honouring `lowerIsBetter`. */
	pb: number;
	/** Percentage difference between first-half mean and second-half mean (ordered by log date asc). Positive means getting bigger; interpret with `lowerIsBetter` in the caller. */
	trendPct: number;
	/** Coefficient of variation (%) — stdev/mean. Undefined when mean is 0. */
	cvPct?: number;
}

function median(sorted: number[]): number {
	const n = sorted.length;
	if (n === 0) return 0;
	const mid = Math.floor(n / 2);
	return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stdev(values: number[], mean: number): number {
	if (values.length < 2) return 0;
	const sqDiffs = values.map((v) => (v - mean) ** 2);
	const variance = sqDiffs.reduce((a, b) => a + b, 0) / (values.length - 1);
	return Math.sqrt(variance);
}

/**
 * Summarises a group of logs along a single metric. `routine` is needed because
 * `getMetricValue` handles calculated metrics based on tracking config.
 */
export function summariseGroup(
	logs: RoutineLog[],
	metric: MetricType,
	routine: RoutineTemplate,
	lowerIsBetter = false
): GroupSummary {
	// Sort by date ascending so trend comparison makes sense.
	const orderedLogs = [...logs].sort(
		(a, b) => a.date.toDate().getTime() - b.date.toDate().getTime()
	);

	const values: number[] = [];
	for (const log of orderedLogs) {
		const v = getMetricValue(metric, log, routine);
		if (Number.isFinite(v) && v > 0) values.push(v);
	}

	if (values.length === 0) {
		return { n: 0, mean: 0, median: 0, stdev: 0, min: 0, max: 0, pb: 0, trendPct: 0 };
	}

	const sorted = [...values].sort((a, b) => a - b);
	const mean = values.reduce((a, b) => a + b, 0) / values.length;
	const sd = stdev(values, mean);
	const minV = sorted[0];
	const maxV = sorted[sorted.length - 1];
	const pb = lowerIsBetter ? minV : maxV;

	let trendPct = 0;
	if (values.length >= 4) {
		const mid = Math.floor(values.length / 2);
		const first = values.slice(0, mid);
		const second = values.slice(mid);
		const firstMean = first.reduce((a, b) => a + b, 0) / first.length;
		const secondMean = second.reduce((a, b) => a + b, 0) / second.length;
		if (firstMean > 0) trendPct = ((secondMean - firstMean) / firstMean) * 100;
	}

	return {
		n: values.length,
		mean,
		median: median(sorted),
		stdev: sd,
		min: minV,
		max: maxV,
		pb,
		trendPct,
		cvPct: mean > 0 ? (sd / mean) * 100 : undefined
	};
}

/**
 * Rolling-average helper. Returns a parallel array of rolling means with the
 * specified window (defaults to 5). Early indices use whatever data is available.
 */
export function rollingAverage(values: number[], window = 5): number[] {
	const out: number[] = [];
	for (let i = 0; i < values.length; i++) {
		const start = Math.max(0, i - window + 1);
		const slice = values.slice(start, i + 1);
		const m = slice.reduce((a, b) => a + b, 0) / slice.length;
		out.push(m);
	}
	return out;
}

// ============================================================================
// Linear regression / correlation suggestions
// ============================================================================

export interface LinearRegression {
	slope: number;
	intercept: number;
	r2: number;
	/** Sign of the slope. */
	direction: 'positive' | 'negative' | 'flat';
}

export function linearRegression(xs: number[], ys: number[]): LinearRegression {
	const n = Math.min(xs.length, ys.length);
	if (n < 2) return { slope: 0, intercept: 0, r2: 0, direction: 'flat' };

	let sumX = 0,
		sumY = 0,
		sumXY = 0,
		sumXX = 0,
		sumYY = 0;

	for (let i = 0; i < n; i++) {
		sumX += xs[i];
		sumY += ys[i];
		sumXY += xs[i] * ys[i];
		sumXX += xs[i] * xs[i];
		sumYY += ys[i] * ys[i];
	}

	const meanX = sumX / n;
	const meanY = sumY / n;
	const ssXX = sumXX - n * meanX * meanX;
	const ssYY = sumYY - n * meanY * meanY;
	const ssXY = sumXY - n * meanX * meanY;

	if (ssXX === 0 || ssYY === 0) {
		return { slope: 0, intercept: meanY, r2: 0, direction: 'flat' };
	}

	const slope = ssXY / ssXX;
	const intercept = meanY - slope * meanX;
	const r = ssXY / Math.sqrt(ssXX * ssYY);
	const r2 = r * r;
	const direction: LinearRegression['direction'] =
		Math.abs(slope) < 1e-9 ? 'flat' : slope > 0 ? 'positive' : 'negative';

	return { slope, intercept, r2, direction };
}

export interface CorrelationSuggestion {
	x: MetricDescriptor;
	y: MetricDescriptor;
	r2: number;
	n: number;
	direction: LinearRegression['direction'];
}

/**
 * Scan every (x, y) pair among available metrics and return the top `k` by |R²|,
 * ignoring self-pairs and pairs with fewer than `minN` points.
 */
export function suggestCorrelations(
	logs: RoutineLog[],
	routine: RoutineTemplate,
	metrics: MetricDescriptor[],
	opts: { k?: number; minN?: number; minR2?: number } = {}
): CorrelationSuggestion[] {
	const k = opts.k ?? 3;
	const minN = opts.minN ?? 5;
	const minR2 = opts.minR2 ?? 0.1;

	const suggestions: CorrelationSuggestion[] = [];

	for (let i = 0; i < metrics.length; i++) {
		for (let j = i + 1; j < metrics.length; j++) {
			const mx = metrics[i];
			const my = metrics[j];

			const xs: number[] = [];
			const ys: number[] = [];
			for (const log of logs) {
				const x = getMetricValue(mx.key, log, routine);
				const y = getMetricValue(my.key, log, routine);
				if (Number.isFinite(x) && Number.isFinite(y) && x > 0 && y > 0) {
					xs.push(x);
					ys.push(y);
				}
			}

			if (xs.length < minN) continue;
			const reg = linearRegression(xs, ys);
			if (reg.r2 < minR2) continue;

			suggestions.push({ x: mx, y: my, r2: reg.r2, n: xs.length, direction: reg.direction });
		}
	}

	suggestions.sort((a, b) => b.r2 - a.r2);
	return suggestions.slice(0, k);
}

/**
 * Extract {x, y} pairs for a scatter given two metrics.
 * Returns both the point array and the regression for the subset with data.
 */
export function buildScatter(
	logs: RoutineLog[],
	routine: RoutineTemplate,
	xKey: MetricType,
	yKey: MetricType
): { points: { x: number; y: number; log: RoutineLog }[]; regression: LinearRegression } {
	const points: { x: number; y: number; log: RoutineLog }[] = [];
	for (const log of logs) {
		const x = getMetricValue(xKey, log, routine);
		const y = getMetricValue(yKey, log, routine);
		if (Number.isFinite(x) && Number.isFinite(y) && x > 0 && y > 0) {
			points.push({ x, y, log });
		}
	}
	const regression = linearRegression(
		points.map((p) => p.x),
		points.map((p) => p.y)
	);
	return { points, regression };
}

// ============================================================================
// Rep-level detail helpers
// ============================================================================

/**
 * True when at least one log has rep-level detail suitable for rep detail cards.
 */
export function hasRepDetail(logs: RoutineLog[]): boolean {
	return logs.some((log) => Array.isArray(log.laps) && log.laps.length >= 2);
}

/**
 * Returns a per-rep curve for a single log (rep number → time in seconds).
 * Empty array when the log lacks rep-level data.
 */
export function perRepCurve(log: RoutineLog): number[] {
	if (!log.laps || log.laps.length === 0) return [];
	return log.laps.map((lap) => lap.timeSeconds ?? 0);
}

/**
 * Average per-rep curve across many logs. Reps without data in a particular log
 * are skipped; returns a "mean" value per rep index plus a population count so
 * callers can render confidence shading or filter noisy reps.
 */
export function averageRepCurve(
	logs: RoutineLog[]
): { rep: number; mean: number; stdev: number; n: number }[] {
	const maxLen = logs.reduce((m, l) => Math.max(m, l.laps?.length ?? 0), 0);
	const out: { rep: number; mean: number; stdev: number; n: number }[] = [];
	for (let i = 0; i < maxLen; i++) {
		const values: number[] = [];
		for (const log of logs) {
			const t = log.laps?.[i]?.timeSeconds;
			if (typeof t === 'number' && t > 0) values.push(t);
		}
		if (values.length === 0) {
			out.push({ rep: i + 1, mean: 0, stdev: 0, n: 0 });
			continue;
		}
		const mean = values.reduce((a, b) => a + b, 0) / values.length;
		out.push({ rep: i + 1, mean, stdev: stdev(values, mean), n: values.length });
	}
	return out;
}

/**
 * Speed-fade across reps in a single log: (rep1 - repN) / rep1 expressed as a percentage.
 * Positive = got slower; negative = got faster; 0 for insufficient data.
 * We operate on time per rep, so the same interpretation works for holds and laps.
 */
export function repFadePercent(log: RoutineLog): number {
	const curve = perRepCurve(log);
	const first = curve.find((v) => v > 0);
	const lastIdx = curve
		.map((v, i) => ({ v, i }))
		.filter(({ v }) => v > 0)
		.pop()?.i;
	if (!first || lastIdx === undefined) return 0;
	const last = curve[lastIdx];
	if (!last || first === last) return 0;
	return ((last - first) / first) * 100;
}

// ============================================================================
// PB & milestone helpers
// ============================================================================

export interface RoutinePBInfo {
	value: number;
	date: Date;
	log: RoutineLog;
	isLowerBetter: boolean;
	discipline?: Discipline;
}

export function findPB(
	logs: RoutineLog[],
	metric: MetricType,
	routine: RoutineTemplate,
	lowerIsBetter = false
): RoutinePBInfo | null {
	let best: RoutinePBInfo | null = null;
	for (const log of logs) {
		const v = getMetricValue(metric, log, routine);
		if (!(v > 0)) continue;
		if (!best) {
			best = { value: v, date: log.date.toDate(), log, isLowerBetter: lowerIsBetter, discipline: log.disciplineUsed };
			continue;
		}
		const better = lowerIsBetter ? v < best.value : v > best.value;
		if (better) {
			best = { value: v, date: log.date.toDate(), log, isLowerBetter: lowerIsBetter, discipline: log.disciplineUsed };
		}
	}
	return best;
}

export function sessionsSinceLastPB(
	logs: RoutineLog[],
	metric: MetricType,
	routine: RoutineTemplate,
	lowerIsBetter = false
): number {
	const pb = findPB(logs, metric, routine, lowerIsBetter);
	if (!pb) return 0;
	const after = logs.filter((log) => log.date.toDate() > pb.date);
	// Unique session count
	const sessionKeys = new Set(
		after.map((log) => log.sessionGroup || log.date.toDate().toDateString())
	);
	return sessionKeys.size;
}

/**
 * Produce a chart-ready line dataset from logs using a metric.
 * Logs are ordered chronologically ascending in the returned series.
 */
export function buildProgressSeries(
	logs: RoutineLog[],
	metric: MetricType,
	routine: RoutineTemplate
): { labels: string[]; values: number[]; dates: Date[]; logs: RoutineLog[] } {
	const ordered = [...logs]
		.filter((log) => getMetricValue(metric, log, routine) > 0)
		.sort((a, b) => a.date.toDate().getTime() - b.date.toDate().getTime());
	const labels = ordered.map((log) =>
		log.date.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
	);
	const values = ordered.map((log) => getMetricValue(metric, log, routine));
	const dates = ordered.map((log) => log.date.toDate());
	return { labels, values, dates, logs: ordered };
}

// ============================================================================
// Tier C — consistency / variability / biometric / readiness helpers
// ============================================================================

/**
 * True when any log in the array carries session-level biometric data
 * (SpO₂ trough, HR extremes, time-below thresholds, etc.).
 */
export function hasBiometricData(logs: RoutineLog[]): boolean {
	return logs.some(
		(l) =>
			l.hasBiometricData === true ||
			typeof l.lowestSpO2 === 'number' ||
			typeof l.sessionAvgSpO2 === 'number' ||
			typeof l.sessionMinHR === 'number' ||
			typeof l.totalTimeBelow70 === 'number' ||
			typeof l.totalTimeBelow60 === 'number' ||
			typeof l.totalTimeBelow50 === 'number' ||
			typeof l.totalTimeBelow40 === 'number'
	);
}

export interface BiometricPoint {
	date: Date;
	label: string;
	log: RoutineLog;
	lowestSpO2?: number;
	avgSpO2?: number;
	minHR?: number;
	maxHR?: number;
	longestHold?: number;
	below70?: number;
	below60?: number;
	below50?: number;
	below40?: number;
}

/**
 * Extract session-level biometric points ordered chronologically.
 * Only logs with any biometric field populated are returned.
 */
export function extractBiometricSeries(logs: RoutineLog[]): BiometricPoint[] {
	return [...logs]
		.filter(
			(l) =>
				l.hasBiometricData === true ||
				typeof l.lowestSpO2 === 'number' ||
				typeof l.sessionAvgSpO2 === 'number' ||
				typeof l.sessionMinHR === 'number' ||
				typeof l.longestHold === 'number'
		)
		.sort((a, b) => a.date.toDate().getTime() - b.date.toDate().getTime())
		.map((l) => {
			const d = l.date.toDate();
			return {
				date: d,
				label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
				log: l,
				lowestSpO2: l.lowestSpO2,
				avgSpO2: l.sessionAvgSpO2,
				minHR: l.sessionMinHR,
				maxHR: l.sessionMaxHR,
				longestHold: l.longestHold,
				below70: l.totalTimeBelow70,
				below60: l.totalTimeBelow60,
				below50: l.totalTimeBelow50,
				below40: l.totalTimeBelow40
			};
		});
}

/**
 * Bucket logs by calendar month (YYYY-MM). Returns in chronological order.
 */
export function bucketLogsByMonth(
	logs: RoutineLog[]
): { key: string; label: string; date: Date; logs: RoutineLog[] }[] {
	const map = new Map<string, { date: Date; logs: RoutineLog[] }>();
	for (const log of logs) {
		const d = log.date.toDate();
		const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
		if (!map.has(key)) {
			map.set(key, { date: new Date(d.getFullYear(), d.getMonth(), 1), logs: [] });
		}
		map.get(key)!.logs.push(log);
	}
	return [...map.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, { date, logs }]) => ({
			key,
			label: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
			date,
			logs
		}));
}

export interface MonthlyStats {
	key: string;
	label: string;
	date: Date;
	n: number;
	mean: number;
	median: number;
	min: number;
	max: number;
	stdev: number;
	cv: number; // coefficient of variation (%), 0 if mean is 0
}

/**
 * Compute per-month mean/median/min/max/stdev/CV% for a metric.
 * Months with n < 1 are omitted; months with n < 2 get stdev=0 and cv=0.
 */
export function monthlyStats(
	logs: RoutineLog[],
	metric: MetricType,
	routine: RoutineTemplate
): MonthlyStats[] {
	const buckets = bucketLogsByMonth(logs);
	const out: MonthlyStats[] = [];
	for (const b of buckets) {
		const values = b.logs
			.map((l) => getMetricValue(metric, l, routine))
			.filter((v) => v > 0);
		if (values.length === 0) continue;
		const n = values.length;
		const mean = values.reduce((a, v) => a + v, 0) / n;
		const sorted = [...values].sort((a, b) => a - b);
		const median =
			n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
		const min = sorted[0];
		const max = sorted[n - 1];
		const variance = n > 1 ? values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1) : 0;
		const stdev = Math.sqrt(variance);
		const cv = mean > 0 ? (stdev / mean) * 100 : 0;
		out.push({ key: b.key, label: b.label, date: b.date, n, mean, median, min, max, stdev, cv });
	}
	return out;
}

/**
 * Readiness correlate metrics that are candidates for "does mood/HRV/sleep
 * predict my performance?" mini-scatter cards. Each entry declares a log
 * accessor so we don't depend on it being wired into the main metric catalog.
 */
export interface ReadinessCorrelate {
	key: string;
	label: string;
	/** Pull a value off a log, or undefined when missing. */
	get: (log: RoutineLog) => number | undefined;
	/** Does a higher value of this readiness metric typically indicate better readiness? */
	higherIsBetter: boolean;
}

export const READINESS_CORRELATES: ReadinessCorrelate[] = [
	{
		key: 'basalMood',
		label: 'Basal mood',
		get: (l) => l.basalMood,
		higherIsBetter: true
	},
	{
		key: 'restingHeartRate',
		label: 'Resting HR',
		get: (l) => l.restingHeartRate,
		higherIsBetter: false
	},
	{
		key: 'hrv',
		label: 'HRV',
		get: (l) => l.hrv,
		higherIsBetter: true
	},
	{
		key: 'hoursSinceLastMeal',
		label: 'Hours since last meal',
		get: (l) => l.hoursSinceLastMeal,
		higherIsBetter: false
	},
	{
		key: 'bodyWeight',
		label: 'Body weight',
		get: (l) => l.bodyWeight,
		higherIsBetter: false
	}
];

export interface ReadinessCorrelationResult {
	correlate: ReadinessCorrelate;
	n: number;
	slope: number;
	intercept: number;
	r2: number;
	/** Sign of slope — 'positive' when readiness up ⇒ result up, 'negative' inverse, 'flat' when slope=0. */
	direction: 'positive' | 'negative' | 'flat';
	points: { x: number; y: number; log: RoutineLog }[];
}

/**
 * For each readiness correlate with enough data, compute a linear regression
 * against the supplied (hero) metric. Returned only when n >= minN.
 */
export function computeReadinessCorrelations(
	logs: RoutineLog[],
	metric: MetricType,
	routine: RoutineTemplate,
	{ minN = 4 }: { minN?: number } = {}
): ReadinessCorrelationResult[] {
	const out: ReadinessCorrelationResult[] = [];
	for (const c of READINESS_CORRELATES) {
		const points: { x: number; y: number; log: RoutineLog }[] = [];
		for (const log of logs) {
			const x = c.get(log);
			const y = getMetricValue(metric, log, routine);
			if (typeof x === 'number' && Number.isFinite(x) && y > 0) {
				points.push({ x, y, log });
			}
		}
		if (points.length < minN) continue;
		const xs = points.map((p) => p.x);
		const ys = points.map((p) => p.y);
		const reg = linearRegression(xs, ys);
		out.push({
			correlate: c,
			n: points.length,
			slope: reg.slope,
			intercept: reg.intercept,
			r2: reg.r2,
			direction: reg.slope > 0 ? 'positive' : reg.slope < 0 ? 'negative' : 'flat',
			points
		});
	}
	return out.sort((a, b) => b.r2 - a.r2);
}
