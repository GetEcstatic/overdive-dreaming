/**
 * In-browser preview of the social cut (plan docs/video/social-cut-implementation.md
 * §5.2): keeps a <video> on the edit list's source time. Pure; the share sheet
 * owns the element and the clock.
 *
 * - `rate` mode plays fast-forward pieces at their speed via `playbackRate`.
 * - `step` mode (browsers that refuse or can't keep up with high rates) pauses
 *   in fast-forward and seeks along the edit instead.
 */

import { socialCutSourceAt, type SocialCutEditDecisionList } from './shareHud/socialCut';

export type PreviewMode = 'rate' | 'step';

export interface PreviewSync {
	/** Source time the video should show, in ms. */
	readonly targetSourceMs: number;
	/** 0 = paused. */
	readonly playbackRate: number;
	/** The video is too far off: set `currentTime`. */
	readonly seek: boolean;
	readonly inCard: boolean;
}

/** Drift tolerated before seeking, in source ms, per unit of speed. */
const DRIFT_PER_SPEED_MS = 250;
/** Seek at most this often while stepping, in source ms per unit of speed. */
const STEP_PER_SPEED_MS = 120;

export function previewSync(
	edl: SocialCutEditDecisionList,
	outputMs: number,
	videoSourceMs: number,
	mode: PreviewMode
): PreviewSync {
	const position = socialCutSourceAt(edl, outputMs);
	if (position.inCard) {
		// The card holds the last protocol frame.
		const target = edl.protocolEndMs;
		return { targetSourceMs: target, playbackRate: 0, seek: Math.abs(videoSourceMs - target) > 80, inCard: true };
	}
	const drift = Math.abs(videoSourceMs - position.sourceMs);
	if (position.speed > 1 && mode === 'step') {
		return { targetSourceMs: position.sourceMs, playbackRate: 0, seek: drift > STEP_PER_SPEED_MS * position.speed, inCard: false };
	}
	return {
		targetSourceMs: position.sourceMs,
		playbackRate: position.speed,
		seek: drift > DRIFT_PER_SPEED_MS * position.speed,
		inCard: false
	};
}
