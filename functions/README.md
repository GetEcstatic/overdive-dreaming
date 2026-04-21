# Overdive Dreaming — Cloud Functions

Server-side jobs for Overdive Dreaming. Currently:

- **`onDiveVideoCreated`** (`src/retentionReaper.ts`) — Firestore trigger that
  enforces the "keep 5 newest non-pinned `DiveVideo`s per owner" policy.
  Writes an audit entry to `reaperAudit/*` every run.

## Relationship to the client-side reaper

`src/lib/services/diveVideos.ts::reapOwnedDiveVideos` runs in the browser
after a successful upload. It covers the common case but can't be trusted:
if a user uploads from one device and never returns to the app, the client
path never fires. This Cloud Function is the **canonical** enforcement point
and makes the client-side reaper safe to treat as a "happy-path nicety".

Both implementations share the same semantics (keep 5 newest non-pinned,
skip pinned, delete Firestore doc + all Storage blobs).

## First-time setup

```bash
cd functions
npm install
# Requires Blaze plan on the Firebase project:
firebase deploy --only functions
```

Add a `functions` block to the root `firebase.json` when deploying for the
first time:

```json
{
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "runtime": "nodejs20",
      "ignore": ["node_modules", ".git", "*.log"]
    }
  ]
}
```

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
