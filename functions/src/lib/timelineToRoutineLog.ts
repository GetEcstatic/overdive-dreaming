/**
 * Vendored copy of the timeline-summarisation + routine-log projection
 * helpers used by the dive recorder. Kept here as a self-contained module
 * because Cloud Functions cannot import from the SvelteKit `src/lib/`
 * tree.
 *
 * KEEP IN SYNC with:
 *   - src/lib/capture/timeline.ts             (summariseTimeline et al)
 *   - src/lib/capture/timelineToRoutineLog.ts (projectTimelineToRoutineLog)
 *
 * Pure: no Firestore, no Admin SDK, no DOM. Returns plain numbers,
 * strings and `Date`s. The caller wraps `date` in whichever Timestamp
 * type its environment uses.
 */

// ---------------------------------------------------------------------------
// Types (mirror of the relevant slice of src/lib/types.ts)
// ---------------------------------------------------------------------------

export interface LapEvent {
	lapNumber: number;
	atMs: number;
	cumulativeDistanceM: number;
	splitMs: number;
}

export interface DiveSample {
	atMs: number;
	distanceM: number;
	speedMs: number;
}

export interface OverlayEvent {
	atMs: number;
	kind: 'marker' | 'note';
	label?: string;
}

export interface DiveTimeline {
	diveStartMs: number;
	diveEndMs: number;
	laps: LapEvent[];
	subSplits?: LapEvent[];
	samples?: DiveSample[];
	events?: OverlayEvent[];
}

export type DiveVideoDiscipline = 'DYN' | 'DYNB' | 'DNF';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export interface LapData {
	lapNumber: number;
	timeSeconds?: number;
	distanceMeters?: number;
	restAfterSeconds?: number;
	kicks?: number;
	armPulls?: number;
	speedMs?: number;
	completed?: boolean;
}

// ---------------------------------------------------------------------------
// Timeline-summary helpers (vendored from src/lib/capture/timeline.ts)
// ---------------------------------------------------------------------------

function totalTimeMs(timeline: DiveTimeline): number {
	return Math.max(0, timeline.diveEndMs - timeline.diveStartMs);
}

function totalDistanceM(timeline: DiveTimeline): number {
	const samples = timeline.samples;
	if (samples && samples.length > 0) {
		const last = samples[samples.length - 1];
		const tailMs = Math.max(0, timeline.diveEndMs - last.atMs);
		return last.distanceM + (tailMs / 1000) * last.speedMs;
	}

	if (timeline.laps.length === 0) return 0;
	const lastLap = timeline.laps[timeline.laps.length - 1];
	const base = lastLap.cumulativeDistanceM;
	const tailMs = Math.max(0, timeline.diveEndMs - lastLap.atMs);
	if (tailMs === 0) return base;
	const prevDistance =
		timeline.laps.length > 1
			? timeline.laps[timeline.laps.length - 2].cumulativeDistanceM
			: 0;
	const lapDistance = lastLap.cumulativeDistanceM - prevDistance;
	const speedMs = lastLap.splitMs > 0 ? lapDistance / (lastLap.splitMs / 1000) : 1;
	return base + speedMs * (tailMs / 1000);
}

function averageSpeedMs(timeline: DiveTimeline): number {
	const totalMs = totalTimeMs(timeline);
	if (totalMs <= 0) return 0;
	return totalDistanceM(timeline) / (totalMs / 1000);
}

interface LapSplit {
	lapNumber: number;
	splitSeconds: number;
	avgSpeedMs: number;
	cumulativeDistanceM: number;
}

interface TimelineSummary {
	totalTimeSeconds: number;
	totalDistanceM: number;
	averageSpeedMs: number;
	lapCount: number;
	avgSplitSeconds: number;
	fastestLapSeconds: number | null;
	slowestLapSeconds: number | null;
	perLap: LapSplit[];
}

function summariseTimeline(timeline: DiveTimeline): TimelineSummary {
	const totalMs = totalTimeMs(timeline);
	const distance = totalDistanceM(timeline);
	const lapCount = timeline.laps.length;

	const splitSecs = timeline.laps.map((l) => l.splitMs / 1000);
	const avgSplit = splitSecs.length ? splitSecs.reduce((a, b) => a + b, 0) / splitSecs.length : 0;
	const fastest = splitSecs.length ? Math.min(...splitSecs) : null;
	const slowest = splitSecs.length ? Math.max(...splitSecs) : null;

	const perLap: LapSplit[] = timeline.laps.map((lap, i) => {
		const prevDistance = i === 0 ? 0 : timeline.laps[i - 1].cumulativeDistanceM;
		const lapDistance = lap.cumulativeDistanceM - prevDistance;
		const splitSeconds = lap.splitMs / 1000;
		return {
			lapNumber: lap.lapNumber,
			splitSeconds,
			avgSpeedMs: splitSeconds > 0 ? lapDistance / splitSeconds : 0,
			cumulativeDistanceM: lap.cumulativeDistanceM
		};
	});

	return {
		totalTimeSeconds: totalMs / 1000,
		totalDistanceM: distance,
		averageSpeedMs: averageSpeedMs(timeline),
		lapCount,
		avgSplitSeconds: avgSplit,
		fastestLapSeconds: fastest,
		slowestLapSeconds: slowest,
		perLap
	};
}

// ---------------------------------------------------------------------------
// Public projection helpers (mirror of src/lib/capture/timelineToRoutineLog.ts)
// ---------------------------------------------------------------------------

export function defaultRoutineForDiscipline(
	_discipline: DiveVideoDiscipline
): string {
	return 'system-dynamic-max';
}

export function timeOfDayFor(date: Date): TimeOfDay {
	const hour = date.getHours();
	if (hour >= 6 && hour < 12) return 'morning';
	if (hour >= 12 && hour < 18) return 'afternoon';
	return 'evening';
}

export function sessionGroupFor(date: Date): string {
	const yyyy = date.getFullYear();
	const mm = String(date.getMonth() + 1).padStart(2, '0');
	const dd = String(date.getDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}-${timeOfDayFor(date)}`;
}

export interface TimelineProjectionInput {
	timeline: DiveTimeline;
	discipline: DiveVideoDiscipline;
	poolLength: number;
	recordedAt: Date;
	durationSeconds: number;
	coachDisplayName?: string;
}

export interface RoutineLogProjection {
	routineId: string;
	disciplineUsed: DiveVideoDiscipline;
	date: Date;
	timeOfDay: TimeOfDay;
	sessionGroup: string;
	poolLength: number;
	totalTime: number;
	totalDistance: number;
	avgSpeedMs?: number;
	fastestLapSpeedMs?: number;
	slowestLapSpeedMs?: number;
	laps: LapData[];
	notes: string;
	hasDetailedData: boolean;
}

export function projectTimelineToRoutineLog(
	input: TimelineProjectionInput
): RoutineLogProjection {
	const summary = summariseTimeline(input.timeline);

	const totalTime =
		summary.totalTimeSeconds > 0 ? summary.totalTimeSeconds : input.durationSeconds;

	const totalDistance =
		summary.totalDistanceM > 0
			? summary.totalDistanceM
			: summary.lapCount * input.poolLength;

	const laps: LapData[] = summary.perLap.map((lap, i) => {
		const prevCumulative = i === 0 ? 0 : summary.perLap[i - 1].cumulativeDistanceM;
		const distanceMeters = lap.cumulativeDistanceM - prevCumulative;
		return {
			lapNumber: lap.lapNumber,
			timeSeconds: lap.splitSeconds,
			distanceMeters,
			speedMs: lap.avgSpeedMs,
			completed: true
		};
	});

	const lapSpeeds = laps
		.map((l) =>
			l.timeSeconds && l.timeSeconds > 0
				? (l.distanceMeters ?? 0) / l.timeSeconds
				: null
		)
		.filter((v): v is number => v !== null && Number.isFinite(v));

	const fastestLapSpeedMs = lapSpeeds.length > 0 ? Math.max(...lapSpeeds) : undefined;
	const slowestLapSpeedMs = lapSpeeds.length > 0 ? Math.min(...lapSpeeds) : undefined;

	const notes = input.coachDisplayName
		? `Gifted by ${input.coachDisplayName}`
		: 'Gifted dive';

	return {
		routineId: defaultRoutineForDiscipline(input.discipline),
		disciplineUsed: input.discipline,
		date: input.recordedAt,
		timeOfDay: timeOfDayFor(input.recordedAt),
		sessionGroup: sessionGroupFor(input.recordedAt),
		poolLength: input.poolLength,
		totalTime,
		totalDistance,
		avgSpeedMs: summary.averageSpeedMs > 0 ? summary.averageSpeedMs : undefined,
		fastestLapSpeedMs,
		slowestLapSpeedMs,
		laps,
		notes,
		hasDetailedData: summary.lapCount > 0
	};
}
