// Admin Utilities
// Defines admin users who can edit system routines

const ADMIN_USER_IDS = [
	'GRm9WVvOjCMpX7zqD3ZktaiSQzm2' // Tom Way
];

/**
 * Check if a user ID belongs to an admin
 * Admins can edit system routines and access admin features
 */
export function isAdmin(userId: string | undefined): boolean {
	if (!userId) return false;
	return ADMIN_USER_IDS.includes(userId);
}

/**
 * Check if a user can edit a specific routine
 * Users can edit their own routines, admins can edit system routines
 */
export function canEditRoutine(userId: string | undefined, routineCreatedBy: string): boolean {
	if (!userId) return false;

	// Users can always edit their own routines
	if (routineCreatedBy === userId) return true;

	// Admins can edit system routines
	if (routineCreatedBy === 'system' && isAdmin(userId)) return true;

	return false;
}
