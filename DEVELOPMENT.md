# Development

Up: [Docs index](docs/INDEX.md)

## Choose the checkout first

Open the intended repository **worktree**, not a permanently hard-coded vault path. Before editing or making Git changes:

```sh
pwd
git status --short
git branch --show-current
git log -1 --oneline
git worktree list
```

Match the output to the task and expected commit. Stop if it differs; do not rebase another branch to make a push work. See [AGENTS.md](AGENTS.md) for approval and preservation rules.

## Local loop

Follow [README setup](README.md), then run `npm run dev`. Vite reloads the app as files change. Keep development pointed at the intended backend; localhost is not an emulator or data-isolation boundary.

1. Read the relevant map in [docs/INDEX.md](docs/INDEX.md).
2. Check [document authority](docs/code-health/document-classification.md) before following an older plan.
3. Inspect owning code and nearby tests, then make a focused change.
4. Run targeted tests; check mobile layout for UI changes.
5. Report what was verified, what remains untested, and whether changes are local, committed, pushed or deployed.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Vite development server |
| `npm run check` | SvelteKit sync and Svelte/TypeScript checks |
| `npm test` | Vitest single run |
| `npm run build` | Production app build, not deployment |
| `npm run preview` | Local preview of the app build |
| `npm --prefix functions run build` | Type-check and bundle Functions; see its [guide](functions/README.md) |
| `python3 scripts/check-doc-graph.py` | Curated map links and parent edges |
| `python3 scripts/audit-docs.py` | Classification policy and inventory freshness |
| `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts -p 'test_doc*.py'` | Documentation-tool regression tests |

For one Vitest file: `npx vitest run path/to/file.test.ts`. Do not run data scripts merely to validate application code; they can contact the configured backend.

## Editing

Use TypeScript and Svelte 5 runes for new components. Keep data transformations pure, with effects at component/adaptor boundaries and tests beside domain logic. Use scoped CSS and app variables; respect safe areas and the bottom navigation at phone widths.

VS Code with its Svelte extension is useful but optional. Find symbols rather than relying on old documentation line numbers. For Pi, launch in the intended worktree and use the concise [agent guide](AGENTS.md); feature knowledge stays in linked maps rather than duplicated editor instructions.

## Release boundary

Push/deploy requires explicit approval. Review all outgoing commits against the intended target. App, Functions and production data changes are separate operations; each needs its own verification. Never treat a successful local build as proof of a live release.
