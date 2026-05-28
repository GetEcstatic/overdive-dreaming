# Instructions 
I'll use this section to list updates and fixes over time. When called to check for updates in this md file, I want the agent to read the first request, create a new section with a suitable name, plan an implementation in that section, create a checklist in that section, and then start to implement the plan. Continue implementing without stopping unless a major decision gate is met, commiting with a suitable message after each major step, and finally push to main once that request is complete. Once complete, remove the original request from the list and continue to the next request.

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

1. 