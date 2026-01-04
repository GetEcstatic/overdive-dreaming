<script lang="ts">
	/**
	 * Edit Routine Page - Load existing routine and edit in wizard
	 */

	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { getRoutine } from '$lib/firestore';
	import type { RoutineTemplate } from '$lib/types';
	import RoutineBuilder from '$lib/components/routine-builder/RoutineBuilder.svelte';

	let routineId = $page.params.id ?? '';
	let routine = $state<RoutineTemplate | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	async function loadRoutine() {
		if (!routineId) {
			error = 'Missing routine ID';
			loading = false;
			return;
		}

		try {
			loading = true;
			error = null;
			routine = await getRoutine(routineId);

			if (!routine) {
				error = 'Routine not found';
			}
		} catch (err) {
			console.error('Failed to load routine:', err);
			error = 'Failed to load routine';
		} finally {
			loading = false;
		}
	}

	function handleSuccess() {
		// Navigate back to routines list on success
		goto('/routines');
	}

	function handleCancel() {
		// Navigate back to routines list
		goto('/routines');
	}

	onMount(() => {
		loadRoutine();
	});
</script>

<svelte:head>
	<title>Edit Routine - Overdive Dreaming</title>
</svelte:head>

<div class="edit-routine-page">
	{#if loading}
		<div class="loading-state">
			<div class="spinner"></div>
			<p>Loading routine...</p>
		</div>
	{:else if error || !routine}
		<div class="error-state">
			<h2>Error</h2>
			<p>{error || 'Routine not found'}</p>
			<button class="btn-back" onclick={() => goto('/routines')}>
				Back to Routines
			</button>
		</div>
	{:else}
		<RoutineBuilder
			initialData={routine}
			routineId={routineId}
			onSuccess={handleSuccess}
			onCancel={handleCancel}
		/>
	{/if}
</div>

<style>
	.edit-routine-page {
		min-height: 100vh;
		background: var(--color-bg);
	}

	.loading-state,
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
		padding: 2rem;
		text-align: center;
	}

	.spinner {
		width: 48px;
		height: 48px;
		border: 4px solid rgba(20, 184, 166, 0.2);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin-bottom: 1rem;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.loading-state p,
	.error-state p {
		color: var(--color-text-muted);
		font-size: 1rem;
		margin: 0;
	}

	.error-state h2 {
		color: var(--color-text);
		margin: 0 0 0.5rem 0;
	}

	.btn-back {
		margin-top: 1.5rem;
		padding: 0.75rem 1.5rem;
		background: var(--color-primary);
		color: white;
		border: none;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.2s ease;
	}

	.btn-back:hover {
		opacity: 0.9;
	}
</style>
