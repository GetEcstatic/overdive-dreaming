<script lang="ts">
	import { user } from '$lib/stores/auth';
</script>

<div class="p-6">
	<h1 class="text-3xl font-bold mb-6 text-[var(--color-primary)]">Dashboard</h1>

	{#if $user}
		<div class="grid gap-6">
			<div class="bg-[var(--color-bg-card)] p-6 rounded-lg">
				<h2 class="text-xl font-semibold mb-2">Welcome back, {$user.displayName}!</h2>
				<p class="text-[var(--color-text-muted)]">Track your progress and log your dives</p>
			</div>

			<div class="grid md:grid-cols-3 gap-4">
				<div class="bg-[var(--color-bg-card)] p-6 rounded-lg">
					<h3 class="text-lg font-semibold mb-2">Recent Dives</h3>
					<p class="text-3xl font-bold text-[var(--color-primary)]">0</p>
				</div>

				<div class="bg-[var(--color-bg-card)] p-6 rounded-lg">
					<h3 class="text-lg font-semibold mb-2">This Week</h3>
					<p class="text-3xl font-bold text-[var(--color-secondary)]">0</p>
				</div>

				<div class="bg-[var(--color-bg-card)] p-6 rounded-lg">
					<h3 class="text-lg font-semibold mb-2">Personal Best</h3>
					<p class="text-3xl font-bold text-[var(--color-primary)]">-</p>
				</div>
			</div>
		</div>
	{/if}
</div>
