<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { user, loading } from '$lib/stores/auth';
	import { auth } from '$lib/firebase';
	import { onAuthStateChanged } from 'firebase/auth';
	import BottomNav from '$lib/components/BottomNav.svelte';

	let mobileMenuOpen = $state(false);

	onMount(() => {
		const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
			user.set(firebaseUser);
			loading.set(false);

			if (!firebaseUser) {
				goto('/');
			}
		});

		return unsubscribe;
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
				<h1 class="nav-title">Overdive [Proto]</h1>

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
					<a href="/analytics" class="nav-link" class:active={$page.url.pathname === '/analytics'} onclick={() => mobileMenuOpen = false}>Analytics</a>
					<a href="/dives" class="nav-link" class:active={$page.url.pathname === '/dives'} onclick={() => mobileMenuOpen = false}>Log Dive</a>
					<a href="/profile" class="nav-link" class:active={$page.url.pathname === '/profile'} onclick={() => mobileMenuOpen = false}>Profile</a>
				</div>
			</div>
		</nav>

		<div class="gradient-divider"></div>

		<div class="pb-16">
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
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.1);
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
			background: var(--color-bg-card);
			border: 1px solid rgba(148, 163, 184, 0.15);
			border-radius: 8px;
			padding: 0.5rem;
			gap: 0.25rem;
			min-width: 200px;
			box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
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
