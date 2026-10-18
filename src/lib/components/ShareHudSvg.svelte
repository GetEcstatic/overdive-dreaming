<!--
  In-app share HUD (plan §6.4): the same SVG the overlay worker burns into
  downloads, drawn over the player. With `onFlipDirection`, tapping the speed
  graph flips its direction (§4.8.5).
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		CARD_FADE_MS,
		HUD_TICK_MS,
		graphDirectionHitRect,
		shareHudSvg,
		type ShareHudDive
	} from '$lib/media/shareHud';

	interface Props {
		dive: ShareHudDive;
		atMs: number;
		/** Size of the visible video area in CSS pixels. */
		width: number;
		height: number;
		/** Show the result card (e.g. once playback has ended). */
		showCard?: boolean;
		/** Owner only: persist the flipped direction. The HUD redraws from the updated video. */
		onFlipDirection?: () => Promise<void>;
	}

	let { dive, atMs, width, height, showCard = false, onFlipDirection }: Props = $props();

	const FLIP_NOTICE_MS = 1800;
	let notice = $state<string | null>(null);
	let noticeTimer: ReturnType<typeof setTimeout> | null = null;
	const hit = $derived(width > 0 && height > 0 ? graphDirectionHitRect({ width, height }) : null);

	function showNotice(text: string): void {
		notice = text;
		if (noticeTimer) clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => (notice = null), FLIP_NOTICE_MS);
	}

	async function flip(event: MouseEvent): Promise<void> {
		// Don't let the tap reach the video (play/pause, fullscreen).
		event.stopPropagation();
		if (!onFlipDirection) return;
		try {
			await onFlipDirection();
			showNotice('Graph direction flipped');
		} catch {
			showNotice("Couldn't flip the graph. Try again.");
		}
	}

	onDestroy(() => {
		if (noticeTimer) clearTimeout(noticeTimer);
	});

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

<div class="share-hud">
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- generated from numbers and escaped text -->
	<div class="share-hud-art" aria-hidden="true">{@html svg}</div>
	{#if onFlipDirection && hit && !showCard}
		<button
			type="button"
			class="flip-target"
			style="left: {hit.x}px; top: {hit.y}px; width: {hit.w}px; height: {hit.h}px;"
			aria-label="Flip speed graph direction"
			onclick={flip}
		></button>
	{/if}
	{#if notice && hit}
		<div class="flip-notice" role="status" style="left: {hit.x + hit.w / 2}px; top: {hit.y}px;">{notice}</div>
	{/if}
</div>

<style>
	.share-hud {
		position: absolute;
		inset: 0;
		z-index: 10;
		pointer-events: none;
	}

	.flip-target {
		position: absolute;
		pointer-events: auto;
		background: none;
		border: 0;
		border-radius: 12px;
		cursor: pointer;
	}

	.flip-target:focus-visible {
		outline: 2px solid var(--color-primary);
	}

	.flip-notice {
		position: absolute;
		transform: translate(-50%, -110%);
		padding: 6px 12px;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.75);
		color: var(--color-text);
		font-size: 13px;
		white-space: nowrap;
	}

	.share-hud-art {
		position: absolute;
		inset: 0;
	}

	.share-hud :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
