<script lang="ts">
	/**
	 * IntervalConfig - Configuration for interval series routines
	 */

	import type { Discipline, IntervalStructure, DisplayConfig, RoutineTable, TrainingEnvironment } from '$lib/types';
	import TableEditor from '../TableEditor.svelte';
	import DurationInput from '$lib/components/DurationInput.svelte';

	let {
		name = $bindable(),
		description = $bindable(),
		disciplines = $bindable(),
		intervalStructure = $bindable(),
		numberOfReps = $bindable(),
		restBetweenReps = $bindable(),
		repDistance = $bindable(),
		repDuration = $bindable(),
		table = $bindable(),
		displayConfig = $bindable(),
		trainingEnvironment = $bindable(),
		routineTags = $bindable()
	}: {
		name: string;
		description: string;
		disciplines: Discipline[];
		intervalStructure: IntervalStructure;
		numberOfReps: number;
		restBetweenReps: number;
		repDistance: number | undefined;
		repDuration: number | undefined;
		table: RoutineTable | undefined;
		displayConfig: DisplayConfig;
		trainingEnvironment: TrainingEnvironment;
		routineTags: string[];
	} = $props();

	const allDisciplines: Array<{ value: Discipline; label: string; description: string }> = [
		{ value: 'DYN', label: 'DYN', description: 'Dynamic with fins' },
		{ value: 'DNF', label: 'DNF', description: 'Dynamic no fins' },
		{ value: 'DYNB', label: 'DYNB', description: 'Dynamic bifins' },
		{ value: 'STA', label: 'STA', description: 'Static apnea' }
	];

	// Available tags for interval routines (same as max attempt)
	const availableTags = [
		{ value: 'max', label: 'Max Effort', icon: '🔥', description: 'True maximum attempt' },
		{ value: 'submax', label: 'Sub-Max', icon: '💪', description: 'Below full capacity' },
		{ value: 'competition', label: 'Competition', icon: '🏆', description: 'Competition dive' },
		{ value: 'training', label: 'Training', icon: '📚', description: 'Training session' },
		{ value: 'warmup', label: 'Warm-up', icon: '🌡️', description: 'Warm-up dive' },
		{ value: 'pb-attempt', label: 'PB Attempt', icon: '⭐', description: 'Personal best attempt' },
		{ value: 'co2', label: 'CO₂ Training', icon: '💨', description: 'CO₂ tolerance' },
		{ value: 'o2', label: 'O₂ Training', icon: '🫁', description: 'Hypoxic training' },
		{ value: 'endurance', label: 'Endurance', icon: '🏃', description: 'Endurance building' },
	];

	// Determine if we're doing static or dynamic intervals
	let isStatic = $derived(disciplines.includes('STA') && disciplines.length === 1);

	function toggleDiscipline(discipline: Discipline) {
		if (disciplines.includes(discipline)) {
			disciplines = disciplines.filter(d => d !== discipline);
		} else {
			disciplines = [...disciplines, discipline];
		}
		updateDisplayConfig();
	}

	function updateDisplayConfig() {
		if (disciplines.includes('STA') && disciplines.length === 1) {
			displayConfig = {
				heroMetric: 'repsCompleted',
				heroMetricLabel: 'Reps',
				secondaryMetric: 'totalBreathHoldTime',
				secondaryMetricLabel: 'Total Hold Time'
			};
		} else {
			displayConfig = {
				heroMetric: 'repsCompleted',
				heroMetricLabel: 'Reps',
				secondaryMetric: 'totalDistance',
				secondaryMetricLabel: 'Total Distance'
			};
		}
	}

	function toggleTag(tag: string) {
		if (routineTags.includes(tag)) {
			routineTags = routineTags.filter(t => t !== tag);
		} else {
			routineTags = [...routineTags, tag];
		}
	}

	function initializeTable() {
		if (!table) {
			table = {
				rows: Array.from({ length: numberOfReps }, (_, i) => ({
					repNumber: i + 1,
					restBefore: restBetweenReps,
					...(isStatic ? { targetDuration: 60 } : { targetDistance: 25 })
				}))
			};
		}
	}

	// Watch for structure change
	$effect(() => {
		if (intervalStructure === 'variable' && !table) {
			initializeTable();
		}
	});

	function formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}
</script>

<div class="interval-config">
	<div class="header">
		<h1>🔄 Interval Series</h1>
		<p class="subtitle">Configure your interval training routine</p>
	</div>

	<!-- Basic Info -->
	<section class="form-section">
		<h2>Basic Information</h2>
		
		<div class="form-group">
			<label for="name">Routine Name</label>
			<input
				id="name"
				type="text"
				bind:value={name}
				placeholder="e.g., CO₂ Builder 8x50"
			/>
		</div>

		<div class="form-group">
			<label for="description">Description</label>
			<textarea
				id="description"
				bind:value={description}
				placeholder="Describe what this routine is for..."
				rows="3"
			></textarea>
		</div>
	</section>

	<!-- Discipline Selection -->
	<section class="form-section">
		<h2>Discipline</h2>
		<p class="section-hint">Which discipline(s) is this routine for?</p>

		<div class="discipline-grid">
			{#each allDisciplines as disc}
				<button
					type="button"
					class="discipline-btn"
					class:selected={disciplines.includes(disc.value)}
					onclick={() => toggleDiscipline(disc.value)}
				>
					<span class="disc-label">{disc.label}</span>
					<span class="disc-desc">{disc.description}</span>
				</button>
			{/each}
		</div>
	</section>

	<!-- Routine Tags -->
	<section class="form-section">
		<h2>Routine Tags</h2>
		<p class="section-hint">Select tags to help categorize and filter this routine</p>

		<div class="tags-grid">
			{#each availableTags as tag}
				<button
					type="button"
					class="tag-btn"
					class:selected={routineTags.includes(tag.value)}
					onclick={() => toggleTag(tag.value)}
				>
					<span class="tag-icon">{tag.icon}</span>
					<span class="tag-label">{tag.label}</span>
				</button>
			{/each}
		</div>
		<p class="field-hint">Tags help filter sessions in analytics</p>
	</section>

	<!-- Training Environment (for STA) -->
	{#if isStatic}
		<section class="form-section">
			<h2>Training Environment</h2>
			<p class="section-hint">Where will this routine be used?</p>

			<div class="toggle-group-3">
				<button
					type="button"
					class="toggle-btn"
					class:active={trainingEnvironment === 'wet'}
					onclick={() => (trainingEnvironment = 'wet')}
				>
					<span class="toggle-icon">🏊</span>
					<span class="toggle-label">Wet Only</span>
					<span class="toggle-desc">Pool training</span>
				</button>
				<button
					type="button"
					class="toggle-btn"
					class:active={trainingEnvironment === 'dry'}
					onclick={() => (trainingEnvironment = 'dry')}
				>
					<span class="toggle-icon">🛋️</span>
					<span class="toggle-label">Dry Only</span>
					<span class="toggle-desc">Land-based</span>
				</button>
				<button
					type="button"
					class="toggle-btn"
					class:active={trainingEnvironment === 'both'}
					onclick={() => (trainingEnvironment = 'both')}
				>
					<span class="toggle-icon">🔄</span>
					<span class="toggle-label">Both</span>
					<span class="toggle-desc">Choose at log time</span>
				</button>
			</div>
		</section>
	{/if}

	<!-- Interval Structure -->
	<section class="form-section">
		<h2>Interval Structure</h2>
		<p class="section-hint">Are all reps the same, or does each rep have different targets?</p>

		<div class="toggle-group">
			<button
				type="button"
				class="toggle-btn"
				class:active={intervalStructure === 'uniform'}
				onclick={() => (intervalStructure = 'uniform')}
			>
				<span class="toggle-icon">⬜</span>
				<span class="toggle-label">Uniform</span>
				<span class="toggle-desc">Same for all reps</span>
			</button>
			<button
				type="button"
				class="toggle-btn"
				class:active={intervalStructure === 'variable'}
				onclick={() => (intervalStructure = 'variable')}
			>
				<span class="toggle-icon">📈</span>
				<span class="toggle-label">Variable</span>
				<span class="toggle-desc">Custom per rep</span>
			</button>
		</div>
	</section>

	<!-- Uniform Intervals Configuration -->
	{#if intervalStructure === 'uniform'}
		<section class="form-section">
			<h2>Interval Settings</h2>

			<div class="interval-grid">
				<div class="form-group">
					<label for="numberOfReps">Number of Reps</label>
					<input
						id="numberOfReps"
						type="number"
						bind:value={numberOfReps}
						min="1"
						max="50"
					/>
				</div>

				<div class="form-group">
					<DurationInput
						bind:value={restBetweenReps}
						label="Rest Between Reps"
						hint="Recovery time between each rep"
					/>
				</div>

				{#if isStatic}
					<div class="form-group">
						<DurationInput
							bind:value={repDuration}
							label="Hold Duration"
							hint="Target breath hold time per rep"
						/>
					</div>
				{:else}
					<div class="form-group">
						<label for="repDistance">Rep Distance (meters)</label>
						<input
							id="repDistance"
							type="number"
							bind:value={repDistance}
							min="1"
							placeholder="e.g., 50"
						/>
					</div>
				{/if}
			</div>

			<!-- Preview -->
			{#if numberOfReps > 0 && restBetweenReps !== undefined}
				<div class="preview-box">
					<h3>Preview</h3>
					<p class="preview-text">
						{numberOfReps} reps × 
						{isStatic ? (repDuration ? `${formatTime(repDuration)} hold` : '__ hold') : (repDistance ? `${repDistance}m` : '__m')}
						with {formatTime(restBetweenReps)} rest
					</p>
				</div>
			{/if}
		</section>
	{/if}

	<!-- Variable Table Configuration -->
	{#if intervalStructure === 'variable'}
		<section class="form-section">
			<h2>Variable Table</h2>
			<p class="section-hint">Define custom targets for each rep</p>

			{#if table}
				<TableEditor 
					bind:table={table}
					isStatic={isStatic}
				/>
			{:else}
				<div class="form-group">
					<label for="tableReps">How many reps in this table?</label>
					<input
						id="tableReps"
						type="number"
						bind:value={numberOfReps}
						min="1"
						max="20"
					/>
					<button 
						type="button" 
						class="init-table-btn"
						onclick={initializeTable}
					>
						Create Table
					</button>
				</div>
			{/if}
		</section>
	{/if}
</div>

<style>
	.interval-config {
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

	/* Form Sections */
	.form-section {
		margin-bottom: 2rem;
	}

	.form-section h2 {
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 0.5rem;
	}

	.section-hint {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		margin: 0 0 1rem;
	}

	/* Form Groups */
	.form-group {
		margin-bottom: 1rem;
	}

	.form-group label {
		display: block;
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--color-text-muted);
		margin-bottom: 0.5rem;
	}

	.form-group input,
	.form-group textarea {
		width: 100%;
		padding: 0.75rem;
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.3);
		border-radius: 8px;
		color: var(--color-text);
		font-size: 1rem;
		transition: border-color 0.2s ease;
	}

	.form-group input:focus,
	.form-group textarea:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.form-group textarea {
		resize: vertical;
		min-height: 80px;
	}

	/* Discipline Grid */
	.discipline-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.75rem;
	}

	.discipline-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 1rem;
		background: var(--color-bg-card);
		border: 2px solid transparent;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.discipline-btn:hover {
		border-color: rgba(20, 184, 166, 0.4);
	}

	.discipline-btn.selected {
		border-color: var(--color-primary);
		background: rgba(20, 184, 166, 0.1);
	}

	.disc-label {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--color-text);
	}

	.disc-desc {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin-top: 0.25rem;
	}

	/* Toggle Groups */
	.toggle-group {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.75rem;
	}

	.toggle-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 1rem;
		background: var(--color-bg-card);
		border: 2px solid transparent;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.toggle-btn:hover {
		border-color: rgba(20, 184, 166, 0.4);
	}

	.toggle-btn.active {
		border-color: var(--color-primary);
		background: rgba(20, 184, 166, 0.1);
	}

	.toggle-icon {
		font-size: 1.5rem;
		margin-bottom: 0.5rem;
	}

	.toggle-label {
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.toggle-desc {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin-top: 0.25rem;
		text-align: center;
	}

	/* Interval Grid */
	.interval-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
	}

	.interval-grid .form-group:last-child {
		grid-column: span 2;
	}

	/* Preview Box */
	.preview-box {
		margin-top: 1rem;
		padding: 1rem;
		background: rgba(20, 184, 166, 0.1);
		border-radius: 8px;
		border-left: 3px solid var(--color-primary);
	}

	.preview-box h3 {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-primary);
		margin: 0 0 0.5rem;
	}

	.preview-text {
		margin: 0;
		font-size: 0.9rem;
		color: var(--color-text);
	}

	/* Init Table Button */
	.init-table-btn {
		margin-top: 0.75rem;
		padding: 0.75rem 1.5rem;
		background: var(--color-primary);
		color: var(--color-bg);
		border: none;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
		transition: filter 0.2s ease;
	}

	.init-table-btn:hover {
		filter: brightness(1.1);
	}

	/* Tags Grid */
	.tags-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
	}

	.tag-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.75rem 0.5rem;
		background: var(--color-bg-card);
		border: 2px solid transparent;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.tag-btn:hover {
		border-color: rgba(20, 184, 166, 0.4);
	}

	.tag-btn.selected {
		border-color: var(--color-primary);
		background: rgba(20, 184, 166, 0.1);
	}

	.tag-icon {
		font-size: 1.25rem;
		margin-bottom: 0.25rem;
	}

	.tag-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text);
		text-align: center;
	}

	.field-hint {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin: 0.75rem 0 0;
		text-align: center;
	}

	/* Toggle Group (3 options) */
	.toggle-group-3 {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.75rem;
	}

	@media (max-width: 480px) {
		.tags-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.toggle-group-3 {
			grid-template-columns: 1fr;
		}
	}
</style>
