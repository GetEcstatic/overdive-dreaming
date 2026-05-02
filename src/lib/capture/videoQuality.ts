import type { DiveVideoQualityPreset, DiveVideoResolution } from '$lib/types';

export const DEFAULT_VIDEO_QUALITY_PRESET: DiveVideoQualityPreset = 'high';

export const VIDEO_QUALITY_BITRATES_BPS: Record<
	DiveVideoQualityPreset,
	Record<DiveVideoResolution, number>
> = {
	standard: {
		'720p': 5_000_000,
		'1080p': 10_000_000
	},
	high: {
		'720p': 8_000_000,
		'1080p': 16_000_000
	},
	max: {
		'720p': 12_000_000,
		'1080p': 24_000_000
	}
};

export function bitrateForResolution(
	resolution: DiveVideoResolution,
	preset: DiveVideoQualityPreset = DEFAULT_VIDEO_QUALITY_PRESET
): number {
	return VIDEO_QUALITY_BITRATES_BPS[preset][resolution];
}

export function estimateBytesPerMinute(bitsPerSecond: number): number {
	return Math.round((bitsPerSecond * 60) / 8);
}

export function actualAverageBitrateBps(sizeBytes: number, durationSeconds: number): number | undefined {
	if (sizeBytes <= 0 || durationSeconds <= 0) return undefined;
	return Math.round((sizeBytes * 8) / durationSeconds);
}
