<script lang="ts">
	import { onMount } from 'svelte';
	import { user } from '$lib/stores/auth';
	import { getRoutineLogsByRoutine, getUserSettings, getSeasonsForUser } from '$lib/firestore';
	import LineChart from './LineChart.svelte';
	import type { RoutineTemplate, RoutineLog } from '$lib/types';
	import { formatTime } from '$lib/utils/time';
	import { getMetricValue } from '$lib/utils/metrics';
	import {
		filterLogsByDateRange,
		getTimeframeStartDate,
		type Timeframe
	} from '$lib/utils/analytics';

	let {
		routine,
		currentLogId
	}: {
		routine: RoutineTemplate;
		currentLogId: string;
	} = $props();

	let recentLogs = $state<RoutineLog[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let defaultFilterKey = $state<string>('tf:1month');
	let defaultTimeframeFallback = $state<Timeframe>('1month');

	function toJsDate(value: unknown): Date {
		if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
			return (value as { toDate: () => Date }).toDate();
		}
		return new Date(value as string | number | Date);
	}

	// Determine if this metric is "lower is better" (for interval training speed)
	let lowerIsBetter = $derived.by(() => {
		// For interval training routines, faster (lower) time is better
		// Check if routine is interval training (not max attempt)
		const isMaxAttempt = routine.tags.includes('max-attempt') || routine.tags.includes('pb');

		// If it's an interval routine and using time as hero metric, lower is better
		if (!isMaxAttempt && routine.displayConfig?.heroMetric === 'totalTime') {
			return true;
		}

		// For avgTimePerRep, lower is always better
		if (routine.displayConfig?.heroMetric === 'avgTimePerRep') {
			return true;
		}

		// Otherwise higher is better (distance, breath hold time, etc.)
		return false;
	});

	// Derived chart data
	let chartData = $derived.by(() => {
		if (recentLogs.length === 0) {
			return {
				labels: [],
				datasets: []
			};
		}

		// Use the routine's hero metric for charting
		const heroMetric = routine.displayConfig?.heroMetric || 'totalDistance';

		// Extract values (reverse so oldest is first, newest is last)
		const reversedLogs = [...recentLogs].reverse();
		const labels = reversedLogs.map((log) => {
			const date = toJsDate(log.date);
			return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		});

		// Use getMetricValue to properly calculate metrics (handles calculated metrics)
		const values = reversedLogs.map((log) => {
			const value = getMetricValue(heroMetric, log, routine);
			// Convert seconds to minutes for time-based metrics
			if (heroMetric.includes('Time') || heroMetric.includes('time')) {
				return value / 60; // Convert to minutes
			}
			return value;
		});

		// Determine label based on metric
		let label = routine.displayConfig?.heroMetricLabel || 'Value';
		const isTimeMetric = heroMetric.includes('Time') || heroMetric.includes('time');

		if (isTimeMetric) {
			label = lowerIsBetter ? `${label} (min) - Lower is Better` : `${label} (min)`;
		} else if (heroMetric === 'totalDistance') {
			label = `${label} (m)`;
		}

		return {
			labels,
			datasets: [
				{
					label,
					data: values,
					borderColor: '#14b8a6',
					backgroundColor: 'rgba(20, 184, 166, 0.1)',
					tension: 0.4,
					fill: true,
					pointRadius: 4,
					pointHoverRadius: 6
				}
			]
		};
	});

	// Calculate trend
	let trend = $derived.by(() => {
		if (recentLogs.length < 3) return 'stable';

		// Use the same metric as the chart
		const heroMetric = routine.displayConfig?.heroMetric || 'totalDistance';

		// Get metric values using the utility function
		const values = recentLogs.map((log) => getMetricValue(heroMetric, log, routine));

		// Compare first half (newer) vs second half (older)
		// Note: logs are ordered desc (newest first)
		const mid = Math.floor(values.length / 2);
		const firstHalfAvg = values.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
		const secondHalfAvg = values.slice(mid).reduce((a, b) => a + b, 0) / (values.length - mid);

		// Calculate: (newer - older) / older to get change %
		const percentChange = ((firstHalfAvg - secondHalfAvg) / secondHalfAvg) * 100;

		// For "lower is better" metrics, invert the interpretation
		const effectiveChange = lowerIsBetter ? -percentChange : percentChange;

		if (effectiveChange > 5) return 'improving';
		if (effectiveChange < -5) return 'declining';
		return 'stable';
	});

	// Check if current log is a PB
	let isPersonalBest = $derived.by(() => {
		if (recentLogs.length === 0) return false;

		const currentLog = recentLogs.find((log) => log.id === currentLogId);
		if (!currentLog) return false;

		// Use the same metric as the chart
		const heroMetric = routine.displayConfig?.heroMetric || 'totalDistance';

		// Get metric values using the utility function
		const currentValue = getMetricValue(heroMetric, currentLog, routine);
		const allValues = recentLogs.map((log) => getMetricValue(heroMetric, log, routine));

		// For "lower is better", find minimum; otherwise find maximum
		if (lowerIsBetter) {
			const minValue = Math.min(...allValues.filter(v => v > 0));
			return currentValue === minValue && currentValue > 0;
		} else {
			const maxValue = Math.max(...allValues);
			return currentValue === maxValue && currentValue > 0;
		}
	});

	onMount(async () => {
		if (!$user) {
			error = 'User not authenticated';
			loading = false;
			return;
		}

		try {
			const settings = await getUserSettings($user.uid);
			if (settings?.defaultTimeframe) {
				defaultTimeframeFallback = settings.defaultTimeframe;
			}
			if (settings?.defaultAnalyticsFilter) {
				defaultFilterKey = settings.defaultAnalyticsFilter;
			} else if (settings?.defaultTimeframe) {
				defaultFilterKey = `tf:${settings.defaultTimeframe}`;
			}

			let logs: RoutineLog[] = [];

			if (defaultFilterKey.startsWith('season:')) {
				const seasons = await getSeasonsForUser($user.uid);
				const seasonId = defaultFilterKey.replace('season:', '');
				const selectedSeason = seasons.find((season) => season.id === seasonId);

				if (selectedSeason) {
					const startDate = selectedSeason.startDate.toDate();
					logs = await getRoutineLogsByRoutine($user.uid, routine.id, undefined, startDate);
					if (selectedSeason.endDate) {
						logs = filterLogsByDateRange(logs, startDate, selectedSeason.endDate.toDate());
					}
				}
			}

			if (logs.length === 0) {
				const timeframeValue = defaultFilterKey.startsWith('tf:')
					? (defaultFilterKey.replace('tf:', '') as Timeframe)
					: defaultTimeframeFallback;
				const sinceDate = getTimeframeStartDate(
					timeframeValue === 'all' ? '1month' : timeframeValue
				);
				logs = await getRoutineLogsByRoutine($user.uid, routine.id, undefined, sinceDate);
			}

			recentLogs = logs;
		} catch (err) {
			console.error('Failed to fetch routine history:', err);
			error = 'Failed to load performance history';
		} finally {
			loading = false;
		}
	});
</script>

<div class="mini-analytics">
	<div class="header">
		<h3>Performance Trend</h3>
		{#if !loading && recentLogs.length > 0}
			<div class="trend-indicator {trend}">
				{#if trend === 'improving'}
					<span class="icon">↑</span> Improving
				{:else if trend === 'declining'}
					<span class="icon">↓</span> Declining
				{:else}
					<span class="icon">→</span> Stable
				{/if}
			</div>
		{/if}
	</div>

	{#if loading}
		<div class="loading">
			<div class="spinner"></div>
			<p>Loading performance data...</p>
		</div>
	{:else if error}
		<div class="error">
			<p>{error}</p>
		</div>
	{:else if recentLogs.length === 0}
		<div class="empty">
			<p>No previous performance data for this routine yet.</p>
		</div>
	{:else}
		<div class="chart-container">
			<LineChart data={chartData} height={200} />
		</div>

		{#if isPersonalBest}
			<div class="pb-badge">
				<span class="trophy">🏆</span>
				<span>Personal Best!</span>
			</div>
		{/if}

		<div class="stats">
			<div class="stat">
				<span class="label">Sessions Logged:</span>
				<span class="value">{recentLogs.length}</span>
			</div>
		</div>
	{/if}
</div>

<style>
	.mini-analytics {
		background: var(--color-bg-card);
		border-radius: 12px;
		padding: 1.25rem;
		margin-bottom: 1.5rem;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.header h3 {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.trend-indicator {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.875rem;
		font-weight: 600;
		padding: 0.375rem 0.75rem;
		border-radius: 9999px;
	}

	.trend-indicator.improving {
		background: rgba(16, 185, 129, 0.15);
		color: #10b981;
	}

	.trend-indicator.stable {
		background: rgba(148, 163, 184, 0.15);
		color: #94a3b8;
	}

	.trend-indicator.declining {
		background: rgba(239, 68, 68, 0.15);
		color: #ef4444;
	}

	.trend-indicator .icon {
		font-size: 1rem;
		font-weight: bold;
	}

	.loading,
	.error,
	.empty {
		text-align: center;
		padding: 2rem 1rem;
		color: var(--color-text-muted);
	}

	.loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid rgba(20, 184, 166, 0.2);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.error {
		color: #ef4444;
	}

	.chart-container {
		margin-bottom: 1rem;
	}

	.pb-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.75rem;
		background: linear-gradient(135deg, rgba(234, 179, 8, 0.15), rgba(251, 191, 36, 0.15));
		border: 1px solid rgba(234, 179, 8, 0.3);
		border-radius: 8px;
		margin-bottom: 1rem;
		font-weight: 600;
		color: #fbbf24;
	}

	.pb-badge .trophy {
		font-size: 1.25rem;
	}

	.stats {
		display: grid;
		gap: 0.75rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(148, 163, 184, 0.1);
	}

	.stat {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.stat .label {
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	.stat .value {
		color: var(--color-text);
		font-weight: 600;
		font-size: 0.9375rem;
	}
</style>
