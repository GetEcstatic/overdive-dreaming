<script lang="ts">
	import type { RoutineLog, RoutineTemplate, MetricType } from '$lib/types';
	import LineChart from '$lib/components/LineChart.svelte';
	import {
		getAvailableMetricsForRoutine,
		monthlyStats,
		isTimeMetric,
		type MetricDescriptor
	} from '$lib/utils/routineAnalytics';
	import { formatMetricValue } from '$lib/utils/metrics';
	import { formatTime } from '$lib/utils/time';

	let {
		logs,
		routine,
		hiddenMetrics = []
	}: {
		logs: RoutineLog[];
		routine: RoutineTemplate;
		hiddenMetrics?: string[];
	} = $props();

	const metrics = $derived(getAvailableMetricsForRoutine(routine, hiddenMetrics));

	let selectedKey = $state<MetricType | undefined>(undefined);
	$effect(() => {
		if (!selectedKey && metrics.length > 0) {
			const heroKey = routine.displayConfig?.heroMetric;
			const fromHero = metrics.find((m) => m.key === heroKey);
			selectedKey = fromHero?.key ?? metrics[0].key;
		}
	});

	const selectedMetric = $derived<MetricDescriptor | undefined>(
		metrics.find((m) => m.key === selectedKey)
	);

	const stats = $derived(
		selectedMetric ? monthlyStats(logs, selectedMetric.key, routine) : []
	);

	// Overall CV% (across all sessions) and trend vs. most recent month.
	const overall = $derived.by(() => {
		if (stats.length === 0) return null;
		const last = stats[stats.length - 1];
		const earlier = stats.slice(0, -1);
		const earlierMeans = earlier.map((s) => s.mean).filter((v) => v > 0);
		const earlierAvg =
			earlierMeans.length > 0 ? earlierMeans.reduce((a, v) => a + v, 0) / earlierMeans.length : last.mean;
		const trendPct = earlierAvg > 0 ? ((last.mean - earlierAvg) / earlierAvg) * 100 : 0;
		const cvs = stats.map((s) => s.cv).filter((v) => Number.isFinite(v));
		const avgCV = cvs.length > 0 ? cvs.reduce((a, v) => a + v, 0) / cvs.length : 0;
		const bestMonth = [...stats].sort((a, b) => (selectedMetric?.lowerIsBetter ? a.min - b.min : b.max - a.max))[0];
		return { last, trendPct, avgCV, bestMonth };
	});

	// Chart: mean line with min/max band.
	const chartData = $derived.by(() => {
		if (stats.length === 0) return { labels: [] as string[], datasets: [] as any[] };
		return {
			labels: stats.map((s) => s.label),
			datasets: [
				{
					label: 'Max',
					data: stats.map((s) => s.max),
					borderColor: 'rgba(20, 184, 166, 0.25)',
					backgroundColor: 'rgba(20, 184, 166, 0.08)',
					borderDash: [4, 4],
					pointRadius: 0,
					fill: '+1',
					tension: 0.3
				},
				{
					label: 'Min',
					data: stats.map((s) => s.min),
					borderColor: 'rgba(20, 184, 166, 0.25)',
					backgroundColor: 'rgba(20, 184, 166, 0.08)',
					borderDash: [4, 4],
					pointRadius: 0,
					fill: false,
					tension: 0.3
				},
				{
					label: 'Mean',
					data: stats.map((s) => s.mean),
					borderColor: '#14b8a6',
					backgroundColor: 'rgba(20, 184, 166, 0.18)',
					pointRadius: 4,
					pointHoverRadius: 6,
					fill: false,
					tension: 0.3
				}
			]
		};
	});

	function fmtValue(v: number): string {
		if (!selectedMetric) return String(v);
		return isTimeMetric(selectedMetric.key) ? formatTime(v) : formatMetricValue(selectedMetric.key, v);
	}
</script>

{#if metrics.length > 0}
	<div class="consistency-card">
		<header class="card-header">
			<h3>Consistency &amp; variability</h3>
			<p class="hint">Monthly range of your performance. Lower CV% = more repeatable.</p>
		</header>

		<div class="controls">
			<label class="control">
				<span class="control-label">Metric</span>
				<select bind:value={selectedKey}>
					{#each metrics as m}
						<option value={m.key}>{m.label}</option>
					{/each}
				</select>
			</label>
		</div>

		{#if stats.length === 0}
			<p class="empty">Not enough logs yet to compute monthly stats.</p>
		{:else if overall}
			<div class="stat-grid">
				<div class="stat">
					<span class="label">Avg CV%</span>
					<span class="value">{overall.avgCV.toFixed(1)}%</span>
					<span class="sub">{overall.avgCV < 10 ? 'Very consistent' : overall.avgCV < 20 ? 'Moderate' : 'Variable'}</span>
				</div>
				<div class="stat">
					<span class="label">Latest month avg</span>
					<span class="value">{fmtValue(overall.last.mean)}</span>
					<span class="sub">n = {overall.last.n}</span>
				</div>
				<div class="stat">
					<span class="label">Change vs earlier</span>
					<span
						class="value"
						class:pos={selectedMetric?.lowerIsBetter ? overall.trendPct < 0 : overall.trendPct > 0}
						class:neg={selectedMetric?.lowerIsBetter ? overall.trendPct > 0 : overall.trendPct < 0}
					>
						{overall.trendPct >= 0 ? '+' : ''}{overall.trendPct.toFixed(1)}%
					</span>
					<span class="sub">latest vs prior months</span>
				</div>
				<div class="stat">
					<span class="label">Best month</span>
					<span class="value">{overall.bestMonth.label}</span>
					<span class="sub">
						{selectedMetric?.lowerIsBetter
							? fmtValue(overall.bestMonth.min)
							: fmtValue(overall.bestMonth.max)}
					</span>
				</div>
			</div>

			<div class="chart-wrap">
				<LineChart
					data={chartData}
					height={240}
					yTickFormatter={selectedMetric && isTimeMetric(selectedMetric.key) ? formatTime : undefined}
					tooltipValueFormatter={selectedMetric && isTimeMetric(selectedMetric.key)
						? formatTime
						: undefined}
				/>
			</div>

			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Month</th>
							<th>n</th>
							<th>Mean</th>
							<th>Min</th>
							<th>Max</th>
							<th>CV%</th>
						</tr>
					</thead>
					<tbody>
						{#each stats as s}
							<tr class:muted={s.n < 2}>
								<td>{s.label}</td>
								<td>{s.n}</td>
								<td>{fmtValue(s.mean)}</td>
								<td>{fmtValue(s.min)}</td>
								<td>{fmtValue(s.max)}</td>
								<td>{s.cv.toFixed(1)}%</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
{/if}

<style>
	.consistency-card {
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

	.controls {
		margin-bottom: 0.8rem;
	}

	.control {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 200px;
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

	.stat-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.stat .label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
	}

	.stat .value {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--color-text);
		font-variant-numeric: tabular-nums;
	}

	.stat .value.pos { color: #22c55e; }
	.stat .value.neg { color: #f87171; }

	.stat .sub {
		font-size: 0.72rem;
		color: var(--color-text-muted);
	}

	.chart-wrap {
		margin-top: 0.5rem;
		margin-bottom: 1rem;
	}

	.table-wrap {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
		font-variant-numeric: tabular-nums;
	}

	th,
	td {
		text-align: left;
		padding: 0.4rem 0.6rem;
		border-bottom: 1px solid rgba(148, 163, 184, 0.1);
		color: var(--color-text);
	}

	th {
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
	}

	tr.muted {
		opacity: 0.55;
	}

	.empty {
		color: var(--color-text-muted);
		font-size: 0.9rem;
		padding: 1.5rem 0;
		text-align: center;
	}
</style>
