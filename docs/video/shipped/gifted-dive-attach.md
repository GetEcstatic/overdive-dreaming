# Gifted Dive — Attach to Routine Plan

Closing the gap where a coach gifts a dive video to an athlete and the athlete
has nowhere to put it.

## 1. The gap (confirmed)

When a coach gifts a video today, the athlete's "Accept & view" handler lands
on `/session/{sessionId}` but no `RoutineLog` is ever created. The video lives
in `diveVideos/{videoId}` with `routineLogId === undefined`, so it is invisible
to:

- the athlete's activity feed,
- analytics,
- the session detail page (which queries by `routineLogId`).

The Firestore rule on `diveVideos/{videoId}` lets the athlete change *only*
`giftStatus` + `updatedAt`. So a gift can be accepted but never anchored to a
routine without server-side help. That constraint shapes the proposal below.

Reference: see `src/lib/components/PendingGifts.svelte`,
`src/lib/services/diveVideos.ts` (`updateDiveVideoGiftStatus`,
`reassignDiveVideoSession`), and `firestore.rules` (`match /diveVideos/{videoId}`).

## 2. Key insight — the video already carries everything we need

A `DiveVideo` document already includes:

- **`discipline`** — DYN / DYNB / DNF
- **`poolLength`**
- **`recordedAt`** — usable as the log date
- **`durationSeconds`** — total dive time
- **`timeline`** (`DiveTimeline`) — laps, walls, splits, samples. This is the
  exact data that drives the overlay HUD on playback. It's also the same data
  the coach would normally save into a `RoutineLog` (totalTime, totalDistance,
  per-lap splits).

In other words: the gift already contains a complete-enough log. The athlete
should not have to type *anything* to attach it. We can synthesise a routine
log from the `DiveVideo` server-side and let the athlete edit later if they
want to add subjective fields (routine, RPE, notes, breathing technique).

This removes the entire pre-accept "Save to my training" sheet from earlier
drafts of this plan.

## 3. Design principles

1. **Watch first, log second.** A gift is, emotionally, "your coach made you a
   video". The first interaction should be playing the clip, not filling a
   form.
2. **Zero required input on accept.** The video has everything the athlete
   needs to see the dive plotted in their training. The athlete edits later if
   they care to add subjective fields.
3. **Reversible.** Accepting creates a routine log the athlete can fully edit
   (or delete) afterwards.
4. **Reuse existing components.** `DiveVideoPlayer`, `RoutineSelector`,
   `QuickLogForm` already exist — the new flow just sequences them.

## 4. Proposed UX

### Surface 1 — Dashboard `PendingGifts` card (existing, lightly upgraded)

Same card. Primary action label changes from "Accept & view" to **Open gift**.
The button routes to a new page (Surface 2) instead of the broken
`/session/{sessionId}`.

### Surface 2 — Gift review page (new)

Route: `/gift/[videoId]/+page.svelte`

```
┌──────────────────────────────────────┐
│  ← back                              │
│                                      │
│       [ DiveVideoPlayer ]            │
│       (auto-plays, with HUD overlay) │
│                                      │
│  Gifted by Coach Pat · today         │
│  DYN · 50m pool · 1:42 · 75m         │
│                                      │
│  [ Save to my training ]   ← primary │
│  [ Decline gift ]          ← muted   │
└──────────────────────────────────────┘
```

The video plays with the same HUD overlay the coach saw at recording (driven
by `DiveVideo.timeline`). Two actions:

- **Save to my training** — atomic accept + create-log + attach. No sheet, no
  form. Routes the athlete to the new routine log detail page.
- **Decline gift** — unchanged from today.

If the athlete leaves the page without choosing, the gift stays `pending` in
the inbox.

### Surface 3 — New routine log detail page (post-accept landing)

This page already exists; the gifted video is now its hero clip. We add a
single, dismissable banner at the top:

```
🎁 Gifted by Coach Pat. We filled in what we know — tap any field to edit.
```

Editable fields use the standard `QuickLogForm` (routine, RPE, joy scale,
notes, breathing technique, hours since last meal — anything the athlete cares
to add). The objective fields (totalTime, totalDistance, laps) are pre-filled
from the timeline and can also be edited if the athlete disagrees with the
auto-extraction.

## 5. What "Save to my training" actually does

Two-step, server-side. The athlete only sees one button.

**Step 1 — Client calls callable Cloud Function `acceptDiveGift({ videoId })`.**

The function:

1. Asserts `auth.uid === diveVideo.athleteId` and
   `diveVideo.giftStatus === 'pending'`.
2. Synthesises a `RoutineLog` from the `DiveVideo`:
   - `userId = athleteUid`
   - `routineId = defaultRoutineForDiscipline(discipline)` — see §6
   - `disciplineUsed = diveVideo.discipline`
   - `date = diveVideo.recordedAt`
   - `sessionGroup = sessionGroupForDate(diveVideo.recordedAt)`
   - `poolLength = diveVideo.poolLength`
   - `totalTime = diveVideo.timeline.diveEndMs / 1000`
   - `totalDistance = diveVideo.timeline.totalDistanceM` (computed from walls)
   - `laps = projectTimelineToLaps(diveVideo.timeline)` — reuse the same
     reducer-output → routine-log-laps projection that the existing recorder
     uses today
   - `notes = "Gifted by ${coachDisplayName}"`
3. Writes the `RoutineLog` and updates the `DiveVideo`:
   `routineLogId = newId`, `giftStatus = 'accepted'`, `updatedAt = now()` —
   atomically via a Firestore batch / transaction.
4. Returns `{ routineLogId }`.

**Step 2 — Client navigates to `/log/[routineLogId]` (or wherever the routine
log detail page lives).**

This keeps the existing rule intact (athletes still can't directly write
`routineLogId`) and gives us one atomic server-side step that future rule
audits won't have to reason about.

**Decline path:** unchanged — calls existing
`updateDiveVideoGiftStatus(videoId, 'declined')` directly from the client. No
Cloud Function needed.

**Idempotency:** the Cloud Function should be idempotent — if `giftStatus` is
already `accepted` and the `DiveVideo` already has a `routineLogId`, return
that existing id. Protects against double-tap and back-button retries.

## 6. Default routine selection

`RoutineLog` requires a `routineId`. Two viable strategies:

**Option A (recommended): discipline-matched system default.**

- `DYN` → `system-dynamic-max`
- `DYNB` → `system-dynamic-max` (same template; bifin variant captured via
  `disciplineUsed`)
- `DNF` → `system-dynamic-max`
- `STA` → `system-static-max`

These four "max attempt" routines already exist (per `claude.md`, "Default
Routines"). They impose no required tracking fields beyond what we synthesise.
The athlete can change `routineId` afterwards via the routine log edit form.

**Option B: introduce a new `system-quick-capture` routine.**

A no-discipline, no-tracking placeholder. More explicit, but adds a new system
record and a UX edge case ("why is my gifted dive on a routine called Quick
Capture?").

**Going with A.** Lower friction; the gifted dive looks like a normal
"max attempt" entry in the feed, which is its most likely interpretation.

## 7. Implementation phases

| Phase | Scope | Notes |
| --- | --- | --- |
| 0 | Type + service plumbing | Add `acceptDiveGift` callable in `functions/src/`. Implement the timeline → laps projection (reuse the recorder's existing helper if available; otherwise factor it out into `src/lib/capture/timelineProjection.ts` as a pure function and import in both client and Cloud Function). Export client-side wrapper in `src/lib/services/diveVideos.ts`. |
| 1 | Gift review page `/gift/[videoId]` | Loads `DiveVideo`, renders `DiveVideoPlayer`, two CTAs. Update `PendingGifts.handleAccept` to route here instead of `/session/...`. |
| 2 | Atomic accept | Wire the **Save to my training** button to the `acceptDiveGift` callable, then `goto('/log/' + routineLogId)`. Add the dismissable "Gifted by …" banner on the routine log detail page. |
| 3 | QA + analytics | Update `docs/dynamic-video-qa-checklist.md` items 59–60. Verify retention counts (gifts pinned by athlete count toward athlete's cap per existing plan). Smoke-test the timeline projection against a real coach-recorded clip. |

Each phase is independently shippable. Phases 1 + 2 unblock the user-reported
bug; phase 3 is polish.

## 8. Edge cases worth calling out

- **Gifter deletes the video before accept.** Show the gift card with "This
  video was removed" and a single Dismiss button.
- **Athlete already declined and the coach re-gifts** (resending same
  `videoId`): not currently supported — declines are terminal. Coach can
  record a fresh clip.
- **Athlete accepts on web while offline.** Cloud Function call fails; show a
  toast "Couldn't attach right now — try again from your inbox". Gift stays
  `pending`.
- **Timeline incomplete** (coach stopped recording before tapping the final
  wall, etc.). The projection should fall back gracefully: `totalTime` from
  `durationSeconds`, `totalDistance` from completed-walls × `poolLength`,
  laps array containing only what was tapped. Mark `hasDetailedData = false`
  on the resulting `RoutineLog`.

## 9. Explicitly not doing (yet)

- A standalone "gift inbox" page. The dashboard card is enough until volume
  grows.
- Push notifications. Out of scope.
- Letting the gifter pre-attach a routine. They specifically don't want to
  fill in the log; forcing routine choice on them re-creates the friction.
- Rule loosening to allow the athlete to write `routineLogId` directly.
  Cloud Function is a cleaner contract.
- A pre-accept save-sheet with routine + form fields. Replaced by the
  zero-input atomic accept above.

## 10. Acceptance criteria

- [ ] An athlete who receives a gift can open the video, tap one button, and
      land on a routine log detail page with the clip and HUD overlay
      attached.
- [ ] The pre-filled `RoutineLog` reflects the timeline accurately
      (totalTime, totalDistance, laps).
- [ ] The athlete can edit any field (routine, RPE, notes, …) afterwards
      without restriction.
- [ ] The gifter sees no behaviour change on their side.
- [ ] Decline is unchanged.
- [ ] No client can write `routineLogId` directly on a `DiveVideo`.
- [ ] Repeated taps on "Save to my training" don't create duplicate routine
      logs.
- [ ] `npm run check` passes.
- [ ] `docs/dynamic-video-qa-checklist.md` items 59–60 are checked off.

## 11. Decision

Proceed with phases 0–2 to close the user-reported bug. Phase 3 follows as
polish.
