import { storage } from '$lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

/**
 * Upload a photo to Firebase Storage for a session
 * @param userId - User ID owning the session
 * @param sessionId - Session ID to attach photo to
 * @param file - Image file to upload
 * @param onProgress - Optional callback for upload progress (0-100)
 * @returns Download URL of uploaded photo
 */
export async function uploadSessionPhoto(
	userId: string,
	sessionId: string,
	file: File,
	onProgress?: (progress: number) => void
): Promise<string> {
	// Validate file type
	if (!file.type.startsWith('image/')) {
		throw new Error('File must be an image');
	}

	// Validate file size (5MB max)
	if (file.size > 5 * 1024 * 1024) {
		throw new Error('Image must be under 5MB');
	}

	// Create storage reference with timestamped filename
	const filename = `${Date.now()}_${file.name}`;
	const storageRef = ref(storage, `session-photos/${userId}/${sessionId}/${filename}`);

	// Upload with progress tracking
	return new Promise((resolve, reject) => {
		const uploadTask = uploadBytesResumable(storageRef, file);

		uploadTask.on(
			'state_changed',
			(snapshot) => {
				const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
				onProgress?.(progress);
			},
			(error) => reject(error),
			async () => {
				try {
					const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
					resolve(downloadURL);
				} catch (error) {
					reject(error);
				}
			}
		);
	});
}

/**
 * Delete a photo from Firebase Storage
 * @param photoUrl - Full Firebase Storage download URL
 */
export async function deleteSessionPhoto(photoUrl: string): Promise<void> {
	const photoRef = ref(storage, photoUrl);
	await deleteObject(photoRef);
}

/**
 * Delete a biometric CSV from Firebase Storage
 * @param csvUrl - Full Firebase Storage download URL
 */
export async function deleteBiometricCsv(csvUrl: string): Promise<void> {
	const csvRef = ref(storage, csvUrl);
	await deleteObject(csvRef);
}

/**
 * Upload a biometric CSV file to Firebase Storage for a session
 * Stores the raw CSV for future reprocessing if algorithms change.
 * @param userId - User ID owning the session
 * @param sessionId - Session ID to attach CSV to
 * @param csvContent - Raw CSV content string
 * @returns Download URL of uploaded CSV
 */
export async function uploadBiometricCsv(
	userId: string,
	sessionId: string,
	csvContent: string
): Promise<string> {
	// Create storage reference
	const filename = `${Date.now()}_biometric.csv`;
	const storageRef = ref(storage, `biometric-csvs/${userId}/${sessionId}/${filename}`);

	// Convert string to Blob
	const csvBlob = new Blob([csvContent], { type: 'text/csv' });

	// Upload
	return new Promise((resolve, reject) => {
		const uploadTask = uploadBytesResumable(storageRef, csvBlob);

		uploadTask.on(
			'state_changed',
			() => {}, // No progress tracking needed for small text files
			(error) => reject(error),
			async () => {
				try {
					const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
					resolve(downloadURL);
				} catch (error) {
					reject(error);
				}
			}
		);
	});
}

/**
 * Extract YouTube video ID from various URL formats
 * @param url - YouTube URL or video ID
 * @returns Video ID or null if invalid
 */
export function extractYouTubeVideoId(url: string): string | null {
	const patterns = [
		/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
		/^([a-zA-Z0-9_-]{11})$/
	];

	for (const pattern of patterns) {
		const match = url.match(pattern);
		if (match && match[1]) return match[1];
	}
	return null;
}

/**
 * Validate if a string is a valid YouTube URL
 * @param url - URL to validate
 * @returns True if valid YouTube URL
 */
export function isValidYouTubeUrl(url: string): boolean {
	return extractYouTubeVideoId(url) !== null;
}

/**
 * Convert YouTube URL to embeddable format
 * @param url - YouTube URL
 * @returns Embed URL or null if invalid
 */
export function getYouTubeEmbedUrl(url: string): string | null {
	const videoId = extractYouTubeVideoId(url);
	return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
}
