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
/** A rendering reel with no document update (progress heartbeat) for this long has died. */
export const SOCIAL_CUT_STALE_MS = 5 * 60 * 1000;

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
/**
 * Whether the share sheet should ask for a reel now: only when none exists or
 * is rendering for the current settings, once per settings key (a failure
 * waits for the owner's "Try again").
 */
export function shouldRequestSocialCut(args: {
	status: SocialCutStatus;
	renderKey: string;
	lastRequestedKey: string | null;
	settingsLoaded: boolean;
}): boolean {
	return args.settingsLoaded && args.status === 'none' && args.renderKey !== args.lastRequestedKey;
}

/** Render progress 0–1 for a rendering reel (queued reads as just started). */
export function socialCutProgress(video: Pick<DiveVideo, 'processingState'>): number {
	const value = video.processingState?.socialCutProgress;
	return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/**
 * Identifies the file a dive video plays from. The video document also
 * changes for unrelated reasons (render progress every few seconds, edits), so
 * players re-sign and reload their source only when this key changes.
 * Mirrors `getPreferredDiveVideoPlaybackUrl`.
 */
export function playbackSourceKey(
	video: Pick<DiveVideo, 'id' | 'uploadStatus' | 'processingState' | 'artifacts' | 'cleanObject' | 'storagePathClean'>
): string {
	if (video.uploadStatus !== 'uploaded') return `${video.id}|pending`;
	const proxy =
		video.processingState?.playbackProxy === 'ready'
			? video.artifacts?.find((artifact) => artifact.kind === 'playback-proxy')?.object?.key
			: undefined;
	return `${video.id}|${proxy ? `proxy:${proxy}` : `clean:${video.cleanObject?.key ?? video.storagePathClean ?? ''}`}`;
}

/** Same idea for the poster frame. */
export function thumbnailSourceKey(video: Pick<DiveVideo, 'id' | 'thumbnailObject' | 'thumbnailPath'>): string {
	return `${video.id}|${video.thumbnailObject?.key ?? video.thumbnailPath ?? ''}`;
}
