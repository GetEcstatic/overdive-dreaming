# Dashboard Video Download Plan

## Problem

Dashboard dive videos have two download paths today:

- With HUD overlay enabled, the browser replays the source video into a canvas and records a new file. On large clips, especially 500 MB and above, this is slow, memory-heavy, and can fail before metadata loads with `Failed to load source video for re-encode`.
- With HUD overlay disabled, the browser still fetches the entire source file into a Blob and then calls `navigator.share({ files })`. On mobile browsers this can fail with `Permission denied` because the user activation has expired by the time the async fetch finishes.

## Decision

Use two separate download strategies:

1. Original video download streams directly from storage using a signed URL with `Content-Disposition: attachment`. This avoids loading large videos into JS memory and avoids Web Share permission timing entirely.
2. Overlay export remains a client-side feature only for manageable clips. For large clips, do not start the bake; show a clear message and point users to the original download path.

This is the definitive browser-side fix. A true large-file overlay export should move to server-side FFmpeg later, because in-browser canvas re-encode must decode, draw, and re-encode the whole video on the user's phone.

## Implementation Notes

- Extend the Wasabi signed read URL path to accept an optional download filename and sign `ResponseContentDisposition` / `ResponseContentType` on the `GetObjectCommand`.
- Add a `getDiveVideoDirectDownloadUrl(video, fileName)` helper for clean video downloads.
- Add a `Download original` action in `DiveVideoPlayer.svelte` that clicks the signed attachment URL directly.
- Change the no-overlay `Save to Photos` path so it uses the same direct download instead of fetch + Web Share.
- Add a conservative overlay bake limit using stored `video.sizeBytes`; large videos should fail fast with a helpful message rather than trying a doomed client-side export.

## Validation

- Run diagnostics for touched files.
- Run `npm run check`.
- Commit the planning document separately from the implementation, then push final changes to `main`.