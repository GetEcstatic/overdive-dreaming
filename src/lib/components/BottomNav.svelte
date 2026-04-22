<script lang="ts">
	import { page } from '$app/stores';
	import { user } from '$lib/stores/auth';
	import { onMount } from 'svelte';
	import { Home, Plus, List, TrendingUp, Video } from 'lucide-svelte';

	let visible = $state(true);
	let lastScrollY = $state(0);
	let scrollTimeout: ReturnType<typeof setTimeout>;

	onMount(() => {
		const handleScroll = () => {
			const currentScrollY = window.scrollY;

			// Clear existing timeout
			clearTimeout(scrollTimeout);

			// Hide nav when scrolling down, show when scrolling up
			if (currentScrollY > lastScrollY && currentScrollY > 100) {
				visible = false;
			} else {
				visible = true;
			}

			// Always show nav when near top
			if (currentScrollY < 50) {
				visible = true;
			}

			// Debounce: show nav after user stops scrolling
			scrollTimeout = setTimeout(() => {
				visible = true;
			}, 1000);

			lastScrollY = currentScrollY;
		};

		window.addEventListener('scroll', handleScroll, { passive: true });

		return () => {
			window.removeEventListener('scroll', handleScroll);
			clearTimeout(scrollTimeout);
		};
	});
</script>

<nav
	class="bottom-nav"
	class:visible
>
	<div class="nav-container">
		<!-- Feed -->
		<a
			href="/dashboard"
			class="nav-item"
			class:active={$page.url.pathname === '/dashboard'}
		>
			<Home size={24} strokeWidth={2} />
		</a>

		<!-- Log Dive -->
		<a
			href="/dives"
			class="nav-item"
			class:active={$page.url.pathname === '/dives'}
		>
			<Plus size={28} strokeWidth={2} />
		</a>

		<!-- Record dive -->
		<a
			href="/record"
			class="nav-item"
			class:active={$page.url.pathname.startsWith('/record') || $page.url.pathname.startsWith('/dive/record')}
		>
			<Video size={24} strokeWidth={2} />
		</a>

		<!-- Routines -->
		<a
			href="/routines"
			class="nav-item"
			class:active={$page.url.pathname.startsWith('/routines')}
		>
			<List size={24} strokeWidth={2} />
		</a>

		<!-- Analytics -->
		<a
			href="/analytics"
			class="nav-item"
			class:active={$page.url.pathname === '/analytics'}
		>
			<TrendingUp size={24} strokeWidth={2} />
		</a>

		<!-- Profile -->
		<a
			href="/profile"
			class="nav-item"
			class:active={$page.url.pathname === '/profile'}
		>
			{#if $user?.photoURL}
				<img
					src={$user.photoURL}
					alt="Profile"
					class="profile-photo"
				/>
			{:else}
				<div class="profile-placeholder">
					{$user?.displayName?.charAt(0) || 'U'}
				</div>
			{/if}
		</a>
	</div>
</nav>

<style>
	.bottom-nav {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		background: rgba(10, 15, 20, 0.9);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border-top: 1px solid var(--color-border, rgba(100, 116, 139, 0.15));
		transform: translateY(0);
		transition: transform 0.3s ease-in-out;
		z-index: 50;
	}

	.bottom-nav:not(.visible) {
		transform: translateY(100%);
	}

	.nav-container {
		display: flex;
		justify-content: space-around;
		align-items: center;
		height: 64px;
		max-width: 896px;
		margin: 0 auto;
		padding: 0 1rem;
	}

	.nav-item {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
		height: 100%;
		color: var(--color-text-muted);
		transition: color 0.2s ease;
		position: relative;
	}

	.nav-item:hover {
		color: var(--color-text);
	}

	.nav-item.active {
		color: var(--color-primary);
	}

	.nav-item.active::after {
		content: '';
		position: absolute;
		bottom: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 32px;
		height: 3px;
		background: var(--color-primary);
		border-radius: 2px 2px 0 0;
	}

	.profile-photo {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		object-fit: cover;
		border: 2px solid transparent;
		transition: border-color 0.2s ease;
	}

	.nav-item.active .profile-photo {
		border-color: var(--color-primary);
	}

	.profile-placeholder {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--color-primary);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		font-size: 14px;
	}

	/* Hide on desktop (show top nav instead) */
	@media (min-width: 1024px) {
		.bottom-nav {
			display: none;
		}
	}
</style>
