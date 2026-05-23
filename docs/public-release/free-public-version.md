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

### 6. Optional video later

Video is powerful but increases complexity quickly. For the first public release, consider keeping video out of the primary path unless it is limited to:

- Attach a YouTube link
- Attach one photo
- Generate a share card

Recorder, overlay exports, gifted videos, and server-side processing can remain private/beta features until the public app has proven the core logging loop.

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
- Recorder pipeline and video processing
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

## First implementation pass

1. Define public-mode eligibility:
   - Normal users see public mode by default.
   - Admin/private beta users can access advanced mode.
2. Reduce navigation to Feed, Log, Progress, Profile for public mode.
3. Make Log the primary experience:
   - Free log
   - Curated routine preset
   - Max attempt
4. Hide advanced routine builder/editor surfaces from public users.
5. Polish share-card generation from a completed log.
6. Simplify the dashboard feed around recent sessions and share actions.
7. Add a public onboarding sentence or two only where it reduces confusion.

## Open questions

- Should public users be allowed to create any custom routines, or only use presets?
- Is video attachment important enough for v1, or should share cards carry the public release?
- Should advanced mode be admin-only, invite-only, or a visible toggle?
- What is the one result a new user should feel proud to share after their first session?
- Should public mode emphasize safety notes more explicitly for max attempts?

## Success criteria

A public v1 is working if a new user can:

- Sign in
- Log a session in under one minute
- Understand their best result
- Generate a shareable card
- Return later and see progress without learning the full internal model
