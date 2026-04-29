# Dynamic Video — QA Checklist

Companion to `docs/Dynamic video feature.md`. Run this full matrix before promoting the feature beyond internal users.

_Last updated: 2026-04-21_

## Device matrix

| Device | OS / Browser | Portrait lock | MediaRecorder mime | Wake Lock | Share files | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| iPhone 12 | iOS 17 Safari | ☐ | ☐ mp4/h264 | ☐ | ☐ | Baseline target |
| iPhone 12 | iOS 18 Safari | ☐ | ☐ | ☐ | ☐ | |
| iPhone 15 Pro | iOS 18 Safari | ☐ | ☐ | ☐ | ☐ | |
| iPhone SE 2020 | iOS 16.4 Safari | ☐ | ☐ | ☐ | ☐ | Lowest-tier iOS |
| Pixel 7 | Android 14 Chrome | ☐ | ☐ webm/vp9 | ☐ | ☐ | |
| Samsung S23 | Android 14 Chrome | ☐ | ☐ | ☐ | ☐ | |
| Budget Android (Moto G / mid-tier) | Android 13 Chrome | ☐ | ☐ | ☐ | ☐ | Lowest-tier Android |

## Capture flow

- [ ] Opening the capture route while logged out redirects to sign-in.
- [ ] Camera permission prompt appears on first use; denying it shows a helpful error.
- [ ] Mic permission prompt appears once; denying it keeps recording but silent.
- [ ] Orientation locks to portrait; rotating the phone to landscape does **not** rotate the preview.
- [ ] Preview stream mirrors the rear camera at 9:16 aspect ratio (no letterbox/pillarbox).
- [ ] Selected resolution matches the setting (720p default, 1080p opt-in).
- [ ] Wake Lock activates on recording start; screen does not auto-dim for ≥ 6 minutes.
- [ ] "GO" button starts both the recorder and the timeline clock on the same `performance.now()` tick.
- [ ] Lap tap button records a lap at the moment of tap; split time matches a stopwatch within ±50 ms.
- [ ] Undo removes the most recent lap and restores the previous cumulative distance.
- [ ] STOP finalises the timeline; the next view shows totals and per-lap splits.

## Data integrity

- [ ] Recording for ≥ 3 minutes produces a single Blob (no chunk loss).
- [ ] Total recorded time matches `diveEndMs - diveStartMs` within ±100 ms.
- [ ] Cumulative distance = laps × pool length (no off-by-one).
- [ ] Splits sum (within rounding) to total time.

## Save & upload

- [ ] Saving the capture writes a Firestore `DiveVideo` doc with correct `ownerId`, `athleteId`, `giftStatus`.
- [ ] Blob is written to `users/{uid}/videos/{videoId}/clean.<ext>` at the expected size.
- [ ] Going offline mid-upload leaves the item in IndexedDB; it resumes on reconnect.
- [ ] Force-killing the app mid-upload: on relaunch the "Pending upload (X MB)" chip shows; drain succeeds.
- [ ] Upload failures retry up to 5 attempts, then surface in settings with a manual retry button.

## Playback

- [ ] In-app player composites HUD from the `DiveTimeline` and stays synced within ±1 frame via `requestVideoFrameCallback`.
- [ ] Seeking works; HUD reflects the seek position.
- [ ] Audio plays back (raw pool sounds preserved).
- [ ] Thumbnail shows at start frame.

## Gifting

- [ ] Coach can pick an athlete (from followed users or by email invite) at save time.
- [ ] Gifted video appears as "Pending" on the athlete's feed via `PendingGifts`.
- [ ] Athlete tapping **Review & save** navigates to `/gift/{videoId}` and the
      `DiveVideoPlayer` renders with HUD from the gifted timeline.
- [ ] Athlete tapping **Save to my training** calls `acceptDiveGift` Cloud
      Function, which atomically (a) creates a `routineLogs/{id}` owned by
      the athlete with discipline / pool length / total time / total
      distance / per-lap data projected from the timeline, and (b) updates
      the `DiveVideo` with `routineLogId`, `sessionId`, and
      `giftStatus = 'accepted'`.
- [ ] After Accept, the athlete lands on `/session/{routineLogId}` with the
      "🎁 Gifted by {coach}" banner shown above the video section. Banner
      dismiss persists per-routineLogId for the tab session.
- [ ] Double-tapping **Save to my training** is idempotent — no duplicate
      routine log is created, second call returns the original
      `routineLogId` with `alreadyAccepted: true`.
- [ ] Athlete tapping **Decline** flips `giftStatus` to `'declined'` and
      navigates back to the feed; the gift no longer appears in
      `PendingGifts`.
- [ ] Re-visiting `/gift/{videoId}` for an already-accepted gift redirects
      straight to `/session/{routineLogId}` instead of re-prompting.
- [ ] Re-visiting `/gift/{videoId}` for a declined gift shows the
      "already declined" state with a back-to-feed button.
- [ ] After Accept, the video shows in athlete's session list and counts
      toward their retention cap **if they pin it**; otherwise it counts
      toward the coach's cap only.
- [ ] Firestore rules: athlete cannot write any field other than
      `giftStatus` directly (only the Cloud Function can set
      `routineLogId` / `sessionId`).
- [ ] Firestore rules: non-owner / non-athlete users cannot read the doc.

## Retention

- [ ] Uploading a 6th video deletes the oldest non-pinned video (Firestore doc retained, blobs removed).
- [ ] Pinned videos survive the reaper regardless of count.
- [ ] Reaper Cloud Function has a dry-run mode and an audit log collection.

## Export / Download-to-Photos

- [ ] On iOS Safari 17+, tapping "Download to Photos" invokes `navigator.share` with the video file and saves to Photos.
- [ ] On Android Chrome, the same action offers the correct app chooser (Photos / Instagram / WhatsApp).
- [ ] When `navigator.canShare({ files })` is false, a plain `<a download>` link is offered.
- [ ] Burned-overlay export (v1.5): ffmpeg.wasm produces a video of the same duration and correct orientation.

## Privacy / safety

- [ ] Deleting a `DiveVideo` from the UI also deletes the Storage blobs.
- [ ] User account deletion removes all of their `diveVideos` docs and blobs.

## Accessibility

- [ ] Primary "GO / STOP / LAP" buttons are at least 64 × 64 pt (one-handed, wet fingers).
- [ ] HUD text has ≥ 4.5:1 contrast against the darkest 10% of the preview frame.
- [ ] VoiceOver / TalkBack read out "Recording, lap 3, 1:23 elapsed" on state changes.
