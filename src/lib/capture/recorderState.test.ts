import { describe, expect, it } from 'vitest';
import {
	initialRecorderState,
	recorderReducer,
	waypointSpacingM,
	type RecorderConfig,
	type RecorderState
} from './recorderState';
import {
	buttonLayout,
	canMoveWaypointCursorBack,
	completedLapCount,
	cumulativeDistanceM,
	diveElapsedMs,
	liveSpeedMs,
	nextWaypointM,
	primaryActionSpec,
	shouldAutoAdvance,
	waypointCount
} from './recorderSelectors';

const CONFIG: RecorderConfig = {
	poolLengthM: 25,
	waypointsPerLap: 2, // 12.5 m spacing
	discipline: 'DYN',
	resolution: '720p',
	autoAdvanceThresholdM: 10,
	cameraPreference: { kind: 'auto-rear' }
};

function arm(state: RecorderState): RecorderState {
	const s1 = recorderReducer(state, { type: 'arm/succeeded' });
	return s1;
}

function startRecordingAt(state: RecorderState, t: number): RecorderState {
	return recorderReducer(state, { type: 'recording/started', atPerfMs: t });
}

function startDiveAt(state: RecorderState, t: number): RecorderState {
	return recorderReducer(state, { type: 'dive/started', atPerfMs: t });
}

describe('recorderReducer — phase transitions', () => {
	const base = initialRecorderState(CONFIG);

	it('starts in arming', () => {
		expect(base.phase).toBe('arming');
	});

	it('arm/succeeded → ready', () => {
		expect(arm(base).phase).toBe('ready');
	});

	it('arm/failed → error with message', () => {
		const s = recorderReducer(base, { type: 'arm/failed', message: 'nope' });
		expect(s.phase).toBe('error');
		expect(s.errorMessage).toBe('nope');
	});

	it('recording/started from ready → prepping and records clock', () => {
		const s = startRecordingAt(arm(base), 1000);
		expect(s.phase).toBe('prepping');
		expect(s.clocks.recordingStartedPerfMs).toBe(1000);
	});

	it('recording/started from any other phase is a no-op', () => {
		const s = startRecordingAt(base, 1000);
		expect(s).toBe(base);
	});

	it('dive/started from prepping → diving and sets diveStartMs offset', () => {
		const s = startDiveAt(startRecordingAt(arm(base), 1000), 5000);
		expect(s.phase).toBe('diving');
		expect(s.clocks.diveStartedPerfMs).toBe(5000);
		expect(s.timeline.diveStartMs).toBe(4000);
	});

	it('dive/ended from diving → ended and finalises timeline', () => {
		let s = startDiveAt(startRecordingAt(arm(base), 1000), 5000);
		s = recorderReducer(s, { type: 'dive/ended', atPerfMs: 9000 });
		expect(s.phase).toBe('ended');
		expect(s.clocks.diveEndedPerfMs).toBe(9000);
		expect(s.timeline.diveEndMs).toBe(8000);
	});

	it('recording/stopping from ended → stopping', () => {
		let s = startDiveAt(startRecordingAt(arm(base), 1000), 5000);
		s = recorderReducer(s, { type: 'dive/ended', atPerfMs: 9000 });
		s = recorderReducer(s, { type: 'recording/stopping' });
		expect(s.phase).toBe('stopping');
	});

	it('recording/stopping from prepping → stopping with zero-length dive', () => {
		let s = startRecordingAt(arm(base), 1000);
		s = recorderReducer(s, { type: 'recording/stopping' });
		expect(s.phase).toBe('stopping');
		expect(s.timeline.diveStartMs).toBe(0);
		expect(s.timeline.diveEndMs).toBe(0);
	});

	it('reset returns to a fresh initial state with same config', () => {
		const s = startDiveAt(startRecordingAt(arm(base), 1000), 5000);
		const reset = recorderReducer(s, { type: 'reset' });
		expect(reset.phase).toBe('arming');
		expect(reset.config).toEqual(CONFIG);
	});
});

describe('waypoints', () => {
	const diving = startDiveAt(
		startRecordingAt(arm(initialRecorderState(CONFIG)), 1000),
		5000
	);

	it('tap appends a lap at the current recording offset', () => {
		const s = recorderReducer(diving, {
			type: 'waypoint/tapped',
			atPerfMs: 15000
		});
		expect(s.timeline.laps).toHaveLength(0);
		expect(s.timeline.subSplits).toHaveLength(1);
		expect(s.timeline.subSplits![0].atMs).toBe(14000);
		expect(s.timeline.subSplits![0].cumulativeDistanceM).toBe(12.5);
		expect(s.waypointCursor.expectedIndex).toBe(2);
	});

	it('auto-advance moves the cursor without appending laps', () => {
		const s = recorderReducer(diving, {
			type: 'waypoint/auto',
			atPerfMs: 20000,
			count: 2
		});
		expect(s.timeline.laps).toHaveLength(0);
		expect(s.timeline.subSplits ?? []).toHaveLength(0);
		expect(s.waypointCursor.expectedIndex).toBe(3);
		expect(s.waypointCursor.autoAdvancedIndexes).toEqual([1, 2]);
		expect(s.autoAdvance).not.toBeNull();
		expect(s.autoAdvance?.count).toBe(2);
	});

	it('manual tap after auto-advance commits the current cursor target', () => {
		let s = recorderReducer(diving, {
			type: 'waypoint/auto',
			atPerfMs: 12000,
			count: 1
		});
		s = recorderReducer(s, {
			type: 'waypoint/manualTapped',
			atPerfMs: 20000
		});
		expect(s.timeline.laps).toHaveLength(1);
		expect(s.timeline.laps[0].cumulativeDistanceM).toBe(25);
		expect(s.waypointCursor.expectedIndex).toBe(3);
		expect(s.waypointCursor.manualHoldBackIndex).toBeNull();
	});

	it('cursor back steps through auto-advance without deleting timeline data', () => {
		let s = recorderReducer(diving, {
			type: 'waypoint/auto',
			atPerfMs: 12000,
			count: 1
		});
		expect(s.waypointCursor.expectedIndex).toBe(2);
		s = recorderReducer(s, { type: 'waypoint/cursorMoved', direction: -1 });
		expect(s.waypointCursor.expectedIndex).toBe(1);
		expect(s.timeline.laps).toHaveLength(0);
		expect(s.timeline.subSplits ?? []).toHaveLength(0);
	});

	it('cursor back holds the target against immediate auto-readvance', () => {
		let s = recorderReducer(diving, {
			type: 'waypoint/auto',
			atPerfMs: 17_055,
			count: 1
		});
		expect(s.waypointCursor.expectedIndex).toBe(2);

		s = recorderReducer(s, { type: 'waypoint/cursorMoved', direction: -1 });
		expect(s.waypointCursor.expectedIndex).toBe(1);
		expect(s.waypointCursor.manualHoldBackIndex).toBe(1);
		expect(shouldAutoAdvance(s, 28_410)).toBe(false);
	});

	it('cursor next changes the target without appending timeline data', () => {
		const s = recorderReducer(diving, { type: 'waypoint/cursorMoved', direction: 1 });
		expect(s.waypointCursor.expectedIndex).toBe(2);
		expect(s.timeline.laps).toHaveLength(0);
		expect(s.timeline.subSplits ?? []).toHaveLength(0);
	});

	it('cursor next clears a manual back hold', () => {
		let s = recorderReducer(diving, { type: 'waypoint/cursorMoved', direction: 1 });
		s = recorderReducer(s, { type: 'waypoint/cursorMoved', direction: -1 });
		expect(s.waypointCursor.manualHoldBackIndex).toBe(1);

		s = recorderReducer(s, { type: 'waypoint/cursorMoved', direction: 1 });
		expect(s.waypointCursor.expectedIndex).toBe(2);
		expect(s.waypointCursor.manualHoldBackIndex).toBeNull();
	});

	it('cursor back cannot target an already committed waypoint', () => {
		let s = recorderReducer(diving, { type: 'waypoint/tapped', atPerfMs: 15000 });
		expect(s.waypointCursor.expectedIndex).toBe(2);
		s = recorderReducer(s, { type: 'waypoint/cursorMoved', direction: -1 });
		expect(s.waypointCursor.expectedIndex).toBe(2);
		expect(s.timeline.subSplits).toHaveLength(1);
	});
});

describe('wall/split (v2)', () => {
	const diving = startDiveAt(
		startRecordingAt(arm(initialRecorderState(CONFIG)), 1000),
		5000
	);

	it('wall/tapped stamps an integer-multiple of poolLength', () => {
		const s = recorderReducer(diving, {
			type: 'wall/tapped',
			atPerfMs: 20000
		});
		expect(s.timeline.laps).toHaveLength(1);
		expect(s.timeline.laps[0].cumulativeDistanceM).toBe(25);
		expect((s.timeline.subSplits ?? []).length).toBe(0);
	});

	it('split/tapped stores a mid-lap waypoint in subSplits (not laps)', () => {
		const s = recorderReducer(diving, {
			type: 'split/tapped',
			atPerfMs: 12000
		});
		expect(s.timeline.laps).toHaveLength(0);
		expect(s.timeline.subSplits).toHaveLength(1);
		expect(s.timeline.subSplits![0].cumulativeDistanceM).toBe(12.5);
	});

	it('wall/tapped prunes in-lap sub-splits (wall is authoritative)', () => {
		let s: RecorderState = diving;
		s = recorderReducer(s, { type: 'split/tapped', atPerfMs: 12000 });
		s = recorderReducer(s, { type: 'wall/tapped', atPerfMs: 20000 });
		// Split was inside lap 1; after wall-1 it's discarded.
		expect(s.timeline.laps).toHaveLength(1);
		expect(s.timeline.laps[0].cumulativeDistanceM).toBe(25);
		expect(s.timeline.laps[0].splitMs).toBe(15000);
		expect((s.timeline.subSplits ?? []).length).toBe(0);
	});

	it('wall split time uses the whole pool length, preventing speed spikes after mid-lap waypoints', () => {
		const config: RecorderConfig = { ...CONFIG, poolLengthM: 50, waypointsPerLap: 4 };
		let s = startDiveAt(startRecordingAt(arm(initialRecorderState(config)), 1000), 5000);

		s = recorderReducer(s, { type: 'waypoint/tapped', atPerfMs: 15000 });
		s = recorderReducer(s, { type: 'waypoint/tapped', atPerfMs: 25000 });
		s = recorderReducer(s, { type: 'waypoint/tapped', atPerfMs: 35000 });
		s = recorderReducer(s, { type: 'waypoint/tapped', atPerfMs: 45000 });

		expect(s.timeline.laps).toHaveLength(1);
		expect(s.timeline.laps[0].cumulativeDistanceM).toBe(50);
		expect(s.timeline.laps[0].splitMs).toBe(40000);
		expect(liveSpeedMs(s)).toBeCloseTo(1.25, 5);
	});

	it('missed-split self-heal: split then wall with no intervening split still yields integer wall', () => {
		// Diver misses the 12.5 m split entirely, taps only at the 25 m wall.
		const s = recorderReducer(diving, { type: 'wall/tapped', atPerfMs: 22000 });
		expect(s.timeline.laps[0].cumulativeDistanceM).toBe(25);
	});

	it('split/tapped is rejected when there is no room before the next wall', () => {
		// waypointsPerLap=2 → only 1 split allowed per lap.
		let s: RecorderState = diving;
		s = recorderReducer(s, { type: 'split/tapped', atPerfMs: 12000 });
		s = recorderReducer(s, { type: 'split/tapped', atPerfMs: 14000 });
		expect(s.timeline.subSplits).toHaveLength(1);
	});

	it('sample/recorded appends to samples stream in order', () => {
		let s: RecorderState = diving;
		s = recorderReducer(s, {
			type: 'sample/recorded',
			atPerfMs: 6000,
			distanceM: 1,
			speedMs: 1
		});
		s = recorderReducer(s, {
			type: 'sample/recorded',
			atPerfMs: 7000,
			distanceM: 2,
			speedMs: 1
		});
		expect(s.timeline.samples).toHaveLength(2);
		expect(s.timeline.samples![1].distanceM).toBe(2);
	});

	it('sample/recorded drops out-of-order arrivals', () => {
		let s: RecorderState = diving;
		s = recorderReducer(s, {
			type: 'sample/recorded',
			atPerfMs: 7000,
			distanceM: 2,
			speedMs: 1
		});
		s = recorderReducer(s, {
			type: 'sample/recorded',
			atPerfMs: 6000,
			distanceM: 1,
			speedMs: 1
		});
		expect(s.timeline.samples).toHaveLength(1);
	});
});

describe('selectors', () => {
	const diving = startDiveAt(
		startRecordingAt(arm(initialRecorderState(CONFIG)), 1000),
		5000
	);

	it('diveElapsedMs is 0 before diving starts', () => {
		expect(diveElapsedMs(initialRecorderState(CONFIG), 9999)).toBe(0);
	});

	it('diveElapsedMs matches now - diveStartedPerfMs while diving', () => {
		expect(diveElapsedMs(diving, 11000)).toBe(6000);
	});

	it('diveElapsedMs freezes at diveEnd after dive/ended', () => {
		const s = recorderReducer(diving, { type: 'dive/ended', atPerfMs: 9000 });
		expect(diveElapsedMs(s, 99999)).toBe(4000);
	});

	it('cumulativeDistanceM interpolates at the discipline default speed (DYN=1.1 m/s) before first lap', () => {
		// now = 5000 + 3000ms = 8000 → expect 3.3 m interpolated (3 s × 1.1 m/s),
		// uncapped in v2.
		expect(cumulativeDistanceM(diving, 8000)).toBeCloseTo(3.3, 5);
	});

	it('cumulativeDistanceM is uncapped in v2 — keeps advancing past the next target', () => {
		// Huge elapsed time → the HUD keeps advancing linearly instead of
		// pinning at nextWaypointM. The reducer snaps to the correct
		// integer distance on the next real wall tap.
		// 1_000_000 ms - 5000 ms (dive start) = 995 s × 1.1 m/s (DYN) = 1094.5 m.
		expect(cumulativeDistanceM(diving, 1_000_000)).toBeCloseTo(1094.5, 5);
	});

	it('cumulativeDistanceM freezes uncapped at dive-end (no revert to last waypoint)', () => {
		// Dive-start at 5s, first waypoint at 15s (12.5m at 1.25m/s), end at 18s.
		// Expected: 12.5 + 1.25 * 3 = 16.25m (NOT 12.5m).
		const afterWaypoint = recorderReducer(diving, {
			type: 'waypoint/tapped',
			atPerfMs: 15000
		});
		const ended = recorderReducer(afterWaypoint, {
			type: 'dive/ended',
			atPerfMs: 18000
		});
		expect(cumulativeDistanceM(ended, 99999)).toBeCloseTo(16.25, 5);
	});

	it('nextWaypointM targets split then wall (wpl=2)', () => {
		// Fresh dive, no taps: next expected is a split at 12.5m.
		expect(nextWaypointM(diving)).toBeCloseTo(12.5, 5);
		// After a split, next expected is the wall at 25m.
		const afterSplit = recorderReducer(diving, {
			type: 'split/tapped',
			atPerfMs: 12000
		});
		expect(nextWaypointM(afterSplit)).toBeCloseTo(25, 5);
		// After a wall, next expected is the next split at 37.5m.
		const afterWall = recorderReducer(afterSplit, {
			type: 'wall/tapped',
			atPerfMs: 20000
		});
		expect(nextWaypointM(afterWall)).toBeCloseTo(37.5, 5);
	});

	it('liveSpeedMs defaults to the discipline speed (DYN=1.1 m/s) before first lap', () => {
		expect(liveSpeedMs(diving)).toBeCloseTo(1.1, 5);
	});

	it('waypointCount reflects user-defined waypoints, while completedLapCount reflects pool lengths', () => {
		let s = recorderReducer(diving, { type: 'split/tapped', atPerfMs: 12000 });
		expect(waypointCount(s)).toBe(1);
		expect(completedLapCount(s)).toBe(0);

		s = recorderReducer(s, { type: 'wall/tapped', atPerfMs: 20000 });
		expect(waypointCount(s)).toBe(2);
		expect(completedLapCount(s)).toBe(1);
	});

	it('waypointCount and completedLapCount handle 50m pools with 4 waypoints per lap', () => {
		const config: RecorderConfig = { ...CONFIG, poolLengthM: 50, waypointsPerLap: 4 };
		let s = startDiveAt(startRecordingAt(arm(initialRecorderState(config)), 1000), 5000);

		s = recorderReducer(s, { type: 'waypoint/tapped', atPerfMs: 10000 });
		expect(waypointCount(s)).toBe(1);
		expect(completedLapCount(s)).toBe(0);

		s = recorderReducer(s, { type: 'waypoint/tapped', atPerfMs: 15000 });
		s = recorderReducer(s, { type: 'waypoint/tapped', atPerfMs: 20000 });
		s = recorderReducer(s, { type: 'waypoint/tapped', atPerfMs: 25000 });
		expect(waypointCount(s)).toBe(4);
		expect(completedLapCount(s)).toBe(1);
	});

	it('waypointSpacingM = poolLength / waypointsPerLap', () => {
		expect(waypointSpacingM(CONFIG)).toBe(12.5);
	});

	it('canMoveWaypointCursorBack only allows uncommitted targets', () => {
		expect(canMoveWaypointCursorBack(diving)).toBe(false);

		let s = recorderReducer(diving, { type: 'waypoint/cursorMoved', direction: 1 });
		expect(canMoveWaypointCursorBack(s)).toBe(true);

		s = recorderReducer(s, { type: 'waypoint/tapped', atPerfMs: 15000 });
		expect(canMoveWaypointCursorBack(s)).toBe(false);
	});
});

describe('shouldAutoAdvance (halfway to following waypoint)', () => {
	const diving = startDiveAt(
		startRecordingAt(arm(initialRecorderState(CONFIG)), 0),
		0
	);

	it('does not trigger before halfway from the expected waypoint to the next one', () => {
		// First expected waypoint is 12.5 m. Halfway to the following waypoint
		// is 18.75 m. At 1.1 m/s, 18.74 m is about 17.036 s.
		expect(shouldAutoAdvance(diving, 17_036)).toBe(false);
	});

	it('triggers once the diver is halfway to the following waypoint', () => {
		// 18.76 m at 1.1 m/s is about 17.055 s.
		expect(shouldAutoAdvance(diving, 17_055)).toBe(true);
	});

	it('continues auto-advance at the next wall after a missed waypoint', () => {
		const advanced = recorderReducer(diving, {
			type: 'waypoint/auto',
			atPerfMs: 17_055,
			count: 1
		});
		// Cursor now expects 25 m, which is the wall for a 25m/2-waypoint lap.
		expect(shouldAutoAdvance(advanced, 28_400)).toBe(false);
		expect(shouldAutoAdvance(advanced, 28_410)).toBe(true);
	});

	it('continues auto-advance after manual cursor adjustment', () => {
		let s = recorderReducer(diving, { type: 'waypoint/cursorMoved', direction: 1 });
		expect(nextWaypointM(s)).toBe(25);
		expect(shouldAutoAdvance(s, 28_410)).toBe(true);

		s = recorderReducer(s, { type: 'waypoint/auto', atPerfMs: 28_410, count: 1 });
		expect(nextWaypointM(s)).toBe(37.5);
	});

	it('uses the advanced cursor target for another mid-lap waypoint', () => {
		const config: RecorderConfig = { ...CONFIG, poolLengthM: 50, waypointsPerLap: 4 };
		const fourPointDive = startDiveAt(startRecordingAt(arm(initialRecorderState(config)), 0), 0);
		const advanced = recorderReducer(fourPointDive, {
			type: 'waypoint/auto',
			atPerfMs: 11_370,
			count: 1
		});

		// Cursor now expects 25 m. Halfway to 37.5 m is 31.25 m.
		expect(shouldAutoAdvance(advanced, 28_400)).toBe(false);
		expect(shouldAutoAdvance(advanced, 28_410)).toBe(true);
	});

	it('auto-advances over wall waypoints when the live distance passes them', () => {
		const config: RecorderConfig = { ...CONFIG, poolLengthM: 50, waypointsPerLap: 4 };
		let s = startDiveAt(startRecordingAt(arm(initialRecorderState(config)), 0), 0);
		s = recorderReducer(s, { type: 'waypoint/auto', atPerfMs: 11_400, count: 1 });
		s = recorderReducer(s, { type: 'waypoint/auto', atPerfMs: 22_800, count: 1 });
		s = recorderReducer(s, { type: 'waypoint/auto', atPerfMs: 34_100, count: 1 });

		expect(s.waypointCursor.expectedIndex).toBe(4);
		expect(shouldAutoAdvance(s, 52_000)).toBe(true);
	});

	it('does not trigger outside diving phase', () => {
		const s = recorderReducer(diving, { type: 'dive/ended', atPerfMs: 100000 });
		expect(shouldAutoAdvance(s, 100000)).toBe(false);
	});
});

describe('buttonLayout', () => {
	const base = initialRecorderState(CONFIG);

	it('ready → Cancel + Record', () => {
		const layout = buttonLayout(arm(base));
		expect(layout.buttons.map((b) => b.kind)).toEqual(['cancel', 'record']);
	});

	it('prepping → Stop + Start dive', () => {
		const s = startRecordingAt(arm(base), 0);
		const layout = buttonLayout(s);
		expect(layout.buttons.map((b) => b.kind)).toEqual([
			'stopRecording',
			'startDive'
		]);
	});

	it('diving → Previous waypoint + Waypoint + Next waypoint', () => {
		const s = startDiveAt(startRecordingAt(arm(base), 0), 0);
		const layout = buttonLayout(s);
		expect(layout.buttons.map((b) => b.kind)).toEqual([
			'previousWaypoint',
			'waypoint',
			'nextWaypoint'
		]);
		expect(layout.buttons[0].disabled).toBe(true);
	});

	it('ended → Stop recording', () => {
		let s = startDiveAt(startRecordingAt(arm(base), 0), 0);
		s = recorderReducer(s, { type: 'dive/ended', atPerfMs: 1 });
		expect(buttonLayout(s).buttons.map((b) => b.kind)).toEqual([
			'stopRecording'
		]);
	});
});

describe('primaryActionSpec', () => {
	const base = initialRecorderState(CONFIG);

	it('ready maps to the record action', () => {
		const spec = primaryActionSpec(arm(base));
		expect(spec.action).toBe('record');
		expect(spec.supportsLongPressEndDive).toBe(false);
		expect(spec.disabled).toBe(false);
	});

	it('prepping maps to the start-dive action', () => {
		const spec = primaryActionSpec(startRecordingAt(arm(base), 0));
		expect(spec.action).toBe('startDive');
		expect(spec.supportsLongPressEndDive).toBe(false);
	});

	it('diving maps to a waypoint action with long-press end enabled', () => {
		const s = startDiveAt(startRecordingAt(arm(base), 0), 0);
		const spec = primaryActionSpec(s);
		expect(spec.action).toBe('waypoint');
		expect(spec.label).toBe('Tap to mark');
		expect(spec.sub).toBe('Waypoint 12.5 m / hold to end dive');
		expect(spec.supportsLongPressEndDive).toBe(true);
	});

	it('ended maps to stop recording', () => {
		let s = startDiveAt(startRecordingAt(arm(base), 0), 0);
		s = recorderReducer(s, { type: 'dive/ended', atPerfMs: 1 });
		expect(primaryActionSpec(s).action).toBe('stopRecording');
	});

	it('non-action phases are disabled', () => {
		expect(primaryActionSpec(base).disabled).toBe(true);
		expect(primaryActionSpec(base).action).toBe('disabled');
	});
});
