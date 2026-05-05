# Missed and Premature Waypoint UX Plan

## Goal

Keep the dynamic dive recorder's one-button flow simple while making waypoint tracking resilient when the coach misses a tap or taps too early.

The recorder must:

1. Continue estimating distance when a waypoint tap is missed.
2. Advance the expected waypoint automatically when the estimated distance reaches halfway from the missed waypoint to the following waypoint.
3. Let the coach move back to the previous waypoint when they tapped early or the auto-counter got ahead of the diver.

## Current Behaviour

The recorder already separates pure state from side effects:

- `src/lib/capture/recorderState.ts` owns phases, timeline events, undo, and auto-advance state.
- `src/lib/capture/recorderSelectors.ts` derives live distance, speed, next waypoint, and auto-advance signals.
- `src/lib/components/DiveRecorder.svelte` renders the one-button UI and dispatches reducer events.

The live distance estimate is uncapped, which is correct. A missed tap should not freeze the distance display.

The fragile part is waypoint state: once the estimated distance gets far ahead of the expected tap, the UI can repeatedly signal auto-advance without establishing a clean expected waypoint model. The next implementation should make missed waypoints explicit data rather than a transient banner only.

## Proposed Model

Add an explicit waypoint cursor to recorder state:

```ts
interface WaypointCursor {
  expectedIndex: number;
  lastManualIndex: number;
  autoAdvancedIndexes: number[];
}
```

Interpretation:

- `expectedIndex` is the next waypoint the button should mark.
- `lastManualIndex` is the most recent waypoint confirmed by a real tap.
- `autoAdvancedIndexes` are waypoints the app skipped because the diver likely passed them.

The physical distance for a waypoint index is:

```ts
waypointIndex * waypointSpacingM(config)
```

This keeps wall and split targets in one ordered sequence. Existing wall/split timeline events can still be produced from the index when a manual tap is committed.

## Missed Tap Rule

If the coach misses waypoint `N`, the app should keep estimating distance. When estimated distance reaches halfway between waypoint `N` and waypoint `N + 1`, advance the cursor to `N + 1`.

Formula:

```ts
const thresholdM = targetDistanceM(expectedIndex) + waypointSpacingM(config) / 2;
if (cumulativeDistanceM(state, nowMs) >= thresholdM) autoAdvanceOneWaypoint();
```

This is intentionally 50% of the way to the next waypoint, matching poolside intuition: once the diver is nearer to the following target than the missed one, the UI should stop asking for the stale tap.

## Premature Tap Recovery

The one-button system should stay intact. Recovery can be handled by the existing secondary `Undo` button, but its meaning should expand:

- If the last action was a manual tap, `Undo` removes that tap and moves the cursor back one waypoint.
- If the last action was auto-advance, `Undo` moves the cursor back to the auto-skipped waypoint without deleting real timeline data.
- If several auto-advances happen, each `Undo` steps back one cursor position.

This avoids adding another primary control while giving the coach a direct escape hatch.

## UI Copy

Keep the primary button focused on the next action:

- Normal: `Waypoint 25 m`
- After auto-advance: `Waypoint 50 m`
- Toast: `Skipped 25 m - Undo if the diver is still before it.`
- After undoing an auto-advance: `Back to 25 m`

The toast should be short, time-limited, and non-blocking. The distance counter should never stop because of it.

## Reducer Events

Add or revise these pure events:

```ts
| { type: 'waypoint/autoAdvanced'; atPerfMs: number; fromIndex: number; toIndex: number }
| { type: 'waypoint/undoCursor' }
| { type: 'waypoint/manualTapped'; atPerfMs: number; index: number }
```

The reducer should be the only place that changes the cursor. `DiveRecorder.svelte` should only dispatch timestamped intents.

## Selector Changes

Add pure selectors:

```ts
expectedWaypointIndex(state): number
expectedWaypointDistanceM(state): number
shouldAutoAdvanceWaypoint(state, nowPerfMs): boolean
tapKindForWaypointIndex(state, index): 'split' | 'wall'
```

`nextWaypointM` should become a thin wrapper over `expectedWaypointDistanceM`.

## Implementation Steps

1. Add `WaypointCursor` to `RecorderState` and initialize it from an empty timeline.
2. Replace banner-only auto-advance with cursor advancement at the halfway threshold.
3. Change manual waypoint tap handling to commit the current `expectedIndex`, then increment the cursor.
4. Expand undo so it can reverse either a manual tap or an auto-advance.
5. Keep the primary button unchanged visually except for clearer `Waypoint {distance} m` text.
6. Add reducer/selector tests for missed split, missed wall, premature manual tap, premature auto-advance, and repeated undo.
7. Smoke test on phone landscape and portrait recording flows.

## Acceptance Criteria

- Distance continues to increase after a missed tap.
- The next waypoint advances once the diver is at least halfway from the missed waypoint to the following waypoint.
- Auto-advance never writes fake lap/split timestamps as if the coach tapped.
- Undo can move back after premature manual taps and premature auto-advances.
- The main recording flow still uses one primary button.
- No recorder freeze occurs when estimated distance gets more than one waypoint ahead.
