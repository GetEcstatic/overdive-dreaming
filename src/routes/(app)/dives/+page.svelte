<script lang="ts">
	let discipline = 'STA';
	let duration = '';
	let distance = '';
	let notes = '';

	const disciplines = [
		{ value: 'STA', label: 'Static Apnea (STA)' },
		{ value: 'DYN', label: 'Dynamic Apnea (DYN)' },
		{ value: 'DNF', label: 'Dynamic No Fins (DNF)' },
		{ value: 'DYNB', label: 'Dynamic Bifins (DYNB)' }
	];

	function handleSubmit() {
		// TODO: Save dive to Firestore
		console.log({ discipline, duration, distance, notes });
	}
</script>

<div class="p-6 max-w-2xl mx-auto">
	<h1 class="text-3xl font-bold mb-6 text-[var(--color-primary)]">Log Dive</h1>

	<form on:submit|preventDefault={handleSubmit} class="bg-[var(--color-bg-card)] p-6 rounded-lg">
		<div class="mb-4">
			<label for="discipline" class="block mb-2 font-semibold">Discipline</label>
			<select
				id="discipline"
				bind:value={discipline}
				class="w-full p-3 rounded bg-[var(--color-bg)] border border-[var(--color-text-muted)]/20 focus:border-[var(--color-primary)] outline-none"
			>
				{#each disciplines as disc}
					<option value={disc.value}>{disc.label}</option>
				{/each}
			</select>
		</div>

		{#if discipline === 'STA'}
			<div class="mb-4">
				<label for="duration" class="block mb-2 font-semibold">Duration (mm:ss)</label>
				<input
					id="duration"
					type="text"
					bind:value={duration}
					placeholder="03:30"
					class="w-full p-3 rounded bg-[var(--color-bg)] border border-[var(--color-text-muted)]/20 focus:border-[var(--color-primary)] outline-none"
				/>
			</div>
		{:else}
			<div class="mb-4">
				<label for="distance" class="block mb-2 font-semibold">Distance (meters)</label>
				<input
					id="distance"
					type="number"
					bind:value={distance}
					placeholder="75"
					class="w-full p-3 rounded bg-[var(--color-bg)] border border-[var(--color-text-muted)]/20 focus:border-[var(--color-primary)] outline-none"
				/>
			</div>
		{/if}

		<div class="mb-6">
			<label for="notes" class="block mb-2 font-semibold">Notes</label>
			<textarea
				id="notes"
				bind:value={notes}
				rows="4"
				placeholder="How did it feel? Any observations?"
				class="w-full p-3 rounded bg-[var(--color-bg)] border border-[var(--color-text-muted)]/20 focus:border-[var(--color-primary)] outline-none resize-none"
			/>
		</div>

		<button
			type="submit"
			class="w-full py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 rounded-lg font-semibold transition-colors"
		>
			Save Dive
		</button>
	</form>
</div>
