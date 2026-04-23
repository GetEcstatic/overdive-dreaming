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
 *   - `orientationchange` / screen-orientation → request fullscreen when the
 *     device rotates to landscape while the video is actively playing.
 *     Falls back to iOS Safari's `webkitEnterFullscreen` on the video element
 *     since standard Fullscreen API isn't fully supported there.
 */
export function diveVideoBehavior(node: HTMLVideoElement) {
	let playing = false;

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

	const isLandscape = () => {
		if (typeof window === 'undefined') return false;
		const o = window.screen?.orientation?.type;
		if (o) return o.startsWith('landscape');
		return window.innerWidth > window.innerHeight;
	};

	const enterFullscreen = () => {
		const anyNode = node as HTMLVideoElement & {
			webkitEnterFullscreen?: () => void;
		};
		if (document.fullscreenElement) return;
		// Prefer fullscreening the wrapping container (marked with
		// `data-fullscreen-root`) so any HUD overlay DOM siblings of the
		// <video> remain visible. Only fall back to the <video> element
		// itself when no such container exists or the browser rejects the
		// request — typically iOS Safari on iPhone, which only exposes
		// `webkitEnterFullscreen` on <video> and will strip the HUD.
		const container =
			(node.closest('[data-fullscreen-root]') as HTMLElement | null) ?? null;
		const target: HTMLElement = container ?? node;
		if (typeof target.requestFullscreen === 'function') {
			target.requestFullscreen().catch(() => {
				anyNode.webkitEnterFullscreen?.();
			});
		} else {
			anyNode.webkitEnterFullscreen?.();
		}
	};

	const onOrientation = () => {
		if (!playing) return;
		if (isLandscape()) enterFullscreen();
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
			if (playing) {
				playing = false;
				videoPlayback.end();
			}
		}
	};
}
