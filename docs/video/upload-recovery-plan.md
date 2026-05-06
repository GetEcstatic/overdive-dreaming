# Upload Recovery Plan

Status: implemented for future builds.

## Finding

The stuck videos created after 5:30pm local time reached `uploadStatus: uploading` and had Wasabi clean-object metadata, but they never reached `uploadStatus: uploaded`.

Production logs showed repeated `signDiveVideoPart` calls after those recordings, but no matching `completeDiveVideoMultipartUpload` call. That means the app was still uploading multipart chunks, then the browser/PWA execution was interrupted before the final multipart completion step.

This is not a video quality problem and is not caused by the overlay export tier changes. It is an upload lifecycle problem: local-first save protects the recording in IndexedDB, but the cloud upload still depends on the PWA being open and allowed to run JavaScript. iOS and standalone PWAs can pause or kill that work when the app backgrounds, the screen locks, or the device throttles network activity.

## Plan

1. Keep local-first save. The recording should still become durable locally quickly, without waiting for a 300-500 MB cloud transfer.
2. Keep the original video quality. Do not reduce recording resolution or bitrate as a workaround for upload reliability.
3. Make queued uploads much more persistent. A large video may need several app foreground sessions to finish, so interrupted attempts should not strand it after a small retry count.
4. Resume uploads whenever the PWA gets a useful lifecycle signal: app boot, network online, window focus, page show, or visibility returning to visible.
5. Avoid overlapping automatic drains. Multiple resume events can fire together; the app should run one queue drain at a time.
6. Keep live Firestore UI updates. When the final completion succeeds, dashboard/session cards should update from uploading to playable without a manual page reload.

## Implementation

- Raise the automatic queue retry ceiling from 5 to 50 attempts so interrupted uploads can continue across repeated PWA pauses.
- Expand the upload drainer beyond `online` events to also run on `focus`, `pageshow`, and `visibilitychange` back to visible.
- Add an automatic-drain guard so lifecycle events do not start competing drains.

## Existing Stuck Videos

If the original browser still has the IndexedDB queue entries, opening the PWA with this fix should resume the uploads. Once all parts finish, the normal `completeDiveVideoMultipartUpload` callable will mark the records uploaded and queue media processing.

If the local IndexedDB entries were deleted by the browser or manually cleared, those cloud records cannot be completed from Firestore alone because the source video blob only lived in the browser queue until multipart upload completion.
