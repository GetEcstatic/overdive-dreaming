/**
 * NumberWheel — pure data shapes (no DOM, no Svelte, no timers).
 *
 * See {@link ../../../../docs/wheel-selector-redesign.md} for design rationale.
 */

/** Static config for a wheel — never mutated during interaction. */
export type WheelSpec = Readonly<{
	min: number;
	max: number;
	step: number;
	/** Decimal places to render (auto-derived from step if omitted). */
	precision?: number;
	unit?: string;
	label?: string;
	/**
	 * Optional custom formatter (e.g. seconds → "mm:ss"). When supplied,
	 * overrides the default `value.toFixed(precision)` rendering used by
	 * the wheel chip / sheet for display purposes.
	 */
	format?: (value: number) => string;
	/**
	 * Optional custom parser, paired with {@link format}. Receives the raw
	 * user-typed string from the sheet's numeric input and returns the
	 * parsed numeric value, or `undefined` if the input cannot be parsed.
	 * Falls back to `Number(raw)` when omitted.
	 */
	parse?: (raw: string) => number | undefined;
}>;

/** Transient state during interaction (no DOM refs, no async handles). */
export type WheelState = Readonly<{
	/** Current committed value (undefined if user hasn't picked yet). */
	value: number | undefined;
	/** "Live" index while dragging in an open sheet, snapped on release. */
	dragIndex: number | null;
	/** Whether the modal sheet is open. */
	open: boolean;
	/**
	 * Pending value while the sheet is open — committed to `value` on
	 * explicit confirm; dropped on cancel/dismiss.
	 */
	pending: number | undefined;
}>;

/** All user intents — handled by the pure {@link reduce} function. */
export type WheelIntent =
	| { kind: 'open' }
	/** Dismiss without committing pending. */
	| { kind: 'cancel' }
	/** Commit `pending` (or `intent.value` if provided) and close. */
	| { kind: 'confirm'; value?: number }
	/** Live drag: update `pending` + `dragIndex` without committing. */
	| { kind: 'drag'; index: number }
	/** ± buttons on the inline chip — commits immediately. */
	| { kind: 'nudge'; delta: number }
	/** Direct keyboard / numeric-input entry — sets `pending`. */
	| { kind: 'type'; raw: string }
	/** External value change (e.g. parent updated bind:value). */
	| { kind: 'set'; value: number | undefined };
