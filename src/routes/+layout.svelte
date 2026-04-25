<script lang="ts">
	import '../app.css';
	import BubbleBackground from '$lib/components/BubbleBackground.svelte';
	import NumberWheelSheet from '$lib/components/numberWheel/NumberWheelSheet.svelte';
	import DurationSheet from '$lib/components/numberWheel/DurationSheet.svelte';
	import { onMount } from 'svelte';

	// Prevent scroll wheel from changing number inputs
	// Use non-passive listener to allow preventDefault
	onMount(() => {
		function handleWheel(e: WheelEvent) {
			const target = e.target as HTMLInputElement | null;
			if (target?.type === 'number') {
				e.preventDefault();
				target.blur();
			}
		}

		// Add with { passive: false } to allow preventDefault
		window.addEventListener('wheel', handleWheel, { passive: false });

		return () => {
			window.removeEventListener('wheel', handleWheel);
		};
	});
</script>

<BubbleBackground />

<slot />

<!-- Global modal wheel picker driven by wheelSheetStore (singleton). -->
<NumberWheelSheet />

<!-- Global modal duration (mm:ss) picker — dual-column sheet driven by
     durationSheetStore. Separate store from NumberWheelSheet so each
     can have its own ergonomics (single vs. minutes+seconds wheels). -->
<DurationSheet />
