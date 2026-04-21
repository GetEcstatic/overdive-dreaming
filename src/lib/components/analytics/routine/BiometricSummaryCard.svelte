<script lang="ts">
	import type { RoutineLog } from '$lib/types';
	import LineChart from '$lib/components/LineChart.svelte';
	import { extractBiometricSeries, hasBiometricData } from '$lib/utils/routineAnalytics';
	import { formatTime } from '$lib/utils/time';

	let {
		logs,
		onSessionClick
	}: {
		logs: RoutineLog[];
		onSessionClick?: (log: RoutineLog) => void;
	} = $props();

	const series = $derived(extractBiometricSeries(logs));

	// SpO₂ trend: lowest and average per session.
	const spo2Chart = $derived.by(() => {
		if (series.length === 0) return { labels: [] as string[], datasets: [] as any[] };
		return {
			labels: series.map((p) => p.label),
			datasets: [
				{
					label: 'Lowest SpO₂',
					data: series.map((p) => (typeof p.lowestSpO2 === 'number' ? p.lowestSpO2 : null)),
					borderColor: '#f87171',
					backgroundColor: 'rgba(248, 113, 113, 0.12)',
					tension: 0.3,
					fill: false,
					pointRadius: 3,
					spanGaps: true
				},
				{
					label: 'Avg SpO₂',
					data: series.map((p) => (typeof p.avgSpO2 === 'number' ? p.avgSpO2 : null)),
					borderColor: '#60a5fa',
					backgroundColor: 'rgba(96, 165, 250, 0.12)',
					tension: 0.3,
					fill: false,
					pointRadius: 3,
					spanGaps: true
				}
			]
		};
	});

	// HR trend.
	const hrChart = $derived.by(() => {
		if (series.length === 0) return { labels: [] as string[], datasets: [] as any[] };
		const hasMin = series.some((p) => typeof p.minHR === 'number');
		const hasMax = series.some((p) => typeof p.maxHR === 'number');
		if (!hasMin && !hasMax) return { labels: [] as string[], datasets: [] as any[] };
		const datasets: any[] = [];
		if (hasMin) {
			datasets.push({
				label: 'Min HR',
				data: series.map((p) => (typeof p.minHR === 'number' ? p.minHR : null)),
				borderColor: '#10b981',
				backgroundColor: 'rgba(16, 185, 129, 0.12)',
				tension: 0.3,
				fill: false,
				pointRadius: 3,
				spanGaps: true
			});
		}
		if (hasMax) {
			datasets.push({
				label: 'Max HR',
				data: series.map((p) => (typeof p.maxHR === 'number' ? p.maxHR : null)),
				borderColor: '#fbbf24',
				backgroundColor: 'rgba(251, 191, 36, 0.1)',
				tension: 0.3,
				fill: false,
				pointRadius: 3,
				spanGaps: true
			});
		}
		return { labels: series.map((p) => p.label), datasets };
	});

	// Time-below-threshold trend (any threshold that has data).
	const thresholdChart = $derived.by(() => {
		if (series.length === 0) return { labels: [] as string[], datasets: [] as any[] };
		const thresholds: { key: 'below70' | 'below60' | 'below50' | 'below40'; label: string; color: string }[] = [
			{ key: 'below70', label: '< 70%', color: '#fbbf24' },
			{ key: 'below60', label: '< 60%', color: '#fb923c' },
			{ key: 'below50', label: '< 50%', color: '#f97316' },
			{ key: 'below40', label: '< 40%', color: '#dc2626' }
		];
		const active = thresholds.filter((t) => series.some((p) => typeof p[t.key] === 'number'));
		if (active.length === 0) return { labels: [] as string[], datasets: [] as any[] };
		return {
			labels: series.map((p) => p.label),
			datasets: active.map((t) => ({
				label: t.label,
				data: series.map((p) => (typeof p[t.key] === 'number' ? (p[t.key] as number) : null)),
				borderColor: t.color,
				backgroundColor: t.color + '22',
				tension: 0.3,
				fill: false,
				pointRadius: 3,
				spanGaps: true
			}))
		};
	});

	// Headline stat cards.
	const stats = $derived.by(() => {
		const lowest = series
			.map((p) => p.lowestSpO2)
			.filter((v): v is number => typeof v === 'number');
		const minHRs = series
			.map((p) => p.minHR)
			.filter((v): v is number => typeof v === 'number');
		const longestHolds = series
			.map((p) => p.longestHold)
			.filter((v): v is number => typeof v === 'number');
		const below50s = series
			.map((p) => p.below50)
			.filter((v): v is number => typeof v === 'number');
		return {
			allTimeLowSpO2: lowest.length > 0 ? Math.min(...lowest) : null,
			allTimeLowHR: minHRs.length > 0 ? Math.min(...minHRs) : null,
			allTimeLongestHold: longestHolds.length > 0 ? Math.max(...longestHolds) : null,
			sessionsBelow50: below50s.filter((v) => v > 0).length
		};
	});
</script>

{#if hasBiometricData(logs) && series.length > 0}
	<div class="bio-card">
		<header class="card-header">
			<h3>Biometric summary</h3>
			<p class="hint">SpO₂ troughs, HR extremes, and time below critical thresholds across sessions.</p>
		</header>

		<div class="stat-grid">
			{#if stats.allTimeLowSpO2 !== null}
				<div class="stat">
					<span class="label">Lowest SpO₂ ever</span>
					<span class="value red">{stats.allTimeLowSpO2}%</span>
				</div>
			{/if}
			{#if stats.allTimeLowHR !== null}
				<div class="stat">
					<span class="label">Lowest HR ever</span>
					<span class="value green">{stats.allTimeLowHR} bpm</span>
				</div>
			{/if}
			{#if stats.allTimeLongestHold !== null}
				<div class="stat">
					<span class="label">Longest hold</span>
					<span class="value">{formatTime(stats.allTimeLongestHold)}</span>
				</div>
			{/if}
			<div class="stat">
				<span class="label">Sessions &lt; 50% SpO₂</span>
				<span class="value">{stats.sessionsBelow50}</span>
			</div>
		</div>

		{#if spo2Chart.datasets.length > 0}
			<div class="chart-wrap">
				<h4>SpO₂ per session</h4>
				<LineChart
					data={spo2Chart}
					height={220}
					onPointClick={onSessionClick
						? (_ds, index) => {
								const p = series[index];
								if (p?.log) onSessionClick(p.log);
							}
						: undefined}
				/>
			</div>
		{/if}

		{#if hrChart.datasets.length > 0}
			<div class="chart-wrap">
				<h4>Heart rate per session</h4>
				<LineChart
					data={hrChart}
					height={220}
					onPointClick={onSessionClick
						? (_ds, index) => {
								const p = series[index];
								if (p?.log) onSessionClick(p.log);
							}
						: undefined}
				/>
			</div>
		{/if}

		{#if thresholdChart.datasets.length > 0}
			<div class="chart-wrap">
				<h4>Time below SpO₂ thresholds (seconds)</h4>
				<LineChart
					data={thresholdChart}
					height={220}
					tooltipValueFormatter={formatTime}
					onPointClick={onSessionClick
						? (_ds, index) => {
								const p = series[index];
								if (p?.log) onSessionClick(p.log);
							}
						: undefined}
				/>
			</div>
		{/if}
	</div>
{/if}

<style>
	.bio-card {
		background: var(--color-bg-card);
		border-radius: 12px;
		padding: 1.1rem 1rem 1.3rem;
	}

	.card-header {
		margin-bottom: 0.9rem;
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

	.stat-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
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
		font-size: 1.35rem;
		font-weight: 700;
		color: var(--color-text);
		font-variant-numeric: tabular-nums;
	}

	.stat .value.red { color: #f87171; }
	.stat .value.green { color: #22c55e; }

	.chart-wrap {
		margin-top: 1rem;
	}

	.chart-wrap h4 {
		margin: 0 0 0.5rem;
		font-size: 0.88rem;
		color: var(--color-text-muted);
		font-weight: 600;
	}
</style>
