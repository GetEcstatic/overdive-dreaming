<script lang="ts">
	/**
	 * Create Routine Page - Wizard interface for creating custom routines
	 */

	import { goto } from '$app/navigation';
	import RoutineBuilder from '$lib/components/routine-builder/RoutineBuilder.svelte';

	function handleSuccess(routineId: string) {
		// Navigate to routines list on success
		goto('/routines');
	}

	function handleCancel() {
		// Navigate back to routines list
		goto('/routines');
	}
</script>

<svelte:head>
	<title>Create Routine - Overdive Dreaming</title>
</svelte:head>

<div class="create-routine-page">
	<RoutineBuilder onSuccess={handleSuccess} onCancel={handleCancel} />
</div>

<style>
	.create-routine-page {
		min-height: 100vh;
		background: var(--color-bg);
	}
</style>
