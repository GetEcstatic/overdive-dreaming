# Routines and persisted logs — implementation map

Up: [Docs index](../INDEX.md) · Status: current code-backed navigation; not a production-data or end-to-end UX certification

## Find the owner

| Task | Owning implementation | Verification |
|---|---|---|
| Layer authoring shape, expansion and validation | [model.ts](../../src/lib/routineLayers/model.ts) | [Model tests](../../src/lib/routineLayers/model.test.ts) |
| Versioned layer contract and legacy-compatible write fields | [contract.ts](../../src/lib/routineLayers/contract.ts) | [Contract tests](../../src/lib/routineLayers/contract.test.ts); preserve compatibility rather than deleting legacy fields |
| Read legacy and v2 templates uniformly | [readModel.ts](../../src/lib/routineLayers/readModel.ts), [legacy.ts](../../src/lib/routineLayers/legacy.ts) | [Read-model tests](../../src/lib/routineLayers/readModel.test.ts), [legacy tests](../../src/lib/routineLayers/legacy.test.ts) |
| Create a routine from a scaffold or blank layer | [create.ts](../../src/lib/routineLayers/create.ts), [defaults.ts](../../src/lib/routineLayers/defaults.ts) | [Create tests](../../src/lib/routineLayers/create.test.ts); route `src/routes/(app)/routines/create/+page.svelte` owns submission/navigation |
| Edit authoring layers and projected metrics | `src/routes/(app)/routines/[id]/layers/+page.svelte`; [modifiers.ts](../../src/lib/routineLayers/modifiers.ts) | [Modifier tests](../../src/lib/routineLayers/modifiers.test.ts); inspect access gates as well as model capabilities |
| Quick Log sections, row selection and O2 intent | [quickLogReadModel.ts](../../src/lib/routineLayers/quickLogReadModel.ts), [QuickLogForm](../../src/lib/components/QuickLogForm.svelte) | [Read-model tests](../../src/lib/routineLayers/quickLogReadModel.test.ts) |
| Save, edit and display row results | [logPlan.ts](../../src/lib/routineLayers/logPlan.ts), [EditableLogForm](../../src/lib/components/EditableLogForm.svelte), [EditRoutineLogModal](../../src/lib/components/EditRoutineLogModal.svelte) | [Log-plan tests](../../src/lib/routineLayers/logPlan.test.ts); preserve plannedRows, resultRows and compatible laps together |
| Metric values from saved logs | [metrics.ts](../../src/lib/utils/metrics.ts), [metric registry](../../src/lib/metrics/registry.ts) | Resolve through row-aware helpers; do not rebuild totals independently in page markup |
| Tags and attempt categories | [tagConfig.ts](../../src/lib/config/tagConfig.ts), [quickLogAttempt.ts](../../src/lib/utils/quickLogAttempt.ts), [attemptCategories.ts](../../src/lib/utils/attemptCategories.ts) | [Attempt tests](../../src/lib/utils/quickLogAttempt.test.ts), [category tests](../../src/lib/utils/attemptCategories.test.ts) |
| Template transfer and projection drift | [transfer.ts](../../src/lib/routineLayers/transfer.ts), [attachmentAudit.ts](../../src/lib/routineLayers/attachmentAudit.ts) | [Transfer tests](../../src/lib/routineLayers/transfer.test.ts), [audit tests](../../src/lib/routineLayers/attachmentAudit.test.ts); production writes require separate approval/dry run |
| Persisted shapes, normalisation and CRUD | [types.ts](../../src/lib/types.ts), [migration.ts](../../src/lib/utils/migration.ts), [firestore.ts](../../src/lib/firestore.ts) | Inspect both read normalisation and write preparation; a type declaration alone is not the storage path |
| Access and query indexes | [firestore.rules](../../firestore.rules), [firestore.indexes.json](../../firestore.indexes.json) | Source policy is not proof of live deployment; do not infer permissions from UI filters |

## Storage and compatibility invariants

- Routine templates live in `routines`; routine-log CRUD uses **top-level `routineLogs`**, not `sessions/{id}/routineLogs`. Current reads include `sessionGroup` grouping. Inspect actual call sites before changing association semantics.
- `sessions` still exists for legacy/ad-hoc flows, including recorder containers. `firestore.ts` also retains nested dive helpers. Do not delete a collection or propose migrations solely because an old diagram is wrong.
- `LayerRoutineTemplateContract` in `contract.ts` owns the v2 extension; the base `RoutineTemplate` in `types.ts` is not the whole authoring contract. Write projections deliberately emit both layers and compatibility fields.
- `getRoutineTemplateLayers` reads v2 layers when present and otherwise projects legacy templates. Legacy support is live behaviour, not deprecated code just because the old builder design is superseded.
- Saved `plannedRows` capture the log-time plan. Edit hydration prefers saved row results, with legacy laps as fallback. Changing a template later must not silently replace the saved log's plan.
- Layer-only `O2STA` maps to stored `STA`; `TORT` maps to `DYN`. Preserve attempt conditions/PB category distinctions rather than widening stored disciplines casually.
- Tags are not all builder-only: `tagConfig.ts` allows default and selectable tags, and Quick Log emits selected tags. Inspect layer-derived defaults and log-time selection separately.
- The old schema document's blanket owner-only privacy claim is not a rules audit. In particular, several current `allow list` clauses permit authenticated listing. Review rules deliberately before asserting isolation; no security policy changes were made in this documentation pass.

## Verified gaps to retain in planning

- The create route is not locally admin-gated and navigates to `/routines/{id}/layers`, while the layer editor checks `userIsAdmin` and shows an admin-access-required state otherwise. Non-admin create-to-edit completion needs explicit investigation and an authenticated smoke test; existing checklist ticks do not prove it works.
- The model, defaults, compatibility projection and logging forms support O2 intent, but the blank-create and layer-editor discipline option arrays omit `O2STA`. Do not label the entire O2 authoring plan complete. The preset and explicit selector paths are different.
- Unit tests do not establish the state of seeded defaults, completed backfills, deployed rules or live accounts. No production reads or writes were performed for this audit.

## Design history and remaining work

- Historical: [V2 create flow](v2-create-routine-flow-plan.md) — implemented create projection and navigation; old Current State is a baseline, not today's route.
- Historical: [Builder checklist](routine-builder-implementation-checklist.md) — rollout record, not independently verified acceptance for every checked item.
- Historical: [Quick Log audit](quick-log-v2-routine-audit.md) — read model and row emission exist; early gap statements and historical backfill claims are not current authority.
- Historical: [Row round-trip plan](multilayer-log-roundtrip-plan.md) — row hydration, conversion and metric read models exist; implementation retained EditableLogForm rather than adopting the suggested shared-form architecture verbatim.
- [O2 static plan](o2-static-layer-discipline-plan.md) — partially implemented; needs review of remaining authoring/audit scope, not a fresh instruction to implement everything.
- Superseded: [Old database structure](../reference/data-model.md), [tag matrix](tags.md), [three-type builder](builder-simplified.md) — use the owners above.

Other routine plans remain in the [classification inventory](../code-health/document-classification.md). Unreviewed does not mean abandoned.
