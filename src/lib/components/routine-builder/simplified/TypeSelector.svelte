<script lang="ts">
	/**
	 * TypeSelector - Visual card-based routine type selection
	 */

	import type { SimplifiedRoutineType } from '$lib/types';

	let {
		selectedType,
		onSelect
	}: {
		selectedType: SimplifiedRoutineType | null;
		onSelect: (type: SimplifiedRoutineType) => void;
	} = $props();

	const routineTypes: Array<{
		type: SimplifiedRoutineType;
		icon: string;
		title: string;
		subtitle: string;
		description: string;
		examples: string[];
	}> = [
		{
			type: 'max-attempt',
			icon: '🎯',
			title: 'Max Attempt',
			subtitle: 'Single dive performance',
			description: 'Record a single maximum or sub-maximum effort dive. Perfect for PB attempts, competition dives, or technique-focused single efforts.',
			examples: ['Competition dive', 'PB attempt', 'Warm-up max', 'Test dive']
		},
		{
			type: 'interval-series',
			icon: '🔄',
			title: 'Interval Series',
			subtitle: 'Multiple reps with structure',
			description: 'Multiple repetitions with defined breathe-up, work, and rest intervals. Can be uniform (same for all reps) or progressive (variable per rep).',
			examples: ['CO₂ tables', 'O₂ tables', 'Endurance sets', 'Speed work']
		},
		{
			type: 'hybrid',
			icon: '⚡',
			title: 'Hybrid',
			subtitle: 'Intervals + max component',
			description: 'Combine interval training with a max effort dive. Great for competition simulation or building to a peak performance.',
			examples: ['Warmup → Max', 'Build-up series', 'Competition simulation']
		}
	];
</script>

<div class="type-selector">
	<div class="header">
		<h1>Create New Routine</h1>
		<p class="subtitle">Choose the type of routine you want to create</p>
	</div>

	<div class="type-cards">
		{#each routineTypes as rt}
			<button
				type="button"
				class="type-card"
				class:selected={selectedType === rt.type}
				onclick={() => onSelect(rt.type)}
			>
				<div class="card-icon">{rt.icon}</div>
				<div class="card-content">
					<h2 class="card-title">{rt.title}</h2>
					<p class="card-subtitle">{rt.subtitle}</p>
					<p class="card-description">{rt.description}</p>
					<div class="card-examples">
						{#each rt.examples as example}
							<span class="example-tag">{example}</span>
						{/each}
					</div>
				</div>
			</button>
		{/each}
	</div>
</div>

<style>
	.type-selector {
		padding: 1rem 0;
	}

	.header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.header h1 {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0 0 0.5rem;
	}

	.subtitle {
		color: var(--color-text-muted);
		font-size: 0.9rem;
		margin: 0;
	}

	.type-cards {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.type-card {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
		padding: 1.25rem;
		background: var(--color-bg-card);
		border: 2px solid transparent;
		border-radius: 12px;
		cursor: pointer;
		text-align: left;
		transition: all 0.2s ease;
	}

	.type-card:hover {
		border-color: rgba(20, 184, 166, 0.4);
		transform: translateY(-2px);
	}

	.type-card.selected {
		border-color: var(--color-primary);
		background: rgba(20, 184, 166, 0.1);
	}

	.card-icon {
		font-size: 2rem;
		flex-shrink: 0;
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(20, 184, 166, 0.15);
		border-radius: 12px;
	}

	.card-content {
		flex: 1;
		min-width: 0;
	}

	.card-title {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0 0 0.25rem;
	}

	.card-subtitle {
		font-size: 0.85rem;
		color: var(--color-primary);
		margin: 0 0 0.5rem;
		font-weight: 500;
	}

	.card-description {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		margin: 0 0 0.75rem;
		line-height: 1.4;
	}

	.card-examples {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.example-tag {
		padding: 0.25rem 0.5rem;
		background: rgba(148, 163, 184, 0.15);
		border-radius: 4px;
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.type-card.selected .example-tag {
		background: rgba(20, 184, 166, 0.2);
		color: var(--color-primary);
	}
</style>
