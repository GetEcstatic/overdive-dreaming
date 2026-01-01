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

	let {
		data,
		title = '',
		height = 300
	}: {
		data: { labels: string[]; datasets: any[] };
		title?: string;
		height?: number;
	} = $props();

	let canvas: HTMLCanvasElement;
	let chart: Chart | null = null;

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
						display: true,
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
						borderWidth: 1
					}
				},
				scales: {
					y: {
						beginAtZero: true,
						ticks: {
							color: '#94a3b8'
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
			}
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

<div style="height: {height}px; position: relative;">
	<canvas bind:this={canvas}></canvas>
</div>
