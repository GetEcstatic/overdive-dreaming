// Session Detail Page - Data Loader
// Fetches routine log and template data for detail view

import { error } from '@sveltejs/kit';
import { getRoutineLog, getRoutine } from '$lib/firestore';
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

	// Fetch the associated routine template
	const routine = await getRoutine(log.routineId);
	if (!routine) {
		throw error(404, 'Routine template not found');
	}

	return {
		log,
		routine
	};
};
