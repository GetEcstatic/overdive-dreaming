# O2 Static Layer Discipline Plan

Status: planned.

## Decision

Model O2 statics as a layer-only unofficial static discipline, analogous to `TORT` for dynamic training. Use `O2STA` as the proposed `LayerDiscipline` value.

Do not add O2 static to the stored `Discipline` union yet. Logs, PB records, and legacy compatibility fields should continue to store O2 statics as official `STA`, with `attemptConditions.kind === 'o2-assisted'` and gas fields preserving the O2-specific bucket.

This keeps official discipline reporting compatible while making O2 static a first-class routine authoring concept.

## Current Gaps

- `LayerDiscipline` supports unofficial `TORT`, but only dynamic training has an unofficial discipline group. Static detection is currently equivalent to `discipline === 'STA'` in validation, metrics, tags, and tracking projection.
- O2-assisted static is currently only an attempt category. That works for PB bucketing, but it does not let routine templates say, up front, that the routine itself is O2 static.
- The layer projection can drop O2-specific tracking intent because `deriveTrackingConfigFromLayers` has no O2 static signal. `trackGasMix`, `trackETCO2`, `trackEndSpO2`, `trackBreatheUpType`, `trackLucidity`, `trackUrgeToBreathe`, `trackContractions`, and related fields are not derived from layers.
- Quick Log and Editable Log expose O2 fields when tracking flags and `attemptKind === 'o2-assisted'` line up, but an O2 static routine should default to that attempt kind instead of asking the user to rediscover it each log.
- Legacy O2 static routines can only project as `STA`, so audits can report drift without preserving the authoring distinction.

## Implementation Plan

1. Extend the layer discipline model.
   - Add `O2STA` to `LayerDiscipline`.
   - Split helpers into official static, static training, official dynamic, and dynamic training sets.
   - Add `isStaticDiscipline(discipline)` and update `groupDiscipline` so `O2STA` behaves as static for duration-only validation, metric derivation, tags, and display defaults.
   - Add a routine classification flag such as `containsO2Static` for tags and UI affordances.

2. Preserve storage compatibility.
   - Update `buildRoutineLogPlanRows` to map `O2STA` rows to stored `STA`, just as `TORT` maps to `DYN`.
   - Update `projectDisciplines` to emit `STA` for `O2STA` instead of filtering it out or widening the stored `Discipline` type.
   - Keep PB keys as `STA:o2-assisted`; do not create an `O2STA:standard` PB bucket.

3. Project O2 static tracking from layers.
   - Update `deriveTrackingConfigFromLayers` to detect `O2STA` in primary and allowed disciplines.
   - Turn on static basics for `O2STA`: duration, contractions onset, equipment, facial gear, SpO2/HR, FVC, packing, lung volume, and safety fields.
   - Turn on O2-specific fields for `O2STA`: gas mix, breathe-up type, ETCO2, end SpO2, CO2 tremor onset, mental change time, recovery quality, lucidity, urge to breathe, contractions, expired air, and lung-volume loss per minute where the existing schema supports them.
   - Add canonical metrics for the O2-specific fields to the layer metric profile where they already exist; add missing registry entries only if the field can currently be displayed or analyzed.

4. Update defaults and authoring flows.
   - Add an O2 static max example/preset, likely `system-o2-static-max`, with `discipline: 'O2STA'`, `defaultTags: ['static', 'o2', 'max']`, and display hero `durationSeconds`.
   - Decide whether generic Static Max should remain fixed `STA` or become log-time selectable between `STA` and `O2STA`. Prefer a separate O2 preset first to avoid accidental O2 logging.
   - Update layer-builder selectors, sentence/modifier text, transfer serialization tests, and create-flow tests so `O2STA` appears in the static discipline family.

5. Update Quick Log and edit forms.
   - Add a read-model signal for O2 static routines, based on layers where available and tracking flags as fallback.
   - Default Quick Log and Editable Log to `attemptKind = 'o2-assisted'`, `breathingGas = 'oxygen'`, and `gasMix = '100% O2'` for O2 static routines.
   - Keep the user able to edit gas/mix, but avoid presenting O2 static as a normal standard STA attempt.
   - Ensure the advanced section opens by default and the O2 controls are visible without requiring a separate attempt-type click.
   - Keep dry/wet biometric import behavior independent of O2; O2 static can be wet or dry, but O2-specific fields should not depend on the dry toggle.

6. Handle legacy routines and audits.
   - Teach legacy projection to infer `O2STA` from stable signals such as `attemptConditions.kind`, `trackGasMix`, `trackETCO2`, `trackEndSpO2`, O2 tags, or known system IDs/names like `system-o2-assisted-static`.
   - Update the routine metric attachment audit to report legacy O2 candidates separately and allow a write pass that preserves O2 tracking intent in v2 projections.
   - Backfill only routines that have a high-confidence O2 signal; leave ambiguous `STA` routines report-only.

## Tests

- `model.test.ts`: `O2STA` groups as static, validates as duration-only, contributes static tags/metrics, and sets `containsO2Static`.
- `contract.test.ts`: `O2STA` projects to stored `STA` and derives O2-specific tracking flags.
- `logPlan.test.ts`: `O2STA` plan rows map to `STA` while retaining layer IDs and row metadata.
- `defaults.test.ts` or existing create/default coverage: O2 static preset exists and is indexed.
- `quickLogReadModel.test.ts`: O2 static opens advanced controls and includes O2 fields.
- `quickLogAttempt.test.ts` / component-level coverage if available: O2 static defaults to `o2-assisted` conditions.
- Legacy projection tests: high-confidence O2 static routines project to `O2STA`; normal static routines remain `STA`.

## Open Questions

- Naming: `O2STA` is compact and type-friendly, but UI labels should read "O2 Static" or "O2-assisted static". *O2 assisted static is better*
- Scope of mandatory O2 fields: gas mix should be on by default *yes, and default at 100%*; ETCO2/end SpO2/recovery/lucidity may be advanced defaults rather than required fields. *yes*
- Whether O2 static should be selectable inside generic Static Max. The safer first pass is a separate preset plus explicit layer selection in the editor. *Hmm.... okay let's keep it as a separate preset then*
