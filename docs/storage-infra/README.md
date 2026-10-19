# Storage, authentication and deployment — implementation map

Up: [Docs index](../INDEX.md) · Status: current code-backed navigation, not live infrastructure verification

## Find the owner

| Task | Owning implementation / configuration | Verification |
|---|---|---|
| Firebase initialisation and auth persistence | [firebase.ts](../../src/lib/firebase.ts) | `authPersistenceReady`: IndexedDB persistence with localStorage fallback; environment values are not audited here |
| Sign-in and authenticated navigation | [routes](../../src/routes/): `+page.svelte` and `(app)/+layout.svelte` | Read the actual sign-in handler, not just imports/comments; device checks still required |
| User state | [auth.ts](../../src/lib/stores/auth.ts) | This store exports `user` and `loading`; it is not an authentication-service API |
| PWA metadata and assets | [app.html](../../src/app.html), [manifest](../../static/manifest.webmanifest), [icons](../../static/icons/) | Installed-app appearance, persistence and camera behaviour require real-device tests |
| Photo / CSV storage | [storage.ts](../../src/lib/storage.ts), [media client](../../src/lib/media/client.ts) | Wasabi signing calls, not direct Firebase photo uploads |
| Signing, multipart uploads and permissions | [mediaSigning.ts](../../functions/src/mediaSigning.ts), [wasabiClient.ts](../../functions/src/wasabiClient.ts) | Inspect authenticated ownership checks before changing access; never expose signing credentials |
| Retention | [retentionReaper.ts](../../functions/src/retentionReaper.ts), [uploadProcessor.ts](../../src/lib/capture/uploadProcessor.ts), [diveVideos.ts](../../src/lib/services/diveVideos.ts) | Read server KEEP_COUNT and the upload call site's explicit RETENTION_KEEP_COUNT; the client helper's default differs |
| Export worker and recovery | [mediaWorker.ts](../../functions/src/mediaWorker.ts) | Worker resource limits, scheduled recovery and job state are code-owned; [processing tests](../../src/lib/media/processing.test.ts) cover client artifact readiness, not deployed worker behaviour |
| Functions packaging | [build.mjs](../../functions/build.mjs), [package.json](../../functions/package.json) | [Shared-import tests](../../src/lib/media/functionsSharedImports.test.ts); build locally before an approved deploy |
| Auth hosting / rules / Functions deployment configuration | [firebase.json](../../firebase.json), [Firestore rules](../../firestore.rules), [Storage rules](../../storage.rules) | Firebase Hosting serves `public-auth`, not the main app; never replace rules with old README snippets |

## Verified behaviour and important limitations

- The current landing sign-in handler calls **signInWithPopup** after awaiting persistence. Redirect-result handling remains on initialisation. Its presence does not mean new sign-ins use redirects. Do not reintroduce the old PWA redirect recommendation without investigating the recorded regression and testing on-device.
- Manifest, Apple meta tags, viewport-fit and icons exist. The old PWA checklist's “missing” statuses are not current. A service-worker implementation was not found in `src/` at this checkpoint; installing a manifest does not prove offline support.
- The reaper reads `REAPER_DRY_RUN` from its deployed process environment (`1` or `true`). Legacy `firebase functions:config:set reaper.dry_run=true` does not set what this implementation reads. Dry-run still writes an audit record when there are reap candidates.
- The server queries at most 200 owner videos before filtering pinned entries. Retention is not an exhaustive reconciliation of all historical objects; do not promise that every orphaned object is deleted.
- Functions bundling includes both the main entrypoint and a HUD child-process entrypoint. Shared app modules need to be compatible with the server build; “no imports at all” is not the rule for the whole shared HUD graph.
- Source resource limits are not proof of deployed limits. Budget alerts are not spending caps, and Wasabi charges are separate from GCP. Check actual cloud configuration separately before quoting live costs or guarantees.

## History and outstanding verification

- Superseded: [PWA audit and setup notes](../reference/webapp-pwa.md) — contains old missing-feature claims and a redirect recommendation contradicted by the current sign-in handler. DNS/OAuth instructions require fresh console verification, not copied example records.
- Historical: [Cost guardrails](firebase-cost-guardrails.md) — record of an earlier budget/deployment configuration; not current worker sizing or a verified live budget.
- [Wasabi migration plan](shipped/wasabi-migration.md) — still needs substantive review; consult implementation above rather than treating every migration checkbox as a current instruction.

For build/deploy commands see the [Functions guide](../../functions/README.md). For local workflow see [Development](../../DEVELOPMENT.md). Neither authorises a deployment or production-data mutation.
