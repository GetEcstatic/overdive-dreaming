<script lang="ts">
	import '../app.css';

	function handleWheel(e: WheelEvent) {
		const target = e.target as HTMLInputElement | null;
		if (target?.type === 'number') {
			e.preventDefault();
			target.blur();
		}
	}
</script>

<svelte:window on:wheel={handleWheel} />

<slot />
