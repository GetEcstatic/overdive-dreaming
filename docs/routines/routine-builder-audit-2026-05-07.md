
# 1. Tom's current steps to carry out
First review gate steps:

1. Open `http://127.0.0.1:5173/routines/layer-prototype`.
2. Sign in if you get bounced to the landing page. The route is still inside the authenticated app group.
3. For each routine card, click through the five segment cards:  
    [Discipline](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html), `Breathe-up`, `Dive`, `Setup`, `Reps`.
4. Check whether the selected segment editor underneath feels like the right mental model:  
    segment first, then only relevant modifier controls.
5. Try these edits:
    - Dynamic Max: switch discipline between `DYN`, `DNF`, `TORT`.
    - Dynamic Max: toggle [Discipline](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html) lock and confirm the chip/segment lock state changes.
    - Static 2-Breath: click `Dive`, change duration from fixed to open and back.
    - Dry RV Table: click `Setup`, change `RV` to `FRC` and `dry` to `both`.
    - Sweet 16: click `Reps`, change repeat count and confirm expanded rows update.
6. Use `Reset fixtures` to confirm the prototype snaps back cleanly.
7. Main question to answer: does this segment/modifier editor feel like the right direction before adding richer modifier types like breath-count breathe-up, endpoint conditions, repeat shapes, equipment, and safety constraints?

*Tom's response:
First something to address for the STA 2-breath routine. I think this routine would benefit from having two layers. The reasons for this is the initial breathe-up is typically long (3-4 minutes) while the subsequent breatheups are short (enough for 2-breath only, typically 30s or so). We should have a layer that includes the initial breathe-up time, and a layer that has the subsequent repeated short breathe-ups.

*Next: on the UI:*
- *The pills used to represent the modifiers for each segment are a little confusing. For example currently we have "Default discipline" in one pill and "default STA" in the adjacent pin. these look like separate things when the meaning is actually: "Default discipline = STA"*
  
- *I think colour could be used to increase clarity, perhaps by colouring modifier pill box fills to show what modifier group they belong to.* 
- *I desktop mode, the pill boxes overflow the segment cards which is messy. This needs to be sorted.*
- *There's a lot of information on the screen all at once for a single layer. I'm wondering how to reduce the clutter. I think users will panic if they see this at present.*

## 1.1 Recommendation for compact multi-layer overview

I agree with the direction: multi-layer routines need a layer overview first, with segments revealed only for the selected layer. The current segment row works as an editor surface, but it should not be the always-visible overview once routines have more than one layer.

Recommended shape:

- Show a compact vertical layer list for each routine.
- Each layer row should have a human name, a short generated summary, a rep count, and a few tiny segment indicators.
- Clicking a layer opens that layer's five segment cards and modifier editor.
- On mobile, keep only one layer expanded at a time by default.
- On desktop, it is acceptable to allow more than one expanded layer later, but start with one selected layer to keep the mental model simple.

Layer naming is worthwhile. It teaches users that layers are meaningful routine phases, not just technical rows. For the Static 2-Breath fixture, use names like:

- `Initial breathe-up and hold`
- `2-breath reps`

Better suggestion: combine explicit names with generated fallback labels. The data model can allow an optional `name`, while the UI can still generate a fallback when no name is supplied, such as `Layer 2 · 9 reps · STA · 0:30 breathe-up`. That avoids forcing every user to name every layer before the prototype has proved the flow.

Implementation plan for the next pass:

- Add optional local-only layer names to the fixture/model surface if the existing type can accept them cleanly.
- Give the Static 2-Breath layers the two example names above.
- Replace the always-expanded per-layer segment rows with a compact layer overview.
- Keep selected layer state separate from selected segment state: routine > layer > segment.
- Render segment indicators in the collapsed layer row as small labeled status markers, not full cards.
- Show the full five segment cards only for the selected layer.
- Preserve the existing selected segment editor panel underneath the expanded layer.
- Validate on mobile-width CSS specifically, because this change is mainly about scroll length and orientation.

Decision: implement this before adding richer modifier types. It addresses information architecture and mobile density, which are more foundational than adding breath-count or endpoint modifiers.

## 1.2 Implementation plan from first review gate

### 1.2.1 Decision summary

- Continue with the segment-first editor direction.
- Fix clutter before adding richer modifier types.
- Treat the STA 2-breath routine as the first example of a multi-layer routine, because it reveals an important real-world distinction: initial preparation breathe-up vs repeated recovery breathe-ups.
- Keep all work local-only and fixture-backed. No persistence, no Firestore writes, no production builder replacement.

### 1.2.2 Step 1: Make Static 2-Breath a two-layer fixture

Goal: the prototype should show that a routine can have different breathe-up rules in different layers.

Planned fixture shape:

- Layer 1: `STA`, single rep, long initial breathe-up, fixed hold duration.
- Layer 2: `STA`, repeated reps, short two-breath recovery / breathe-up, fixed hold duration.

Concrete default values to start with:

- Layer 1 breathe-up: fixed 4:00.
- Layer 1 dive duration: fixed 1:30.
- Layer 1 repeat count: 1.
- Layer 2 breathe-up: fixed 0:30.
- Layer 2 dive duration: fixed 1:30.
- Layer 2 repeat count: 9, preserving the existing total of 10 holds.

Implementation notes:

- Update `staticTwoBreathTableExample` in the layer fixtures.
- Add tests proving the example expands into 10 loggable rows across two source layers.
- Keep this as fixture/model work only. Do not alter production routine templates yet.

### 1.2.3 Step 2: Change modifier pills to single key-value chips

Problem: the current chip layout makes `Default discipline` and `default STA` look like two neighboring concepts.

Plan:

- Render each modifier as one text unit: `Default discipline = STA`, `Selection mode = fixed`, `Duration = fixed 1:30`.
- Keep label and value visually distinct inside the same chip, but remove the feeling that they are separate pills.
- Update the sentence view model if helpful so the UI receives `label`, `operator`, and `value` rather than composing this ad hoc in Svelte.
- Add/update tests for the displayed modifier label/value strings.

### 1.2.4 Step 3: Add color grouping carefully

Goal: use color to clarify grouping, not decorate the page.

Plan:

- Color modifier chip fills by segment group:
  - Discipline: blue.
  - Breathe-up: teal.
  - Dive: cyan.
  - Setup: amber/green.
  - Reps: violet.
- Use restrained low-opacity fills and consistent borders so the page does not become noisy.
- Keep locked state as a separate visual layer: outline/lock text, not a competing color language.

### 1.2.5 Step 4: Fix desktop overflow

Problem: modifier chips overflow segment cards.

Plan:

- Ensure every segment card has `min-width: 0` and every chip has `max-width: 100%`.
- Let chip text wrap inside the chip instead of forcing the card wider.
- Prefer a vertical stack of modifier chips inside each segment over a dense wrapped row on desktop.
- Keep the five segment cards in a horizontal row on wider screens, but prevent any card content from escaping its boundaries.
- Re-run `npm run check` and inspect the prototype at desktop width.

### 1.2.6 Step 5: Reduce first-screen clutter

Problem: showing every modifier detail for every layer makes the editor feel intimidating.

Plan:

- Make each segment card show only:
  - segment label,
  - one plain-language summary,
  - lock state.
- Move the full modifier chips into the selected segment editor panel below the row.
- Keep the selected segment visually obvious.
- Keep metrics/tags/expanded rows collapsed by default.
- For multi-layer routines, preserve one row per layer but keep each row compact.

### 1.2.7 Step 6: Commit and review

Validation checklist after implementation:

- Static 2-Breath shows two authoring layers and still expands to 10 loggable rows.
- Segment cards no longer overflow on desktop.
- Modifier chips read as `label = value`.
- The default view is calmer: segment cards summarize, editor panel reveals detail only for the selected segment.
- Focused Vitest tests pass.
- `npm run check` has 0 errors, with only existing unrelated warnings.

Commit plan:

- Commit fixture/model changes separately from UI cleanup if the diff is large.
- Suggested commit messages:
  - `Split static two-breath layers`
  - `Simplify layer modifier display`

### 1.2.8 Recommendation: dive recording links for dynamic max layers

Yes: any routine with a dynamic max attempt layer should expose an option to link a dive recording. I would not treat this as a tracked metric combination. It is better modeled as a media attachment capability derived from the layer shape.

Recommended split:

- In the routine/layer builder, show that a layer can request or allow a recording link.
- In the actual logging/session flow, attach the recording to the expanded result row for that attempt.
- In the media/video system, keep the recording object independent and link it by ID/reference.

Why this belongs partly in the builder:

- The builder knows the intent: `dynamic` discipline plus `max-attempt` role.
- A coach may want to prescribe that a max attempt should be recorded.
- The layer overview can show a small capability marker such as `recording optional` or `recording required`.

Why the final link should live on the result row, not only the template:

- The actual video belongs to a completed attempt, not to the reusable routine template.
- A repeated or multi-layer routine may produce several expanded rows, but only some attempts may have recordings.
- Keeping the media reference on the result row avoids duplicating or mutating the template when an athlete logs a session.

Suggested modifier shape for later:

- Segment: probably `Dive`, because recording is attached to the dive attempt itself.
- Modifier: `Recording link` with values like `none`, `optional`, `required`.
- Dependency: dynamic discipline group and max-attempt layer role.

Decision for now: record this as a layer modifier/capability idea, but do not implement it before the basic segment/layer editor feels settled. This is not a tracked metric matrix item.

### 1.2.9 Target modes, wheel inputs, and dynamic environment rules

Decision: keep a technical distinction between `open` and absent targets in the model, but remove user-facing `none` / `no fixed` choices from the editor where a target is applicable.

Meaning:

- `open distance` or `open duration`: this target matters for the layer, but the exact value is supplied at log time.
- absent distance/duration: the target is not applicable to this layer shape, such as static distance.

Implementation direction:

- The editor should show only `open` and `fixed` for applicable distance/duration targets.
- Static layers should not show a distance target control.
- Dynamic layers should default missing distance/duration targets to open when edited, not expose a `no target` choice.
- Fixed duration values should display as `mm:ss` everywhere in the prototype.
- Fixed duration editing should use the existing duration wheel selector.
- Fixed distance and repeat count editing should use the existing number wheel selector.
- Dynamic-discipline layers should only offer `wet` for environment. `dry` and `both` are static-only in this prototype.

Layer adding: leave add/remove/reorder layer controls for the proper routine-builder pass. The current prototype can keep proving the layer/segment/modifier editor using fixed fixture layers.

### 1.2.10 Roadmap toward deployed implementation

Next steps should move from local prototype to deployed app in small slices, with the layer/modifier model becoming production-capable before replacing the current routine builder.

Recommended order:

1. Promote the layer model into a versioned routine-template shape.
2. Add adapter functions between existing saved routines and the new layer shape.
3. Build the production routine-builder layer editor using the prototype interaction model.
4. Add layer add/remove/reorder controls in the production builder.
5. Connect routine logging to expanded layer rows.
6. Store athlete results against expanded result rows, not compact authoring layers.
7. Add dynamic max recording-link capability as a `Dive` modifier once logging rows exist.
8. Deploy behind a feature flag or developer-only route before replacing existing builder flows.

Slice 1: production data contract.

- Add a schema version to routine templates, for example `routineTemplateVersion: 2`.
- Store compact authoring layers with `id`, `name`, `discipline`, targets, setup attributes, repeat count, locks, and modifier/capability fields.
- Keep the current routine fields readable so existing app screens do not break.
- Add pure validation and projection tests before any Firestore write path changes.

Slice 2: compatibility adapters.

- Existing routines should project into layer fixtures for display/editing where possible.
- New layer routines should project back into the existing display/logging assumptions until the full logging flow is replaced.
- Adapter failures should be explicit and visible in developer tools, not silently guessed.

Slice 3: production builder integration.

- Move the compact layer overview, selected layer expansion, segment editor, layer naming, wheel inputs, and static-only dry environment rule into the real builder surface.
- Add real layer add/remove/reorder controls here, not in the local prototype.
- Keep `open` vs absent target logic in the data model, but show only user-facing choices that make sense for the selected discipline.

Slice 4: logging flow integration.

- Expand compact authoring layers into planned log rows when an athlete starts a routine/session.
- Preserve source layer IDs so results can be grouped back into meaningful layers.
- Store actual discipline, duration, distance, setup changes, locks, and completion state on result rows.

Slice 5: media/capability integration.

- Add `recordingLink` or similar as a `Dive` modifier/capability for dynamic max attempt layers.
- Let the builder mark the capability as optional/required.
- Attach actual media references to result rows during logging or after upload, not to the reusable template.

Slice 6: rollout and cleanup.

- Ship the new builder behind a feature flag or admin/developer-only switch.
- Seed/update default routines using the new layer shape.
- Test existing routine send/duplicate/edit flows against both old and new templates.
- Only after logging and compatibility are stable, make the new builder the default and retire the prototype route.

Immediate next implementation slice: build the production data contract and adapters. That is the safest bridge from prototype to deployed app because it lets UI and logging move independently without forcing a Firestore migration too early.

Progress - 2026-05-08:

- [x] Added a pure versioned layer routine contract: `routineTemplateVersion: 2` plus compact authoring layers and derived layer metadata.
- [x] Added a helper to attach the v2 layer contract to existing `RoutineTemplate` objects without removing existing fields.
- [x] Added a unified layer reader that returns stored v2 layers when present and projects legacy routines otherwise.
- [x] Added a legacy projection helper so compact layers can still feed current routine display/logging assumptions while production logging is replaced later.
- [x] Added tests for v2 contract creation, validation, legacy fallback, and legacy projection.
- [x] Validation: focused routine layer tests pass, including the new contract tests.
- [x] Validation: `npm run check` reports 0 errors and the existing 101 warnings.

Next roadmap step:

- [x] Decide the first production integration point for reading v2 layer contracts without writing them to Firestore yet.
- [x] Added a pure `RoutineLayerReadModel` that resolves either stored v2 layers or legacy projections into the same layer/read shape.
- [x] Added a read-only Firestore helper, `getRoutineLayerReadModel`, beside `getRoutine` so deployed surfaces can begin reading layer models without changing create/update paths.
- [x] Added tests for v2 read models, legacy read models, and dynamic max recognition through the read projection.
- [x] Validation: focused routine layer tests pass with 32 tests across model, legacy, contract, read model, sentence, and modifiers.
- [x] Validation: `npm run check` reports 0 errors and the existing 101 warnings.

Next roadmap step:

- [x] Start consuming the read model from a developer-only or feature-flagged production surface before writing v2 layer templates.
- [x] Added an admin-only layer read-model status section to the production routines list.
- [x] The routines page now summarizes each loaded routine as `v2 template` or `legacy projection`, with layer count, expanded row count, and validation status.
- [x] The production surface consumes `buildRoutineLayerReadModel` from already-loaded routines and does not change routine create/update/delete paths.
- [x] Validation: focused routine layer tests pass with 32 tests.
- [x] Validation: `npm run check` reports 0 errors and the existing 101 warnings.

Next roadmap step:

- [x] Add a developer/admin entry point from the read-model status rows into a focused per-routine layer inspection view.
- [x] Added `/routines/[id]/layers` as an admin-only, read-only routine layer inspection page.
- [x] Linked each admin read-model status row on the routines page to the inspection page for that routine.
- [x] The inspection page loads one routine, builds its `RoutineLayerReadModel`, and shows source, validation status, selectable layers, expanded rows, and legacy display projection.
- [x] The inspection route is still read-only and does not change routine write paths.
- [x] Validation: focused routine layer tests pass with 32 tests.
- [x] Validation: `npm run check` reports 0 errors and the existing 101 warnings.

Next roadmap step:

- [ ] Use the inspection view to compare legacy projections against real routine displays and identify any projection gaps before enabling v2 writes.

## 1.3 Current modifier-only checklist

This is the current checklist to use. Ignore the older tracked-metric sections for now; they are useful background but not the active implementation track.

Implementation did not stop because of a product decision. The only pause was operational: `yebo next` could not connect to its websocket server, and the authenticated prototype route cannot be visually inspected without login state. There is nothing Tom needs to decide before the next local-only modifier prototype step.

### 1.3.1 Where we are now

- [x] The layer model exists locally as plain data and pure transforms.
- [x] The five default routine fixtures exist in the new model.
- [x] Legacy routines can be projected into the layer model for read-only comparison.
- [x] `/routines/layer-prototype` exists as a read-only inspection surface.
- [x] Persistence strategy is adapter-only for now: no Firestore migration, no production writes, no builder replacement yet.
- [x] The planning doc now has a clear modifier map for `Discipline > Breathe-up > Dive > Layer attributes > Reps`.
- [x] The planning doc now has a first-pass tracked-metric map and recommends derived metric profiles rather than raw per-layer metric picking. Park this for now.

### 1.3.2 Immediate implementation checklist

- [x] Review `/routines/layer-prototype` in-browser and note any mismatch between the layer sentences and Tom's mental model. Visual review remains limited by auth redirect, but source/model review is done.
- [x] Add a compact layer-sentence view model, derived from `RoutineAuthoringLayer`, for UI rendering only.
- [x] Add tests for the layer-sentence view model using the five default fixtures.
- [x] Extract modifier definitions into plain data: segment, label, allowed disciplines/groups, dependencies, default, and lockability.
- [x] Add tests proving modifier definitions can be extended without changing the row renderer.
- [x] Add a read-only UI prototype for one layer row using the sentence grammar: `Discipline > Breathe-up > Dive > Layer attributes > Reps`.
- [x] Add fixture examples for edge-case modifier combinations before making the editor interactive: static duration-only, dynamic distance+duration, dry RV, repeated table, dynamic-family selectable. Covered by the five default fixtures for now.
- [x] Turn the row prototype into an interactive local-only editor for fixture data.
- [x] Keep the editor non-persistent until the layer row, modifier tray, locks, and repeat behavior feel right in the browser. Current prototype mutates only `$state` fixture clones and has a reset button.
- [ ] Review the local editor while authenticated and decide whether the segment controls feel right enough to continue toward richer modifier types.

### 1.3.3 UI design checklist

- [x] Decide the visible label for `Layer attributes`: use `Setup`, with `Attributes` reserved for data/model language.
- [x] Decide whether `Ingredients` appears in the UI or remains internal design language. Keep `Ingredients` internal.
- [x] Design the main row as stable segments, not a raw form: `Discipline`, `Breathe-up`, `Dive`, `Setup`, `Reps`.
- [x] Design modifiers as small chips attached to their segment, not as a giant global checklist.
- [x] Design segment-first editing: tap a segment, open only the valid modifier controls for that segment.
- [x] Include lock controls in the segment editor, not as a separate advanced page.
- [x] Show defaults, allowed alternatives, and locked status distinctly.
- [x] Keep repeat expansion visible enough that a coach understands `repeat 16x` becomes 16 loggable rows.

### 1.3.4 Hold before production replacement

- [ ] Do not replace the existing routine builder until the local row editor is reviewed.
- [ ] Do not write the new layer shape to Firestore until the persistence decision is revisited.
- [ ] Do not migrate existing routines or logs until projection has been tested against real seeded/user routines.
- [ ] Do not make tracked metrics a manual per-layer matrix; continue deriving them from layer construction and modifier data.

Current status:

- Worktree is clean.
- Dev server is running at `http://127.0.0.1:5173/`.
- Latest commits include:
    - `0ea4e6a` Add layer modifier definitions
    - `c756cf8` Show labeled layer modifiers
    - `0a4c10c` Add local layer modifier editor
    - `1a1ca0e` Show layer repeat expansion
    - `1a17644` Add prototype fixture reset
    - `bed04e5` Update modifier prototype checklist

I attempted `yebo next`, but the websocket server is still returning `Connection refused`.

- 

GPT-5.5 • 7.5x



# Routine Builder Audit - 2026-05-07

# Tom's thoughts

## Dive layer map

Sentence grammar for one layer:

`Discipline > Breathe-up > Dive > Layer attributes > Reps`

### Layer meta-language

| Term             | Meaning                                              | Notes                                                                                        |
| ---------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Routine          | The saved training prescription.                     | A routine is an ordered sequence of one or more layers.                                      |
| Layer            | One authored row in the routine table.               | A layer can be completed once or repeated many times.                                        |
| Segment          | One major part of the layer sentence.                | The current segments are `Discipline`, `Breathe-up`, `Dive`, `Layer attributes`, and `Reps`. |
| Modifier         | A selectable option that changes one segment.        | Examples: `open duration`, `FL`, `max`, `wet`, `repeat 16x`.                                 |
| Default          | The planned value the routine starts with.           | Example: default discipline `DYN`; default lung volume `FL`.                                 |
| Freedom          | The allowed log-time alternatives.                   | Example: dynamic-family selectable between `DYN`, `DYNB`, `DNF`, and `TORT`.                 |
| Lock             | Whether the athlete can change a value when logging. | Coaches can lock prescribed layer parts.                                                     |
| Authoring layer  | The compact row stored on the routine template.      | Keeps `repeat 16x` as compact intent.                                                        |
| Expanded rep row | A loggable row created from repeats.                 | A repeated layer becomes individual rep rows when logging.                                   |
| Result row       | The athlete's actual completed row.                  | Stores actual choices and outcomes against the expanded rep row.                             |

### Segment modifiers

This table intentionally ignores tracked metric combinations. It maps only the planned modifiers that can change the layer sentence.

| Segment | Modifier family | Possible modifiers | Applies to | Notes |
| ------- | --------------- | ------------------ | ---------- | ----- |
| Discipline | Static discipline | `STA` | Static | Duration-only dive target. |
| Discipline | Dynamic official discipline | `DYN`, `DYNB`, `DNF` | Dynamic | Can use distance, duration, or both. |
| Discipline | Dynamic training discipline | `TORT` | Dynamic training | Tortuga crawl; treated like dynamic for target shape. |
| Discipline | Discipline family | `static-family`, `dynamic-family`, `any-discipline` | Authoring / log-time selection | Use when the routine prescribes a family but lets the athlete choose the exact discipline at log time. |
| Discipline | Selection mode | `fixed discipline`, `selectable at log time` | All disciplines | Pairs with lock controls. |
| Breathe-up | Presence | `no prescribed breathe-up`, `prescribed breathe-up` | All layers | `no prescribed` means the layer does not constrain this segment. |
| Breathe-up | Duration mode | `open duration`, `fixed duration` | All layers | `open` means breathe up as needed and log actual duration if that metric is enabled later. |
| Breathe-up | Breath-count mode | `fixed breath count`, `open breath count` | Tables / 2-breath style routines | Useful when the prescription is breath count rather than seconds. |
| Breathe-up | Rest relationship | `breathe-up before dive`, `rest between reps`, `recovery after rep` | Repeated or table routines | Needs explicit naming when a table has both planned rest and actual breathe-up. |
| Dive | Static target | `open duration`, `fixed duration` | `STA` | Static has no distance target. |
| Dive | Dynamic distance target | `open distance`, `fixed distance` | `DYN`, `DYNB`, `DNF`, `TORT` | A dynamic layer can focus on distance. |
| Dive | Dynamic duration target | `open duration`, `fixed duration` | `DYN`, `DYNB`, `DNF`, `TORT` | A dynamic layer can focus on time under apnea. |
| Dive | Combined dynamic target | `distance only`, `duration only`, `distance + duration` | `DYN`, `DYNB`, `DNF`, `TORT` | Allows max distance, max time, pace-style, or constrained-table prescriptions. |
| Dive | Endpoint condition | `technical stop`, `coach signal`, `athlete discretion`, `until fail`, `until target reached` | All layers | Describes when the dive segment ends without prescribing the tracked result metrics. |
| Layer attributes | Lung volume | `FL`, `FRC`, `RV` | All layers | Always selected; default `FL` unless changed. |
| Layer attributes | Environment | `wet`, `dry` | All layers | May be routine-wide default with layer override. Dry preserves Stamina CSV/import and future sensor capture paths. |
| Layer attributes | Effort | `none`, `max`, `submax`, `standard` | All layers | Optional; many layers can leave effort unset. |
| Layer attributes | Equipment / mode | `fins`, `bifins`, `no fins`, `crawl`, `facial gear`, `pool bottom` | Dynamic / context-specific | Some are implied by discipline, but may still matter for unofficial or technique work. |
| Layer attributes | Safety / competition constraint | `training`, `competition`, `white-card rules`, `coach-supervised` | All layers | Modifier of the prescription, not a result metric. Card colour remains log-time result annotation. |
| Layer attributes | Editability | `locked`, `unlocked`, `coach default`, `athlete override allowed` | All segments | Can be modeled globally or per segment. |
| Reps | Repeat count | `single`, `repeat N times` | All layers | Authoring stays compact; logging expands into rep rows. |
| Reps | Repeat shape | `uniform`, `progressive`, `pyramid`, `custom table` | Repeated layers | Uniform repeats reuse one layer; the others may need row-specific values. |
| Reps | Completion rule | `complete all`, `until fail`, `until coach stops`, `until athlete stops` | Repeated layers | Describes when the repeated sequence ends. |

### Compact map

| Layer segment | Core choices | Freedom choices | Lockable? |
| ------------- | ------------ | --------------- | --------- |
| Discipline | `STA`; `DYN`; `DYNB`; `DNF`; `TORT`; discipline family | Fixed exact discipline; selectable family at log time | Yes |
| Breathe-up | None; open duration; fixed duration; open breath count; fixed breath count | Athlete chooses actual duration/count; coach prescribes exact duration/count | Yes |
| Dive | Static duration; dynamic distance; dynamic duration; dynamic distance + duration | Open target; fixed target; endpoint condition | Yes |
| Layer attributes | Lung volume; environment; effort; equipment/context; competition/safety constraint | Athlete may confirm or override unlocked defaults | Yes |
| Reps | Single; repeat N; uniform/progressive/pyramid/custom table | Stop rule and row-specific variation where needed | Yes |

### Validity notes

- `STA` layers can only have duration dive targets.
- `DYN`, `DYNB`, `DNF`, and `TORT` layers can have distance targets, duration targets, or both.
- Lung volume should always be present, defaulting to `FL`.
- Environment can probably live as a routine default with layer-level overrides.
- `max`, `submax`, and `standard` should be selectable intent modifiers, not separate routine types.
- Repeated authoring layers should expand into individual rep rows when a log is created.
- The builder should model defaults, allowed alternatives, and locks separately so coach intent and athlete reality can both be preserved.

## Tracked metric map

The important product decision: users should not assemble metric combinations by hand for every layer. The builder should derive a generous metric set from the layer construction, then let the user remove anything irrelevant. The quick log form can progressively reveal the result through grouped headings and a standard/geek-mode filter.

Codebase mining found four overlapping metric vocabularies:

| Source | What it contains | Planning implication |
| ------ | ---------------- | -------------------- |
| `TrackingConfig` in `src/lib/types.ts` | Boolean flags such as `trackTotalDistance`, `trackPerRepSpO2`, `trackFVC`, `trackBreatheUpType`. | Current routine templates already decide which inputs the form shows. |
| `RoutineLog`, `LapData`, and `RepEditorData` in `src/lib/types.ts` | Stored direct values such as `diveDuration`, `lowestSpO2`, `timeBelow70`, `hrMin`, `actualRest`. | This is the real persisted/result surface. |
| `MetricType` plus `getMetricValue()` in `src/lib/utils/metrics.ts` | Dashboard/display metrics, including calculated metrics such as `longestHold`, `totalBreaths`, and `avgSpeedMs`. | Display metrics are narrower than all tracked inputs today. |
| `CanonicalMetricKey` and `deriveMetricProfile()` in `src/lib/routineLayers/model.ts` | Newer layer-model metric vocabulary such as `durationSeconds`, `distanceMeters`, `spO2Series`, `timeBelowSpO2Threshold`. | This is the right direction: make a canonical metric registry and derive profiles from layers. |

Recommendation: create one canonical metric registry and treat the current `TrackingConfig`, quick-log inputs, dashboard metrics, and analytics metrics as views over that registry. Each metric should be plain data:

```ts
type MetricRevealLevel = 'standard' | 'geek';
type MetricValueKind = 'manual-input' | 'calculated' | 'imported' | 'recorder-seeded' | 'tag';
type MetricGroup = 'performance' | 'breathing' | 'technique' | 'health' | 'readiness' | 'context' | 'safety' | 'subjective' | 'competition' | 'media';

type MetricDefinition = {
  key: CanonicalMetricKey;
  label: string;
  group: MetricGroup;
  reveal: MetricRevealLevel;
  valueKind: MetricValueKind;
  appliesTo: {
    disciplines?: LayerDiscipline[];
    disciplineGroups?: DisciplineGroup[];
    environments?: TrainingEnvironment[];
    requiresRepeat?: boolean;
    requiresBiometrics?: boolean;
    requiresDynamicTarget?: boolean;
    requiresStaticTarget?: boolean;
  };
};
```

Then the builder should use pure transforms:

```ts
deriveMetricCandidates(layers, metricRegistry) -> all applicable metrics
deriveStandardMetrics(layers, metricRegistry) -> default visible metrics
deriveGeekMetrics(layers, metricRegistry) -> collapsed advanced metrics
deriveMetricInputPlan(selectedMetrics, captureSources) -> quick-log input groups
deriveDisplayMetricSuggestions(layers, selectedMetrics) -> hero / secondary / tertiary defaults
```

This keeps the system extensible: adding a new metric is adding one registry row plus optional calculation/import support, not editing every routine-builder branch.

### Mined metric inventory

| Group               | Standard candidates                                                                                                                          | Geek-mode candidates                                                                                | Calculated / imported candidates                                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Performance         | Duration; distance; reps completed; rep duration; rep distance; rest duration; total routine time; cumulative hold time; cumulative distance | Lap/rep time; time per lap; rest per lap; session duration; completion/skipped reps                 | Longest hold; total breath-hold time; total breathing/rest time; average time per rep/lap; total rep distance; fastest lap speed; slowest lap speed; average speed           |
| Breathing           | Breathe-up duration; breaths between reps; breathing technique                                                                               | Breathe-up type; hyper/hypoventilation level; urge to breathe; CO2 tremor onset; mental change time | Total breaths; lung volume loss per minute                                                                                                                                   |
| Technique           | Discipline used; lung volume; notes                                                                                                          | Kicks per lap; arm pulls per lap; equipment used; facial gear; per-rep lung volume                  | Speed per lap from recorder; lap splits from recorder                                                                                                                        |
| Health / biometrics | Minimum SpO2; minimum HR; end SpO2; recovery quality                                                                                         | Per-rep SpO2 min/avg; per-rep HR min/max/avg; HR series; SpO2 series; ETCO2; expired air post-hold  | Lowest SpO2; session average SpO2; session min HR; session max HR; time below 70/60/50/40%; time below selected SpO2 threshold                                               |
| Readiness           | Basal mood; hours since last meal; resting HR; HRV                                                                                           | Body weight; menstrual cycle day; FVC; FVC with packing; packing volume                             | Packing volume percent *(this is a subjective measurement based on feelings of 'fullness' where 100% is totally full and 0% is no packing)* and packed FVC if both are known |
| Context             | Pool length; pool type; wet/dry environment; water temperature; buddy name                                                                   | Location; time of day; sensor availability; import source                                           | Auto time of day (morning, afternoon, evening, night); recorder/import capture source                                                                                        |
| Safety              | Samba/BO outcome; safety notes                                                                                                               | Coach-supervised flag; recovery quality; wet buddy requirement                                      | Derived safety flags later, if rule-based warnings are added                                                                                                                 |
| Subjective records  | RPE; enjoyment; notes                                                                                                                        | Lucidity; contractions intensity; urge to breathe                                                   | Trend summaries later, not a logging input                                                                                                                                   |
| Competition / PB    | Competition flag; organization; card tag; record tag; PB flag                                                                                | Attempt category; breathing gas; gas mix; O2-assisted / RV / FRC category                           | PB detection; standard-vs-category PB classification                                                                                                                         |
| Media               | Photo; video URL                                                                                                                             | Performance video; biometric CSV                                                                    | Recorder-generated lap data; imported biometric rows                                                                                                                         |

### Dynamic layer metric defaults

Dynamic means `DYN`, `DYNB`, `DNF`, or `TORT`.

| Layer construction | Auto-selected standard metrics | Geek-mode additions |
| ------------------ | ------------------------------ | ------------------- |
| Any dynamic layer | Distance, duration, pool length, discipline used, lung volume, RPE, enjoyment, basal mood, buddy, safety outcome, notes | Water temperature, equipment, facial gear, breathing technique, hours since last meal, HRV, resting HR, body weight, FVC, packing volume |
| Dynamic with distance target | Planned/actual distance, total distance, cumulative distance when repeated | Distance per rep/lap, total rep distance, fastest/slowest lap speed |
| Dynamic with duration target | Planned/actual duration, total time, cumulative dive time when repeated | Time per lap/rep, average time per rep, session duration |
| Dynamic repeated layer | Reps completed, rest duration, total routine time | Lap splits, rest per lap, speed per lap, cumulative rest time |
| DNF layer | Same as dynamic baseline | Arm pulls per lap should become relevant by default in geek mode. |
| DYN / DYNB / TORT layer | Same as dynamic baseline | Kicks per lap or movement-specific technique fields. TORT may need a future crawl-specific technique metric. |
| Dynamic recorder-backed layer | Distance, duration, average speed if seeded | Lap times, lap distance, speed per lap, recorder source labels |

### Static layer metric defaults

Static means `STA`.

| Layer construction | Auto-selected standard metrics | Geek-mode additions |
| ------------------ | ------------------------------ | ------------------- |
| Any static layer | Duration, breathe-up duration, lung volume, wet/dry, RPE, enjoyment, basal mood, buddy when wet, safety outcome, notes | Breathing technique, contractions onset, hours since last meal, HRV, resting HR, body weight, FVC, FVC with packing, packing volume |
| Static repeated/table layer | Reps completed, rep duration, cumulative hold time, rest/breathe-up between reps | Average time per rep, total breathing/rest time, total breaths, per-rep notes |
| Dry static layer | Minimum SpO2, minimum HR, dry session flag, sensor/import source | Per-rep SpO2, per-rep HR, HR/SpO2 series, time below SpO2 thresholds, recovery quality |
| RV/FRC/O2-assisted static layer | Lung volume / attempt category, duration, safety outcome | Gas mix, ETCO2, expired air post-hold, lung volume loss per minute, end SpO2, lucidity, urge to breathe, contractions intensity |
| Static max layer | Duration, breathe-up, effort, PB/competition fields when selected | Minimum HR, minimum SpO2, contraction onset, recovery quality |

### Metric-selection UX

The routine builder should not ask, "Which metrics do you want?" from a raw list. It should show a derived checklist grouped by meaning:

| Reveal | Behavior |
| ------ | -------- |
| Standard | Checked by default, visible first, ordinary coach/athlete language. |
| Geek mode | Checked or suggested when strongly implied, collapsed under advanced headings. |
| Not applicable | Hidden unless the user opens an "add unusual metric" tray. |
| Calculated | Shown as selected outputs, not normal inputs, unless the calculation needs source fields. |
| Imported / recorder-seeded | Shown with source labels: manual, recorder, import, or either. |

Default policy:

- Select all applicable standard metrics automatically.
- Select geek metrics automatically only when the layer strongly implies them, such as dry static with biometrics.
- Let users remove metrics from the routine profile, but keep a way to restore recommended defaults.
- Store the chosen metric profile on the routine template and snapshot it into each log, so future metric-registry changes do not rewrite history.
- Keep calculated metrics tied to their source metrics. Example: `avgSpeedMs` needs distance and duration; `totalBreaths` needs reps and breath-count rule; `lowestSpO2` needs per-rep or series SpO2.
- Prefer adding new metrics to the registry over adding new bespoke `trackX` fields forever. Existing `TrackingConfig` can be generated from the registry for backward compatibility.

### Open design point

The codebase currently has three naming layers: old display `MetricType`, old `TrackingConfig` flags, and new `CanonicalMetricKey`. Before implementation, choose the canonical names and write adapters:

- `MetricDefinition.key` should use the canonical layer-model names.
- `toTrackingConfig(metricProfile)` can support the existing quick log form.
- `toDisplayMetricOptions(metricProfile)` can support dashboard hero/secondary selection.
- `toAnalyticsSeries(metricProfile)` can support future charts.

That gives the app the flexibility Tom wants: new metrics can be added within reason without exploding the builder into a painful per-layer matrix.


# Initial response to audit - done
Thank you for this thorough audit. It's very useful. I'm going to jot down some ideas that are not yet fully formed.

 I'm thinking the core of the routine builder should be the table builder. 
 
 The user builds this first. I think routines should be type agnostic (do away with the Max attempt, interval series & hybrid types) and subsequent steps for creating the routine be presented intelligently based on how the table is shaped.
 
  I also think routines could/should be discipline agnostic. It should be possible for a routine to contain elements of STA, DYN and DNF for example, in any order. For example a diver could begin a dive with a dynamic for the first lap, remove fins and continue in DNF for another lap, then hold for a static to finish.
  
  I'm imagining the table builder as a kind of cake, where the user designs each layer exactly as he/she wants and then builds the next layer. Cakes may have one layer or many many layers. 

A layer can then be specified as: any discipline; as FL, FRC or RV; as max, submax or a set time/distance

Layers can also be specified as single or repeated. For example a layer might be repeated exactly as is 3x, so rather than having to write it out all over, the user should be easily able to apply repeats.

I'm imagining a graphic interface similar to the "Scratch" game builder for kids where "ingredients" can be dragged and dropped on a basic "layer" to specify the taste of the cake.

Once the routine table is built, the user can then select the metrics to track from a selection that is relevant to layers of the cake (note, this is a metaphorical cake, it doesn't actually have to look like one. Simple blocks or jigsaw pieces can suffice). So if a cake has only one layer and it's a DYN max attempt, then only metrics relevant to that would be shown for selection. Same with tags.

Similarly hero metrics for the dashboard card are selected based on the layers that have been initially specified.

The finished "cake"/routine is given a routine name which can be used in analytics to show progress over time in the analytics modules.

These are my loose ideas. I'd like help organising these, evaluating (don't be afraid to critique if there are better solutions) with a view to creating a full plan once our discussion of details is concluded. Let's start this discussion now using this md file as a historical record.


# Planning discussion

## Copilot response - 2026-05-07

I think the core insight is strong: the builder should probably stop asking the user to choose a routine type first. The routine should be built as a sequence of plain data blocks, and type-like labels should be derived afterward from the shape of that sequence. That matches the existing data-oriented direction of the codebase and fits the audit finding that `max-attempt`, `interval-series`, and `hybrid` are mostly UI categories rather than essential stored concepts.

The table/layer idea is promising because it unifies the current three types:

- A max attempt becomes one layer with discipline, target/intensity, and capture settings.
- An interval series becomes one or more repeated layers.
- A hybrid becomes a routine where one layer or one repeated item is marked as expected max/submax.
- A mixed-discipline routine becomes just a sequence of layers with different discipline values.

The biggest conceptual upgrade is that the routine structure becomes the source of truth. Tracking metrics, tags, dashboard metrics, activity type, and logging UI can then be derived from the layer data instead of selected independently at the start.

## Organised Concept

### Core Object: Routine Sequence

Replace the user's first mental model from "What type of routine is this?" to "What happens, in what order?"

A routine is a sequence of blocks/layers. Each layer describes a unit of work, and the builder can compress repeated work with a repeat count.

Draft layer data shape for discussion:

```ts
interface RoutineLayerDraft {
  id: string;
  label?: string;
  discipline: 'STA' | 'DYN' | 'DNF' | 'DYNB' | 'TORT' | 'mixed' | 'any';
  targetKind: 'max' | 'submax' | 'fixed' | 'open';
  targetDurationSeconds?: number;
  targetDistanceMeters?: number;
  targetTimeSeconds?: number;
  lungVolume?: 'FL' | 'FRC' | 'RV';
  restBeforeSeconds?: number;
  repeatCount: number;
  tags?: string[];
}
```

This is not a final schema recommendation yet. It is a way to discuss the concept in plain data. The important parts are sequence, discipline, target, lung volume, rest, repeat, and tags.

*We'll need to build in the flexibility for durations and distances to be open also... it might be that in a table each attempt is at the atheltes discretion about where/when to begin or end. Same for the breathe-up before the attempt begins (restbefore)

### Derived Routine Shape

Once the user builds the sequence, the app derives routine shape:

- One layer, no repeat, target max/submax: max-like routine.
- One layer with repeat count: uniform interval-like routine.
- Multiple layers: table/progressive routine.
- Any layer marked max/submax inside a multi-layer routine: hybrid-like routine.
- Multiple disciplines across layers, including `TORT`: mixed-discipline routine.

This lets us remove the explicit type selector without losing the analytic categories. The categories become derived metadata rather than something the user must understand before building.

### Builder Flow Candidate

1. Build the sequence: add layer, choose discipline, choose target, choose repeat/rest.
2. Review the interpreted routine: "This looks like a 6-layer mixed routine with one max effort layer."
3. Select relevant tracking: app suggests metrics from the sequence, with advanced metrics available behind expansion.
4. Select tags: app suggests tags from targets, disciplines, and structure; user can adjust default/selectable tags.
5. Choose dashboard emphasis: app suggests hero/secondary metrics; advanced users can override.
6. Name and save.

I would put naming near the end or make it optional at the start. Users often understand the name after seeing the structure they built.

## What I Like About Tom's Direction

- It starts from user intent and physical reality: the diver does a sequence of things.
- It naturally supports mixed routines that the current model struggles to describe.
- It collapses max, interval, and hybrid into one model without losing any of them.
- Repeats solve the common "same thing 8 times" problem without forcing a separate uniform interval concept.
- It gives the app a much better basis for intelligent metric/tag suggestions.
- It aligns with future analytics because the data can answer "what happened in each part of the routine?" rather than only "what kind of routine was this?"

## Critique And Risks

The table-first idea is powerful, but a literal table as the first screen may still be too complex for novice users. Tables are excellent for precision, but they can feel like spreadsheets. I would treat the table as the underlying model and maybe the power-user view, not necessarily the primary novice UI. *I'm thinking the best way to address this is to create some powerful default routines that will address the needs of most novice users. Frankly we can probbaly predict the top 6 routine types right now. Anything beyond that will be niche and can be handled by the builder. So the builder will be most valuable to coaches who want to send routines to their students, and to us, designing routines on the back end. My intuition is that we should only allow one or two custom routine builds on a free tier anyway.*

The Scratch-style block idea is directionally good because it makes structure visible and manipulable. The risk is drag-and-drop on mobile. Drag/drop can be fiddly with a wet hand at the pool or on a small screen. A block builder should work with taps, steppers, duplicate buttons, and move up/down controls first; drag can be a bonus.

Mixed-discipline layers are a major power feature, but they may complicate logging and analytics. For example, a DYN-to-DNF-to-STA sequence might need per-layer metric schemas, not just routine-level `trackingConfig`. That is probably correct long-term, but it is a schema design decision, not only a UI decision.

The cake metaphor is useful for discussion, but the UI should probably use more literal language: blocks, steps, segments, or reps. "Layer" might still work if it feels natural. My current preference is "blocks" for the builder UI and "reps" inside repeated blocks.

*I'd like to avoid using blocks as it's being adopted widely in other contexts. I'd prefer to use other language. Layers works in a top down model, where each layer is a table row. I'll leave you to suggest other words for the "fillings"*

## Early Design Principles

- Structure first: build what happens before choosing abstract categories.
- Derive type: max/interval/hybrid should be computed from layers, not selected first.
- Suggest, do not ask: metrics, tags, and display choices should be recommended from the routine shape.
- Keep power at the edges: advanced users can open detailed metric/tag/display controls, but novices should not start there.
- Repeats are first-class: repeated blocks should be compact, editable, and expandable.
- Mixed discipline is allowed by the model, even if the first implementation supports a narrower UI slice.
- Logging should mirror building: if the builder creates blocks, the logger should show blocks/reps in the same structure.

## Decision Tracker

| Date       | Status           | Decision / Working Assumption                                                                                          | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-05-07 | Working decision | Remove the explicit three-type first step from the next routine builder concept.                                       | Keep max/interval/hybrid as derived classifications for analytics and backward compatibility.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-05-07 | Working decision | Make routine structure layers/table data the core builder model.                                                       | User-facing concept: layers; each layer maps to a table row.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-05-07 | Working decision | Support repeats as first-class structure, but expand repeats into row instances for saved/loggable data.               | Analytics needs each rep instance because actual outcomes can differ per repeat.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-05-07 | Working decision | Derive relevant metrics, tags, and dashboard defaults from the built structure.                                        | Use standard defaults first; expose geek-mode/advanced options for less common metrics.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-05-07 | Working decision | Build true mixed-discipline support into the concept from the outset.                                                  | A routine may contain STA, DYN, DNF, DYNB, TORT layers in any order.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-05-07 | Working decision | Use "layers" for rows and "ingredients" for the left-to-right controls inside a row.                                   | Need better term for the current "Quality" ingredient.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-05-07 | Working decision | Add `TORT` as a dynamic training discipline in the next routine model.                                                 | Unofficial Tortuga crawl discipline; can be measured by time and/or distance like dynamic.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-05-07 | Working decision | Use both routine-level analytics defaults and per-layer tracking/analytics profiles.                                   | Cross-routine comparison needs canonical metric keys and routine-level defaults. Mixed routines also need per-layer capture schemas and layer roles, e.g. an RV table can track time below an SpO2 threshold across the routine while one RV max layer is also comparable with other RV max attempts. |

## Questions For Tom

1. For user-facing language, do you prefer "blocks", "layers", "segments", "steps", or something closer to freediving language? *Layers (for each row in the table); then "Ingredients" for each layer which I see taking a shape from left to right: 
2. *"Discipline" > "Breathe-up" > "Dive" > "Quality"*
3. *Where:*
4. *"Discipline" can be DYN/DYNB/DNF/STA*
5. *"Breathe-up" can be "Duration MM:SS"/Open MM:SS*
6. *"Dive" can be Duration MM:SS/Meters/Open MM:SS*
7. *"Quality" which applies to the whole layer (might need a better word) can be "Max/Sub-max/nothing" and/or "FL/FRC/RV*" *and/or "single/repeated x times"*
8. 
9. Should the first concept support true mixed-discipline routines fully, or should it design for them in the data model while shipping simpler single-discipline routines first? *Implement from outset*
10. When a block repeats 8 times, should analytics preserve it as one repeated block or expand it into 8 row instances when saved? *expand it as the data could coneivably be different for each rep*
11. Should max/submax be attached to a layer as `targetKind`, or should it remain a tag that can be default/selectable? *as detailed in point 7.*
12. Should metric selection be automatic by default, with an "Advanced tracking" step only if the user wants to customize? *Yes, I think so. We'd need a way to organise and apply default metrics. I'm thinking even in the default settings there should be grouping metrics for "standard" users and a "geek-mode" which reveals less common ones. When logging a routine this would simplify the UI while encouraging geeks to track more metrics.*

## Copilot follow-up - 2026-05-07

Tom's comments change the center of gravity in a useful way. The builder is not primarily for absolute beginners creating their first routine from scratch. Beginners should mostly be served by excellent defaults. The custom builder is for coaches, power users, and internal routine design. That means the builder can be more powerful than a beginner wizard, as long as the common path through the app is still simple.

This reframes the product strategy:

- Default routines should carry most novice UX burden.
- The custom builder should be expressive, precise, and reusable.
- Free-tier limits can keep the custom-builder surface from overwhelming casual users.
- Coaches become a first-class audience for builder power: build once, send/use many times.

### Updated Layer Model

The key addition is open-endedness. A layer may prescribe an exact value, or it may intentionally leave the athlete discretion about when to start, stop, or end a phase.

I would model this as target modes rather than optional fields alone:

```ts
type LayerValueMode = 'open' | 'fixed';

interface LayerDurationTarget {
  mode: LayerValueMode;
  seconds?: number;
}

interface LayerDistanceTarget {
  mode: LayerValueMode;
  meters?: number;
}

interface RoutineLayerDraftV2 {
  id: string;
  discipline: 'STA' | 'DYN' | 'DYNB' | 'DNF' | 'TORT';
  breatheUp: LayerDurationTarget;
  dive: {
    duration?: LayerDurationTarget;
    distance?: LayerDistanceTarget;
  };
  attributes: {
    effort: 'max' | 'submax' | 'standard';
    lungVolume?: 'FL' | 'FRC' | 'RV';
    repeatCount: number;
  };
}
```

This shape captures Tom's ingredient chain:

`Discipline > Breathe-up > Dive > Attributes`

I am deliberately suggesting `attributes` instead of `quality`. "Quality" sounds like a judgment after the session, while this ingredient is really planned intent/constraints for the layer. Other possible labels: `Intent`, `Focus`, `Setup`, `Modifiers`, `Dose`, `Profile`. My current preference is `Attributes` in the data model and `Focus` or `Setup` in the UI.

### Ingredients Language

Tom's proposed row shape is good:

- Discipline: DYN, DYNB, DNF, STA, TORT.
- Breathe-up: fixed duration or open duration.
- Dive: fixed duration, fixed meters, open duration, or open distance/attempt.
- Quality/attributes: max, submax, standard, FL, FRC, RV, single, repeated N times.

I would keep "ingredients" as internal design language and possibly use it in the UI only if it feels delightful rather than cute. For a serious training tool, the visible labels might be:

- Layer.
- Discipline.
- Breathe-up.
- Dive target.
- Setup.
- Repeat.

This preserves the cake idea without forcing the metaphor into every screen.

### Open Values Are Important

Open breathe-up and open dive targets should be first-class, not hacks. They express real coaching intent:

- Start when ready.
- Breathe up at athlete discretion.
- Dive until a signal/feeling/technical endpoint.
- Max/submax attempt without a prescribed time or distance.

Analytics can still work because the logged result captures actual time, distance, and rep outcome. The routine layer describes the plan; the log row records what happened.

This suggests a clean split:

- Routine layer: planned prescription, including open/fixed mode.
- Log layer instance: actual result, including measured values and selected tags.

### Repeat Expansion

Tom's answer settles the repeat question for analytics: repeated layers should expand into distinct row instances when saved or at least when instantiated for logging. The authoring UI can keep a compact repeat control, but the loggable routine should produce individual reps.

That gives the best of both worlds:

- Builder stays compact: "repeat 8x".
- Logger is precise: rep 1 through rep 8 each has its own actual values.
- Analytics can compare planned repeat pattern vs actual rep-by-rep performance.

### Standard Metrics And Geek Mode

Metric selection should probably become a recommendation system with two layers:

- Standard metrics: automatically selected, visible, and easy to understand.
- Geek-mode metrics: available behind expansion, grouped by why they matter.

Possible metric groups:

- Performance: time, distance, reps, pace/speed.
- Technique: kicks, pulls, stroke style, breathing technique.
- Physiology: HR, SpO2, contractions, FVC, packing, lung volume.
- Readiness: HRV, resting HR, body weight, mood, hours since meal, menstrual cycle.
- Context: pool length, pool type, water temperature, equipment, buddy.
- Safety: samba/BO, recovery quality, notes.

The important point is that the builder should not ask everyone to choose from a raw list. The layer shape should select the obvious metrics, and geek mode should invite more data without punishing normal users.

### Updated Critique

The main risk is no longer that the builder is too advanced for novices. If default routines cover novices, the custom builder can be advanced. The real risk is schema complexity: mixed-discipline, open-ended layers, repeat expansion, and per-layer metric relevance all point toward a richer routine model than the current `RoutineTable`.

So the next planning step should not start with UI sketches. It should start with a data model proposal and the pure transforms around it:

- Authoring model: compact layers with repeats.
- Expanded plan model: row instances generated from layers.
- Logging model: actual outcomes per row instance.
- Derived classification: max-like, interval-like, hybrid-like, mixed discipline.
- Derived metric suggestions: standard and geek-mode groups.
- Derived display suggestions: hero/secondary metric defaults.

Once that data model feels right, the UI can be designed with much more confidence.

### New Open Questions

1. Should `FL/FRC/RV` live under the same UI ingredient as max/submax, or should lung volume get its own ingredient? *I see both of these as attirbutes, so it makes sense to me. The only difference is that there will always be one FL/FRC/RV selected but there may not be a max/sub-max selected. 
Thinking about it, specifying dry/wet should also be an attribute. Currently "dry" allows uploads of csv files from stamina to be parsed into the table results when logging the routine and this needs to be maintained for certain routines. In a soon-to-come implementation phase we'll do away with collecting data externally for import, and build in-app data collection via bluetooth to replace this. So the routine builder will also be deployable in realtime with timers and countdowns and data capture. Note" this is not for immediate implementation but should be kept in mind.
2. For dynamic disciplines, should "open dive" mean open distance, open duration, or either depending on what the athlete records? *It could be either. We're going for max power with the options, so a diver might want to focus on the distance or on the duration of the dive. Both should be an option.*
3. Should the expanded row instances be stored on the routine template, or generated at log time from compact layers? *I'm not sure what this means. If you can make a decision based on my previous answers then do. Otherwise make a clear explanation and I 'll respond.*
4. Should coaches be able to lock certain ingredients so athletes cannot change them when logging? *yes*
5. What are the top 6 default routines we should design first so novices rarely need the custom builder? *Dynamic max; static max; Dynamic sweet 16; Static 2-breath table; Dry RV table*

## Copilot next-step recommendation - 2026-05-07

Tom's answers are enough to move from open-ended concept discussion into a concrete planning pass. I would not implement yet. The next step should be to define the new routine model as plain data, plus the pure transforms that make it useful.

### Settled Or Nearly Settled

- `FL/FRC/RV`, max/submax, dry/wet, and repeat count all belong to the layer's attributes/setup area. *yes. And I'm going to add one more dynamic discipline "TORT". Althoguh not official, "Tortuga crawls" are often used in training (where the diver crawls along the bottom of the pool like a tortoise. Like DYN, TORT performances could be measured by time and/or distance.*
- `TORT` should be treated as a dynamic training discipline in the next model. It is unofficial, but it needs the same time/distance target flexibility as DYN-style disciplines.
- Lung volume should always have a selected value, defaulting to `FL` unless the routine specifies otherwise. *yes*
- Max/submax is optional; many layers will have no explicit effort marker. *yes*
- Dry/wet must be preserved because dry routines currently unlock Stamina CSV import and will later connect to in-app Bluetooth data capture. *yes*
- Dynamic open dives need both options: open distance and open duration. A diver may be training for either distance covered or time under apnea. *Yes, but STA open dives will be duration only. No distance is possible in static obviously. TORT as per my above comment*
- STA layers are duration-only. DYN, DYNB, DNF, and TORT layers may use distance targets, duration targets, open distance, open duration, or both when relevant.
- Coaches should be able to lock ingredients so athletes cannot edit prescribed pieces while logging. *Yes*
- Repeats should expand into individual loggable row instances because actual data can differ per rep. *Yes*

### Recommended Decision On Compact Layers Vs Expanded Rows

I recommend storing both concepts, but at different lifecycle stages:

- **Routine template stores compact authoring layers.** This preserves the coach/designer's intent: "repeat this layer 8x" remains easy to edit later.
- **When logging begins, the app materializes an expanded plan snapshot.** The snapshot contains one row per actual attempt/rep, copied from the compact layers.
- **Routine logs store actual results against the expanded row instances.** This gives analytics clean per-rep data and preserves exactly what the athlete was asked to do at the time of logging, even if the template changes later.

This avoids making the template noisy while still giving analytics detailed rows.

### TORT Implications Before The Next Planning Pass

Adding `TORT` should be handled before the layer model is finalized, because it affects the discipline inventory, validation rules, suggested metrics, tags, and default routine examples. For planning purposes, `TORT` should sit with the dynamic disciplines rather than as a tag or variant of DYN.

Working assumptions:

- `TORT` is a first-class `LayerDiscipline`, even if it remains an unofficial/training-only discipline in the product language.
- `TORT` accepts the same target families as dynamic disciplines: distance, duration, open distance, and open duration.
- `TORT` should inherit dynamic-style standard metrics such as distance, duration, pace/speed, reps, and pool context.
- `TORT` may need its own technique-oriented geek metrics later, because crawling along the pool floor is mechanically different from fin/no-fin swimming.
- The next data-model plan should name canonical discipline groups, such as `static`, `dynamic`, and `dynamicTraining`, so validation and metric derivation do not rely on scattered hard-coded discipline checks.

Draft transform:

```ts
type RoutineAuthoringLayer = {
  id: string;
  discipline: 'STA' | 'DYN' | 'DYNB' | 'DNF' | 'TORT';
  breatheUp: LayerDurationTarget;
  dive: LayerDiveTarget;
  attributes: LayerAttributes;
  locks: LayerLocks;
};

type ExpandedRoutineLayer = RoutineAuthoringLayer & {
  sourceLayerId: string;
  repIndex: number;
  globalRowIndex: number;
};

function expandRoutineLayers(layers: RoutineAuthoringLayer[]): ExpandedRoutineLayer[];
```

### Data Model Pass

Next, define the model around these concepts:

- `LayerDurationTarget`: fixed duration or open duration.
- `LayerDistanceTarget`: fixed distance or open distance.
- `LayerDiveTarget`: duration target, distance target, or both where appropriate.
- `LayerDiscipline`: `STA`, `DYN`, `DYNB`, `DNF`, or `TORT`, with discipline-specific validation for allowed target types.
- `LayerAttributes`: lung volume, effort, environment, repeat count.
- `LayerLocks`: which ingredients are fixed by the routine/coach during logging.
- `RoutineAuthoringLayer`: compact layer used in the builder.
- `ExpandedRoutineLayer`: generated row used for logging and analytics.
- `RoutineLogLayerResult`: actual data captured per expanded row.

This should be written as a planning data model first, not code yet. Once the shape is right, implementation can follow cleanly.

### Pure Transforms To Plan

The next plan should specify pure functions before UI:

- `expandRoutineLayers(layers)`: compact layers with repeats -> per-row plan.
- `deriveRoutineClassifications(layers)`: max-like, interval-like, hybrid-like, mixed-discipline, dry-capable, variable-table-like.
- `deriveStandardMetrics(layers)`: baseline metrics for ordinary users.
- `deriveGeekMetrics(layers)`: advanced metric groups unlocked by discipline/environment/attributes.
- `deriveDefaultTags(layers)`: tags implied by routine structure and attributes.
- `deriveDisplayMetrics(layers)`: suggested hero/secondary dashboard metrics.
- `validateRoutineLayers(layers)`: missing targets, impossible combinations, or unsafe/confusing structures.

### UI Planning Pass

After the data model is drafted, design the builder UI around one row/layer editor:

`Layer | Discipline | Breathe-up | Dive target | Setup/Attributes | Repeat | Lock controls`

Potential label choice:

- Use **Layer** for each row.
- Use **Setup** for the former "Quality" area in the visible UI.
- Use **Attributes** in the data model.
- Keep **Ingredients** as design language unless it tests well in the UI.

I prefer `Setup` on-screen because it can naturally include lung volume, environment, effort, and repeat behavior without sounding like a performance judgment.

### Default Routine Set

Tom listed five likely default routines:

1. Dynamic max.
2. Static max.
3. Dynamic Sweet 16.
4. Static 2-breath table.
5. Dry RV table.

The next pass should define these five as layer-model examples. That will test whether the model is expressive enough. If we still want six defaults, the sixth candidate should probably be chosen after modeling the first five. Possible candidates: DNF technique set, dynamic submax/technique set, O2 table, or dry FRC table.

### Suggested Immediate Next Steps

1. Draft a dedicated "Routine Layers Data Model" section in this document.
2. Express the five default routines using the proposed layer model.
3. Use those examples to revise the model until it feels natural.
4. Decide the sixth default routine only after the first five examples expose gaps.
5. Draft the pure transforms listed above.
6. Only then sketch the builder UI.

The key principle for the next pass: prove the data model using real freediving routines before designing screens.

## Next Planning Pass: Routine Layers Data Model

The immediate next step is to make the routine model precise enough that the UI can become a thin authoring layer over plain data. The model should answer two questions at once:

1. What did the coach or athlete prescribe?
2. What exact row-level facts were logged later for analytics?

The model should keep three lifecycle shapes separate:

- **Authoring layer**: the compact editable template row. This is where repeat count, locks, open/fixed targets, discipline, breathe-up, dive target, and setup live.
- **Expanded plan row**: the loggable snapshot generated from authoring layers. A repeated layer becomes row 1, row 2, row 3, and so on.
- **Result row**: the actual values captured against each expanded plan row during logging.

This prevents templates from becoming noisy while preserving clean analytics rows.

### Core Model Draft

The next plan should refine these draft concepts, not treat them as final code yet:

```ts
type LayerDiscipline = 'STA' | 'DYN' | 'DYNB' | 'DNF' | 'TORT';
type DisciplineGroup = 'static' | 'dynamic' | 'dynamicTraining';
type DisciplineSelectionMode = 'fixed' | 'log-time-selectable';
type LayerValueMode = 'fixed' | 'open';
type LayerEffort = 'max' | 'submax' | 'standard';
type LungVolume = 'FL' | 'FRC' | 'RV';
type TrainingEnvironment = 'wet' | 'dry';
type LayerIngredient = 'discipline' | 'breatheUp' | 'dive' | 'attributes' | 'repeat';

type LayerDurationTarget = {
  mode: LayerValueMode;
  seconds?: number;
};

type LayerDistanceTarget = {
  mode: LayerValueMode;
  meters?: number;
};

type LayerDiveTarget = {
  duration?: LayerDurationTarget;
  distance?: LayerDistanceTarget;
};

type LayerAttributes = {
  lungVolume: LungVolume;
  effort: LayerEffort;
  environment: TrainingEnvironment;
  repeatCount: number;
};

type LayerAnalyticsRole =
  | 'warmup'
  | 'working-rep'
  | 'max-attempt'
  | 'submax-attempt'
  | 'recovery'
  | 'test-set';

type LayerLocks = Partial<Record<LayerIngredient, boolean>>;

type RoutineAuthoringLayer = {
  id: string;
  discipline: LayerDiscipline;
  disciplineSelectionMode: DisciplineSelectionMode;
  allowedDisciplines?: LayerDiscipline[];
  breatheUp: LayerDurationTarget;
  dive: LayerDiveTarget;
  attributes: LayerAttributes;
  analyticsRole?: LayerAnalyticsRole;
  metricProfileId?: string;
  locks: LayerLocks;
};
```

Important planning point: `analyticsRole` is not the same as `effort`. A layer can be an RV max attempt (`effort: 'max'`) and also part of a larger table. Analytics should be able to compare that row with other RV max attempts across other routines without losing the fact that it belonged to the parent RV table. `standard` is the neutral effort value for normal prescribed work that is neither explicitly max nor submax.

### Routine-Level And Layer-Level Tracking

The answer to the final decision-tracker question is: use both, but give each level a different job.

Routine-level tracking should define shared defaults and cross-routine comparability:

- Canonical metric keys, such as `durationSeconds`, `distanceMeters`, `minSpO2`, `timeBelowSpO2Threshold`, `rpe`, and `notes`.
- Default metric groups for the whole routine, such as performance, physiology, readiness, safety, and context.
- Routine-wide analytics facets, such as routine name, template ID, discipline coverage, dry/wet availability, default tags, and intended adaptation.

Layer-level tracking should define row-specific capture and analytics roles:

- Metrics that only apply to certain layers.
- Layer-specific roles such as max attempt, warmup, working rep, recovery, or test set.
- Layer-specific target validation, for example STA duration-only versus TORT time and/or distance.
- Layer-specific locks from a coach.

Result rows should store enough inherited context to be queryable later without fragile joins:

- Routine/template identifiers and name snapshot.
- Source layer ID and expanded row index.
- Discipline, discipline group, lung volume, environment, effort, and analytics role snapshot.
- Actual metric values using canonical metric keys.
- Selected/default tags that were true for the row or routine at logging time.

This captures Tom's RV example cleanly: the whole dry RV table can be analyzed for time below an SpO2 threshold, while the one RV max layer can also be compared across all other RV max attempts.

## Default Routines As Model Tests

The five default routines should be used as fixtures for the model before any UI plan is considered. If these cannot be expressed naturally, the model is not ready.

| Default routine        | Main model pressure test                                                                                 | Expected derived classification                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Dynamic max            | Single dynamic layer, open distance and/or open duration, effort max.                                    | Max-like, dynamic, wet, distance/time comparable.    |
| Static max             | Single STA layer, duration-only dive target, effort max.                                                 | Max-like, static, duration comparable.               |
| Dynamic Sweet 16       | One repeated dynamic layer expanded into 16 result rows.                                                 | Interval-like, dynamic, repeated working reps.       |
| Static 2-breath table  | Repeated or progressive STA layers with fixed/open breathe-up behavior and duration result capture.       | Table-like, static, CO2/endurance comparable.        |
| Dry RV table           | Dry STA layers with RV lung volume, physiology metrics, and possible max-attempt layer inside the table. | Dry table, RV physiology, embedded max comparable.   |

The sixth default should be chosen only after these five have exposed the model's gaps. Strong candidates remain DNF technique, dynamic submax technique, O2 table, dry FRC table, or a TORT training set if the discipline needs early visibility.

## Pure Transform Planning Checklist

The next section should specify these transforms as plain `(input) -> output` functions before any Svelte UI work:

- `groupDiscipline(discipline)`: maps STA/DYN/DYNB/DNF/TORT into discipline groups used by validation and metrics.
- `expandRoutineLayers(layers)`: turns compact authoring layers into expanded plan rows.
- `validateLayerTargets(layer)`: enforces STA duration-only and dynamic/TORT distance-duration flexibility.
- `deriveRoutineClassifications(layers)`: derives max-like, interval-like, table-like, hybrid-like, mixed-discipline, dry-capable, and TORT-containing classifications.
- `deriveMetricProfiles(layers)`: returns standard and geek-mode metric suggestions at routine and layer level.
- `deriveDefaultTags(layers)`: suggests default tags from discipline, lung volume, environment, effort, role, and structure.
- `deriveDisplayMetrics(layers)`: suggests hero, secondary, and tertiary dashboard metrics.
- `materializeResultRows(planRows, logInput)`: combines the expanded plan with actual logged values.

Each transform should have example input/output in the planning doc. The first local implementation should then be pure TypeScript with tests before it touches Firestore or Svelte components.

## Validation Rules To Settle Before UI

These rules should be decided in the data model pass:

- STA layers cannot have distance targets.
- DYN, DYNB, DNF, and TORT layers can have distance targets, duration targets, or both.
- Every layer must have a lung volume; default is `FL`.
- Effort should use `max`, `submax`, or `standard`; `standard` replaces the earlier `none` idea and is the default neutral value.
- Environment must be explicit enough to preserve dry CSV import now and Bluetooth data capture later.
- Repeat count must expand into stable row IDs or stable row indexes so analytics can compare rep 1, rep 2, etc.
- Coach locks must be representable per ingredient, not only per whole layer.
- Metric profiles must never require a user to choose raw database fields on the common path.

## Local-Only Implementation Boundary

Implementation should stay local-only until the model has survived the five default-routine examples and the pure transform tests. No Firestore schema migration, production data write, or deployed builder replacement should happen in the first implementation slice.

The safest first implementation shape would be:

1. Add local draft types and pure functions in a new isolated module.
2. Add tests using the five default routines as fixtures.
3. Build a local-only prototype route or developer-only component that edits the new model without saving to production data.
4. Compare the generated expanded rows, metric profiles, tags, and display suggestions against the current builder output.
5. Only then decide how to migrate or coexist with the existing `RoutineTemplate` fields.

This keeps the planning ambitious while making the implementation reversible.

## Implementation Log

### Implementation Checklist

- [x] Create safety branch away from `main`: `routine-layer-model-local-prototype`.
- [x] Commit the planning baseline separately from code: `Document routine layer model direction`.
- [x] Add local-only routine layer type model.
- [x] Add pure transforms for grouping, repeat expansion, validation, classification, metric suggestions, tag suggestions, and display suggestions.
- [x] Add first unit tests for Dynamic Max and Static Max metric/tag/display suggestions plus validation failures.
- [x] Document implementation slice 1 and its no-persistence boundary.
- [x] Model all five completed scaffold routines as local fixtures: Dynamic Max, Static Max, Dynamic Sweet 16, Static 2-Breath Table, and Dry RV Table.
- [x] Add tests that validate, expand, and classify all five default routine fixtures.
- [x] Add pure transform examples for legacy projection from existing `RoutineTemplate` shapes.
- [x] Add tests for legacy projection without mutating existing data.
- [x] Add a developer-only prototype surface for inspecting layer rows and derived suggestions.
- [x] First browser-visible checkpoint: the developer-only prototype surface. Until this item, changes are pure model/test work only and will not appear in the app UI.
- [x] Compare new layer-derived outputs with current seeded default routine outputs.
- [x] Decide initial persistence coexistence strategy: adapter-only until prototype review.
- [ ] Only after the above, start replacing production builder flows.

### Slice 1: Local Routine Layer Model Prototype

Safety setup:

- Work started on branch `routine-layer-model-local-prototype`, not `main`.
- Planning docs and visual mockup were committed before code changes so the design baseline is recoverable independently.
- The first code slice is local-only: no Firestore schema change, no production persistence, no deployed route, and no replacement of the existing routine builder.

Implemented scope:

- Added a pure TypeScript routine layer model in `src/lib/routineLayers/model.ts`.
- Added plain-data lifecycle shapes for compact authoring layers and expanded plan rows.
- Added pure transforms for discipline grouping, repeat expansion, validation, routine classification, metric suggestions, default tag suggestions, and display metric suggestions.
- Added Vitest coverage in `src/lib/routineLayers/model.test.ts` for Dynamic Max and Static Max, plus narrow validation failure cases.

Current boundary:

- This module is not yet imported by Svelte components or Firestore adapters.
- The metric/tag/display derivations are first-pass defaults intended to be revised as more default routines are modeled.
- Legacy projection from current `RoutineTemplate` and `RoutineLog` is still a later slice.

### Slice 2: Default Routine Fixtures

Implemented scope:

- Added local fixture data for the completed default routine scaffolds: Dynamic Max, Static Max, Dynamic Sweet 16, Static 2-Breath Table, and Dry RV Table.
- Captured each fixture's layer structure, standard metrics, geek metrics, display emphasis, default tags, selectable tags, and safety/context notes.
- Added tests that validate all fixtures, confirm expected repeat expansion counts, and check basic classifications.

Browser visibility:

- These first two slices are intentionally not visible in the browser. They are pure model/test groundwork.
- The first point where a visible browser feature should appear is the checklist item `Add a developer-only prototype surface for inspecting layer rows and derived suggestions`.
- That prototype should still be local-only and non-persistent: it should read the fixture/model data and render it for inspection without replacing the production routine builder.

### Slice 3: Legacy Routine Projection

Implemented scope:

- Added `projectLegacyRoutineToLayers(routine)` in `src/lib/routineLayers/legacy.ts`.
- Projects legacy max attempts, uniform interval routines, variable table rows, and hybrid max-rep routines into the local layer model.
- Preserves existing `wet`, `dry`, and `both` training environment values in projected layers.
- Added tests for dynamic max, Dynamic Sweet 16-style uniform intervals, static table rows, and hybrid max row projection.

Current boundary:

- Projection is read-only and pure. It does not write to Firestore, migrate existing documents, or change production rendering.
- Projection is intentionally conservative: variable table rows project one-to-one rather than trying to compress repeated rows automatically.

### Slice 4: Browser-Visible Developer Prototype

Implemented scope:

- Added an unlinked authenticated route at `/routines/layer-prototype`.
- The route renders the local default routine fixtures, authoring layers, expanded row counts, classifications, metrics, tags, and display suggestions.
- This is the first browser-visible checkpoint in the checklist.

Current boundary:

- The prototype is read-only and non-persistent.
- It does not replace the production routine builder or change normal navigation.
- It exists to inspect the model in-browser before production UI work begins.

### Slice 5: Comparison With Current Seeded Defaults

Current seeded defaults live in `scripts/seed-data.ts`. The comparison below is intentionally about default routine shape and output emphasis, not production migration.

| Routine area | Current seeded default | New layer fixture | Important difference |
| ------------ | ---------------------- | ----------------- | -------------------- |
| Dynamic max | `system-dynamic-max`; DYN/DYNB/DNF; tags `max-attempt`, `pb`; hero distance, secondary time. | `dynamic-max`; default DYN with DYN/DYNB/DNF/TORT selectable; tags `max`, `dynamic`; hero distance, secondary duration, tertiary speed. | New model adds TORT and stores the log-time selectable discipline concept explicitly instead of multiplying templates. |
| Static max | `system-static-max`; STA; tags `max-attempt`, `pb`; hero time, secondary breathe-up. | `static-max`; STA; tags `max`, `static`; hero duration, secondary breathing technique, tertiary minimum HR. | New scaffold tracks a broader physiology/context surface and treats breathe-up as a standard logged metric rather than the main secondary display. |
| Dynamic Sweet 16 | `system-sweet-16`; DYN/DYNB/DNF; fixed `repDistance: 50`; `numberOfReps: 16`; hero total time, secondary average per rep. | `dynamic-sweet-16`; DYN fixed for now; open distance; repeat 16; hero total routine time, secondary distance, tertiary average speed. | Tom's scaffold makes distance open per rep, while the existing seed prescribes 50m. This is a deliberate model change to preserve athlete discretion. |
| Static 2-Breath | `system-gentle-2-breath`; STA; 10 reps; target 1:30 exists in description but not as a persisted table/target field. | `static-two-breath-table`; STA; 10 fixed 1:30 reps in the layer fixture; hero cumulative hold time. | New fixture makes the 1:30 prescription explicit in layer data instead of relying on description text. |
| Dry RV table | `system-rv-breath-hold`; STA; dry biometric tracking; 11 reps; 3 minute rest; tags `dry`, `o2`, `advanced`, `biometric`; hero longest hold. | `dry-rv-table`; STA; dry RV; 8 open reps; tags `dry`, `rv`, `static`, `table`; hero longest hold, secondary cumulative RV hold, tertiary time below SpO2 threshold. | New scaffold is RV-specific, open-ended, and closer to Tom's 8-rep description; existing seed is a broader dry biometric routine. |

Resulting implementation decision:

- Keep the current seeded routines untouched for now.
- Use `projectLegacyRoutineToLayers` to inspect/compare old seeded routines against the new model.
- Treat the new default fixtures as the local target model, not as a production seed replacement yet.
- Defer persistence changes until the prototype view and legacy projection comparisons are reviewed in-browser.

### Slice 6: Persistence Coexistence Decision

Initial decision: use an adapter-only coexistence strategy.

This means:

- Existing `RoutineTemplate` and `RoutineLog` documents remain the production source of truth.
- The new layer model is used locally for fixtures, pure transforms, developer inspection, and read-only legacy projection.
- No dual-write is introduced yet.
- No new-shape-only production writes are introduced yet.
- No Firestore migration or backfill is run.

Why this is the safest next step:

- The data shape is still being reviewed through fixtures and the prototype surface.
- Existing training history stays untouched.
- The app can compare old and new interpretations before committing to storage changes.

Decision point before changing persistence:

- Review the prototype route with real seeded routines and fixture routines.
- Confirm the logger shape for planned vs actual result rows.
- Decide whether production should continue writing old shape plus derived adapters, dual-write old and new shapes, or write only the new layer shape for newly-created routines.

### Prototype Review Against Modifier Map - 2026-05-08

Browser note: in this local session, `/routines/layer-prototype` redirected to the public sign-in page because the route is inside the authenticated app group. The review below is therefore based on the route source plus the current layer fixtures, not a completed authenticated visual pass.

Overall: the prototype is doing its job as an inspection surface, but it is not yet a faithful layer-sentence UI. It shows enough to prove the model exists, but it hides several modifier concepts that now feel central.

What looks aligned:

- [x] The prototype has one visible row per authoring layer.
- [x] The visible row follows the rough order `Discipline > Breathe-up > Dive > Attributes > Reps`.
- [x] It shows open vs fixed mode for breathe-up, distance, and duration.
- [x] It shows lung volume and effort together, which matches the current `Layer attributes` / `Setup` direction.
- [x] It shows repeat count as `1x`, `8x`, `10x`, `16x`, which keeps repeats first-class.

Mismatches to fix before UI design:

- [ ] **Segments are unlabeled in the row.** The rendered chips show values, but not the segment names. For Tom's mental model, the row should visibly read as `Discipline`, `Breathe-up`, `Dive`, `Setup`, `Reps`.
- [ ] **Discipline freedom is invisible.** Dynamic Max has `disciplineSelectionMode: log-time-selectable` and allowed choices `DYN / DYNB / DNF / TORT`, but the prototype row only shows the default discipline.
- [ ] **Fixed target values are invisible.** The row shows `fixed duration` or `fixed distance`, but not the actual seconds/meters. Static 2-Breath should show something like `fixed duration 1:30`, not only `fixed duration`.
- [ ] **Environment is invisible.** Dry RV and wet routines look too similar because the row shows lung volume and effort, but not `dry` / `wet` / `both`.
- [ ] **Locks are invisible.** The model has `locks`, but the prototype gives no visual indication of coach-locked vs athlete-editable segments.
- [ ] **Breathe-up is too narrow.** The prototype only represents open/fixed duration. The modifier map now also needs room for no prescribed breathe-up, breath-count prescriptions, and rest/breathe-up/recovery relationships.
- [ ] **Dive endpoint condition is invisible.** The map now includes endpoint conditions like coach signal, athlete discretion, until fail, and until target reached, but the prototype cannot display them yet.
- [ ] **Repeat shape is invisible.** `16x` is useful, but it does not distinguish uniform, progressive, pyramid, or custom table repeats.
- [ ] **Metric chips dominate the inspection view.** For the modifier review, metrics should probably be collapsed or moved below the sentence so they do not obscure whether the layer grammar itself is right.

Recommended next UI-prototype target:

```text
Layer 1
Discipline       default DYN · selectable DYN/DYNB/DNF/TORT · unlocked
Breathe-up       open duration · unlocked
Dive             open distance + open duration · endpoint athlete discretion
Setup            FL · max · wet · unlocked
Reps             single
```

The key change is not visual polish yet. It is making the prototype display the three distinct facts for each segment: default value, allowed alternatives, and lock state.

## Existing Data Compatibility And Migration Planning

Existing user data must be treated as durable training history. The new model should not require deleting or rewriting current routines before users can keep using the app.

The compatibility plan should have three layers:

- **Read compatibility**: current `RoutineTemplate`, `RoutineTable`, `TrackingConfig`, `DisplayConfig`, tags, routine logs, and sessions must continue to render in dashboards, history, and analytics.
- **Projection compatibility**: old routines should be projectable into the new layer model for local planning and analytics tests, even if their original Firestore shape is left untouched.
- **Write compatibility**: the first local implementation should write only local draft data. A later production implementation can decide whether new routines write the new shape directly, write both old and new shapes, or use an adapter layer.

The safest conceptual approach is an adapter transform rather than an immediate migration:

```ts
function projectLegacyRoutineToLayers(routine: RoutineTemplate): RoutineAuthoringLayer[];
function projectLegacyLogToResultRows(log: RoutineLog): RoutineLogLayerResult[];
```

This lets the team compare old and new analytics using existing data before changing production persistence. It also gives current routines a path into the new analytics model:

- Max-attempt routines project to one authoring layer with `effort: 'max'` or `submax` inferred from existing activity type/tags.
- Uniform interval routines project to one repeated layer using `numberOfReps`, `repDistance`, `restBetweenReps`, and available duration/table fields.
- Variable table routines project each table row to one authoring layer or to a compact repeated layer only where rows are genuinely identical.
- Hybrid routines project table/interval rows plus an `analyticsRole: 'max-attempt'` on the current max row.
- Existing `trackingConfig` becomes the routine-level metric profile, with layer-level profiles inferred only when structure makes that safe.

Open migration question for a later pass: whether existing saved logs need a backfilled expanded-row snapshot, or whether analytics can generate projected result rows at query time. For now, projection is safer because it avoids irreversible production writes.

## Revised Immediate Next Steps

1. Write the concrete data-model section using the three lifecycle shapes: authoring layer, expanded plan row, result row.
2. Model the five default routines as examples, including one dry RV routine with both routine-level physiology tracking and one layer-level max attempt role.
3. Use the examples to revise the model, especially `LayerDiveTarget`, `LayerAttributes`, `LayerAnalyticsRole`, and metric profiles.
4. Specify input/output examples for the pure transforms.
5. Define validation rules and error messages for impossible combinations.
6. Draft legacy projection rules so current routines and logs can be represented as layers/result rows without data loss.
7. Draft a local-only implementation plan with tests and no production persistence.
8. Sketch the builder UI only after the model, transforms, validation, and compatibility story are stable.

## Working Through The Revised Immediate Next Steps

This section turns the revised next steps into a concrete planning sequence. The goal is still planning only: make the data model, examples, transform behavior, and compatibility story strong enough that a later local implementation can be small and reversible.

### Step 1: Concrete Data Model Target

The data model pass should produce four plain-data shapes and one canonical metric vocabulary.

| Shape / vocabulary       | Purpose                                                                                                   | Must answer                                                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RoutineAuthoringLayer`  | What the coach/athlete edits in the builder.                                                              | What is prescribed? What repeats? What is locked? What is open?                                                                                                                |
| `ExpandedRoutinePlanRow` | A stable row generated from authoring layers when a routine is prepared for logging.                      | Which exact planned rep/layer is this? Where did it come from?                                                                                                                 |
| `RoutineLogLayerResult`  | Actual captured result for one expanded row.                                                              | What happened in this row? Which metrics/tags/roles were true at log time?                                                                                                     |
| `RoutineMetricProfile`   | The routine-level and layer-level metric prescription.                                                    | Which metrics are standard, which are geek-mode, and which are relevant only to specific layers?                                                                               |
| Canonical metric keys    | Stable analytics vocabulary shared by old routines, new routines, manual logs, recorder, and dry imports. | Can old and new logs be compared without knowing which UI created them? *I believe so, as long as they are tracking the same thing and the vocabulary is stable as indicated.* |

The model should deliberately separate target prescription from actual result. For example, an authoring layer may prescribe an open dynamic max; the result row later records the actual distance, duration, pace, tags, and safety outcome.

Working draft additions to the earlier type sketch:

```ts
type MetricImportance = 'standard' | 'geek';
type MetricScope = 'routine' | 'layer' | 'result';

type CanonicalMetricKey =
  | 'durationSeconds'
  | 'distanceMeters'
  | 'repsCompleted'
  | 'restSeconds'
  | 'breatheUpSeconds'
  | 'lapTimes'
  | 'speedPerLap'
  | 'kicksPerLap'
  | 'heartRateSeries'
  | 'spO2Series'
  | 'minSpO2'
  | 'minHeartRate'
  | 'timeBelowSpO2Threshold'
  | 'breathingTechnique'
  | 'hoursSinceLastMeal'
  | 'waterTemperatureCelsius'
  | 'hrv'
  | 'restingHeartRate'
  | 'bodyWeightKg'
  | 'equipment'
  | 'facialGear'
  | 'fvcLiters'
  | 'fvcWithPackingLiters'
  | 'packingVolumePercent'
  | 'buddyName'
  | 'safetyOutcome'
  | 'competitionStatus'
  | 'cardColor'
  | 'rpe'
  | 'joyScale'
  | 'basalMood'
  | 'notes';

type RoutineMetricProfile = {
  standard: CanonicalMetricKey[];
  geek: CanonicalMetricKey[];
  byLayerRole?: Partial<Record<LayerAnalyticsRole, CanonicalMetricKey[]>>;
};

type ExpandedRoutinePlanRow = RoutineAuthoringLayer & {
  sourceLayerId: string;
  repIndex: number;
  globalRowIndex: number;
  plannedMetricProfile: RoutineMetricProfile;
};

type RoutineLogLayerResult = {
  planRowId: string;
  sourceLayerId: string;
  globalRowIndex: number;
  plannedDiscipline: LayerDiscipline;
  actualDiscipline: LayerDiscipline;
  disciplineGroup: DisciplineGroup;
  plannedAttributes: LayerAttributes;
  actualEffort: LayerEffort;
  analyticsRole?: LayerAnalyticsRole;
  metricValues: Partial<Record<CanonicalMetricKey, unknown>>;
  tags: string[];
};
```

Planning checks before this model is accepted:

- Can it represent a single max attempt without feeling bloated?
- Can it represent a repeated Sweet 16 without writing 16 rows by hand?
- Can it represent a dry RV table with one max-attempt layer inside it?
- Can it represent a legacy routine without requiring data loss?
- Can analytics ask both routine-level questions and layer-level questions?

### Fundamental Design Impact From Dynamic Max

Tom's Dynamic Max comments change the design in an important way: a default routine should not always imply a single fixed discipline or fixed effort. Some routines should provide a default prescription while allowing controlled log-time choices.

Working decisions from this:

- A dynamic default can be a **dynamic-family routine** rather than four separate DYN, DYNB, DNF, and TORT routines.
- A layer still needs a default `discipline`, but it can also carry `allowedDisciplines` and `disciplineSelectionMode`.
- `locks.discipline` decides whether the athlete can change DYN/DYNB/DNF/TORT when logging.
- `attributes.effort` is the default planned effort, not always a locked truth. If effort is unlocked, the athlete can record `max`, `submax`, or `standard` at log time.
- Max and submax should therefore be comparable analytics roles/effort values, not necessarily separate default routines.
- Result rows must snapshot both the planned/default values and the actual log-time selections.

This keeps default routines broad and reusable while preserving analytics precision. For example, a Dynamic Max routine can default to DYN and effort max, but the athlete can log DNF submax from the same routine if the routine allows it. Analytics can still filter actual DNF submax results because `actualDiscipline` and `actualEffort` are stored on the result row.

This also affects the builder UI later: the authoring layer needs a way to mark an ingredient as fixed or user-selectable during logging. The UI should not solve this by multiplying routine templates.

The metric comments also push the model toward a richer canonical metric vocabulary. Dynamic Max is not just distance plus duration: the default routine should surface ordinary context fields such as breathe-up duration, RPE, enjoyment, basal mood, and buddy, while geek mode should allow imported or sensor-derived series such as HR and SpO2 over time. Competition/card color should be treated as structured result annotation, not a free-text note.

### Step 2: Default Routine Modeling Scaffold

The five default routines are now the main test bench. Tom's involvement is useful here because the model needs realistic prescriptions, not invented defaults. If Tom wants to fill this in directly, each routine needs the same small set of answers.

For each default routine, fill in:

| Field                    | Answer needed                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| Routine name             | User-facing default routine name.                                                            |
| Purpose                  | What training job this routine does.                                                         |
| Layers                   | Each layer in order, including discipline, breathe-up, dive target, attributes, and repeat count. |
| Open vs fixed values     | Which values are prescribed and which are athlete discretion.                                |
| Standard metrics         | Metrics normal users should see/log by default.                                              |
| Geek metrics             | Metrics available behind advanced/geek mode.                                                 |
| Dashboard hero metric    | Best single metric for cards and routine analytics.                                          |
| Secondary display metric | Best supporting metric.                                                                      |
| Default tags             | Tags that should always apply.                                                               |
| Selectable tags          | Tags the athlete may choose at log time.                                                     |
| Safety/context fields    | Buddy, pool length, wet/dry, samba/BO, notes, or other required context.                     |
| Existing-data mapping    | Which current routine type/fields this most resembles, for projection compatibility.         |

#### Dynamic Max Scaffold

| Field                    | Draft / Tom input needed                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routine name             | Dynamic max                                                                                                                                                                                                                                                                                                                                                                               |
| Purpose                  | Measure best dynamic performance by distance                                                                                                                                                                                                                                                                                                                                              |
| Layers                   | One DYN layer; *open breathe-up duration*; open dive target for distance and/or duration; effort max; FL unless changed.<br><br>*Just thinking about this... although the layer is DYN, do we actually want a different routine for every single dynamic discipline? Or do we want a dynamic layer and then a user selectable DYN/DYNB/DNF/TORT call at the time of logging the routine.* |
| Open vs fixed values     | Breathe-up likely open; dive distance/duration open.                                                                                                                                                                                                                                                                                                                                      |
| Standard metrics         | Distance, duration, pool length, notes, safety outcome, *Breathe-up duration*, *RPE, Enjoyment, basal mood, Buddy name*                                                                                                                                                                                                                                                                   |
| Geek metrics             | Lap times, speed, kicks per lap, heart rate *throughout the hold (this could be imported)*, SpO2 *throughout the hold (this could be imported)*, *Minimum HR, minimum Spo2, breathing technique, hours since last meal, water temp, HRV, Basal HR, Equipment used, Facial gear used, body weight, FVC (liters), FVC with packing, Packing volume %*, Contraction onset                    |
| Dashboard hero metric    | Distance.                                                                                                                                                                                                                                                                                                                                                                                 |
| Secondary display metric | Duration and *(Tertiary)* average speed.                                                                                                                                                                                                                                                                                                                                                  |
| Default tags             | `max`, `dynamic`. *ideally user would be able to select max/sub max on recording to avoid needing a separate routine for submax*                                                                                                                                                                                                                                                          |
| Selectable tags          | `pb-attempt`, `competition` *(and if selected white, yellow red card colour should be selectable*, `technique`, `fun`, `experimental`.                                                                                                                                                                                                                                                    |
| Safety/context fields    | Buddy and samba/BO should probably be available.                                                                                                                                                                                                                                                                                                                                          |
| Existing-data mapping    | Current max-attempt dynamic routine.                                                                                                                                                                                                                                                                                                                                                      |

Design response: this should probably become a dynamic-family default routine. The authoring layer can default to DYN, but allow log-time selection from DYN, DYNB, DNF, and TORT unless the routine/coach locks the discipline. The same principle applies to effort: the routine can default to max, but allow max/submax/standard at logging if effort is unlocked. This avoids routine-template sprawl while keeping analytics clean through actual result-row snapshots.

#### Dynamic Max Layer Sketch

This is not a UI mockup. It is a conceptual sketch of the layer as data, showing default values, log-time choices, and captured results.

Compact Scratch-like UI concept mockup: [docs/routines/dynamic-max-layer-mockup.html](dynamic-max-layer-mockup.html)

The visual model should distinguish main layer segments from the variables that modify them. Main segments stay as the large connected blocks (`Discipline`, `Breathe-up`, `Dive`, `Attributes`), while variables sit as thin, flat blocks above the segment they affect (`Selectable family` above Discipline, `Open duration` above Breathe-up, `Max` / `Open distance` / `Open time` above Dive, `FL` above Attributes).

#### Variable Chip Selection UX

The best interaction model is probably segment-first, not freeform drag-first. The user taps a main segment (`Discipline`, `Breathe-up`, `Dive`, or `Attributes`), and the builder opens a focused chip tray or side inspector for variables that are valid for that segment only. Selecting or deselecting a variable updates the thin blocks above the segment immediately, so the constructed layer remains the source of truth.

For each segment, the variable chooser should separate three jobs:

- Preset: the default value the routine starts with, such as DYN, max, or FL.
- Freedom: whether the athlete can change it at log time, such as selectable family or open duration.
- Locking: whether the coach/routine author has fixed the value.

UI pattern: the segment has a small `+ variable` affordance when no variable is applied, and tapping an existing thin chip reopens the same chooser with that option highlighted. The chooser should use familiar controls rather than raw dragging: segmented controls for mutually exclusive choices, checkboxes/toggles for independent flags, steppers or number inputs for fixed values, and a lock toggle for coach-fixed variables. Dragging chips can be a nice desktop enhancement later, but tap-to-configure should be the primary interaction for mobile and poolside use.

Dynamic Max example:

- Tap `Discipline` -> choose default discipline and whether the family is selectable at log time.
- Tap `Breathe-up` -> choose fixed duration, open duration, or no breathe-up target.
- Tap `Dive` -> choose effort, distance target mode, and time target mode.
- Tap `Attributes` -> choose lung volume, wet/dry context, equipment, or other non-segment-specific modifiers.

This keeps the visual layer compact while making the editing surface precise: the row shows what has been built, and the tray explains what can be changed.

```text
Routine: Dynamic Max

Layer 1: Dynamic-family max attempt

+----------------------+----------------------+--------------------------+----------------------------+----------------------+
| Discipline           | Breathe-up           | Dive                     | Setup                      | Result capture       |
+----------------------+----------------------+--------------------------+----------------------------+----------------------+
| Default: DYN         | Open duration        | Open distance            | Lung volume: FL            | Distance             |
| Allowed:             | Actual logged later  | Open duration            | Effort default: max        | Duration             |
| - DYN                |                      |                          | Effort allowed:            | Breathe-up duration  |
| - DYNB               |                      |                          | - max                      | RPE / enjoyment      |
| - DNF                |                      |                          | - submax                   | Safety outcome       |
| - TORT               |                      |                          | - standard                 | Context + notes      |
+----------------------+----------------------+--------------------------+----------------------------+----------------------+

Authoring meaning:
  "This is one dynamic-family attempt. Default it to DYN max, but unless locked,
   let the athlete record the actual dynamic discipline and effort at log time."

Expanded plan rows:
  Row 1 only, because repeatCount = 1.

Result row snapshot:
  plannedDiscipline: DYN
  actualDiscipline: DYN | DYNB | DNF | TORT
  plannedEffort: max
  actualEffort: max | submax | standard
  actual metrics: distance, duration, breathe-up duration, context, safety, notes
```

Alternative compact notation:

```text
[Layer 1]
  Discipline       DYN default, selectable: DYN / DYNB / DNF / TORT
  Breathe-up       open duration -> log actual duration
  Dive             open distance + open duration -> log actual distance/time
  Setup            FL default, effort default max, effort selectable max/submax/standard
  Standard log     distance, duration, breathe-up, pool length, RPE, enjoyment, mood, buddy, safety, notes
  Geek log         lap times, speed, kicks, HR series, SpO2 series, min HR, min SpO2, breathing/context/body metrics
  Dashboard        hero: distance; secondary: duration; tertiary: average speed
```

Fundamental implication: the layer is not just a row of fixed instructions. It is a small prescription plus a controlled set of log-time degrees of freedom. The builder should therefore model **defaults + allowed alternatives + locks**, and the logger should store **planned values + actual values**.

#### Static Max Scaffold

| Field                    | Draft / Tom input needed                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routine name             | Static max                                                                                                                                                                                                                                                                                                                                                                          |
| Purpose                  | Measure best STA hold duration.                                                                                                                                                                                                                                                                                                                                                     |
| Layers                   | One STA layer; breathe-up open; duration-only open dive target; effort max/submax; FL unless changed.                                                                                                                                                                                                                                                                               |
| Open vs fixed values     | Breathe-up open or fixed by routine variant; hold duration open.                                                                                                                                                                                                                                                                                                                    |
| Standard metrics         | Duration, wet/dry, notes, safety outcome, *Breathe-up duration*, *RPE, Enjoyment, basal mood, Buddy name*                                                                                                                                                                                                                                                                           |
| Geek metrics             | Contractions, SpO2, HR, recovery quality, <br>heart rate *throughout the hold (this could be imported)*, SpO2 *throughout the hold (this could be imported)*, *Minimum HR, minimum Spo2, breathing technique, hours since last meal, water temp, HRV, Basal HR, Equipment used, Facial gear used, body weight, FVC (liters), FVC with packing, Packing volume %*, Contraction onset |
| Dashboard hero metric    | Duration                                                                                                                                                                                                                                                                                                                                                                            |
| Secondary display metric | breathing technique. *Tertiary metric: minimum HR*                                                                                                                                                                                                                                                                                                                                  |
| Default tags             | `max`, `static`.                                                                                                                                                                                                                                                                                                                                                                    |
| Selectable tags          | `pb-attempt`, `competition`, `dry`, `wet`, `experimental`.                                                                                                                                                                                                                                                                                                                          |
| Safety/context fields    | Buddy for wet; dry import/capture fields for dry.                                                                                                                                                                                                                                                                                                                                   |
| Existing-data mapping    | Current max-attempt STA routine.                                                                                                                                                                                                                                                                                                                                                    |

#### Dynamic Sweet 16 Scaffold

| Field                    | Draft / Tom input needed                                                                                                                                                                                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routine name             | Dynamic Sweet 16                                                                                                                                                                                                                                                                                    |
| Purpose                  | Repeated dynamic work for CO2/endurance tolerance.                                                                                                                                                                                                                                                  |
| Layers                   | One DYN layer repeated 16 times; open distance ; rest/breathe-up open                                                                                                                                                                                                                               |
| Open vs fixed values     | Open distance per rep; rest/breathe-up open                                                                                                                                                                                                                                                         |
| Standard metrics         | Reps completed, total distance,  total time for the routine (lower times are better), rest time, notes.                                                                                                                                                                                             |
| Geek metrics             | Time per lap, speed per lap, kicks, HR if available, *Minimum HR, minimum Spo2, breathing technique, hours since last meal, water temp, HRV, Basal HR, Equipment used, Facial gear used, body weight, FVC (liters), FVC with packing, Packing volume %*, cumulative dive time, cumulative rest time |
| Dashboard hero metric    | Total time                                                                                                                                                                                                                                                                                          |
| Secondary display metric | Total distance. *Tertiary display metric: average speed*                                                                                                                                                                                                                                            |
| Default tags             | `co2`, `endurance`, `dynamic`.                                                                                                                                                                                                                                                                      |
| Selectable tags          | `technique`, co2 training, resilience, lactic training, hard`, `easy`, `experimental`.                                                                                                                                                                                                              |
| Safety/context fields    | Pool length, buddy, samba/BO optional.                                                                                                                                                                                                                                                              |
| Existing-data mapping    | Current interval-series dynamic routine with `numberOfReps` and `repDistance`.                                                                                                                                                                                                                      |

#### Static 2-Breath Table Scaffold

| Field                    | Draft / Tom input needed                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Routine name             | Static 2-breath table                                                                                                                        |
| Purpose                  | STA table using constrained breathe-up/recovery.                                                                                             |
| Layers                   | STA layer or progressive STA layers; repeat count and hold durations. *Confirm: however each layer could have different rest/hold durations* |
| Open vs fixed values     | Breathe-up/rest likely fixed by 2-breath rule; hold duration may be fixed/progressive/open depending protocol.                               |
| Standard metrics         | Reps completed, hold duration, total hold time, notes.                                                                                       |
| Geek metrics             | Contraction onset, SpO2, HR, time below SpO2 threshold, recovery quality.                                                                    |
| Dashboard hero metric    | Total hold time or reps completed.                                                                                                           |
| Secondary display metric | Longest hold or completion count.                                                                                                            |
| Default tags             | `co2`, `static`, `table`.                                                                                                                    |
| Selectable tags          | `rv`, `frc`, `submax`, `technique`, `hard`, `easy`.                                                                                          |
| Safety/context fields    | Dry/wet, buddy if wet, dry capture/import if dry.                                                                                            |
| Existing-data mapping    | Current static interval/table routine.                                                                                                       |

#### Dry RV Table Scaffold

| Field                    | Draft / Tom input needed                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Routine name             | Dry RV table                                                                                                                           |
| Purpose                  | Dry RV work with physiology tracking and possible embedded max attempt.                                                                |
| Layers                   | STA dry RV layers; 8 reps total; open breathe and hold time; max attempt hold could be any, so calculated afterwards from longest hold |
| Open vs fixed values     | Breathe-up/hold targets open; effort likely mostly standard with one optional max layer.                                               |
| Standard metrics         | Hold duration, reps completed, lung volume RV, dry flag, minimum spo2, minimum HR, notes.                                              |
| Geek metrics             | SpO2, HR, time below SpO2 threshold, contractions, recovery quality,                                                                   |
| Dashboard hero metric    | Longest RV hold                                                                                                                        |
| Secondary display metric | Total cumulative RV hold time; Tertiary: cumulative time below 70% spo2                                                                |
| Default tags             | `dry`, `rv`, `static`, `table`.                                                                                                        |
| Selectable tags          | `max`, `submax`, `o2`, `co2`, `experimental`.                                                                                          |
| Safety/context fields    | Dry capture/import source, sensor availability, notes.                                                                                 |
| Existing-data mapping    | Current dry STA routine plus Stamina CSV import path.                                                                                  |

### Step 2 Questions For Tom

The model can continue without all answers, but these are the highest-value details to confirm before implementation:

1. For Dynamic Sweet 16, is each rep always 50m, or should the default adapt to pool length/athlete level? *The athlete should be able to specify pool length when logging. Most often it will be 50m, but it's possible that it's a different length also. This means analytics would need to compare the routine with similar legnths to be meaningful.*
2. For Dynamic Sweet 16, is breathe-up/rest a fixed duration, a breath count, open, or recorded only as actual result? *It's recorded as an actual result. The diver is trying to go as fast as possible so this could change from lap to lap*
3. For Static 2-breath table, what are the default repeat count and hold durations/progression? *Let's default to 3 reps, 2:00 hold duration*
4. For Dry RV table, where does the max-attempt layer usually sit, if included? *4th rep*
5. For Dry RV table, should `timeBelowSpO2Threshold` be a standard metric or geek metric? *geek metric*
6. Should dry/wet be an attribute per layer, or should routines have a default environment with layer overrides? *routine level with layer override (Extremely unlikely to differ between layers*

### Step 3: How The Examples Should Revise The Model

After the five scaffolds are filled, the next pass should revise the model by looking for friction:

- If a routine needs breath count rather than seconds, add a breathe-up target variant rather than overloading duration.
- If a routine needs both planned rest and actual breathe-up, separate `breatheUp` from `restBefore` explicitly.
- If dry/wet is usually routine-wide but sometimes layer-specific, model it as a routine default plus layer override.
- If many metrics are sensor-dependent, add capture availability to metric profiles.
- If tags differ between routine-level and layer-level analytics, store both routine tags and row tags in result snapshots.

The strongest next planning artifact would be a filled example for each default routine, followed by updated type sketches and transform examples.

## Purpose

This audit documents how the current routine builder works in the implemented codebase, with special attention to the simplified builder, metrics, tags, and the current three routine types. It is intentionally an audit only: no implementation plan or redesign is proposed here beyond identifying simplification opportunities and questions for the next phase.

## Audit TODO

- [x] Map the routine builder entry points and components.
- [x] Trace the builder state into `RoutineTemplate` persistence.
- [x] Trace how tracking metrics affect logging, display, and analytics.
- [x] Trace how routine tags, default tags, and selectable tags work.
- [x] Assess the value added by each major concept.
- [x] Identify complexity hotspots for later UX simplification planning.
- [ ] In a later planning pass, design a simpler routine creation concept that preserves analytics power.

## Executive Summary

The current simplified builder is a six-step wizard:

1. Choose type.
2. Configure the routine.
3. Configure tags.
4. Configure tracking metrics.
5. Configure display metrics.
6. Review and save.

The three routine types are `max-attempt`, `interval-series`, and `hybrid`. These are primarily a builder UX abstraction. Persisted data is richer and more flexible: a routine template stores `activityType`, `disciplines`, `tags`, optional uniform interval fields, optional variable `table`, optional hybrid fields, `trainingEnvironment`, `defaultTags`, `selectableTags`, `trackingConfig`, and `displayConfig`.

The main strength of the current system is that it preserves a lot of analytics potential. `TrackingConfig` can turn a routine into a highly instrumented data capture template, while `DisplayConfig` controls dashboard presentation and `MetricType` supports derived values. Tags provide a promising non-numeric classification layer.

The main weakness is that users must understand too many conceptual layers at build time: routine type, activity type, routine tags, template tags, default tags, selectable tags, tracking metrics, capture sources, display metrics, interval structure, wet/dry environment, and sometimes hybrid max placement. The builder has become a powerful schema editor with friendly language, not yet a truly simple routine creation experience.

*A particularly important finding: `defaultTags` and `selectableTags` are stored on the routine, and `selectableTags` are shown in quick logging. However, I did not find code that automatically applies `routine.defaultTags` to a created routine log. That means the conceptual promise of default tags as always-applied session classification may not currently be realized in saved log data. Routine-level `tags` are still used for routine listing/filtering and some max-attempt inference.*

## Main Files Audited

### Builder Components

- `src/lib/components/routine-builder/SimplifiedRoutineBuilder.svelte`
- `src/lib/components/routine-builder/simplified/TypeSelector.svelte`
- `src/lib/components/routine-builder/simplified/MaxAttemptConfig.svelte`
- `src/lib/components/routine-builder/simplified/IntervalConfig.svelte`
- `src/lib/components/routine-builder/simplified/HybridConfig.svelte`
- `src/lib/components/routine-builder/simplified/TagSelector.svelte`
- `src/lib/components/routine-builder/simplified/TrackingOptions.svelte`
- `src/lib/components/routine-builder/simplified/DisplayMetricSelector.svelte`
- `src/lib/components/routine-builder/simplified/ReviewStep.svelte`
- `src/lib/components/routine-builder/TableEditor.svelte`
- `src/lib/components/routine-builder/TableRowEditor.svelte`

### Entry Points

- `src/routes/(app)/routines/create/+page.svelte`
- `src/routes/(app)/routines/[id]/edit/+page.svelte`
- `src/routes/(app)/routines/+page.svelte`
- `src/routes/(app)/routines/[id]/analytics/+page.svelte`

### Data and Persistence

- `src/lib/types.ts`
- `src/lib/firestore.ts`
- `src/lib/utils/migration.ts`

### Logging, Cards, and Metrics

- `src/lib/components/QuickLogForm.svelte`
- `src/lib/components/EditableLogForm.svelte`
- `src/lib/components/SessionCard.svelte`
- `src/lib/utils/metrics.ts`

### Tag Documentation and Config

- `src/lib/config/tagConfig.ts`
- `docs/routines/tags.md`
- `docs/routines/builder-simplified.md`
- `docs/routines/builder-custom.md`

## Current User Flow

### Create

`src/routes/(app)/routines/create/+page.svelte` renders `SimplifiedRoutineBuilder` with `onSuccess` and `onCancel`. Both paths return the user to `/routines`.

### Edit

`src/routes/(app)/routines/[id]/edit/+page.svelte` loads a routine with `getRoutine(routineId)`, then passes `initialData` and `routineId` into `SimplifiedRoutineBuilder`. On save, the builder calls `updateRoutine` and returns to `/routines`.

### Duplicate

`SimplifiedRoutineBuilder` has a `duplicateFrom` prop. If present, the builder captures that source data at mount and sets the name to `Original Name (Copy)`. I did not audit the route that invokes duplication, but the builder supports it internally.

## Top-Level Builder State

`SimplifiedRoutineBuilder.svelte` owns almost all wizard state directly:

- Current wizard step: `select-type`, `configure`, `tags`, `tracking`, `display`, `review`.
- Selected type: `SimplifiedRoutineType | null`.
- Basic fields: `name`, `description`, `disciplines`, `tags`.
- New tag fields: `defaultTags`, `selectableTags`.
- Max attempt fields: `trainingEnvironment`, `routineTags`.
- Interval fields: `intervalStructure`, `numberOfReps`, `restBetweenReps`, `repDistance`, `repDuration`, `table`.
- Hybrid fields: `maxDivePosition`, `maxDiveRepNumber`, `hybridMaxEffort`.
- Tracking: `trackingPreset`, `trackingConfig`.
- Display: `displayConfig`.
- Submit state: `isSubmitting`, `error`.

The builder captures `initialData` or `duplicateFrom` into `_sourceData` once at mount. That makes the component act like a one-shot editor/creator rather than a reactive editor for changing props.

## Wizard Steps

### Step 1: Type Selection

`TypeSelector.svelte` presents three cards:

- Max Attempt: single dive performance.
- Interval Series: multiple reps with structure.
- Hybrid: intervals plus max component.

The cards are descriptive and example-heavy. This helps explain the model, but also front-loads a taxonomy decision before the user has described the actual routine. The chosen type determines which configuration component appears next.

### Step 2: Type-Specific Configuration

The `configure` step renders one of three components.

#### Max Attempt

`MaxAttemptConfig.svelte` collects:

- Routine name.
- Description.
- One or more disciplines.
- Training environment when STA is selected: wet, dry, or both.

It also updates `displayConfig` based on whether the routine is static-only or dynamic/mixed. For static-only routines, the hero metric becomes time; for dynamic or mixed routines, the hero metric becomes distance.

There is a `routineTags` binding, but this component no longer exposes effort tag controls in the visible portion audited. The parent still defaults `routineTags` to `['training']` and uses it to infer activity type for max attempts.

#### Interval Series

`IntervalConfig.svelte` collects:

- Routine name.
- Description.
- Discipline(s).
- Training environment for static-only routines.
- Interval structure: uniform or variable.
- Uniform settings: number of reps, rest between reps, hold duration for static, or rep distance for dynamic.
- Variable table rows via `TableEditor`.

The component computes whether the routine is static only by checking `disciplines.includes('STA') && disciplines.length === 1`. Mixed STA and dynamic selections are therefore treated as dynamic for structure/display purposes.

For uniform static intervals, `repDuration` is gathered locally, but the parent does not currently write `repDuration` to the routine template on submit. This may be intentional because the data model says rep duration is logged per session, not stored in the template. But the UI label says target hold duration, so this can create a conceptual mismatch: the user appears to set a target, but the persisted routine does not carry that target unless using a variable table.

For variable intervals, `table.rows` stores per-rep `restBefore` plus `targetDuration` for static or `targetDistance` and optional `targetTime` for dynamic.

`IntervalConfig.svelte` also defines a `toggleTag` helper for `routineTags`, but I did not find corresponding visible controls in the audited markup. This looks like leftover or incomplete code.

#### Hybrid

`HybridConfig.svelte` collects:

- Routine name.
- Description.
- Discipline(s).
- Max dive rep number.
- Derived max dive position: start, middle, or end.
- Max effort: max or submax.
- Uniform or variable interval settings.
- Structure preview.

The component stores both an exact `maxDiveRepNumber` and a coarse `maxDivePosition`. The exact rep number is more expressive, while the coarse position is used for summary/preview and persisted as `maxDivePosition`.

There are some current limitations and inconsistencies:

- The hybrid component does not expose `trainingEnvironment`, even if STA is selected.
- Static hybrid uniform intervals do not expose a hold duration field in the audited markup, only interval reps and rest.
- Variable hybrid table only renders when `intervalStructure === 'variable' && table`, but unlike `IntervalConfig`, I did not find an effect that initializes the table when the user chooses variable.
- `hybridMaxEffort` is collected and shown in review, but it does not appear to be persisted in `RoutineTemplateFormData` by the parent submit handler.

### Step 3: Tags

`TagSelector.svelte` lets each tag be in exactly one of three states:

- Default: automatically applied to every log, conceptually.
- Selectable: offered to the user at log time.
- None.

The UI organizes tags by category:

- Effort Level: `max`, `submax`, `warmup`, `recovery`.
- Training Adaptation: `co2`, `o2`, `technique`, `mental`, `endurance`, `power`.
- Session Context: `training`, `competition`, `pb-attempt`, `fun`, `experimental`.
- Difficulty Level: `beginner`, `intermediate`, `advanced`, `expert`.

All tags currently allow both default and selectable use. The mutual exclusivity logic is simple: setting a tag as default removes it from selectable; setting it as selectable removes it from default.

Value added:

- Tags provide a lightweight classification layer without requiring numeric values.
- Tags are especially useful where the user wants analytics filtering but there is no measured metric.
- Selectable tags are a good way to keep the routine template simple while allowing per-session variation.

Costs and risks:

- `D` and `S` are compact but abstract. A novice must understand two separate tag modes.
- The builder has both legacy `tags`/`routineTags` and new `defaultTags`/`selectableTags`, which creates conceptual duplication.
- Default tags are described as always applied to logs, but I did not find code that applies them to routine logs. That weakens their current analytics value.

### Step 4: Tracking Metrics

`TrackingOptions.svelte` exposes a large set of booleans under collapsible sections:

- Performance Metrics.
- Session Context.
- Body and Recovery.
- Equipment and Safety.
- Notes.
- Biometrics for dry training.

The default expanded sections are performance and notes. The component counts enabled metrics and allows selecting or clearing all fields in a section.

Several dynamic-video metrics have capture-source controls:

- Total Distance.
- Total Time.
- Time Per Lap.
- Speed Per Lap.
- Avg Speed.

Each can be manual, from recorder, or either. This is powerful because it separates a metric from the source of that metric.

Value added:

- This is the main power-user engine. It controls what quick-log and edit-log ask for.
- The metric list is broad enough to support performance, readiness, biometrics, environment, and safety analytics.
- Capture sources support both manual logging and recorder-assisted workflows.

Costs and risks:

- This step is cognitively heavy. It exposes implementation-level field names as user choices.
- The section count can make the product feel like a form builder rather than a routine builder.
- `showBiometrics` is currently `trainingEnvironment !== 'wet' || disciplines.includes('STA')`, which means any STA routine shows biometrics, including wet STA. The intended condition may be dry/both STA.
- `selectedType` is passed in but not used in the component logic, suggesting the tracking UI is not currently tailored by routine type.
- `trackingPreset` exists in the parent, but no audited UI exposes minimal/standard/full/custom selection. Defaults are set by code, then the user edits raw sections.

### Step 5: Display Metrics

`DisplayMetricSelector.svelte` lets the user choose:

- Hero metric.
- Secondary metric.
- Optional tertiary metric.

It shows a session card preview. Available metrics include direct metrics and derived metrics such as total hold time, longest hold, average rest, and total rep distance.

Value added:

- Display config lets each routine emphasize what matters most.
- It decouples data capture from dashboard presentation.
- The preview helps the user understand the immediate effect.

Costs and risks:

- The metric list is not filtered by `trackingConfig`; a user can pick metrics they are not actually tracking.
- Labels and display choices add another layer of configuration after the user has already selected tracking metrics.
- Some display metrics are aliases or derived concepts whose difference is not obvious to a novice, for example `totalTime`, `repDuration`, `longestHold`, `totalBreathHoldTime`, and `cumulativeHoldTime`.

### Step 6: Review

`ReviewStep.svelte` summarizes:

- Type and name.
- Description.
- Disciplines.
- Routine tags for max attempts.
- Training environment for STA.
- Structure summary.
- Default and selectable tags.
- Structure preview for intervals/hybrids.
- Tracking metric count and the first eight enabled metrics.

The review step is useful, but it repeats all conceptual layers rather than simplifying them into user intent.

## Persistence Mapping

On submit, `SimplifiedRoutineBuilder.svelte` builds `RoutineTemplateFormData` and calls either `createRoutine($user.uid, routineData)` or `updateRoutine(routineId, routineData)`.

Common fields written:

- `name`
- `description`
- `disciplines`
- `tags: buildTags()`
- `activityType: mapToActivityType()`
- `trainingEnvironment`
- `routineTags`
- `defaultTags`
- `selectableTags`
- `trackingConfig`
- `displayConfig`

Uniform interval fields written for interval/hybrid routines:

- `restBetweenReps`
- `numberOfReps`
- `repDistance`, if present

Variable interval field written:

- `table`, if present

Hybrid fields written:

- `maxDivePosition`
- `maxDiveRepNumber`

Fields collected but apparently not persisted:

- `repDuration` from uniform static interval configuration.
- `hybridMaxEffort` from hybrid configuration.

`createRoutine` and `updateRoutine` strip `undefined` values before writing to Firestore.

## Activity Type Mapping

`SimplifiedRoutineBuilder.svelte` maps simplified types as follows:

- `max-attempt`: returns `max-attempt` if `routineTags.includes('max')`, otherwise `submax-attempt`.
- `interval-series`: returns `structured-intervals`.
- `hybrid`: returns `structured-intervals`.

This means hybrid is not first-class in `activityType`; it is detected through fields/tags such as `tags.includes('hybrid')`, `maxDivePosition`, and `maxDiveRepNumber`.

Backward compatibility is handled in `src/lib/utils/migration.ts`:

- `normalizeRoutineTemplate` fills missing `activityType` using `inferActivityType`.
- `inferActivityType` checks tags like `max-attempt`, `sub-max`, and `submax`, then protocol type, then tracking config.

Current tension:

- New builder tags use `max` and `submax`.
- Older inference checks `max-attempt`, `sub-max`, and `submax`.
- Some downstream code still checks `routine.tags.includes('max-attempt') || routine.tags.includes('pb')`.

This creates a risk that newer routines and older analytics/listing assumptions do not classify max attempts consistently.

## Data Model Concepts

### SimplifiedRoutineType

Defined as:

- `max-attempt`
- `interval-series`
- `hybrid`

This is a builder-facing type, not the only stored classification.

### ActivityType

`ActivityType` is the semantic storage type used by routine templates. It is inferred for old routines and explicitly written for new ones. In the builder, hybrid maps to `structured-intervals`, so it loses its uniqueness at this layer.

### RoutineTemplate

Important builder-related fields:

- `activityType?`
- `protocolType?` deprecated legacy field.
- `disciplines`
- `tags`
- `restBetweenReps`
- `repDistance`
- `numberOfReps`
- `table`
- `maxDivePosition`
- `maxDiveRepNumber`
- `trainingEnvironment`
- `routineTags?` deprecated in the type comments.
- `defaultTags?`
- `selectableTags?`
- `trackingConfig`
- `displayConfig`

The model is flexible enough to support a non-type-based builder. It already stores structure, environment, tags, tracking, and display independently.

### RoutineTable

`RoutineTable` is a list of rows. Each row has:

- `repNumber`
- `restBefore`
- `targetDuration?` for static.
- `targetDistance?` for dynamic.
- `targetTime?` for dynamic target pace/time.

This is the most concrete routine-structure representation in the current code. It can represent progressive static tables, dynamic pyramids, and other per-rep prescriptions.

## Metrics System

### TrackingConfig

`TrackingConfig` is a boolean feature map that determines which fields the logging UI should show. It includes:

Session context:

- Pool length.
- Initial breathe-up time.

Performance:

- Total distance.
- Total time.
- Reps completed.
- Rep duration.
- Rep distance.
- Time per lap.
- Rest between laps/reps.
- Kicks per lap.
- Arm pulls per lap.
- Avg speed.
- Speed per lap.

Capture source metadata:

- `totalDistanceSource`
- `totalTimeSource`
- `timePerLapSource`
- `speedPerLapSource`
- `avgSpeedSource`

Training context:

- Breathing technique.
- RPE.
- Joy scale.
- Hours since last meal.
- Notes.

Environment, body, safety, equipment, and recovery:

- Water temperature.
- Contractions onset time.
- Equipment used.
- Buddy name.
- Resting heart rate.
- HRV.
- Pool type.
- Samba/BO.
- Breaths between reps.
- Menstrual cycle day.
- Facial gear.
- Basal mood.
- Minimum SpO2.
- Minimum HR.
- Body weight.

Dry/biometric and lung capacity:

- Per-rep SpO2.
- Per-rep HR.
- SpO2 thresholds.
- Dry training flag.
- FVC.
- FVC with packing.
- Packing volume.
- Lung volume.

O2-assisted static fields:

- Lucidity.
- Urge to breathe.
- Contractions.
- ETCO2.
- Expired air post-hold.
- Lung volume loss per minute.
- Gas mix.
- CO2 tremor onset.
- Mental change time.
- Recovery quality.
- End SpO2.
- Breathe-up type.

Value added:

- This is a strong analytics foundation.
- It makes the routine template a data capture schema.
- It supports lightweight users and very detailed power users in the same model.

Cost:

- In builder UI, it is exposed as many independent toggles. That makes the user responsible for understanding analytics implications.

### MetricType and DisplayConfig

`MetricType` is used for display and derived metric calculations. `DisplayConfig` chooses hero, secondary, and optional tertiary metrics.

`src/lib/utils/metrics.ts` supports:

- Direct metrics: total distance, total time, reps completed, rep duration, pool length, water temperature, resting heart rate, HRV, packing volume.
- Derived metrics: total rep distance, average time per lap/rep, average rest, total breath-hold time, total breathing time, total breaths, average speed.
- Biometric-derived style metrics: longest hold and cumulative hold time.
- Aliases: `diveDuration`, `diveDistance`, `holdDuration`, `lapDistance`, `cumulativeHoldTime`, `cumulativeDistance`, `avgSpeedMs`, and related speed aliases.

Value added:

- Display choices are not hardcoded by routine type.
- Derived metrics make analytics stronger without requiring repeated manual entry.

Cost:

- Some display metrics are not obviously tied to tracking toggles.
- Some aliases make the language more user-friendly in theory, but the builder currently still exposes a mixed list.

## Logging Flow Impact

`QuickLogForm.svelte` uses the routine template to decide what to show:

- `routine.disciplines` determines initial discipline and discipline selector.
- STA routines show wet/dry toggle.
- `routine.trackingConfig` determines session context, performance, training context, biometrics, and detailed rep UI.
- `routine.table` enables variable per-rep logging.
- `routine.selectableTags` creates a tag toggle section.
- `routine.activityType` and some legacy `routine.tags` checks decide whether competition/card/record fields appear.
- `routine.displayConfig` is not directly used in the form, but affects cards after save.

`selectedTags` chosen in quick-log are included in submitted `RoutineLogFormData` as `selectedTags`.

I did not find automatic merging of `routine.defaultTags` into the log submission. I also did not find display of `log.selectedTags` on `SessionCard` in the audited code; session card tags currently focus on competition/card/record tags.

This is important for analytics: if per-log tags are not surfaced or queried, then the builder tag work is not yet fully converted into user-facing analytics value.

## Session Card and Display Value

`SessionCard.svelte` reads `routine.displayConfig` and calls `getFormattedMetric` for hero, secondary, and tertiary metrics.

Value added:

- The builder can configure what matters on a dashboard card.
- Routine-specific cards can be optimized for static, dynamic, intervals, or biometrics.

Cost:

- If the selected display metric is not captured or derivable from the log, the card can show empty/zero-like values.
- The builder asks users to think about dashboard layout while they are still creating the routine.

## Analytics Usage Observed

The routine-specific analytics route displays `routine.tags`. Analytics components currently seem more metric-focused than tag-filter-focused in the audited search results.

Observed tag use:

- Routine list displays `routine.tags` chips.
- Routine analytics header displays `routine.tags` chips.
- `MiniAnalytics` and some routes still check older tags such as `max-attempt` and `pb`.
- `RoutineSessionsList` maps routine tags into session rows.
- Competition/card/record tags are displayed on cards and session detail.

Observed gap:

- `defaultTags` and `selectedTags` do not appear heavily used in analytics components yet.
- The codebase has a newer tag model, but analytics appears to still rely mainly on routine tags and explicit competition fields.

## Tags: Current Semantics

There are currently several tag-like concepts:

### `RoutineTemplate.tags`

General routine classification array. Used for routine display, filtering, compatibility inference, and some analytics/display checks.

### `RoutineTemplate.routineTags`

Deprecated by type comment. Still used in `SimplifiedRoutineBuilder` state and max-attempt `activityType` mapping.

### `RoutineTemplate.defaultTags`

New tag system. Intended to be automatically applied to every log created with this routine.

### `RoutineTemplate.selectableTags`

New tag system. Shown in quick-log so the user can choose tags per session.

### `RoutineLog.selectedTags`

Tags chosen at log time from `selectableTags`.

### Explicit session result tags

Stored as fields, not generic tags:

- `isCompetition`
- `compeitionOrg`
- `cardTag`
- `recordTag`
- `isPB`

These are currently more operational than generic tags, and are displayed in places like session cards and session detail pages.

## Value Assessment by Concept

### Three Routine Types

Value added:

- Gives users a starting taxonomy.
- Lets the UI branch into simple type-specific flows.
- Encodes common freediving patterns: single attempt, repeated intervals, intervals plus a peak attempt.

Costs:

- Forces an early classification choice.
- Hybrid overlaps strongly with interval series plus a tagged or marked max rep.
- Max attempt overlaps with interval series of one rep or freeform performance logging.
- The persisted model does not need these three types as hard categories.
- Users may think in terms of what they want to do, not which abstract type it belongs to.

### ActivityType

Value added:

- Better semantic storage than old `protocolType`.
- Useful for filtering and backward compatibility.

Costs:

- Not fully aligned with simplified type. Hybrid maps to structured intervals.
- Current tag inference has naming mismatches with newer builder tags.

### Interval Structure

Value added:

- Uniform mode supports simple repeated sets.
- Variable table supports real CO2/O2/progressive routines.
- `RoutineTable` is plain data and fits the repo's data-oriented design.

Costs:

- Uniform and variable are another branch under routine type.
- Static uniform target duration appears to be collected but not persisted.
- Variable table editing is powerful but dense on mobile.

### Hybrid Max Placement

Value added:

- Supports competition simulation and warmup-to-max structures.
- Exact `maxDiveRepNumber` is useful.

Costs:

- It may be better represented as a target/intention on a rep, rather than as a separate routine type.
- Actual max rep may only be known after logging, so the builder's prediction has limited analytics truth unless logs can override it.
- Current implementation persists max position/rep but not hybrid max effort.

### TrackingConfig

Value added:

- The most important analytics power mechanism.
- Very flexible and already connected to logging UI.
- Supports manual, recorder, and biometric sources.

Costs:

- Too much raw choice for novice routine creation.
- It is closer to database field configuration than user intent.
- Some metrics could be derived or suggested based on structure instead of manually chosen.

### DisplayConfig

Value added:

- Makes session feed more meaningful per routine.
- Supports different hero metrics for static, dynamic, intervals, and biometrics.

Costs:

- Adds configuration burden.
- It can be inferred well in many cases from discipline, structure, and tracking.
- The user can choose untracked metrics.

### Tags

Value added:

- Critical for analytics dimensions that are not numeric.
- Useful for effort, adaptation, context, and difficulty.
- Selectable tags allow per-session variability without changing templates.

Costs:

- Current system has too many tag layers.
- New default/selectable semantics are not fully propagated to logs/analytics.
- Some old tag names and new tag names diverge.
- `D` and `S` controls are compact but not self-evident.

## Main Complexity Hotspots

1. The builder starts with an abstract type choice before asking what the user wants to record.
2. There are six wizard steps, several of which are configuration-heavy.
3. Tags exist in four forms: `tags`, `routineTags`, `defaultTags`, and `selectableTags`.
4. Tracking metrics are exposed as a large checklist rather than as intent-based presets or derived suggestions.
5. Display metrics are another full configuration surface after tracking metrics.
6. Hybrid duplicates interval logic but adds max-placement-specific concepts.
7. Some collected values are not persisted, including uniform static `repDuration` and `hybridMaxEffort`.
8. Some persisted concepts are not yet fully consumed, especially `defaultTags` and possibly `selectedTags` in analytics/display.
9. Mixed-discipline routines create ambiguous logic, especially STA plus dynamic disciplines.
10. Backward compatibility checks use older tag names that may not align with new builder output.

## Data-Oriented Observations

The underlying data model is stronger than the current UX suggests. A routine can be modeled as plain data:

- Identity and description.
- Applicable disciplines.
- Structure: none, uniform repetition, or explicit row table.
- Optional annotations on structure, such as expected max rep.
- Capture schema via `trackingConfig`.
- Classification dimensions via tags.
- Presentation preferences via `displayConfig`.

This suggests the app may not need users to choose a routine type explicitly. The type can likely be derived from the data shape:

- No table and no reps: single attempt/free session.
- Uniform repeated fields: repeated set.
- Table rows: structured table.
- A row marked as expected max: hybrid-like behavior.

That is not a plan yet, but it is the key structural observation from the audit.

## Open Questions for the Next Conceptual Pass

1. Should routine creation begin with user intent, such as single dive, repeat a set, or build a table, instead of named routine types?
2. Should max/submax be a tag, an effort field, an attempt category, or all three with one canonical source of truth?
3. Should `defaultTags` be written onto every `RoutineLog`, or should analytics always join logs to routine templates?
4. Should `selectedTags` be displayed on session cards and included in analytics filtering?
5. Should `routineTags` be removed from the builder path now that the type marks it deprecated?
6. Should display metrics be inferred by default and moved into an advanced customization area?
7. Should tracking metrics be selected through presets based on goals, with raw toggles hidden behind advanced mode?
8. Should hybrid be represented as an interval/table row attribute rather than a top-level routine type?
9. Should wet/dry be available for all STA-capable routines consistently, including hybrid?
10. Should static uniform target duration be persisted as structure, or should uniform static intervals always be represented as a generated table?

## Audit Conclusion

The implemented routine builder has a strong technical foundation but exposes too much of that foundation directly to users. The current three-type simplified model did reduce the original design space, but it still asks users to make multiple schema-level decisions. Most of the app's analytics power appears to live in plain data structures that could be driven by a simpler interaction model.

The strongest path for future simplification is likely to preserve `RoutineTemplate`, `RoutineTable`, `TrackingConfig`, `DisplayConfig`, and the tag taxonomy, but change how users arrive at those structures. The next phase should focus on a routine creation concept that starts from intent and routine shape, derives the type-like classifications internally, and progressively reveals advanced tracking/tag/display controls only when they add clear value.
