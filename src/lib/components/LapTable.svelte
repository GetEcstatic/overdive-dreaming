<script lang="ts">
	/**
	 * Per-lap table for dynamic dives.
	 *
	 * Renders split time, cumulative time, distance, cumulative distance
	 * and speed for each recorded lap. The fastest lap is highlighted
	 * and the slowest is muted.
	 */
	import type { LapData } from '$lib/types';
	import { buildLapTableRows } from '$lib/utils/lapTable';
	import { formatTime } from '$lib/utils/time';

	let {
		laps,
		poolLength,
		onLapClick
	}: {
		laps: LapData[] | undefined | null;
		poolLength?: number;
		onLapClick?: (lap: LapData) => void;
	} = $props();

	const rows = $derived(buildLapTableRows(laps, poolLength));

	function fmt(value: number | null, suffix = '', digits = 2): string {
		if (value === null) return '—';
		return `${value.toFixed(digits)}${suffix}`;
	}

	function fmtInt(value: number | null): string {
		if (value === null) return '—';
		return Math.round(value).toString();
	}

	function handleClick(idx: number) {
		if (!onLapClick || !laps) return;
		const lap = laps[idx];
		if (lap) onLapClick(lap);
	}
</script>

{#if rows.length > 0}
	<div class="lap-table-wrapper">
		<table class="lap-table">
			<thead>
				<tr>
					<th class="col-num">#</th>
					<th class="col-time">Split</th>
					<th class="col-time">Cum.</th>
					<th class="col-dist">Dist</th>
					<th class="col-dist">Cum. Dist</th>
					<th class="col-speed">Speed</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as row, i}
					<tr
						class:fastest={row.isFastest}
						class:slowest={row.isSlowest}
						class:clickable={!!onLapClick}
						onclick={() => handleClick(i)}
					>
						<td class="col-num">{row.lapNumber}</td>
						<td class="col-time">
							{row.splitSeconds === null ? '—' : formatTime(row.splitSeconds)}
						</td>
						<td class="col-time muted">
							{row.cumulativeSeconds === null ? '—' : formatTime(row.cumulativeSeconds)}
						</td>
						<td class="col-dist">{fmtInt(row.distanceMeters)}<span class="unit">m</span></td>
						<td class="col-dist muted">
							{fmtInt(row.cumulativeDistanceMeters)}<span class="unit">m</span>
						</td>
						<td class="col-speed">{fmt(row.speedMs, '', 2)}<span class="unit">m/s</span></td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	.lap-table-wrapper {
		width: 100%;
		overflow-x: auto;
		background: var(--color-bg-card);
		border-radius: 10px;
		border: 1px solid rgba(148, 163, 184, 0.08);
	}

	.lap-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	.lap-table thead th {
		text-align: right;
		font-weight: 600;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid rgba(148, 163, 184, 0.15);
		background: rgba(148, 163, 184, 0.03);
	}

	.lap-table tbody td {
		padding: 0.5rem 0.75rem;
		text-align: right;
		color: var(--color-text);
		border-bottom: 1px solid rgba(148, 163, 184, 0.06);
		font-variant-numeric: tabular-nums;
	}

	.lap-table tbody tr:last-child td {
		border-bottom: none;
	}

	.col-num {
		text-align: left !important;
		color: var(--color-text-muted);
		width: 2.5rem;
	}

	tr.fastest {
		background: rgba(20, 184, 166, 0.08);
	}

	tr.fastest td.col-speed {
		color: #14b8a6;
		font-weight: 600;
	}

	tr.slowest td {
		color: var(--color-text-muted);
	}

	tr.clickable {
		cursor: pointer;
	}

	tr.clickable:hover {
		background: rgba(148, 163, 184, 0.05);
	}

	.muted {
		color: var(--color-text-muted);
	}

	.unit {
		margin-left: 0.15rem;
		font-size: 0.7em;
		color: var(--color-text-muted);
	}
</style>
