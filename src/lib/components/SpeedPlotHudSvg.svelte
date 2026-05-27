<script lang="ts">
	import type { SpeedPlotRenderModel } from '$lib/media/speedPlotHud';

	interface Props {
		model: SpeedPlotRenderModel;
		style?: string;
	}

	let { model, style = '' }: Props = $props();

	function smoothPath(points: readonly { x: number; y: number }[]): string {
		if (points.length === 0) return '';
		if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
		let path = `M ${points[0].x} ${points[0].y}`;
		for (let i = 0; i < points.length - 1; i += 1) {
			const previous = points[Math.max(0, i - 1)];
			const current = points[i];
			const next = points[i + 1];
			const after = points[Math.min(points.length - 1, i + 2)];
			const cp1x = current.x + (next.x - previous.x) / 6;
			const cp1y = current.y + (next.y - previous.y) / 6;
			const cp2x = next.x - (after.x - current.x) / 6;
			const cp2y = next.y - (after.y - current.y) / 6;
			path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`;
		}
		return path;
	}

	const speedPath = $derived(smoothPath(model.speedLine));
</script>

<div class="speed-plot-hud" {style} aria-hidden="true">
	<svg
		viewBox={`0 0 ${model.width} ${model.height}`}
		preserveAspectRatio="none"
		role="presentation"
	>
		<defs>
			<linearGradient id="speedPlotBg" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="#0d1320" stop-opacity="0.86" />
				<stop offset="1" stop-color="#000000" stop-opacity="0.86" />
			</linearGradient>
			<linearGradient id="speedPlotLine" x1={model.plotRect.x} y1="0" x2={model.plotRect.x + model.plotRect.width} y2="0">
				<stop offset="0" stop-color="#2dd4bf" />
				<stop offset="1" stop-color="#5eead4" />
			</linearGradient>
		</defs>

		<rect
			x={model.bandRect.x}
			y={model.bandRect.y}
			width={model.bandRect.width}
			height={model.bandRect.height}
			rx="6.5"
			fill="url(#speedPlotBg)"
		/>

		{#each model.gridLines as line}
			<line
				x1={line.x1}
				y1={line.y1}
				x2={line.x2}
				y2={line.y2}
				stroke="rgba(255,255,255,0.1)"
				stroke-width="0.36"
			/>
		{/each}

		{#if model.pbMarker}
			<line
				x1={model.pbMarker.x}
				y1={model.pbMarker.y1}
				x2={model.pbMarker.x}
				y2={model.pbMarker.y2}
				stroke="#facc15"
				stroke-width="0.72"
				stroke-dasharray="2 2"
			/>
			<path
				d={`M ${model.pbMarker.x} ${model.pbMarker.y2 + 4.3} l 3.2 3.2 l -3.2 3.2 l -3.2 -3.2 z`}
				fill="#facc15"
			/>
		{/if}

		{#if speedPath}
			<path
				d={speedPath}
				fill="none"
				stroke="url(#speedPlotLine)"
				stroke-width="1.08"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		{/if}

		{#if model.currentPoint}
			<circle cx={model.currentPoint.x} cy={model.currentPoint.y} r="1.8" fill="#f8fafc" />
		{/if}

		{#each model.xLabels as label}
			<text x={label.x} y={label.y} text-anchor="middle">{label.text}</text>
		{/each}
		{#each model.yLabels as label}
			<text x={label.x} y={label.y} text-anchor="end">{label.text}</text>
		{/each}
		<text
			x={model.yAxisLabel.x}
			y={model.yAxisLabel.y}
			text-anchor="middle"
			transform={`rotate(-90 ${model.yAxisLabel.x} ${model.yAxisLabel.y})`}
		>
			{model.yAxisLabel.text}
		</text>
	</svg>
</div>

<style>
	.speed-plot-hud {
		position: absolute;
		left: 0;
		right: 0;
		bottom: max(var(--speed-plot-bottom), env(safe-area-inset-bottom));
		z-index: 9;
		height: var(--speed-plot-band-height);
		pointer-events: none;
	}
	.speed-plot-hud svg {
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	.speed-plot-hud text {
		font-family: var(--speed-plot-axis-family);
		font-size: var(--speed-plot-axis-size);
		font-weight: var(--speed-plot-axis-weight);
		fill: var(--speed-plot-axis-color);
		letter-spacing: 0;
	}
</style>