# Recording a Dynamic Dive

A step-by-step user guide for coaches and athletes using the in-app dynamic dive video recorder (DYN / DYNB / DNF).

## Prerequisites

- Sign in with Google.
- Use a modern mobile browser: **iPhone Safari (iOS 16.4+)** or **Android Chrome**. Allow camera and microphone permissions when prompted.
- *(Optional)* In **Profile**, set your default video resolution. **720p** is recommended (smaller uploads, still plenty for coaching review). **1080p** is opt-in.

## Step-by-Step

### 1. Create or open a training session
Tap the **+** (Log) tab in the bottom navigation and start a new session, or open an existing one from the Dashboard feed.

### 2. Start the dive recorder
From the session detail page, tap **Record Dynamic** (route: `/dive/record/<sessionId>`). Grant camera permission if asked. The screen locks to portrait (9:16).

### 3. Frame the dive
Hold the phone in portrait, one-handed. Keep the top and bottom HUD safe-zones in mind — the diver should stay in the middle of the frame. The preview fills the screen; the top bar shows discipline, athlete and a clock that starts on **GO**.

### 4. Press GO when the diver leaves the wall
This starts the dive clock and distance counter.

### 5. Tap LAP at every wall touch
The big thumb-reachable **LAP** button is at the bottom. Each tap adds one pool length to the cumulative distance and records a split. Walk the pool deck following the diver.

### 6. Press STOP when the dive ends
Hold/confirm **STOP** to finalize. A review panel appears with duration, laps tapped, total distance and file size.

### 7. Review and fill in details
- **Pool length** — defaults to 25 m; adjust if needed.
- **Discipline** — DYN (with fins), DYNB (bifins), or DNF (no fins).
- **Pin this dive** — check to keep it beyond the 5-most-recent cap.
- **Gift this dive to…** — pick the athlete (defaults to yourself). The athlete will see it on their session too.

### 8. Save
Tap **Save**. The clip is queued in the device (IndexedDB) and uploads in the background — it's safe to navigate away; uploads resume on reconnect. You'll be returned to the session detail page.

### 9. Playback
Open the session; the video appears under the routine log / dive entry. In-app playback shows a clean video with a DOM overlay (time, cumulative distance, speed, lap counter). Use the annotated scrub bar to jump between laps.

## Tips and Limits

- **Keep the screen awake.** The app uses the Wake Lock API, but avoid backgrounding the app for long periods.
- **Retention.** Only the 5 most recent non-pinned videos are retained per user. Pin important dives.
- **Timeline is forever.** Splits, distance and other timeline data stay in Firestore even after a video is reaped from Storage.
- **Flaky Wi-Fi is fine.** If an upload stalls, it resumes automatically the next time the app is online — no re-record needed.

## Key Code Locations (for devs)

| Area | Path |
| --- | --- |
| Route | `src/routes/(app)/dive/record/[id]/+page.svelte` |
| Recorder component | `src/lib/components/DiveRecorder.svelte` |
| Capture helpers | `src/lib/capture/` (`cameraStream.ts`, `recorder.ts`, `timeline.ts`, `uploadQueue.ts`, `uploadProcessor.ts`, `wakeLock.ts`) |
| Playback | `src/lib/components/DiveVideoPlayer.svelte` |
| Resolution setting | `src/routes/(app)/profile/+page.svelte` |
| Design docs | `docs/Dynamic video feature.md`, `docs/dynamic-video-qa-checklist.md` |
