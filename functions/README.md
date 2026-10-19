# Overdive Dreaming — Cloud Functions

Up: [Storage, auth and deployment map](../docs/storage-infra/README.md)

[The entrypoint](src/index.ts) is the authoritative export list: retention, media signing/multipart uploads, processing/recovery, overlay requests, gift acceptance and timeline correction. Do not rely on its older header comment as an exhaustive description.

## Build

Use Node 22, as specified in [package.json](package.json) and [firebase.json](../firebase.json).

From the repository root:

```sh
npm --prefix functions ci
npm --prefix functions run build
```

[build.mjs](build.mjs) type-checks through the build script, bundles `index` and `hudRenderChild` entrypoints, and copies the HUD fonts from `static/fonts`. npm dependencies stay external. The Firebase predeploy hook rebuilds locally; `gcp-build` is empty because the upload does not include the adjacent app source tree needed for bundling.

[Shared-import tests](../src/lib/media/functionsSharedImports.test.ts) protect selected app modules consumed by Functions. Shared HUD code must remain server-compatible; it may use relative imports within its pure module graph.

## Retention and dry run

[retentionReaper.ts](src/retentionReaper.ts) owns server retention. The upload path passes its own retention count to the [client helper](../src/lib/services/diveVideos.ts); inspect the [call site](../src/lib/capture/uploadProcessor.ts), not just that helper's default.

Dry run is enabled **only when the deployed process has `REAPER_DRY_RUN=1` or `REAPER_DRY_RUN=true`**. The implementation does not read legacy `reaper.dry_run` runtime config. Setting a variable only in your terminal does not demonstrate that a deployed function receives it. Verify environment delivery before any retention experiment. Dry-run avoids deletions but can still write `reaperAudit` documents.

The query has a bounded scan and storage deletions are best-effort. Do not describe this as an exhaustive cleanup guarantee.

## Deployment and local execution

Deployment needs explicit approval and a verified project/account/worktree. After approval, `firebase deploy --only functions` uses the repository predeploy build hook. Run it in the foreground and verify the resulting deployment separately; successful compilation does not prove production state.

`npm --prefix functions run serve` builds and starts the Functions emulator only. This is **not** a full isolated backend: Firestore, Storage and Wasabi access need separate isolation/configuration. Do not use production credentials or trigger destructive jobs assuming the emulator makes them safe.

Wasabi credential bindings and non-secret bucket/region defaults are owned by [wasabiClient.ts](src/wasabiClient.ts). Provision secrets through the approved secret-management workflow; never paste them into documentation or logs. Check bucket selection before uploads or deletions.

App deployment is separate from Functions deployment. Shared renderer/style changes can require both. See the [implementation map](../docs/storage-infra/README.md) for current code owners and operational caveats.
