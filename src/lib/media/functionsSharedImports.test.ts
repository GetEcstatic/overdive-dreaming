import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The Cloud Functions bundle (functions/build.mjs) imports some app modules
 * directly. Those modules, and anything they import, must stay free of `$lib`,
 * SvelteKit, Firebase client SDK and other package imports, or the server
 * bundle would pull in browser code.
 */
const ROOT = resolve(__dirname, '../../..');
const FUNCTIONS_SRC = join(ROOT, 'functions/src');

function importSpecifiers(source: string): string[] {
	return [...source.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

function tsFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory() ? tsFiles(join(dir, entry.name)) : entry.name.endsWith('.ts') ? [join(dir, entry.name)] : []
	);
}

function withTs(path: string): string {
	return path.endsWith('.ts') ? path : `${path}.ts`;
}

function sharedAppModules(): string[] {
	const appSrc = join(ROOT, 'src') + '/';
	const seen = new Set<string>();
	const queue = tsFiles(FUNCTIONS_SRC).flatMap((file) =>
		importSpecifiers(readFileSync(file, 'utf8'))
			.filter((spec) => spec.startsWith('.'))
			.map((spec) => withTs(resolve(dirname(file), spec)))
			.filter((path) => path.startsWith(appSrc))
	);
	while (queue.length > 0) {
		const file = queue.shift()!;
		if (seen.has(file)) continue;
		seen.add(file);
		for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
			if (spec.startsWith('.')) queue.push(withTs(resolve(dirname(file), spec)));
		}
	}
	return [...seen].sort();
}

describe('app modules shared with Cloud Functions', () => {
	const shared = sharedAppModules();

	it('finds the shared modules', () => {
		expect(shared.length).toBeGreaterThan(0);
	});

	it.each(shared.map((file) => [file.slice(ROOT.length + 1), file]))('%s uses relative imports only', (_, file) => {
		const bad = importSpecifiers(readFileSync(file, 'utf8')).filter((spec) => !spec.startsWith('.'));
		expect(bad).toEqual([]);
	});
});
