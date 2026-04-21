<script lang="ts">
	import type { RoutineLog, RoutineTemplate } from '$lib/types';
	import LineChart from '$lib/components/LineChart.svelte';
	import {
		bucketLogsBy,
		getAvailableDimensions,
		getAvailableMetricsForRoutine,
		summariseGroup,
		isTimeMetric,
		type CompareDimension,
		type MetricDescriptor
	} from '$lib/utils/routineAnalytics';
	import { getMetricValue, formatMetricValue } from '$lib/utils/metrics';
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
	const dimensions = $derived(getAvailableDimensions(logs));

	let selectedMetricKey = $state<string | undefined>(undefined);
	let selectedDimensionKey = $state<CompareDimension | undefined>(undefined);
	let mode = $state<'trend' | 'summary'>('trend');

	$effect(() => {
		if (!selectedMetricKey && metrics[0]) {
			selectedMetricKey = routine.displayConfig?.heroMetric ?? metrics[0].key;
		}
	});
	$effect(() => {
		if (!selectedDimensionKey && dimensions[0]) {
			selectedDimensionKey = dimensions[0].key;
		}
	});

	const selectedMetric = $derived<MetricDescriptor | undefined>(
		metrics.find((m) => m.key === selectedMetricKey) ?? metrics[0]
	);

	const groups = $derived.by(() => {
		if (!selectedDimensionKey) return new Map<string, RoutineLog[]>();
		return bucketLogsBy(logs, selectedDimensionKey);
	});

	// Color palette for up to 8 groups.
	const palette = [
		'#14b8a6',
		'#38bdf8',
		'#fbbf24',
		'#a78bfa',
		'#f472b6',
		'#22c55e',
		'#f97316',
		'#ef4444'
	];

	const groupEntries = $derived.by(() =>
		Array.from(groups.entries()).sort(([, a], [, b]) => b.length - a.length)
	);

	// Build trend data: a shared list of date labels across all groups, overlaid as separate datasets.
	const trendChart = $derived.by(() => {
		if (!selectedMetric || groupEntries.length === 0) {
			return { labels: [] as string[], datasets: [] as any[] };
		}

		// Collect all unique dates across groups (rounded to day), ordered chronologically.
		const dateSet = new Set<number>();
		for (const [, groupLogs] of groupEntries) {
			for (const log of groupLogs) {
				const d = log.date.toDate();
				d.setHours(0, 0, 0, 0);
				dateSet.add(d.getTime());
			}
		}
		const dates = [...dateSet].sort((a, b) => a - b);
		const labels = dates.map((t) =>
			new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
		);

		const datasets = groupEntries.map(([label, groupLogs], i) => {
			// Map date -> average value that day (mean if more than one log on the same day).
			const perDay = new Map<number, number[]>();
			for (const log of groupLogs) {
				const v = getMetricValue(selectedMetric.key, log, routine);
				if (!(v > 0)) continue;
				const d = log.date.toDate();
				d.setHours(0, 0, 0, 0);
				const key = d.getTime();
				const arr = perDay.get(key) ?? [];
				arr.push(v);
				perDay.set(key, arr);
			}
			const data = dates.map((t) => {
				const vals = perDay.get(t);
				if (!vals || vals.length === 0) return null;
				return vals.reduce((a, b) => a + b, 0) / vals.length;
			});
			const color = palette[i % palette.length];
			return {
				label: `${label} (n=${groupLogs.length})`,
				data,
				borderColor: color,
				backgroundColor: color + '22',
				tension: 0.35,
				fill: false,
				spanGaps: true,
				pointRadius: 3,
				pointHoverRadius: 5
			};
		});

		return { labels, datasets };
	});

	const summaryRows = $derived.by(() => {
		if (!selectedMetric) return [];
		return groupEntries.map(([label, groupLogs], i) => {
			const s = summariseGroup(groupLogs, selectedMetric.key, routine, selectedMetric.lowerIsBetter);
			return { label, n: groupLogs.length, stats: s, color: palette[i % palette.length] };
		});
	});

	// Max value for bar width normalization in summary mode.
	const summaryMax = $derived.by(() => {
		let max = 0;
		for (const row of summaryRows) {
			if (row.stats.mean > max) max = row.stats.mean;
		}
		return max || 1;
	});

	const fmt = (v: number) =>
		selectedMetric && isTimeMetric(selectedMetric.key)
			? formatTime(v)
			: selectedMetric
				? formatMetricValue(selectedMetric.key, v)
				: String(v);
</script>

<div class="compare-card">
	<header class="card-header">
		<h3>Compare groups</h3>
		<p class="hint">Split logs by a condition and see each group's performance side-by-side.</p>
	</header>

	{#if metrics.length === 0 || dimensions.length === 0}
		<p class="empty">
			Not enough varied data yet to compare. Log more sessions with different
			conditions (e.g. different gear, pool length, or time of day) and this card
			will populate.
		</p>
	{:else}
		<div class="controls">
			<label class="control">
				<span class="control-label">Metric</span>
				<select bind:value={selectedMetricKey}>
					{#each metrics as m}
						<option value={m.key}>{m.label}</option>
					{/each}
				</select>
			</label>

			<label class="control">
				<span class="control-label">Group by</span>
				<select bind:value={selectedDimensionKey}>
					{#each dimensions as d}
						<option value={d.key}>{d.label}</option>
					{/each}
				</select>
			</label>

			<div class="mode-toggle" role="tablist">
				<button
					type="button"
					class:active={mode === 'trend'}
					onclick={() => (mode = 'trend')}
				>
					Trend
				</button>
				<button
					type="button"
					class:active={mode === 'summary'}
					onclick={() => (mode = 'summary')}
				>
					Summary
				</button>
			</div>
		</div>

		{#if groupEntries.length === 0}
			<p class="empty">No data for this combination yet.</p>
		{:else if mode === 'trend'}
			<LineChart
				data={trendChart}
				height={280}
				yTickFormatter={selectedMetric && isTimeMetric(selectedMetric.key) ? formatTime : undefined}
				tooltipValueFormatter={fmt}
			/>
		{:else}
			<div class="summary-table" role="table" aria-label="Group summary">
				<div class="summary-head" role="row">
					<span>Group</span><span>n</span><span>Mean</span><span>Best</span><span>CV%</span>
				</div>
				{#each summaryRows as row}
					<div class="summary-row" role="row" class:muted={row.n < 3}>
						<span class="group-label">
							<span class="swatch" style="background:{row.color}"></span>
							<span class="name">{row.label}</span>
						</span>
						<span>{row.n}</span>
						<span>
							<span class="bar" style="--w:{(row.stats.mean / summaryMax) * 100}%; --c:{row.color}"
								>&nbsp;</span
							>
							<span class="num">{fmt(row.stats.mean)}</span>
						</span>
						<span class="num">{fmt(row.stats.pb)}</span>
						<span class="num">
							{row.stats.cvPct !== undefined ? `${row.stats.cvPct.toFixed(1)}%` : '—'}
						</span>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.compare-card {
		background: var(--color-bg-card);
		border-radius: 12px;
		padding: 1.1rem 1rem 1.3rem;
	}

	.card-header {
		margin-bottom: 0.75rem;
	}

	.card-header h3 {
		margin: 0 0 0.25rem;
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
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem 1rem;
		align-items: flex-end;
		margin-bottom: 0.75rem;
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

	.mode-toggle {
		display: inline-flex;
		gap: 0.25rem;
		background: rgba(15, 23, 42, 0.5);
		border-radius: 10px;
		padding: 0.2rem;
	}

	.mode-toggle button {
		background: transparent;
		color: var(--color-text-muted);
		border: none;
		border-radius: 8px;
		padding: 0.35rem 0.7rem;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
	}

	.mode-toggle button.active {
		background: rgba(20, 184, 166, 0.14);
		color: var(--color-primary);
	}

	.summary-table {
		display: grid;
		gap: 0.35rem;
		font-size: 0.9rem;
	}

	.summary-head,
	.summary-row {
		display: grid;
		grid-template-columns: minmax(140px, 1.5fr) 48px 2fr 1fr 1fr;
		gap: 0.5rem;
		align-items: center;
	}

	.summary-head {
		font-size: 0.7rem;
		text-transform: uppercase;
		color: var(--color-text-muted);
		letter-spacing: 0.05em;
	}

	.summary-row {
		padding: 0.35rem 0;
		border-top: 1px solid rgba(148, 163, 184, 0.12);
	}

	.summary-row.muted {
		opacity: 0.55;
	}

	.group-label {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
	}

	.swatch {
		width: 10px;
		height: 10px;
		border-radius: 3px;
		flex-shrink: 0;
	}

	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.bar {
		display: inline-block;
		height: 8px;
		width: var(--w, 0%);
		background: var(--c, var(--color-primary));
		border-radius: 4px;
		margin-right: 0.5rem;
		vertical-align: middle;
	}

	.num {
		font-variant-numeric: tabular-nums;
	}

	.empty {
		color: var(--color-text-muted);
		font-size: 0.9rem;
		padding: 1.5rem 0;
		text-align: center;
	}
</style>
