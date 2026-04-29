import { describe, expect, it } from 'vitest';
import {
	decideDisplayOrientation,
	displayTransformFor,
	posturefromViewport
} from './orientation';

describe('posturefromViewport', () => {
	it('uses Screen Orientation API type when present', () => {
		expect(posturefromViewport({ screenOrientationType: 'portrait-primary' })).toBe(
			'phone-portrait-upright'
		);
		expect(posturefromViewport({ screenOrientationType: 'portrait-secondary' })).toBe(
			'phone-portrait-upside-down'
		);
		expect(posturefromViewport({ screenOrientationType: 'landscape-primary' })).toBe(
			'phone-landscape-left'
		);
		expect(posturefromViewport({ screenOrientationType: 'landscape-secondary' })).toBe(
			'phone-landscape-right'
		);
	});

	it('falls back to angle when type is missing', () => {
		expect(posturefromViewport({ screenOrientationAngle: 0 })).toBe('phone-portrait-upright');
		expect(posturefromViewport({ screenOrientationAngle: 90 })).toBe('phone-landscape-left');
		expect(posturefromViewport({ screenOrientationAngle: 180 })).toBe(
			'phone-portrait-upside-down'
		);
		expect(posturefromViewport({ screenOrientationAngle: 270 })).toBe('phone-landscape-right');
		expect(posturefromViewport({ screenOrientationAngle: -90 })).toBe('phone-landscape-right');
	});

	it('falls back to viewport dimensions when neither API is available', () => {
		expect(posturefromViewport({ viewportWidth: 800, viewportHeight: 400 })).toBe(
			'phone-landscape-left'
		);
		expect(posturefromViewport({ viewportWidth: 400, viewportHeight: 800 })).toBe(
			'phone-portrait-upright'
		);
	});

	it('returns unknown when nothing usable is provided', () => {
		expect(posturefromViewport({})).toBe('unknown');
	});
});

describe('decideDisplayOrientation', () => {
	it('keeps portrait assets as portrait', () => {
		expect(
			decideDisplayOrientation({
				assetOrientation: 'portrait',
				capturePosture: 'phone-landscape-left'
			})
		).toEqual({ displayOrientation: 'portrait-left', displayRotationDeg: 0 });
	});

	it('shows landscape assets in landscape when phone was horizontal', () => {
		expect(
			decideDisplayOrientation({
				assetOrientation: 'landscape',
				capturePosture: 'phone-landscape-left'
			})
		).toEqual({ displayOrientation: 'landscape', displayRotationDeg: 0 });
		expect(
			decideDisplayOrientation({
				assetOrientation: 'landscape',
				capturePosture: 'phone-landscape-right'
			})
		).toEqual({ displayOrientation: 'landscape', displayRotationDeg: 180 });
	});

	it('rotates landscape assets to portrait when phone was vertical', () => {
		expect(
			decideDisplayOrientation({
				assetOrientation: 'landscape',
				capturePosture: 'phone-portrait-upright'
			})
		).toEqual({ displayOrientation: 'portrait-left', displayRotationDeg: 90 });
		expect(
			decideDisplayOrientation({
				assetOrientation: 'landscape',
				capturePosture: 'phone-portrait-upside-down'
			})
		).toEqual({ displayOrientation: 'portrait-right', displayRotationDeg: 270 });
	});

	it('defaults unknown posture to landscape display for landscape assets', () => {
		expect(
			decideDisplayOrientation({
				assetOrientation: 'landscape',
				capturePosture: 'unknown'
			})
		).toEqual({ displayOrientation: 'landscape', displayRotationDeg: 0 });
	});
});

describe('displayTransformFor', () => {
	it('returns landscape transform for legacy clips with no metadata', () => {
		expect(displayTransformFor({})).toEqual({
			aspectRatio: '16 / 9',
			transform: '',
			hudMode: 'landscape'
		});
	});

	it('falls back to asset orientation when displayOrientation is missing', () => {
		expect(displayTransformFor({ assetOrientation: 'portrait' })).toMatchObject({
			aspectRatio: '9 / 16',
			hudMode: 'portrait'
		});
	});

	it('produces a portrait viewport with rotation when display is portrait-left', () => {
		expect(
			displayTransformFor({
				displayOrientation: 'portrait-left',
				displayRotationDeg: 90,
				assetOrientation: 'landscape'
			})
		).toEqual({ aspectRatio: '9 / 16', transform: 'rotate(90deg)', hudMode: 'portrait' });
	});

	it('produces a portrait viewport with reverse rotation for portrait-right', () => {
		expect(
			displayTransformFor({
				displayOrientation: 'portrait-right',
				displayRotationDeg: 270,
				assetOrientation: 'landscape'
			})
		).toEqual({ aspectRatio: '9 / 16', transform: 'rotate(270deg)', hudMode: 'portrait' });
	});

	it('keeps native landscape clips untransformed', () => {
		expect(
			displayTransformFor({
				displayOrientation: 'landscape',
				displayRotationDeg: 0,
				assetOrientation: 'landscape'
			})
		).toEqual({ aspectRatio: '16 / 9', transform: '', hudMode: 'landscape' });
	});
});
