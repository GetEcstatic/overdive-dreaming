# Quick Log V2 Routine Audit

Status: audit and implementation plan. No code changes are included in this document.

## Goal

Make the quick log form fully aligned with v2 layer routines and the current routine-builder philosophy: derive the logging surface from routine data, keep poolside entry calm, show only relevant controls, and preserve enough structured row data for analytics and display metrics.

## Current Architecture Snapshot

- Primary UI: `src/lib/components/QuickLogForm.svelte`.
- Per-rep editor: `src/lib/components/RepEditor.svelte`.
- V2 row projection: `src/lib/routineLayers/logPlan.ts`.
- Routine shape: `RoutineTemplate.trackingConfig`, `RoutineTemplate.layers`, `RoutineLog.plannedRows`, and `RoutineLog.resultRows` in `src/lib/types.ts`.
- Save shell: `src/routes/(app)/dives/+page.svelte` builds `plannedRows` and `resultRows` after `QuickLogForm` submits.

The form is currently a large flag-gated component. It reads `trackingConfig` directly, owns a wide set of local states, emits `LogFormData`, and leaves v2 plan/result-row construction to the route save handler.

## What Is Working

| Area | Status | Notes |
|------|--------|-------|
| Tracking-flag gating | Mostly supported | Core session, performance, context, physiology, competition, lung volume, and O2-assisted controls are shown from `trackingConfig`. |
| Competition/card/record fields | Supported | Gated by `trackCompetitionStatus`, `trackCardColor`, and `trackRecordTag`; matches max-attempt-only projection when routines have current flags. |
| V2 planned rows on save | Partially supported | The save route builds `plannedRows` and `resultRows` using `buildRoutineLogPlanRows()` and `buildInitialRoutineLogResultRows()`. |
| Dynamic recorder seed values | Supported | Seeded distance/time/laps/speed can be read-only or editable via `resolveMetricInput()`. |
| Dry static biometrics | Supported | CSV import and `RepEditor` populate lap biometrics and summary values. |
| Advanced/static metrics | Supported at field level | FVC, packing, gas mix, end SpO2, recovery quality, urge, lucidity, contractions, and related fields can be captured when flags exist. |
| Display metric backend compatibility | Mostly supported | The log fields expected by the metric registry/resolvers are generally emitted and persisted by the route save path. |

## Findings

### 1. QuickLogForm is not yet v2-row-first

`QuickLogForm` still decides major behavior from legacy fields such as `routine.table`, `routine.numberOfReps`, `routine.repDistance`, and `routine.restBetweenReps`. The save route later builds v2 `plannedRows`/`resultRows`, but the form itself does not render from the `RoutineLogPlanRow[]` abstraction.

Impact:

- Multi-layer routines can be logged, but the form does not expose layer names or layer boundaries as first-class poolside context.
- The Static 2-Breath split between initial breathe-up and repeated two-breath reps is compressed into one generic rep editor experience.
- Row-level v2 metadata such as `sourceLayerId`, `analyticsRole`, `effort`, `environment`, and `diveCapabilities` is invisible during entry.

Recommended change:

- Move the logging surface to a plan-row-first model: build `plannedRows` before rendering, group them by source layer, and pass that structure into row/summary controls.

### 2. Repeated dynamic technique metrics are tracked but not loggable in the form

The v2 metric map and registry include `kicksPerLap`, `armPullsPerLap`, `averageKicksPerLap`, and `averageArmPullsPerLap`. `TrackingConfig` derives `trackKicksPerLap` for dynamic routines and `trackArmPullsPerLap` for DNF-capable routines. However, the visible quick log form does not provide per-lap kick or arm-pull inputs.

Impact:

- These metrics can be selected as display metrics, but many users cannot enter source data from Quick Log.
- DNF routines can expose arm-pull hero metrics while the form provides no obvious path to collect arm pulls.

Recommended change:

- Extend `RepEditor` or introduce a v2 row editor mode that supports technique columns when `trackKicksPerLap` and/or `trackArmPullsPerLap` are enabled.

### 3. Per-lap time and speed metrics are recorder-led, not manual-review friendly

`trackTimePerLap` and `trackSpeedPerLap` currently show a recorder CTA, a read-only captured-laps summary, or a hint that splits can be added later. There is no direct quick-entry or review-entry table for manual lap splits.

Impact:

- Dynamic routines without recorder seed data cannot enter lap splits from video review within the quick log flow.
- Speed metrics can be selectable as hero/secondary/tertiary metrics while their source data is deferred outside this form.

Recommended change:

- Add an optional `Splits` row editor for dynamic v2 rows. It should support distance, time, kicks, arm pulls, and calculated speed from distance/time.

### 4. Section organization does not yet match the routine-builder mental model

The builder is moving toward routine > layer > segment, with dense data revealed only when relevant. QuickLogForm still uses broad sections: Session Details, Performance, Training Context, O2-Assisted Static Metrics, Media.

Impact:

- The form is comprehensive but long and somewhat flat.
- Advanced fields appear as a large cluster rather than as task-focused groups.
- The user cannot easily see which controls came from which routine layer or why they are present.

Recommended change:

- Reframe Quick Log around a compact summary-first flow:
  - session header: date/time, discipline, visibility;
  - planned routine overview: layer rows and completion state;
  - selected layer/row editor for detailed values;
  - collapsible advanced physiology/context;
  - media last.

### 5. Some controls conflict with the restrained design direction

The current form includes emoji labels in functional controls and alerts, very expressive copy, and mixed control styles. Examples include wet/dry buttons, biometric headings, threshold alerts, and breathing labels.

Impact:

- It feels less consistent with the quieter builder UI.
- Mobile scanning is harder because decoration competes with the logged data.

Recommended change:

- Replace emoji-led labels with compact text, icons from the shared icon set where available, and restrained status badges.
- Keep warnings clear, but use the same badge/alert language as the builder and session screens.

### 6. `TrackingConfig` is collection capacity, but the form treats many flags as always-visible UI

The latest metric strategy treats `TrackingConfig` as what the routine can collect, not necessarily what should be prominent. QuickLogForm exposes nearly every enabled flag in one pass.

Impact:

- Advanced metrics can clutter normal poolside logging.
- Dry/O2/static fields become heavy for users who only want to record completion and notes.

Recommended change:

- Introduce standard/advanced disclosure inside Quick Log:
  - Standard: required/session-critical values and configured primary metrics.
  - Advanced: physiology, equipment, environment, and optional comparison/context fields.
- Persist all supported fields, but do not place all fields at the same visual priority.

### 7. Attempt type and lung volume overlap needs clearer source-of-truth handling

QuickLogForm has attempt type chips and a lung-volume chip row. `selectAttemptKind()` can set `defaultLungVolume`; `selectLungVolume()` can alter `attemptKind`. This is useful, but the interaction is partly implicit.

Impact:

- Users can create a category/lung-volume combination without seeing how it affects analytics/PB category labels.
- O2-assisted flows can set both `gasMix` from attempt conditions and `trackGasMix` fields.

Recommended change:

- Show a small generated attempt category preview after attempt/lung/gas selections.
- Normalize gas mix and lung volume through `attemptConditions` first, then mirror into direct fields only when metric display requires compatibility.

### 8. Stale routine flags still affect the logging surface

The new attachment audit and layer-editor refresh warning identify stale `trackingConfig` projections, but QuickLogForm has no warning when a routine is stale.

Impact:

- Existing v2 routines that have not been reprojected may silently hide newly supported metrics in Quick Log.

Recommended change:

- Add a non-blocking admin/debug warning in the log flow when a v2 routine's layer projection would change `trackingConfig` or `displayConfig`.
- For normal users, prefer fixing data via backfill rather than adding scary warnings.

## Support Matrix Against V2 Routine Features

| V2 feature | Quick Log support | Gap |
|------------|-------------------|-----|
| Single max dynamic/static attempts | Good | Needs calmer max-attempt layout and clearer recorder capability. |
| Multi-discipline selectable routines | Good | Discipline selection is legacy list-based, not layer-role-aware. |
| Multi-layer static tables | Improved | UI now shows layer groupings; result row emission still happens in the route save shell. |
| Repeated dynamic tables | Improved | Reps/distance/time plus kicks and arm pulls are supported; manual notes and recorder review affordance remain incomplete. |
| Dry static biometrics | Improved | Advanced disclosure hides heavier biometric controls unless the routine is dry/advanced. |
| Lung volume defaults and per-row overrides | Improved | Supported in RepEditor and now paired with an attempt category preview. |
| Dynamic recorder-linked rows | Partial | Recorder seed values are accepted; row-level `diveCapabilities` are not visible. |
| Competition/card/record comparison metrics | Good | Works when routine flags are current. |
| Registry-backed display metrics | Partial | Most source fields are persisted, but some selectable metrics lack first-class entry controls. |
| Existing v2 routines needing reprojection | Partial | Audit/backfill exists; Quick Log itself does not warn or refresh. |

## Implementation Plan

Current implementation status: Phase 1 is complete. Phase 3, Phase 4, and Phase 5 have partial UI/data support landed. Phase 2 and Phase 6 are still open and should be treated as the next behavioral/data-safety work before broader Quick Log changes.

### Phase 1: Pure v2 log form read model

- [x] Add a pure helper that builds a Quick Log read model from `RoutineTemplate`:
  - `plannedRows` from `buildRoutineLogPlanRows(routine)`.
  - layer groups by `sourceLayerId`.
  - field groups derived from `trackingConfig` and row shape.
  - standard vs advanced visibility classification.
- [x] Add fixtures/tests for Dynamic Max, Static Max, Sweet 16, Static 2-Breath, Dry RV, and a blank custom layer routine.
- [x] Document which metric registry entries still have no direct input control.

Acceptance check: Quick Log can answer what rows, layers, controls, and advanced groups are relevant without reading Svelte component state.

### Phase 2: Row-first result data

- [ ] Move initial `plannedRows`/`resultRows` construction closer to the form read model.
- [ ] Let QuickLogForm emit row-level results for edited reps rather than only summary fields.
- [ ] Preserve current summary fields for compatibility during the transition.
- [ ] Add tests proving multi-layer static tables preserve layer IDs and per-row completion.

Acceptance check: Static 2-Breath logs show one initial-breathe-up row plus repeated two-breath rows in `resultRows`, with correct source layer IDs and completion state.

### Phase 3: Technique and split entry

- [x] Extend `RepEditor` or add a v2 row editor mode for dynamic rows.
- [ ] Add optional columns for lap time, distance, kicks, arm pulls, and notes based on `trackingConfig`.
- [x] Calculate speed from row distance/time when no recorder speed is supplied.
- [ ] Keep recorder-seeded rows read-only by default, with an explicit edit/review affordance.

Partial status: distance/time already existed, kicks and arm pulls now use wheel inputs and persist into `laps`; per-row notes and a clearer recorder review mode remain open.

Acceptance check: A DNF-capable routine with `trackArmPullsPerLap` can collect arm pulls in Quick Log and display `averageArmPullsPerLap` on cards.

### Phase 4: UX realignment

- [ ] Replace broad always-open sections with compact groups:
  - Session
  - Routine Plan
  - Results
  - Context
  - Advanced
  - Media
- [x] Show a compact layer/row overview before the detailed row editor.
- [x] Make advanced physiology/context fields collapsed by default unless the routine is specifically an advanced/O2/dry physiology routine.
- [ ] Remove emoji-led labels from form controls and replace them with restrained badges or shared icons.
- [ ] Keep cards and panels shallow; avoid nested-card visual noise.

Partial status: the routine plan overview and advanced disclosure have landed, and the loudest Quick Log labels/alerts have been quieted. A full section restructure and complete icon/text cleanup are still open.

Acceptance check: A user can log a simple max attempt with date, result, notes, and save visible without scrolling through advanced fields.

### Phase 5: Attempt/category consistency

- [x] Add an attempt category preview showing PB/analytics bucket label.
- [ ] Make lung volume, breathing gas, and custom category interactions explicit.
- [ ] Ensure `attemptConditions`, direct `gasMix`, and `defaultLungVolume` cannot drift in contradictory ways.
- [ ] Add tests for standard, FRC, RV, O2-assisted, and custom attempts.

Acceptance check: Saved logs have consistent `attemptConditions`, `pbCategoryKey`, `pbCategoryLabel`, `gasMix`, and `defaultLungVolume` behavior.

### Phase 6: Existing routine safety

- [ ] Run `npm run audit:routine-metric-attachment` before changing Quick Log behavior broadly.
- [ ] Run `npm run audit:routine-metric-attachment:legacy` before deciding any legacy inference.
- [ ] Backfill v2 routines after reviewing dry-run output.
- [ ] Add an admin-only stale projection notice in Quick Log only if stale routines remain after backfill.

Acceptance check: Quick Log fields match the current layer-derived `trackingConfig` for existing v2 routines, not only newly created routines.

## Proposed Test Plan

- Unit tests for the new Quick Log read model.
- Unit tests for row-result construction from edited row values.
- Component-level smoke tests for which sections appear under representative tracking configs.
- Existing metric display tests should continue to verify every selectable metric resolves safely from empty logs.
- Full `npm run check` after each implementation phase.

## Recommended Order

1. Build the pure read model first.
2. Add row-first result emission while preserving legacy summary fields.
3. Add dynamic technique/split entry.
4. Rework the UI layout around the new read model.
5. Tighten attempt/category consistency.
6. Backfill/audit existing routines before relying on new flags in production logging.

This order keeps the risky behavior changes behind tested data transformations before the visible form is redesigned.
