/**
 * Child process that rasterises a batch of HUD frames, then exits.
 *
 * resvg-js keeps native memory for every render (about 10 MB per 1080×1920
 * frame) and has no way to free it, so a long export in one process grows
 * until it swaps or is killed. Rendering in short-lived children returns that
 * memory to the OS after each batch. See `renderHudFrames` in mediaWorker.ts.
 */
import { writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';

export interface HudRenderBatch {
	fontFiles: string[];
	defaultFontFamily: string;
	frames: { svg: string; path: string }[];
}

process.once('message', (batch: HudRenderBatch) => {
	void (async () => {
		for (const frame of batch.frames) {
			const png = new Resvg(frame.svg, {
				fitTo: { mode: 'original' },
				font: { loadSystemFonts: false, fontFiles: batch.fontFiles, defaultFontFamily: batch.defaultFontFamily }
			})
				.render()
				.asPng();
			await writeFile(frame.path, png);
		}
	})().then(
		() => process.send?.({ ok: true }, () => process.exit(0)),
		(err: unknown) => process.send?.({ ok: false, error: err instanceof Error ? err.message : String(err) }, () => process.exit(1))
	);
});
