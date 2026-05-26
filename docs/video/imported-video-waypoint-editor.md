# Imported Video Waypoint Editor

## Purpose

Imported videos now let an athlete replay a finished clip and mark start, waypoints, and end with a recorder-like main-button flow. That is fast, but it is easy to make small timing mistakes or add an accidental extra waypoint, especially when the user forgets that ending the dive requires a long press.

This plan designs the correction experience after tracking and before save. The goal is to make waypoint correction precise, readable, and calm on a phone without making the recording pass slower.

This revision treats a **precision scrub-to-mark mode** as the primary direction for uploaded videos and inaccurate existing recordings. The earlier lap-stacked editor remains useful as an analysis/review surface, but it should not be the first implementation. The first implementation should help the user put each timestamp in the right place in the video with a very simple loop: scrub, mark, advance.

## Recommended Direction

Build two imported-video waypoint modes, with precision mode first:

1. **Precision scrub-to-mark mode** for uploaded videos and correcting inaccurate marker data.
2. **Live playback marking mode** for users who prefer to watch the clip play and tap waypoints in real time.

Precision mode should open the video fullscreen, let the user scrub to the exact frame, and use the standard big button to commit each semantic marker. The button starts as `Start dive`, then advances to the next expected distance such as `12.5 m`, then `25 m`, and so on. End dive remains a long press so the model stays consistent with the live recorder.

This is a better first implementation than a dense visual editor because it avoids the hardest interaction: selecting and dragging tiny markers after the fact. Instead, the user creates accurate data from the video itself, one waypoint at a time.

## Visual Mockup

- [230 m dynamic dive mockup](imported-video-waypoint-editor-230m-mockup.svg) — mobile-first lap-ruler concept for a 50 m pool with 5 m waypoint spacing.

The mockup represents the earlier lap-ruler concept: 230 m as four complete 50 m laps plus a final 30 m partial lap. Keep it as a reference for future review/analysis UI, but do not implement it before the precision scrub-to-mark flow.

## Precision Scrub-To-Mark Mode

### Core Idea

The user is not trying to tap in real time. They are authoring waypoint data against an existing video.

Flow:

1. Open the video fullscreen.
2. Show the standard big button labelled `Start dive`.
3. The user scrubs to the frame where the diver leaves the wall.
4. The user taps `Start dive`.
5. The button advances to the next expected marker, for example `12.5 m`.
6. The user scrubs to the frame where the diver reaches that distance.
7. The user taps the big button to mark it.
8. Repeat for each waypoint.
9. At the end, the user scrubs to the end frame and long-presses the big button to end the dive.
10. The review screen shows the generated distance, duration, splits, and warnings.

This feels like the live recorder, but with a crucial difference: the user controls time explicitly. The big button does not mean "mark now while the video happens to be playing". It means "commit the current video position as the next semantic point".

### Why This Is Better

- It solves precision at the source rather than cleaning up imprecise taps later.
- It avoids a cluttered timeline full of tiny draggable markers.
- It works for brand-new uploaded videos and for existing videos with bad waypoint data.
- It keeps the user's focus on the video frame, not a secondary data visualization.
- It preserves the recorder mental model: one big action button, predictable next waypoint, long-press end.
- It scales to dense waypoints because the user only sees and commits one expected waypoint at a time.

### Mode Choice

Imported video setup should offer two clear choices after file selection:

- `Mark while playing` — current live-like flow, useful when the user wants speed and does not need exact frame correction.
- `Scrub and mark` — precision flow, recommended for uploaded videos and corrections.

Default to `Scrub and mark` for imported videos. Existing live-like marking can remain available as an alternate mode.

### Fullscreen Layout

The first screen should be the working editor, not a landing panel.

Visible areas:

- Fullscreen video preview.
- Top HUD with current timestamp, committed distance, next waypoint, and optional speed after at least two points.
- Bottom scrub system designed for frame-accurate movement.
- Big primary button centered above the scrub controls.
- Small secondary controls for cancel, undo last, and review.

The UI should not show a dense marker list during the marking flow. A compact progress strip is enough.

### Button States

The primary button is stateful:

- Before start: `Start dive`.
- After start: `{nextDistance} m`, such as `12.5 m` or `50 m`.
- On wall markers: label can include `Wall`, such as `50 m wall`.
- After the expected final/partial marker: continue to the next distance unless the user long-presses to end.
- During long press: show `End dive` progress.
- After end: `Review`.

Tapping the button commits the current video timestamp as the next waypoint. Long-pressing commits `diveEndMs`.

### Scrubbing UX

Accurate scrubbing is the heart of this design.

Required controls:

- A large scrub rail with enough height for touch accuracy.
- A visible playhead and current timestamp.
- Thumb drag for coarse movement.
- +/- frame buttons when frame rate is known or can be estimated.
- +/-0.1 s and +/-0.5 s nudges as reliable fallback controls.
- Tap-to-toggle playback for checking motion.
- Optional hold-to-slow-scrub behavior for fine adjustment.

The scrubber should feel like a small video editing tool, not a browser-native range input. Native video controls are usually too small and inconsistent across mobile browsers.

### Scrub Precision Details

Implementation should support three movement scales:

1. **Coarse** — drag the scrub rail across the full clip.
2. **Fine** — use +/-0.5 s and +/-0.1 s controls.
3. **Frame-ish** — use previous/next frame where browser support allows.

Browser reality:

- HTML video does not guarantee frame-exact stepping everywhere.
- `requestVideoFrameCallback` can improve feedback where available.
- `video.currentTime += 1 / fps` is a best-effort frame step when fps is known or estimated.
- On iOS Safari, seeking can be asynchronous and imprecise, so the UI must wait for `seeked` before committing if the video is still settling.

Recommended behavior:

- Show a `seeking` state while the video is moving.
- Disable the big commit button for a few milliseconds or until `seeked` when the user just dragged.
- If exact frame stepping is unavailable, keep the nudge controls but label them by time, not frame.

### Progress Strip

Instead of dense editable markers, show a compact progress strip:

```text
Start ✓   12.5 ✓   25 ✓   37.5 current   50 wall next
```

For many waypoints, collapse it:

```text
Marked 18 / 46 · Next 95 m · Last 90 m at 01:13.2
```

The progress strip is informational. It should not be the primary editing surface.

### Undo And Correction

Keep correction simple during the flow:

- `Undo last` removes the most recent committed point and returns the button to that label.
- `Restart` clears all markers after confirmation.
- After review, `Resume marking` returns to the next unmarked distance or the selected point.
- Later, a lap-ruler or segment-table editor can exist for advanced cleanup, but the MVP should not depend on it.

### Reviewing The Result

After end dive:

- Show total distance.
- Show dive time.
- Show waypoint count.
- Show average speed.
- Show fastest/slowest segment warnings.
- Provide `Save`, `Resume marking`, and `Restart`.

The review can include a simple segment list with jump-to-video buttons. Avoid building the full dense lap-ruler editor until the scrub-to-mark mode is proven.

## UX Principles

- Keep the full-screen tracking pass simple: one main button, cancel, and optional +/-10 s seek controls.
- For imported precision work, make scrubbing the primary time-control interaction.
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

- Avoid dense marker selection in the MVP.
- Use a one-at-a-time scrub-to-mark flow so the UI only presents the next expected point.
- Keep lap-stacked or segment-list views for review after the data exists.
- Use marker order and distance from lap start as the stable reference in review surfaces.

### Marker Selection Precision

Small markers are hard to tap, especially if two timestamps are close.

Resolution:

- Avoid tiny marker selection as the first interaction.
- Let the user scrub the video frame directly.
- Allow +/-0.1 s, +/-0.5 s, and frame-ish nudges from the scrubber.
- Commit the current video time with the big button.

### Accidental Extra Waypoint

A short tap after the last real waypoint can add a false segment and inflate distance.

Resolution:

- Provide `Undo last` during the scrub-to-mark flow.
- Highlight the last segment if its speed is implausibly different from nearby segments.
- Provide `Resume marking` from review so the user can continue from the last good point.
- After long-press end, avoid accepting another primary tap as a waypoint.

### End-Dive Mistakes

Ending a dive by long press is easy to forget. A mistaken short tap creates an extra waypoint instead of ending the dive.

Resolution:

- In precision mode, long-press end uses the current scrubbed video timestamp.
- In review, provide `Resume marking` so the user can reset the end point.
- If the final waypoint is very close to the end time, offer "Use final waypoint as end" and "Delete final waypoint" actions later.
- If the last segment speed exceeds a threshold, surface a warning: "Last segment looks fast. Did you mean to end the dive?"

### Timeline And Video Sync

Markers are only useful if the user can verify them against the video frame.

Resolution:

- Scrubbing the video is the primary source of truth.
- The current frame timestamp is shown before every commit.
- Committed marks update a compact progress strip and summary.
- The editor uses the same `DiveTimeline` data that gets saved, so there is no separate correction model to reconcile.

### Mobile Screen Space

The editor must work on a 375 px wide phone with bottom nav and safe-area insets.

Resolution:

- Use a full-screen marking mode, not a small card inside the normal page.
- Keep the video full-bleed or near full-bleed.
- Keep the scrubber and main button reachable at the bottom.
- Avoid always-visible dense tables on small screens.

## Proposed UI Flow

### Step 1: Choose Import Marking Mode

After selecting a video and confirming pool setup, present the marking mode choice:

- `Scrub and mark` — default, precision mode.
- `Mark while playing` — legacy live-like mode.

### Step 2: Precision Marking Pass

The video opens fullscreen and paused.

Primary sequence:

1. Scrub to dive start.
2. Tap `Start dive`.
3. Scrub to next expected distance.
4. Tap the big button labelled with that distance.
5. Repeat.
6. Scrub to the end.
7. Long-press to end dive.
8. Review.

Secondary controls:

- Cancel.
- Undo last.
- Restart.
- Fine nudge controls.
- Play/pause preview.

### Step 3: Review Summary

After ending, before final save, show a correction summary.

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
- Resume marking.
- Restart.

### Step 4: Optional Lap-Stacked Review

This is a later analysis/review interface, not the MVP marking mechanism.

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

Start with precision scrub-to-mark mode, then add review surfaces only if needed:

1. Fullscreen imported-video precision marking stage.
2. Custom scrubber with coarse drag and fine nudges.
3. Big-button state machine for start, next waypoint, wall markers, and long-press end.
4. Undo/restart controls.
5. Review summary with warnings and a simple segment list.
6. Optional lap-ruler analysis view later.

Do not build draggable global timeline markers first. Do not build the lap-ruler editor first. The most important interaction to prove is whether users can scrub accurately and commit each waypoint with confidence.

## Data Model

Continue using `DiveTimeline`:

- `diveStartMs`
- `diveEndMs`
- `laps`
- `subSplits`
- `samples`
- `events`

The precision marker should derive committed waypoint rows from a simple ordered list of timestamps, then project them back into the same timeline shape.

Suggested view model:

```ts
interface PrecisionWaypoint {
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

interface PrecisionMarkingState {
  phase: 'start' | 'waypoints' | 'ended';
  diveStartMs?: number;
  diveEndMs?: number;
  committedWaypoints: PrecisionWaypoint[];
  nextWaypointIndex: number;
  nextDistanceM: number;
  nextKind: 'split' | 'wall';
  currentVideoMs: number;
}

type WaypointWarning =
  | 'fast-segment'
  | 'slow-segment'
  | 'close-to-end'
  | 'out-of-order'
  | 'duplicate-time';
```

Keep this logic in a pure module, for example:

- `src/lib/capture/precisionWaypointMarker.ts`
- `src/lib/capture/precisionWaypointMarker.test.ts`

## Pure Functions

Add pure helpers before building UI.

Suggested functions:

```ts
createPrecisionMarkingState(config): PrecisionMarkingState
markDiveStart(state, currentVideoMs): PrecisionMarkingState
markNextWaypoint(state, currentVideoMs): PrecisionMarkingState
endDive(state, currentVideoMs): PrecisionMarkingState
undoLastMark(state): PrecisionMarkingState
restartMarking(state): PrecisionMarkingState
projectPrecisionStateToTimeline(state): DiveTimeline
summarisePrecisionState(state): PrecisionMarkingSummary
validatePrecisionState(state): WaypointWarning[]
```

Rules:

- Waypoint timestamps must remain strictly increasing.
- Dive end must be after dive start.
- Waypoints outside the dive window are removed or flagged.
- Wall waypoints are derived from index and `waypointsPerLap`; users should not manually choose wall vs split unless necessary.
- Distances are derived from waypoint index and spacing.
- The final distance can be edited by changing waypoint count or end behavior, not by storing a second independent distance value.
- Undo should always restore the previous button label and next expected distance.
- The UI should not commit a mark while the video element is still seeking.

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

### Precision Marking Screen

Show fullscreen video with a custom scrubber and one large commit button.

Top HUD:

- Current video timestamp.
- Current committed distance.
- Next waypoint label.
- Last split, once at least one waypoint exists.

Bottom controls:

- Big primary button.
- Scrub rail.
- Fine nudge buttons.
- Undo last.
- Cancel/restart.

Primary button labels:

- `Start dive` before the first mark.
- `{distance} m` for the next waypoint.
- `{distance} m wall` for wall markers.
- `Review` after end.

Long press:

- Ends the dive at the current scrubbed timestamp.
- Shows a hold progress state.
- Is disabled until a start point exists.

### Scrubber

The scrubber is the main precision control.

Required behavior:

- Drag updates video `currentTime`.
- Video pauses while the user drags.
- The current frame remains visible after seek.
- `seeked` updates `currentVideoMs`.
- Commit button is temporarily disabled while seeking.
- +/-0.1 s and +/-0.5 s buttons are always available.
- Frame-step buttons appear only when browser support is good enough.

### Review Card

Show after ending the dive:

- Total distance.
- Dive duration.
- Waypoint count.
- Average speed.
- Warning badge if suspicious.

Buttons:

- Save.
- Resume marking.
- Restart.

Segment list:

- Distance label.
- Timestamp.
- Split duration.
- Average speed.
- Jump-to-video action.

### Legacy Live Marking

Keep the existing play-and-tap flow as a secondary mode if it remains useful.

Label it clearly as `Mark while playing`, not as the default edit flow.

### Quick Review Card

For the legacy flow, show after tracking:

- Total distance.
- Dive duration.
- Waypoints marked.
- Average speed.
- Warning badge if suspicious.

Buttons:

- Save.
- Resume or re-track waypoints.
- Re-track.

Quick fixes, when relevant:

- Remove last waypoint.
- End dive here.
- Use last waypoint as end.

### Lap Ruler Card

This is a later review/analysis surface, not the MVP edit flow. Each card:

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

### Phase 1: Pure Precision Marking Model

- Add `src/lib/capture/precisionWaypointMarker.ts`.
- Add tests for start, next waypoint, wall waypoint, undo, restart, and end.
- Derive next expected distance from `poolLengthM / waypointsPerLap`.
- Project committed timestamps to `DiveTimeline.laps` and `DiveTimeline.subSplits`.
- Generate segment warnings from the committed sequence.

Validation:

- `npm test -- src/lib/capture/precisionWaypointMarker.test.ts`

### Phase 2: Custom Scrubber Component

- Build a small scrubber component or route-local control.
- Support coarse drag.
- Support +/-0.1 s and +/-0.5 s nudges.
- Add best-effort frame step only where reliable.
- Track `seeking`, `currentVideoMs`, and `durationMs`.
- Pause video while dragging.

Validation:

- `npm run check`
- Manual mobile inspection at 375 px width.

### Phase 3: Fullscreen Precision Stage

- Add a new stage, likely `importPrecisionMarking`.
- Reuse the existing import preview video object URL.
- Keep bottom nav hidden via `diveRecording` store while editing.
- Add top HUD.
- Add big-button state machine.
- Add undo/restart/cancel.
- Wire primary tap to `markDiveStart` or `markNextWaypoint` depending on state.
- Wire primary long press to `endDive`.

Validation:

- `npm run check`
- Manual marking pass on one imported video.

### Phase 4: Review And Save Integration

- Show summary after ending.
- Show simple segment list.
- Ensure saved `DiveVideo.timeline` uses the projected precision timeline.
- Ensure quick-log seed uses the same summary.
- Ensure feed playback and overlay download read the saved timeline correctly.

Validation:

- `npm test -- src/lib/capture/timeline.test.ts src/lib/capture/precisionWaypointMarker.test.ts`
- `npm run check`

### Phase 5: Optional Review Enhancements

- Add lap-ruler analysis if users still need a visual overview.
- Add jump-to-segment controls.
- Add replace-selected-point flow if editing existing timelines becomes common.
- Add warnings for suspicious final segments.

Validation:

- Check whether the base precision flow actually needs these enhancements before building them.

## Testing Matrix

Test these scenarios:

- 25 m pool, 2 waypoints per lap.
- 50 m pool, 2 waypoints per lap.
- 50 m pool, 10 waypoints per lap.
- Scrub-to-start then 12.5 m waypoints.
- Scrub-to-start then 5 m waypoints.
- Undo last marker.
- Restart all markers.
- Long-press end after partial lap.
- Attempt to mark a waypoint before start.
- Attempt to mark while video is seeking.
- Existing imported video with no waypoint data.
- Existing imported video with inaccurate waypoint data.
- Missing middle waypoint.
- End time too late.
- End time too early.
- No waypoints.
- One waypoint only.
- Imported clip with portrait video.
- Imported clip with landscape video.

## Implementation Decision

Build precision scrub-to-mark first:

- Ship the pure state model.
- Ship the custom scrubber.
- Ship the fullscreen precision marking stage.
- Ship the review/save integration.
- Revisit lap-ruler visualization only after the precision flow is proven.

This puts the user's attention where accuracy actually lives: on the video frame. The lap-ruler idea still has value, but it should become a review aid rather than the primary correction mechanism.
