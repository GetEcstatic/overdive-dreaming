<script lang="ts">
	/**
	 * MaxAttemptConfig - Configuration for max attempt routines
	 */

	import type { Discipline, DisplayConfig, TrainingEnvironment } from '$lib/types';

	let {
		name = $bindable(),
		description = $bindable(),
		disciplines = $bindable(),
		trainingEnvironment = $bindable(),
		routineTags = $bindable(),
		displayConfig = $bindable()
	}: {
		name: string;
		description: string;
		disciplines: Discipline[];
		trainingEnvironment: TrainingEnvironment;
		routineTags: string[];
		displayConfig: DisplayConfig;
	} = $props();

	const allDisciplines: Array<{ value: Discipline; label: string; description: string }> = [
		{ value: 'DYN', label: 'DYN', description: 'Dynamic with fins' },
		{ value: 'DNF', label: 'DNF', description: 'Dynamic no fins' },
		{ value: 'DYNB', label: 'DYNB', description: 'Dynamic bifins' },
		{ value: 'STA', label: 'STA', description: 'Static apnea' }
	];

	// Available tags for max attempt routines
	const availableTags = [
		{ value: 'max', label: 'Max Effort', icon: '🔥', description: 'True maximum attempt' },
		{ value: 'submax', label: 'Sub-Max', icon: '💪', description: 'Below full capacity' },
		{ value: 'competition', label: 'Competition', icon: '🏆', description: 'Competition dive' },
		{ value: 'training', label: 'Training', icon: '📚', description: 'Training session' },
		{ value: 'warmup', label: 'Warm-up', icon: '🌡️', description: 'Warm-up dive' },
		{ value: 'pb-attempt', label: 'PB Attempt', icon: '⭐', description: 'Personal best attempt' },
	];

	// Is static discipline selected?
	let isStatic = $derived(disciplines.includes('STA'));
	let isDynamic = $derived(disciplines.some(d => ['DYN', 'DNF', 'DYNB'].includes(d)));

	function toggleDiscipline(discipline: Discipline) {
		if (disciplines.includes(discipline)) {
			disciplines = disciplines.filter(d => d !== discipline);
		} else {
			disciplines = [...disciplines, discipline];
		}
		updateDisplayConfig();
	}

	function toggleTag(tag: string) {
		if (routineTags.includes(tag)) {
			routineTags = routineTags.filter(t => t !== tag);
		} else {
			routineTags = [...routineTags, tag];
		}
	}

	function updateDisplayConfig() {
		if (disciplines.includes('STA') && !isDynamic) {
			displayConfig = {
				heroMetric: 'totalTime',
				heroMetricLabel: 'Hold Time',
				secondaryMetric: 'totalDistance',
				secondaryMetricLabel: 'Distance'
			};
		} else {
			displayConfig = {
				heroMetric: 'totalDistance',
				heroMetricLabel: 'Distance',
				secondaryMetric: 'totalTime',
				secondaryMetricLabel: 'Time'
			};
		}
	}
</script>

<div class="max-attempt-config">
	<div class="header">
		<h1>🎯 Max Attempt</h1>
		<p class="subtitle">Configure your single dive routine</p>
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
				placeholder="e.g., Competition Max DYN"
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
		<p class="section-hint">Which discipline(s) can this routine be used for?</p>

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
		<p class="field-hint">Tags like Max/Sub-Max help filter dives in analytics</p>
	</section>

	<!-- Dry/Wet (for STA only) -->
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

			{#if trainingEnvironment === 'dry'}
				<div class="info-box">
					<span class="info-icon">💡</span>
					<p>Dry training supports CSV import from Stamina app for SpO2/HR data.</p>
				</div>
			{:else if trainingEnvironment === 'both'}
				<div class="info-box">
					<span class="info-icon">💡</span>
					<p>You'll choose wet or dry when logging each session. CSV import available for dry sessions.</p>
				</div>
			{/if}
		</section>
	{/if}
</div>

<style>
	.max-attempt-config {
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

	/* Info Box */
	.info-box {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		margin-top: 1rem;
		padding: 1rem;
		background: rgba(20, 184, 166, 0.1);
		border-radius: 8px;
		border-left: 3px solid var(--color-primary);
	}

	.info-icon {
		font-size: 1.25rem;
		flex-shrink: 0;
	}

	.info-box p {
		margin: 0;
		font-size: 0.85rem;
		color: var(--color-text-muted);
		line-height: 1.4;
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
		margin-top: 0.75rem;
		font-style: italic;
	}

	/* 3-option toggle group */
	.toggle-group-3 {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
	}

	.toggle-group-3 .toggle-btn {
		padding: 0.75rem 0.5rem;
	}

	.toggle-group-3 .toggle-label {
		font-size: 0.85rem;
	}

	.toggle-group-3 .toggle-desc {
		font-size: 0.65rem;
	}
</style>
