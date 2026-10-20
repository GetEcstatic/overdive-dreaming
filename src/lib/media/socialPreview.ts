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

export interface EditStripBlock {
	/** Percent of the strip. */
	readonly left: number;
	readonly width: number;
	readonly kind: 'normal' | 'fast' | 'unused';
}

export interface EditStrip {
	readonly blocks: readonly EditStripBlock[];
	/** Where the protocol-end handle may move (percent), from surfacing to the end of the recording. */
	readonly handleLeft: number;
	readonly handleWidth: number;
	/** Wall touches, percent. */
	readonly walls: readonly number[];
}

/**
 * The share sheet's edit strip: the recording from the cut's first frame to
 * its end, with 1× pieces, fast-forward pieces and the unused tail after the
 * protocol end.
 */
export function editStrip(
	edl: SocialCutEditDecisionList,
	args: { readonly diveEndMs: number; readonly recordingEndMs: number; readonly wallsMs: readonly number[] }
): EditStrip {
	const startMs = edl.segments[0]?.fromMs ?? 0;
	const endMs = Math.max(args.recordingEndMs, edl.protocolEndMs, startMs + 1);
	const pct = (ms: number) => ((Math.min(endMs, Math.max(startMs, ms)) - startMs) / (endMs - startMs)) * 100;
	const blocks: EditStripBlock[] = edl.segments.map((segment) => ({
		left: pct(segment.fromMs),
		width: pct(segment.toMs) - pct(segment.fromMs),
		kind: segment.speed === 1 ? 'normal' : 'fast'
	}));
	if (edl.protocolEndMs < endMs) blocks.push({ left: pct(edl.protocolEndMs), width: 100 - pct(edl.protocolEndMs), kind: 'unused' });
	const handleLeft = pct(args.diveEndMs);
	return {
		blocks,
		handleLeft,
		handleWidth: 100 - handleLeft,
		walls: args.wallsMs.filter((at) => at > startMs && at < endMs).map(pct)
	};
}
