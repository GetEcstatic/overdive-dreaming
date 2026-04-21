/**
 * Camera stream helpers for the dynamic video capture feature.
 *
 * Goals:
 * - Request the rear camera in portrait 9:16 at the requested resolution preset.
 * - Fall back gracefully if the platform can't deliver the exact constraints.
 * - Keep the MediaStream logic small and testable.
 *
 * See docs/Dynamic video feature.md §3.1 and §9.
 */

import type { DiveVideoResolution } from '$lib/types';

export interface CameraStreamOptions {
	resolution: DiveVideoResolution;
	/** Prefer the rear camera (environment). */
	facingMode?: 'environment' | 'user';
	/** Include audio track (default true — coaches narrate dives). */
	withAudio?: boolean;
}

export interface AcquiredStream {
	stream: MediaStream;
	/** Actual resolution returned by the browser after constraints negotiation. */
	actualWidth: number;
	actualHeight: number;
	deviceLabel?: string;
}

/**
 * 720p and 1080p in **portrait** — width < height.
 */
export function constraintsFor(
	options: CameraStreamOptions
): MediaStreamConstraints {
	const portraitFrame =
		options.resolution === '1080p'
			? { width: { ideal: 1080 }, height: { ideal: 1920 } }
			: { width: { ideal: 720 }, height: { ideal: 1280 } };

	return {
		video: {
			facingMode: { ideal: options.facingMode ?? 'environment' },
			frameRate: { ideal: 30, max: 30 },
			...portraitFrame
		},
		audio: options.withAudio ?? true
	};
}

export async function acquireCameraStream(
	options: CameraStreamOptions
): Promise<AcquiredStream> {
	if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
		throw new Error('Camera access is not available in this environment.');
	}

	const stream = await navigator.mediaDevices.getUserMedia(constraintsFor(options));
	const [track] = stream.getVideoTracks();
	const settings = track.getSettings();

	return {
		stream,
		actualWidth: settings.width ?? 0,
		actualHeight: settings.height ?? 0,
		deviceLabel: track.label
	};
}

export function stopStream(stream: MediaStream | null | undefined): void {
	if (!stream) return;
	stream.getTracks().forEach((t) => {
		try {
			t.stop();
		} catch {
			/* ignore */
		}
	});
}
