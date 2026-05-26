# Stored Video Waypoint Reprocessing

## Purpose

All saved dynamic videos should be editable after upload. A coach or athlete should be able to open any stored video, re-mark the dive with the same precision scrub-to-mark flow used for imported videos, and save the corrected waypoint data back to the canonical `DiveVideo.timeline`.

Saving corrected waypoints must update every derived surface that relies on the timeline:

- In-app dashboard/session HUD playback.
- Burned overlay download generation.
- Timeline summaries such as distance, duration, lap count, splits, and speeds.
- Linked routine-log lap data and session-feed metrics.

The implementation should reuse the existing imported-video precision marker model and timeline projection helpers. Do not create a parallel waypoint model or a second timeline format.

## Current Building Blocks

- `src/lib/capture/precisionWaypointMarker.ts` already owns the scrub-to-mark state machine, labels, warnings, summary, and projection to `DiveTimeline`.
- `src/routes/(app)/dive/record/[id]/+page.svelte` already has the fullscreen scrub-to-mark UI for imported videos.
- `src/lib/capture/timeline.ts` is the canonical app-side HUD math for `distanceAt`, `speedAt`, `summariseTimeline`, and sub-split-aware replay.
- `functions/src/mediaWorker.ts` has matching server-side overlay math for burned downloads.
- `src/lib/capture/timelineToRoutineLog.ts` and `functions/src/lib/timelineToRoutineLog.ts` project a timeline into routine-log fields and lap data.
- `src/lib/services/diveVideos.ts` already attaches accepted/gifted videos to routine logs and stores `routineLogId` on the video.
- Server overlay downloads are versioned with `SERVER_OVERLAY_STYLE_VERSION` / `OVERLAY_STYLE_VERSION`; stale artifacts can be requeued instead of reused.

## Product Flow

### Entry Points

Add an owner-only `Edit waypoints` action wherever stored video controls already appear:

- Dashboard feed video player actions.
- Session detail video player actions.
- Future dive/video detail page, if one is introduced.

Do not expose editing on gifted/read-only playback unless the current user owns the video or has explicit write permission.

### Editor Flow

1. User taps `Edit waypoints` from a stored video.
2. App opens a fullscreen scrub-to-mark route using the saved video URL and existing `DiveVideo` metadata.
3. Existing waypoints are loaded as context, but the editing pass should default to re-marking from the start rather than dragging old points.
4. User scrubs to dive start and taps `Start dive`.
5. User marks each next expected waypoint with the existing precision marker button flow.
6. User long-presses to set dive end.
7. Review screen shows old vs new summary: distance, time, lap count, average speed, fastest/slowest segment warnings.
8. User saves corrections.
9. App updates the video timeline, linked routine log, and overlay processing state in one consistent write path.

### Editing Existing Marks

MVP should avoid a dense marker-dragging UI. Use the current scrub-to-mark model and provide these controls:

- `Restart marks` to clear the editing pass.
- `Undo last` to fix the most recent mark.
- `Cancel` to leave stored data unchanged.
- `Save corrections` only after a valid end time exists.

Later, a segment-list or lap-ruler review screen can support jump-to-marker fixes, but the first implementation should stay close to the already-built imported-video precision flow.

## Data Model And Write Semantics

### Canonical Source

`DiveVideo.timeline` remains the source of truth for video HUD playback and derived metrics.

Waypoint reprocessing should write a complete replacement timeline, not patch individual lap entries. That keeps the correction atomic and avoids partial marker state leaking into playback.

### Correction Metadata

Add a small audit trail on `DiveVideo`:

```ts
waypointCorrection?: {
  correctedAt: Timestamp;
  correctedBy: string;
  previousTimeline?: DiveTimeline;
  source: 'stored-video-scrub';
};
```

Keep `previousTimeline` optional. It is useful for a single-step rollback, but could be omitted later if document size becomes a concern for dense timelines.

### Derived Routine Log Updates

When a video has `routineLogId`, saving corrected waypoints must update the linked routine log from the new timeline projection:

- `totalDistance`
- `totalTime`
- `summary.repsCompleted`
- `summary.totalTimeSeconds`
- `summary.averageTimePerRep`
- `avgSpeedMs`
- `fastestLapSpeedMs`
- `slowestLapSpeedMs`
- `laps`
- `hasDetailedData`

Use the existing `projectTimelineToRoutineLog` helper rather than recomputing these fields in the component.

If the video is not attached to a routine log yet, only update the video timeline and processing state.

### Overlay Artifact Invalidation

Saving a corrected timeline invalidates any existing burned overlay download because the old MP4 contains old HUD pixels.

On save:

- Set `processingState.overlayDownload` to `queued` for owner videos that can be processed.
- Add `generate-overlay-download` to `processingState.pendingJobs`.
- Create a `mediaProcessingJobs` document for `generate-overlay-download`.
- Clear or supersede stale `overlay-download` artifacts by style/timeline version so downloads cannot silently reuse an old bake.
- Keep clean video, thumbnail, and playback proxy artifacts unchanged.

The app should then show the existing `Overlay processing...` state until the media worker finishes.

## Backend Boundary

Implement the save operation as a callable Cloud Function, for example `saveDiveVideoTimelineCorrection`.

The function should:

1. Require auth.
2. Load the `diveVideos/{videoId}` document.
3. Verify owner/write access.
4. Validate the incoming `DiveTimeline` shape and basic ordering.
5. Project the timeline with `projectTimelineToRoutineLog` if `routineLogId` exists.
6. In a transaction, update the video and linked routine log together.
7. Queue overlay regeneration after the transaction succeeds.

Reason for server-side save:

- The video and routine log must stay in sync.
- Owner checks are centralised.
- Overlay invalidation and job creation are not trusted to client-only code.
- The same path can support future bulk corrections or gifted-video ownership rules.

## Frontend Shape

### Route

Add a route such as:

```text
/dive/video/[videoId]/waypoints
```

This route loads the stored `DiveVideo`, resolves the preferred playback URL, and mounts the precision editor.

### Component Reuse

Extract the imported-video scrub UI from `src/routes/(app)/dive/record/[id]/+page.svelte` into a reusable component only when doing so reduces duplication. A good target shape:

```text
src/lib/components/video/PrecisionWaypointEditor.svelte
```

Inputs:

- `videoUrl`
- `durationSeconds`
- `poolLength`
- `discipline`
- `initialTimeline?`
- `mode: 'import' | 'stored-video'`

Outputs:

- `cancel`
- `save(DiveTimeline)`
- `review(DiveTimeline)`

Keep pure marking logic in `precisionWaypointMarker.ts`. The component should only own browser effects such as video seeking, playback, pointer input, and layout.

### Save UX

After saving:

- Return to the previous video surface.
- Show a short success state: `Waypoints updated`.
- If overlay regeneration was queued, show the existing processing state in the player.
- Do not block the user on burned overlay generation.

## Implementation Steps

### Phase 1 - Plan And Pure Helpers

- Confirm `projectPrecisionStateToTimeline` supports stored-video correction without changes.
- Add tests for projecting corrected first-waypoint timing into non-zero pre-first-waypoint distance/speed.
- Add a small helper to build routine-log update payloads from a `DiveTimeline` projection so client and function code do not drift.

### Phase 2 - Callable Save Function

- Add `saveDiveVideoTimelineCorrection` under `functions/src/`.
- Reuse or share the existing `timelineToRoutineLog` projection.
- Update `diveVideos/{videoId}.timeline` and linked `routineLogs/{routineLogId}` in one transaction.
- Queue a fresh overlay download job after save.
- Export the function from `functions/src/index.ts`.
- Add focused tests for validation/projection helpers where practical.

### Phase 3 - Reusable Precision Editor

- Extract only the necessary scrub-to-mark UI from the record route.
- Keep the imported-video flow working through the same component.
- Add route-level loading/error states for stored videos.
- Add owner-only `Edit waypoints` action to `DiveVideoPlayer.svelte`.

### Phase 4 - Verification

- Test a stored live-recorded video with bad first waypoint timing.
- Verify dashboard HUD changes immediately after save.
- Verify linked routine log lap times and speeds update.
- Verify burned overlay download is requeued and newly downloaded MP4 reflects corrected waypoints.
- Run focused tests:
  - `npm test -- src/lib/capture/precisionWaypointMarker.test.ts src/lib/capture/timeline.test.ts`
  - `npm --prefix functions run build`
  - `npm run check`

## Open Decisions

- Whether to retain one previous timeline for rollback or keep only correction metadata.
- Whether gifted athletes can correct a coach-owned video after accepting it.
- Whether overlay regeneration should run automatically on every correction or wait until the user next asks to download with overlay.
- Whether correction history belongs on the video document or in a subcollection if multiple edits become common.

## Acceptance Criteria

- Every owner-visible stored dynamic video has an `Edit waypoints` action.
- The editor reuses the scrub-to-mark interaction and does not introduce a second waypoint model.
- Saving corrected waypoints updates `DiveVideo.timeline` and all in-app HUD calculations.
- Linked routine logs receive updated lap time and speed data from the corrected timeline.
- Existing burned overlay downloads are not reused after a timeline correction.
- A newly generated burned overlay download reflects the corrected HUD timing, distance, and speed.