/**
 * Detect whether the current page is running as an installed PWA
 * (Add-to-Home-Screen on iOS, "Install app" on Android/Chrome) rather
 * than inside a regular browser tab.
 *
 * In standalone mode, popup-based OAuth flows (`signInWithPopup`) are
 * unreliable because the OS opens the popup in a separate browser
 * context and the PWA never observes the auth state change. Use
 * `signInWithRedirect` + `getRedirectResult` instead.
 */
export function isStandalonePWA(): boolean {
	if (typeof window === 'undefined') return false;
	const mql = window.matchMedia?.('(display-mode: standalone)');
	if (mql?.matches) return true;
	// iOS Safari exposes a non-standard `navigator.standalone`
	const iosStandalone = (window.navigator as unknown as { standalone?: boolean })
		.standalone;
	return iosStandalone === true;
}
