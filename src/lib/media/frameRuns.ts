/**
 * Collapse a fixed-rate HUD frame sequence into runs of identical frames, and
 * describe them as an FFmpeg concat-demuxer list. Lets the server render one
 * PNG per run instead of one per tick (pre-dive, post-dive and card holds).
 *
 * Shared by the web app and the Cloud Functions bundle: no imports.
 */

export interface FrameRun {
	/** Index of the first tick in the run; also the frame file to render. */
	readonly startIndex: number;
	/** Number of consecutive ticks with identical content. */
	readonly length: number;
}

/** Group consecutive equal keys (e.g. SVG strings) into runs. */
export function collapseFrameRuns(keys: readonly string[]): FrameRun[] {
	const runs: FrameRun[] = [];
	keys.forEach((key, index) => {
		const last = runs[runs.length - 1];
		if (last && keys[last.startIndex] === key) {
			runs[runs.length - 1] = { startIndex: last.startIndex, length: last.length + 1 };
		} else {
			runs.push({ startIndex: index, length: 1 });
		}
	});
	return runs;
}

/**
 * FFmpeg concat-demuxer list for `runs`, each frame shown for
 * `run.length * tickMs`. The concat demuxer ignores the last entry's duration
 * unless the file is listed again, so the final file is repeated.
 */
export function concatListForRuns(
	runs: readonly FrameRun[],
	tickMs: number,
	fileName: (startIndex: number) => string
): string {
	if (runs.length === 0) return '';
	const lines = runs.flatMap((run) => [
		`file '${fileName(run.startIndex)}'`,
		`duration ${((run.length * tickMs) / 1000).toFixed(3)}`
	]);
	lines.push(`file '${fileName(runs[runs.length - 1].startIndex)}'`);
	return `${lines.join('\n')}\n`;
}
