# Generated Code Debt Audit

This is the working file for auditing redundant, unused, stale, or low-confidence code that may have accumulated across multiple generations of LLM-assisted development.

The goal is not to shame generated code. The goal is to separate useful scaffolding from code that no longer earns its keep, then remove or simplify it with evidence.

## Research Summary: Using LLMs Well For Cleanup

The most effective LLM-assisted cleanup workflow is evidence-first and multi-pass. LLMs are strong at pattern recognition, summarizing related code paths, and proposing simplifications. They are weak when asked to declare code unused from a single search result or to perform broad refactors without executable checks.

Use LLMs as audit partners, not deletion authorities:

- Start with static evidence: TypeScript checks, Svelte checks, tests, import graphs, dependency scans, route maps, Firestore/storage call sites, and `rg` searches.
- Ask the LLM to form hypotheses, then require it to attach each finding to concrete references and a cheap verification command.
- Prefer small, reversible cleanup patches. A file is a removal candidate only after import/reference checks, route reachability checks, and domain review agree.
- Separate dead code from compatibility code. Older aliases, migration helpers, and schema healing functions can look redundant but may protect historical Firestore data.
- Audit by ownership boundary. UI components, pure domain helpers, Firestore adapters, capture/media workers, scripts, and docs each need different proof before deletion.
- Make each LLM pass narrow: inventory, duplication, unused exports, stale docs, large-component extraction candidates, then deletion candidates.
- Use two-model or two-pass review for risky removals: one pass proposes, another tries to disprove.
- Keep an audit ledger. Record evidence, confidence, verification, decision, and follow-up instead of relying on chat history.

## What Counts As Generated Code Debt

Treat these as signals, not automatic delete rules:

- Large components with many responsibilities and local business logic.
- Duplicate CSS, form validation, formatting, data normalization, or Firestore mapping logic.
- Unused exports, unreferenced components, abandoned route experiments, and old generated artifacts.
- Compatibility aliases whose original data shape may no longer exist, or whose consumers have been migrated.
- Over-general utilities used once.
- TODO-heavy code without an active plan.
- Docs that describe superseded implementations but are not in `docs/archive/` or `shipped/`.
- Scripts that mutate data without dry-run safeguards or whose target schema has moved on.
- UI controls or model fields that are collected but never persisted, displayed, queried, or analyzed.

## Evidence Standard

Every finding should use this format:

| Field | Meaning |
| --- | --- |
| Area | Component, route, helper, script, doc, function, or data field. |
| Signal | Why it looks redundant, unused, stale, or low-confidence. |
| Evidence | Concrete files, references, command output, or tests. |
| Risk | What could break if changed or removed. |
| Verification | The cheapest check that would disprove the finding. |
| Decision | Keep, simplify, archive, remove, or investigate later. |
| Confidence | Low, medium, or high. |

Deletion requires high confidence. Simplification can start at medium confidence if tests cover the behavior or the patch is small.

## Audit Passes

### Pass 1: Inventory And Reachability

- Map app routes under `src/routes/` and note intentionally experimental routes.
- List top-level folders and classify app code, functions, scripts, docs, data, generated artifacts, and experiments.
- Run import/export analysis for `src/` and `functions/src/`.
- Identify files outside the app path that may be historical artifacts, such as one-off HTML experiments or temporary check outputs.

Suggested commands:

```bash
npm run check
npm test
rg --files src functions scripts docs
rg "TODO|FIXME|deprecated|legacy|unused|temporary|hack|compat" src functions scripts docs
```

Potential extra tools to evaluate before adding them:

- `knip` for unused files, exports, and dependencies in TypeScript projects.
- `depcheck` for unused package dependencies.
- `ts-prune` if `knip` is too noisy for SvelteKit.
- Coverage from Vitest for pure helpers, with caution because UI code may be intentionally untested.

### Pass 2: Duplicate Logic And Overgrown Components

- Start with known hotspots from existing docs: `QuickLogForm.svelte`, `EditableLogForm.svelte`, routine builder components, and shared form/card/tag/button CSS.
- Search for repeated validation rules, time parsing, metric formatting, date formatting, and Firestore shape conversion.
- Prefer extracting pure helpers only where two or more active call sites need the same behavior.

### Pass 3: Compatibility And Migration Layers

- Review `src/lib/utils/migration.ts`, Firestore read/write adapters, and any deprecated type fields.
- For each alias or normalizer, identify the historical data shape it protects.
- Do not remove compatibility code until production data has been audited or a one-time migration has shipped.

### Pass 4: Data Model Fields With No Full Lifecycle

Trace selected fields through create, edit, persist, read, display, analytics, and export paths.

Known candidates from prior audits:

- Routine `defaultTags` and `selectableTags` lifecycle.
- Hybrid routine fields such as max effort and static interval targets.
- Display metrics that can be selected but may not be tracked or derivable.
- Legacy routine tags versus newer activity type and tag models.

### Pass 5: Scripts And Infrastructure

- Separate production migration/backfill scripts from one-off historical scripts.
- Confirm every production data mutation script has a dry-run mode or clear safety mechanism.
- Flag scripts that read old collection paths or schema shapes.
- Check Firebase Functions exports against deployed function names and `firebase.json` expectations.

### Pass 6: Documentation Hygiene

- Move superseded plans to `docs/archive/`.
- Move shipped plans to topic-level `shipped/` folders.
- Update `docs/INDEX.md` when a doc is promoted, archived, or superseded.
- Identify docs whose claims conflict with implemented code.

## First-Pass Repository-Specific Leads

These are leads to verify, not conclusions:

- Large form components are already documented as code-health issues in `docs/ui-patterns/medium-priority-improvements.md`.
- Existing data audit scripts focus on Firestore contents, not unused app code.
- Compatibility helpers in `src/lib/utils/migration.ts` are likely intentional and should be audited against real data before removal.
- The docs tree has many shipped and archived plans; some active plans may now be partially implemented and ready for reclassification.
- Top-level experimental or generated files should be classified so they do not distract from application code audits.

## Working TODO

- [ ] Create an inventory of active source files, experimental files, scripts, and docs.
- [ ] Run baseline checks: `npm run check` and `npm test`.
- [ ] Evaluate an unused-code tool on a branch or no-write pass, starting with `knip` if it supports the SvelteKit setup cleanly.
- [ ] Produce an unused files/exports candidate list with evidence and confidence.
- [ ] Produce a duplicate logic candidate list for forms, metrics, validation, Firestore mapping, and CSS.
- [ ] Audit large components and identify extraction opportunities that reduce real complexity.
- [ ] Trace lifecycle completeness for tags, hybrid routine fields, display metrics, and legacy aliases.
- [ ] Audit scripts for dry-run safety, current schema paths, and production-data risk.
- [ ] Audit docs for stale active plans, missing archive moves, and implementation mismatches.
- [ ] Review findings in batches and apply cleanup in small pull-request-sized patches.
- [ ] After each cleanup patch, run the narrowest relevant tests, then `npm run check` for UI/type changes.

## LLM Prompt Template For Findings

Use this prompt shape for each narrow pass:

```text
Audit only. Do not edit code.

Scope: <files/folder/feature>
Goal: Find redundant, unused, stale, or over-general code.
Evidence required: exact references, command/search used, and a disproof check.
Constraints: preserve compatibility code unless historical data is ruled out; do not propose broad rewrites.
Output format: Area, Signal, Evidence, Risk, Verification, Decision, Confidence.
```

## Decision Rules

- Keep code that protects production data, even if it looks old, until a data audit proves it unnecessary.
- Prefer simplification over deletion when a concept is active but overbuilt.
- Prefer archiving docs over deleting historical planning context.
- Remove code only when there is no route, import, dynamic lookup, data migration need, or documented future dependency.
- When uncertain, write the uncertainty into the audit ledger instead of turning it into a refactor.