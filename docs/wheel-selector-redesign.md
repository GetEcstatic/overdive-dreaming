# NumberWheel Selector — Redesign Plan

> Status: **Proposal / planning**.
> Touchpoints: [`NumberWheelInput.svelte`](../src/lib/components/NumberWheelInput.svelte), [`QuickLogForm.svelte`](../src/lib/components/QuickLogForm.svelte), [`EditableLogForm.svelte`](../src/lib/components/EditableLogForm.svelte), [`RepEditor.svelte`](../src/lib/components/RepEditor.svelte), [`+page.svelte` (record)](../src/routes/(app)/dive/record/%5Bid%5D/+page.svelte).

---

## 1. Problem

The current [`NumberWheelInput.svelte`](../src/lib/components/NumberWheelInput.svelte) is an inline iOS-style scroll wheel:

- 4 rem wide column, 3 visible items at 28–32 px tall.
- `overflow-y: scroll` + `scroll-snap-type: y mandatory` + `setTimeout(100)` snap.
- Used inline inside form rows in QuickLog, EditableLog, RepEditor and the live recorder.

Reported pain points (from user, observed in dogfooding):

| # | Problem | Root cause |
|---|---------|-----------|
| P1 | Numbers are too small to read/aim at on a phone (~18 px font, 32 px row). | Inline density required to fit alongside other form fields. |
| P2 | Touch starts on the wheel often pan the whole page instead of the wheel — or vice-versa. | No `touch-action`/`overscroll-behavior` constraint on the wheel; ambiguous gesture region (column too narrow). |
| P3 | Easy to flick past the target value; no haptic/visual click feedback. | One snap event at end of scroll; no per-item feedback. |
| P4 | No way to type a value when the range is large (e.g. 0–500 m). | No keyboard fallback; pure-scroll only. |
| P5 | Multiple wheels in one row (mins / secs / cm) compete for the same vertical scroll gesture. | Each wheel is independently scrollable, easy to grab the wrong one. |
| P6 | When the form is already scrollable (long QuickLog), nested scrolling is brittle on iOS. | iOS does not always propagate scroll-chain to inner elements cleanly; pull-to-refresh fires. |

We want UX that:

1. Is **easy to hit** (Fitts' law: ≥ 44 px touch targets, big enough numbers).
2. Has an **unambiguous gesture region** (no accidental page scroll, no accidental wheel scroll).
3. Supports **fast rough selection** (flick) **and precise selection** (single-step).
4. Allows **direct keyboard entry** for power users / large ranges.
5. Stays **compact in the form** so dense screens (live recorder HUD, rep table) aren't overwhelmed.

---

## 2. Design options

### Option A — Tap-to-open bottom sheet wheel ⭐ (user's proposal, recommended primary)

```
INLINE                     OPEN
┌────────────────────┐    ┌─────────────────────────┐
│ Distance   [ 50 m ]│    │ ╳   Distance        ✓   │
└────────────────────┘    │                         │
                          │            45           │
       tap →              │            48           │
                          │   ━━━━━━  50  ━━━━━━    │
                          │            52           │
                          │            55           │
                          │                         │
                          │  44 46 48 [50] 52 54 56 │
                          │                         │
                          │  type:   [   50    ] m  │
                          └─────────────────────────┘
```

**Inline state:** a tap-target chip showing `label · value · unit` (~44 px tall, full row width).
**On tap:** open a modal **bottom sheet** containing:

- Large wheel (rows ≥ 56 px, font 2 rem, ~5–7 visible items).
- Wide column (~60 % of screen width) with massive touch area.
- A horizontal "ruler" of ±3 neighbours below for a quick-tap fallback.
- A tappable **numeric input** field for direct keyboard entry.
- Confirm (✓) commits + closes; ✗/swipe-down dismisses without committing.

Pros:
- **Solves P1, P2, P3, P5, P6 simultaneously.** Wheel only exists when isolated full-screen → no gesture ambiguity, no nested scroll, no competing wheels.
- Big targets, big numbers.
- Trivial keyboard support (focused input inside the sheet).
- Native-feeling on iOS/Android (matches Date/Time pickers).

Cons:
- One extra tap to commit on every change.
- Sheet animation cost on slow devices (mitigation: CSS transform + `will-change`).
- Slightly more code (sheet container, focus management, route-level one-at-a-time guard).

### Option B — Beefed-up inline wheel

Keep inline but upgrade:
- Min row 44 px, font 1.4 rem.
- `touch-action: pan-y` on the wheel; `overscroll-behavior: contain`.
- Make the column **the entire row width**, with the value centred and faded neighbours on either side **horizontally** (a horizontal wheel) — solves P5 because a horizontal flick isn't ambiguous with vertical page scroll.
- Add ± stepper buttons flanking the value for precision.
- Tap the value to open a small inline edit field (number input).

Pros: no modal; faster commit; single-screen.
Cons: takes more vertical space per field; horizontal wheels still scroll-trap the row; less keyboard-friendly than a sheet.

### Option C — Stepper + editable text

Replace the wheel entirely with `[−] [   50 m   ] [+]`:
- Tap value → keyboard input.
- ± buttons step by `step`.
- Long-press ± auto-repeats.

Pros: simplest implementation; perfectly accessible; no gesture issues at all.
Cons: slow for big jumps in long ranges; loses the "browsable" feel of a wheel — you don't see neighbouring options; less suited to e.g. picking RPE from 1–10 where you want to "see the scale".

### Option D — Native `<input type="number">` only

Pros: zero custom code, native keyboard, accessible.
Cons: dull; no scrub; iOS shows a dot-and-decimal keyboard that's awkward; no constrained range UI.

### Option E — Hybrid: stepper inline, sheet on long-press / value-tap

Stepper for ±1 nudges, tap-on-value opens the Option-A sheet for big jumps + keyboard entry.

Pros: combines C and A's strengths; everyday small nudges stay one-tap.
Cons: two interaction patterns to learn; more chrome per row.

---

## 3. Recommendation

**Primary: Option A (tap-to-open bottom sheet).** Closest to native pickers, eliminates every scroll-gesture problem at once, and the user already proposed it.

**Secondary: blend of A + C** — the inline collapsed state can include compact `−/+` buttons for ±step nudges without opening the sheet (covers RPE-style nudge cases). This is Option E in disguise but with the modal as the "rich" mode.

```
Inline (default):   [ −  |  Distance   50 m  | + ]   ← tap label/value opens sheet
Sheet (rich edit):  large wheel + ruler + numeric input + ✓
```

---

## 4. Architecture — data-oriented design

> **Project principle (added to [`claude.md`](../claude.md)):** *prefer plain data structures; express logic as pure functions; push side-effects to the edges. Components subscribe to data and dispatch events, they don't own logic.*

The redesign is structured around three layers:

1. **Pure data + pure functions** (no DOM, no Svelte) → unit-testable.
2. **Reactive state container** (Svelte runes) → wires data layer to UI.
3. **UI components** (NumberWheelInput, NumberWheelSheet) → render + dispatch user intents.

### 4.1 Data shape

```ts
// src/lib/components/numberWheel/types.ts

/** Static config for a wheel — never mutated during interaction. */
export type WheelSpec = Readonly<{
  min: number;
  max: number;
  step: number;
  /** Decimal places to render (auto-derived from step if omitted). */
  precision?: number;
  unit?: string;
  label?: string;
}>;

/** Transient state during scroll/drag (no DOM refs). */
export type WheelState = Readonly<{
  /** Current committed value (may be undefined if user hasn't picked). */
  value: number | undefined;
  /** "Live" index while dragging, snapped on release. */
  dragIndex: number | null;
  /** Whether sheet is open. */
  open: boolean;
}>;

/** All intents a wheel emits — handled by a pure reducer. */
export type WheelIntent =
  | { kind: 'open' }
  | { kind: 'close' }
  | { kind: 'commit'; value: number }
  | { kind: 'cancel' }
  | { kind: 'drag'; index: number }
  | { kind: 'nudge'; delta: number }      // for ± buttons
  | { kind: 'type'; raw: string };        // direct keyboard entry
```

### 4.2 Pure functions (testable in isolation)

```ts
// src/lib/components/numberWheel/wheel.ts

export function values(spec: WheelSpec): readonly number[] {
  const out: number[] = [];
  for (let v = spec.min; v <= spec.max + 1e-9; v += spec.step) out.push(round(v, spec));
  return out;
}

export function indexOf(spec: WheelSpec, value: number | undefined): number {
  if (value === undefined) return Math.floor(values(spec).length / 2); // sensible default
  const arr = values(spec);
  // binary search since arr is sorted
  return clamp(Math.round((value - spec.min) / spec.step), 0, arr.length - 1);
}

export function valueAt(spec: WheelSpec, index: number): number {
  return values(spec)[clamp(index, 0, values(spec).length - 1)];
}

export function snap(spec: WheelSpec, raw: number): number {
  return clamp(
    spec.min + Math.round((raw - spec.min) / spec.step) * spec.step,
    spec.min,
    spec.max
  );
}

export function format(spec: WheelSpec, value: number): string {
  const p = spec.precision ?? (Number.isInteger(spec.step) ? 0 : 1);
  return value.toFixed(p);
}

export function reduce(state: WheelState, intent: WheelIntent, spec: WheelSpec): WheelState {
  switch (intent.kind) {
    case 'open':   return { ...state, open: true,  dragIndex: indexOf(spec, state.value) };
    case 'close':  return { ...state, open: false, dragIndex: null };
    case 'cancel': return { ...state, open: false, dragIndex: null };
    case 'commit': return { value: snap(spec, intent.value), open: false, dragIndex: null };
    case 'drag':   return { ...state, dragIndex: clamp(intent.index, 0, values(spec).length - 1) };
    case 'nudge': {
      const i = indexOf(spec, state.value) + intent.delta;
      return { ...state, value: valueAt(spec, i) };
    }
    case 'type': {
      const n = Number(intent.raw);
      if (Number.isNaN(n)) return state;
      return { ...state, value: snap(spec, n) };
    }
  }
}
```

These functions have zero dependencies on Svelte, the DOM, or time. They can be unit-tested in vitest and reused (e.g. in the recorder's HUD or analytics code).

### 4.3 Tests (vitest, pure)

```ts
// src/lib/components/numberWheel/wheel.test.ts
import { describe, it, expect } from 'vitest';
import { values, indexOf, valueAt, snap, reduce } from './wheel';

const spec = { min: 0, max: 100, step: 5 } as const;

describe('numberWheel/wheel', () => {
  it('values() enumerates inclusive range', () => {
    expect(values(spec)).toEqual([0, 5, 10, /* … */ 95, 100]);
  });
  it('snap() rounds to nearest step and clamps', () => {
    expect(snap(spec, 7)).toBe(5);
    expect(snap(spec, 8)).toBe(10);
    expect(snap(spec, -3)).toBe(0);
    expect(snap(spec, 999)).toBe(100);
  });
  it('reduce(commit) snaps and closes', () => {
    const s = reduce({ value: 0, open: true, dragIndex: 1 }, { kind: 'commit', value: 53 }, spec);
    expect(s).toEqual({ value: 55, open: false, dragIndex: null });
  });
  it('reduce(nudge) walks the array', () => {
    const s = reduce({ value: 50, open: false, dragIndex: null }, { kind: 'nudge', delta: 1 }, spec);
    expect(s.value).toBe(55);
  });
});
```

### 4.4 Side-effects at the edges

DOM/IO things that **only** live inside the Svelte components — no business logic here:

- `addEventListener('pointerdown'/'pointermove'/'pointerup')` for the drag gesture → translated into `WheelIntent.drag` and `WheelIntent.commit`.
- `scrollTop` reads → translated into a pixel-delta → `WheelIntent.drag(index)`.
- Haptic feedback: `navigator.vibrate(5)` on each new snap index (Android).
- Focus management: trap focus inside the open sheet; restore on close.
- Body scroll lock: add `body.overflow: hidden` (and `touch-action: none` on the backdrop) while open, restore on close.
- `prefers-reduced-motion` check for sheet animation.

---

## 5. Component API (proposed)

```svelte
<NumberWheelInput
  bind:value={form.distanceMeters}
  spec={{ min: 0, max: 500, step: 5, unit: 'm', label: 'Distance' }}
  variant="chip"          /* "chip" (default), "stepper", "inline-wheel" */
  showNudgeButtons       /* renders ± inline */
  hint="Snaps to 5 m"
/>
```

Internals:

```
<NumberWheelInput>
  ├── (collapsed) <ChipButton on:tap={() => dispatch({ kind: 'open' })}>
  │                  {label}: {formatted} {unit}      [−] [+]
  └── (open)      <NumberWheelSheet>
                     <Backdrop />
                     <SheetContainer>
                        <Header label, value, ✗, ✓ />
                        <BigWheel onDrag onCommit />
                        <NeighbourRuler />          ← tap any chip to set
                        <NumericInput inputmode="decimal" />
                     </SheetContainer>
                  </NumberWheelSheet>
```

`NumberWheelSheet` only mounts while `open === true`. Single global sheet via `<svelte:body>` portal so it isn't clipped by overflow ancestors.

---

## 6. Interaction details (the BigWheel)

- Row height **64 px**, font **2 rem** bold tabular-nums, ≥ 5 visible rows.
- `touch-action: pan-y` on the wheel; `overscroll-behavior: contain` on the sheet body.
- **Drag, not native scroll**: implement with `pointermove` + transform-only animation (`translate3d(0, dy, 0)`), rubber-banding at ends. Avoids the iOS scroll-chain quirks and the messy `setTimeout(100)` snap. Pure-function `indexFromOffset(dy, rowH, length)` → emits `WheelIntent.drag`.
- On `pointerup` → snap with a single `transition: transform 200ms cubic-bezier(.2,.8,.2,1)` → emit `WheelIntent.commit`.
- Each new snapped index during drag → `navigator.vibrate?.(5)` (Android only; iOS ignores, no error).
- `prefers-reduced-motion: reduce` → instant snap, no animation.
- Tap any visible row to jump straight to it.

---

## 7. Accessibility

- Collapsed chip is a `<button aria-haspopup="dialog" aria-expanded={open}>`.
- Sheet is `role="dialog" aria-modal="true" aria-labelledby={labelId}`.
- BigWheel exposes `role="slider" aria-valuemin aria-valuemax aria-valuenow aria-valuetext`.
- Arrow Up/Down / Page Up/Down adjust value when wheel is focused.
- Esc cancels; Enter commits; visible ✓/✗ buttons mirror those.
- Focus trap with first-focusable = numeric input field for fast keyboard use; restored to chip on close.

---

## 8. Migration / rollout

The collapsed chip API is a drop-in replacement (`bind:value` and `min/max/step/label/unit/hint` all preserved). New props (`variant`, `showNudgeButtons`) default to the chip variant.

### 8.1 Phased rollout

1. **Phase 0 — Land pure module + tests** (no UI change, low risk):
   - `src/lib/components/numberWheel/types.ts`, `wheel.ts`, `wheel.test.ts`.
   - Wire current `NumberWheelInput.svelte` to use `values()`, `snap()`, `format()` so behaviour is identical but logic moves out.
2. **Phase 1 — Build NumberWheelSheet** behind a feature flag (`NumberWheelInput` adds `variant="chip"` opt-in). Test on `(app)/dive/record/[id]` first since that's the most painful surface.
3. **Phase 2 — Migrate call sites** in this order, one PR each:
   - [`record/[id]/+page.svelte`](../src/routes/(app)/dive/record/%5Bid%5D/+page.svelte) (live recorder, smallest blast radius).
   - [`RepEditor.svelte`](../src/lib/components/RepEditor.svelte) (rep table — many wheels per row, biggest pain).
   - [`QuickLogForm.svelte`](../src/lib/components/QuickLogForm.svelte).
   - [`EditableLogForm.svelte`](../src/lib/components/EditableLogForm.svelte).
4. **Phase 3 — Default `variant="chip"`** and remove the old inline wheel code path.

### 8.2 Out of scope for v1

- Multi-column pickers (mm:ss). DurationInput remains separate; can adopt the same sheet pattern in a follow-up.
- Decimal step quirks beyond `precision`.
- Localised number formatting.

---

## 9. Implementation TODO checklist

- [ ] Add `src/lib/components/numberWheel/types.ts` (WheelSpec, WheelState, WheelIntent).
- [ ] Add `src/lib/components/numberWheel/wheel.ts` (values, indexOf, valueAt, snap, format, reduce).
- [ ] Add `src/lib/components/numberWheel/wheel.test.ts` covering reduce + edge cases.
- [ ] Refactor `NumberWheelInput.svelte` to consume the pure module (no behaviour change yet).
- [ ] Create `NumberWheelSheet.svelte` (modal, BigWheel, neighbour ruler, numeric input).
- [ ] Add `variant="chip"` to `NumberWheelInput`; render ChipButton that opens the sheet.
- [ ] Add ± nudge buttons (`showNudgeButtons`) on the chip.
- [ ] Body scroll-lock + focus-trap utilities (single small module, also pure where possible).
- [ ] Hook `prefers-reduced-motion` and `navigator.vibrate` behind capability checks.
- [ ] A11y: aria roles, keyboard handlers, sheet-as-dialog.
- [ ] Migrate one call site (record page) to `variant="chip"` and dogfood for a session.
- [ ] Migrate remaining call sites; flip default variant; delete legacy inline wheel CSS.
- [ ] Update `claude.md` (already done as part of this plan) noting the data-oriented-design rule and pointing to `numberWheel/wheel.ts` as a reference example.

---

## 10. Open questions

1. **Confirm-on-tap or commit-on-snap?** Bottom sheet usually requires explicit ✓ to commit. For dense forms (RepEditor) that means N taps to confirm N values. Alternative: commit on snap, ✗ closes — relies on Undo if the user mis-snaps. Recommendation: **commit on close** (tap outside / scroll-down dismiss / ✓ all do the same thing); ✗ explicitly cancels. *Yes, ;et's run with confirm on tap*
2. **One sheet at a time globally?** Yes — open a new sheet implicitly closes the previous one via a `wheelSheetStore` singleton. Simpler than per-component state and matches platform expectation. *Yes*
3. **Should the live recorder use the chip variant?** Probably yes (target taps under stress are easier than scroll), but we should A/B in a recording session before defaulting it. *Yes, use chip*

---

## 11. Implementation log (Option A)

Implemented across 7 commits on `main`. Phased rollout matched §8.1:

- **Phase 0 — pure module (`02837c8`)**
  Added `numberWheel/types.ts` (readonly `WheelSpec` / `WheelState` /
  `WheelIntent`) and `numberWheel/wheel.ts` (precisionOf, valueCount,
  values, indexOf, valueAt, snap, format, initialState, reduce,
  indexFromOffset, neighbourIndices). Refactored
  `NumberWheelInput.svelte` to consume the pure module.
  35 vitest cases in `wheel.test.ts`, all green.

- **Phase 1 — sheet + chip variant (`28d3015`)**
  - `numberWheel/sheet-effects.ts`: `lockBodyScroll` (ref-counted),
    `trapFocus`, `prefersReducedMotion`, `vibrate` (Android haptic).
  - `numberWheel/wheelSheetStore.ts`: singleton store; a new
    `openWheelSheet` displaces any prior request, firing its
    `onCancel`.
  - `numberWheel/NumberWheelSheet.svelte`: BigWheel (64px rows,
    pointer-drag + wheel events), neighbour ruler, numeric input.
    `role="dialog"`, focus-trapped, body-scroll-locked,
    `prefers-reduced-motion` aware. Confirm-on-tap (explicit Done);
    backdrop tap or Cancel dismisses.
  - Mounted once in `src/routes/+layout.svelte`.
  - `NumberWheelInput.svelte` gained `variant="chip"` (and
    `showNudgeButtons` default true) — default still `wheel` here.

- **Phase 2 — call-site migration (`510b593`, `891c72a`, `6c8967b`,
  `9375504`)**
  Switched explicit `variant="chip"` on the wheels in
  `src/routes/(app)/dive/record/[id]/+page.svelte`,
  `src/lib/components/RepEditor.svelte` (the two distance pickers),
  `src/lib/components/QuickLogForm.svelte` (4) and
  `src/lib/components/EditableLogForm.svelte` (4). Separate commits
  per file for blast-radius isolation.

- **Phase 3 — flip default + remove legacy** (this commit)
  `NumberWheelInput.svelte` rewritten as chip-only. The legacy
  iOS-style inline scroll-wheel markup, scroll-snap CSS, and
  `onscroll`/`scrollToIndex` plumbing have all been deleted. The
  `variant` prop is kept (typed `"wheel" | "chip"`, marked
  `@deprecated`) for back-compat with the two `routine-builder/*`
  call sites that did not explicitly opt in — they now pick up the
  chip UI for free.

### Issues encountered & solutions

1. **Naming collision between `$state` rune and a local variable
   called `state`.** `svelte-check` reported 10 errors of the form
   *"Cannot use 'state' as a store. 'state' needs to be an object
   with a subscribe method on it."* — the template was treating
   `$state` as if it were the auto-subscription prefix on a store
   named `state`. **Fix:** renamed the local to `wheelState`. There's
   no real shadowing of the rune, just heuristic confusion in the
   compiler/template; renaming is the cheapest fix.

2. **`navigator.vibrate(ms)` typed against
   `Iterable<number>`.** Calling `v.call(navigator, ms)` produced
   *"Argument of type 'number' is not assignable to parameter of
   type 'Iterable<number>'"* under strict TS — `Function.prototype.call`
   was inferring a different overload than the local cast suggested.
   **Fix:** cast `navigator` itself rather than the method, then
   invoke directly: `nav.vibrate(ms)`. Cleaner and removes the
   `.call` indirection.

3. **`bind:this` ref not declared with `$state`.** Svelte 5 warned
   that `column` (the legacy scroll column ref) was updated without
   `$state`. **Fix:** declared as `let column: HTMLDivElement | undefined = $state();`
   and widened the helper signatures to accept `undefined`. The
   helpers already guarded with `if (!col) return;` so this is
   purely a typing fix. (Phase 3 deletes the wheel variant and this
   variable along with it.)

No issues with `sheet-effects.ts` integration, the singleton store
displacement semantics, body-scroll lock under iOS Safari, or the
backdrop tap / focus restore. The reducer test suite caught nothing
because it covers pure logic — but no regressions surfaced from the
side-effect layer either.
