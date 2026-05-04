# Portrait Feed Video Lock Plan

## Goal

When a dashboard feed dive video is played while the phone is in portrait orientation, promote it into the same in-app locked video player used by the current landscape flow: full viewport video, overlay controls, body scroll locked, and an explicit close control.

## Current Behavior

- Landscape behavior is implemented in `src/lib/stores/videoPlayback.ts` through `diveVideoBehavior`.
- The action portals the video container to `document.body`, adds `dive-video-pseudo-fullscreen`, locks body scrolling, and emits `divefullscreenchange` for `DiveVideoPlayer.svelte` to swap into custom overlay controls.
- Landscape entry is orientation-driven and should remain unchanged.
- Dashboard feed cards render `DiveVideoPlayer` from `SessionCard.svelte`, so feed-specific behavior can be enabled with a prop instead of changing every session detail player.

## Implementation

1. Extend the fullscreen decision helper with a portrait play request gate.
2. Add an action option for entering pseudo-fullscreen when playback starts in portrait.
3. Preserve the existing landscape decision path exactly: mobile-like device, landscape orientation, visible player, not user-escaped.
4. When portrait play fullscreen is requested, enter the same pseudo-fullscreen mode, lock scroll, and attempt a portrait orientation lock where supported.
5. Emit the fullscreen mode (`landscape` or `portrait`) with the existing fullscreen event so the player can position portrait-specific controls.
6. Add a small top-right close button in portrait fullscreen mode while keeping the existing landscape control bar unchanged.
7. Enable the portrait-on-play option only for dashboard feed video players.

## Validation

- Update the `shouldEnterFullscreen` unit tests for portrait play behavior.
- Run Svelte diagnostics and `npm run check`.
- Review the git diff to ensure unrelated workspace changes are not staged for the portrait commit.
