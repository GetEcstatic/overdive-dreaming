import { fileURLToPath } from 'node:url';

/**
 * Bundled HUD fonts (Barlow / Barlow Condensed with tabular figures frozen in,
 * see static/fonts/README.md). `build.mjs` copies them next to the bundle, so
 * they resolve relative to lib/index.js at runtime.
 *
 * Passing these to resvg with `loadSystemFonts: false` avoids scanning every
 * system font for every HUD frame, which dominated overlay render time.
 */
const FONT_FILES = [
	'Barlow-Medium.ttf',
	'Barlow-SemiBold.ttf',
	'BarlowCondensed-Medium.ttf',
	'BarlowCondensed-SemiBold.ttf',
	'BarlowCondensed-Bold.ttf'
];

export const HUD_FONT_FILES: string[] = FONT_FILES.map((file) =>
	fileURLToPath(new URL(`./fonts/${file}`, import.meta.url))
);

export const HUD_DEFAULT_FONT_FAMILY = 'Barlow';
