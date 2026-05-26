import type {
	DiveVideoArtifactRef,
	DiveVideoProcessingState,
	MediaObjectRef
} from '$lib/types';

export const SERVER_OVERLAY_STYLE_VERSION = 'overdive-overlay-v4';

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