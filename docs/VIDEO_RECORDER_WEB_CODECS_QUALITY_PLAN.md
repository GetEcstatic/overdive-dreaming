# Video Recorder WebCodecs Quality Review

> Date: 2026-05-03
> Scope: investigation and implementation plan only. No app code changed.

## 1. Direct Answer

The dynamic dive recorder is **not using WebCodecs** today.

It records video with the browser `MediaRecorder` API:

- [src/lib/capture/recorder.ts](../src/lib/capture/recorder.ts) wraps `new MediaRecorder(stream, ...)` and returns the final compressed `Blob`.
- [src/lib/components/DiveRecorder.svelte](../src/lib/components/DiveRecorder.svelte) acquires the camera stream, computes the requested bitrate, passes that bitrate into `createRecorder(...)`, and starts/stops the `MediaRecorder`.
- [src/lib/capture/cameraStream.ts](../src/lib/capture/cameraStream.ts) requests a camera stream with `getUserMedia(...)` at 720p or 1080p, 30 fps max.
- [src/lib/components/DiveVideoPlayer.svelte](../src/lib/components/DiveVideoPlayer.svelte) also uses `MediaRecorder` for burned-overlay export from `canvas.captureStream(30)`.

There are no `VideoEncoder`, `EncodedVideoChunk`, `VideoFrame`, `MediaStreamTrackProcessor`, `mp4-muxer`, or `webm-muxer` references in `src/`, and no WebCodecs muxing dependency in [package.json](../package.json).

## 2. Current Quality Controls

The current recording path already has a quality preset module:

- Default preset: `high`.
- 720p high: `8_000_000` bps.
- 1080p high: `16_000_000` bps.
- 720p max: `12_000_000` bps.
- 1080p max: `24_000_000` bps.

The app also stores useful diagnostics on save:

- `qualityPreset`
- `requestedVideoBitrateBps`
- `actualAverageBitrateBps`
- `actualFrameRate`
- `widthPx` / `heightPx`
- `mimeType`
- `sizeBytes`
- `durationSeconds`

Important limitation: `MediaRecorder.videoBitsPerSecond` is only a browser encoder hint. Safari/Chrome can clamp, vary, or ignore it under device load, heat, low light, codec limits, or memory pressure.

## 3. Likely Causes of Choppy or Soft Video

Given the current code, poor quality can come from several different layers:

1. **Camera source quality**: `getUserMedia` may deliver less than the ideal requested resolution, lower effective frame rate, noisy low-light footage, or a different lens than expected.
2. **Encoder behavior**: `MediaRecorder` may honor the requested average bitrate only loosely; instantaneous bitrate can dip during fast water/bubble motion.
3. **Device pressure**: mobile Safari/Chrome may drop frames if camera capture, H.264/VPx encode, UI rendering, wake lock, and IndexedDB/upload work compete on a hot device.
4. **Playback path**: apparent frame drops might be decode/playback stutter rather than capture-time loss, especially for larger 1080p files or overlay exports.
5. **Overlay export path**: burned-overlay export re-encodes through `canvas.captureStream(30)` plus `MediaRecorder` at `6_000_000` bps, which is lower than the current 720p high recording preset and likely too low for clean action footage.

## 4. Is WebCodecs A Good Idea?

WebCodecs is a good **future experiment**, but it should not be the first production replacement for the current recorder.

### Benefits

- Direct control over `VideoEncoder` configuration, bitrate, keyframe interval, and encoded chunks.
- Better frame accounting: we can count produced frames, dropped frames, encode queue pressure, and encode latency.
- Easier to build deterministic per-frame processing later, such as rotation, cropping, overlays, or frame timestamps.
- Avoids the `canvas.captureStream() + MediaRecorder` path for overlay/export experiments.

### Costs and risks

- WebCodecs does not directly give a finished `.mp4` or `.webm`; encoded chunks still need a muxer.
- MP4/H.264 output needs browser codec support plus an MP4 muxer dependency and careful timestamp handling.
- Safari/iOS support is the deciding risk for this app. Even where `VideoEncoder` exists, `MediaStreamTrackProcessor` and real-time camera frame access are less dependable than `MediaRecorder`.
- Audio has to be handled separately and muxed in sync with video. The current `MediaRecorder` path gets audio/video sync from the browser for free.
- A custom real-time encoder path is more code to maintain and can fail harder on lower-end phones.

### Recommendation

Do **not** replace the main save-path recorder with WebCodecs yet.

Instead:

1. First prove whether current bad clips are truly bitrate-limited, frame-drop-limited, camera-source-limited, or playback-limited using the metadata already being stored.
2. Raise the overlay export bitrate separately, because that path is clearly capped at `6 Mbps` today.
3. Add a developer-visible diagnostics surface for actual bitrate, resolution, frame rate, MIME, and file size.
4. Add an experimental WebCodecs recorder behind capability detection and a dev flag only after the current `MediaRecorder` path has been measured on real pool footage.

This gives the app a safer path: tune the simple recorder first, then use WebCodecs only if data shows `MediaRecorder` cannot produce acceptable source files on target devices.

## 5. Implementation Plan

### Phase 0 - Confirm The Current Baseline

- [ ] Record test clips on target devices using the current app.
- [ ] Include at least: iPhone Safari, Android Chrome, one lower-end Android, and desktop Chrome for comparison.
- [ ] Capture both `720p/high` and `1080p/high` where devices support it.
- [ ] For each clip, note `mimeType`, actual dimensions, actual frame rate, requested bitrate, actual average bitrate, file size, duration, device model, browser, and visible quality notes.
- [ ] Add the measured rows to [docs/dynamic-video-qa-checklist.md](dynamic-video-qa-checklist.md) or a dedicated results table.

### Phase 1 - Make Quality Diagnostics Visible

- [ ] Add a compact developer diagnostics section on the post-record review screen.
- [ ] Show actual resolution, actual frame rate, requested bitrate, actual average bitrate, MIME/container, file size, and duration.
- [ ] Flag suspicious captures, for example actual average bitrate under 70% of requested or frame rate below 24 fps.
- [ ] Keep this diagnostic UI unobtrusive and removable later.

### Phase 2 - Tune MediaRecorder Before Replacing It

- [ ] Add a quality selector using the existing `standard` / `high` / `max` presets.
- [ ] Default serious captures to `1080p/high` only if test devices can upload/play reliably.
- [ ] Offer `720p/max` for devices where 1080p is too heavy but 720p/high is too soft.
- [ ] Consider shortening `timesliceMs` only if evidence shows long chunks increase memory pressure; otherwise keep the current 2000 ms.
- [ ] Verify that IndexedDB queueing and upload progress stay reliable with larger files.

### Phase 3 - Fix Overlay Export Quality Separately

- [ ] Raise burned-overlay export bitrate from `6_000_000` bps to a value based on output resolution and quality preset.
- [ ] Reuse `bitrateForResolution(...)` where possible instead of hardcoding an export bitrate.
- [ ] Store or surface export diagnostics separately from original capture diagnostics.
- [ ] Confirm whether reported quality loss happens in original recordings, overlay exports, or both.

### Phase 4 - WebCodecs Spike Behind A Flag

- [ ] Add pure capability detection for `VideoEncoder`, supported H.264/VP9 configs, `VideoFrame`, and camera frame access strategy.
- [ ] Decide muxer strategy: MP4 for iOS/Photos compatibility, WebM only for Chrome experiments, or both.
- [ ] Build a minimal dev-only recorder path that records video-only first, without replacing `MediaRecorder`.
- [ ] Add frame counters: source frames received, frames encoded, encode queue depth, encode errors, dropped/late frames.
- [ ] Add a 10-20 second side-by-side test route or dev control so the same scene can be captured with MediaRecorder and WebCodecs.
- [ ] Only add audio after video-only quality and frame pacing are proven.

### Phase 5 - Decision Gate

- [ ] Keep `MediaRecorder` if tuned presets produce acceptable original recordings on iPhone Safari and Android Chrome.
- [ ] Use WebCodecs only for Chrome/Android if it materially improves quality and iOS remains acceptable on `MediaRecorder`.
- [ ] Consider native capture or server-side processing if iPhone Safari remains unacceptable, because iOS is the riskiest platform for a WebCodecs-only recorder.
	- Native capture is not possible from the current SvelteKit webapp by itself. It means adding a native iOS/Android app, or a native wrapper such as Capacitor, that can use platform camera APIs instead of browser `MediaRecorder`.
	- Server-side processing is possible with the current app architecture only after adding new backend infrastructure. The webapp can already upload an original file, but a server-side path would need a transcode worker or Cloud Function, storage access, job status fields, retry/error handling, and a way to attach the processed file back to the `DiveVideo` record.

## 6. Acceptance Criteria

- [ ] The app can identify whether poor quality came from original capture or overlay export.
- [ ] Real test recordings include requested and actual bitrate comparisons.
- [ ] `720p/high`, `720p/max`, and `1080p/high` have representative pool-footage samples.
- [ ] Overlay export no longer uses a fixed lower bitrate than the original capture path.
- [ ] WebCodecs is only introduced behind capability detection and does not replace `MediaRecorder` until target-device evidence supports it.

## 7. Bottom Line

The current app uses `MediaRecorder`, not WebCodecs. WebCodecs could eventually help with frame-level control and diagnostics, but it is not automatically a better production recorder for a mobile-first webapp because muxing, audio sync, and Safari/iOS support are real risks.

The strongest next move is to measure real clips with the metadata already present, tune `MediaRecorder` and overlay export bitrate first, then run a WebCodecs spike only if the measured source recordings still fail quality expectations.