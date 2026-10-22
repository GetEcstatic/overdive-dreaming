/**
 * Split an object of `totalBytes` into inclusive HTTP byte ranges of at most
 * `partBytes`. Used by the media worker to download originals as parallel
 * ranged GETs: storage is in Singapore and the worker in the US, and one
 * connection across the Pacific managed only ~9 MB/s.
 */
export function byteRanges(totalBytes: number, partBytes: number): { start: number; end: number }[] {
	if (!(totalBytes > 0) || !(partBytes > 0)) return [];
	const ranges: { start: number; end: number }[] = [];
	for (let start = 0; start < totalBytes; start += partBytes) {
		ranges.push({ start, end: Math.min(start + partBytes, totalBytes) - 1 });
	}
	return ranges;
}
