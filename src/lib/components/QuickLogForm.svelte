<script lang="ts">
	import type { RoutineTemplate, Discipline, BreathingTechnique } from '$lib/types';

	interface Props {
		routine: RoutineTemplate;
		onSubmit: (data: LogFormData) => void;
		onCancel: () => void;
	}

	export interface LogFormData {
		disciplineUsed: Discipline;
		// Session context
		poolLength?: number;
		initialBreatheUpTime?: number;
		// Performance metrics
		totalDistance?: number;
		totalTime?: number;
		lapsCompleted?: number;
		// Training context
		breathingTechnique?: BreathingTechnique;
		rpe?: number;
		joyScale?: number;
		hoursSinceLastMeal?: number;
		notes?: string;
	}

	let { routine, onSubmit, onCancel }: Props = $props();

	// Form state
	let disciplineUsed = $state<Discipline>(routine.disciplines[0]);

	// Session context
	let poolLength = $state<number | undefined>(undefined);
	let breatheUpMinutes = $state<number | undefined>(undefined);
	let breatheUpSeconds = $state<number | undefined>(undefined);

	// Performance metrics
	let totalDistance = $state<number | undefined>(undefined);
	let totalTimeMinutes = $state<number | undefined>(undefined);
	let totalTimeSeconds = $state<number | undefined>(undefined);
	let lapsCompleted = $state<number | undefined>(undefined);

	// Training context
	let breathingTechnique = $state<BreathingTechnique | undefined>(undefined);
	let rpe = $state<number | undefined>(undefined);
	let joyScale = $state<number | undefined>(undefined);
	let hoursSinceLastMeal = $state<number | undefined>(undefined);
	let notes = $state<string>('');

	function handleSubmit(e: Event) {
		e.preventDefault();

		// Convert mm:ss to total seconds
		const initialBreatheUp =
			breatheUpMinutes !== undefined && breatheUpSeconds !== undefined
				? breatheUpMinutes * 60 + breatheUpSeconds
				: undefined;

		const totalTimeInSeconds =
			totalTimeMinutes !== undefined && totalTimeSeconds !== undefined
				? totalTimeMinutes * 60 + totalTimeSeconds
				: undefined;

		const data: LogFormData = {
			disciplineUsed,
			// Session context
			poolLength,
			initialBreatheUpTime: initialBreatheUp,
			// Performance metrics
			totalDistance,
			totalTime: totalTimeInSeconds,
			lapsCompleted,
			// Training context
			breathingTechnique,
			rpe,
			joyScale,
			hoursSinceLastMeal,
			notes: notes.trim() || undefined
		};

		onSubmit(data);
	}

	const config = routine.trackingConfig;
</script>

<form onsubmit={handleSubmit} class="space-y-4">
	<h3 class="text-lg font-semibold text-[var(--color-text)]">Log: {routine.name}</h3>

	<!-- Discipline Selector (if multi-discipline) -->
	{#if routine.disciplines.length > 1}
		<div>
			<label for="discipline" class="block text-sm font-medium text-[var(--color-text)] mb-2">
				Discipline *
			</label>
			<div class="flex gap-2">
				{#each routine.disciplines as disc}
					<button
						type="button"
						onclick={() => (disciplineUsed = disc)}
						class="flex-1 py-2 px-3 rounded-lg border-2 font-mono text-sm transition-all
							{disciplineUsed === disc
							? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
							: 'border-[var(--color-bg-card)] bg-[var(--color-bg-card)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]/50'}"
					>
						{disc}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Pool Length -->
	{#if config.trackPoolLength}
		<div>
			<label for="poolLength" class="block text-sm font-medium text-[var(--color-text)] mb-2">
				Pool Length (meters)
			</label>
			<input
				id="poolLength"
				type="number"
				bind:value={poolLength}
				min="0"
				class="w-full px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] rounded-lg text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
				placeholder="e.g., 25 or 50"
			/>
		</div>
	{/if}

	<!-- Initial Breathe-Up Time -->
	{#if config.trackInitialBreatheUpTime}
		<div>
			<label class="block text-sm font-medium text-[var(--color-text)] mb-2">
				Initial Breathe-Up (mm:ss)
			</label>
			<div class="flex gap-2">
				<input
					type="number"
					bind:value={breatheUpMinutes}
					min="0"
					class="flex-1 px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] rounded-lg text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
					placeholder="mm"
				/>
				<span class="self-center text-[var(--color-text-muted)]">:</span>
				<input
					type="number"
					bind:value={breatheUpSeconds}
					min="0"
					max="59"
					class="flex-1 px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] rounded-lg text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
					placeholder="ss"
				/>
			</div>
		</div>
	{/if}

	<!-- Total Distance -->
	{#if config.trackTotalDistance}
		<div>
			<label for="totalDistance" class="block text-sm font-medium text-[var(--color-text)] mb-2">
				Total Distance (meters)
			</label>
			<input
				id="totalDistance"
				type="number"
				bind:value={totalDistance}
				min="0"
				class="w-full px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] rounded-lg text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
				placeholder="e.g., 175"
			/>
		</div>
	{/if}

	<!-- Total Time -->
	{#if config.trackTotalTime}
		<div>
			<label class="block text-sm font-medium text-[var(--color-text)] mb-2">
				Total Time (mm:ss)
			</label>
			<div class="flex gap-2">
				<input
					type="number"
					bind:value={totalTimeMinutes}
					min="0"
					class="flex-1 px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] rounded-lg text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
					placeholder="mm"
				/>
				<span class="self-center text-[var(--color-text-muted)]">:</span>
				<input
					type="number"
					bind:value={totalTimeSeconds}
					min="0"
					max="59"
					class="flex-1 px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] rounded-lg text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
					placeholder="ss"
				/>
			</div>
		</div>
	{/if}

	<!-- Laps Completed -->
	{#if config.trackLapsCompleted}
		<div>
			<label for="lapsCompleted" class="block text-sm font-medium text-[var(--color-text)] mb-2">
				Laps Completed
			</label>
			<input
				id="lapsCompleted"
				type="number"
				bind:value={lapsCompleted}
				min="0"
				class="w-full px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] rounded-lg text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
				placeholder={routine.numberOfReps ? `Target: ${routine.numberOfReps}` : 'e.g., 16'}
			/>
		</div>
	{/if}

	<!-- Breathing Technique -->
	{#if config.trackBreathingTechnique}
		<div>
			<label class="block text-sm font-medium text-[var(--color-text)] mb-2">
				Breathing Technique
			</label>
			<div class="flex gap-2">
				{#each ['tidal', 'hyperventilation', 'hypoventilation'] as technique}
					<button
						type="button"
						onclick={() => (breathingTechnique = technique as BreathingTechnique)}
						class="flex-1 py-2 px-3 rounded-lg border-2 text-xs transition-all
							{breathingTechnique === technique
							? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
							: 'border-[var(--color-bg-card)] bg-[var(--color-bg-card)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]/50'}"
					>
						{technique}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- RPE (Rate of Perceived Exertion) -->
	{#if config.trackRPE}
		<div>
			<label for="rpe" class="block text-sm font-medium text-[var(--color-text)] mb-2">
				Difficulty (RPE 1-10) {rpe ? `- ${rpe}` : ''}
			</label>
			<input
				id="rpe"
				type="range"
				bind:value={rpe}
				min="1"
				max="10"
				class="w-full h-2 bg-[var(--color-bg-card)] rounded-lg appearance-none cursor-pointer accent-[var(--color-primary)]"
			/>
			<div class="flex justify-between text-xs text-[var(--color-text-muted)] mt-1">
				<span>Easy</span>
				<span>Hard</span>
			</div>
		</div>
	{/if}

	<!-- Joy Scale -->
	{#if config.trackJoyScale}
		<div>
			<label for="joyScale" class="block text-sm font-medium text-[var(--color-text)] mb-2">
				Enjoyment (1-10) {joyScale ? `- ${joyScale}` : ''}
			</label>
			<input
				id="joyScale"
				type="range"
				bind:value={joyScale}
				min="1"
				max="10"
				class="w-full h-2 bg-[var(--color-bg-card)] rounded-lg appearance-none cursor-pointer accent-[var(--color-secondary)]"
			/>
			<div class="flex justify-between text-xs text-[var(--color-text-muted)] mt-1">
				<span>😕</span>
				<span>😊</span>
			</div>
		</div>
	{/if}

	<!-- Hours Since Last Meal -->
	{#if config.trackHoursSinceLastMeal}
		<div>
			<label for="hoursSinceLastMeal" class="block text-sm font-medium text-[var(--color-text)] mb-2">
				Hours Since Last Meal
			</label>
			<input
				id="hoursSinceLastMeal"
				type="number"
				bind:value={hoursSinceLastMeal}
				min="0"
				step="0.5"
				class="w-full px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] rounded-lg text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
				placeholder="e.g., 2.5"
			/>
		</div>
	{/if}

	<!-- Notes -->
	{#if config.trackNotes}
		<div>
			<label for="notes" class="block text-sm font-medium text-[var(--color-text)] mb-2">
				Notes
			</label>
			<textarea
				id="notes"
				bind:value={notes}
				rows="3"
				class="w-full px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] rounded-lg text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none resize-none"
				placeholder="How did it feel? Any observations..."
			></textarea>
		</div>
	{/if}

	<!-- Action Buttons -->
	<div class="flex gap-3 pt-4">
		<button
			type="button"
			onclick={onCancel}
			class="flex-1 py-3 px-4 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] transition-colors"
		>
			Cancel
		</button>
		<button
			type="submit"
			class="flex-1 py-3 px-4 rounded-lg bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)] text-white font-semibold hover:opacity-90 transition-opacity"
		>
			Save Log
		</button>
	</div>
</form>
