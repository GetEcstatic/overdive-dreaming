import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Bundled HUD fonts (Barlow / Barlow Condensed with tabular figures frozen in,
 * see static/fonts/README.md). `build.mjs` copies them next to the bundle
 * (lib/fonts); running from source (local harness) reads static/fonts.
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

const CANDIDATE_DIRS = ['./fonts/', '../../static/fonts/'];

/**
 * Absolute font paths. Throws if any file is missing: resvg silently drops text
 * it has no font for, which would export a HUD without numbers.
 */
export function hudFontFiles(): string[] {
	for (const dir of CANDIDATE_DIRS) {
		const files = FONT_FILES.map((file) => fileURLToPath(new URL(`${dir}${file}`, import.meta.url)));
		if (files.every((file) => existsSync(file))) return files;
	}
	throw new Error(`HUD fonts not found (looked in ${CANDIDATE_DIRS.join(', ')} next to ${import.meta.url})`);
}

export const HUD_DEFAULT_FONT_FAMILY = 'Barlow';
