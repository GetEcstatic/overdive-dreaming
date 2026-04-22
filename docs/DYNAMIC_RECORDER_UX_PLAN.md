# Dynamic Dive Recorder UX — Implementation Plan

> Scope: rebuild the dynamic-dive recording flow so it matches the 13‑step UX
> in [`docs/recording-a-dynamic-dive.md`](recording-a-dynamic-dive.md) (`# UX Flow`).
> Preserve existing components where possible. Use **data‑oriented design**:
> express state as plain data, implement logic as pure functions, keep
> side-effects at the edges (Clojure philosophy).

---

## 1. Target UX Flow (source of truth)

1. User taps a **Record** entry point in the bottom navigation (new icon).
2. Picks discipline (DYN / DYNB / DNF).
3. Picks pool length and waypoints-per-lap (existing wheel inputs).
4. Taps **Next** → recorder screen opens full‑bleed landscape. Scroll is
   locked. If the phone is still portrait, an overlay asks the user to rotate.
5. A large red **Record** button is shown (camera-app style). Tap starts
   `MediaRecorder`.
6. A **Start dive** button is shown. Tap starts the dive clock + distance
   counter (counter defaults to 1 m/s before the first waypoint).
7. A **Waypoint** button (showing the distance of the next waypoint) and an
   **End dive** button are shown. *New behaviour*: if the diver’s
   **interpolated cumulative distance exceeds the next waypoint by 10 m**,
   the app assumes the user missed the tap and auto-advances the waypoint
   (the UI updates to show the following target). A short, undoable toast
   is displayed.
8. On **End dive**: timer + distance freeze, recording continues, and a
   **Stop recording** button replaces End dive.
9. On **Stop recording**: the dive ends and the user sees **Save** /
   **Cancel**.
10. On **Save**: a Dynamic-Max dive log opens pre-filled from the timeline:
    - Discipline
    - Total distance
    - Time per lap (splits)
    - Average speed per lap
    - Overall average speed
11. The user may add other metrics (RPE, notes, tags, …).
12. After save, the session shows up on the dashboard feed with inline video
    playback.
13. Video is downloadable from the session detail modal.

---

## 2. Design Principles

### Data-oriented design
- Model the recorder as a **plain-data state machine**:
  `RecorderState = { phase, clocks, timeline, config }`.
- All transitions are **pure functions** `(state, event) → state`.
- **Side-effects** (camera acquisition, `MediaRecorder`, wake lock,
  `performance.now()`, Firestore/Storage, navigation, scroll-lock) live in
  thin imperative shells (Svelte `onMount` / handlers / services) that
  *only* dispatch events into the reducer.
- Derived values (elapsed time, cumulative distance, next waypoint) are
  **pure functions of the state + a current time tick**, never stored as
  mutable duplicates. Svelte `$derived` consumes them.
- Data shapes are plain objects with no class machinery; use discriminated
  unions for `Phase` and `Event` so TypeScript exhaustiveness-checks every
  transition.

### Preserve existing components
- `DiveRecorder.svelte` becomes a **thin view** bound to the new reducer.
- Keep `cameraStream.ts`, `recorder.ts`, `wakeLock.ts`, `uploadQueue.ts`,
  `uploadProcessor.ts`, `NumberWheelInput.svelte`, `AthletePicker.svelte`,
  `DiveVideoPlayer.svelte` as-is; only rewrite orchestration.
- Existing `createEmptyTimeline` / `appendLap` / `finalizeTimeline` /
  `summariseTimeline` helpers already follow the pure-function style —
  extend them rather than replace.

---

## 3. Data Model

### 3.1 Reducer state (plain data)

```ts
// src/lib/capture/recorderState.ts  (new)

export type Phase =
  | 'idle'          // component mounted, camera not yet acquired
  | 'arming'        // awaiting camera permission / stream
  | 'ready'         // camera live, nothing recording
  | 'prepping'      // MediaRecorder running, dive clock NOT started
  | 'diving'        // dive clock running
  | 'ended'         // dive clock stopped, recorder still running (surface)
  | 'stopping'      // finalising MediaRecorder
  | 'error';

export interface RecorderConfig {
  poolLengthM: number;
  waypointsPerLap: number;
  discipline: DiveVideoDiscipline;
  resolution: DiveVideoResolution;
  /** Metres of over-run past the next waypoint before we auto-advance. */
  autoAdvanceThresholdM: number; // default 10
}

export interface RecorderClocks {
  /** performance.now() of MediaRecorder start. 0 before recording. */
  recordingStartedPerfMs: number;
  /** performance.now() of the Start-dive tap. 0 before the dive begins. */
  diveStartedPerfMs: number;
  /** performance.now() of the End-dive tap. 0 while diving. */
  diveEndedPerfMs: number;
}

export interface RecorderState {
  phase: Phase;
  config: RecorderConfig;
  clocks: RecorderClocks;
  timeline: DiveTimeline;
  /** Banner shown after an auto-advance (data-only; UI renders from this). */
  autoAdvance: { atPerfMs: number; missedLaps: number } | null;
  errorMessage: string | null;
  /** Explicit orientation gate (data, not DOM). */
  isLandscape: boolean;
}
```

### 3.2 Events (discriminated union)

```ts
export type RecorderEvent =
  | { type: 'arm/started' }
  | { type: 'arm/succeeded' }
  | { type: 'arm/failed';          message: string }
  | { type: 'recording/started';   atPerfMs: number }
  | { type: 'dive/started';        atPerfMs: number }
  | { type: 'waypoint/tapped';     atPerfMs: number }
  | { type: 'waypoint/undone' }
  | { type: 'waypoint/auto';       atPerfMs: number; count: number }
  | { type: 'dive/ended';          atPerfMs: number }
  | { type: 'recording/stopping' }
  | { type: 'recording/stopped' }
  | { type: 'orientation/changed'; isLandscape: boolean }
  | { type: 'error/raised';        message: string }
  | { type: 'config/updated';      patch: Partial<RecorderConfig> }
  | { type: 'reset' };
```

### 3.3 Reducer (pure)

```ts
export function recorderReducer(
  state: RecorderState,
  event: RecorderEvent
): RecorderState { … }
```

- Each `case` returns a **new** `RecorderState` (no mutation).
- Illegal transitions are no-ops (return the same reference).
- All new `DiveTimeline` values come from the existing immutable
  `appendLap` / `finalizeTimeline` helpers.

### 3.4 Derived selectors (pure)

Pure, testable, consumed by the Svelte view via `$derived`:

```ts
// src/lib/capture/recorderSelectors.ts  (new)

export const diveElapsedMs    = (s: RecorderState, nowPerfMs: number) => …
export const recordingElapsedMs = (s, nowPerfMs) => …
export const cumulativeDistanceM = (s, nowPerfMs) => …  // with 1 m/s default
export const nextWaypointM    = (s) => …
export const liveSpeedMs      = (s) => …
export const shouldAutoAdvance = (s, nowPerfMs) => boolean  // > threshold
export const canUndo          = (s) => boolean
export const buttonLayout     = (s) => ButtonLayoutData // purely data
```

`buttonLayout` returns a plain data description of the bottom controls —
the view renders from that, so snapshot-testing the layout is trivial.

---

## 4. Side-Effect Shells (the “edges”)

| Concern              | Where | What it does |
|----------------------|-------|--------------|
| Camera acquisition   | `DiveRecorder.svelte onMount` | Calls `acquireCameraStream`; dispatches `arm/succeeded` or `arm/failed`. |
| MediaRecorder start  | Handler | Calls `createRecorder(...).start()`; dispatches `recording/started`. |
| MediaRecorder stop   | Handler | Awaits `recorder.stop()`; emits a `CaptureResult` to the page. |
| Wake lock            | Effect keyed on `phase === 'prepping' \|\| 'diving' \|\| 'ended'`. |
| Clock ticks          | `requestAnimationFrame` loop updates a single `nowPerfMs = $state(...)`. Selectors recompute. |
| Auto-advance scan    | `$effect` reads `shouldAutoAdvance(state, now)`; if true, dispatches `waypoint/auto`. |
| Scroll / zoom lock   | Page-level `onMount` sets `html { overflow: hidden; overscroll-behavior: none }` and listens for gesturestart to prevent pinch-zoom. Removed on destroy. |
| Orientation gate     | `resize` / `orientationchange` → `orientation/changed`. |
| Navigation / upload  | `/dive/record/[id]/+page.svelte` — unchanged except for the post-save redirect. |

No component reads `performance.now()` directly outside the handler that
*creates* an event; that event carries the timestamp as data.

---

## 5. UI Surface Changes

### 5.1 Bottom navigation

- Add a **Record** tab (camera/video icon, e.g. `lucide-svelte`'s `Video`)
  to `BottomNav.svelte` between **Log Dive** and **Routines**.
- Route: `/record` — a new page that asks the user to pick the session
  context first (existing list), or creates an ad-hoc session if the user
  has no open one.
- Existing entry point (`/dive/record/[id]`) remains for the in-session
  flow.

### 5.2 Setup screen (Step 2–4)

- Re-use the existing `setup` stage markup in `/dive/record/[id]/+page.svelte`
  but:
  - Button says **Next** (was "Start camera…").
  - Use the new `/record` top-level route for the navbar entry; it forwards
    to `/dive/record/[id]` after the user picks/creates a session.

### 5.3 Recorder screen (Step 4–9)

- `DiveRecorder.svelte` rewritten as a thin view:
  1. Binds `<video>` and listens for camera events.
  2. Subscribes to `recorderState` via a small store (`writable({ state })`
     plus `dispatch(event)` helpers) or a Svelte 5 `$state` object in the
     page and passes `state + dispatch` as props.
  3. Renders three data-driven regions:
     - **HUD** (top) — driven by selectors.
     - **Orientation/error overlays** — driven by `phase` + `isLandscape`.
     - **Controls** (bottom) — renders from `buttonLayout(state)`.
- Full-bleed: `recorder { inset: 0; position: fixed }` already done;
  additionally lock scroll and disable iOS rubber-banding (`overscroll-behavior`,
  `touch-action: none` on the root).
- Controls per phase (from `buttonLayout`):
  - `ready`    → [Cancel] [● Record (big red)]
  - `prepping` → [■ Stop] [▶ Start dive (big)]
  - `diving`   → [Undo] [Waypoint N at X m (big)] [End dive]
  - `ended`    → [■ Stop recording (big)]
  - `stopping` → spinner

### 5.4 Auto-advance waypoint (Step 7)

- `shouldAutoAdvance` returns `true` when
  `cumulativeDistanceM(now) - nextWaypointM(state) >= config.autoAdvanceThresholdM`.
- When triggered, the reducer receives `waypoint/auto` and:
  1. Appends a lap at `atPerfMs - (overshoot / speed)` (best-effort back-
     dated timestamp so the split is not clamped to 0) using the existing
     `appendLap` helper.
  2. Sets `autoAdvance` with `missedLaps: 1` so the HUD can show
     "Auto-advanced waypoint" for ~2 s (data-only; view clears it after a
     tick).
- Undoable via the existing `waypoint/undone` event (the Undo button stays
  wired).

### 5.5 Review (Step 9) + Dive log (Step 10)

- Review stage already exists in `/dive/record/[id]/+page.svelte`. After
  **Save**, instead of going to `/session/[id]`, route to a **new
  pre-filled dynamic-max log form** for that session:
  `/session/[id]/log/new?fromVideo=<videoId>`.
- New page reads the freshly-uploaded `DiveVideo` (or the in-memory
  capture if we pass it via the nav state) and seeds the form:
  - discipline
  - total distance (`summary.totalDistanceM`)
  - per-lap splits + avg speeds (from `timeline.laps`)
  - overall avg speed (`summary.averageSpeedMs`)
- Uses the existing `EditableLogForm` / `QuickLogForm` components with a
  new `initial` prop bag; pure data seed.

### 5.6 Playback (Step 12) & download (Step 13)

- No changes — already working via `DiveVideoPlayer.svelte` and the
  session detail page. The replay HUD already skips the breathe-up
  (commit `ef6980d`).

---

## 6. File Plan

### New files
- `src/lib/capture/recorderState.ts` — types + reducer + initial-state
  factory (pure).
- `src/lib/capture/recorderSelectors.ts` — derived selectors (pure).
- `src/lib/capture/recorderState.test.ts` — Vitest unit tests for every
  reducer transition and selector (≥20 tests including auto-advance
  scenarios).
- `src/routes/(app)/record/+page.svelte` — new top-level Record entry
  that forwards into the session flow.
- `src/routes/(app)/session/[id]/log/new/+page.svelte` — auto-pre-filled
  dynamic-max log form post-record. (Replaces the current direct redirect
  to `/session/[id]`.)

### Modified files
- `src/lib/components/DiveRecorder.svelte` — rewritten as a thin view over
  the reducer; no dive/recording logic inside the component.
- `src/lib/components/BottomNav.svelte` — add Record tab.
- `src/routes/(app)/dive/record/[id]/+page.svelte` — on save, navigate to
  the new log-new route with captured data in `location.state` (or query
  string + session-storage if `location.state` isn't available in SvelteKit
  navigation).
- `src/lib/capture/timeline.ts` — extend `summariseTimeline` to also return
  `perLap: Array<{ lapNumber, splitSeconds, avgSpeedMs, cumulativeDistanceM }>`
  so the log form can render splits without re-deriving. (Pure.)

### Unchanged
- `cameraStream.ts`, `recorder.ts`, `wakeLock.ts`, `uploadQueue.ts`,
  `uploadProcessor.ts`, `NumberWheelInput.svelte`, `AthletePicker.svelte`,
  `DiveVideoPlayer.svelte`.

---

## 7. Testing Strategy

Pure code → trivially unit-testable. Vitest:

1. **Reducer tests** (`recorderState.test.ts`):
   - Every `Event` from every legal `Phase` returns the expected next phase.
   - Illegal events are no-ops.
   - Auto-advance with `overshoot = 10.01 m` appends exactly one lap;
     at `9.99 m` it does not.
   - Undo after auto-advance removes the auto-appended lap.
2. **Selector tests**: `cumulativeDistanceM` interpolates correctly before
   the first lap (default 1 m/s), snaps to lap on tap, and is clamped at
   the next waypoint target.
3. **`summariseTimeline.perLap`** test: sample 3-lap dive produces the
   expected splits + avg speeds.
4. **Component smoke test**: DiveRecorder renders the correct control
   layout per phase using the snapshot of `buttonLayout(state)`.
5. **E2E (manual)**: run through the 13-step UX in landscape on a real
   device; verify auto-advance, scroll-lock, and the pre-filled log form.

---

## 8. Rollout Order (sequential; each step compiles + ships cleanly)

1. **Step A — Pure core.** Add `recorderState.ts`, `recorderSelectors.ts`,
   extend `summariseTimeline`. All green in Vitest. No UI changes yet.
2. **Step B — Thin view.** Refactor `DiveRecorder.svelte` onto the
   reducer (no behaviour changes except internal structure).
3. **Step C — Auto-advance.** Wire `waypoint/auto` + threshold config.
4. **Step D — Scroll lock + orientation gate tightening** on the record
   page.
5. **Step E — Bottom-nav Record tab** + top-level `/record` route.
6. **Step F — Post-save pre-filled log form** route.
7. **Step G — QA pass + docs update** (`docs/recording-a-dynamic-dive.md`
   step-by-step section).

Each step is its own commit → easy to revert if something regresses on
Vercel.

---

## 9. Risks / Open Questions

- **Auto-advance back-dating**: we don't know the exact time of the missed
  tap; estimating from the current interpolated speed is good enough but
  the resulting split will be close to the previous split's duration. Flag
  `autoAdvanced: true` on the lap so downstream UI can show a subtle
  indicator. *(Minor schema change to `LapEvent`; optional field.)*
- **Background behaviour**: on iOS, if the browser backgrounds, the
  `MediaRecorder` stops. We surface this via `error/raised` and keep the
  partial recording. Already handled by the existing recorder handle.
- **Navbar icon choice**: `Video` vs `Circle` — pick one and keep it
  distinct from the existing `Plus` (Log) tab.
- **`location.state` vs storage**: SvelteKit doesn't preserve `History.state`
  across full navigations; pass the captured summary via `sessionStorage`
  keyed on session id, or as a query param pointing at the freshly-created
  `DiveVideo` id.

---

## 10. TODO Checklist

- [ ] Step A — write `recorderState.ts`, `recorderSelectors.ts`, extend
      `summariseTimeline`; add unit tests.
- [ ] Step B — refactor `DiveRecorder.svelte` onto the reducer (no
      behaviour change).
- [ ] Step C — auto-advance waypoint (threshold 10 m; configurable).
- [ ] Step D — scroll/zoom lock + orientation gate on the recorder route.
- [ ] Step E — add Record tab to `BottomNav` + `/record` landing page.
- [ ] Step F — post-save pre-filled dynamic-max log form route.
- [ ] Step G — docs + QA pass; update `docs/recording-a-dynamic-dive.md`.
