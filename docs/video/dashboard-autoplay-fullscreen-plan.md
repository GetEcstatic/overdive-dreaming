# Dashboard Autoplay and Tap-to-Fullscreen Plan

Status: awaiting confirmation before implementation.

## Request

Dashboard video cards should behave more like an Instagram feed:

- As a session card scrolls into view, its dive video starts playing.
- The previously active dashboard video stops playing.
- Pressing the video opens the custom fullscreen player instead of merely toggling inline playback.

## Negative Implications to Consider

### Data, Battery, and Heat

Autoplaying feed videos can increase mobile data use, battery drain, and device heat. This is especially relevant because dive videos can be hundreds of megabytes, even when playback uses the preferred proxy URL.

Mitigation:

- Only autoplay the single most visible dashboard video.
- Use `preload="metadata"` until a card is selected as active.
- Prefer playback proxy URLs when available, which the existing dashboard URL resolver already does.
- Respect `navigator.connection.saveData` where available by disabling autoplay and falling back to tap-to-play.

### Browser Autoplay Policy

Mobile browsers generally only allow autoplay if the video is muted and `playsinline`.

Mitigation:

- Inline dashboard autoplay should be muted.
- Tap-to-fullscreen is a user gesture, so fullscreen promotion can happen reliably from the press event.
- If fullscreen playback should include audio later, that needs an explicit unmute affordance or an intentional unmute-on-tap decision.

### Motion and Accessibility

Autoplay can be distracting, especially for users who prefer reduced motion.

Mitigation:

- Respect `prefers-reduced-motion: reduce` by disabling autoplay.
- Keep the overlay controls readable and avoid layout shifts when autoplay starts/stops.
- Pause videos when the page/tab is hidden.

### Feed Stability

A naive implementation could cause videos to rapidly start/stop while scrolling near thresholds.

Mitigation:

- Use one dashboard-level active-video decision based on IntersectionObserver visibility ratio.
- Add hysteresis or a minimum visibility threshold, for example activate above 65% visible and do not switch until another card is clearly more visible.
- Pause all dashboard videos on route change/unmount.

### Fullscreen Gesture Semantics

The current dashboard custom player uses the same click/press for inline play. The new requested behavior changes tap semantics: tapping the video should enter fullscreen, while scrolling into view handles inline play.

Mitigation:

- In the dashboard variant, remove tap-to-toggle-play from the inline video surface.
- Expose an imperative `requestDiveFullscreen(container)` path from `diveVideoBehavior`, similar to the existing `exitDiveFullscreen(container)`.
- On dashboard video press, call that request from the user gesture so the pseudo-fullscreen player opens without relying on a play event.

## Proposed Implementation

### 1. Dashboard Active Video Coordinator

Add a small dashboard/feed playback coordinator, likely in `src/lib/stores/videoPlayback.ts` or a new adjacent helper:

- Track registered dashboard video containers and their latest visibility ratios.
- Select the most visible eligible player.
- Notify players whether they are the active dashboard video.
- Ensure only one dashboard video is playing at a time.

Keep this as data-oriented as practical:

- Pure selector: `(entries, preferences) -> activeVideoId | null`.
- DOM observers/listeners only at the Svelte/action edge.

### 2. Extend `DiveVideoPlayer` Dashboard Variant

Add props or refine the existing dashboard props:

- `dashboardAutoplay?: boolean`
- `tapToFullscreen?: boolean`
- `mutedInline?: boolean`

For dashboard cards:

- Muted inline autoplay when selected as active.
- Pause when no longer active.
- Tap/click requests pseudo-fullscreen instead of toggling inline play.
- Keep overlay/download pills inside the player frame.
- Keep rotation-driven fullscreen disabled.

### 3. Expose Fullscreen Request from Playback Action

Extend `diveVideoBehavior` so the component can request fullscreen directly:

- Add a container method such as `__diveRequestFullscreen`.
- Export `requestDiveFullscreen(container)` beside `exitDiveFullscreen(container)`.
- Internally set the same state currently used by play-to-fullscreen (`portraitPlayRequested = true`, `userEscaped = false`) and call `applyDecision()`.
- Keep the existing automatic landscape behavior unchanged for non-dashboard players.

### 4. Respect User and Network Preferences

Before autoplaying:

- Disable autoplay if `window.matchMedia('(prefers-reduced-motion: reduce)').matches`.
- Disable autoplay if `navigator.connection?.saveData` is true.
- Keep manual tap-to-fullscreen available even when autoplay is disabled.

### 5. Documentation and Validation

Update docs after implementation:

- Move this plan to `docs/video/shipped/` or update status to shipped.
- Add or update the `docs/INDEX.md` entry.

Validate with:

- `npm run check`
- Manual mobile dashboard test:
  - Scroll video A into view: A muted-autoplays.
  - Scroll video B into view: A pauses, B muted-autoplays.
  - Tap active video: custom fullscreen opens.
  - Swipe down exits fullscreen.
  - Reduced motion / data saver disables autoplay but tap still opens fullscreen.

## Recommendation

This is worth implementing, but only with muted single-video autoplay and preference guards. The main risks are mobile data/battery use and annoying motion in the feed; both are manageable if only one visible video can autoplay and autoplay is disabled for reduced motion or data saver users.
