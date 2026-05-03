export type WebCodecsCodec = 'h264' | 'vp9';

export type WebCodecsSupport = 'supported' | 'unsupported' | 'unknown';

export interface WebCodecsCapabilitySnapshot {
	hasVideoEncoder: boolean;
	hasVideoFrame: boolean;
	hasMediaStreamTrackProcessor: boolean;
	hasReadableStream: boolean;
	canAttemptVideoOnlySpike: boolean;
	missing: string[];
	supportedCodecs: Record<WebCodecsCodec, WebCodecsSupport>;
	muxerStrategy: 'mp4-muxer-needed' | 'webm-muxer-needed' | 'unavailable';
}

export interface WebCodecsGlobalLike {
	VideoEncoder?: {
		isConfigSupported?: (config: Record<string, unknown>) => Promise<{ supported?: boolean }>;
	};
	VideoFrame?: unknown;
	MediaStreamTrackProcessor?: unknown;
	ReadableStream?: unknown;
}

export const WEB_CODECS_TEST_CONFIGS: Record<WebCodecsCodec, Record<string, unknown>> = {
	h264: {
		codec: 'avc1.42E01E',
		width: 1280,
		height: 720,
		bitrate: 8_000_000,
		framerate: 30
	},
	vp9: {
		codec: 'vp09.00.10.08',
		width: 1280,
		height: 720,
		bitrate: 8_000_000,
		framerate: 30
	}
};

export function webCodecsGlobalsFrom(value: unknown): WebCodecsGlobalLike {
	return (value ?? {}) as WebCodecsGlobalLike;
}

export function detectWebCodecsCapabilities(
	globals: WebCodecsGlobalLike = webCodecsGlobalsFrom(globalThis)
): WebCodecsCapabilitySnapshot {
	const hasVideoEncoder = typeof globals.VideoEncoder !== 'undefined';
	const hasVideoFrame = typeof globals.VideoFrame !== 'undefined';
	const hasMediaStreamTrackProcessor = typeof globals.MediaStreamTrackProcessor !== 'undefined';
	const hasReadableStream = typeof globals.ReadableStream !== 'undefined';
	const missing = [
		[hasVideoEncoder, 'VideoEncoder'],
		[hasVideoFrame, 'VideoFrame'],
		[hasMediaStreamTrackProcessor, 'MediaStreamTrackProcessor'],
		[hasReadableStream, 'ReadableStream']
	]
		.filter(([present]) => !present)
		.map(([, name]) => String(name));

	return {
		hasVideoEncoder,
		hasVideoFrame,
		hasMediaStreamTrackProcessor,
		hasReadableStream,
		canAttemptVideoOnlySpike: missing.length === 0,
		missing,
		supportedCodecs: { h264: 'unknown', vp9: 'unknown' },
		muxerStrategy: hasVideoEncoder ? 'mp4-muxer-needed' : 'unavailable'
	};
}

export async function probeWebCodecsSupport(
	globals: WebCodecsGlobalLike = webCodecsGlobalsFrom(globalThis)
): Promise<WebCodecsCapabilitySnapshot> {
	const snapshot = detectWebCodecsCapabilities(globals);
	const probe = globals.VideoEncoder?.isConfigSupported;
	if (!probe) return snapshot;

	const entries = await Promise.all(
		(Object.entries(WEB_CODECS_TEST_CONFIGS) as [WebCodecsCodec, Record<string, unknown>][]) .map(
			async ([codec, config]) => {
				try {
					const result = await probe(config);
					return [codec, result.supported ? 'supported' : 'unsupported'] as const;
				} catch {
					return [codec, 'unsupported'] as const;
				}
			}
		)
	);

	const supportedCodecs = Object.fromEntries(entries) as Record<WebCodecsCodec, WebCodecsSupport>;
	return {
		...snapshot,
		supportedCodecs,
		muxerStrategy:
			supportedCodecs.h264 === 'supported'
				? 'mp4-muxer-needed'
				: supportedCodecs.vp9 === 'supported'
					? 'webm-muxer-needed'
					: 'unavailable'
	};
}