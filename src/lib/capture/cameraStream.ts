/**
 * Camera stream helpers for the dynamic video capture feature.
 *
 * Goals:
 * - Request the rear camera in LANDSCAPE 16:9 at the requested resolution
 *   preset. Landscape is the native orientation of phone camera sensors,
 *   so this avoids the iOS WebKit portrait-capture quirks (getSettings()
 *   lies, canvas.captureStream + MediaRecorder silently proxies the
 *   source track, etc).
 * - Fall back gracefully if the platform can't deliver the exact constraints.
 * - Keep the MediaStream logic small and testable.
 *
 * The app prompts the user to rotate their phone to landscape before
 * recording and viewing, so the captured landscape file is the user-facing
 * orientation — no canvas rotation or playback-side rotation required.
 *
 * See docs/Dynamic video feature.md §3.1 and §9.
 */

import type { CameraFacing, DiveVideoResolution } from '$lib/types';

export interface CameraStreamOptions {
	resolution: DiveVideoResolution;
	/** Prefer the rear camera (environment). */
	facingMode?: 'environment' | 'user';
	/** Exact camera device id. Takes precedence over facingMode when present. */
	deviceId?: string;
	/** Include audio track (default true — coaches narrate dives). */
	withAudio?: boolean;
}

export interface AcquiredStream {
	stream: MediaStream;
	/** Actual resolution returned by the browser after constraints negotiation. */
	actualWidth: number;
	actualHeight: number;
	deviceId?: string;
	deviceLabel?: string;
	facingMode?: CameraFacing;
}

/**
 * 720p and 1080p in **landscape** — width > height.
 */
export function constraintsFor(
	options: CameraStreamOptions
): MediaStreamConstraints {
	const landscapeFrame =
		options.resolution === '1080p'
			? { width: { ideal: 1920 }, height: { ideal: 1080 } }
			: { width: { ideal: 1280 }, height: { ideal: 720 } };

	const video: MediaTrackConstraints = {
		frameRate: { ideal: 30, max: 30 },
		aspectRatio: { ideal: 16 / 9 },
		...landscapeFrame
	};

	if (options.deviceId) {
		video.deviceId = { exact: options.deviceId };
	} else {
		video.facingMode = { ideal: options.facingMode ?? 'environment' };
	}

	return {
		video,
		audio: options.withAudio ?? true
	};
}

function normalizeFacingMode(value: unknown): CameraFacing | undefined {
	if (value === 'environment') return 'rear';
	if (value === 'user') return 'front';
	if (typeof value === 'string') return 'unknown';
	return undefined;
}

export function isExactDeviceFailure(err: unknown): boolean {
	if (!(err instanceof DOMException)) return false;
	return err.name === 'OverconstrainedError' || err.name === 'NotFoundError';
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
		deviceId: settings.deviceId,
		deviceLabel: track.label,
		facingMode: normalizeFacingMode(settings.facingMode)
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
