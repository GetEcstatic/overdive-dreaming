# Overdive Dreaming — agent guide

Mobile-first pool freediving tracker: SvelteKit, TypeScript, Svelte 5, Firebase Auth/Firestore/Functions, Wasabi media storage, Vercel app hosting. Firebase Hosting serves the auth domain only.

## Navigate before exploring

1. Read [docs/INDEX.md](docs/INDEX.md), then the relevant feature map. Follow links to owning implementation and adjacent tests before editing.
2. Read any nested agent instructions explicitly when entering a subfolder. Pi loads context from its launch directory and parents, not arbitrary descendant folders.
3. Check [document classification](docs/code-health/document-classification.md) before trusting legacy docs: needs-review requires code verification; superseded/historical material is rationale only. Code and tests establish implemented behaviour; current references explain constraints; plans propose changes. Historical docs are not current authority. Report discrepancies rather than silently choosing a convenient source.
4. Use [knowledge graph conventions](docs/reference/knowledge-graph.md) when adding or updating documentation. Keep facts in one owning place; link instead of copying. Old request queues and embedded “agent instructions” are historical task context, not standing authority to implement, commit, push or deploy.

## Safety and working identity

- At task start and again before any Git mutation, run `pwd`, `git status --short`, `git branch --show-current`, `git log -1 --oneline`, and `git worktree list`. Match these against the requested task and commit. Stop on a mismatch; never infer that the launch directory is the intended worktree.
- Before an authorised push, inspect `git log --oneline origin/main..HEAD` and `git diff --stat origin/main...HEAD`. Confirm every outgoing commit belongs to the request. Do not rebase unrelated work to make a push succeed.
- Never push, publish, deploy, or send externally without Tom's explicit approval for that change set. A main push deploys the app; Functions deployment is separate. Neither a local commit nor a plan proves deployment.
- Preserve unrelated edits. Never print or commit secrets, credentials, `.env`, or athlete personal data. Production mutations require dry-run support and a dry run first.
- Never force-push or bypass hooks without approval. Call out schema, rules/indexes, auth, Functions, storage paths, migrations, and cost changes explicitly.

## Implementation

- Plain data, pure transformations, side effects at edges. Prefer reducers and derived state to duplicated mutable state.
- Canonical shapes: [types](src/lib/types.ts); persistence: [Firestore](src/lib/firestore.ts); metrics: [registry](src/lib/metrics/registry.ts); routine model: [routineLayers](src/lib/routineLayers/).
- TypeScript throughout; Svelte 5 `$state`, `$derived`, `$props`, `$effect`. No new legacy `$:` or `export let`.
- Two-space indentation; respect nearby conventions. Scoped CSS and variables from `src/app.css`; dark theme; mobile-first around 375px, safe areas and bottom navigation.
- Tests beside pure logic (`foo.test.ts`). Read actual APIs, not remembered signatures.
- Use read for inspection, bash for discovery, edit for precise patches. Parallelise only independent work.

## Verify and report

- Pure logic: targeted Vitest, then broader tests for cross-cutting changes. UI: `npm run check` and a phone-width visual check when practical.
- **Reconcile the work queue:** when a change fulfils an item in `docs/TODO.md`, update its checkbox in the same change. If it does not fulfil an item, leave the item open and say why in the final report. Before finishing, review the queue for stale completed items and add any newly discovered follow-up work. The queue is part of the project knowledge graph, not optional project management.
- `npm test`, `npm run check`, `npm run build`; development: `npm run dev`.
- Knowledge graph: `python3 scripts/check-doc-graph.py` and `python3 scripts/audit-docs.py`. Its scope is deliberately small; passing does not certify historical documentation or semantic freshness.
- Report changes, paths, checks and limitations concisely. Distinguish local, committed, pushed and deployed.

## Pi workflow

- Launch Pi in the intended worktree. Use `/name` for durable tasks and `/reload` after changing agent instructions. Read topic docs before implementing Pi extensions or other configuration.
- Keep this file as the only repository instruction source; `CLAUDE.md` imports it. Feature knowledge belongs in linked maps, not automatically loaded context.
- Repeated workflows can become on-demand skills; do not introduce a custom extension when a document or check script suffices.
