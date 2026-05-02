# Immediate Video Quality Improvement Plan

## Goal

Improve the quality of the original recorded dive videos before any overlay export or re-encoding step. This plan focuses only on the current browser recording pipeline.

## Current Recording Pipeline

Today the recorder does this:

1. Requests a camera stream in `src/lib/capture/cameraStream.ts`:
   - `720p`: ideal `1280 x 720`
   - `1080p`: ideal `1920 x 1080`
   - `frameRate`: ideal/max `30`
   - rear camera preferred
2. Starts `MediaRecorder` in `src/lib/components/DiveRecorder.svelte`:
   - `720p`: `3_000_000` bits/sec
   - `1080p`: `5_000_000` bits/sec
   - chunks emitted every `2000ms`
3. Stores the compressed recorder output as a Blob, then queues/uploads that same compressed file.

Important: the browser is not storing raw full-resolution camera frames. `MediaRecorder` compresses the video while recording. If the encoder receives too few bits, the saved Blob is already degraded before upload.

## Likely Root Cause

The current bitrate is too low for pool footage.

Pool videos are hard to compress because they contain:

- moving water texture
- bubbles and shimmer
- lane lines
- camera shake or panning
- low-light sensor noise
- a diver moving across a detailed background

`3 Mbps` can technically be 720p, but it is not enough for consistently clean 720p in this environment. The encoder spends bits unevenly from second to second, so calm moments can look acceptable and high-motion/noisy moments can turn blocky.

## Immediate Implementation Strategy

### 1. Raise the default recording bitrate

Change the recorder bitrate presets in `DiveRecorder.svelte`.

Recommended starting values:

```ts
const bitrate = resolution === '1080p' ? 16_000_000 : 8_000_000;
```

Why:

- `8 Mbps` is a much more realistic baseline for clean 720p action footage.
- `16 Mbps` gives 1080p enough room without exploding file size beyond reason.
- This is the smallest, fastest change with the highest chance of visible improvement.

Expected file sizes:

- 720p at 8 Mbps: about 60 MB/minute before audio/container overhead.
- 1080p at 16 Mbps: about 120 MB/minute before audio/container overhead.

This is larger, but acceptable for a quality-first beta if upload handles it.

### 2. Add named quality presets

Replace hard-coded bitrate logic with a small data table.

```ts
type VideoQualityPreset = 'standard' | 'high' | 'max';

const VIDEO_QUALITY_PRESETS = {
  standard: {
    '720p': 5_000_000,
    '1080p': 10_000_000
  },
  high: {
    '720p': 8_000_000,
    '1080p': 16_000_000
  },
  max: {
    '720p': 12_000_000,
    '1080p': 24_000_000
  }
} as const;
```

Initial behaviour should default to `high` for all new recordings. This keeps the immediate change simple while making future tuning safer.

### 3. Persist recording quality metadata

Add the requested bitrate and actual camera settings to the saved `DiveVideo` metadata so we can inspect real recordings later.

Record:

- `requestedVideoBitrateBps`
- `actualWidthPx`
- `actualHeightPx`
- `actualFrameRate`
- `recorderMimeType`
- `recordedSizeBytes`
- `durationSeconds`
- derived `actualAverageBitrateBps = sizeBytes * 8 / durationSeconds`

Some of these fields already exist in partial form (`widthPx`, `heightPx`, `durationSeconds`, `mimeType`, `sizeBytes`). The key addition is requested bitrate plus actual average bitrate.

Why this matters:

- Browser APIs treat bitrate as a request, not a guarantee.
- The only way to know what we actually got is to compare output file size and duration.
- If a browser ignores the requested bitrate, we will see it immediately.

### 4. Show actual capture settings after recording

On the post-recording/save screen or in developer-facing metadata, show:

- resolution actually captured
- requested bitrate
- actual average bitrate
- file size
- mime/container

This does not need to be polished UI first. A compact diagnostic section is enough while tuning.

### 5. Prefer 1080p high quality for serious recording

Keep 720p available, but for now encourage or default serious dive captures to 1080p high quality if upload/storage remains acceptable.

Reason:

- Downscaled 1080p often looks better than native 720p after compression.
- It gives the encoder more detail before compression.
- It gives users more flexibility when reviewing technique.

Do not force this until device/upload performance is checked. The immediate default improvement should be higher bitrate first.

### 6. Test on real pool footage, not desk footage

Quality must be judged on representative clips:

- pool environment
- diver crossing frame
- bubbles/water shimmer
- coach holding phone by hand
- 20-60 second recordings

Record the same scene at:

1. current baseline: 720p / 3 Mbps
2. proposed high: 720p / 8 Mbps
3. proposed max: 720p / 12 Mbps
4. proposed high: 1080p / 16 Mbps

Compare:

- blockiness during movement
- lane-line detail
- diver silhouette edges
- water shimmer artifacts
- file size and upload time
- playback smoothness on phone

## Specific Code Changes

### `src/lib/components/DiveRecorder.svelte`

Replace:

```ts
const bitrate = resolution === '1080p' ? 5_000_000 : 3_000_000;
```

With a helper imported from a small quality module:

```ts
const bitrate = bitrateForResolution(resolution, 'high');
```

### `src/lib/capture/recorder.ts`

Update comments to make clear:

- bitrate is a browser encoder target
- the browser may still vary instantaneous bitrate
- the Blob is already compressed output

Optionally expose the selected `videoBitsPerSecond` on `RecorderHandle` if useful for metadata.

### `src/lib/capture/videoQuality.ts` (new)

Create a small pure module:

```ts
export type VideoQualityPreset = 'standard' | 'high' | 'max';
export function bitrateForResolution(resolution, preset): number;
export function estimateBytesPerMinute(bitsPerSecond): number;
```

Keep this plain data and pure functions.

### `src/lib/types.ts`

Extend `DiveVideo` with optional quality metadata fields. Keep them optional so existing records remain valid.

### `src/lib/services/diveVideos.ts`

Thread the new metadata into `buildDiveVideoFormData` and `createDiveVideo`.

## Acceptance Criteria

- New 720p recordings use at least `8 Mbps` requested video bitrate by default.
- New 1080p recordings use at least `16 Mbps` requested video bitrate by default.
- Saved video metadata includes requested bitrate and enough data to calculate actual average bitrate.
- Existing videos continue to play.
- Upload flow still works for larger files.
- No changes are made to the overlay-burned export pipeline in this pass.

## Risks

- Larger files may upload slower, especially on pool Wi-Fi or mobile data.
- Some mobile browsers may ignore or clamp high bitrate requests.
- Higher bitrate may increase battery drain and heat during long recording sessions.
- Safari and Chrome may choose different codecs and compression behaviour.

## Rollout Plan

1. Implement the `high` preset as the default.
2. Add metadata capture for requested and actual average bitrate.
3. Record real pool comparison clips.
4. If 720p high is still poor, switch the default recording setup to 1080p high.
5. If browser `MediaRecorder` remains unacceptable even at high bitrates, plan a second track: native capture or server-side ingest/transcode. That is not part of the immediate fix.
