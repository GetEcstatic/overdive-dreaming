<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Chart,
		LineController,
		LineElement,
		PointElement,
		LinearScale,
		CategoryScale,
		Title,
		Tooltip,
		Legend,
		Filler
	} from 'chart.js';

	// Register Chart.js components
	Chart.register(
		LineController,
		LineElement,
		PointElement,
		LinearScale,
		CategoryScale,
		Title,
		Tooltip,
		Legend,
		Filler
	);

	type SeasonBand = {
		label: string;
		startIndex: number;
		endIndex: number;
		color?: string;
	};

	let {
		data,
		title = '',
		height = 300,
		yTickFormatter,
		tooltipValueFormatter,
		seasonBands = []
	}: {
		data: { labels: string[]; datasets: any[] };
		title?: string;
		height?: number;
		yTickFormatter?: (value: number) => string;
		tooltipValueFormatter?: (value: number) => string;
		seasonBands?: SeasonBand[];
	} = $props();

	let canvas: HTMLCanvasElement;
	let chart: Chart | null = null;
	let hoverBand = $state<{ label: string; x: number; y: number } | null>(null);

	function getBandRects(chartInstance: Chart) {
		const { chartArea, scales } = chartInstance;
		const xScale = scales.x;
		const labelCount = chartInstance.data.labels?.length ?? 0;
		if (!xScale || labelCount === 0) return [];

		const first = xScale.getPixelForValue(0);
		const second = labelCount > 1 ? xScale.getPixelForValue(1) : first;
		const step = Math.abs(second - first) || (chartArea.right - chartArea.left) / labelCount;
		const halfStep = step / 2;

		return seasonBands.map((band) => {
			const startX = Math.max(
				chartArea.left,
				xScale.getPixelForValue(band.startIndex) - halfStep
			);
			const endX = Math.min(
				chartArea.right,
				xScale.getPixelForValue(band.endIndex) + halfStep
			);
			return { label: band.label, startX, endX };
		});
	}

	function handlePointerMove(event: PointerEvent) {
		if (!chart || !seasonBands || seasonBands.length === 0) return;
		const rect = canvas.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;
		const { chartArea } = chart;

		if (x < chartArea.left || x > chartArea.right || y < chartArea.top || y > chartArea.bottom) {
			hoverBand = null;
			return;
		}

		const band = getBandRects(chart).find((item) => x >= item.startX && x <= item.endX);
		if (band) {
			hoverBand = { label: band.label, x, y: chartArea.top + 8 };
		} else {
			hoverBand = null;
		}
	}

	function handlePointerLeave() {
		hoverBand = null;
	}

	const seasonBandPlugin = {
		id: 'seasonBands',
		beforeDatasetsDraw: (chartInstance: Chart) => {
			if (!seasonBands || seasonBands.length === 0) return;
			const { ctx, chartArea, scales } = chartInstance;
			const xScale = scales.x;
			if (!xScale) return;

			const labelCount = chartInstance.data.labels?.length ?? 0;
			if (labelCount === 0) return;

			const first = xScale.getPixelForValue(0);
			const second = labelCount > 1 ? xScale.getPixelForValue(1) : first;
			const step = Math.abs(second - first) || (chartArea.right - chartArea.left) / labelCount;
			const halfStep = step / 2;

			ctx.save();
			seasonBands.forEach((band) => {
				const startX = Math.max(
					chartArea.left,
					xScale.getPixelForValue(band.startIndex) - halfStep
				);
				const endX = Math.min(
					chartArea.right,
					xScale.getPixelForValue(band.endIndex) + halfStep
				);
				const width = endX - startX;
				if (width <= 0) return;

				ctx.fillStyle = band.color ?? 'rgba(20, 184, 166, 0.08)';
				ctx.fillRect(startX, chartArea.top, width, chartArea.bottom - chartArea.top);

			});
			ctx.restore();
		}
	};

	onMount(() => {
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		chart = new Chart(ctx, {
			type: 'line',
			data,
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					title: {
						display: !!title,
						text: title,
						color: '#f1f5f9',
						font: {
							size: 16,
							weight: 'bold'
						}
					},
					legend: {
						display: false,
						labels: {
							color: '#94a3b8',
							font: {
								size: 12
							}
						}
					},
					tooltip: {
						backgroundColor: '#1e293b',
						titleColor: '#f1f5f9',
						bodyColor: '#f1f5f9',
						borderColor: '#14b8a6',
						borderWidth: 1,
						callbacks: {
							label: (context) => {
								const raw = context.parsed?.y;
								if (typeof raw !== 'number') return `${context.dataset.label}: —`;
								const formatted = tooltipValueFormatter ? tooltipValueFormatter(raw) : raw;
								return `${context.dataset.label}: ${formatted}`;
							}
						}
					}
				},
				scales: {
					y: {
						beginAtZero: true,
						ticks: {
							color: '#94a3b8',
							callback: (value) => {
								const numeric = typeof value === 'string' ? Number(value) : value;
								if (Number.isNaN(numeric)) return value;
								return yTickFormatter ? yTickFormatter(numeric) : value;
							}
						},
						grid: {
							color: 'rgba(148, 163, 184, 0.1)'
						}
					},
					x: {
						ticks: {
							color: '#94a3b8'
						},
						grid: {
							color: 'rgba(148, 163, 184, 0.1)'
						}
					}
				}
			},
			plugins: [seasonBandPlugin]
		});

		return () => {
			chart?.destroy();
		};
	});

	$effect(() => {
		if (chart) {
			chart.data = data;
			chart.update();
		}
	});
</script>

<div
	class="chart-container"
	style="height: {height}px;"
	on:pointermove={handlePointerMove}
	on:pointerdown={handlePointerMove}
	on:pointerleave={handlePointerLeave}
>
	<canvas bind:this={canvas}></canvas>
	{#if hoverBand}
		<div
			class="band-tooltip"
			style="left: {hoverBand.x}px; top: {hoverBand.y}px;"
		>
			{hoverBand.label}
		</div>
	{/if}
</div>

<style>
	.chart-container {
		position: relative;
	}

	.band-tooltip {
		position: absolute;
		transform: translateX(-50%);
		padding: 0.35rem 0.6rem;
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.85);
		border: 1px solid rgba(148, 163, 184, 0.3);
		color: #e2e8f0;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		pointer-events: none;
		white-space: nowrap;
		box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
	}
</style>
