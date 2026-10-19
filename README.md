# Overdive Dreaming

A mobile-first pool freediving training tracker: routines, session logs, analytics and dive video capture/playback.

Up: [Docs index](docs/INDEX.md)

## Start here

- [Development](DEVELOPMENT.md) — local workflow and checks.
- [Agent guide](AGENTS.md) — safe editing, worktrees and navigation.
- [Docs index](docs/INDEX.md) — reviewed maps, plans and historical context.
- [Storage, auth and deployment map](docs/storage-infra/README.md) — backend ownership and limitations.

## Local setup

Use **Node 22.12 or newer in the Node 22 series** for a consistent app/Functions environment. The app's Vite 7 dependency requires Node 20.19+ or 22.12+; Functions targets Node 22. See the package manifests and installed dependency requirements when upgrading.

```sh
npm ci
npm run dev
```

Before starting, provide local Firebase public configuration using the variable names imported by [firebase.ts](src/lib/firebase.ts). Use the approved development project configuration; never copy production private keys into the app. Do not print or commit local environment files. Merely running locally does not isolate backend data.

Google sign-in, Firestore rules and the backend must be configured for the chosen environment. Media operations additionally depend on callable Functions and Wasabi; a basic free Firebase project alone is not a complete setup for the application.

Do not enable permissive Firestore test-mode rules for a real deployment. The owning rules are [firestore.rules](firestore.rules), [storage.rules](storage.rules) and the deployment mapping in [firebase.json](firebase.json), not example snippets.

## Checks

```sh
npm run check
npm test
npm run build
python3 scripts/check-doc-graph.py
python3 scripts/audit-docs.py
```

These are local checks, not permission to publish or mutate production data. Seed, migration and backup commands need separate review of their target and side effects.

## Stack and deployment

SvelteKit, Svelte 5, TypeScript, Tailwind and scoped CSS; Firebase Auth/Firestore/Functions; Wasabi object storage. The app is hosted on Vercel; Firebase Hosting configuration serves the separate authentication site. See the implementation map rather than historical roadmap checkboxes for what exists in this checkout.

## Licence

ISC, as declared in [package.json](package.json).
