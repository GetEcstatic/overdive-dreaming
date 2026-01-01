// Session Management Utilities
// Functions for auto-grouping sessions by time of day

import type { TimeOfDay } from '$lib/types';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '$lib/firebase';

/**
 * Determine the time of day based on the hour
 * Morning: 6am-12pm
 * Afternoon: 12pm-6pm
 * Evening: 6pm-12am (and 12am-6am)
 */
export function getTimeOfDay(date: Date = new Date()): TimeOfDay {
	const hour = date.getHours();

	if (hour >= 6 && hour < 12) {
		return 'morning';
	} else if (hour >= 12 && hour < 18) {
		return 'afternoon';
	} else {
		return 'evening'; // 6pm-12am and 12am-6am
	}
}

/**
 * Get the start and end of the current day (midnight to midnight)
 */
export function getDayBounds(date: Date = new Date()): { start: Date; end: Date } {
	const start = new Date(date);
	start.setHours(0, 0, 0, 0);

	const end = new Date(date);
	end.setHours(23, 59, 59, 999);

	return { start, end };
}

/**
 * Find an existing session for the current day and time period
 * Returns the session ID if found, null otherwise
 */
export async function findExistingSession(
	userId: string,
	timeOfDay: TimeOfDay,
	date: Date = new Date()
): Promise<string | null> {
	const { start, end } = getDayBounds(date);

	// Query for sessions on this day with matching time period
	const sessionsRef = collection(db, 'sessions');
	const q = query(
		sessionsRef,
		where('userId', '==', userId),
		where('date', '>=', Timestamp.fromDate(start)),
		where('date', '<=', Timestamp.fromDate(end)),
		where('timeOfDay', '==', timeOfDay)
	);

	const snapshot = await getDocs(q);

	if (snapshot.empty) {
		return null;
	}

	// Return the first matching session ID
	return snapshot.docs[0].id;
}

/**
 * Format time of day for display
 */
export function formatTimeOfDay(timeOfDay?: TimeOfDay): string {
	if (!timeOfDay) return '';

	const formatted = {
		morning: 'Morning',
		afternoon: 'Afternoon',
		evening: 'Evening'
	};

	return formatted[timeOfDay];
}

/**
 * Format session title with date and time of day
 * Example: "Jan 1, 2026 - Morning"
 */
export function formatSessionTitle(date: Timestamp, timeOfDay?: TimeOfDay): string {
	const dateObj = date.toDate();
	const formattedDate = dateObj.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});

	if (timeOfDay) {
		return `${formattedDate} - ${formatTimeOfDay(timeOfDay)}`;
	}

	return formattedDate;
}
