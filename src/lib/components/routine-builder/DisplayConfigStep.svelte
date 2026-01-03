<script lang="ts">
	/**
	 * DisplayConfigStep - Step 4 of routine builder wizard
	 * Configure hero and secondary metrics for feed card display
	 */

	import type { MetricType, DisplayConfig } from '$lib/types';

	let {
		displayConfig = $bindable<DisplayConfig>({
			heroMetric: 'totalDistance',
			heroMetricLabel: 'Distance',
			secondaryMetric: 'totalTime',
			secondaryMetricLabel: 'Time'
		})
	}: {
		displayConfig: DisplayConfig;
	} = $props();

	// Available metrics for display
	const availableMetrics: { value: MetricType; label: string; description: string }[] = [
		{ value: 'totalDistance', label: 'Total Distance', description: 'Total meters covered' },
		{ value: 'totalTime', label: 'Total Time', description: 'Total dive duration' },
		{ value: 'repsCompleted', label: 'Reps Completed', description: 'Number of repetitions' },
		{
			value: 'avgTimePerLap',
			label: 'Avg Time Per Lap',
			description: 'Average time per lap/rep'
		},
		{
			value: 'avgTimePerRep',
			label: 'Avg Time Per Rep',
			description: 'Average time per repetition'
		},
		{
			value: 'avgRestBetweenLaps',
			label: 'Avg Rest',
			description: 'Average rest interval'
		},
		{
			value: 'totalBreathHoldTime',
			label: 'Total Breath Hold',
			description: 'Sum of all hold durations'
		},
		{
			value: 'totalBreathingTime',
			label: 'Total Breathing Time',
			description: 'Sum of all rest periods'
		},
		{
			value: 'totalBreaths',
			label: 'Total Breaths',
			description: 'Total breaths taken'
		},
		{ value: 'poolLength', label: 'Pool Length', description: 'Pool size' },
		{
			value: 'initialBreatheUpTime',
			label: 'Initial Breathe-Up',
			description: 'Pre-dive breathe-up'
		},
		{
			value: 'waterTemperature',
			label: 'Water Temperature',
			description: 'Pool/water temp'
		},
		{
			value: 'contractionsOnsetTime',
			label: 'Contractions Onset',
			description: 'When contractions started'
		},
		{
			value: 'restingHeartRate',
			label: 'Resting HR',
			description: 'Resting heart rate'
		},
		{ value: 'hrv', label: 'HRV', description: 'Heart rate variability' }
	];

	// Auto-update labels when metric changes
	function updateHeroLabel() {
		const metric = availableMetrics.find((m) => m.value === displayConfig.heroMetric);
		if (metric && !displayConfig.heroMetricLabel) {
			displayConfig.heroMetricLabel = metric.label;
		}
	}

	function updateSecondaryLabel() {
		const metric = availableMetrics.find((m) => m.value === displayConfig.secondaryMetric);
		if (metric && !displayConfig.secondaryMetricLabel) {
			displayConfig.secondaryMetricLabel = metric.label;
		}
	}
</script>

<div class="display-config-step">
	<h2 class="step-title">Display Configuration</h2>
	<p class="step-description">
		Choose which metrics to display prominently on your routine's feed card. The hero metric will
		be shown large, with the secondary metric below it.
	</p>

	<div class="preview-section">
		<div class="preview-label">Preview</div>
		<div class="mock-card">
			<div class="card-header">
				<div class="routine-name">Your Routine Name</div>
				<div class="routine-meta">Today • Morning</div>
			</div>
			<div class="card-metrics">
				<div class="hero-metric">
					<div class="metric-value">{displayConfig.heroMetricLabel || 'Select Hero'}</div>
					<div class="metric-label">Hero Metric</div>
				</div>
				<div class="secondary-metric">
					<div class="metric-label">{displayConfig.secondaryMetricLabel || 'Select Secondary'}</div>
					<div class="metric-value-sm">Secondary</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Hero Metric Selection -->
	<div class="form-section">
		<label for="hero-metric" class="form-label">
			Hero Metric <span class="required">*</span>
		</label>
		<p class="field-hint">This will be displayed prominently (large) on feed cards</p>
		<select
			id="hero-metric"
			class="form-select"
			bind:value={displayConfig.heroMetric}
			on:change={updateHeroLabel}
		>
			{#each availableMetrics as metric}
				<option value={metric.value}>{metric.label} - {metric.description}</option>
			{/each}
		</select>

		<label for="hero-label" class="form-label sub-label">Custom Label (Optional)</label>
		<input
			id="hero-label"
			type="text"
			class="form-input"
			bind:value={displayConfig.heroMetricLabel}
			placeholder={availableMetrics.find((m) => m.value === displayConfig.heroMetric)?.label ||
				''}
			maxlength="30"
		/>
	</div>

	<!-- Secondary Metric Selection -->
	<div class="form-section">
		<label for="secondary-metric" class="form-label">
			Secondary Metric <span class="required">*</span>
		</label>
		<p class="field-hint">This will be displayed smaller, below the hero metric</p>
		<select
			id="secondary-metric"
			class="form-select"
			bind:value={displayConfig.secondaryMetric}
			on:change={updateSecondaryLabel}
		>
			{#each availableMetrics as metric}
				<option value={metric.value}>{metric.label} - {metric.description}</option>
			{/each}
		</select>

		<label for="secondary-label" class="form-label sub-label">Custom Label (Optional)</label>
		<input
			id="secondary-label"
			type="text"
			class="form-input"
			bind:value={displayConfig.secondaryMetricLabel}
			placeholder={availableMetrics.find((m) => m.value === displayConfig.secondaryMetric)
				?.label || ''}
			maxlength="30"
		/>
	</div>
</div>

<style>
	.display-config-step {
		max-width: 700px;
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

	.preview-section {
		margin-bottom: 2rem;
	}

	.preview-label {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text-muted);
		margin-bottom: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.mock-card {
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 12px;
		padding: 1.25rem;
	}

	.card-header {
		margin-bottom: 1rem;
	}

	.routine-name {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: 0.25rem;
	}

	.routine-meta {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}

	.card-metrics {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(148, 163, 184, 0.1);
	}

	.hero-metric {
		flex: 1;
	}

	.hero-metric .metric-value {
		font-size: 2rem;
		font-weight: 700;
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		margin-bottom: 0.25rem;
	}

	.hero-metric .metric-label {
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}

	.secondary-metric {
		text-align: right;
		flex-shrink: 0;
	}

	.secondary-metric .metric-label {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin-bottom: 0.25rem;
	}

	.secondary-metric .metric-value-sm {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.form-section {
		margin-bottom: 2rem;
	}

	.form-label {
		display: block;
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: 0.5rem;
	}

	.sub-label {
		margin-top: 1rem;
		font-weight: 500;
		font-size: 0.875rem;
	}

	.required {
		color: #ef4444;
	}

	.field-hint {
		font-size: 0.875rem;
		color: var(--color-text-muted);
		margin-bottom: 0.75rem;
	}

	.form-select,
	.form-input {
		width: 100%;
		padding: 0.75rem 1rem;
		background: rgba(15, 23, 42, 0.5);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 8px;
		color: var(--color-text);
		font-size: 0.9375rem;
		transition: all 0.2s ease;
	}

	.form-select:focus,
	.form-input:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.1);
	}

	/* Mobile responsive */
	@media (max-width: 640px) {
		.card-metrics {
			flex-direction: column;
			align-items: flex-start;
			gap: 1rem;
		}

		.secondary-metric {
			text-align: left;
		}

		.hero-metric .metric-value {
			font-size: 1.75rem;
		}
	}
</style>
