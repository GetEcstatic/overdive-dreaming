import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import type { RoutineLog, RoutineTemplate } from '$lib/types';

export type LogWithRoutine = {
	log: RoutineLog;
	routine: RoutineTemplate;
};

export type DashboardCacheEntry = {
	personalSessions: LogWithRoutine[];
	communitySessions: LogWithRoutine[];
	personalLastDoc: QueryDocumentSnapshot<DocumentData> | null;
	communityLastDoc: QueryDocumentSnapshot<DocumentData> | null;
	personalHasMore: boolean;
	communityHasMore: boolean;
	thisWeekCount: number;
	last30DaysCount: number;
	fetchedAt: number;
};

const dashboardCache = new Map<string, DashboardCacheEntry>();

export function getDashboardCache(userId: string): DashboardCacheEntry | undefined {
	return dashboardCache.get(userId);
}

export function updateDashboardCache(
	userId: string,
	updates: Partial<DashboardCacheEntry>
): DashboardCacheEntry {
	const current = dashboardCache.get(userId) ?? {
		personalSessions: [],
		communitySessions: [],
		personalLastDoc: null,
		communityLastDoc: null,
		personalHasMore: true,
		communityHasMore: true,
		thisWeekCount: 0,
		last30DaysCount: 0,
		fetchedAt: 0
	};

	const next: DashboardCacheEntry = {
		...current,
		...updates,
		fetchedAt: Date.now()
	};

	dashboardCache.set(userId, next);
	return next;
}

export function clearDashboardCache(userId: string): void {
	dashboardCache.delete(userId);
}
