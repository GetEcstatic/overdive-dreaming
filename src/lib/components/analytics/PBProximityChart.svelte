<script lang="ts">
	import LineChart from '$lib/components/LineChart.svelte';
	import type { RoutineLog, PersonalBests } from '$lib/types';
	import { calculatePBProximity } from '$lib/utils/analytics';
	import { format } from 'date-fns';

	let { logs, personalBests }: { logs: RoutineLog[]; personalBests: PersonalBests } = $props();

	const proximityData = $derived.by(() => {
		// Convert PersonalBests to Record<Discipline, number>
		const pbMap: Record<string, number> = {};
		if (personalBests.STA) pbMap.STA = personalBests.STA;
		if (personalBests.DYN) pbMap.DYN = personalBests.DYN;
		if (personalBests.DNF) pbMap.DNF = personalBests.DNF;
		if (personalBests.DYNB) pbMap.DYNB = personalBests.DYNB;

		const proximityPoints = calculatePBProximity(logs, pbMap);

		if (proximityPoints.length === 0) {
			return { labels: [], datasets: [] };
		}

		// Group by discipline
		const byDiscipline: Record<string, typeof proximityPoints> = {};
		for (const point of proximityPoints) {
			if (!byDiscipline[point.discipline]) {
				byDiscipline[point.discipline] = [];
			}
			byDiscipline[point.discipline].push(point);
		}

		// Create datasets
		const colors: Record<string, string> = {
			DYN: '#14b8a6',
			DNF: '#10b981',
			DYNB: '#06b6d4',
			STA: '#8b5cf6'
		};

		const datasets = Object.entries(byDiscipline).map(([discipline, points]) => ({
			label: discipline,
			data: points.map((p) => p.percentage),
			borderColor: colors[discipline] || '#94a3b8',
			backgroundColor: 'transparent',
			tension: 0.3,
			pointRadius: 4,
			pointHoverRadius: 6
		}));

		// Get unique dates for labels
		const allDates = Array.from(new Set(proximityPoints.map((p) => p.date))).sort();

		return {
			labels: allDates.map((date) => format(new Date(date), 'MMM d')),
			datasets
		};
	});

	const averageProximity = $derived.by(() => {
		const pbMap: Record<string, number> = {};
		if (personalBests.STA) pbMap.STA = personalBests.STA;
		if (personalBests.DYN) pbMap.DYN = personalBests.DYN;
		if (personalBests.DNF) pbMap.DNF = personalBests.DNF;
		if (personalBests.DYNB) pbMap.DYNB = personalBests.DYNB;

		const proximityPoints = calculatePBProximity(logs, pbMap);
		if (proximityPoints.length === 0) return 0;

		const sum = proximityPoints.reduce((acc, point) => acc + point.percentage, 0);
		return Math.round(sum / proximityPoints.length);
	});

	const hasPBs = $derived(
		personalBests.STA !== undefined ||
		personalBests.DYN !== undefined ||
		personalBests.DNF !== undefined ||
		personalBests.DYNB !== undefined
	);
</script>

<div class="pb-proximity-chart">
	<div class="chart-header">
		<h3 class="chart-title">Distance from Personal Best</h3>
		{#if hasPBs && averageProximity > 0}
			<div class="chart-stats">
				<span class="stat-label">Avg:</span>
				<span class="stat-value">{averageProximity}%</span>
			</div>
		{/if}
	</div>

	{#if !hasPBs}
		<div class="empty-state">
			<p>Log max attempt sessions to establish personal bests</p>
		</div>
	{:else if proximityData.labels.length === 0}
		<div class="empty-state">
			<p>No training data available with established PBs</p>
		</div>
	{:else}
		<div class="chart-wrapper">
			<LineChart data={proximityData} height={250} />
			<div class="threshold-line">
				<div class="threshold-label">100% = PB</div>
			</div>
		</div>

		<div class="legend">
			<div class="legend-item">
				<div class="legend-color below"></div>
				<span>Below PB (training intensity)</span>
			</div>
			<div class="legend-item">
				<div class="legend-color at"></div>
				<span>At or above PB (new record!)</span>
			</div>
		</div>
	{/if}
</div>

<style>
	.pb-proximity-chart {
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

	.chart-wrapper {
		position: relative;
	}

	.threshold-line {
		position: absolute;
		top: 50%;
		right: 1rem;
		transform: translateY(-50%);
		pointer-events: none;
	}

	.threshold-label {
		background: rgba(234, 179, 8, 0.15);
		color: #eab308;
		padding: 0.375rem 0.75rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 1.5rem;
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(148, 163, 184, 0.1);
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}

	.legend-color {
		width: 24px;
		height: 3px;
		border-radius: 2px;
	}

	.legend-color.below {
		background: linear-gradient(to right, #14b8a6, #10b981);
	}

	.legend-color.at {
		background: #eab308;
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

		.threshold-line {
			position: static;
			transform: none;
			margin-top: 1rem;
			text-align: right;
		}
	}
</style>
