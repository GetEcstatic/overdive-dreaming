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
		repsCompleted?: number;
		repDuration?: number;
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
	let repsCompleted = $state<number | undefined>(undefined);
	let repDurationMinutes = $state<number | undefined>(undefined);
	let repDurationSeconds = $state<number | undefined>(undefined);

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

		const repDurationInSeconds =
			repDurationMinutes !== undefined && repDurationSeconds !== undefined
				? repDurationMinutes * 60 + repDurationSeconds
				: undefined;

		const data: LogFormData = {
			disciplineUsed,
			// Session context
			poolLength,
			initialBreatheUpTime: initialBreatheUp,
			// Performance metrics
			totalDistance,
			totalTime: totalTimeInSeconds,
			repsCompleted,
			repDuration: repDurationInSeconds,
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

	// Check if any fields exist in each section
	const hasSessionContext = $derived(config.trackPoolLength || config.trackInitialBreatheUpTime);
	const hasPerformanceMetrics = $derived(
		config.trackTotalDistance ||
			config.trackTotalTime ||
			config.trackRepsCompleted ||
			config.trackRepDuration
	);
	const hasTrainingContext = $derived(
		config.trackBreathingTechnique ||
			config.trackRPE ||
			config.trackJoyScale ||
			config.trackHoursSinceLastMeal ||
			config.trackNotes
	);
</script>

<form onsubmit={handleSubmit} class="log-form">
	<!-- Form Header -->
	<div class="form-header">
		<h3 class="routine-name">{routine.name}</h3>
		<p class="routine-subtitle">Quick Log</p>
	</div>

	<!-- Discipline Selector (if multi-discipline) -->
	{#if routine.disciplines.length > 1}
		<div class="form-section">
			<label class="section-label">Discipline *</label>
			<div class="discipline-buttons">
				{#each routine.disciplines as disc}
					<button
						type="button"
						onclick={() => (disciplineUsed = disc)}
						class="discipline-btn"
						class:active={disciplineUsed === disc}
					>
						{disc}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Session Context Section -->
	{#if hasSessionContext}
		<div class="form-section">
			<h4 class="section-title">Session Details</h4>

			{#if config.trackPoolLength}
				<div class="field-group">
					<label for="poolLength" class="field-label">Pool Length (m)</label>
					<input
						id="poolLength"
						type="number"
						bind:value={poolLength}
						min="0"
						class="field-input"
						placeholder="25 or 50"
					/>
				</div>
			{/if}

			{#if config.trackInitialBreatheUpTime}
				<div class="field-group">
					<label class="field-label">Initial Breathe-Up</label>
					<div class="time-input">
						<input
							type="number"
							bind:value={breatheUpMinutes}
							min="0"
							class="field-input time-part"
							placeholder="mm"
						/>
						<span class="time-separator">:</span>
						<input
							type="number"
							bind:value={breatheUpSeconds}
							min="0"
							max="59"
							class="field-input time-part"
							placeholder="ss"
						/>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Performance Metrics Section -->
	{#if hasPerformanceMetrics}
		<div class="form-section">
			<h4 class="section-title">Performance</h4>

			{#if config.trackTotalDistance}
				<div class="field-group">
					<label for="totalDistance" class="field-label">Total Distance (m)</label>
					<input
						id="totalDistance"
						type="number"
						bind:value={totalDistance}
						min="0"
						class="field-input"
						placeholder="e.g., 175"
					/>
				</div>
			{/if}

			{#if config.trackTotalTime}
				<div class="field-group">
					<label class="field-label">Total Time</label>
					<div class="time-input">
						<input
							type="number"
							bind:value={totalTimeMinutes}
							min="0"
							class="field-input time-part"
							placeholder="mm"
						/>
						<span class="time-separator">:</span>
						<input
							type="number"
							bind:value={totalTimeSeconds}
							min="0"
							max="59"
							class="field-input time-part"
							placeholder="ss"
						/>
					</div>
				</div>
			{/if}

			{#if config.trackRepsCompleted}
				<div class="field-group">
					<label for="repsCompleted" class="field-label">Reps Completed</label>
					<input
						id="repsCompleted"
						type="number"
						bind:value={repsCompleted}
						min="0"
						class="field-input"
						placeholder={routine.numberOfReps ? `Target: ${routine.numberOfReps}` : 'e.g., 16'}
					/>
				</div>
			{/if}

			{#if config.trackRepDuration}
				<div class="field-group">
					<label class="field-label">Rep Duration (target: 1:30)</label>
					<div class="time-input">
						<input
							type="number"
							bind:value={repDurationMinutes}
							min="0"
							class="field-input time-part"
							placeholder="mm"
						/>
						<span class="time-separator">:</span>
						<input
							type="number"
							bind:value={repDurationSeconds}
							min="0"
							max="59"
							class="field-input time-part"
							placeholder="ss"
						/>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Training Context Section -->
	{#if hasTrainingContext}
		<div class="form-section">
			<h4 class="section-title">Training Context</h4>

			{#if config.trackBreathingTechnique}
				<div class="field-group">
					<label class="field-label">Breathing Technique</label>
					<div class="technique-buttons">
						{#each ['tidal', 'hyperventilation', 'hypoventilation'] as technique}
							<button
								type="button"
								onclick={() => (breathingTechnique = technique as BreathingTechnique)}
								class="technique-btn"
								class:active={breathingTechnique === technique}
							>
								{technique}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			{#if config.trackRPE}
				<div class="field-group">
					<label for="rpe" class="field-label">
						Difficulty (RPE){rpe ? `: ${rpe}/10` : ''}
					</label>
					<input
						id="rpe"
						type="range"
						bind:value={rpe}
						min="1"
						max="10"
						class="slider"
					/>
					<div class="slider-labels">
						<span>Easy</span>
						<span>Hard</span>
					</div>
				</div>
			{/if}

			{#if config.trackJoyScale}
				<div class="field-group">
					<label for="joyScale" class="field-label">
						Enjoyment{joyScale ? `: ${joyScale}/10` : ''}
					</label>
					<input
						id="joyScale"
						type="range"
						bind:value={joyScale}
						min="1"
						max="10"
						class="slider joy-slider"
					/>
					<div class="slider-labels">
						<span>😕</span>
						<span>😊</span>
					</div>
				</div>
			{/if}

			{#if config.trackHoursSinceLastMeal}
				<div class="field-group">
					<label for="hoursSinceLastMeal" class="field-label">Hours Since Last Meal</label>
					<input
						id="hoursSinceLastMeal"
						type="number"
						bind:value={hoursSinceLastMeal}
						min="0"
						step="0.5"
						class="field-input"
						placeholder="e.g., 2.5"
					/>
				</div>
			{/if}

			{#if config.trackNotes}
				<div class="field-group">
					<label for="notes" class="field-label">Notes</label>
					<textarea
						id="notes"
						bind:value={notes}
						rows="3"
						class="field-textarea"
						placeholder="How did it feel? Any observations..."
					></textarea>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Action Buttons -->
	<div class="form-actions">
		<button type="button" onclick={onCancel} class="btn-cancel"> Cancel </button>
		<button type="submit" class="btn-submit"> Save Log </button>
	</div>
</form>

<style>
	.log-form {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	/* Form Header */
	.form-header {
		padding-bottom: 1rem;
		border-bottom: 1px solid rgba(148, 163, 184, 0.15);
	}

	.routine-name {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: 0.25rem;
	}

	.routine-subtitle {
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}

	/* Form Sections */
	.form-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.25rem;
		background: rgba(20, 184, 166, 0.03);
		border: 1px solid rgba(148, 163, 184, 0.1);
		border-radius: 8px;
	}

	.section-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-primary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.5rem;
	}

	.section-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text);
		margin-bottom: 0.5rem;
		display: block;
	}

	/* Field Groups */
	.field-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.field-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text);
	}

	/* Input Fields */
	.field-input {
		width: 100%;
		padding: 0.75rem 1rem;
		background: var(--color-bg);
		border: 1px solid rgba(148, 163, 184, 0.15);
		border-radius: 6px;
		color: var(--color-text);
		font-size: 0.875rem;
		outline: none;
		transition: border-color 0.2s ease;
	}

	.field-input::placeholder {
		color: var(--color-text-muted);
	}

	.field-input:focus {
		border-color: var(--color-primary);
	}

	.field-textarea {
		width: 100%;
		padding: 0.75rem 1rem;
		background: var(--color-bg);
		border: 1px solid rgba(148, 163, 184, 0.15);
		border-radius: 6px;
		color: var(--color-text);
		font-size: 0.875rem;
		outline: none;
		resize: none;
		transition: border-color 0.2s ease;
		font-family: inherit;
	}

	.field-textarea::placeholder {
		color: var(--color-text-muted);
	}

	.field-textarea:focus {
		border-color: var(--color-primary);
	}

	/* Time Input (mm:ss) */
	.time-input {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.time-part {
		flex: 1;
	}

	.time-separator {
		color: var(--color-text-muted);
		font-weight: 600;
		font-size: 1.25rem;
	}

	/* Discipline Buttons */
	.discipline-buttons {
		display: flex;
		gap: 0.5rem;
	}

	.discipline-btn {
		flex: 1;
		padding: 0.75rem 1rem;
		background: var(--color-bg);
		border: 2px solid rgba(148, 163, 184, 0.15);
		border-radius: 6px;
		color: var(--color-text-muted);
		font-family: 'Courier New', monospace;
		font-size: 0.875rem;
		font-weight: 600;
		text-transform: uppercase;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.discipline-btn:hover {
		border-color: var(--color-primary);
	}

	.discipline-btn.active {
		background: rgba(20, 184, 166, 0.15);
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	/* Technique Buttons */
	.technique-buttons {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.technique-btn {
		flex: 1;
		min-width: 120px;
		padding: 0.625rem 0.75rem;
		background: var(--color-bg);
		border: 2px solid rgba(148, 163, 184, 0.15);
		border-radius: 6px;
		color: var(--color-text-muted);
		font-size: 0.75rem;
		cursor: pointer;
		transition: all 0.2s ease;
		text-transform: capitalize;
	}

	.technique-btn:hover {
		border-color: var(--color-primary);
	}

	.technique-btn.active {
		background: rgba(20, 184, 166, 0.15);
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	/* Sliders */
	.slider {
		width: 100%;
		height: 6px;
		background: var(--color-bg);
		border-radius: 3px;
		outline: none;
		appearance: none;
		cursor: pointer;
		accent-color: var(--color-primary);
	}

	.slider::-webkit-slider-thumb {
		appearance: none;
		width: 18px;
		height: 18px;
		background: var(--color-primary);
		border-radius: 50%;
		cursor: pointer;
	}

	.slider::-moz-range-thumb {
		width: 18px;
		height: 18px;
		background: var(--color-primary);
		border-radius: 50%;
		border: none;
		cursor: pointer;
	}

	.joy-slider {
		accent-color: var(--color-secondary);
	}

	.joy-slider::-webkit-slider-thumb {
		background: var(--color-secondary);
	}

	.joy-slider::-moz-range-thumb {
		background: var(--color-secondary);
	}

	.slider-labels {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin-top: 0.25rem;
	}

	/* Action Buttons */
	.form-actions {
		display: flex;
		gap: 0.75rem;
		padding-top: 1rem;
		margin-bottom: 3.5rem;
	}

	.btn-cancel {
		flex: 1;
		padding: 0.875rem 1.5rem;
		background: var(--color-bg);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 8px;
		color: var(--color-text-muted);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-cancel:hover {
		background: rgba(148, 163, 184, 0.1);
		color: var(--color-text);
	}

	.btn-submit {
		flex: 2;
		padding: 0.875rem 1.5rem;
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
		border: none;
		border-radius: 8px;
		color: white;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.2s ease;
	}

	.btn-submit:hover {
		opacity: 0.9;
	}

	/* Mobile Responsive Adjustments */
	@media (max-width: 640px) {
		.technique-btn {
			min-width: 100px;
		}
	}
</style>
