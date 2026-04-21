/**
 * Wake Lock helper - keeps the screen awake during recording.
 *
 * Supported on iOS 16.4+ Safari and modern Chrome/Android. Falls back silently
 * when not available (we don't want a recording to fail just because wake lock
 * isn't granted; we instead show a UI banner asking the user not to lock the
 * phone).
 *
 * See docs/Dynamic video feature.md §9.
 */

type WakeLockSentinel = {
	released: boolean;
	release(): Promise<void>;
	addEventListener(type: 'release', listener: () => void): void;
};

type NavigatorWithWakeLock = Navigator & {
	wakeLock?: {
		request(type: 'screen'): Promise<WakeLockSentinel>;
	};
};

export interface WakeLockHandle {
	release(): Promise<void>;
	readonly isActive: boolean;
}

const NOOP_HANDLE: WakeLockHandle = {
	async release() {
		/* no-op */
	},
	isActive: false
};

export function isWakeLockSupported(): boolean {
	if (typeof navigator === 'undefined') return false;
	return 'wakeLock' in navigator;
}

/**
 * Request a screen wake lock. Returns a handle even when the platform doesn't
 * support wake lock — callers should still show their own "don't lock" banner
 * defensively.
 *
 * Reacquires the lock automatically when the page becomes visible again,
 * which is the platform-recommended pattern.
 */
export async function requestWakeLock(): Promise<WakeLockHandle> {
	if (typeof navigator === 'undefined') return NOOP_HANDLE;
	const nav = navigator as NavigatorWithWakeLock;
	if (!nav.wakeLock) return NOOP_HANDLE;

	let sentinel: WakeLockSentinel | null = null;
	let released = false;

	const acquire = async () => {
		try {
			sentinel = await nav.wakeLock!.request('screen');
			sentinel.addEventListener('release', () => {
				// Platform released (tab hidden etc.); we re-acquire on visibility.
			});
		} catch (err) {
			// eslint-disable-next-line no-console
			console.warn('[wakeLock] request failed', err);
			sentinel = null;
		}
	};

	await acquire();

	const onVisibilityChange = async () => {
		if (released) return;
		if (document.visibilityState === 'visible' && (!sentinel || sentinel.released)) {
			await acquire();
		}
	};

	document.addEventListener('visibilitychange', onVisibilityChange);

	return {
		get isActive() {
			return !!sentinel && !sentinel.released && !released;
		},
		async release() {
			released = true;
			document.removeEventListener('visibilitychange', onVisibilityChange);
			if (sentinel && !sentinel.released) {
				try {
					await sentinel.release();
				} catch (err) {
					// eslint-disable-next-line no-console
					console.warn('[wakeLock] release failed', err);
				}
			}
			sentinel = null;
		}
	};
}
