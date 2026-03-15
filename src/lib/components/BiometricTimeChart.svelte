<script lang="ts">
	/**
	 * BiometricTimeChart - Stacked SpO2 and HR charts over time
	 * 
	 * Features:
	 * - Two separate charts: SpO2 on top, HR below
	 * - Synchronized hover between charts
	 * - Pinch-to-zoom and pan support
	 * - SpO2 threshold zones (70%, 60%, 50%)
	 * - Vertical hover bar showing values at specific time point
	 */

	import { onMount } from 'svelte';
	import {
		Chart,
		LineController,
		LineElement,
		PointElement,
		LinearScale,
		Title,
		Tooltip,
		Legend,
		Filler
	} from 'chart.js';
	import 'hammerjs';
	import zoomPlugin from 'chartjs-plugin-zoom';
	import type { BiometricReading } from '$lib/types';

	// Register Chart.js components
	Chart.register(
		LineController,
		LineElement,
		PointElement,
		LinearScale,
		Title,
		Tooltip,
		Legend,
		Filler,
		zoomPlugin
	);

	let {
		readings,
		height = 400
	}: {
		readings: BiometricReading[];
		height?: number;
	} = $props();

	let spo2Canvas: HTMLCanvasElement | undefined = $state();
	let hrCanvas: HTMLCanvasElement | undefined = $state();
	let spo2Chart: Chart | null = null;
	let hrChart: Chart | null = null;
	
	// Hover state (synchronized between charts)
	let hoverIndex = $state<number | null>(null);
	let hoverData = $state<{ time: string; spo2: number; hr: number; intervalType: string } | null>(null);

	// Track whether user is currently panning (to avoid hover interference)
	let isPanning = false;
	// Prevent recursive sync between charts
	let isSyncing = false;

	// Format time as mm:ss
	function formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	// Calculate running time from readings
	function getReadingsWithTime(): { time: number; spo2: number; hr: number }[] {
		return readings.map((r, i) => ({
			time: i,
			spo2: r.spo2,
			hr: r.hr
		}));
	}

	// Get data index from pixel X position
	function getIndexFromPixel(chart: Chart, pixelX: number): number | null {
		const { chartArea, scales } = chart;
		if (!chartArea || !scales.x) return null;
		
		if (pixelX < chartArea.left || pixelX > chartArea.right) return null;
		
		const value = scales.x.getValueForPixel(pixelX);
		if (value === undefined) return null;
		
		const index = Math.round(value);
		if (index < 0 || index >= readings.length) return null;
		
		return index;
	}

	// Get pixel position from canvas event
	function getCanvasX(event: MouseEvent | TouchEvent, canvas: HTMLCanvasElement | undefined): number {
		const rect = canvas?.getBoundingClientRect();
		if (!rect) return 0;
		
		if ('touches' in event && event.touches.length > 0) {
			return event.touches[0].clientX - rect.left;
		}
		if ('clientX' in event) {
			return event.clientX - rect.left;
		}
		return 0;
	}

	// Calculate the start index of the current section (apnea/recovery) for a given reading index
	function getSectionStartIndex(index: number): number {
		const currentType = readings[index]?.intervalType;
		if (!currentType) return index;
		let start = index;
		while (start > 0 && readings[start - 1]?.intervalType === currentType) {
			start--;
		}
		return start;
	}

	// Update hover state from either chart
	function updateHover(chart: Chart, pixelX: number) {
		const index = getIndexFromPixel(chart, pixelX);
		
		if (index !== null && readings[index]) {
			hoverIndex = index;
			const reading = readings[index];
			const sectionStart = getSectionStartIndex(index);
			const sectionElapsed = index - sectionStart; // seconds since section start
			hoverData = {
				time: formatTime(sectionElapsed),
				spo2: reading.spo2,
				hr: reading.hr,
				intervalType: reading.intervalType === 'apnea' ? 'Apnea' : 'Recovery'
			};
			// Update both charts
			spo2Chart?.update('none');
			hrChart?.update('none');
		}
	}

	// Handle mouse/touch move - update hover position (skip during pan)
	function handleSpo2PointerMove(event: MouseEvent | TouchEvent) {
		if (!spo2Chart || isPanning) return;
		const pixelX = getCanvasX(event, spo2Canvas);
		updateHover(spo2Chart, pixelX);
	}

	function handleHrPointerMove(event: MouseEvent | TouchEvent) {
		if (!hrChart || isPanning) return;
		const pixelX = getCanvasX(event, hrCanvas);
		updateHover(hrChart, pixelX);
	}

	// Handle mouse/touch leave - clear hover
	function handlePointerLeave() {
		hoverIndex = null;
		hoverData = null;
		spo2Chart?.update('none');
		hrChart?.update('none');
	}

	// Reset zoom on both charts
	function resetZoom() {
		spo2Chart?.resetZoom();
		hrChart?.resetZoom();
	}

	// Vertical hover line plugin
	function createHoverLinePlugin(color: string, getY: () => number | undefined) {
		return {
			id: 'hoverLine',
			afterDatasetsDraw: (chartInstance: Chart) => {
				if (hoverIndex === null) return;
				
				const { ctx, chartArea, scales } = chartInstance;
				const xScale = scales.x;
				if (!xScale || !chartArea) return;
				
				const x = xScale.getPixelForValue(hoverIndex);
				const y = getY();
				
				// Draw vertical line
				ctx.save();
				ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
				ctx.lineWidth = 1;
				ctx.setLineDash([4, 4]);
				
				ctx.beginPath();
				ctx.moveTo(x, chartArea.top);
				ctx.lineTo(x, chartArea.bottom);
				ctx.stroke();
				
				// Draw point indicator if we have y value
				if (y !== undefined) {
					ctx.beginPath();
					ctx.arc(x, y, 5, 0, 2 * Math.PI);
					ctx.fillStyle = color;
					ctx.fill();
					ctx.strokeStyle = '#fff';
					ctx.lineWidth = 2;
					ctx.setLineDash([]);
					ctx.stroke();
				}
				
				ctx.restore();
			}
		};
	}

	// SpO2 threshold zones plugin
	const spo2ZonesPlugin = {
		id: 'spo2Zones',
		beforeDatasetsDraw: (chartInstance: Chart) => {
			const { ctx, chartArea, scales } = chartInstance;
			const yScale = scales.y;
			if (!yScale || !chartArea) return;
			
			ctx.save();
			
			// Zone colors (subtle backgrounds)
			const zones = [
				{ min: 70, max: 80, color: 'rgba(251, 191, 36, 0.08)' },  // Warning (yellow)
				{ min: 60, max: 70, color: 'rgba(249, 115, 22, 0.08)' },  // Danger (orange)
				{ min: 50, max: 60, color: 'rgba(239, 68, 68, 0.08)' },   // Critical (red)
				{ min: 30, max: 50, color: 'rgba(217, 70, 239, 0.08)' }   // Extreme (purple)
			];
			
			for (const zone of zones) {
				const top = yScale.getPixelForValue(zone.max);
				const bottom = yScale.getPixelForValue(zone.min);
				
				ctx.fillStyle = zone.color;
				ctx.fillRect(chartArea.left, top, chartArea.right - chartArea.left, bottom - top);
			}
			
			ctx.restore();
		}
	};

	// Compute section boundaries (apnea/recovery segments) from readings
	function getSectionBoundaries(): { start: number; end: number; type: 'apnea' | 'recovery' }[] {
		if (readings.length === 0) return [];
		const sections: { start: number; end: number; type: 'apnea' | 'recovery' }[] = [];
		let currentType = readings[0].intervalType;
		let sectionStart = 0;

		for (let i = 1; i < readings.length; i++) {
			if (readings[i].intervalType !== currentType) {
				sections.push({ start: sectionStart, end: i - 1, type: currentType });
				currentType = readings[i].intervalType;
				sectionStart = i;
			}
		}
		sections.push({ start: sectionStart, end: readings.length - 1, type: currentType });
		return sections;
	}

	// Interval labels plugin — draws boundary lines at section transitions only (no labels in chart)
	const intervalBandsPlugin = {
		id: 'intervalBands',
		afterDatasetsDraw: (chartInstance: Chart) => {
			const { ctx, chartArea, scales } = chartInstance;
			const xScale = scales.x;
			if (!xScale || !chartArea) return;

			ctx.save();
			const sections = getSectionBoundaries();

			for (let i = 1; i < sections.length; i++) {
				const x = xScale.getPixelForValue(sections[i].start);
				if (x >= chartArea.left && x <= chartArea.right) {
					ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
					ctx.lineWidth = 1;
					ctx.setLineDash([3, 3]);
					ctx.beginPath();
					ctx.moveTo(x, chartArea.top);
					ctx.lineTo(x, chartArea.bottom);
					ctx.stroke();
				}
			}

			ctx.restore();
		}
	};

	// Sync pan/zoom between both charts (with re-entrancy guard)
	function syncCharts(sourceChart: Chart) {
		if (isSyncing) return;
		isSyncing = true;
		try {
			const otherChart = sourceChart === spo2Chart ? hrChart : spo2Chart;
			if (!otherChart || !sourceChart.scales.x) return;
			const { min, max } = sourceChart.scales.x;
			// Use zoom plugin API so it tracks the zoom state properly
			otherChart.zoomScale('x', { min, max }, 'none');
		} finally {
			isSyncing = false;
		}
	}

	// Common chart options
	function getCommonOptions(maxX: number) {
		return {
			responsive: true,
			maintainAspectRatio: false,
			animation: false as const,
			interaction: {
				mode: 'index' as const,
				intersect: false
			},
			plugins: {
				legend: {
					display: false
				},
				tooltip: {
					enabled: false
				},
				zoom: {
					limits: {
						x: { min: 0, max: maxX, minRange: 10 }
					},
					pan: {
						enabled: true,
						mode: 'x' as const,
						onPanStart: () => { isPanning = true; return true; },
						onPan: ({ chart }: { chart: Chart }) => { if (!isSyncing) syncCharts(chart); },
						onPanComplete: ({ chart }: { chart: Chart }) => {
							isPanning = false;
							if (!isSyncing) syncCharts(chart);
						}
					},
					zoom: {
						wheel: {
							enabled: true
						},
						pinch: {
							enabled: true
						},
						drag: {
							enabled: false
						},
						mode: 'x' as const,
						onZoom: ({ chart }: { chart: Chart }) => { if (!isSyncing) syncCharts(chart); },
						onZoomComplete: ({ chart }: { chart: Chart }) => { if (!isSyncing) syncCharts(chart); }
					}
				}
			},
			scales: {
				x: {
					type: 'linear' as const,
					display: true,
					ticks: {
						color: '#94a3b8',
						font: { size: 10 },
						maxTicksLimit: 6,
						callback: (value: number | string) => formatTime(Number(value))
					},
					grid: {
						color: 'rgba(148, 163, 184, 0.1)'
					},
					min: 0,
					max: maxX
				}
			}
		};
	}

	onMount(() => {
		if (!spo2Canvas || !hrCanvas) return;
		
		const spo2Ctx = spo2Canvas.getContext('2d');
		const hrCtx = hrCanvas.getContext('2d');
		if (!spo2Ctx || !hrCtx) return;

		const dataWithTime = getReadingsWithTime();
		const spo2Points = dataWithTime.map(d => ({ x: d.time, y: d.spo2 }));
		const hrPoints = dataWithTime.map(d => ({ x: d.time, y: d.hr }));
		const maxX = readings.length - 1;
		
		// Calculate dynamic HR range with padding
		const hrValues = readings.map(r => r.hr).filter(hr => hr > 0);
		const hrMinVal = Math.min(...hrValues);
		const hrMaxVal = Math.max(...hrValues);
		const hrPadding = 10; // bpm padding
		const hrYMin = Math.max(0, Math.floor((hrMinVal - hrPadding) / 10) * 10); // Round down to nearest 10
		const hrYMax = Math.ceil((hrMaxVal + hrPadding) / 10) * 10; // Round up to nearest 10

		// SpO2 Chart
		spo2Chart = new Chart(spo2Ctx, {
			type: 'line',
			data: {
				datasets: [{
					label: 'SpO2 (%)',
					data: spo2Points,
					borderColor: '#14b8a6',
					backgroundColor: 'rgba(20, 184, 166, 0.15)',
					borderWidth: 1.5,
					pointRadius: 0,
					tension: 0.2,
					fill: true,
					segment: {
						borderColor: (ctx: any) => {
							const idx = ctx.p0DataIndex;
							return readings[idx]?.intervalType === 'apnea' ? '#8b5cf6' : '#14b8a6';
						},
						backgroundColor: (ctx: any) => {
							const idx = ctx.p0DataIndex;
							return readings[idx]?.intervalType === 'apnea' ? 'rgba(139, 92, 246, 0.12)' : 'rgba(20, 184, 166, 0.12)';
						}
					}
				}]
			},
			options: {
				...getCommonOptions(maxX),
				scales: {
					...getCommonOptions(maxX).scales,
					y: {
						type: 'linear',
						display: true,
						position: 'left',
						title: {
							display: true,
							text: 'SpO2 %',
							color: '#14b8a6',
							font: { size: 10, weight: 'bold' }
						},
						min: 30,
						max: 100,
						ticks: {
							color: '#14b8a6',
							font: { size: 9 },
							stepSize: 10
						},
						grid: {
							color: 'rgba(148, 163, 184, 0.1)'
						}
					}
				}
			},
			plugins: [
				intervalBandsPlugin,
				spo2ZonesPlugin,
				createHoverLinePlugin('#14b8a6', () => {
					if (hoverIndex === null || !spo2Chart) return undefined;
					return spo2Chart.scales.y.getPixelForValue(readings[hoverIndex]?.spo2 ?? 0);
				})
			]
		});

		// HR Chart
		hrChart = new Chart(hrCtx, {
			type: 'line',
			data: {
				datasets: [{
					label: 'HR (bpm)',
					data: hrPoints,
					borderColor: '#f43f5e',
					backgroundColor: 'rgba(244, 63, 94, 0.15)',
					borderWidth: 1.5,
					pointRadius: 0,
					tension: 0.2,
					fill: true,
					segment: {
						borderColor: (ctx: any) => {
							const idx = ctx.p0DataIndex;
							return readings[idx]?.intervalType === 'apnea' ? '#8b5cf6' : '#f43f5e';
						},
						backgroundColor: (ctx: any) => {
							const idx = ctx.p0DataIndex;
							return readings[idx]?.intervalType === 'apnea' ? 'rgba(139, 92, 246, 0.12)' : 'rgba(244, 63, 94, 0.12)';
						}
					}
				}]
			},
			options: {
				...getCommonOptions(maxX),
				scales: {
					...getCommonOptions(maxX).scales,
					x: {
						...getCommonOptions(maxX).scales.x,
						title: {
							display: true,
							text: 'Time',
							color: '#94a3b8',
							font: { size: 10 }
						}
					},
					y: {
						type: 'linear',
						display: true,
						position: 'left',
						title: {
							display: true,
							text: 'HR bpm',
							color: '#f43f5e',
							font: { size: 10, weight: 'bold' }
						},
						min: hrYMin,
						max: hrYMax,
						ticks: {
							color: '#f43f5e',
							font: { size: 9 }
						},
						grid: {
							color: 'rgba(148, 163, 184, 0.1)'
						}
					}
				}
			},
			plugins: [
				intervalBandsPlugin,
				createHoverLinePlugin('#f43f5e', () => {
					if (hoverIndex === null || !hrChart) return undefined;
					return hrChart.scales.y.getPixelForValue(readings[hoverIndex]?.hr ?? 0);
				})
			]
		});

		return () => {
			spo2Chart?.destroy();
			hrChart?.destroy();
		};
	});

	// Update charts when readings change (but don't override zoom scales)
	$effect(() => {
		if (!spo2Chart || !hrChart || !readings.length) return;
		
		const dataWithTime = getReadingsWithTime();
		const spo2Points = dataWithTime.map(d => ({ x: d.time, y: d.spo2 }));
		const hrPoints = dataWithTime.map(d => ({ x: d.time, y: d.hr }));
		
		spo2Chart.data.datasets[0].data = spo2Points;
		hrChart.data.datasets[0].data = hrPoints;
		
		// Only reset scale max if chart is not currently zoomed
		const maxX = readings.length - 1;
		const spo2Zoomed = spo2Chart.isZoomedOrPanned?.() ?? false;
		const hrZoomed = hrChart.isZoomedOrPanned?.() ?? false;
		
		if (!spo2Zoomed && spo2Chart.options.scales?.x) {
			(spo2Chart.options.scales.x as any).max = maxX;
		}
		if (!hrZoomed && hrChart.options.scales?.x) {
			(hrChart.options.scales.x as any).max = maxX;
		}
		
		spo2Chart.update('none');
		hrChart.update('none');
	});

	// Determine SpO2 severity class
	function getSpo2Class(spo2: number): string {
		if (spo2 < 50) return 'extreme';
		if (spo2 < 60) return 'critical';
		if (spo2 < 70) return 'danger';
		if (spo2 < 80) return 'warning';
		return '';
	}
</script>

<div class="chart-container">
	<!-- SpO2 Chart -->
	<div class="chart-wrapper" style="height: {Math.floor(height * 0.5)}px;">
		<canvas 
			bind:this={spo2Canvas}
			onmousemove={handleSpo2PointerMove}
			onmouseleave={handlePointerLeave}
			ontouchmove={handleSpo2PointerMove}
			ontouchend={handlePointerLeave}
		></canvas>
	</div>
	
	<!-- HR Chart -->
	<div class="chart-wrapper" style="height: {Math.floor(height * 0.5)}px;">
		<canvas 
			bind:this={hrCanvas}
			onmousemove={handleHrPointerMove}
			onmouseleave={handlePointerLeave}
			ontouchmove={handleHrPointerMove}
			ontouchend={handlePointerLeave}
		></canvas>
	</div>
	
	<!-- Hover Stats & Controls -->
	<div class="chart-footer">
		{#if hoverData}
			<div class="hover-stats">
				<div class="time-display">
					<span class="time">{hoverData.time}</span>
					<span class="interval-type" class:apnea={hoverData.intervalType === 'Apnea'}>{hoverData.intervalType}</span>
				</div>
				<div class="stats-values">
					<div class="stat spo2">
						<span class="value {getSpo2Class(hoverData.spo2)}">{hoverData.spo2}%</span>
						<span class="label">SpO2</span>
					</div>
					<div class="stat hr">
						<span class="value">{hoverData.hr}</span>
						<span class="label">bpm</span>
					</div>
				</div>
			</div>
		{:else}
			<p class="hint">Pinch to zoom • Drag to pan • Hover for values</p>
		{/if}
		
		<button type="button" class="reset-btn" onclick={resetZoom}>
			Reset Zoom
		</button>
	</div>
</div>

<style>
	.chart-container {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.chart-wrapper {
		position: relative;
		width: 100%;
		touch-action: pan-y pinch-zoom;
	}

	canvas {
		cursor: crosshair;
	}

	.chart-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0;
		gap: 0.5rem;
	}

	.hint {
		font-size: 0.7rem;
		color: var(--color-text-muted);
		margin: 0;
		flex: 1;
	}

	.hover-stats {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex: 1;
	}

	.time-display {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.time {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--color-text);
		font-variant-numeric: tabular-nums;
	}

	.interval-type {
		font-size: 0.65rem;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}

	.interval-type.apnea {
		color: #8b5cf6;
	}

	.stats-values {
		display: flex;
		gap: 1rem;
	}

	.stat {
		display: flex;
		align-items: baseline;
		gap: 0.25rem;
	}

	.stat .value {
		font-size: 1rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.stat .label {
		font-size: 0.65rem;
		color: var(--color-text-muted);
	}

	.stat.spo2 .value {
		color: #14b8a6;
	}

	.stat.spo2 .value.warning {
		color: #fbbf24;
	}

	.stat.spo2 .value.danger {
		color: #f97316;
	}

	.stat.spo2 .value.critical {
		color: #ef4444;
	}

	.stat.spo2 .value.extreme {
		color: #d946ef;
	}

	.stat.hr .value {
		color: #f43f5e;
	}

	.reset-btn {
		background: rgba(148, 163, 184, 0.1);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 4px;
		color: var(--color-text-muted);
		font-size: 0.7rem;
		padding: 0.35rem 0.6rem;
		cursor: pointer;
		transition: all 0.15s;
		white-space: nowrap;
	}

	.reset-btn:hover {
		background: rgba(148, 163, 184, 0.2);
		color: var(--color-text);
	}
</style>
