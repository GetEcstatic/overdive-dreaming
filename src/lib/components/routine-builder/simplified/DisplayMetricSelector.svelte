<script lang="ts">
	/**
	 * DisplayMetricSelector - Select hero/secondary metrics for session cards
	 * Shown as Step 5 in the routine builder, after tracking options
	 */

	import type { MetricType, DisplayConfig, TrackingConfig } from '$lib/types';

	let {
		displayConfig = $bindable<DisplayConfig>(),
		trackingConfig = {}
	}: {
		displayConfig: DisplayConfig;
		trackingConfig?: Partial<TrackingConfig>;
	} = $props();

	// All available metrics with descriptions
	const allMetrics: { value: MetricType; label: string; description: string; icon: string }[] = [
		{ value: 'totalDistance', label: 'Total Distance', description: 'Total meters covered', icon: '📏' },
		{ value: 'totalTime', label: 'Total Time', description: 'Total dive duration', icon: '⏱️' },
		{ value: 'repsCompleted', label: 'Reps Completed', description: 'Number of repetitions', icon: '🔢' },
		{ value: 'repDuration', label: 'Rep Duration', description: 'Best/longest rep time', icon: '⏱️' },
		{ value: 'avgTimePerRep', label: 'Avg Time Per Rep', description: 'Average time per rep', icon: '📊' },
		{ value: 'avgRestBetweenLaps', label: 'Avg Rest', description: 'Average rest interval', icon: '💨' },
		{ value: 'totalBreathHoldTime', label: 'Total Hold Time', description: 'Sum of all hold durations', icon: '🫁' },
		{ value: 'longestHold', label: 'Longest Hold', description: 'Longest single breath hold', icon: '🏆' },
		{ value: 'cumulativeHoldTime', label: 'Cumulative Hold', description: 'Sum of all holds (biometrics)', icon: '📈' },
		{ value: 'initialBreatheUpTime', label: 'Breathe-Up Time', description: 'Pre-dive breathe-up', icon: '🌬️' },
		{ value: 'lapDistance', label: 'Lap Distance', description: 'Distance per rep', icon: '📏' },
		{ value: 'totalRepDistance', label: 'Total Rep Distance', description: 'Sum of all rep distances', icon: '📐' }
	];

	// Filter to show most relevant metrics based on tracking config
	let availableMetrics = $derived.by(() => {
		// Show all metrics - let users choose what they want
		return allMetrics;
	});

	// Auto-update labels when metric changes
	function handleHeroChange(event: Event) {
		const select = event.target as HTMLSelectElement;
		const metric = allMetrics.find((m) => m.value === select.value);
		if (metric) {
			displayConfig.heroMetric = metric.value;
			displayConfig.heroMetricLabel = metric.label;
		}
	}

	function handleSecondaryChange(event: Event) {
		const select = event.target as HTMLSelectElement;
		const metric = allMetrics.find((m) => m.value === select.value);
		if (metric) {
			displayConfig.secondaryMetric = metric.value;
			displayConfig.secondaryMetricLabel = metric.label;
		}
	}

	function handleTertiaryChange(event: Event) {
		const select = event.target as HTMLSelectElement;
		const value = select.value;
		if (value === 'none') {
			displayConfig.tertiaryMetric = undefined;
			displayConfig.tertiaryMetricLabel = undefined;
		} else {
			const metric = allMetrics.find((m) => m.value === value);
			if (metric) {
				displayConfig.tertiaryMetric = metric.value;
				displayConfig.tertiaryMetricLabel = metric.label;
			}
		}
	}

	// Get the current hero metric info
	let heroInfo = $derived(allMetrics.find(m => m.value === displayConfig.heroMetric));
	let secondaryInfo = $derived(allMetrics.find(m => m.value === displayConfig.secondaryMetric));
	let tertiaryInfo = $derived(displayConfig.tertiaryMetric ? allMetrics.find(m => m.value === displayConfig.tertiaryMetric) : undefined);
</script>

<div class="display-selector">
	<div class="header">
		<h1>📊 Display Settings</h1>
		<p class="subtitle">Choose how your sessions appear on the dashboard</p>
	</div>

	<!-- Metric Selection Cards -->
	<div class="metric-cards">
		<!-- Hero Metric Selection -->
		<div class="metric-card">
			<div class="card-header-section">
				<span class="card-icon">🌟</span>
				<div class="card-title">
					<span class="title">Hero Metric</span>
					<span class="desc">The main number displayed prominently</span>
				</div>
			</div>
			<div class="select-wrapper">
				<select
					class="metric-select"
					value={displayConfig.heroMetric}
					onchange={handleHeroChange}
				>
					{#each availableMetrics as metric}
						<option value={metric.value}>{metric.icon} {metric.label}</option>
					{/each}
				</select>
			</div>
			{#if heroInfo}
				<div class="metric-hint">{heroInfo.description}</div>
			{/if}
		</div>

		<!-- Secondary Metric Selection -->
		<div class="metric-card">
			<div class="card-header-section">
				<span class="card-icon">📌</span>
				<div class="card-title">
					<span class="title">Secondary Metric</span>
					<span class="desc">Shown smaller alongside the hero</span>
				</div>
			</div>
			<div class="select-wrapper">
				<select
					class="metric-select"
					value={displayConfig.secondaryMetric}
					onchange={handleSecondaryChange}
				>
					{#each availableMetrics as metric}
						<option value={metric.value}>{metric.icon} {metric.label}</option>
					{/each}
				</select>
			</div>
			{#if secondaryInfo}
				<div class="metric-hint">{secondaryInfo.description}</div>
			{/if}
		</div>

		<!-- Tertiary Metric Selection (Optional) -->
		<div class="metric-card">
			<div class="card-header-section">
				<span class="card-icon">📎</span>
				<div class="card-title">
					<span class="title">Tertiary Metric</span>
					<span class="desc">Optional third metric shown on the card</span>
				</div>
			</div>
			<div class="select-wrapper">
				<select
					class="metric-select"
					value={displayConfig.tertiaryMetric ?? 'none'}
					onchange={handleTertiaryChange}
				>
					<option value="none">— None —</option>
					{#each availableMetrics as metric}
						<option value={metric.value}>{metric.icon} {metric.label}</option>
					{/each}
				</select>
			</div>
			{#if tertiaryInfo}
				<div class="metric-hint">{tertiaryInfo.description}</div>
			{/if}
		</div>
	</div>

	<!-- Preview Card - styled like SessionCard -->
	<div class="preview-section">
		<div class="preview-label">
			<span class="preview-icon">👁️</span>
			Preview
		</div>
		<div class="session-card-preview">
			<div class="preview-header">
				<div class="profile-placeholder"></div>
				<div class="header-text">
					<span class="user-name">Your Name</span>
					<span class="session-time">Today • Just now</span>
				</div>
			</div>
			<div class="gradient-line"></div>
			
			<!-- Hero Section - matches SessionCard -->
			<div class="hero-section">
				<div class="hero-label">{displayConfig.heroMetricLabel}</div>
				<div class="hero-value">
					{#if displayConfig.heroMetric === 'totalDistance' || displayConfig.heroMetric === 'lapDistance' || displayConfig.heroMetric === 'totalRepDistance'}
						125m
					{:else if displayConfig.heroMetric === 'totalTime' || displayConfig.heroMetric === 'repDuration' || displayConfig.heroMetric === 'longestHold' || displayConfig.heroMetric === 'totalBreathHoldTime'}
						3:45
					{:else if displayConfig.heroMetric === 'repsCompleted'}
						8
					{:else}
						---
					{/if}
				</div>
			</div>

			<!-- Secondary & RPE/Joy - matches SessionCard metrics-row -->
			<div class="metrics-row">
				<div class="metric-box">
					<div class="metric-label">{displayConfig.secondaryMetricLabel}</div>
					<div class="metric-value">
						{#if displayConfig.secondaryMetric === 'totalDistance' || displayConfig.secondaryMetric === 'lapDistance' || displayConfig.secondaryMetric === 'totalRepDistance'}
							125m
						{:else if displayConfig.secondaryMetric === 'totalTime' || displayConfig.secondaryMetric === 'repDuration' || displayConfig.secondaryMetric === 'longestHold'}
							3:45
						{:else if displayConfig.secondaryMetric === 'repsCompleted'}
							8
						{:else}
							---
						{/if}
					</div>
				</div>
				{#if displayConfig.tertiaryMetric && displayConfig.tertiaryMetricLabel}
					<div class="metric-box">
						<div class="metric-label">{displayConfig.tertiaryMetricLabel}</div>
						<div class="metric-value">
							{#if displayConfig.tertiaryMetric === 'totalDistance' || displayConfig.tertiaryMetric === 'lapDistance' || displayConfig.tertiaryMetric === 'totalRepDistance'}
								125m
							{:else if displayConfig.tertiaryMetric === 'totalTime' || displayConfig.tertiaryMetric === 'repDuration' || displayConfig.tertiaryMetric === 'longestHold'}
								3:45
							{:else if displayConfig.tertiaryMetric === 'repsCompleted'}
								8
							{:else}
								---
							{/if}
						</div>
					</div>
				{/if}
				<div class="metric-box">
					<div class="metric-label">💪 RPE</div>
					<div class="metric-value">7</div>
				</div>
				<div class="metric-box">
					<div class="metric-label">😊 Joy</div>
					<div class="metric-value">9</div>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.display-selector {
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

	/* Metric Cards */
	.metric-cards {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.metric-card {
		background: var(--color-bg-card);
		border-radius: 12px;
		padding: 1rem;
		border: 1px solid rgba(148, 163, 184, 0.1);
	}

	.card-header-section {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.card-icon {
		font-size: 1.25rem;
	}

	.card-title {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.card-title .title {
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.card-title .desc {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.select-wrapper {
		margin-bottom: 0.5rem;
	}

	.metric-select {
		width: 100%;
		padding: 0.75rem 1rem;
		background: rgba(15, 23, 42, 0.5);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 8px;
		color: var(--color-text);
		font-size: 0.95rem;
		cursor: pointer;
		transition: border-color 0.2s ease;
	}

	.metric-select:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.metric-hint {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		font-style: italic;
	}

	/* Preview Section */
	.preview-section {
		margin-top: 1.5rem;
	}

	.preview-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.75rem;
	}

	.preview-icon {
		font-size: 1rem;
	}

	/* Session Card Preview - matches actual SessionCard styling */
	.session-card-preview {
		background: var(--color-bg-card);
		border-radius: 16px;
		padding: 1rem;
		border: 1px solid rgba(148, 163, 184, 0.1);
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
	}

	.preview-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.profile-placeholder {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--color-primary), rgba(20, 184, 166, 0.5));
	}

	.header-text {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.user-name {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.session-time {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.gradient-line {
		height: 3px;
		background: linear-gradient(90deg, var(--color-primary), transparent);
		border-radius: 2px;
		margin-bottom: 1rem;
	}

	/* Hero Section - matches SessionCard exactly */
	.hero-section {
		margin-bottom: 1rem;
	}

	.hero-label {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.25rem;
	}

	.hero-value {
		font-size: 2.5rem;
		font-weight: 800;
		color: var(--color-text);
		line-height: 1;
		font-feature-settings: 'tnum';
	}

	/* Metrics Row - matches SessionCard exactly */
	.metrics-row {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem;
	}

	.metric-box {
		background: rgba(15, 23, 42, 0.3);
		border-radius: 8px;
		padding: 0.75rem;
		text-align: center;
	}

	.metric-label {
		font-size: 0.7rem;
		font-weight: 500;
		color: var(--color-text-muted);
		margin-bottom: 0.25rem;
	}

	.metric-value {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--color-text);
		font-feature-settings: 'tnum';
	}
</style>
