import { describe, expect, it } from 'vitest';
import {
	initialDiveVideoProcessingState,
	masterDiveVideoArtifact,
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
			overlayDownload: 'not-requested',
			pendingJobs: ['probe-master', 'generate-thumbnail', 'generate-playback-proxy']
		});
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