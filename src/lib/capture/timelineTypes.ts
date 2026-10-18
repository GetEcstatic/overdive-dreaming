/**
 * Dive timeline shapes, shared by the web app and Cloud Functions.
 *
 * Keep this file free of imports (no `$lib`, no Firebase) so the functions
 * bundle can include it.
 */

/**
 * One captured lap event during a dive (a wall-touch tap by the coach).
 * Times are milliseconds offset from the START of the recording.
 */
export interface LapEvent {
	lapNumber: number;
	atMs: number;              // ms offset from recording start
	cumulativeDistanceM: number; // laps * poolLength
	splitMs: number;           // ms since previous wall tap (or diveStartMs if lap 1)
}

/**
 * Free-form event marker on the dive timeline (e.g. turn, SP, note).
 */
export interface OverlayEvent {
	atMs: number;
	kind: 'marker' | 'note';
	label?: string;
}

/**
 * Structured timeline of a dive recording.
 * All times are ms offsets from the start of the recording, using a single
 * monotonic clock (`performance.now()`) to stay in sync with the video track.
 *
 * v2 additions (optional, backwards-compatible):
 *   - `subSplits`: mid-pool waypoint taps. Kept SEPARATE from `laps` so
 *     analytics never accidentally counts them as whole lengths. Each
 *     entry's `cumulativeDistanceM` is the fractional distance at the tap
 *     (e.g. 12.5 m for the mid-pool of a 25 m pool). `lapNumber` tracks
 *     the in-lap sub-split index (1-based).
 *   - `samples`: dense position/speed samples captured at ~1 Hz while
 *     diving. Lets analytics draw a smooth speed curve without relying on
 *     wall/split taps alone. Clips recorded pre-v2 have no samples — the
 *     replay HUD falls back to lap-based interpolation in that case.
 */
export interface DiveSample {
	atMs: number;
	distanceM: number;
	speedMs: number;
}

export interface DiveTimeline {
	diveStartMs: number;      // when "GO" was pressed (diver left wall)
	diveEndMs: number;        // when STOP was pressed
	laps: LapEvent[];
	subSplits?: LapEvent[];
	samples?: DiveSample[];
	events?: OverlayEvent[];
	/**
	 * When the surface protocol was marked done ("Protocol done" tap in the
	 * recorder), same clock as `diveEndMs`. Absent on older recordings and
	 * when the recording was stopped without the tap.
	 */
	protocolEndMs?: number;
}
