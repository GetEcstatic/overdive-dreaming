# Overdive Dreaming — Cloud Functions

Server-side jobs for Overdive Dreaming. Currently:

- **`onDiveVideoCreated`** (`src/retentionReaper.ts`) — Firestore trigger that
  enforces the "keep 100 newest non-pinned `DiveVideo`s per owner" policy.
  Writes an audit entry to `reaperAudit/*` every run.
- **Wasabi media signing callables** (`src/mediaSigning.ts`) — authenticated
  upload/read/delete URL signing plus multipart video upload completion for
  Wasabi object storage.

## Relationship to the client-side reaper

`src/lib/services/diveVideos.ts::reapOwnedDiveVideos` runs in the browser
after a successful upload. It covers the common case but can't be trusted:
if a user uploads from one device and never returns to the app, the client
path never fires. This Cloud Function is the **canonical** enforcement point
and makes the client-side reaper safe to treat as a "happy-path nicety".

Both implementations share the same semantics (keep 100 newest non-pinned,
skip pinned, delete Firestore doc + all Storage blobs).

## First-time setup

```bash
cd functions
npm install
firebase functions:secrets:set WASABI_ACCESS_KEY_ID
firebase functions:secrets:set WASABI_SECRET_ACCESS_KEY
# Requires Blaze plan on the Firebase project:
firebase deploy --only functions
```

Expected non-secret Wasabi environment values are currently defaulted in code:

```txt
WASABI_REGION=ap-southeast-1
WASABI_ENDPOINT=https://s3.ap-southeast-1.wasabisys.com
WASABI_BUCKET_PROD=overdive-media-prod
WASABI_BUCKET_DEV=overdive-media-dev
```

Set `WASABI_ENV=dev` for a deployed/test functions environment that should
write to the dev bucket. Production defaults to `overdive-media-prod`.

## Build

`npm run build` type-checks (`tsc --noEmit`) and then bundles `src/index.ts`
with esbuild (`build.mjs`) into `lib/index.js`, copying the HUD fonts from
`../static/fonts` to `lib/fonts`. npm packages stay external.

The bundle can import **pure, import-free** modules from the web app
(`../src/lib/...`), such as the overlay style version and export sizing.
`src/lib/media/functionsSharedImports.test.ts` fails if one of those modules
gains a `$lib` or package import.

Deploying: the root `firebase.json` runs `npm run build` as a `predeploy`
hook, so the uploaded `lib/` is always fresh. `package.json` has an empty
`gcp-build` script so Cloud Build does **not** rebuild remotely (the upload
does not include `../src`, so a remote build would fail).

## Dry-run mode

Set the environment variable `REAPER_DRY_RUN=1` when deploying to log what
WOULD be deleted without actually deleting anything. Useful when validating
the policy in production:

```bash
firebase functions:config:set reaper.dry_run=true
firebase deploy --only functions
```

## Emulator

```bash
npm run serve
```

Requires the Firebase CLI and the Functions emulator. The emulator needs
`firebase-admin` credentials — run `firebase login` first.
