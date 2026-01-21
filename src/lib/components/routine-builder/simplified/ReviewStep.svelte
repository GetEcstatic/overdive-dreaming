<script lang="ts">
	/**
	 * ReviewStep - Final review before saving the routine
	 */

	import type { 
		SimplifiedRoutineType, 
		EffortLevel, 
		Discipline,
		MaxDivePosition,
		TrackingPreset,
		TrackingConfig,
		IntervalStructure,
		DisplayConfig,
		RoutineTable
	} from '$lib/types';

	let {
		name,
		description,
		selectedType,
		disciplines,
		effortLevel,
		isDry,
		intervalStructure,
		numberOfReps,
		restBetweenReps,
		repDistance,
		table,
		maxDivePosition,
		hybridMaxEffort,
		trackingPreset,
		trackingConfig,
		displayConfig,
		tags
	}: {
		name: string;
		description: string;
		selectedType: SimplifiedRoutineType | null;
		disciplines: Discipline[];
		effortLevel: EffortLevel;
		isDry: boolean;
		intervalStructure: IntervalStructure;
		numberOfReps: number;
		restBetweenReps: number;
		repDistance?: number;
		table?: RoutineTable;
		maxDivePosition: MaxDivePosition;
		hybridMaxEffort: EffortLevel;
		trackingPreset: TrackingPreset;
		trackingConfig: TrackingConfig;
		displayConfig: DisplayConfig;
		tags: string[];
	} = $props();

	// Get discipline label
	function getDisciplineLabel(d: Discipline): string {
		const labels: Record<Discipline, string> = {
			STA: 'Static Apnea',
			DYN: 'Dynamic with Fins',
			DNF: 'Dynamic No Fins',
			DYNB: 'Dynamic Bifins'
		};
		return labels[d] || d;
	}

	// Get type display info
	function getTypeInfo(type: SimplifiedRoutineType): { label: string; icon: string } {
		const info = {
			'max-attempt': { label: 'Max Attempt', icon: '🎯' },
			'interval-series': { label: 'Interval Series', icon: '🔄' },
			'hybrid': { label: 'Hybrid', icon: '⚡' }
		};
		return info[type];
	}

	// Get effort label
	function getEffortLabel(effort: EffortLevel): string {
		return effort === 'max' ? 'Maximum Effort' : 'Submax / Comfortable';
	}

	// Get position label
	function getPositionLabel(pos: MaxDivePosition): string {
		const labels = {
			start: 'Start (max first)',
			middle: 'Middle',
			end: 'End (max last)'
		};
		return labels[pos];
	}

	// Count enabled tracking fields
	let enabledTrackingFields = $derived(
		Object.entries(trackingConfig)
			.filter(([key, val]) => val === true && key !== 'isDryTraining')
			.map(([key]) => key.replace('track', '').replace(/([A-Z])/g, ' $1').trim())
	);

	// Calculate routine structure summary
	let structureSummary = $derived(() => {
		if (selectedType === 'max-attempt') {
			return `Single ${effortLevel === 'max' ? 'maximum' : 'submaximal'} ${isDry ? 'dry' : 'wet'} attempt`;
		}
		
		if (selectedType === 'interval-series') {
			if (intervalStructure === 'uniform') {
				return `${numberOfReps} reps with ${restBetweenReps}s rest`;
			} else {
				return `${table?.rows?.length || 0} custom intervals`;
			}
		}

		if (selectedType === 'hybrid') {
			const numIntervals = table?.rows?.length || numberOfReps;
			const warmupCount = maxDivePosition === 'start' ? 0 : maxDivePosition === 'end' ? numIntervals : Math.floor(numIntervals / 2);
			const cooldownCount = maxDivePosition === 'start' ? numIntervals : maxDivePosition === 'end' ? 0 : numIntervals - warmupCount;
			
			let parts = [];
			if (warmupCount > 0) parts.push(`${warmupCount} warmup`);
			parts.push('1 max');
			if (cooldownCount > 0) parts.push(`${cooldownCount} cooldown`);
			return parts.join(' → ');
		}

		return '';
	});

	const typeInfo = $derived(selectedType ? getTypeInfo(selectedType) : { label: 'Unknown', icon: '❓' });
</script>

<div class="review-step">
	<div class="header">
		<h1>✅ Review & Save</h1>
		<p class="subtitle">Check everything looks good before saving</p>
	</div>

	<!-- Routine Overview Card -->
	<section class="review-card main-card">
		<div class="routine-header">
			<span class="type-icon">{typeInfo.icon}</span>
			<div class="routine-title">
				<h2>{name || 'Untitled Routine'}</h2>
				<span class="type-badge">{typeInfo.label}</span>
			</div>
		</div>

		{#if description}
			<p class="routine-description">{description}</p>
		{/if}
	</section>

	<!-- Configuration Details -->
	<section class="review-card">
		<h3>⚙️ Configuration</h3>
		
		<div class="detail-grid">
			<div class="detail-row">
				<span class="detail-label">Discipline{disciplines.length > 1 ? 's' : ''}</span>
				<span class="detail-value">
					{disciplines.map(d => d).join(', ')}
				</span>
			</div>

			{#if selectedType === 'max-attempt' || selectedType === 'hybrid'}
				<div class="detail-row">
					<span class="detail-label">Effort Level</span>
					<span class="detail-value">
						{effortLevel === 'max' ? '🔥 Maximum' : '😌 Submax'}
					</span>
				</div>
			{/if}

			{#if disciplines.includes('STA')}
				<div class="detail-row">
					<span class="detail-label">Environment</span>
					<span class="detail-value">
						{isDry ? '🏠 Dry (land)' : '🏊 Wet (water)'}
					</span>
				</div>
			{/if}

			<div class="detail-row">
				<span class="detail-label">Structure</span>
				<span class="detail-value">{structureSummary()}</span>
			</div>
		</div>
	</section>

	<!-- Structure Preview -->
	{#if selectedType !== 'max-attempt'}
		<section class="review-card">
			<h3>📋 Structure Preview</h3>
			
			{#if selectedType === 'interval-series'}
				{#if intervalStructure === 'uniform'}
					<div class="structure-preview uniform">
						{#each Array(Math.min(numberOfReps, 5)) as _, i}
							<div class="rep-block">
								<span class="rep-num">#{i + 1}</span>
								<span class="rep-rest">{restBetweenReps}s rest</span>
							</div>
						{/each}
						{#if numberOfReps > 5}
							<div class="more-indicator">+{numberOfReps - 5} more</div>
						{/if}
					</div>
				{:else if table?.rows}
					<div class="structure-preview variable">
						{#each table.rows.slice(0, 5) as row, i}
							<div class="rep-block">
								<span class="rep-num">#{i + 1}</span>
								{#if row.targetDuration}
									<span class="rep-target">{row.targetDuration}s</span>
								{:else if row.targetDistance}
									<span class="rep-target">{row.targetDistance}m</span>
								{/if}
								{#if row.restBefore}
									<span class="rep-rest">{row.restBefore}s rest</span>
								{/if}
							</div>
						{/each}
						{#if table.rows.length > 5}
							<div class="more-indicator">+{table.rows.length - 5} more</div>
						{/if}
					</div>
				{/if}
			{:else if selectedType === 'hybrid'}
				{@const numIntervals = table?.rows?.length || numberOfReps}
				<div class="structure-preview hybrid">
					{#if maxDivePosition !== 'start'}
						<div class="phase warmup">
							<span class="phase-label">Warmup</span>
							<span class="phase-count">
								{maxDivePosition === 'end' ? numIntervals : Math.floor(numIntervals / 2)} reps
							</span>
						</div>
					{/if}
					<div class="phase max">
						<span class="phase-label">Max</span>
						<span class="phase-effort">{hybridMaxEffort === 'max' ? '🔥' : '😌'}</span>
					</div>
					{#if maxDivePosition !== 'end'}
						<div class="phase cooldown">
							<span class="phase-label">Cooldown</span>
							<span class="phase-count">
								{maxDivePosition === 'start' ? numIntervals : numIntervals - Math.floor(numIntervals / 2)} reps
							</span>
						</div>
					{/if}
				</div>
			{/if}
		</section>
	{/if}

	<!-- Tracking Summary -->
	<section class="review-card">
		<h3>📊 Tracking</h3>
		
		<div class="tracking-summary">
			<div class="preset-badge">
				{trackingPreset === 'minimal' && '📝 Minimal'}
				{trackingPreset === 'standard' && '📊 Standard'}
				{trackingPreset === 'full' && '🔬 Full'}
				{trackingPreset === 'custom' && '⚙️ Custom'}
			</div>
			<span class="field-count">{enabledTrackingFields.length} fields</span>
		</div>

		{#if enabledTrackingFields.length > 0}
			<div class="tracking-fields">
				{#each enabledTrackingFields.slice(0, 8) as field}
					<span class="field-chip">{field}</span>
				{/each}
				{#if enabledTrackingFields.length > 8}
					<span class="field-chip more">+{enabledTrackingFields.length - 8} more</span>
				{/if}
			</div>
		{/if}
	</section>

	<!-- Ready Message -->
	<div class="ready-message">
		<span class="check-icon">✨</span>
		<p>Ready to save! You can always edit this routine later.</p>
	</div>
</div>

<style>
	.review-step {
		padding: 1rem 0;
	}

	.header {
		text-align: center;
		margin-bottom: 1.5rem;
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

	/* Review Cards */
	.review-card {
		background: var(--color-bg-card);
		border-radius: 12px;
		padding: 1.25rem;
		margin-bottom: 1rem;
	}

	.review-card h3 {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 1rem;
	}

	/* Main Card - Routine Header */
	.main-card {
		border: 2px solid var(--color-primary);
		background: rgba(20, 184, 166, 0.05);
	}

	.routine-header {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
	}

	.type-icon {
		font-size: 2rem;
		line-height: 1;
	}

	.routine-title h2 {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0;
	}

	.type-badge {
		display: inline-block;
		margin-top: 0.25rem;
		padding: 0.2rem 0.5rem;
		background: rgba(20, 184, 166, 0.2);
		color: var(--color-primary);
		font-size: 0.75rem;
		font-weight: 600;
		border-radius: 4px;
	}

	.routine-description {
		margin: 1rem 0 0;
		color: var(--color-text-muted);
		font-size: 0.9rem;
		font-style: italic;
	}

	/* Detail Grid */
	.detail-grid {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid rgba(148, 163, 184, 0.1);
	}

	.detail-row:last-child {
		border-bottom: none;
		padding-bottom: 0;
	}

	.detail-label {
		font-size: 0.85rem;
		color: var(--color-text-muted);
	}

	.detail-value {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text);
	}

	/* Structure Preview */
	.structure-preview {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	.rep-block {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.5rem 0.75rem;
		background: rgba(20, 184, 166, 0.1);
		border-radius: 6px;
		min-width: 50px;
	}

	.rep-num {
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--color-primary);
	}

	.rep-target {
		font-size: 0.7rem;
		color: var(--color-text);
	}

	.rep-rest {
		font-size: 0.65rem;
		color: var(--color-text-muted);
	}

	.more-indicator {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		font-style: italic;
	}

	/* Hybrid Structure */
	.structure-preview.hybrid {
		gap: 0.75rem;
		justify-content: center;
	}

	.phase {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.75rem 1rem;
		border-radius: 8px;
		min-width: 70px;
	}

	.phase.warmup {
		background: rgba(59, 130, 246, 0.15);
	}

	.phase.max {
		background: rgba(239, 68, 68, 0.15);
		border: 2px solid rgba(239, 68, 68, 0.3);
	}

	.phase.cooldown {
		background: rgba(34, 197, 94, 0.15);
	}

	.phase-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.phase-count,
	.phase-effort {
		font-size: 0.7rem;
		color: var(--color-text-muted);
	}

	.phase-effort {
		font-size: 1rem;
		margin-top: 0.25rem;
	}

	/* Tracking Summary */
	.tracking-summary {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 0.75rem;
	}

	.preset-badge {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.field-count {
		font-size: 0.8rem;
		color: var(--color-text-muted);
	}

	.tracking-fields {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.field-chip {
		padding: 0.25rem 0.5rem;
		background: rgba(148, 163, 184, 0.1);
		color: var(--color-text-muted);
		font-size: 0.7rem;
		border-radius: 4px;
	}

	.field-chip.more {
		background: rgba(20, 184, 166, 0.1);
		color: var(--color-primary);
	}

	/* Ready Message */
	.ready-message {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		margin-top: 1.5rem;
		padding: 1rem;
		background: rgba(34, 197, 94, 0.1);
		border: 1px solid rgba(34, 197, 94, 0.2);
		border-radius: 8px;
		text-align: center;
	}

	.check-icon {
		font-size: 1.5rem;
	}

	.ready-message p {
		margin: 0;
		font-size: 0.9rem;
		color: var(--color-text);
	}
</style>
