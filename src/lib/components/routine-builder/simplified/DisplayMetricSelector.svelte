<script lang="ts">
	/**
	 * DisplayMetricSelector - Reusable component for selecting hero/secondary metrics
	 * Used in MaxAttemptConfig, IntervalConfig, and HybridConfig
	 */

	import type { MetricType, DisplayConfig } from '$lib/types';

	let {
		displayConfig = $bindable<DisplayConfig>()
	}: {
		displayConfig: DisplayConfig;
	} = $props();

	// Available metrics for display - curated for most common use cases
	const availableMetrics: { value: MetricType; label: string; description: string }[] = [
		{ value: 'totalDistance', label: 'Total Distance', description: 'Total meters covered' },
		{ value: 'totalTime', label: 'Total Time', description: 'Total dive duration' },
		{ value: 'repsCompleted', label: 'Reps Completed', description: 'Number of repetitions' },
		{ value: 'repDuration', label: 'Rep Duration', description: 'Duration per rep' },
		{ value: 'avgTimePerRep', label: 'Avg Time Per Rep', description: 'Average time per rep' },
		{ value: 'avgRestBetweenLaps', label: 'Avg Rest', description: 'Average rest interval' },
		{ value: 'totalBreathHoldTime', label: 'Total Hold Time', description: 'Sum of all hold durations' },
		{ value: 'longestHold', label: 'Longest Hold', description: 'Longest single breath hold' },
		{ value: 'cumulativeHoldTime', label: 'Cumulative Hold', description: 'Sum of all holds (biometrics)' },
		{ value: 'initialBreatheUpTime', label: 'Breathe-Up Time', description: 'Pre-dive breathe-up' }
	];

	// Auto-update labels when metric changes
	function handleHeroChange(event: Event) {
		const select = event.target as HTMLSelectElement;
		const metric = availableMetrics.find((m) => m.value === select.value);
		if (metric) {
			displayConfig.heroMetric = metric.value;
			displayConfig.heroMetricLabel = metric.label;
		}
	}

	function handleSecondaryChange(event: Event) {
		const select = event.target as HTMLSelectElement;
		const metric = availableMetrics.find((m) => m.value === select.value);
		if (metric) {
			displayConfig.secondaryMetric = metric.value;
			displayConfig.secondaryMetricLabel = metric.label;
		}
	}
</script>

<section class="form-section">
	<h2>📊 Display Settings</h2>
	<p class="section-hint">Choose which metrics to show prominently on session cards</p>

	<div class="metric-selectors">
		<div class="metric-group">
			<label for="hero-metric">Hero Metric</label>
			<p class="field-desc">The main number displayed large</p>
			<select
				id="hero-metric"
				class="metric-select"
				value={displayConfig.heroMetric}
				onchange={handleHeroChange}
			>
				{#each availableMetrics as metric}
					<option value={metric.value}>{metric.label}</option>
				{/each}
			</select>
		</div>

		<div class="metric-group">
			<label for="secondary-metric">Secondary Metric</label>
			<p class="field-desc">Shown smaller below the hero</p>
			<select
				id="secondary-metric"
				class="metric-select"
				value={displayConfig.secondaryMetric}
				onchange={handleSecondaryChange}
			>
				{#each availableMetrics as metric}
					<option value={metric.value}>{metric.label}</option>
				{/each}
			</select>
		</div>
	</div>

	<!-- Preview -->
	<div class="preview-card">
		<div class="preview-label">Card Preview</div>
		<div class="mock-metrics">
			<div class="hero-preview">
				<span class="value-preview">---</span>
				<span class="label-preview">{displayConfig.heroMetricLabel}</span>
			</div>
			<div class="secondary-preview">
				<span class="label-preview">{displayConfig.secondaryMetricLabel}</span>
				<span class="value-preview-sm">---</span>
			</div>
		</div>
	</div>
</section>

<style>
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

	.metric-selectors {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	@media (max-width: 500px) {
		.metric-selectors {
			grid-template-columns: 1fr;
		}
	}

	.metric-group {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.metric-group label {
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--color-text);
	}

	.field-desc {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin: 0 0 0.5rem;
	}

	.metric-select {
		width: 100%;
		padding: 0.75rem;
		background: rgba(15, 23, 42, 0.5);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 8px;
		color: var(--color-text);
		font-size: 0.9rem;
	}

	.metric-select:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.preview-card {
		background: rgba(15, 23, 42, 0.3);
		border: 1px solid rgba(148, 163, 184, 0.1);
		border-radius: 12px;
		padding: 1rem;
	}

	.preview-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		margin-bottom: 0.75rem;
	}

	.mock-metrics {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.hero-preview {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.value-preview {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-text);
	}

	.label-preview {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.secondary-preview {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.value-preview-sm {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--color-text);
	}
</style>
