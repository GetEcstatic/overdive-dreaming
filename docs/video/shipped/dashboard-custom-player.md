# Dashboard Custom Player

Status: shipped.

## Goal

Dashboard dive videos use the Overdive custom player surface instead of falling back to native browser video controls. In the dashboard card the player stays inline while idle and only enters the custom fullscreen player when the user presses play.

## Behavior

- Dashboard cards render `DiveVideoPlayer` for uploaded dive videos.
- The dashboard variant disables rotation-driven fullscreen promotion so rotating the phone does not make a card take over the screen while browsing.
- Pressing play keeps the existing play-to-fullscreen behavior for mobile portrait playback.
- Inline dashboard playback hides native browser controls and uses Overdive controls instead.
- The overlay toggle and download action sit inside the video frame over the video, saving vertical space below the card media.
- Existing full player usage outside the dashboard keeps the current below-video action row unless explicitly opted into the overlay action layout.

## Implementation Notes

- `DiveVideoPlayer` exposes focused props for inline custom controls, in-frame action placement, and rotation fullscreen behavior.
- `SessionCard.svelte` opts into those props for dashboard cards.
- The implementation reuses the existing HUD, download, and fullscreen code paths instead of introducing a dashboard-only player.
- Fullscreen HUD and scrubber behavior remain unchanged.

## Validation

- `npm run check`