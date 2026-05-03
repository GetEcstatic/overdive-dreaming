import { describe, expect, it } from 'vitest';
import { detectWebCodecsCapabilities, probeWebCodecsSupport } from './webCodecsCapabilities';

describe('WebCodecs capability detection', () => {
	it('reports missing browser primitives', () => {
		const snapshot = detectWebCodecsCapabilities({});

		expect(snapshot.canAttemptVideoOnlySpike).toBe(false);
		expect(snapshot.missing).toEqual([
			'VideoEncoder',
			'VideoFrame',
			'MediaStreamTrackProcessor',
			'ReadableStream'
		]);
		expect(snapshot.muxerStrategy).toBe('unavailable');
	});

	it('marks the video-only spike as attemptable when required primitives exist', () => {
		const snapshot = detectWebCodecsCapabilities({
			VideoEncoder: {},
			VideoFrame: {},
			MediaStreamTrackProcessor: {},
			ReadableStream: {}
		});

		expect(snapshot.canAttemptVideoOnlySpike).toBe(true);
		expect(snapshot.missing).toEqual([]);
		expect(snapshot.supportedCodecs).toEqual({ h264: 'unknown', vp9: 'unknown' });
	});

	it('probes codec support when VideoEncoder exposes isConfigSupported', async () => {
		const snapshot = await probeWebCodecsSupport({
			VideoEncoder: {
				isConfigSupported: async (config) => ({ supported: config.codec === 'avc1.42E01E' })
			},
			VideoFrame: {},
			MediaStreamTrackProcessor: {},
			ReadableStream: {}
		});

		expect(snapshot.supportedCodecs).toEqual({ h264: 'supported', vp9: 'unsupported' });
		expect(snapshot.muxerStrategy).toBe('mp4-muxer-needed');
	});
});