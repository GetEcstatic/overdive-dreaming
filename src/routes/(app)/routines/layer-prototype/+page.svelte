<script lang="ts">
	import { defaultRoutineExamples } from '$lib/routineLayers/defaults';
	import {
		deriveDefaultTags,
		deriveDisplayMetrics,
		deriveMetricProfile,
		deriveRoutineClassifications,
		expandRoutineLayers,
		validateRoutineLayers
	} from '$lib/routineLayers/model';

	const prototypeRows = defaultRoutineExamples.map((example) => ({
		example,
		planRows: expandRoutineLayers(example.layers),
		classifications: deriveRoutineClassifications(example.layers),
		derivedMetrics: deriveMetricProfile(example.layers),
		derivedTags: deriveDefaultTags(example.layers),
		derivedDisplay: deriveDisplayMetrics(example.layers),
		validationIssues: validateRoutineLayers(example.layers)
	}));

	function formatBoolean(value: boolean): string {
		return value ? 'yes' : 'no';
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
				Read-only inspection surface for the new routine layer fixtures and pure transforms.
			</p>
		</div>
		<a class="back-link" href="/routines">Back to routines</a>
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

				<div class="layer-strip" aria-label="Authoring layers">
					{#each row.example.layers as layer}
						<div class="layer-line">
							<span>{layer.discipline}</span>
							<span>{layer.breatheUp.mode} breathe-up</span>
							<span>
								{layer.dive.distance ? `${layer.dive.distance.mode} distance` : 'no distance'}
							</span>
							<span>
								{layer.dive.duration ? `${layer.dive.duration.mode} duration` : 'no duration'}
							</span>
							<span>{layer.attributes.lungVolume} · {layer.attributes.effort}</span>
							<span>{layer.attributes.repeatCount}x</span>
						</div>
					{/each}
				</div>

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

					<div class="detail-block wide">
						<h3>Metrics</h3>
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
					</div>

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

	.back-link {
		border: 1px solid rgba(148, 163, 184, 0.28);
		border-radius: 6px;
		color: var(--color-text);
		padding: 9px 12px;
		text-decoration: none;
		white-space: nowrap;
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

	.layer-strip {
		display: grid;
		gap: 8px;
		padding: 14px 16px;
		border-bottom: 1px solid rgba(148, 163, 184, 0.18);
	}

	.layer-line {
		display: grid;
		grid-template-columns: 0.7fr repeat(5, minmax(0, 1fr));
		gap: 1px;
		border: 1px solid rgba(148, 163, 184, 0.18);
		border-radius: 6px;
		overflow-x: auto;
		background: rgba(148, 163, 184, 0.18);
	}

	.layer-line span {
		background: #111827;
		padding: 9px;
		font-size: 0.78rem;
		white-space: nowrap;
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

		.summary-band,
		.detail-grid {
			grid-template-columns: 1fr;
		}

		.status-cluster {
			justify-content: start;
		}

		.layer-line {
			grid-template-columns: repeat(6, minmax(110px, 1fr));
		}
	}
</style>
