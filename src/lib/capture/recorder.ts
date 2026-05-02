/**
 * MediaRecorder wrapper that produces a Blob at the end of recording.
 *
 * iOS Safari 17+ produces MP4/H.264; Chrome produces WebM/VP8-9. We negotiate
 * the best supported mime type at construction time.
 *
 * See docs/Dynamic video feature.md §3.1.
 */

export interface RecorderOptions {
	/**
	 * Target bitrate in bits/sec. Browsers treat this as an encoder hint,
	 * not a guarantee; instantaneous bitrate and visible quality can still
	 * vary by codec, motion, lighting, device load, and browser policy.
	 */
	videoBitsPerSecond?: number;
	/** Emit a dataavailable event every N ms so we can checkpoint to IndexedDB. */
	timesliceMs?: number;
}

export interface RecorderHandle {
	start(): void;
	stop(): Promise<RecorderResult>;
	readonly mimeType: string;
	readonly isRecording: boolean;
}

export interface RecorderResult {
	blob: Blob;
	mimeType: string;
	sizeBytes: number;
}

const CANDIDATE_MIME_TYPES = [
	'video/mp4;codecs=h264,aac',
	'video/mp4',
	'video/webm;codecs=h264,opus',
	'video/webm;codecs=vp9,opus',
	'video/webm;codecs=vp8,opus',
	'video/webm'
];

export function pickSupportedMimeType(): string {
	if (typeof MediaRecorder === 'undefined') return 'video/webm';
	for (const candidate of CANDIDATE_MIME_TYPES) {
		if (MediaRecorder.isTypeSupported(candidate)) return candidate;
	}
	return '';
}

export function createRecorder(
	stream: MediaStream,
	options: RecorderOptions = {}
): RecorderHandle {
	if (typeof MediaRecorder === 'undefined') {
		throw new Error('MediaRecorder is not supported in this browser.');
	}

	const mimeType = pickSupportedMimeType();
	const recorder = new MediaRecorder(stream, {
		mimeType: mimeType || undefined,
		videoBitsPerSecond: options.videoBitsPerSecond ?? 3_000_000
	});

	const chunks: BlobPart[] = [];
	let recording = false;
	let stopResolver: ((value: RecorderResult) => void) | null = null;
	let stopRejecter: ((err: unknown) => void) | null = null;

	recorder.ondataavailable = (e: BlobEvent) => {
		if (e.data && e.data.size > 0) chunks.push(e.data);
	};

	recorder.onerror = (event: Event) => {
		if (stopRejecter) {
			stopRejecter((event as unknown as { error?: unknown }).error ?? event);
			stopResolver = null;
			stopRejecter = null;
		}
	};

	recorder.onstop = () => {
		recording = false;
		const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' });
		if (stopResolver) {
			stopResolver({
				blob,
				mimeType: recorder.mimeType || mimeType || 'video/webm',
				sizeBytes: blob.size
			});
			stopResolver = null;
			stopRejecter = null;
		}
	};

	return {
		get mimeType() {
			return recorder.mimeType || mimeType;
		},
		get isRecording() {
			return recording;
		},
		start() {
			if (recording) return;
			recording = true;
			if (options.timesliceMs) recorder.start(options.timesliceMs);
			else recorder.start();
		},
		stop() {
			if (!recording) {
				return Promise.resolve<RecorderResult>({
					blob: new Blob(chunks, { type: mimeType || 'video/webm' }),
					mimeType: mimeType || 'video/webm',
					sizeBytes: 0
				});
			}
			return new Promise<RecorderResult>((resolve, reject) => {
				stopResolver = resolve;
				stopRejecter = reject;
				recorder.stop();
			});
		}
	};
}
