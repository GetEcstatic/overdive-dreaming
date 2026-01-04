/**
 * Time conversion utilities for freediving app
 *
 * All times are stored as seconds in the database for easy calculations,
 * but displayed as mm:ss format in the UI for better UX.
 */

export interface TimeComponents {
	minutes: number;
	seconds: number;
}

/**
 * Convert total seconds to mm:ss components
 * @param totalSeconds - Total time in seconds
 * @returns Object with minutes and seconds
 */
export function secondsToComponents(totalSeconds: number): TimeComponents {
	const totalSecondsRounded = Math.round(totalSeconds); // Round to nearest second
	const minutes = Math.floor(totalSecondsRounded / 60);
	const seconds = totalSecondsRounded % 60;
	return { minutes, seconds };
}

/**
 * Convert mm:ss components to total seconds
 * @param minutes - Minutes component
 * @param seconds - Seconds component
 * @returns Total time in seconds
 */
export function componentsToSeconds(minutes: number, seconds: number): number {
	return minutes * 60 + seconds;
}

/**
 * Format seconds as mm:ss string for display
 * @param totalSeconds - Total time in seconds
 * @returns Formatted string like "3:45" or "12:03"
 */
export function formatTime(totalSeconds: number): string {
	const { minutes, seconds } = secondsToComponents(totalSeconds);
	return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Parse mm:ss string to total seconds
 * Handles formats like "3:45", "12:03", "1:5" (converts to 1:05)
 * @param timeString - Time string in mm:ss format
 * @returns Total seconds, or null if invalid format
 */
export function parseTime(timeString: string): number | null {
	const parts = timeString.split(':');
	if (parts.length !== 2) return null;

	const minutes = parseInt(parts[0], 10);
	const seconds = parseInt(parts[1], 10);

	if (isNaN(minutes) || isNaN(seconds) || seconds >= 60 || seconds < 0 || minutes < 0) {
		return null;
	}

	return componentsToSeconds(minutes, seconds);
}

/**
 * Validate mm:ss time components
 * @param minutes - Minutes component
 * @param seconds - Seconds component
 * @returns True if valid time
 */
export function isValidTime(minutes: number | undefined, seconds: number | undefined): boolean {
	if (minutes === undefined || seconds === undefined) return false;
	if (minutes < 0 || seconds < 0 || seconds >= 60) return false;
	if (isNaN(minutes) || isNaN(seconds)) return false;
	return true;
}
