<script lang="ts">
	import type { RoutineLog, RoutineTemplate, MetricType } from '$lib/types';
	import ScatterChart from '$lib/components/ScatterChart.svelte';
	import {
		computeReadinessCorrelations,
		getAvailableMetricsForRoutine,
		isTimeMetric,
		type MetricDescriptor,
		type ReadinessCorrelationResult
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

	const correlations = $derived<ReadinessCorrelationResult[]>(
		selectedMetric ? computeReadinessCorrelations(logs, selectedMetric.key, routine, { minN: 4 }) : []
	);

	function yFmt(v: number): string {
		if (!selectedMetric) return String(v);
		return isTimeMetric(selectedMetric.key) ? formatTime(v) : formatMetricValue(selectedMetric.key, v);
	}

	function chartFor(c: ReadinessCorrelationResult) {
		const xs = c.points.map((p) => p.x);
		const minX = Math.min(...xs);
		const maxX = Math.max(...xs);
		const datasets: any[] = [
			{
				label: 'Sessions',
				data: c.points,
				backgroundColor: 'rgba(167, 139, 250, 0.7)',
				borderColor: '#a78bfa',
				pointRadius: 4,
				pointHoverRadius: 6
			}
		];
		if (c.r2 > 0 && c.points.length >= 3 && maxX > minX) {
			datasets.push({
				label: `Trend`,
				type: 'line',
				data: [
					{ x: minX, y: c.slope * minX + c.intercept },
					{ x: maxX, y: c.slope * maxX + c.intercept }
				],
				borderColor: '#fbbf24',
				backgroundColor: 'transparent',
				borderWidth: 2,
				pointRadius: 0,
				tension: 0,
				fill: false
			});
		}
		return { datasets };
	}

	/**
	 * Readable interpretation of direction, taking into account whether
	 * the readiness metric's "higher" and the result's "higher" are each
	 * considered better. Positive/negative refer to slope sign.
	 */
	function interpret(c: ReadinessCorrelationResult): string {
		if (c.r2 < 0.05) return 'Weak or no correlation';
		const resultBetter = selectedMetric?.lowerIsBetter ? 'lower' : 'higher';
		const readinessUp = c.direction === 'positive';
		const resultSignUp = !selectedMetric?.lowerIsBetter;
		// helpful = higher readiness tends to coincide with better result
		const helpful = readinessUp === resultSignUp;
		if (c.direction === 'flat') return 'No clear direction';
		return helpful
			? `More ${c.correlate.label.toLowerCase()} → ${resultBetter} result`
			: `More ${c.correlate.label.toLowerCase()} → ${resultBetter === 'higher' ? 'lower' : 'higher'} result`;
	}
</script>

{#if metrics.length > 0}
	<div class="readiness-card">
		<header class="card-header">
			<h3>Readiness &amp; recovery</h3>
			<p class="hint">
				Does mood / HRV / resting HR / fasting predict your performance? Each mini-card
				is a regression against the metric you pick below.
			</p>
		</header>

		<div class="controls">
			<label class="control">
				<span class="control-label">Compare against</span>
				<select bind:value={selectedKey}>
					{#each metrics as m}
						<option value={m.key}>{m.label}</option>
					{/each}
				</select>
			</label>
		</div>

		{#if correlations.length === 0}
			<p class="empty">
				Once you've logged readiness signals (mood, HRV, resting HR, hours fasted, or
				body weight) across at least 4 sessions, correlations will appear here.
			</p>
		{:else}
			<div class="mini-grid">
				{#each correlations as c}
					<div class="mini" class:strong={c.r2 >= 0.3}>
						<div class="mini-head">
							<span class="mini-title">
								{c.correlate.label}
								<span class="mini-sub">vs {selectedMetric?.label}</span>
							</span>
							<span class="mini-r2" class:good={c.r2 >= 0.3}>
								R²={c.r2.toFixed(2)}
								<span class="n">· n={c.n}</span>
							</span>
						</div>
						<div class="mini-chart">
							<ScatterChart
								data={chartFor(c)}
								height={180}
								xTitle={c.correlate.label}
								yTitle={selectedMetric?.label ?? ''}
								yTickFormatter={yFmt}
								showLegend={false}
								tooltipFormatter={(ctx) => {
									const raw = ctx.raw as { x: number; y: number };
									return `${c.correlate.label}: ${raw.x.toFixed(1)} · ${selectedMetric?.label ?? ''}: ${yFmt(raw.y)}`;
								}}
								onPointClick={onSessionClick
									? (datasetIndex, index) => {
											if (datasetIndex !== 0) return;
											const p = c.points[index];
											if (p?.log) onSessionClick(p.log);
										}
									: undefined}
							/>
						</div>
						<p class="mini-interpret">{interpret(c)}</p>
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	.readiness-card {
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
		margin-bottom: 0.9rem;
	}

	.control {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 220px;
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

	.mini-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 0.9rem;
	}

	.mini {
		background: rgba(15, 23, 42, 0.35);
		border: 1px solid rgba(148, 163, 184, 0.1);
		border-radius: 10px;
		padding: 0.75rem 0.75rem 0.5rem;
	}

	.mini.strong {
		border-color: rgba(251, 191, 36, 0.35);
	}

	.mini-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.4rem;
		flex-wrap: wrap;
	}

	.mini-title {
		font-size: 0.92rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.mini-sub {
		font-weight: 400;
		color: var(--color-text-muted);
		font-size: 0.78rem;
	}

	.mini-r2 {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		font-variant-numeric: tabular-nums;
	}

	.mini-r2.good {
		color: #fbbf24;
	}

	.mini-r2 .n {
		opacity: 0.7;
	}

	.mini-chart {
		margin-bottom: 0.4rem;
	}

	.mini-interpret {
		margin: 0;
		font-size: 0.78rem;
		color: var(--color-text-muted);
	}

	.empty {
		color: var(--color-text-muted);
		font-size: 0.9rem;
		padding: 1.5rem 0;
		text-align: center;
	}
</style>
