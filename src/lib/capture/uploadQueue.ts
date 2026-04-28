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
import type { UploadedPart } from '$lib/media/client';
import { logUploadDiagnostic } from './uploadDiagnostics';

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
	const serialize = (value: unknown): unknown => {
		if (value instanceof Timestamp) {
			return { __ts: true, seconds: value.seconds, nanoseconds: value.nanoseconds };
		}
		if (Array.isArray(value)) {
			return value.map((item) => serialize(item) ?? null);
		}
		if (value && typeof value === 'object') {
			const out: Record<string, unknown> = {};
			for (const [key, nested] of Object.entries(value)) {
				const serialized = serialize(nested);
				if (serialized !== undefined) out[key] = serialized;
			}
			return out;
		}
		return value;
	};
	return serialize(metadata) as Record<string, unknown>;
}

function deserializeMetadata(plain: Record<string, unknown>): DiveVideoFormData {
	const revive = (val: unknown): unknown => {
		if (val && typeof val === 'object') {
			const obj = val as Record<string, unknown>;
			if (
				(obj.__ts === true || obj.type === 'firestore/timestamp/1.0') &&
				typeof obj.seconds === 'number' &&
				typeof obj.nanoseconds === 'number'
			) {
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
	/** Firestore diveVideos id once created. Reused on retry. */
	remoteVideoId?: string;
	/** Storage path the blob is expected to upload to once a remote id exists. */
	intendedStoragePath?: string;
	/** Wasabi multipart upload state for resumable object uploads. */
	wasabiUpload?: {
		bucket: string;
		key: string;
		uploadId: string;
		partSizeBytes: number;
		uploadedParts: UploadedPart[];
	};
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
	logUploadDiagnostic({
		level: 'info',
		step: 'enqueue:start',
		message: 'Writing video blob to IndexedDB queue',
		details: {
			sizeBytes: blob.size,
			mimeType: metadata.mimeType,
			sessionId: metadata.sessionId,
			ownerId: metadata.ownerId,
			discipline: metadata.discipline
		}
	});
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
	// Wait for the transaction to commit, not just for the add request to
	// succeed — on iOS Safari a request can resolve inside a transaction that
	// later silently aborts under quota/private-mode pressure, leaving no
	// trace in the store.
	const writeTx = db.transaction(STORE, 'readwrite');
	const addReq = writeTx.objectStore(STORE).add(storedEntry);
	await new Promise<void>((resolve, reject) => {
		addReq.onerror = () => reject(addReq.error);
		writeTx.oncomplete = () => resolve();
		writeTx.onerror = () => reject(writeTx.error);
		writeTx.onabort = () =>
			reject(writeTx.error ?? new Error('IndexedDB transaction aborted'));
	});
	// Read back in a fresh transaction to confirm persistence. If this comes
	// back undefined the write didn't survive — surface that to the caller so
	// the recorder can show a real error instead of a fake success.
	const verifyTx = db.transaction(STORE, 'readonly');
	const getReq = verifyTx.objectStore(STORE).get(storedEntry.localId);
	const persisted = await new Promise<unknown>((resolve, reject) => {
		getReq.onsuccess = () => resolve(getReq.result);
		getReq.onerror = () => reject(getReq.error);
	});
	db.close();
	if (!persisted) {
		logUploadDiagnostic({
			level: 'error',
			step: 'enqueue:verify',
			message: 'IndexedDB write did not survive readback',
			localId: storedEntry.localId,
			details: { sizeBytes: blob.size, mimeType: metadata.mimeType }
		});
		throw new Error(
			'Could not persist upload to local storage. Browser storage may be full or restricted (private browsing / disabled site data).'
		);
	}
	logUploadDiagnostic({
		level: 'info',
		step: 'enqueue:complete',
		message: 'Video blob persisted to IndexedDB queue',
		localId: storedEntry.localId,
		details: { sizeBytes: blob.size, mimeType: metadata.mimeType }
	});
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

/**
 * One-shot health check for IndexedDB on this device. Writes a tiny throwaway
 * blob, reads it back, deletes it, and reports whether the round trip
 * survived a transaction commit. Used by the recorder to warn the user
 * BEFORE they record on a device where storage is broken.
 */
export async function canWriteToIndexedDB(): Promise<boolean> {
	const SMOKE_KEY = '__overdive_storage_smoketest__';
	try {
		const db = await openDb();
		const testEntry = {
			localId: SMOKE_KEY,
			createdAt: Date.now(),
			blob: new Blob(['ok'], { type: 'text/plain' }),
			mimeType: 'text/plain',
			sizeBytes: 2,
			metadata: {} as Record<string, unknown>,
			attempts: 0
		};
		const writeTx = db.transaction(STORE, 'readwrite');
		writeTx.objectStore(STORE).put(testEntry);
		await new Promise<void>((resolve, reject) => {
			writeTx.oncomplete = () => resolve();
			writeTx.onerror = () => reject(writeTx.error);
			writeTx.onabort = () =>
				reject(writeTx.error ?? new Error('IndexedDB transaction aborted'));
		});
		const readTx = db.transaction(STORE, 'readonly');
		const getReq = readTx.objectStore(STORE).get(SMOKE_KEY);
		const got = await new Promise<unknown>((resolve, reject) => {
			getReq.onsuccess = () => resolve(getReq.result);
			getReq.onerror = () => reject(getReq.error);
		});
		const cleanupTx = db.transaction(STORE, 'readwrite');
		cleanupTx.objectStore(STORE).delete(SMOKE_KEY);
		await new Promise<void>((resolve) => {
			cleanupTx.oncomplete = () => resolve();
			cleanupTx.onerror = () => resolve();
			cleanupTx.onabort = () => resolve();
		});
		db.close();
		return !!got;
	} catch (err) {
		console.warn('[uploadQueue] storage smoke test failed', err);
		return false;
	}
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
		const writeTx = db.transaction(STORE, 'readwrite');
		const req = writeTx.objectStore(STORE).delete(localId);
		req.onerror = () => reject(req.error);
		writeTx.oncomplete = () => resolve();
		writeTx.onerror = () => reject(writeTx.error);
		writeTx.onabort = () =>
			reject(writeTx.error ?? new Error('IndexedDB transaction aborted'));
	});
	db.close();
	logUploadDiagnostic({
		level: 'info',
		step: 'queue:remove',
		message: 'Removed uploaded item from IndexedDB queue',
		localId
	});
}

export async function markAttempt(localId: string, error?: string): Promise<void> {
	const db = await openDb();
	await new Promise<void>((resolve, reject) => {
		const writeTx = db.transaction(STORE, 'readwrite');
		const store = writeTx.objectStore(STORE);
		const getReq = store.get(localId);
		getReq.onsuccess = () => {
			const entry = getReq.result as PendingUpload | undefined;
			if (!entry) {
				return;
			}
			entry.attempts += 1;
			entry.lastError = error;
			const putReq = store.put(entry);
			putReq.onerror = () => reject(putReq.error);
		};
		getReq.onerror = () => reject(getReq.error);
		writeTx.oncomplete = () => resolve();
		writeTx.onerror = () => reject(writeTx.error);
		writeTx.onabort = () =>
			reject(writeTx.error ?? new Error('IndexedDB transaction aborted'));
	});
	db.close();
	logUploadDiagnostic({
		level: 'warn',
		step: 'queue:attempt',
		message: 'Recorded failed upload attempt',
		localId,
		details: { error }
	});
}

export async function updatePendingUpload(
	localId: string,
	patch: Partial<Pick<PendingUpload, 'remoteVideoId' | 'intendedStoragePath' | 'lastError' | 'wasabiUpload'>>
): Promise<void> {
	const db = await openDb();
	await new Promise<void>((resolve, reject) => {
		const writeTx = db.transaction(STORE, 'readwrite');
		const store = writeTx.objectStore(STORE);
		const getReq = store.get(localId);
		getReq.onsuccess = () => {
			const entry = getReq.result as PendingUpload | undefined;
			if (!entry) return;
			const putReq = store.put({ ...entry, ...patch });
			putReq.onerror = () => reject(putReq.error);
		};
		getReq.onerror = () => reject(getReq.error);
		writeTx.oncomplete = () => resolve();
		writeTx.onerror = () => reject(writeTx.error);
		writeTx.onabort = () =>
			reject(writeTx.error ?? new Error('IndexedDB transaction aborted'));
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
