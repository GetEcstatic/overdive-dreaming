# Routine Editor UI/UX Flow Recovery Plan

Status: planning only. Do not implement this plan until the open questions are answered or explicitly waived.

## Problem

The production v2 routine editor at `/routines/[id]/layers` currently presents itself like a diagnostic layer read-model page. It shows status metrics, validation, projection comparison, expanded rows, legacy projection details, layer lists, and full detail controls all at once.

That is useful for debugging the layer contract, but it is not the intended authoring experience for a new blank routine. A new routine should start with a calm layer-building flow: one layer, horizontal segments, and a single obvious way to add another layer.

## Target First Screen For New Blank Routines

When a user creates a new blank routine and lands in the editor, the first screen should show only:

- One layer.
- All of that layer's segments laid out in a horizontal row.
- Modifier chips above the segment row, but only after modifiers have been defined.
- A large `+` button below the layer for adding another layer.

No status metrics, expanded rows, projection comparison, legacy projection, validation dashboard, or hero-metric controls should be shown on the initial blank-routine authoring screen.

## Authoring Hierarchy

The routine editor should follow this hierarchy:

1. Routine.
2. Layer.
3. Segment.
4. Modifier.
5. Hero metrics, after all layers are defined.

The UI should reflect that hierarchy. The user should not be asked to reason about projection output or analytics display while still defining the routine shape.

## Layer Canvas

Each layer should render as a horizontal segment row.

Initial blank layer segment row:

- Discipline.
- Breathe-up.
- Dive.
- Setup.
- Reps.

The first blank layer should be the main visual focus. The page should not use a left-side layer list plus separate right-side details for the new blank routine flow.

Layer controls for the first pass:

- Large `+` button below the current layer to add a layer.
- Layer ordering, deletion, duplication, and naming can be added later only if needed for the same pass.

## Segment Interaction

Clicking a segment opens the segment editor.

The segment row itself should stay compact:

- Segment label.
- Short summary of the segment's current state.
- Visual selected state when open.

The segment editor should be the only place where detailed controls appear. For example:

- Clicking `Discipline` opens discipline controls.
- Clicking `Breathe-up` opens breathe-up controls.
- Clicking `Dive` opens duration/distance controls.
- Clicking `Setup` opens lung volume/environment controls.
- Clicking `Reps` opens repeat-count controls.

## Modifier Chips

Once modifiers are defined, render chips above the segment row.

Chip rules:

- Use a single key/value phrase per chip, such as `Default discipline = DYN` or `Duration = 02:30`.
- Group chips visually by their segment group.
- Do not split one meaning across adjacent pills.
- Chips should wrap or stack without overflowing their layer container.
- Chips should summarize defined modifiers; they should not be the primary editing surface.

## Numeric Inputs

The segment editor should continue to use the existing wheel selector pattern for numeric values:

- Durations use the existing two-part `mm:ss` duration wheel.
- Distances use the number wheel in meters.
- Reps use the number wheel and default to `1 rep`.

This is now available in the current editor controls and should be preserved when the UI is reorganized.

## Metrics And Projection Output

Metrics should not be shown during layer authoring.

Hero metrics are selected only after all layers are defined. That should be a later step, not part of the first blank-routine layer screen.

The projection comparison card should be removed from the routine editor for new blank routines. It is not meaningful to users creating a routine. If projection comparison remains useful for development, it should move to an admin/debug view or be hidden behind an explicit debug affordance.

## Existing Route Split Recommendation

Keep two mental models separate:

- User authoring view: calm layer/segment/modifier editor for routine creation and normal editing.
- Debug/admin view: read-model status, projection comparison, expanded rows, and legacy projection diagnostics.

Implementation should either:

- Split `/routines/[id]/layers` into a user-facing authoring mode and a debug mode, or
- Create a separate debug route and make `/routines/[id]/layers` the authoring view.

The second option is cleaner if this editor is meant to become the default routine builder.

## Implementation Plan After Approval

1. Introduce a blank-routine authoring layout that renders only the layer canvas and add-layer affordance.
2. Build a reusable `LayerCanvas` component that accepts the selected authoring layer and renders modifier chips plus the horizontal segment row.
3. Build a `SegmentEditor` component that renders controls for only the selected segment.
4. Move current discipline, breathe-up, dive, setup, and reps controls into the relevant segment editor panels.
5. Hide projection comparison, read-model status, expanded rows, and legacy projection from the default blank-routine editor view.
6. Add a later hero-metric selection step after layer definition is complete.
7. Validate at mobile and desktop widths with one-layer and multi-layer routines.

## Open Questions

- Should the debug/read-model tooling move to a separate route, or should it remain on the same route behind an admin-only debug toggle? *Let's use an admin-only debug toggle for this.*
- When a user adds a second layer, should the new layer appear below the first layer immediately, or should only one layer be expanded at a time? *Yes, it should appear directly below the first layer and selection should move to the new layer. Only selected segments should be viewed in the editor.*
- Should the segment editor open inline below the selected segment row, or as a bottom sheet/modal on narrow screens? *I think inline below the selected row. If there are lots of rows it could get clumsy scrolling up and down all the time if the editor is below all the rows.*
- Should hero metric selection be a distinct final step with a `Next` action, or should it appear automatically once the user has at least one complete layer? *After the next action*
- Should the first blank layer default to dynamic, static, or use the discipline selected during creation as the source of truth? *Use the discipline selected during creation as source of truth.*

## Acceptance Criteria

- New blank routines open to one visible layer with horizontal segments.
- The only visible action below the initial layer is a large add-layer `+` button.
- Segment details are hidden until a segment is clicked.
- Defined modifiers appear as chips above the segment row.
- Metrics, expanded rows, projection comparison, and legacy projection are absent from the new blank-routine authoring view.
- Hero metrics are deferred until layer definition is complete.
- Existing wheel selector behavior remains in use for duration, distance, and reps.

## Implementation Checklist

- [x] Record answered open questions and convert them into implementation steps.
- [x] Add an admin-only debug toggle so read-model status, projection comparison, expanded rows, and legacy projection are hidden by default.
- [x] Replace the default editor surface with a layer canvas: modifier chips above a horizontal segment row.
- [x] Add selected-segment state and show the relevant inline segment editor only after a segment is clicked.
- [x] Move existing discipline, breathe-up, dive, setup, and reps controls into their segment-specific editors.
- [x] Replace the ordinary add-layer controls with a large `+` affordance that inserts below the selected layer and selects the new layer.
- [x] Preserve current save/reset behavior without reintroducing diagnostic metrics into the default authoring view.
- [x] Validate with focused tests and `npm run check`.
- [x] Commit each major implementation slice.

# Fixes required

## Fix Implementation Plan

- [x] Make layer names editable by clicking the name in the layer card.
- [x] Add a large left-side layer number to each layer card.
- [x] Hide distance controls for STA dive segments.
- [x] Reduce segment cards to titles only.
- [x] Move compact modifier chips into per-segment stacks above the segment they modify.
- [x] Deep-strip `undefined` values before saving edited layer projections to Firestore.
- [x] Triage the Firestore Listen `ERR_BLOCKED_BY_CLIENT` console message as client/browser blocking, not a routine-editor code failure.

~~Layer names need to be editable (by clicking on them)~~

~~Each layer card should have a large, clear number on the left.~~

~~In an STA layer, distance should not be offered as a dive modifier.~~

~~Segments only need their titles, no other information. The chips define them and carry additional info required.~~

~~Chips need to stack neatly above the segment they are modifying. Currently the are too long and overlap segments. I don't think the modifiers need their descriptions: e.g. "Default discipline = default STA" could simply be "STA"~~

~~When clicking "save" I'm getting a "Failed to save error". In the console this is reported as "+page.svelte:181 Failed to save layer changes: FirebaseError: Function updateDoc() called with invalid data. Unsupported field value: undefined (found in document routines/xPLGtpZp10UQcnJKs1Q6)"~~

~~I'm also getting one error as soon as I click the create routine button: "firebase_firestore.js?v=4ed72190:2073  POST https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?VER=8&database=projects%2Foverdive-dreaming-fb%2Fdatabases%2F(default)&gsessionid=bb9KiaSg1CH3NIWscCRoRIHvFewzmcWgYqHd5hWhC3JWla1s_ANw0A&SID=YTiKIb42Wxa8eYmjrpkBEg&RID=94467&TYPE=terminate&zx=ev1c4jrnhw1z net::ERR_BLOCKED_BY_CLIENT"~~

Note: the Firestore Listen `ERR_BLOCKED_BY_CLIENT` message is emitted by the browser/network layer when the Firestore streaming request is blocked or terminated by a client-side blocker. It is separate from the routine save failure, which was caused by nested `undefined` values in the layer write projection and has been fixed in the Firestore write helper.