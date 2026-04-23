# Dynamic Dive Metrics — Expansion Plan

> Status: **Planning only.** No implementation until approved.
>
> Context: The dynamic dive recorder (`src/lib/capture/`,
> `DYNAMIC_RECORDER_UX_PLAN.md`) is shipped. It already captures a
> `DiveTimeline` with per-lap splits, cumulative distances, and computed
> speeds, and seeds a dive-log bundle (`avgSpeed`, `maxRepSpeed`,
> `minRepSpeed`, `laps[].speedMs`, `laps[].timeSeconds`,
> `laps[].distanceMeters`).
>
> This plan covers the broader app changes that become possible now that
> these per-lap metrics exist:
>
> 1. Routine builder support for time-per-lap and speed metrics, with a
>    choice between **manual entry** and **auto-capture via the recorder**.
> 2. Session detail view that surfaces per-lap time + speed for dynamic
>    dives, plus overall time and speed.
> 3. Analytics that feature time-per-lap and speed as first-class
>    dynamic-discipline metrics.

---

## 1. What we already have (so we don't re-invent)

### Types (`src/lib/types.ts`)
- `LapData { lapNumber, timeSeconds?, distanceMeters?, speedMs?, restAfterSeconds?, kicks?, armPulls?, ... }`
- `RoutineLog.laps?: LapData[]`
- `RoutineLog.avgSpeed?`, `maxRepSpeed?`, `minRepSpeed?`
- `DiveTimeline { diveStartMs, diveEndMs, laps: LapEvent[], subSplits?, events }`
  — produced by the recorder, persisted per dive.
- `TrackingConfig.trackTimePerLap`, `trackTotalDistance`,
  `trackTotalTime`, `trackKicksPerLap`, `trackArmPullsPerLap`.
- `MetricType` already lists `avgSpeed`, `maxRepSpeed`, `minRepSpeed`,
  `avgTimePerLap`.

### Recorder-side
- `src/lib/capture/timeline.ts` — pure helpers to append walls/splits and
  compute `splitMs`, `cumulativeDistanceM`, `speedMs`.
- `src/routes/(app)/dive/record/[id]/+page.svelte` stashes a
  `TimelineSummary` in `sessionStorage` under
  `dive-log-seed:{sessionId}` which the dive-log form reads.
- `src/routes/(app)/dives/+page.svelte` already pulls
  `summary.laps[].avgSpeedMs` and `summary.averageSpeedMs` into the saved
  log.

### UI-side gaps today
- Session detail (`src/routes/(app)/session/[id]/+page.svelte`) shows
  `avgSpeed`, `maxRepSpeed`, `minRepSpeed` as flat numbers but **does
  not render a per-lap table** (time, speed, distance, cumulative).
- Routine builder has no concept of "auto-capture via recorder" — all
  tracking toggles assume manual entry.
- Analytics does not feature speed or time-per-lap for dynamic
  disciplines.

---

## 2. Scope of this plan

### In scope
- **A.** Routine-builder changes: add a "Capture source" (manual /
  recorder / either) per dynamic metric, and make sure the metric set
  covers time-per-lap, speed-per-lap, overall time, overall speed,
  distance.
- **B.** Session detail: per-lap table for dynamic dives + overall
  time/speed panel.
- **C.** Analytics: featured dynamic metrics (avg speed, best/worst lap,
  lap-split trend).
- **D.** Writing plan — which Firestore fields are authoritative and
  when to backfill legacy dives.

### Out of scope (handle separately if needed)
- Changes to the recorder UX itself.
- New disciplines.
- Video editing / re-analysis from recorded video.
- Social / comparison features.

---

## 3. Proposed changes

### A. Routine builder

**Goal:** let a routine declare that it tracks per-lap time, per-lap
speed, and overall time/speed for dynamic disciplines — and declare
whether those values are entered manually or captured automatically by
the recorder.

**A.1 New `TrackingConfig` fields (proposed):**

```ts
// Speed metrics (dynamic only)
trackAvgSpeed: boolean;       // Overall avg speed (m/s)
trackSpeedPerLap: boolean;    // Per-lap speed (m/s)
// (trackTimePerLap already exists)
// (trackTotalDistance, trackTotalTime already exist)
```

**A.2 New per-metric capture-source annotation:**

Instead of a boolean per metric, introduce a small enum **or** a parallel
`captureSource` record. Two shapes to choose from:

- **Option 1 — enum per metric** (clear, verbose):
	```ts
	type CaptureSource = 'manual' | 'recorder' | 'either';
	interface TrackingConfig {
	  trackTimePerLap: boolean;
	  timePerLapSource?: CaptureSource; // default 'either'
	  trackSpeedPerLap: boolean;
	  speedPerLapSource?: CaptureSource;
	  trackAvgSpeed: boolean;
	  avgSpeedSource?: CaptureSource;
	  // ...
	}
	```
- **Option 2 — one `captureSources` map** (less code churn):
	```ts
	interface TrackingConfig {
	  // existing booleans unchanged
	  captureSources?: Partial<Record<MetricType, CaptureSource>>;
	}
	```

**A.3 Routine builder UI:**
- For each dynamic metric toggle, add a 3-way segmented control:
  `Manual` / `From recorder` / `Either`.
- Default for a brand-new dynamic max routine:
  - `trackTotalDistance` → Either
  - `trackTotalTime` → Either
  - `trackTimePerLap` → From recorder
  - `trackSpeedPerLap` → From recorder
  - `trackAvgSpeed` → Either (auto-derived if recorder used)
- A small help tooltip: *"From recorder" means the app will auto-fill
  this when you log the dive via the in-app dive recorder.*

**A.4 Log-form behaviour (`QuickLogForm.svelte`):**
- If metric source = `recorder` and no recorder seed is present → show
  the field but disabled with an inline CTA "Record a dive to capture
  this automatically" (link to `/record`).
- If metric source = `recorder` and a seed *is* present → render as
  read-only with the captured value + a subtle "From recording" badge.
- If source = `manual` → always editable input.
- If source = `either` → editable, pre-filled from seed if present.

---

### B. Session detail — per-lap view for dynamic dives

**Goal:** when a dynamic routine log has `laps[]` with time/speed data
(whether from recorder or manual entry), show them as a first-class
table. Also expose overall time and overall speed as a summary strip.

**B.1 Render conditions:**
- Discipline ∈ {DYN, DYNB, DNF}, **and**
- `log.laps` is non-empty with at least `timeSeconds` populated.

**B.2 Per-lap table columns:**
| Lap # | Split time | Cumulative time | Distance | Cumulative distance | Speed (m/s) |

- Split time = `laps[i].timeSeconds`.
- Cumulative time = running sum of split times.
- Distance = `laps[i].distanceMeters` (fall back to `poolLength`).
- Cumulative distance = running sum (authoritative = `poolLength × lapNumber`
  for wall taps).
- Speed = `laps[i].speedMs` (fall back: `distance / splitTime`).

**B.3 Overall panel:**
- Total time (existing `log.totalTime` / `diveDuration`).
- Total distance (existing).
- Avg speed (existing `log.avgSpeed`, fallback = `totalDistance / totalTime`).
- Best lap speed / slowest lap speed (existing
  `maxRepSpeed` / `minRepSpeed`).

**B.4 Visual treatment:**
- Compact table on mobile; sparkline / bar of speed-per-lap above the
  table for quick scan.
- Fastest lap highlighted; slowest lap muted.
- If a recorded video is attached, clicking a lap row jumps the video
  to that lap's `atMs` (already supported by `DiveVideoPlayer`
  annotated scrub bar).

---

### C. Analytics

**Goal:** feature time-per-lap and speed for dynamic disciplines.

**C.1 New analytics cards (dynamic discipline filter):**
1. **Avg speed over time** — line chart of `avgSpeed` per dynamic log,
   windowed 1M / 6M / 1Y.
2. **Best lap speed** — scatter of `maxRepSpeed` with PB envelope line.
3. **Pacing profile** — per-lap speed curve averaged across recent
   dives (e.g. last 10) — shows whether the athlete fades or finishes
   strong.
4. **Speed vs distance** — scatter of `avgSpeed` vs `totalDistance` to
   visualise how speed changes as distance increases (is the athlete
   slower on max attempts?).

**C.2 Entry points:**
- Analytics page gets a new **Dynamic** tab (or section) that only
  appears if the user has any dynamic logs with speed/lap data.
- Each card has the existing 1M / 6M / 1Y window toggle.

**C.3 Data source priority:**
- Prefer `log.laps[]` (per-lap speed).
- Fall back to computed values (`totalDistance / totalTime`) when laps
  are not recorded.
- Clearly label computed fallbacks (muted style).

---

### D. Data / schema decisions

- **No new top-level fields required** for C. The existing
  `avgSpeed`, `maxRepSpeed`, `minRepSpeed` and `laps[].speedMs` are
  sufficient.
- **New** `TrackingConfig` fields: `trackAvgSpeed`, `trackSpeedPerLap`
  (plus capture-source — pending Option 1/2 decision).
- **Normalisation rule:** whenever a dive is saved with `laps[]` that
  contain `timeSeconds` and `distanceMeters`, compute `speedMs`
  client-side (already done by the recorder seed; make sure manual log
  form does the same).
- **Backfill:** existing logs from before this change lack `laps[]`.
  Don't force-backfill; analytics should handle absence gracefully.
- **Default routines:** update the three dynamic max/submax templates in
  `scripts/seed-data.ts` to enable the new metrics with
  `captureSource: 'either'`.

---

## 4. Implementation phases

Phased so each ships independently and can be QA'd in isolation:

- **Phase 1 — Session detail per-lap table.** Pure render change over
  data the recorder already writes. Lowest risk, highest visible value.
- **Phase 2 — Routine builder metric toggles + capture source.** Adds
  `TrackingConfig` fields and builder UI. Requires a small migration in
  seed data and TypeScript exhaustive-check updates.
- **Phase 3 — QuickLogForm wiring.** Honour the new capture-source flag:
  disable/annotate recorder-sourced fields, show manual inputs where
  applicable.
- **Phase 4 — Analytics Dynamic tab.** New cards on
  `/analytics`.

Phases 1 and 4 can be done in parallel. Phase 3 depends on Phase 2.

---

## 5. Test plan

- **Unit (existing):** add cases to `timeline.test.ts` confirming
  `speedMs` is populated for every lap and matches `distance/time`.
- **Unit (new):** per-lap table render helper — pure function that maps
  `LapData[] + poolLength → TableRow[]` (split, cumulative, speed,
  highlighted flags). Keep it pure so it's trivially testable.
- **Unit (new):** `resolveMetricInput(config, metric, seed)` returns
  `'readonly-from-recorder' | 'editable-prefilled' | 'editable-empty'
  | 'disabled-needs-recorder'`. This is the single source of truth the
  `QuickLogForm` uses; unit tests enumerate all combinations.
- **Manual QA checklist** (mirroring
  `docs/dynamic-video-qa-checklist.md`):
  - Record a DYN dive via recorder → open session detail → see per-lap
    table + speeds.
  - Manual log of a dynamic routine with `trackTimePerLap` enabled and
    source = manual → user can enter times; speeds auto-compute.
  - Analytics Dynamic tab shows data for the recorded dive and renders
    gracefully for an account with no laps data.

---

## 6. Open questions (for user before implementation)

1. **Capture-source shape** — prefer Option 1 (explicit per-metric enum)
   or Option 2 (single `captureSources` map)? Option 1 is more explicit
   in forms, Option 2 is less schema churn. *Option 1*
2. **Default behaviour for existing default routines** — retro-apply
   `trackSpeedPerLap` + `trackTimePerLap` to the seeded Dynamic Max /
   Submax / Sweet 16 templates, or leave them untouched and only apply
   new defaults to newly-created routines? *yes, go ahead and retro-apply*
3. **Routine-builder UI** — 3-way segmented control `Manual / Recorder
   / Either`, or 2-way `Manual / Recorder` (no "either")? The "either"
   option is more forgiving but adds UX clutter. *3-way is preferred*
4. **Per-lap table scope** — show for *any* dynamic log with
   `laps[].timeSeconds`, or gate strictly on the dive having been
   recorded via the in-app recorder? *show for any dive that has data recorded, either manually or by the in-app recorder*
5. **Missed laps / auto-advance** — the recorder can auto-advance a
   waypoint when the diver crosses 10 m past it. Should the per-lap
   table mark such laps visually (e.g. a small "auto" badge)? *no need*
6. **Analytics tab gating** — show the Dynamic tab always (with empty
   state) or only when the user has ≥1 dynamic log with speed data? *always. It should be slef evident that the analytics will become relevant when more data is collected*
7. **Speed units** — m/s everywhere, or add a per-user preference
   (m/s vs seconds-per-50m, which is a common freediver pacing unit)? *m/s*
8. **Pacing-profile card (C.1.3)** — average over last N dives, or per
   discipline (DYN vs DNF vs DYNB), or both? Averaging across
   disciplines could be misleading. *averaging must be between disciplines, not across them*
9. **Legacy logs** — any interest in a one-off migration that synthesises
   `avgSpeed` from `totalDistance / totalTime` for historical records
   that have both but no `laps[]`? (Cheap; avoids dimmed "–" values in
   the new analytics.) *I don't think so. The total time captured in these logs may not be accurate and could throw of analytics*
10. **Naming** — Keep `avgSpeed` / `maxRepSpeed` / `minRepSpeed`, or
    rename to `avgSpeedMs` / `fastestLapSpeedMs` / `slowestLapSpeedMs`
    for unit clarity? (Rename would require a normalisation layer.) *Let's rename for clarity going forward*

---

## 7. TODO list (placeholder — do not start until approved)

- [ ] Answer open questions above.
- [ ] Phase 1: per-lap table on session detail.
- [ ] Phase 2: `TrackingConfig` additions + routine builder UI.
- [ ] Phase 2b: seed-data update for default dynamic routines.
- [ ] Phase 3: `QuickLogForm` capture-source wiring + `resolveMetricInput`
  helper + tests.
- [ ] Phase 4: Analytics Dynamic tab (4 cards).
- [ ] Phase 4b: (optional) legacy `avgSpeed` backfill script.
- [ ] QA pass using a fresh account + a seeded account with recorded
  dive + a seeded account with only manual logs.
