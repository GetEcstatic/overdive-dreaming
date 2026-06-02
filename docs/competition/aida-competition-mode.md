# AIDA Competition Mode Plan

Planning file for adding an AIDA competition mode that supports routine logging, video-recorded attempts, and metric-only attempts for AIDA-style maximal performances.

Source researched: `World Apnea_Rules&Regulations-2025 V17_8 25-05-2026.pdf`.

This document is for product and implementation planning. Re-check the latest official AIDA / World Apnea rules before shipping competition-facing behavior.

## Why This Mode Exists

Overdive already tracks max attempts and has lightweight competition metadata. That is enough to tag a result after the fact, but it is not enough to capture a competition-style attempt accurately.

A competition mode needs to preserve the difference between:

- AP: announced performance.
- RP: realized performance.
- Surface protocol completion time.
- Card outcome and reason codes.
- Penalties versus disqualifications.
- Raw performance versus competition points.

This matters because raw distance or time is not always the final competition result. A yellow card can leave a valid result with penalties. A red card makes the result worth zero in competition scoring, while the underlying RP can still be useful in the athlete's training/PB history if clearly marked.

## Rule Knowledge Needed

### Start And End

- OT means Official Top, the official time at which the athlete may start.
- The performance starts once the athlete's airway is submerged after OT.
- If the airway is already submerged before and during OT, the performance receives an `EARLY_START` penalty.
- In pool disciplines, the athlete has a 10 second start window after OT with no penalty.
- Starting after that 10 second window receives a `LATE_START` penalty.
- Starting more than 30 seconds after OT is disqualification: `DQ_LATE_START`.
- The performance ends once the athlete's airway breaks the surface.

Product decision: this first app pass will not require storing official clock time for OT. Users can manually enter the start relative to OT when needed. Examples: `OT -3s` means the athlete started 3 seconds before the countdown reached zero; `OT +14s` means the athlete started 14 seconds after OT and therefore receives a late-start penalty. An optional two-minute countdown can support automatic start-offset capture in the record/attempt flow.

### Surface Protocol

The Surface Protocol (SP) is an objective hypoxia check. Failure is `DQSP`.

Required order:

1. Remove all equipment covering eyes and/or airway, such as mask, goggles, or nose clip.
2. Give one visible OK sign clearly visible to the judges.
3. Give one verbal OK signal to the judges by saying "I'm OK" or "I am OK".

Timing and constraints:

- The researched rules state SP must be completed within 15.0 seconds of airway surfacing.
- If facial equipment is worn, SP starts when the athlete begins removing it.
- If no facial equipment is worn, SP starts when the athlete gives the visual OK sign.
- Once SP begins, extra visual/verbal cues or motions are not allowed until the verbal OK completes the protocol.
- At World Apnea events, the verbal OK must be in English.
- A valid OK sign requires the thumb and a finger tip in contact.
- Repeating the OK sign, giving it with both hands at once, or dropping it below the surface and bringing it back out counts as double OK and results in `DQSP`.

Product decision: the app should start an SP timer when the dive ends and stop it when the user taps `SP complete`. The visible SP checklist should be a reminder, not a set of required live-tapped buttons. If the SP is wrong, the user records that later under red card -> `DQSP`.

### Airways After Surfacing

- After surfacing, the athlete's nose and mouth must remain out of the water until the jury communicates the decision.
- If any part of the airway fully dips below the surface before the verdict, the result is `DQAIRWAYS`.

### Cards

- White card: performance is OK; full points are given.
- Yellow card: performance is OK but with penalties.
- Red card: disqualification; zero points are given.
- Judgment is communicated between 30 seconds and 1 minute after resurfacing.
- For yellow or red cards, the athlete has the right to be informed of the reason.
- In cases of doubt, benefit of the doubt goes to the athlete.

Product decision: reason codes should appear only after their card color is selected. Yellow reveals penalty reasons. Red reveals DQ reason groups.

### Common Codes To Model

| Code | Type | Disciplines | Meaning |
| --- | --- | --- | --- |
| `EARLY_START` | Penalty | STA, DYN, DYNB, DNF | Started before OT; 1 point per 5 second unit. |
| `LATE_START` | Penalty | STA, DYN, DYNB, DNF | Started after the 10 second window; 1 point per 5 second unit up to 30 seconds. |
| `UNDER_AP` | Penalty | STA, DYN, DYNB, DNF | RP is lower than AP. STA: 0.2 points per second. Dynamic: 0.5 points per meter. |
| `START` | Penalty | DYN, DYNB, DNF | No wall contact during start before/as leaving wall. |
| `TURN` | Penalty | DYN, DYNB, DNF | No wall contact at a turn. |
| `PULL` | Penalty | DYN, DYNB, DNF | Pulling/propelling on support before airway exit. |
| `DQBO` | DQ | All | Blackout symptoms such as loss of consciousness or involuntary respiratory arrest. |
| `DQSP` | DQ | All | Failed surface protocol. |
| `DQAIRWAYS` | DQ | All | Airway dips below surface before jury decision. |
| `DQTOUCH` | DQ | All | Impermissible touch after performance start or after surfacing. |
| `DQ_LATE_START` | DQ | Pool | Start more than 30 seconds after OT. |
| `DQOTHER` | DQ | All | Other rule violations. |

DQ reason groups should be nested in the UI. For example, selecting `DQSP` can reveal specific reasons such as double OK, repeated OK, missed verbal OK, wrong order, or too slow.

### Red-Card Detail Groups

These detail options should support the first implementation. They are not separate top-level card codes; they explain the selected red-card code.

| Code        | Detail option                                                                | Applies to     | Rule basis                                                                              |
| ----------- | ---------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------- |
| `DQBO`      | Cardiac arrest                                                               | All            | BO symptoms disqualify the performance.                                                 |
| `DQBO`      | Involuntary respiratory arrest                                               | All            | BO symptoms disqualify the performance.                                                 |
| `DQBO`      | Loss of consciousness                                                        | All            | BO symptoms disqualify the performance.                                                 |
| `DQSP`      | Equipment removal missing or out of order                                    | All            | SP tasks must be completed in strict order.                                             |
| `DQSP`      | Visual OK missing, unclear, repeated, double, or returned from below surface | All            | Double/repeated OK rules.                                                               |
| `DQSP`      | Verbal OK missing, not English at World Apnea event, or before visual OK     | All            | Verbal OK requirement and order.                                                        |
| `DQSP`      | SP completed after 15.0 seconds                                              | All            | SP time limit.                                                                          |
| `DQSP`      | Extra cue, motion, or repeated facial wipe after SP begins                   | All            | No extra cues/motions after SP begins.                                                  |
| `DQAIRWAYS` | Nose or mouth fully dips below surface before verdict                        | All            | Airway must remain above surface until card decision.                                   |
| `DQTOUCH`   | Supportive touch after performance start                                     | All            | Athlete cannot be physically helped/touched until verdict, with stated STA exceptions.  |
| `DQTOUCH`   | Touch after airway emerges                                                   | STA            | STA partner/safety touch is allowed during performance, but not after performance ends. |
| `DQTOUCH`   | Touch of athlete or equipment after start                                    | DYN, DYNB, DNF | Dynamic partner may not touch athlete/equipment after performance starts.               |
| `DQOTHER`   | Other pool rule violation                                                    | All            | Free-text note. A help affordance should show the full DQOTHER reference list.          |

`DQOTHER` should not use selectable detail chips in the first implementation. It should open a free-text reason field, with a small `?` help affordance that reveals the complete reference list below:

- Flotation device used to assist after surfacing.
- Coach fully immersed during performance.
- Airway not submerged within 1.5 m of the wall in DYN, DYNB, or DNF.
- Turn made more than 1 m short of the wall without touching in DYN, DYNB, or DNF.
- Surfaced outside the original performance zone or impeded another athlete.
- Swam a complete length at the surface.
- Above-surface arm recovery in dynamic disciplines.
- Dolphin kick while wearing bifins, except one allowed at the turn.
- Any other pool rule violation recorded by the judges.

### Static Apnea Notes

- STA is performed at the surface.
- Two official times are taken and averaged; the registered result is rounded down to the nearest second.
- Points: 1 second = 0.2 points.
- Partner/safety checks are allowed during the performance.
- Once the performance ends, partner touch is no longer allowed without disqualification.

Product decision: do not include AP safety-check scheduling in the first mode. It is useful rule knowledge, but too much surface area for this feature pass.

### Dynamic Apnea Notes

- DYN, DYNB, and DNF are reported in meters.
- Points: 1 meter = 0.5 points.
- The registered distance is rounded down to the nearest meter.
- The athlete must be in the water before submersion; diving/jumping/running starts are prohibited.
- The airway must submerge within 1.5 m of the wall or the athlete is disqualified.
- Wall contact is required at the start and each turn.
- Turning more than 1 m short of the wall without touching it is `DQOTHER`.
- RP is determined by airway exit, except when surfacing at the end wall: then wall touch before airway emergence registers the wall distance.
- The athlete must resurface in the performance zone they started in.
- Swimming a complete length at the surface or arm recovery above the surface causes `DQOTHER`.

## Existing App Support

Useful pieces already present:

- `RoutineLog.isCompetition` marks a log as competition.
- `RoutineLog.compeitionOrg` stores the organization, with a persisted typo that needs compatibility handling.
- `RoutineLog.cardTag` supports `white`, `yellow`, and `red`.
- `RoutineLog.recordTag` supports `NR`, `CR`, and `WR`.
- `TrackingConfig` has `trackCompetitionStatus`, `trackCardColor`, and `trackRecordTag`.
- Routine-layer projection enables competition tracking fields for single max attempts.
- `QuickLogForm.svelte` and `EditableLogForm.svelte` expose competition/card/record controls when enabled.
- `SessionCard.svelte`, session detail, analytics, and AIDA import already display or consume some competition fields.
- The dynamic recorder already has an `ended` phase where the dive timer is frozen but recording continues for surface protocol footage.

Current gaps:

- Card color exists, but reason codes are not modeled.
- Penalties and DQ reasons are not structured data.
- AP, SP completion timing, and airway status are not represented.
- Official competition scoring is not separated from raw performance.
- There is no distinction between ordinary training and AIDA competition-protocol practice.

## Proposed Data Model

Prefer a nested AIDA competition object on `RoutineLog`, while preserving existing top-level fields for compatibility and simple display.

```typescript
type CompetitionCard = 'white' | 'yellow' | 'red';
type AidaAttemptMode = 'official-competition' | 'protocol-practice';

type AidaPenaltyCode =
  | 'EARLY_START'
  | 'LATE_START'
  | 'UNDER_AP'
  | 'START'
  | 'TURN'
  | 'PULL';

type AidaDisqualificationCode =
  | 'DQBO'
  | 'DQSP'
  | 'DQAIRWAYS'
  | 'DQTOUCH'
  | 'DQ_LATE_START'
  | 'DQOTHER';

interface AidaPenalty {
  code: AidaPenaltyCode;
  occurrences?: number;
  seconds?: number;
  meters?: number;
  points?: number;
  note?: string;
}

interface AidaDisqualificationReason {
  code: AidaDisqualificationCode;
  details?: string[];
  note?: string;
}

interface SurfaceProtocolResult {
  elapsedSeconds?: number;
  completed?: boolean;
  notes?: string;
}

interface AidaCompetitionAttempt {
  mode: AidaAttemptMode;
  discipline: 'STA' | 'DYN' | 'DYNB' | 'DNF';
  startOffsetSeconds?: number;
  announcedPerformanceSeconds?: number;
  announcedPerformanceMeters?: number;
  realizedPerformanceSeconds?: number;
  realizedPerformanceMeters?: number;
  rawPoints?: number;
  penaltyPoints?: number;
  finalPoints?: number;
  card?: CompetitionCard;
  penalties?: AidaPenalty[];
  disqualificationReasons?: AidaDisqualificationReason[];
  surfaceProtocol?: SurfaceProtocolResult;
  recordTag?: RecordTag;
  judgeNotes?: string;
}
```

Compatibility behavior:

- Keep writing `isCompetition` for filtering, but only for official AIDA competition results. Protocol-practice attempts should be treated as training in PB charts and competition filters.
- Mirror `aidaCompetition.card` to `cardTag` until all UI reads the nested model.
- Mirror `aidaCompetition.recordTag` to `recordTag`.
- Keep reading `compeitionOrg`; expose AIDA as the only first-pass organization in the UI.

Fields intentionally excluded from the first pass:

- CMAS organization support.
- Required OT storage.
- Pool length inside the competition panel.
- Facial-gear setup fields.
- Record eligibility as a required UI/data field.

## Pure Domain Helpers

Add a feature-local module, likely `src/lib/competition/aida.ts`, with tests.

- `scoreAidaPerformance(attempt)` returns raw points, penalty points, and final points.
- `deriveAidaStartPenalty(startOffsetSeconds)` calculates early/late start penalties from an `OT -3s` / `OT +14s` style offset, while manual penalty entry remains allowed.
- `deriveUnderApPenalty(discipline, ap, rp)` calculates `UNDER_AP` only when AP is present.
- `deriveCardFromOutcome({ penalties, disqualificationReasons })` proposes white/yellow/red while still allowing manual judge override.
- `competitionCompatibilityFields(attempt)` produces legacy summary fields for current UI.
- `dqOtherReferenceItems(discipline)` returns the help-list entries shown behind the `?` affordance without turning them into saved enum values.

## UX Plan

### Entry Points

- Quick Log defaults to `Training`.
- For max-attempt routines, show `Official AIDA Competition` as a distinct log context.
- AIDA protocol practice uses the same nested AIDA attempt object with `mode: 'protocol-practice'`, but it remains training rather than being marked as an official competition.
- Selecting official AIDA competition reveals an AIDA competition card/tile inside Quick Log.
- Record flow can offer `Record AIDA attempt` for dynamic max-attempt routines.
- Metric-only flow can use the same attempt shell without camera for STA or poolside dynamic logging.

Competition is a log/attempt context, not a routine-builder concept.

### Before Attempt

Collect only the values needed before the dive:

- discipline, reused from the existing quick-log or record-dive form rather than adding a new competition-specific input;
- optional AP, as time for STA or distance for dynamic;
- official AIDA competition flag;
- video on/off.

AP is optional. If AP is blank, the user can still manually add `UNDER_AP` later if needed.

Offer an optional two-minute countdown in the record/attempt flow, not in the Quick Log form. Quick Log should instead allow entering the start relative to OT, for example `OT -3s` or `OT +14s`, so early/late penalties can be calculated without storing an official clock time.

### During Attempt

STA metric-only mode:

- Start timer at airway submersion.
- End timer when airway breaks surface.
- Start the SP timer immediately when the dive ends.
- Stop the SP timer when the user taps `SP complete`.

Dynamic video mode:

- Reuse the existing recorder for start, waypoints, auto-advance, and end.
- Add optional countdown context only if the user starts it.
- Keep recording after `End dive`; show a reminder to capture SP and the card/verdict.
- Start the SP timer when the dive ends and stop it when the user taps `SP complete`.

Dynamic metric-only mode:

- Use a simplified distance/time input surface with AP, RP, start/turn/pull occurrence counts, and card outcome.
- Start the SP timer when the dive ends and stop it when the user taps `SP complete`.

### Surface Protocol Capture

After airway emergence:

- Show an SP timer based on the researched 15 second rule.
- Show a reminder checklist for equipment removal, visible OK, and verbal OK.
- Do not require live checklist taps for each SP step.
- If SP was not completed correctly, the user records that in the verdict section by selecting red card -> `DQSP`.
- `DQSP` should then reveal detail options such as double OK, repeated OK, missed verbal OK, wrong order, too slow, or extra cue/motion.
- Other red-card categories should reveal their own detail options, for example `DQAIRWAYS` for airway dip and `DQBO` for blackout.
- In video mode, remind the user to keep filming until after the card decision; do not force this through app state.

### Verdict And Review

- Select card: white, yellow, red.
- If yellow is selected, reveal penalty reasons and quantities.
- If red is selected, reveal DQ reason groups. Most groups reveal detail options; `DQOTHER` reveals a free-text reason field and a `?` reference list.
- Show RP, raw points, penalty points, and final points.
- Allow judge notes.
- Require card color before saving an official AIDA competition log to history.
- Save as a routine log linked to video if present.

PB and analytics decisions:

- AIDA protocol-practice attempts are training attempts. They can affect PBs like other training max attempts, but should not be displayed as official competitions.
- AIDA protocol-practice attempts should still use the nested `aidaCompetition` object with `mode: 'protocol-practice'` so scoring, SP timing, and card data share one model.
- Red-card attempts should remain visible in PB/history charts, clearly marked as red-card attempts.
- Yellow-card final points should be available in competition analytics, while raw RP remains available for training analytics.

### Imported AIDA Results

If an imported AIDA spreadsheet contains only card color or record tags, reason-code fields should remain empty. The user can optionally complete those fields later when editing the result card.

## Implementation Plan

1. Add AIDA competition domain types and nested `aidaCompetition` or `competitionAttempt` on `RoutineLog`.
2. Add pure AIDA scoring and validation helpers with Vitest coverage.
3. Add a read model that normalizes old top-level fields and new nested competition data.
4. Update `RoutineLogFormData` and Firestore create/update paths to preserve old fields and save nested data.
5. Refactor quick-log and edit-log competition controls into a richer shared component.
6. Add optional two-minute countdown support to the record/attempt flow and start-offset entry to Quick Log.
7. Add metric-only attempt flow for STA and dynamic.
8. Extend the dynamic recorder route to accept AIDA competition context and show SP/verdict reminders.
9. Update session card, session detail, analytics filters, and AIDA import mapping to use the read model.
10. Add migration/backfill or lazy normalization for existing `isCompetition`, `cardTag`, `recordTag`, and `compeitionOrg` logs.

## Affected Code Surfaces

- `src/lib/types.ts` — AIDA competition attempt types and routine log fields.
- `src/lib/firestore.ts` — create/update/read normalization.
- `src/lib/components/QuickLogForm.svelte` — max-attempt competition controls.
- `src/lib/components/EditableLogForm.svelte` — edit existing competition result.
- `src/lib/components/forms/CompetitionToggle.svelte` — likely replace or expand.
- `src/routes/(app)/dives/+page.svelte` — log submission mapping.
- `src/routes/(app)/dive/record/[id]/+page.svelte` — video attempt metadata, SP timer, and reminder text.
- `src/lib/capture/recorderState.ts` and selectors — possibly labels/reminders only; avoid changing core timing unless needed.
- `src/lib/capture/timeline.ts` — preserve SP video tail; likely already supports this.
- `src/lib/components/SessionCard.svelte` — card/code/result badges.
- `src/routes/(app)/session/[id]/+page.svelte` — competition detail section.
- `src/routes/(app)/analytics/+page.svelte` — official/practice/card filters and red/yellow-card display.
- `src/routes/(app)/import/aida/+page.svelte` — map imported results into nested AIDA competition attempts.

## Open Questions

None currently. The last two open decisions are resolved:

- AIDA protocol practice uses the same nested `aidaCompetition` object with `mode: 'protocol-practice'`.
- `DQOTHER` uses free text, with a `?` help affordance showing the complete reference list.

## TODO

- [ ] Re-check the 15 second SP time limit and code vocabulary against the latest official AIDA source before implementation.
- [x] Add AIDA competition domain types and pure scoring helpers.
- [x] Add tests for STA scoring, dynamic scoring, AP/RP penalties, optional countdown start penalties, card derivation, and red/yellow analytics behavior.
- [x] Create a normalized competition read model for old and new logs.
- [x] Design the Quick Log competition card/tile.
- [x] Design the SP timer and reminder checklist.
- [x] Design yellow-card penalty controls and red-card grouped DQ controls.
- [x] Implement metric-only STA competition attempts.
- [x] Implement metric-only dynamic competition attempts.
- [x] Extend dynamic video recording with AIDA context, SP timer, and reminder text.
- [x] Update quick log and edit log to use the shared AIDA competition model.
- [x] Update session card/detail displays.
- [x] Update analytics displays and filters.
- [x] Update AIDA import to populate nested AIDA competition attempts with blank editable reason fields.
- [ ] Add a dry-run backfill for old competition logs if needed.
