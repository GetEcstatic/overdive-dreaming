// Global Analytics Page - Loader
// Handles back-compat redirect for old /analytics?routine=... URLs,
// which now live at /routines/[id]/analytics.

import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

// Chart libraries require browser APIs
export const ssr = false;

export const load: PageLoad = async ({ url }) => {
	const routineId = url.searchParams.get('routine');
	if (routineId) {
		const discipline = url.searchParams.get('discipline');
		const qs = discipline ? `?discipline=${encodeURIComponent(discipline)}` : '';
		throw redirect(307, `/routines/${routineId}/analytics${qs}`);
	}
	return {};
};
