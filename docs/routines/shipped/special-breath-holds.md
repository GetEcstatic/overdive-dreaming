# Special Breath-Hold Categories — Implementation Plan

> Scope: plan a first-class way to record and display non-standard breath-hold
> attempts such as O2-assisted statics, FRC/RV statics, and FRC/RV dynamics
> without letting those results overwrite standard discipline PBs. This is a
> planning document only; do not implement until explicitly approved.

---

## 1. Context

PBs are currently tracked only by base discipline:

- `personalBests.STA`
- `personalBests.DYN`
- `personalBests.DNF`
- `personalBests.DYNB`

That is too coarse. A 13-minute O2-assisted static is not the same record
category as a normal air static, and an RV/FRC attempt should not compete with
full-lung attempts unless the user explicitly wants that comparison.

The codebase already has partial raw fields that point in this direction:

- `RoutineLog.defaultLungVolume?: 'FL' | 'FRC' | 'RV'`
- per-rep `lap.lungVolume`
- `RoutineLog.gasMix?: string`
- `RoutineLog.breatheUpType?: string`
- O2-assisted static fields such as `etco2`, `endSpO2`, `lucidity`, etc.

The missing piece is a normalized, PB-aware classification layer.

---

## 2. Recommendation

Use a structured **Attempt Category** / **Attempt Conditions** model layered on
top of the existing discipline.

Do **not** create new disciplines like `O2_STA` or `RV_DYN`.

Reasons:

- Discipline still means the competitive movement/category: `STA`, `DYN`,
  `DNF`, `DYNB`.
- Attempt category captures conditions: full lungs, FRC, RV, O2-assisted,
  custom gas, etc.
- Analytics can still group by discipline while PBs can group by
  discipline + conditions.
- It avoids a combinatorial explosion of fake disciplines.

Conceptually:

```ts
STA + standard full-lung air    => standard STA PB
STA + O2-assisted               => O2 STA PB
STA + RV                        => RV STA PB
DYN + FRC                       => FRC DYN PB
DNF + RV                        => RV DNF PB
```

---

## 3. UX Goals

- Keep ordinary logging fast. Standard attempts should need no extra thought.
- Make special attempts explicit at log time.
- Prevent special attempts from silently replacing standard PBs.
- Make the PB label clear anywhere it appears: `STA PB`, `O2 STA PB`,
  `RV STA PB`, `FRC DYN PB`.
- Support current real-world training, not just official competition categories.
- Avoid forcing users to create separate routines just to separate PB buckets.

---

## 4. Proposed UX

### 4.1 Quick Log / Edit Log

Add an **Attempt type** section near the top of `QuickLogForm.svelte` and
`EditableLogForm.svelte`, after discipline and dry/wet context.

For standard users, it should feel like a compact control, not a long form.

For `STA`:

- `Standard`
- `O2 assisted`
- `FRC`
- `RV`
- `Custom`

For dynamic disciplines:

- `Standard`
- `FRC`
- `RV`
- `Custom`

The section should be conditionally compact:

- Default selected: `Standard`
- If `O2 assisted` is selected:
  - prefill / show `gasMix = "100% O2"` as editable
  - optionally show `breatheUpType`
- If `FRC` or `RV` is selected:
  - set `defaultLungVolume` to `FRC` / `RV`
  - keep per-rep lung volume editing available for interval routines
- If `Custom` is selected:
  - show a short label input, e.g. `Hypoxic table`, `Mixed gas`, `Packing`
  - show optional gas/lung volume fields

### 4.2 Session Card / Session Detail

Show the attempt category as a small badge beside the discipline:

- `STA · O2`
- `STA · RV`
- `DYN · FRC`
- `STA · Custom`

The detail page should show a small **Attempt conditions** block when the log is
not standard, including lung volume, gas mix, and custom label where present.

### 4.3 Dashboard PB Overview

Split the dashboard PB section into:

1. **Standard PBs**
   - `STA`, `DYN`, `DNF`, `DYNB`
   - These remain the headline records.

2. **Special PBs**
   - Compact secondary grid or horizontal scroll.
   - Examples:
     - `O2 STA PB 13:00`
     - `RV STA PB 4:12`
     - `FRC DYN PB 75m`

If there are no special PBs, do not show the section.

### 4.4 PB Messaging After Save

Current success messaging can say a log is a PB. Update copy to include the
category:

- `New STA PB: 9:00`
- `New O2 STA PB: 13:00`
- `New RV DYN PB: 52m`

---

## 5. Data Model

### 5.1 New Types

Add a compact structured category to `src/lib/types.ts`:

```ts
export type AttemptCategoryKind =
  | 'standard'
  | 'o2-assisted'
  | 'frc'
  | 'rv'
  | 'custom';

export interface AttemptConditions {
  kind: AttemptCategoryKind;
  label?: string; // required for custom, optional display override otherwise
  lungVolume?: LungVolume; // FL/FRC/RV
  breathingGas?: 'air' | 'oxygen' | 'custom';
  gasMix?: string; // e.g. "100% O2", "32% O2"
  countsForStandardPB?: boolean; // default false for non-standard
}
```

Add to `RoutineLog`:

```ts
attemptConditions?: AttemptConditions;
pbCategoryKey?: string;   // denormalized, e.g. "STA:standard", "STA:o2-assisted"
pbCategoryLabel?: string; // denormalized, e.g. "STA", "O2 STA", "RV DYN"
```

`pbCategoryKey` should be computed from discipline and conditions. It should not
be user-entered text.

### 5.2 PB Storage

Keep existing `personalBests` for backward compatibility, but redefine it as
**standard PBs only**.

Add a richer v2 field:

```ts
export interface PersonalBestRecord {
  key: string; // "STA:standard", "STA:o2-assisted", "DYN:frc"
  discipline: Discipline;
  categoryKind: AttemptCategoryKind;
  categoryLabel: string; // "STA", "O2 STA", "FRC DYN"
  metric: 'time' | 'distance';
  value: number;
  routineLogId: string;
  date: Timestamp;
  conditions?: AttemptConditions;
  isStandard: boolean;
}

export interface PersonalBestRecords {
  [key: string]: PersonalBestRecord;
}
```

Add to `User`:

```ts
personalBestRecords?: PersonalBestRecords;
```

Migration behavior:

- Existing `personalBests.STA` maps to `personalBestRecords["STA:standard"]`.
- Existing `personalBests.DYN` maps to `personalBestRecords["DYN:standard"]`.
- Same for `DNF`, `DYNB`.
- Continue writing `personalBests` for standard records so existing analytics
  continue to work during the transition.

---

## 6. Category Derivation Rules

Create a pure helper, likely `src/lib/utils/attemptCategories.ts`.

Primary function:

```ts
deriveAttemptCategory(log: Pick<RoutineLog, ...>): {
  key: string;
  label: string;
  isStandard: boolean;
  conditions: AttemptConditions;
}
```

Rules:

1. If `attemptConditions.kind` exists, trust it.
2. Otherwise infer from legacy fields:
   - `gasMix` containing `O2`, `oxygen`, or `100%` => `o2-assisted`
   - `defaultLungVolume === 'FRC'` => `frc`
   - `defaultLungVolume === 'RV'` => `rv`
   - otherwise `standard`
3. Standard means:
   - `kind === 'standard'`
   - `breathingGas` unset or `air`
   - `lungVolume` unset or `FL`
4. Non-standard attempts do not update `personalBests[discipline]` unless
   `countsForStandardPB === true`.

The default should be conservative: if something is clearly O2/FRC/RV, keep it
out of standard PBs.

---

## 7. PB Calculation Changes

### 7.1 Current Problem

`checkIsPB()` and `updateUserPB()` accept only:

```ts
discipline + result + personalBests
```

That means a single `STA` value is treated as universal.

### 7.2 Proposed API

Add v2 utilities:

```ts
checkIsCategoryPB(record: PersonalBestRecordDraft, current?: PersonalBestRecords): boolean
updateUserPBRecord(userId: string, record: PersonalBestRecord): Promise<void>
recalculatePBRecordsForUser(userId: string, disciplines?: Discipline[]): Promise<void>
formatPBRecord(record: PersonalBestRecord): string
```

Use v2 for all new saves.

Keep v1 wrappers for existing components:

- `getUserPBs()` can continue to return standard-only `personalBests`.
- New `getUserPBRecords()` returns full category records.
- `formatPB()` remains for old call sites.

### 7.3 Recalculation

Recalculate should:

1. Query user logs.
2. Limit to max-attempt / PB-capable routines as today.
3. Derive category for each log.
4. Compute best value per `pbCategoryKey`.
5. Write:
   - `users/{userId}.personalBestRecords`
   - `users/{userId}.personalBests` for standard categories only
6. Clear stale PB keys that no longer have qualifying logs.

---

## 8. Firestore / Indexing

No new collection is needed for the first implementation.

Data stays on:

- `routineLogs`
- `users/{userId}`

Likely fields added to `routineLogs`:

- `attemptConditions.kind`
- `attemptConditions.lungVolume`
- `attemptConditions.breathingGas`
- `pbCategoryKey`
- `pbCategoryLabel`

Potential future index if filtering by category becomes common:

- `routineLogs`: `userId`, `pbCategoryKey`, `date desc`

Do not add the index until a real query needs it.

---

## 9. Implementation Steps

### Step 1 — Types and Pure Helpers

- Add `AttemptCategoryKind`, `AttemptConditions`, `PersonalBestRecord`, and
  `PersonalBestRecords` to `src/lib/types.ts`.
- Add `src/lib/utils/attemptCategories.ts`.
- Add unit tests for:
  - standard STA
  - O2 STA from explicit conditions
  - O2 STA inferred from `gasMix`
  - FRC/RV from `defaultLungVolume`
  - dynamic FRC/RV labels
  - custom labels

### Step 2 — Form Data Plumbing

- Add `attemptConditions`, `pbCategoryKey`, and `pbCategoryLabel` to form data
  conversion in `src/lib/utils/formData.ts`.
- Pass these fields through `QuickLogForm.svelte` and `EditableLogForm.svelte`.
- Ensure `EditRoutineLogModal.svelte` can persist changes to attempt category.

### Step 3 — Logging UI

- Add an **Attempt type** compact segmented control.
- For STA, show `Standard`, `O2`, `FRC`, `RV`, `Custom`.
- For DYN/DNF/DYNB, show `Standard`, `FRC`, `RV`, `Custom`.
- Connect `O2` to gas mix defaults.
- Connect `FRC/RV` to `defaultLungVolume`.
- Keep existing detailed O2 fields behind routine tracking config for now.

### Step 4 — Save Path

- In `src/routes/(app)/dives/+page.svelte`, derive category before PB check.
- Write derived `pbCategoryKey` / `pbCategoryLabel` onto the `RoutineLog`.
- Replace v1 PB checking for new logs with category-aware PB checking.
- For standard PBs, continue updating legacy `personalBests`.

### Step 5 — PB Utilities v2

- Add `getUserPBRecords()`.
- Add `updateUserPBRecord()`.
- Add `recalculatePBRecordsForUser()`.
- Keep existing `recalculatePBsForDisciplines()` but migrate its internal logic
  to use v2 and then project standard PBs back to v1.

### Step 6 — Dashboard Overview

- Fetch `personalBestRecords` alongside legacy PBs.
- Render standard PBs first.
- Render special PBs only when present.
- Use labels from records, not ad hoc string construction in the Svelte file.

### Step 7 — Session Display

- Add attempt-category badges to:
  - `SessionCard.svelte`
  - `src/routes/(app)/session/[id]/+page.svelte`
  - relevant mini analytics / quick view surfaces if they show PB badges
- Update PB badge labels where necessary.

### Step 8 — Recalculation / Backfill Tool

- Add a script to recalculate PB records for a user or all users.
- Infer categories from existing fields where possible.
- Log ambiguous records rather than making destructive changes.

### Step 9 — Tests and Verification

- Unit tests for derivation and PB comparison.
- `npm run check`
- `npm run build`
- Manual test matrix:
  - normal STA 9:00 remains standard `STA PB`
  - O2 STA 13:00 creates `O2 STA PB`, does not replace `STA PB`
  - RV STA creates `RV STA PB`
  - FRC DYN creates `FRC DYN PB`
  - editing a log from standard to O2 causes recalculation to move PB buckets

---

## 10. Suggested TODO List

- [ ] Add attempt category and PB record types.
- [ ] Build pure attempt category derivation helpers.
- [ ] Add unit tests for category derivation.
- [ ] Add category-aware PB helper functions.
- [ ] Update quick-log form data shape.
- [ ] Add Attempt type UI to quick log.
- [ ] Add Attempt type UI to edit log.
- [ ] Derive and persist `pbCategoryKey` / `pbCategoryLabel` on save.
- [ ] Update PB save path to write `personalBestRecords`.
- [ ] Keep standard PBs synced to legacy `personalBests`.
- [ ] Update dashboard to show Standard PBs and Special PBs separately.
- [ ] Add attempt badges to session cards and session detail.
- [ ] Add PB recalculation/backfill script.
- [ ] Run check/build/tests.
- [ ] Manually test standard STA vs O2 STA vs RV/FRC cases.

---

## 11. Rollout Strategy

1. Ship the model and UI without deleting existing fields.
2. For new logs, write both:
   - structured `attemptConditions`
   - existing raw fields like `gasMix` / `defaultLungVolume`
3. Keep old `personalBests` for standard PBs.
4. Add v2 `personalBestRecords` for all categories.
5. Backfill/recalculate after the UI is stable.

This avoids breaking current analytics while making future special-category
analytics much cleaner.

---

## 12. Open Questions

1. Should `O2 assisted` always mean `100% O2`, or should the first version
   support editable mixes such as `50% O2` / nitrox-style blends? *I think nitrox blends should be selectable. This might complicate comparisons for PBs and so on.*
2. Should packing be its own special category now, or should it wait for a
   future phase? *no, packing is standard practice so we'll leave it as is.*
3. Can an attempt combine categories in the UI, e.g. `O2 + FRC`, or should the
   first version keep one primary category only? *one only*
4. Should `FRC/RV` be shown for dynamic disciplines by default, or only when a
   routine has lung-volume tracking enabled? *yesm should be available for all main disciplines*
5. Should special PBs appear on the public/community feed, or only in the
   owner’s private dashboard initially? *public*


