// Bundles the functions entrypoint with esbuild so functions can import pure,
// dependency-free modules from the web app (../src/lib/...). npm packages stay
// external and are installed from functions/package.json at deploy time.
import { cp, rm } from 'node:fs/promises';
import { build } from 'esbuild';

await rm('lib', { recursive: true, force: true });

await build({
	// hudRenderChild runs as a separate process (see src/hudRenderChild.ts).
	entryPoints: { index: 'src/index.ts', hudRenderChild: 'src/hudRenderChild.ts' },
	outdir: 'lib',
	bundle: true,
	platform: 'node',
	format: 'esm',
	target: 'node22',
	packages: 'external',
	sourcemap: true,
	logLevel: 'info'
});

// HUD fonts are read at runtime by the overlay renderer (src/hudFonts.ts).
await cp('../static/fonts', 'lib/fonts', { recursive: true });
