<script lang="ts">
	import type { RoutineLog, RoutineTemplate, MetricType } from '$lib/types';
	import { formatMetricValue, getMetricValue } from '$lib/utils/metrics';
	import {
		summariseGroup,
		findPB,
		sessionsSinceLastPB,
		isTimeMetric
	} from '$lib/utils/routineAnalytics';
	import { formatTime } from '$lib/utils/time';
	import { subWeeks, isAfter } from 'date-fns';

	let {
		logs,
		routine,
		metric,
		lowerIsBetter = false,
		metricLabel = ''
	}: {
		logs: RoutineLog[];
		routine: RoutineTemplate;
		metric: MetricType;
		lowerIsBetter?: boolean;
		metricLabel?: string;
	} = $props();

	const summary = $derived(summariseGroup(logs, metric, routine, lowerIsBetter));
	const pb = $derived(findPB(logs, metric, routine, lowerIsBetter));
	const pbSessionGap = $derived(sessionsSinceLastPB(logs, metric, routine, lowerIsBetter));

	const sessionCount = $derived.by(() => {
		const keys = new Set<string>();
		for (const log of logs) keys.add(log.sessionGroup || log.date.toDate().toDateString());
		return keys.size;
	});

	const lastLog = $derived.by(() => {
		if (logs.length === 0) return null;
		return [...logs].sort(
			(a, b) => b.date.toDate().getTime() - a.date.toDate().getTime()
		)[0];
	});

	const lastValue = $derived(lastLog ? getMetricValue(metric, lastLog, routine) : 0);

	const fourWeekStats = $derived.by(() => {
		const cutoff = subWeeks(new Date(), 4);
		const recent = logs.filter((l) => isAfter(l.date.toDate(), cutoff));
		return summariseGroup(recent, metric, routine, lowerIsBetter);
	});

	const trendDir = $derived.by(() => {
		const t = summary.trendPct;
		if (Math.abs(t) < 3) return 'stable';
		const improving = lowerIsBetter ? t < 0 : t > 0;
		return improving ? 'improving' : 'declining';
	});

	function fmt(value: number): string {
		if (!Number.isFinite(value) || value <= 0) return '—';
		return isTimeMetric(metric) ? formatTime(value) : formatMetricValue(metric, value);
	}
</script>

<div class="overview-stats" role="region" aria-label="Overview stats">
	<div class="stat">
		<span class="label">Sessions</span>
		<span class="value">{sessionCount || logs.length}</span>
		<span class="sub">{logs.length} logs</span>
	</div>

	<div class="stat pb-stat">
		<span class="label">Personal best</span>
		<span class="value pb-value">{fmt(summary.pb)}</span>
		<span class="sub">
			{#if pb}
				{pb.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
				{#if pbSessionGap > 0}&nbsp;· {pbSessionGap} sessions ago{/if}
			{:else}
				—
			{/if}
		</span>
	</div>

	<div class="stat">
		<span class="label">Last session</span>
		<span class="value">{fmt(lastValue)}</span>
		<span class="sub">
			{#if lastLog}
				{lastLog.date.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
			{:else}
				—
			{/if}
		</span>
	</div>

	<div class="stat">
		<span class="label">4-wk avg</span>
		<span class="value">{fmt(fourWeekStats.mean)}</span>
		<span class="sub">{fourWeekStats.n || 0} logs</span>
	</div>

	<div class="stat">
		<span class="label">Trend</span>
		<span class="value trend {trendDir}">
			{#if trendDir === 'improving'}↑{:else if trendDir === 'declining'}↓{:else}→{/if}
			<span class="trend-pct">{summary.trendPct >= 0 ? '+' : ''}{summary.trendPct.toFixed(1)}%</span>
		</span>
		<span class="sub">{metricLabel || 'metric'}</span>
	</div>

	<div class="stat">
		<span class="label">Consistency</span>
		<span class="value">
			{#if summary.cvPct !== undefined && summary.n >= 3}
				{summary.cvPct.toFixed(1)}%
			{:else}
				—
			{/if}
		</span>
		<span class="sub">CV (lower = steadier)</span>
	</div>
</div>

<style>
	.overview-stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 0.75rem;
		background: var(--color-bg-card);
		border-radius: 12px;
		padding: 1rem;
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}

	.label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
	}

	.value {
		font-size: 1.35rem;
		font-weight: 700;
		color: var(--color-text);
		overflow-wrap: anywhere;
	}

	.pb-value {
		background: linear-gradient(90deg, var(--color-primary), var(--color-secondary));
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}

	.sub {
		font-size: 0.72rem;
		color: var(--color-text-muted);
	}

	.trend {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.trend.improving { color: #22c55e; }
	.trend.declining { color: #f87171; }
	.trend.stable { color: var(--color-text-muted); }

	.trend-pct {
		font-size: 0.95rem;
		font-weight: 600;
	}
</style>
