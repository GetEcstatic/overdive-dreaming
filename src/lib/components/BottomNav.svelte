<script lang="ts">
	import { page } from '$app/stores';

	const navItems = [
		{ path: '/dashboard', label: 'Home', icon: '🏠' },
		{ path: '/dives', label: 'Log', icon: '➕' },
		{ path: '/analytics', label: 'Stats', icon: '📊' },
		{ path: '/profile', label: 'Profile', icon: '👤' }
	];
</script>

<nav class="fixed bottom-0 left-0 right-0 bg-[var(--color-bg-card)] border-t border-[var(--color-text-muted)]/20">
	<div class="flex justify-around items-center h-16 max-w-screen-lg mx-auto">
		{#each navItems as item}
			<a
				href={item.path}
				class="flex flex-col items-center justify-center flex-1 h-full transition-colors"
				class:text-[var(--color-primary)]={$page.url.pathname === item.path}
				class:text-[var(--color-text-muted)]={$page.url.pathname !== item.path}
			>
				<span class="text-2xl mb-1">{item.icon}</span>
				<span class="text-xs font-medium">{item.label}</span>
			</a>
		{/each}
	</div>
</nav>

<!-- Spacer to prevent content from being hidden behind fixed nav -->
<div class="h-16" />
