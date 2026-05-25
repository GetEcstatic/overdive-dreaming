import { describe, expect, it } from 'vitest';
import {
	ADVANCED_PUBLIC_MODE_OVERRIDE_KEY,
	derivePublicModeCapabilities,
	readLocalAdvancedOverride
} from './capabilities';

describe('derivePublicModeCapabilities', () => {
	it('defaults normal users to public mode', () => {
		expect(derivePublicModeCapabilities({ email: 'athlete@example.com' })).toMatchObject({
			access: 'public',
			isPublicMode: true,
			canUseAdvancedMode: false,
			canUseAdminMode: false
		});
	});

	it('allows settings to grant advanced mode', () => {
		expect(derivePublicModeCapabilities({ settings: { publicModeAccess: 'advanced' } })).toMatchObject({
			access: 'advanced',
			isPublicMode: false,
			canUseAdvancedMode: true,
			canUseAdminMode: false
		});
	});

	it('allows settings to grant admin mode', () => {
		expect(derivePublicModeCapabilities({ settings: { publicModeAccess: 'admin' } })).toMatchObject({
			access: 'admin',
			isPublicMode: false,
			canUseAdvancedMode: true,
			canUseAdminMode: true
		});
	});

	it('treats known owner emails as admin when no setting is present', () => {
		expect(derivePublicModeCapabilities({ email: 'THOMASWAY@gmail.com' }).access).toBe('admin');
	});

	it('uses local advanced override for development and manual beta testing', () => {
		expect(derivePublicModeCapabilities({ localAdvancedOverride: true })).toMatchObject({
			access: 'advanced',
			canUseAdvancedMode: true
		});
	});

	it('lets persisted settings override local advanced override', () => {
		expect(derivePublicModeCapabilities({
			settings: { publicModeAccess: 'public' },
			localAdvancedOverride: true
		}).access).toBe('public');
	});
});

describe('readLocalAdvancedOverride', () => {
	it('reads the advanced-mode storage flag', () => {
		expect(readLocalAdvancedOverride({
			getItem: (key: string) => key === ADVANCED_PUBLIC_MODE_OVERRIDE_KEY ? 'true' : null
		})).toBe(true);
	});

	it('returns false when storage is unavailable', () => {
		expect(readLocalAdvancedOverride(undefined)).toBe(false);
	});
});