import type { UserSettings } from '$lib/types';

export const ADVANCED_PUBLIC_MODE_OVERRIDE_KEY = 'overdive:advanced-mode-enabled';

export type PublicModeAccess = NonNullable<UserSettings['publicModeAccess']>;

export type PublicModeCapabilityInput = {
	uid?: string | null;
	email?: string | null;
	settings?: Pick<UserSettings, 'publicModeAccess'>;
	localAdvancedOverride?: boolean;
};

export type PublicModeCapabilities = {
	access: PublicModeAccess;
	isPublicMode: boolean;
	canUseAdvancedMode: boolean;
	canUseAdminMode: boolean;
};

const ADMIN_EMAILS = new Set([
	'thomasway@gmail.com',
	'tom@overdive.app'
]);

export function derivePublicModeCapabilities(input: PublicModeCapabilityInput = {}): PublicModeCapabilities {
	const settingsAccess = input.settings?.publicModeAccess;
	const email = input.email?.trim().toLowerCase();
	const isAdminEmail = email !== undefined && ADMIN_EMAILS.has(email);
	const access: PublicModeAccess = settingsAccess
		?? (isAdminEmail ? 'admin' : input.localAdvancedOverride ? 'advanced' : 'public');

	return {
		access,
		isPublicMode: access === 'public',
		canUseAdvancedMode: access === 'advanced' || access === 'admin',
		canUseAdminMode: access === 'admin'
	};
}

export function readLocalAdvancedOverride(storage: Pick<Storage, 'getItem'> | undefined): boolean {
	return storage?.getItem(ADVANCED_PUBLIC_MODE_OVERRIDE_KEY) === 'true';
}