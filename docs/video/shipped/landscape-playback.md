# Landscape Video Playback — Implementation Plan

> **Goal:** When playing a recorded dive video, rotating the phone to landscape should:
> 1. Show the video in landscape orientation
> 2. Fill the entire screen (no black bars)
> 3. Keep the HUD overlay visible on top of the video
>
> Must work on both iOS Safari and Android Chrome.

---

## 1. Current State (What's Already There)

We already have a partial implementation in:

- [src/lib/stores/videoPlayback.ts](../src/lib/stores/videoPlayback.ts) — `diveVideoBehavior` Svelte action.
- [src/lib/components/DiveVideoPlayer.svelte](../src/lib/components/DiveVideoPlayer.svelte) — DOM HUD overlay inside `[data-fullscreen-root]` container.
- [src/app.css](../src/app.css) — `.dive-video-pseudo-fullscreen` CSS class.

**How it works today:**
1. Wrapper `<div data-fullscreen-root class="relative aspect-video …">`.
2. On `play` + landscape, a CSS class is added that sets `position: fixed; inset: 0; width: 100vw; height: 100dvh; z-index: 9999`.
3. Video uses `object-fit: contain` → letterboxes to preserve aspect ratio.
4. HUD overlay is absolute-positioned at top, `pointer-events: none`.
5. Deliberately **not** using native Fullscreen API, because iOS Safari's only fullscreen path on iPhone is `<video>.webkitEnterFullscreen()`, which strips HTML overlays.

## 2. Why It Currently Falls Short

| # | Issue | Consequence |
|---|---|---|
| A | `object-fit: contain` always letterboxes | Black bars remain on most modern phones (video is 16:9 ≈ 1.78:1, iPhone 14 Pro landscape is ~2.17:1) — **user explicitly wants no black bars**. |
| B | Fullscreen only activates **while video is actively playing** | Pausing (or rotating *then* playing) breaks the fullscreen state. Users expect "landscape = fullscreen" regardless of play/pause. |
| C | `onPause` always exits pseudo-fullscreen | Tapping pause in landscape kicks out of fullscreen, which is unexpected. |
| D | No safe-area-inset handling | On notched iPhones in landscape, the HUD (top-left corner) overlaps the notch / Dynamic Island. |
| E | `screen.orientation` API is unreliable on older iOS | Fallback to `innerWidth > innerHeight` works but misses some edge cases (e.g., split-screen iPad). |
| F | Native `<video>` controls can obscure HUD in landscape | Default bottom gradient / title bar may overlap. |
| G | No explicit enter/exit fullscreen button | Users can't manually enter fullscreen without rotating. |
| H | No orientation-lock request | iOS Safari won't lock, but Android Chrome could lock to landscape once in fullscreen, giving a better experience. |
| I | `body.dive-video-fs-lock` uses `overflow: hidden` globally | May conflict with other scroll locks / stop scroll restore when exiting. |
| J | Multiple feed-card videos on one page | Only one can be fullscreen at a time — need to make sure entering fullscreen on one doesn't leak state. |

## 3. Design Decisions

### 3.1 "No black bars" → use `object-fit: cover` with a user-toggleable fit mode

A 16:9 video on a ~19.5:9 viewport **cannot** simultaneously:
- fill the screen, AND
- preserve aspect ratio, AND
- show every pixel.

We pick **2 of 3** and give the user control:

| Mode | CSS | Behavior | Default? |
|---|---|---|---|
| **Fill** | `object-fit: cover` | Fills entire screen. Crops ~10 % from sides. | ✅ Default (matches user request "no black bars") |
| **Fit** | `object-fit: contain` | Letterboxes. Shows every pixel. | Optional toggle |

A small pill button in the corner of the fullscreen view lets users swap between modes (like YouTube's "zoom to fill"). Preference is persisted in `localStorage` (`overdive.videoFitMode`).

### 3.2 Fullscreen trigger: **landscape orientation**, not "landscape *and* playing"

The player enters pseudo-fullscreen whenever:
- the device is in landscape orientation, AND
- the player is visible in the viewport (so non-visible feed-card players don't all fight for fullscreen).

Pausing does **not** exit fullscreen. Rotation back to portrait **does** exit.

### 3.3 Platform-specific fullscreen strategy

| Platform | Strategy |
|---|---|
| iOS Safari (iPhone) | **CSS pseudo-fullscreen only** (Fullscreen API doesn't work with HTML overlays). |
| iOS Safari (iPad) | Same as iPhone. |
| Android Chrome | **CSS pseudo-fullscreen**, optionally request `screen.orientation.lock('landscape')` for sticky orientation. |
| Desktop Chrome/Firefox/Safari | CSS pseudo-fullscreen on landscape, plus an explicit fullscreen button that uses the real Fullscreen API (overlays work on desktop). |

We **do not** fight iOS to use real fullscreen — the existing decision is correct.

### 3.4 HUD positioning in landscape

- Reposition HUD to top-center in landscape (reduces notch collision).
- Respect `env(safe-area-inset-top/left/right)` padding.
- Scale HUD size with viewport (keeps readable on small landscape heights).
- Make HUD toggle button reachable in fullscreen (currently the overlay toggle pill lives *outside* the fullscreen container — needs to move inside when fullscreen is active, or be duplicated as a fullscreen-only control).

### 3.5 Native video controls

In fullscreen landscape, replace the default `controls` attribute with a **custom minimal control bar** (play/pause + progress + exit-fullscreen), anchored to the bottom with safe-area padding. This:
- Guarantees controls don't overlap HUD.
- Keeps full control over visual style.
- Works consistently across iOS Safari + Android Chrome.

Out of fullscreen (inline), keep native `controls` as today.

---

## 4. Implementation Tasks

### Phase 1 — Core fullscreen behavior (primary acceptance criteria)

#### T1. Rework `diveVideoBehavior` action in [src/lib/stores/videoPlayback.ts](../src/lib/stores/videoPlayback.ts)

- [ ] Remove "only while playing" gate. Landscape → pseudo-fullscreen regardless of play state.
- [ ] Listen to `matchMedia('(orientation: landscape)').addEventListener('change', …)` in addition to the current events (more reliable cross-platform than `orientationchange`).
- [ ] Also listen to `resize` as a fallback (handles iPad split-screen & desktop).
- [ ] Use `IntersectionObserver` on the player node: only activate fullscreen if the player is >= 50 % in view. Prevents all feed-card videos going fullscreen at once.
- [ ] Emit an internal `fullscreen-state` CustomEvent on the container so the component can react (e.g., swap control bars).
- [ ] Track state in a per-instance store so multiple players on a page don't clobber each other.

#### T2. Update pseudo-fullscreen CSS in [src/app.css](../src/app.css) and [src/lib/components/DiveVideoPlayer.svelte](../src/lib/components/DiveVideoPlayer.svelte)

- [ ] Drop `height: 100vh` fallback (use only `100dvh`; iOS 15.4+ supports it; we can polyfill via JS-set `--vh` for older).
- [ ] Add CSS custom property `--dive-video-fit` toggled between `cover` and `contain` for the user fit-mode control.
- [ ] Apply safe-area-inset padding on the HUD container when fullscreen is active.
- [ ] Hide the default `<video>` controls (`controls` attribute toggled off) while in pseudo-fullscreen.

#### T3. Add custom landscape control bar in [src/lib/components/DiveVideoPlayer.svelte](../src/lib/components/DiveVideoPlayer.svelte)

- [ ] New sub-component `LandscapeControls.svelte` (or inline `{#if fullscreen} … {/if}`) showing: play/pause · scrubber · time · fit-toggle · HUD-toggle · exit-fullscreen-button.
- [ ] Exit-fullscreen button forces portrait mode by removing the CSS class even if device is still landscape (sets a "user escaped" flag for this play session; cleared on next rotation).
- [ ] Fit-toggle flips `--dive-video-fit` between `cover` and `contain` and persists to `localStorage`.

### Phase 2 — Ergonomics & edge cases

#### T4. Manual fullscreen button (portrait entry)

- [ ] Add an "Expand" button in the inline (non-fullscreen) player. Tapping it enters pseudo-fullscreen *without* requiring device rotation — useful on tablets or if users prefer portrait-locked phones. Uses the same CSS class.
- [ ] On Android Chrome, additionally call `screen.orientation.lock('landscape')` (try/catch — silently ignore on iOS).

#### T5. Scroll lock & restore

- [ ] Replace blanket `body.dive-video-fs-lock { overflow: hidden }` with a scroll-position save+restore pattern: capture `window.scrollY` on enter, `window.scrollTo(0, saved)` on exit. Prevents scroll jump on exit.
- [ ] Add `inert` attribute to sibling page content while fullscreen is active (accessibility — screen readers skip hidden content).

#### T6. Notch / safe-area HUD layout

- [ ] HUD in fullscreen: `padding: max(0.75rem, env(safe-area-inset-top)) max(0.75rem, env(safe-area-inset-right)) 0 max(0.75rem, env(safe-area-inset-left));`
- [ ] Move HUD to top-center in landscape (`left: 50%; transform: translateX(-50%)`) so it clears the notch on both sides.

#### T7. Wake-lock during playback (optional polish)

- [ ] Request a `navigator.wakeLock.request('screen')` when the player is fullscreen & playing, release on pause/exit. The recording flow already uses wake-lock via [src/lib/capture/wakeLock.ts](../src/lib/capture/wakeLock.ts) — re-use the helper.

### Phase 3 — Testing

#### T8. Manual QA checklist (add to [docs/dynamic-video-qa-checklist.md](dynamic-video-qa-checklist.md))

Devices:
- iPhone (notched, iOS 17+) — Safari
- iPhone (non-notched, iOS 16) — Safari
- iPad — Safari
- Android phone (Pixel) — Chrome
- Android phone — Firefox (known rendering quirks)
- Desktop Chrome/Safari/Firefox (with devtools device emulation)

Scenarios per device:
- [ ] Rotate to landscape while paused → enters fullscreen, HUD visible, no black bars (fill mode).
- [ ] Rotate to landscape while playing → same.
- [ ] Pause while landscape fullscreen → remains fullscreen.
- [ ] Rotate back to portrait → exits cleanly, scroll position restored.
- [ ] Toggle fit mode (fill ↔ fit) → persists across player instances.
- [ ] Toggle HUD → respects toggle; exporting with overlay on still burns HUD.
- [ ] Multiple feed-card players on one page → only the visible one goes fullscreen.
- [ ] Exit-fullscreen button in landscape → returns to inline player without rotating device.
- [ ] HUD doesn't overlap notch / Dynamic Island on iPhone 14/15/16 Pro.
- [ ] Native video controls don't conflict with HUD.
- [ ] Download-to-Photos still works from both inline and fullscreen states.

#### T9. Unit tests

- [ ] Tests for a new pure function `shouldEnterFullscreen({ orientation, visible, userEscaped })` that encapsulates the decision logic.
- [ ] Follow existing pattern in [src/lib/capture/recorderState.test.ts](../src/lib/capture/recorderState.test.ts).

---

## 5. File-by-File Change Summary

| File | Change |
|---|---|
| [src/lib/stores/videoPlayback.ts](../src/lib/stores/videoPlayback.ts) | Rewrite `diveVideoBehavior` — orientation-driven (not play-driven), IntersectionObserver, mediaQuery listener, per-instance state, custom events, new `shouldEnterFullscreen()` pure helper. |
| [src/lib/components/DiveVideoPlayer.svelte](../src/lib/components/DiveVideoPlayer.svelte) | Add `fullscreen` state, custom `LandscapeControls` (inlined), fit-mode toggle, move HUD inside with safe-area padding, wire `--dive-video-fit` CSS var, manual expand button. |
| [src/app.css](../src/app.css) | Update `.dive-video-pseudo-fullscreen` — use `object-fit: var(--dive-video-fit, cover)`, drop `100vh` fallback, add safe-area helpers, replace global scroll-hidden with save/restore. |
| `src/lib/stores/videoPlayback.test.ts` (new) | Unit tests for `shouldEnterFullscreen()`. |
| [docs/dynamic-video-qa-checklist.md](dynamic-video-qa-checklist.md) | Append landscape playback QA scenarios. |
| [docs/recording-a-dynamic-dive.md](recording-a-dynamic-dive.md) | Add a short "Playback in landscape" section. |

---

## 6. Open Questions (Resolve Before Coding)

1. **Default fit mode:** Prefer `cover` (no black bars, crops ~10 %) or `contain` (letterbox)? User request implies `cover`. Confirmed default = **fill (cover)**.
2. **User-escape persistence:** If a user taps "exit fullscreen" while in landscape, do we stay inline even on subsequent rotations until they rotate to portrait *and back*? Proposed: yes — `userEscaped` flag cleared on next portrait.
3. **Feed-card behavior:** Should feed-card players (`compact` variant) go fullscreen on rotation, or only the session-detail player? Proposed: only when `!compact` AND visible, to avoid surprise fullscreen when scrolling.
4. **Android orientation lock:** Call `screen.orientation.lock('landscape')` on fullscreen enter? Gives sticky landscape but requires fullscreen-like context; safe to try/catch.

---

## 7. Acceptance Criteria (Done = true when all pass)

- [ ] iPhone 14 Pro Safari: rotate to landscape → video fills entire screen, HUD visible, no black bars (default fill mode).
- [ ] iPad Safari: same.
- [ ] Pixel 7 Chrome: same.
- [ ] HUD does not overlap notch/Dynamic Island in any tested device.
- [ ] Exiting landscape returns to inline player without scroll jump.
- [ ] Multiple feed-card players don't fight for fullscreen.
- [ ] User can toggle fit mode (fill / fit) and preference persists.
- [ ] Download-to-Photos continues to work as today from both states.
- [ ] `npm run check` passes with no new errors.

---

## 8. Rough Order of Work

1. T1 + T2 + T3 (core landscape fullscreen with fill mode + custom controls) — delivers the primary acceptance criteria.
2. T6 (notch safe area) — essential on modern iPhones.
3. T5 (scroll save/restore) — polish.
4. T4 (manual expand button) — nice-to-have.
5. T7 (wake lock) — nice-to-have.
6. T8 + T9 (QA + unit tests).
