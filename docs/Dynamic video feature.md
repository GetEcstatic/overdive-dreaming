This is a core feature for the app pre-release. If there's one thing the app should do well, it's this. My original motivation to develop the app was for this feature.

I want users to be able to video record their dynamic (DYN, DYNB, DNF) dives live in the pool. The idea is that the coach would start the recording while the diver is breathing up, and then follow the diver down the pool and back. The app records the dive and also records and overlay with the dive time, dive distance and dive speed. 

There are some technical challenges about how to approach this, and I have some ideas, but I'd like you to enter planning mode and propose solutions first with a fresh set of eyes.

Let's go and let's make this spectacular.

---

# Planning: Dynamic Video Capture with Performance Overlay

_Drafted: 2026-04-21_

This section captures a fresh-eyes plan for the Dynamic Video feature. It is deliberately opinionated and comparative so we can converge on an architecture before writing code. Open questions for Tom are flagged with **❓**.

## 1. Product Vision (refined)

A **coach-operated capture mode** inside the app that, with a single tap, starts recording a diver's dynamic attempt (DYN / DYNB / DNF) and produces a shareable, analyzable artifact:

- **Primary artifact:** an MP4 video of the dive, with a tasteful **HUD overlay** showing:
  - Live dive time (mm:ss.t)
  - Cumulative distance (m) — derived from lap taps × pool length
  - Current speed (m/s, rolling window) and/or pace (s/50m)
  - Lap counter (e.g. "Lap 3 / 8") and turn markers
  - Discipline label (DYN / DYNB / DNF) + athlete name (optional)
- **Secondary artifacts** produced automatically:
  - A `RoutineLog` or `Dive` record with totals (distance, time, avg speed, per-lap splits)
  - Per-lap split table (from tap events)
  - Thumbnail (poster frame at start of dive)
- **Social-ready:** the overlay is part of the video pixels so it plays anywhere (Instagram, WhatsApp, feed). A "clean" version (no overlay) is also kept.
- **Orientation (decided 2026-04-21):** capture is **portrait (9:16)** to maximise compatibility with Instagram Stories / Reels and natural one-handed phone use. The overlay and HUD are designed around a 9:16 safe area. Landscape is explicitly out of scope for v1.
- **Two playback modes (decided 2026-04-21):**
  1. **In-app:** clean video + DOM/Canvas overlay driven by `DiveTimeline` — no baked pixels, so timings stay editable.
  2. **Exported:** user-initiated step producing either a **clean** file (no overlay) or an **overlay-burned** file via `ffmpeg.wasm`, suitable for Instagram/WhatsApp/download.
- **Gifting (decided 2026-04-21):** coach records on their phone, then assigns the clip to the **athlete** at save time. Both see it; the athlete can attach it to their own session/routine-log.

## 2. Success Criteria

- One-handed operation by a coach walking the pool deck.
- ≤ 2 taps to start (tap "Record", maybe confirm discipline).
- Recording survives screen lock / phone tilt / brief app backgrounding where the browser permits.
- Final video matches what the coach saw (no drift between clock and footage).
- Works on iPhone Safari (primary) and modern Android Chrome.
- Graceful fallback when overlay can't be burned in (keep raw + sidecar metadata).
- Upload to Firebase Storage is resumable and happens off the critical path.

## 3. The Three Hard Problems

### 3.1 Capturing video in a web app
Browsers only expose camera via `getUserMedia()` + `MediaRecorder`. Constraints:
- **iOS Safari** has historically been the most restrictive. As of iOS 17+ `MediaRecorder` is supported but the produced container is MP4/H.264, while Chrome produces WebM/VP8-9. We must test both.
- Screen sleep kills capture → need `wakeLock` API (supported in iOS 16.4+).
- Long recordings (up to ~5 min for a big DYN) need chunked writes to avoid memory blow-ups.
- Orientation: coaches will film in **portrait (9:16)**; lock the UI to portrait. This matches Instagram Stories / Reels and is the natural one-handed phone grip on deck.

### 3.2 Rendering the overlay
Options (evaluated in §5).
- **A. Live burn-in via Canvas + `captureStream()`**: draw overlay on a canvas each frame, composite with the video track, feed into `MediaRecorder`.
- **B. Record raw, burn overlay on device post-capture** (WebCodecs / ffmpeg.wasm) before upload.
- **C. Record raw + sidecar JSON** of events; render overlay at playback time (HTML video + absolutely positioned DOM/Canvas). Cheapest; best quality; _but_ the exported file has no overlay.
- **D. Hybrid: C for in-app playback, B as an on-demand "export with overlay" step** for sharing.

### 3.3 Knowing the distance / speed
No GPS underwater. We need an input signal for "the diver just completed a lap":
- **Manual tap** by the coach at each wall touch. Simple, reliable, proven in freediving judging.
- **Audio cue** (coach says "turn" / whistle) detected by mic. Fragile around splashing/pool noise.
- **ML pose detection** on the video stream (TFJS MoveNet). Cool, but unreliable through water refraction, goggles, and fins. Not for v1.
- **Pool-length preset**: pool length × lap count = distance. Between taps, **interpolate** speed from previous lap time (or assume constant at the last known pace).

**Recommendation:** tap-based for v1. Build the UI so tapping is effortless with one thumb (big edge-aligned button). Keep ML on the roadmap as a nice-to-have.

## 4. End-to-End Flow (proposed)

```
[Session page] → "Record Dynamic" →
  1. Pre-flight screen: choose discipline, pool length (from session), athlete,
     rep target (optional). Big "READY" button.
  2. Capture screen (portrait 9:16):
       - Full-bleed camera preview
       - Top safe-zone: discipline, athlete, pool length, running clock (starts on "GO")
       - Bottom safe-zone: big thumb-reachable TAP-LAP button (primary) + smaller STOP button (secondary, hold-to-confirm)
       - Mid-screen kept clear so the diver is always visible; HUD stays in the 9:16 social-safe area (outside Instagram Story UI chrome: top ~250px / bottom ~320px reserved-aware)
       - State machine: idle → breatheUp → diving → finished
  3. Press GO when diver leaves the wall → clock + distance start.
  4. Tap-lap each time they touch a wall; distance += poolLength; lap time captured.
  5. Press STOP when dive ends → confirmation modal with totals + preview.
  6. Save → creates RoutineLog/Dive with splits; queues video upload.
  7. Upload runs in background (resumable). User can keep using the app.
  8. After upload, a Cloud Function (optional, phase 2) produces a "burned" export.
```

## 5. Overlay Strategy — Decision Matrix

| Option | Live preview accuracy | Export has overlay | CPU/battery | Complexity | iOS risk |
|---|---|---|---|---|---|
| A. Live canvas composite → MediaRecorder | ✅ WYSIWYG | ✅ Yes | 🔥 High | Medium | Medium (Safari quirks w/ captureStream) |
| B. Record raw, post-process w/ ffmpeg.wasm | ❌ preview-only | ✅ Yes | 🔥 High at export | High | Medium (wasm size, memory) |
| C. Record raw + sidecar events | ❌ (overlay is DOM) | ❌ | ✅ Low | Low | Low |
| D. C in app + B on export | ✅ (DOM overlay in app) | ✅ on demand | Split | Medium | Low for capture |

**Recommendation: D (Hybrid).**
- v1: ship **C** — record clean video, store a structured **`DiveTimeline`** (events, laps, clock). Play it back in-app with a DOM overlay. This is the fastest path to "it works" and produces the best-quality clean footage.
- v1.5: add an **"Export with overlay"** action that runs `ffmpeg.wasm` locally (or a Cloud Function with ffmpeg for premium users) to produce a shareable burned version.
- v2 (maybe): live burn-in (A) if users demand "record → share immediately" without post-processing.

## 6. Data Model Additions

Extend `RoutineLog` / add a parallel `DiveVideo` doc. Proposal:

```typescript
// sessions/{sessionId}/videos/{videoId}
interface DiveVideo {
  id: string;
  sessionId: string;
  userId: string;                // denormalised: same as ownerId (kept for simpler queries)
  ownerId: string;               // user who recorded (coach)
  athleteId?: string;            // recipient; same as ownerId if self-recorded
  giftStatus?: 'pending' | 'accepted' | 'declined'; // only set when ownerId !== athleteId
  routineLogId?: string;   // if attached to a routine log
  diveId?: string;         // if attached to an individual dive
  discipline: 'DYN' | 'DYNB' | 'DNF';

  // Storage
  storagePathClean: string;      // gs://.../videos/{id}/clean.mp4
  storagePathBurned?: string;    // optional; exported with overlay
  thumbnailPath?: string;
  durationSeconds: number;
  widthPx: number;
  heightPx: number;
  mimeType: string;              // 'video/mp4' | 'video/webm'
  sizeBytes: number;

  // Recording metadata
  recordedAt: timestamp;
  poolLength: number;            // meters
  deviceLabel?: string;          // camera label, useful for debugging
  orientation: 'portrait';   // v1 is portrait-only (9:16)
  aspectRatio: '9:16';
  resolutionPreset: '720p' | '1080p';  // 720p default (decided 2026-04-21)

  // Retention
  retentionTier: 'keep-last-5' | 'pinned'; // pinned survives the 5-video reaper

  // Timeline — THE key analytics artifact
  timeline: DiveTimeline;

  createdAt: timestamp;
  updatedAt: timestamp;
}

interface DiveTimeline {
  // All times are ms offsets from the start of the recording
  diveStartMs: number;           // when "GO" was pressed (diver left wall)
  diveEndMs: number;             // when STOP was pressed
  laps: LapEvent[];
  events?: OverlayEvent[];       // free markers (turn, surface protocol, etc.)
}

interface LapEvent {
  lapNumber: number;
  atMs: number;                  // relative to recording start
  cumulativeDistanceM: number;   // lap * poolLength
  splitMs: number;               // time since previous wall tap
}

interface OverlayEvent {
  atMs: number;
  kind: 'marker' | 'note';
  label?: string;
}
```

Totals (`totalTime`, `totalDistance`, average/peak speed) are derived from `timeline` and written back to the parent `RoutineLog` / `Dive` so existing analytics keep working without changes.

## 7. Storage, Cost & Upload

- **Firebase Storage** under `users/{uid}/videos/{videoId}/…` with Storage Rules matching existing `storage.rules`.
- **Resumable uploads** (`uploadBytesResumable`) so poor pool-deck Wi-Fi doesn't lose work.
- **Offline-first**: write video blob to **IndexedDB** immediately after STOP. Upload is a background job that retries. UI reflects "Pending upload" state.
- **Size budget (decided 720p30 @ ~3 Mbps default, 1080p30 @ ~5 Mbps opt-in):** 720p ≈ 22 MB/min, 1080p ≈ 37 MB/min.
- **Retention (decided 2026-04-21):** keep only the **5 most recent** `DiveVideo` uploads per user with `retentionTier = 'keep-last-5'`. A Cloud Function (`onCreate` of a new `DiveVideo`) deletes the oldest non-pinned video for that user when count > 5. `DiveTimeline` data stays in Firestore forever so splits/analytics persist.
- **Download to Photos:** big primary action on save + playback screens using `navigator.share({ files: [...] })` (iOS 16+/Android) or `<a download>` fallback. This is how users keep videos long-term.
- **Cost path:** Firebase Storage for v1 (simple, integrated). If usage grows, migrate to **Cloudflare R2** (zero-egress, cheapest for video) — tracked as T11.

## 8. Playback UX (v1)

- New route: `/(app)/session/[id]/video/[videoId]` (or modal over session detail).
- `<video>` element with absolute-positioned DOM overlay reading from `timeline`:
  - Time is synced via `requestVideoFrameCallback` (falls back to `timeupdate`).
  - Lap table on the right (desktop) / below video (mobile) with tap-to-seek to lap.
  - Scrub bar annotated with lap markers.
- Share actions:
  - "Share clean clip" — direct Firebase Storage signed URL.
  - "Export with overlay" — triggers the ffmpeg.wasm job (phase 1.5).

## 9. Capture UI — Interaction Details

- Full-screen camera preview; UI chrome translucent to preserve situational awareness.
- **State machine** (Svelte store), enforces allowed transitions:
  - `idle → armed (camera granted, preview running)`
  - `armed → breatheUp (RECORD pressed; clock hidden)`
  - `breatheUp → diving (GO pressed; clock starts, distance=0)`
  - `diving → diving (TAP-LAP pressed; lap recorded)`
  - `diving → finished (STOP pressed; confirmation)`
- Prevent accidental taps: STOP requires a 300 ms hold; TAP-LAP is single-tap but debounced 250 ms.
- Haptics on iOS via `navigator.vibrate` (best-effort) for every lap tap — coach gets tactile confirmation even when looking at the water.
- `wakeLock` requested in `armed`, released in `finished`.
- Orientation lock to **portrait** via CSS + `screen.orientation.lock('portrait')` where supported. If the user rotates to landscape, show a "Please rotate to portrait" overlay instead of recording sideways.

## 10. Testing & Device Matrix (v1 bar)

- iPhone 12 / 14 / 15 on iOS 17–18, Safari.
- Pixel 7 / Galaxy S22 on Chrome.
- Simulated scenarios: screen lock attempt, incoming call, backgrounding, low battery, 5-minute continuous recording, wet finger tap reliability.
- Unit tests for `DiveTimeline` math (splits, cumulative distance, speed smoothing).
- Manual QA checklist lives alongside this doc (new `docs/dynamic-video-qa-checklist.md` in phase 0).

## 11. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| iOS Safari backgrounds capture | High | High | Wake lock, on-screen "don't lock" banner, persist chunks incrementally |
| File size blows free tier budget | Medium | Medium | 720p default, retention policy, explicit "save forever" action |
| Coach forgets to tap a lap | High | Low | Post-capture editor: add/shift/remove lap markers while reviewing |
| Time drift between overlay and footage | Medium | High | Single monotonic clock (`performance.now()`) used for both lap timing and recorded frame PTS |
| ffmpeg.wasm memory on long dives | Medium | Medium | Process via streamed demux/remux, not a single load into memory |
| Users expect live burn-in | Medium | Medium | Clear UI copy explaining export step; ship A later if needed |

## 12. Rollout Phases (proposed)

**Phase 0 — Spikes & decisions (before any production code)**
- P0.1 Browser capability spike: confirm `MediaRecorder` behavior and container/codec on iOS 17/18 Safari and Android Chrome.
- P0.2 Decide: Option D (recommended) vs. live burn-in (A).
- P0.3 Decide retention policy / quotas with Tom. **How about last 5 dives, but users are able to download to their photo albums locally. Later we can change this if we can find a way to make it cost effective. Would supabase or convex offer better storage options**
- P0.4 Confirm UX wireframes for the capture screen. **confirmed**

**Phase 1 — MVP capture (clean video + timeline + in-app overlay)**
- P1.1 Add `DiveVideo` + `DiveTimeline` types in `src/lib/types.ts`.
- P1.2 Firestore rules + Storage rules updates for new paths.
- P1.3 New route `src/routes/(app)/session/[id]/record/+page.svelte` with capture state machine.
- P1.4 `src/lib/capture/` module: `cameraStream.ts`, `recorder.ts`, `wakeLock.ts`, `timeline.ts`.
- P1.5 `src/lib/components/video/DiveRecorder.svelte` (capture UI, **portrait 9:16 lock**, tap-lap, stop, Instagram-safe HUD zones).
- P1.6 IndexedDB queue: `src/lib/capture/uploadQueue.ts`.
- P1.7 Resumable upload to Firebase Storage; Firestore `DiveVideo` doc on success.
- P1.8 `DiveVideoPlayer.svelte` with DOM overlay reading from `DiveTimeline`.
- P1.9 Wire into session detail page: list videos, play, delete.
- P1.10 Backfill `RoutineLog.totalDistance/totalTime` from timeline on save.
- P1.11 **Gifting flow:** coach picks athlete at save; `DiveVideo.athleteId` set; athlete sees pending-gift card in dashboard and can accept/decline and attach to their own session.
- P1.12 **Retention reaper:** Cloud Function `onDiveVideoCreated` that queries the user's `DiveVideo` list and deletes the oldest non-`pinned` video (Storage objects + Firestore doc), plus a "Pin" action in the UI.
- P1.13 **Download to Photos** button: `navigator.share({ files: [...] })` with `<a download>` fallback.
- P1.14 **Resolution toggle** in profile/settings: 720p (default) / 1080p.
- P1.15 QA against device matrix (§10). Write `docs/dynamic-video-qa-checklist.md`.

**Phase 1.5 — Sharing-grade export**
- P1.5.1 `ffmpeg.wasm` integration, overlay rendered to PNG sequence via offscreen canvas, muxed back into the source video.
- P1.5.2 **Export dialog** with two choices: "Clean video" or "Video + overlay" (then download locally and optionally re-upload as `storagePathBurned`).
- P1.5.3 Share Sheet integration (`navigator.share` with files on iOS 16+).
- P1.5.4 Optional "Mute audio" toggle on export.

**Phase 2 — Post-capture editor & polish**
- P2.1 Timeline editor: drag lap markers, add notes, trim clip start/end.
- P2.2 Lap-synced scrubber + keyboard shortcuts on desktop.
- P2.3 Thumbnail picker.
- P2.4 Per-lap annotations (kicks, arm pulls) synced into `RoutineLog.laps[]`.

**Phase 3 — "Wow" features (speculative)**
- P3.1 Cloud Function exporter for premium users (no wasm in browser).
- P3.2 Auto-turn detection via ML on the video (TFJS) to pre-populate lap events.
- P3.3 Side-by-side ghost comparison of two attempts.
- P3.4 Overlay themes (minimal / broadcast / coaching).

## 13. Open Questions for Tom ❓

1. **Retention / storage billing:** how aggressive should we be about deleting raw video? Is this a premium feature from day one? *I don't want this to start costing me anything. I've suggested saving max 5 dives. We should default to 720p with a 1080p option on toggle. How realistic do you think this is?*
2. **Athlete vs. coach accounts:** does the coach record on their own device, tag the athlete, and "gift" the video? Or always the athlete's phone on deck? *The gifting feature is a really neat solution. Let's implement this from outset*
3. **Live vs. export overlay preference:** is an "export step" acceptable for sharing, or must the recorded file already contain the overlay? *I think exporting is a good solution. I would prefer the overlay to be separate actually so exporting can include the overlay or the clean video. However, I do think it's important to be able to view the video in app*
4. **Audio:** keep original pool audio (whistles, encouragement) or strip it? *keep it for now. Often the coaching narrates a dive or makes notes as they go*
5. **Discipline scope:** STA-dry (static) recording with a single timer overlay in scope for v1, or only dynamic? *Statics should be an option later. Due to the long dive times and relative lack of movement a special procedure maybe required.*
6. **Offline use:** must recording work with no network at all (offline-first capture + delayed upload), or is coach Wi-Fi assumed? *I think we have to accept that there will be wifi outages, so offline capture or a hypbrid should be accepted*
7. **Privacy:** other swimmers may appear in frame. Do we need a "blur background" mode or consent UX? *Yes but this could be a version 2 addition. It's fairly unusual in freediving for this to happen*

## 14. Immediate TODO List (action items from this planning pass)

- [x] T1 — Get Tom's answers on §13 open questions. **DONE 2026-04-21** (see §15).
- [ ] T2 — P0.1 spike: 10-line HTML prototype recording 2 min on iPhone Safari & Android Chrome, measure file size, container, codecs.
- [ ] T3 — P0.2 decision memo appended to this doc ("A vs D" with evidence from T2). _(Option D effectively confirmed by D3; T3 now = record the evidence numbers.)_
- [ ] T4 — Wireframes for capture screen + playback overlay (can be ASCII in this doc for now).
- [x] T5 — `DiveVideo` / `DiveTimeline` TypeScript types added to `src/lib/types.ts` (with `ownerId`, `athleteId`, `giftStatus`, `retentionTier`, `resolutionPreset`, `uploadStatus`). **DONE 2026-04-21** (commit TBC).
- [x] T6 — Storage + Firestore rules updated for `diveVideos/{videoId}` (owner + athlete reads, athlete-only `giftStatus` updates) and Storage path `users/{uid}/videos/{videoId}/*`. **DONE 2026-04-21.**
- [x] T7 — Capture module skeleton landed at `src/lib/capture/` (`timeline.ts` pure math helpers, `wakeLock.ts`, `cameraStream.ts`, `recorder.ts`). **Unit tests still pending.**
- [x] T8 — `docs/dynamic-video-qa-checklist.md` created with device matrix, capture flow, data integrity, upload, playback, gifting, retention, download, privacy, and a11y checks. **DONE 2026-04-21.**
- [ ] T9 — Prototype the DOM-overlay player against a fixed-file timeline JSON to validate sync via `requestVideoFrameCallback`.
- [ ] T10 — Revisit this plan after T2/T3; lock scope for v1.
- [ ] T11 — **Storage cost spike:** benchmark Firebase Storage vs Cloudflare R2 vs Supabase Storage for expected usage profile; document a migration path if/when we outgrow Firebase.
- [ ] T12 — **Retention reaper:** design + implement Cloud Function that enforces `keep-last-5` per user, skipping `pinned` videos. Include a dry-run mode and audit log.
- [ ] T13 — **Gifting spike:** UX flow for coach-picks-athlete, athlete-accepts/declines, notifications, security-rules implications.
- [ ] T14 — **Download-to-Photos verification:** test `navigator.share({ files })` on iOS Safari 17/18 and Android Chrome; confirm the fallback `<a download>` works when Share API can't deliver files.

_Until Tom weighs in on §13, no production code changes have been made. This is a planning artifact only._

---

## 15. Decision Log

- **2026-04-21** — **Capture orientation: portrait (9:16).** Tom confirmed: recording is portrait-only for v1 to maximise compatibility with Instagram Stories/Reels and natural one-handed phone use on deck. All HUD/overlay mockups, safe zones, `screen.orientation.lock()` calls, and the `DiveVideo.orientation` enum are updated accordingly. Landscape is explicitly out of scope for v1. Revisit if users request landscape for wide pool shots.
- **2026-04-21** — Plan approved by Tom ("seems fantastic"). Proceeding mindset: the hybrid overlay strategy (Option D) remains the recommendation pending answers to remaining §13 open questions (retention, athlete/coach accounts, audio, STA scope, offline, privacy).

- **2026-04-21** — **Answers to §13 open questions received. Summary + consequences:**

### D1. Retention & storage cost → **Keep only the last 5 dive videos per user; local download encouraged**
- Firebase Storage keeps at most **5 most-recent** `DiveVideo` records per user. When a 6th is uploaded, the oldest is deleted (video + thumbnail; the `DiveTimeline` Firestore doc is retained so analytics/splits survive forever).
- A prominent **"Download to Photos"** action on the video player and on the post-capture save screen, using `navigator.share` with `files` on iOS/Android where supported, falling back to a plain `<a download>` link.
- Capture defaults to **720p30 @ ~3 Mbps** (~22 MB/min). A user-toggle in profile/settings enables **1080p30 @ ~5 Mbps** (~37 MB/min).
- **Feasibility check (720p, 5-dive cap, typical user):** 5 × 3 min clips × ~22 MB ≈ 110 MB/user. 1000 users ≈ 110 GB total. Firebase Storage free tier is 5 GB; Blaze pricing is $0.026/GB/month, so 110 GB ≈ $2.86/month plus egress for downloads. **Realistic for small-scale launch; will need revisit if active users exceed ~1500.**
- **Action T11:** evaluate **Supabase Storage** (2 GB free, $0.021/GB beyond, unlimited egress on Pro) and **Cloudflare R2** (10 GB free, **zero egress fees**, $0.015/GB). R2 looks like the best cost story for video because egress dominates once users download / share; bookmark as a migration target. Keep v1 on Firebase Storage to avoid compounding risk during MVP.

### D2. Athlete vs. coach → **Gifting is built-in from day one**
- The coach records on their own device. During the post-capture save step they pick the **athlete** (any user they follow / have a relationship with, or a raw email invite).
- Firestore model: `DiveVideo` has `ownerId` (coach) AND `athleteId` (recipient). The video becomes **readable by both**; the athlete can promote it into their own session/routine-log timeline.
- Introduces a lightweight **pending gift** flow: athlete sees a notification on next app open → "Coach X sent you a dive video. Accept & attach to [session/new dive]?".
- This also piggybacks on future social features (followers, shared feeds) — good forcing function to think about it early.

### D3. Overlay shipping → **Clean video + separate "Export with overlay" is the model**
- Clean (raw) video is the canonical storage artifact, always. In-app playback composites the HUD over the clean video from `DiveTimeline` (DOM overlay). This lands in v1.
- "Export" becomes a **user-initiated step** offering two output options: (a) **clean video** (download the raw), (b) **video + overlay** (burned in via `ffmpeg.wasm` → downloadable / shareable). This lands in v1.5.
- **Confirms Option D (hybrid)** from §5 — no change to architecture, just a firmer commitment.

### D4. Audio → **Keep pool audio on by default**
- Coaches narrate dives, call "up", use whistles — this is training context worth preserving.
- Add a per-export toggle later ("Mute audio") in case users want a silent clip for social, but raw capture always keeps audio.

### D5. STA support → **Out of scope for v1; plan a dedicated STA flow for later**
- STA needs a different UX (no lap taps, long hold, heart-rate cues, "ready / start / surface protocol / official" structure). Tracked as a separate future feature in Phase 3+.
- v1 capture screen will only be exposed for **DYN / DYNB / DNF** attempts.

### D6. Offline → **Offline-first capture is the target, upload resumes when online**
- Confirms the IndexedDB + resumable-upload queue design in §7. No app-level network check gates recording.
- Add a small "Pending upload (x MB)" chip in the nav when the queue has pending work, and a retry button in profile/settings.

### D7. Privacy / blur → **v2 feature, not blocking v1**
- Pool freediving rarely has uninvolved swimmers in frame. Skip a blur/consent UX for v1. Document the risk and revisit in v2 if issues arise.

### Consequential updates to earlier sections
- §1 product vision: clarify the **two playback modes** (in-app with DOM overlay; exported with burned overlay) and the **gifting** concept.
- §6 data model: add `ownerId`, `athleteId`, `giftStatus` (`'pending' | 'accepted' | 'declined'`) to `DiveVideo`. Add a `retentionTier: 'keep-last-5' | 'pinned'` field so users can "pin" a special video (e.g. a PB) beyond the 5-video cap, at least until a premium tier exists.
- §7 storage & cost: downgrade defaults to 720p30 @ 3 Mbps baseline; note that Cloudflare R2 is the target migration if cost pressure appears. Add a **5-video retention reaper** (Cloud Function triggered on `DiveVideo` create that purges beyond the 5 newest, skipping `pinned`).
- §12 rollout: add the gifting flow to **Phase 1** (cannot be bolted on later cleanly) and the retention reaper to **Phase 1**. Move the "Export with overlay" wording to match D3.
- §14 TODOs: add **T11** (storage-provider cost comparison), **T12** (retention reaper design), **T13** (gifting UX + data model spike), **T14** (download-to-Photos verification across iOS/Android). Mark T1 as ✅ done.

_These consequences are now the authoritative v1 scope. Implementation work can begin once §14 action items T5–T9 are through review._

- **2026-04-21** — **Phase 1 implementation kickoff.** Landed the foundational layer:
  - `src/lib/types.ts`: `DiveVideo`, `DiveTimeline`, `LapEvent`, `OverlayEvent`, `DiveVideoFormData` (with `ownerId`, `athleteId`, `giftStatus`, `retentionTier`, `resolutionPreset`, `uploadStatus`).
  - `src/lib/capture/` module: `timeline.ts` (pure math — splits, cumulative distance, rolling speed, summary), `wakeLock.ts` (with visibility-reacquire), `cameraStream.ts` (portrait 9:16 constraints), `recorder.ts` (MediaRecorder mime negotiation), `uploadQueue.ts` (IndexedDB), `uploadProcessor.ts` (resumable-upload drainer with max-5-retries).
  - `src/lib/services/diveVideos.ts`: Firestore CRUD + Storage upload helpers (owner, gifted, session queries; pin, gift-status, thumbnail upload, delete-with-blobs).
  - `firestore.rules`: `diveVideos/{videoId}` rules — owner full access, athlete may only toggle `giftStatus`.
  - `storage.rules`: `users/{uid}/videos/{videoId}/{file}` — owner writes (video ≤ 500 MB, image ≤ 5 MB), any authed user reads (Firestore doc is the auth gate).
  - `src/lib/components/DiveRecorder.svelte`: full capture UI (camera arm → GO/LAP/Undo/STOP, portrait lock, wake lock, live HUD, bitrate by resolution).
  - `src/lib/components/DiveVideoPlayer.svelte`: in-app DOM-overlay playback driven by `DiveTimeline`, uses `requestVideoFrameCallback` when available with a `timeupdate` fallback.
  - `src/routes/(app)/dive/record/[id]/+page.svelte`: capture → review → save (pool length, discipline, pin) → enqueue + drain.
  - `docs/dynamic-video-qa-checklist.md`: full device & flow QA matrix.
  - `svelte-check` clean for all new files.
  - **Next up (todos 9–14):** wire a "Record dive" entry point + `DiveVideoPlayer` into `session/[id]`; add vitest unit tests for `timeline.ts`; build the gifting picker + accept/decline UX; retention-reaper Cloud Function; Download-to-Photos action via `navigator.share({ files })`; resolution toggle in profile settings.

- **2026-04-21** — **Phase 1 increment #2.** Picked off three of the outstanding todos:
  - `UserSettings.defaultVideoResolution` added in `src/lib/types.ts` (`'720p' | '1080p'`).
  - Profile page (`src/routes/(app)/profile/+page.svelte`) now has a **Dive video resolution** selector wired to `updateUserSettings`; all four existing inline `nextSettings` literals updated to include the new field.
  - `/dive/record/[id]` now loads the user's `defaultVideoResolution` via `getUserSettings` on mount, so `DiveRecorder` picks up the correct bitrate without the coach fiddling with settings on deck.
  - `DiveVideoPlayer.svelte` ships a **"Download to Photos"** action: tries `navigator.share({ files })` first, falls back to an anchor-download with a sensible filename (`overdive-DYN-<recordedAt>.mp4`). User-cancelled shares (AbortError) are silently ignored.
  - `svelte-check` clean for all touched files.
  - **Still outstanding (todos 9, 11–13):** wiring the Record entry point + playback list into the session detail page is blocked by a routing-model ambiguity — `/session/[id]` in this app resolves a single **RoutineLog**, not a `Session` container. `RoutineLog` does not carry a `sessionId` (only `sessionGroup`), yet `DiveVideo.sessionId` and the record route assume a real session id. Need Tom's call on whether `DiveVideo.sessionId` should map to `RoutineLog.sessionGroup`, to a new explicit session collection, or to the `routineLogId` directly. Gifting picker, retention-reaper Cloud Function, and `timeline.ts` vitest suite are also still to come.


- **2026-04-21** — **Phase 1 increment #3.** Resolved the session-integration blocker pragmatically and landed it:
  - **Routing-model decision:** treat `DiveVideo.sessionId` as the **`RoutineLog.id`** of the dive it belongs to. This matches what `/dive/record/[id]` has been doing all along (the `[id]` route param is the routine log id) and means `listDiveVideosForSession(routineLogId)` returns exactly the videos attached to that dive. No schema change, no new collection, no refactor. When a first-class `Session` collection is introduced later, we can add a separate `routineLogId` field and keep `sessionId` for the parent container; for now `DiveVideo.sessionId === RoutineLog.id` is the contract.
  - **New component** `src/lib/components/SessionDiveVideos.svelte`: loads videos for the current routine log, resolves Storage download URLs in parallel, renders each via `DiveVideoPlayer`, handles pending/failed upload states, and exposes Pin / Unpin / Delete actions for the owner. Only renders for dynamic disciplines (DYN/DYNB/DNF).
  - **Wired into** `src/routes/(app)/session/[id]/+page.svelte` above the legacy Media section. Owners see a **"Record new"** button that navigates to `/dive/record/{log.id}`; non-owners see only the video list.
  - `svelte-check` clean for `SessionDiveVideos.svelte`, `DiveVideoPlayer.svelte`, and the session page (the 3 pre-existing a11y warnings on lines 689/750 are unrelated).
  - **Still outstanding:** gifting picker + accept/decline UX; retention-reaper Cloud Function (keep-last-5, skip pinned); `timeline.ts` vitest suite (blocked on adding vitest as a dev dep — needs Tom's go-ahead); ffmpeg.wasm burned-overlay export (Phase 1.5); device-matrix QA run.

- **2026-04-21** — **Phase 1 increment #4 — gifting UX landed.**
  - `src/lib/components/AthletePicker.svelte`: search-and-pick component backed by the existing `searchPublicUsersByDisplayName` helper; displays the chosen athlete as a confirmed chip, or a "this dive is yours" hint otherwise. Self is excluded from results.
  - Wired into the record page's Review & Save panel. When the coach picks an athlete, `athleteId` flows through `buildDiveVideoFormData`, which already sets `giftStatus = 'pending'` when `athleteId !== ownerId`.
  - `src/lib/components/PendingGifts.svelte`: compact dashboard section that lists incoming pending gifts, resolves owner display names via `getPublicUserProfilesByIds`, and offers **Accept & view** (writes `giftStatus = 'accepted'`, jumps to `/session/{sessionId}`) and **Decline** (writes `giftStatus = 'declined'`) actions. Nothing renders when there are no pending gifts — zero dashboard clutter for most users.
  - Firestore rule for `diveVideos/{videoId}` already allows the athlete to update **only** `giftStatus`, so Accept/Decline work with no security-rules change.
  - `svelte-check` clean for all new/touched files (overall repo still at the pre-existing 2 errors / 74 warnings baseline from unrelated files).
  - **Still outstanding:** retention-reaper Cloud Function (keep-last-5, skip pinned); `timeline.ts` vitest suite (still blocked on adding vitest as a dev dep — awaiting Tom); ffmpeg.wasm burned-overlay export (Phase 1.5); device-matrix QA run.

- **2026-04-21** — **Phase 1 increment #5 — client-side retention reaper landed.**
  - `reapOwnedDiveVideos(ownerId, keepCount=5)` in `src/lib/services/diveVideos.ts`: lists an owner's videos newest-first, filters out `retentionTier === 'pinned'`, keeps the first `keepCount` non-pinned, and deletes the rest (Firestore doc + Storage clean/burned/thumbnail blobs).
  - Wired into `src/lib/capture/uploadProcessor.ts::uploadOne` as a best-effort step after a successful upload. Reaper failures are non-fatal and logged; the next successful upload retries.
  - **Why client-side first:** no Cloud Functions scaffolding exists in this repo yet (`firebase.json` configures only storage + firestore). Adding Functions is a meaningful infra commitment (deploy pipeline, billing, Admin SDK install) — the client-side reaper keeps the typical user within budget today, and a server-side Admin-SDK reaper can replace it later as the canonical enforcement point (especially for the "user never returns to the app" edge case).
  - `svelte-check` clean for touched files.
  - **Still outstanding:** server-side reaper Cloud Function (needs Tom's go-ahead on scaffolding `functions/`); `timeline.ts` vitest suite (needs vitest devDep OK); ffmpeg.wasm burned-overlay export (Phase 1.5); device-matrix QA run.

- **2026-04-21** — **Phase 1 increment #6 — timeline.ts unit tests landed.**
  - Added `vitest` + `@vitest/coverage-v8` as devDeps, `vitest.config.ts`, and `npm test` / `npm run test:watch` scripts.
  - `src/lib/capture/timeline.test.ts`: 18 unit tests covering `createEmptyTimeline`, `appendLap` (cumulative distance, sequential lap numbers, negative-split clamp, immutability), `removeLastLap`, `totalTimeMs` (negative clamp), `totalDistanceM`, `averageSpeedMs` (including zero-time guard), `speedAt` (pre-lap zero, post-lap split-based), `distanceAt` (pre-lap zero, linear interpolation, lap-progress cap), and `summariseTimeline` (uneven laps, empty-timeline nulls). **All 18 tests pass.**
  - Canonical fixture: 200m DYN in a 50m pool, 4 laps @ 30s = 120s total, avg speed 1.667 m/s.
  - **Still outstanding:** server-side reaper Cloud Function (needs Tom's go-ahead to scaffold `functions/`); ffmpeg.wasm burned-overlay export (Phase 1.5); device-matrix QA run.

- **2026-04-21** — **Phase 1 increment #7 — server-side retention reaper scaffolded (Tom approved).**
  - New `functions/` package: `package.json` (firebase-admin ^13.6, firebase-functions ^6.6, node 20 runtime), `tsconfig.json` (strict, NodeNext), `.gitignore`, and a `README.md` documenting setup, Blaze requirement, dry-run mode, and emulator flow.
  - `functions/src/index.ts` initialises the Admin SDK and re-exports the trigger.
  - `functions/src/retentionReaper.ts::onDiveVideoCreated`: Firestore `onDocumentCreated('diveVideos/{videoId}')` trigger that lists the new video's `ownerId`'s owned videos (recordedAt desc, limit 200), filters out pinned, keeps the 5 newest non-pinned, and for every victim deletes Storage (clean + burned + thumbnail, `ignoreNotFound: true`) then the Firestore doc. Writes an audit entry to `reaperAudit/*` on every run with counts and the list of reaped ids. **Dry-run** mode via `REAPER_DRY_RUN=1` logs what WOULD be deleted without touching anything — safe production validation path.
  - `firebase.json` updated with a `functions` block (codebase=default, runtime=nodejs20) so `firebase deploy --only functions` picks it up.
  - `npm install` + `npm run build` inside `functions/` both clean (no tsc errors).
  - Repo-wide: `npm run check` and `npm test` still at baseline (2 errors / 74 warnings / 18 tests passing) — no regressions.
  - **Client-side reaper kept** as a happy-path optimisation; the Cloud Function is now the canonical enforcement point. Both share the same semantics (keep 5 newest non-pinned, skip pinned).
  - **Deploy prerequisites (for Tom, when ready):** Firebase project must be on the Blaze (pay-as-you-go) plan for Functions; `firebase login`; `firebase deploy --only functions` from the repo root.
  - **Still outstanding:** ffmpeg.wasm burned-overlay export (Phase 1.5); device-matrix QA run.
