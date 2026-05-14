# Multi-Layer Log Round-Trip Plan

Status: planned.

This plan covers two related but separate mismatches found after logging a multi-layer routine such as Pingu through Quick Log:

1. Editing the saved session from the session detail page does not use the new Quick Log row model and does not hydrate the row editor from saved row data.
2. The session detail page, mini analytics, and metric helpers still primarily read legacy top-level fields instead of deriving display values from `plannedRows` and `resultRows`.

The two projects should be implemented separately. The first project fixes edit round-trip behavior. The second project fixes read/display/analytics behavior.

## Investigation Summary

Quick Log create now saves three row-aware structures:

- `plannedRows`: the effective layer plan at log time, including row discipline and selected layer discipline effects.
- `resultRows`: per-planned-row actual duration, distance, rest, completion, and notes.
- `laps`: legacy-compatible row/lap data generated from the `RepEditor` table.

The save path in `src/routes/(app)/dives/+page.svelte` persists these values. The mismatch starts after save, because the edit and display paths do not treat `plannedRows` plus `resultRows` as the source of truth.

## Project 1: Edit Form Row Round-Trip

### Problem

The session detail edit flow opens `EditRoutineLogModal`, which renders `EditableLogForm`. That form predates the new mixed-layer Quick Log surface.

Current issues:

- `EditableLogForm` has its own layout and does not match the current `QuickLogForm` Row Results experience.
- It hydrates `repEditorData` from `laps`, not from `plannedRows` and `resultRows`.
- Its `RepEditor` call does not pass `plannedRows`, so static/dynamic row shape is lost.
- It only shows the rep editor under the Lung Volume section for multi-rep routines, not as the promoted Row Results card.
- It submits `laps`, but not `plannedRows` or `resultRows`.
- `EditRoutineLogModal` compares and writes legacy top-level fields but does not rebuild row-derived summaries or row result data.
- Overall distance and time can drift because the edit form can change totals independently from rows, or keep stale totals while rows are missing.

### Design Direction

Editing should reuse the same row-first mental model as Quick Log. The saved log should open into a form that looks and behaves like the create flow, with the Row Results editor populated from the saved row data.

Do not keep two separate row editing systems. Either:

- make `QuickLogForm` support edit mode and existing media actions; or
- extract a shared `RoutineLogFormCore` used by both Quick Log create and session edit.

The lower-risk first implementation is to add edit seeding support to `QuickLogForm`, then have `EditRoutineLogModal` use it for row-first routines. The older `EditableLogForm` can remain temporarily for legacy/simple logs until the shared form is complete.

### Required Data Conversions

Add pure helpers before UI wiring:

1. `routineLogRowsToRepEditorData(plannedRows, resultRows, laps)`
   - Prefer `resultRows` when present.
   - Fall back to `laps` for older logs.
   - Preserve row number, duration, distance, rest, completion, notes, lung volume, SpO2, HR, kicks, and pulls where available.
2. `repEditorDataToRoutineLogRows(plannedRows, reps)`
   - Produce `laps` and `resultRows` together from the same edited rep data.
   - Keep static rows from producing dynamic distance/kicks/pulls values.
3. `deriveRoutineLogSummaryFromRows(plannedRows, resultRows)`
   - Produce `repsCompleted`, total duration, dynamic-only distance, dynamic-only average speed, and any supported row-derived summary values.
   - Use the same semantics as `deriveQuickLogRowSummary`.

These helpers should live outside Svelte components so create, edit, detail, and tests all share the same rules.

### Implementation Steps

1. Add pure conversion/summary helpers for `plannedRows`, `resultRows`, `laps`, and `RepEditorData`.
2. Add focused tests using a Pingu-style static-to-dynamic plan.
3. Extend `QuickLogForm` initial values so it can accept saved `plannedRows`, `resultRows`, and selected per-layer disciplines.
4. Seed `repEditorData` from saved `resultRows` before falling back to `laps`.
5. Make `QuickLogForm` support edit mode labels and submit updates without assuming create-only behavior.
6. Update `EditRoutineLogModal` to use the row-first form for logs with `plannedRows` or row-first routines.
7. On edit submit, always write `plannedRows`, `resultRows`, `laps`, and row-derived totals together.
8. Ensure date/time, visibility, attempt conditions, media actions, and existing advanced fields still round-trip.
9. Keep `EditableLogForm` only as a fallback for older logs until the shared form fully replaces it.
10. Run focused helper tests, Quick Log tests, and `npm run check`.

### TODO Checklist

- [ ] Add row conversion helpers for saved log to `RepEditorData`.
- [ ] Add row conversion helpers for `RepEditorData` back to `laps` and `resultRows`.
- [ ] Add row summary helper shared by create/edit/detail.
- [ ] Cover mixed static-to-dynamic rows in unit tests.
- [ ] Seed edit `RepEditor` from `resultRows` before `laps`.
- [ ] Pass planned rows into the edit `RepEditor` so row discipline shape is preserved.
- [ ] Preserve selectable layer discipline state on edit.
- [ ] Write updated `plannedRows`, `resultRows`, and `laps` together on edit save.
- [ ] Recalculate total time, dynamic distance, and average speed from edited row data.
- [ ] Keep media edit actions working.
- [ ] Keep legacy/simple edit behavior working while migration is incomplete.
- [ ] Run focused tests and `npm run check`.

## Project 2: Session Detail And Metrics Row Read Model

### Problem

The session detail page and analytics still read mostly legacy top-level fields.

Current issues:

- Hero metrics use `getFormattedMetric`, which resolves through `getMetricValue` and legacy fields such as `totalDistance`, `totalTime`, `repDistance`, `repDuration`, and `laps`.
- `getMetricValue` does not use `plannedRows` and `resultRows` as an authoritative source.
- Session detail Performance Metrics displays top-level fields directly and does not show a row/layer breakdown.
- Per-lap splits are shown only for dynamic `disciplineUsed` logs with `laps`, which misses mixed logs where the top-level discipline is a simplification.
- MiniAnalytics charts use the same legacy metric resolver, so mixed-layer history can chart stale or incomplete totals.
- Normalization mirrors old and new top-level aliases, but it does not derive canonical display metrics from row data.

### Design Direction

Introduce a read model for saved routine logs, parallel in spirit to `quickLogReadModel`, but focused on persisted data.

The read model should answer:

- What rows were planned?
- What rows were completed?
- Which rows are static and which are dynamic?
- What total time should be displayed?
- What dynamic distance should be displayed?
- What dynamic-only average speed should be displayed?
- What row/layer breakdown should be shown on the session detail page?
- Which legacy top-level fields are stale or only fallback values?

The UI should use this read model wherever possible, and fall back to legacy fields only when row data is missing.

### Proposed Read Model

Add a pure helper such as `buildRoutineLogResultReadModel(log, routine)` returning:

- `hasRowResults`
- `rows`: merged planned/result row display records
- `layerGroups`: rows grouped by `sourceLayerId`
- `completedCount`
- `totalDurationSeconds`
- `dynamicDistanceMeters`
- `dynamicDurationSeconds`
- `averageDynamicSpeedMs`
- `longestHoldSeconds`
- `cumulativeHoldSeconds`
- `totalRestSeconds`
- `legacyFallbacksUsed`

This helper should prefer `resultRows`, then `laps`, then top-level legacy fields.

### Session Detail UI Plan

1. Add a Row Results section to the session detail page when `plannedRows` or `resultRows` exist.
2. Show layer headers with static/dynamic badges, matching Quick Log language.
3. Show row actuals: rest, distance, time/hold, completion, notes, and technique/biometrics where present.
4. Keep the existing Performance Metrics grid, but source values from the read model first.
5. Only show Per-lap Splits for true dynamic split data; do not use it as the main mixed-routine row display.
6. Make hero and secondary metrics use the read model through `getMetricValue` or a new metric resolver wrapper.

### Metrics And Analytics Plan

1. Update metric resolvers to prefer row-derived values when `plannedRows` and `resultRows` are present.
2. Ensure dynamic distance and speed metrics ignore static rows.
3. Ensure total/cumulative hold metrics include static rows correctly.
4. Ensure session duration semantics are explicit: either dive/hold time only, or hold plus rest, depending on metric type.
5. Update MiniAnalytics to use the row-aware metric resolver without needing page-specific code.
6. Add tests for Pingu-style mixed logs and existing dynamic/static logs.
7. Consider a one-time normalization/backfill only after the read model is proven, not before.

### TODO Checklist

- [ ] Add `buildRoutineLogResultReadModel(log, routine)` or equivalent pure helper.
- [ ] Merge `plannedRows` and `resultRows` into row display records.
- [ ] Fall back from `resultRows` to `laps` for older logs.
- [ ] Derive total duration from completed rows.
- [ ] Derive dynamic distance from dynamic rows only.
- [ ] Derive dynamic average speed from dynamic rows only.
- [ ] Derive cumulative hold/longest hold from relevant rows.
- [ ] Update `getMetricValue` or add a row-aware resolver wrapper.
- [ ] Update session detail hero/secondary metrics to use row-aware values.
- [ ] Add a session detail Row Results section for mixed routines.
- [ ] Keep legacy top-level fields as fallback display only.
- [ ] Update MiniAnalytics to chart row-aware values.
- [ ] Add unit tests for mixed static-to-dynamic saved logs.
- [ ] Add regression tests for existing single-discipline logs.
- [ ] Run focused tests and `npm run check`.

## Sequencing

Implement Project 1 first. Editing must stop corrupting or dropping row data before the detail and analytics display layer becomes authoritative.

Then implement Project 2. Once detail and analytics use a saved-log read model, the app can safely reduce reliance on top-level legacy fields for multi-layer routines.