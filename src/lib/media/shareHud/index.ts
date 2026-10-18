/**
 * Share HUD: one pure model → layout → SVG pipeline for server exports and
 * in-app playback (plan §6.1). No DOM, no `$lib` imports: the Cloud Functions
 * bundle imports this folder directly.
 */

import { layoutLiveHud, layoutResultCard, type HudCanvas } from './layout';
import { prepareDive, resultCard, shareHudFrame, type FrameOptions, type ShareHudDive } from './model';
import { renderSvg } from './svg';

export { prepareDive, resultCard, shareHudFrame, CARD_FADE_MS } from './model';
export { shareHudContextForVideo, type ShareHudVideoFields } from './context';
export { HUD_TICK_MS } from './exportPlan';
export type { ShareHudContext, ShareHudDive, ShareHudFrame, FrameOptions } from './model';
export type { HudCanvas, Rect as HudRect } from './layout';
export { graphDirectionHitRect } from './layout';
export type { GraphDirection } from './speedGraph';
export type { HudDiscipline } from './format';

/** Full HUD frame as an SVG string (transparent background). */
export function shareHudSvg(dive: ShareHudDive, atMs: number, canvas: HudCanvas, options: FrameOptions): string {
	const frame = shareHudFrame(dive, atMs, options);
	const card = frame.phase === 'card' ? layoutResultCard(resultCard(dive), dive.context.pbBeforeM, canvas, frame.cardOpacity) : [];
	const live = frame.phase === 'card' && frame.cardOpacity >= 1 ? [] : layoutLiveHud(dive, frame, canvas);
	return renderSvg([...live, ...card], canvas.width, canvas.height);
}

/** Result card alone, fully opaque (appended hold, stills). */
export function resultCardSvg(dive: ShareHudDive, canvas: HudCanvas): string {
	return renderSvg(layoutResultCard(resultCard(dive), dive.context.pbBeforeM, canvas), canvas.width, canvas.height);
}

export { prepareDive as prepareShareHudDive };
