# Overdive Dreaming — Docs Index

Planning, design, and reference docs for the Overdive Dreaming app.

Up: [Agent guide](../AGENTS.md)

## Current navigation — start here for implementation

- [Video implementation map](video/README.md) — task → owning code → tests and operational boundaries.
- [Routines and persisted logs map](routines/README.md) — layer contracts, compatibility, row results, actual collection paths and verified access/authoring gaps.
- [Storage, auth and deployment map](storage-infra/README.md) — sign-in/persistence, media storage, retention, Functions packaging and verification boundaries.
- [Local development](../DEVELOPMENT.md) — checkout identity, build/test commands and release boundaries.
- [Knowledge graph conventions](reference/knowledge-graph.md) — authority, parent links, lifecycle, validation and vault/Pi coherence.
- [Document classification](code-health/document-classification.md) — per-file authority, evidence and outstanding reviews. Check this before treating a legacy document as guidance.

The catalogue below includes legacy and partially implemented specifications. Its category alone does not certify freshness. Prefer the reviewed feature map and actual implementation; do not treat plan status as deployment evidence.

**How this is organised**
- Folders are by **topic** (`video/`, `routines/`, etc.).
- Within each topic, the root holds **active plans + stable references**; a `shipped/` subfolder (if present) holds completed plans kept for historical context.
- `archive/` holds **superseded or stale** docs — kept for breadcrumb only, not as guidance.
- This file is the **status-grouped curated view**. The folder tree is the topic-grouped view.

---

## Start here

- [Work queue](TODO.md) — short, prioritised actionable checklist; update this as work is selected or completed.

Foundational docs anyone touching the codebase should skim once.

- [Routines/persistence map](routines/README.md) — current schema owners and storage boundaries; the old nested-log diagram is superseded.
- [Training session design](reference/training-session-design.md) — sessions vs dives, routines, terminology
- For authentication and PWA work, start with the [implementation map](storage-infra/README.md), not the old checklist below.

---

## Active plans (next implementation passes)

Things designed but not yet shipped, or shipped partially.

### Video
- [Social cut implementation](video/social-cut-implementation.md) — how the Reel-first social cut is built: edit list, server render, share sheet, schema and deploy order
- [Share HUD redesign](video/share-hud-redesign.md) — audit of the burned HUD export vs Instagram Reels and the selected "Reel-first broadcast" plan: three downloads (original, full with HUD, Instagram social cut), safe zones, split/PB moments, one-length speed graph, result card, shared renderer
- [Imported video waypoint editor](video/imported-video-waypoint-editor.md) — plan for correcting dense imported-video waypoint data with quick fixes and lap-stacked marker editing
- [Stored video waypoint reprocessing](video/stored-video-waypoint-reprocessing.md) — plan for editing already-uploaded video waypoints and syncing HUD, overlay downloads, and linked routine-log lap data
- [Burned HUD parity](video/burned-hud-parity-plan.md) — investigation and implementation plan for making server-burned HUD downloads match the in-app HUD while preserving background readiness
- [Speed plot HUD overlay](video/speed-plot-hud-overlay.md) — plan for a bottom video HUD graph showing speed over distance, PB marker, playback/export parity, and low-friction HUD selection
- [Fullscreen distance scrubber](video/fullscreen-distance-scrubber.md) — dashboard fullscreen video timeline with distance markers and scrub preview
- [WebCodecs evaluation](video/webcodecs-evaluation.md) — research only; do **not** replace MediaRecorder yet
- [Portrait recording (copilot)](video/portrait-recording.md) — server-side transcode v2; supersedes the original portrait-recording plan. Upcoming, but needs more thought before implementation.
- [Public review & save UX](video/review-save-public-ux.md) — discovery brief for redesigning the post-recording review/save flow around a simple public-user path while separating advanced/admin tools.

### UI / code health
- [Medium-priority improvements](ui-patterns/medium-priority-improvements.md) — partial; remaining: integration, shared styles, form validation
- [Generated code debt audit](code-health/generated-code-audit.md) — LLM-assisted audit plan for redundant, unused, stale, or low-confidence code

### Public release
- [Free public version](public-release/free-public-version.md) — discussion starter for a simpler public UX with curated logging, PBs, and share cards

### Competition
- [AIDA competition mode](competition/aida-competition-mode.md) — planning for max-attempt competition logging, video/metric-only attempts, cards, penalties, and surface protocol capture

### Routines
- [O2 static layer discipline](routines/o2-static-layer-discipline-plan.md) — partially implemented; selector/audit scope still needs review. Start with the verified gaps in the [routines map](routines/README.md).
- [Logging request history](routines/Updates%202Be%20-%20Logging.md) — includes an unverified signup acknowledgement proposal; not a standing work or publishing instruction.

### Biometrics
- Underwater SpO₂ sensor hardware (design, sourcing, outreach) now lives in the Obsidian vault at `Hardware/Underwater SpO2 Sensor/`, outside this repo. App-side plans (Bluetooth ingest, Capacitor) go here when work starts.

### Revisit later (shipped but flagged for follow-up)
- [Routine analytics](metrics-analytics/shipped/routine-analytics.md) — shipped per-routine page; flagged to revisit in future

---

## Reference (stable knowledge)

Designs that are largely settled. Read for context, not as a roadmap.

### Routines
- **Routine creation:** inspect [layer creation](../src/lib/routineLayers/create.ts). The old three-type builder is no longer canonical; legacy documentation is listed under history below.
- [Routine builder — original custom plan](routines/builder-custom.md) — older spec with the full 14-field tracking audit; superseded as a builder plan but useful for the metrics catalog
- [Default routines config](routines/default-routines.md) — system-provided routines (CO₂ tables, statics, DNF/DYN, RV)
- [Tag implementation](../src/lib/config/tagConfig.ts) — current category capabilities; layer defaults and log-time selection are linked from the [routines map](routines/README.md).

### Metrics
- [Training metrics catalog](metrics-analytics/training-metrics.md) — full metric inventory (200+), activity types, lung volume
- [Routine metric map](metrics-analytics/routine-metric-map.md) — builder-facing map for static/dynamic tracked and calculated metrics
- [Analytics design](metrics-analytics/analytics-design.md) — exploratory: RPE zones, 80/20, TSS, filter builder ideas

### Video master spec
- [Video implementation map](video/README.md) — current ownership; older master specifications and user instructions are listed under history below.
- [QA checklist](video/qa-checklist.md) — device matrix for dynamic video testing

### Storage / data import
- For code-owned resource limits and live-verification caveats, use the [storage/deployment map](storage-infra/README.md). Earlier budget rollout details are historical, listed below.
- [Biometric parser implementation](../src/lib/utils/biometricCsvParser.ts) and [tests](../src/lib/utils/biometricCsvParser.test.ts) — current format handling; the old fix plan is historical below.
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

- Historical: [Legacy agent context](archive/legacy-agent-context.md) — preserved former CLAUDE.md; not automatically loaded.
- Superseded: [Original video overview](video/overview.md) — old storage, capture and export architecture.
- Superseded: [PWA audit](reference/webapp-pwa.md) — outdated missing-feature checklist and redirect recommendation; device and live configuration claims require verification.
- Historical: [Firebase cost guardrails](storage-infra/firebase-cost-guardrails.md) — earlier rollout, not current worker sizing or verified budget state.
- Historical: [CSV parser fix plan](storage-infra/csv-parser.md) — core format/timestamp fixes are implemented; not every proposed refactor was adopted.
- Superseded: [Recording guide](video/recording-guide.md) — inconsistent flows and outdated defaults; not a current user guide.
- Superseded: [How it works](reference/how-it-works.md) — outdated storage/visibility claims; not a privacy policy.
- Superseded: [Simplified builder](routines/builder-simplified.md) — legacy three-type design; Create Routine now uses layers.
- Superseded: [Old data model](reference/data-model.md) — nested routine-log diagram and queries do not match current top-level CRUD.
- Superseded: [Tag matrix](routines/tags.md) — old builder-only selection assumptions.
- Historical: [V2 create flow](routines/v2-create-routine-flow-plan.md) — create projection implemented; layer-editor access gap still requires investigation.
- Historical: [Builder implementation checklist](routines/routine-builder-implementation-checklist.md) — rollout record, not current acceptance evidence.
- Historical: [Quick Log audit](routines/quick-log-v2-routine-audit.md) — mixed baseline and implementation record; no fresh production backfill verification.
- Historical: [Multi-layer round-trip plan](routines/multilayer-log-roundtrip-plan.md) — core row editing/read paths exist; proposed shared-form architecture was not adopted verbatim.
- Historical: [Mixed-layer Quick Log/mobile UX](routines/pingu-quick-log-ux-plan.md) — core read-model rules and responsive row markup exist; device acceptance not reverified.
- Historical: [Layer editor flow recovery](routines/routine-editor-uiux-flow-recovery-plan.md) — canvas/debug/metrics steps exist; not a fresh implementation plan.

- Historical: [Portrait recording (original)](archive/portrait-recording-original.md) — superseded by [video/portrait-recording.md](video/portrait-recording.md)
- Historical: [Rep editor — nudge removal & lung volume](archive/rep-editor-nudge-removal.md) — shipped; narrow fix, low future value
- Historical: [Current updates](archive/current-updates.md) — stale snapshot of feature ideas & monetisation brainstorm

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
