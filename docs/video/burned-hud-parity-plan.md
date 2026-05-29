# Burned HUD Parity Plan

Status: Phase 1 in progress.

## Goal

Make downloaded HUD-on videos match the in-app HUD as closely as practical while keeping server-side background generation so the processed video is ready for immediate download once the worker finishes.

The target is not just similar numbers. The burned-in artifact should match the in-app player on:

- HUD size and placement for portrait and landscape display modes.
- Font family, weight, numeric alignment, letter spacing, line height, and text color.
- Background lozenge color, opacity, radius, padding, and blur/softness where possible.
- Time, distance, lap count, speed values, and speed-plot reveal behavior at the same timestamp.
- Regeneration behavior when HUD style or timeline data changes.

## Current Process

### In-App Playback

- `DiveVideoPlayer.svelte` renders the top metric HUD as DOM/CSS.
- The design data lives in `src/lib/media/hudDesign.ts` as `HUD_DESIGN`, `scaleHudModeDesign`, and `hudCssVariables`.
- The in-app speed graph uses a pure model in `src/lib/media/speedPlotHud.ts` and an SVG renderer in `SpeedPlotHudSvg.svelte`.
- Browser overlay export fallback still exists in `DiveVideoPlayer.svelte`. Its `drawHud()` path reuses `scaleHudModeDesign`, so it is closer to the in-app HUD than the server ASS path.

### Server Burn-In

- `functions/src/mediaWorker.ts` handles `generate-overlay-download` jobs.
- The worker downloads the clean master, writes a temporary ASS subtitle file from `overlayAss()`, and runs FFmpeg with display rotation, scale, and `subtitles=...`.
- `overlayAss()` duplicates the HUD layout constants manually: short-edge scale, rem conversion, padding, font sizes, lozenge geometry, text placement, colors, speed plot events, and watermark.
- The artifact is written to Wasabi as `overlay/download.mp4`, stored as an `overlay-download` artifact, and marked with `OVERLAY_STYLE_VERSION`.

### Queue and Readiness

- New uploads enqueue `generate-overlay-download` in `functions/src/mediaProcessingJobs.ts` alongside probe, thumbnail, and playback proxy jobs.
- The frontend version gate is `SERVER_OVERLAY_STYLE_VERSION` in `src/lib/media/processing.ts`; the function worker has its own matching `OVERLAY_STYLE_VERSION` constant.
- `DiveVideoPlayer.svelte` subscribes to the video document, treats stale ready artifacts as retryable, and can request/retry overlay generation through `requestOverlayDownload`.
- Timeline correction invalidates overlay artifacts in `functions/src/saveDiveVideoTimelineCorrection.ts` and resets `processingState.overlayDownload`.

## Strengths

- The server export path already preserves audio and prepares overlay downloads in the background.
- Upload-time queueing means many HUD-on downloads should already be ready before the user taps download.
- Style-version checks exist, so a new renderer/style can force regeneration without manual data cleanup.
- In-app HUD design has a mostly data-oriented source in `HUD_DESIGN`.
- The browser canvas fallback proves that a shared design model can produce closer parity than manually copied server constants.

## Weaknesses

- Server ASS burn-in is a separate renderer with manually copied constants. It will keep drifting from the DOM/SVG HUD unless every change is duplicated perfectly.
- ASS cannot faithfully reproduce every browser visual detail, especially backdrop blur and browser font metrics.
- The server worker and frontend each define the current overlay style version separately, which is easy to forget during visual changes.
- The speed graph already has a pure model and SVG renderer, but the top metric HUD does not; it is split between DOM, canvas, and ASS implementations.
- The prior visual comparison artifact was not found in the repo, temp folders, chat resources, or Git history, so there is no durable regression fixture for HUD parity.

## Redundant or Risky Code

- `overlayAss()` duplicates `HUD_DESIGN` values and text layout logic in `functions/src/mediaWorker.ts`.
- `drawHud()` in `DiveVideoPlayer.svelte` is a browser canvas fallback renderer. It is useful as a reference for shared design use, but it is not the primary visible UI or primary export path.
- `SERVER_OVERLAY_STYLE_VERSION` and `OVERLAY_STYLE_VERSION` are duplicated across frontend and functions.
- Speed plot geometry exists in both SVG/canvas-friendly model code and ASS event generation. The pure model should stay; the ASS-specific renderer should be retired if the server moves to a shared visual renderer.

## Recommendation

Yes, HUD parity can be improved substantially. The root fix is to stop treating ASS as the source of server HUD appearance. Build one canonical HUD frame model and one visual renderer family that both in-app playback and server burn-in use.

Recommended direction:

1. Create a shared pure HUD frame model for top metrics and speed graph state at a timestamp.
2. Render that model as SVG for in-app playback.
3. Render the same SVG server-side into transparent PNG frames or a short overlay video, then composite it over the source with FFmpeg.
4. Keep the existing background job queue and artifact/version invalidation, but bump the overlay style version and regenerate stale artifacts.

This gives us browser-inspectable visuals, deterministic server output, and a path to real side-by-side regression fixtures.

## Implementation Plan

Implementation decisions:

- Use SVG as the canonical visual renderer for parity. It is browser-inspectable in-app and can be rasterized deterministically server-side.
- Move the in-app top metric HUD fully to SVG rather than carrying a long-lived debug fork. A short-lived comparison route or fixture is useful, but the product path should have one renderer.
- Use bundled web fonts if needed for parity, choosing system-like faces rather than relying on platform font stacks in server output.
- Keep `Overdive.app` watermark as a server-export-only layer, not part of the shared in-app HUD.

### Phase 1 - Shared Model and Fixture

- Add a shared `metricHudFrame` pure module with timestamp inputs and a renderer-neutral output: box rect, rows, text runs, colors, opacity, font tokens, and value strings.
- Keep timeline math pure and shared: `diveElapsedAt`, `distanceAt`, `speedAt`, lap count, speed plot frame.
- Add fixture data for one portrait and one landscape dive frame at fixed timestamps.
- Add tests proving in-app and server inputs produce identical metric strings and layout geometry.

Status: `src/lib/media/metricHudFrame.ts` now produces renderer-neutral top metric HUD frames from `HUD_DESIGN`, timeline math, pool length, timestamp, width, and HUD mode. `metricHudFrame.fixtures.ts` provides portrait and landscape fixtures, and `metricHudFrame.test.ts` pins metric strings and shared geometry.

### Phase 2 - In-App SVG Renderer

- Add `MetricHudSvg.svelte` that consumes the shared metric HUD frame.
- Replace the DOM top metric HUD in `DiveVideoPlayer.svelte` with the SVG renderer, or run it behind a temporary comparison flag first.
- Keep the speed graph SVG renderer fed by the existing pure speed plot model.
- Verify portrait, landscape, dashboard inline, pseudo-fullscreen, and desktop constrained player states.

### Phase 3 - Server SVG/PNG Burn-In

- Move or package the shared HUD model so both SvelteKit and Cloud Functions can import it without path hacks.
- Add a server renderer that emits SVG for the metric HUD and speed graph at each 0.1s tick using the same model data.
- Rasterize SVG frames with a deterministic server dependency, then composite them over the rotated/scaled video with FFmpeg.
- Retire the top-metric ASS events once the SVG/PNG overlay path is reliable.
- Preserve audio, faststart, 720p export, and existing Wasabi artifact storage.

### Phase 4 - Background Readiness and Invalidation

- Keep upload-time `generate-overlay-download` queueing.
- Unify overlay style versioning in one shared constant or generated module consumed by frontend and functions.
- Bump to the next style version when SVG burn-in ships.
- Ensure stale style artifacts are treated as retryable and can be regenerated automatically on player open.
- Keep timeline-correction invalidation and include HUD style version in the artifact metadata.

### Phase 5 - Visual Regression

- Add a committed comparison fixture directory with generated in-app SVG, server SVG/PNG, and a side-by-side comparison image.
- Add a script that renders the same timestamp through both paths and writes a diff image plus numeric pixel delta.
- Document how to regenerate the comparison artifact.
- Use this fixture before every future HUD style-version bump.

## Acceptance Criteria

- In-app and server HUD metric strings match for fixed test timestamps.
- In-app and server HUD geometry match within a small pixel tolerance at 720p portrait and landscape output sizes.
- Background overlay jobs are still queued on upload and still produce ready `overlay-download` artifacts without a user waiting on the download button.
- Stale overlay artifacts regenerate when the shared HUD style version changes.
- The old ASS renderer is either removed or clearly kept only as a fallback, not the primary parity path.
- A side-by-side comparison artifact and regeneration script are committed so this process is not lost again.

## Resolved Decisions

- Server rasterizer: use an SVG-first renderer and select the smallest reliable Cloud Functions rasterizer during Phase 3 implementation. Prefer a dependency that can rasterize SVG to PNG without requiring system packages.
- In-app migration: move top metrics to the shared SVG renderer as the product path, with tests/fixtures as the safety net.
- Fonts: use bundled system-like web fonts if needed to make server output deterministic.
- Watermark: keep `Overdive.app` server-export-only.
