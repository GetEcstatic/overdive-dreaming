// Per-Routine Analytics Page - Data Loader
// Fetches the routine template and current user's logs for that routine.

import { getRoutineLogsByRoutine, getRoutineOrPlaceholder } from '$lib/firestore';
import { auth } from '$lib/firebase';
import type { PageLoad } from './$types';

// Disable SSR - chart libraries require browser APIs
export const ssr = false;

export const load: PageLoad = async ({ params, url }) => {
	const { id } = params;

	// Use placeholder variant so a deleted routine still renders gracefully.
	const routine = await getRoutineOrPlaceholder(id);

	const currentUserId = auth.currentUser?.uid;
	const logs = currentUserId ? await getRoutineLogsByRoutine(currentUserId, id) : [];

	const discipline = url.searchParams.get('discipline') ?? undefined;

	return {
		routine,
		logs,
		initialDiscipline: discipline
	};
};
