/**
 * Pure projection from a recorded `DiveTimeline` (plus the surrounding
 * `DiveVideo` metadata) to the field shape of a `RoutineLog`.
 *
 * Used by:
 *   - the gift-accept Cloud Function (`functions/src/acceptDiveGift.ts`)
 *     which creates a routine log on behalf of the giftee from the
 *     timeline already captured during the coach's recording.
 *
 * The helper is intentionally Timestamp-free: it deals only in plain
 * numbers, strings and `Date`s. Callers convert `date` to whichever
 * Firestore Timestamp type their environment uses (admin vs client).
 *
 * Mirror under `functions/src/lib/timelineToRoutineLog.ts` must be kept
 * in sync.
 */

import type {
	DiveTimeline,
	DiveVideoDiscipline,
	LapData,
	TimeOfDay
} from '$lib/types';
import { summariseTimeline } from './timeline';
import { defaultSpeedMs } from './disciplineSpeeds';

/**
 * Default routine id to attach a gifted dive to. Today the recorder only
 * ever produces one of the dynamic disciplines (DYN / DYNB / DNF), all of
 * which share the dynamic-max template. The athlete can change the
 * routine afterwards from the routine log edit form.
 */
export function defaultRoutineForDiscipline(
	_discipline: DiveVideoDiscipline
): string {
	return 'system-dynamic-max';
}

/**
 * Bucket a date into morning / afternoon / evening, matching the
 * convention used by the manual log path (see `src/lib/utils/sessions.ts`).
 *
 * Duplicated here as a pure function so the helper is independent of any
 * Firestore / DOM imports.
 */
export function timeOfDayFor(date: Date): TimeOfDay {
	const hour = date.getHours();
	if (hour >= 6 && hour < 12) return 'morning';
	if (hour >= 12 && hour < 18) return 'afternoon';
	return 'evening';
}

/**
 * "YYYY-MM-DD-{morning|afternoon|evening}" — the same scheme the manual
 * dives page uses when synthesising `sessionGroup`.
 */
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
	/** Date the dive was recorded — drives `sessionGroup` and `timeOfDay`. */
	recordedAt: Date;
	/** Fallback total dive time when timeline lacks a closing wall tap. */
	durationSeconds: number;
	/** Optional gifter display name. Used only to compose the default note. */
	coachDisplayName?: string;
}

/**
 * Plain-object payload describing the routine log fields derived from a
 * recording. Caller is responsible for adding `userId`, `id`, `createdAt`,
 * `updatedAt` and converting `date` to a Firestore Timestamp.
 */
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

/**
 * Project a `DiveTimeline` + `DiveVideo` metadata into a routine log
 * payload. Pure: no I/O, no Timestamp, no DOM.
 *
 * Falls back gracefully when the timeline is sparse (e.g. coach stopped
 * recording before tapping the final wall):
 *   - `totalTime` falls back to `durationSeconds`
 *   - `totalDistance` falls back to `lapCount * poolLength`
 *   - `laps` may be empty
 *
 * `hasDetailedData` is true iff the timeline carries at least one
 * recorded lap — i.e. the coach gave us walls / splits to plot.
 */
export function projectTimelineToRoutineLog(
	input: TimelineProjectionInput
): RoutineLogProjection {
	const summary = summariseTimeline(input.timeline, defaultSpeedMs(input.discipline));

	const totalTime =
		summary.totalTimeSeconds > 0 ? summary.totalTimeSeconds : input.durationSeconds;

	const totalDistance =
		summary.totalDistanceM > 0
			? summary.totalDistanceM
			: summary.lapCount * input.poolLength;

	const laps: LapData[] = summary.perLap.map((lap, i) => {
		const prevCumulative =
			i === 0 ? 0 : summary.perLap[i - 1].cumulativeDistanceM;
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
