// Session Detail Page - Data Loader
// Fetches routine log and template data for detail view

import { error } from '@sveltejs/kit';
import { getRoutineLog, getRoutineOrPlaceholder, getUserSettings } from '$lib/firestore';
import { auth } from '$lib/firebase';
import type { PageLoad } from './$types';

// Disable SSR - chart libraries (chartjs-plugin-zoom, hammerjs) require browser APIs
export const ssr = false;

export const load: PageLoad = async ({ params }) => {
	const { id } = params;

	// Fetch the routine log
	const log = await getRoutineLog(id);
	if (!log) {
		throw error(404, 'Session not found');
	}

	// Fetch the associated routine template (uses placeholder if routine was deleted)
	const routine = await getRoutineOrPlaceholder(log.routineId);

	// Fetch user settings only if this is the current user's session
	// (User settings are private and can only be read by the owner)
	const currentUserId = auth.currentUser?.uid;
	const isOwnSession = currentUserId && log.userId === currentUserId;
	const userSettings = isOwnSession ? await getUserSettings(log.userId) : undefined;

	return {
		log,
		routine,
		showMenstrualCycleTracking: userSettings?.showMenstrualCycleTracking ?? false
	};
};