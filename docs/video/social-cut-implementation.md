# Social cut — implementation plan

Up: [Video docs](README.md) · Spec: [Share HUD redesign](share-hud-redesign.md) §4.2.1, §6.3–§6.4, phase 2

Status: **Plan v2, evaluated, in implementation** (19 Oct 2026). This doc owns *how* the social cut is built. The spec owns *what* it looks like.

## 1. Outcome

From any saved dive video, the owner taps **Share reel**. A sheet opens with a 9:16 preview of the edit, already playing. It plays the start, fast-forwards between walls, runs 1× around each turn, and plays surfacing and the surface protocol. The result card comes last. The owner can:

- adjust the protocol end;
- toggle name, PB and intro hook;
- flip the graph;
- tap **Create reel**.

When the server render is ready, the same button becomes **Share to Instagram**. It opens the system share sheet with the MP4 and copies a caption.

## 2. Architecture (pure core, effects at the edges)

| Layer | File | Responsibility |
|---|---|---|
| Edit decision list | `src/lib/media/shareHud/socialCut.ts` | `(walls, dive bounds, PB crossing, recording length, protocol override) → segments`. Turn selection, fast-forward factor, jump cuts, output↔source mapping, output ticks. |
| Canvas placement | `src/lib/media/shareHud/socialCanvas.ts` | 1080×1920 canvas. Portrait sources are scaled to cover. Landscape sources go in a 1080×608 band centred on the HUD clear band (y≈611). Also used by the in-app preview. |
| Frame SVG | `src/lib/media/shareHud/index.ts` (`socialCutFrameSvg`) and `layout.ts` (`layoutSocialExtras`) | The normal HUD at the mapped source time, plus a fast-forward badge in the header row and the PB hook pill in the sub-line row. |
| Render key | `src/lib/media/overlayStyle.ts` (`socialRenderKey`) | Style version, direction, effective protocol end and toggles. Shared by app and worker, so "is the cut current?" has one answer. |
| Caption | `src/lib/media/socialCaption.ts` | `190 m DYN · 2:45.0 · new PB (+15 m) · Tracked with overdive.app #freediving #dynamicapnea` |
| Preview transport | `src/lib/media/socialPreview.ts` | Pure: output clock → target source time, playback rate, and whether to seek. Falls back to seek stepping when the browser rejects high rates. |
| Worker | `functions/src/mediaWorker.ts` | New job type `generate-social-cut`. Pipeline: FFmpeg `split`/`trim`/`setpts`/`concat`, placement, `tpad` card hold, HUD overlay, audio pieces with 150 ms fades. |
| Request callable | `requestOverlayDownload` with `kind: 'social-cut'` and `options` | Same lock pattern as the HUD download (`processingLocks/socialCut`). Supersedes a queued job whose key differs. Old clients keep working, because `kind` defaults to the HUD download. |
| Signing | `functions/src/mediaSigning.ts` | Read-only media kind `dive-video-social` resolves the `social-cut` artefact. |
| App service | `src/lib/services/diveVideos.ts` | `requestDiveVideoSocialCut`, `getDiveVideoSocialCutUrl`, `setDiveVideoProtocolEnd`, `saveShareHudOptions` |
| UI | `src/lib/components/SocialCutSheet.svelte`, `DiveVideoPlayer.svelte` | Sheet, preview, controls, share. Player actions: **Share reel** (primary) and a **Download** menu (Original / With HUD). |

## 3. Edit rules (refines spec §4.2.1)

- **Walls** come from `prepareDive().walls` (pool-length multiples on the speed segments), not raw `timeline.laps`, so 25 m pools and partial laps behave.
- **1× windows:**
  - start: `diveStart − 2 s … diveStart + 3 s`;
  - each turn: `wall ± 1.5 s`;
  - finish: `diveEnd − 2 s … protocolEnd`.

  Overlapping windows merge.
- **Protocol end:** `shareEdit.protocolEndMs` → `timeline.protocolEndMs` → `min(recording end, diveEnd + 15 s)`. Clamped to `[diveEnd, recording end]`.
- **Long dives:** if the 1× windows plus the card exceed 33 s, keep only these turn windows:
  - the first turn;
  - the last turn before the PB crossing (if any);
  - the last turn.

  The others are fast-forwarded.
- **Factor:** the smallest of 4/6/8/12/16× that brings the total to 45 s or less. If 16× still exceeds 45 s, remove the middle of the longest fast-forward stretches. Each removed span costs `excess × 16` of source. The removals are **hard jump cuts**. A segment flagged `jumpIn` starts after a cut, and the HUD clock jumps with it.
- **Audio:** original at 1× with 150 ms fade in/out at every join; silence during fast-forward and the card. If the source has no audio, the output has no audio track.
- **Card:** a 3 s hold on the last protocol frame (`tpad` clone). HUD in card phase with `cardAtMs = protocolEnd`.

## 4. Server render (speed and cost)

- **On demand only**, never at upload. It runs in the existing `processMediaJob` worker with no CPU, memory or instance changes.
- **Input seek:** `-ss firstSegmentStart -t span` before `-i`, so FFmpeg never decodes the pre-dive wait or anything after the protocol.
- **Order of filters:** per-segment `trim` and `setpts=(PTS-STARTPTS)/speed`, then `concat`, then `fps=30`. Rotation and scaling run after that, so fast-forward frames are dropped before the expensive scale.
- **HUD frames** run at 10 Hz over *output* time: about 450 ticks for a 45 s cut, deduplicated by the existing frame-run collapse.
- **Expected worker time:** about 30–60 s.

  **Measured locally** (Apple silicon, the 198 s audit clip, fixture timeline):

  | Source | Output | HUD frames | Encode | Total | Size |
  |---|---|---|---|---|---|
  | Portrait 464×848 | 41.6 s at 12× | 277 rendered of 416 ticks in 4.5 s | 12 s | 15 s | 30 MB |
  | Landscape 1280×720 | 41.6 s at 12× | 4.5 s | — | 13 s | 25 MB |

  The full HUD export of the same clip takes 76 s.

- **Bitrate:** capped at 6 Mbps (`-maxrate 6M`). Instagram re-encodes Reels at about 3.5–5 Mbps. The cap halved the file size (48 → 30 MB) and keeps phone sharing quick.

- **Expected cost per cut:** about 1–2 US cents, from the worker's vCPU and memory seconds. Wasabi adds about 20–40 MB per cut, held as a disposable artefact.
- **Artefact:**
  - kind `social-cut`;
  - profile `social-mp4-1080x1920`;
  - key `users/{owner}/videos/{id}/overlay/social.mp4`;
  - `styleVersion` = render key.

  Timeline corrections remove it. The retention reaper now deletes **every** artefact object, which also fixes playback proxies leaking today.

## 5. UX

### 5.1 Player actions (below the video, owner only)

`[● HUD]  [✦ Share reel]  [⬇ Download ▾]  [Edit waypoints]`

- **Share reel** is the primary pill.
- **Download** opens a two-item menu:
  - *Original video*;
  - *Video with HUD*, with its status: Preparing… / Ready / Create.

### 5.2 Share reel sheet (bottom sheet, phone-first)

```
┌──────────────────────────────┐
│ Share reel               ✕   │
│ ┌──────────┐                 │
│ │  9:16    │  preview plays  │
│ │ preview  │  muted, loops   │
│ └──────────┘                 │
│ 0:38 · 12× between turns     │
│ ▁▁███▁▁█▁▁█▁▁████|           │  ← edit strip, protocol-end handle
│ Protocol ends 0:11 after     │
│ surfacing        Reset       │
│ [Name ●] [PB ●] [Intro ●] ⇄  │
│ ┌──────────────────────────┐ │
│ │   Create reel            │ │  → Rendering… → Share to Instagram
│ └──────────────────────────┘ │
│ Copy caption                 │
└──────────────────────────────┘
```

- **Preview:**
  - The real video plays behind the same SVG the server burns in, mapped through the edit list.
  - It plays muted, autoplays and loops.
  - Tapping it pauses.
- **Edit strip:**
  - The 1× pieces are teal and the fast-forward pieces are grey.
  - The handle sets the protocol end. Dragging previews that moment; releasing saves `shareEdit.protocolEndMs`.
  - **Reset** removes the override.
- **Toggles** are saved per user in `UserSettings.shareHud`.
  - **Intro** is disabled, with a hint, when there is no PB.
  - **⇄** flips the graph direction, reusing the existing per-video edit.
- **Primary button states:**
  - Create reel;
  - Rendering… (spinner, "usually under a minute — you can close this");
  - Share to Instagram;
  - Try again (after a failure).

  When the reel is ready and the sheet is open, the file is pre-fetched. The tap then shares at once, which keeps the iOS user-gesture rule.
- **Share:**
  - `navigator.share({ files, text: caption })` after copying the caption to the clipboard.
  - Fallback: a download link with the note "Caption copied".

## 6. Schema and deploy call-outs

**Schema:**
- `UserSettings.shareHud.showName | showPb | socialHook` (optional; default true);
- `DiveVideoProcessingState.socialCut` (optional);
- `DiveVideoProcessingJob` adds `generate-social-cut`;
- `DiveVideoArtifactKind` adds `social-cut`, and the profile `social-mp4-1080x1920`;
- `shareEdit.protocolEndMs` is now written by the app.

**Functions:**
- new job type;
- callable parameters;
- a new read-only signing kind;
- reaper and timeline-correction changes.

**Firestore rules:** no change; owners already update their videos.

**Storage:** a new key `overlay/social.mp4`.

**Deploy order:** Functions first, then the app. A new app on old Functions would queue a HUD download instead.

## 7. Implementation checklist

1. [x] EDL v2: wall input, long-dive turn selection, jump cuts, output↔source mapping, ticks, tests
2. [x] Canvas placement and frame SVG extras (fast-forward badge, hook), tests including safe zones
3. [x] Render key, caption, preview transport, processing helpers, tests
4. [x] Types, signing kind, service functions, settings persistence
5. [x] Worker job: encoder, request kind, lock, artefact, invalidation, reaper fix
6. [x] Local render of the audit clip (portrait and landscape): timing, length, visual check of the contact sheet
7. [x] `SocialCutSheet` and the player actions, with a phone-width visual check
8. [ ] Checks (vitest, svelte-check, functions typecheck/build, app build), docs, TODO, commits

## 8. Plan evaluation log

### Round 1 (v1 → v2)

| # | Concern in v1 | Resolution |
|---|---|---|
| 1 | v1 used raw `timeline.laps` as turns. In 25 m pools with 50 m laps, or partial final laps, that puts windows in the wrong place. | Walls come from `prepareDive().walls`. |
| 2 | A 9:16 centre crop of landscape video loses the diver. | Stacked band: 1080×608 centred on the clear band, which already avoids every HUD element. The portrait layout is reused, so there's no new geometry to maintain. |
| 3 | The spec's 200 ms cross-dissolve on jump cuts needs an `xfade` chain per cut, which makes the filter graph fragile. At 16× the footage already jumps. | Hard cuts. Revisit only if device QA shows it reads badly. |
| 4 | Decoding the whole recording wastes time (pre-dive wait, tail after the protocol). | Input seek plus `-t` span. Drop frames with `fps` before rotate and scale. |
| 5 | The `12×` badge "under the header strip" collides with the TIME label (y 308–350). | The badge goes in the header row, after `50 M POOL`, where there is 400 px of space. |
| 6 | iOS Safari may reject or stutter at playback rates of 12–16× in the preview. | A transport function picks rate-based playback and falls back to seek stepping when the rate is refused or drift persists. |
| 7 | Sharing after an async fetch loses the iOS user gesture. | Pre-fetch the ready file while the sheet is open. |
| 8 | A second request with different toggles while a job is queued would return the stale job. | The lock stores the render key. A different key creates a new job. A superseded job finishes harmlessly, because the artefact key no longer matches. |
| 9 | Name and PB toggles would also change the full HUD download's key and force regeneration. | The toggles apply to the social cut only. The full download keeps its defaults. |
| 10 | `@overdive.app` as an Instagram handle is unverified. | The caption says "Tracked with overdive.app", without a handle. |
| 11 | The worker is single-instance, so social cuts may queue behind upload-time HUD renders. | Accepted. The UI says it can be closed, and the state persists on the video document. |

### Round 2 (v2 check)

- **Spec coverage:**

  | Spec item | v2 coverage |
  |---|---|
  | §4.2.1 rules | Covered |
  | Hook | Covered |
  | Badge | Covered |
  | Card after the protocol | Covered |
  | 30–45 s target | Covered |
  | Draggable protocol end | Covered |
  | Toggles | Covered |
  | Flip | Covered |
  | Caption | Covered |
  | Share to Instagram | Covered |
  | Three downloads | Covered |
  | Cross-dissolve | Deviation (row 3) |

- **Readability risk:** at 1×, a split toast is readable for only 1.5 s after the wall.
  - Accepted for now, because it matches the spec's ±1.5 s windows.
  - Listed for device QA.
- **Cost and speed:** on demand only, with the decode span cut. No infrastructure change.
- **No open decision gates.** v2 approved for implementation.
