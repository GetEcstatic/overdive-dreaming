# Portrait Video Recording — Evaluation & Implementation Plan

> **Goal:** Re-enable **portrait (9:16)** orientation for the in-app dive video
> recorder so coaches can film one-handed and produce Instagram-Stories /
> Reels-shaped clips, **without** falling back into the iOS WebKit pitfalls
> that forced the previous landscape-only pivot.
>
> Drafted: 2026-04-28. Author: planning pass (no code changes yet).

---

## 1. Background — Why We Are Currently Landscape-Only

The original product spec (see `docs/Dynamic video feature.md` §3.1) called
for **portrait (9:16)** capture to match social-media use and one-handed
operation. Three successive attempts to deliver that have been reverted in
the git history:

| Commit | Date | Approach | Outcome |
|---|---|---|---|
| `0ec5e6f` | 2026-04-22 | Native portrait via `getUserMedia` constraints + `aspectRatio: 9/16`. `ensurePortraitStream` wrapped landscape sources in a `canvas.captureStream()` rotation pipeline as a fallback. | Worked on Android Chrome. iOS Safari saved files in landscape anyway. |
| `ea29517` | 2026-04-22 | **Always** route capture through the canvas rotation pipeline (don't trust `getSettings()` / `videoWidth`-`videoHeight` up-front because they lie on iOS for ~1 frame and can flip mid-stream). Per-frame decision: draw straight or rotate 90° CW so the canvas output is guaranteed portrait. | iOS WebKit silently proxies the **source track** through `canvas.captureStream() + MediaRecorder`. The canvas was portrait; the saved MP4 was still the source's landscape track. Confirmed Apple bug. |
| `2355e42` | 2026-04-22 | Give up on portrait. Request `16:9` landscape from `getUserMedia`, drop the canvas pipeline, prompt the user to physically rotate the phone. Player + recorder both landscape. | Current state. Reliable, but not the desired UX. |

**Root cause of the previous failures (well-documented):**

> iOS Safari (≤ 17.x) does **not** re-encode the bitmap painted onto a
> `<canvas>` when you feed `canvas.captureStream()` into a `MediaRecorder`
> and the canvas's only video source is a `<video>` element bound to a
> `MediaStreamTrack` from `getUserMedia()`. WebKit "optimises" by
> short-circuiting the pipeline back to the original camera track, so any
> rotation, scaling, or overlay drawing on the canvas is **discarded** in
> the output file. The on-screen preview looks correct; the saved MP4 does
> not.

This is the headline blocker. Any new portrait plan must either:

1. **Avoid `canvas.captureStream() + MediaRecorder` for rotation on iOS**, OR
2. **Force iOS to honour real portrait constraints on the source track** so
   no rotation is needed, OR
3. **Re-encode after recording** (post-process the landscape blob into
   portrait), OR
4. **Crop the landscape frame at playback / export time** and present a
   portrait-shaped 9:16 viewport in-app, while leaving the underlying file
   landscape.

§4 evaluates these options.

---

## 2. Current Recorder Architecture (What We're Working With)

Data-oriented design — preserved from `docs/DYNAMIC_RECORDER_UX_PLAN.md`.

### 2.1 Pure layer

- [src/lib/capture/recorderState.ts](../src/lib/capture/recorderState.ts) — state machine. Holds `isLandscape: boolean` and `orientation/changed` event. `initialRecorderState` defaults `isLandscape: true`.
- [src/lib/capture/recorderSelectors.ts](../src/lib/capture/recorderSelectors.ts) — pure selectors (distance, speed, button layout).
- [src/lib/capture/timeline.ts](../src/lib/capture/timeline.ts) — `DiveTimeline` math.
- [src/lib/capture/recorderState.test.ts](../src/lib/capture/recorderState.test.ts) — covers `orientation/changed`.

### 2.2 Side-effect shells

- [src/lib/capture/cameraStream.ts](../src/lib/capture/cameraStream.ts) — `acquireCameraStream`, `constraintsFor`, `stopStream`. **Hardcoded landscape**: `width > height`, `aspectRatio: 16/9`, comment block explicitly documents the iOS canvas-pipeline bug.
- [src/lib/capture/recorder.ts](../src/lib/capture/recorder.ts) — `MediaRecorder` wrapper. Picks MIME type. **No rotation logic.**
- [src/lib/capture/cameraDevices.ts](../src/lib/capture/cameraDevices.ts) — lens / device enumeration.
- [src/lib/components/DiveRecorder.svelte](../src/lib/components/DiveRecorder.svelte) — thin view. Detects orientation via `window.innerWidth >= innerHeight` on mount + `resize` + `orientationchange`. Shows a "Rotate to landscape" overlay (line 572) while portrait. Recording is gated until landscape.

### 2.3 Data model implications

- [src/lib/types.ts](../src/lib/types.ts#L904) — `DiveVideoOrientation = 'portrait'` (string-literal type still says **portrait**, but written values are `'landscape'`. This is a stale relic from the first portrait attempt and is technically a type-vs-data drift today.) Worth fixing alongside this work.
- [src/lib/services/diveVideos.ts](../src/lib/services/diveVideos.ts#L338) — writes `orientation: 'portrait'` literal when persisting (also stale). Some callers may be inconsistent.

### 2.4 Playback

- [src/lib/components/DiveVideoPlayer.svelte](../src/lib/components/DiveVideoPlayer.svelte) — landscape-first; pseudo-fullscreen on rotation; `object-fit: cover/contain` toggle. See `docs/LANDSCAPE_VIDEO_PLAYBACK_PLAN.md` for the dedicated playback plan.

---

## 3. Constraints & Non-Goals

**Hard constraints**
- Must work on **iOS Safari 17+** (primary platform — coaches use iPhones).
- Must work on **Android Chrome current**.
- Must not regress: lens selection, audio capture, wake-lock, resumable upload, timeline accuracy, MediaRecorder MIME negotiation.
- Must keep recorder pure-state architecture intact (no logic in the Svelte view).

**Soft constraints**
- Avoid heavyweight in-browser transcode on the critical path (ffmpeg.wasm is ~25 MB and ~5–10× realtime on iPhone — fine for an explicit "Export" button, **not** fine for save).
- File size budget unchanged: 720p ≈ 22 MB/min, 1080p ≈ 37 MB/min.

**Non-goals (this round)**
- Live HUD burn-in into the saved file. (Out of scope per `Dynamic video feature.md` §5: option D — overlay rendered at playback / on demand.)
- iPad multitasking edge cases.
- Removing the existing landscape code path. (Keep both — see §6.)

---

## 4. Option Evaluation

### Option A — Force portrait `getUserMedia` constraints + trust the track

**What:** Request `width: { ideal: 720 }, height: { ideal: 1280 }, aspectRatio: { ideal: 9/16 }`, drop any canvas rotation, and pass the source track straight to `MediaRecorder`.

| Pros | Cons |
|---|---|
| Simplest possible code. | iOS Safari frequently ignores portrait constraints and returns landscape. |
| No transcode, no canvas. | The `getSettings()` lie means we can't reliably detect what we got. |
| Native sensor orientation. | Empirically failed in commit `0ec5e6f`. |

**Verdict:** Not sufficient on its own — but **it is now 6 months later** (last attempt April 2026, today April 2026 too — actually the same week). We should still **re-test on current iOS** before assuming it still fails, because Apple has been quietly improving WebRTC. ⚠ low-cost re-validation step.

### Option B — Capture landscape, post-process to portrait via `ffmpeg.wasm`

**What:** Record landscape as today. On `Save`, run an ffmpeg.wasm pass to crop+rotate to a 9:16 portrait MP4. Persist the portrait file.

| Pros | Cons |
|---|---|
| Avoids the iOS canvas-stream proxy bug entirely. | ffmpeg.wasm bundle ~25 MB. |
| Output file is correct portrait MP4 — works in Photos / Instagram. | Transcode time on iPhone 12: ~30 s for a 1-minute clip. UX must show progress. |
| Well-trodden path. Lots of community examples. | Re-encode loses quality; bitrate budget must rise. |

**Verdict:** Strong candidate for the **export pipeline**. Already partially planned in `docs/Dynamic video feature.md` §5 (option D, phase 1.5). Could be promoted to the **default save path** if we want portrait files at rest.

### Option C — Capture landscape, present portrait at playback (CSS crop)

**What:** Keep landscape capture as today. At playback time, the in-app player wraps the `<video>` in a 9:16 container with `object-fit: cover` and a `transform` that crops the 16:9 frame to a 9:16 viewport. The *file* stays landscape; the *user experience* is portrait. Optional "Export portrait" button for sharing externally (then runs option B on demand).

| Pros | Cons |
|---|---|
| **Zero changes to capture pipeline.** Avoids the iOS bug by not touching it. | Saved file is still landscape — surprises users who download to Photos. |
| Fast to ship (mostly UI). | Cropping a 1280×720 source to 9:16 yields 405×720 — losing a lot of horizontal detail; or the user records "wide" and we throw away the sides. |
| Composes with the existing `LANDSCAPE_VIDEO_PLAYBACK_PLAN.md`. | Coach has to be careful to keep the diver in the centre 22 % of the frame. |

**Verdict:** Not actually portrait — it's "fake portrait". Useful as a stop-gap if portrait-on-iOS truly is impossible, but should not be the headline implementation.

### Option D — `WebCodecs` (`VideoEncoder`/`VideoFrame`) bypass of `MediaRecorder`

**What:** Read frames from the source track via `MediaStreamTrackProcessor` (Chrome only currently) or a hidden `<video>` + `requestVideoFrameCallback`, build rotated `VideoFrame`s, encode them via `VideoEncoder` into H.264 chunks, and mux to MP4 with `mp4-muxer` (or similar). This sidesteps the iOS proxy bug because we never use `canvas.captureStream() + MediaRecorder`.

| Pros | Cons |
|---|---|
| Clean per-frame control over orientation. | iOS Safari does not yet ship `MediaStreamTrackProcessor` reliably (Safari 17.4 has partial support; coverage is patchy). |
| No re-encode on save. | More code to maintain than `MediaRecorder`. |
| Works today on Android Chrome and desktop Chrome. | Requires a JS muxer for MP4 (extra ~50 KB dep). |

**Verdict:** Future-proof, but not reliable enough on iOS today. Worth keeping on the roadmap; **not** the v1 path.

### Option E — Native portrait constraints **plus** a server-side / Cloud-Function transcode fallback

**What:** Try Option A first; if `getSettings()` says we got landscape on a device that should have given portrait, mark the upload `needsTranscode: true`. A Cloud Function takes the landscape file from Storage and re-encodes to portrait, then updates the `DiveVideo` doc.

| Pros | Cons |
|---|---|
| User sees portrait regardless of device quirks. | Server-side ffmpeg costs (Cloud Functions billed by GB-s). |
| No client-side transcode latency. | Requires Functions infra / IAM / lifecycle. |
| Aligns with retention-reaper Cloud Function pattern already in repo (`functions/lib/retentionReaper.js`). | Adds asynchronicity — file is "pending portrait" for 30–60 s after save. |

**Verdict:** Operationally clean, but introduces backend complexity. Best as a **fallback**, not a default.

---

## 5. Recommended Strategy (v1)

A **layered** approach that pessimistically assumes iOS will keep misbehaving but cheaply benefits when it doesn't:

1. **Re-validate Option A on current iOS** (cheap: one-day spike). If portrait constraints now stick on iOS Safari ≥ 17.5, that's the implementation.

2. **If A still fails on iOS:** Use **Option B** as the save-path transcode for iOS only.
   - Capture in **landscape natively** (preserve current reliability).
   - On `Stop` / before upload, run `ffmpeg.wasm` (lazy-loaded) to crop+rotate to portrait 9:16.
   - Upload the portrait file.
   - Lazy-load ffmpeg.wasm only when needed (don't bloat first paint).
   - Show a "Processing video…" progress UI on the save-confirmation modal.

3. **Android Chrome / desktop:** Use **Option A** unconditionally — native portrait constraints work reliably outside Safari.

4. **Playback** (see existing `LANDSCAPE_VIDEO_PLAYBACK_PLAN.md`): the player already does orientation-aware fullscreen. Make `DiveVideoPlayer` portrait-aware: if `DiveVideo.orientation === 'portrait'`, use a 9:16 container and skip the rotation-prompt.

5. **Keep the landscape path as a feature flag** for at least one release so we can ship-and-revert if Option B has unexpected device issues.

---

## 6. Data Model

### 6.1 Resolve the existing type/data drift

- [src/lib/types.ts](../src/lib/types.ts#L904) currently declares `DiveVideoOrientation = 'portrait'` even though all current writes are landscape. Widen this:

  ```ts
  export type DiveVideoOrientation = 'portrait' | 'landscape';
  ```

- Update `DiveVideo` to require `orientation` and a matching `aspectRatio`:

  ```ts
  orientation: DiveVideoOrientation;            // 'portrait' | 'landscape'
  aspectRatio: '9:16' | '16:9';
  ```

- Add a feature flag at the user-settings level (or at `DiveVideo`-creation time) so we can toggle portrait capture on/off per environment without redeploying code:

  ```ts
  // sessions/{sessionId}/videos/{videoId}
  recordingMode: 'portrait-native' | 'portrait-transcoded' | 'landscape';
  ```

  This is **diagnostic metadata**, not a UX dial — it lets us see in Firestore which path each video took. Cheap, valuable for triage.

### 6.2 Backwards compatibility

- All existing videos are landscape. Treat missing `orientation` as `'landscape'` in readers ([src/lib/services/diveVideos.ts](../src/lib/services/diveVideos.ts)).
- The fix to the literal `orientation: 'portrait'` write in `diveVideos.ts` line 338 must be a real branch (use the captured value), not a hardcoded constant.

---

## 7. Side-Effect Shell Changes

| Layer | File | Change |
|---|---|---|
| Capture constraints | [src/lib/capture/cameraStream.ts](../src/lib/capture/cameraStream.ts) | Add `orientation: 'portrait' \| 'landscape'` to `CameraStreamOptions`. `constraintsFor()` flips the frame to `width: 720 / height: 1280` and `aspectRatio: 9/16` when portrait. Keep the landscape branch unchanged. Update the doc comment header. |
| Track inspection | same | Add `detectActualOrientation(track: MediaStreamTrack): 'portrait' \| 'landscape' \| 'unknown'` using `getSettings().width / height` plus a fallback that reads `<video>.videoWidth/Height` after the first `loadedmetadata` event (more reliable on iOS). Pure, side-effect-free. |
| Recorder | [src/lib/capture/recorder.ts](../src/lib/capture/recorder.ts) | **No changes.** MediaRecorder still records the source track verbatim. |
| Post-process | new: `src/lib/capture/portraitTranscode.ts` | `transcodeLandscapeToPortrait(blob: Blob): Promise<{ blob, mimeType, widthPx, heightPx }>` — lazy `import('@ffmpeg/ffmpeg')`. Crop centre 9:16 from the 16:9 source (`crop=ih*9/16:ih`). Returns portrait MP4. Must be called from a UI side-effect, never from the reducer. |
| Recorder view | [src/lib/components/DiveRecorder.svelte](../src/lib/components/DiveRecorder.svelte) | Read `orientation` from props (default `'portrait'`). Use it when calling `acquireCameraStream`. Replace "Rotate to landscape" overlay with "Hold phone upright" when `orientation === 'portrait'`. After `Stop`, if running on iOS and the track came back landscape, run the transcode helper before resolving `onCapture`. |
| Service | [src/lib/services/diveVideos.ts](../src/lib/services/diveVideos.ts) | Replace the hardcoded `orientation: 'portrait'` literal with the real captured value. Persist `recordingMode` and `aspectRatio`. |
| Player | [src/lib/components/DiveVideoPlayer.svelte](../src/lib/components/DiveVideoPlayer.svelte) | Read `orientation` from the `DiveVideo`. For portrait videos: 9:16 inline container (`aspect-[9/16]`), skip the "rotate to landscape" prompt, keep fullscreen on portrait rotation rather than landscape. |

---

## 8. Pure-State Changes

The reducer in `recorderState.ts` already has `isLandscape` + `orientation/changed`. Generalise:

```ts
// Before
isLandscape: boolean;
| { type: 'orientation/changed'; isLandscape: boolean }

// After
viewportOrientation: 'portrait' | 'landscape';
| { type: 'orientation/changed'; viewportOrientation: 'portrait' | 'landscape' }
```

A new pure selector:

```ts
// Returns whether the device is in the orientation expected by the current
// capture mode. The view uses this to decide whether to show the "rotate"
// overlay.
export function isCorrectOrientation(state: RecorderState): boolean {
  const want = state.config.captureOrientation;       // new RecorderConfig field
  return state.viewportOrientation === want;
}
```

`RecorderConfig` adds `captureOrientation: 'portrait' | 'landscape'` (default `'portrait'`).

Tests updated in `recorderState.test.ts`.

---

## 9. UI Surface Changes

### Recorder
- Default capture orientation: **portrait**.
- Replace the "Rotate to landscape" overlay text with "Hold your phone upright" when capture is portrait. Same iconography, mirrored.
- Camera preview keeps `object-fit: cover` so the preview matches the saved aspect ratio.
- HUD layout adapts: in portrait, time/distance stack vertically along the top safe-zone; tap-lap button anchors to the bottom safe-zone.

### Save modal
- New optional row: "Processing portrait video…" with an indeterminate progress bar while the transcode runs (only visible on iOS / when transcode happens). Time-out after 90 s and fall back to keeping the landscape file with a toast.

### Player
- Portrait videos: 9:16 inline container, no rotate-prompt, fullscreen on portrait fullscreen rather than landscape (a one-line predicate flip in `videoPlayback.ts`).

---

## 10. Implementation TODO Checklist

### Phase 0 — Spike
- [ ] **T0** Re-test Option A on current iOS Safari (latest stable, beta if accessible). Record what `getSettings()` returns and whether the saved file is actually portrait. Result determines whether we can skip the transcode for iOS.

### Phase 1 — Capture path
- [ ] **T1** Generalise `recorderState.ts`: rename `isLandscape` → `viewportOrientation`, update events, add `RecorderConfig.captureOrientation`. Update `recorderState.test.ts`.
- [ ] **T2** Update `cameraStream.ts`: parameterise `constraintsFor()` on orientation; add `detectActualOrientation()`; tests in `cameraDevices.test.ts` style (or new `cameraStream.test.ts`).
- [ ] **T3** Update `DiveRecorder.svelte`: pass orientation to `acquireCameraStream`; swap the rotate overlay copy; portrait HUD layout.

### Phase 2 — Post-process safety net (iOS)
- [ ] **T4** Add `portraitTranscode.ts` with lazy ffmpeg.wasm import. Pure outside, side-effects only inside `transcodeLandscapeToPortrait`.
- [ ] **T5** In `DiveRecorder` `Stop` flow, detect `actual === 'landscape' && wanted === 'portrait'` and route through transcode before invoking `onCapture`. Surface progress to the save modal via a callback prop.
- [ ] **T6** Lazy-load: ensure ffmpeg.wasm bundle is **not** in the main chunk. Verify with `npm run build` chunk analysis.

### Phase 3 — Persistence & playback
- [ ] **T7** Widen `DiveVideoOrientation` type, add `recordingMode`, fix the hardcoded `'portrait'` literal in `diveVideos.ts`. Treat missing `orientation` as `'landscape'` in readers.
- [ ] **T8** Update `DiveVideoPlayer.svelte` to render portrait videos with a 9:16 container and to swap the orientation gate in `videoPlayback.ts` for portrait videos (`isPortrait` instead of `isLandscape` for fullscreen-promotion).
- [ ] **T9** Backfill: confirm existing landscape clips still play and download correctly.

### Phase 4 — QA
- [ ] **T10** Add a row to `docs/dynamic-video-qa-checklist.md` for portrait recording (iPhone 14/15, Pixel, iPad, desktop).
- [ ] **T11** Verify upload size budget; confirm `RetentionReaper` still applies (`functions/lib/retentionReaper.js`).
- [ ] **T12** Verify lens selector still works (`docs/CAMERA_LENS_SELECTION_PLAN.md`) — orientation should be orthogonal to deviceId selection.

### Phase 5 — Cleanup
- [ ] **T13** Remove the landscape-only feature flag once Phase 1–3 are stable for one release.
- [ ] **T14** Update `docs/Dynamic video feature.md` to mark portrait orientation **delivered** instead of "decided 2026-04-21 (later reverted)".

---

## 11. Risks & Open Questions

1. **iOS canvas-proxy bug status.** Has WebKit fixed it in 17.5/18? T0 will tell us. If yes, we can drop the transcode path entirely.
2. **ffmpeg.wasm bundle.** ~25 MB. Acceptable as a lazy chunk, **not** acceptable in the main JS. Must be code-split + cached aggressively.
3. **Battery / heat on iPhone during transcode.** A 60 s clip may take 15–30 s to transcode, hot. Show progress; keep wake-lock alive while transcoding.
4. **Audio sync after transcode.** ffmpeg's `-c:a copy` is the fast path; verify A/V sync survives the rotation.
5. **Existing data type drift.** Today `DiveVideoOrientation = 'portrait'` but written values are `'landscape'`. T7 must be done **carefully** so existing reads don't crash.
6. **Should the transcode also burn in the HUD overlay?** No — keep that as a separate user action per `Dynamic video feature.md` §5 option D. Portrait correction and overlay burn-in are independent concerns.

**Questions for Tom (resolve before T1):**
- ❓ Should the Phase 2 transcode be **default-on for iOS** or hidden behind a setting initially? (Recommend default-on once T0 confirms the bug still exists.)
- ❓ If portrait transcode fails (e.g. ffmpeg.wasm crashes mid-clip), do we save the landscape file and surface a toast, or block the save? (Recommend save-with-toast.)
- ❓ Should we require the user to be in portrait orientation **before** allowing record-start, mirroring the current "rotate to landscape" gate? (Recommend yes — keeps preview WYSIWYG.)

---

## 12. Acceptance Criteria

- [ ] iPhone 14/15 Safari: hit Record in portrait → preview is portrait, saved MP4 in Photos is portrait 9:16, plays correctly in Instagram Stories.
- [ ] Pixel Chrome: same.
- [ ] Desktop Chrome devtools (mobile emulation): same.
- [ ] Existing landscape videos continue to play with the old `LANDSCAPE_VIDEO_PLAYBACK_PLAN` behavior unchanged.
- [ ] No regression in lens selection, audio, wake-lock, retention, or `recorderState` test suite.
- [ ] Main JS bundle does not grow by more than 5 KB; ffmpeg.wasm only loads on the recorder route after Stop, only on iOS.
- [ ] `npm run check` passes.
