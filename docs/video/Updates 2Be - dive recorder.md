# Agent instructions

Use this file as a project update queue and working memory. It can hold requests for any area of the app, not only video. When asked to check this file, work from the first numbered request at the top, then move downward only after that request is complete.

For each request:

1. Read the request, then read any nearby code/docs needed to understand the current system before editing.
2. Create a new section below the request list with a clear title.
3. In that section, write a short `Problem`, an `Implementation Plan`, and a checklist.
4. Follow the project fundamentals from `claude.md`:
	- Prefer plain data structures, discriminated unions, readonly records/arrays, and pure functions for business logic.
	- Keep side effects at the edges: Svelte components, Firestore calls, DOM listeners, timers, storage, and file IO should stay thin and intentional.
	- Derive values instead of storing duplicate state.
	- Use Svelte 5 runes syntax for new Svelte work and avoid mixing in old `export let` / `$:` patterns.
	- Preserve the mobile-first, minimalist, clarity-focused, data-focused design language.
	- Follow existing local component, CSS, Firebase, and TypeScript patterns before introducing new abstractions.
5. Implement continuously unless a real decision gate or external blocker appears. Do not stop after planning.
6. Validate at the right level for the change: focused tests for pure logic, `npm run check` for Svelte/TypeScript changes, `npm --prefix functions run build` and deploy tasks for Cloud Functions changes, and any relevant manual/CLI verification.
7. Commit after each major completed step with a concise message, then push to `main` when the request is complete.
8. Mark the checklist complete, remove the original numbered request from the list, and continue to the next request if one exists.

Leave unrelated worktree changes alone. Never commit secrets or `.env` files. If a command is replaced with a new instruction, treat the replacement as the newest request.

# Requests

No open requests.

## Metrics-Only Recorder Follow-Up Fixes

### Problem
The metrics-only primary control still sat too close to mobile browser chrome, the active recorder lap display started at `Lap 0`, and the setup screen still exposed `Select video` even when the user had chosen metrics-only tracking.

### Implementation Plan
Move the metrics-only controls further above browser chrome with a stronger bottom inset, add a pure current-target lap selector that starts at 1 and share it between video and metrics recorder UIs, and conditionally hide the video import action unless the setup page is in video mode.

### Checklist
- [x] Reposition the metrics-only primary controls higher above the browser bottom bar.
- [x] Add a pure current-target lap selector that starts at 1.
- [x] Use the lap selector in the metrics-only tracker.
- [x] Use the lap selector in the video recorder HUD.
- [x] Hide `Select video` while metrics-only tracking is selected.
- [x] Run focused and full Svelte/type checks.
- [x] Remove the completed request from the queue.

## Metrics-Only Recorder UI Polish

### Problem
The first metrics-only implementation worked, but the primary control sat too close to mobile browser chrome and could be partially covered. The large time and distance values were readable but visually too heavy, making the surface feel more playful than calm and training-focused.

### Implementation Plan
Keep the metrics-only layout and interaction model intact. Increase the fixed recorder surface's bottom breathing room with dynamic viewport sizing and a larger safe-area-aware bottom inset, then soften the live metric typography by reducing font weight and using the app's system type stack with tabular numerals.

### Checklist
- [x] Lift the metrics-only footer controls above mobile browser bottom chrome.
- [x] Preserve safe-area support for iOS-style home indicators.
- [x] Reduce the live time and distance font weight.
- [x] Keep tabular numerals for stable live metric updates.
- [x] Slightly soften the primary button weight without reducing its screen priority.
- [x] Run Svelte/type checks.
- [x] Remove the completed request from the queue.


## Metrics-Only Recorder Implementation

### Problem
The planned metrics-only recorder needed to move from mockup to app behavior while keeping the waypoint target as the dominant control. The mode should reuse the existing recorder reducer/selectors, avoid video upload work, and use color as a functional signal rather than a decorative theme.

### Implementation Plan
Add a dedicated metrics-only recorder surface beside `DiveRecorder.svelte`, backed by the same `recorderState` reducer and selector math. Route the record setup page through either video capture or metrics-only capture, then let metrics-only results review and save into the existing dynamic-max log seed path without creating media artifacts.

### Checklist
- [x] Add a capture mode choice to the setup page.
- [x] Build a metrics-only recorder component that reuses the existing reducer and selectors.
- [x] Give the waypoint target button the largest active-dive screen area.
- [x] Use subdued panels with teal reserved for the primary waypoint/start actions and amber/red reserved for warnings/end actions.
- [x] Preserve waypoint back/next controls, 2-second tap lockout, auto-advance warning, and end confirmation.
- [x] Add a metrics-only capture result path with no video blob.
- [x] Review metrics-only captures without video diagnostics, pinning, gifting, or upload controls.
- [x] Save metrics-only captures by seeding the existing dynamic-max dive log form.
- [x] Run Svelte/type checks.
- [x] Remove the completed request from the queue.

## Metrics-Only Recorder UI Plan

### Problem
Some dives should be logged with the recorder's timing, distance, waypoint, speed, and split metrics without recording video. The current recorder is built around a full-screen camera preview, which forces the phone to point at the pool and uses much of the screen as video glass. A metrics-only mode should let a coach or buddy hold the phone naturally, keep the same waypoint/timeline behavior, and make the primary numbers and buttons larger and easier to hit.

### Implementation Plan
Build this as a sibling mode of the existing `DiveRecorder` flow, not a separate metrics engine. The pure reducer and selectors in `src/lib/capture/recorderState.ts` and `src/lib/capture/recorderSelectors.ts` already own the important state: phases, waypoints, elapsed time, cumulative distance, speed, auto-advance, cursor movement, and end confirmation. The implementation should reuse that model and swap the camera/MediaRecorder edge for a lightweight metrics-only edge.

1. Add a capture-mode choice before the recorder starts: `Record video` and `Track metrics only`.
2. Introduce a result shape for metrics-only captures that includes the `DiveTimeline`, summary metrics, discipline, pool length, waypoint spacing, and optional notes, but no blob or media object.
3. Keep the recorder reducer unchanged unless a small config flag is needed for labels. Avoid duplicating timing or waypoint logic in the Svelte component.
4. Create a metrics-only recorder surface that uses the same phases: `ready`, `prepping`, `diving`, `ended`, and `stopping/saving`.
5. Replace the video preview with a calm dashboard: large elapsed time, large distance, current target, speed/split secondary metrics, and central controls.
6. Keep long-press end confirmation, previous/next target controls, 2-second waypoint lockout, and auto-advance warning behavior consistent with video mode.
7. Save metrics-only captures into the same review/save path where possible, with media-specific fields omitted and UI copy changed from video language to log language.

### Checklist
- [x] Inspect existing recorder state, selectors, and `DiveRecorder.svelte` control layout.
- [x] Identify where camera/video coupling exists in the current result contract.
- [x] Sketch a metrics-only interaction model that reuses pure recorder logic.
- [x] Draw mobile mockups for ready, diving, and end-confirmation states.
- [x] Note implementation stages and open decisions.
- [x] Remove the completed request from the queue.

### Mobile Mockups

#### 1. Ready / Setup

Use this when the coach has selected discipline, pool length, and waypoint spacing. The phone can be held upright at chest height; no camera preview is needed.

```text
+--------------------------------+
| DYN        25m pool   12.5m step|
| Metrics only                   |
|                                |
|        Ready to track          |
|                                |
|   Next target                  |
|        12.5m                   |
|                                |
|  Waypoints/lap 2   Auto +10m   |
|                                |
|                                |
| [ Cancel ]        [ Start ]    |
+--------------------------------+
```

Notes:
- Primary action should be `Start`, not `Record`, because no media is being captured.
- The top row should keep mode and setup visible without feeling like a video HUD.
- The central target preview helps the user understand what the first tap will mark.

#### 2. Active Dive

This is the main value of the mode: large glanceable numbers and large central controls. The waypoint button can sit in the physical center of the phone instead of the bottom edge.

```text
+--------------------------------+
| DYN               lap 1         |
|                                |
|          01:18.4               |
|          elapsed               |
|                                |
|          62.5m                 |
|          distance              |
|                                |
|  speed 0.82 m/s   next 75m     |
|                                |
|    [ < ]   [ 75m ]   [ > ]     |
|            Tap mark            |
|                                |
|        Hold 75m to end         |
+--------------------------------+
```

Notes:
- The waypoint target is the center button's primary text. It should be large enough to hit while watching the diver.
- Previous/next target controls remain adjacent, but can be much larger than video mode because there is no preview to preserve.
- The lower `Hold to end` affordance can stay attached to the same central button to preserve muscle memory.

#### 3. Active Dive With Auto-Advance Warning

The existing auto-advance concept still matters because a coach may miss a tap. In metrics-only mode, the warning can be more readable and less transient than a video toast.

```text
+--------------------------------+
|          02:03.9               |
|          elapsed               |
|                                |
|          101.4m                |
|          distance              |
|                                |
|  Skipped 87.5m -> target 100m  |
|                                |
|    [ < ]   [100m]   [ > ]      |
|            Tap mark            |
|                                |
|  Last mark 75m at 01:31.2      |
+--------------------------------+
```

Notes:
- The warning should be near the controls and persist long enough to be read.
- The back button should remain available to hold the target back, using the existing `manualHoldBackIndex` behavior.

#### 4. End Confirmation

Reuse the current end-confirmation behavior, but give the card more of the screen because there is no video behind it.

```text
+--------------------------------+
|                                |
|          End dive?             |
|                                |
|          03:42.6               |
|          151.2m                |
|                                |
|   This is what will be saved   |
|                                |
| [ Resume ]     [ Confirm End ] |
|                                |
+--------------------------------+
```

Notes:
- Continue deriving the pending end metrics from the captured long-press timestamp.
- After confirmation, the result can go straight to review/save without waiting for MediaRecorder finalization.

### Suggested Implementation Stages

1. **Planning-safe first cut:** Add the capture-mode choice on the record setup page and route metrics-only mode to a placeholder screen behind a feature flag or local branch only.
2. **Pure result contract:** Define a discriminated union such as `{ source: 'video'; ... } | { source: 'metrics-only'; timeline: DiveTimeline; ... }` in the route/component boundary.
3. **Metrics-only component:** Extract or share the reducer wiring from `DiveRecorder.svelte`, but omit camera acquisition, `MediaRecorder`, video element, camera selector, upload metadata, and video quality settings.
4. **Review/save integration:** Update the review page copy and save path to accept metrics-only logs without media artifacts.
5. **Polish pass:** Tune mobile spacing, larger type, button geometry, haptics/vibration if available, and accessibility labels.
6. **Tests:** Add focused reducer/selector tests only if reducer behavior changes. For UI plumbing, run `npm run check` and manually test mobile widths around 375px.

### Open Decisions

- Should metrics-only logs create a `diveVideo`-like draft without media, or should they save directly as routine/session logs?
- Should the setup page default to the last used capture mode per user/device?
- Should metrics-only mode support a post-dive notes prompt before review?
- Should the UI offer an optional metronome/countdown/haptic tick now that the phone is not occupied by video capture?

## Recorder End Confirmation Metrics

### Problem
The end-dive confirmation card asks the user to confirm, but it does not show the exact time and distance that will be saved. That makes the confirmation less reassuring than it could be.

### Implementation Plan
Keep the existing pending long-press timestamp behavior. Derive the pending end time and distance from that timestamp, render them prominently in a larger confirmation card, and rename the destructive action to "Confirm End" while preserving Resume.

### Checklist
- [x] Derive pending end time from the long-press timestamp.
- [x] Derive pending end distance from the long-press timestamp.
- [x] Show both metrics prominently in the confirmation card.
- [x] Increase and polish the confirmation card styling.
- [x] Use Resume and Confirm End button labels.
- [x] Run Svelte/type checks.
- [x] Commit and push the confirmation metrics update.

## Recorder End Dive Confirmation

### Problem
A completed long press currently ends the dive immediately. That still leaves room for accidental end-dive commits, and it also means the user cannot resume after an unintended long press.

### Implementation Plan
Treat a completed long press as an end-dive request instead of the final commit. Capture the pointer-down timestamp, keep recording and live metrics running while a confirmation card is shown, commit the dive at that captured timestamp only if the user confirms, and clear the request without changing state if the user resumes. Ensure finalization ignores samples recorded after the confirmed end timestamp.

### Checklist
- [x] Capture the initial long-press timestamp.
- [x] Show an End dive / Resume confirmation after hold completion.
- [x] Keep recording and live metrics running while the card is open.
- [x] Commit final time/distance at the initial long-press timestamp.
- [x] Let Resume clear the pending end request without changing dive state.
- [x] Trim finalized samples after the committed end timestamp.
- [x] Add focused tests for final sample trimming.
- [x] Run focused tests and Svelte/type checks.
- [x] Commit and push the end confirmation update.

## Recorder Waypoint Button Text Hierarchy

### Problem
The active Waypoint button currently mixes the target distance into the smaller sublabel. That makes the most important correction target harder to scan during a dive.

### Implementation Plan
Keep the Waypoint button behavior unchanged, but render its content as three rows: a regular "Tap to mark" command, a larger bold distance-only row such as "50m", and a regular "Hold to end dive" affordance. Leave other primary button phases using the existing label/subtitle structure.

### Checklist
- [x] Render Waypoint content as three rows.
- [x] Make the distance row larger, bold, and distance-only.
- [x] Keep the top and bottom rows regular-weight and matching size.
- [x] Preserve hold-to-end behavior and progress affordance.
- [x] Preserve non-waypoint primary button text.
- [x] Run Svelte/type checks.
- [x] Commit and push the waypoint text update.

## Recorder Manual Back Auto-Advance Hold

### Problem
The new back arrow can move the waypoint target backward, but the auto-advance rule immediately sees the live distance beyond that target and advances it forward again. That makes the back control feel disabled in practice whenever the diver has already drifted past the threshold.

### Implementation Plan
Track when the user manually moves the expected waypoint backward and pause auto-advance only for that held target. Clear the hold when the user moves forward, records the waypoint, or normal auto-advance proceeds, so automatic waypoint-distance advance continues in the rest of the flow.

### Checklist
- [x] Identify the auto-advance re-advance gate.
- [x] Add reducer state for a manually held back waypoint target.
- [x] Prevent auto-advance only while the held target is active.
- [x] Clear the hold on forward movement and waypoint marking.
- [x] Add focused regression tests for back-after-auto-advance.
- [x] Run focused tests and Svelte/type checks.
- [x] Commit and push the auto-advance hold update.

## Recorder Waypoint Cursor Controls

### Problem
During the active dive phase, Undo removes previously recorded timeline data. The requested correction model is lighter: keep the Waypoint button as the only action that records a mark, and use adjacent previous/next controls only to change which distance the Waypoint button is targeting.

### Implementation Plan
Add pure cursor-adjustment events to the recorder reducer so the expected waypoint can move backward or forward without changing the timeline. Replace the diving Undo button with arrow buttons beside the existing Waypoint button, constrain backward movement so already committed marks are not duplicated, keep automatic waypoint-distance advance running, and add a component-level 2-second short-tap lockout after successful waypoint taps.

### Checklist
- [x] Add reducer support for previous/next waypoint cursor adjustment.
- [x] Keep cursor adjustment separate from timeline marking.
- [x] Replace the diving Undo button with back/forward arrow controls.
- [x] Keep Waypoint as the only control that records a waypoint.
- [x] Preserve automatic waypoint-distance advance.
- [x] Add a 2-second short-tap lockout after waypoint taps.
- [x] Add focused reducer/selector tests for cursor adjustment.
- [x] Run focused tests and Svelte/type checks.
- [x] Commit and push the waypoint controls update.

## Recorder Start Dive Controls Layout

### Problem
After Record is pressed, the prepping screen still uses the older centered Start Dive button with a small Stop pill. That no longer matches the ready-state Record/Cancel control language, so the transition between setup and dive start feels visually inconsistent.

### Implementation Plan
Add a prepping-specific controls state that reuses the ready-state edge-aligned primary/secondary sizing for Start Dive and Stop. Keep Start Dive green, style Stop as a destructive red stop action, and preserve later in-dive controls such as Undo/Waypoint.

### Checklist
- [x] Add a prepping control layout state.
- [x] Match Start Dive sizing and right alignment to Record.
- [x] Match Stop sizing and left alignment to Cancel.
- [x] Style Stop with an appropriate destructive colour.
- [x] Preserve ready, diving, and landscape behaviour.
- [x] Run Svelte/type checks.
- [x] Commit and push the start-dive controls update.

## Recorder Cancel Edge Spacing

### Problem
After making Record and Camera dominant, the smaller Cancel button now floats with noticeably more empty space to its left than Record has to the right edge. That makes the bottom control cluster feel slightly off-balance.

### Implementation Plan
Keep the existing Record and Camera sizing unchanged. Adjust only the ready-state Cancel positioning/width so its left edge uses the same safe-area-aware edge inset as the Record button's right edge, while preserving the gap between Cancel and Record. Leave non-ready recorder phases unchanged.

### Checklist
- [x] Keep ready Record and Camera dimensions unchanged.
- [x] Expand ready Cancel leftward to the matching screen edge inset.
- [x] Preserve the gap between Cancel and Record.
- [x] Preserve landscape and non-ready control behavior.
- [x] Run Svelte/type checks.
- [x] Commit and push the cancel spacing update.

## Recorder Ready Control Ratio

### Problem
The first ready-control layout made Cancel fill the left-side space, which visually overstates a secondary action. Record is the default path and should dominate the bottom control cluster, with Camera matching Record and Cancel reduced to a smaller escape action.

### Implementation Plan
Keep the ready-state cluster and button shapes from the previous pass. Increase the ready Record/Camera width and introduce a separate ready Cancel width at roughly 30% of the main button width. Apply the same ratio-minded sizing in landscape while leaving non-ready recorder phases unchanged.

### Checklist
- [x] Increase the ready Record and Camera button width.
- [x] Reduce ready Cancel to roughly 30% of the main button width.
- [x] Keep ready Cancel the same height and shape as Record.
- [x] Preserve the camera button alignment above Record.
- [x] Preserve non-ready recorder layouts.
- [x] Run Svelte/type checks.
- [x] Commit and push the recorder ratio update.

## Recorder Ready Controls Layout

### Problem
The recorder ready-state controls are split across a small cancel pill, a central red Record button, and a separate camera pill. This makes the live preview feel visually messy before recording starts, even though these controls are part of one setup/action cluster.

### Implementation Plan
Keep the existing recorder state and actions intact. Adjust only `DiveRecorder.svelte` ready-state layout styles so Record keeps its size and moves to the lower right, Cancel becomes a matching full-height rectangular button filling the remaining lower-left space, and Camera becomes a compact rectangular button directly above Record at the same width and roughly one-third the Record height. Preserve the current bottom-sheet camera selector and non-ready recorder phases.

### Checklist
- [x] Add a ready-state layout class to the recorder controls.
- [x] Move the ready Record button to the right while preserving its width.
- [x] Make ready Cancel match the Record height/shape and fill the left space.
- [x] Restyle and align the Camera button above Record at matching width.
- [x] Preserve non-ready Stop/Undo/Waypoint layouts and camera sheet behavior.
- [x] Run Svelte/type checks.
- [x] Commit and push the recorder ready controls update.