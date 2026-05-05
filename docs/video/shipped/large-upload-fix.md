# Large Video Upload Fix Plan

Date: 2026-05-04

## Problem

A 538.4 MB dive video still fails on save with:

> Upload failed: Video must be under 500 MB. The dive is saved locally and will retry when you reopen the app.

The recorder already has a 5-minute auto-stop. Saving should not reject a recording because it crosses an arbitrary 500 MB video size threshold.

## Findings

- The active record page queues video blobs through IndexedDB, then uploads via `drainUploadQueue()`.
- The current upload implementation uses Wasabi multipart upload through these callables:
  - `createDiveVideoMultipartUpload`
  - `signDiveVideoPart`
  - `completeDiveVideoMultipartUpload`
- Current source no longer contains the 500 MB Cloud Function limit. `functions/src/mediaSigning.ts` had already been raised to 2 GB before this investigation.
- Current generated function output also no longer contains the 500 MB limit.
- The only remaining source-level 500 MB gate found was in `storage.rules`, which protects the older Firebase Storage fallback path.
- Seeing the exact 500 MB message in the app means the deployed backend or deployed storage rules are stale relative to this workspace, or an old upload path is still hitting deployed Firebase Storage policy.
- The previous fix improved the local source but did not fully remove the conceptual limit, and it still required deployment to affect production.

## Target Behavior

- Recording stops automatically at 5 minutes.
- A saved recording from that 5-minute window should not fail because of an app-level video byte limit.
- Upload failures should report the failing step, such as multipart creation, part signing, part upload, or multipart completion.
- Queued local uploads should remain resumable.

## Fix Plan

1. Remove the Cloud Function video byte limit from `validateMediaPolicy()` for video media kinds.
2. Remove the Firebase Storage video byte limit from `storage.rules` for the legacy/fallback path.
3. Keep content-type validation, authentication, ownership checks, and Wasabi key scoping.
4. Keep the client-side 5-minute recording cap as the practical bound for file size.
5. Preserve the improved callable error wrapping so future backend failures are visible instead of collapsing to `internal`.
6. Build functions and run the focused upload-related checks.
7. Deploy both functions and storage rules so production stops using the stale 500 MB policy.

## Implementation Notes

- This does not change photo limits. Photos remain capped at 5 MB.
- This does not change CSV limits. Biometric CSVs remain capped at 1 MB.
- This does not bypass auth or owner checks.
- Wasabi itself still enforces object-storage constraints, but those are far above any realistic 5-minute browser recording.

## Implemented This Pass

- Removed the Cloud Function byte-size rejection for `dive-video-clean` and `dive-video-burned` media.
- Removed the Firebase Storage fallback byte-size rejection for video objects under `users/{userId}/videos/{videoId}/{fileName}`.
- Rebuilt Cloud Functions output and confirmed no deployable function/storage policy still contains the old 500 MB or 2 GB video rejection.
- Deployed the changed upload functions and storage rules to Firebase project `overdive-dreaming-fb`:
  - `createDiveVideoMultipartUpload`
  - `signDiveVideoPart`
  - `completeDiveVideoMultipartUpload`
  - `createMediaUpload`
  - `storage.rules`
