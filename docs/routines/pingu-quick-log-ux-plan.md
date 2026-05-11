# Mixed-Layer Quick Log UX Plan

Status: planned.

## Context

The Pingu Routine is the first concrete test case for a broader mixed-layer routine class. It has two layers:

1. A static breath hold layer.
2. A direct transition into a dynamic layer.

This makes it a useful test case for improving Quick Log because the form needs to respect row/layer structure instead of treating the entire log as one globally selected discipline.

The implementation should not special-case Pingu. The same rules need to work for any future routine that mixes static, dynamic, selectable, fixed, wet, dry, max, submax, table, or transition layers in one log.

## Design Principle

Quick Log should be plan-driven. The planned rows and their source layers decide what the user needs to enter. The routine name is just an example label; it must not drive form behavior.

For future mixed routines, derive the UI from:

- each row's source layer discipline and selectable discipline options;
- each row's planned duration and distance targets;
- each layer's environment, effort, analytics role, and metric profile;
- routine-level safety constraints, especially whether any dynamic layer is present;
- the routine narrative and description for user-facing context.

## Evaluation

### Start With Routine Narrative

The current "Routine Plan" card is too structural for the start of the Quick Log flow. It exposes implementation details before the athlete has entered anything.

Recommendation: replace or demote the opening plan card and lead with the routine's narrative description. The layer plan can still be available as compact supporting context, but the first thing the user sees should explain what they are about to do in training language.

### Restrict O2 Assisted Attempt Type

O2 assisted should not be offered for mixed-discipline routines or any routine containing a dynamic layer. It is only appropriate for static max attempts.

Recommendation: make O2 availability a derived routine condition, not a generic `STA` discipline option. A good first rule is:

- offer O2 assisted only when the routine is a single static max attempt;
- hide O2 assisted when any planned or selectable layer is dynamic, including future transition or hybrid routines;
- keep O2 static layer routines defaulting to O2-assisted conditions through the layer model, not through a generic Quick Log chip.

This should live in pure routine/attempt option logic so Quick Log and edit forms stay consistent.

### Remove Attempt Category Preview Tile

The category preview tile in the Attempt Type card adds clutter and repeats information the user does not need during fast logging.

Recommendation: remove the preview tile from Quick Log. Category/PB bucketing can still be derived and saved internally. If the category ever needs to be visible, show it only in review/detail contexts.

### Make Row Results Layer-Aware

The current discipline-level selector can change the whole row logging table between static-style time fields and dynamic-style distance fields. That breaks mixed routines like Pingu and any future mixed-layer routine where one row needs static duration fields while another row needs dynamic distance and/or duration fields according to its setup.

Recommendation: row result inputs should be driven by each planned row's layer data:

- static rows show duration/completion fields and no distance field;
- dynamic rows show distance and/or duration based on the row's own planned targets and tracking config;
- hybrid/transition rows show only the fields represented by their own plan data;
- fixed planned values should appear as compact context, while editable fields should represent actual completion;
- the global discipline control should not rewrite row input shape for routines with fixed layer disciplines.

### Move Row Results Higher

For mixed-layer routines, completion of the planned rows is the core logging task. The Row Results card should appear much earlier.

Recommendation: move Row Results directly below the session basics, likely after Visibility. Keep media, training context, and advanced physiology below the core result entry.

### Prefer Per-Row Discipline Selection When Needed

When discipline choice is genuinely selectable, a global discipline control is too blunt for layered routines.

Recommendation: for row/layer plans with selectable disciplines, use a per-row or per-layer discipline dropdown. Use the global discipline selector only for legacy/single-layer routines where one choice truly applies to the whole log.

The dropdown should be generated from that row or layer's allowed disciplines. It should not let a user pick a discipline that changes unrelated rows.

## Proposed Implementation Steps

1. Add a pure Quick Log layout/read-model rule for attempt option availability.
2. Remove the Attempt Category preview tile from Quick Log.
3. Replace the opening Routine Plan card with a routine narrative section and move structural plan details into compact supporting context.
4. Promote Row Results above advanced/context sections.
5. Update row result rendering so each row's editable fields come from its own planned row metadata.
6. Add per-row or per-layer discipline controls for selectable mixed routines.
7. Cover Pingu-style static-to-dynamic routines and at least one additional mixed-layer shape in read-model tests before component changes.

## Acceptance Notes

- Pingu should show static completion fields for the static row and dynamic completion fields for the dynamic row in the same Row Results card.
- Future mixed-layer routines should derive row fields from the row/layer plan, not from routine name or one global selected discipline.
- O2 assisted should not appear as an attempt option for Pingu or any routine with a dynamic layer.
- The Quick Log opening should communicate the routine narrative before implementation-level row structure.
- The fastest path through the form should be visibility, row results, then optional context.
