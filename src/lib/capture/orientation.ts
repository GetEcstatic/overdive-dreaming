/**
 * Pure helpers for video orientation metadata.
 *
 * See docs/WEBAPP_ORIENTATION_METADATA_STRATEGY_PLAN.md.
 *
 * Three concerns are kept separate:
 *
 *  1. Capture posture — how the user was holding the phone.
 *  2. Asset orientation — what the encoded file physically is.
 *  3. Display orientation — how Overdive's player should present it.
 *
 * All functions in this module are pure: no DOM, no `window` reads.
 * The thin adapter at the bottom (`viewportPosture`) is the one
 * deliberate edge that pokes at `window` and returns plain data.
 */

import type {
	DiveVideoCapturePosture,
	DiveVideoDisplayOrientation,
	DiveVideoOrientation,
	DiveVideoRotation
} from '$lib/types';

/**
 * Minimal viewport-shaped input the pure helpers operate on. Mirrors
 * the values exposed by `window.screen.orientation` and the document
 * size, but is just plain data so the helpers can be unit-tested
 * without a browser.
 */
export interface ViewportSnapshot {
	/** `window.screen.orientation.type`, when available. */
	screenOrientationType?:
		| 'portrait-primary'
		| 'portrait-secondary'
		| 'landscape-primary'
		| 'landscape-secondary'
		| string;
	/** `window.screen.orientation.angle`, when available. */
	screenOrientationAngle?: number;
	/** Viewport width in CSS pixels — fallback when the API is missing. */
	viewportWidth?: number;
	/** Viewport height in CSS pixels — fallback when the API is missing. */
	viewportHeight?: number;
}

/**
 * Derive the user's phone posture at the moment of inspection.
 *
 * Prefers the Screen Orientation API; falls back to viewport width/height
 * comparison for browsers that don't expose it (older iOS Safari).
 */
export function posturefromViewport(snap: ViewportSnapshot): DiveVideoCapturePosture {
	const type = snap.screenOrientationType;
	if (type === 'portrait-primary') return 'phone-portrait-upright';
	if (type === 'portrait-secondary') return 'phone-portrait-upside-down';
	if (type === 'landscape-primary') return 'phone-landscape-left';
	if (type === 'landscape-secondary') return 'phone-landscape-right';

	// Angle-only fallback (some Android browsers expose angle without type).
	const angle = snap.screenOrientationAngle;
	if (angle === 0) return 'phone-portrait-upright';
	if (angle === 180) return 'phone-portrait-upside-down';
	if (angle === 90) return 'phone-landscape-left';
	if (angle === 270 || angle === -90) return 'phone-landscape-right';

	// Pure viewport heuristic — matches what most users expect when a
	// browser doesn't expose orientation at all.
	const w = snap.viewportWidth ?? 0;
	const h = snap.viewportHeight ?? 0;
	if (w > 0 && h > 0) {
		return w >= h ? 'phone-landscape-left' : 'phone-portrait-upright';
	}
	return 'unknown';
}

/**
 * Decide how Overdive should render a clip given how the asset was
 * encoded and how the user held the phone at record start.
 *
 * Rules:
 *
 * - Asset is portrait → display portrait. The encoded file already
 *   matches the intended framing.
 * - Asset is landscape and the user was holding the phone in landscape
 *   → display landscape. Maps left/right posture to the matching
 *   display orientation so the HUD anchors to the correct edge.
 * - Asset is landscape but the user was holding the phone vertically
 *   → display portrait-left (the most common "I held the phone up
 *   while filming" intent). Player will rotate the video into a
 *   portrait viewport without re-encoding the file.
 */
export function decideDisplayOrientation(args: {
	assetOrientation: DiveVideoOrientation;
	capturePosture: DiveVideoCapturePosture;
}): { displayOrientation: DiveVideoDisplayOrientation; displayRotationDeg: DiveVideoRotation } {
	if (args.assetOrientation === 'portrait') {
		return { displayOrientation: 'portrait-left', displayRotationDeg: 0 };
	}
	switch (args.capturePosture) {
		case 'phone-landscape-left':
			return { displayOrientation: 'landscape', displayRotationDeg: 0 };
		case 'phone-landscape-right':
			return { displayOrientation: 'landscape', displayRotationDeg: 180 };
		case 'phone-portrait-upright':
			return { displayOrientation: 'portrait-left', displayRotationDeg: 90 };
		case 'phone-portrait-upside-down':
			return { displayOrientation: 'portrait-right', displayRotationDeg: 270 };
		case 'unknown':
		default:
			return { displayOrientation: 'landscape', displayRotationDeg: 0 };
	}
}

/**
 * Adapter: read a viewport snapshot from `window`. Side-effect layer
 * around `window.screen.orientation` and `document` measurements so
 * callers (Svelte components) don't have to repeat null checks.
 */
export function readViewportSnapshot(): ViewportSnapshot {
	if (typeof window === 'undefined') return {};
	const ori = window.screen?.orientation as
		| { type?: string; angle?: number }
		| undefined;
	return {
		screenOrientationType: ori?.type,
		screenOrientationAngle: ori?.angle,
		viewportWidth: window.innerWidth,
		viewportHeight: window.innerHeight
	};
}
