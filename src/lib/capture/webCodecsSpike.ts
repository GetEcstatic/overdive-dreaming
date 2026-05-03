import type { DiveVideoResolution } from '$lib/types';
import { bitrateForResolution, DEFAULT_VIDEO_QUALITY_PRESET } from './videoQuality';
import { detectWebCodecsCapabilities, type WebCodecsCodec } from './webCodecsCapabilities';

type VideoEncoderLike = {
	configure(config: Record<string, unknown>): void;
	encode(frame: { close?: () => void }, options?: { keyFrame?: boolean }): void;
	flush(): Promise<void>;
	close(): void;
	readonly encodeQueueSize: number;
};

type VideoEncoderConstructorLike = new (init: {
	output: (chunk: { byteLength?: number }) => void;
	error: (error: unknown) => void;
}) => VideoEncoderLike;

type TrackProcessorConstructorLike = new (init: {
	track: MediaStreamTrack;
}) => { readable: ReadableStream<{ close?: () => void }> };

export interface WebCodecsSpikeOptions {
	durationMs?: number;
	codec?: WebCodecsCodec;
	resolution?: DiveVideoResolution;
	bitrateBps?: number;
}

export interface WebCodecsSpikeResult {
	codec: WebCodecsCodec;
	durationMs: number;
	requestedBitrateBps: number;
	sourceFrames: number;
	encodedChunks: number;
	encodedBytes: number;
	maxEncodeQueueSize: number;
	encodeErrors: number;
	droppedOrLateFrames: number;
	endedBecause: 'duration' | 'source-ended' | 'error';
}

export async function runWebCodecsVideoOnlySpike(
	stream: MediaStream,
	options: WebCodecsSpikeOptions = {}
): Promise<WebCodecsSpikeResult> {
	const capabilities = detectWebCodecsCapabilities();
	if (!capabilities.canAttemptVideoOnlySpike) {
		throw new Error(`WebCodecs video-only spike unavailable: ${capabilities.missing.join(', ')}`);
	}

	const [track] = stream.getVideoTracks();
	if (!track) throw new Error('No video track available for WebCodecs spike.');

	const settings = track.getSettings();
	const resolution = options.resolution ?? (settings.width && settings.width >= 1600 ? '1080p' : '720p');
	const requestedBitrateBps =
		options.bitrateBps ?? bitrateForResolution(resolution, DEFAULT_VIDEO_QUALITY_PRESET);
	const codec = options.codec ?? 'h264';
	const durationMs = options.durationMs ?? 10_000;
	const codecString = codec === 'h264' ? 'avc1.42E01E' : 'vp09.00.10.08';
	const width = settings.width ?? (resolution === '1080p' ? 1920 : 1280);
	const height = settings.height ?? (resolution === '1080p' ? 1080 : 720);
	const frameRate = settings.frameRate ?? 30;

	const Encoder = (globalThis as unknown as { VideoEncoder: VideoEncoderConstructorLike }).VideoEncoder;
	const Processor = (globalThis as unknown as {
		MediaStreamTrackProcessor: TrackProcessorConstructorLike;
	}).MediaStreamTrackProcessor;

	let sourceFrames = 0;
	let encodedChunks = 0;
	let encodedBytes = 0;
	let maxEncodeQueueSize = 0;
	let encodeErrors = 0;
	let endedBecause: WebCodecsSpikeResult['endedBecause'] = 'duration';

	const processor = new Processor({ track });
	const reader = processor.readable.getReader();
	const encoder = new Encoder({
		output: (chunk) => {
			encodedChunks += 1;
			encodedBytes += chunk.byteLength ?? 0;
		},
		error: () => {
			encodeErrors += 1;
			endedBecause = 'error';
		}
	});

	encoder.configure({
		codec: codecString,
		width,
		height,
		bitrate: requestedBitrateBps,
		framerate: frameRate
	});

	const startedAt = performance.now();
	try {
		while (performance.now() - startedAt < durationMs && endedBecause !== 'error') {
			const { value: frame, done } = await reader.read();
			if (done || !frame) {
				endedBecause = 'source-ended';
				break;
			}
			sourceFrames += 1;
			maxEncodeQueueSize = Math.max(maxEncodeQueueSize, encoder.encodeQueueSize);
			encoder.encode(frame, { keyFrame: sourceFrames === 1 || sourceFrames % 90 === 0 });
			frame.close?.();
		}
		await encoder.flush();
	} finally {
		await reader.cancel().catch(() => undefined);
		encoder.close();
	}

	return {
		codec,
		durationMs: Math.round(performance.now() - startedAt),
		requestedBitrateBps,
		sourceFrames,
		encodedChunks,
		encodedBytes,
		maxEncodeQueueSize,
		encodeErrors,
		droppedOrLateFrames: Math.max(0, sourceFrames - encodedChunks),
		endedBecause
	};
}