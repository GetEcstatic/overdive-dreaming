<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { user, loading } from '$lib/stores/auth';
	import { auth, authPersistenceReady } from '$lib/firebase';
	import { onAuthStateChanged, getRedirectResult } from 'firebase/auth';
	import AuthLoadingSplash from '$lib/components/AuthLoadingSplash.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import { getUserSettings } from '$lib/firestore';
	import { drainUploadQueue, installOnlineDrainer } from '$lib/capture/uploadProcessor';
	import { uploadQueueStatus } from '$lib/capture/uploadStatus';
	import { diveRecording } from '$lib/stores/videoPlayback';
	import {
		derivePublicModeCapabilities,
		readLocalAdvancedOverride,
		type PublicModeCapabilities
	} from '$lib/publicMode/capabilities';

	let { children } = $props();
	let mobileMenuOpen = $state(false);
	let minimumSplashElapsed = $state(false);
	let showStartupSplash = $state(true);
	let capabilities = $state<PublicModeCapabilities>(derivePublicModeCapabilities());
	let isRecording = $derived($diveRecording > 0);
	const showAuthSplash = $derived(showStartupSplash && ($loading || !minimumSplashElapsed));
	const showUploadBanner = $derived(!isRecording && ($uploadQueueStatus.active || $uploadQueueStatus.pendingCount > 0));
	const uploadPercent = $derived(Math.round($uploadQueueStatus.fraction * 100));

	function formatUploadBytes(bytes: number): string {
		if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function isActive(pathname: string, href: string): boolean {
		return href === '/dashboard' || href === '/dives' || href === '/analytics' || href === '/profile'
			? pathname === href
			: pathname.startsWith(href);
	}

	$effect(() => {
		const currentUser = $user;
		if (!currentUser) {
			capabilities = derivePublicModeCapabilities();
			return;
		}

		let cancelled = false;
		const localAdvancedOverride = typeof window !== 'undefined'
			? readLocalAdvancedOverride(window.localStorage)
			: false;
		capabilities = derivePublicModeCapabilities({
			uid: currentUser.uid,
			email: currentUser.email,
			localAdvancedOverride
		});

		getUserSettings(currentUser.uid)
			.then((settings) => {
				if (cancelled) return;
				capabilities = derivePublicModeCapabilities({
					uid: currentUser.uid,
					email: currentUser.email,
					settings,
					localAdvancedOverride
				});
			})
			.catch((err) => {
				if (!cancelled) console.warn('[app-layout] failed to load public mode settings', err);
			});

		return () => {
			cancelled = true;
		};
	});

	onMount(() => {
		const startupSplashKey = 'overdive:startup-splash-shown';
		const hasShownStartupSplash = window.sessionStorage.getItem(startupSplashKey) === 'true';
		showStartupSplash = !hasShownStartupSplash;
		if (hasShownStartupSplash) {
			minimumSplashElapsed = true;
		} else {
			window.sessionStorage.setItem(startupSplashKey, 'true');
		}

		const minimumSplashTimer = window.setTimeout(() => {
			minimumSplashElapsed = true;
		}, 4000);

		// On iOS standalone PWAs, Google sign-in uses signInWithRedirect.
		// When the OAuth callback lands directly on a protected route
		// (e.g. /dashboard), Firebase needs a tick to consume the redirect
		// result and rehydrate persistence before onAuthStateChanged emits
		// the *real* user. Without awaiting both, our listener fires with
		// `null` first and bounces the user straight back to the login
		// screen — the symptom users reported on iOS home-screen shortcuts.
		const redirectReady = authPersistenceReady
			.then(() => getRedirectResult(auth))
			.catch((err) => {
				console.error('Redirect sign-in error (app layout):', err);
				return null;
			});

		const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
			if (!firebaseUser) {
				// Wait for any in-flight redirect result before declaring
				// the user unauthenticated.
				await redirectReady;
				if (auth.currentUser) {
					user.set(auth.currentUser);
					loading.set(false);
					return;
				}
			}

			user.set(firebaseUser);
			loading.set(false);

			if (!firebaseUser) {
				// Use window.location to ensure we stay on the same origin
				if (typeof window !== 'undefined') {
					window.location.href = window.location.origin;
				} else {
					goto('/');
				}
			}
		});

		// Drain any pending video uploads left over from a previous session
		// (network drop, app close mid-upload, etc.) and listen for browser/PWA
		// resume signals so we retry without user intervention.
		const cleanupOnlineDrainer = installOnlineDrainer();
		drainUploadQueue().catch((err) =>
			console.warn('[app-layout] boot upload drain failed', err)
		);

		return () => {
			window.clearTimeout(minimumSplashTimer);
			cleanupOnlineDrainer();
			unsubscribe();
		};
	});
</script>

{#if showAuthSplash}
	<AuthLoadingSplash />
{:else if $user}
	<div class="app-wrapper">
		<!-- Top Navigation Menu -->
		<nav class="top-nav" class:recording-hidden={isRecording} aria-hidden={isRecording}>
			<div class="nav-content">
				<h1 class="nav-title">Overdive</h1>

				<!-- Hamburger Button (Mobile) -->
				<button
					class="hamburger"
					onclick={() => mobileMenuOpen = !mobileMenuOpen}
					aria-label="Toggle menu"
				>
					<span class="hamburger-line"></span>
					<span class="hamburger-line"></span>
					<span class="hamburger-line"></span>
				</button>

				<!-- Navigation Links -->
				<div class="nav-links" class:open={mobileMenuOpen}>
					<a href="/dashboard" class="nav-link" class:active={isActive($page.url.pathname, '/dashboard')} onclick={() => mobileMenuOpen = false}>Feed</a>
					<a href="/dives" class="nav-link" class:active={isActive($page.url.pathname, '/dives')} onclick={() => mobileMenuOpen = false}>Log</a>
					{#if capabilities.canUseAdvancedMode}
						<a href="/routines" class="nav-link" class:active={isActive($page.url.pathname, '/routines')} onclick={() => mobileMenuOpen = false}>Routines</a>
					{/if}
					<a href="/analytics" class="nav-link" class:active={isActive($page.url.pathname, '/analytics') || $page.url.pathname.startsWith('/routines/')} onclick={() => mobileMenuOpen = false}>{capabilities.isPublicMode ? 'Progress' : 'Analytics'}</a>
					<a href="/profile" class="nav-link" class:active={isActive($page.url.pathname, '/profile')} onclick={() => mobileMenuOpen = false}>Profile</a>
				</div>
			</div>
		</nav>

		<div class="gradient-divider" class:recording-hidden={isRecording}></div>

		{#if showUploadBanner}
			<section class="upload-banner" class:active={$uploadQueueStatus.active} aria-live="polite">
				<div class="upload-banner-copy">
					<strong>
						{$uploadQueueStatus.active ? 'Uploading dive video' : 'Dive video waiting to upload'}
					</strong>
					<span>
						{#if $uploadQueueStatus.active}
							Keep Overdive open and the screen awake until this finishes.
						{:else}
							{$uploadQueueStatus.pendingCount} pending · {formatUploadBytes($uploadQueueStatus.pendingBytes)}. Upload resumes when this app is open and online.
						{/if}
					</span>
				</div>
				{#if $uploadQueueStatus.active && $uploadQueueStatus.bytesTotal > 0}
					<div class="upload-banner-progress" aria-label={`Upload ${uploadPercent}% complete`}>
						<div style={`width: ${uploadPercent}%`}></div>
					</div>
				{/if}
				{#if $uploadQueueStatus.lastError}
					<span class="upload-banner-error">Last error: {$uploadQueueStatus.lastError}</span>
				{/if}
			</section>
		{/if}

		<div class="content-pad">
			{@render children()}
		</div>
	</div>
	<BottomNav canUseAdvancedMode={capabilities.canUseAdvancedMode} />
{/if}

<style>
	.app-wrapper {
		max-width: 896px;
		margin: 0 auto;
		padding: 1rem;
		/* Respect iOS notch / Dynamic Island and Android cutouts in standalone PWA */
		padding-top: max(1rem, env(safe-area-inset-top));
		padding-left: max(1rem, env(safe-area-inset-left));
		padding-right: max(1rem, env(safe-area-inset-right));
	}

	/* Reserve space at the bottom so content doesn't sit under the fixed
	   BottomNav (64 px) plus the iOS home indicator / Android gesture bar. */
	.content-pad {
		padding-bottom: calc(4rem + env(safe-area-inset-bottom, 0px));
	}

	/* Tablet */
	@media (min-width: 768px) {
		.app-wrapper {
			padding: 1.5rem 3rem;
		}
	}

	/* Desktop */
	@media (min-width: 1024px) {
		.app-wrapper {
			padding: 1.5rem 4rem;
		}
	}

	/* Large Desktop */
	@media (min-width: 1280px) {
		.app-wrapper {
			padding: 1.5rem 6rem;
		}
	}

	/* Top Navigation */
	.top-nav {
		position: relative;
		z-index: 200;
		background: rgba(10, 15, 20, 0.85);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid var(--color-border, rgba(100, 116, 139, 0.15));
		border-radius: 12px;
		padding: 1rem 1.5rem;
		margin-bottom: 2rem;
	}

	.upload-banner {
		border: 1px solid rgba(20, 184, 166, 0.26);
		background: rgba(15, 23, 42, 0.9);
		border-radius: 8px;
		padding: 0.8rem 0.9rem;
		margin-bottom: 1rem;
		box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
	}

	.upload-banner.active {
		border-color: rgba(20, 184, 166, 0.46);
	}

	.upload-banner-copy {
		display: grid;
		gap: 0.25rem;
	}

	.upload-banner-copy strong {
		font-size: 0.9rem;
		color: var(--color-text);
	}

	.upload-banner-copy span,
	.upload-banner-error {
		font-size: 0.78rem;
		line-height: 1.35;
		color: var(--color-text-muted);
	}

	.upload-banner-progress {
		height: 4px;
		overflow: hidden;
		border-radius: 999px;
		background: rgba(148, 163, 184, 0.16);
		margin-top: 0.75rem;
	}

	.upload-banner-progress div {
		height: 100%;
		border-radius: inherit;
		background: linear-gradient(90deg, var(--color-primary), var(--color-secondary));
		transition: width 160ms ease;
	}

	.upload-banner-error {
		display: block;
		margin-top: 0.55rem;
		color: #fca5a5;
	}

	.top-nav.recording-hidden,
	.gradient-divider.recording-hidden {
		display: none;
	}

	.nav-content {
		display: flex;
		justify-content: space-between;
		align-items: center;
		position: relative;
	}

	.nav-title {
		font-size: 1.5rem;
		font-weight: 700;
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	/* Hamburger Menu Button */
	.hamburger {
		display: none;
		flex-direction: column;
		gap: 4px;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.5rem;
		z-index: 10;
	}

	.hamburger-line {
		width: 24px;
		height: 2px;
		background: var(--color-primary);
		border-radius: 2px;
		transition: all 0.3s ease;
	}

	/* Navigation Links */
	.nav-links {
		display: flex;
		gap: 0.5rem;
		z-index: 201;
	}

	.nav-link {
		padding: 0.5rem 1rem;
		border-radius: 6px;
		color: var(--color-text-muted);
		text-decoration: none;
		font-size: 0.875rem;
		font-weight: 500;
		transition: all 0.2s ease;
	}

	.nav-link:hover {
		color: var(--color-text);
		background: rgba(148, 163, 184, 0.1);
	}

	.nav-link.active {
		color: var(--color-primary);
		background: rgba(20, 184, 166, 0.1);
	}

	/* Gradient Divider */
	.gradient-divider {
		height: 2px;
		background: linear-gradient(
			to right,
			transparent,
			var(--color-primary) 20%,
			var(--color-secondary) 50%,
			var(--color-primary) 80%,
			transparent
		);
		margin: 2rem 0;
		border-radius: 2px;
	}

	/* Mobile Navigation (≤768px) */
	@media (max-width: 768px) {
		.hamburger {
			display: flex;
		}

		.nav-links {
			position: absolute;
			top: 100%;
			right: 0;
			margin-top: 1rem;
			flex-direction: column;
			background: rgba(10, 15, 20, 0.95);
			backdrop-filter: blur(12px);
			-webkit-backdrop-filter: blur(12px);
			border: 1px solid var(--color-border, rgba(100, 116, 139, 0.15));
			border-radius: 8px;
			padding: 0.5rem;
			gap: 0.25rem;
			min-width: 200px;
			box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
			opacity: 0;
			pointer-events: none;
			transform: translateY(-10px);
			transition: all 0.3s ease;
		}

		.nav-links.open {
			opacity: 1;
			pointer-events: all;
			transform: translateY(0);
		}

		.nav-link {
			width: 100%;
			text-align: left;
			padding: 0.75rem 1rem;
		}
	}
</style>
