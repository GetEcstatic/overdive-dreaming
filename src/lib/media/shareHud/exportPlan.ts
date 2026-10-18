/**
 * Frame schedule for the full HUD download (plan §4.2 row 2): the whole
 * recording with the live HUD, then the result card held over the cloned
 * last frame.
 */

export const HUD_TICK_MS = 100;
export const CARD_HOLD_MS = 3_000;

export interface HudTick {
	/** Recording time the HUD is drawn for. */
	readonly atMs: number;
	/** When the card starts (the end of the recording), or null before it. */
	readonly cardAtMs: number | null;
}

/** One tick per `tickMs` from 0 to the end of the recording, then the card hold. */
export function hudFullTicks(recordingMs: number, tickMs = HUD_TICK_MS, cardHoldMs = CARD_HOLD_MS): HudTick[] {
	const liveTicks = Math.max(1, Math.ceil(recordingMs / tickMs));
	const cardTicks = Math.ceil(cardHoldMs / tickMs);
	const cardAtMs = liveTicks * tickMs;
	return [
		...Array.from({ length: liveTicks }, (_, i) => ({ atMs: i * tickMs, cardAtMs: null })),
		...Array.from({ length: cardTicks }, (_, i) => ({ atMs: cardAtMs + i * tickMs, cardAtMs }))
	];
}

/** Output length of the full HUD download in seconds. */
export function hudFullDurationSeconds(recordingMs: number, tickMs = HUD_TICK_MS, cardHoldMs = CARD_HOLD_MS): number {
	return hudFullTicks(recordingMs, tickMs, cardHoldMs).length * (tickMs / 1000);
}
