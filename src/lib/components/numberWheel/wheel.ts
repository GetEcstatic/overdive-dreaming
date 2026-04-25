/**
 * NumberWheel — pure functions over {@link WheelSpec} / {@link WheelState}.
 *
 * No DOM, no Svelte, no time, no IO. Every function is referentially
 * transparent and trivially unit-testable.
 *
 * See {@link ../../../../docs/wheel-selector-redesign.md}.
 */

import type { WheelIntent, WheelSpec, WheelState } from './types';

const EPS = 1e-9;

function clamp(n: number, lo: number, hi: number): number {
	return n < lo ? lo : n > hi ? hi : n;
}

/**
 * Round to the wheel's precision. Falls back to `step`-derived precision
 * (0 dp for integer steps, 1 dp otherwise).
 */
export function precisionOf(spec: WheelSpec): number {
	if (typeof spec.precision === 'number') return spec.precision;
	return Number.isInteger(spec.step) ? 0 : 2;
}

function roundTo(n: number, dp: number): number {
	const f = Math.pow(10, dp);
	return Math.round(n * f) / f;
}

/** Total count of values without materialising them. */
export function valueCount(spec: WheelSpec): number {
	return Math.floor((spec.max - spec.min) / spec.step + EPS) + 1;
}

/** Materialise the value array. Cheap for typical ranges (< a few thousand). */
export function values(spec: WheelSpec): readonly number[] {
	const dp = precisionOf(spec);
	const n = valueCount(spec);
	const out: number[] = new Array(n);
	for (let i = 0; i < n; i++) out[i] = roundTo(spec.min + i * spec.step, dp);
	return out;
}

/**
 * Map a value to its index. If `value` is undefined we centre on the
 * middle of the range (sensible default for a fresh wheel).
 */
export function indexOf(spec: WheelSpec, value: number | undefined): number {
	const n = valueCount(spec);
	if (value === undefined) return Math.floor(n / 2);
	return clamp(Math.round((value - spec.min) / spec.step), 0, n - 1);
}

/** Map an index to its value (clamped to range). */
export function valueAt(spec: WheelSpec, index: number): number {
	const dp = precisionOf(spec);
	const n = valueCount(spec);
	const i = clamp(index, 0, n - 1);
	return roundTo(spec.min + i * spec.step, dp);
}

/** Snap an arbitrary number to the nearest valid value, clamped. */
export function snap(spec: WheelSpec, raw: number): number {
	return valueAt(spec, indexOf(spec, raw));
}

/** Format a value for display (uses {@link precisionOf}). */
export function format(spec: WheelSpec, value: number): string {
	return value.toFixed(precisionOf(spec));
}

/** Initial state for a wheel given a starting value. */
export function initialState(value: number | undefined): WheelState {
	return { value, dragIndex: null, open: false, pending: undefined };
}

/**
 * Pure reducer. All state transitions go through here so they can be
 * exhaustively tested and reasoned about.
 *
 * Semantics:
 *  - `open`     → opens sheet; primes `pending` with current value (or
 *                 the wheel's middle index if value is undefined).
 *  - `cancel`   → close + drop `pending` + `dragIndex`. `value` unchanged.
 *  - `confirm`  → close + commit (`intent.value` ?? `pending` ?? `value`).
 *  - `drag`     → live update of `pending` + `dragIndex` (no commit).
 *  - `nudge`    → ± step on the inline chip; commits immediately.
 *  - `type`     → updates `pending`; commit is deferred to `confirm`.
 *  - `set`      → external `value` change (e.g. bind:value from parent).
 */
export function reduce(state: WheelState, intent: WheelIntent, spec: WheelSpec): WheelState {
	switch (intent.kind) {
		case 'open': {
			const idx = indexOf(spec, state.value);
			return {
				...state,
				open: true,
				dragIndex: idx,
				pending: valueAt(spec, idx)
			};
		}
		case 'cancel':
			return { ...state, open: false, dragIndex: null, pending: undefined };
		case 'confirm': {
			const candidate =
				intent.value !== undefined
					? intent.value
					: state.pending !== undefined
						? state.pending
						: state.value;
			const next = candidate === undefined ? undefined : snap(spec, candidate);
			return { value: next, open: false, dragIndex: null, pending: undefined };
		}
		case 'drag': {
			const idx = clamp(intent.index, 0, valueCount(spec) - 1);
			return { ...state, dragIndex: idx, pending: valueAt(spec, idx) };
		}
		case 'nudge': {
			const idx = indexOf(spec, state.value) + intent.delta;
			return { ...state, value: valueAt(spec, idx) };
		}
		case 'type': {
			const trimmed = intent.raw.trim();
			if (trimmed === '') return { ...state, pending: undefined };
			const n = Number(trimmed);
			if (Number.isNaN(n)) return state;
			return { ...state, pending: snap(spec, n) };
		}
		case 'set':
			return {
				...state,
				value: intent.value === undefined ? undefined : snap(spec, intent.value)
			};
	}
}

/**
 * Translate a continuous pixel offset (drag delta from the centre row)
 * into a snapped index. Used by the BigWheel pointer-drag handler to go
 * from `pointermove` → `WheelIntent.drag`.
 */
export function indexFromOffset(opts: {
	startIndex: number;
	deltaY: number;
	rowHeight: number;
	count: number;
}): number {
	const raw = opts.startIndex - opts.deltaY / opts.rowHeight;
	return clamp(Math.round(raw), 0, opts.count - 1);
}

/**
 * For the neighbour ruler: return up to `radius` indices either side of
 * `centre`, clamped to the valid range.
 */
export function neighbourIndices(opts: { centre: number; radius: number; count: number }): readonly number[] {
	const out: number[] = [];
	const lo = Math.max(0, opts.centre - opts.radius);
	const hi = Math.min(opts.count - 1, opts.centre + opts.radius);
	for (let i = lo; i <= hi; i++) out.push(i);
	return out;
}
