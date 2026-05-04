import { describe, expect, test } from 'vitest';
import { shouldEnterFullscreen } from './videoPlayback';

/**
 * Pure-function tests for the fullscreen decision helper. The helper
 * encapsulates all of the "should we go fullscreen?" logic so the action's
 * DOM-side wiring stays thin.
 */
describe('shouldEnterFullscreen', () => {
	const base = {
		isLandscape: true,
		isVisible: true,
		userEscaped: false,
		allowAutoFullscreen: true
	};

	test('enters fullscreen when landscape + visible + not escaped + allowed', () => {
		expect(shouldEnterFullscreen(base)).toBe(true);
	});

	test('portrait does not trigger fullscreen by default', () => {
		expect(shouldEnterFullscreen({ ...base, isLandscape: false })).toBe(false);
	});

	test('portrait can enter fullscreen after a play request when allowed', () => {
		expect(
			shouldEnterFullscreen({
				...base,
				isLandscape: false,
				allowPortraitPlayFullscreen: true,
				portraitPlayRequested: true
			})
		).toBe(true);
	});

	test('portrait play request is ignored unless explicitly allowed', () => {
		expect(
			shouldEnterFullscreen({
				...base,
				isLandscape: false,
				portraitPlayRequested: true
			})
		).toBe(false);
	});

	test('off-screen players stay inline', () => {
		expect(shouldEnterFullscreen({ ...base, isVisible: false })).toBe(false);
	});

	test('user-escaped state blocks fullscreen', () => {
		expect(shouldEnterFullscreen({ ...base, userEscaped: true })).toBe(false);
	});

	test('compact / feed-card variant never auto-enters fullscreen', () => {
		expect(shouldEnterFullscreen({ ...base, allowAutoFullscreen: false })).toBe(false);
	});

	test('all gates combined: portrait + invisible + escaped → still false', () => {
		expect(
			shouldEnterFullscreen({
				isLandscape: false,
				isVisible: false,
				userEscaped: true,
				allowAutoFullscreen: true
			})
		).toBe(false);
	});
});
