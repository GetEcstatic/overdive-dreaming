/**
 * IndexedDB upload queue for dive videos.
 *
 * Why: captures can happen on flaky pool-deck wifi. We persist the raw video
 * blob + pending DiveVideo metadata in IndexedDB so the user can hit "Save"
 * immediately and the upload resumes later (or after an app reload).
 *
 * See docs/Dynamic video feature.md §7.
 */

import { Timestamp } from 'firebase/firestore';
import type { DiveVideoFormData } from '$lib/types';

const DB_NAME = 'overdive-upload-queue';
const DB_VERSION = 1;
const STORE = 'pending-videos';

/**
 * Convert metadata into a structured-clone-safe plain object before writing
 * to IndexedDB. Firestore `Timestamp` instances and Svelte 5 `$state`
 * reactive proxies both trip up `structuredClone`, so we flatten to plain
 * JSON-shaped data here and reconstruct on read.
 */
function serializeMetadata(metadata: DiveVideoFormData): Record<string, unknown> {
	const plain = JSON.parse(
		JSON.stringify(metadata, (_key, value) => {
			if (value instanceof Timestamp) {
				return { __ts: true, seconds: value.seconds, nanoseconds: value.nanoseconds };
			}
			return value;
		})
	);
	return plain;
}

function deserializeMetadata(plain: Record<string, unknown>): DiveVideoFormData {
	const revive = (val: unknown): unknown => {
		if (val && typeof val === 'object') {
			const obj = val as Record<string, unknown>;
			if (obj.__ts === true && typeof obj.seconds === 'number' && typeof obj.nanoseconds === 'number') {
				return new Timestamp(obj.seconds, obj.nanoseconds);
			}
			if (Array.isArray(val)) return val.map(revive);
			const out: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(obj)) out[k] = revive(v);
			return out;
		}
		return val;
	};
	return revive(plain) as DiveVideoFormData;
}

export interface PendingUpload {
	/** Local id (uuid-like). NOT the Firestore doc id — that's assigned at upload time. */
	localId: string;
	createdAt: number; // Date.now()
	blob: Blob;
	mimeType: string;
	sizeBytes: number;
	metadata: DiveVideoFormData;
	/** Last upload attempt error message, if any. */
	lastError?: string;
	attempts: number;
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(STORE)) {
				db.createObjectStore(STORE, { keyPath: 'localId' });
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
	return db.transaction(STORE, mode).objectStore(STORE);
}

function generateLocalId(): string {
	// crypto.randomUUID is available in modern browsers; fall back to a
	// timestamp+random id when it isn't.
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
		return crypto.randomUUID();
	}
	return `v-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function enqueueUpload(
	blob: Blob,
	metadata: DiveVideoFormData
): Promise<PendingUpload> {
	const db = await openDb();
	// IndexedDB uses structuredClone, which rejects class instances (Firestore
	// `Timestamp`) and some reactive proxies. Store a plain-JSON shape.
	const storedEntry = {
		localId: generateLocalId(),
		createdAt: Date.now(),
		blob,
		mimeType: metadata.mimeType,
		sizeBytes: blob.size,
		metadata: serializeMetadata(metadata),
		attempts: 0
	};
	await new Promise<void>((resolve, reject) => {
		const req = tx(db, 'readwrite').add(storedEntry);
		req.onsuccess = () => resolve();
		req.onerror = () => reject(req.error);
	});
	db.close();
	return {
		localId: storedEntry.localId,
		createdAt: storedEntry.createdAt,
		blob: storedEntry.blob,
		mimeType: storedEntry.mimeType,
		sizeBytes: storedEntry.sizeBytes,
		metadata,
		attempts: 0
	};
}

export async function listPendingUploads(): Promise<PendingUpload[]> {
	const db = await openDb();
	const entries = await new Promise<Array<PendingUpload & { metadata: Record<string, unknown> }>>(
		(resolve, reject) => {
			const req = tx(db, 'readonly').getAll();
			req.onsuccess = () =>
				resolve(req.result as Array<PendingUpload & { metadata: Record<string, unknown> }>);
			req.onerror = () => reject(req.error);
		}
	);
	db.close();
	return entries
		.map((e) => ({ ...e, metadata: deserializeMetadata(e.metadata) }))
		.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removePendingUpload(localId: string): Promise<void> {
	const db = await openDb();
	await new Promise<void>((resolve, reject) => {
		const req = tx(db, 'readwrite').delete(localId);
		req.onsuccess = () => resolve();
		req.onerror = () => reject(req.error);
	});
	db.close();
}

export async function markAttempt(localId: string, error?: string): Promise<void> {
	const db = await openDb();
	await new Promise<void>((resolve, reject) => {
		const store = tx(db, 'readwrite');
		const getReq = store.get(localId);
		getReq.onsuccess = () => {
			const entry = getReq.result as PendingUpload | undefined;
			if (!entry) {
				resolve();
				return;
			}
			entry.attempts += 1;
			entry.lastError = error;
			const putReq = store.put(entry);
			putReq.onsuccess = () => resolve();
			putReq.onerror = () => reject(putReq.error);
		};
		getReq.onerror = () => reject(getReq.error);
	});
	db.close();
}

/**
 * Reset attempts (and lastError) for one entry, or all entries if no id is
 * given. Used by the manual "Retry uploads" UI so users can re-drive items
 * that hit MAX_ATTEMPTS.
 */
export async function resetAttempts(localId?: string): Promise<void> {
	const db = await openDb();
	await new Promise<void>((resolve, reject) => {
		const store = tx(db, 'readwrite');
		const getReq = localId ? store.get(localId) : store.getAll();
		getReq.onsuccess = () => {
			const result = getReq.result as PendingUpload | PendingUpload[] | undefined;
			const entries = Array.isArray(result) ? result : result ? [result] : [];
			if (entries.length === 0) {
				resolve();
				return;
			}
			let remaining = entries.length;
			let errored = false;
			for (const entry of entries) {
				entry.attempts = 0;
				entry.lastError = undefined;
				const putReq = store.put(entry);
				putReq.onsuccess = () => {
					remaining -= 1;
					if (remaining === 0 && !errored) resolve();
				};
				putReq.onerror = () => {
					if (!errored) {
						errored = true;
						reject(putReq.error);
					}
				};
			}
		};
		getReq.onerror = () => reject(getReq.error);
	});
	db.close();
}

/**
 * Total bytes currently waiting in the queue — used to render a
 * "Pending upload (X MB)" chip in the nav.
 */
export async function pendingUploadBytes(): Promise<number> {
	const all = await listPendingUploads();
	return all.reduce((acc, e) => acc + e.sizeBytes, 0);
}
