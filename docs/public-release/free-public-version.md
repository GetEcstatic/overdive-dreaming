# Free Public Version

## Why this exists

Overdive is currently a powerful personal training tracker, but a public release should feel much simpler. The first public version should not expose the full routine-builder, analytics, media, and metrics surface at once. It should give new freedivers one clear reason to come back after a pool session, and one clear artifact they can share.

The goal is a free, public Overdive that is:

- Easy to understand in the first minute
- Useful after one training session
- Meaningful for beginners and serious pool freedivers
- Social media friendly without feeling gimmicky
- Small enough to maintain and polish

## Product thesis

The public version should be a lightweight freediving training journal for pool sessions, built around beautiful session cards, simple progress, and a few default training patterns.

Do not lead with custom routine construction. Lead with logging a good session and getting a satisfying summary.

## Recommended public feature set

### 1. Simple session logging

A public user should be able to log a session with almost no setup:

- Date and pool/location
- Discipline: STA, DYN, DNF, DYNB
- Main result: time, distance, or reps
- RPE and joy
- Notes
- Optional photo

This should be the default path. Advanced metrics should stay hidden or unavailable in the public version unless they directly improve the share card or progress view.

### 2. Curated routines only

Offer a handful of polished default routines instead of the full builder:

- Static max attempt
- Dynamic max attempt
- Gentle CO2 table
- Sweet 16 / 16 x 50m
- Optional beginner breath-control routine

Each routine should have a plain-language description, a short coaching cue, and a very fast log form. Users should be able to complete the app flow without knowing what a layer, read model, metric profile, or routine contract is.

### 3. Personal bests and milestones

The highest-impact analytics for public release are simple PBs and streak-like milestones:

- Best STA time
- Best dynamic distance by discipline
- Best session volume
- First logged session
- First 100m, 150m, 200m, etc.
- First clean max attempt after a prior failed/samba/BO tag, if safety outcome is tracked

This is meaningful, easy to explain, and naturally shareable.

### 4. Beautiful share cards

Make sharing a first-class output, not an afterthought. A logged session should be able to produce a clean story-format card with:

- Athlete name
- Discipline
- Result
- PB or milestone badge when relevant
- Optional session photo
- Routine name, if used
- Date
- Overdive wordmark

Share cards are probably the best public growth loop: they make the app visible without requiring social features inside the app.

### 5. Lightweight progress view

Keep analytics to a small number of friendly views:

- Recent sessions
- PBs by discipline
- Last 30 / 90 / 365 day progress
- Total distance or total breath-hold time
- Simple discipline filter

Avoid exposing the full metrics catalog, advanced filters, routine analytics, or dense comparison tools in the first public release.

### 6. Simple video capture and review

Video is a major point of difference for Overdive, especially for dynamic dives. It should be included in the public version, but as a simple capture-and-review workflow rather than the full private/beta video system.

The public version should support:

- Record a dynamic dive in-app
- Tap start/end and key waypoints during playback
- Review the dive with distance/time overlays
- Upload a prerecorded dive video and mark it up as if it had been recorded in Overdive
- Generate a share card or short social-friendly output from the result

The public version does not need every existing video feature. Gifted videos, coach workflows, heavy server-side processing controls, and advanced export settings can remain private/beta features until the simplified capture loop is polished.

## Suggested public navigation

A simpler navigation could be:

- Feed
- Log
- Progress
- Profile

Routines can live inside Log as presets rather than as a top-level destination. This removes a major conceptual burden for new users.

## What to hide or beta-gate

The following should probably be hidden from the free public version at first:

- Full routine builder
- Layer editor
- Layer read model tooling
- Advanced metric configuration
- Group routine invites
- Gifted dive workflow
- Biometric CSV import
- Experimental O2/static physiology fields
- Dense per-rep analytics

These can still exist for the private/power-user app, admin users, or a beta flag.

## Possible release modes

### Option A: Public mode flag

Keep one app, but introduce a public-mode feature flag that hides advanced routes and controls for normal users.

Pros:

- Fastest path from current code
- Reuses existing auth, Firestore, logging, PBs, and share-card work
- Allows personal/admin mode to keep advanced tools

Cons:

- Requires careful route guarding and UI pruning
- Risk of complexity leaking through edge cases

### Option B: Separate public app shell

Keep the same backend and components, but build a simplified public route group or shell.

Pros:

- Cleaner UX boundary
- Easier to design intentionally
- Safer for long-term product clarity

Cons:

- More implementation work
- More duplicated navigation and onboarding decisions

### Recommendation

Start with Option A for a prototype, but structure it like Option B: define a public user journey, then hide everything that does not serve that journey.

## Implementation principles

This plan should follow the same engineering principles as the rest of Overdive:

- Data-oriented design: represent public mode, presets, logging choices, and video review state as plain data first.
- Pure transformations before UI: derive public navigation, visible controls, default presets, PB summaries, share-card inputs, and video-review outputs with pure helpers that can be tested outside Svelte.
- Side effects at the edges: Firebase reads/writes, media capture, upload, playback, and sharing should stay in route components, services, or storage/media adapters.
- Derive instead of duplicate: public-mode UI should be derived from user capability, route context, and routine metadata rather than copied into a separate parallel app where possible.
- Keep the mobile workflow primary: the main path should be comfortable on a phone at the pool, with large targets, short forms, bottom navigation, and no required desktop-only interactions.
- Hide complexity before rebuilding it: prefer gating advanced routes and controls over deleting proven private/beta functionality.
- Test pure logic close to the code: public-mode route maps, preset selection, log summaries, progress summaries, and video-review reducers should have focused Vitest coverage.

## Full implementation plan

### Phase 0: Public mode boundary

Goal: introduce a clear capability boundary without disrupting the current private/power-user app.

- Add a user capability model that can answer: public user, advanced beta user, admin/dev user.
- Default normal signed-in users to public mode.
- Keep advanced access available for existing power users through an invite/admin flag or a temporary local/dev override.
- Centralize the capability decision in one helper or store so route layouts, navigation, and components do not each invent their own checks.
- Define public route access rules:
   - Feed/dashboard: public.
   - Log: public.
   - Progress: public.
   - Profile/settings: public.
   - Routine builder/layer editor: advanced only.
   - Group invites/gift flows/biometric import/deep analytics: advanced only.
- Add simple route guards for advanced-only pages that send public users back to Log or Feed with a non-alarming message.

### Phase 1: Public app shell and navigation

Goal: make the app feel immediately understandable after sign-in.

- Reduce public bottom navigation to Feed, Log, Progress, Profile.
- Move routine selection into Log as presets, not a top-level concept.
- Keep the current advanced navigation for advanced users.
- Remove public references to layer editors, read models, metric profiles, routine contracts, group routines, and beta-only tooling.
- Make the authenticated loading splash first-open only, so the public app feels branded without slowing repeated navigation.
- Keep copy sparse: use labels and empty states that orient the user, not explanatory walls.

### Phase 2: Curated public presets

Goal: give public users a strong starting set without requiring custom routine creation.

Start with these presets:

- Dynamic max attempt.
- Static max attempt.
- Two-breath static CO2 table.
- Dynamic Sweet 16 CO2 table.
- Increasing static intervals.
- Increasing dynamic intervals.

Implementation notes:

- Represent the preset list as data, with stable IDs, plain-language names, disciplines, short coaching cues, expected result fields, and share-card emphasis.
- Reuse the existing routine/layer model internally where it helps, but never expose layer terminology in public UI.
- Seed or project presets through the existing routine template path so logs remain compatible with analytics, PBs, and share cards.
- Public users should not create arbitrary custom routines in v1.
- Advanced users can still create and edit routines through the existing builder.

### Phase 3: Simple logging flow

Goal: let a new user log a useful session in under one minute.

- Make Log open directly to three choices: Quick log, Max attempt, Preset routine.
- Keep the form field set short:
   - Date/time.
   - Discipline.
   - Result: time, distance, reps, or preset-specific rows.
   - RPE and joy.
   - Notes.
   - Optional photo.
- Keep advanced metrics hidden for public users unless a preset truly needs them.
- Make rep duration mean only "all completed reps had the same duration"; otherwise show average time per rep from row results.
- Ensure the save path stores planned rows/result rows for preset routines while keeping Firestore payloads free of `undefined` values.
- Keep existing PB recalculation, dashboard cache clearing, visibility, and share-card hooks working.

### Phase 4: Public progress view

Goal: replace dense analytics with progress that feels rewarding and understandable.

- Build a public progress read model from existing routine logs and PB helpers.
- Show:
   - Current PBs by discipline.
   - Recent sessions.
   - Last 30/90/365 day totals.
   - Milestones achieved.
   - Simple discipline filter.
- Hide advanced routine analytics, metric catalogs, dense comparison charts, and per-rep analytics from public users.
- Prefer one or two focused cards over dashboard sprawl.

### Phase 5: Simple dynamic video recording

Goal: keep Overdive's strongest differentiator while reducing public UX complexity.

- Keep in-app dynamic dive recording available from Log.
- Guide the user through the smallest reliable flow:
   - Choose discipline and pool length.
   - Record or select video.
   - Mark dive start/end.
   - Mark key distance point(s) only when needed.
   - Review distance/time overlay.
   - Save as a routine log.
- For prerecorded imports, start with: upload video, choose discipline/pool length, tap dive start/end, optionally tap halfway point.
- Do not require every waypoint in v1 unless the user opts into a more detailed review.
- Keep coach gifting, group workflows, advanced export controls, and heavy worker controls out of public mode.
- Keep media side effects in existing storage/media services; keep review state in pure reducers or helpers where practical.

### Phase 6: Share output

Goal: make the completion moment satisfying and naturally social.

- Make share-card generation available after every saved public log.
- Support story-format cards for:
   - Static max.
   - Dynamic max.
   - Preset routine completion.
   - PB or milestone.
   - Video-reviewed dynamic dive.
- Use existing share-card utilities where possible, but simplify public options.
- Include Overdive wordmark, athlete name, date, discipline, result, PB/milestone badge, optional photo, and video overlay result when available.
- Avoid requiring in-app social features before public launch.

### Phase 7: Safety, profile, and onboarding

Goal: be responsible without making the first session feel bureaucratic.

- Include a concise safety note during signup or first Log use.
- Keep a persistent safety/info link in Profile.
- Keep public profile settings simple: name, photo, default visibility, units/pool length defaults, advanced access request.
- Do not add disruptive warnings to every max attempt form unless the user enters a high-risk context that genuinely needs friction.

### Phase 8: QA, migration, and rollout

Goal: ship public mode without breaking the private/beta app.

- Add focused tests for capability derivation, public navigation, preset projection, public progress summaries, and log payload cleaning.
- Run `npm run check` and targeted Vitest suites before each implementation PR/commit.
- Test mobile layouts at roughly 375px width for Feed, Log, Progress, Profile, video review, and share-card output.
- Test advanced users can still access routine builder, layer editor, imports, group flows, and detailed analytics.
- Test public users cannot accidentally land on advanced-only routes through old links.
- Roll out behind a public-mode flag first, then flip normal users to public mode once the core path feels coherent.

## Implementation checklist

- [x] Add a public/advanced/admin capability helper or store.
- [x] Add route guards for advanced-only pages.
- [x] Add public-mode navigation with Feed, Log, Progress, Profile.
- [x] Keep advanced navigation available for advanced users.
- [x] Hide routine builder, layer editor, layer read models, metric profile tooling, group invites, gifted dives, biometric CSV import, and deep analytics from public users.
- [x] Define the curated public preset data set.
- [x] Include dynamic max, static max, two-breath static CO2, dynamic Sweet 16 CO2, increasing static intervals, and increasing dynamic intervals.
- [x] Project public presets into existing routine/log data shapes without exposing layer terminology.
- [x] Build the simplified public Log entry screen.
- [x] Trim public quick-log fields to the short core set.
- [x] Preserve row result storage for preset routines.
- [ ] Ensure rep duration only displays when completed reps have a uniform duration.
- [ ] Build a public progress read model.
- [ ] Add public progress UI for PBs, recent sessions, 30/90/365 day totals, milestones, and discipline filtering.
- [ ] Keep in-app dynamic recording available from public Log.
- [ ] Add the simplified prerecorded video import/review flow.
- [ ] Support start/end and optional halfway-point markup before detailed waypoint markup.
- [ ] Save reviewed video results into compatible routine log records.
- [ ] Generate public share cards from saved logs and reviewed videos.
- [ ] Keep share-card options minimal and story-format first.
- [ ] Add signup/first-log safety note and Profile safety link.
- [ ] Add focused Vitest coverage for public-mode pure helpers.
- [ ] Run `npm run check` before shipping implementation commits.
- [ ] Mobile-test the public happy path at phone width.
- [ ] Verify advanced users retain access to existing private/beta tools.
- [ ] Update this checklist as items are completed during implementation.

## Open questions

- Should public users be allowed to create any custom routines, or only use presets? Current leaning: start with presets only. Start with dynamic max, static max, two-breath static CO2, dynamic Sweet 16 CO2, increasing static intervals, and increasing dynamic intervals.
- How simple can dynamic recording be while still feeling reliable enough for public users? Current leaning: the current recording UX is close. The main complexity is tapping waypoints. Automatic image recognition could simplify this later, but is not realistic for v1.
- What is the minimum viable prerecorded-video upload flow? Current leaning: import a video, choose discipline/pool length, tap dive start/end, then optionally tap only the halfway point instead of every waypoint. This keeps the public version much easier while still producing useful overlay metrics.
- Should advanced mode be admin-only, invite-only, or a visible toggle? Current leaning: invite-only, with a way to request access.
- What is the one result a new user should feel proud to share after their first session? Current leaning: a dive or routine summary with beautiful metrics, plus an overlay video for dynamic dives.
- Should public mode emphasize safety notes more explicitly for max attempts? Current leaning: do not crowd the app flow, but include a clear disclaimer during signup and keep it accessible from the profile page.

## Success criteria

A public v1 is working if a new user can:

- Sign in
- Log a session in under one minute
- Understand their best result
- Record or upload a dynamic dive video and review it without learning advanced tools
- Generate a shareable card or overlay output
- Return later and see progress without learning the full internal model

