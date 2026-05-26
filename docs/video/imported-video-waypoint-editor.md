# Imported Video Waypoint Editor

## Purpose

Imported videos now let an athlete replay a finished clip and mark start, waypoints, and end with a recorder-like main-button flow. That is fast, but it is easy to make small timing mistakes or add an accidental extra waypoint, especially when the user forgets that ending the dive requires a long press.

This plan designs the correction experience after tracking and before save. The goal is to make waypoint correction precise, readable, and calm on a phone without making the recording pass slower.

## Recommended Direction

Build a two-layer review editor:

1. A compact summary correction layer for common mistakes.
2. A structured lap-stacked marker editor for precise waypoint timing.

The lap-stacked editor is the better long-term UX than one crowded horizontal timeline. A single horizontal video timeline is familiar, but it becomes unreadable when waypoint density rises. At 10 waypoints per 50 m lap, a 200 m dive has 40 markers. On a mobile viewport, those markers become tiny, overlap, and are hard to select accurately.

A lap-stacked editor keeps time and distance legible by organizing markers by pool length instead of forcing every event onto one line. Each lap gets its own row or vertical column, and waypoints are shown as ordered markers inside that lap. The user can correct the exact segment that looks wrong without searching across the full dive.

## Visual Mockup

- [230 m dynamic dive mockup](imported-video-waypoint-editor-230m-mockup.svg) — mobile-first lap-ruler concept for a 50 m pool with 5 m waypoint spacing.

The mockup represents 230 m as four complete 50 m laps plus a final 30 m partial lap. It shows a full-screen imported-video editor with a video preview, summary stats, a compact global position bar, dense lap ruler rows, one warning marker, and a selected marker bottom sheet.

## UX Principles

- Keep the full-screen tracking pass simple: one main button, cancel, and optional +/-10 s seek controls.
- Assume marking errors are normal, not exceptional.
- Put correction after tracking, before save, where the user is calmer and can inspect data.
- Prefer direct manipulation where possible, but always provide a numeric fallback.
- Make implausible data visually obvious.
- Preserve the mental model from the live recorder: start, waypoints, end, distance, split time, speed.
- Avoid making the user edit raw milliseconds unless they explicitly open an advanced control.

## Problems To Solve

### Dense Waypoints

A linear timeline becomes cluttered when waypoint spacing is small.

Example: 50 m pool, 10 waypoints per lap, 5 m spacing.

At 4 laps, the user sees 40 markers plus start and end. On mobile, each marker may have only a few pixels of spacing.

Resolution:

- Use a lap-stacked layout as the primary editor.
- Collapse waypoint labels by default, showing labels only for selected or flagged markers.
- Use the marker order and distance from lap start as the stable reference.
- Provide zoom only as a secondary enhancement, not the main strategy.

### Marker Selection Precision

Small markers are hard to tap, especially if two timestamps are close.

Resolution:

- Make markers visually small but tap targets large.
- Selecting a marker opens a bottom sheet with large controls.
- Allow +/-0.1 s, +/-0.5 s, and +/-1.0 s nudges.
- Allow scrub-to-current-time replacement: pause video at the right frame, tap "Move marker here".

### Accidental Extra Waypoint

A short tap after the last real waypoint can add a false segment and inflate distance.

Resolution:

- Highlight the last segment if its speed is implausibly different from nearby segments.
- Provide a prominent "Remove last waypoint" action in the first review screen.
- In the lap editor, allow delete on any selected waypoint.
- After long-press end, avoid accepting another primary tap as a waypoint.

### End-Dive Mistakes

Ending a dive by long press is easy to forget. A mistaken short tap creates an extra waypoint instead of ending the dive.

Resolution:

- In review, make end time editable independently of waypoints.
- If the final waypoint is very close to the end time, offer "Use final waypoint as end" and "Delete final waypoint" actions.
- If the last segment speed exceeds a threshold, surface a warning: "Last segment looks fast. Did you mean to end the dive?"

### Timeline And Video Sync

Markers are only useful if the user can verify them against the video frame.

Resolution:

- Selecting a marker seeks the video to that timestamp.
- Scrubbing the video highlights the active segment.
- The marker sheet includes a small timestamp and current frame controls.
- The editor uses the same `DiveTimeline` data that gets saved, so there is no separate correction model to reconcile.

### Mobile Screen Space

The editor must work on a 375 px wide phone with bottom nav and safe-area insets.

Resolution:

- Use a full-screen review mode, not a small card inside the normal page.
- Keep the video preview at the top, with a scrollable marker editor below.
- Pin the selected marker controls to a bottom sheet.
- Avoid always-visible dense tables on small screens.

## Proposed UI Flow

### Step 1: Tracking Pass

The existing imported-video full-screen flow remains mostly unchanged.

Primary button sequence:

1. Play.
2. Start dive.
3. Mark waypoint.
4. Long press to end dive.
5. Review.

Secondary controls:

- Cancel.
- -10 s.
- +10 s.

No extra marker-management controls should be visible during this pass unless we add a single Undo affordance later.

### Step 2: Quick Review Summary

After tracking, before final save, show a correction summary.

Content:

- Total distance.
- Dive time.
- Waypoint count.
- Average speed.
- Fastest segment.
- Slowest segment.
- Warning count, if any.

Primary actions:

- Save.
- Edit waypoints.
- Re-track video.

Contextual quick fixes:

- Remove last waypoint.
- Set end to current video time.
- Use last waypoint as end.

This step handles common mistakes without forcing every user into the full editor.

### Step 3: Lap-Stacked Waypoint Editor

This is the main correction interface.

Layout on mobile:

- Top: video preview, compact HUD, and scrub bar.
- Middle: scrollable lap stack.
- Bottom: selected marker sheet when a marker is selected.

Each lap row represents one pool length.

For a 50 m pool with 10 waypoints per lap:

```text
Lap 1   | 5m  10m  15m  20m  25m  30m  35m  40m  45m  50m
        | 4.0 8.1 12.0 16.0 20.2 24.1 28.0 32.2 36.1 40.0s

Lap 2   | 5m  10m  15m  20m  25m  30m  35m  40m  45m  50m
        | ...
```

The row does not need to show every timestamp all the time. At dense settings, show marker dots and only label selected/flagged markers.

Desktop/tablet can expand into a two-pane layout:

- Left: video and selected marker controls.
- Right: lap stack/table.

## Your Vertical Line Idea

A numbered vertical line for each lap is a strong idea, especially for mobile.

Interpretation:

- Each lap is a vertical ruler.
- The top is the start of the lap.
- The bottom is the wall/end of the lap.
- Waypoints are placed along the ruler by distance from the start of that lap.
- The marker label shows local distance, such as `15 m`, and optionally split time.

Example:

```text
Lap 3
  |  5 m   3.9s
  | 10 m   7.8s
  | 15 m  11.9s
  | 20 m  15.8s
  | 25 m  19.7s
```

This may be even better than horizontal lap rows on narrow phones because it gives each marker more vertical room. It also matches how a diver/coach thinks about pool progression: one lap at a time, distance from the wall.

Recommended use:

- Use vertical lap rulers as the mobile-first representation.
- Use horizontal lap rows or a denser table on wider screens.
- Let the user switch between "Laps" and "Segments" later if needed.

## Alternative UI Patterns

### Option A: Lap Rulers

Each lap is a vertical ruler card.

Strengths:

- Excellent for many waypoints.
- Easy to scan one lap at a time.
- Natural place to show local distance from lap start.
- Good mobile ergonomics.

Weaknesses:

- Time is less spatially obvious than on a horizontal timeline.
- Long dives create a tall scroll area.
- Comparing lap-to-lap pacing requires extra summary labels.

Mitigations:

- Add lap header metrics: lap time, average speed, fastest/slowest segment.
- Auto-scroll to selected marker.
- Keep a mini overview at the top.

### Option B: Segment Table

Rows are segment records: distance, timestamp, split, speed, actions.

Strengths:

- Precise and simple to implement.
- Very clear for correcting numbers.
- Works well with warnings and validation.

Weaknesses:

- Less visual and less pleasant.
- Harder to connect rows to video position.
- Feels more like admin/data entry.

Mitigations:

- Pair each row with "jump to video".
- Use this as the fallback details view inside the marker sheet.

### Option C: Hybrid Mini-Timeline + Lap Rulers

Show a small global timeline for orientation and lap rulers for editing.

Strengths:

- Best of both worlds.
- Global timeline shows where in the video the user is.
- Lap rulers solve dense waypoint editing.

Weaknesses:

- More implementation complexity.
- More UI to test.
- Risk of visual overload if introduced all at once.

Mitigations:

- Start with a non-editable mini timeline.
- Make lap rulers the only editable surface.

## Recommended Implementation

Start with the hybrid, but keep scope disciplined:

1. Quick review summary with warnings and quick fixes.
2. Full-screen "Edit waypoints" mode.
3. Vertical lap rulers as the editable mobile UI.
4. Bottom-sheet marker editor for precise timestamp changes.
5. Optional non-editable global mini timeline for orientation.

Do not build draggable global timeline markers first. That is the most fragile version of the idea and will be hardest to make usable with dense waypoint spacing.

## Data Model

Continue using `DiveTimeline`:

- `diveStartMs`
- `diveEndMs`
- `laps`
- `subSplits`
- `samples`
- `events`

The editor should derive an editable view model from `DiveTimeline`, then project changes back into the same timeline shape.

Suggested view model:

```ts
interface EditableWaypoint {
  id: string;
  waypointIndex: number;
  lapIndex: number;
  inLapIndex: number;
  kind: 'split' | 'wall';
  atMs: number;
  distanceFromLapStartM: number;
  cumulativeDistanceM: number;
  splitMs: number;
  speedMs: number;
  warning?: WaypointWarning;
}

interface EditableLap {
  lapIndex: number;
  startDistanceM: number;
  endDistanceM: number;
  startMs: number;
  endMs?: number;
  waypoints: EditableWaypoint[];
  lapDurationMs?: number;
  averageSpeedMs?: number;
}

type WaypointWarning =
  | 'fast-segment'
  | 'slow-segment'
  | 'close-to-end'
  | 'out-of-order'
  | 'duplicate-time';
```

Keep this logic in a pure module, for example:

- `src/lib/capture/waypointEditor.ts`
- `src/lib/capture/waypointEditor.test.ts`

## Pure Functions

Add pure helpers before building UI.

Suggested functions:

```ts
buildWaypointEditorModel(timeline, poolLengthM, waypointsPerLap): WaypointEditorModel
moveWaypoint(model, waypointId, nextAtMs): WaypointEditorModel
deleteWaypoint(model, waypointId): WaypointEditorModel
insertWaypoint(model, afterWaypointId | lapIndex, atMs): WaypointEditorModel
setDiveStart(model, atMs): WaypointEditorModel
setDiveEnd(model, atMs): WaypointEditorModel
projectWaypointEditorModel(model): DiveTimeline
validateWaypointEditorModel(model): WaypointWarning[]
```

Rules:

- Waypoint timestamps must remain strictly increasing.
- Dive end must be after dive start.
- Waypoints outside the dive window are removed or flagged.
- Wall waypoints are derived from index and `waypointsPerLap`; users should not manually choose wall vs split unless necessary.
- Distances are derived from waypoint index and spacing.
- The final distance can be edited by changing waypoint count or end behavior, not by storing a second independent distance value.

## Validation Rules

Flag, but do not always block:

- Segment speed > plausible maximum for discipline.
- Segment speed < plausible minimum while surrounded by normal segments.
- Last segment much faster than median.
- Final waypoint very close to dive end.
- Duplicate or near-duplicate waypoint timestamps.
- Dive end before final waypoint.

Initial thresholds can be conservative:

- Warning if segment speed is more than 2.5x median segment speed.
- Warning if segment speed is above 3.0 m/s for DYN/DYNB/DNF.
- Warning if final segment is shorter than 0.5 s.

These should be warnings, not hard validation, because elite or unusual clips may be legitimate.

## UI Details

### Quick Review Card

Show after tracking:

- Total distance.
- Dive duration.
- Waypoints marked.
- Average speed.
- Warning badge if suspicious.

Buttons:

- Save.
- Edit waypoints.
- Re-track.

Quick fixes, when relevant:

- Remove last waypoint.
- End dive here.
- Use last waypoint as end.

### Lap Ruler Card

Each card:

- Header: `Lap 2`, `50-100 m`, `42.1 s`, `1.19 m/s`.
- Vertical ruler line.
- Marker dots along the ruler.
- Selected marker expanded.
- Warning markers highlighted amber.
- Wall marker visually stronger than split markers.

Marker label:

- Dense mode: show `25 m` only for selected/flagged markers.
- Normal mode: show local distance and split time.

### Marker Bottom Sheet

When selected:

- Marker title: `Lap 2 · 25 m`.
- Timestamp: `01:14.3`.
- Split: `4.2 s`.
- Speed: `1.19 m/s`.
- Buttons: `-1.0s`, `-0.5s`, `-0.1s`, `+0.1s`, `+0.5s`, `+1.0s`.
- Actions: `Move to current video time`, `Delete waypoint`.

### Video Sync

- Selecting a marker seeks video to `atMs`.
- Playing the video highlights the current segment.
- Scrubbing the video updates the active segment indicator.
- A "Set selected marker to video time" button avoids drag precision problems.

## Edge Cases

### No Waypoints

Show start/end only and invite the user to re-track or add the first waypoint.

### One Accidental Extra Waypoint

Likely the common case. Quick review should make this one-tap fixable.

### Many Waypoints

Use dense marker mode automatically when `waypointsPerLap >= 5`.

### Very Short Segments

Flag suspiciously short splits. Do not auto-delete.

### Out-Of-Order Edits

If a nudge would cross a neighboring waypoint, clamp it just before/after the neighbor and show a short note.

### End Before Final Waypoint

Either clamp end after the final waypoint or prompt to delete waypoints beyond end.

### Changed Pool Length Or Waypoint Count

If the user changes pool setup after marking, rebuild distances but preserve timestamps. Warn that distances changed.

## Technical Implementation Steps

### Phase 1: Pure Model

- Add `src/lib/capture/waypointEditor.ts`.
- Add tests for common dive shapes.
- Derive lap rulers from `DiveTimeline`.
- Implement move/delete/start/end edits.
- Implement warning generation.
- Project edited model back to `DiveTimeline`.

Validation:

- `npm test -- src/lib/capture/waypointEditor.test.ts`

### Phase 2: Quick Review Fixes

- Update `src/routes/(app)/dive/record/[id]/+page.svelte` review stage.
- Add suspicious segment warnings.
- Add "Remove last waypoint" quick action.
- Add "Edit waypoints" action.

Validation:

- `npm run check`

### Phase 3: Full-Screen Editor Shell

- Add a new stage, likely `importWaypointEdit`.
- Reuse the existing import preview video object URL.
- Keep bottom nav hidden via `diveRecording` store while editing.
- Add video preview and compact HUD.
- Add scrollable lap ruler container.

Validation:

- Manual mobile viewport inspection.
- `npm run check`

### Phase 4: Lap Rulers

- Build a component, likely `WaypointLapRuler.svelte`.
- Props: `lap`, `selectedWaypointId`, `dense`, callbacks.
- Use stable dimensions and large tap targets.
- Avoid nested cards; use unframed rows or simple panels.

Validation:

- Check 1, 2, 5, and 10 waypoints per lap.
- Check 25 m and 50 m pools.

### Phase 5: Marker Editor Sheet

- Build selected marker controls.
- Implement timestamp nudges.
- Implement delete.
- Implement move-to-current-video-time.
- Highlight warnings and constrained moves.

Validation:

- Edit first marker.
- Edit middle marker.
- Edit final marker.
- Delete accidental last marker.

### Phase 6: Save Integration

- Ensure edited timeline is used for:
  - `DiveVideo.timeline`.
  - sessionStorage quick-log seed.
  - overlay download HUD.
  - feed playback HUD.
- Re-run timeline tests and app check.

Validation:

- `npm test -- src/lib/capture/timeline.test.ts src/lib/capture/waypointEditor.test.ts`
- `npm run check`

## Testing Matrix

Test these scenarios:

- 25 m pool, 2 waypoints per lap.
- 50 m pool, 2 waypoints per lap.
- 50 m pool, 10 waypoints per lap.
- Accidental final waypoint.
- Missing middle waypoint.
- End time too late.
- End time too early.
- No waypoints.
- One waypoint only.
- Imported clip with portrait video.
- Imported clip with landscape video.

## Implementation Decision

Build Option C as a phased hybrid:

- Ship the quick correction card first.
- Then ship mobile-first vertical lap rulers.
- Add the global mini timeline only as an orientation aid, not as the dense editing surface.

This gives the nice UX of a visual editor while avoiding the biggest limitation of a global marker timeline: overcrowding.
