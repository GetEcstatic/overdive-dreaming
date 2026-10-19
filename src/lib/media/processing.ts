import type {
	DiveVideo,
	DiveVideoArtifactRef,
	DiveVideoProcessingState,
	MediaObjectRef
} from '$lib/types';

import {
	DEFAULT_SOCIAL_CUT_OPTIONS,
	SERVER_OVERLAY_STYLE_VERSION,
	overlayRenderKey,
	socialRenderKey,
	type SocialCutRenderOptions
} from './overlayStyle';

export { DEFAULT_SOCIAL_CUT_OPTIONS, SERVER_OVERLAY_STYLE_VERSION, overlayRenderKey, socialRenderKey, type SocialCutRenderOptions };

/** A render left queued or processing this long is treated as failed, so the owner can retry. */
export const SOCIAL_CUT_STALE_MS = 15 * 60 * 1000;

export type SocialCutStatus = 'none' | 'rendering' | 'ready' | 'failed';

export function socialCutArtifact(video: Pick<DiveVideo, 'artifacts'>): DiveVideoArtifactRef | undefined {
	return video.artifacts?.find((artifact) => artifact.kind === 'social-cut');
}

/**
 * Where the owner's social cut stands for the current edits and toggles.
 * A cut rendered for other settings counts as `none`: the sheet offers to create it.
 */
export function socialCutStatus(args: {
	video: Pick<DiveVideo, 'artifacts' | 'shareEdit' | 'processingState'>;
	options: SocialCutRenderOptions;
	/** Last update of the video document, ms. */
	updatedAtMs: number;
	nowMs: number;
}): SocialCutStatus {
	const key = socialRenderKey(args.video, args.options);
	if (socialCutArtifact(args.video)?.styleVersion === key) return 'ready';
	const state = args.video.processingState;
	if (state?.socialCutKey !== key) return 'none';
	if (state.socialCut === 'queued' || state.socialCut === 'processing') {
		return args.nowMs - args.updatedAtMs > SOCIAL_CUT_STALE_MS ? 'failed' : 'rendering';
	}
	if (state.socialCut === 'retryable' || state.socialCut === 'failed') return 'failed';
	return 'none';
}

/** Owner toggles from `UserSettings.shareHud`, defaulting to on. */
export function socialCutOptionsFromSettings(shareHud?: { showName?: boolean; showPb?: boolean; socialHook?: boolean } | null): SocialCutRenderOptions {
	return {
		showName: shareHud?.showName ?? DEFAULT_SOCIAL_CUT_OPTIONS.showName,
		showPb: shareHud?.showPb ?? DEFAULT_SOCIAL_CUT_OPTIONS.showPb,
		hook: shareHud?.socialHook ?? DEFAULT_SOCIAL_CUT_OPTIONS.hook
	};
}

export function serverOverlayArtifact(video: Pick<DiveVideo, 'artifacts'>): DiveVideoArtifactRef | undefined {
	return video.artifacts?.find((artifact) => artifact.kind === 'overlay-download');
}

export function hasCurrentServerOverlayArtifact(video: Pick<DiveVideo, 'artifacts' | 'shareEdit'>): boolean {
	return serverOverlayArtifact(video)?.styleVersion === overlayRenderKey(video);
}

export function initialDiveVideoProcessingState(): DiveVideoProcessingState {
	return {
		master: 'queued',
		thumbnail: 'not-requested',
		playbackProxy: 'not-requested',
		overlayPreview: 'not-requested',
		overlayDownload: 'not-requested',
		pendingJobs: []
	};
}

export function uploadedDiveVideoProcessingState(): DiveVideoProcessingState {
	return {
		master: 'ready',
		thumbnail: 'queued',
		playbackProxy: 'queued',
		overlayPreview: 'not-requested',
		overlayDownload: 'queued',
		pendingJobs: [
			'probe-master',
			'generate-thumbnail',
			'generate-playback-proxy',
			'generate-overlay-download'
		]
	};
}

export function masterDiveVideoArtifact(args: {
	object: MediaObjectRef;
	widthPx: number;
	heightPx: number;
	durationSeconds: number;
	sizeBytes: number;
	contentType: string;
}): DiveVideoArtifactRef {
	return {
		kind: 'master',
		profile: 'original',
		object: args.object,
		widthPx: args.widthPx,
		heightPx: args.heightPx,
		durationSeconds: args.durationSeconds,
		sizeBytes: args.sizeBytes,
		contentType: args.contentType,
		disposable: false
	};
}