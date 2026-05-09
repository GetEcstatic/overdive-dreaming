<script lang="ts">
	import { goto } from '$app/navigation';
	import { user } from '$lib/stores/auth';
	import { createRoutine } from '$lib/firestore';
	import { defaultRoutineExamples, type RoutineLayerExample } from '$lib/routineLayers/defaults';
	import { buildBlankRoutineLayer, buildLayerRoutineCreateData } from '$lib/routineLayers/create';
	import type { LayerDiscipline, RoutineAuthoringLayer } from '$lib/routineLayers/model';

	const disciplineOptions: LayerDiscipline[] = ['STA', 'DYN', 'DYNB', 'DNF', 'TORT'];

	type CreateScaffold = {
		id: string;
		name: string;
		description: string;
		layers: RoutineAuthoringLayer[];
	};

	const fixtureScaffolds: CreateScaffold[] = defaultRoutineExamples.map((example: RoutineLayerExample) => ({
		id: example.id,
		name: example.name,
		description: example.purpose,
		layers: example.layers
	}));

	const blankScaffold: CreateScaffold = {
		id: 'blank',
		name: 'Blank Routine',
		description: 'Start from one open layer and choose its starting discipline.',
		layers: [buildBlankRoutineLayer()]
	};

	const scaffolds = [...fixtureScaffolds, blankScaffold];

	let selectedScaffoldId = $state(scaffolds[0].id);
	let name = $state(scaffolds[0].name);
	let description = $state(scaffolds[0].description);
	let touchedName = $state(false);
	let touchedDescription = $state(false);
	let blankDiscipline = $state<LayerDiscipline>('DYN');
	let saving = $state(false);
	let error = $state<string | null>(null);

	let selectedScaffold = $derived(scaffolds.find((scaffold) => scaffold.id === selectedScaffoldId) ?? scaffolds[0]);
	let selectedLayers = $derived(selectedScaffold.id === 'blank' ? [buildBlankRoutineLayer('blank-layer-1', blankDiscipline)] : selectedScaffold.layers);

	function selectScaffold(scaffold: CreateScaffold) {
		selectedScaffoldId = scaffold.id;
		if (!touchedName) name = scaffold.name;
		if (!touchedDescription) description = scaffold.description;
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!$user || saving) return;

		try {
			saving = true;
			error = null;
			const routineId = await createRoutine(
				$user.uid,
				buildLayerRoutineCreateData({
					name,
					description,
					layers: selectedLayers
				})
			);
			goto(`/routines/${routineId}/layers`);
		} catch (err) {
			console.error('Failed to create v2 routine:', err);
			error = 'Failed to create routine.';
		} finally {
			saving = false;
		}
	}

	function handleCancel() {
		goto('/routines');
	}
</script>

<svelte:head>
	<title>Create Routine - Overdive Dreaming</title>
</svelte:head>

<div class="create-routine-page">
	<header class="page-header">
		<div>
			<p class="eyebrow">V2 Layer Builder</p>
			<h1>Create Routine</h1>
		</div>
		<button class="secondary-button" type="button" onclick={handleCancel}>Cancel</button>
	</header>

	<form class="create-layout" onsubmit={handleSubmit}>
		<section class="scaffold-panel" aria-label="Routine scaffolds">
			<h2>Choose a starting point</h2>
			<div class="scaffold-list">
				{#each scaffolds as scaffold}
					<button
						type="button"
						class:selected={scaffold.id === selectedScaffoldId}
						class="scaffold-option"
						onclick={() => selectScaffold(scaffold)}
					>
						<strong>{scaffold.name}</strong>
						<span>{scaffold.description}</span>
					</button>
				{/each}
			</div>
		</section>

		<section class="details-panel" aria-label="Routine details">
			<div class="field-group">
				<label for="routine-name">Name</label>
				<input
					id="routine-name"
					type="text"
					bind:value={name}
					oninput={() => (touchedName = true)}
					required
					maxlength="80"
				/>
			</div>

			<div class="field-group">
				<label for="routine-description">Description</label>
				<textarea
					id="routine-description"
					bind:value={description}
					oninput={() => (touchedDescription = true)}
					rows="5"
				></textarea>
			</div>

			<div class="summary-panel">
				<span>{selectedLayers.length} authoring layer{selectedLayers.length === 1 ? '' : 's'}</span>
				<span>Opens in the layer editor after creation</span>
			</div>

			{#if selectedScaffold.id === 'blank'}
				<div class="field-group">
					<label for="blank-discipline">Starting discipline</label>
					<select id="blank-discipline" bind:value={blankDiscipline}>
						{#each disciplineOptions as discipline}
							<option value={discipline}>{discipline}</option>
						{/each}
					</select>
				</div>
			{/if}

			{#if error}
				<p class="error-message">{error}</p>
			{/if}

			<div class="actions">
				<button class="secondary-button" type="button" onclick={handleCancel} disabled={saving}>Cancel</button>
				<button class="primary-button" type="submit" disabled={saving || !name.trim()}>
					{saving ? 'Creating...' : 'Create routine'}
				</button>
			</div>
		</section>
	</form>
</div>

<style>
	.create-routine-page {
		min-height: 100vh;
		background: var(--color-bg);
		color: var(--color-text);
		padding: 2rem;
	}

	.page-header,
	.create-layout {
		max-width: 1120px;
		margin: 0 auto;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.eyebrow {
		color: var(--color-primary);
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0;
		margin: 0 0 0.35rem 0;
		text-transform: uppercase;
	}

	h1,
	h2 {
		margin: 0;
	}

	h1 {
		font-size: 2rem;
	}

	h2 {
		font-size: 1.05rem;
	}

	.create-layout {
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
		gap: 1rem;
	}

	.scaffold-panel,
	.details-panel {
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 8px;
		background: var(--color-card);
		padding: 1.25rem;
	}

	.scaffold-list {
		display: grid;
		gap: 0.75rem;
		margin-top: 1rem;
	}

	.scaffold-option {
		display: grid;
		gap: 0.35rem;
		width: 100%;
		padding: 1rem;
		border: 1px solid rgba(148, 163, 184, 0.22);
		border-radius: 8px;
		background: transparent;
		color: inherit;
		cursor: pointer;
		text-align: left;
	}

	.scaffold-option.selected {
		border-color: var(--color-primary);
		background: rgba(20, 184, 166, 0.08);
	}

	.scaffold-option strong {
		font-size: 0.98rem;
	}

	.scaffold-option span,
	.summary-panel,
	.field-group label {
		color: var(--color-text-muted);
		font-size: 0.9rem;
	}

	.details-panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.field-group {
		display: grid;
		gap: 0.45rem;
	}

	.field-group label {
		font-weight: 700;
	}

	input,
	select,
	textarea {
		width: 100%;
		box-sizing: border-box;
		border: 1px solid rgba(148, 163, 184, 0.28);
		border-radius: 8px;
		background: var(--color-bg);
		color: var(--color-text);
		font: inherit;
		padding: 0.8rem;
	}

	textarea {
		resize: vertical;
	}

	.summary-panel {
		display: grid;
		gap: 0.35rem;
		padding: 0.85rem;
		border-radius: 8px;
		background: rgba(148, 163, 184, 0.08);
	}

	.error-message {
		color: var(--color-danger, #dc2626);
		font-weight: 700;
		margin: 0;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		margin-top: auto;
	}

	.primary-button,
	.secondary-button {
		border: 0;
		border-radius: 8px;
		cursor: pointer;
		font-weight: 700;
		padding: 0.75rem 1rem;
	}

	.primary-button {
		background: var(--color-primary);
		color: white;
	}

	.secondary-button {
		background: rgba(148, 163, 184, 0.14);
		color: var(--color-text);
	}

	.primary-button:disabled,
	.secondary-button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	@media (max-width: 780px) {
		.create-routine-page {
			padding: 1rem;
		}

		.page-header {
			align-items: flex-start;
			flex-direction: column;
		}

		.create-layout {
			grid-template-columns: 1fr;
		}
	}
</style>
