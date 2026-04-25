/**
 * Tiny helpers for modal-style components: body scroll-lock and a
 * minimal focus trap. The scroll-lock counts mounts so multiple sheets
 * (or a sheet plus another modal) don't trample each other when one
 * closes.
 *
 * Side-effects are quarantined to this module so component code can
 * stay declarative.
 */

let lockCount = 0;
let savedOverflow = '';
let savedTouchAction = '';
let savedScrollY = 0;

/**
 * Lock body scroll. Returns an unlock function — call it once per
 * `lockBodyScroll` call. Safe to call when not in a browser
 * environment (no-op).
 */
export function lockBodyScroll(): () => void {
	if (typeof document === 'undefined') return () => {};
	if (lockCount === 0) {
		savedOverflow = document.body.style.overflow;
		savedTouchAction = document.body.style.touchAction;
		savedScrollY = window.scrollY;
		// iOS needs position:fixed to fully prevent scroll-chaining; in
		// practice overflow:hidden + overscroll-behavior:none on the modal
		// is enough for our use-case and avoids the "jump to top" bug.
		document.body.style.overflow = 'hidden';
		document.body.style.touchAction = 'none';
	}
	lockCount += 1;
	let released = false;
	return () => {
		if (released) return;
		released = true;
		lockCount = Math.max(0, lockCount - 1);
		if (lockCount === 0) {
			document.body.style.overflow = savedOverflow;
			document.body.style.touchAction = savedTouchAction;
		}
	};
}

const FOCUSABLE_SELECTOR = [
	'a[href]',
	'button:not([disabled])',
	'input:not([disabled])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex]:not([tabindex="-1"])'
].join(',');

function focusableWithin(root: HTMLElement): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
		(el) => !el.hasAttribute('aria-hidden') && el.offsetParent !== null
	);
}

/**
 * Trap Tab/Shift+Tab inside `root`. Returns a release function that
 * restores focus to `restoreTo` (defaults to the previously focused
 * element).
 */
export function trapFocus(root: HTMLElement, opts: { initial?: HTMLElement; restoreTo?: HTMLElement } = {}): () => void {
	if (typeof document === 'undefined') return () => {};
	const previouslyFocused =
		opts.restoreTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);

	const initial = opts.initial ?? focusableWithin(root)[0] ?? root;
	// Ensure root can hold focus if no focusables exist.
	if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');
	(initial as HTMLElement).focus({ preventScroll: true });

	function onKey(e: KeyboardEvent) {
		if (e.key !== 'Tab') return;
		const f = focusableWithin(root);
		if (f.length === 0) {
			e.preventDefault();
			root.focus();
			return;
		}
		const first = f[0];
		const last = f[f.length - 1];
		const active = document.activeElement as HTMLElement | null;
		if (e.shiftKey) {
			if (active === first || !root.contains(active)) {
				e.preventDefault();
				last.focus();
			}
		} else {
			if (active === last) {
				e.preventDefault();
				first.focus();
			}
		}
	}

	document.addEventListener('keydown', onKey, true);
	return () => {
		document.removeEventListener('keydown', onKey, true);
		if (previouslyFocused) previouslyFocused.focus({ preventScroll: true });
	};
}

/** Capability check: should we use motion at all? */
export function prefersReducedMotion(): boolean {
	if (typeof window === 'undefined') return false;
	return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Optional Android haptic feedback. iOS Safari ignores this — no-op,
 * no error. Call sites guard with feature-detect via the function
 * itself returning false.
 */
export function vibrate(ms: number): boolean {
	if (typeof navigator === 'undefined') return false;
	const nav = navigator as Navigator & {
		vibrate?: (pattern: number | number[]) => boolean;
	};
	if (typeof nav.vibrate !== 'function') return false;
	try {
		return nav.vibrate(ms) === true;
	} catch {
		return false;
	}
}
