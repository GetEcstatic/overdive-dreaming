# Overdive Dreaming — Docs Index

Planning, design, and reference docs for the Overdive Dreaming app.

**How this is organised**
- Folders are by **topic** (`video/`, `routines/`, etc.).
- Within each topic, the root holds **active plans + stable references**; a `shipped/` subfolder (if present) holds completed plans kept for historical context.
- `archive/` holds **superseded or stale** docs — kept for breadcrumb only, not as guidance.
- This file is the **status-grouped curated view**. The folder tree is the topic-grouped view.

---

## Start here

Foundational docs anyone touching the codebase should skim once.

- [Data model](reference/data-model.md) — Firestore schema (users, routines, sessions, routine logs, dives)
- [Training session design](reference/training-session-design.md) — sessions vs dives, routines, terminology
- [How it works](reference/how-it-works.md) — user-facing explainer of Firebase / Firestore / Storage
- [Webapp & iOS PWA](reference/webapp-pwa.md) — A2HS audit, custom auth domain (`auth.overdive.app`), Vercel domain setup

---

## Active plans (next implementation passes)

Things designed but not yet shipped, or shipped partially.

### Video
- [Imported video waypoint editor](video/imported-video-waypoint-editor.md) — plan for correcting dense imported-video waypoint data with quick fixes and lap-stacked marker editing
- [Stored video waypoint reprocessing](video/stored-video-waypoint-reprocessing.md) — plan for editing already-uploaded video waypoints and syncing HUD, overlay downloads, and linked routine-log lap data
- [Fullscreen distance scrubber](video/fullscreen-distance-scrubber.md) — dashboard fullscreen video timeline with distance markers and scrub preview
- [WebCodecs evaluation](video/webcodecs-evaluation.md) — research only; do **not** replace MediaRecorder yet
- [Portrait recording (copilot)](video/portrait-recording.md) — server-side transcode v2; supersedes the original portrait-recording plan. Upcoming, but needs more thought before implementation.

### UI / code health
- [Medium-priority improvements](ui-patterns/medium-priority-improvements.md) — partial; remaining: integration, shared styles, form validation

### Public release
- [Free public version](public-release/free-public-version.md) — discussion starter for a simpler public UX with curated logging, PBs, and share cards

### Routines
- [V2 create routine flow](routines/v2-create-routine-flow-plan.md) — plan for making Create Routine start from the layer model and route into the production layer editor
- [Quick Log v2 routine audit](routines/quick-log-v2-routine-audit.md) — audit and implementation plan for aligning Quick Log with v2 routines
- [O2 static layer discipline](routines/o2-static-layer-discipline-plan.md) — plan for modelling O2 static as a layer-only unofficial static discipline
- [Mixed-layer Quick Log UX](routines/pingu-quick-log-ux-plan.md) — evaluation and plan for Pingu-style and future mixed-layer quick-log form improvements

### Revisit later (shipped but flagged for follow-up)
- [Routine analytics](metrics-analytics/shipped/routine-analytics.md) — shipped per-routine page; flagged to revisit in future

---

## Reference (stable knowledge)

Designs that are largely settled. Read for context, not as a roadmap.

### Routines
- **Routine builder (canonical: [simplified](routines/builder-simplified.md))** — 3-type model (max-attempt, interval-series, hybrid). The simplified builder is the only one shipped.
- [Routine builder — original custom plan](routines/builder-custom.md) — older spec with the full 14-field tracking audit; superseded as a builder plan but useful for the metrics catalog
- [Default routines config](routines/default-routines.md) — system-provided routines (CO₂ tables, statics, DNF/DYN, RV)
- [Tags](routines/tags.md) — per-log tags vs routine-builder tags; `tagConfig.ts` location

### Metrics
- [Training metrics catalog](metrics-analytics/training-metrics.md) — full metric inventory (200+), activity types, lung volume
- [Routine metric map](metrics-analytics/routine-metric-map.md) — builder-facing map for static/dynamic tracked and calculated metrics
- [Analytics design](metrics-analytics/analytics-design.md) — exploratory: RPE zones, 80/20, TSS, filter builder ideas

### Video master spec
- [Video overview](video/overview.md) — master spec covering UX, recorder, playback, gifting, retention, codecs
- [Recording guide (user-facing)](video/recording-guide.md) — 13-step UX flow for coaches
- [QA checklist](video/qa-checklist.md) — device matrix for dynamic video testing

### Storage / data import
- [CSV parser](storage-infra/csv-parser.md) — biometric import; handles three formats (single-round, multi-round, per-interval)
- [Backend migration options](storage-infra/backend-migration-options.md) — Convex vs Supabase eval (no imminent action)

### UI patterns
- [Wheel selector](ui-patterns/wheel-selector.md) — bottom-sheet number/duration picker design

---

## Shipped (historical context)

Completed plans, kept for traceability. Source of truth is the code, not these docs.

### Video — capture & UX
- [Dynamic recorder UX](video/shipped/dynamic-recorder-ux.md) — single-button flow, auto-advance, undo
- [Fullscreen single-button recorder](video/shipped/fullscreen-single-button.md) — landscape primary, long-press end
- [Camera lens selection](video/shipped/camera-lens-selection.md) — multi-lens device picker
- [Camera selector UX](video/shipped/camera-selector-ux.md) — bottom-right thumb pill
- [Quality improvements](video/shipped/quality-improvements.md) — bitrate presets, named quality modes (largely shipped)
- [Missed/premature waypoint](video/shipped/missed-premature-waypoint.md) — auto-advance + undo for off-by-one taps
- [Overlay export — audio + photos](video/shipped/overlay-export-audio-photos.md) — frame pacing & audio routing
- [Large video upload fix](video/shipped/large-upload-fix.md) — removed the 500 MB cap
- [Dashboard download](video/shipped/dashboard-download.md) — signed-URL direct downloads
- [Dashboard custom player](video/shipped/dashboard-custom-player.md) — inline custom controls, single-video autoplay, and tap-to-fullscreen dashboard behavior
- [Gifted dive attach](video/shipped/gifted-dive-attach.md) — atomic accept + create-log + attach

### Video — playback & orientation
- [Orientation strategy](video/shipped/orientation-strategy.md) — phone-posture metadata + playback-aware rendering
- [Portrait feed lock](video/shipped/portrait-feed-lock.md) — fullscreen portrait playback from dashboard feed
- [Landscape playback](video/shipped/landscape-playback.md) — fill/fit, safe-area, custom controls

### Routines & metrics
- [Routine analytics](metrics-analytics/shipped/routine-analytics.md) — per-routine page (will need revisiting in future)
- [Dynamic metrics expansion](metrics-analytics/shipped/dynamic-metrics-expansion.md) — time-per-lap + speed metrics
- [Special breath-hold categories](routines/shipped/special-breath-holds.md) — O₂-assist / RV / FRC PB segregation

### Storage & infra
- [Wasabi migration](storage-infra/shipped/wasabi-migration.md) — photos/CSVs/videos moved off Firebase Storage

---

## Archive

Superseded or stale. Don't follow as guidance.

- [Portrait recording (original)](archive/portrait-recording-original.md) — superseded by [video/portrait-recording.md](video/portrait-recording.md)
- [Rep editor — nudge removal & lung volume](archive/rep-editor-nudge-removal.md) — shipped; narrow fix, low future value
- [Current updates](archive/current-updates.md) — stale snapshot of feature ideas & monetisation brainstorm

---

## Maintenance

When a plan ships:
1. Move it to its topic's `shipped/` subfolder (e.g. `video/foo.md` → `video/shipped/foo.md`).
2. Update the relevant section in this file.

When a plan is superseded:
1. Move it to `archive/` with a name like `<topic>-original.md`.
2. Note the supersession in this file under **Archive**.

When a new plan is drafted:
1. Drop it in the relevant topic folder with a kebab-case filename, no `_PLAN` suffix.
2. Add a one-line entry under the matching **Active plans** section.
