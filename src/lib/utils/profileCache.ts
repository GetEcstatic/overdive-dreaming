import { getSeasonsForUser, getUserSettings } from '$lib/firestore';
import type { Season, UserSettings } from '$lib/types';

export type ProfileCacheEntry = {
	settings?: UserSettings;
	seasons?: Season[];
	fetchedAt?: number;
};

const profileCache = new Map<string, ProfileCacheEntry>();

export function getProfileCache(userId: string): ProfileCacheEntry | undefined {
	return profileCache.get(userId);
}

export function updateProfileCache(
	userId: string,
	updates: Partial<ProfileCacheEntry>
): ProfileCacheEntry {
	const current = profileCache.get(userId) ?? {};
	const next = {
		...current,
		...updates,
		fetchedAt: Date.now()
	};
	profileCache.set(userId, next);
	return next;
}

export async function refreshProfileCache(userId: string): Promise<ProfileCacheEntry> {
	const [settings, seasons] = await Promise.all([
		getUserSettings(userId),
		getSeasonsForUser(userId)
	]);
	const next: ProfileCacheEntry = {
		settings,
		seasons,
		fetchedAt: Date.now()
	};
	profileCache.set(userId, next);
	return next;
}
