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
 *
 * We specify width/height in portrait orientation AND an explicit
 * `aspectRatio: 9/16` hint because some browsers (notably iOS Safari on
 * iPad and some Android Chrome builds) prefer the `aspectRatio` constraint
 * over width/height when deciding how to orient the stream. Providing both
 * makes it much more likely we get a genuinely portrait stream straight
 * from `getUserMedia`, avoiding the need to canvas-rotate later.
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
			aspectRatio: { ideal: 9 / 16 },
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

/**
 * Wrap a source stream in a canvas-backed portrait pipeline when the
 * browser hands us a landscape stream despite our portrait constraints
 * (seen on some Android Chrome builds and older iPad Safari). The source
 * video frames are drawn 90° rotated onto a canvas sized to the desired
 * portrait dimensions, and `canvas.captureStream` exposes that as a new
 * MediaStream that can be fed into MediaRecorder.
 *
 * The original audio track is carried through so coach narration is
 * preserved. Returns an `EnsuredPortraitStream` that callers must
 * `release()` when done so the canvas draw loop and the source video
 * element are torn down.
 */
export interface EnsuredPortraitStream {
	stream: MediaStream;
	portraitWidth: number;
	portraitHeight: number;
	/** True if we had to canvas-rotate to reach portrait. */
	rotated: boolean;
	release(): void;
}

export async function ensurePortraitStream(
	source: AcquiredStream
): Promise<EnsuredPortraitStream> {
	const w = source.actualWidth;
	const h = source.actualHeight;
	// Already portrait (or unknown) — use the source stream directly.
	if (!(w > 0 && h > 0) || h >= w) {
		return {
			stream: source.stream,
			portraitWidth: w,
			portraitHeight: h,
			rotated: false,
			release: () => undefined
		};
	}

	// Landscape source — build a portrait canvas pipeline.
	const portraitWidth = h;
	const portraitHeight = w;

	const srcVideo = document.createElement('video');
	srcVideo.muted = true;
	srcVideo.playsInline = true;
	srcVideo.srcObject = source.stream;
	await srcVideo.play().catch(() => undefined);

	const canvas = document.createElement('canvas');
	canvas.width = portraitWidth;
	canvas.height = portraitHeight;
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		throw new Error('2D canvas context is not available for portrait rotation.');
	}

	let rafHandle: number | null = null;
	let disposed = false;
	const draw = (): void => {
		if (disposed) return;
		// Rotate 90° CW around the canvas centre so the landscape source
		// fills the portrait canvas exactly.
		ctx.save();
		ctx.translate(portraitWidth / 2, portraitHeight / 2);
		ctx.rotate(Math.PI / 2);
		ctx.drawImage(srcVideo, -w / 2, -h / 2, w, h);
		ctx.restore();
		rafHandle = requestAnimationFrame(draw);
	};
	rafHandle = requestAnimationFrame(draw);

	const canvasStream = canvas.captureStream(30);
	// Carry over the audio track(s) from the original stream.
	source.stream.getAudioTracks().forEach((t) => canvasStream.addTrack(t));

	return {
		stream: canvasStream,
		portraitWidth,
		portraitHeight,
		rotated: true,
		release: () => {
			disposed = true;
			if (rafHandle !== null) cancelAnimationFrame(rafHandle);
			try {
				srcVideo.pause();
				srcVideo.srcObject = null;
			} catch {
				/* ignore */
			}
			canvasStream.getVideoTracks().forEach((t) => t.stop());
		}
	};
}
