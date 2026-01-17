<script lang="ts">
	import { onMount } from 'svelte';

	// Configuration for bubbles
	const BUBBLE_COUNT = 15;
	const MIN_SIZE = 4;
	const MAX_SIZE = 12;
	const MIN_DURATION = 12;
	const MAX_DURATION = 25;

	interface Bubble {
		id: number;
		size: number;
		left: number;
		duration: number;
		delay: number;
		drift: number;
	}

	let bubbles: Bubble[] = $state([]);
	let mounted = $state(false);

	onMount(() => {
		// Generate random bubbles
		bubbles = Array.from({ length: BUBBLE_COUNT }, (_, i) => ({
			id: i,
			size: MIN_SIZE + Math.random() * (MAX_SIZE - MIN_SIZE),
			left: Math.random() * 100,
			duration: MIN_DURATION + Math.random() * (MAX_DURATION - MIN_DURATION),
			delay: Math.random() * 15,
			drift: (Math.random() - 0.5) * 60
		}));
		mounted = true;
	});
</script>

{#if mounted}
	<div class="bubble-container" aria-hidden="true">
		{#each bubbles as bubble (bubble.id)}
			<div
				class="bubble"
				style="
					width: {bubble.size}px;
					height: {bubble.size}px;
					left: {bubble.left}%;
					animation-duration: {bubble.duration}s;
					animation-delay: {bubble.delay}s;
					--drift: {bubble.drift}px;
				"
			></div>
		{/each}
	</div>
{/if}

<style>
	.bubble-container {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: -1;
		overflow: hidden;
	}

	.bubble {
		position: absolute;
		bottom: -20px;
		border-radius: 50%;
		background: radial-gradient(circle at 30% 30%, 
			rgba(20, 184, 166, 0.25) 0%, 
			rgba(20, 184, 166, 0.12) 50%,
			rgba(20, 184, 166, 0.04) 100%);
		box-shadow: 0 0 4px rgba(20, 184, 166, 0.15);
		animation: rise linear infinite;
		opacity: 0;
	}

	@keyframes rise {
		0% {
			transform: translateY(0) translateX(0) scale(1);
			opacity: 0;
		}
		10% {
			opacity: 1;
		}
		90% {
			opacity: 0.9;
		}
		100% {
			transform: translateY(-100vh) translateX(var(--drift, 20px)) scale(0.7);
			opacity: 0;
		}
	}

	/* Reduce motion for accessibility */
	@media (prefers-reduced-motion: reduce) {
		.bubble {
			animation: none;
			display: none;
		}
	}
</style>
