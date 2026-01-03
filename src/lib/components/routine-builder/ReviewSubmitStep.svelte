<script lang="ts">
	/**
	 * ReviewSubmitStep - Step 5 of routine builder wizard
	 * Review all configuration before creating the routine
	 */

	import type {
		Discipline,
		TrackingConfig,
		DisplayConfig,
		RoutineTable
	} from '$lib/types';

	let {
		name,
		description,
		disciplines,
		tags,
		protocolType,
		restBetweenReps,
		repDistance,
		numberOfReps,
		table,
		trackingConfig,
		displayConfig
	}: {
		name: string;
		description: string;
		disciplines: Discipline[];
		tags: string[];
		protocolType: 'none' | 'uniform' | 'table';
		restBetweenReps?: number;
		repDistance?: number;
		numberOfReps?: number;
		table?: RoutineTable;
		trackingConfig: TrackingConfig;
		displayConfig: DisplayConfig;
	} = $props();

	// Count enabled tracking fields
	let trackingCount = $derived(
		Object.values(trackingConfig).filter((value) => value === true).length
	);

	// Format time for display
	function formatTime(seconds: number): string {
		const min = Math.floor(seconds / 60);
		const sec = seconds % 60;
		return `${min}:${sec.toString().padStart(2, '0')}`;
	}

	// Get enabled tracking field labels
	let enabledTracking = $derived.by(() => {
		const labels: string[] = [];
		if (trackingConfig.trackPoolLength) labels.push('Pool Length');
		if (trackingConfig.trackInitialBreatheUpTime) labels.push('Initial Breathe-Up');
		if (trackingConfig.trackTotalDistance) labels.push('Total Distance');
		if (trackingConfig.trackTotalTime) labels.push('Total Time');
		if (trackingConfig.trackRepsCompleted) labels.push('Reps Completed');
		if (trackingConfig.trackRepDuration) labels.push('Rep Duration');
		if (trackingConfig.trackTimePerLap) labels.push('Time Per Lap');
		if (trackingConfig.trackRestBetweenLaps) labels.push('Rest Between Laps');
		if (trackingConfig.trackKicksPerLap) labels.push('Kicks Per Lap');
		if (trackingConfig.trackArmPullsPerLap) labels.push('Arm Pulls Per Lap');
		if (trackingConfig.trackBreathingTechnique) labels.push('Breathing Technique');
		if (trackingConfig.trackRPE) labels.push('RPE');
		if (trackingConfig.trackJoyScale) labels.push('Joy Scale');
		if (trackingConfig.trackHoursSinceLastMeal) labels.push('Hours Since Last Meal');
		if (trackingConfig.trackNotes) labels.push('Notes');
		if (trackingConfig.trackWaterTemperature) labels.push('Water Temperature');
		if (trackingConfig.trackContractionsOnsetTime) labels.push('Contractions Onset');
		if (trackingConfig.trackEquipmentUsed) labels.push('Equipment Used');
		if (trackingConfig.trackBuddyName) labels.push('Buddy Name');
		if (trackingConfig.trackRestingHeartRate) labels.push('Resting Heart Rate');
		if (trackingConfig.trackHRV) labels.push('HRV');
		if (trackingConfig.trackPoolType) labels.push('Pool Type');
		if (trackingConfig.trackSambaBO) labels.push('Samba/BO');
		return labels;
	});
</script>

<div class="review-submit-step">
	<h2 class="step-title">Review & Create</h2>
	<p class="step-description">
		Review your routine configuration below. If everything looks good, click "Create Routine" to
		save it.
	</p>

	<!-- Basic Info -->
	<div class="review-section">
		<h3 class="section-title">Basic Information</h3>
		<div class="review-grid">
			<div class="review-item">
				<div class="item-label">Name</div>
				<div class="item-value">{name}</div>
			</div>

			<div class="review-item">
				<div class="item-label">Disciplines</div>
				<div class="item-value">{disciplines.join(', ')}</div>
			</div>

			<div class="review-item full-width">
				<div class="item-label">Description</div>
				<div class="item-value">{description}</div>
			</div>

			{#if tags.length > 0}
				<div class="review-item full-width">
					<div class="item-label">Tags</div>
					<div class="item-value">
						<div class="tag-list">
							{#each tags as tag}
								<span class="tag-pill">{tag}</span>
							{/each}
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Protocol Setup -->
	<div class="review-section">
		<h3 class="section-title">Protocol</h3>
		<div class="review-grid">
			<div class="review-item">
				<div class="item-label">Type</div>
				<div class="item-value">
					{#if protocolType === 'none'}
						No Structure (Freeform)
					{:else if protocolType === 'uniform'}
						Uniform Intervals
					{:else}
						Variable Table
					{/if}
				</div>
			</div>

			{#if protocolType === 'uniform'}
				{#if numberOfReps}
					<div class="review-item">
						<div class="item-label">Number of Reps</div>
						<div class="item-value">{numberOfReps}</div>
					</div>
				{/if}

				{#if repDistance}
					<div class="review-item">
						<div class="item-label">Distance per Rep</div>
						<div class="item-value">{repDistance}m</div>
					</div>
				{/if}

				{#if restBetweenReps}
					<div class="review-item">
						<div class="item-label">Rest Between Reps</div>
						<div class="item-value">{formatTime(restBetweenReps)}</div>
					</div>
				{/if}
			{/if}

			{#if protocolType === 'table' && table && table.rows.length > 0}
				<div class="review-item full-width">
					<div class="item-label">Table Rows</div>
					<div class="item-value">{table.rows.length} reps configured</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Tracking Configuration -->
	<div class="review-section">
		<h3 class="section-title">Tracking Configuration</h3>
		<div class="review-grid">
			<div class="review-item full-width">
				<div class="item-label">Enabled Fields ({trackingCount})</div>
				<div class="item-value">
					{#if enabledTracking.length > 0}
						<div class="tracking-list">
							{#each enabledTracking as field}
								<span class="tracking-field">✓ {field}</span>
							{/each}
						</div>
					{:else}
						<span class="muted">No tracking fields enabled</span>
					{/if}
				</div>
			</div>
		</div>
	</div>

	<!-- Display Configuration -->
	<div class="review-section">
		<h3 class="section-title">Display Configuration</h3>
		<div class="review-grid">
			<div class="review-item">
				<div class="item-label">Hero Metric</div>
				<div class="item-value">{displayConfig.heroMetricLabel}</div>
			</div>

			<div class="review-item">
				<div class="item-label">Secondary Metric</div>
				<div class="item-value">{displayConfig.secondaryMetricLabel}</div>
			</div>
		</div>
	</div>

	<div class="submission-note">
		<p>Once created, this routine will be available in your routines list for logging workouts.</p>
	</div>
</div>

<style>
	.review-submit-step {
		max-width: 900px;
		margin: 0 auto;
	}

	.step-title {
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--color-text);
		margin-bottom: 0.5rem;
	}

	.step-description {
		font-size: 1rem;
		color: var(--color-text-muted);
		margin-bottom: 2rem;
	}

	.review-section {
		background: rgba(15, 23, 42, 0.3);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 12px;
		padding: 1.5rem;
		margin-bottom: 1.5rem;
	}

	.section-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 1.25rem 0;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid rgba(148, 163, 184, 0.1);
	}

	.review-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.25rem;
	}

	.review-item {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.review-item.full-width {
		grid-column: 1 / -1;
	}

	.item-label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.item-value {
		font-size: 0.9375rem;
		color: var(--color-text);
		line-height: 1.5;
	}

	.tag-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.tag-pill {
		display: inline-block;
		padding: 0.375rem 0.75rem;
		background: rgba(20, 184, 166, 0.15);
		border: 1px solid rgba(20, 184, 166, 0.3);
		border-radius: 16px;
		color: var(--color-primary);
		font-size: 0.8125rem;
		font-weight: 500;
	}

	.tracking-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 0.5rem;
	}

	.tracking-field {
		font-size: 0.875rem;
		color: var(--color-text);
		padding: 0.25rem 0;
	}

	.muted {
		color: var(--color-text-muted);
		font-style: italic;
	}

	.submission-note {
		background: rgba(20, 184, 166, 0.05);
		border: 1px solid rgba(20, 184, 166, 0.2);
		border-radius: 8px;
		padding: 1rem;
		text-align: center;
	}

	.submission-note p {
		color: var(--color-text-muted);
		font-size: 0.9375rem;
		margin: 0;
	}

	/* Mobile responsive */
	@media (max-width: 768px) {
		.review-grid {
			grid-template-columns: 1fr;
		}

		.tracking-list {
			grid-template-columns: 1fr;
		}
	}
</style>
