<script lang="ts">
	/**
	 * MaxAttemptConfig - Configuration for max attempt routines
	 */

	import type { Discipline, EffortLevel, DisplayConfig } from '$lib/types';

	let {
		name = $bindable(),
		description = $bindable(),
		disciplines = $bindable(),
		effortLevel = $bindable(),
		isDry = $bindable(),
		displayConfig = $bindable()
	}: {
		name: string;
		description: string;
		disciplines: Discipline[];
		effortLevel: EffortLevel;
		isDry: boolean;
		displayConfig: DisplayConfig;
	} = $props();

	const allDisciplines: Array<{ value: Discipline; label: string; description: string }> = [
		{ value: 'DYN', label: 'DYN', description: 'Dynamic with fins' },
		{ value: 'DNF', label: 'DNF', description: 'Dynamic no fins' },
		{ value: 'DYNB', label: 'DYNB', description: 'Dynamic bifins' },
		{ value: 'STA', label: 'STA', description: 'Static apnea' }
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

	<!-- Effort Level -->
	<section class="form-section">
		<h2>Effort Level</h2>
		<p class="section-hint">Is this a true maximum attempt or a sub-max effort?</p>

		<div class="toggle-group">
			<button
				type="button"
				class="toggle-btn"
				class:active={effortLevel === 'max'}
				onclick={() => (effortLevel = 'max')}
			>
				<span class="toggle-icon">🔥</span>
				<span class="toggle-label">Max</span>
				<span class="toggle-desc">True maximum effort</span>
			</button>
			<button
				type="button"
				class="toggle-btn"
				class:active={effortLevel === 'submax'}
				onclick={() => (effortLevel = 'submax')}
			>
				<span class="toggle-icon">💪</span>
				<span class="toggle-label">Sub-Max</span>
				<span class="toggle-desc">Below full capacity</span>
			</button>
		</div>
	</section>

	<!-- Dry/Wet (for STA only) -->
	{#if isStatic}
		<section class="form-section">
			<h2>Training Environment</h2>
			<p class="section-hint">Is this dry (land-based) or wet (pool) training?</p>

			<div class="toggle-group">
				<button
					type="button"
					class="toggle-btn"
					class:active={!isDry}
					onclick={() => (isDry = false)}
				>
					<span class="toggle-icon">🏊</span>
					<span class="toggle-label">Wet</span>
					<span class="toggle-desc">Pool/water training</span>
				</button>
				<button
					type="button"
					class="toggle-btn"
					class:active={isDry}
					onclick={() => (isDry = true)}
				>
					<span class="toggle-icon">🛋️</span>
					<span class="toggle-label">Dry</span>
					<span class="toggle-desc">Land-based / Stamina app</span>
				</button>
			</div>

			{#if isDry}
				<div class="info-box">
					<span class="info-icon">💡</span>
					<p>Dry training routines support CSV import from Stamina app for SpO2/HR data.</p>
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
</style>
