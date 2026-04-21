<script lang="ts">
	import { goto } from '$app/navigation';
	import type { RoutineLog, RoutineTemplate, MetricType } from '$lib/types';
	import { getMetricValue, formatMetricValue } from '$lib/utils/metrics';
	import { formatTime } from '$lib/utils/time';
	import {
		getAvailableMetricsForRoutine,
		findPB,
		isTimeMetric,
		type MetricDescriptor
	} from '$lib/utils/routineAnalytics';

	let {
		logs,
		routine,
		hiddenMetrics = []
	}: {
		logs: RoutineLog[];
		routine: RoutineTemplate;
		hiddenMetrics?: string[];
	} = $props();

	const metrics = $derived(getAvailableMetricsForRoutine(routine, hiddenMetrics));

	let selectedKey = $state<MetricType | undefined>(undefined);
	$effect(() => {
		if (!selectedKey && metrics.length > 0) {
			const heroKey = routine.displayConfig?.heroMetric;
			const fromHero = metrics.find((m) => m.key === heroKey);
			selectedKey = fromHero?.key ?? metrics[0].key;
		}
	});

	const selectedMetric = $derived<MetricDescriptor | undefined>(
		metrics.find((m) => m.key === selectedKey)
	);

	type SortKey = 'date' | 'metric' | 'rpe';
	let sortKey = $state<SortKey>('date');
	let sortDir = $state<'asc' | 'desc'>('desc');

	function toggleSort(k: SortKey) {
		if (sortKey === k) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = k;
			sortDir = k === 'date' ? 'desc' : 'desc';
		}
	}

	const pbLogId = $derived.by(() => {
		if (!selectedMetric) return null;
		const pb = findPB(logs, selectedMetric.key, routine, selectedMetric.lowerIsBetter);
		return pb?.log.id ?? null;
	});

	type Row = {
		id: string;
		date: Date;
		discipline: string;
		metricValue: number;
		rpe: number | undefined;
		tags: string[];
		log: RoutineLog;
	};

	const rows = $derived.by<Row[]>(() => {
		if (!selectedMetric) return [];
		return logs.map((log) => ({
			id: log.id,
			date: log.date.toDate(),
			discipline: log.disciplineUsed,
			metricValue: getMetricValue(selectedMetric.key, log, routine),
			rpe: log.rpe,
			tags: routine.tags ?? [],
			log
		}));
	});

	const sortedRows = $derived.by(() => {
		const dir = sortDir === 'asc' ? 1 : -1;
		const arr = [...rows];
		arr.sort((a, b) => {
			if (sortKey === 'date') return (a.date.getTime() - b.date.getTime()) * dir;
			if (sortKey === 'metric') {
				// Treat 0 / NaN as worst, regardless of direction
				const av = Number.isFinite(a.metricValue) && a.metricValue > 0 ? a.metricValue : -Infinity;
				const bv = Number.isFinite(b.metricValue) && b.metricValue > 0 ? b.metricValue : -Infinity;
				return (av - bv) * dir;
			}
			if (sortKey === 'rpe') {
				const av = a.rpe ?? -Infinity;
				const bv = b.rpe ?? -Infinity;
				return (av - bv) * dir;
			}
			return 0;
		});
		return arr;
	});

	let showAll = $state(false);
	const PAGE_SIZE = 20;
	const visibleRows = $derived(showAll ? sortedRows : sortedRows.slice(0, PAGE_SIZE));
	const hiddenCount = $derived(Math.max(0, sortedRows.length - visibleRows.length));

	function fmtMetric(v: number): string {
		if (!selectedMetric) return '—';
		if (!Number.isFinite(v) || v <= 0) return '—';
		return isTimeMetric(selectedMetric.key) ? formatTime(v) : formatMetricValue(selectedMetric.key, v);
	}

	function fmtDate(d: Date): string {
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
	}

	function openSession(id: string) {
		goto(`/session/${id}`);
	}

	function onRowKey(e: KeyboardEvent, id: string) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			openSession(id);
		}
	}

	function sortIndicator(k: SortKey): string {
		if (sortKey !== k) return '';
		return sortDir === 'asc' ? ' ▲' : ' ▼';
	}
</script>

{#if rows.length > 0 && selectedMetric}
	<div class="sessions-list-card">
		<header class="card-header">
			<h3>Sessions</h3>
			<p class="hint">Every logged session for this routine. Click a row to open the full session.</p>
		</header>

		<div class="controls">
			<label class="control">
				<span class="control-label">Show metric</span>
				<select bind:value={selectedKey}>
					{#each metrics as m}
						<option value={m.key}>{m.label}</option>
					{/each}
				</select>
			</label>
			<span class="count">{rows.length} session{rows.length === 1 ? '' : 's'}</span>
		</div>

		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>
							<button class="th-btn" onclick={() => toggleSort('date')}>
								Date{sortIndicator('date')}
							</button>
						</th>
						<th>Discipline</th>
						<th>
							<button class="th-btn" onclick={() => toggleSort('metric')}>
								{selectedMetric.label}{sortIndicator('metric')}
							</button>
						</th>
						<th>
							<button class="th-btn" onclick={() => toggleSort('rpe')}>
								RPE{sortIndicator('rpe')}
							</button>
						</th>
						<th>Notes</th>
					</tr>
				</thead>
				<tbody>
					{#each visibleRows as r}
						<tr
							class="row"
							class:pb={r.id === pbLogId}
							tabindex="0"
							onclick={() => openSession(r.id)}
							onkeydown={(e) => onRowKey(e, r.id)}
						>
							<td>
								<span class="date">{fmtDate(r.date)}</span>
								{#if r.id === pbLogId}
									<span class="pb-badge" title="Personal best">PB</span>
								{/if}
							</td>
							<td class="discipline">{r.discipline}</td>
							<td class="metric">{fmtMetric(r.metricValue)}</td>
							<td>{r.rpe != null ? r.rpe : '—'}</td>
							<td class="notes">
								{#if r.log.notes}
									<span class="notes-text">{r.log.notes}</span>
								{:else}
									<span class="muted">—</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if hiddenCount > 0}
			<div class="show-more-wrap">
				<button class="show-more" onclick={() => (showAll = true)}>
					Show all {sortedRows.length} sessions
				</button>
			</div>
		{:else if showAll && sortedRows.length > PAGE_SIZE}
			<div class="show-more-wrap">
				<button class="show-more" onclick={() => (showAll = false)}>
					Show fewer
				</button>
			</div>
		{/if}
	</div>
{/if}

<style>
	.sessions-list-card {
		background: var(--color-bg-card);
		border-radius: 12px;
		padding: 1.1rem 1rem 1.3rem;
	}

	.card-header {
		margin-bottom: 0.75rem;
	}

	.card-header h3 {
		margin: 0 0 0.2rem;
		font-size: 1.05rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.hint {
		margin: 0;
		font-size: 0.82rem;
		color: var(--color-text-muted);
	}

	.controls {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.8rem;
		flex-wrap: wrap;
	}

	.control {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 200px;
	}

	.control-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
	}

	select {
		background: rgba(15, 23, 42, 0.5);
		color: var(--color-text);
		border: 1px solid rgba(148, 163, 184, 0.25);
		border-radius: 8px;
		padding: 0.45rem 0.55rem;
		font-size: 0.9rem;
	}

	.count {
		font-size: 0.82rem;
		color: var(--color-text-muted);
	}

	.table-wrap {
		overflow-x: auto;
		margin: 0 -0.25rem;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.88rem;
	}

	th,
	td {
		text-align: left;
		padding: 0.55rem 0.6rem;
		border-bottom: 1px solid rgba(148, 163, 184, 0.12);
		vertical-align: middle;
	}

	th {
		font-weight: 600;
		font-size: 0.78rem;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.th-btn {
		background: none;
		border: none;
		color: inherit;
		font: inherit;
		padding: 0;
		cursor: pointer;
	}

	.th-btn:hover {
		color: var(--color-text);
	}

	tr.row {
		cursor: pointer;
		transition: background-color 0.15s ease;
	}

	tr.row:hover,
	tr.row:focus-visible {
		background: rgba(20, 184, 166, 0.08);
		outline: none;
	}

	tr.row.pb {
		background: rgba(251, 191, 36, 0.06);
	}

	tr.row.pb:hover,
	tr.row.pb:focus-visible {
		background: rgba(251, 191, 36, 0.12);
	}

	.date {
		font-weight: 500;
		color: var(--color-text);
	}

	.pb-badge {
		display: inline-block;
		margin-left: 0.4rem;
		padding: 0.05rem 0.35rem;
		border-radius: 4px;
		background: #fbbf24;
		color: #1f2937;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.05em;
	}

	.discipline {
		color: var(--color-text-muted);
		font-size: 0.82rem;
		text-transform: capitalize;
	}

	.metric {
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		color: var(--color-text);
	}

	.notes {
		max-width: 280px;
		color: var(--color-text-muted);
		font-size: 0.82rem;
	}

	.notes-text {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.muted {
		color: var(--color-text-muted);
		opacity: 0.6;
	}

	.show-more-wrap {
		margin-top: 0.8rem;
		text-align: center;
	}

	.show-more {
		background: transparent;
		color: var(--color-primary, #14b8a6);
		border: 1px solid rgba(20, 184, 166, 0.35);
		border-radius: 8px;
		padding: 0.45rem 0.9rem;
		font-size: 0.85rem;
		cursor: pointer;
	}

	.show-more:hover {
		background: rgba(20, 184, 166, 0.1);
	}
</style>
