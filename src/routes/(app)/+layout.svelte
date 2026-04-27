<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { user, loading } from '$lib/stores/auth';
	import { auth, authPersistenceReady } from '$lib/firebase';
	import { onAuthStateChanged, getRedirectResult } from 'firebase/auth';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import { drainUploadQueue, installOnlineDrainer } from '$lib/capture/uploadProcessor';

	let mobileMenuOpen = $state(false);

	onMount(() => {
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
		// (network drop, app close mid-upload, etc.) and listen for the
		// browser coming back online so we retry without user intervention.
		const cleanupOnlineDrainer = installOnlineDrainer();
		drainUploadQueue().catch((err) =>
			console.warn('[app-layout] boot upload drain failed', err)
		);

		return () => {
			cleanupOnlineDrainer();
			unsubscribe();
		};
	});
</script>

{#if $loading}
	<div class="flex items-center justify-center min-h-screen">
		<div class="text-2xl text-[var(--color-primary)]">Loading...</div>
	</div>
{:else if $user}
	<div class="app-wrapper">
		<!-- Top Navigation Menu -->
		<nav class="top-nav">
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
					<a href="/dashboard" class="nav-link" class:active={$page.url.pathname === '/dashboard'} onclick={() => mobileMenuOpen = false}>Feed</a>
					<a href="/dives" class="nav-link" class:active={$page.url.pathname === '/dives'} onclick={() => mobileMenuOpen = false}>Log Dive</a>
					<a href="/routines" class="nav-link" class:active={$page.url.pathname.startsWith('/routines')} onclick={() => mobileMenuOpen = false}>Routines</a>
					<a href="/analytics" class="nav-link" class:active={$page.url.pathname === '/analytics'} onclick={() => mobileMenuOpen = false}>Analytics</a>
					<a href="/profile" class="nav-link" class:active={$page.url.pathname === '/profile'} onclick={() => mobileMenuOpen = false}>Profile</a>
				</div>
			</div>
		</nav>

		<div class="gradient-divider"></div>

		<div class="content-pad">
			<slot />
		</div>
	</div>
	<BottomNav />
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
		background: rgba(10, 15, 20, 0.85);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid var(--color-border, rgba(100, 116, 139, 0.15));
		border-radius: 12px;
		padding: 1rem 1.5rem;
		margin-bottom: 2rem;
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
