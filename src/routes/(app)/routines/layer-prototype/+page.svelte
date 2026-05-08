<script lang="ts">
	import { defaultRoutineExamples } from '$lib/routineLayers/defaults';
	import type { RoutineLayerExample } from '$lib/routineLayers/defaults';
	import {
		deriveDefaultTags,
		deriveDisplayMetrics,
		deriveMetricProfile,
		deriveRoutineClassifications,
		expandRoutineLayers,
		validateRoutineLayers
	} from '$lib/routineLayers/model';
	import type {
		LayerDiscipline,
		LayerEffort,
		LayerIngredient,
		LayerValueMode,
		LungVolume,
		RoutineAuthoringLayer,
		TrainingEnvironment
	} from '$lib/routineLayers/model';
	import { buildLayerSentence } from '$lib/routineLayers/sentence';
	import type {
		LayerSentence,
		LayerSentenceModifier,
		LayerSentenceSegment,
		LayerSentenceSegmentKey
	} from '$lib/routineLayers/sentence';

	const disciplineOptions: LayerDiscipline[] = ['STA', 'DYN', 'DYNB', 'DNF', 'TORT'];
	const dynamicDisciplineOptions: LayerDiscipline[] = ['DYN', 'DYNB', 'DNF', 'TORT'];
	const lungVolumeOptions: LungVolume[] = ['FL', 'FRC', 'RV'];
	const effortOptions: LayerEffort[] = ['standard', 'submax', 'max'];
	const environmentOptions: TrainingEnvironment[] = ['wet', 'dry', 'both'];
	const lockIngredientBySegment: Record<LayerSentenceSegmentKey, LayerIngredient> = {
		discipline: 'discipline',
		breatheUp: 'breatheUp',
		dive: 'dive',
		setup: 'attributes',
		reps: 'repeat'
	};

	let editableExamples = $state(defaultRoutineExamples.map(cloneExample));
	let selectedEditor = $state({
		exampleId: defaultRoutineExamples[0].id,
		layerId: defaultRoutineExamples[0].layers[0].id,
		segment: 'discipline' as LayerSentenceSegmentKey
	});

	const prototypeRows = $derived(editableExamples.map((example) => {
		const layerSentences = example.layers.map((layer, index) => buildLayerSentence(layer, index));
		const requestedLayerIndex = example.layers.findIndex((layer) => layer.id === selectedEditor.layerId);
		const selectedLayerIndex = Math.max(0, requestedLayerIndex);
		const selectedLayer = example.layers[selectedLayerIndex] ?? example.layers[0];
		const selectedSentence = layerSentences[selectedLayerIndex] ?? layerSentences[0];

		return {
			example,
			planRows: expandRoutineLayers(example.layers),
			classifications: deriveRoutineClassifications(example.layers),
			derivedMetrics: deriveMetricProfile(example.layers),
			derivedTags: deriveDefaultTags(example.layers),
			derivedDisplay: deriveDisplayMetrics(example.layers),
			validationIssues: validateRoutineLayers(example.layers),
			layerSentences,
			isEditorOpen: selectedEditor.exampleId === example.id,
			selectedLayerIndex,
			selectedLayer,
			selectedSentence,
			selectedSegment: getSelectedSegment(layerSentences, selectedLayer.id, selectedEditor.segment)
		};
	}));

	function formatBoolean(value: boolean): string {
		return value ? 'yes' : 'no';
	}

	function cloneExample(example: RoutineLayerExample): RoutineLayerExample {
		return {
			...example,
			standardMetrics: [...example.standardMetrics],
			geekMetrics: [...example.geekMetrics],
			defaultTags: [...example.defaultTags],
			selectableTags: [...example.selectableTags],
			safetyContext: [...example.safetyContext],
			layers: example.layers.map((layer) => ({
				...layer,
				allowedDisciplines: layer.allowedDisciplines ? [...layer.allowedDisciplines] : undefined,
				breatheUp: { ...layer.breatheUp },
				dive: {
					distance: layer.dive.distance ? { ...layer.dive.distance } : undefined,
					duration: layer.dive.duration ? { ...layer.dive.duration } : undefined
				},
				attributes: { ...layer.attributes },
				locks: { ...layer.locks }
			}))
		};
	}

	function isSelected(layerId: string, segment: LayerSentenceSegmentKey): boolean {
		return selectedEditor.layerId === layerId && selectedEditor.segment === segment;
	}

	function selectSegment(exampleId: string, layerId: string, segment: LayerSentenceSegmentKey): void {
		selectedEditor = { exampleId, layerId, segment };
	}

	function selectLayer(exampleId: string, layerId: string): void {
		selectedEditor = { exampleId, layerId, segment: selectedEditor.segment };
	}

	function resetFixtures(): void {
		editableExamples = defaultRoutineExamples.map(cloneExample);
		selectedEditor = {
			exampleId: defaultRoutineExamples[0].id,
			layerId: defaultRoutineExamples[0].layers[0].id,
			segment: 'discipline'
		};
	}

	function updateLayer(
		exampleId: string,
		layerId: string,
		updater: (layer: RoutineAuthoringLayer) => RoutineAuthoringLayer
	): void {
		const example = editableExamples.find((item) => item.id === exampleId);
		const layerIndex = example?.layers.findIndex((layer) => layer.id === layerId) ?? -1;

		if (!example || layerIndex < 0) return;
		example.layers[layerIndex] = updater(example.layers[layerIndex]);
	}

	function setDiscipline(exampleId: string, layerId: string, discipline: LayerDiscipline): void {
		updateLayer(exampleId, layerId, (layer) => ({
			...layer,
			discipline,
			allowedDisciplines:
				layer.disciplineSelectionMode === 'log-time-selectable'
					? ensureIncludes(layer.allowedDisciplines ?? dynamicDisciplineOptions, discipline)
					: layer.allowedDisciplines,
			dive: discipline === 'STA' ? { duration: layer.dive.duration ?? { mode: 'open' } } : layer.dive
		}));
	}

	function setDisciplineSelectionMode(exampleId: string, layerId: string, mode: 'fixed' | 'log-time-selectable'): void {
		updateLayer(exampleId, layerId, (layer) => ({
			...layer,
			disciplineSelectionMode: mode,
			allowedDisciplines: mode === 'log-time-selectable' ? ensureIncludes(dynamicDisciplineOptions, layer.discipline) : undefined
		}));
	}

	function setBreatheUpMode(exampleId: string, layerId: string, mode: LayerValueMode): void {
		updateLayer(exampleId, layerId, (layer) => ({
			...layer,
			breatheUp: mode === 'open' ? { mode } : { mode, seconds: getDurationSeconds(layer.breatheUp) }
		}));
	}

	function setBreatheUpSeconds(exampleId: string, layerId: string, seconds: number): void {
		updateLayer(exampleId, layerId, (layer) => ({ ...layer, breatheUp: { mode: 'fixed', seconds } }));
	}

	function setDiveDistanceMode(exampleId: string, layerId: string, mode: LayerValueMode | 'none'): void {
		updateLayer(exampleId, layerId, (layer) => ({
			...layer,
			dive: {
				...layer.dive,
				distance: mode === 'none' ? undefined : mode === 'open' ? { mode } : { mode, meters: getDistanceMeters(layer) }
			}
		}));
	}

	function setDiveDistanceMeters(exampleId: string, layerId: string, meters: number): void {
		updateLayer(exampleId, layerId, (layer) => ({
			...layer,
			dive: { ...layer.dive, distance: { mode: 'fixed', meters } }
		}));
	}

	function setDiveDurationMode(exampleId: string, layerId: string, mode: LayerValueMode | 'none'): void {
		updateLayer(exampleId, layerId, (layer) => ({
			...layer,
			dive: {
				...layer.dive,
				duration: mode === 'none' ? undefined : mode === 'open' ? { mode } : { mode, seconds: getDurationSeconds(layer.dive.duration) }
			}
		}));
	}

	function setDiveDurationSeconds(exampleId: string, layerId: string, seconds: number): void {
		updateLayer(exampleId, layerId, (layer) => ({
			...layer,
			dive: { ...layer.dive, duration: { mode: 'fixed', seconds } }
		}));
	}

	function setSetupAttribute<Key extends keyof RoutineAuthoringLayer['attributes']>(
		exampleId: string,
		layerId: string,
		key: Key,
		value: RoutineAuthoringLayer['attributes'][Key]
	): void {
		updateLayer(exampleId, layerId, (layer) => ({
			...layer,
			attributes: { ...layer.attributes, [key]: value }
		}));
	}

	function setSegmentLocked(
		exampleId: string,
		layerId: string,
		segment: LayerSentenceSegmentKey,
		locked: boolean
	): void {
		const lockIngredient = lockIngredientBySegment[segment];
		updateLayer(exampleId, layerId, (layer) => ({
			...layer,
			locks: { ...layer.locks, [lockIngredient]: locked }
		}));
	}

	function getSegmentLocked(layer: RoutineAuthoringLayer, segment: LayerSentenceSegmentKey): boolean {
		return Boolean(layer.locks[lockIngredientBySegment[segment]]);
	}

	function ensureIncludes(items: LayerDiscipline[], discipline: LayerDiscipline): LayerDiscipline[] {
		return items.includes(discipline) ? [...items] : [discipline, ...items];
	}

	function getDurationSeconds(target: { mode: 'open' } | { mode: 'fixed'; seconds: number } | undefined): number {
		return target?.mode === 'fixed' ? target.seconds : 90;
	}

	function getDistanceMeters(layer: RoutineAuthoringLayer): number {
		return layer.dive.distance?.mode === 'fixed' ? layer.dive.distance.meters : 50;
	}

	function previewRepNumbers(layer: RoutineAuthoringLayer): number[] {
		const repeatCount = Math.max(1, Math.floor(layer.attributes.repeatCount));
		return Array.from({ length: Math.min(repeatCount, 16) }, (_, index) => index + 1);
	}

	function numberValue(event: Event): number {
		return Number((event.currentTarget as HTMLInputElement).value);
	}

	function getSelectedSegment(
		layerSentences: LayerSentence[],
		layerId: string,
		segmentKey: LayerSentenceSegmentKey
	): LayerSentenceSegment {
		const sentence = layerSentences.find((item) => item.layerId === layerId) ?? layerSentences[0];
		const segment = sentence?.segments.find((item) => item.key === segmentKey) ?? sentence?.segments[0];

		return segment ?? {
			key: segmentKey,
			label: 'Segment',
			summary: 'not applicable',
			modifiers: [],
			details: [],
			locked: false
		};
	}

	function modifierChipText(modifier: LayerSentenceModifier): string {
		return `${modifier.label} = ${modifierChipValue(modifier)}`;
	}

	function modifierChipValue(modifier: LayerSentenceModifier): string {
		if (modifier.key === 'discipline.default') return modifier.summary.replace(/^default /, '');
		if (modifier.key === 'breatheUp.duration' || modifier.key === 'dive.duration') {
			return modifier.summary.replace(/^fixed duration /, 'fixed ').replace(/^open duration$/, 'open');
		}
		if (modifier.key === 'dive.distance') {
			return modifier.summary.replace(/^fixed distance /, 'fixed ').replace(/^open distance$/, 'open');
		}

		return modifier.summary;
	}

	function layerDisplayName(layer: RoutineAuthoringLayer, layerIndex: number): string {
		return layer.name ?? `Layer ${layerIndex + 1}`;
	}

	function layerSummary(layer: RoutineAuthoringLayer): string {
		const repeatCount = Math.max(1, Math.floor(layer.attributes.repeatCount));
		const reps = repeatCount === 1 ? 'single rep' : `${repeatCount} reps`;
		const breatheUp = layer.breatheUp.mode === 'fixed' ? `${formatSeconds(layer.breatheUp.seconds)} breathe-up` : 'open breathe-up';
		const diveDuration = layer.dive.duration?.mode === 'fixed' ? `${formatSeconds(layer.dive.duration.seconds)} dive` : 'open dive';

		return `${layer.discipline} · ${reps} · ${breatheUp} · ${diveDuration}`;
	}

	function formatSeconds(seconds: number): string {
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;

		if (minutes === 0) return `${remainingSeconds}s`;
		return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
	}
</script>

<svelte:head>
	<title>Routine Layer Prototype</title>
</svelte:head>

<div class="prototype-page">
	<header class="page-header">
		<div>
			<p class="eyebrow">Local prototype</p>
			<h1>Routine Layer Model</h1>
			<p class="intro">
				Local-only modifier editor for the new routine layer fixtures and pure transforms.
			</p>
		</div>
		<div class="header-actions">
			<button type="button" class="reset-button" onclick={resetFixtures}>Reset fixtures</button>
			<a class="back-link" href="/routines">Back to routines</a>
		</div>
	</header>

	<section class="summary-band" aria-label="Prototype scope">
		<div>
			<strong>No persistence</strong>
			<span>Fixture data only</span>
		</div>
		<div>
			<strong>{prototypeRows.length}</strong>
			<span>default examples</span>
		</div>
		<div>
			<strong>{prototypeRows.reduce((total, row) => total + row.planRows.length, 0)}</strong>
			<span>expanded plan rows</span>
		</div>
	</section>

	<div class="routine-list">
		{#each prototypeRows as row}
			<section class="routine-panel" aria-label={row.example.name}>
				<div class="routine-head">
					<div>
						<h2>{row.example.name}</h2>
						<p>{row.example.purpose}</p>
					</div>
					<div class="status-cluster">
						<span class:ok={row.validationIssues.length === 0}>
							{row.validationIssues.length === 0 ? 'valid' : `${row.validationIssues.length} issue(s)`}
						</span>
						<span>{row.planRows.length} row{row.planRows.length === 1 ? '' : 's'}</span>
					</div>
				</div>

				<div class="layer-overview" aria-label="Authoring layer overview">
					{#each row.example.layers as layer, layerIndex}
						<button
							type="button"
							class:selected={row.isEditorOpen && row.selectedLayer.id === layer.id}
							class="layer-overview-item"
							onclick={() => selectLayer(row.example.id, layer.id)}
						>
							<div class="layer-overview-main">
								<span>Layer {layerIndex + 1}</span>
								<strong>{layerDisplayName(layer, layerIndex)}</strong>
								<small>{layerSummary(layer)}</small>
							</div>
							<div class="layer-segment-indicators" aria-label="Layer segments">
								{#each row.layerSentences[layerIndex].segments as segment}
									<span class:locked={segment.locked} class={`segment-${segment.key}`}>{segment.label}</span>
								{/each}
							</div>
						</button>
					{/each}
				</div>

				{#if row.isEditorOpen}
					<div class="layer-strip" aria-label="Selected authoring layer">
						<div class="layer-sentence" aria-label={row.selectedSentence.label}>
							<div class="layer-label">{layerDisplayName(row.selectedLayer, row.selectedLayerIndex)}</div>
							<div class="sentence-grid">
								{#each row.selectedSentence.segments as segment}
									<button
										type="button"
										class:locked={segment.locked}
										class:selected={isSelected(row.selectedSentence.layerId, segment.key)}
										class={`sentence-segment segment-${segment.key}`}
										onclick={() => selectSegment(row.example.id, row.selectedSentence.layerId, segment.key)}
									>
										<div class="segment-topline">
											<span class="segment-label">{segment.label}</span>
											<span class="lock-state">{segment.locked ? 'locked' : 'unlocked'}</span>
										</div>
										<strong>{segment.summary}</strong>
									</button>
								{/each}
							</div>
						</div>
					</div>
				{/if}

				{#if row.isEditorOpen}
					<section class="modifier-editor" aria-label="Selected segment modifiers">
						<div class="editor-head">
							<div>
								<p class="eyebrow">Local editor</p>
								<h3>{selectedEditor.segment}</h3>
							</div>
							<label class="lock-toggle">
								<input
									type="checkbox"
									checked={getSegmentLocked(row.selectedLayer, selectedEditor.segment)}
									onchange={(event) =>
										setSegmentLocked(
											row.example.id,
											row.selectedLayer.id,
											selectedEditor.segment,
											(event.currentTarget as HTMLInputElement).checked
										)}
								/>
								<span>Lock segment</span>
							</label>
						</div>

						<div class={`selected-modifiers segment-${row.selectedSegment.key}`} aria-label="Selected modifier values">
							{#each row.selectedSegment.modifiers as modifier}
								<span class:locked={modifier.locked}>{modifierChipText(modifier)}</span>
							{/each}
						</div>

						{#if selectedEditor.segment === 'discipline'}
							<div class="editor-grid">
								<label>
									<span>Default discipline</span>
									<select
										value={row.selectedLayer.discipline}
										onchange={(event) =>
											setDiscipline(row.example.id, row.selectedLayer.id, (event.currentTarget as HTMLSelectElement).value as LayerDiscipline)}
									>
										{#each disciplineOptions as discipline}
											<option value={discipline}>{discipline}</option>
										{/each}
									</select>
								</label>
								<label>
									<span>Selection mode</span>
									<select
										value={row.selectedLayer.disciplineSelectionMode}
										onchange={(event) =>
											setDisciplineSelectionMode(row.example.id, row.selectedLayer.id, (event.currentTarget as HTMLSelectElement).value as 'fixed' | 'log-time-selectable')}
									>
										<option value="fixed">fixed discipline</option>
										<option value="log-time-selectable">selectable at log time</option>
									</select>
								</label>
							</div>
						{:else if selectedEditor.segment === 'breatheUp'}
							<div class="editor-grid">
								<label>
									<span>Duration mode</span>
									<select
										value={row.selectedLayer.breatheUp.mode}
										onchange={(event) =>
											setBreatheUpMode(row.example.id, row.selectedLayer.id, (event.currentTarget as HTMLSelectElement).value as LayerValueMode)}
									>
										<option value="open">open duration</option>
										<option value="fixed">fixed duration</option>
									</select>
								</label>
								<label>
									<span>Seconds</span>
									<input
										type="number"
										min="1"
										value={getDurationSeconds(row.selectedLayer.breatheUp)}
										disabled={row.selectedLayer.breatheUp.mode === 'open'}
										oninput={(event) => setBreatheUpSeconds(row.example.id, row.selectedLayer.id, numberValue(event))}
									/>
								</label>
							</div>
						{:else if selectedEditor.segment === 'dive'}
							<div class="editor-grid">
								{#if row.selectedLayer.discipline !== 'STA'}
									<label>
										<span>Distance mode</span>
										<select
											value={row.selectedLayer.dive.distance?.mode ?? 'none'}
											onchange={(event) =>
												setDiveDistanceMode(row.example.id, row.selectedLayer.id, (event.currentTarget as HTMLSelectElement).value as LayerValueMode | 'none')}
										>
											<option value="none">no distance target</option>
											<option value="open">open distance</option>
											<option value="fixed">fixed distance</option>
										</select>
									</label>
									<label>
										<span>Meters</span>
										<input
											type="number"
											min="1"
											value={getDistanceMeters(row.selectedLayer)}
											disabled={row.selectedLayer.dive.distance?.mode !== 'fixed'}
											oninput={(event) => setDiveDistanceMeters(row.example.id, row.selectedLayer.id, numberValue(event))}
										/>
									</label>
								{/if}
								<label>
									<span>Duration mode</span>
									<select
										value={row.selectedLayer.dive.duration?.mode ?? 'none'}
										onchange={(event) =>
											setDiveDurationMode(row.example.id, row.selectedLayer.id, (event.currentTarget as HTMLSelectElement).value as LayerValueMode | 'none')}
									>
										<option value="none">no duration target</option>
										<option value="open">open duration</option>
										<option value="fixed">fixed duration</option>
									</select>
								</label>
								<label>
									<span>Seconds</span>
									<input
										type="number"
										min="1"
										value={getDurationSeconds(row.selectedLayer.dive.duration)}
										disabled={row.selectedLayer.dive.duration?.mode !== 'fixed'}
										oninput={(event) => setDiveDurationSeconds(row.example.id, row.selectedLayer.id, numberValue(event))}
									/>
								</label>
							</div>
						{:else if selectedEditor.segment === 'setup'}
							<div class="editor-grid">
								<label>
									<span>Lung volume</span>
									<select value={row.selectedLayer.attributes.lungVolume} onchange={(event) => setSetupAttribute(row.example.id, row.selectedLayer.id, 'lungVolume', (event.currentTarget as HTMLSelectElement).value as LungVolume)}>
										{#each lungVolumeOptions as option}<option value={option}>{option}</option>{/each}
									</select>
								</label>
								<label>
									<span>Effort</span>
									<select value={row.selectedLayer.attributes.effort} onchange={(event) => setSetupAttribute(row.example.id, row.selectedLayer.id, 'effort', (event.currentTarget as HTMLSelectElement).value as LayerEffort)}>
										{#each effortOptions as option}<option value={option}>{option}</option>{/each}
									</select>
								</label>
								<label>
									<span>Environment</span>
									<select value={row.selectedLayer.attributes.environment} onchange={(event) => setSetupAttribute(row.example.id, row.selectedLayer.id, 'environment', (event.currentTarget as HTMLSelectElement).value as TrainingEnvironment)}>
										{#each environmentOptions as option}<option value={option}>{option}</option>{/each}
									</select>
								</label>
							</div>
						{:else if selectedEditor.segment === 'reps'}
							<div class="editor-grid">
								<label>
									<span>Repeat count</span>
									<input
										type="number"
										min="1"
										value={row.selectedLayer.attributes.repeatCount}
										oninput={(event) => setSetupAttribute(row.example.id, row.selectedLayer.id, 'repeatCount', Math.max(1, Math.floor(numberValue(event))))}
									/>
								</label>
							</div>
							<div class="rep-preview" aria-label="Expanded reps preview">
								<p>
									This authoring layer expands to {Math.max(1, Math.floor(row.selectedLayer.attributes.repeatCount))}
									loggable row{row.selectedLayer.attributes.repeatCount === 1 ? '' : 's'}.
								</p>
								<div>
									{#each previewRepNumbers(row.selectedLayer) as repNumber}
										<span>rep {repNumber}</span>
									{/each}
									{#if row.selectedLayer.attributes.repeatCount > 16}
										<span>+{row.selectedLayer.attributes.repeatCount - 16}</span>
									{/if}
								</div>
							</div>
						{/if}
					</section>
				{/if}

				<div class="detail-grid">
					<div class="detail-block">
						<h3>Classifications</h3>
						<dl>
							<div><dt>Max-like</dt><dd>{formatBoolean(row.classifications.maxLike)}</dd></div>
							<div><dt>Table-like</dt><dd>{formatBoolean(row.classifications.tableLike)}</dd></div>
							<div><dt>Dry capable</dt><dd>{formatBoolean(row.classifications.dryCapable)}</dd></div>
							<div><dt>Groups</dt><dd>{row.classifications.disciplineGroups.join(', ')}</dd></div>
						</dl>
					</div>

					<div class="detail-block">
						<h3>Display</h3>
						<dl>
							<div><dt>Hero</dt><dd>{row.example.display.hero}</dd></div>
							<div><dt>Secondary</dt><dd>{row.example.display.secondary ?? 'none'}</dd></div>
							<div><dt>Tertiary</dt><dd>{row.example.display.tertiary ?? 'none'}</dd></div>
							<div><dt>Derived hero</dt><dd>{row.derivedDisplay.hero}</dd></div>
						</dl>
					</div>

					<details class="detail-block wide expansion-detail">
						<summary>Expanded Plan Rows</summary>
						<div class="expanded-row-list">
							{#each row.planRows as planRow}
								<span>
									<strong>{planRow.globalRowIndex}</strong>
									{planRow.discipline} · layer {planRow.sourceLayerId.replace(`${row.example.id}-layer-`, '')} · rep {planRow.repIndex}
								</span>
							{/each}
						</div>
					</details>

					<details class="detail-block wide metrics-detail">
						<summary>Metrics</summary>
						<div class="chip-row">
							{#each row.example.standardMetrics as metric}
								<span class="metric-chip standard">{metric}</span>
							{/each}
						</div>
						<div class="chip-row">
							{#each row.example.geekMetrics as metric}
								<span class="metric-chip geek">{metric}</span>
							{/each}
						</div>
					</details>

					<div class="detail-block wide">
						<h3>Tags</h3>
						<div class="chip-row">
							{#each row.example.defaultTags as tag}
								<span class="tag-chip default">{tag}</span>
							{/each}
							{#each row.example.selectableTags as tag}
								<span class="tag-chip selectable">{tag}</span>
							{/each}
						</div>
						<p class="derived-line">Derived tags: {row.derivedTags.join(', ') || 'none'}</p>
					</div>
				</div>
			</section>
		{/each}
	</div>
</div>

<style>
	.prototype-page {
		display: grid;
		gap: 18px;
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: end;
		gap: 16px;
	}

	.eyebrow {
		margin: 0 0 6px;
		color: var(--color-primary);
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
	}

	h1,
	h2,
	h3,
	p {
		margin: 0;
	}

	h1 {
		font-size: 1.85rem;
	}

	.intro {
		margin-top: 8px;
		color: var(--color-text-muted);
		line-height: 1.45;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.back-link,
	.reset-button {
		border: 1px solid rgba(148, 163, 184, 0.28);
		border-radius: 6px;
		background: transparent;
		color: var(--color-text);
		font: inherit;
		padding: 9px 12px;
		text-decoration: none;
		white-space: nowrap;
	}

	.reset-button {
		cursor: pointer;
	}

	.reset-button:hover,
	.back-link:hover {
		border-color: rgba(20, 184, 166, 0.5);
	}

	.summary-band {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1px;
		border: 1px solid rgba(148, 163, 184, 0.22);
		border-radius: 8px;
		overflow: hidden;
		background: rgba(148, 163, 184, 0.22);
	}

	.summary-band > div {
		display: grid;
		gap: 4px;
		background: rgba(15, 23, 42, 0.82);
		padding: 14px;
	}

	.summary-band strong {
		font-size: 1.15rem;
	}

	.summary-band span,
	.routine-head p,
	dt,
	.derived-line {
		color: var(--color-text-muted);
	}

	.routine-list {
		display: grid;
		gap: 16px;
	}

	.routine-panel {
		border: 1px solid rgba(148, 163, 184, 0.22);
		border-radius: 8px;
		background: rgba(15, 23, 42, 0.72);
		overflow: hidden;
	}

	.routine-head {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		padding: 16px;
		border-bottom: 1px solid rgba(148, 163, 184, 0.18);
	}

	.routine-head h2 {
		font-size: 1.18rem;
		margin-bottom: 5px;
	}

	.status-cluster {
		display: flex;
		flex-wrap: wrap;
		justify-content: end;
		align-content: start;
		gap: 8px;
	}

	.status-cluster span {
		border: 1px solid rgba(148, 163, 184, 0.25);
		border-radius: 999px;
		padding: 6px 9px;
		color: var(--color-text-muted);
		font-size: 0.78rem;
	}

	.status-cluster .ok {
		border-color: rgba(20, 184, 166, 0.45);
		color: #99f6e4;
	}

	.layer-overview,
	.layer-strip {
		display: grid;
		gap: 8px;
		padding: 14px 16px;
		border-bottom: 1px solid rgba(148, 163, 184, 0.18);
	}

	.layer-overview-item {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 12px;
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 8px;
		background: rgba(17, 24, 39, 0.72);
		color: var(--color-text);
		cursor: pointer;
		font: inherit;
		min-width: 0;
		padding: 10px 12px;
		text-align: left;
	}

	.layer-overview-item:hover,
	.layer-overview-item.selected {
		border-color: rgba(20, 184, 166, 0.52);
	}

	.layer-overview-item.selected {
		background: rgba(20, 184, 166, 0.1);
		box-shadow: inset 3px 0 0 rgba(20, 184, 166, 0.72);
	}

	.layer-overview-main {
		display: grid;
		gap: 3px;
		min-width: 0;
	}

	.layer-overview-main span {
		color: var(--color-text-muted);
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
	}

	.layer-overview-main strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.layer-overview-main small {
		color: var(--color-text-muted);
		font-size: 0.78rem;
		overflow-wrap: anywhere;
	}

	.layer-segment-indicators {
		display: flex;
		flex-wrap: wrap;
		justify-content: end;
		gap: 5px;
		max-width: 360px;
	}

	.layer-segment-indicators span {
		border: 1px solid rgba(var(--segment-color, 148, 163, 184), 0.28);
		border-radius: 999px;
		background: rgba(var(--segment-color, 148, 163, 184), 0.1);
		color: var(--color-text-muted);
		font-size: 0.68rem;
		line-height: 1;
		padding: 5px 7px;
		white-space: nowrap;
	}

	.layer-segment-indicators span.locked {
		border-color: rgba(250, 204, 21, 0.35);
		color: #fde68a;
	}

	.layer-sentence {
		display: grid;
		gap: 10px;
	}

	.layer-label {
		color: var(--color-text-muted);
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
	}

	.sentence-grid {
		display: grid;
		grid-template-columns: repeat(5, minmax(136px, 1fr));
		gap: 8px;
		overflow-x: auto;
	}

	.sentence-segment {
		display: grid;
		align-content: start;
		gap: 9px;
		min-width: 0;
		min-height: 96px;
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 8px;
		background: #111827;
		color: var(--color-text);
		cursor: pointer;
		font: inherit;
		padding: 10px;
		text-align: left;
	}

	.sentence-segment.segment-discipline,
	.selected-modifiers.segment-discipline {
		--segment-color: 20, 184, 166;
	}

	.sentence-segment.segment-breatheUp,
	.selected-modifiers.segment-breatheUp {
		--segment-color: 110, 168, 254;
	}

	.sentence-segment.segment-dive,
	.selected-modifiers.segment-dive {
		--segment-color: 244, 114, 182;
	}

	.sentence-segment.segment-setup,
	.selected-modifiers.segment-setup {
		--segment-color: 167, 139, 250;
	}

	.sentence-segment.segment-reps,
	.selected-modifiers.segment-reps {
		--segment-color: 251, 146, 60;
	}

	.sentence-segment {
		border-left-color: rgba(var(--segment-color, 148, 163, 184), 0.65);
		border-left-width: 3px;
	}

	.sentence-segment:hover,
	.sentence-segment.selected {
		border-color: rgba(var(--segment-color, 20, 184, 166), 0.65);
	}

	.sentence-segment.selected {
		box-shadow: inset 0 0 0 1px rgba(var(--segment-color, 20, 184, 166), 0.32);
	}

	.sentence-segment.locked {
		border-color: rgba(250, 204, 21, 0.42);
		background: rgba(113, 63, 18, 0.24);
	}

	.segment-topline {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-width: 0;
		border-bottom: 1px solid rgba(var(--segment-color, 148, 163, 184), 0.28);
		padding-bottom: 7px;
	}

	.segment-label,
	.lock-state {
		font-size: 0.78rem;
	}

	.segment-label {
		color: rgb(var(--segment-color, 148, 163, 184));
		font-size: 0.82rem;
		font-weight: 700;
		letter-spacing: 0;
		text-transform: uppercase;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.lock-state {
		color: var(--color-text-muted);
		flex: 0 0 auto;
		font-size: 0.72rem;
	}

	.sentence-segment strong {
		color: var(--color-text);
		font-size: 0.9rem;
		font-weight: 600;
		line-height: 1.25;
		overflow-wrap: anywhere;
	}

	.selected-modifiers {
		display: flex;
		flex-wrap: wrap;
		gap: 7px;
		min-width: 0;
	}

	.selected-modifiers span {
		display: inline-flex;
		align-items: center;
		max-width: 100%;
		border: 1px solid rgba(var(--segment-color, 148, 163, 184), 0.34);
		border-radius: 999px;
		background: rgba(var(--segment-color, 148, 163, 184), 0.12);
		color: var(--color-text);
		font-size: 0.76rem;
		line-height: 1.25;
		overflow-wrap: anywhere;
		padding: 6px 9px;
	}

	.selected-modifiers span.locked {
		border-color: rgba(250, 204, 21, 0.35);
		color: #fde68a;
	}

	.modifier-editor {
		display: grid;
		gap: 14px;
		border-bottom: 1px solid rgba(148, 163, 184, 0.18);
		background: rgba(8, 13, 24, 0.64);
		padding: 14px 16px 16px;
	}

	.editor-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
	}

	.editor-head h3 {
		text-transform: capitalize;
	}

	.lock-toggle,
	.editor-grid label {
		display: grid;
		gap: 6px;
		color: var(--color-text-muted);
		font-size: 0.78rem;
		font-weight: 700;
	}

	.lock-toggle {
		display: flex;
		align-items: center;
		gap: 8px;
		white-space: nowrap;
	}

	.editor-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}

	.editor-grid select,
	.editor-grid input {
		width: 100%;
		border: 1px solid rgba(148, 163, 184, 0.28);
		border-radius: 6px;
		background: #0f172a;
		color: var(--color-text);
		font: inherit;
		padding: 9px 10px;
	}

	.editor-grid input:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}

	.rep-preview {
		display: grid;
		gap: 8px;
		color: var(--color-text-muted);
		font-size: 0.82rem;
	}

	.rep-preview > div,
	.expanded-row-list {
		display: flex;
		flex-wrap: wrap;
		gap: 7px;
	}

	.rep-preview span,
	.expanded-row-list span {
		border: 1px solid rgba(148, 163, 184, 0.22);
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.72);
		padding: 6px 8px;
	}

	.expansion-detail summary {
		cursor: pointer;
		font-size: 0.9rem;
		font-weight: 700;
		list-style-position: inside;
	}

	.expansion-detail[open] summary {
		margin-bottom: 10px;
	}

	.expanded-row-list span {
		color: var(--color-text-muted);
		font-size: 0.74rem;
		line-height: 1;
	}

	.expanded-row-list strong {
		color: var(--color-text);
		margin-right: 4px;
	}

	.detail-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1px;
		background: rgba(148, 163, 184, 0.18);
	}

	.detail-block {
		display: grid;
		gap: 10px;
		background: rgba(15, 23, 42, 0.76);
		padding: 14px 16px;
	}

	.detail-block.wide {
		grid-column: 1 / -1;
	}

	details.detail-block {
		display: block;
	}

	.metrics-detail summary {
		cursor: pointer;
		font-size: 0.9rem;
		font-weight: 700;
		list-style-position: inside;
	}

	.metrics-detail[open] summary {
		margin-bottom: 10px;
	}

	h3 {
		font-size: 0.9rem;
	}

	dl {
		display: grid;
		gap: 8px;
		margin: 0;
	}

	dl div {
		display: flex;
		justify-content: space-between;
		gap: 14px;
	}

	dd {
		margin: 0;
		text-align: right;
	}

	.chip-row {
		display: flex;
		flex-wrap: wrap;
		gap: 7px;
	}

	.metric-chip,
	.tag-chip {
		border-radius: 999px;
		padding: 6px 8px;
		font-size: 0.74rem;
		line-height: 1;
	}

	.metric-chip.standard,
	.tag-chip.default {
		background: rgba(20, 184, 166, 0.16);
		color: #bff6ec;
	}

	.metric-chip.geek,
	.tag-chip.selectable {
		background: rgba(110, 168, 254, 0.14);
		color: #cfe0ff;
	}

	.derived-line {
		font-size: 0.82rem;
	}

	@media (max-width: 720px) {
		.page-header,
		.routine-head {
			display: grid;
			align-items: start;
		}

		.header-actions {
			justify-content: start;
		}

		.summary-band,
		.detail-grid,
		.sentence-grid,
		.editor-grid {
			grid-template-columns: 1fr;
		}

		.layer-overview-item {
			grid-template-columns: 1fr;
		}

		.layer-segment-indicators {
			justify-content: start;
			max-width: none;
		}

		.status-cluster {
			justify-content: start;
		}
	}
</style>
