# Webapp Orientation Metadata Strategy Plan

> Goal: keep webapp video recording reliable while making in-app playback and overlays orientation-aware.
>
> Drafted: 2026-04-28. Scope: planning only. No app code changed.

---

## 1. Recommendation

Yes, this is worth doing now in the webapp, but only in the **metadata/playback** direction.

Do **not** try to make the webapp produce guaranteed portrait files as part of the recording save path. That is where iOS Safari and `MediaRecorder` become fragile.

Instead:

1. Keep the current reliable camera capture path.
2. Store how the phone was held and which edge should be treated as "up".
3. Use that metadata to render the video and overlay correctly inside Overdive.
4. Add optional portrait export later, explicitly user-triggered, for sharing outside the app.

This is the right middle ground: it improves the user experience now, costs much less than fighting browser encoding, and most of the data model survives a future native app.

---

## 2. Core Idea

A recorded video has two things:

- **Pixels**: what `MediaRecorder` actually wrote.
- **Interpretation**: which direction should be considered up, where the diver is expected to travel, and where the HUD belongs.

The webapp should stop trying to force the pixels into a different orientation at capture time. It should record reliably and store interpretation metadata next to the video.

For Overdive playback, that is enough. We own the player, the HUD, and the timeline rendering.

For external apps like Photos, Instagram, and WhatsApp, metadata in Firestore is not enough. Those apps only see the video file. That is why portrait export remains a separate later step.

---

## 3. Is It Worth Taking This Direction Now?

Yes, because the effort is modest and the risk is low.

### Worth doing now

- Fixes misleading metadata: current code stores `orientation: 'portrait'` while capture is landscape.
- Lets Overdive display videos in the orientation the coach intended.
- Lets HUD placement follow phone posture rather than encoded file shape.
- Avoids the iOS `canvas.captureStream() + MediaRecorder` trap.
- Avoids ffmpeg.wasm on the critical save path.
- Creates data concepts that native apps will also need later.

### Not worth doing now

- Guaranteed portrait MP4 output during save.
- Automatic post-recording transcode on iPhone.
- Canvas rotation before recording.
- WebCodecs replacement recorder.
- Server transcode infrastructure unless external portrait sharing becomes urgent.

### Bottom line

Implement orientation metadata and orientation-aware Overdive playback now. Park true portrait file generation for native app work or an explicit export feature.

---

## 4. User Experience

### Recording

The recorder remains reliable and simple:

- Camera capture continues using the current stable stream constraints.
- The app records the phone posture at record start.
- The coach can record in the posture the app supports today, with future support for selecting intended display orientation.
- Optional visual guide: show a 9:16 safe-area frame over the preview when the user wants a portrait-style output later.

No critical-path transcode. No hidden "processing for 30 seconds" after every dive.

### Playback inside Overdive

The player reads orientation metadata and presents the video in the intended coordinate system:

- If `displayOrientation` is landscape, render as today.
- If `displayOrientation` is portrait-left or portrait-right, rotate/frame the video in a portrait viewport.
- HUD overlay positions are relative to display orientation, not raw video dimensions.
- Timeline math remains unchanged because time offsets do not care about orientation.

### Export outside Overdive

Export is a separate action:

- "Download original" gives the raw recorded file.
- "Export portrait" can be added later as an explicit operation.
- The user accepts waiting for export because they asked for it.

---

## 5. Data Model

Replace the current portrait-only model with explicit capture and display metadata.

```ts
export type DiveVideoOrientation = 'landscape' | 'portrait';
export type DiveVideoRotation = 0 | 90 | 180 | 270;
export type DiveVideoDisplayOrientation =
  | 'landscape'
  | 'portrait-left'
  | 'portrait-right';
export type DiveVideoAspectRatio = '16:9' | '9:16' | 'unknown';
```

Add or normalize these fields on `DiveVideo`:

```ts
// What the recorded file physically appears to be.
assetOrientation: DiveVideoOrientation;
assetRotationDeg: DiveVideoRotation;
assetAspectRatio: DiveVideoAspectRatio;

// What Overdive should treat as up when displaying the clip.
displayOrientation: DiveVideoDisplayOrientation;
displayRotationDeg: DiveVideoRotation;
displayAspectRatio: DiveVideoAspectRatio;

// What the user intended at capture time.
capturePosture: 'phone-landscape-left' | 'phone-landscape-right' | 'phone-portrait-upright' | 'phone-portrait-upside-down' | 'unknown';
```

Backward compatibility:

- Treat existing videos as landscape display unless better metadata exists.
- Stop hardcoding `orientation: 'portrait'` in `buildDiveVideoFormData`.
- Keep old `orientation` temporarily if needed, but derive it from the new fields until it can be removed.

---

## 6. Implementation Phases

### Phase 0 - Metadata honesty

- [ ] T0. Widen `DiveVideoOrientation` and `DiveVideoAspectRatio` in [src/lib/types.ts](../src/lib/types.ts).
- [ ] T1. Add display/capture metadata fields to `DiveVideo`.
- [ ] T2. Update [src/lib/services/diveVideos.ts](../src/lib/services/diveVideos.ts) so new videos are not hardcoded as portrait.
- [ ] T3. Add reader defaults so existing clips behave as landscape.
- [ ] T4. Run `npm run check`.

### Phase 1 - Capture posture metadata

- [ ] T5. Add a small pure helper: `viewportPostureFromWindow()` or equivalent adapter output.
- [ ] T6. At record start, store the phone posture and intended display orientation in the capture result.
- [ ] T7. Include posture/display fields in `buildDiveVideoFormData`.
- [ ] T8. Add tests for orientation mapping where pure helpers exist.

### Phase 2 - Orientation-aware player

- [ ] T9. Add a display transform helper: raw asset dimensions + display metadata -> CSS transform, viewport aspect ratio, HUD coordinate mode.
- [ ] T10. Update [src/lib/components/DiveVideoPlayer.svelte](../src/lib/components/DiveVideoPlayer.svelte) to use display metadata.
- [ ] T11. Keep the current landscape behavior as the default path.
- [ ] T12. Add portrait display mode for clips whose metadata requests it.

### Phase 3 - Overlay coordinate system

- [ ] T13. Define HUD anchor zones in display coordinates, not raw video coordinates.
- [ ] T14. Ensure time/distance/speed overlays use the same timeline data regardless of display orientation.
- [ ] T15. Verify fullscreen behavior does not fight the chosen display orientation.

### Phase 4 - Optional safe-area guide

- [ ] T16. Add a portrait safe-area guide overlay in the recorder when the user wants portrait-style review/export later.
- [ ] T17. Keep this as a framing guide only; do not change the captured file.

### Phase 5 - Optional export later

- [ ] T18. Add "Export portrait" only if external sharing becomes important before native app work.
- [ ] T19. Run ffmpeg.wasm or server transcode only from that explicit export action.
- [ ] T20. Keep export errors isolated from the saved original.

---

## 7. File-by-File Plan

| File | Change |
|---|---|
| [src/lib/types.ts](../src/lib/types.ts) | Add asset/display/capture orientation fields and widen current orientation/aspect ratio types. |
| [src/lib/services/diveVideos.ts](../src/lib/services/diveVideos.ts) | Stop hardcoding portrait metadata; add defaults for old clips; pass through display metadata from capture. |
| [src/lib/components/DiveRecorder.svelte](../src/lib/components/DiveRecorder.svelte) | Capture phone posture and intended display orientation at recording start; optionally show a portrait safe-area guide. |
| `src/lib/capture/orientation.ts` (new) | Pure helpers for posture/orientation mapping and display transform decisions. |
| [src/lib/components/DiveVideoPlayer.svelte](../src/lib/components/DiveVideoPlayer.svelte) | Apply orientation-aware viewport, transform, and HUD coordinate mode. |
| [src/lib/stores/videoPlayback.ts](../src/lib/stores/videoPlayback.ts) | Keep existing landscape fullscreen behavior; only generalize if portrait display needs auto-fullscreen later. |
| [docs/dynamic-video-qa-checklist.md](dynamic-video-qa-checklist.md) | Add QA rows for metadata display orientation and external export expectations. |

---

## 8. Acceptance Criteria

- [ ] Existing landscape recordings still record, upload, and play as they do today.
- [ ] New videos no longer claim to be portrait unless the app explicitly sets portrait display metadata.
- [ ] Overdive can display a video according to `displayOrientation` without changing the underlying file.
- [ ] HUD overlay anchors correctly in landscape and portrait display modes.
- [ ] Timeline/distance/speed values are unchanged by orientation mode.
- [ ] External downloads are clearly labeled as original/raw unless an explicit export step creates a transformed file.
- [ ] `npm run check` passes.

---

## 9. Risks

1. **User confusion between in-app portrait and exported portrait.** Mitigation: label actions clearly: original vs export portrait.
2. **CSS transforms around video controls.** Mitigation: keep transformed video inside an app-controlled wrapper and avoid relying on native fullscreen for HUD playback.
3. **Old metadata drift.** Mitigation: reader defaults and a one-time cleanup later if needed.
4. **Portrait framing from a landscape source.** Mitigation: optional safe-area guide during recording.

---

## 10. Decision

Take this direction now.

It is useful, cheap, and aligned with the web platform's strengths. It makes Overdive smarter about videos without pretending the browser gives native-level control over MP4 orientation. It also sets up the same conceptual model the native app will need: asset orientation, display orientation, and overlay coordinate space are separate concerns.
