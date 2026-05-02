import { describe, expect, it } from 'vitest';
import {
	actualAverageBitrateBps,
	bitrateForResolution,
	estimateBytesPerMinute
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
