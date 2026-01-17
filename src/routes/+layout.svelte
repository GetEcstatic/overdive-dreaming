<script lang="ts">
	import '../app.css';
	import BubbleBackground from '$lib/components/BubbleBackground.svelte';

	function handleWheel(e: WheelEvent) {
		const target = e.target as HTMLInputElement | null;
		if (target?.type === 'number') {
			e.preventDefault();
			target.blur();
		}
	}
</script>

<svelte:window on:wheel={handleWheel} />

<BubbleBackground />

<slot />
