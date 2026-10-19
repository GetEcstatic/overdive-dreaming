# Public review & save UX

## Status

Discovery / next job.

## Goal

Redesign the **Review & save** screen after a recorded dynamic dive so a public user can confidently finish and save a dive with minimal thought. The current screen exposes information and controls useful only to an admin/power-user workflow.

## Product question

What is the smallest, clearest post-recording flow that lets a public user:

1. confirm that the recorded result is right;
2. make only the corrections that matter;
3. save it; and
4. understand what happens next (including any upload/processing state)?

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
