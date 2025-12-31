<script lang="ts">
	import type { RoutineTemplate } from '$lib/types';

	interface Props {
		routines: RoutineTemplate[];
		selectedRoutineId?: string;
		onSelect: (routine: RoutineTemplate) => void;
	}

	let { routines, selectedRoutineId = $bindable(), onSelect }: Props = $props();

	function handleSelect(routine: RoutineTemplate) {
		selectedRoutineId = routine.id;
		onSelect(routine);
	}
</script>

<div class="space-y-3">
	<h3 class="text-lg font-semibold text-[var(--color-text)]">Select Routine</h3>

	<div class="grid gap-3">
		{#each routines as routine}
			<button
				type="button"
				onclick={() => handleSelect(routine)}
				class="w-full text-left p-4 rounded-lg border-2 transition-all
					{selectedRoutineId === routine.id
					? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
					: 'border-[var(--color-bg-card)] bg-[var(--color-bg-card)] hover:border-[var(--color-primary)]/50'}"
			>
				<!-- Routine Name -->
				<div class="font-semibold text-[var(--color-text)] mb-1">
					{routine.name}
				</div>

				<!-- Description -->
				<div class="text-sm text-[var(--color-text-muted)] mb-2">
					{routine.description}
				</div>

				<!-- Tags -->
				<div class="flex flex-wrap gap-1.5">
					{#each routine.tags as tag}
						<span
							class="px-2 py-0.5 text-xs rounded-full bg-[var(--color-primary)]/20 text-[var(--color-primary)]"
						>
							{tag}
						</span>
					{/each}
				</div>

				<!-- Disciplines -->
				<div class="flex gap-2 mt-2 text-xs text-[var(--color-text-muted)]">
					{#each routine.disciplines as discipline}
						<span class="px-2 py-1 rounded bg-[var(--color-bg)] font-mono">
							{discipline}
						</span>
					{/each}
				</div>
			</button>
		{/each}
	</div>
</div>
