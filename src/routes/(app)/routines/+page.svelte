<script lang="ts">
	/**
	 * Routines List Page - View and manage custom routines
	 * Shows system routines + user's custom routines
	 */

	import { onMount } from 'svelte';
	import { user } from '$lib/stores/auth';
	import { getRoutinesForUser, deleteRoutine } from '$lib/firestore';
	import type { RoutineTemplate } from '$lib/types';
	import { goto } from '$app/navigation';
	import { isAdmin } from '$lib/utils/admin';

	let routines = $state<RoutineTemplate[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let deletingId = $state<string | null>(null);

	// Separate system and custom routines
	let systemRoutines = $derived(routines.filter((r) => r.createdBy === 'system'));
	let customRoutines = $derived(routines.filter((r) => r.createdBy !== 'system'));
	let expandedDescriptions = $state<Record<string, boolean>>({});

	// Check if current user is admin
	let userIsAdmin = $derived(isAdmin($user?.uid));

	async function loadRoutines() {
		if (!$user) return;

		try {
			loading = true;
			error = null;
			routines = await getRoutinesForUser($user.uid);
		} catch (err) {
			console.error('Failed to load routines:', err);
			error = 'Failed to load routines';
		} finally {
			loading = false;
		}
	}

	async function handleDelete(routineId: string, routineName: string) {
		if (!confirm(`Are you sure you want to delete "${routineName}"?`)) {
			return;
		}

		try {
			deletingId = routineId;
			await deleteRoutine(routineId);
			// Reload routines
			await loadRoutines();
		} catch (err) {
			console.error('Failed to delete routine:', err);
			alert('Failed to delete routine');
		} finally {
			deletingId = null;
		}
	}

	function navigateToCreate() {
		goto('/routines/create');
	}

	function truncateDescription(text: string, maxLength = 100) {
		if (text.length <= maxLength) return text;
		return `${text.slice(0, maxLength).trim()}…`;
	}

	function toggleDescription(routineId: string) {
		expandedDescriptions[routineId] = !expandedDescriptions[routineId];
	}

	function navigateToEdit(routineId: string) {
		goto(`/routines/${routineId}/edit`);
	}

	onMount(() => {
		loadRoutines();
	});
</script>

<div class="routines-page">
	<div class="page-header">
		<div class="header-content">
			<h1 class="page-title">My Routines</h1>
			<p class="page-description">Create and manage your custom training routines</p>
		</div>
		<button class="btn-create" onclick={navigateToCreate}> + Create Routine </button>
	</div>

	{#if loading}
		<div class="loading-state">
			<div class="spinner"></div>
			<p>Loading routines...</p>
		</div>
	{:else if error}
		<div class="error-state">
			<p>{error}</p>
			<button class="btn-retry" onclick={loadRoutines}>Try Again</button>
		</div>
	{:else}
		<!-- Custom Routines -->
		{#if customRoutines.length > 0}
			<div class="routines-section">
				<h2 class="section-title">Custom Routines ({customRoutines.length})</h2>
				<div class="routines-grid">
					{#each customRoutines as routine}
						<div class="routine-card">
							<div class="card-header">
								<h3 class="routine-name">{routine.name}</h3>
								<div class="routine-meta">
									<span class="disciplines">{routine.disciplines.join(', ')}</span>
								</div>
							</div>

							<p class="routine-description">
								{#if expandedDescriptions[routine.id]}
									{routine.description}
								{:else}
									{truncateDescription(routine.description)}
								{/if}
							</p>
							{#if routine.description.length > 100}
								<button
									class="description-toggle"
									type="button"
									onclick={() => toggleDescription(routine.id)}
								>
									{expandedDescriptions[routine.id] ? 'Show less' : 'Read more'}
								</button>
							{/if}

							{#if routine.tags.length > 0}
								<div class="tag-list">
									{#each routine.tags.slice(0, 3) as tag}
										<span class="tag">{tag}</span>
									{/each}
									{#if routine.tags.length > 3}
										<span class="tag-more">+{routine.tags.length - 3}</span>
									{/if}
								</div>
							{/if}

							<div class="card-actions">
								<button class="btn-edit" onclick={() => navigateToEdit(routine.id)}>
									Edit
								</button>
								<button
									class="btn-delete"
									onclick={() => handleDelete(routine.id, routine.name)}
									disabled={deletingId === routine.id}
								>
									{deletingId === routine.id ? 'Deleting...' : 'Delete'}
								</button>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<div class="empty-state">
				<div class="empty-icon">🏊</div>
				<h3>No custom routines yet</h3>
				<p>Create your first custom routine to get started</p>
				<button class="btn-create-large" onclick={navigateToCreate}>
					Create Your First Routine
				</button>
			</div>
		{/if}

		<!-- System Routines -->
		{#if systemRoutines.length > 0}
			<div class="routines-section">
				<h2 class="section-title">System Routines ({systemRoutines.length})</h2>
				<div class="routines-grid">
					{#each systemRoutines as routine}
						<div class="routine-card system">
							<div class="card-header">
								<h3 class="routine-name">{routine.name}</h3>
								<div class="routine-meta">
									<span class="disciplines">{routine.disciplines.join(', ')}</span>
									<span class="system-badge">System</span>
								</div>
							</div>

							<p class="routine-description">
								{#if expandedDescriptions[routine.id]}
									{routine.description}
								{:else}
									{truncateDescription(routine.description)}
								{/if}
							</p>
							{#if routine.description.length > 100}
								<button
									class="description-toggle"
									type="button"
									onclick={() => toggleDescription(routine.id)}
								>
									{expandedDescriptions[routine.id] ? 'Show less' : 'Read more'}
								</button>
							{/if}

							{#if routine.tags.length > 0}
								<div class="tag-list">
									{#each routine.tags.slice(0, 3) as tag}
										<span class="tag">{tag}</span>
									{/each}
								</div>
							{/if}

							<!-- Admin-only actions for system routines -->
							{#if userIsAdmin}
								<div class="card-actions">
									<button class="btn-edit" onclick={() => navigateToEdit(routine.id)}>
										Edit
									</button>
									<button
										class="btn-delete"
										onclick={() => handleDelete(routine.id, routine.name)}
										disabled={deletingId === routine.id}
									>
										{deletingId === routine.id ? 'Deleting...' : 'Delete'}
									</button>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.routines-page {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem 1.5rem 4rem;
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 2.5rem;
		gap: 2rem;
	}

	.header-content {
		flex: 1;
	}

	.page-title {
		font-size: 2rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0 0 0.5rem 0;
	}

	.page-description {
		font-size: 1rem;
		color: var(--color-text-muted);
		margin: 0;
	}

	.btn-create,
	.btn-create-large {
		padding: 0.75rem 1.5rem;
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
		color: white;
		border: none;
		border-radius: 8px;
		font-weight: 600;
		font-size: 0.9375rem;
		cursor: pointer;
		transition: all 0.2s ease;
		box-shadow: 0 4px 12px rgba(20, 184, 166, 0.3);
	}

	.btn-create-large {
		padding: 1rem 2rem;
		font-size: 1rem;
	}

	.btn-create:hover,
	.btn-create-large:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 16px rgba(20, 184, 166, 0.4);
	}

	.loading-state,
	.error-state {
		text-align: center;
		padding: 4rem 2rem;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid rgba(20, 184, 166, 0.2);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin: 0 auto 1rem;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.error-state p {
		color: #ef4444;
		margin-bottom: 1rem;
	}

	.btn-retry {
		padding: 0.5rem 1rem;
		background: rgba(148, 163, 184, 0.1);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 6px;
		color: var(--color-text);
		cursor: pointer;
	}

	.empty-state {
		text-align: center;
		padding: 4rem 2rem;
		background: rgba(15, 23, 42, 0.3);
		border: 1px dashed rgba(148, 163, 184, 0.3);
		border-radius: 12px;
		margin-bottom: 3rem;
	}

	.empty-icon {
		font-size: 4rem;
		margin-bottom: 1rem;
	}

	.empty-state h3 {
		font-size: 1.5rem;
		color: var(--color-text);
		margin: 0 0 0.5rem 0;
	}

	.empty-state p {
		color: var(--color-text-muted);
		margin: 0 0 1.5rem 0;
	}

	.routines-section {
		margin-bottom: 3rem;
	}

	.section-title {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 1.5rem 0;
	}

	.routines-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 1.5rem;
	}

	.routine-card {
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 12px;
		padding: 1.5rem;
		transition: all 0.2s ease;
	}

	.routine-card:hover {
		border-color: rgba(148, 163, 184, 0.4);
		transform: translateY(-2px);
		box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
	}

	.routine-card.system {
		border-color: rgba(20, 184, 166, 0.3);
		background: rgba(20, 184, 166, 0.05);
	}

	.card-header {
		margin-bottom: 0.75rem;
	}

	.routine-name {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 0.5rem 0;
	}

	.routine-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}

	.system-badge {
		padding: 0.125rem 0.5rem;
		background: rgba(20, 184, 166, 0.2);
		border-radius: 4px;
		color: var(--color-primary);
		font-weight: 600;
	}

	.routine-description {
		font-size: 0.875rem;
		color: var(--color-text-muted);
		line-height: 1.5;
		margin: 0 0 1rem 0;
	}

	.description-toggle {
		background: none;
		border: none;
		color: var(--color-primary);
		font-size: 0.8125rem;
		font-weight: 600;
		padding: 0;
		margin: -0.5rem 0 1rem 0;
		cursor: pointer;
	}

	.description-toggle:hover {
		color: var(--color-secondary);
	}

	.tag-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.tag {
		padding: 0.25rem 0.625rem;
		background: rgba(20, 184, 166, 0.15);
		border: 1px solid rgba(20, 184, 166, 0.3);
		border-radius: 12px;
		color: var(--color-primary);
		font-size: 0.75rem;
		font-weight: 500;
	}

	.tag-more {
		padding: 0.25rem 0.625rem;
		background: rgba(148, 163, 184, 0.1);
		border-radius: 12px;
		color: var(--color-text-muted);
		font-size: 0.75rem;
	}

	.card-actions {
		display: flex;
		gap: 0.75rem;
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(148, 163, 184, 0.1);
	}

	.btn-edit,
	.btn-delete {
		flex: 1;
		padding: 0.5rem;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		border: none;
	}

	.btn-edit {
		background: rgba(20, 184, 166, 0.1);
		color: var(--color-primary);
		border: 1px solid rgba(20, 184, 166, 0.3);
	}

	.btn-edit:hover {
		background: rgba(20, 184, 166, 0.2);
	}

	.btn-delete {
		background: rgba(239, 68, 68, 0.1);
		color: #ef4444;
		border: 1px solid rgba(239, 68, 68, 0.3);
	}

	.btn-delete:hover:not(:disabled) {
		background: rgba(239, 68, 68, 0.2);
	}

	.btn-delete:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Mobile responsive */
	@media (max-width: 768px) {
		.page-header {
			flex-direction: column;
			align-items: stretch;
		}

		.btn-create {
			width: 100%;
		}

		.routines-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
