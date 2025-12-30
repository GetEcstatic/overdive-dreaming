<script lang="ts">
	let timeframe = '1month';

	const timeframes = [
		{ value: '1month', label: 'Last Month' },
		{ value: '6months', label: 'Last 6 Months' },
		{ value: '1year', label: 'Last Year' }
	];
</script>

<div class="p-6">
	<div class="flex justify-between items-center mb-6">
		<h1 class="text-3xl font-bold text-[var(--color-primary)]">Analytics</h1>
		<select
			bind:value={timeframe}
			class="p-2 rounded bg-[var(--color-bg-card)] border border-[var(--color-text-muted)]/20 focus:border-[var(--color-primary)] outline-none"
		>
			{#each timeframes as tf}
				<option value={tf.value}>{tf.label}</option>
			{/each}
		</select>
	</div>

	<div class="grid gap-6">
		<div class="bg-[var(--color-bg-card)] p-6 rounded-lg">
			<h2 class="text-xl font-semibold mb-4">Progress Over Time</h2>
			<div class="h-64 flex items-center justify-center text-[var(--color-text-muted)]">
				Chart will be displayed here
			</div>
		</div>

		<div class="grid md:grid-cols-2 gap-6">
			<div class="bg-[var(--color-bg-card)] p-6 rounded-lg">
				<h2 class="text-xl font-semibold mb-4">Personal Bests</h2>
				<div class="space-y-3">
					<div class="flex justify-between items-center">
						<span class="text-[var(--color-text-muted)]">STA</span>
						<span class="font-semibold">-</span>
					</div>
					<div class="flex justify-between items-center">
						<span class="text-[var(--color-text-muted)]">DYN</span>
						<span class="font-semibold">-</span>
					</div>
					<div class="flex justify-between items-center">
						<span class="text-[var(--color-text-muted)]">DNF</span>
						<span class="font-semibold">-</span>
					</div>
				</div>
			</div>

			<div class="bg-[var(--color-bg-card)] p-6 rounded-lg">
				<h2 class="text-xl font-semibold mb-4">Training Summary</h2>
				<div class="space-y-3">
					<div class="flex justify-between items-center">
						<span class="text-[var(--color-text-muted)]">Total Dives</span>
						<span class="font-semibold">0</span>
					</div>
					<div class="flex justify-between items-center">
						<span class="text-[var(--color-text-muted)]">Total Time</span>
						<span class="font-semibold">0:00</span>
					</div>
					<div class="flex justify-between items-center">
						<span class="text-[var(--color-text-muted)]">Avg per Week</span>
						<span class="font-semibold">0</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
