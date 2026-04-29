# Portrait Video Recording - Copilot Alternative Plan

> Goal: evaluate portrait orientation recording for the dynamic dive recorder and propose an implementation path that avoids repeating the previous web-camera failures.
>
> Drafted: 2026-04-28. Scope: planning only. No app code changed.

---

## 1. Executive Recommendation

Do not make client-side ffmpeg.wasm transcoding the default save path for portrait recording.

My recommended v1 is a **two-artifact strategy**:

1. Keep a reliable **camera master** exactly as the browser records it.
2. Add a portrait-aware recorder mode that attempts **native portrait capture** only when the browser can prove it is producing portrait pixels.
3. When iOS cannot produce a true portrait source, that is **not a failed recording**. Upload the reliable landscape master, make it playable immediately, and generate a **portrait derivative** outside the critical recording flow, preferably server-side.

This differs from the existing Claude plan by moving heavy transcode work away from the poolside save path. The coach should not have to wait through a hot, battery-heavy wasm transcode after every recording. Recording reliability and timeline integrity matter more than immediately making the stored clean file portrait. If the browser returns landscape, the correct behavior is: save it, label it honestly, and produce or offer a portrait version as a follow-up artifact.

The implementation should first fix the current type/data drift, then add a small proof harness, then ship portrait as a capability with measured fallback behavior rather than assuming browser orientation APIs tell the truth.

---

## 2. Current Code Assessment

### Capture

- [src/lib/capture/cameraStream.ts](../src/lib/capture/cameraStream.ts) is deliberately landscape-first.
- `constraintsFor()` requests 16:9 frames: 1280x720 or 1920x1080.
- The file comments explicitly document the iOS `getSettings()` and `canvas.captureStream() + MediaRecorder` problems.
- `acquireCameraStream()` returns track settings, but those settings are not enough to prove the encoded file orientation on iOS.

### Recording

- [src/lib/capture/recorder.ts](../src/lib/capture/recorder.ts) is a clean `MediaRecorder` wrapper.
- It records the source stream verbatim and should stay that way.
- This is a strength: no orientation magic is hidden inside the recorder.

### Recorder UI/state

- [src/lib/capture/recorderState.ts](../src/lib/capture/recorderState.ts) stores `isLandscape` and accepts `orientation/changed` events.
- [src/lib/components/DiveRecorder.svelte](../src/lib/components/DiveRecorder.svelte) detects viewport landscape and shows `Rotate your phone to landscape to record.` when portrait.
- Capture start itself is not deeply entangled with orientation; the orientation gate is localized enough to generalize.

### Persistence

- [src/lib/types.ts](../src/lib/types.ts) defines:

  ```ts
  export type DiveVideoOrientation = 'portrait';
  export type DiveVideoAspectRatio = '9:16';
  ```

- [src/lib/services/diveVideos.ts](../src/lib/services/diveVideos.ts) writes:

  ```ts
  orientation: 'portrait',
  aspectRatio: '9:16',
  ```

- This is currently misleading because the active capture code records landscape. This metadata drift should be fixed before any portrait experiment, otherwise test results and existing videos are hard to trust.

### Playback

- [src/lib/components/DiveVideoPlayer.svelte](../src/lib/components/DiveVideoPlayer.svelte) and [src/lib/stores/videoPlayback.ts](../src/lib/stores/videoPlayback.ts) are landscape-oriented and already avoid native fullscreen so the DOM HUD survives on iOS.
- Playback can support portrait videos later, but playback should not drive the capture solution.

---

## 3. Problem Framing

There are three separate orientation concepts that the code should stop treating as one thing:

| Concept | Meaning | Source of truth |
|---|---|---|
| `captureIntent` | What the user/app asked for: portrait or landscape. | Recorder config |
| `sourceOrientation` | What the camera track appears to produce. | Track settings plus video metadata probe |
| `assetOrientation` | What the saved blob actually contains. | Decoding the recorded blob |
| `displayOrientation` | How the app should frame/play/export it. | Firestore metadata plus measured asset dimensions |

The previous attempts failed because they trusted the wrong layer. The preview could look portrait while the saved asset was still landscape. The next implementation should only call a clip `portrait` after the recorded blob has been decoded and measured.

---

## 4. Options Considered

### Option A - Native portrait `getUserMedia`

Request portrait constraints and record the source stream directly.

Pros:
- Smallest capture code.
- No post-processing.
- Best quality if the browser honors it.

Cons:
- Failed in previous attempts on iOS.
- Track settings and preview dimensions can lie or change during startup.
- Needs real-device blob validation, not just preview validation.

Verdict: worth supporting, but only behind measurement.

### Option B - Canvas rotation before `MediaRecorder`

Draw the camera into a portrait canvas, then record `canvas.captureStream()`.

Pros:
- Conceptually simple on browsers that really record the canvas.
- Allows overlays/rotation in one pass.

Cons:
- Specifically matches the known iOS WebKit failure mode.
- Preview correctness does not prove saved-file correctness.

Verdict: do not use for iOS capture orientation. Keep canvas for optional export/HUD workflows only after testing.

### Option C - Client ffmpeg.wasm after stop

Record landscape, transcode to portrait in the browser before upload/save.

Pros:
- Produces a real portrait file without relying on Safari camera behavior.
- Avoids the canvas proxy bug.

Cons:
- Heavy bundle and memory load.
- Slow and battery-intensive on exactly the devices coaches use.
- Bad poolside UX after every save.
- More failure modes: wasm fetch, cross-origin isolation, memory pressure, audio sync.

Verdict: useful as an optional export tool, not the default recording save path.

### Option D - Server-side portrait derivative

Upload the reliable master, then create a portrait derivative using server ffmpeg. Store both asset paths and mark processing state.

Pros:
- Keeps recording/save fast and reliable.
- Uses mature ffmpeg without mobile wasm constraints.
- Gives us both the original master and social portrait output.
- Failure is recoverable: master remains available.

Cons:
- Adds backend processing work.
- Requires queue/status UI.
- Costs compute/storage.

Verdict: best fallback when native portrait fails on iOS.

### Option E - Native camera capture input fallback

Use `<input type="file" accept="video/*" capture="environment">` so iOS opens the native camera.

Pros:
- Native camera app records portrait reliably.
- Very low web-camera risk.

Cons:
- The app is not visible while recording, so coach lap taps and live timeline capture are lost.
- Not a replacement for the dynamic recorder component.

Verdict: possible emergency clip-only fallback, not a solution for this feature.

---

## 5. Proposed Architecture

### 5.1 Keep `MediaRecorder` as a verbatim source recorder

Do not put orientation transforms inside [src/lib/capture/recorder.ts](../src/lib/capture/recorder.ts). It should continue to do one job: record the stream it receives.

### 5.2 Add explicit orientation metadata

Update the data model to represent reality:

```ts
export type DiveVideoOrientation = 'portrait' | 'landscape' | 'unknown';
export type DiveVideoAspectRatio = '9:16' | '16:9' | 'unknown';
export type DiveVideoRecordingMode =
  | 'landscape-master'
  | 'portrait-native'
  | 'portrait-derivative-pending'
  | 'portrait-derivative-ready'
  | 'portrait-derivative-unavailable';
```

Add fields to `DiveVideo`:

```ts
captureIntent: 'portrait' | 'landscape';
sourceOrientation?: 'portrait' | 'landscape' | 'unknown';
assetOrientation: DiveVideoOrientation;
aspectRatio: DiveVideoAspectRatio;
recordingMode: DiveVideoRecordingMode;
storagePathPortrait?: string;
portraitProcessingStatus?: 'not-needed' | 'queued' | 'processing' | 'ready' | 'unavailable' | 'failed';
portraitProcessingError?: string;
```

Backward compatibility:
- Treat missing `assetOrientation` as `landscape` for existing clips because current capture is landscape.
- Stop hardcoding `orientation: 'portrait'` in [src/lib/services/diveVideos.ts](../src/lib/services/diveVideos.ts).

### 5.3 Add a proof harness before changing production capture

Create a development-only or hidden route/component, for example:

- `src/routes/(app)/dev/video-orientation-probe/+page.svelte`, or
- a temporary recorder debug mode reachable only in local/dev builds.

The probe should record 3-5 second clips for each candidate mode:

1. Current landscape constraints.
2. Portrait constraints, source track direct to `MediaRecorder`.
3. Portrait constraints with exact/ideal width-height variants.
4. Optional canvas path only to verify whether the old iOS bug still reproduces.

For each sample, log:
- requested constraints,
- `track.getSettings()` at start and after first metadata,
- preview `videoWidth/videoHeight`,
- recorded blob MIME and size,
- decoded blob `videoWidth/videoHeight`,
- whether iOS Photos/Share sees it as portrait.

This is the key difference in my plan: **the recorded blob decides**.

### 5.4 Production capture decision

At runtime:

1. If `captureIntent === 'portrait'`, try native portrait constraints on devices known to pass the probe.
2. After recording, decode the blob in a hidden video element and measure the asset.
3. If the blob is portrait, save it as `portrait-native`.
4. If the blob is landscape on iOS, save it as `landscape-master`, mark portrait derivative as `queued` or `unavailable`, and keep the recording fully usable.
5. If backend processing is enabled, produce `storagePathPortrait` asynchronously.
6. If the derivative is unavailable or later processing fails, keep the master available and show a recoverable/export-later status. The recording itself is still successful.

This gives users a usable video immediately and a portrait share/export artifact when processing completes.

Landscape detection is therefore a **branch**, not an error. It tells the app which artifact pipeline to use.

---

## 6. File-by-File Plan

| File | Planned change |
|---|---|
| [src/lib/types.ts](../src/lib/types.ts) | Widen orientation/aspect-ratio types; add capture intent, asset orientation, recording mode, and portrait derivative fields. |
| [src/lib/services/diveVideos.ts](../src/lib/services/diveVideos.ts) | Stop hardcoding portrait metadata. Build metadata from measured blob dimensions. Add helper defaults for old records. Add optional `storagePathPortrait`. |
| [src/lib/capture/cameraStream.ts](../src/lib/capture/cameraStream.ts) | Add `captureIntent` or `orientation` option to constraints. Keep current landscape branch unchanged. Add portrait constraint branch, but do not add canvas rotation. |
| `src/lib/capture/videoAssetProbe.ts` (new) | Decode a `Blob` in a temporary `<video>` and return measured width, height, duration, orientation, and aspect ratio. This is a side-effect utility, not reducer logic. |
| [src/lib/capture/recorderState.ts](../src/lib/capture/recorderState.ts) | Rename `isLandscape` to `viewportOrientation`; add `captureIntent` to config; derive whether the current viewport matches the requested posture. |
| [src/lib/components/DiveRecorder.svelte](../src/lib/components/DiveRecorder.svelte) | Accept `captureIntent` prop. Gate recording based on desired posture. After stop, probe the recorded blob before calling `onCapture`. Include measured metadata in `CaptureResult`. |
| [src/lib/components/DiveVideoPlayer.svelte](../src/lib/components/DiveVideoPlayer.svelte) | Render based on `assetOrientation`; choose portrait derivative when available and appropriate. Keep master playable even if derivative is pending, unavailable, or failed. |
| [src/lib/stores/videoPlayback.ts](../src/lib/stores/videoPlayback.ts) | Generalize fullscreen decision from `isLandscape` to `desiredFullscreenOrientation` if portrait playback should auto-fullscreen in portrait. |
| `functions/src/portraitDerivative.ts` or equivalent | Add queued processor that reads clean master from Storage, runs ffmpeg crop/scale/rotate as needed, writes `portrait.mp4`, and updates Firestore status. |
| [docs/dynamic-video-qa-checklist.md](dynamic-video-qa-checklist.md) | Add orientation probe and portrait derivative test matrix. |

---

## 7. Server Derivative Shape

Use Cloud Functions v2 or Cloud Run, not a client save-blocking transcode.

Processing input:
- `diveVideos/{videoId}` with `portraitProcessingStatus: 'queued'`.
- `storagePathClean` points at the browser-recorded master.

Processing output:
- `users/{userId}/videos/{videoId}/portrait.mp4`.
- Firestore update:

```ts
{
  storagePathPortrait: 'users/.../portrait.mp4',
  portraitProcessingStatus: 'ready',
  recordingMode: 'portrait-derivative-ready',
  updatedAt: serverTimestamp()
}
```

Initial ffmpeg transform:

- If master is landscape and the coach held the phone upright, center crop to 9:16 and scale to 720x1280.
- If metadata indicates rotation tags rather than physical dimensions, normalize rotation first.
- Preserve audio with AAC output.

Example conceptual filter:

```bash
-vf "crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=720:1280"
```

Do not commit to the exact ffmpeg command until the probe produces real sample files from iOS and Android.

---

## 8. Implementation Phases

### Phase 0 - Metadata honesty

- [ ] T0. Widen orientation/aspect-ratio types in [src/lib/types.ts](../src/lib/types.ts).
- [ ] T1. Fix [src/lib/services/diveVideos.ts](../src/lib/services/diveVideos.ts) so it stores measured orientation rather than hardcoded portrait.
- [ ] T2. Treat existing records with missing/new fields as landscape masters.
- [ ] T3. Run `npm run check` after metadata changes.

### Phase 1 - Proof harness

- [ ] T4. Add `videoAssetProbe.ts` to decode recorded blobs and measure actual dimensions.
- [ ] T5. Add a dev-only orientation probe UI that records short test clips for each constraint strategy.
- [ ] T6. Test on iPhone Safari and Android Chrome; save results in a docs note or QA checklist.
- [ ] T7. Decide whether native portrait is trustworthy per platform based on decoded blob dimensions, not preview.

### Phase 2 - Portrait-native where proven

- [ ] T8. Add `captureIntent` to `CameraStreamOptions` and `RecorderConfig`.
- [ ] T9. Add portrait constraints in [src/lib/capture/cameraStream.ts](../src/lib/capture/cameraStream.ts).
- [ ] T10. Generalize recorder orientation state from `isLandscape` to `viewportOrientation`.
- [ ] T11. Update [src/lib/components/DiveRecorder.svelte](../src/lib/components/DiveRecorder.svelte) to support portrait posture prompts and blob probing after stop.

### Phase 3 - Portrait derivative fallback

- [ ] T12. Add Firestore fields for portrait derivative status/path.
- [ ] T13. Add backend processing path for queued portrait derivatives.
- [ ] T14. Add UI states: portrait processing queued, ready, unavailable, failed, retry.
- [ ] T15. Keep the landscape master playable and downloadable at all times.

### Phase 4 - Playback and export polish

- [ ] T16. Teach [src/lib/components/DiveVideoPlayer.svelte](../src/lib/components/DiveVideoPlayer.svelte) to prefer `storagePathPortrait` for portrait display/export when ready.
- [ ] T17. Preserve clean-master playback for analysis if the portrait derivative is cropped too tightly.
- [ ] T18. Add explicit Download master / Download portrait actions if both exist.

### Phase 5 - QA and decision cleanup

- [ ] T19. Add portrait recording rows to [docs/dynamic-video-qa-checklist.md](dynamic-video-qa-checklist.md).
- [ ] T20. Verify iPhone Safari, Pixel Chrome, and desktop Chrome.
- [ ] T21. Verify audio sync, thumbnail generation, upload retries, retention cleanup, and player behavior.
- [ ] T22. Remove temporary probe UI once production behavior is decided, or keep it behind a dev flag.

---

## 9. Acceptance Criteria

- [ ] Current landscape recording remains reliable and honestly labeled as landscape.
- [ ] The app can prove a recorded blob's orientation by decoding it, not by trusting `getSettings()`.
- [ ] On Android Chrome, portrait-native recording saves a true 9:16 asset if the probe confirms support.
- [ ] On iPhone Safari, if native portrait is not available, the master still saves immediately and portrait processing is queued or marked unavailable instead of blocking the save path.
- [ ] A user can play the master while portrait processing is pending, unavailable, or failed.
- [ ] When processing completes, the app can play/share the portrait derivative.
- [ ] Landscape detection and failed portrait processing do not lose or invalidate the original video.
- [ ] Existing videos continue to play.
- [ ] `npm run check` passes after implementation.

---

## 10. Main Risks

1. **Server processing cost and setup.** This adds backend work, but it avoids pushing heavy CPU onto phones during poolside save.
2. **Cropping may lose the diver.** A landscape master cropped to 9:16 only works if the coach keeps the diver centered. The recorder UI should show a portrait safe-area guide when recording a landscape master intended for portrait derivative.
3. **Native portrait may differ by device/browser.** That is why the probe and platform capability table come before production behavior.
4. **Firestore migration complexity.** Orientation fields need backward-compatible readers.
5. **Processing delay.** Users may expect immediate portrait download. The UI should say when the portrait version is preparing while keeping the master available.

---

## 11. Why This Plan Is Different

The existing plan leans toward lazy-loaded ffmpeg.wasm on iOS as the save-path fallback. I would not start there.

For this feature, the highest-value invariant is: **when the coach stops recording, the app must quickly preserve the dive and timeline**. Anything slow, hot, memory-heavy, or crash-prone should happen after the master is safe.

So this plan treats portrait output as either:

- native, when proven by the recorded blob, or
- a derivative generated after the master is uploaded.

That gives us a better failure mode: no matter what Safari does, the user does not lose the dive.
