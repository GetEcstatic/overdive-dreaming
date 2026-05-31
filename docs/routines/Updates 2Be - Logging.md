# Agent instructions

Use this file as a project update queue and working memory. It can hold requests for any area of the app, not only video. When asked to check this file, work from the first numbered request at the top, then move downward only after that request is complete.

For each request:

1. Read the request, then read any nearby code/docs needed to understand the current system before editing.
2. Create a new section below the request list with a clear title.
3. In that section, write a short `Problem`, an `Implementation Plan`, and a checklist.
4. Follow the project fundamentals from `claude.md`:
	- Prefer plain data structures, discriminated unions, readonly records/arrays, and pure functions for business logic.
	- Keep side effects at the edges: Svelte components, Firestore calls, DOM listeners, timers, storage, and file IO should stay thin and intentional.
	- Derive values instead of storing duplicate state.
	- Use Svelte 5 runes syntax for new Svelte work and avoid mixing in old `export let` / `$:` patterns.
	- Preserve the mobile-first, minimalist, clarity-focused, data-focused design language.
	- Follow existing local component, CSS, Firebase, and TypeScript patterns before introducing new abstractions.
5. Implement continuously unless a real decision gate or external blocker appears. Do not stop after planning.
6. Validate at the right level for the change: focused tests for pure logic, `npm run check` for Svelte/TypeScript changes, `npm --prefix functions run build` and deploy tasks for Cloud Functions changes, and any relevant manual/CLI verification.
7. Commit after each major completed step with a concise message, then push to `main` when the request is complete.
8. Mark the checklist complete, remove the original numbered request from the list, and continue to the next request if one exists.

Leave unrelated worktree changes alone. Never commit secrets or `.env` files. If a command is replaced with a new instruction, treat the replacement as the newest request.



# Requests

No open requests.

## Training Log Record Button Spacing

Problem: In public logging mode, the "Record a dynamic dive" link sits directly above the "Choose a session" section, making the two controls feel crowded.

Implementation Plan: Keep the existing markup and add spacing to the record link so the following session-selection section has a clear visual pause.

Checklist:
- [x] Inspect current training log layout and styles.
- [x] Add focused spacing without changing the surrounding flow.
- [x] Validate Svelte/TypeScript.
- [x] Remove the completed request from the queue.

## Safety Message Relocation And Signup Disclaimer Plan

Problem: The "Safety first" reminder in the training log flow interrupts choosing a session. Safety guidance belongs in Profile for now, with a proper acknowledgement flow planned for signup.

Implementation Plan: Remove the inline training-log safety note, make the Profile safety section carry the "Safety First" message, and document a signup disclaimer plan for a later implementation.

Checklist:
- [x] Remove the public logging safety note from the session selection flow.
- [x] Keep the Profile safety section addressable at `/profile#safety`.
- [x] Rename the Profile safety heading to "Safety First".
- [x] Record the signup disclaimer plan.

Signup Disclaimer Plan:
- Add a required acknowledgement step after first successful sign-in and before entering the authenticated app.
- Store acknowledgement fields on the user settings/profile document, including `safetyDisclaimerAcceptedAt` and `safetyDisclaimerVersion`.
- Block normal app navigation until the current disclaimer version is accepted, while still allowing sign out.
- Keep disclaimer copy concise and explicit: never freedive alone, use trained supervision/buddy procedures, stop if unwell or conditions change, and the app is a log/training aid rather than medical or safety supervision.
- Version the disclaimer text so future copy changes can require re-acknowledgement without guessing from old booleans.
