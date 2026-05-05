# Fullscreen Distance Scrubber Plan

> Date: 2026-05-05
> Scope: dashboard/session video playback UX plus delete cleanup verification.

## Prompt

When a dive video opens in the fullscreen player from the dashboard, the user needs a polished way to scrub from the beginning to the end of the dive. The scrubber should appear when the player is touched, sit across the bottom of the screen, label the left end as `0m`, label the right end with the total distance reached, and show the distance at the current drag point above the thumb.

## Delete Cleanup Answer

Deleting a session/routine log already calls `deleteDiveVideosForSession(log.id)`, which deletes attached `DiveVideo` documents and their storage objects before deleting the routine log. The existing video delete path removes the clean/master video, thumbnail, and `burnedObject` overlay export.

Gap found: generated artifacts stored only in `video.artifacts` are not comprehensively deleted yet. That means playback proxy artifacts, and any future artifact refs not mirrored onto `thumbnailObject` or `burnedObject`, can be orphaned. The implementation should delete every Wasabi/Firebase artifact object referenced by the video, de-duplicated by bucket/key/path, before deleting the Firestore document.

## UX Requirements

- Show the scrubber only in fullscreen playback.
- Reveal controls when the user taps/touches/moves in fullscreen, then hide them after a short idle delay while the video is playing.
- Keep the existing play, fit/fill, HUD toggle, and exit controls.
- Add a bottom timeline with stable labels:
  - left label: `0m`
  - right label: final distance from `timeline`/`poolLength`, e.g. `157m`
- While dragging, show a compact floating indicator above the thumb with the interpolated distance at that video timestamp.
- Update the video current time as the thumb is dragged.
- Keep the HUD and controls readable in portrait and landscape fullscreen, respecting safe-area insets.
- Preserve normal native controls outside fullscreen.

## Data Model

No new persisted data is needed.

Derived values in `DiveVideoPlayer.svelte`:

- `durationSeconds`: from the loaded video element where available, else `liveVideo.durationSeconds`.
- `scrubProgress`: `currentTime / durationSeconds`, clamped 0-1.
- `totalDistance`: max of timeline sample distance, last lap cumulative distance, and current derived distance.
- `scrubDistance`: `distanceAt(timeline, scrubMs, poolLength)`.

## Implementation Steps

1. Harden `deleteDiveVideo(video)` so it deletes every referenced artifact object, including playback proxy and overlay-download refs in `video.artifacts`.
2. Add fullscreen scrub state to `DiveVideoPlayer.svelte`:
   - `showFullscreenControls`
   - `isScrubbing`
   - `scrubPreviewMs`
   - hide timer management
3. Add pointer handlers for the scrubber rail:
   - calculate progress from rail bounds
   - seek video element during drag
   - keep preview indicator in sync
4. Replace always-visible fullscreen controls with an idle-aware overlay containing the existing buttons plus the new distance scrubber.
5. Style the scrubber for mobile fullscreen:
   - bottom safe-area padding
   - translucent gradient control shelf
   - clear thumb and filled track
   - floating distance badge above the thumb
6. Validate with `npm run check` and focused manual review of portrait/landscape CSS.

## Questions

None blocking. The requested distance-based scrubber can be implemented from the existing `DiveTimeline` and player state without a schema change.
