<script lang="ts">
	import type { RoutineLog, RoutineTemplate } from '$lib/types';
	import LineChart from '$lib/components/LineChart.svelte';
	import {
		getAvailableMetricsForRoutine,
		buildProgressSeries,
		rollingAverage,
		findPB,
		isTimeMetric,
		type MetricDescriptor
	} from '$lib/utils/routineAnalytics';
	import { formatMetricValue } from '$lib/utils/metrics';
	import { formatTime } from '$lib/utils/time';

	let {
		logs,
		routine,
		hiddenMetrics = [],
		onSessionClick
	}: {
		logs: RoutineLog[];
		routine: RoutineTemplate;
		hiddenMetrics?: string[];
		onSessionClick?: (log: RoutineLog) => void;
	} = $props();

	const metrics = $derived(getAvailableMetricsForRoutine(routine, hiddenMetrics));

	// Preferred default: the routine's displayConfig heroMetric if available and in metrics list.
	const defaultMetricKey = $derived.by(() => {
		const hero = routine.displayConfig?.heroMetric;
		if (hero && metrics.some((m) => m.key === hero)) return hero;
		return metrics[0]?.key;
	});

	let selectedKey = $state<string | undefined>(undefined);
	let showRolling = $state(true);
	let showPB = $state(true);

	$effect(() => {
		if (selectedKey === undefined && defaultMetricKey) {
			selectedKey = defaultMetricKey;
		}
	});

	const selectedMetric = $derived<MetricDescriptor | undefined>(
		metrics.find((m) => m.key === selectedKey) ?? metrics[0]
	);

	const series = $derived.by(() => {
		if (!selectedMetric)
			return { labels: [] as string[], values: [] as number[], dates: [] as Date[], logs: [] as RoutineLog[] };
		return buildProgressSeries(logs, selectedMetric.key, routine);
	});

	const pb = $derived.by(() => {
		if (!selectedMetric) return null;
		return findPB(logs, selectedMetric.key, routine, selectedMetric.lowerIsBetter);
	});

	const chartData = $derived.by(() => {
		if (!selectedMetric || series.values.length === 0) {
			return { labels: [] as string[], datasets: [] as any[] };
		}
		const datasets: any[] = [
			{
				label: selectedMetric.label,
				data: series.values,
				borderColor: '#14b8a6',
				backgroundColor: 'rgba(20, 184, 166, 0.12)',
				tension: 0.35,
				fill: true,
				pointRadius: 4,
				pointHoverRadius: 6
			}
		];

		if (showRolling && series.values.length >= 3) {
			datasets.push({
				label: 'Rolling avg (5)',
				data: rollingAverage(series.values, 5),
				borderColor: '#fbbf24',
				backgroundColor: 'rgba(251, 191, 36, 0.05)',
				borderDash: [6, 4],
				tension: 0.4,
				fill: false,
				pointRadius: 0,
				pointHoverRadius: 0
			});
		}

		if (showPB && pb) {
			const pbLine = Array(series.values.length).fill(pb.value);
			datasets.push({
				label: selectedMetric.lowerIsBetter ? 'PB (lowest)' : 'PB',
				data: pbLine,
				borderColor: '#a78bfa',
				borderDash: [3, 3],
				borderWidth: 1.5,
				pointRadius: 0,
				pointHoverRadius: 0,
				fill: false,
				tension: 0
			});
		}

		return { labels: series.labels, datasets };
	});

	const fmt = (v: number) =>
		selectedMetric && isTimeMetric(selectedMetric.key)
			? formatTime(v)
			: selectedMetric
				? formatMetricValue(selectedMetric.key, v)
				: String(v);
</script>

<div class="progress-chart">
	<header class="card-header">
		<div class="title-row">
			<h3>Progress over time</h3>
			{#if selectedMetric?.lowerIsBetter}
				<span class="lib-flag" title="Lower values are better for this metric">lower = better</span>
			{/if}
		</div>

		<div class="controls">
			<label class="control">
				<span class="control-label">Metric</span>
				<select bind:value={selectedKey}>
					{#each metrics as m}
						<option value={m.key}>{m.label}</option>
					{/each}
				</select>
			</label>

			<label class="toggle">
				<input type="checkbox" bind:checked={showRolling} />
				<span>Rolling avg</span>
			</label>
			<label class="toggle">
				<input type="checkbox" bind:checked={showPB} />
				<span>PB line</span>
			</label>
		</div>
	</header>

	{#if metrics.length === 0}
		<p class="empty">No trackable metrics for this routine yet.</p>
	{:else if series.values.length === 0}
		<p class="empty">No logs with data for <strong>{selectedMetric?.label}</strong> yet.</p>
	{:else}
		<LineChart
			data={chartData}
			height={260}
			yTickFormatter={selectedMetric && isTimeMetric(selectedMetric.key) ? formatTime : undefined}
			tooltipValueFormatter={fmt}
			onPointClick={onSessionClick
				? (datasetIndex, index) => {
						if (datasetIndex !== 0) return;
						const log = series.logs[index];
						if (log) onSessionClick(log);
					}
				: undefined}
		/>
	{/if}
</div>

<style>
	.progress-chart {
		background: var(--color-bg-card);
		border-radius: 12px;
		padding: 1.1rem 1rem 1.3rem;
	}

	.card-header {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-bottom: 0.75rem;
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.title-row h3 {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.lib-flag {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		background: rgba(251, 191, 36, 0.15);
		color: #fbbf24;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		align-items: center;
	}

	.control {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 160px;
	}

	.control-label {
		font-size: 0.7rem;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	select {
		background: rgba(15, 23, 42, 0.5);
		color: var(--color-text);
		border: 1px solid rgba(148, 163, 184, 0.25);
		border-radius: 8px;
		padding: 0.45rem 0.55rem;
		font-size: 0.9rem;
	}

	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.85rem;
		color: var(--color-text-muted);
		cursor: pointer;
	}

	.toggle input {
		accent-color: var(--color-primary);
	}

	.empty {
		color: var(--color-text-muted);
		font-size: 0.9rem;
		padding: 2rem 0;
		text-align: center;
	}
</style>
