/**
 * IndexedDB upload queue for dive videos.
 *
 * Why: captures can happen on flaky pool-deck wifi. We persist the raw video
 * blob + pending DiveVideo metadata in IndexedDB so the user can hit "Save"
 * immediately and the upload resumes later (or after an app reload).
 *
 * See docs/Dynamic video feature.md §7.
 */

import type { DiveVideoFormData } from '$lib/types';

const DB_NAME = 'overdive-upload-queue';
const DB_VERSION = 1;
const STORE = 'pending-videos';

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
	const entry: PendingUpload = {
		localId: generateLocalId(),
		createdAt: Date.now(),
		blob,
		mimeType: metadata.mimeType,
		sizeBytes: blob.size,
		metadata,
		attempts: 0
	};
	await new Promise<void>((resolve, reject) => {
		const req = tx(db, 'readwrite').add(entry);
		req.onsuccess = () => resolve();
		req.onerror = () => reject(req.error);
	});
	db.close();
	return entry;
}

export async function listPendingUploads(): Promise<PendingUpload[]> {
	const db = await openDb();
	const entries = await new Promise<PendingUpload[]>((resolve, reject) => {
		const req = tx(db, 'readonly').getAll();
		req.onsuccess = () => resolve(req.result as PendingUpload[]);
		req.onerror = () => reject(req.error);
	});
	db.close();
	return entries.sort((a, b) => a.createdAt - b.createdAt);
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
 * Total bytes currently waiting in the queue — used to render a
 * "Pending upload (X MB)" chip in the nav.
 */
export async function pendingUploadBytes(): Promise<number> {
	const all = await listPendingUploads();
	return all.reduce((acc, e) => acc + e.sizeBytes, 0);
}
