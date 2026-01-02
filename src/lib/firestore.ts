// Overdive Dreaming - Firestore Helper Functions
// CRUD operations for all collections

import {
	collection,
	doc,
	getDoc,
	getDocs,
	addDoc,
	updateDoc,
	deleteDoc,
	query,
	where,
	orderBy,
	limit,
	Timestamp,
	serverTimestamp,
	type DocumentData,
	type QueryConstraint
} from 'firebase/firestore';
import { db } from '$lib/firebase';
import type {
	RoutineTemplate,
	Session,
	RoutineLog,
	Dive,
	SuggestedTags,
	RoutineTemplateFormData,
	SessionFormData,
	RoutineLogFormData,
	DiveFormData,
	Discipline
} from '$lib/types';

// ============================================================================
// ROUTINE TEMPLATES
// ============================================================================

/**
 * Get all routines visible to the current user
 * Includes: system defaults + user's custom routines
 */
export async function getRoutinesForUser(userId: string): Promise<RoutineTemplate[]> {
	const routinesRef = collection(db, 'routines');

	// Get system routines
	const systemQuery = query(routinesRef, where('createdBy', '==', 'system'));
	const systemSnapshot = await getDocs(systemQuery);

	// Get user's custom routines
	const userQuery = query(routinesRef, where('createdBy', '==', userId));
	const userSnapshot = await getDocs(userQuery);

	const routines: RoutineTemplate[] = [];

	systemSnapshot.forEach((doc) => {
		routines.push({ id: doc.id, ...doc.data() } as RoutineTemplate);
	});

	userSnapshot.forEach((doc) => {
		routines.push({ id: doc.id, ...doc.data() } as RoutineTemplate);
	});

	return routines;
}

/**
 * Get a single routine by ID
 */
export async function getRoutine(routineId: string): Promise<RoutineTemplate | null> {
	const docRef = doc(db, 'routines', routineId);
	const docSnap = await getDoc(docRef);

	if (!docSnap.exists()) return null;

	return { id: docSnap.id, ...docSnap.data() } as RoutineTemplate;
}

/**
 * Create a new custom routine
 */
export async function createRoutine(
	userId: string,
	routineData: RoutineTemplateFormData
): Promise<string> {
	const routinesRef = collection(db, 'routines');

	const newRoutine = {
		...routineData,
		createdBy: userId,
		isPublic: false, // Default to private
		tier: 'free' as const,
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp()
	};

	const docRef = await addDoc(routinesRef, newRoutine);
	return docRef.id;
}

/**
 * Update an existing routine
 */
export async function updateRoutine(
	routineId: string,
	updates: Partial<RoutineTemplateFormData>
): Promise<void> {
	const docRef = doc(db, 'routines', routineId);

	await updateDoc(docRef, {
		...updates,
		updatedAt: serverTimestamp()
	});
}

/**
 * Delete a routine (only user's own custom routines)
 */
export async function deleteRoutine(routineId: string): Promise<void> {
	const docRef = doc(db, 'routines', routineId);
	await deleteDoc(docRef);
}

/**
 * Filter routines by tags
 */
export async function getRoutinesByTag(
	userId: string,
	tags: string[]
): Promise<RoutineTemplate[]> {
	const routinesRef = collection(db, 'routines');

	// Get all user's routines
	const allRoutines = await getRoutinesForUser(userId);

	// Filter by tags (client-side since array-contains-any has limitations)
	return allRoutines.filter((routine) => tags.some((tag) => routine.tags.includes(tag)));
}

// ============================================================================
// SESSIONS (DEPRECATED - kept for backward compatibility)
// ============================================================================
// NOTE: Session hierarchy is deprecated in favor of flat RoutineLog structure.
// Sessions are now represented by sessionGroup field in RoutineLogs.

/**
 * @deprecated Use getRecentActivity() or query routineLogs by sessionGroup instead
 * Get all sessions for a user (with pagination)
 */
export async function getSessions(userId: string, limitCount = 20): Promise<Session[]> {
	const sessionsRef = collection(db, 'sessions');
	const q = query(
		sessionsRef,
		where('userId', '==', userId),
		orderBy('date', 'desc'),
		limit(limitCount)
	);

	const snapshot = await getDocs(q);
	const sessions: Session[] = [];

	snapshot.forEach((doc) => {
		sessions.push({ id: doc.id, ...doc.data() } as Session);
	});

	return sessions;
}

/**
 * @deprecated Sessions are now represented by sessionGroup in RoutineLogs
 * Get a single session by ID
 */
export async function getSession(sessionId: string): Promise<Session | null> {
	const docRef = doc(db, 'sessions', sessionId);
	const docSnap = await getDoc(docRef);

	if (!docSnap.exists()) return null;

	return { id: docSnap.id, ...docSnap.data() } as Session;
}

/**
 * @deprecated Create routine logs directly instead
 * Create a new session
 */
export async function createSession(sessionData: SessionFormData): Promise<string> {
	const sessionsRef = collection(db, 'sessions');

	const newSession = {
		...sessionData,
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp()
	};

	const docRef = await addDoc(sessionsRef, newSession);
	return docRef.id;
}

/**
 * @deprecated Update routine logs directly instead
 * Update a session
 */
export async function updateSession(
	sessionId: string,
	updates: Partial<SessionFormData>
): Promise<void> {
	const docRef = doc(db, 'sessions', sessionId);

	await updateDoc(docRef, {
		...updates,
		updatedAt: serverTimestamp()
	});
}

/**
 * @deprecated Delete routine logs directly instead
 * Delete a session (and all subcollections - handle with care!)
 */
export async function deleteSession(sessionId: string): Promise<void> {
	// TODO: Also delete subcollections (routineLogs, dives)
	// This requires recursive deletion or Cloud Function
	const docRef = doc(db, 'sessions', sessionId);
	await deleteDoc(docRef);
}

// ============================================================================
// ROUTINE LOGS (Top-level collection)
// ============================================================================

/**
 * Get all routine logs for a session group
 */
export async function getRoutineLogsBySessionGroup(
	userId: string,
	sessionGroup: string
): Promise<RoutineLog[]> {
	const routineLogsRef = collection(db, 'routineLogs');
	const q = query(
		routineLogsRef,
		where('userId', '==', userId),
		where('sessionGroup', '==', sessionGroup),
		orderBy('date', 'desc')
	);

	const snapshot = await getDocs(q);
	const logs: RoutineLog[] = [];

	snapshot.forEach((doc) => {
		logs.push({ id: doc.id, ...doc.data() } as RoutineLog);
	});

	return logs;
}

/**
 * Get a single routine log by ID
 */
export async function getRoutineLog(routineLogId: string): Promise<RoutineLog | null> {
	const docRef = doc(db, 'routineLogs', routineLogId);
	const docSnap = await getDoc(docRef);

	if (!docSnap.exists()) return null;

	return { id: docSnap.id, ...docSnap.data() } as RoutineLog;
}

/**
 * Create a new routine log
 */
export async function createRoutineLog(logData: RoutineLogFormData): Promise<string> {
	const routineLogsRef = collection(db, 'routineLogs');

	const newLog = {
		...logData,
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp()
	};

	const docRef = await addDoc(routineLogsRef, newLog);
	return docRef.id;
}

/**
 * Update a routine log (e.g., add detailed data from video review)
 */
export async function updateRoutineLog(
	routineLogId: string,
	updates: Partial<RoutineLogFormData>
): Promise<void> {
	const docRef = doc(db, 'routineLogs', routineLogId);

	await updateDoc(docRef, {
		...updates,
		updatedAt: serverTimestamp()
	});
}

/**
 * Delete a routine log
 */
export async function deleteRoutineLog(routineLogId: string): Promise<void> {
	const docRef = doc(db, 'routineLogs', routineLogId);
	await deleteDoc(docRef);
}

// ============================================================================
// INDIVIDUAL DIVES (Subcollection of Sessions)
// ============================================================================

/**
 * Get all dives for a session
 */
export async function getDivesForSession(sessionId: string): Promise<Dive[]> {
	const divesRef = collection(db, 'sessions', sessionId, 'dives');
	const snapshot = await getDocs(divesRef);

	const dives: Dive[] = [];
	snapshot.forEach((doc) => {
		dives.push({ id: doc.id, ...doc.data() } as Dive);
	});

	return dives;
}

/**
 * Create a new individual dive
 */
export async function createDive(sessionId: string, diveData: DiveFormData): Promise<string> {
	const divesRef = collection(db, 'sessions', sessionId, 'dives');

	const newDive = {
		...diveData,
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp()
	};

	const docRef = await addDoc(divesRef, newDive);
	return docRef.id;
}

/**
 * Update a dive
 */
export async function updateDive(
	sessionId: string,
	diveId: string,
	updates: Partial<DiveFormData>
): Promise<void> {
	const docRef = doc(db, 'sessions', sessionId, 'dives', diveId);

	await updateDoc(docRef, {
		...updates,
		updatedAt: serverTimestamp()
	});
}

/**
 * Delete a dive
 */
export async function deleteDive(sessionId: string, diveId: string): Promise<void> {
	const docRef = doc(db, 'sessions', sessionId, 'dives', diveId);
	await deleteDoc(docRef);
}

// ============================================================================
// CONFIG - SUGGESTED TAGS
// ============================================================================

/**
 * Get suggested tags for routine editor
 */
export async function getSuggestedTags(): Promise<SuggestedTags | null> {
	const docRef = doc(db, 'config', 'suggestedTags');
	const docSnap = await getDoc(docRef);

	if (!docSnap.exists()) return null;

	return docSnap.data() as SuggestedTags;
}

/**
 * Update suggested tags (admin only)
 */
export async function updateSuggestedTags(tags: SuggestedTags): Promise<void> {
	const docRef = doc(db, 'config', 'suggestedTags');
	await updateDoc(docRef, tags);
}

// ============================================================================
// ANALYTICS QUERIES
// ============================================================================

/**
 * Get all routine logs for a specific routine
 * Useful for analytics: "How many times have I done this routine?"
 */
export async function getRoutineLogsByRoutine(
	userId: string,
	routineId: string,
	limitCount?: number
): Promise<RoutineLog[]> {
	const routineLogsRef = collection(db, 'routineLogs');

	const constraints: QueryConstraint[] = [
		where('userId', '==', userId),
		where('routineId', '==', routineId),
		orderBy('date', 'desc')
	];

	if (limitCount) {
		constraints.push(limit(limitCount));
	}

	const q = query(routineLogsRef, ...constraints);

	const snapshot = await getDocs(q);
	const logs: RoutineLog[] = [];

	snapshot.forEach((doc) => {
		logs.push({ id: doc.id, ...doc.data() } as RoutineLog);
	});

	return logs;
}

/**
 * Get recent routine logs for a user (for dashboard/feed display)
 */
export async function getRecentActivity(userId: string, limitCount = 20): Promise<RoutineLog[]> {
	const routineLogsRef = collection(db, 'routineLogs');
	const q = query(
		routineLogsRef,
		where('userId', '==', userId),
		orderBy('date', 'desc'),
		limit(limitCount)
	);

	const snapshot = await getDocs(q);
	const logs: RoutineLog[] = [];

	snapshot.forEach((doc) => {
		logs.push({ id: doc.id, ...doc.data() } as RoutineLog);
	});

	return logs;
}
