# Video Export Overlay, Audio, and Photos Plan

> Date: 2026-05-03
> Scope: fix downloaded/baked dive video exports. Preserve the current in-app playback path.

## 1. Problem

The downloaded version can be worse than in-app playback:

- Baked-overlay exports appear to drop or duplicate frames.
- The baked HUD does not match the dashboard/player HUD sizing closely enough.
- Audio is missing from baked-overlay downloads.
- On iOS, exported files are often offered as Save to Files instead of Save Video / Photos.

## 2. Current Pipeline

[src/lib/components/DiveVideoPlayer.svelte](../src/lib/components/DiveVideoPlayer.svelte) currently does this when overlay is enabled:

1. Load the original video into a hidden `<video>` element.
2. Draw each playback frame into a `<canvas>`.
3. Draw a HUD onto that canvas.
4. Record `canvas.captureStream(30)` with `MediaRecorder`.
5. Share or download the resulting blob.

That explains two major issues:

- `canvas.captureStream(...)` contains video only, so the exported file loses source audio.
- A fixed canvas capture clock can drift from decoded video frames, especially on mobile Safari under load.

## 3. Implementation Strategy

Keep the current lightweight browser export, but make it more honest and better synchronized.

### Step 1 - Frame pacing

- Prefer `canvas.captureStream(0)` when the browser exposes a canvas video track with `requestFrame()`.
- Call `requestFrame()` immediately after drawing each decoded video frame.
- Fall back to `canvas.captureStream(30)` on browsers without manual canvas frame requests.

This makes the export stream follow decoded video frames instead of a separate fixed 30 fps canvas timer.

### Step 2 - Audio preservation

- Try to obtain audio tracks from the hidden source video via Web Audio (`AudioContext.createMediaElementSource(...)` into `MediaStreamDestination`).
- Add those audio tracks to the canvas video stream before constructing `MediaRecorder`.
- Surface an export diagnostic when audio could not be preserved.

Limit: iOS Safari may not expose media-element capture streams. If it does not, browser-only overlay baking cannot reliably keep audio on that platform without a heavier mux/transcode path.

### Step 3 - HUD style parity

- Move baked-HUD layout constants closer to the dashboard/player HUD:
  - same top-left placement
  - same 62% width cap
  - same slate translucent background
  - same label/value/sub text proportions
- Keep portrait display mode as a separate follow-up if needed; this pass targets the current landscape export pipeline.

### Step 4 - iOS Photos path

- Prefer MP4 MIME types when `MediaRecorder.isTypeSupported(...)` says they are available.
- Sniff the final bytes and name the file extension from the real container.
- If iOS still cannot share to Photos, show a direct, accurate message explaining whether the blocker is non-MP4 output or Web Share file support.

Important: the web app cannot force iOS Photos to accept a WebM or mislabeled blob. The best browser-only path is producing a real MP4 on Safari and sharing a `File` with `type: 'video/mp4'` and `.mp4` extension.

## 4. Acceptance Criteria

- [x] Overlay export requests the same quality preset bitrate as the source/export resolution.
- [x] Manual canvas frame capture is used when supported.
- [x] Baked HUD visually matches the in-app dashboard/player HUD more closely.
- [x] Baked exports preserve audio when the browser exposes source audio tracks.
- [x] Export diagnostics say whether audio was preserved and what bitrate was requested/produced.
- [x] iOS receives a correctly typed `.mp4` file when Safari produces MP4.
- [x] If iOS Photos is unavailable, the user sees a specific reason instead of a generic failure.
- [x] `npm run check` passes.

## 4.1 Implemented Notes

- `canvas.captureStream(0)` + track `requestFrame()` is preferred when supported, with `captureStream(30)` fallback.
- Source audio is routed through `AudioContext.createMediaElementSource(...)` into a `MediaStreamDestination`, then added to the export stream when available.
- Export diagnostics now report requested/actual bitrate, audio preservation, and whether manual frame pacing was used.
- If iOS rejects `navigator.share(...)` after a long overlay bake because user activation expired, the prepared `File` is retained and the next Save to Photos tap shares it immediately.

## 5. Future Path If Browser Export Remains Weak

If baked exports still drop frames or lose audio on iOS Safari, move overlay export out of the critical browser path:

- Server-side ffmpeg transcode after upload, or
- Native iOS/Android export path using platform media APIs, or
- WebCodecs + muxer only if device tests prove it handles frame pacing and audio sync better than `MediaRecorder`.