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

---

## 9. Distance Counter Redesign (v2)

> Added after shipping the v1 recorder. Addresses three in-use bugs plus a
> latent data-sparsity problem, and hardens the UI against miss-taps.

### 9.1 First principles (user brief)

1. Live HUD: **approximately accurate** during a lap; **absolutely accurate**
   at every wall (wall = the integer-length boundary, not every mid-pool
   waypoint).
2. Waypoints add resolution — more taps → a more faithful speed curve —
   but the system **must survive missed taps** without corrupting data.
3. Post-dive analytics need **enough samples to plot a speed curve**.
4. UI must **not cause miss-taps** (today the End-dive and Waypoint buttons
   sit next to each other).

### 9.2 What is broken today

**Bug A — "counter stops at the last expected waypoint on a missed tap."**
`cumulativeDistanceM` in `recorderSelectors.ts` applies
`Math.min(interpolated, nextWaypointM(state))` during `diving`. When the
diver overruns a missed tap the HUD pins at `nextWaypointM` until either
(i) the diver taps (registering the miss as the *next* waypoint, wrongly
collapsing two laps of time into one split) or (ii) the raw interpolated
distance exceeds the target by `autoAdvanceThresholdM = 10 m`, which is
half a pool length — by then the HUD has been lying for seconds.

**Bug B — "resuming with an additional tap creates problems in the data."**
Every `waypoint/tapped` unconditionally maps
`cumulativeDistanceM = lapNumber × waypointSpacingM`. If one tap is missed,
the next real tap is still recorded as the next sequential waypoint — so a
tap that really happened at (say) 50 m gets stamped **25 m**, and that
lap's split equals the time for two laps. `liveSpeedMs = spacing / split`
then reads half the real speed; the miss-tap threshold fires late because
the depressed pace pushes the raw extrapolation down too. Corruption
cascades through the rest of the dive.

**Bug C — "HUD on replay is no longer accurate."**
`distanceAt` / `speedAt` in `timeline.ts` take the saved (corrupted)
waypoints at face value. Replay HUD inherits Bug B. Additionally: the
saved timeline has **no samples between waypoints**, so a dynamic clip
has only a handful of data points — not enough to plot a meaningful
speed curve.

**Bug D — "Waypoint and End-dive buttons are too close."**
`buttonLayout.diving` returns `[Undo(weight 1), Waypoint(weight 3),
EndDive(weight 1)]` rendered side-by-side. The weight-1 End-dive sits
right next to the wide weight-3 Waypoint — a trivial miss-tap kills the
dive prematurely.

**Bug E (implicit) — sparse data for analytics.**
Only wall/waypoint taps are persisted. No continuous samples means no
per-second speed curve is possible.

### 9.3 Design principles for v2

1. **Walls are ground truth.** Every wall tap stamps a cumulative distance
   that is a whole multiple of `poolLengthM`, independent of how many
   mid-pool waypoints were tapped or missed along the way. Non-negotiable.
2. **Mid-pool waypoints are optional speed hints** — they refine the speed
   estimate but never define an integer wall count.
3. **Distinguish wall taps from sub-lap waypoints.** Today they are the
   same event; this is the root of Bugs A and B.
4. **Never lie to the user.** The HUD keeps advancing during an overrun —
   no capping. If it drifts slightly that is OK; we correct on the next
   wall.
5. **Record samples continuously.** Persist a lightweight ~1 Hz
   position/speed stream so analytics can plot a curve.
6. **Physical button separation.** End-dive is a rare, irreversible action;
   it belongs in a different zone from the high-frequency waypoint tap.

### 9.4 Proposed redesign

#### 9.4.1 Split event types: wallTap vs splitTap
- New reducer events: `wall/tapped` (at pool end) and `split/tapped`
  (mid-pool).
- `waypointsPerLap = 1` → only `wall/tapped` (single button).
- `waypointsPerLap > 1` → both buttons visible. Big primary = **Wall**;
  smaller = **Split**.
- A wall tap **always** sets
  `cumulativeDistanceM = completedWallCount × poolLengthM` (integer-correct
  regardless of missed splits).
- A split tap writes
  `cumulativeDistanceM = completedWallCount × poolLengthM
  + splitIndex × (poolLengthM / waypointsPerLap)`.
- **Kills Bug B**: a late resume-tap after a miss is now explicitly a Wall
  tap and stamps the correct integer distance.

#### 9.4.2 Timeline schema (backwards-compatible)
- Keep `laps: LapEvent[]` (per-wall splits — analytics-friendly).
- Add `samples: { atMs, distanceM, speedMs }[]` captured at ~1 Hz while
  diving. Dense enough for a speed curve.
- Add `subSplits: LapEvent[]` (optional, mid-pool taps). Separate from
  `laps` so analytics never counts them as whole lengths.
- All three arrays monotonically non-decreasing in `atMs` and distance.
- Old clips (no `samples`, no `subSplits`) still work via fallback paths.

#### 9.4.3 Live HUD: uncapped interpolation + wall-snap
- **Remove** the `Math.min(interpolated, nextWaypointM(state))` cap in
  `cumulativeDistanceM` during `diving`. Number keeps advancing past a
  missed tap.
- On a wall tap: **snap** the displayed distance to the integer wall count
  and reseed the interpolation base there. Brief visual click is
  acceptable and honest.
- Speed estimate: use a rolling window (last completed length OR last
  5 seconds, whichever is longer). Falls back to 1 m/s default pre-first-lap
  (already the case).

#### 9.4.4 Auto-advance → auto-snap on strong drift
- Current auto-advance ADDS a waypoint at 10 m drift — that writes a fake
  wall time into `laps` and corrupts splits. **Change semantics**: the
  drift detector only raises a ghost banner ("Looks like you missed a
  wall — tap now or undo"). It does **not** stamp a lap entry.
- The next real wall tap snaps to the correct integer distance. No ghost
  lap is needed; ground truth is preserved.
- **Kills Bug A**.

#### 9.4.5 Replay HUD
- Update `distanceAt` / `speedAt` in `timeline.ts` to:
  - Prefer the `samples` stream when present (O(log n) bisect → linear
    interp).
  - Fall back to the current lap-based stepwise interpolation for legacy
    clips without samples.
- `totalDistanceM` already prefers lap-based when present; keep but
  respect samples for the intra-lap tail when samples exist.

#### 9.4.6 Button layout redesign (Bug D)
Three zones during `diving`:

| Zone | Contents | Size |
|---|---|---|
| Primary (right thumb) | **Wall** tap | Full-height, right ~40% of screen |
| Secondary (left) | **Split** tap (only if `waypointsPerLap > 1`) | Left ~25% |
| Safety (top-right) | **End dive** — requires tap-and-hold 500 ms (or tap → confirm within 1.5 s) | Small, away from Wall |

- Undo stays in the top strip.
- **Haptics**: short pulse on wall tap; long pulse on end dive. Tactile
  distinction makes miss-taps self-evident.

#### 9.4.7 Telemetry sampling
- Every animation frame we already compute `cumulativeDistanceM` and
  `liveSpeedMs`. Throttle to 1 Hz (or 2 Hz) and push into a `samples`
  buffer in reducer state via a new `sample/recorded` event.
- Include the buffer in `finalizeTimeline` output.
- Size: ~200 samples per 200 s dive × `(atMs, distanceM, speedMs)`
  ≈ 5 KB — negligible.

#### 9.4.8 Migration
- `samples` and `subSplits` are optional → old clips still work.
- Existing `laps` keep their meaning (one entry per waypoint tap under v1).
- Either (a) leave legacy clips alone and let them replay via the old
  sparse-interp fallback, or (b) ship a one-off normaliser that folds old
  `laps` into `laps + subSplits` based on `waypointsPerLap`. **Recommend
  (a)** for MVP.

### 9.5 File impact map

- `src/lib/types.ts` — add `samples` and `subSplits` (optional) to
  `DiveTimeline`.
- `src/lib/capture/timeline.ts` — split `appendLap` into `appendWall` /
  `appendSplit`; add `appendSample`; update `distanceAt` / `speedAt` /
  `totalDistanceM` to consume samples; extend `summariseTimeline` for
  per-lap data + curve.
- `src/lib/capture/recorderState.ts` — split `waypoint/tapped` into
  `wall/tapped` and `split/tapped`; add `sample/recorded`; rework
  `waypoint/auto` to signal-only (no lap append).
- `src/lib/capture/recorderSelectors.ts` — uncap `cumulativeDistanceM`
  during diving; update `shouldAutoAdvance` to trigger the snap-banner
  instead of auto-waypoint; rework `buttonLayout` for the new 3-zone
  layout.
- `src/lib/components/DiveRecorder.svelte` — redo button layout
  (Wall / Split / End-dive zones); add sampling effect; add end-dive
  confirm gesture; haptics.
- `src/lib/capture/timeline.test.ts` — extend with snap-on-wall,
  sample-based replay, and miss-tap resume regression tests.
- `src/lib/capture/recorderState.test.ts` — update existing tests + add
  ones for the split events and uncapped HUD.

### 9.6 Phased rollout

- **Phase A — data integrity.** Split events (wall vs split), uncap HUD,
  snap on wall tap, replace auto-advance behaviour. Biggest bug-fix,
  lowest risk, no schema break.
- **Phase B — analytics depth.** Add `samples` stream + replay-HUD
  preference for samples. Unlocks speed curves.
- **Phase C — UI safety.** Three-zone button layout + end-dive confirm
  + haptics. Behavioural change; requires on-device QA.

### 9.7 Open questions — RESOLVED

1. For `waypointsPerLap = 2` (common case): **one smart Waypoint button**
   (chosen for UX simplicity). The UI shows a single big button; the data
   layer still classifies each tap as a Wall or a Split based on the tap
   position in the lap and the current interpolated distance (see 9.4.1b).
2. End-dive confirm gesture: **tap-and-hold 500 ms** (chosen).
3. Legacy clips: **leave as-is** on replay (chosen).

### 9.4.1b One-button classification (replaces 9.4.1)

The reducer still has two event types internally — `wall/tapped` and
`split/tapped` — because data integrity needs them. The **UI dispatches
the right one automatically**:

```
onWaypointTap(nowPerfMs):
  expectedSlot = (timeline.wallCount * waypointsPerLap + timeline.splitCount)
                  mod waypointsPerLap    // 0 => wall next, else split
  interp       = rawCumulativeDistanceM(state, nowPerfMs)  // uncapped
  nextWallM    = (completedWallCount + 1) * poolLengthM

  if expectedSlot === 0 OR interp >= nextWallM - snapToleranceM:
    dispatch wall/tapped
  else:
    dispatch split/tapped
```

`snapToleranceM` defaults to `waypointSpacingM / 2` (e.g. 12.5 m for a
25 m pool with 2 waypoints-per-lap) — if the diver has already
interpolated past the halfway point of the *final* sub-lap, we assume the
tap is a wall even if a split was "expected". This is how the system
self-heals from a missed split: the wall is still recorded at the correct
integer distance, and the missed split is silently skipped (it can be
inferred later from the samples stream if needed).

The button label reflects the next expected tap:
- When the next tap will register as a Wall: `"Wall · {completedWallCount + 1} × {poolLength}m = {(completedWallCount + 1) * poolLength}m"`.
- When the next tap will register as a Split: `"Waypoint · {nextSplitDistance}m"`.

### 9.8 Step plan (to land) — status

Status legend: [ ] pending · [~] in progress · [x] done (commit hash).

- [x] Step 9.A — extend `DiveTimeline` with optional `samples` and
      `subSplits`; no behaviour change.  *(commit 0a4f039)*
- [x] Step 9.B — add `wall/tapped` + `split/tapped` reducer events
      (keep `waypoint/tapped` as a back-compat alias that routes to
      `wall/tapped`); update tests.  *(commit cb241e5)*
- [x] Step 9.C — uncap `cumulativeDistanceM`; add snap-on-wall-tap
      seeding; change `shouldAutoAdvance` semantics to banner-only.
      *(commit 096f494)*
- [x] Step 9.D — add `sample/recorded` event + 1 Hz sampling loop in
      `DiveRecorder.svelte`; persist in finalized timeline.
      *(commit 53e6692)*
- [x] Step 9.E — replay HUD prefers `samples` when present; fallback
      to lap-based interp for legacy clips.
- [x] Step 9.F — one-smart-button UI: single Waypoint button with
      classification rule from §9.4.1b, tap-and-hold 500 ms End-dive,
      haptics; on-device QA.
- [x] Step 9.G — docs pass: update
      [`docs/recording-a-dynamic-dive.md`](recording-a-dynamic-dive.md)
      to describe the wall/split distinction and the new button layout.
