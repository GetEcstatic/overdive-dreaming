# Public review & save UX

## Status

Plan ready for implementation review (19 October 2026).

## Goal

Redesign the **Review & save** screen after a recorded dynamic dive so a public user can confidently finish and save a dive with minimal thought. The current screen exposes information and controls useful only to an admin/power-user workflow.

## Product question

What is the smallest, clearest post-recording flow that lets a public user:

1. confirm that the recorded result is right;
2. make only the corrections that matter;
3. save it; and
4. understand what happens next (including any upload/processing state)?

## Current-state audit — 19 October 2026

Source: `src/routes/(app)/dive/record/[id]/+page.svelte`, including video, metrics-only, static-only and imported-video captures. The classifications below describe the current surface, not the final design.

| Current control, field or state | Current behaviour | Disposition | Rationale / next action |
|---|---|---|---|
| **Review & save** heading | Same heading for every capture type | **Simplify** | Keep the outcome-led heading, but use a short result summary that identifies video, metrics-only and imported captures without making them separate workflows. |
| Imported-video marker summary | Shows start, end, next waypoint and waypoint rows; **Mark again** returns to marker flow | **Keep, simplify** | Corrections matter for imported video, but the summary is dense. Keep **Edit markers** near the imported preview and move detailed splits behind an expandable detail. |
| Result stats card | Shows dive time, waypoint count, distance and video size | **Keep, simplify** | Keep discipline, distance and time as the headline result. Hide file size from the public summary; retain it in diagnostics. |
| Recorded video preview | No review video is shown on this surface; video is queued for upload on save | **Keep capability, move** | A public user needs confidence that the capture exists. Add a compact preview or an explicit “Video captured” state; keep full playback/editing on the video detail route. |
| Final distance correction | Number wheel, initially captured/derived value, maximum based on captured value, reset via **Use captured** | **Keep, simplify** | This is a legitimate correction, but label it “Distance” and explain the estimate only when relevant. Keep reset; avoid exposing calculation language by default. |
| Final duration correction | Duration input, maximum based on captured duration, reset via **Use captured** | **Keep, simplify** | Same principle as distance. Keep one compact “Correct result” section rather than a large second metrics card. |
| Captured values and average speed | Secondary text under editable metrics | **Simplify** | Keep captured values as a reversible reference; show average speed only for dynamic dives and only if it helps validate the result. |
| AIDA surface-protocol elapsed time | Editable `SP elapsed`, 0–60 seconds, shown in AIDA context | **Keep, context-gate** | Keep for AIDA protocol practice/competition context. Hide for ordinary training captures and prefill from the active timer when that TODO item is implemented. |
| AIDA “Surface protocol completed” | Checkbox plus instruction to record card/verdict in Quick Log after saving | **Simplify, move** | Keep the safety/result reminder, but do not make a public save depend on a separate Quick Log concept. Move official card/verdict entry to the post-save AIDA flow. |
| Capture diagnostics | Requested/actual bitrate, frame rate, container, duration and quality warnings | **Hide/gate** | Useful for support and admin debugging, not for a normal public save. Preserve behind “Capture details” or an admin/debug capability. |
| Pin this dive | Persists `retentionTier = pinned`; currently says “keep beyond the 20-video cap” | **Hide/gate** | Retention is storage policy, not a normal review decision. Offer pinning later from video details to avoid making users understand caps. Also reconcile the copy with the current retention policy. |
| Gift this dive to… | Athlete picker changes ownership/recipient workflow and redirects the gifter to dashboard | **Hide/gate, move** | This is a coach/private workflow. Keep it available to authorised users via an explicit advanced action, not in the default public save surface. |
| Save error | Renders the raw thrown error string above the actions | **Simplify** | Keep an actionable friendly error and preserve technical details in diagnostics/logs. Say whether the dive was saved locally, queued, or needs retrying. |
| **Re-record / Re-track** | Clears the capture and returns to recording; label varies by capture source | **Keep, simplify** | Keep as a secondary discard-and-retry action. Confirm before discarding a long capture if recovery is possible; use one plain label such as “Record again” with “Track again” only for metrics-only mode. |
| **Save dive / Save metrics / Save time** | Queues video locally, creates the remote video, starts background upload, then routes to the dive log; metrics-only routes directly to a seeded log | **Keep, simplify** | One primary **Save dive** action for the public flow. Explain the next step after save and distinguish “saved” from “uploading”; source-specific labels belong in the supporting copy, not the primary action. |
| Saving state | Button says “Saving locally…” while several remote and background operations occur | **Simplify** | Use explicit stages: “Saving dive…”, then a success hand-off with upload status. Do not imply that all work is complete when the remote record or upload can still fail. |
| Post-save routine-log hand-off | Personal captures redirect to `/dives?publicPreset=dynamic-max&seed=…`; gifts redirect to dashboard | **Move / clarify** | Saving the capture and logging the dive are currently coupled. Make the saved video/result state explicit, then offer “Complete dive log” as the next step, with a safe return path if the user skips it. |

### Audit findings

1. The screen has one public result, one advanced coach workflow, one AIDA workflow, and one support/debug workflow interleaved together.
2. **Distance and duration correction are the only broadly justified edits** for the default public path. The rest should be contextual or deferred.
3. The current primary action does more than its label says: a video save creates a remote record, queues an upload, starts background processing, and then opens a seeded routine-log form.
4. There is no clear success state between “Save” and the next route. A user cannot easily tell whether the video is safely stored, still uploading, or only queued locally.
5. Imported video and live capture share the review shell, but imported captures need marker editing while live captures need upload/status reassurance. The common surface should be smaller, with source-specific sections below it.

## Proposed public journey

The public path should optimise for **save first, logging second**. A user must be able to preserve the capture without understanding routines or waiting for video processing.

### 1. Stop recording → review

The recorder hands off to a review surface with:

- a result hero: discipline, distance and time;
- a small video preview or clear “Video captured” tile for video captures;
- a compact **Correct result** section for distance and duration;
- imported-video marker editing only when the source is imported;
- AIDA surface-protocol details only in an AIDA context;
- one primary **Save dive** button and one secondary **Record again** action.

The default page should not show diagnostics, retention, gifting, routine internals or storage terminology.

### 2. Save

On **Save dive**:

1. Validate only the fields needed for a trustworthy result.
2. Persist the dive/result immediately where possible.
3. Queue the video upload without blocking on processing.
4. Show a success hand-off with the actual status: **Saved — video uploading**, **Saved — video ready**, or **Saved — upload needs attention**.
5. Offer **Complete dive log** as the next step, rather than silently redirecting into a routine form.
6. Offer **View dive** or **Done** so skipping the log is safe and intentional.

Metrics-only captures should skip upload language and say **Dive saved**. Static-only captures should say **Time saved** while using the same hand-off pattern.

### 3. Upload and processing states

| State | Public copy | Available action |
|---|---|---|
| Local save in progress | Saving your dive… | None; disable duplicate save |
| Remote record created, upload active | Dive saved · Video uploading | Continue to log / Done |
| Upload queued or offline | Dive saved · Video will upload when you’re back online | Continue to log / Retry later |
| Upload failed after save | Dive saved · Video upload needs attention | Retry upload / Continue without retrying |
| Upload and processing complete | Dive saved · Video ready | View dive / Complete dive log |
| Metrics-only saved | Dive saved | Complete dive log / Done |

The saved result must never be presented as lost merely because the video upload failed. Technical errors go to logs and an expandable support detail, not the headline message.

## Mobile information architecture

Target width: approximately 375–430 px. The first viewport should contain the result and the save action.

```text
Review & save

[ video thumbnail / Video captured ]
DYN                         75 m
                              1:12.4
Captured just now · Video uploading after save

[ Correct result                         > ]
  Distance       75 m     Duration 1:12.4
  Use captured values

[ Imported markers                         > ]  (import only)
[ Surface protocol                         > ]  (AIDA only)

[ Save dive ]
Record again

After save:
[ Saved — video uploading ]
[ Complete dive log ]  [ Done ]

More options  (advanced capability only)
```

Design rules:

- Keep the result hero and primary action visible without scrolling on a phone.
- Use disclosure rows for corrections and source-specific details; do not show every field open by default.
- Keep **Save dive** sticky or close to the bottom safe area, but never place destructive **Record again** beside it with equal visual weight.
- Use plain units and labels: “Distance”, “Duration”, “Video”, “Complete dive log”.
- Do not show “routine”, “retention tier”, “container”, “bitrate”, “remote”, or “processing job” in the default flow.

## Capability boundary

### Public users — default

Show:

- result hero and capture confirmation;
- distance and duration correction;
- imported marker editing for an imported capture;
- AIDA protocol fields only when the user entered an AIDA context;
- save, upload status, complete-log hand-off and done.

Do not show by default:

- gifting;
- pinning/retention controls;
- capture diagnostics;
- raw processing or export controls;
- routine/layer terminology;
- internal storage or queue details.

### Advanced / coach users

Expose an explicit **More options** section or separate video-detail route for:

- gift to athlete;
- pin beyond retention policy;
- capture diagnostics and quality warnings;
- marker/timeline reprocessing;
- export/download variants;
- coach-specific recipient and ownership controls.

These controls should be capability-gated, not merely hidden with CSS. The default public user should not receive confusing empty states or discover them through route guessing.

### Admin / support

Keep support diagnostics and retry/recovery tools available through an admin/debug capability. Never use the raw thrown error as public copy. Admin access should not alter the saved result or upload state model.

## Implementation plan

### Phase 1 — pure review model

- Define a capture-source-aware review model: `video`, `metrics-only`, `static-metrics-only`, `import`.
- Define review sections and visibility from source, AIDA context and capability.
- Define save/upload hand-off states and user-facing copy as pure data.
- Keep final metric correction pure and bounded by captured values.
- Add tests for section visibility, validation, save-state transitions and retryable errors.

### Phase 2 — review UI

- Replace the mixed card stack in `+page.svelte` with the result hero, compact correction disclosure and source-specific sections.
- Add a video thumbnail/preview state without making playback editing part of this route.
- Make **Save dive** the single public primary action and move advanced controls behind capability-gated disclosure.
- Add a real saved hand-off before navigating to the dive log or detail route.
- Add confirmation/recovery for **Record again** where the capture cannot be restored.

### Phase 3 — persistence and upload status

- Reuse the existing pending-upload queue and `DiveVideo.processingState` where possible.
- Add a small local hand-off model for the period between queueing and navigation; do not duplicate Firestore status.
- Verify that remote record creation, local queue persistence and background upload failure can each produce an honest public state.
- Only add Firestore fields if the existing video/processing state cannot represent the required status; document any schema or rules change before implementation.

### Phase 4 — advanced workflows

- Move gifting, pinning, diagnostics and export variants to the video detail/advanced route.
- Add capability checks at the route and action boundaries.
- Preserve coach ownership and recipient behaviour, including the current no-gifter-log rule for gifted captures.
- Add retry/reprocessing actions with support-safe diagnostics.

### Phase 5 — validation

- Test the public path for live video, imported video, dynamic metrics-only and static-only captures.
- Test offline/failed upload after the dive has already been saved.
- Verify keyboard focus, screen-reader labels, safe-area spacing and 375 px width.
- Device-test at least one iPhone Safari and one Android Chrome capture flow.

## Usability acceptance criteria

A public user succeeds when all of the following are true:

1. After stopping, they can identify discipline, distance and duration without reading technical copy.
2. They can save a normal video capture without seeing gifting, retention, bitrate, container or routine internals.
3. They can correct distance or duration and restore the captured values before saving.
4. Imported-video users can find and reopen marker editing without losing their capture.
5. AIDA users see surface-protocol fields only when relevant; ordinary training users do not.
6. The primary action is clearly **Save dive**, and duplicate taps cannot create duplicate saves.
7. A saved dive remains understandable if video upload is queued, offline or failed.
8. The user can proceed to the dive log or safely choose Done without losing the saved capture.
9. **Record again** is visibly secondary and does not accidentally discard an unrecoverable capture.
10. The first viewport works at 375 px wide without horizontal scrolling or hidden primary actions.
11. Screen-reader users receive the result, save state and error state in a meaningful order.
12. Advanced users retain gifting, pinning, diagnostics and reprocessing without exposing those controls to the default public path.

## Scope of the review

- Audit the current review-and-save route and every control, field, label, warning, and default.
- Separate public-user needs from admin, coach, debugging, processing, and advanced workflow needs.
- Define the public happy path, including recorded-video and metrics-only captures where they share this surface.
- Decide which advanced actions should be hidden, deferred behind an explicit affordance, beta-gated, or moved to a later detail/edit screen.
- Design mobile-first hierarchy, copy, validation, loading/error states, and the save/upload hand-off.
- Validate the proposed flow against the public-release principles in [[docs/public-release/free-public-version|Free public version]].

## Initial UX principles

- Lead with the outcome: discipline, distance, time, and a useful preview.
- Make the primary action unambiguous: **Save dive**.
- Ask only for information required to create a trustworthy log; infer or default everything else.
- Keep corrections close to the result they change and make them reversible.
- Do not make a user understand routines, timeline internals, gifts, storage, export formats, or processing states in order to save a normal dive.
- Preserve advanced/admin capability without leaking it into the default public flow.
- Treat upload/processing as a clear post-save status, not a reason to block the core save where possible.

## Discovery outputs

1. Current-state inventory, labelled **keep**, **simplify**, **move**, **hide/gate**, or **remove** with rationale.
2. Public-user journey and screen/state map from recording stop through saved result.
3. Proposed information architecture and mobile wireframe-level specification.
4. Explicit advanced/admin workflow and capability boundary.
5. Implementation plan, broken into pure state/model changes, UI changes, persistence changes, and tests.
6. Usability acceptance criteria for the public happy path.

## Starting points

- Route: `src/routes/(app)/dive/record/[id]/+page.svelte`
- Video context: [[docs/video/overview|Video overview]]
- Public product boundary: [[docs/public-release/free-public-version|Free public version]]
- Related future editing work: [[docs/video/imported-video-waypoint-editor|Imported video waypoint editor]] and [[docs/video/stored-video-waypoint-reprocessing|Stored video waypoint reprocessing]]
