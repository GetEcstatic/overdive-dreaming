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