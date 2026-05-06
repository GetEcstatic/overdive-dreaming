# Dashboard Player HUD Parity Plan

Status: implementation planned.

## Goal

When a dashboard video opens in the custom mobile player, the replay HUD should look identical to the recording HUD. The portrait close button should be removed and replaced with a swipe-down-to-close gesture.

## Current Difference

`DiveRecorder.svelte` uses the recording HUD classes (`.hud`, `.hud-top`, `.hud-row`, `.hud-label`, `.hud-value`, `.hud-sub`) with these key traits:

- Portrait: left/right inset `0.75rem`, top safe-area `0.75rem`, padding `0.75rem 1.05rem`, value text `1.9rem`, label `0.7rem`, sub `0.85rem`.
- Landscape: compact top-left HUD, max width `62%`, padding `0.55rem 0.85rem`, value text `1.35rem`, label `0.64rem`, sub `0.76rem`.

`DiveVideoPlayer.svelte` currently has a separate `.dive-hud` style that is close but not identical, and it renders a small portrait `x` close button above the video.

## Implementation

1. Update `DiveVideoPlayer.svelte` HUD CSS to mirror the recorder HUD exactly for portrait and landscape replay states.
2. Keep the replay HUD markup semantically equivalent: Time, Distance, lap text, and speed text remain in the same visual rows.
3. Remove the portrait-only `x` close button from the custom player.
4. Add a downward swipe gesture on the fullscreen player container:
   - Start tracking on touch/pointer down in portrait fullscreen.
   - Close when vertical movement passes a clear threshold and dominates horizontal movement.
   - Ignore the gesture while scrubbing controls, so timeline seeking is not interrupted.
5. Preserve existing landscape fullscreen controls and the landscape exit button.
6. Validate with `npm run check`.

## Commit Stages

- Stage 1: commit this plan.
- Stage 2: implement HUD parity and swipe-down close, validate, and commit.
