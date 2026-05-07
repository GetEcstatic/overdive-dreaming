import { writable } from 'svelte/store';

export interface UploadQueueStatus {
	active: boolean;
	pendingCount: number;
	pendingBytes: number;
	activeLocalId?: string;
	bytesSent: number;
	bytesTotal: number;
	fraction: number;
	lastError?: string;
}

const initialStatus: UploadQueueStatus = {
	active: false,
	pendingCount: 0,
	pendingBytes: 0,
	bytesSent: 0,
	bytesTotal: 0,
	fraction: 0
};

export const uploadQueueStatus = writable<UploadQueueStatus>(initialStatus);

export function updateUploadQueueStatus(patch: Partial<UploadQueueStatus>): void {
	uploadQueueStatus.update((current) => ({ ...current, ...patch }));
}

export function resetUploadQueueStatus(): void {
	uploadQueueStatus.set(initialStatus);
}
