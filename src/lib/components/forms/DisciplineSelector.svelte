<script lang="ts">
	/**
	 * DisciplineSelector - Allows selecting a discipline from available options
	 */
	import type { Discipline } from '$lib/types';

	interface Props {
		disciplines: Discipline[];
		selected: Discipline;
		onChange: (discipline: Discipline) => void;
	}

	let { disciplines, selected, onChange }: Props = $props();
</script>

{#if disciplines.length > 1}
	<div class="discipline-selector">
		<span class="section-label" id="discipline-label">Discipline *</span>
		<div class="discipline-buttons" role="radiogroup" aria-labelledby="discipline-label">
			{#each disciplines as disc}
				<button
					type="button"
					onclick={() => onChange(disc)}
					class="discipline-btn"
					class:active={selected === disc}
					role="radio"
					aria-checked={selected === disc}
				>
					{disc}
				</button>
			{/each}
		</div>
	</div>
{/if}

<style>
	.discipline-selector {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.section-label {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.discipline-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.discipline-btn {
		padding: 0.75rem 1.5rem;
		border: 2px solid var(--color-border);
		border-radius: 8px;
		background: var(--color-bg-card);
		color: var(--color-text);
		font-weight: 600;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.discipline-btn:hover {
		border-color: var(--color-primary);
	}

	.discipline-btn.active {
		background: var(--color-primary);
		color: white;
		border-color: var(--color-primary);
	}
</style>
