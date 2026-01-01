<script lang="ts">
	import type { RoutineTemplate } from '$lib/types';
	import { Search } from 'lucide-svelte';

	interface Props {
		routines: RoutineTemplate[];
		selectedRoutineId?: string;
		onSelect: (routine: RoutineTemplate) => void;
	}

	let { routines, selectedRoutineId = $bindable(), onSelect }: Props = $props();

	let searchQuery = $state('');

	// Filter routines based on search query
	const filteredRoutines = $derived.by(() => {
		if (!searchQuery.trim()) return routines;

		const query = searchQuery.toLowerCase();
		return routines.filter(routine =>
			routine.name.toLowerCase().includes(query) ||
			routine.tags.some(tag => tag.toLowerCase().includes(query)) ||
			routine.disciplines.some(disc => disc.toLowerCase().includes(query))
		);
	});

	function handleSelect(routine: RoutineTemplate) {
		selectedRoutineId = routine.id;
		onSelect(routine);
	}
</script>

<div class="routine-selector">
	<!-- Search Bar -->
	<div class="search-container">
		<span class="search-icon">
			<Search size={18} />
		</span>
		<input
			type="text"
			bind:value={searchQuery}
			placeholder="Search routines"
			class="search-input"
		/>
	</div>

	<!-- Routines Grid -->
	{#if filteredRoutines.length > 0}
		<div class="routines-grid">
			{#each filteredRoutines as routine}
				<button
					type="button"
					onclick={() => handleSelect(routine)}
					class="routine-card"
					class:selected={selectedRoutineId === routine.id}
				>
					<!-- Routine Name -->
					<div class="routine-name">
						{routine.name}
					</div>

					<!-- Disciplines -->
					<div class="disciplines">
						{#each routine.disciplines as discipline}
							<span class="discipline-badge">
								{discipline}
							</span>
						{/each}
					</div>

					<!-- Primary Tags (show max 2) -->
					{#if routine.tags.length > 0}
						<div class="tags">
							{#each routine.tags.slice(0, 2) as tag}
								<span class="tag">
									{tag}
								</span>
							{/each}
						</div>
					{/if}
				</button>
			{/each}
		</div>
	{:else}
		<div class="empty-state">
			<p>No routines found matching "{searchQuery}"</p>
		</div>
	{/if}
</div>

<style>
	.routine-selector {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	/* Search Bar */
	.search-container {
		position: relative;
		display: flex;
		align-items: center;
	}

	.search-icon {
		position: absolute;
		left: 1.5rem;
		color: var(--color-text-muted);
		pointer-events: none;
	}

	.search-input {
		width: 100%;
		padding: 0.75rem 1rem 0.75rem 3.5rem;
		background: var(--color-bg);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 8px;
		color: var(--color-text);
		font-size: 0.875rem;
		outline: none;
		transition: border-color 0.2s ease;
	}

	.search-input::placeholder {
		color: var(--color-text-muted);
	}

	.search-input:focus {
		border-color: var(--color-primary);
	}

	/* Routines Grid */
	.routines-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.75rem;
	}

	@media (min-width: 640px) {
		.routines-grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	@media (min-width: 1024px) {
		.routines-grid {
			grid-template-columns: repeat(4, 1fr);
		}
	}

	/* Routine Card */
	.routine-card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1rem;
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.1);
		border-radius: 8px;
		text-align: left;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.routine-card:hover {
		border-color: var(--color-primary);
		background: rgba(20, 184, 166, 0.05);
	}

	.routine-card.selected {
		border-color: var(--color-primary);
		border-width: 2px;
		background: rgba(20, 184, 166, 0.1);
		padding: calc(1rem - 1px); /* Adjust for thicker border */
	}

	/* Routine Name */
	.routine-name {
		font-weight: 600;
		font-size: 0.875rem;
		color: var(--color-text);
		line-height: 1.3;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	/* Disciplines */
	.disciplines {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.discipline-badge {
		padding: 0.125rem 0.5rem;
		font-size: 0.625rem;
		font-weight: 600;
		font-family: 'Courier New', monospace;
		background: var(--color-bg);
		color: var(--color-text-muted);
		border-radius: 4px;
		text-transform: uppercase;
		letter-spacing: 0.025em;
	}

	/* Tags */
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-top: auto;
	}

	.tag {
		padding: 0.125rem 0.5rem;
		font-size: 0.625rem;
		background: rgba(20, 184, 166, 0.15);
		color: var(--color-primary);
		border-radius: 4px;
	}

	/* Empty State */
	.empty-state {
		padding: 3rem 1rem;
		text-align: center;
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}
</style>
