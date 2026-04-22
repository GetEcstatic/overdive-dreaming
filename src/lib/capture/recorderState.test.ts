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
	canUndo,
	cumulativeDistanceM,
	diveElapsedMs,
	liveSpeedMs,
	nextWaypointM,
	shouldAutoAdvance,
	waypointCount
} from './recorderSelectors';

const CONFIG: RecorderConfig = {
	poolLengthM: 25,
	waypointsPerLap: 2, // 12.5 m spacing
	discipline: 'DYN',
	resolution: '720p',
	autoAdvanceThresholdM: 10
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

	it('orientation/changed updates isLandscape', () => {
		const s = recorderReducer(base, {
			type: 'orientation/changed',
			isLandscape: false
		});
		expect(s.isLandscape).toBe(false);
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
		expect(s.timeline.laps).toHaveLength(1);
		expect(s.timeline.laps[0].atMs).toBe(14000);
		expect(s.timeline.laps[0].cumulativeDistanceM).toBe(12.5);
	});

	it('undo removes the last lap', () => {
		let s = recorderReducer(diving, {
			type: 'waypoint/tapped',
			atPerfMs: 15000
		});
		s = recorderReducer(s, { type: 'waypoint/undone' });
		expect(s.timeline.laps).toHaveLength(0);
	});

	it('auto-advance appends N laps and sets the banner', () => {
		const s = recorderReducer(diving, {
			type: 'waypoint/auto',
			atPerfMs: 20000,
			count: 2
		});
		expect(s.timeline.laps).toHaveLength(2);
		expect(s.autoAdvance).not.toBeNull();
		expect(s.autoAdvance?.count).toBe(2);
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

	it('cumulativeDistanceM interpolates at 1 m/s before first lap', () => {
		// now = 5000 + 3000ms = 8000 → expect 3 m interpolated, capped at
		// waypoint target 12.5 m → 3 m.
		expect(cumulativeDistanceM(diving, 8000)).toBeCloseTo(3, 5);
	});

	it('cumulativeDistanceM is capped at the next waypoint target', () => {
		// Huge elapsed time → clamp at nextWaypointM (12.5).
		expect(cumulativeDistanceM(diving, 1_000_000)).toBeCloseTo(12.5, 5);
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

	it('nextWaypointM steps by spacing after each tap', () => {
		const s = recorderReducer(diving, {
			type: 'waypoint/tapped',
			atPerfMs: 15000
		});
		expect(nextWaypointM(s)).toBeCloseTo(25, 5);
	});

	it('liveSpeedMs defaults to 1 before first lap', () => {
		expect(liveSpeedMs(diving)).toBe(1);
	});

	it('waypointCount reflects taps', () => {
		const s = recorderReducer(diving, {
			type: 'waypoint/tapped',
			atPerfMs: 15000
		});
		expect(waypointCount(s)).toBe(1);
	});

	it('waypointSpacingM = poolLength / waypointsPerLap', () => {
		expect(waypointSpacingM(CONFIG)).toBe(12.5);
	});

	it('canUndo only while diving and at least one lap', () => {
		expect(canUndo(diving)).toBe(false);
		const s = recorderReducer(diving, {
			type: 'waypoint/tapped',
			atPerfMs: 15000
		});
		expect(canUndo(s)).toBe(true);
	});
});

describe('shouldAutoAdvance (10 m threshold)', () => {
	const diving = startDiveAt(
		startRecordingAt(arm(initialRecorderState(CONFIG)), 0),
		0
	);

	it('does not trigger at 9.99 m over target', () => {
		// Target is 12.5 m. Over by ~9.99 → raw distance ≈ 22.49.
		// At 1 m/s, elapsed = 22.49 s → perf = 22490.
		expect(shouldAutoAdvance(diving, 22_490)).toBe(false);
	});

	it('triggers at 10.01 m over target', () => {
		// raw ≈ 22.51 m → over by 10.01.
		expect(shouldAutoAdvance(diving, 22_510)).toBe(true);
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

	it('diving → Undo + Waypoint + End dive', () => {
		const s = startDiveAt(startRecordingAt(arm(base), 0), 0);
		const layout = buttonLayout(s);
		expect(layout.buttons.map((b) => b.kind)).toEqual([
			'undoWaypoint',
			'waypoint',
			'endDive'
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
