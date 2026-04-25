/**
 * Global singleton store for the {@link DurationSheet} — a dual-column
 * (minutes + seconds) wheel picker, mirroring the API of
 * {@link wheelSheetStore} but tailored to mm:ss durations.
 *
 * Splitting minutes and seconds into separate wheels keeps each wheel
 * to ≤60 rows; the previous single-wheel mm:ss picker had to scroll
 * through every second across the full range, which made longer
 * durations impractical to dial in.
 */

import { writable, type Readable } from 'svelte/store';

export type DurationSheetRequest = Readonly<{
	/** Total duration in seconds. */
	initial: number | undefined;
	/** Inclusive lower bound in seconds (default 0). */
	min?: number;
	/** Inclusive upper bound in seconds (default 3600 = 60 min). */
	max?: number;
	label?: string;
	hint?: string;
	/** Called with the confirmed total seconds. */
	onConfirm: (totalSeconds: number) => void;
	/** Called when the user dismisses without committing. */
	onCancel?: () => void;
}>;

type SheetState = Readonly<{
	id: number;
	request: DurationSheetRequest | null;
}>;

const initial: SheetState = { id: 0, request: null };

const internal = writable<SheetState>(initial);

export const durationSheet: Readable<SheetState> = { subscribe: internal.subscribe };

/** Open the sheet. Displaces (and cancels) any in-flight request. */
export function openDurationSheet(request: DurationSheetRequest): void {
	internal.update((s) => {
		s.request?.onCancel?.();
		return { id: s.id + 1, request };
	});
}

/** Close the sheet without firing onCancel — used after confirm/cancel. */
export function closeDurationSheet(): void {
	internal.update((s) => ({ id: s.id + 1, request: null }));
}

/** External cancel: closes AND fires the request's onCancel. */
export function cancelDurationSheet(): void {
	internal.update((s) => {
		s.request?.onCancel?.();
		return { id: s.id + 1, request: null };
	});
}
