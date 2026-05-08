# V2 Create Routine Flow Plan

Status: planning only. This follows the completed [routine-builder implementation checklist](routine-builder-implementation-checklist.md) and explains the next implementation slice: make `Create Routine` start from the v2 layer model instead of the legacy `SimplifiedRoutineBuilder`.

## Current State

- The Create Routine button routes to `/routines/create`.
- `/routines/create` currently renders `SimplifiedRoutineBuilder` directly in [src/routes/(app)/routines/create/+page.svelte](../../src/routes/(app)/routines/create/+page.svelte).
- The production v2 builder currently lives on `/routines/[id]/layers` in [src/routes/(app)/routines/[id]/layers/+page.svelte](../../src/routes/(app)/routines/%5Bid%5D/layers/+page.svelte).
- The v2 builder is an edit surface, not a create surface: it loads an existing routine by id, builds a `RoutineLayerReadModel`, edits `RoutineAuthoringLayer[]`, and saves through `writeRoutineLayerTemplateContract`.
- Admin edits from the routines list now default to `/routines/[id]/layers`, but creation still starts in the old builder because no v2 create path exists yet.

## Relevant Existing Pieces

- Fixture starting points live in [src/lib/routineLayers/defaults.ts](../../src/lib/routineLayers/defaults.ts): Dynamic Max, Static Max, Dynamic Sweet 16, Static 2-Breath Table, and Dry RV Table.
- Persistence projection lives in [src/lib/routineLayers/contract.ts](../../src/lib/routineLayers/contract.ts): `buildLayerRoutineTemplateWriteProjection` produces the v2 layer contract plus legacy compatibility fields.
- Firestore creation already exists in [src/lib/firestore.ts](../../src/lib/firestore.ts): `createRoutine(userId, routineData)` creates a custom routine document from `RoutineTemplateFormData`.
- Send/duplicate/edit compatibility helpers live in [src/lib/routineLayers/transfer.ts](../../src/lib/routineLayers/transfer.ts), but they assume an existing routine source rather than a fresh authoring-layer selection.
- The scaffold decisions and default-routine differences are documented in [routine-builder-audit-2026-05-07.md](routine-builder-audit-2026-05-07.md), especially the seeded-default comparison and routine scaffold sections.

## Goal

Create a v2 routine creation path that:

- Starts from a layer fixture or a small blank layer set.
- Writes a new routine document containing both the v2 layer contract and legacy compatibility fields.
- Routes immediately to `/routines/[newId]/layers` for continued editing.
- Keeps the old `SimplifiedRoutineBuilder` available only as a fallback until the v2 create path covers the same practical cases.

## Proposed User Flow

1. User taps `Create Routine` from `/routines`.
2. App opens a new v2 create page at `/routines/create` or a dedicated child route such as `/routines/create/layers`.
3. User chooses a starting scaffold:
   - Dynamic Max
   - Static Max
   - Dynamic Sweet 16
   - Static 2-Breath Table
   - Dry RV Table
   - Blank single layer
4. User enters minimum routine metadata:
   - Name
   - Description
   - Optional tags, if needed in this slice
5. App creates a routine document with `createRoutine` using a v2 write projection built from the selected layers.
6. App routes to `/routines/[newId]/layers` so the existing production layer editor becomes the continuation screen.

## Data Shape

Add one pure helper before touching UI:

```ts
type CreateLayerRoutineInput = {
  name: string;
  description: string;
  layers: RoutineAuthoringLayer[];
};

function buildLayerRoutineCreateData(input: CreateLayerRoutineInput): RoutineTemplateFormData & LayerRoutineTemplateWriteProjection;
```

The helper should:

- Trim name and description.
- Use `buildLayerRoutineTemplateWriteProjection(input.layers)` as the source of truth for v2 and legacy-compatible routine fields.
- Preserve generated `trackingConfig` and `displayConfig` from the projection rather than rebuilding them in the UI.
- Return a Firestore-safe object with no `undefined` values.

This keeps the create flow data-oriented: UI collects a small plain input, the helper performs a pure projection, and Firestore creation stays at the edge.

## Implementation Checklist

- [ ] Add `buildLayerRoutineCreateData` in a new pure module, probably `src/lib/routineLayers/create.ts`.
- [ ] Add tests for creating data from Dynamic Max, Static 2-Breath Table, and a blank single-layer routine.
- [ ] Add a lightweight v2 create route or replace `/routines/create` with a scaffold picker.
- [ ] Use `defaultRoutineExamples` as the initial scaffold list.
- [ ] Add a blank scaffold factory if a true blank routine is needed.
- [ ] On submit, call `createRoutine($user.uid, buildLayerRoutineCreateData(input))`.
- [ ] Route successful creates to `/routines/${routineId}/layers`.
- [ ] Keep legacy create reachable behind a temporary admin/developer fallback link if needed.
- [ ] Run focused routine-layer tests and `npm run check`.
- [ ] Remove the fallback only after the v2 create page covers metadata, scaffold selection, save errors, and cancellation cleanly.

## Validation Plan

- Unit tests:
  - Dynamic Max create data includes `routineTemplateVersion`, `layers`, `layerDefaultTags`, recording-link capability, and legacy-compatible `disciplines` without `TORT`.
  - Static 2-Breath create data includes a compatibility `table` with 10 rows.
  - Blank scaffold create data validates and produces one editable layer.
- App checks:
  - `npm test -- src/lib/routineLayers/create.test.ts src/lib/routineLayers/contract.test.ts src/lib/routineLayers/model.test.ts`
  - `npm run check`
- Manual browser check:
  - `/routines` -> `Create Routine` -> choose scaffold -> save -> lands on `/routines/[id]/layers`.
  - New routine appears in `/routines` as a custom routine.
  - Quick logging still receives planned rows for the newly created v2 routine.

## Open Decisions

- Whether `/routines/create` should be replaced directly or whether the v2 page should first live at `/routines/create/layers`.
- Whether the first slice should support only fixture scaffolds or also a true blank single-layer routine.
- Whether non-admin users should see the v2 create page immediately, or whether it should stay admin-gated for one slice while the fallback remains available.