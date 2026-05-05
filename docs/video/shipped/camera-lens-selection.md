# Dynamic Recorder Camera Lens Selection — Implementation Plan

> Scope: add a strong, low-friction way to choose the camera/lens used by the
> dynamic disciplines recorder. This is a **planning document only**; do not
> implement until explicitly approved.

---

## 1. Context

The dynamic recorder currently requests the rear camera with:

```ts
acquireCameraStream({
  resolution,
  facingMode: 'environment'
})
```

That means the browser chooses whichever rear camera source best satisfies the
constraints. On an iPhone with multiple rear lenses, the app cannot assume this
maps cleanly to a specific physical lens such as ultra-wide, wide, or telephoto.

The right implementation is therefore:

1. Prefer a specific `deviceId` when the browser exposes multiple video inputs.
2. Present those inputs with practical labels and a live preview.
3. Fall back to simple **Rear camera** behaviour when the browser exposes only
   one rear camera.
4. Persist the user’s last successful choice, but recover safely if that device
   ID disappears or changes.

Sources checked:

- MDN `enumerateDevices()` notes that device lists and labels are permission
  gated, and default devices are listed first:
  <https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices>
- MDN `getUserMedia()` supports selecting by `deviceId`, but browsers may still
  fall back unless `exact` is used:
  <https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia>
- MDN `MediaTrackConstraints` includes `deviceId`, `facingMode`, `zoom`, and
  `torch`, but support depends on browser/device:
  <https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints>
- MDN `getCapabilities()` / `applyConstraints()` describe the capability-driven
  path for optional controls such as zoom:
  <https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getCapabilities>
  and
  <https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/applyConstraints>

---

## 2. UX Goals

- Keep the recorder fast at poolside: lens choice must not add friction to the
  normal record path.
- Make the current camera obvious before recording starts.
- Allow switching only when it is safe: before recording, not mid-recording.
- Avoid misleading labels. If the browser says “Back Camera” but not
  “Ultra Wide”, the UI should not pretend it knows the physical lens.
- Work well on iPhone Safari/PWA, Android Chrome, and desktop webcams.
- Preserve the existing full-bleed recorder UI and avoid cluttering the core
  dive controls.

---

## 3. Product Recommendation

### 3.1 Setup Screen

Add a compact **Camera** row to the dynamic recorder setup screen:

- Default value: `Auto rear`
- If multiple rear video inputs are discoverable: show a segmented control or
  selector with entries like:
  - `Auto`
  - `Back Camera`
  - `Back Ultra Wide Camera`
  - `Back Telephoto Camera`
- If labels are unavailable before permission: show `Auto rear` and resolve the
  camera list after the first permission grant.
- Include a small **Preview** affordance only if needed; the recorder screen
  itself is the primary preview.

### 3.2 Recorder Screen

In the recorder HUD, show the selected camera as a small top-corner pill before
recording:

- Example: `Auto rear`, `Wide`, `Ultra wide`, `Tele`, or the browser label.
- Tapping the pill opens a bottom sheet while the recorder is in `ready`.
- Once the user taps **Record**, lock the camera choice and show it as read-only.

Reason: switching cameras requires stopping the current video track and
requesting a new stream. Doing that during an active `MediaRecorder` session is
too risky for a dive capture.

### 3.3 Bottom Sheet

Use a dense, utility-style sheet:

- Title: `Camera`
- Rows show available video inputs.
- Each row has:
  - a radio/check icon
  - a concise label
  - optional technical hint: `1280 x 720`, `1920 x 1080`, or `current`
- Include a final `Auto rear` option at the top.
- If only one viable rear camera exists, show a disabled informational row
  rather than hiding the control completely.

No explanatory body copy in the main UI. Error and unavailable states should be
short and operational.

---

## 4. Technical Design

### 4.1 Data Types

Add plain data types near the capture code, likely in a new file:

```ts
// src/lib/capture/cameraDevices.ts

export type CameraPreference =
  | { kind: 'auto-rear' }
  | { kind: 'device'; deviceId: string; label?: string };

export interface CameraDeviceOption {
  id: string;
  label: string;
  rawLabel: string;
  kind: 'videoinput';
  facing: 'rear' | 'front' | 'unknown';
  confidence: 'explicit-label' | 'inferred-label' | 'unknown';
}

export interface CameraDeviceState {
  permission: 'unknown' | 'granted' | 'denied';
  options: CameraDeviceOption[];
  selected: CameraPreference;
  activeDeviceId?: string;
  activeLabel?: string;
  errorMessage?: string;
}
```

Keep classification pure:

```ts
export function classifyCameraLabel(label: string): {
  facing: 'rear' | 'front' | 'unknown';
  displayLabel: string;
  confidence: CameraDeviceOption['confidence'];
}
```

This follows the repository rule: browser calls at the edge, label
normalisation and selection logic as pure functions.

### 4.2 Camera Acquisition

Extend `CameraStreamOptions`:

```ts
export interface CameraStreamOptions {
  resolution: DiveVideoResolution;
  facingMode?: 'environment' | 'user';
  withAudio?: boolean;
  deviceId?: string;
}
```

Update `constraintsFor()`:

- If `deviceId` is present, use it as `deviceId: { exact: deviceId }`.
- Otherwise keep the current `facingMode: { ideal: 'environment' }`.
- Preserve the existing 16:9 landscape constraints, frame rate, and audio
  behaviour.

Fallback path:

1. Try exact `deviceId`.
2. If it throws `OverconstrainedError` or `NotFoundError`, retry `Auto rear`.
3. Surface a short warning and clear the stale preference.

### 4.3 Device Enumeration

New helper responsibilities:

- `enumerateCameraDevices()` calls `navigator.mediaDevices.enumerateDevices()`.
- Filter to `kind === 'videoinput'`.
- Classify labels into rear/front/unknown.
- Prefer rear cameras when labels reveal facing.
- If labels are empty, return an empty-labelled option list and let the UI
  remain on `Auto rear` until permission has been granted.

Important browser behaviour:

- Device labels may be blank before camera permission.
- Device IDs can change between browsing sessions.
- iOS may expose multiple physical lenses, one composite rear camera, or labels
  that vary by iOS/Safari version.

### 4.4 Optional Zoom Capability

Do **not** make zoom part of v1 lens selection unless real-device testing shows
that iPhone Safari exposes useful `zoom` capability.

Plan for later:

- After stream acquisition, call `track.getCapabilities?.()`.
- If `capabilities.zoom` exists with a useful range, expose a small zoom slider
  in the camera sheet.
- Apply using `track.applyConstraints({ advanced: [{ zoom }] })`.
- Persist zoom separately from physical camera preference.

Reason: zoom is not equivalent to lens selection. It may be digital crop, optical
switching, or unsupported depending on browser/device.

---

## 5. State Machine Integration

Current `DiveRecorder.svelte` is a thin side-effect shell over
`recorderReducer`. Keep that shape.

### 5.1 Recorder Config

Extend `RecorderConfig`:

```ts
export interface RecorderConfig {
  poolLengthM: number;
  waypointsPerLap: number;
  discipline: DiveVideoDiscipline;
  resolution: DiveVideoResolution;
  autoAdvanceThresholdM: number;
  cameraPreference: CameraPreference;
}
```

### 5.2 Events

Add reducer events only for data changes:

```ts
| { type: 'camera/optionsLoaded'; options: CameraDeviceOption[] }
| { type: 'camera/selected'; preference: CameraPreference }
| { type: 'camera/activeChanged'; deviceId?: string; label?: string }
| { type: 'camera/failed'; message: string }
```

Side effects remain in `DiveRecorder.svelte` or a small camera controller:

- enumerate devices
- stop current stream
- acquire new stream
- bind `videoEl.srcObject`
- restart preview

Reducer responsibilities:

- store selected preference
- store active camera display label
- block camera switching once phase is not `ready`
- store recoverable camera error text

---

## 6. Persistence

Persist the last successful camera choice in user settings, probably alongside
existing recorder setup preferences.

Suggested shape:

```ts
interface RecorderSetupPreferences {
  discipline?: DiveVideoDiscipline;
  poolLength?: number;
  waypointsPerLap?: number;
  resolution?: DiveVideoResolution;
  cameraPreference?: CameraPreference;
}
```

Rules:

- Save only after a stream is successfully acquired.
- If exact `deviceId` fails later, fall back to `Auto rear` and clear the stored
  device preference.
- Do not store camera labels as the source of truth; labels are display/debug
  data only.

Privacy note: camera `deviceId` is browser-scoped device information. Keep it in
the user’s own settings only; do not expose it in public/social surfaces.

---

## 7. DiveVideo Metadata

Current `DiveVideo` already stores:

- `deviceLabel?: string`
- `widthPx`
- `heightPx`
- `resolutionPreset`

Recommended addition:

```ts
cameraDeviceId?: string;
cameraPreference?: CameraPreference;
cameraFacing?: 'rear' | 'front' | 'unknown';
```

Use this for debugging and future analytics only. The session feed should not
show device IDs.

Migration impact: optional fields only; existing videos remain valid.

---

## 8. UI Components

Likely files:

- `src/lib/capture/cameraDevices.ts` — enumeration, label classification,
  preference resolution.
- `src/lib/capture/cameraStream.ts` — support `deviceId` constraints.
- `src/lib/capture/cameraDevices.test.ts` — pure tests for classification and
  preference fallback.
- `src/lib/components/CameraSelector.svelte` — compact selector/sheet.
- `src/lib/components/DiveRecorder.svelte` — wire selected preference into
  acquisition and safe switching.
- `src/routes/(app)/dive/record/[id]/+page.svelte` — setup screen field and
  persistence.
- `src/lib/types.ts` — optional metadata/preference types if shared broadly.
- `src/lib/firestore.ts` — save/load recorder preference and optional metadata.
- `docs/dynamic-video-qa-checklist.md` — add real-device camera selection QA.

---

## 9. Implementation Steps

### Phase 1 — Capability Discovery

- [ ] Add `cameraDevices.ts` with plain data types and pure label
  classification helpers.
- [ ] Add `enumerateCameraDevices()` edge helper.
- [ ] Add unit tests for common labels:
  - `Back Camera`
  - `Back Ultra Wide Camera`
  - `Back Telephoto Camera`
  - `Front Camera`
  - empty label
  - generic desktop webcam label
- [ ] Add a temporary debug log or dev-only surface to inspect what real iPhone
  Safari exposes after permission.

### Phase 2 — Stream Selection

- [ ] Extend `CameraStreamOptions` with `deviceId`.
- [ ] Update `constraintsFor()` to use exact `deviceId` when provided.
- [ ] Add safe fallback from failed exact device selection to `Auto rear`.
- [ ] Return `deviceId` from `AcquiredStream` using `track.getSettings()`.
- [ ] Keep current landscape 16:9 and audio constraints unchanged.

### Phase 3 — Setup UI

- [ ] Build `CameraSelector.svelte` using the existing dark, compact control
  style.
- [ ] Add the selector to the recorder setup screen near resolution.
- [ ] Default to `Auto rear`.
- [ ] Load device options after permission is granted.
- [ ] Persist the last successful choice to user settings.
- [ ] Recover gracefully if the stored device is unavailable.

### Phase 4 — Recorder UI

- [ ] Show the active camera pill in the recorder HUD while `phase === 'ready'`.
- [ ] Open the camera sheet from that pill.
- [ ] On selection, stop the current preview stream and acquire the new stream.
- [ ] Disable/hide switching after **Record** is pressed.
- [ ] Make errors short and recoverable:
  - `Camera unavailable`
  - `Using Auto rear instead`
  - `Permission denied`

### Phase 5 — Metadata

- [ ] Add optional `cameraPreference`, `cameraFacing`, and `cameraDeviceId`
  metadata to `DiveVideo`.
- [ ] Save active camera metadata when capture completes.
- [ ] Avoid rendering device IDs in user-facing UI.

### Phase 6 — QA

- [ ] Add camera selection scenarios to `docs/dynamic-video-qa-checklist.md`.
- [ ] Test on iPhone Safari.
- [ ] Test on iPhone installed PWA.
- [ ] Test on Android Chrome if available.
- [ ] Test on desktop with one webcam.
- [ ] Verify camera switch works before recording.
- [ ] Verify camera switch is blocked once recording starts.
- [ ] Verify fallback when a stored device ID fails.
- [ ] Verify labels appear after permission.
- [ ] Verify resulting video metadata records active camera information.
- [ ] Run `npm run check`.

---

## 10. Acceptance Criteria

- A user can choose `Auto rear` or a specific exposed rear camera before
  recording.
- The current camera choice is visible in the recorder before recording starts.
- Recording cannot be interrupted by accidental camera switching.
- If the selected camera is unavailable, the app falls back to current behaviour
  and explains the fallback briefly.
- Existing recording flow, timeline capture, auto-advance, upload, and playback
  still work.
- Existing videos and Firestore documents remain valid.
- Type checking passes.

---

## 11. Risks

- iOS Safari may expose only one rear video input even on multi-lens iPhones.
- Device labels and IDs may be blank or unstable until after permission.
- Browser labels may not map cleanly to physical lenses.
- Exact `deviceId` constraints may fail after OS/browser updates.
- Switching streams in the recorder screen may briefly flash black preview.
- Adding camera metadata to Firestore may require security rule validation if
  rules currently whitelist fields.

Mitigation: ship v1 as capability-driven selection with `Auto rear` fallback,
not as a hard promise of “0.5x / 1x / 3x” on every iPhone.

---

## 12. Open Questions

1. Should camera selection be shown on the setup screen only, or also as a
   pre-recording pill in the recorder HUD? Recommendation: both, with HUD
   switching only before recording. *both*
2. Should the UI use browser labels verbatim, or normalize aggressively to
   `Ultra wide`, `Wide`, `Tele` when possible? Recommendation: normalize common
   labels but keep the raw label available in metadata/debug output. *Normalise*
3. Should front camera be offered? Recommendation: hide it for dynamic pool
   recording unless the user explicitly asks for self-recording support. *hide it*
4. Should zoom be part of the first implementation? Recommendation: no; add it
   only after real-device testing confirms useful support. *not for now.*
5. Which iPhone models should be used for QA? At least one three-lens iPhone is
   needed to validate the actual browser behaviour. *Iphone 16 and iphone 14 are available. a new google pixel is also available for android*

