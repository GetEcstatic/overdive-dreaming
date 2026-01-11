# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds all application code.
- `src/routes/` contains SvelteKit routes; authenticated pages live under `src/routes/(app)/`.
- `src/lib/` includes shared components, stores, Firebase helpers, and utilities (e.g., `src/lib/firestore.ts`, `src/lib/utils/`).
- `static/` stores static assets.
- `scripts/` contains data seeding utilities (Firestore seed helpers).
- There are no dedicated test directories today.

## Key Modules

### Authentication (`src/lib/stores/auth.ts`)
Centralized auth state management. Key exports:
- `user`, `loading`, `authError` — Svelte stores for auth state
- `isAuthenticated`, `userId` — Derived stores for common checks
- `initAuthListener()` — Initialize Firebase auth listener (call once at app startup)
- `signInWithGoogle()` — Sign in with Google popup
- `signOut()` — Sign out current user
- `getCurrentUser()`, `getCurrentUserId()` — Synchronous getters
- `waitForAuth()` — Promise that resolves when auth state is determined

### Firestore (`src/lib/firestore.ts`)
CRUD operations for all collections:
- Routine Templates (system + user custom)
- Routine Logs (training sessions)
- Seasons (training periods)
- User Settings
- Personal Bests

### Storage (`src/lib/storage.ts`)
Firebase Storage helpers for photo upload/delete with thumbnail generation.

## Build, Test, and Development Commands
- `npm run dev` — start the Vite dev server for local development.
- `npm run build` — create a production build.
- `npm run preview` — preview the production build locally.
- `npm run check` — run SvelteKit sync and type checking (`svelte-check`).
- `npm run check:watch` — type check in watch mode.
- `npm run seed` / `npm run seed:logs` — seed Firestore data from `scripts/`.

## Coding Style & Naming Conventions
- Indentation: 2 spaces (matching Svelte defaults and project notes in `DEVELOPMENT.md`).
- Language: TypeScript across Svelte components and helpers.
- Components use PascalCase (e.g., `SessionCard.svelte`).
- Routes follow SvelteKit file-based conventions (e.g., `+page.svelte`, `+layout.svelte`).
- Styling uses Tailwind CSS v4 and CSS variables in `src/app.css`.

## Testing Guidelines
- No formal test framework is configured yet.
- Use `npm run check` to catch type errors and invalid Svelte usage.
- If adding tests, document the framework and naming pattern in this file.

## Commit & Pull Request Guidelines
- Commits in history use short, imperative messages (e.g., "Add ...", "Fix ...").
- PRs should include: a short summary, affected routes/components, and screenshots for UI changes.
- Call out Firebase-related changes explicitly (Firestore rules/indexes, schema updates).
- Link related issues or notes when available.

## Security & Configuration Tips
- Copy `.env.example` to `.env` and provide Firebase keys before running locally.
- Firestore rules live in `firestore.rules` and indexes in `firestore.indexes.json`.
