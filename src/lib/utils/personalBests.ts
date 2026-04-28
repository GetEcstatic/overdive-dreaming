// Personal Best (PB) Utilities
// Functions for checking and updating personal bests

import type {
	Discipline,
	PersonalBestRecord,
	PersonalBestRecords,
	PersonalBests,
	RoutineLog,
	RoutineTemplate
} from '$lib/types';
import { Timestamp, collection, deleteField, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '$lib/firebase';
import { deriveAttemptCategory, resultForPB } from '$lib/utils/attemptCategories';

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
 * Remove a personal best value for a discipline
 * @param userId - User's ID
 * @param discipline - The discipline to clear
 */
export async function clearUserPB(userId: string, discipline: Discipline): Promise<void> {
	const userRef = doc(db, 'users', userId);

	await setDoc(
		userRef,
		{
			personalBests: {
				[discipline]: deleteField()
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

export async function getUserPBRecords(userId: string): Promise<PersonalBestRecords | undefined> {
	const userRef = doc(db, 'users', userId);
	const userSnap = await getDoc(userRef);

	if (!userSnap.exists()) return undefined;

	const userData = userSnap.data();
	return userData.personalBestRecords as PersonalBestRecords | undefined;
}

export function checkIsCategoryPB(
	record: Pick<PersonalBestRecord, 'key' | 'value'>,
	currentRecords?: PersonalBestRecords
): boolean {
	const currentPB = currentRecords?.[record.key];
	if (!currentPB) return true;
	return record.value > currentPB.value;
}

export async function updateUserPBRecord(
	userId: string,
	record: PersonalBestRecord
): Promise<void> {
	const userRef = doc(db, 'users', userId);
	const standardPB: Partial<PersonalBests> = record.isStandard
		? { [record.discipline]: record.value }
		: {};

	await setDoc(
		userRef,
		{
			personalBestRecords: {
				[record.key]: record
			},
			...(record.isStandard && { personalBests: standardPB }),
			updatedAt: new Date()
		},
		{ merge: true }
	);
}

/**
 * Recalculate personal bests for specific disciplines
 * @param userId - User's ID
 * @param disciplines - Disciplines to recalculate
 */
export async function recalculatePBsForDisciplines(
	userId: string,
	disciplines: Discipline[]
): Promise<void> {
	await recalculatePBRecordsForUser(userId, disciplines);
}

export async function recalculatePBRecordsForUser(
	userId: string,
	disciplines?: Discipline[]
): Promise<void> {
	const uniqueDisciplines: Discipline[] = disciplines?.length
		? Array.from(new Set(disciplines))
		: ['STA', 'DYN', 'DNF', 'DYNB'];

	const records: PersonalBestRecords = {};
	const standardPBs: PersonalBests = {};
	const existingRecords = await getUserPBRecords(userId);

	for (const discipline of uniqueDisciplines) {
		const logsRef = collection(db, 'routineLogs');
		const q = query(
			logsRef,
			where('userId', '==', userId),
			where('disciplineUsed', '==', discipline)
		);
		const logsSnapshot = await getDocs(q);

		for (const logDoc of logsSnapshot.docs) {
			const log = { id: logDoc.id, ...logDoc.data() } as RoutineLog;
			if (!log.routineId) continue;

			const routineSnap = await getDoc(doc(db, 'routines', log.routineId));
			if (!routineSnap.exists()) continue;

			const routine = routineSnap.data() as RoutineTemplate;
			const tags = routine.tags ?? [];
			const isMaxAttempt = tags.includes('max-attempt') || tags.includes('pb');
			if (!isMaxAttempt) continue;

			const result = resultForPB(discipline, log);
			if (result === undefined) continue;

			const category = deriveAttemptCategory(log);
			const current = records[category.key];
			if (current && current.value >= result) continue;

			const date =
				log.date && typeof log.date === 'object' && 'toDate' in log.date
					? log.date
					: Timestamp.fromDate(new Date());
			const record: PersonalBestRecord = {
				key: category.key,
				discipline,
				categoryKind: category.conditions.kind,
				categoryLabel: category.label,
				metric: category.metric,
				value: result,
				routineLogId: logDoc.id,
				date,
				conditions: category.conditions,
				isStandard: category.isStandard
			};

			records[category.key] = record;
			if (record.isStandard) {
				standardPBs[discipline] = result;
			}
		}
	}

	const userRef = doc(db, 'users', userId);
	const personalBestsPatch: Record<string, number | ReturnType<typeof deleteField>> = {};
	for (const discipline of uniqueDisciplines) {
		const value = standardPBs[discipline];
		personalBestsPatch[discipline] = value === undefined ? deleteField() : value;
	}
	const recordsPatch: Record<string, PersonalBestRecord | ReturnType<typeof deleteField>> = {};
	for (const [key, record] of Object.entries(existingRecords ?? {})) {
		if (uniqueDisciplines.includes(record.discipline)) {
			recordsPatch[key] = deleteField();
		}
	}
	for (const [key, record] of Object.entries(records)) {
		recordsPatch[key] = record;
	}

	await setDoc(
		userRef,
		{
			personalBestRecords: recordsPatch,
			personalBests: personalBestsPatch,
			updatedAt: new Date()
		},
		{ merge: true }
	);
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

export function formatPBRecord(record: Pick<PersonalBestRecord, 'categoryLabel' | 'metric' | 'value'>): string {
	if (record.metric === 'time') {
		const minutes = Math.floor(record.value / 60);
		const seconds = Math.floor(record.value % 60);
		return `${record.categoryLabel}: ${minutes}:${seconds.toString().padStart(2, '0')}`;
	}

	return `${record.categoryLabel}: ${record.value}m`;
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
