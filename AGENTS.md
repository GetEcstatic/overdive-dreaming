# Repository Guidelines

Overdive Dreaming — a Strava-like training tracker for pool freediving (STA, DYN, DNF, DYNB). Mobile-first SvelteKit + Firebase web app.

## Where to look first

- **[`CLAUDE.md`](CLAUDE.md)** — full project context: vision, design system, data model, conventions. Read this for deep background.
- **[`docs/INDEX.md`](docs/INDEX.md)** — index to all planning, design, and reference docs (organised by topic; status-grouped view in the index).
  - `docs/reference/` — stable docs (data model, training session design, PWA/auth setup, how-it-works).
  - `docs/<topic>/` — active plans + topic references.
  - `docs/<topic>/shipped/` — completed plans (historical context).
  - `docs/archive/` — superseded/stale docs (don't follow as guidance).
- **`src/lib/types.ts`** — canonical TypeScript types for all data shapes.
- **`README.md`** — user-facing setup; **`DEVELOPMENT.md`** — VS Code workflow (mostly for the human, not agents).

## Tech stack

SvelteKit + TypeScript + Svelte 5 (runes). Firebase Auth (Google) + Firestore + Cloud Functions. Wasabi S3 for video/photo/CSV storage. Tailwind v4 + scoped CSS. Vitest for tests. Vercel for app hosting; Firebase Hosting for `auth.overdive.app` only.

## Approach to planning and implementation

**Use a "data oriented design". Express whatever possible as plain data structures. Clojure philosophy. Try to implement the majority of logic as pure functions. Move side effects to the edges of the system.**

This applies to both **planning** (when sketching how a feature should work, lead with the data shape and the pure transformations on it; treat side effects as a thin outer layer) and **implementation** (when writing the code, prefer plain records / arrays / discriminated unions and pure `(input) → output` functions; isolate Firestore, DOM, timers, fetch, vibrate at the edges).

Concretely:
1. **Data is data** — readonly records / arrays / discriminated unions in `types.ts`. Don't bury data inside DOM, stores, or class instances.
2. **Logic is pure functions** — `(input) → output`, no DOM / no `Date.now()` / no `fetch` / no Firestore calls. Test these directly.
3. **Side-effects at the edges** — Firestore, DOM listeners, vibrate, `setTimeout`, file IO live in thin adapter layers. UI components subscribe to data and dispatch *intents*; they don't own business logic.
4. **Reducers > setters** — single `reduce(state, intent)` pure function over scattered imperative mutations.
5. **Derive, don't store** — if a value can be computed from other state, compute it (`$derived`, helper). No two sources of truth.

Reference example: `src/lib/components/numberWheel/wheel.ts` (pure data + pure functions) consumed by `NumberWheelInput.svelte` (side effects). The `src/lib/capture/` subsystem follows the same shape — recorder state machine, timeline conversion, orientation logic are all pure with `*.test.ts` siblings; the Svelte recorder component is the side-effect edge. See `docs/ui-patterns/wheel-selector.md`.

When adding logic, default to a `.test.ts` file alongside the pure function.

## Project Structure

```
src/
  routes/
    +page.svelte                 # Landing / sign-in
    (app)/                       # Authenticated route group
      dashboard/  dives/  dive/  record/  session/  routines/
      analytics/  gift/  import/  profile/
  lib/
    components/                  # Svelte components (PascalCase)
    stores/                      # Svelte stores (auth, video playback, etc.)
    services/                    # Higher-level domain services (e.g. diveVideos)
    capture/                     # Recorder state machine, timeline, orientation, camera, codec capabilities
    media/                       # Video / overlay / export helpers
    config/                      # tagConfig, defaults
    utils/                       # Pure helpers (metrics, time, lap tables, parsers)
    firebase.ts                  # Firebase init
    firestore.ts                 # CRUD ops for all collections
    storage.ts                   # Storage helpers (photos, thumbnails)
    types.ts                     # All TypeScript interfaces
functions/                       # Firebase Cloud Functions (signed URLs, server-side work)
public-auth/                     # Static stub for auth.overdive.app (Firebase Hosting only)
scripts/                         # Seed, backfill, migration, audit, backup utilities
static/                          # Static assets
tools/                           # Local Python helpers (e.g. stop_app.py)
firestore.rules                  # Security rules
firestore.indexes.json           # Composite index definitions
```

## Key Modules

### Authentication — `src/lib/stores/auth.ts`
- Stores: `user`, `loading`, `authError`; derived `isAuthenticated`, `userId`
- `initAuthListener()` — call once at app startup
- `signInWithGoogle()`, `signOut()`, `getCurrentUser()`, `getCurrentUserId()`, `waitForAuth()`
- iOS standalone PWAs use redirect flow (see `docs/reference/webapp-pwa.md`)

### Firestore — `src/lib/firestore.ts`
CRUD ops for: routine templates (system + custom), routine logs, sessions, dives, seasons, user settings, personal bests. Schema reference: `docs/reference/data-model.md`.

### Storage — `src/lib/storage.ts` + Wasabi
Photos / thumbnails / videos / CSVs go through signed URLs from Cloud Functions to Wasabi S3 (migrated off Firebase Storage). See `docs/storage-infra/shipped/wasabi-migration.md`.

### Capture — `src/lib/capture/`
Recorder state machine (`recorderState.ts`), timeline → routine log conversion, orientation/posture detection, camera device + codec capability probing. **This subsystem is data-oriented**: pure functions in `.ts`, side effects in components.

## Build, Test, and Development

```bash
npm run dev              # Vite dev server
npm run build            # Production build
npm run preview          # Preview production build
npm run check            # SvelteKit sync + svelte-check (types)
npm run check:watch      # Type check, watch mode
npm test                 # Vitest, single run
npm run test:watch       # Vitest, watch mode
```

**Data scripts** (`scripts/`):
- `npm run seed` / `seed:logs` — seed Firestore with system routines / historical logs
- `npm run backup` — Firestore backup
- `npm run audit` — data audit
- `npm run backfill:profiles` / `backfill:dive-video-routine-logs[:dry]` — backfills (most have a `:dry` mode — **always run `:dry` first**)
- `npm run migrate:activity-types[:dry]` / `migrate:packing-volume[:dry]` — data migrations
- `npm run rollback:aida` — emergency rollback for AIDA import

## Coding Style & Conventions

- **Indentation:** 2 spaces.
- **Language:** TypeScript everywhere, including Svelte `<script lang="ts">`.
- **Svelte 5 runes:** `$state`, `$derived`, `$props`, `$effect`. Don't mix with old syntax (`$:`, `export let`). Auto-subscribe `$store` and `bind:value` are still fine.
- **Components:** PascalCase (`SessionCard.svelte`).
- **Routes:** SvelteKit conventions (`+page.svelte`, `+layout.svelte`, `(group)`, `[param]`).
- **Styling:** Scoped `<style>` blocks preferred over Tailwind utilities. Use CSS variables from `src/app.css` (`var(--color-primary)`, etc.). Dark theme is the only theme.
- **Mobile-first:** Test at 375px width. Bottom nav on `(app)` layout. Safe-area aware.

## Testing

- Vitest. Tests live next to the code: `foo.ts` ↔ `foo.test.ts`. No separate test directory.
- 15+ existing test files concentrated in `src/lib/capture/` and `src/lib/utils/` — pure-function suites. Follow the same pattern when adding tests.
- `npm run check` for type / Svelte issues; `npm test` for unit tests.

## Commit & PR Guidelines

- Short, imperative commit messages (`Add ...`, `Fix ...`, `Refactor ...`). Match the existing log style.
- PRs: short summary, affected routes/components, screenshots for UI changes.
- **Call out explicitly:** Firestore rules/indexes changes, schema/type changes, Cloud Function changes, anything touching auth or storage paths.
- Don't `--no-verify`; don't force-push without asking.

## Security & Configuration

- Copy `.env.example` to `.env` and fill in Firebase keys. `PUBLIC_FIREBASE_AUTH_DOMAIN` should be `auth.overdive.app` (custom domain) — see `docs/reference/webapp-pwa.md` §7.
- Firestore rules: `firestore.rules`. Indexes: `firestore.indexes.json`. Storage rules: `storage.rules`.
- Cloud Functions in `functions/` — deployment is separate from the Vercel app.
- Never commit `.env`, service-account JSONs, or Wasabi credentials.
- All scripts that mutate prod data must support a dry-run flag — verify before running live.
