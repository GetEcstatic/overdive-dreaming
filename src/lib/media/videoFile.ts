/** Pure helpers for naming and typing downloaded video files. */

export type SniffedVideoMime = 'video/mp4' | 'video/quicktime' | 'video/webm';

/** File extension for a video MIME type; `bin` only when the type is unknown. */
export function videoExtensionForMime(mime: string): string {
	const lower = mime.toLowerCase();
	if (lower.includes('quicktime')) return 'mov';
	if (lower.includes('mp4')) return 'mp4';
	if (lower.includes('webm')) return 'webm';
	if (lower.includes('matroska')) return 'mkv';
	return 'bin';
}

/**
 * Real container from the first bytes of a file. The stored MIME can disagree
 * with the bytes, and iOS only offers "Save Video" when they match.
 *  - ISO BMFF: bytes 4..7 are `ftyp`; major brand `qt  ` is QuickTime, else MP4
 *  - WebM/Matroska: EBML header 1A 45 DF A3
 */
export function sniffVideoMime(head: Uint8Array): SniffedVideoMime | null {
	const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
	if (head.length >= 8 && ascii(4, 8) === 'ftyp') {
		return head.length >= 12 && ascii(8, 12) === 'qt  ' ? 'video/quicktime' : 'video/mp4';
	}
	if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
		return 'video/webm';
	}
	return null;
}
