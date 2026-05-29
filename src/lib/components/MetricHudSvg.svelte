<script lang="ts">
	import type { MetricHudFrame } from '$lib/media/metricHudFrame';
	import { metricHudFrameSvgMarkup } from '$lib/media/metricHudSvg';

	interface Props {
		frame: MetricHudFrame;
	}

	let { frame }: Props = $props();

	const viewHeight = $derived(frame.box.y + frame.box.height);
	const safeOffsetPx = $derived(Math.max(0, frame.box.y));
	const svgMarkup = $derived(metricHudFrameSvgMarkup(frame));
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
		{@html svgMarkup}
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

</style>
