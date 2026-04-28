import type { DiveVideoDiscipline, MediaObjectRef, MediaStorageProvider } from '$lib/types';

export type MediaKind =
	| 'session-photo'
	| 'dive-video-clean'
	| 'dive-video-thumb'
	| 'dive-video-burned';

export interface MediaUploadRequest {
	kind: MediaKind;
	userId: string;
	routineLogId?: string;
	videoId?: string;
	contentType: string;
	sizeBytes: number;
	discipline?: DiveVideoDiscipline;
}

export interface SignedUpload {
	provider: MediaStorageProvider;
	bucket: string;
	key: string;
	uploadUrl: string;
	expiresAt: number;
	requiredHeaders?: Record<string, string>;
	object: MediaObjectRef;
}

export interface SignedRead {
	url: string;
	expiresAt: number;
}

export function extensionForContentType(contentType: string): string {
	const lower = contentType.toLowerCase();
	if (lower.includes('jpeg') || lower.includes('jpg')) return 'jpg';
	if (lower.includes('png')) return 'png';
	if (lower.includes('webp')) return 'webp';
	if (lower.includes('mp4')) return 'mp4';
	if (lower.includes('webm')) return 'webm';
	return 'bin';
}

export function isWasabiObject(ref: MediaObjectRef | undefined): ref is MediaObjectRef & {
	provider: 'wasabi';
} {
	return ref?.provider === 'wasabi' && typeof ref.key === 'string' && ref.key.length > 0;
}
