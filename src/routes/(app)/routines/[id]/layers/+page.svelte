<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { user } from '$lib/stores/auth';
	import { getRoutine, writeRoutineLayerTemplateContract } from '$lib/firestore';
	import { isAdmin } from '$lib/utils/admin';
	import { buildRoutineLayerReadModel } from '$lib/routineLayers/readModel';
	import { buildLayerSentence } from '$lib/routineLayers/sentence';
	import { expandRoutineLayers } from '$lib/routineLayers/model';
	import { staticMaxExample } from '$lib/routineLayers/defaults';
	import type { LegacyRoutineProjection } from '$lib/routineLayers/contract';
	import type { RoutineTemplate } from '$lib/types';
	import type {
		ExpandedRoutinePlanRow,
		LayerDistanceTarget,
		LayerDurationTarget,
		LayerEffort,
		LungVolume,
		RoutineAuthoringLayer
	} from '$lib/routineLayers/model';

	type ProjectionComparisonRow = {
		label: string;
		current: string;
		projected: string;
		status: 'match' | 'gap';
	};

	let routineId = $derived($page.params.id ?? '');
	let routine = $state<RoutineTemplate | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let writeStatus = $state<string | null>(null);
	let writingFixture = $state(false);
	let savingLayers = $state(false);
	let editorStatus = $state<string | null>(null);
	let editorRoutineId = $state<string | null>(null);
	let editableLayers = $state<RoutineAuthoringLayer[]>([]);
	let selectedLayerId = $state<string | null>(null);

	let userIsAdmin = $derived(isAdmin($user?.uid));
	let readModel = $derived(routine && userIsAdmin ? buildRoutineLayerReadModel(routine) : null);
	let canWriteStaticMaxFixture = $derived(
		userIsAdmin && routine?.createdBy === 'system' && routine.name === staticMaxExample.name
	);
	let layerSentences = $derived(editableLayers.map((layer, index) => buildLayerSentence(layer, index)));
	let selectedLayer = $derived(editableLayers.find((layer) => layer.id === selectedLayerId) ?? editableLayers[0] ?? null);
	let selectedLayerIndex = $derived(selectedLayer ? editableLayers.findIndex((layer) => layer.id === selectedLayer.id) : -1);
	let expandedEditorRows = $derived(expandRoutineLayers(editableLayers));
	let selectedLayerRows = $derived(
		selectedLayer
			? expandedEditorRows.filter((row) => row.sourceLayerId === selectedLayer.id)
			: []
	);
	let editorDirty = $derived(readModel ? JSON.stringify(editableLayers) !== JSON.stringify(readModel.layers) : false);
	let projectionComparisonRows = $derived(
		readModel && routine ? buildProjectionComparisonRows(routine, readModel.legacyProjection) : []
	);
	let projectionGapRows = $derived(projectionComparisonRows.filter((row) => row.status === 'gap'));
	let legacyProjectionEntries = $derived(readModel ? Object.entries(readModel.legacyProjection.display) : []);

	$effect(() => {
		if (readModel && routine && editorRoutineId !== routine.id) {
			editableLayers = readModel.layers.map(cloneLayer);
			editorRoutineId = routine.id;
		}
	});

	$effect(() => {
		if (editableLayers.length > 0 && !editableLayers.some((layer) => layer.id === selectedLayerId)) {
			selectedLayerId = editableLayers[0]?.id ?? null;
		}
	});

	onMount(() => {
		loadRoutine();
	});

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
			console.error('Failed to load routine layer read model:', err);
			error = 'Failed to load routine layer read model';
		} finally {
			loading = false;
		}
	}

	function sourceLabel(source: string) {
		return source === 'versioned-template' ? 'v2 template' : 'legacy projection';
	}

	function layerLabel(layer: RoutineAuthoringLayer, index: number) {
		return layer.name ?? `Layer ${index + 1}`;
	}

	function formatDuration(target: LayerDurationTarget | undefined) {
		if (!target) return 'none';
		if (target.mode === 'open') return 'open';
		const minutes = Math.floor(target.seconds / 60);
		const seconds = target.seconds % 60;
		return `${minutes}:${String(seconds).padStart(2, '0')}`;
	}

	function formatDistance(target: LayerDistanceTarget | undefined) {
		if (!target) return 'none';
		return target.mode === 'open' ? 'open' : `${target.meters}m`;
	}

	function formatLayerTargets(layer: RoutineAuthoringLayer) {
		return [
			`breathe-up ${formatDuration(layer.breatheUp)}`,
			`duration ${formatDuration(layer.dive.duration)}`,
			`distance ${formatDistance(layer.dive.distance)}`
		].join(' - ');
	}

	function formatPlanRow(row: ExpandedRoutinePlanRow) {
		return `rep ${row.repIndex} - ${row.discipline} - ${formatDuration(row.dive.duration)} - ${formatDistance(row.dive.distance)}`;
	}

	async function writeStaticMaxFixtureContract() {
		if (!routine || !canWriteStaticMaxFixture || writingFixture) return;

		try {
			writingFixture = true;
			writeStatus = null;
			await writeRoutineLayerTemplateContract(routine.id, staticMaxExample.layers);
			editorRoutineId = null;
			routine = await getRoutine(routine.id);
			writeStatus = 'Static Max v2 layer contract written.';
		} catch (err) {
			console.error('Failed to write Static Max v2 layer contract:', err);
			writeStatus = 'Failed to write Static Max v2 layer contract.';
		} finally {
			writingFixture = false;
		}
	}

	async function saveEditedLayers() {
		if (!routine || !editorDirty || savingLayers) return;

		try {
			savingLayers = true;
			editorStatus = null;
			await writeRoutineLayerTemplateContract(routine.id, editableLayers);
			editorRoutineId = null;
			routine = await getRoutine(routine.id);
			editorStatus = 'Layer changes saved.';
		} catch (err) {
			console.error('Failed to save layer changes:', err);
			editorStatus = 'Failed to save layer changes.';
		} finally {
			savingLayers = false;
		}
	}

	function resetEditedLayers() {
		if (!readModel) return;
		editableLayers = readModel.layers.map(cloneLayer);
		editorStatus = null;
	}

	function updateSelectedLayerName(name: string) {
		updateSelectedLayer((layer) => ({ ...layer, name: name.trim() || undefined }));
	}

	function updateSelectedRepeatCount(value: string) {
		const repeatCount = Math.max(1, Math.floor(Number(value) || 1));
		updateSelectedLayer((layer) => ({
			...layer,
			attributes: { ...layer.attributes, repeatCount }
		}));
	}

	function updateSelectedEffort(effort: LayerEffort) {
		updateSelectedLayer((layer) => ({
			...layer,
			attributes: { ...layer.attributes, effort }
		}));
	}

	function updateSelectedLungVolume(lungVolume: LungVolume) {
		updateSelectedLayer((layer) => ({
			...layer,
			attributes: { ...layer.attributes, lungVolume }
		}));
	}

	function updateSelectedEnvironment(environment: 'wet' | 'dry' | 'both') {
		updateSelectedLayer((layer) => ({
			...layer,
			attributes: { ...layer.attributes, environment }
		}));
	}

	function addLayerAfterSelected() {
		const baseLayer = selectedLayer ?? editableLayers[editableLayers.length - 1];
		if (!baseLayer) return;

		const insertIndex = Math.max(0, selectedLayerIndex) + 1;
		const nextLayer = {
			...cloneLayer(baseLayer),
			id: `${baseLayer.id}-copy-${Date.now()}`,
			name: `${baseLayer.name ?? 'Layer'} copy`
		};

		editableLayers = [
			...editableLayers.slice(0, insertIndex),
			nextLayer,
			...editableLayers.slice(insertIndex)
		];
		selectedLayerId = nextLayer.id;
	}

	function removeSelectedLayer() {
		if (!selectedLayer || editableLayers.length <= 1) return;

		const nextLayers = editableLayers.filter((layer) => layer.id !== selectedLayer.id);
		const nextIndex = Math.min(selectedLayerIndex, nextLayers.length - 1);
		editableLayers = nextLayers;
		selectedLayerId = nextLayers[nextIndex]?.id ?? null;
	}

	function moveSelectedLayer(direction: -1 | 1) {
		if (!selectedLayer || selectedLayerIndex < 0) return;

		const nextIndex = selectedLayerIndex + direction;
		if (nextIndex < 0 || nextIndex >= editableLayers.length) return;

		const nextLayers = [...editableLayers];
		const selected = nextLayers[selectedLayerIndex];
		const displaced = nextLayers[nextIndex];
		nextLayers[selectedLayerIndex] = displaced;
		nextLayers[nextIndex] = selected;
		editableLayers = nextLayers;
	}

	function updateSelectedLayer(updater: (layer: RoutineAuthoringLayer) => RoutineAuthoringLayer) {
		if (!selectedLayer) return;
		editableLayers = editableLayers.map((layer) => layer.id === selectedLayer.id ? updater(layer) : layer);
	}

	function cloneLayer(layer: RoutineAuthoringLayer): RoutineAuthoringLayer {
		return {
			...layer,
			allowedDisciplines: layer.allowedDisciplines ? [...layer.allowedDisciplines] : undefined,
			diveCapabilities: layer.diveCapabilities ? [...layer.diveCapabilities] : undefined,
			breatheUp: { ...layer.breatheUp },
			dive: {
				duration: layer.dive.duration ? { ...layer.dive.duration } : undefined,
				distance: layer.dive.distance ? { ...layer.dive.distance } : undefined
			},
			attributes: { ...layer.attributes },
			locks: { ...layer.locks }
		};
	}

	function buildProjectionComparisonRows(
		routineTemplate: RoutineTemplate,
		projection: LegacyRoutineProjection
	): ProjectionComparisonRow[] {
		return [
			buildComparisonRow('Disciplines', routineTemplate.disciplines, projection.disciplines),
			buildComparisonRow('Activity type', routineTemplate.activityType, projection.activityType),
			buildComparisonRow('Environment', routineTemplate.trainingEnvironment, projection.trainingEnvironment),
			buildComparisonRow('Rest between reps', routineTemplate.restBetweenReps, projection.restBetweenReps),
			buildComparisonRow('Rep distance', routineTemplate.repDistance, projection.repDistance),
			buildComparisonRow('Number of reps', routineTemplate.numberOfReps, projection.numberOfReps),
			buildComparisonRow('Table rows', routineTemplate.table?.rows.length, projection.table?.rows.length),
			buildComparisonRow('Default tags', routineTemplate.defaultTags ?? routineTemplate.tags, projection.defaultTags),
			buildComparisonRow('Hero metric', routineTemplate.displayConfig?.heroMetric, projection.display.hero),
			buildComparisonRow('Secondary metric', routineTemplate.displayConfig?.secondaryMetric, projection.display.secondary),
			buildComparisonRow('Tertiary metric', routineTemplate.displayConfig?.tertiaryMetric, projection.display.tertiary)
		];
	}

	function buildComparisonRow(label: string, currentValue: unknown, projectedValue: unknown): ProjectionComparisonRow {
		const current = formatComparisonValue(currentValue);
		const projected = formatComparisonValue(projectedValue);

		return {
			label,
			current,
			projected,
			status: current === projected ? 'match' : 'gap'
		};
	}

	function formatComparisonValue(value: unknown): string {
		if (value === undefined || value === null || value === '') return 'none';
		if (Array.isArray(value)) return value.length ? [...value].map(String).sort().join(', ') : 'none';
		return String(value);
	}
</script>

<svelte:head>
	<title>{routine?.name ?? 'Routine'} Layer Model | Overdive Dreaming</title>
</svelte:head>

<div class="page">
	<header class="page-header">
		<button class="back-button" onclick={() => goto('/routines')} aria-label="Back to routines">
			<span aria-hidden="true">&lt;</span>
			Back to routines
		</button>

		<div class="header-copy">
			<div class="eyebrow">Layer Read Model</div>
			<h1>{routine?.name ?? 'Routine'}</h1>
			{#if readModel}
				<div class="meta-row">
					<span>{sourceLabel(readModel.source)}</span>
					<span>{readModel.layers.length} layer{readModel.layers.length === 1 ? '' : 's'}</span>
					<span>{readModel.expandedRows.length} expanded row{readModel.expandedRows.length === 1 ? '' : 's'}</span>
				</div>
			{/if}
		</div>
	</header>

	{#if loading}
		<div class="state-panel">Loading layer read model...</div>
	{:else if error || !routine}
		<div class="state-panel error">{error ?? 'Routine not found'}</div>
	{:else if !userIsAdmin}
		<div class="state-panel error">Admin access is required to inspect layer read models.</div>
	{:else if readModel}
		{#if canWriteStaticMaxFixture}
			<section class="panel write-panel" aria-label="Static Max v2 write support">
				<div>
					<h2>Static Max Fixture Write</h2>
					<span>Attach the v2 layer contract for this low-risk fixture routine.</span>
				</div>
				<button class="write-button" onclick={writeStaticMaxFixtureContract} disabled={writingFixture}>
					{writingFixture ? 'Writing...' : 'Write v2 contract'}
				</button>
				{#if writeStatus}
					<p>{writeStatus}</p>
				{/if}
			</section>
		{/if}

		<section class="status-grid" aria-label="Read model status">
			<div>
				<span>Source</span>
				<strong>{sourceLabel(readModel.source)}</strong>
			</div>
			<div>
				<span>Layers</span>
				<strong>{readModel.layers.length}</strong>
			</div>
			<div>
				<span>Rows</span>
				<strong>{readModel.expandedRows.length}</strong>
			</div>
			<div>
				<span>Validation</span>
				<strong class:ok={readModel.validationIssues.length === 0}>
					{readModel.validationIssues.length === 0 ? 'valid' : `${readModel.validationIssues.length} issue(s)`}
				</strong>
			</div>
		</section>

		{#if readModel.validationIssues.length > 0}
			<section class="panel" aria-label="Validation issues">
				<h2>Validation Issues</h2>
				<div class="issue-list">
					{#each readModel.validationIssues as issue}
						<div class="issue-row">
							<strong>{issue.code}</strong>
							<span>{issue.layerId}</span>
							<p>{issue.message}</p>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<section class="panel" aria-label="Projection comparison">
			<h2>Projection Comparison</h2>
			<div class="gap-summary" class:ok={projectionGapRows.length === 0}>
				<strong>{projectionGapRows.length === 0 ? 'No projection gaps recorded' : `${projectionGapRows.length} projection gap${projectionGapRows.length === 1 ? '' : 's'} recorded`}</strong>
				<span>{projectionGapRows.length === 0 ? 'The layer projection matches the current legacy display fields checked here.' : 'Review these before enabling v2 writes for this routine.'}</span>
			</div>

			{#if projectionGapRows.length > 0}
				<div class="gap-list" aria-label="Projection gaps">
					{#each projectionGapRows as row}
						<div class="gap-row">
							<strong>{row.label}</strong>
							<span>Current: {row.current}</span>
							<span>Projected: {row.projected}</span>
						</div>
					{/each}
				</div>
			{/if}

			<div class="comparison-list">
				{#each projectionComparisonRows as row}
					<div class="comparison-row" class:gap={row.status === 'gap'}>
						<strong>{row.label}</strong>
						<span>{row.current}</span>
						<span>{row.projected}</span>
						<small>{row.status}</small>
					</div>
				{/each}
			</div>
		</section>

		<section class="editor-actions panel" aria-label="Layer editor actions">
			<div>
				<h2>Layer Editor</h2>
				<span>Edit existing authoring layers. Add, remove, and reorder controls are not enabled yet.</span>
			</div>
			<div class="editor-buttons">
				<button class="secondary-button" onclick={addLayerAfterSelected} disabled={savingLayers}>Add layer</button>
				<button class="secondary-button" onclick={() => moveSelectedLayer(-1)} disabled={selectedLayerIndex <= 0 || savingLayers}>Move up</button>
				<button class="secondary-button" onclick={() => moveSelectedLayer(1)} disabled={selectedLayerIndex < 0 || selectedLayerIndex >= editableLayers.length - 1 || savingLayers}>Move down</button>
				<button class="danger-button" onclick={removeSelectedLayer} disabled={editableLayers.length <= 1 || savingLayers}>Remove</button>
				<button class="write-button" onclick={saveEditedLayers} disabled={!editorDirty || savingLayers}>
					{savingLayers ? 'Saving...' : 'Save layers'}
				</button>
				<button class="secondary-button" onclick={resetEditedLayers} disabled={!editorDirty || savingLayers}>Reset</button>
			</div>
			{#if editorStatus}
				<p>{editorStatus}</p>
			{/if}
		</section>

		<section class="layout-grid">
			<div class="panel layer-list" aria-label="Layers">
				<h2>Layers</h2>
				{#each editableLayers as layer, index}
					<button
						class="layer-button"
						class:active={selectedLayer?.id === layer.id}
						onclick={() => (selectedLayerId = layer.id)}
					>
						<span>{layerLabel(layer, index)}</span>
						<strong>{layer.discipline}</strong>
						<small>{formatLayerTargets(layer)}</small>
					</button>
				{/each}
			</div>

			<div class="panel layer-detail" aria-label="Selected layer details">
				{#if selectedLayer}
					<h2>{layerLabel(selectedLayer, editableLayers.indexOf(selectedLayer))}</h2>

					<div class="edit-grid">
						<label>
							<span>Name</span>
							<input value={selectedLayer.name ?? ''} oninput={(event) => updateSelectedLayerName(event.currentTarget.value)} />
						</label>
						<label>
							<span>Reps</span>
							<input type="number" min="1" value={selectedLayer.attributes.repeatCount} oninput={(event) => updateSelectedRepeatCount(event.currentTarget.value)} />
						</label>
						<label>
							<span>Effort</span>
							<select value={selectedLayer.attributes.effort} onchange={(event) => updateSelectedEffort(event.currentTarget.value as LayerEffort)}>
								<option value="standard">standard</option>
								<option value="submax">submax</option>
								<option value="max">max</option>
							</select>
						</label>
						<label>
							<span>Lung volume</span>
							<select value={selectedLayer.attributes.lungVolume} onchange={(event) => updateSelectedLungVolume(event.currentTarget.value as LungVolume)}>
								<option value="FL">FL</option>
								<option value="FRC">FRC</option>
								<option value="RV">RV</option>
							</select>
						</label>
						<label>
							<span>Environment</span>
							<select value={selectedLayer.attributes.environment} onchange={(event) => updateSelectedEnvironment(event.currentTarget.value as 'wet' | 'dry' | 'both')}>
								<option value="wet">wet</option>
								<option value="dry">dry</option>
								<option value="both">both</option>
							</select>
						</label>
					</div>

					<div class="detail-meta">
						<span>{selectedLayer.discipline}</span>
						<span>{selectedLayer.attributes.environment}</span>
						<span>{selectedLayer.attributes.effort}</span>
						<span>{selectedLayer.attributes.repeatCount} rep{selectedLayer.attributes.repeatCount === 1 ? '' : 's'}</span>
					</div>

					<div class="sentence-grid">
						{#each layerSentences.find((sentence) => sentence.layerId === selectedLayer.id)?.segments ?? [] as segment}
							<div class="segment-card">
								<span>{segment.label}</span>
								<strong>{segment.summary}</strong>
								<small>{segment.details.join(' - ')}</small>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</section>

		<section class="panel" aria-label="Expanded routine rows">
			<h2>Expanded Rows</h2>
			<div class="row-list">
				{#each selectedLayerRows as row}
					<div class="plan-row">
						<span>#{row.globalRowIndex}</span>
						<strong>{formatPlanRow(row)}</strong>
						<small>{row.analyticsRole ?? 'standard'} - {row.attributes.lungVolume}</small>
					</div>
				{/each}
			</div>
		</section>

		<section class="panel" aria-label="Legacy display projection">
			<h2>Legacy Projection</h2>
			<div class="projection-grid">
				{#each legacyProjectionEntries as [key, value]}
					<div>
						<span>{key}</span>
						<strong>{value}</strong>
					</div>
				{/each}
			</div>
		</section>
	{/if}
</div>

<style>
	.page {
		max-width: 1120px;
		margin: 0 auto;
		padding: 1.25rem 1rem 6rem;
		color: var(--color-text);
	}

	.page-header {
		display: grid;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.back-button {
		justify-self: start;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		border: none;
		background: transparent;
		color: var(--color-text-muted);
		font-size: 0.9rem;
		padding: 0.25rem 0;
		cursor: pointer;
	}

	.back-button:hover {
		color: var(--color-text);
	}

	.back-button span {
		font-size: 1.35rem;
		line-height: 1;
	}

	.header-copy {
		display: grid;
		gap: 0.5rem;
	}

	.eyebrow {
		color: var(--color-primary);
		font-size: 0.76rem;
		font-weight: 800;
		letter-spacing: 0;
		text-transform: uppercase;
	}

	h1,
	h2,
	p {
		margin: 0;
	}

	h1 {
		font-size: 2rem;
		line-height: 1.12;
	}

	h2 {
		font-size: 1rem;
		font-weight: 800;
	}

	.meta-row,
	.detail-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.meta-row span,
	.detail-meta span,
	.layer-button strong,
	.status-grid div,
	.plan-row span,
	.plan-row small,
	.segment-card span,
	.segment-card small,
	.projection-grid span,
	.issue-row span {
		color: var(--color-text-muted);
		font-size: 0.78rem;
	}

	.meta-row span,
	.detail-meta span {
		border: 1px solid rgba(148, 163, 184, 0.22);
		border-radius: 999px;
		padding: 0.3rem 0.55rem;
	}

	.state-panel,
	.panel,
	.status-grid > div {
		border: 1px solid rgba(148, 163, 184, 0.16);
		border-radius: 8px;
		background: rgba(15, 23, 42, 0.54);
	}

	.state-panel {
		padding: 1.5rem;
		text-align: center;
	}

	.state-panel.error {
		border-color: rgba(248, 113, 113, 0.34);
		color: #fecaca;
	}

	.status-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.status-grid > div {
		display: grid;
		gap: 0.35rem;
		padding: 0.85rem;
	}

	.status-grid strong {
		color: var(--color-text);
		font-size: 1.1rem;
	}

	.status-grid .ok {
		color: #99f6e4;
	}

	.layout-grid {
		display: grid;
		grid-template-columns: minmax(260px, 0.85fr) minmax(0, 1.65fr);
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.panel {
		display: grid;
		gap: 0.85rem;
		padding: 1rem;
		margin-bottom: 1rem;
	}

	.editor-actions,
	.write-panel {
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		border-color: rgba(20, 184, 166, 0.28);
	}

	.editor-actions > div,
	.write-panel > div {
		display: grid;
		gap: 0.25rem;
	}

	.editor-actions span,
	.editor-actions p,
	.write-panel span,
	.write-panel p {
		color: var(--color-text-muted);
		font-size: 0.82rem;
	}

	.editor-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		justify-content: end;
	}

	.danger-button,
	.secondary-button,
	.write-button {
		border: 1px solid rgba(20, 184, 166, 0.45);
		border-radius: 6px;
		background: rgba(20, 184, 166, 0.16);
		color: #99f6e4;
		cursor: pointer;
		font-weight: 800;
		padding: 0.55rem 0.75rem;
	}

	.secondary-button {
		border-color: rgba(148, 163, 184, 0.28);
		background: rgba(148, 163, 184, 0.1);
		color: var(--color-text-muted);
	}

	.danger-button {
		border-color: rgba(248, 113, 113, 0.36);
		background: rgba(248, 113, 113, 0.1);
		color: #fecaca;
	}

	.danger-button:disabled,
	.secondary-button:disabled,
	.write-button:disabled {
		cursor: not-allowed;
		opacity: 0.65;
	}

	.edit-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 0.75rem;
	}

	.edit-grid label {
		display: grid;
		gap: 0.35rem;
	}

	.edit-grid label span {
		color: var(--color-text-muted);
		font-size: 0.76rem;
		font-weight: 800;
		text-transform: uppercase;
	}

	.edit-grid input,
	.edit-grid select {
		border: 1px solid rgba(148, 163, 184, 0.22);
		border-radius: 6px;
		background: rgba(2, 6, 23, 0.38);
		color: var(--color-text);
		font: inherit;
		padding: 0.55rem 0.65rem;
		min-width: 0;
	}

	.layer-list {
		align-content: start;
	}

	.layer-button {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.2rem 0.75rem;
		align-items: center;
		border: 1px solid rgba(148, 163, 184, 0.14);
		border-radius: 8px;
		background: rgba(15, 23, 42, 0.6);
		color: var(--color-text);
		padding: 0.75rem;
		text-align: left;
		cursor: pointer;
	}

	.layer-button.active {
		border-color: rgba(20, 184, 166, 0.54);
		background: rgba(20, 184, 166, 0.1);
	}

	.layer-button span,
	.layer-button small,
	.segment-card strong,
	.plan-row strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.layer-button small {
		grid-column: 1 / -1;
		color: var(--color-text-muted);
		font-size: 0.76rem;
	}

	.layer-detail {
		align-content: start;
	}

	.sentence-grid,
	.row-list,
	.issue-list,
	.gap-list,
	.comparison-list {
		display: grid;
		gap: 0.5rem;
	}

	.sentence-grid {
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
	}

	.segment-card,
	.plan-row,
	.issue-row,
	.gap-summary,
	.gap-row,
	.comparison-row,
	.projection-grid > div {
		border: 1px solid rgba(148, 163, 184, 0.14);
		border-radius: 8px;
		background: rgba(2, 6, 23, 0.28);
		padding: 0.7rem;
	}

	.segment-card,
	.issue-row,
	.gap-summary,
	.gap-row,
	.comparison-row,
	.projection-grid > div {
		display: grid;
		gap: 0.3rem;
	}

	.gap-summary {
		border-color: rgba(251, 191, 36, 0.34);
	}

	.gap-summary.ok {
		border-color: rgba(20, 184, 166, 0.34);
	}

	.gap-summary span,
	.gap-row span {
		color: var(--color-text-muted);
		font-size: 0.78rem;
	}

	.gap-row {
		border-color: rgba(251, 191, 36, 0.34);
	}

	.comparison-row {
		grid-template-columns: 1.1fr minmax(0, 1fr) minmax(0, 1fr) auto;
		align-items: center;
	}

	.comparison-row span,
	.comparison-row small {
		color: var(--color-text-muted);
		font-size: 0.78rem;
		overflow-wrap: anywhere;
	}

	.comparison-row small {
		border: 1px solid rgba(20, 184, 166, 0.38);
		border-radius: 999px;
		color: #99f6e4;
		padding: 0.24rem 0.45rem;
		text-align: center;
	}

	.comparison-row.gap {
		border-color: rgba(251, 191, 36, 0.4);
	}

	.comparison-row.gap small {
		border-color: rgba(251, 191, 36, 0.5);
		color: #fde68a;
	}

	.plan-row {
		display: grid;
		grid-template-columns: 3rem minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.75rem;
	}

	.projection-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 0.5rem;
	}

	@media (max-width: 760px) {
		.status-grid,
		.layout-grid,
		.editor-actions,
		.write-panel,
		.plan-row,
		.comparison-row {
			grid-template-columns: 1fr;
		}

		h1 {
			font-size: 1.55rem;
		}
	}
</style>
