# Fullscreen Single-Button Dive Recorder Plan

> Status: approved and implemented. Manual device QA remains.
>
> Goal: make the live dive recorder feel like a camera-first tool: full-screen preview, minimal chrome, and one large action button that advances through the recording flow.

---

## 1. Target UX

The setup and review screens stay as they are. This plan only changes the active recorder screen rendered by `DiveRecorder.svelte`.

### Portrait

- Camera preview fills the whole viewport.
- Small black bands are acceptable when needed to avoid misleading crop or broken browser camera behavior.
- HUD stays over the video, using compact safe-area-aware top placement.
- One large primary button sits at the bottom center.
- Secondary actions are minimized and only appear when needed.

### Landscape

- Camera preview fills the whole viewport.
- The same large primary button moves to the bottom right, reachable by thumb and away from the central camera view.
- HUD stays compact in the top/left safe area.
- Camera/lens controls stay available before recording, but should not compete with the primary action once the recording flow begins.

---

## 2. Single Button Behavior

Use one primary action button whose behavior is derived from recorder phase:

| Phase | Single tap | Long press | Button label |
|---|---|---|---|
| `ready` | Start MediaRecorder | None | Record |
| `prepping` | Start dive clock | Stop/cancel recording, optional secondary path | Start dive |
| `diving` | Mark next waypoint | End dive | Waypoint / Wall / Split |
| `ended` | Stop recording | None | Stop recording |
| `stopping` | Disabled | Disabled | Finalising |

Notes:

- During `diving`, a short tap keeps the existing smart waypoint logic: it routes to split or wall based on `nextTapKind(rs)` and the current interpolation.
- During `diving`, a long press replaces the separate End dive button.
- Keep the existing 500 ms hold threshold unless testing shows too many accidental triggers.
- Keep haptic feedback: small pulse on waypoint tap, hold-start pulse, stronger confirmation pattern on long-press end.
- The user asked for a single button solution, so avoid reintroducing separate Start/Waypoint/End buttons in the main path.

---

## 3. Product Decisions

### Keep Recording And Dive End Separate

The current model has two endpoints:

1. End dive: freezes the dive timer and timeline.
2. Stop recording: ends the video after surface protocol footage.

Keep that model. The single button should end the dive on long press while diving, then become Stop recording after the dive has ended. This preserves the existing surface-protocol capture behavior.

### Preserve Camera Reliability

Do not change stream constraints or attempt live transcoding. The previous orientation plan already established that web recording should stay reliable and orientation should be handled with metadata/playback. This plan only changes layout and controls.

### Fullscreen Means UI Overlay, Not Native Fullscreen

Use fixed full-viewport layout inside the web app. Do not rely on native browser fullscreen APIs for the recorder, because iOS behavior is uneven and can fight overlays, pointer events, and safe-area handling.

---

## 4. Architecture Direction

Follow the existing data-oriented recorder architecture:

- Keep `recorderState.ts` as the pure state machine.
- Keep timeline math and smart waypoint behavior in pure helpers/selectors.
- Keep camera, `MediaRecorder`, wake lock, pointer events, and haptics in `DiveRecorder.svelte`.
- Replace the current multi-button `buttonLayout()` output with a single-primary-action model, or add a new selector beside it and migrate the component to that selector.

Recommended new selector shape:

```ts
export type PrimaryRecorderAction =
  | 'record'
  | 'startDive'
  | 'waypoint'
  | 'stopRecording'
  | 'disabled';

export interface PrimaryActionSpec {
  action: PrimaryRecorderAction;
  label: string;
  sub?: string;
  disabled: boolean;
  supportsLongPressEndDive: boolean;
}
```

This keeps the Svelte component simple: render one button from selector data, then route taps/long-presses to existing handlers.

---

## 5. File-By-File Plan

| File | Planned change |
|---|---|
| `src/lib/capture/recorderSelectors.ts` | Add `primaryActionSpec(state)` or replace `buttonLayout(state)` with a single-action equivalent. Keep labels/subtext derived from `nextTapKind`, `nextWaypointM`, and phase. |
| `src/lib/capture/recorderState.test.ts` | Add/update selector tests for phase-to-primary-action mapping and long-press availability while diving. |
| `src/lib/components/DiveRecorder.svelte` | Replace the multi-button controls strip with a full-screen overlay control layer and one large primary action button. Reuse existing handlers: `onPressRecord`, `onPressStartDive`, `onPressWaypoint`, `onPressStopRecording`, and long-press `onPressEndDive`. |
| `src/lib/components/DiveRecorder.svelte` styles | Change `.recorder`/`.preview` so video occupies the whole viewport. Convert `.controls` from a bottom/side panel into an absolute overlay. Add portrait bottom-center and landscape bottom-right placement. |
| `src/lib/components/DiveRecorder.svelte` camera controls | Keep the camera selector pill visible only in `ready`. Place it away from the primary action and hide/read-only it once recording starts. |
| `docs/dynamic-video-qa-checklist.md` | Add QA cases for portrait/landscape button position, tap behavior, long-press end dive, and surface-protocol stop recording. |

---

## 6. Implementation Checklist

- [x] Add a pure `primaryActionSpec(state)` selector.
- [x] Cover selector output for `ready`, `prepping`, `diving`, `ended`, `stopping`, `arming`, and `error`.
- [x] In `DiveRecorder.svelte`, replace `layout.buttons` rendering with one primary button.
- [x] Route primary button single taps by `PrimaryRecorderAction`.
- [x] Move the existing long-press end-dive behavior onto the primary button only when `rs.phase === 'diving'`.
- [x] Ensure a short tap while diving never triggers end dive.
- [x] Ensure the long-press timer is cleared on pointer up, cancel, leave, and component cleanup.
- [x] Make the recorder preview full-viewport in portrait and landscape.
- [x] Convert `.controls` into an overlay layer rather than a layout panel that consumes screen space.
- [x] Position the primary button bottom-center in portrait with safe-area padding.
- [x] Position the primary button bottom-right in landscape with safe-area padding.
- [x] Keep HUD readable but compact enough not to dominate the camera image.
- [x] Keep the camera selector reachable in `ready`, then remove it from the active recording path.
- [x] Check that toast, arming, error, and camera selector sheet still layer above the video correctly.
- [x] Update the QA checklist for the new recorder interaction model.
- [x] Run `npm run check`.
- [ ] Manually test on mobile-size portrait and landscape viewports.

---

## 7. Detailed UI Notes

### Primary Button Visuals

- Use a large circular or near-circular control, camera-app style.
- In `ready`, color should clearly signal record, likely red.
- In `prepping`, use the existing green start-dive intent.
- In `diving`, use the existing teal waypoint intent.
- In `ended`, use red/neutral stop-recording intent.
- Include compact label text where helpful, but do not make the button text-heavy.

### Long Press Feedback

- Reuse the current `hold-progress` affordance.
- Make the progress visible on the primary button itself.
- While holding during `diving`, label can change from waypoint text to `Hold to end` or `Ending...`.
- On long-press confirmation, dispatch `dive/ended` and let the button immediately transition to Stop recording.

### Secondary Actions

The single-button main path still needs a few escape hatches:

- `Cancel` before recording can be a small text/icon button in a safe corner.
- `Undo` during diving is useful but should be visually secondary. Prefer a compact corner button or HUD-adjacent icon, not a peer of the primary action.
- Error retry remains in the error overlay.
- Camera picker remains available only before recording.

---

## 8. Acceptance Criteria

- [ ] In portrait, the camera preview uses the full screen behind overlays.
- [ ] In landscape, the camera preview uses the full screen behind overlays.
- [ ] Small black bands are acceptable; a persistent controls sidebar is not.
- [ ] One large primary button handles Record, Start dive, Waypoint, and Stop recording by phase.
- [ ] During the dive, a short tap marks the next waypoint using the current smart waypoint logic.
- [ ] During the dive, a long press ends the dive and does not stop the video recording.
- [ ] After the dive ends, the same button becomes Stop recording.
- [ ] Existing timeline, waypoint, auto-advance, upload, and orientation metadata behavior remains unchanged.
- [ ] `npm run check` passes.

---

## 9. Remaining QA

Manual device/browser testing should still verify portrait and landscape placement, camera preview fill, short-tap waypoint behavior, and long-press end dive before broad release.
