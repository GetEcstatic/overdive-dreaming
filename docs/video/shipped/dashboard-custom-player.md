# Dashboard Custom Player

Status: shipped.

## Goal

Dashboard dive videos use the Overdive custom player surface instead of falling back to native browser video controls. In the dashboard card the player behaves like a short-form video feed: the most visible video plays inline, the previous video pauses, and tapping the video opens the custom fullscreen player.

## Behavior

- Dashboard cards render `DiveVideoPlayer` for uploaded dive videos.
- The most visible dashboard video autoplays inline, muted.
- When another dashboard video becomes the most visible video, the previous one pauses.
- The dashboard variant disables rotation-driven fullscreen promotion so rotating the phone does not make a card take over the screen while browsing.
- Tapping the inline video requests custom pseudo-fullscreen directly instead of toggling inline play.
- Inline dashboard playback hides native browser controls and uses Overdive controls instead.
- The overlay toggle and download action sit inside the video frame over the video, saving vertical space below the card media.
- Autoplay is disabled for reduced-motion users and when the browser reports data-saver mode.
- Existing full player usage outside the dashboard keeps the current below-video action row unless explicitly opted into the overlay action layout.

## Implementation Notes

- `DiveVideoPlayer` exposes focused props for inline custom controls, in-frame action placement, dashboard autoplay, tap-to-fullscreen, and rotation fullscreen behavior.
- `SessionCard.svelte` opts into those props for dashboard cards.
- The implementation reuses the existing HUD, download, and fullscreen code paths instead of introducing a dashboard-only player.
- Dashboard autoplay is coordinated at module scope so only one card video plays at a time.
- `diveVideoBehavior` exposes an explicit fullscreen request path so autoplay can remain inline while taps open fullscreen.
- Fullscreen HUD and scrubber behavior remain unchanged.

## Validation

- `npm run check`