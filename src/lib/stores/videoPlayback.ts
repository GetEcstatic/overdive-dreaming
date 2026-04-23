import { writable } from 'svelte/store';

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
 * Svelte action bound to a `<video>` element. Wires up:
 *   - play/pause/ended → videoPlayback counter (drives bottom-nav visibility)
 *   - `orientationchange` / screen-orientation → when the device rotates to
 *     landscape while the video is actively playing, put the *wrapping
 *     container* (the nearest `[data-fullscreen-root]`) into a
 *     CSS-based pseudo-fullscreen by toggling the
 *     `dive-video-pseudo-fullscreen` class. We intentionally do NOT use
 *     the native Fullscreen API because iOS Safari on iPhone only supports
 *     `webkitEnterFullscreen` on the `<video>` element itself, which
 *     strips any HTML overlay (the HUD). CSS fullscreen keeps the HUD
 *     on every platform.
 */
export function diveVideoBehavior(node: HTMLVideoElement) {
	let playing = false;
	let pseudoFs = false;

	const container = (): HTMLElement | null =>
		(node.closest('[data-fullscreen-root]') as HTMLElement | null) ?? null;

	const onPlay = () => {
		if (!playing) {
			playing = true;
			videoPlayback.begin();
		}
		// If the user started playback while already in landscape, snap
		// straight into pseudo-fullscreen too.
		if (isLandscape()) enterPseudoFullscreen();
	};
	const onPause = () => {
		if (playing) {
			playing = false;
			videoPlayback.end();
		}
		exitPseudoFullscreen();
	};
	const onEnded = onPause;

	function isLandscape() {
		if (typeof window === 'undefined') return false;
		const o = window.screen?.orientation?.type;
		if (o) return o.startsWith('landscape');
		return window.innerWidth > window.innerHeight;
	}

	function enterPseudoFullscreen() {
		if (pseudoFs) return;
		const el = container();
		if (!el) return;
		pseudoFs = true;
		el.classList.add('dive-video-pseudo-fullscreen');
		// Lock page scroll behind the fullscreen overlay.
		document.body.classList.add('dive-video-fs-lock');
	}

	function exitPseudoFullscreen() {
		if (!pseudoFs) return;
		const el = container();
		pseudoFs = false;
		el?.classList.remove('dive-video-pseudo-fullscreen');
		document.body.classList.remove('dive-video-fs-lock');
	}

	const onOrientation = () => {
		if (playing && isLandscape()) {
			enterPseudoFullscreen();
		} else {
			exitPseudoFullscreen();
		}
	};

	node.addEventListener('play', onPlay);
	node.addEventListener('pause', onPause);
	node.addEventListener('ended', onEnded);
	window.addEventListener('orientationchange', onOrientation);
	window.screen?.orientation?.addEventListener?.('change', onOrientation);

	return {
		destroy() {
			node.removeEventListener('play', onPlay);
			node.removeEventListener('pause', onPause);
			node.removeEventListener('ended', onEnded);
			window.removeEventListener('orientationchange', onOrientation);
			window.screen?.orientation?.removeEventListener?.('change', onOrientation);
			exitPseudoFullscreen();
			if (playing) {
				playing = false;
				videoPlayback.end();
			}
		}
	};
}
