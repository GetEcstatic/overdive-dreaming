/**
 * Small durable diagnostic log for the dive-video upload pipeline.
 *
 * Console output disappears quickly on mobile Safari/PWA. Keeping a short
 * localStorage ring buffer lets us inspect what happened after a failed save,
 * even when the IndexedDB upload queue is empty.
 */

const KEY = 'overdive.uploadDiagnostics.v1';
const MAX_ENTRIES = 80;
export const UPLOAD_DIAGNOSTICS_VERSION = 'upload-diagnostics-2026-04-27-2';

export type UploadDiagnosticLevel = 'info' | 'warn' | 'error';

export interface UploadDiagnosticEntry {
	at: number;
	level: UploadDiagnosticLevel;
	step: string;
	message: string;
	localId?: string;
	videoId?: string;
	details?: Record<string, unknown>;
}

function canUseLocalStorage(): boolean {
	return typeof localStorage !== 'undefined';
}

function readRaw(): UploadDiagnosticEntry[] {
	if (!canUseLocalStorage()) return [];
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? (parsed as UploadDiagnosticEntry[]) : [];
	} catch {
		return [];
	}
}

function writeRaw(entries: UploadDiagnosticEntry[]): void {
	if (!canUseLocalStorage()) return;
	try {
		localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
	} catch {
		// Ignore quota/private-mode failures; console logging still happens.
	}
}

function safeDetails(details?: Record<string, unknown>): Record<string, unknown> | undefined {
	if (!details) return undefined;
	try {
		return JSON.parse(JSON.stringify(details)) as Record<string, unknown>;
	} catch {
		return { unserialisable: true };
	}
}

export function logUploadDiagnostic(
	entry: Omit<UploadDiagnosticEntry, 'at'>
): void {
	const full: UploadDiagnosticEntry = {
		...entry,
		at: Date.now(),
		details: safeDetails(entry.details)
	};
	const entries = readRaw();
	entries.push(full);
	writeRaw(entries);

	const prefix = `[upload:${full.step}] ${full.message}`;
	const payload = {
		localId: full.localId,
		videoId: full.videoId,
		...full.details
	};
	if (full.level === 'error') console.error(prefix, payload);
	else if (full.level === 'warn') console.warn(prefix, payload);
	else console.info(prefix, payload);
}

export function listUploadDiagnostics(): UploadDiagnosticEntry[] {
	return readRaw().sort((a, b) => b.at - a.at);
}

export function clearUploadDiagnostics(): void {
	writeRaw([]);
}

export function checkUploadDiagnosticsStorage(): {
	ok: boolean;
	version: string;
	error?: string;
} {
	if (!canUseLocalStorage()) {
		return {
			ok: false,
			version: UPLOAD_DIAGNOSTICS_VERSION,
			error: 'localStorage is not available'
		};
	}
	const key = `${KEY}.selftest`;
	try {
		localStorage.setItem(key, 'ok');
		const ok = localStorage.getItem(key) === 'ok';
		localStorage.removeItem(key);
		return {
			ok,
			version: UPLOAD_DIAGNOSTICS_VERSION,
			error: ok ? undefined : 'localStorage readback failed'
		};
	} catch (err) {
		return {
			ok: false,
			version: UPLOAD_DIAGNOSTICS_VERSION,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}
