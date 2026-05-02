# Camera Selector Recorder UX Plan

## Goal

Move the live recorder camera selector away from the top metrics overlay and make it easier to reach while holding the phone at the pool. The selector should remain available only while the recorder is ready, before the diver starts recording.

## Current Problem

The camera selector pill is currently anchored below the top HUD in portrait and at the top-right in landscape. As the HUD grew larger, the pill became visually crowded with the metrics. It also sits high on the screen, which is not a natural thumb target when the phone is being held one-handed or braced while framing the lane.

## UX Principles

- Keep Time, Distance, waypoint, and speed metrics visually dominant.
- Put camera switching in a secondary-but-obvious location before recording starts.
- Use a large enough tap target for wet hands and poolside use.
- Preserve the existing bottom sheet selector because it is already a good detailed selection pattern.
- Avoid placing controls near the center of the camera preview where they obscure lane framing.

## Option 1: Bottom-Right Thumb Pill

Place the pill near the lower-right edge of the preview, above the main control cluster and safe-area inset. Use a compact camera-icon plus lens label pill, for example `Camera · Auto rear`, with a subtle teal outline.

### Strengths

- Much easier to reach with the right thumb while holding the phone.
- Clears the top HUD completely.
- Keeps the selector in the same visual zone as other recorder controls.
- Works well with the existing bottom sheet: tap pill, sheet slides up from nearby.

### Tradeoffs

- Needs careful spacing from the primary Start recording button and Cancel button.
- In landscape, it needs a right-edge rail placement so it does not compete with the shifted primary control.

## Option 2: Top Header Action Beside Cancel

Move camera selection into a small top-left or top-right header action, paired with Cancel while the recorder is ready. The pill becomes a toolbar button above or outside the HUD rather than underneath it.

### Strengths

- Conceptually clear: camera setup lives with pre-recording actions.
- Avoids sitting directly over the metrics if the header is separated from the HUD.
- Leaves the bottom controls focused on recording.

### Tradeoffs

- Still a poor reach target on large phones.
- Risks creating a second top control band that competes with the HUD.
- Harder to keep clear of safe-area notches and landscape browser chrome.

## Option 3: Camera Setup Row Above Start Button

Replace the floating pill with a full-width setup row just above the Start recording button while `rs.phase === 'ready'`. The row shows the current lens and a clear switch affordance. Once recording starts, it disappears.

### Strengths

- Very obvious before recording.
- Excellent tap target with enough space for long device labels.
- Does not overlap the video metrics.

### Tradeoffs

- Adds more visual weight to the bottom controls.
- Can make the ready state feel busier.
- Less elegant in landscape, where controls are already compressed toward the right side.

## Selected Direction: Option 1

Use the bottom-right thumb pill.

This is the best balance for the recorder because camera switching is a secondary setup action, not a headline metric. Moving it down and right keeps the top HUD clean, improves one-handed reach, and preserves the existing pill and bottom-sheet model instead of inventing a new interaction. The pill can become slightly larger and clearer without feeling like a full setup panel.

## Proposed Implementation Details

- Keep the existing `CameraSelector` bottom sheet.
- Reposition `.camera-control` in portrait to the lower-right preview area, above the safe area and above the primary controls.
- In landscape, anchor `.camera-control` to the right rail above the secondary controls, below the HUD zone.
- Increase `.camera-pill` height to roughly 40px and use a minimum width so it reads as a deliberate control.
- Add a leading camera glyph or short label text such as `Camera` before the active lens label.
- Keep the control visible only in `rs.phase === 'ready'`.
- Keep the fallback `cameraMessage` visually attached to the pill.

## Acceptance Criteria

- The camera pill no longer overlaps the top HUD in portrait or landscape.
- The pill is reachable near the lower-right thumb zone before recording starts.
- The pill remains visually secondary to Start recording.
- The bottom sheet selector behavior is unchanged.
- The design works with long camera labels by truncating the lens label cleanly.
