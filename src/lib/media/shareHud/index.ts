/**
 * Share HUD: one pure model → layout → SVG pipeline for server exports and
 * in-app playback (plan §6.1). No DOM, no `$lib` imports: the Cloud Functions
 * bundle imports this folder directly.
 */

import { layoutLiveHud, layoutResultCard, layoutSocialExtras, type HudCanvas } from './layout';
import { hookOpacity, type SocialCutTick } from './socialCut';
import { prepareDive, resultCard, shareHudFrame, type FrameOptions, type ShareHudDive, type ShareHudFrame } from './model';
import { renderSvg } from './svg';

export { prepareDive, resultCard, shareHudFrame, CARD_FADE_MS } from './model';
export { shareHudContextForVideo, socialHudContext, type ShareHudVideoFields } from './context';
export { HUD_TICK_MS } from './exportPlan';
export {
	HOOK_MS,
	hookOpacity,
	resolveProtocolEndMs,
	socialCutEditList,
	socialCutInputForDive,
	socialCutOutputAt,
	socialCutSourceAt,
	socialCutTicks,
	SOCIAL_CUT_CARD_MS,
	type SocialCutEditDecisionList,
	type SocialCutInput,
	type SocialCutOptions,
	type SocialCutSegment,
	type SocialCutTick
} from './socialCut';
export { SOCIAL_BACKGROUND, SOCIAL_CANVAS, socialVideoPlacement, type SocialVideoPlacement } from './socialCanvas';
export type { ShareHudContext, ShareHudDive, ShareHudFrame, FrameOptions } from './model';
export type { HudCanvas, Rect as HudRect } from './layout';
export { graphDirectionHitRect, liveHudClearZone, type HudClearZone } from './layout';
export type { GraphDirection } from './speedGraph';
export type { HudDiscipline } from './format';

function hudPrimitives(dive: ShareHudDive, frame: ShareHudFrame, canvas: HudCanvas) {
	const card = frame.phase === 'card' ? layoutResultCard(resultCard(dive), dive.context.pbBeforeM, canvas, frame.cardOpacity) : [];
	const live = frame.phase === 'card' && frame.cardOpacity >= 1 ? [] : layoutLiveHud(dive, frame, canvas);
	return [...live, ...card];
}

/** Full HUD frame as an SVG string (transparent background). */
export function shareHudSvg(dive: ShareHudDive, atMs: number, canvas: HudCanvas, options: FrameOptions): string {
	return renderSvg(hudPrimitives(dive, shareHudFrame(dive, atMs, options), canvas), canvas.width, canvas.height);
}

/**
 * Social cut frame: the HUD at the tick's source time (so it always shows
 * real dive time and distance), plus the fast-forward badge and, before GO in
 * the first 1.5 s, the PB hook.
 */
export function socialCutFrameSvg(dive: ShareHudDive, tick: SocialCutTick, canvas: HudCanvas, options: { readonly hook: boolean }): string {
	const frame = shareHudFrame(dive, tick.sourceMs, { cardAtMs: tick.cardAtMs });
	const pb = dive.context.pbBeforeM;
	const hook = options.hook && frame.phase === 'pre' && pb !== null && pb > 0 ? { targetM: pb, opacity: hookOpacity(tick.outputMs) } : null;
	const extras =
		frame.phase === 'card' ? [] : layoutSocialExtras(dive, { fastForward: tick.speed > 1 ? tick.speed : null, hook }, canvas);
	return renderSvg([...hudPrimitives(dive, frame, canvas), ...extras], canvas.width, canvas.height);
}

/** Result card alone, fully opaque (appended hold, stills). */
export function resultCardSvg(dive: ShareHudDive, canvas: HudCanvas): string {
	return renderSvg(layoutResultCard(resultCard(dive), dive.context.pbBeforeM, canvas), canvas.width, canvas.height);
}

export { prepareDive as prepareShareHudDive };
