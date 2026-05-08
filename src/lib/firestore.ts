// Overdive Dreaming - Firestore Helper Functions
// CRUD operations for all collections

import {
	collection,
	doc,
	getDoc,
	getDocs,
	getDocsFromServer,
	getCountFromServer,
	addDoc,
	updateDoc,
	deleteDoc,
	setDoc,
	query,
	where,
	orderBy,
	limit,
	endAt,
	startAfter,
	startAt,
	Timestamp,
	serverTimestamp,
	deleteField,
	increment,
	arrayUnion,
	arrayRemove,
	type DocumentData,
	type QueryConstraint,
	type QueryDocumentSnapshot
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
	Discipline,
	Season,
	SeasonFormData,
	UserSettings,
	PublicUserProfile,
	Comment,
	GroupRoutineInvite,
	GroupRoutineInviteFormData
} from '$lib/types';
import {
	normalizeRoutineLog,
	normalizeRoutineTemplate,
	prepareLogForWrite,
	prepareRoutineForWrite
} from '$lib/utils/migration';
import { buildRoutineLayerReadModel } from '$lib/routineLayers/readModel';
import type { RoutineLayerReadModel } from '$lib/routineLayers/readModel';
import {
	buildLayerRoutineTemplateContract,
	projectLayersToLegacyRoutineTemplateFields
} from '$lib/routineLayers/contract';
import type { RoutineAuthoringLayer } from '$lib/routineLayers/model';

// ============================================================================
// ROUTINE TEMPLATES
// ============================================================================

/**
 * Get all routines visible to the current user
 * Includes: system defaults + user's custom routines
 * Applies normalization to infer activityType for backward compatibility
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
		const routine = { id: doc.id, ...doc.data() } as RoutineTemplate;
		routines.push(normalizeRoutineTemplate(routine));
	});

	userSnapshot.forEach((doc) => {
		const routine = { id: doc.id, ...doc.data() } as RoutineTemplate;
		routines.push(normalizeRoutineTemplate(routine));
	});

	return routines;
}

/**
 * Get a single routine by ID
 * Applies normalization to infer activityType for backward compatibility
 */
export async function getRoutine(routineId: string): Promise<RoutineTemplate | null> {
	const docRef = doc(db, 'routines', routineId);
	const docSnap = await getDoc(docRef);

	if (!docSnap.exists()) return null;

	const routine = { id: docSnap.id, ...docSnap.data() } as RoutineTemplate;
	return normalizeRoutineTemplate(routine);
}

/**
 * Get a routine by ID, or return a placeholder if the routine was deleted
 * Use this when displaying sessions to ensure orphaned sessions are still viewable
 */
export async function getRoutineOrPlaceholder(routineId: string): Promise<RoutineTemplate> {
	const routine = await getRoutine(routineId);
	if (routine) return routine;

	// Return a placeholder routine for orphaned sessions
	return createPlaceholderRoutine(routineId);
}

/**
 * Read-only layer-model view of a routine template.
 * Keeps Firestore writes on the existing RoutineTemplate shape while deployed
 * screens start consuming either stored v2 layers or legacy projections.
 */
export async function getRoutineLayerReadModel(routineId: string): Promise<RoutineLayerReadModel | null> {
	const routine = await getRoutine(routineId);
	if (!routine) return null;

	return buildRoutineLayerReadModel(routine);
}

/**
 * Attach a v2 layer contract to an existing routine without changing the
 * existing legacy routine fields. Admin-only callers should gate access in UI.
 */
export async function writeRoutineLayerTemplateContract(
	routineId: string,
	layers: RoutineAuthoringLayer[]
): Promise<void> {
	const docRef = doc(db, 'routines', routineId);
	const contract = buildLayerRoutineTemplateContract(layers);
	const legacyFields = projectLayersToLegacyRoutineTemplateFields(layers);
	const legacyUpdates: Record<string, unknown> = {
		...legacyFields,
		trainingEnvironment: legacyFields.trainingEnvironment ?? deleteField(),
		restBetweenReps: legacyFields.restBetweenReps ?? deleteField(),
		repDistance: legacyFields.repDistance ?? deleteField(),
		numberOfReps: legacyFields.numberOfReps ?? deleteField(),
		table: legacyFields.table ?? deleteField()
	};

	await updateDoc(docRef, {
		...legacyUpdates,
		...contract,
		updatedAt: serverTimestamp()
	});
}

/**
 * Create a placeholder routine for sessions whose original routine was deleted
 */
export function createPlaceholderRoutine(routineId: string): RoutineTemplate {
	return {
		id: routineId,
		name: 'Deleted Routine',
		description: 'This routine has been deleted. The session data is preserved.',
		disciplines: ['STA'], // Default to STA as most generic
		tags: [],
		trackingConfig: {
			trackRPE: false,
			trackJoyScale: false
		} as RoutineTemplate['trackingConfig'],
		displayConfig: {
			heroMetric: 'repsCompleted',
			heroMetricLabel: 'Reps',
			secondaryMetric: 'repsCompleted',
			secondaryMetricLabel: 'Reps'
		},
		createdBy: 'system',
		isPublic: false,
		createdAt: Timestamp.now(),
		updatedAt: Timestamp.now()
	};
}

/**
 * Create a new custom routine
 */
export async function createRoutine(
	userId: string,
	routineData: RoutineTemplateFormData
): Promise<string> {
	const routinesRef = collection(db, 'routines');

	// Remove undefined values - Firestore doesn't accept undefined
	const cleanedData = Object.fromEntries(
		Object.entries(routineData).filter(([_, v]) => v !== undefined)
	);

	const newRoutine = {
		...cleanedData,
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

	// Remove undefined values deeply - Firestore doesn't accept undefined
	const removeUndefined = (obj: Record<string, any>): Record<string, any> => {
		return Object.fromEntries(
			Object.entries(obj)
				.filter(([_, v]) => v !== undefined)
				.map(([k, v]) => [k, v !== null && typeof v === 'object' && !Array.isArray(v) ? removeUndefined(v) : v])
		);
	};
	const cleanedUpdates = removeUndefined(updates as Record<string, any>);

	await updateDoc(docRef, {
		...cleanedUpdates,
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
 * Count sessions (routine logs) associated with a specific routine
 * Useful for warning users before deleting a routine
 */
export async function getSessionCountForRoutine(routineId: string): Promise<number> {
	const routineLogsRef = collection(db, 'routineLogs');
	const q = query(routineLogsRef, where('routineId', '==', routineId));
	const snapshot = await getCountFromServer(q);
	return snapshot.data().count;
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
 * Applies normalization to populate new field names and calculated metrics
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
		const log = { id: doc.id, ...doc.data() } as RoutineLog;
		logs.push(normalizeRoutineLog(log));
	});

	return logs;
}

/**
 * Get a single routine log by ID
 * Applies normalization to populate new field names and calculated metrics
 */
export async function getRoutineLog(routineLogId: string): Promise<RoutineLog | null> {
	const docRef = doc(db, 'routineLogs', routineLogId);
	const docSnap = await getDoc(docRef);

	if (!docSnap.exists()) return null;

	const log = { id: docSnap.id, ...docSnap.data() } as RoutineLog;
	return normalizeRoutineLog(log);
}

/**
 * Recursively remove `undefined` values from an object/array tree.
 * Firestore rejects writes containing `undefined`. We keep `null` (explicit
 * clear) and primitives untouched, and drop undefined keys at every depth.
 *
 * IMPORTANT: only descends into plain objects and arrays. Class instances
 * (Firestore Timestamp, GeoPoint, DocumentReference, FieldValue, Date, etc.)
 * are passed through untouched — otherwise we would strip their prototype
 * and Firestore would write them as plain maps, breaking `.toDate()` on read.
 */
function stripUndefinedDeep<T>(value: T): T {
	if (typeof value === 'number' && !Number.isFinite(value)) {
		return undefined as T;
	}
	if (Array.isArray(value)) {
		return value
			.filter((v) => v !== undefined && !(typeof v === 'number' && !Number.isFinite(v)))
			.map((v) => stripUndefinedDeep(v)) as unknown as T;
	}
	if (
		value !== null &&
		typeof value === 'object' &&
		(Object.getPrototypeOf(value) === Object.prototype ||
			Object.getPrototypeOf(value) === null)
	) {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			if (v === undefined) continue;
			const cleaned = stripUndefinedDeep(v);
			if (cleaned === undefined) continue;
			out[k] = cleaned;
		}
		return out as unknown as T;
	}
	return value;
}

/**
 * Create a new routine log
 * Applies prepareLogForWrite to ensure both old and new field names are stored
 */
export async function createRoutineLog(logData: RoutineLogFormData): Promise<string> {
	const routineLogsRef = collection(db, 'routineLogs');

	// Prepare log data with both old and new field names
	const preparedData = prepareLogForWrite(logData);

	// Firestore rejects undefined values anywhere in the document — strip recursively
	const cleanedData = stripUndefinedDeep(preparedData);

	const newLog = {
		...cleanedData,
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp()
	};

	const docRef = await addDoc(routineLogsRef, newLog);
	return docRef.id;
}

/**
 * Update a routine log (e.g., add detailed data from video review)
 * Applies prepareLogForWrite to ensure both old and new field names are stored
 */
export async function updateRoutineLog(
	routineLogId: string,
	updates: Partial<RoutineLogFormData>
): Promise<void> {
	const docRef = doc(db, 'routineLogs', routineLogId);

	// Prepare updates with both old and new field names
	const preparedUpdates = prepareLogForWrite(updates);

	// Remove undefined values recursively - Firestore doesn't accept undefined at any depth
	const cleanedUpdates = stripUndefinedDeep(preparedUpdates) as Record<string, unknown>;

	await updateDoc(docRef, {
		...cleanedUpdates,
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
// GROUP ROUTINE INVITES
// ============================================================================

export async function createGroupRoutineInvites(
	invites: GroupRoutineInviteFormData[]
): Promise<string[]> {
	if (invites.length === 0) return [];

	const invitesRef = collection(db, 'groupRoutineInvites');
	const ids: string[] = [];

	for (const invite of invites) {
		const cleanedInvite = stripUndefinedDeep(invite);
		const docRef = await addDoc(invitesRef, {
			...cleanedInvite,
			createdAt: serverTimestamp(),
			updatedAt: serverTimestamp()
		});
		ids.push(docRef.id);
	}

	return ids;
}

export async function getGroupRoutineInvite(
	inviteId: string
): Promise<GroupRoutineInvite | null> {
	const docRef = doc(db, 'groupRoutineInvites', inviteId);
	const docSnap = await getDoc(docRef);
	if (!docSnap.exists()) return null;
	return { id: docSnap.id, ...docSnap.data() } as GroupRoutineInvite;
}

export async function listPendingGroupRoutineInvites(
	recipientUserId: string
): Promise<GroupRoutineInvite[]> {
	const invitesRef = collection(db, 'groupRoutineInvites');
	const q = query(
		invitesRef,
		where('recipientUserId', '==', recipientUserId),
		where('status', '==', 'pending'),
		limit(20)
	);

	const snapshot = await getDocs(q);
	return snapshot.docs
		.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }) as GroupRoutineInvite)
		.sort((a, b) => b.date.toDate().getTime() - a.date.toDate().getTime());
}

export async function updateGroupRoutineInvite(
	inviteId: string,
	updates: Pick<GroupRoutineInvite, 'status'> & {
		acceptedRoutineLogId?: string;
	}
): Promise<void> {
	const docRef = doc(db, 'groupRoutineInvites', inviteId);
	await updateDoc(docRef, {
		...stripUndefinedDeep(updates),
		updatedAt: serverTimestamp()
	});
}

/**
 * Delete all routine logs for a session group (permanent deletion)
 * Do not use this for user-facing single routine deletion. sessionGroup is a coarse
 * analytics bucket and may contain multiple independent routine logs.
 * Also deletes associated photos from storage
 * @param userId - User ID owning the logs
 * @param sessionGroup - Session group ID (e.g., "2026-01-01-morning")
 * @returns Array of photoUrls that were deleted (for cleanup verification)
 */
export async function deleteSessionByGroup(
	userId: string,
	sessionGroup: string
): Promise<{ deletedCount: number; photoUrls: string[]; disciplines: Discipline[] }> {
	// Get all routine logs for this session group
	const logs = await getRoutineLogsBySessionGroup(userId, sessionGroup);

	if (logs.length === 0) {
		return { deletedCount: 0, photoUrls: [], disciplines: [] };
	}

	const photoUrls: string[] = [];
	const disciplines = new Set<Discipline>();

	// Delete each log and collect photo URLs for cleanup
	for (const log of logs) {
		// Collect photo URL if exists
		if (log.photoUrl) {
			photoUrls.push(log.photoUrl);
		}

		if (log.disciplineUsed) {
			disciplines.add(log.disciplineUsed);
		}

		// Delete the routine log document
		await deleteRoutineLog(log.id);
	}

	return {
		deletedCount: logs.length,
		photoUrls,
		disciplines: Array.from(disciplines)
	};
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
	await setDoc(docRef, tags, { merge: true });
}

// ============================================================================
// USER SETTINGS
// ============================================================================

export async function getUserSettings(userId: string): Promise<UserSettings | undefined> {
	const userRef = doc(db, 'users', userId);
	const userSnap = await getDoc(userRef);

	if (!userSnap.exists()) return undefined;

	const data = userSnap.data();
	return data.settings as UserSettings | undefined;
}

export async function updateUserSettings(
	userId: string,
	settings: UserSettings
): Promise<void> {
	const userRef = doc(db, 'users', userId);
	await setDoc(
		userRef,
		{
			settings,
			updatedAt: new Date()
		},
		{ merge: true }
	);
}

// ============================================================================
// PUBLIC USER PROFILES (Community feed)
// ============================================================================

export async function upsertPublicUserProfile(
	userId: string,
	profile: Pick<PublicUserProfile, 'displayName' | 'photoURL'>
): Promise<void> {
	const docRef = doc(db, 'usersPublic', userId);
	await setDoc(
		docRef,
		{
			userId,
			displayName: profile.displayName,
			photoURL: profile.photoURL ?? null,
			updatedAt: serverTimestamp()
		},
		{ merge: true }
	);
}

export async function getPublicUserProfile(
	userId: string
): Promise<PublicUserProfile | null> {
	const docRef = doc(db, 'usersPublic', userId);
	const docSnap = await getDoc(docRef);
	if (!docSnap.exists()) return null;
	return docSnap.data() as PublicUserProfile;
}

export async function searchPublicUsersByDisplayName(
	searchTerm: string,
	maxResults = 8
): Promise<PublicUserProfile[]> {
	const trimmed = searchTerm.trim();
	if (!trimmed) return [];

	const usersRef = collection(db, 'usersPublic');
	const normalized = trimmed.toLocaleLowerCase();
	const searchQuery = query(
		usersRef,
		orderBy('displayName'),
		startAt(trimmed),
		endAt(`${trimmed}\uf8ff`),
		limit(maxResults)
	);

	const snapshot = await getDocs(searchQuery);
	const exactPrefixMatches = snapshot.docs.map(
		(docSnap) => docSnap.data() as PublicUserProfile
	);

	if (exactPrefixMatches.length >= maxResults) return exactPrefixMatches;

	const fallbackQuery = query(usersRef, orderBy('displayName'), limit(100));
	const fallbackSnapshot = await getDocs(fallbackQuery);
	const byId = new Map<string, PublicUserProfile>();

	for (const profile of exactPrefixMatches) {
		byId.set(profile.userId, profile);
	}

	for (const docSnap of fallbackSnapshot.docs) {
		const profile = docSnap.data() as PublicUserProfile;
		const name = profile.displayName.toLocaleLowerCase();
		if (name.startsWith(normalized) || name.includes(normalized)) {
			byId.set(profile.userId, profile);
		}
		if (byId.size >= maxResults) break;
	}

	return Array.from(byId.values()).slice(0, maxResults);
}

export async function getPublicUserProfilesByIds(
	userIds: string[]
): Promise<PublicUserProfile[]> {
	const uniqueIds = Array.from(new Set(userIds));
	if (uniqueIds.length === 0) return [];

	const usersRef = collection(db, 'usersPublic');
	const results: PublicUserProfile[] = [];

	for (let i = 0; i < uniqueIds.length; i += 10) {
		const batch = uniqueIds.slice(i, i + 10);
		const batchQuery = query(usersRef, where('userId', 'in', batch));
		const snapshot = await getDocs(batchQuery);
		snapshot.forEach((docSnap) => {
			results.push(docSnap.data() as PublicUserProfile);
		});
	}

	return results;
}

// ============================================================================
// SEASONS
// ============================================================================

export async function getSeasonsForUser(userId: string): Promise<Season[]> {
	const seasonsRef = collection(db, 'seasons');
	const q = query(seasonsRef, where('userId', '==', userId));

	const snapshot = await getDocs(q);
	const seasons: Season[] = [];

	snapshot.forEach((doc) => {
		seasons.push({ id: doc.id, ...doc.data() } as Season);
	});

	return seasons.sort(
		(a, b) => b.startDate.toDate().getTime() - a.startDate.toDate().getTime()
	);
}

export async function createSeason(seasonData: SeasonFormData): Promise<string> {
	const seasonsRef = collection(db, 'seasons');
	const newSeason = {
		...seasonData,
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp()
	};

	const docRef = await addDoc(seasonsRef, newSeason);
	return docRef.id;
}

export async function updateSeason(
	seasonId: string,
	updates: Partial<SeasonFormData> & { endDate?: SeasonFormData['endDate'] | null }
): Promise<void> {
	const seasonRef = doc(db, 'seasons', seasonId);
	const payload: Record<string, unknown> = {
		...updates,
		updatedAt: serverTimestamp()
	};

	if (updates.endDate === null) {
		payload.endDate = deleteField();
	}

	await updateDoc(seasonRef, payload);
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
	limitCount?: number,
	sinceDate?: Date
): Promise<RoutineLog[]> {
	const routineLogsRef = collection(db, 'routineLogs');

	const constraints: QueryConstraint[] = [
		where('userId', '==', userId),
		where('routineId', '==', routineId),
		orderBy('date', 'desc')
	];

	if (sinceDate) {
		constraints.push(where('date', '>=', Timestamp.fromDate(sinceDate)));
	}

	if (limitCount) {
		constraints.push(limit(limitCount));
	}

	const q = query(routineLogsRef, ...constraints);

	const snapshot = await getDocs(q);
	const logs: RoutineLog[] = [];

	snapshot.forEach((doc) => {
		const log = { id: doc.id, ...doc.data() } as RoutineLog;
		logs.push(normalizeRoutineLog(log));
	});

	return logs;
}

/**
 * Get recent routine logs for a user (for dashboard/feed display)
 * Applies normalization to populate new field names and calculated metrics
 */
export async function getRecentActivity(userId: string, limitCount = 20): Promise<RoutineLog[]> {
	const routineLogsRef = collection(db, 'routineLogs');
	const q = query(
		routineLogsRef,
		where('userId', '==', userId),
		orderBy('date', 'desc'),
		limit(limitCount)
	);

	let snapshot;
	try {
		snapshot = await getDocsFromServer(q);
	} catch (error) {
		console.warn('Falling back to cached routine logs:', error);
		snapshot = await getDocs(q);
	}
	const logs: RoutineLog[] = [];

	snapshot.forEach((doc) => {
		const log = { id: doc.id, ...doc.data() } as RoutineLog;
		logs.push(normalizeRoutineLog(log));
	});

	return logs;
}

/**
 * Get count of routine logs within a time period (e.g., last 30 days)
 * Uses efficient aggregation query to count without downloading documents
 */
export async function getLogCountInDays(userId: string, days: number): Promise<number> {
	const routineLogsRef = collection(db, 'routineLogs');
	const cutoffDate = Timestamp.fromMillis(Date.now() - days * 24 * 60 * 60 * 1000);

	const q = query(
		routineLogsRef,
		where('userId', '==', userId),
		where('date', '>=', cutoffDate)
	);

	try {
		const countSnapshot = await getCountFromServer(q);
		return countSnapshot.data().count;
	} catch (error) {
		console.error('Error getting log count:', error);
		// Fallback: manually count by fetching docs
		try {
			const snapshot = await getDocs(q);
			return snapshot.size;
		} catch (fallbackError) {
			console.error('Fallback count also failed:', fallbackError);
			return 0;
		}
	}
}

/**
 * Get recent routine logs with pagination support (for infinite scroll)
 * Returns logs and the last document for cursor-based pagination
 */
export async function getRecentActivityPaginated(
	userId: string,
	limitCount = 20,
	lastDoc?: QueryDocumentSnapshot<DocumentData>
): Promise<{
	logs: RoutineLog[];
	lastDoc: QueryDocumentSnapshot<DocumentData> | null;
	hasMore: boolean;
}> {
	const routineLogsRef = collection(db, 'routineLogs');

	const constraints: QueryConstraint[] = [
		where('userId', '==', userId),
		orderBy('date', 'desc'),
		limit(limitCount)
	];

	// Add cursor if provided (for pagination)
	if (lastDoc) {
		constraints.push(startAfter(lastDoc));
	}

	const q = query(routineLogsRef, ...constraints);
	let snapshot;
	try {
		snapshot = await getDocsFromServer(q);
	} catch (error) {
		console.warn('Falling back to cached routine logs:', error);
		snapshot = await getDocs(q);
	}

	const logs: RoutineLog[] = [];
	snapshot.forEach((doc) => {
		const log = { id: doc.id, ...doc.data() } as RoutineLog;
		logs.push(normalizeRoutineLog(log));
	});

	// Get the last document for next pagination
	const lastVisible = snapshot.docs[snapshot.docs.length - 1] || null;

	// Check if there are more results by seeing if we got a full page
	const hasMore = snapshot.docs.length === limitCount;

	return {
		logs,
		lastDoc: lastVisible,
		hasMore
	};
}

/**
 * Get recent public routine logs with pagination support (community feed)
 */
export async function getPublicActivityPaginated(
	limitCount = 20,
	lastDoc?: QueryDocumentSnapshot<DocumentData>
): Promise<{
	logs: RoutineLog[];
	lastDoc: QueryDocumentSnapshot<DocumentData> | null;
	hasMore: boolean;
}> {
	const routineLogsRef = collection(db, 'routineLogs');

	const constraints: QueryConstraint[] = [
		where('visibility', '==', 'public'),
		orderBy('date', 'desc'),
		limit(limitCount)
	];

	if (lastDoc) {
		constraints.push(startAfter(lastDoc));
	}

	const q = query(routineLogsRef, ...constraints);
	let snapshot;
	try {
		snapshot = await getDocsFromServer(q);
	} catch (error) {
		console.warn('Falling back to cached public routine logs:', error);
		snapshot = await getDocs(q);
	}

	const logs: RoutineLog[] = [];
	snapshot.forEach((doc) => {
		const log = { id: doc.id, ...doc.data() } as RoutineLog;
		logs.push(normalizeRoutineLog(log));
	});

	const lastVisible = snapshot.docs[snapshot.docs.length - 1] || null;
	const hasMore = snapshot.docs.length === limitCount;

	return {
		logs,
		lastDoc: lastVisible,
		hasMore
	};
}

// ============================================================================
// COMMENTS
// ============================================================================

/**
 * Get comments for a routine log, ordered oldest-first
 */
export async function getCommentsForLog(
	routineLogId: string,
	limitCount = 50
): Promise<Comment[]> {
	const commentsRef = collection(db, 'comments');
	// Query without orderBy to avoid composite index requirement; sort client-side
	const q = query(
		commentsRef,
		where('routineLogId', '==', routineLogId),
		limit(limitCount)
	);

	const snapshot = await getDocs(q);
	const comments = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Comment));
	return comments.sort((a, b) => {
		const aTime = a.createdAt?.toMillis?.() ?? 0;
		const bTime = b.createdAt?.toMillis?.() ?? 0;
		return aTime - bTime;
	});
}

/**
 * Add a comment to a routine log.
 * Increments commentCount on the parent log document.
 */
export async function addComment(
	routineLogId: string,
	userId: string,
	authorDisplayName: string,
	authorPhotoURL: string | undefined,
	text: string,
	parentCommentId?: string,
	replyToDisplayName?: string
): Promise<Comment> {
	const commentsRef = collection(db, 'comments');
	const newComment: Record<string, any> = {
		routineLogId,
		userId,
		authorDisplayName,
		authorPhotoURL: authorPhotoURL ?? null,
		text: text.trim(),
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp()
	};
	if (parentCommentId) {
		newComment.parentCommentId = parentCommentId;
	}
	if (replyToDisplayName) {
		newComment.replyToDisplayName = replyToDisplayName;
	}

	const docRef = await addDoc(commentsRef, newComment);

	// Increment commentCount on the parent routine log
	const logRef = doc(db, 'routineLogs', routineLogId);
	await updateDoc(logRef, { commentCount: increment(1) });

	return {
		id: docRef.id,
		routineLogId,
		userId,
		authorDisplayName,
		authorPhotoURL,
		text: text.trim(),
		parentCommentId,
		replyToDisplayName,
		createdAt: Timestamp.now(),
		updatedAt: Timestamp.now()
	};
}

/**
 * Delete a comment (caller must verify ownership before calling).
 * Decrements commentCount on the parent log document.
 */
export async function deleteComment(commentId: string, routineLogId: string): Promise<void> {
	await deleteDoc(doc(db, 'comments', commentId));

	// Decrement commentCount (floor at 0)
	const logRef = doc(db, 'routineLogs', routineLogId);
	await updateDoc(logRef, { commentCount: increment(-1) });
}

/**
 * Toggle a "flow" (like) on a comment.
 * Returns true if the user now likes it, false if unliked.
 */
export async function toggleCommentLike(commentId: string, userId: string, currentlyLiked: boolean): Promise<boolean> {
	const commentRef = doc(db, 'comments', commentId);
	if (currentlyLiked) {
		await updateDoc(commentRef, { likedBy: arrayRemove(userId) });
		return false;
	} else {
		await updateDoc(commentRef, { likedBy: arrayUnion(userId) });
		return true;
	}
}
