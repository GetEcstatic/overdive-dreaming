# Plan — Remove Rep-Editor ± Nudge Buttons & Add Lung-Volume Flag (FL / RV / FRC)

> **Scope:** Two related cleanups to the per-rep logging UI used in
> manual logging *and* post-CSV-import editing.
> 1. Drop the `−` / `+` nudge buttons that flank every duration / distance
>    chip — the wheel-picker sheet is now the canonical input and the
>    extra buttons clutter the row and break column alignment with the
>    table header.
> 2. Add a per-rep **lung-volume flag** (`FL` = Full Lung, `RV` = Reserve
>    Volume, `FRC` = Functional Residual Capacity) so users can label
>    each hold's starting lung volume.
>
> Follows the project's data-oriented design rules (see `claude.md`
> *"Data-oriented design"* section): plain data, pure functions for
> transforms, side-effects at the edges.

---

## 0 · Background / Why

- `DurationInput.svelte` and `NumberWheelInput.svelte` both render an
  inline `<button class="nudge-btn">` on either side of the chip
  (controlled by a `showNudgeButtons` prop, **defaulting to `true`**).
  When these chips sit inside `RepEditor.svelte`'s grid rows, every
  `<DurationInput>` actually occupies *three* visual cells
  (`[−][chip][+]`), but the **table header** only declares one cell per
  column → header labels misalign with row content, and rows become
  cramped on narrow phones.
- The ± buttons are now redundant: tapping the chip opens
  `NumberWheelSheet` (`openDurationSheet` / `openWheelSheet`) which is
  the easier, faster control and was always intended to be the primary
  affordance (see `docs/wheel-selector-redesign.md`).
- Lung-volume context (FL / RV / FRC) is essential interpretation
  metadata for static / interval training. Currently we only track
  `packingVolume` % at the routine-log level; per-rep tagging is
  missing.

---

## 1 · Affected Surfaces (audit)

| File | Role |
|---|---|
| `src/lib/components/DurationInput.svelte` | Source of `showNudgeButtons` ± buttons (mm:ss chip). |
| `src/lib/components/NumberWheelInput.svelte` | Source of `showNudgeButtons` ± buttons (number chip). |
| `src/lib/components/RepEditor.svelte` | Per-rep table — primary place where alignment breaks. Used for both manual logging and post-import editing. |
| `src/lib/components/EditableLogForm.svelte` | Hosts `RepEditor`; converts `RepEditorData[] → LapData[]` for save. |
| `src/lib/components/BiometricImportModal.svelte` | CSV preview only (read-only), then hands data to `EditableLogForm`/`RepEditor`. **No ± buttons here**, but reps it produces flow into `RepEditor` ⇒ fix in `RepEditor` covers it. |
| `src/lib/components/QuickLogForm.svelte` *(if it embeds DurationInput)* | Verify standalone usages still look OK without ±. |
| `src/lib/components/routine-builder/TableRowEditor.svelte` | Uses `DurationInput` for routine **template** authoring. Decide if ± should also disappear here (recommended: yes, for consistency). |
| `src/lib/types.ts` | `LapData`, `RepEditorData`, `RoutineLog`, `TrackingConfig`, plus a new `LungVolume` discriminated union. |
| `src/lib/firestore.ts` | Persist new `lungVolume` field through the routine-log write path (no schema change needed — Firestore is schemaless — but ensure the field is included in update payloads). |
| `src/lib/utils/biometricCsvParser.ts` *(test file already updated)* | If we want to default `lungVolume` per imported rep, pass it through here. |
| `docs/wheel-selector-redesign.md` | Update note on `showNudgeButtons` API. |

---

## 2 · Design Decisions

### 2.1 ± Nudge Buttons

**Decision:** **Remove the buttons entirely** rather than flip the
default. Rationale:

- They are unused now that the sheet is the canonical input.
- Keeping a dead-code prop ages badly; cleaner to delete.
- The `Minus` / `Plus` `lucide-svelte` imports go with them.

This is a **breaking prop change** for `DurationInput` and
`NumberWheelInput` (`showNudgeButtons` removed). Audit shows current
call-sites only either omit it or pass `={true}`/`={false}` — all
fine to delete.

If we ever want fine-grain ± again on a specific surface, it can be
added as a separate component (e.g. `<NumberStepper>`); we don't
preserve the prop "just in case".

### 2.2 Lung-Volume Flag

**New type** in `src/lib/types.ts`:

```ts
/**
 * Starting lung volume at the beginning of a breath hold.
 * - FL  = Full Lung (after maximal inhale, possibly with packing)
 * - RV  = Residual Volume (after maximal exhale)
 * - FRC = Functional Residual Capacity (relaxed exhale, neutral lungs)
 */
export type LungVolume = 'FL' | 'RV' | 'FRC';
```

**Per-rep field** added to both `LapData` *and* `RepEditorData`:

```ts
lungVolume?: LungVolume;
```

Optional → existing logs remain valid.

**Routine-log default** — also add `defaultLungVolume?: LungVolume`
on `RoutineLog` so users can set it once per session and the rep
editor pre-fills (overridable per row). This avoids tapping the same
chip 16× for a Sweet-16.

**Tracking config** — extend `TrackingConfig` with
`trackLungVolume: boolean` so routine authors can hide the column
when not relevant (e.g. wet pool DYN). Default `false`; enable it in
the seeded RV / FRC routines (see `scripts/seed-data.ts`).

### 2.3 UI Placement (`RepEditor.svelte`)

- New column `<div class="col-volume">Vol</div>` rendered **only when
  `trackLungVolume` is true** (passed in as a prop alongside the
  existing `trackSpO2` / `trackHR`).
- Per-row control: a small **3-segment chip group**
  `[FL] [RV] [FRC]`, single-select, styled like the existing
  discipline / status pills. Tapping toggles `rep.lungVolume`.
  Use a tiny inline component (`<LungVolumeChip>`) or just inline
  buttons — keep it ≤ 80 LOC.
- A **session-level default** selector at the top of the editor:
  *"Default volume: [FL] [RV] [FRC]"*. Selecting one populates any
  rep where `lungVolume` is `undefined`; explicit per-row picks are
  preserved.

### 2.4 Column Alignment Fix

Once the ± buttons are gone, each cell of the row contains exactly
one chip → `grid-template-columns` on `.reps-table` already lines up
with `.table-header` declarations. Verify by:

- Counting `.col-*` declarations in header vs row for each branch
  (STA static, dynamic with/without biometrics, with new `col-volume`).
- Adjusting the existing `grid-template-columns` rules in
  `RepEditor.svelte` `<style>` to add the `volume` track when present
  (use a CSS class like `.has-volume`, mirroring `.has-biometrics`).

---

## 3 · Implementation Steps (data → pure functions → side-effects)

### Step 1 — Types (data)
- [ ] Add `LungVolume` type to `src/lib/types.ts`.
- [ ] Add `lungVolume?: LungVolume` to `LapData` and `RepEditorData`.
- [ ] Add `defaultLungVolume?: LungVolume` to `RoutineLog`.
- [ ] Add `trackLungVolume: boolean` to `TrackingConfig`
      (also bump any default-config builder so existing routines get
       `false`).

### Step 2 — Pure helpers
- [ ] In a new `src/lib/utils/lungVolume.ts`:
  - `LUNG_VOLUME_OPTIONS: readonly LungVolume[]`
  - `formatLungVolume(v: LungVolume): string` (full label for tooltips)
  - `applyDefaultLungVolume(reps, defaultVol)` — pure reducer that
    fills `undefined` `lungVolume` fields. Returns a new array.
- [ ] Unit test in `src/lib/utils/lungVolume.test.ts` (vitest).

### Step 3 — Strip `showNudgeButtons` from chip components
- [ ] `DurationInput.svelte`:
      remove `showNudgeButtons` prop, the two `<button class="nudge-btn">`
      blocks, the `nudge()` function, the `canDecrement`/`canIncrement`/
      `count` derived state, and the `Minus`/`Plus` imports.
      Keep `spec` if still used by the sheet open call (it isn't —
      verify and drop).
- [ ] `NumberWheelInput.svelte`: same surgery.
- [ ] Search-and-purge any `showNudgeButtons={…}` attributes left in
      callers (`grep -R showNudgeButtons src/`).
- [ ] Remove the `.nudge-btn` CSS rules.

### Step 4 — `RepEditor.svelte` updates
- [ ] Add new props: `trackLungVolume?: boolean`,
      `defaultLungVolume?: LungVolume`,
      and bindable `defaultLungVolume` two-way (or callback) so the
      editor can both consume and emit the chosen default.
- [ ] Render the optional **default-volume chip-group** above the
      table.
- [ ] Add `<div class="col-volume">Vol</div>` to the header and a
      matching cell in each `<div class="table-row">`. Wrap in
      `{#if trackLungVolume}`.
- [ ] Adjust `grid-template-columns` (header + row) to add a
      `minmax(...)` track when `.has-volume` is set.
- [ ] When the user changes the session-level default, run
      `applyDefaultLungVolume(reps, newDefault)` from Step 2 and
      reassign `reps`.
- [ ] Visual QA pass on iPhone width (375px) and tablet (768px) —
      confirm columns line up, chips don't overflow, no horizontal
      scroll.

### Step 5 — Persist through `EditableLogForm.svelte`
- [ ] Pass `trackLungVolume` from `routine.trackingConfig` into
      `<RepEditor>`.
- [ ] Add `defaultLungVolume` `$state` initialised from the existing
      log (when editing) or `'FL'` if `trackLungVolume` is on.
- [ ] In the `repEditorData.map((r): LapData => ({ ... }))` payload,
      include `lungVolume: r.lungVolume`.
- [ ] Include `defaultLungVolume` in the top-level update payload.
- [ ] Verify the **edit-existing-log** path: `EditRoutineLogModal`
      seeds `RepEditor` from `log.laps` → ensure `lungVolume` round-trips.

### Step 6 — CSV-import path
- [ ] `BiometricImportModal.svelte`: when converting
      `ProcessedRepBiometrics → RepEditorData[]` (around line 117),
      seed each rep's `lungVolume` from the parent form's
      `defaultLungVolume` (pass it in as a prop, or apply
      `applyDefaultLungVolume` after import in `EditableLogForm`).
- [ ] CSV preview table is read-only and unaffected; once the user
      imports and the rows enter `RepEditor`, the new column appears
      and is editable.
- [ ] No changes to `biometricCsvParser.ts`.

### Step 7 — Seeding & defaults
- [ ] In `scripts/seed-data.ts`, set `trackingConfig.trackLungVolume = true`
      for the static/RV/FRC-style seeded routines (RV Breath Hold
      Series, FRC Tables, Dry STA). Leave `false` for DYN/DNF/DYNB.
- [ ] No migration script needed — field is optional everywhere.

### Step 8 — Docs
- [ ] Update `docs/wheel-selector-redesign.md` to note that
      `showNudgeButtons` has been removed (was deprecated as of this
      change).
- [ ] Add a short *"Lung Volume Tracking"* section to
      `docs/TRAINING_METRICS.md`.
- [ ] Update `claude.md` "Data Models" section to mention the new
      field.

### Step 9 — QA / validation
- [ ] `npm run check` clean.
- [ ] `npm run test` (vitest) — new lungVolume tests pass.
- [ ] Manual smoke test:
  1. Log a Sweet-16 manually → verify clean rows, no ±.
  2. Toggle session default `RV` → all empty volume cells flip to RV.
  3. Override one rep to `FL`; reload → persists.
  4. Import a stamina CSV → reps land in editor with default volume,
     editable.
  5. Open log on iPhone PWA viewport → header + row columns aligned;
     no horizontal scroll.

### Step 10 — Commit / push
- [ ] Single feature branch `feat/rep-editor-cleanup-lung-volume`
      OR a series of small commits on `main` (project convention is
      direct-to-main with imperative commit messages — match it).
- Suggested commits:
  1. `refactor(inputs): drop showNudgeButtons from Duration/NumberWheel`
  2. `feat(types): add LungVolume + per-rep lungVolume field`
  3. `feat(RepEditor): lung-volume column + session default; align cols`
  4. `feat(EditableLogForm): persist per-rep lungVolume`
  5. `chore(seed): enable trackLungVolume on static routines`
  6. `docs: lung-volume + nudge-button removal notes`

---

## 4 · Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Other surfaces depend on ± buttons (e.g. `TableRowEditor` for routine authoring). | Confirmed via grep: ± usage is only inside chip components. Remove globally; no caller passes the prop today (only the components themselves default it). |
| Existing logs lack `lungVolume` → analytics break. | Field is optional; all consumers must treat it as `undefined`. Add a `?? '—'` fallback in any analytics display. |
| Wider rows when `trackLungVolume` is on may overflow narrow phones. | Use a `minmax(2.5rem, auto)` grid track and abbreviate header to "Vol". On <360px, allow horizontal scroll inside `.reps-table` (already the case for biometric columns). |
| Forgotten attribute `showNudgeButtons={false}` somewhere. | Final grep + `npm run check` will catch unknown-prop warnings under Svelte 5 runes (`$props()` typed). |

---

## 5 · Out of Scope (explicitly)

- Changing the wheel-sheet UX itself.
- Adding more lung-volume variants (e.g. mid-FRC, packed-FL%) — keep
  it to 3 buckets. Packing % already exists separately on the log.
- Refactoring `BiometricImportModal`'s preview table.
- Migrating historical logs to back-fill `lungVolume`.

---

## 6 · TODO Checklist (for the executor)

- [ ] Step 1: types
- [ ] Step 2: lungVolume utils + tests
- [ ] Step 3: strip nudge buttons from chip components
- [ ] Step 4: RepEditor column + default-volume picker + grid alignment
- [ ] Step 5: EditableLogForm persistence
- [ ] Step 6: CSV import passthrough
- [ ] Step 7: seed config update
- [ ] Step 8: docs
- [ ] Step 9: QA pass
- [ ] Step 10: commit + push to `main`
