# Server-Side Dive Recording Pipeline Plan

> Date: 2026-05-04
> Scope: planning plus Phase 0 contract scaffolding. Full media-worker implementation is still pending.

## 1. Vision

Dive recording should feel like a modern social media app: tap to capture, save immediately, keep browsing, see a playable result quickly, and get polished overlay exports without waiting on the phone to grind through video processing. The user should not need to understand upload retries, large-file limits, browser share permissions, or whether the source was MP4 or WebM.

The target experience is:

- **Save feels instant:** after recording, the app persists the capture locally, creates the server-side media record, and leaves the user with a clear processing state rather than a spinner that blocks the session.
- **Playback appears quickly:** the clean master or a lightweight preview is available first; thumbnails and metadata arrive next; polished overlay variants follow asynchronously.
- **Exports are reliable:** overlay-burned files are generated server-side with FFmpeg-class tooling, preserving audio and frame pacing without relying on mobile browser canvas or Web Share timing.
- **One media backend for web and native:** future iOS/Android apps should call the same media APIs, upload to the same object store, receive the same processing statuses, and consume the same playback/export artifacts.

## 2. Current Implementation Summary

### Capture and save path

- `src/lib/components/DiveRecorder.svelte` owns browser camera preview, `MediaRecorder`, wake lock, tap timeline, and capture state.
- `src/routes/(app)/dive/record/[id]/+page.svelte` collects setup options, receives the captured `Blob`, builds `DiveVideo` metadata, enqueues the upload, and drains the upload queue.
- `src/lib/capture/uploadQueue.ts` stores the raw video blob plus metadata in IndexedDB so pool-deck network failure does not lose the recording.
- `src/lib/capture/uploadProcessor.ts` creates/reuses a `diveVideos` Firestore doc, performs Wasabi multipart upload, updates progress/status, then clears the local queue entry.

### Storage and signing

- `functions/src/mediaSigning.ts` verifies Firebase auth and Firestore access, creates Wasabi upload sessions, signs multipart parts, completes/aborts multipart uploads, and signs read/delete URLs.
- `functions/src/wasabiClient.ts` wraps the S3-compatible Wasabi client.
- `src/lib/media/client.ts` is the browser client for those callable functions.
- `src/lib/services/diveVideos.ts` is the app-level service for creating, listing, downloading, deleting, gifting, and reaping `DiveVideo` records.

### Playback and export

- `src/lib/components/DiveVideoPlayer.svelte` plays the clean video with a DOM HUD overlay driven by the stored `DiveTimeline`.
- Recent dashboard download work moved original downloads to signed attachment URLs and kept client-side overlay baking only for smaller clips.
- `docs/video/shipped/overlay-export-audio-photos.md` and `docs/video/shipped/dashboard-download.md` document why browser-side baking and Web Share are fragile for large files.

### Existing server-side pieces

- `functions/src/retentionReaper.ts` does backend retention cleanup.
- `functions/src/acceptDiveGift.ts` atomically accepts gifted videos and synthesizes routine logs from timeline metadata.
- There is no server-side transcode, overlay rendering, HLS/proxy generation, or asynchronous media job state machine yet.

## 3. Core Product Requirements

- Fast save from the pool deck, even with 500 MB+ recordings.
- Reliable upload resume/retry on weak mobile networks.
- Immediate in-app playback path as soon as any usable artifact exists.
- Server-rendered overlay exports for sharing/downloading, with audio preserved.
- Low-latency retrieval for feed playback, session detail, gift review, and future social surfaces.
- Clear processing states: queued, uploading, processing, ready, failed, retryable.
- Private media by default, with explicit signed access controlled by Firestore ownership/visibility/gifting rules.
- Architecture usable by web today and native apps later.

## 4. Proposed Architecture

### 4.1 Keep capture on-device, move processing server-side

Camera capture cannot be server-side in a web app or native app; the device owns the camera, microphone, live preview, and tap timeline. The server should own everything after the master capture exists:

1. Upload session creation.
2. Multipart upload coordination.
3. Media validation/probing.
4. Thumbnail/poster generation.
5. Playback proxy/transcode generation.
6. Overlay-burned export generation.
7. Download URL signing.
8. Retention and cleanup.
9. Job retry/failure reporting.

### 4.2 Introduce explicit media jobs

Add a server-owned job model, separate from the `diveVideos` user-facing record:

```ts
type MediaJobType =
  | 'probe-master'
  | 'generate-thumbnail'
  | 'generate-playback-proxy'
  | 'generate-overlay-preview'
  | 'generate-overlay-download'
  | 'cleanup-orphaned-artifacts';

type MediaJobStatus = 'queued' | 'processing' | 'ready' | 'failed' | 'retryable';

interface DiveVideoProcessingState {
  master: MediaJobStatus;
  thumbnail: MediaJobStatus;
  playbackProxy: MediaJobStatus;
  overlayPreview: MediaJobStatus;
  overlayDownload: MediaJobStatus;
  lastError?: string;
  updatedAt: timestamp;
}
```

The app should render from `DiveVideoProcessingState`, not infer readiness from scattered object paths.

### 4.3 Artifact model

Keep the clean master as the source of truth and generate derivatives as replaceable artifacts:

- `master`: original browser/native recording, never mutated.
- `thumbnail`: small JPEG/WebP poster for feed and lists.
- `playbackProxy`: fast-start MP4 or HLS rendition sized for mobile feed playback.
- `overlayPreview`: lower-bitrate overlay-burned rendition for in-app preview where DOM overlay is not enough.
- `overlayDownload`: high-quality overlay-burned MP4 for saving/sharing.
- `manifest`: optional JSON describing variants, dimensions, durations, codecs, and byte sizes.

Store these under stable keys such as:

```text
users/{ownerId}/videos/{videoId}/master.{ext}
users/{ownerId}/videos/{videoId}/thumb.jpg
users/{ownerId}/videos/{videoId}/proxy/720p.mp4
users/{ownerId}/videos/{videoId}/overlay/preview.mp4
users/{ownerId}/videos/{videoId}/overlay/download.mp4
users/{ownerId}/videos/{videoId}/manifest.json
```

### 4.4 Processing backend

Use Firebase callable functions only for lightweight auth, signing, and orchestration. Use a dedicated media worker for FFmpeg work:

- **Cloud Run service/job** with FFmpeg and ffprobe installed.
- Triggered by Pub/Sub, Cloud Tasks, or a Firestore job queue document.
- Reads from Wasabi using short-lived server credentials or scoped signed URLs.
- Writes derivatives back to Wasabi.
- Updates Firestore job and `DiveVideo` processing state.

Why Cloud Run rather than Cloud Functions:

- FFmpeg binary and dependency control.
- Longer CPU/memory limits.
- Predictable concurrency and container warmup behavior.
- Easier future migration to another backend or a native-app-era API service.

### 4.5 API boundary for future native apps

Design media operations as product APIs, not web implementation details:

- `POST /media/dive-videos` or callable equivalent: create video record and upload session.
- `POST /media/dive-videos/{id}/parts/sign`: sign upload parts.
- `POST /media/dive-videos/{id}/complete`: complete upload and enqueue processing.
- `GET /media/dive-videos/{id}`: return metadata, artifacts, and processing status.
- `POST /media/dive-videos/{id}/exports/overlay`: request or retry overlay export.
- `GET /media/dive-videos/{id}/download/{variant}`: signed attachment URL.

The web app can keep using Firebase callables initially, but the internal contracts should map cleanly to REST/gRPC endpoints so native apps are not coupled to SvelteKit or browser-specific upload code.

## 5. UX Strategy

### Save flow

1. User stops recording.
2. App writes the master blob to local durable storage immediately.
3. App creates/updates the remote `DiveVideo` doc and starts multipart upload.
4. User sees `Saved locally - uploading` with progress and can leave the screen.
5. When upload completes, server jobs start automatically.

### Playback flow

- If the local blob is still available, allow instant local preview after recording.
- If upload is complete but processing is not, play the master with DOM overlay.
- When proxy/overlay derivatives are ready, swap to the best artifact for the context:
  - dashboard feed: thumbnail + short proxy
  - session detail: master/proxy with DOM overlay, then overlay preview if preferred
  - download/share: overlay download artifact or original master attachment

### Waiting states

Use social-app expectations:

- thumbnail appears first;
- upload progress is explicit but non-blocking;
- processing states are visible but calm;
- failed jobs show `Retry export` without implying the recording is lost;
- downloads prefer already-rendered artifacts and only enqueue work if missing.

## 6. Implementation Phases

### Phase 0 - Measurements and contracts

- [x] Define target latency budgets: thumbnail/proxy target 1-5s after upload; overlay export target 30-60s where practical.
- [x] Add processing-state fields to `DiveVideo` without changing current capture.
- [x] Add media artifact types/profiles to `types.ts`.
- [x] Add initial processing-state helpers and tests in `src/lib/media/processing.ts`.
- [x] Mark uploaded masters as canonical non-disposable artifacts after Wasabi upload completes.
- [x] Queue lightweight server jobs in data only: probe, thumbnail, playback proxy.
- [ ] ⚠️ Essential: add full UI handling for `processingState` so feed/session pages can show thumbnail/proxy/export readiness and retryable failures. Current UI opportunistically uses thumbnails/proxies when present, but does not yet expose all processing readiness/error states.
- [x] Add signed URL helpers for future artifact variants beyond the clean master. Implemented for thumbnails and playback proxies through `getMediaReadUrl` / `getWasabiReadUrl`.
- [x] Keep the current direct original download as the reliable baseline.

### Phase 1 - Server thumbnail and probe

- [x] Register/enable the required backend services for the selected first worker path. Firebase Functions v2 worker deployment is confirmed.
- [x] Add a media worker with ffprobe/ffmpeg. Implemented as Firebase Functions v2 `processMediaJob` rather than Cloud Run because the Functions v2 experiment worked.
- [x] Add a queue trigger for automatic processing after upload completion. Implemented as `onMediaProcessingJobCreated`; it runs implemented probe/thumbnail jobs automatically and leaves `generate-playback-proxy` queued until Phase 2 implements proxy generation.
- [x] Run `probe-master` and `generate-thumbnail` jobs from queued `DiveVideo.processingState.pendingJobs`. Verified against real Wasabi video `QoGe8CGB28NtfHOwXdbh`.
- [x] Store the complete probe contract: codec, duration, frame rate, dimensions, rotation metadata, and thumbnail artifact. Probe now stores `probeVideoCodec`, `probeAudioCodec`, `probeRotationDeg`, `probeFormatName`, dimensions, duration, frame rate, and thumbnail object metadata.
- [ ] ⚠️ Essential: surface thumbnail/probe status in the dashboard and session detail. Thumbnail images are resolved when present, but probe/thumbnail processing state is not yet shown as a first-class status.

### Phase 2 - Playback proxy

- [x] ⚠️ Essential: generate mobile-friendly fast-start MP4 proxy artifacts first. `generate-playback-proxy` is implemented in the Firebase Functions v2 media worker, writes `users/{ownerId}/videos/{videoId}/proxy/720p.mp4`, stores the artifact metadata, and marks `processingState.playbackProxy` ready.
- [x] Preserve the artifact model so HLS can be added later without changing `DiveVideo` ownership or upload flow.
- [x] Add signed URL helper for proxy artifacts.
- [x] Use proxy for dashboard feed playback while keeping master available for full-quality review/download. `getPreferredDiveVideoPlaybackUrl` prefers a ready proxy and falls back to the canonical master.

### Phase 3 - Server overlay exports

- [ ] ⚠️ Essential before Phase 3 completion: generate overlay-burned MP4 from master + `DiveTimeline` using FFmpeg filters or rendered overlay frames.
- [ ] ⚠️ Essential before Phase 3 completion: preserve source audio.
- [ ] Produce 720p and 1080p exports for both portrait and landscape presentation.
- [x] Version overlay styles so old videos can be re-exported consistently. New videos store `overlayStyleVersion` from `SERVER_OVERLAY_STYLE_VERSION`.
- [ ] Treat overlay download artifacts as disposable/rebuildable with temporary retention.
- [ ] Add `Request overlay export` / `Retry export` semantics in the UI.
- [ ] Remove or demote client-side canvas baking once server overlay is reliable.

### Phase 4 - Queue hardening and observability

- [ ] ⚠️ Essential before production-scale processing: add job retry limits, dead-letter state, and admin diagnostics. Current worker marks failures `retryable`, but does not yet enforce retry limits or dead-lettering.
- [ ] Add upload and processing event logs per video.
- [ ] Add orphan cleanup for incomplete multipart uploads, local pending records, and stale derivative artifacts.
- [ ] Add temporary-retention cleanup for disposable overlay downloads.
- [ ] Record metrics: upload duration, queue time, worker time, failure type, artifact sizes.

### Phase 5 - Native-app readiness

- [ ] Move media orchestration behind versioned API contracts.
- [ ] Support native background upload APIs while preserving the same server upload-session model.
- [ ] Allow native clients to upload masters captured by AVFoundation/CameraX and still receive the same server derivatives.
- [ ] Keep Firestore/Firebase Auth usable for the web app while avoiding assumptions that only a browser client exists.

## 7. Technical Notes

- Keep `DiveTimeline` as plain data and overlay rendering as pure transformation where possible: timeline + style preset + output dimensions -> overlay instructions/artifact.
- Do not make generated overlays the source of truth. The master and timeline remain canonical.
- Keep Wasabi private. All reads/downloads should be signed, scoped, and short-lived.
- Consider CDN only after access patterns justify it; if added, use signed URLs/cookies and preserve private-media guarantees.
- Keep browser IndexedDB queue until native background upload exists; it remains important for PWA reliability.
- Server-side processing must be idempotent. Re-running a job should either replace the same artifact key or write a versioned artifact and atomically update metadata.

## 8. Decisions From Review

These decisions come from the answered questions and should guide the first implementation pass.

1. **Latency targets:** thumbnail and playback proxy should aim for 1-5 seconds after upload completion. Overlay export should be ready, or at least downloading, within 30-60 seconds where practical. Processing should mostly happen behind the scenes.
2. **In-app viewing:** keep DOM overlay for in-app playback. Do not burn overlays just to watch a video inside Overdive.
3. **Playback format:** start with fast-start MP4 proxies for the simplest high-performance path. Keep the artifact model open to HLS later if adaptive streaming becomes worthwhile.
4. **Export quality:** support 720p and 1080p in both portrait and landscape. Original resolution may be offered later if it saves time or preserves quality for specific recordings.
5. **Overlay versions:** version overlay styles so old videos can be re-exported consistently.
6. **Derivative retention:** generated overlay downloads are disposable/rebuildable. Use temporary retention for recently requested exports rather than storing every burned export forever.
7. **Cost posture:** prioritize low cost while the app is not revenue-generating. Avoid automatic generation of expensive artifacts that the user may never need.
8. **Automatic processing:** start lightweight processing immediately after upload. Generate probe metadata, thumbnail, and playback proxy automatically; generate high-quality overlay downloads on demand unless usage shows they should be eager.
9. **Gift ownership:** once gifted, the video and overlay/timeline data should become exclusively the athlete's. Export requests after acceptance should run under the athlete-owned copy.
10. **Auth future:** keep Firebase Auth for now but avoid baking it into media-worker internals. The media API should be adaptable to another auth/token layer later.

## 9. Services Needed Before Full Implementation

The in-repo contracts can be implemented now, but real server-side FFmpeg processing needs new infrastructure:

- **Cloud Run media worker:** container with `ffmpeg` and `ffprobe` installed.
- **Queue trigger:** Pub/Sub or Cloud Tasks. Pub/Sub is likely enough for automatic asynchronous jobs; Cloud Tasks is better if we need per-job scheduling, rate limits, and precise retry control.
- **Service account access:** worker needs scoped access to Firestore plus Wasabi credentials or a secure way to obtain signed read/write URLs.

Until those services are registered, the app can safely prepare the data model, status fields, artifact paths, and UI behavior without invoking actual transcodes.

## 10. Economical Backend Alternatives

The cheapest design is the one that avoids processing videos the user never watches or exports. Keep the clean master + DOM overlay as the default in-app experience, then add server artifacts only where they materially improve speed or reliability.

| Option | How it works | Extra services | Cost profile | Strengths | Weaknesses | Fit for Overdive |
|---|---|---:|---|---|---|---|
| **No server transcode yet** | Keep current clean-master playback, DOM overlay in-app, direct signed original downloads. Only add processing state/UI. | None | Lowest possible | Zero new infrastructure; safest while usage is tiny; no accidental processing bills | No thumbnails/proxies/overlay exports; large overlay downloads still need another path | Good short pause option, but does not meet the full server-side export goal |
| **Firebase Functions v2 + Firestore job docs** | Upload completion writes queued jobs to Firestore; a callable/HTTPS/background function claims jobs and runs small `ffprobe`/thumbnail work. | None beyond existing Firebase Functions, if v2 is already enabled | Very low at small volume; pay per invocation/CPU | Minimal operational change; keeps auth/admin access simple; Firestore job docs already match the Phase 0 contract | FFmpeg packaging, memory, timeout, and cold-start limits may bite for 1080p transcodes or overlay burns | Best first economical experiment for probe + thumbnail; maybe 720p proxy if testing proves stable |
| **Cloud Run + Firestore job docs** | Cloud Run worker claims queued Firestore jobs directly; invoked by an existing callable/function or manually while testing. No Pub/Sub/Tasks initially. | Cloud Run only | Low to moderate; scales to zero if configured that way | FFmpeg-friendly container; avoids queue-service setup/cost; easier than full queue architecture | Need careful job claiming/idempotency; invocation/retry logic is homemade until a queue is added | Strong recommended compromise if Functions cannot handle FFmpeg comfortably |
| **Cloud Run + Pub/Sub** | Upload completion publishes a message; Cloud Run subscriber/handler processes it. | Cloud Run + Pub/Sub | Low; Pub/Sub itself is usually cheap, processing dominates cost | Standard async pattern; simple fanout; good for automatic thumbnail/proxy jobs | Less precise retry/rate-limit control than Cloud Tasks; still another service to enable | Good default once automatic processing is proven worth it |
| **Cloud Run + Cloud Tasks** | Upload/export request creates a task; Cloud Run processes with explicit retry/rate limits. | Cloud Run + Cloud Tasks | Low to moderate; processing dominates cost | Best control over retries, backoff, rate limiting, and delayed disposable-export cleanup | More setup than Pub/Sub; probably overkill for the first thumbnail worker | Best later for overlay exports and cleanup jobs, not necessary on day one |
| **Scheduled batch worker** | A scheduled Function/Cloud Run job scans Firestore every few minutes and processes queued jobs. | Cloud Scheduler + Function or Cloud Run | Low and predictable if schedule is sparse | Very simple; avoids per-upload queue plumbing; can batch work | Not instant; misses the 1-5s thumbnail/proxy target unless scheduled very frequently | Good for cleanup and retry sweeps, poor for responsive feed media |
| **Small fixed VPS worker** | A cheap server polls Firestore/Wasabi for jobs and runs FFmpeg locally. | VPS provider | Fixed monthly cost, often cheap at steady usage | Predictable bill; full FFmpeg control; no Cloud Run cold starts | More ops burden, patching, secrets, monitoring; does not scale to zero | Possible if Cloud Run costs become annoying, but not ideal while the app is early |
| **Managed video platform** | Use Mux/Cloudinary/Transloadit/etc. for transcode, thumbnails, streaming, and downloads. | Third-party video service | Usually highest, but saves engineering time | Excellent reliability and media features | Vendor lock-in; private media/auth integration complexity; likely not cheapest | Keep as fallback if custom FFmpeg becomes a maintenance drag |
| **Client-side only overlay baking** | Continue browser canvas/Web Share export for all overlays. | None | No server bill | No backend complexity | Already failed for 500 MB+ files; slow, fragile, and browser-limited | Not recommended except as a temporary small-file fallback |

### Cost-first recommendation

Start with **Firebase Functions v2 + Firestore job docs** for the smallest useful server-side step: probe + thumbnail. If FFmpeg packaging or runtime is painful, move the exact same Firestore job contract to **Cloud Run + Firestore job docs** before adding Pub/Sub or Cloud Tasks. Add Pub/Sub only when automatic processing volume justifies standard queue plumbing; add Cloud Tasks when overlay exports need explicit retry, rate limiting, or delayed deletion.

For economy, keep these defaults:

- Generate automatically: probe metadata, thumbnail, and eventually one 720p fast-start MP4 proxy.
- Generate on demand: 1080p proxy, overlay downloads, and any original-resolution exports.
- Retain temporarily: disposable overlay downloads.
- Retain while video exists: master, timeline, thumbnail, and the current preferred playback proxy.

## 11. Recommended Next Step

Phase 0 has started in the current codebase: shared media-processing types, artifact/profile definitions, default processing state, and uploaded-master artifact records are now in place. Next, add UI awareness for `processingState`, then build the smallest selected worker path that probes uploaded masters and generates thumbnails. Start with Firebase Functions v2 + Firestore job docs if it can run the required FFmpeg/ffprobe work; move to Cloud Run + Firestore job docs only if a container is needed. That gives immediate UX value, proves the job contract, and creates the foundation for playback proxies and overlay exports without touching the recorder capture path.

## 12. Completed So Far

- [x] Reviewed the existing capture, upload, playback, download, Wasabi, and Cloud Functions signing flow.
- [x] Captured the product vision for Instagram/Facebook-like media responsiveness.
- [x] Recorded decisions from the answered questions.
- [x] Identified required new services before full FFmpeg processing can ship.
- [x] Added `DiveVideoProcessingState`, media job, artifact kind, and artifact profile types.
- [x] Added pure media-processing helper functions and tests.
- [x] Added a default overlay style version for future re-export consistency.
- [x] New `DiveVideo` records now start with processing state.
- [x] Completed uploads now mark the clean master as ready and queue lightweight server jobs in Firestore data.
- [x] Multipart upload completion now creates deterministic `mediaProcessingJobs` docs for probe, thumbnail, and playback-proxy work.
- [x] Added a Functions v2 `processMediaJob` worker for probe and thumbnail jobs.
- [x] Added server-side job claiming/idempotency for worker invocations.
- [x] Added signed read support for generated thumbnail and playback-proxy artifacts.
- [x] Dashboard/session playback now prefers ready playback proxies and uses generated thumbnails as posters when available.

## 13. Required Next

- [x] Choose the economical first worker path: Firebase Functions v2 + Firestore jobs.
- [x] Register only the service required for that first path: existing Functions v2 setup.
- [x] Add a minimal media worker that can read a master video, run `ffprobe`, write probe metadata, and generate a thumbnail.
- [x] Add server-side deterministic job creation so repeat upload completion does not duplicate queued job documents.
- [x] Add server-side job claiming/idempotency so repeat worker invocations do not duplicate artifacts or corrupt state.
- [x] Add signed artifact reads for thumbnail and playback proxy variants.
- [x] Update dashboard/session UI to prefer thumbnail/proxy artifacts when ready and fall back cleanly to current master playback.
- [ ] Deploy Functions v2 worker and live-test `processMediaJob` against a real uploaded Wasabi video.
- [ ] Add 720p playback-proxy generation after probe/thumbnail worker is proven in production or emulator-equivalent testing.
- [ ] Add server-side overlay export request flow after thumbnail/proxy is proven.

## 14. Things For Tom To Do

1. Confirm whether Firebase Functions v2 is already enabled for the Overdive Firebase project. *It looks like this is already setup*
2. If Functions v2 is enabled, choose whether the first experiment should use Functions v2 + Firestore job docs. Suggested answer: yes, try this first for probe + thumbnail because it is the smallest infrastructure change. *Yes*
3. If Functions v2 cannot package/run FFmpeg reliably, confirm whether Cloud Run is available for the same Google Cloud project. *Let's cross this bridge if required*
4. Enable Cloud Run only if the Functions v2 experiment is not viable or if we decide to go straight to a container worker. *Confirm*
5. Do not enable Pub/Sub or Cloud Tasks yet unless we decide Firestore job docs are not enough for the first worker. *Confirm*
6. Confirm whether a small monthly processing budget is acceptable for early testing. Suggested starting guardrail: low single-digit monthly spend while measuring real FFmpeg cost per minute. *Confirm, yes acceptable*
7. Decide how long disposable overlay downloads should be retained after generation. Suggested starting point: 7 days. *Agree, 7 days*
8. Confirm the automatic-processing minimum: probe, thumbnail, and later one 720p MP4 proxy. Suggested answer: yes; keep 1080p proxy and overlay exports on demand until cost is understood. *Agree*
9. Once those decisions are made, implementation can continue with the smallest selected worker path. *Yes, confirm*

## 15. Enabling Firebase Functions v2

Use this checklist to confirm the project can run a low-cost Functions v2 media experiment before enabling Cloud Run/Pub/Sub/Cloud Tasks as separate architecture pieces.

### Firebase console checks

1. Open the Firebase console for the Overdive project.
2. Go to **Build -> Functions**.
3. Confirm the project is on the **Blaze** plan. Functions v2 requires billing because it runs on Cloud Run infrastructure, even though small usage may stay very cheap.
4. If prompted, enable Cloud Functions for the project.
5. Check the region currently used by deployed functions and keep the media experiment in the same region unless there is a clear reason to move.

### Google Cloud API checks

In the linked Google Cloud project, confirm these APIs are enabled:

- Cloud Functions API
- Cloud Build API
- Artifact Registry API
- Cloud Run Admin API
- Eventarc API
- Firebase Extensions API is not required for this plan

Firebase deploys usually prompt for missing APIs, but enabling them intentionally makes the first deployment less mysterious.

### Repo readiness checks

- [x] The functions package already uses `firebase-functions` v7, which supports v2 APIs.
- [x] The functions package already targets Node 22.
- [x] Add the first v2 function using imports from `firebase-functions/v2/*`, such as `onCall` or `onRequest`.
- [x] Keep the first function small: claim one Firestore job, run probe/thumbnail work, update `DiveVideo.processingState`.
- [x] Build locally with `npm --prefix functions run build` before deploy.
- [ ] Deploy only functions with `firebase deploy --only functions` once ready.

### Cost controls for the first experiment

- Set low concurrency for FFmpeg-heavy functions if CPU pressure becomes visible.
- Keep automatic work limited to probe + thumbnail first.
- Do not generate overlay exports automatically.
- Use Firestore job docs for visibility and manual retry before adding queue services.
- Review Firebase/GCP billing after the first few real videos before enabling proxy generation.

### Decision after first test

- If Functions v2 handles probe + thumbnail reliably and cheaply, continue with the Functions v2 path for the 720p proxy experiment.
- If packaging FFmpeg, timeout, memory, or cold starts are painful, keep the same Firestore job contract and move execution to Cloud Run + Firestore job docs.
- If automatic processing volume grows, add Pub/Sub later.
- If overlay export retry/rate limiting becomes important, add Cloud Tasks later.

## 16. Current Implementation Gate

Implementation should pause here until the Functions v2 worker is deployed or run in an emulator-equivalent environment with real Wasabi secrets and a real uploaded video.

Required proof before continuing:

- [x] `processMediaJob` can claim and complete a `probe-master` job.
- [x] `processMediaJob` can claim and complete a `generate-thumbnail` job.
- [x] The generated thumbnail object is readable through the same signed read path used by the dashboard/session UI.
- [ ] Billing/runtime looks acceptable for at least a few real videos.

Once those are true, continue with 720p playback-proxy generation. Overlay export should remain after proxy generation because it is more expensive and easier to get wrong.

## 17. Tom Steps To Deploy And Test The Functions V2 Worker

These steps test the economical Functions v2 + Firestore job-doc path against real Wasabi media before building playback proxies or overlay exports.

### A. Pre-flight checks

- [x] Confirm you are logged in to Firebase CLI with the account that owns the Overdive project:
   ```bash
   firebase login
   ```
- [x] Confirm the active Firebase project is the Overdive project:
   ```bash
   firebase use
   ```
- [x] Confirm the functions package builds locally:
   ```bash
   npm --prefix functions run build
   ```
- [x] Confirm the Wasabi secrets already exist for Cloud Functions:
   ```bash
   firebase functions:secrets:access WASABI_ACCESS_KEY_ID
   firebase functions:secrets:access WASABI_SECRET_ACCESS_KEY
   ```
- [x] If either secret is missing, set it before deploy. Not needed on 2026-05-05; both secrets were present:
   ```bash
   firebase functions:secrets:set WASABI_ACCESS_KEY_ID
   firebase functions:secrets:set WASABI_SECRET_ACCESS_KEY
   ```

### B. Deploy only the worker-related functions

Deploy the media worker and multipart completion path first, rather than all functions:

```bash
firebase deploy --only functions:processMediaJob,functions:completeDiveVideoMultipartUpload
```

Status on 2026-05-05: deployed and confirmed with `firebase functions:list`.

- [x] `processMediaJob` — v2 callable, `us-central1`, Node.js 22, 1 GiB memory.
- [x] `completeDiveVideoMultipartUpload` — v2 callable, `us-central1`, Node.js 22, 256 MiB memory.

If Firebase reports that another updated function is required because of shared code or secrets, deploy the smallest listed set it asks for. Avoid deploying unrelated app hosting or Firestore rules during this test.

### C. Create a real test video

1. Open Overdive normally.
2. Record a short dynamic dive video, ideally 5-10 seconds, to keep the first FFmpeg test cheap.
3. Wait for the upload to finish.
4. In Firestore, open the new `diveVideos/{videoId}` document and confirm:
   - `uploadStatus` is `uploaded`;
   - `processingState.master` is `ready`;
   - `processingState.thumbnail` is `queued`;
   - `processingState.pendingJobs` includes `probe-master` and `generate-thumbnail`.
5. Open `mediaProcessingJobs` and find the deterministic jobs:
   - `{videoId}_probe-master`
   - `{videoId}_generate-thumbnail`

### D. Run the worker manually

Call `processMediaJob` from an authenticated Overdive app context. The function requires Firebase Auth, so a generic unauthenticated Cloud Console test call is expected to fail. For the first test, use a temporary owner-only test button or a tiny dev-only route that calls the deployed callable for the signed-in user.

Status on 2026-05-05: completed from CLI after temporarily granting the logged-in CLI account `roles/iam.serviceAccountTokenCreator` on `overdive-dreaming-fb@appspot.gserviceaccount.com`. The temporary IAM binding was removed after the test. The real uploaded test video is `QoGe8CGB28NtfHOwXdbh`, owned by `GRm9WVvOjCMpX7zqD3ZktaiSQzm2`. The worker was manually invoked for the two implemented jobs:

- `QoGe8CGB28NtfHOwXdbh_probe-master` returned `status: "ready"`.
- `QoGe8CGB28NtfHOwXdbh_generate-thumbnail` returned `status: "ready"`.
- `QoGe8CGB28NtfHOwXdbh_generate-playback-proxy` (leave queued until the probe/thumbnail gate passes)

Firebase Console / unauthenticated Cloud Functions test calls are still expected to fail for this callable because it requires Firebase Auth. The CLI path works by minting a Firebase custom token for the video owner, exchanging it for an ID token, then calling the deployed callable with `Authorization: Bearer <idToken>`.

Call it twice:

```json
{ "jobId": "VIDEO_ID_probe-master" }
```

Then:

```json
{ "jobId": "VIDEO_ID_generate-thumbnail" }
```

Expected result for each call:

- the callable returns `status: "ready"`;
- the matching `mediaProcessingJobs/{jobId}` doc changes to `status: "ready"`;
- `attempts` increments once;
- `completedAt` is set.

### E. Verify the video document and UI

Status on 2026-05-05: completed after the manual worker run:

- `diveVideos/QoGe8CGB28NtfHOwXdbh.uploadStatus` is `uploaded`;
- `processingState.master` is `ready`;
- `processingState.thumbnail` is `ready`;
- `processingState.pendingJobs` includes `probe-master`, `generate-thumbnail`, and `generate-playback-proxy`;
- probe-derived metadata is present: `widthPx = 1920`, `heightPx = 1080`, `durationSeconds ≈ 9.123`, `actualFrameRate ≈ 30.05`, `probeFormatName = mov,mp4,m4a,3gp,3g2,mj2`;
- `thumbnailObject` is set to `overdive-media-prod/users/GRm9WVvOjCMpX7zqD3ZktaiSQzm2/videos/QoGe8CGB28NtfHOwXdbh/thumb.jpg` with `contentType = image/jpeg` and `sizeBytes = 10975`;
- the signed thumbnail read path returned HTTP 200 and downloaded a valid JPEG (`ff d8 ff` magic bytes).

After the probe job:

- `diveVideos/{videoId}.processingState.master` remains `ready`;
- probe-derived metadata such as dimensions, duration, or frame rate is present/updated where available.

After the thumbnail job:

- `diveVideos/{videoId}.processingState.thumbnail` is `ready`;
- `thumbnailObject` is set with a Wasabi bucket/key;
- the Wasabi object exists at `users/{ownerId}/videos/{videoId}/thumb.jpg`;
- the dashboard/session video player shows the thumbnail poster once the page reloads.

### F. Check logs and costs

Status on 2026-05-05: deployment/startup and callable verification logs for `processMediaJob` are clean. Both manual callable requests passed auth verification. No worker errors, repeated retries, or `retryable` job states were observed. Billing/runtime still needs observation across a few real videos before enabling playback-proxy generation broadly.

1. Check function logs:
   ```bash
   firebase functions:log --only processMediaJob
   ```
2. Confirm there are no repeated retries or `retryable` job states.
3. Check Firebase/GCP billing after a few test videos.
4. If probe + thumbnail is reliable and cheap, continue to the 720p playback-proxy phase.
5. If FFmpeg binary size, timeout, memory, or cold starts are painful, stop and move the same Firestore job contract to Cloud Run.