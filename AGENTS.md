# Repository Guidelines

Overdive Dreaming — a Strava-like training tracker for pool freediving (STA, DYN, DNF, DYNB). Mobile-first SvelteKit + Firebase web app.

This file is the working guide for coding agents in **Pi**. Keep it practical, current, and biased toward safe edits.

## Pi operating rules

- Use Pi tools directly: `read` for files, `bash` for discovery (`find`, `rg`, `npm`), `edit` for precise patches, `write` for new files or full rewrites.
- Prefer `rg`/`find` over broad manual browsing. Use parallel tool calls when reading independent files.
- Before changing code, check the relevant existing implementation and nearby tests. Do not guess APIs from memory.
- Before editing, run `git status --short` and avoid overwriting human work. If unrelated files are dirty, leave them alone.
- Use `edit` with small, unique exact replacements. Merge nearby edits in the same file into one `edit` call.
- Do not read or print secrets (`.env`, service-account JSON, Wasabi credentials, Firebase private keys). Never commit generated credentials or local-only files.
- Be concise in final responses: summarize what changed, list files touched, and mention checks run or not run.
- If asked about Pi itself (extensions, SDK, TUI, themes, skills), read the Pi docs under `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/` before answering or implementing.

## Where to look first

- **[`docs/INDEX.md`](docs/INDEX.md)** — current map of active plans, stable references, shipped history, and archive. Start here for any feature area.
- **[`src/lib/types.ts`](src/lib/types.ts)** — canonical TypeScript data shapes.
- **[`src/lib/firestore.ts`](src/lib/firestore.ts)** — Firestore CRUD and schema edge.
- **[`src/lib/capture/`](src/lib/capture/)** — recorder state machine, media capture helpers, timeline conversion, upload processing.
- **[`src/lib/routineLayers/`](src/lib/routineLayers/)** — v2 routine/layer model, read models, modifiers, transfer, quick-log planning.
- **[`src/lib/metrics/registry.ts`](src/lib/metrics/registry.ts)** and **[`src/lib/utils/`](src/lib/utils/)** — metrics and pure domain helpers.
- **[`CLAUDE.md`](CLAUDE.md)** — broad historical project context. Useful background, but prefer `docs/INDEX.md` + code for current truth.
- **[`README.md`](README.md)** — user-facing setup; **[`DEVELOPMENT.md`](DEVELOPMENT.md)** — local workflow notes.

Docs conventions:
- `docs/reference/` = stable reference.
- `docs/<topic>/` = active plans and topic references.
- `docs/<topic>/shipped/` = completed plans for history.
- `docs/archive/` = superseded/stale; do not follow as guidance unless explicitly asked for history.

## Tech stack

SvelteKit + TypeScript + Svelte 5 runes. Firebase Auth (Google) + Firestore + Cloud Functions. Wasabi S3 for video/photo/CSV storage via signed URLs. Tailwind v4 + scoped CSS. Vitest for tests. Vercel for app hosting; Firebase Hosting only for `auth.overdive.app`.

## Architecture and data-oriented style

Use data-oriented design: plain data structures, pure transformations, side effects at the edges.

1. **Data is data** — readonly records / arrays / discriminated unions in `types.ts` or feature-local model files.
2. **Logic is pure functions** — `(input) -> output`, no DOM, timers, `Date.now()`, fetch, Firestore, or browser APIs.
3. **Side effects at edges** — Svelte components, Firestore adapters, media/camera adapters, upload processors, and scripts own effects.
4. **Reducers > setters** — prefer explicit intents and state reducers over scattered mutation.
5. **Derive, don't duplicate** — use `$derived` or pure helpers for computed values; avoid multiple sources of truth.
6. **Tests next to logic** — add/update `*.test.ts` beside new pure functions.

Reference patterns:
- `src/lib/components/numberWheel/wheel.ts` (pure) consumed by `NumberWheelInput.svelte` (UI/effects).
- `src/lib/capture/recorderState.ts`, `timeline.ts`, `orientation.ts` with sibling tests.
- `src/lib/routineLayers/*` for layer-model pure transformations and read models.

## Project map

```
src/
  routes/
    +page.svelte                 # Landing / sign-in
    (app)/                       # Authenticated routes
      dashboard/ analytics/ dives/ record/ routines/
      routines/create/ session/[id]/ gift/[videoId]/ import/aida/
      dive/webcodecs-spike/ profile/
  lib/
    components/                  # Svelte components (PascalCase)
    stores/                      # Auth and UI stores
    services/                    # Higher-level domain services
    capture/                     # Recorder, timeline, orientation, camera, uploads
    routineLayers/               # V2 routine layer model and read/log plans
    metrics/                     # Metric registry
    media/                       # Video / overlay / export helpers
    config/                      # tagConfig, defaults
    utils/                       # Pure helpers and app utilities
    firebase.ts                  # Firebase init
    firestore.ts                 # Firestore CRUD
    storage.ts                   # Wasabi signed upload/download helpers
    types.ts                     # Canonical app types
functions/                       # Firebase Cloud Functions
public-auth/                     # Static auth.overdive.app hosting stub
scripts/                         # Seed, audit, backup, migration, backfill utilities
static/                          # Static assets / PWA manifest
```

## Key modules

### Authentication — `src/lib/stores/auth.ts`
- Stores: `user`, `loading`, `authError`; derived `isAuthenticated`, `userId`.
- Entry points: `initAuthListener()`, `signInWithGoogle()`, `signOut()`, `getCurrentUser()`, `getCurrentUserId()`, `waitForAuth()`.
- iOS standalone PWA auth uses redirect/custom domain behavior; see `docs/reference/webapp-pwa.md`.

### Firestore — `src/lib/firestore.ts`
CRUD for routine templates/logs, sessions, dives, seasons, user settings, profiles, personal bests, gifts/group flows. Schema reference: `docs/reference/data-model.md`.

### Storage / media — `src/lib/storage.ts`, `src/lib/media/`, `functions/`
Photos, thumbnails, videos, and CSVs use Cloud Function signed URLs to Wasabi S3. See `docs/storage-infra/shipped/wasabi-migration.md`. Call out any storage path or Cloud Function changes explicitly.

### Capture — `src/lib/capture/`
Recorder state machine, timeline -> routine log conversion, orientation/posture, camera device selection, codec capabilities, upload queue/status/processing. Keep domain logic pure; browser/media APIs stay at the edge.

### Routine layers — `src/lib/routineLayers/`
Layer-based routine model, creation defaults, modifiers, display/read models, quick-log read model, attachment audit, legacy transfer. Prefer this subsystem for new routine work; check active routine docs in `docs/routines/`.

## Build, test, and development

```bash
npm run dev              # Vite dev server
npm run build            # Production build
npm run preview          # Preview production build
npm run check            # SvelteKit sync + svelte-check
npm run check:watch      # Type check, watch mode
npm test                 # Vitest, single run
npm run test:watch       # Vitest, watch mode
```

Data scripts:
- `npm run seed` / `npm run seed:logs`
- `npm run audit` / `npm run backup`
- `npm run backfill:profiles`
- `npm run backfill:dive-video-routine-logs:dry` before live backfill
- `npm run migrate:activity-types:dry` / `npm run migrate:packing-volume:dry` before live migrations
- `npm run audit:routine-metric-attachment`
- `npm run rollback:aida` for emergency rollback

Any script that mutates production data must support and be run in dry-run mode first.

## Coding style

- 2-space indentation.
- TypeScript everywhere, including `<script lang="ts">`.
- Svelte 5 runes: `$state`, `$derived`, `$props`, `$effect`. Do not introduce legacy `$:` or `export let` in new Svelte components. Auto-subscribe `$store` and `bind:value` are fine.
- Components: PascalCase (`SessionCard.svelte`). Routes: SvelteKit conventions (`+page.svelte`, `+page.ts`, `[param]`, route groups).
- Styling: prefer scoped `<style>` blocks over dense Tailwind utilities. Use CSS variables from `src/app.css`. Dark theme only.
- Mobile-first: test mentally and/or in browser at ~375px width. Respect bottom nav and safe-area insets.

## Testing expectations

- Vitest tests live next to code: `foo.ts` -> `foo.test.ts`.
- For pure logic, add focused tests for normal cases and edge cases.
- For UI-only changes, run at least `npm run check` when practical.
- For logic changes, run targeted Vitest first, then broader tests if the change is cross-cutting.
- If checks are skipped, say why in the final response.

## Documentation maintenance

- If an implementation changes a documented design, update the relevant doc or explicitly note the mismatch.
- When a plan ships, move it to the topic's `shipped/` folder and update `docs/INDEX.md`.
- When a plan is superseded, move it to `docs/archive/` and note the replacement in `docs/INDEX.md`.
- New plans: create kebab-case markdown under the relevant topic and add it to `docs/INDEX.md`.

## Commit / PR hygiene

- Short imperative commit messages (`Add ...`, `Fix ...`, `Refactor ...`).
- PR summaries should include affected routes/components and screenshots for UI changes.
- Call out explicitly: Firestore rules/indexes, schema/type changes, Cloud Functions, auth, storage paths, migrations/backfills.
- Do not `--no-verify`; do not force-push without asking.
