# Instructions

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

## Thumb-Only Inline Scrubbing

### Problem
The inline scrubber currently treats broad video touches as seek gestures. That makes accidental touches risky because revealing or interacting with the player can also move the playback position.

### Implementation Plan
Keep broad touches and desktop lower-band hover as reveal-only interactions, preserving the recent two-second linger. Make the scrubber thumb expose an explicit pointer target, and only start a seek/drag session when the pointer down originates from that thumb target. During an active thumb drag, continue using the existing pointer capture and progress calculation.

### Checklist
- [x] Add an explicit pointer target around the inline scrubber thumb.
- [x] Make broad touch interactions reveal the scrubber without seeking.
- [x] Start seeking only from the scrubber thumb target.
- [x] Preserve desktop lower-band reveal and thumb dragging.
- [x] Preserve play/pause and compact action buttons.
- [x] Run Svelte/type checks.
- [x] Commit and push the thumb-only scrubber update.

## Speed Plot Section Mapping

### Problem
The top metric HUD computes waypoint fallback speed from the active segment between the previous waypoint and the next waypoint. The lower speed plot, however, feeds a stepped polyline with only one sample at each waypoint using the segment that just ended. Because the renderer holds the previous point's y-value until the next x-position, that ended-segment speed can visually occupy the following distance section.

### Implementation Plan
Represent waypoint fallback speed plot data as explicit segment spans: one point at the start distance with that segment's average speed and one point at the end distance with the same speed, then add the next segment's start point at the same distance so the step happens at the waypoint. Mirror the same data-shape fix in the server overlay renderer, bump the server overlay style version, and add focused tests for uneven segment speeds so future changes catch the off-by-one mapping.

### Checklist
- [x] Confirm the top HUD and lower plot use different waypoint speed mapping shapes.
- [x] Change frontend waypoint speed samples to explicit segment spans.
- [x] Add a focused uneven-segment speed plot test.
- [x] Mirror the segment-span mapping in the server overlay worker.
- [x] Bump server overlay style version for regenerated burned HUDs.
- [x] Run focused tests, function build, and Svelte/type checks.
- [x] Commit and push the speed plot mapping fix.

## Inline Scrubber Polish

### Problem
The new inline scrubber disappears immediately on mobile release, which can hide the final timeline position under the user's finger. Desktop feed users also need a discoverable pointer-based way to reveal and use the same scrubber now that the pseudo-fullscreen path is gone.

### Implementation Plan
Keep the scrubber visible for two seconds after a touch scrub ends, cancelling that delay whenever a new scrub starts. For desktop pointers, reveal the same scrubber when the cursor moves through the lower HUD/scrubber band, keep it visible while the cursor remains in the player, and allow mouse drag/click seeking from that band without changing the mobile touch interaction.

### Checklist
- [x] Add a two-second post-release linger for the inline scrubber.
- [x] Cancel pending linger timers when a new scrub starts or the player unmounts.
- [x] Reveal the inline scrubber from the desktop lower HUD band.
- [x] Allow desktop mouse drag/click seeking from that revealed scrubber band.
- [x] Preserve play/pause taps and compact action buttons.
- [x] Run Svelte/type checks.
- [x] Commit and push the scrubber polish update.
## Inline Feed Playback Controls

### Problem
The dashboard feed no longer needs the custom pseudo-fullscreen player now that feed videos are sized correctly. Removing that path means the inline feed player needs two missing affordances: persistent sound control in the compact action row, and an inline scrubber that temporarily replaces the lower speed HUD while the user touches/scrubs the video.

### Implementation Plan
Keep playback inside the feed card by removing the feed-card `tapToFullscreen` path and making inline taps toggle play. Add a compact volume button next to the HUD/download actions, persisted in localStorage, and wire dashboard autoplay so only the centered/active feed video can play with sound. Then add an inline touch scrubber overlay that appears in the lower HUD area during pointer interaction, seeks by distance/time, and restores the speed HUD on release when the HUD is enabled.

### Checklist
- [x] Remove dashboard feed pseudo-fullscreen entry points.
- [x] Add persistent compact feed volume control.
- [x] Ensure only the centered active feed video can play sound.
- [x] Add touch/drag inline scrubber in place of the lower HUD.
- [x] Preserve HUD/download actions and desktop/mobile feed sizing.
- [x] Run Svelte/type checks.
- [x] Commit and push the completed playback control update.

## Burned HUD Parity Investigation

### Problem
The in-app HUD is approaching the desired look and behavior, but server-burned downloads still lag behind. We need to understand the current render/export paths, identify drift and redundant code, and decide whether HUD parity can be improved while preserving server-side background processing.

### Findings
- In-app playback uses `HUD_DESIGN` and DOM/CSS variables for the top metric HUD, plus a pure speed-plot model and SVG renderer for the bottom graph.
- Browser canvas fallback export already reuses `scaleHudModeDesign`, so it is closer to the in-app HUD than the server path.
- Server burn-in uses `functions/src/mediaWorker.ts` to generate ASS subtitle events from manually duplicated layout/style constants, then FFmpeg burns those subtitles into the video.
- Background readiness is already in place: uploads enqueue `generate-overlay-download`, player open can request/retry stale overlay jobs, timeline corrections invalidate old overlays, and overlay artifacts are versioned.
- The main parity weakness is renderer duplication. ASS cannot faithfully reproduce all browser HUD details, and copied constants will keep drifting.

### Plan Created
Created `docs/video/burned-hud-parity-plan.md` and added it to `docs/INDEX.md`. The recommended path is a shared HUD frame model plus SVG-based in-app and server rendering, with server-side SVG/PNG compositing replacing the primary ASS renderer while keeping the current background job queue and style-version invalidation.

### Checklist
- [x] Investigate current in-app HUD rendering.
- [x] Investigate current server burn-in rendering.
- [x] Evaluate strengths, weaknesses, and redundant code.
- [x] Answer whether HUD parity can improve.
- [x] Create and index a new implementation plan.


## HUD Comparison Artifact Search

### Problem
The burned-in download HUD still does not match the in-app HUD closely enough. There was an earlier visual-comparison process that reportedly produced a close side-by-side match, so the first step is to locate the comparison artifact and the markdown process note before changing renderer code again.

### Search Performed
- Searched current docs, source, functions, scripts, static assets, animation files, and local generated files for side-by-side/comparison/HUD/parity/ASS/burned-in references.
- Searched Git history filenames and commit messages for HUD comparison artifacts.
- Searched Git history text for side-by-side, frame-by-frame, burned HUD, dashboard HUD, SVG/canvas, and HUD parity references.
- Searched `/tmp`, `/var/folders`, and Copilot chat resources for generated image/HTML artifacts with HUD/overlay/compare/render names.

### Findings
- The strongest process reference is `docs/video/speed-plot-hud-overlay.md`, whose visual checks explicitly list side-by-side SVG and canvas renders at 720p, 1080p, and 4K.
- A second relevant process reference is `docs/video/server-side-recording-pipeline.md`, which calls out comparing the burned HUD against the dashboard HUD frame-by-frame on portrait and landscape clips.
- `docs/video/dashboard-player-hud-parity-plan.md` covers matching replay HUD styling to the recorder/player HUD, but it does not reference the server burned-in comparison artifact directly.
- I did not find a committed or local generated side-by-side image/HTML artifact in the workspace, temp folders, Copilot chat resources, or Git history filenames. The artifact was likely transient or stored outside this workspace.

### Checklist
- [x] Locate markdown references to the prior HUD comparison process.
- [x] Search workspace and Git history for generated comparison artifacts.
- [x] Search local temp/chat-resource locations for uncommitted artifacts.
- [x] Record the found process docs and missing-artifact result.

## Native-Ratio Dashboard Player Width

### Problem
The dashboard player should not use a fixed 4:5 frame. The video player must fill the 470px-wide feed card, and its height should adjust from the video/player aspect ratio. Desktop pseudo-fullscreen playback should follow the same width and aspect-ratio rule.

### Implementation Plan
Remove the desktop 4:5 media-frame override for dashboard videos. Keep the player root at full card width, let `DiveVideoPlayer` use its display/native aspect ratio for height, and constrain desktop pseudo-fullscreen to a 470px width using that same aspect ratio rather than a fixed 4:5 shell.

### Checklist
- [x] Remove the fixed 4:5 dashboard media-frame override.
- [x] Keep the dashboard player at full card width.
- [x] Let player height follow the video/player aspect ratio.
- [x] Apply the same aspect-ratio rule to desktop pseudo-fullscreen.
- [x] Run Svelte/type checks.
- [x] Commit and push the completed width/aspect correction.

## Dashboard Player Fill Correction

### Problem
The feed-frame player mode was present, but rotated dashboard videos could still render as a narrow strip inside the card because the rotated asset kept the normal 100% by 100% video box. The desktop pseudo-fullscreen sizing override also needed to stay desktop-only so mobile playback remains full-screen.

### Implementation Plan
Give rotated dashboard feed videos swapped 4:5 geometry inside the frame so the rotated image fills the same width as the HUD. Keep the feed pseudo-fullscreen size constraint behind a fine-pointer desktop media query, preserving mobile full-screen behavior and the custom scrubber path.

### Checklist
- [x] Make rotated dashboard feed videos fill the card and HUD width.
- [x] Scope the constrained dashboard pseudo-fullscreen rule to desktop pointers.
- [x] Keep the custom player scrubber path enabled.
- [x] Run Svelte/type checks.
- [x] Commit and push the completed fill correction.

## Desktop Dashboard Player Behavior

### Problem
The dashboard media frame is now the right size, but the embedded player keeps its own portrait aspect ratio internally, so the video appears narrower than the card while the HUD fills the frame. Desktop clicks should keep the custom player because that preserves distance scrubbing, but the desktop pseudo-fullscreen shell needs to stay constrained instead of expanding across the whole monitor. Desktop HUD downloads can also appear inert while the browser tries the share-preparation path.

### Implementation Plan
Add an explicit dashboard feed-frame mode to `DiveVideoPlayer` so the video element, poster, and HUD all fill the same 470px-wide 4:5 frame. Preserve tap-to-custom-player behavior for scrubbing, constrain that player to an Instagram-like frame on desktop, add a small top-right close button, and make non-iOS server-overlay downloads use the direct signed URL download path.

### Checklist
- [x] Make dashboard videos fill the same desktop media frame as thumbnails and HUD.
- [x] Preserve custom player scrubbing while constraining desktop pseudo-fullscreen size.
- [x] Add a small top-right close button for the desktop custom player.
- [x] Use direct signed URL downloads for non-iOS server-overlay downloads.
- [x] Run Svelte/type checks.
- [x] Commit and push the completed desktop player behavior fix.

## Desktop Feed Media Frame

### Problem
The desktop feed column was capped to 470px, but portrait videos can still render at their full tall aspect ratio, so they take nearly the height of the monitor. Thumbnail-only previews also need the same frame as the eventual video player so the card does not visually resize or show a narrower preview.

### Implementation Plan
Keep the desktop feed column at 470px and add a desktop-only 4:5 media frame for session photos, thumbnail-only video previews, and inline video players. Use `object-fit: cover` inside that frame on desktop so thumbnails and videos share the same visible dimensions. Leave mobile sizing unchanged.

### Checklist
- [x] Constrain desktop feed media to a 470px-wide 4:5 frame.
- [x] Make thumbnail-only previews use the same frame as video playback.
- [x] Keep mobile media sizing unchanged.
- [x] Run Svelte/type checks.
- [x] Commit and push the completed media frame fix.


## Desktop Feed Width Alignment

### Problem
The desktop dashboard feed currently expands with the available page width, making videos and still images appear oversized. That makes lower-resolution clips look worse and gives the feed a less polished feel than a familiar fixed-width social feed.

### Implementation Plan
Constrain only the desktop dashboard sessions column to an Instagram-like 470px width. Let feed media fill that card width on desktop, while keeping the existing mobile sizing and padding unchanged.

### Checklist
- [x] Cap the desktop sessions feed column at 470px.
- [x] Let desktop feed media fill the card width.
- [x] Preserve current mobile sizing behavior.
- [x] Run Svelte/type checks.
- [x] Commit and push the completed desktop feed sizing fix.

## Preserve First Speed Segment Acceleration

### Problem
The speed plot correctly shows the first segment as starting at 0 m/s and reaching the segment speed by 3m while the diver is before the first waypoint. Once the first waypoint is revealed, the graph switches to waypoint samples whose first sample is 0m at the sector average speed, so the historical 0-3m segment is redrawn at the wrong speed.

### Implementation Plan
Keep the first-segment acceleration shape in the canonical visible speed line, even after later waypoints are revealed. Apply the same rule in the browser HUD model and the Cloud Functions ASS renderer so playback and burned-in exports match.

### Checklist

- [x] Add a focused regression test for the first segment after the first waypoint is reached.
- [x] Update the browser speed plot line sampling to preserve the 0m/0 m/s -> 3m/sector speed anchor.
- [x] Update the server-side ASS speed plot sampling with the same behavior.
- [x] Run focused tests and function build checks.
- [x] Commit and push the completed fix.

## Restore Dashboard Video Thumbnails

### Problem
Dashboard feed cards wait for the signed video playback URL before rendering the media block. The poster URL is resolved after that, so a card with an available thumbnail can still sit blank while the larger video URL is being signed or loaded.

### Implementation Plan
Resolve video thumbnails independently from playback URLs and allow the media block to render a poster-only preview as soon as the thumbnail URL is ready. Keep the existing video player behavior once the playback URL resolves, using the same poster for the player.

### Checklist
- [x] Render dashboard media when a video poster is available, even before the video URL is ready.
- [x] Fetch poster and playback URLs independently with the existing stale-token guard.
- [x] Keep video preload behavior at least at metadata level for fast first-frame readiness.
- [x] Run Svelte/type checks.
- [x] Commit the completed thumbnail fix.

## Align Burned-In HUD Styling

### Problem
Burned-in downloads are not matching the in-app HUD closely enough, and the requested `Overdive.app` watermark is not visible. The server ASS renderer already has the same layout math as the in-app HUD, but some literal style values differ and the watermark override tags are not escaped like the other ASS events.

### Implementation Plan
Bring the server ASS style colors/text closer to the app HUD constants, fix the watermark ASS override so it renders, place it at the bottom-left as requested, and bump the server overlay style version so old artifacts are regenerated.

### Checklist
- [x] Fix the ASS watermark override and use `Overdive.app` at bottom-left.
- [x] Align server HUD value color with the app HUD foreground.
- [x] Bump overlay style version for regeneration.
- [x] Run focused media tests and Cloud Functions build.
- [x] Commit the completed HUD parity fix.

