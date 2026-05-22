/**
 * Global singleton store for the {@link NumberWheelSheet}. Only one
 * sheet exists in the DOM (mounted in the root layout); chips call
 * {@link openWheelSheet} which displaces any in-flight request.
 *
 * The store payload is plain data + two callbacks at the edges, in
 * keeping with the data-oriented design rule.
 */

import { writable, type Readable } from 'svelte/store';
import type { WheelSpec } from './types';

export type WheelSheetRequest = Readonly<{
	spec: WheelSpec;
	/** Starting value when the sheet opens. */
	initial: number | undefined;
	/** Optional placeholder for the numeric input field. */
	placeholder?: string;
	/** Hint text shown below the wheel. */
	hint?: string;
	/** Show an explicit action for clearing the field. */
	allowClear?: boolean;
	/** Called when the user confirms (✓), or clears to no value. */
	onConfirm: (value: number | undefined) => void;
	/** Called when the user dismisses without committing. */
	onCancel?: () => void;
}>;

type SheetState = Readonly<{
	/** Monotonic id; lets the sheet detect a "displaced" request. */
	id: number;
	request: WheelSheetRequest | null;
}>;

const initial: SheetState = { id: 0, request: null };

const internal = writable<SheetState>(initial);

/** Read-only handle for `NumberWheelSheet.svelte`. */
export const wheelSheet: Readable<SheetState> = { subscribe: internal.subscribe };

/**
 * Open the global sheet. If a previous sheet is open, its `onCancel`
 * fires (it's been displaced by a newer request).
 */
export function openWheelSheet(request: WheelSheetRequest): void {
	internal.update((s) => {
		s.request?.onCancel?.();
		return { id: s.id + 1, request };
	});
}

/**
 * Close the sheet without firing onCancel — used internally after
 * confirm/cancel have already been invoked by the sheet UI.
 */
export function closeWheelSheet(): void {
	internal.update((s) => ({ id: s.id + 1, request: null }));
}

/**
 * External cancel: closes the sheet AND fires the request's onCancel.
 * Call from a navigation event or similar.
 */
export function cancelWheelSheet(): void {
	internal.update((s) => {
		s.request?.onCancel?.();
		return { id: s.id + 1, request: null };
	});
}
