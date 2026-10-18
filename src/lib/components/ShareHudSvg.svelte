<!--
  In-app share HUD (plan §6.4): the same SVG the overlay worker burns into
  downloads, drawn over the player.
-->
<script lang="ts">
	import { CARD_FADE_MS, HUD_TICK_MS, shareHudSvg, type ShareHudDive } from '$lib/media/shareHud';

	interface Props {
		dive: ShareHudDive;
		atMs: number;
		/** Size of the visible video area in CSS pixels. */
		width: number;
		height: number;
		/** Show the result card (e.g. once playback has ended). */
		showCard?: boolean;
	}

	let { dive, atMs, width, height, showCard = false }: Props = $props();

	// Gradient and filter ids are global in the page; prefix them so players in the feed don't share them.
	const instanceId = $props.id();
	const idPrefix = `hud-${instanceId}`;

	// The export updates the HUD at 10 Hz; snapping to the same ticks keeps the player identical to the download.
	const tickMs = $derived(Math.floor(Math.max(0, atMs) / HUD_TICK_MS) * HUD_TICK_MS);
	const svg = $derived(
		width > 0 && height > 0
			? shareHudSvg(
					dive,
					tickMs,
					{ width: Math.round(width), height: Math.round(height) },
					{ cardAtMs: showCard ? tickMs - CARD_FADE_MS : null }
				).replace(/(id="|url\(#)hud-/g, `$1${idPrefix}-`)
			: ''
	);
</script>

<div class="share-hud" aria-hidden="true">
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- generated from numbers and escaped text -->
	{@html svg}
</div>

<style>
	.share-hud {
		position: absolute;
		inset: 0;
		z-index: 10;
		pointer-events: none;
	}

	.share-hud :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
