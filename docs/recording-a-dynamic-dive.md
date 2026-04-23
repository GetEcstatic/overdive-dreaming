
# Updates
## UX flow

These are the steps the user should move through in order to have a better experience with the dive recorder.

1. Selects a menu option for the menu bar for record (record button added to the top/bottom bar to signal this is the recording feature)
2. Select dynamic discipline
3. Select pool length and number of waypoints per lap
4. Hit a next button. The video recording screen opens up in landscape mode and the user is prompted to rotate the phone. The camera is full screen (think normal phone camera apps where the image fills the screen). The page is frozen to full screen during the recording process. It cannot be scrolled up or down.
5. A start recording button (could be a red button like on a camera app) is presented to start recording. The user presses record
6. A start dive button is presented. When depressed, this starts the timer and distance counter (defaulting to 1m/s to start)
7. A **Waypoint** button is presented with the distance of the next expected tap indicated in the button (wall or mid-lap split depending on `waypointsPerLap`). An **End dive** button is also presented — it requires a **0.5 s press-and-hold** to fire, to avoid accidental taps. If the cumulative distance exceeds the *next wall* by 10 m, a banner hints that the diver has probably passed a wall — the next tap will snap the distance to the correct wall (integer multiple of pool length), self-healing any missed splits.
8. When the diver surfaces, the user presses the end dive button. The video continues recording, but the distance and time counters end. A "Stop recording" button is presented.
9. When the stop recording button is pressed the dive ends and the user is presented with an option to save the video of cancel.
10. If the video is saved, then a dynamic max attempt dive log is automatically opened. Metrics that can be parsed from the dive video are added to the dive log. These include:
	1. Discipline
	2. Total distance
	3. Time per lap
	4. Average speed for each lap
	5. Average speed for the dive
11. Other metrics can then be added by the user
12. Once saved the session is viewable from the dashboard feed and the video can be played from the feed also. 
13. The video can be downloaded from the session detail modal.


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

### 5. Tap **Waypoint** at every wall touch (and mid-lap, if configured)
The big thumb-reachable **Waypoint** button is at the bottom. It's a *smart* button:

- With `waypointsPerLap = 1` (default), every tap is a **wall** and snaps cumulative distance to an integer multiple of pool length.
- With `waypointsPerLap ≥ 2`, the button alternates between **Split** (mid-lap) and **Wall N** according to the expected next event. The sub-label tells you which (`mid-lap · 12.5m` vs `at 25m`).
- **Missed a split?** No problem — the moment you tap near/past the next wall, the app classifies the tap as a wall and discards in-lap splits that were never taken. Timing stays on the wall.
- **Haptics** — a short buzz confirms each tap (stronger on walls, gentler on splits) on devices that support the Vibration API.
- **Undo** — the left button reverts the most recent tap (wall or split).

### 6. Press-and-hold **End dive** when the diver surfaces
End dive is a **tap-and-hold** button: press and hold for 0.5 s to finalize (the button fills to indicate progress, and a triple haptic pulse fires on completion). Short taps are ignored, so it's safe next to the Waypoint button. The video keeps recording — a **Stop recording** button appears next.

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
- **Sample stream.** While the dive is in progress, a 1 Hz position sample is recorded alongside wall/split taps, so replay HUDs (cumulative distance, live speed) follow the real recorded values instead of re-interpolating from laps. Legacy clips (pre-v2) still render via lap-based fallback.
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

---

## Implementation status

The UX Flow above is implemented behind the data-oriented architecture
documented in [`docs/DYNAMIC_RECORDER_UX_PLAN.md`](DYNAMIC_RECORDER_UX_PLAN.md).

- **Record tab** (`src/lib/components/BottomNav.svelte`) → `/record` auto-creates
  an ad-hoc session and forwards to the setup screen.
- **Setup** — discipline, pool length, waypoints per lap. Wheel inputs unchanged.
- **Recorder** — `src/lib/components/DiveRecorder.svelte` is a thin view over
  the pure reducer in `src/lib/capture/recorderState.ts` +
  `src/lib/capture/recorderSelectors.ts`. Side-effects (camera, MediaRecorder,
  wake lock, scroll-lock, RAF ticks) live at the component edge.
- **Scroll / pinch lock** — `src/routes/(app)/dive/record/[id]/+page.svelte`
  pins `html/body` overflow and blocks iOS `gesturestart` while in `record` stage.
- **Phases** — `arming → ready → prepping → diving → ended → stopping`.
  `prepping` captures the tail of the breathe-up; `ended` keeps recording for
  the surface protocol.
- **Auto-advance waypoint** — if the interpolated cumulative distance exceeds
  the next waypoint by ≥10 m, the reducer auto-appends a lap and shows a
  toast. Configurable via `autoAdvanceThresholdM`. Undo removes it.
- **Pre-fill bundle** — on save, the record page stashes a
  `TimelineSummary` (total time, total distance, per-lap splits, avg speeds)
  into `sessionStorage` under `dive-log-seed:{sessionId}` so the dive-log
  form can seed a dynamic-max entry from the captured timeline.
- **Tests** — 31 unit tests in `src/lib/capture/recorderState.test.ts` cover
  every reducer transition, selectors, and the 10 m auto-advance threshold.
