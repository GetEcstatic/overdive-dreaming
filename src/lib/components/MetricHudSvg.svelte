<script lang="ts">
	import type { MetricHudFrame, MetricHudTextRun } from '$lib/media/metricHudFrame';

	interface Props {
		frame: MetricHudFrame;
	}

	let { frame }: Props = $props();

	const viewHeight = $derived(frame.box.y + frame.box.height);
	const safeOffsetPx = $derived(Math.max(0, frame.box.y));

	function textAnchor(run: MetricHudTextRun): 'start' | 'end' {
		return run.align === 'right' ? 'end' : 'start';
	}

	function textStyle(run: MetricHudTextRun): string {
		return [
			`font-family: ${run.style.family}`,
			`font-size: ${run.style.sizePx}px`,
			`font-weight: ${run.style.weight}`,
			`letter-spacing: ${run.style.letterSpacingEm}em`,
			`fill: ${run.style.color}`,
			`opacity: ${run.style.opacity}`
		].join('; ');
	}
</script>

<div
	class="metric-hud-svg"
	style={`--metric-hud-width: ${frame.widthPx}px; --metric-hud-view-height: ${viewHeight}px; --metric-hud-safe-offset: max(0px, calc(env(safe-area-inset-top) - ${safeOffsetPx}px));`}
	aria-hidden="true"
>
	<svg
		viewBox={`0 0 ${frame.widthPx} ${viewHeight}`}
		preserveAspectRatio="none"
		role="presentation"
	>
		<rect
			x={frame.box.x}
			y={frame.box.y}
			width={frame.box.width}
			height={frame.box.height}
			rx={frame.box.radius}
			fill={frame.background}
		/>

		{#each frame.textRuns as run}
			<text
				x={run.x}
				y={run.y}
				text-anchor={textAnchor(run)}
				dominant-baseline="text-before-edge"
				style={textStyle(run)}
			>
				{run.text}
			</text>
		{/each}
	</svg>
</div>

<style>
	.metric-hud-svg {
		position: absolute;
		left: 0;
		right: 0;
		top: var(--metric-hud-safe-offset);
		z-index: 10;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		height: var(--metric-hud-view-height);
		pointer-events: none;
	}

	.metric-hud-svg svg {
		display: block;
		width: min(100%, var(--metric-hud-width));
		height: var(--metric-hud-view-height);
		overflow: visible;
	}

	.metric-hud-svg text {
		font-variant-numeric: tabular-nums;
		text-transform: none;
	}
</style>