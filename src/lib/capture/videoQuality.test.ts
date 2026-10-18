import { describe, expect, it } from 'vitest';
import {
	actualAverageBitrateBps,
	bitrateForResolution,
	estimateBytesPerMinute,
	formatRecordingSizePerMinute,
	recordingVideoSettings
} from './videoQuality';

describe('video quality presets', () => {
	it('uses high quality as the default recording preset', () => {
		expect(bitrateForResolution('720p')).toBe(8_000_000);
		expect(bitrateForResolution('1080p')).toBe(16_000_000);
	});

	it('supports standard and max presets', () => {
		expect(bitrateForResolution('720p', 'standard')).toBe(5_000_000);
		expect(bitrateForResolution('1080p', 'max')).toBe(24_000_000);
	});

	it('estimates bytes per minute from bitrate', () => {
		expect(estimateBytesPerMinute(8_000_000)).toBe(60_000_000);
	});

	it('derives actual average bitrate from file size and duration', () => {
		expect(actualAverageBitrateBps(60_000_000, 60)).toBe(8_000_000);
		expect(actualAverageBitrateBps(0, 60)).toBeUndefined();
		expect(actualAverageBitrateBps(60_000_000, 0)).toBeUndefined();
	});
});

describe('recordingVideoSettings', () => {
	it('defaults to 1080p standard', () => {
		expect(recordingVideoSettings(undefined)).toEqual({ resolution: '1080p', qualityPreset: 'standard' });
		expect(recordingVideoSettings({})).toEqual({ resolution: '1080p', qualityPreset: 'standard' });
	});

	it('uses the Profile choice', () => {
		expect(recordingVideoSettings({ defaultVideoResolution: '720p', defaultVideoQualityPreset: 'max' })).toEqual({ resolution: '720p', qualityPreset: 'max' });
	});

	it('formats the size per minute', () => {
		expect(formatRecordingSizePerMinute('1080p', 'standard')).toBe('75 MB/min');
		expect(formatRecordingSizePerMinute('720p', 'high')).toBe('60 MB/min');
	});
});
