<script lang="ts">
	/**
	 * HybridConfig - Configuration for hybrid routines (intervals + max)
	 */

	import type { 
		Discipline, 
		IntervalStructure, 
		DisplayConfig, 
		RoutineTable,
		MaxDivePosition,
		EffortLevel 
	} from '$lib/types';
	import TableEditor from '../TableEditor.svelte';
	import DisplayMetricSelector from './DisplayMetricSelector.svelte';

	let {
		name = $bindable(),
		description = $bindable(),
		disciplines = $bindable(),
		intervalStructure = $bindable(),
		numberOfReps = $bindable(),
		restBetweenReps = $bindable(),
		repDistance = $bindable(),
		table = $bindable(),
		maxDivePosition = $bindable(),
		maxDiveRepNumber = $bindable(),
		hybridMaxEffort = $bindable(),
		displayConfig = $bindable()
	}: {
		name: string;
		description: string;
		disciplines: Discipline[];
		intervalStructure: IntervalStructure;
		numberOfReps: number;
		restBetweenReps: number;
		repDistance: number | undefined;
		table: RoutineTable | undefined;
		maxDivePosition: MaxDivePosition;
		maxDiveRepNumber: number;
		hybridMaxEffort: EffortLevel;
		displayConfig: DisplayConfig;
	} = $props();

	const allDisciplines: Array<{ value: Discipline; label: string; description: string }> = [
		{ value: 'DYN', label: 'DYN', description: 'Dynamic with fins' },
		{ value: 'DNF', label: 'DNF', description: 'Dynamic no fins' },
		{ value: 'DYNB', label: 'DYNB', description: 'Dynamic bifins' },
		{ value: 'STA', label: 'STA', description: 'Static apnea' }
	];

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
		displayConfig = {
			heroMetric: 'totalDistance',
			heroMetricLabel: 'Max Distance',
			secondaryMetric: 'repsCompleted',
			secondaryMetricLabel: 'Interval Reps'
		};
	}

	function formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	// Calculate total reps (intervals + max dive)
	let totalReps = $derived(
		intervalStructure === 'variable' && table
			? table.rows.length + 1  // variable table rows + 1 max dive
			: numberOfReps + 1       // uniform reps + 1 max dive
	);

	// Update maxDivePosition when rep number changes
	$effect(() => {
		if (maxDiveRepNumber === 1) {
			maxDivePosition = 'start';
		} else if (maxDiveRepNumber >= totalReps) {
			maxDivePosition = 'end';
		} else {
			maxDivePosition = 'middle';
		}
	});

	// Legacy position options for simpler selection
	const positionOptions: Array<{ value: MaxDivePosition; label: string; icon: string; desc: string }> = [
		{ value: 'start', label: 'Start', icon: '⬆️', desc: 'Max dive first, then intervals' },
		{ value: 'middle', label: 'Middle', icon: '↔️', desc: 'Intervals → Max → Intervals' },
		{ value: 'end', label: 'End', icon: '⬇️', desc: 'Warmup intervals, then max dive' }
	];
</script>

<div class="hybrid-config">
	<div class="header">
		<h1>⚡ Hybrid Routine</h1>
		<p class="subtitle">Combine intervals with a max effort dive</p>
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
				placeholder="e.g., Competition Warmup + Max"
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

	<!-- Max Dive Position -->
	<section class="form-section">
		<h2>Max Dive Position</h2>
		<p class="section-hint">Which rep will be your max effort dive?</p>

		<div class="max-position-selector">
			<div class="rep-selector">
				<label for="maxDiveRepNumber">Max dive is rep</label>
				<div class="rep-input-group">
					<button
						type="button"
						class="rep-adjust-btn"
						onclick={() => maxDiveRepNumber = Math.max(1, maxDiveRepNumber - 1)}
						disabled={maxDiveRepNumber <= 1}
					>−</button>
					<input
						id="maxDiveRepNumber"
						type="number"
						bind:value={maxDiveRepNumber}
						min="1"
						max={totalReps}
						class="rep-number-input"
					/>
					<button
						type="button"
						class="rep-adjust-btn"
						onclick={() => maxDiveRepNumber = Math.min(totalReps, maxDiveRepNumber + 1)}
						disabled={maxDiveRepNumber >= totalReps}
					>+</button>
					<span class="total-reps">of {totalReps} total reps</span>
				</div>
			</div>

			<div class="quick-positions">
				<button
					type="button"
					class="quick-pos-btn"
					class:active={maxDiveRepNumber === 1}
					onclick={() => maxDiveRepNumber = 1}
				>
					First
				</button>
				<button
					type="button"
					class="quick-pos-btn"
					class:active={maxDiveRepNumber === Math.ceil(totalReps / 2)}
					onclick={() => maxDiveRepNumber = Math.ceil(totalReps / 2)}
				>
					Middle
				</button>
				<button
					type="button"
					class="quick-pos-btn"
					class:active={maxDiveRepNumber === totalReps}
					onclick={() => maxDiveRepNumber = totalReps}
				>
					Last
				</button>
			</div>

			<p class="position-desc">
				{#if maxDiveRepNumber === 1}
					🔥 Max dive first, then {totalReps - 1} warmdown intervals
				{:else if maxDiveRepNumber === totalReps}
					💪 {totalReps - 1} warmup intervals, then max dive
				{:else}
					↔️ {maxDiveRepNumber - 1} warmup interval{maxDiveRepNumber > 2 ? 's' : ''}, then max dive, then {totalReps - maxDiveRepNumber} cooldown interval{totalReps - maxDiveRepNumber > 1 ? 's' : ''}
				{/if}
			</p>
		</div>
	</section>

	<!-- Max Dive Effort Level -->
	<section class="form-section">
		<h2>Max Dive Effort</h2>
		<p class="section-hint">Is the max dive a true max or sub-max?</p>

		<div class="toggle-group">
			<button
				type="button"
				class="toggle-btn"
				class:active={hybridMaxEffort === 'max'}
				onclick={() => (hybridMaxEffort = 'max')}
			>
				<span class="toggle-icon">🔥</span>
				<span class="toggle-label">Max</span>
			</button>
			<button
				type="button"
				class="toggle-btn"
				class:active={hybridMaxEffort === 'submax'}
				onclick={() => (hybridMaxEffort = 'submax')}
			>
				<span class="toggle-icon">💪</span>
				<span class="toggle-label">Sub-Max</span>
			</button>
		</div>
	</section>

	<!-- Interval Configuration -->
	<section class="form-section">
		<h2>Interval Settings</h2>
		<p class="section-hint">Configure the interval portion of the routine</p>

		<div class="toggle-group" style="margin-bottom: 1.5rem;">
			<button
				type="button"
				class="toggle-btn"
				class:active={intervalStructure === 'uniform'}
				onclick={() => (intervalStructure = 'uniform')}
			>
				<span class="toggle-icon">⬜</span>
				<span class="toggle-label">Uniform</span>
			</button>
			<button
				type="button"
				class="toggle-btn"
				class:active={intervalStructure === 'variable'}
				onclick={() => (intervalStructure = 'variable')}
			>
				<span class="toggle-icon">📈</span>
				<span class="toggle-label">Variable</span>
			</button>
		</div>

		{#if intervalStructure === 'uniform'}
			<div class="interval-grid">
				<div class="form-group">
					<label for="numberOfReps">Interval Reps</label>
					<input
						id="numberOfReps"
						type="number"
						bind:value={numberOfReps}
						min="1"
						max="20"
					/>
				</div>

				<div class="form-group">
					<label for="restBetweenReps">Rest Between (sec)</label>
					<input
						id="restBetweenReps"
						type="number"
						bind:value={restBetweenReps}
						min="0"
						step="5"
					/>
				</div>

				{#if !isStatic}
					<div class="form-group">
						<label for="repDistance">Rep Distance (m)</label>
						<input
							id="repDistance"
							type="number"
							bind:value={repDistance}
							min="1"
							placeholder="e.g., 25"
						/>
					</div>
				{/if}
			</div>
		{:else if intervalStructure === 'variable' && table}
			<TableEditor 
				bind:table={table}
				isStatic={isStatic}
			/>
		{/if}
	</section>

	<!-- Visual Preview -->
	<section class="form-section">
		<h2>Routine Structure Preview</h2>
		<div class="structure-preview">
			{#if maxDivePosition === 'start'}
				<div class="preview-segment max">🎯 Max Dive</div>
				<div class="preview-arrow">→</div>
				<div class="preview-segment intervals">🔄 {numberOfReps || '_'} Intervals</div>
			{:else if maxDivePosition === 'middle'}
				<div class="preview-segment intervals">🔄 {Math.floor((numberOfReps || 4) / 2)} Int.</div>
				<div class="preview-arrow">→</div>
				<div class="preview-segment max">🎯 Max</div>
				<div class="preview-arrow">→</div>
				<div class="preview-segment intervals">🔄 {Math.ceil((numberOfReps || 4) / 2)} Int.</div>
			{:else}
				<div class="preview-segment intervals">🔄 {numberOfReps || '_'} Intervals</div>
				<div class="preview-arrow">→</div>
				<div class="preview-segment max">🎯 Max Dive</div>
			{/if}
		</div>
	</section>

	<!-- Display Settings -->
	<DisplayMetricSelector bind:displayConfig />
</div>

<style>
	.hybrid-config {
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

	/* Position Grid */
	.position-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.75rem;
	}

	.position-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 1rem 0.5rem;
		background: var(--color-bg-card);
		border: 2px solid transparent;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.position-btn:hover {
		border-color: rgba(20, 184, 166, 0.4);
	}

	.position-btn.active {
		border-color: var(--color-primary);
		background: rgba(20, 184, 166, 0.1);
	}

	.pos-icon {
		font-size: 1.5rem;
		margin-bottom: 0.5rem;
	}

	.pos-label {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.pos-desc {
		font-size: 0.65rem;
		color: var(--color-text-muted);
		margin-top: 0.25rem;
		text-align: center;
		line-height: 1.3;
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
		padding: 0.75rem;
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
		font-size: 1.25rem;
		margin-bottom: 0.25rem;
	}

	.toggle-label {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--color-text);
	}

	/* Interval Grid */
	.interval-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
	}

	/* Structure Preview */
	.structure-preview {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 1.5rem 1rem;
		background: var(--color-bg-card);
		border-radius: 12px;
		flex-wrap: wrap;
	}

	.preview-segment {
		padding: 0.75rem 1rem;
		border-radius: 8px;
		font-weight: 600;
		font-size: 0.85rem;
	}

	.preview-segment.max {
		background: rgba(251, 191, 36, 0.2);
		color: #fbbf24;
		border: 1px solid rgba(251, 191, 36, 0.3);
	}

	.preview-segment.intervals {
		background: rgba(20, 184, 166, 0.15);
		color: var(--color-primary);
		border: 1px solid rgba(20, 184, 166, 0.3);
	}

	.preview-arrow {
		color: var(--color-text-muted);
		font-size: 1.25rem;
	}

	/* Max Position Selector */
	.max-position-selector {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.rep-selector {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.rep-selector label {
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--color-text-muted);
	}

	.rep-input-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.rep-adjust-btn {
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.3);
		border-radius: 8px;
		color: var(--color-text);
		font-size: 1.25rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.rep-adjust-btn:hover:not(:disabled) {
		border-color: var(--color-primary);
		background: rgba(20, 184, 166, 0.1);
	}

	.rep-adjust-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.rep-number-input {
		width: 60px;
		padding: 0.5rem;
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.3);
		border-radius: 8px;
		color: var(--color-text);
		font-size: 1.1rem;
		font-weight: 600;
		text-align: center;
	}

	.rep-number-input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.total-reps {
		font-size: 0.9rem;
		color: var(--color-text-muted);
		margin-left: 0.5rem;
	}

	.quick-positions {
		display: flex;
		gap: 0.5rem;
	}

	.quick-pos-btn {
		flex: 1;
		padding: 0.5rem 0.75rem;
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.3);
		border-radius: 8px;
		color: var(--color-text-muted);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.quick-pos-btn:hover {
		border-color: rgba(20, 184, 166, 0.4);
		color: var(--color-text);
	}

	.quick-pos-btn.active {
		border-color: var(--color-primary);
		background: rgba(20, 184, 166, 0.1);
		color: var(--color-primary);
	}

	.position-desc {
		padding: 0.75rem 1rem;
		background: var(--color-bg-card);
		border-radius: 8px;
		font-size: 0.85rem;
		color: var(--color-text-muted);
		text-align: center;
		margin: 0;
	}
</style>
