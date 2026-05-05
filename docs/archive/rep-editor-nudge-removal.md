# Plan — Remove Rep-Editor ± Nudge Buttons & Add Lung-Volume Flag (FL / RV / FRC)

> **Scope:** Two related cleanups to the per-rep logging UI used in
> manual logging *and* post-CSV-import editing.
> 1. Drop the `−` / `+` nudge buttons that flank every duration / distance
>    chip — the wheel-picker sheet is now the canonical input and the
>    extra buttons clutter the row and break column alignment with the
>    table header.
> 2. Add a per-rep **lung-volume flag** (`FL` = Full Lung, `RV` = Reserve
>    Volume, `FRC` = Functional Residual Capacity) so users can label
>    each reps individual starting lung volume.
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

---

## 7 · Follow-Up — Why the FL / RV / FRC Flag Still Feels Missing (2026-04 audit)

> Triggered by user feedback: *"there is currently still no way for a
> user to flag a rep as either RV, FRC or FL"*. The original plan
> (sections 1–6) was largely executed, but real-world reachability of
> the control is still poor. This section diagnoses why and proposes
> the cleanest fix that does **not** add mobile clutter.

### 7.1 What's actually shipped today

| Surface | `<RepEditor>` rendered? | Lung-volume UI reachable? |
|---|---|---|
| `QuickLogForm.svelte` (manual quick-log + post-CSV-import biometric editor) | ✅ yes (two instances, lines ~1038 and ~1115) | ✅ but **only when `routine.trackingConfig.trackLungVolume === true`** |
| `EditableLogForm.svelte` (edit an existing log from the dives list / log detail) | ❌ **not rendered at all** — only `repEditorData` state + `defaultLungVolume` save-path exist | ❌ no per-rep UI; `defaultLungVolume` also has no picker in the form |
| Live recorder `routes/(app)/dive/record/[id]/+page.svelte` | n/a (it writes laps directly via the recorder) | ❌ no concept of FL/RV/FRC; recorded sessions land in Firestore with `lungVolume = undefined` on every lap |
| `BiometricImportModal.svelte` preview | ❌ read-only by design | n/a — relies on `defaultLungVolume` being already chosen in the parent form before import |

### 7.2 Root causes of the apparent absence

1. **Most user routines have `trackLungVolume: false`.** Only the
   seeded RV / FRC / Dry-STA routines (`scripts/seed-data.ts`) flip
   the flag on. Any custom routine, any imported routine, and most
   DYN/STA routines default to `false`, so the column and the
   default-volume picker never appear → from the user's POV the
   feature simply isn't there.
2. **`EditableLogForm` never mounts `<RepEditor>`.** After-the-fact
   editing is the most common path (CSV-after-the-dive workflow,
   correcting a manual log, adjusting an imported AIDA result), but
   the only writable lung-volume UI lives in `QuickLogForm`. State
   is plumbed through, but the component is missing — a partial
   implementation regression from Step 5 of the original plan.
3. **Live recorder has no on-rep tagging.** The recorder writes
   `LapData[]` directly (not via `RepEditorData`), so even when a
   user records a session for an `RV` routine, every lap is saved
   without `lungVolume`.
4. **Discoverability:** Even on a routine where `trackLungVolume` is
   on, the per-rep chip group lives inside the rep table, which on
   mobile is below the fold and behind a section toggle. Users who
   just want to mark *one* rep as FRC have no quick path.

### 7.3 Goal — minimum-clutter, always-reachable flag

- **Default = `FL`** for every rep that lacks an explicit value
  (current code uses `undefined` ⇒ change consumer fallbacks to
  treat undefined as `FL`).
- **One always-on, low-clutter affordance** on every rep row, even
  on routines that don't otherwise opt-in to lung-volume tracking.
- **Reachable from manual log, edit-log, and post-import flows** so
  the user can correct any rep regardless of how it was created.
- **Does not consume a column** on routines that don't track it →
  use a single icon-pill that lives inside the existing status cell
  area, *not* a new column.

### 7.4 Design — `LungVolumePill` (compact, inline)

A single 28×28 px pill rendered **inline next to the row's `✓` /
`✗` status button**, replacing the new `Vol` column entirely on
narrow viewports.

```
[ # ] [ ⏱ time ] [ ⏸ rest ] [ FL ] [ ✓ ]
                              ^^^^
                    Tap → cycles FL → RV → FRC → FL
                    Long-press / right-click → opens action sheet
                                              with full labels +
                                              "Set as default for all"
```

Behaviour:

- **Tap** cycles `FL → RV → FRC → FL` (single tap, predictable,
  matches mobile freediving-app patterns).
- **Long-press** (300 ms) opens a tiny `<NumberWheelSheet>`-style
  bottom sheet with three labelled rows (`Full Lung`, `Reserve
  Volume`, `Functional Residual Capacity`) and a *"Apply to all
  reps in this session"* action (writes the chosen value as the
  session-level `defaultLungVolume`).
- **Visual states:** colour-coded — `FL` neutral grey, `RV` cool
  blue (`var(--color-info)`), `FRC` warm amber. Default `FL` looks
  intentional, not unset.
- **Always rendered** regardless of `trackLungVolume`. The
  `trackLungVolume` flag now only controls whether the *Vol header
  column* and the *session-default banner* are shown — the per-row
  pill is universal so the user can always tag a rep on any
  routine. (Justification: the flag's *cost* is one tiny pill per
  row; the *benefit* is rescuing users on routines that didn't
  pre-declare lung-volume tracking.)

**A11y:** `<button aria-label="Lung volume: Full Lung. Tap to
change.">` — label updates on each cycle. Long-press is augmented
by a long-press handler on top of the existing keyboard activation
(`Space` / `Enter` opens sheet).

### 7.5 Surface coverage plan

| Surface | Change |
|---|---|
| `RepEditor.svelte` | Replace inline `Vol` column chip-group with the new `<LungVolumePill>` rendered next to status. Keep header `Vol` column **only** when `trackLungVolume === true` (acts as the "this routine cares" hint, plus the session-default banner). On all other routines, the pill is silently present per row but the header column is omitted. |
| `EditableLogForm.svelte` | **Render `<RepEditor>`** (currently missing). Pass `discipline`, `plannedReps`, `routineTable`, `defaultRestSeconds`, `bind:reps={repEditorData}`, biometric flags from `routine.trackingConfig`, `trackLungVolume`, and `bind:defaultLungVolume`. Initial `repEditorData` must be hydrated from `formData.laps` so existing logs round-trip. |
| `QuickLogForm.svelte` | No structural change — the new pill replaces the existing column-only UI; the routine-gated banner stays as today. |
| Live recorder `dive/record/[id]/+page.svelte` | Add a top-level `defaultLungVolume` selector in the recorder header (3 chips in the existing controls strip — already cluttered, but this is one row of 3 small chips). Persist into the saved `RoutineLog.defaultLungVolume`. Per-rep editing post-recording happens in `EditableLogForm` once that's wired (above). |
| `types.ts` | No type change. `LapData.lungVolume` and `RoutineLog.defaultLungVolume` already exist. |
| Consumers reading `lungVolume` (analytics) | Treat `undefined` as `'FL'` at the read boundary (single helper `resolveLungVolume(rep, log)` in `src/lib/utils/lungVolume.ts` — already a sensible home). |

### 7.6 New helpers (pure)

In `src/lib/utils/lungVolume.ts`:

```ts
// Cycle order for tap interaction.
export const LUNG_VOLUME_CYCLE: readonly LungVolume[] =
  ['FL', 'RV', 'FRC'] as const;

export function cycleLungVolume(current: LungVolume | undefined): LungVolume {
  const i = LUNG_VOLUME_CYCLE.indexOf((current ?? 'FL') as LungVolume);
  return LUNG_VOLUME_CYCLE[(i + 1) % LUNG_VOLUME_CYCLE.length];
}

// Resolve effective volume (rep override > session default > 'FL').
export function resolveLungVolume(
  rep: { lungVolume?: LungVolume },
  log: { defaultLungVolume?: LungVolume }
): LungVolume {
  return rep.lungVolume ?? log.defaultLungVolume ?? 'FL';
}
```

Add unit tests in the existing `lungVolume.test.ts` for both.

### 7.7 New component — `src/lib/components/LungVolumePill.svelte`

- ≤ 100 LOC.
- Props: `value?: LungVolume` (bindable), `onChange?: (v) => void`,
  `compact?: boolean`, `aria-label?: string`.
- Internals: tap → `cycleLungVolume`; long-press (`pointerdown` +
  300 ms timer, cancel on `pointermove`/`pointerup`) → open sheet.
- Sheet reuses the existing wheel-sheet container component
  (`NumberWheelSheet`'s wrapper styles) but renders three labelled
  buttons + an "Apply to all reps" action.

### 7.8 Implementation TODO (delta on top of sections 1–6)

- [ ] **7-A** Add `LUNG_VOLUME_CYCLE`, `cycleLungVolume`,
      `resolveLungVolume` to `src/lib/utils/lungVolume.ts` + tests.
- [ ] **7-B** Create `src/lib/components/LungVolumePill.svelte`
      (tap-cycles, long-press opens sheet, colour-coded).
- [ ] **7-C** Refactor `RepEditor.svelte`: drop the per-row `Vol`
      column chip-group; render `<LungVolumePill>` adjacent to the
      status button. Keep header `Vol` column + session-default
      banner *only* when `trackLungVolume === true`. The pill
      itself is **always** rendered (regardless of
      `trackLungVolume`).
- [ ] **7-D** `EditableLogForm.svelte`: render `<RepEditor>` (the
      missing piece). Hydrate `repEditorData` from `formData.laps`
      on mount; pass `defaultLungVolume` two-way; ensure the save
      payload still uses the existing `repEditorData → LapData`
      mapper (no change to that block).
- [ ] **7-E** Live recorder: add a 3-chip `Default volume` row to
      the pre-recording controls; thread the value into the saved
      log's `defaultLungVolume`.
- [ ] **7-F** Update analytics call-sites to use
      `resolveLungVolume(rep, log)` instead of reading
      `rep.lungVolume` directly (grep for `\.lungVolume` in
      `src/lib/utils/` and `src/lib/components/`).
- [ ] **7-G** Visual QA on iPhone SE (375 px) and iPad: confirm the
      pill fits within the existing status cell with no horizontal
      scroll on routines without `trackLungVolume`, and that the
      column + banner appear cleanly on routines with it.
- [ ] **7-H** Update `docs/TRAINING_METRICS.md` and
      `docs/wheel-selector-redesign.md` to describe the pill
      affordance and the `trackLungVolume`-as-banner-only semantics.

### 7.9 Out of scope (still)

- Migrating historical logs to back-fill `lungVolume`.
- Removing the now-secondary `Vol` column entirely (kept for
  routines that explicitly opt in — gives the column-style overview
  for analytical routines).
- Adding a fourth bucket (e.g. mid-FRC, packed-FL%).

---

## 8 · Clarification (2026-04, post-review)

User correction:

> *"This has nothing to do with tracked lung volumes. This is simply
> to indicate whether a rep was done after exhaling (RV), a half
> exhale (FRC) or on full lung of air (FL). Every line in the rep
> editor needs to be tagged. This will enable other data tracking
> to take place also — e.g. longest hold per lung volume."*

### 8.1 What this changes vs. Section 7

- **Drop the `trackLungVolume` gating concept entirely** for the
  per-row UI. The `<LungVolumePill>` is rendered on **every** row
  of every rep editor, on every routine, no opt-in flag.
- **`trackingConfig.trackLungVolume` is no longer used** to hide
  anything. Either remove the field, or repurpose it strictly as a
  signal for *analytics* surfaces ("show longest-hold-per-volume
  panel"). Recommended: **leave the field in place but stop reading
  it from the rep editor**; analytics screens read it later when
  those panels are built.
- **Session-default banner** (`Default volume: [FL][RV][FRC]`) is
  also always visible above the rep table, since it's now
  universally relevant.
- **Default value remains `FL`** for any rep with no explicit pick,
  so existing logs and recordings continue to look correct
  (matches the implicit assumption baked into the rest of the app).

### 8.2 Updated TODO (supersedes 7.8)

- [ ] **8-A** `src/lib/utils/lungVolume.ts` — add
      `LUNG_VOLUME_CYCLE`, `cycleLungVolume`, `resolveLungVolume`
      (default `FL`); unit tests.
- [ ] **8-B** New `src/lib/components/LungVolumePill.svelte` — tap
      cycles `FL → RV → FRC → FL`; long-press opens a labelled
      action sheet with an *"Apply to all reps"* shortcut;
      colour-coded; `aria-label` updates per state.
- [ ] **8-C** `RepEditor.svelte`:
  - Remove the `trackLungVolume` prop entirely (or keep but ignore
    it — prefer remove and update callers).
  - Always render the session-default chip-group above the table.
  - Always render `<LungVolumePill>` next to the status button on
    every row (replaces the column-style `Vol` cell — drop the
    column header and its grid track).
- [ ] **8-D** Update callers of `<RepEditor>` in
      `QuickLogForm.svelte` to drop the `trackLungVolume={…}` prop.
- [ ] **8-E** **Render `<RepEditor>` in `EditableLogForm.svelte`**
      (currently missing). Hydrate `repEditorData` from
      `formData.laps` on mount; `bind:reps={repEditorData}`;
      `bind:defaultLungVolume`. The existing save mapper already
      writes `lungVolume` and `defaultLungVolume`.
- [ ] **8-F** Live recorder (`dive/record/[id]/+page.svelte`):
      add a 3-chip `Default volume` row to the controls; persist
      into `RoutineLog.defaultLungVolume`. Per-rep overrides
      happen post-save in `EditableLogForm`.
- [ ] **8-G** Analytics read-path: introduce
      `resolveLungVolume(rep, log)` at every consumer that reads
      `rep.lungVolume`. Treat undefined as `FL`. (Future
      "longest hold by lung volume" panel will lean on this.)
- [ ] **8-H** Seed data: leave `trackLungVolume` values as-is —
      they're now decoupled from the editor UI. No migration.
- [ ] **8-I** Docs: update `TRAINING_METRICS.md` and
      `wheel-selector-redesign.md` to describe the always-on pill
      and remove references to `trackLungVolume` as a UI gate.

### 8.3 Why this is still mobile-friendly

- The pill is **28×28 px**, sits inside the existing row's status
  cell, and replaces no other affordance — it consumes ~36 px of
  horizontal space that was previously empty padding.
- No new column on narrow viewports → the existing `grid-template-
  columns` for `RepEditor` does **not** need a new track.
- The session-default banner is one row of 3 small chips (~36 px
  tall) above the table — same height as the existing help-text
  line it visually replaces on routines that previously had it.

### 8.4 Acceptance criteria

1. Every row in `RepEditor` shows a coloured pill reflecting that
   rep's lung volume; tapping it cycles `FL → RV → FRC`.
2. Default for any rep without an explicit pick is `FL`
   (verified by reading a log saved before this change).
3. The session-default chip-group above the rep table sets the
   value for any rep that hasn't been individually edited.
4. Editing an existing log via the dives list shows the pill on
   every rep and round-trips changes to Firestore.
5. A live-recorded session lets the user pick the default volume
   before/while recording, and that value lands on the saved
   `RoutineLog`.
6. No reference to `trackingConfig.trackLungVolume` remains in
   `RepEditor.svelte` or its callers.

---

## 9 · Confirmation (2026-04, post-review #2)

User clarification:

> *"Tracking lung volume should be standard on all routines.
> Tracking FL/RV/FRC is an additional feature for routines with
> multiple reps. Please confirm this is understood and implemented
> in the plan."*

**Confirmed and aligned.** Restating the operating model so it is
unambiguous:

### 9.1 Universality

- **Lung volume is a first-class field on every log**, regardless
  of routine type. `RoutineLog.defaultLungVolume` is set on every
  saved log; default `'FL'`.
- The default-volume picker (3 chips: FL / RV / FRC) appears on
  **every** routine's log form (manual, edit-existing, and live
  recorder), not just multi-rep routines and not just opt-in
  ones.

### 9.2 Per-rep granularity

- For **single-rep** routines (e.g. a one-shot STA, a single DYN
  attempt), `RoutineLog.defaultLungVolume` is the *only* lung-
  volume control shown — no per-row pill, because there's only
  one effective rep.
- For **multi-rep** routines (Sweet-16, RV tables, FRC tables,
  any routine where `numberOfReps > 1` or `routine.table?.rows.length > 1`),
  every row in the rep editor additionally shows the
  `<LungVolumePill>` so individual reps can deviate from the
  session default.

### 9.3 Detection of "multi-rep"

```ts
const isMultiRep =
  (routine.numberOfReps ?? 0) > 1
  || (routine.table?.rows.length ?? 0) > 1;
```

`<RepEditor>` receives this as a derived prop (or computes it
itself from the data it already gets), and renders the per-row
pill iff `isMultiRep === true`. Otherwise only the
session-default banner is rendered (which on single-rep routines
is the *only* lung-volume control needed and lives directly on the
log form, not in the rep editor at all).

### 9.4 TODO delta over Section 8

- [ ] **9-A** In `<RepEditor>`, compute `isMultiRep` from
      `plannedReps` and `routineTable.rows.length`. Render the
      per-row pill **only** when `isMultiRep`. The session-default
      banner above the table is always shown when the rep editor
      itself is shown.
- [ ] **9-B** In `QuickLogForm.svelte` and `EditableLogForm.svelte`,
      always show a top-level `Default volume` picker (3 chips)
      regardless of routine type. For single-rep routines this is
      the only lung-volume control; for multi-rep routines it
      mirrors / drives the session default that the rep editor
      shows.
- [ ] **9-C** Live recorder: the `Default volume` picker shown in
      the controls applies on every routine; for multi-rep
      recorded sessions, per-rep overrides are entered after the
      recording in `EditableLogForm`'s rep editor.
- [ ] **9-D** Acceptance criteria from §8.4 are unchanged except:
      add "(7) Single-rep routines show only the session-default
      picker; multi-rep routines additionally show the per-row
      pill."

This finalises the contract:
- `defaultLungVolume` → universal, every log, default `FL`.
- `lap.lungVolume` → per-rep override, only writable on multi-rep
  routines; resolved via `resolveLungVolume(rep, log) → 'FL'` when
  unset.
- No `trackingConfig` flag gates any of this UI.
