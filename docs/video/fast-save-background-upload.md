# Fast Save and Background Upload Plan

## Status

Planning only. Do not implement until confirmed.

## Problem

The pool-deck workflow needs a coach to stop one recording and start the next roughly a minute later. The current web app already has an IndexedDB upload queue and Wasabi multipart upload, but the user still experiences saving as a blocking step. In practice that can mean waiting while a large browser `Blob` is persisted locally, uploaded to Wasabi, or both, before the coach feels safe starting another dive.

The target invariant should be: once recording stops, the dive must be preserved locally quickly, then the coach should be able to continue recording while cloud upload drains in a lower-priority lane.

## Current Foundation

- `src/lib/capture/uploadQueue.ts` persists pending video blobs and metadata in IndexedDB.
- `src/lib/capture/uploadProcessor.ts` drains the queue to Wasabi using multipart upload, keeps uploaded part state, and retries up to five attempts.
- `docs/video/recording-guide.md` already describes the intended behavior: Save queues the clip locally, returns to the session, and resumes upload later.
- `docs/video/qa-checklist.md` already includes offline, force-kill, and retry checks for the upload queue.

The architecture is therefore close, but the UX needs to make local preservation explicit and the implementation needs to avoid doing heavy cloud work on the next-recording critical path.

## Recommended Web-App Direction

### Phase 1: Make Save Mean Local Commit

Change the save flow so the visible success condition is only: the recording and timeline are durably stored on-device.

Expected behavior:
- After Stop recording, tapping Save shows a short "Saving to this device" state.
- As soon as IndexedDB persistence is verified, the app returns to the recording/session workflow.
- Cloud upload continues separately and is shown as a persistent queue chip, not as a blocking save screen.
- If local persistence fails, the app must not pretend the dive is saved. Show a hard error with storage guidance.

Important detail: do not wait for Wasabi upload before allowing the next recording.

### Phase 2: Pause Upload During Active Recording

Add a recorder-aware upload scheduler.

Rules:
- If no recording is active, drain queued uploads normally.
- When the recorder enters an active camera/recording state, pause starting new upload parts.
- If a part is already in flight, let it finish, then pause before the next part.
- Resume upload after recording stops or when the user leaves capture mode.

This avoids network, disk, CPU, and battery contention while the phone is also capturing video.

### Phase 3: Surface a Real Upload Queue

Add an unobtrusive queue indicator visible from capture/session screens.

States:
- `Saved locally`: cloud upload not started yet.
- `Uploading`: show total progress across pending videos.
- `Waiting for connection`: offline or signed URL refresh needed.
- `Needs attention`: exceeded retry limit, with manual retry.

This matters because a coach must trust that they can move on without losing the previous dive.

### Phase 4: Chunk During Recording If Blob Finalization Is Still Slow

If measured save delay is dominated by writing one huge final Blob to IndexedDB, switch to chunk-first capture.

Approach:
- Start `MediaRecorder` with a `timeslice` such as 3-5 seconds.
- Persist chunks to IndexedDB during the recording under one local capture manifest.
- On Stop, finalize only the manifest and timeline metadata.
- Upload processor reads the chunks sequentially and sends Wasabi multipart parts.

Tradeoff: chunk persistence during recording can also compete with capture, so this should be measured on iPhone and Android before enabling broadly. It may need backpressure: keep a small in-memory buffer, persist during idle periods, and show a warning if local writes fall behind.

### Phase 5: Recovery and Cleanup

Make pending local videos first-class app state.

Needed safeguards:
- On app boot, show pending local videos before attempting upload.
- Let users retry, pause, or delete a pending upload.
- Keep Firestore docs in `pending`/`uploading` states recoverable and reused on retry.
- Abort stale Wasabi multipart uploads when a local pending item is deleted.
- Add a storage pressure warning when pending local video bytes exceed a threshold.

## Native App Consideration

A native app can handle this workflow more naturally, especially for coaches recording many dives back-to-back.

Advantages:
- Record directly to an app-owned local file instead of waiting on a browser Blob and IndexedDB structured clone.
- Use OS background upload facilities: iOS background `URLSession`, Android WorkManager or a foreground upload service.
- Continue uploads more reliably after app backgrounding, lock screen, or network changes.
- Better access to storage quotas, upload cancellation, and low-battery/network policies.
- More predictable camera encoding and codec selection.

Limitations:
- Native still cannot upload indefinitely under every condition; iOS especially controls background execution.
- Requires app-store distribution, native camera implementation, auth/session sync, and cross-platform maintenance.
- The web app still needs a queue because users will continue using it.

Recommendation: improve the web queue first because it is already close and benefits all users. Consider native if the coaching workflow becomes a primary product surface with repeated poolside recording sessions and large 1080p files.

## Implementation Tasks After Approval

1. Instrument the current save flow with timings for Blob finalization, IndexedDB write, Firestore doc creation, and first Wasabi part upload.
2. Update the recorder save UI so local persistence is the only blocking save step.
3. Add a recorder-active flag that pauses the upload drainer between multipart parts.
4. Add a queue chip/panel for pending local uploads, progress, retry, and failure details.
5. Add boot-time recovery that lists pending local videos before draining.
6. Add cleanup for deleted/abandoned pending uploads and stale multipart uploads.
7. Run the existing QA checklist plus a new back-to-back recording scenario: record, save locally, start next recording within 60 seconds, then verify both uploads finish later.

## Open Questions

- Is the observed delay mainly IndexedDB local persistence or Wasabi upload being awaited somewhere in the UI?
- Should upload pause during recording always, or only for high-quality/large recordings?
- How much local pending storage should the app allow before warning the coach?
- Should a pending locally saved video appear immediately in the session feed before cloud upload finishes?
- Do we want a native-app spike now, or only after measuring the improved web queue on real pool-deck devices?