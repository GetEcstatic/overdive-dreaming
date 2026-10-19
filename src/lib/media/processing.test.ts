import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SOCIAL_CUT_OPTIONS,
	SOCIAL_CUT_STALE_MS,
	socialCutOptionsFromSettings,
	socialCutStatus,
	socialRenderKey,
	hasCurrentServerOverlayArtifact,
	initialDiveVideoProcessingState,
	masterDiveVideoArtifact,
	SERVER_OVERLAY_STYLE_VERSION,
	uploadedDiveVideoProcessingState
} from './processing';

describe('media processing helpers', () => {
	it('creates a conservative initial state before the master upload completes', () => {
		expect(initialDiveVideoProcessingState()).toEqual({
			master: 'queued',
			thumbnail: 'not-requested',
			playbackProxy: 'not-requested',
			overlayPreview: 'not-requested',
			overlayDownload: 'not-requested',
			pendingJobs: []
		});
	});

	it('queues lightweight server jobs after the master upload completes', () => {
		expect(uploadedDiveVideoProcessingState()).toEqual({
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
		});
	});

	it('treats a flipped graph direction as a different export', () => {
		const artifact = (styleVersion: string) => ({
			kind: 'overlay-download' as const,
			profile: 'overlay-mp4-720p' as const,
			object: { provider: 'wasabi' as const, key: 'users/u1/videos/v1/overlay/download.mp4' },
			styleVersion
		});
		const ltr = artifact(SERVER_OVERLAY_STYLE_VERSION);
		const rtl = artifact(`${SERVER_OVERLAY_STYLE_VERSION}+rtl`);
		expect(hasCurrentServerOverlayArtifact({ artifacts: [ltr], shareEdit: { firstLengthDirection: 'ltr' } })).toBe(true);
		expect(hasCurrentServerOverlayArtifact({ artifacts: [ltr], shareEdit: { firstLengthDirection: 'rtl' } })).toBe(false);
		expect(hasCurrentServerOverlayArtifact({ artifacts: [rtl], shareEdit: { firstLengthDirection: 'rtl' } })).toBe(true);
		expect(hasCurrentServerOverlayArtifact({ artifacts: [rtl] })).toBe(false);
	});

	it('detects stale server overlay artifacts', () => {
		expect(hasCurrentServerOverlayArtifact({ artifacts: [] })).toBe(false);
		expect(
			hasCurrentServerOverlayArtifact({
				artifacts: [
					{
						kind: 'overlay-download',
						profile: 'overlay-mp4-720p',
						object: { provider: 'wasabi', key: 'users/u1/videos/v1/overlay/download.mp4' },
						styleVersion: 'overdive-overlay-v3'
					}
				]
			})
		).toBe(false);
		expect(
			hasCurrentServerOverlayArtifact({
				artifacts: [
					{
						kind: 'overlay-download',
						profile: 'overlay-mp4-720p',
						object: { provider: 'wasabi', key: 'users/u1/videos/v1/overlay/download.mp4' },
						styleVersion: SERVER_OVERLAY_STYLE_VERSION
					}
				]
			})
		).toBe(true);
	});

	it('describes the uploaded master as a non-disposable canonical artifact', () => {
		const object = {
			provider: 'wasabi' as const,
			bucket: 'bucket',
			key: 'users/u1/videos/v1/clean.mp4',
			contentType: 'video/mp4',
			sizeBytes: 1024
		};

		expect(
			masterDiveVideoArtifact({
				object,
				widthPx: 1280,
				heightPx: 720,
				durationSeconds: 42,
				sizeBytes: 1024,
				contentType: 'video/mp4'
			})
		).toEqual({
			kind: 'master',
			profile: 'original',
			object,
			widthPx: 1280,
			heightPx: 720,
			durationSeconds: 42,
			sizeBytes: 1024,
			contentType: 'video/mp4',
			disposable: false
		});
	});
});
describe('social cut status', () => {
	const options = DEFAULT_SOCIAL_CUT_OPTIONS;
	const shareEdit = { firstLengthDirection: 'rtl' as const, protocolEndMs: 185_040 };
	const key = socialRenderKey({ shareEdit }, options);
	const artifact = (styleVersion: string) => ({
		kind: 'social-cut' as const,
		profile: 'social-mp4-1080x1920' as const,
		object: { provider: 'wasabi' as const, bucket: 'b', key: 'k' },
		styleVersion
	});
	const base = { updatedAtMs: 0, nowMs: 1_000 };

	it('keys on direction, protocol override (to 0.1 s) and toggles', () => {
		expect(key).toContain('+rtl');
		expect(key).toContain('pe185000');
		expect(socialRenderKey({ shareEdit: { ...shareEdit, protocolEndMs: undefined } }, options)).toContain('pe-auto');
		expect(socialRenderKey({ shareEdit }, { ...options, hook: false })).not.toBe(key);
	});

	it('is ready only for an artifact with the current key', () => {
		expect(socialCutStatus({ ...base, video: { shareEdit, artifacts: [artifact(key)] }, options })).toBe('ready');
		expect(socialCutStatus({ ...base, video: { shareEdit, artifacts: [artifact('old')] }, options })).toBe('none');
	});

	it('reports a render in flight for the same key, and failure when it stalls', () => {
		const processingState = { ...initialDiveVideoProcessingState(), socialCut: 'processing' as const, socialCutKey: key };
		expect(socialCutStatus({ ...base, video: { shareEdit, processingState }, options })).toBe('rendering');
		expect(socialCutStatus({ updatedAtMs: 0, nowMs: SOCIAL_CUT_STALE_MS + 1, video: { shareEdit, processingState }, options })).toBe('failed');
		expect(socialCutStatus({ ...base, video: { shareEdit, processingState: { ...processingState, socialCut: 'retryable' } }, options })).toBe('failed');
		expect(socialCutStatus({ ...base, video: { shareEdit, processingState }, options: { ...options, showName: false } })).toBe('none');
	});

	it('defaults every toggle to on', () => {
		expect(socialCutOptionsFromSettings(undefined)).toEqual({ showName: true, showPb: true, hook: true });
		expect(socialCutOptionsFromSettings({ socialHook: false })).toEqual({ showName: true, showPb: true, hook: false });
	});
});
