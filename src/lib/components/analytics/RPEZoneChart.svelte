<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Chart,
		BarController,
		BarElement,
		LinearScale,
		CategoryScale,
		Title,
		Tooltip,
		Legend
	} from 'chart.js';
	import type { RoutineLog } from '$lib/types';
	import {
		aggregateVolumeByRPEZone,
		calculateRPEZoneDistribution,
		RPE_ZONES
	} from '$lib/utils/analytics';
	import { format } from 'date-fns';

	Chart.register(BarController, BarElement, LinearScale, CategoryScale, Title, Tooltip, Legend);

	let { logs }: { logs: RoutineLog[] } = $props();

	let selectedMetric = $state<'distance' | 'time'>('distance');
	let canvas: HTMLCanvasElement;
	let chart: Chart | null = null;

	const chartData = $derived.by(() => {
		const weeklyData = aggregateVolumeByRPEZone(logs, selectedMetric);

		if (weeklyData.length === 0) {
			return { labels: [], datasets: [] };
		}

		const labels = weeklyData.map((w) => format(new Date(w.week), 'MMM d'));

		const datasets = RPE_ZONES.map((zone) => ({
			label: zone.label,
			data: weeklyData.map((w) => w.byZone[zone.zone]),
			backgroundColor: zone.bgColor,
			borderColor: zone.color,
			borderWidth: 1
		}));

		return { labels, datasets };
	});

	const distribution = $derived(calculateRPEZoneDistribution(logs, selectedMetric));

	function formatValue(value: number): string {
		if (selectedMetric === 'distance') {
			return `${value.toLocaleString()}m`;
		}
		const mins = Math.floor(value / 60);
		const secs = value % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	function createChart() {
		if (!canvas || chartData.labels.length === 0) return;

		if (chart) {
			chart.destroy();
		}

		chart = new Chart(canvas, {
			type: 'bar',
			data: chartData,
			options: {
				responsive: true,
				maintainAspectRatio: false,
				scales: {
					x: {
						stacked: true,
						grid: { display: false },
						ticks: {
							color: 'rgba(148, 163, 184, 0.8)',
							font: { size: 11 }
						}
					},
					y: {
						stacked: true,
						title: {
							display: true,
							text: selectedMetric === 'distance' ? 'Volume (m)' : 'Time (s)',
							color: 'rgba(148, 163, 184, 0.8)'
						},
						ticks: {
							color: 'rgba(148, 163, 184, 0.8)'
						},
						grid: {
							color: 'rgba(148, 163, 184, 0.1)'
						}
					}
				},
				plugins: {
					legend: {
						position: 'bottom',
						labels: {
							color: 'rgba(148, 163, 184, 0.9)',
							padding: 16,
							usePointStyle: true,
							pointStyle: 'rectRounded'
						}
					},
					tooltip: {
						callbacks: {
							label: (ctx) => {
								const value = ctx.raw as number;
								return selectedMetric === 'distance'
									? `${ctx.dataset.label}: ${value.toLocaleString()}m`
									: `${ctx.dataset.label}: ${Math.floor(value / 60)}:${(value % 60).toString().padStart(2, '0')}`;
							}
						}
					}
				}
			}
		});
	}

	onMount(() => {
		createChart();
		return () => chart?.destroy();
	});

	$effect(() => {
		// Re-create chart when metric changes
		if (canvas && chartData.labels.length > 0) {
			createChart();
		}
	});
</script>

<div class="rpe-zone-chart">
	<div class="chart-header">
		<h3 class="chart-title">Training Intensity by RPE Zone</h3>
		<div class="metric-toggle">
			<button
				class="metric-pill"
				class:active={selectedMetric === 'distance'}
				onclick={() => (selectedMetric = 'distance')}
			>
				Distance
			</button>
			<button
				class="metric-pill"
				class:active={selectedMetric === 'time'}
				onclick={() => (selectedMetric = 'time')}
			>
				Time
			</button>
		</div>
	</div>

	{#if distribution.logsWithRPE > 0}
		<div class="balance-row">
			<div class="balance-indicator" class:balanced={distribution.isBalanced}>
				{distribution.balanceMessage}
			</div>
		</div>
	{/if}

	{#if distribution.logsWithoutRPE > 0}
		<p class="data-warning">
			⚠️ {distribution.logsWithoutRPE} of {logs.length} sessions missing RPE data
		</p>
	{/if}

	{#if distribution.logsWithRPE > 0}
		<div class="distribution-summary">
			<div class="zone-stat very-easy">
				<span class="zone-label">Very Easy</span>
				<span class="zone-rpe">RPE 1-2</span>
				<span class="zone-value">{distribution.veryEasy.percentage.toFixed(0)}%</span>
				<span class="zone-volume">{formatValue(distribution.veryEasy.volume)}</span>
			</div>
			<div class="zone-stat easy">
				<span class="zone-label">Easy</span>
				<span class="zone-rpe">RPE 3-4</span>
				<span class="zone-value">{distribution.easy.percentage.toFixed(0)}%</span>
				<span class="zone-volume">{formatValue(distribution.easy.volume)}</span>
			</div>
			<div class="zone-stat moderate">
				<span class="zone-label">Moderate</span>
				<span class="zone-rpe">RPE 5-6</span>
				<span class="zone-value">{distribution.moderate.percentage.toFixed(0)}%</span>
				<span class="zone-volume">{formatValue(distribution.moderate.volume)}</span>
			</div>
			<div class="zone-stat hard">
				<span class="zone-label">Hard</span>
				<span class="zone-rpe">RPE 7-8</span>
				<span class="zone-value">{distribution.hard.percentage.toFixed(0)}%</span>
				<span class="zone-volume">{formatValue(distribution.hard.volume)}</span>
			</div>
			<div class="zone-stat very-hard">
				<span class="zone-label">Very Hard</span>
				<span class="zone-rpe">RPE 9-10</span>
				<span class="zone-value">{distribution.veryHard.percentage.toFixed(0)}%</span>
				<span class="zone-volume">{formatValue(distribution.veryHard.volume)}</span>
			</div>
		</div>
		
		<!-- Freediving Zone 2 Summary -->
		<div class="zone2-summary">
			<span class="zone2-label">Freediving Zone 2 (RPE 3-6)</span>
			<span class="zone2-value">{distribution.freedivingZone2.percentage.toFixed(0)}%</span>
			<span class="zone2-target">Target: ~80%</span>
		</div>
	{/if}

	{#if chartData.labels.length === 0}
		<div class="empty-state">
			<p>No training data with RPE available for this timeframe</p>
			<p class="empty-hint">Log sessions with RPE ratings to see intensity distribution</p>
		</div>
	{:else}
		<div class="chart-container">
			<canvas bind:this={canvas}></canvas>
		</div>
	{/if}
</div>

<style>
	.rpe-zone-chart {
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.1);
		border-radius: 12px;
		padding: 1.5rem;
		margin-bottom: 1.5rem;
		overflow: hidden;
	}

	.chart-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.chart-title {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin: 0;
	}

	.metric-toggle {
		display: flex;
		gap: 0.25rem;
		background: rgba(148, 163, 184, 0.1);
		border-radius: 8px;
		padding: 0.25rem;
	}

	.metric-pill {
		padding: 0.375rem 0.75rem;
		border-radius: 6px;
		border: none;
		background: transparent;
		color: var(--color-text-secondary);
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.metric-pill:hover {
		color: var(--color-text-primary);
	}

	.metric-pill.active {
		background: var(--color-primary);
		color: white;
	}

	.balance-row {
		margin-bottom: 1rem;
	}

	.balance-indicator {
		display: inline-block;
		font-size: 0.8rem;
		padding: 0.375rem 0.75rem;
		border-radius: 8px;
		background: rgba(234, 179, 8, 0.2);
		color: #eab308;
		word-wrap: break-word;
		max-width: 100%;
	}

	.balance-indicator.balanced {
		background: rgba(34, 197, 94, 0.2);
		color: #22c55e;
	}

	.data-warning {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		margin-bottom: 1rem;
		opacity: 0.8;
	}

	.distribution-summary {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.zone-stat {
		flex: 1;
		min-width: 70px;
		padding: 0.5rem;
		border-radius: 8px;
		text-align: center;
	}

	.zone-stat.very-easy {
		background: rgba(16, 185, 129, 0.12);
	}

	.zone-stat.easy {
		background: rgba(34, 197, 94, 0.12);
	}

	.zone-stat.moderate {
		background: rgba(234, 179, 8, 0.12);
	}

	.zone-stat.hard {
		background: rgba(249, 115, 22, 0.12);
	}

	.zone-stat.very-hard {
		background: rgba(239, 68, 68, 0.12);
	}

	.zone-label {
		display: block;
		font-size: 0.65rem;
		color: var(--color-text-secondary);
		margin-bottom: 0.1rem;
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}

	.zone-rpe {
		display: block;
		font-size: 0.6rem;
		color: var(--color-text-secondary);
		opacity: 0.7;
		margin-bottom: 0.2rem;
	}

	.zone-value {
		display: block;
		font-size: 1.25rem;
		font-weight: 700;
		line-height: 1.2;
	}

	.zone-volume {
		display: block;
		font-size: 0.7rem;
		color: var(--color-text-secondary);
		margin-top: 0.1rem;
	}

	.zone-stat.very-easy .zone-value {
		color: #10b981;
	}
	.zone-stat.easy .zone-value {
		color: #22c55e;
	}
	.zone-stat.moderate .zone-value {
		color: #eab308;
	}
	.zone-stat.hard .zone-value {
		color: #f97316;
	}
	.zone-stat.very-hard .zone-value {
		color: #ef4444;
	}

	.zone2-summary {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		padding: 0.75rem;
		margin-bottom: 1.5rem;
		background: rgba(34, 197, 94, 0.08);
		border: 1px solid rgba(34, 197, 94, 0.2);
		border-radius: 8px;
	}

	.zone2-label {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		font-weight: 500;
	}

	.zone2-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: #22c55e;
	}

	.zone2-target {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		opacity: 0.8;
	}

	.chart-container {
		position: relative;
		height: 280px;
	}

	.empty-state {
		padding: 3rem 1rem;
		text-align: center;
		color: var(--color-text-secondary);
	}

	.empty-state p {
		margin: 0;
	}

	.empty-hint {
		font-size: 0.85rem;
		margin-top: 0.5rem !important;
		opacity: 0.7;
	}

	@media (max-width: 480px) {
		.rpe-zone-chart {
			padding: 1rem;
		}

		.chart-header {
			flex-direction: column;
			align-items: flex-start;
		}

		.balance-indicator {
			font-size: 0.75rem;
			padding: 0.25rem 0.5rem;
		}

		.distribution-summary {
			gap: 0.25rem;
		}

		.zone-stat {
			min-width: 55px;
			padding: 0.35rem;
		}

		.zone-label {
			font-size: 0.55rem;
		}

		.zone-rpe {
			font-size: 0.5rem;
		}

		.zone-value {
			font-size: 1rem;
		}

		.zone-volume {
			font-size: 0.6rem;
		}

		.zone2-summary {
			flex-direction: column;
			gap: 0.25rem;
			padding: 0.5rem;
		}

		.zone2-label {
			font-size: 0.7rem;
		}

		.zone2-value {
			font-size: 1.25rem;
		}

		.chart-container {
			height: 240px;
		}
	}
</style>
