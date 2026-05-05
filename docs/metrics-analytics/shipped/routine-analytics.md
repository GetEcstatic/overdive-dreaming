# Per-Routine Analytics Page — Planning Doc

> Status: Planning approved — decisions locked in (see §5). Ready to implement.
> Trigger: From the session detail page, pressing **Analytics** currently navigates to
> `/analytics?routine={routineId}&discipline={discipline}` but lands on the global
> analytics page which ignores those params. Goal: replace that destination with a
> dedicated, powerful per-routine analytics page.

## 0. Decisions (locked)

Based on user feedback on §5:
- **Keep both** `/analytics` (global dashboard) and `/routines/[id]/analytics`
  (per-routine deep dive). They serve different purposes.
- **N-way compare**, not A/B. Build grouping as a generic helper so users can
  pick one dimension and see all its values side-by-side. All tracked metrics
  available as dimensions for now (we can filter later if some prove unhelpful).
- **Auto-suggested scatter insights**: scan correlations across numeric
  metric pairs and surface the top 1–3 by |R²| as chips the user can click to
  apply. Keeps manual picker too.
- **Saved views = v2.** Not in scope for v1.
- **User-configurable metric visibility**: add a multi-select in
  profile/settings letting users hide specific metrics from chart/metric
  pickers app-wide. Store as `UserSettings.hiddenAnalyticsMetrics: string[]`.
  Applied everywhere metrics are listed (progress metric picker, scatter axes,
  compare dimensions).

---

## 1. Current State (what exists)

- `src/routes/(app)/session/[id]/+page.svelte` — session detail page
  - Shows a `MiniAnalytics` card (line chart of hero metric over time)
  - `handleViewAnalytics()` → `goto('/analytics?routine=…&discipline=…')`
- `src/routes/(app)/analytics/+page.svelte` — **global** analytics page
  - Training summary, PBs, progress chart for max-attempt routines
  - Breathing impact scatter, time-of-day, RPE zones
  - Does not read `routine` or `discipline` query params → so the button's
    intent is silently lost today.
- `src/lib/components/MiniAnalytics.svelte` — small line chart of the routine's
  hero metric; already filters to a single routineId.
- Chart primitives: `LineChart.svelte`, `ScatterChart.svelte`, plus specialised
  `RPEZoneChart`, `VolumeChart`, `TimeOfDayAnalysis`, `PBProximityChart`.
- Aggregation helpers: `src/lib/utils/analytics.ts`, `metrics.ts`,
  `personalBests.ts`.
- Per-log data surface is very rich (see `RoutineLog` in `src/lib/types.ts`):
  performance (distance/time/reps/per-rep), context (pool, temperature, gear,
  cycle day, fasting, mood, HR/HRV, weight, FVC), biometrics (SpO₂/HR traces),
  perception (RPE, joy, lucidity, urge, contractions), tags, competition flag,
  and selectable tags from the routine template.

---

## 2. What's most useful to the user (prioritised)

The value of a *per-routine* analytics view is that it holds the activity
constant (same routine template, same tracking schema), so users can isolate
the effect of other variables. Priorities, ranked:

### Tier A — "always useful"

1. **Progress over time for the routine's hero metric**
   - Line chart of hero metric (distance / hold time / reps / avg pace)
   - Toggleable metric picker: any metric the routine's `trackingConfig`
     actually captures (distance, time, reps, avg time/rep, avg speed,
     longest hold, SpO₂ min, contractions onset time, etc.).
   - PB markers on the line, trend arrow, rolling average.

2. **Personal Bests & milestones for this routine**
   - Best ever, best last 30d, best by discipline (for multi-discipline routines).
   - Sessions-since-last-PB counter.

3. **Headline stats**
   - Count of sessions, total volume (m or s), avg / median / best / worst,
     standard deviation (consistency), last session vs 4-week avg.

### Tier B — "compare & explain"

4. **Compare groups (A vs B)**
   Two configurable filter chips that split logs into two cohorts, plotted on
   the same chart or as box/bar summaries. Ready-made presets per routine:
   - Equipment: *noseclip* vs *mask* vs *goggles* (uses `facialGear`)
   - Pool length: 25m vs 50m
   - Pool type: indoor vs outdoor
   - Fasting: `hoursSinceLastMeal` bucketed (<3h / 3–8h / 8–14h / >14h)
   - Breathing technique level: hypo / tidal / hyper
   - Time of day: morning / afternoon / evening
   - Cycle phase (if opted-in): days 1–10 / 11–20 / 21–30
   - Competition vs training
   - Buddy present vs solo
   - Selected tags chosen at log time

5. **Metric-vs-metric scatter (correlation explorer)**
   Pick X and Y from the routine's tracked fields; colour by a third
   categorical (e.g., facialGear). Examples:
   - `initialBreatheUpTime` vs `diveDistance`
   - `contractionsOnsetTime` vs `diveDuration`
   - `restingHeartRate` vs result
   - `waterTemperature` vs result
   Linear regression line + R² for quick feedback.

6. **Rep-level detail (for interval / hybrid routines)**
   - Distribution of per-rep time/distance/rest across a single session.
   - Decay curve across reps within a session, averaged across many
     sessions (do my last reps get slower?).
   - Speed fade %: `(rep1 - repN) / rep1`.

### Tier C — "nice to have, depth"

7. **Biometric overlay** (dry STA / O₂ assisted)
   - Avg SpO₂ trough across sessions, time-below-70/60/50/40 trend.
   - HR min vs hold duration.

8. **Consistency / variability**
   - Box plot or violin of hero metric per month; CV% of result over time.

9. **Readiness & recovery correlates**
   - Mood / sleep proxies / HRV vs result, shown as small correlation cards.

10. **Saved views** — user saves a filter+metric+chart combo; shown as
    quick chips at top of the page.

---

## 3. What it might look like (UX)

**Route:** `/routines/{routineId}/analytics` (new, nested under routines)
so we can keep `/analytics` as the global dashboard.

**Header**
- Back button → returns to session detail (or routine page).
- Routine name, disciplines, tags.
- Timeframe filter (reuses global timeframe component: 1m / 6m / 1y / All /
  Season — default from user settings).
- If the routine supports multiple disciplines, a discipline pill row.

**Section 1 — Overview cards (row of small stats)**
Sessions · PB · Last session · 4-wk avg · Trend arrow · Consistency (CV%).

**Section 2 — Progress chart (primary)**
Large `LineChart` of the selected metric.
- Metric picker dropdown, populated from the routine's `trackingConfig` +
  the standard calculated metrics (`totalBreathHoldTime`,
  `avgTimePerRep`, etc.).
- Toggle: *show PBs*, *show rolling avg*, *points only*.
- Optional "lower is better" flag honoured (interval time metrics).

**Section 3 — Compare (N-way)**
A single dimension picker (equipment, pool length, pool type, fasting band,
cycle phase, breathing level, time-of-day, tag, competition, …). The page
shows one row per non-empty value of that dimension. Chart modes:
- **Trend**: overlaid line chart, one line per value.
- **Summary**: horizontal bar of mean + PB + n per value; error bars = stdev.
- **Box**: box plot per value.

Values with n < 3 are rendered greyed-out with an "n=2" label to avoid noise.

**Section 4 — Explore (scatter)**
X-metric × Y-metric × colour-by, with an R² readout. Above the manual picker,
show 1–3 **auto-suggested insight chips** — the strongest correlations
(highest |R²|, min n=5) across the routine's numeric metric pairs. Click a
chip to apply. Defaults tailored to the routine (e.g. STA max →
`contractionsOnsetTime` × `diveDuration`).

**Section 5 — Rep detail** (only for interval / hybrid routines)
- Per-rep line within a single session (session selector).
- Average rep curve (mean ± 1σ ribbon).
- Fade % card.

**Section 6 — Biometrics** (only if any session has biometric data)
- Re-use `BiometricTimeChart` aggregated view.
- Time-below-threshold trend.

**Section 7 — Session list**
Filter-aware table of the underlying sessions, clickable to session detail.
This is the "show your work" escape hatch and keeps drilling-down honest.

**Mobile behaviour**
- All sections stack vertically (we are mobile-first).
- Filter bar is sticky; metric picker and compare groups are bottom sheets.
- Charts reuse existing Chart.js wrappers so sizing already works.

---

## 4. Implementation plan

### 4.1 Routing

- Add `src/routes/(app)/routines/[id]/analytics/+page.ts` (loader) and
  `+page.svelte` (view).
- Loader reads `params.id`, fetches the routine template
  (`getRoutineById`) and all that user's logs for that routine
  (`getRoutineLogsByRoutine`). Respect timeframe/season from query params,
  defaulting from `UserSettings.defaultAnalyticsFilter`.
- Update `handleViewAnalytics()` in
  `src/routes/(app)/session/[id]/+page.svelte` to
  `goto('/routines/' + routine.id + '/analytics?discipline=' + disciplineUsed)`.
  (Keep old `/analytics?routine=` as a redirect for back-compat.)

### 4.2 Data helpers (extend `src/lib/utils/analytics.ts`)

New pure functions, all typed against `RoutineLog`:

- `getAvailableMetricsForRoutine(routine, hiddenMetrics?)` — returns the
  list of metrics that make sense given `trackingConfig` + calculated
  metrics, minus anything in the user's `hiddenAnalyticsMetrics`.
- `bucketLogsBy(logs, dimension, values?)` — generic N-way grouping helper
  that supports numeric bands (fasting hours, cycle day) and categorical
  (facialGear, poolType, tags, timeOfDay, competition). Returns
  `Map<value, RoutineLog[]>` so the same helper powers compare trend, bar,
  and box modes.
- `summariseGroup(logs, metric, routine)` → `{ n, mean, median, stdev,
  min, max, pb, trendPct }`.
- `linearRegression(xs, ys)` → `{ slope, intercept, r2 }`.
- `suggestCorrelations(logs, metrics, opts?)` → top-k numeric metric pairs
  ranked by |R²| with n ≥ 5 (for scatter auto-insights).
- `repFadePercent(log)` and `averageRepCurve(logs)`.

Unit-testable; no Firestore in these helpers.

### 4.3 Components

New components in `src/lib/components/analytics/routine/`:

- `RoutineAnalyticsHeader.svelte` — title, filters, discipline tabs.
- `OverviewStats.svelte` — small stat cards (reuse styles from dashboard).
- `ProgressChart.svelte` — wraps `LineChart`, metric picker, PB/rolling toggles.
- `CompareGroupsCard.svelte` — dimension picker + N-way chart mode toggle
  (trend / summary / box). Reuse `LineChart` and a tiny custom bar.
- `MetricScatterCard.svelte` — X/Y/colour pickers + `ScatterChart` + R² +
  auto-suggested insight chips row.
- `RepDetailCard.svelte` — session picker + rep line chart + fade stat.
- `BiometricSummaryCard.svelte` — thin wrapper over `BiometricTimeChart`.
- `RoutineSessionsList.svelte` — filter-aware table.

Keep each component ≤ ~200 LOC; push logic into `analytics.ts`.

### 4.4 Visibility / showing only what's relevant

The page conditionally renders sections based on the routine:
- Rep detail: only when `SimplifiedRoutineType` is `interval-series` or
  `hybrid` (or when logs have `laps`/`summary.repsCompleted`).
- Biometrics: only when any log has `hasBiometricData`.
- Compare dimensions: only offer a dimension if at least 2 logs have
  non-empty values for it (dynamic discovery from the user's own data).

### 4.5 Caching / performance

- Fetch once per routine+timeframe; memoise in a small module-level
  Map like `dashboardCache.ts`.
- All aggregations run client-side on already-fetched logs — no extra
  Firestore reads for group switching.

### 4.6 Settings & defaults

- Respect `UserSettings.defaultAnalyticsFilter` and `defaultTimeframe`.
- Persist last-used metric / compare dimension per routine in localStorage
  (keyed by `routineId`) so returning users keep their view.
- Add `UserSettings.hiddenAnalyticsMetrics?: string[]` — a list of metric
  keys the user has chosen to hide from analytics pickers. Surface in
  `/profile` as a searchable multi-select (reuse the simplified builder's
  tag selector style). All analytics metric-list helpers filter by this.

### 4.7 Rollout steps (suggested order)

1. Add route + loader; wire the session-detail button to it; keep
   `/analytics?routine=` working via a server redirect for back-compat.
2. Port `MiniAnalytics` content into `ProgressChart` with a metric picker
   (honouring `hiddenAnalyticsMetrics`).
3. Overview stats + PB markers.
4. Add `UserSettings.hiddenAnalyticsMetrics` + profile UI multi-select.
5. Compare Groups (N-way) — start with equipment, fasting, pool length,
   then add the rest via the generic `bucketLogsBy` helper.
6. Scatter explorer with auto-suggested insight chips.
7. Rep detail (interval / hybrid routines).
8. Biometrics card.
9. Sessions list.
10. (v2) Saved views.

Each step ships a visibly better page; nothing is blocked on the next.

---

## 5. Open questions for the user

1. Should `/analytics` (global) remain, or should it be demoted / folded
   into "all routines"? My default: keep both; global is the dashboard,
   per-routine is the deep dive. *Yes, keep both is the preference. Deep dives from the routine itself*
2. Is A/B compare enough, or do we also want N-way compare (e.g. all
   three facialGear options at once)? Implementation-wise N-way is almost
   free if we build it as a generic grouping — leaning towards N-way. *N-Way is better. I suspect some of the metrics might not be suitable for comparison, but for the time being let's say they should all be available*
3. For the scatter explorer, do we want pre-canned "insights" (e.g.
   auto-suggest the strongest correlation) or only user-driven? *Auto suggest is the preference I think. It could become overwhelming otherwise*
4. Do we want saved views in v1 or is that v2? *v2 only*
5. Any metrics that should *never* be shown per-routine (e.g. body weight
   might feel too personal to plot)? *I don't think so for now, but could this be user selectable some how? A drop down with checklist items the user can check so that they never appear as options on the various charts?*

