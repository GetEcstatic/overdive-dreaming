<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Chart,
		ScatterController,
		PointElement,
		LinearScale,
		Tooltip,
		Legend,
		type TooltipItem
	} from 'chart.js';

	Chart.register(ScatterController, PointElement, LinearScale, Tooltip, Legend);

	type TooltipFormatter = (context: TooltipItem<'scatter'>) => string;

	let {
		data,
		height = 240,
		xTickFormatter,
		xSecondaryTickFormatter,
		yTickFormatter,
		yStepSize,
		yMin,
		yMax,
		tooltipFormatter,
		showSecondaryX = false,
		showLegend = true,
		xTitle,
		xSecondaryTitle,
		yTitle
	}: {
		data: { datasets: any[] };
		height?: number;
		xTickFormatter?: (value: number) => string;
		xSecondaryTickFormatter?: (value: number) => string;
		yTickFormatter?: (value: number) => string;
		yStepSize?: number;
		yMin?: number;
		yMax?: number;
		tooltipFormatter?: TooltipFormatter;
		showSecondaryX?: boolean;
		showLegend?: boolean;
		xTitle?: string;
		xSecondaryTitle?: string;
		yTitle?: string;
	} = $props();

	let canvas: HTMLCanvasElement;
	let chart: Chart | null = null;

	const buildScales = () => {
		const scales: Record<string, any> = {
			x: {
				type: 'linear',
				position: 'bottom',
				title: xTitle
					? { display: true, text: xTitle, color: '#94a3b8', font: { size: 11 } }
					: undefined,
				ticks: {
					color: '#94a3b8',
					callback: (value: string | number) => {
						const numeric = typeof value === 'string' ? Number(value) : value;
						if (Number.isNaN(numeric)) return value;
						return xTickFormatter ? xTickFormatter(numeric) : value;
					}
				},
				grid: {
					color: 'rgba(148, 163, 184, 0.1)'
				}
			},
			y: {
				type: 'linear',
				position: 'left',
				title: yTitle
					? { display: true, text: yTitle, color: '#94a3b8', font: { size: 11 } }
					: undefined,
				ticks: {
					color: '#94a3b8',
					stepSize: yStepSize,
					callback: (value: string | number) => {
						const numeric = typeof value === 'string' ? Number(value) : value;
						if (Number.isNaN(numeric)) return value;
						return yTickFormatter ? yTickFormatter(numeric) : value;
					}
				},
				min: yMin,
				max: yMax,
				grid: {
					color: 'rgba(148, 163, 184, 0.1)'
				}
			}
		};

		if (showSecondaryX) {
			scales.x2 = {
				type: 'linear',
				position: 'top',
				title: xSecondaryTitle
					? { display: true, text: xSecondaryTitle, color: '#94a3b8', font: { size: 11 } }
					: undefined,
				ticks: {
					color: '#94a3b8',
					callback: (value: string | number) => {
						const numeric = typeof value === 'string' ? Number(value) : value;
						if (Number.isNaN(numeric)) return value;
						return xSecondaryTickFormatter ? xSecondaryTickFormatter(numeric) : value;
					}
				},
				grid: {
					drawOnChartArea: false
				}
			};
		}

		return scales;
	};

	const applyChartOptions = () => ({
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: {
				display: showLegend,
				labels: {
					color: '#94a3b8',
					font: {
						size: 11
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
					label: (context: TooltipItem<'scatter'>) => {
						if (tooltipFormatter) {
							return tooltipFormatter(context);
						}
						const raw = context.raw as { x: number; y: number };
						return `${context.dataset.label}: ${raw.x} · Level ${raw.y}`;
					}
				}
			}
		},
		scales: buildScales()
	});

	onMount(() => {
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		chart = new Chart(ctx, {
			type: 'scatter',
			data,
			options: applyChartOptions()
		});

		return () => {
			chart?.destroy();
		};
	});

	$effect(() => {
		if (!chart) return;
		chart.data = data;
		chart.options = applyChartOptions();
		chart.update();
	});
</script>

<div class="chart-shell" style={`height: ${height}px`}>
	<canvas bind:this={canvas}></canvas>
</div>

<style>
	.chart-shell {
		width: 100%;
	}
</style>
