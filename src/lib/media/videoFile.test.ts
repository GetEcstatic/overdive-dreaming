import { describe, expect, it } from 'vitest';
import { sniffVideoMime, videoExtensionForMime } from './videoFile';

const bytes = (s: string, prefix: number[] = [0, 0, 0, 0x20]) => new Uint8Array([...prefix, ...[...s].map((c) => c.charCodeAt(0))]);

describe('videoExtensionForMime', () => {
	it('maps known video types', () => {
		expect(videoExtensionForMime('video/quicktime')).toBe('mov');
		expect(videoExtensionForMime('video/mp4;codecs=h264,aac')).toBe('mp4');
		expect(videoExtensionForMime('video/webm;codecs=vp9,opus')).toBe('webm');
		expect(videoExtensionForMime('video/x-matroska;codecs=avc1')).toBe('mkv');
	});

	it('falls back to bin', () => {
		expect(videoExtensionForMime('')).toBe('bin');
		expect(videoExtensionForMime('application/octet-stream')).toBe('bin');
	});
});

describe('sniffVideoMime', () => {
	it('tells QuickTime from MP4 by the ftyp brand', () => {
		expect(sniffVideoMime(bytes('ftypqt  '))).toBe('video/quicktime');
		expect(sniffVideoMime(bytes('ftypisom'))).toBe('video/mp4');
		expect(sniffVideoMime(bytes('ftypmp42'))).toBe('video/mp4');
	});

	it('detects WebM and unknown data', () => {
		expect(sniffVideoMime(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01]))).toBe('video/webm');
		expect(sniffVideoMime(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
	});
});
