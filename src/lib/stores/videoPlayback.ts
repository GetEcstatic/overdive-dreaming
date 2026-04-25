import { writable } from 'svelte/store';
import type { Action } from 'svelte/action';

/**
 * Tracks how many `<video>` elements are currently playing. When non-zero,
 * the bottom nav hides itself so the video isn't obscured on mobile. We use
 * a counter (not a boolean) so overlapping videos — e.g. playing a dashboard
 * card video, then scrolling and tapping another — don't accidentally show
 * the nav bar while one is still playing.
 */
function createVideoPlaybackStore() {
	const count = writable(0);

	function begin() {
		count.update((n) => n + 1);
	}

	function end() {
		count.update((n) => Math.max(0, n - 1));
	}

	return {
		subscribe: count.subscribe,
		begin,
		end
	};
}

export const videoPlayback = createVideoPlaybackStore();

/**
 * Tracks whether a dive recording is currently in progress. Hides the bottom
 * nav (like `videoPlayback` does) so it doesn't obscure the full-screen
 * recorder UI. Counter-based so nested/overlapping recorders won't race.
 * Begin when the recorder UI mounts; end when it unmounts (covers both the
 * recording-ended → review transition and cancel → setup transition).
 */
export const diveRecording = createVideoPlaybackStore();

// ---------------------------------------------------------------------------
// Pure fullscreen-decision helper (unit-tested).
// ---------------------------------------------------------------------------

export interface FullscreenDecisionInput {
	/** Is the viewport currently in landscape orientation? */
	isLandscape: boolean;
	/** Is the player element at least partially visible in the viewport? */
	isVisible: boolean;
	/** Has the user explicitly exited fullscreen in the current landscape session? */
	userEscaped: boolean;
	/** Opt-out for compact/feed-card variants that shouldn't take over the screen. */
	allowAutoFullscreen: boolean;
}

/**
 * Pure decision: should the player currently be in (pseudo-)fullscreen?
 *
 * Fullscreen is driven by *orientation* (not play state), so users can pause,
 * seek, or even start in landscape and stay fullscreen. Hidden players and
 * feed-card (compact) players are excluded so multiple embedded videos on the
 * same page don't fight for the screen.
 */
export function shouldEnterFullscreen(input: FullscreenDecisionInput): boolean {
	if (!input.allowAutoFullscreen) return false;
	if (!input.isLandscape) return false;
	if (!input.isVisible) return false;
	if (input.userEscaped) return false;
	return true;
}

// ---------------------------------------------------------------------------
// Fullscreen CSS class names (kept in one place for the CSS authors to grep).
// ---------------------------------------------------------------------------

const CLASS_PSEUDO_FS = 'dive-video-pseudo-fullscreen';
const CLASS_BODY_LOCK = 'dive-video-fs-lock';

/** Fired on `[data-fullscreen-root]` whenever the pseudo-fullscreen state changes. */
export const DIVE_FS_EVENT = 'divefullscreenchange';

// ---------------------------------------------------------------------------
// Svelte action attached to the <video> element.
// ---------------------------------------------------------------------------

export interface DiveVideoBehaviorOptions {
	/** Feed-card / compact players skip auto-fullscreen on rotation. */
	allowAutoFullscreen?: boolean;
}

/**
 * Svelte action bound to a `<video>` element. Wires up:
 *
 *   - play/pause/ended → `videoPlayback` counter (drives bottom-nav visibility).
 *   - Orientation + visibility → toggles pseudo-fullscreen on the wrapping
 *     `[data-fullscreen-root]` container by adding/removing the
 *     `dive-video-pseudo-fullscreen` class. We deliberately do NOT use the
 *     native Fullscreen API because iOS Safari on iPhone only supports
 *     `webkitEnterFullscreen` on the `<video>` element itself, which strips
 *     any HTML overlay (the HUD).
 *   - Visibility is tracked with IntersectionObserver so multiple embedded
 *     videos on the same page don't all fight for the screen.
 *   - Dispatches `divefullscreenchange` on the container so the component
 *     can swap custom controls / styles.
 *
 * The action also exposes `exitFullscreen()` via the container element so the
 * component's exit button can force-exit even while still in landscape
 * (setting a "user escaped" flag cleared on next portrait rotation).
 */
export const diveVideoBehavior: Action<HTMLVideoElement, DiveVideoBehaviorOptions | undefined> = (
	node: HTMLVideoElement,
	options: DiveVideoBehaviorOptions = {}
) => {
	let allowAutoFullscreen = options.allowAutoFullscreen ?? true;
	let playing = false;
	let pseudoFs = false;
	let isVisible = true; // assume visible until IO says otherwise
	let userEscaped = false;
	let savedScrollY = 0;

	// When we enter pseudo-fullscreen we portal the container to document.body
	// so that ancestor CSS properties which create a "containing block" for
	// fixed-positioned descendants (backdrop-filter, filter, transform,
	// perspective, contain, will-change) cannot trap the fullscreen element
	// inside a feed-card-sized box. Saved here so `exitPseudoFullscreen` can
	// restore the node to its original position in the DOM.
	let originalParent: Node | null = null;
	let originalNextSibling: Node | null = null;

	const container = (): HTMLElement | null =>
		(node.closest('[data-fullscreen-root]') as HTMLElement | null) ?? null;

	// --- lifecycle: play/pause counter (unchanged from original) ---------
	const onPlay = () => {
		if (!playing) {
			playing = true;
			videoPlayback.begin();
		}
	};
	const onPause = () => {
		if (playing) {
			playing = false;
			videoPlayback.end();
		}
	};
	const onEnded = onPause;

	// --- orientation detection -------------------------------------------
	/**
	 * Auto-fullscreen on rotation is a *mobile* affordance: the user
	 * physically rotates the device to "go big". On desktop, a wide
	 * window is the default state, not a deliberate signal — so we
	 * gate landscape detection on the absence of a fine pointer + the
	 * presence of coarse-pointer / no-hover input. This stops the
	 * dashboard feed from auto-fullscreening the first card on a
	 * regular desktop browser.
	 */
	function isMobileLikeDevice(): boolean {
		if (typeof window === 'undefined') return false;
		if (typeof window.matchMedia !== 'function') return false;
		const coarse = window.matchMedia('(pointer: coarse)').matches;
		const noHover = window.matchMedia('(hover: none)').matches;
		return coarse || noHover;
	}

	function detectLandscape(): boolean {
		if (typeof window === 'undefined') return false;
		if (!isMobileLikeDevice()) return false;
		const o = window.screen?.orientation?.type;
		if (o) return o.startsWith('landscape');
		return window.innerWidth > window.innerHeight;
	}

	// --- apply/unapply pseudo-fullscreen ---------------------------------
	function applyDecision() {
		const wanted = shouldEnterFullscreen({
			isLandscape: detectLandscape(),
			isVisible,
			userEscaped,
			allowAutoFullscreen
		});
		if (wanted && !pseudoFs) enterPseudoFullscreen();
		else if (!wanted && pseudoFs) exitPseudoFullscreen();
	}

	function enterPseudoFullscreen() {
		if (pseudoFs) return;
		const el = container();
		if (!el) return;
		pseudoFs = true;
		savedScrollY = window.scrollY;

		// Portal the container to <body> so ancestor CSS (backdrop-filter on
		// .session-card, transform on hover, etc.) can't create a containing
		// block that traps our `position: fixed` rule inside the feed card.
		// Save the original DOM location so we can restore on exit.
		originalParent = el.parentNode;
		originalNextSibling = el.nextSibling;
		if (originalParent && el.parentNode !== document.body) {
			document.body.appendChild(el);
		}

		el.classList.add(CLASS_PSEUDO_FS);
		document.body.classList.add(CLASS_BODY_LOCK);
		// Try Android orientation lock (ignored on iOS).
		const ori = window.screen?.orientation as
			| (ScreenOrientation & { lock?: (o: string) => Promise<void> })
			| undefined;
		ori?.lock?.('landscape').catch(() => {
			/* noop — iOS doesn't support lock, desktop may reject */
		});
		el.dispatchEvent(new CustomEvent(DIVE_FS_EVENT, { detail: { fullscreen: true } }));
	}

	function exitPseudoFullscreen() {
		if (!pseudoFs) return;
		const el = container();
		pseudoFs = false;
		el?.classList.remove(CLASS_PSEUDO_FS);
		document.body.classList.remove(CLASS_BODY_LOCK);

		// Restore the container to its original DOM location. Guarded so we
		// don't reparent into a node that no longer exists (e.g. the card
		// was unmounted while fullscreen — rare but possible on navigation).
		if (el && originalParent && originalParent.isConnected) {
			if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
				originalParent.insertBefore(el, originalNextSibling);
			} else {
				originalParent.appendChild(el);
			}
		}
		originalParent = null;
		originalNextSibling = null;

		// Restore scroll position (the lock uses overflow:hidden which can
		// reset it on some browsers).
		if (typeof window !== 'undefined') {
			window.scrollTo(0, savedScrollY);
		}
		const ori = window.screen?.orientation as
			| (ScreenOrientation & { unlock?: () => void })
			| undefined;
		try {
			ori?.unlock?.();
		} catch {
			/* noop */
		}
		el?.dispatchEvent(new CustomEvent(DIVE_FS_EVENT, { detail: { fullscreen: false } }));
	}

	// --- user-escape: component-callable exit ----------------------------
	// Store a handle on the container so the component can trigger an exit
	// without needing a direct ref to this action's closure.
	type ContainerWithExit = HTMLElement & {
		__diveExitFullscreen?: () => void;
	};
	const el0 = container() as ContainerWithExit | null;
	if (el0) {
		el0.__diveExitFullscreen = () => {
			userEscaped = true;
			applyDecision();
		};
	}

	// --- reactive triggers -----------------------------------------------
	const onOrientation = () => {
		// Rotating back to portrait clears the escape flag so the next
		// landscape rotation re-enters fullscreen.
		if (!detectLandscape()) userEscaped = false;
		applyDecision();
	};

	// matchMedia is more reliable than orientationchange across browsers.
	const mql =
		typeof window !== 'undefined' && typeof window.matchMedia === 'function'
			? window.matchMedia('(orientation: landscape)')
			: null;

	const onMqlChange = () => onOrientation();

	// IntersectionObserver: only go fullscreen when this player is on-screen.
	let io: IntersectionObserver | null = null;
	if (typeof IntersectionObserver !== 'undefined') {
		io = new IntersectionObserver(
			(entries) => {
				const e = entries[0];
				if (!e) return;
				isVisible = e.isIntersecting && e.intersectionRatio >= 0.5;
				applyDecision();
			},
			{ threshold: [0, 0.5, 1] }
		);
		const el = container();
		if (el) io.observe(el);
	}

	// --- wire events ------------------------------------------------------
	node.addEventListener('play', onPlay);
	node.addEventListener('pause', onPause);
	node.addEventListener('ended', onEnded);
	window.addEventListener('orientationchange', onOrientation);
	window.addEventListener('resize', onOrientation);
	window.screen?.orientation?.addEventListener?.('change', onOrientation);
	mql?.addEventListener?.('change', onMqlChange);

	// Initial check (the player may mount while already in landscape).
	applyDecision();

	return {
		update(newOptions: DiveVideoBehaviorOptions | undefined) {
			allowAutoFullscreen = newOptions?.allowAutoFullscreen ?? true;
			applyDecision();
		},
		destroy() {
			node.removeEventListener('play', onPlay);
			node.removeEventListener('pause', onPause);
			node.removeEventListener('ended', onEnded);
			window.removeEventListener('orientationchange', onOrientation);
			window.removeEventListener('resize', onOrientation);
			window.screen?.orientation?.removeEventListener?.('change', onOrientation);
			mql?.removeEventListener?.('change', onMqlChange);
			io?.disconnect();
			const el = container() as ContainerWithExit | null;
			if (el && el.__diveExitFullscreen) delete el.__diveExitFullscreen;
			exitPseudoFullscreen();
			if (playing) {
				playing = false;
				videoPlayback.end();
			}
		}
	};
};

/**
 * Imperatively request that a container leaves pseudo-fullscreen even if the
 * device is still in landscape. Used by the in-player "Exit" button. Clears
 * itself on next rotation back to portrait.
 */
export function exitDiveFullscreen(container: HTMLElement | null | undefined): void {
	if (!container) return;
	const withExit = container as HTMLElement & { __diveExitFullscreen?: () => void };
	withExit.__diveExitFullscreen?.();
}
