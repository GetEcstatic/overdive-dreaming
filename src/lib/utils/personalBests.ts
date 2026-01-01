// Personal Best (PB) Utilities
// Functions for checking and updating personal bests

import type { Discipline, PersonalBests } from '$lib/types';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '$lib/firebase';

/**
 * Check if a dive result is a personal best
 * @param discipline - The discipline (STA, DYN, DNF, DYNB)
 * @param result - The result (time in seconds for STA, distance in meters for others)
 * @param currentPBs - User's current personal bests
 * @returns true if this is a new PB
 */
export function checkIsPB(
	discipline: Discipline,
	result: number,
	currentPBs?: PersonalBests
): boolean {
	if (!currentPBs) return true; // First attempt is always a PB

	const currentPB = currentPBs[discipline];
	if (currentPB === undefined) return true; // First attempt at this discipline

	return result > currentPB; // New result beats old PB
}

/**
 * Update user's personal bests in Firestore
 * @param userId - User's ID
 * @param discipline - The discipline to update
 * @param newPB - The new PB value
 */
export async function updateUserPB(
	userId: string,
	discipline: Discipline,
	newPB: number
): Promise<void> {
	const userRef = doc(db, 'users', userId);

	// Use setDoc with merge to create document if it doesn't exist
	await setDoc(
		userRef,
		{
			personalBests: {
				[discipline]: newPB
			},
			updatedAt: new Date()
		},
		{ merge: true }
	);
}

/**
 * Get user's personal bests from Firestore
 * @param userId - User's ID
 * @returns User's personal bests or undefined
 */
export async function getUserPBs(userId: string): Promise<PersonalBests | undefined> {
	const userRef = doc(db, 'users', userId);
	const userSnap = await getDoc(userRef);

	if (!userSnap.exists()) return undefined;

	const userData = userSnap.data();
	return userData.personalBests as PersonalBests | undefined;
}

/**
 * Format a PB for display
 * @param discipline - The discipline
 * @param value - The PB value (seconds or meters)
 * @returns Formatted string like "STA: 3:45" or "DYN: 175m"
 */
export function formatPB(discipline: Discipline, value: number): string {
	if (discipline === 'STA') {
		// Format time as mm:ss
		const minutes = Math.floor(value / 60);
		const seconds = Math.floor(value % 60);
		return `${discipline}: ${minutes}:${seconds.toString().padStart(2, '0')}`;
	} else {
		// Format distance in meters
		return `${discipline}: ${value}m`;
	}
}

/**
 * Get the best overall PB (highest value across all disciplines)
 * Useful for displaying a single "hero" PB on dashboard
 * @param pbs - User's personal bests
 * @returns Object with discipline and value, or null if no PBs
 */
export function getBestOverallPB(
	pbs?: PersonalBests
): { discipline: Discipline; value: number } | null {
	if (!pbs) return null;

	let bestDiscipline: Discipline | null = null;
	let bestValue = 0;

	// Check each discipline
	for (const [discipline, value] of Object.entries(pbs)) {
		if (value !== undefined && value > bestValue) {
			bestValue = value;
			bestDiscipline = discipline as Discipline;
		}
	}

	if (!bestDiscipline) return null;

	return { discipline: bestDiscipline, value: bestValue };
}
