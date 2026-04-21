<script lang="ts">
	import type { RoutineLog, RoutineTemplate, MetricType } from '$lib/types';
	import ScatterChart from '$lib/components/ScatterChart.svelte';
	import {
		buildScatter,
		getScatterMetrics,
		suggestCorrelations,
		isTimeMetric,
		type MetricDescriptor,
		type CorrelationSuggestion
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

	const metrics = $derived(getScatterMetrics(routine, hiddenMetrics));

	let xKey = $state<MetricType | undefined>(undefined);
	let yKey = $state<MetricType | undefined>(undefined);

	// Initial defaults: first two metrics that aren't the same.
	$effect(() => {
		if (!xKey && metrics[0]) xKey = metrics[0].key;
		if (!yKey && metrics[1]) yKey = metrics[1].key;
		if (!yKey && metrics[0] && metrics[0].key !== xKey) yKey = metrics[0].key;
	});

	const suggestions = $derived<CorrelationSuggestion[]>(
		suggestCorrelations(logs, routine, metrics, { k: 3, minN: 5, minR2: 0.1 })
	);

	const xMetric = $derived<MetricDescriptor | undefined>(metrics.find((m) => m.key === xKey));
	const yMetric = $derived<MetricDescriptor | undefined>(metrics.find((m) => m.key === yKey));

	const scatter = $derived.by(() => {
		if (!xMetric || !yMetric) return { points: [], regression: { slope: 0, intercept: 0, r2: 0, direction: 'flat' as const } };
		return buildScatter(logs, routine, xMetric.key, yMetric.key);
	});

	const chartData = $derived.by(() => {
		const datasets: any[] = [];
		if (scatter.points.length > 0) {
			datasets.push({
				label: 'Sessions',
				data: scatter.points.map((p) => ({ x: p.x, y: p.y })),
				backgroundColor: 'rgba(20, 184, 166, 0.7)',
				borderColor: '#14b8a6',
				pointRadius: 5,
				pointHoverRadius: 7
			});

			// Regression line as two endpoints.
			if (scatter.regression.r2 > 0 && scatter.points.length >= 3) {
				const xs = scatter.points.map((p) => p.x);
				const minX = Math.min(...xs);
				const maxX = Math.max(...xs);
				const { slope, intercept } = scatter.regression;
				datasets.push({
					label: `Trend (R²=${scatter.regression.r2.toFixed(2)})`,
					type: 'line',
					data: [
						{ x: minX, y: slope * minX + intercept },
						{ x: maxX, y: slope * maxX + intercept }
					],
					borderColor: '#fbbf24',
					backgroundColor: 'transparent',
					borderWidth: 2,
					pointRadius: 0,
					tension: 0,
					fill: false
				});
			}
		}
		return { datasets };
	});

	function applySuggestion(s: CorrelationSuggestion) {
		xKey = s.x.key;
		yKey = s.y.key;
	}

	function tickFmt(metric: MetricDescriptor | undefined) {
		if (!metric) return undefined;
		return isTimeMetric(metric.key) ? formatTime : (v: number) => formatMetricValue(metric.key, v);
	}
</script>

<div class="scatter-card">
	<header class="card-header">
		<h3>Explore correlations</h3>
		<p class="hint">Pick any two tracked variables to see how they relate. R² tells you how strongly they correlate.</p>
	</header>

	{#if metrics.length < 2}
		<p class="empty">Not enough distinct metrics on this routine to explore correlations.</p>
	{:else}
		{#if suggestions.length > 0}
			<div class="suggestions" aria-label="Suggested correlations">
				<span class="suggestions-label">Suggested insights:</span>
				{#each suggestions as s}
					<button
						type="button"
						class="chip"
						onclick={() => applySuggestion(s)}
						title={`n=${s.n} · R²=${s.r2.toFixed(2)}`}
					>
						{s.x.label}
						<span class="chip-op">{s.direction === 'negative' ? '↓ vs' : '↑ vs'}</span>
						{s.y.label}
						<span class="chip-r2">R²={s.r2.toFixed(2)}</span>
					</button>
				{/each}
			</div>
		{/if}

		<div class="controls">
			<label class="control">
				<span class="control-label">X axis</span>
				<select bind:value={xKey}>
					{#each metrics as m}
						<option value={m.key}>{m.label}</option>
					{/each}
				</select>
			</label>

			<label class="control">
				<span class="control-label">Y axis</span>
				<select bind:value={yKey}>
					{#each metrics as m}
						<option value={m.key}>{m.label}</option>
					{/each}
				</select>
			</label>

			<div class="r2-badge" class:good={scatter.regression.r2 >= 0.3}>
				n = {scatter.points.length}
				<span class="sep">·</span>
				R² = {scatter.regression.r2.toFixed(2)}
			</div>
		</div>

		{#if scatter.points.length < 3}
			<p class="empty">Need at least 3 logs with both metrics to draw a scatter.</p>
		{:else}
			<ScatterChart
				data={chartData}
				height={280}
				xTickFormatter={tickFmt(xMetric)}
				yTickFormatter={tickFmt(yMetric)}
				xTitle={xMetric?.label}
				yTitle={yMetric?.label}
				tooltipFormatter={(ctx) => {
					const raw = ctx.raw as { x: number; y: number };
					const xStr = tickFmt(xMetric)?.(raw.x) ?? raw.x;
					const yStr = tickFmt(yMetric)?.(raw.y) ?? raw.y;
					return `${xMetric?.label ?? ''}: ${xStr} · ${yMetric?.label ?? ''}: ${yStr}`;
				}}
				onPointClick={onSessionClick
					? (datasetIndex, index) => {
							if (datasetIndex !== 0) return;
							const p = scatter.points[index];
							if (p?.log) onSessionClick(p.log);
						}
					: undefined}
			/>
		{/if}
	{/if}
</div>

<style>
	.scatter-card {
		background: var(--color-bg-card);
		border-radius: 12px;
		padding: 1.1rem 1rem 1.3rem;
	}

	.card-header {
		margin-bottom: 0.75rem;
	}

	.card-header h3 {
		margin: 0 0 0.2rem;
		font-size: 1.05rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.hint {
		margin: 0;
		font-size: 0.82rem;
		color: var(--color-text-muted);
	}

	.suggestions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
		margin-bottom: 0.75rem;
		padding-bottom: 0.6rem;
		border-bottom: 1px solid rgba(148, 163, 184, 0.12);
	}

	.suggestions-label {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
	}

	.chip {
		background: rgba(20, 184, 166, 0.1);
		color: var(--color-primary);
		border: 1px solid rgba(20, 184, 166, 0.25);
		border-radius: 999px;
		padding: 0.3rem 0.65rem;
		font-size: 0.78rem;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.chip:hover {
		background: rgba(20, 184, 166, 0.2);
	}

	.chip-op {
		opacity: 0.7;
		font-size: 0.7rem;
	}

	.chip-r2 {
		opacity: 0.65;
		font-size: 0.7rem;
		margin-left: 0.25rem;
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem 1rem;
		align-items: flex-end;
		margin-bottom: 0.5rem;
	}

	.control {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 160px;
	}

	.control-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
	}

	select {
		background: rgba(15, 23, 42, 0.5);
		color: var(--color-text);
		border: 1px solid rgba(148, 163, 184, 0.25);
		border-radius: 8px;
		padding: 0.45rem 0.55rem;
		font-size: 0.9rem;
	}

	.r2-badge {
		background: rgba(148, 163, 184, 0.1);
		color: var(--color-text-muted);
		padding: 0.35rem 0.65rem;
		border-radius: 8px;
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
	}

	.r2-badge .sep {
		opacity: 0.5;
		margin: 0 0.25rem;
	}

	.r2-badge.good {
		background: rgba(251, 191, 36, 0.15);
		color: #fbbf24;
	}

	.empty {
		color: var(--color-text-muted);
		font-size: 0.9rem;
		padding: 1.5rem 0;
		text-align: center;
	}
</style>
