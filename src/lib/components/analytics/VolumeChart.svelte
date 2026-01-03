<script lang="ts">
	import LineChart from '$lib/components/LineChart.svelte';
	import type { RoutineLog } from '$lib/types';
	import { aggregateVolumeByWeek } from '$lib/utils/analytics';
	import { format } from 'date-fns';

	let { logs, metric = 'distance' }: { logs: RoutineLog[]; metric?: 'distance' | 'time' } = $props();

	const volumeData = $derived.by(() => {
		const weeklyData = aggregateVolumeByWeek(logs, metric);

		if (weeklyData.length === 0) {
			return { labels: [], datasets: [] };
		}

		// Extract all unique disciplines
		const disciplines = Array.from(
			new Set(weeklyData.flatMap((week) => Object.keys(week.byDiscipline)))
		);

		// Create datasets for each discipline
		const datasets = disciplines.map((discipline) => {
			const data = weeklyData.map((week) => week.byDiscipline[discipline as keyof typeof week.byDiscipline] || 0);

			// Color mapping for disciplines
			const colors: Record<string, { border: string; background: string }> = {
				DYN: { border: '#14b8a6', background: 'rgba(20, 184, 166, 0.3)' },
				DNF: { border: '#10b981', background: 'rgba(16, 185, 129, 0.3)' },
				DYNB: { border: '#06b6d4', background: 'rgba(6, 182, 212, 0.3)' },
				STA: { border: '#8b5cf6', background: 'rgba(139, 92, 246, 0.3)' }
			};

			const color = colors[discipline] || { border: '#94a3b8', background: 'rgba(148, 163, 184, 0.3)' };

			return {
				label: discipline,
				data,
				borderColor: color.border,
				backgroundColor: color.background,
				fill: true,
				tension: 0.4
			};
		});

		return {
			labels: weeklyData.map((week) => format(new Date(week.week), 'MMM d')),
			datasets
		};
	});

	const totalVolume = $derived.by(() => {
		return logs.reduce((sum, log) => {
			const value = metric === 'distance' ? (log.totalDistance || 0) : (log.totalTime || 0);
			return sum + value;
		}, 0);
	});
</script>

<div class="volume-chart">
	<div class="chart-header">
		<h3 class="chart-title">Training Volume</h3>
		<div class="chart-stats">
			<span class="stat-label">Total:</span>
			<span class="stat-value">
				{#if metric === 'distance'}
					{totalVolume.toLocaleString()}m
				{:else}
					{Math.floor(totalVolume / 60)}:{(totalVolume % 60).toString().padStart(2, '0')}
				{/if}
			</span>
		</div>
	</div>

	{#if volumeData.labels.length === 0}
		<div class="empty-state">
			<p>No training data available for this timeframe</p>
		</div>
	{:else}
		<LineChart data={volumeData} height={250} />
	{/if}
</div>

<style>
	.volume-chart {
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.1);
		border-radius: 12px;
		padding: 1.5rem;
		margin-bottom: 1.5rem;
	}

	.chart-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.chart-title {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.chart-stats {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.stat-label {
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}

	.stat-value {
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-primary);
	}

	.empty-state {
		text-align: center;
		padding: 3rem 1rem;
		color: var(--color-text-muted);
	}

	@media (max-width: 640px) {
		.chart-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.75rem;
		}
	}
</style>
