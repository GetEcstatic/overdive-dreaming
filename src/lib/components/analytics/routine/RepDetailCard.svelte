<script lang="ts">
	import type { RoutineLog, RoutineTemplate } from '$lib/types';
	import LineChart from '$lib/components/LineChart.svelte';
	import {
		averageRepCurve,
		perRepCurve,
		repFadePercent,
		hasRepDetail
	} from '$lib/utils/routineAnalytics';
	import { formatTime } from '$lib/utils/time';

	let {
		logs,
		routine
	}: {
		logs: RoutineLog[];
		routine: RoutineTemplate;
	} = $props();

	const logsWithReps = $derived(logs.filter((l) => Array.isArray(l.laps) && l.laps!.length >= 2));

	let selectedLogId = $state<string | undefined>(undefined);

	$effect(() => {
		if (!selectedLogId && logsWithReps.length > 0) {
			// Default to the most recent session with rep data.
			const sorted = [...logsWithReps].sort(
				(a, b) => b.date.toDate().getTime() - a.date.toDate().getTime()
			);
			selectedLogId = sorted[0].id;
		}
	});

	const selectedLog = $derived(logsWithReps.find((l) => l.id === selectedLogId));

	// Per-rep chart for the selected log.
	const perRepChart = $derived.by(() => {
		if (!selectedLog) return { labels: [] as string[], datasets: [] as any[] };
		const curve = perRepCurve(selectedLog);
		const labels = curve.map((_, i) => `Rep ${i + 1}`);
		return {
			labels,
			datasets: [
				{
					label: 'Rep time',
					data: curve,
					borderColor: '#14b8a6',
					backgroundColor: 'rgba(20, 184, 166, 0.12)',
					tension: 0.3,
					fill: true,
					pointRadius: 4,
					pointHoverRadius: 6
				}
			]
		};
	});

	// Average rep curve across all logs with rep data.
	const avgCurve = $derived(averageRepCurve(logsWithReps));
	const avgChart = $derived.by(() => {
		if (avgCurve.length === 0) return { labels: [] as string[], datasets: [] as any[] };
		return {
			labels: avgCurve.map((c) => `Rep ${c.rep}`),
			datasets: [
				{
					label: 'Mean rep time',
					data: avgCurve.map((c) => (c.n > 0 ? c.mean : null)),
					borderColor: '#a78bfa',
					backgroundColor: 'rgba(167, 139, 250, 0.15)',
					tension: 0.3,
					fill: true,
					pointRadius: 3,
					pointHoverRadius: 5,
					spanGaps: true
				},
				{
					label: '± 1σ',
					data: avgCurve.map((c) => (c.n > 0 ? c.mean + c.stdev : null)),
					borderColor: 'rgba(167, 139, 250, 0.35)',
					borderDash: [4, 4],
					fill: false,
					pointRadius: 0,
					tension: 0.3,
					spanGaps: true
				}
			]
		};
	});

	const selectedFade = $derived(selectedLog ? repFadePercent(selectedLog) : 0);
	const avgFade = $derived.by(() => {
		const fades = logsWithReps.map((l) => repFadePercent(l)).filter((v) => Number.isFinite(v));
		if (fades.length === 0) return 0;
		return fades.reduce((a, b) => a + b, 0) / fades.length;
	});
</script>

{#if hasRepDetail(logs)}
	<div class="rep-card">
		<header class="card-header">
			<h3>Rep detail</h3>
			<p class="hint">How your rep time evolves within a session, and averaged across sessions.</p>
		</header>

		<div class="fade-stats">
			<div class="fade-stat">
				<span class="label">Avg fade across sessions</span>
				<span class="value" class:neg={avgFade < 0} class:pos={avgFade > 0}>
					{avgFade >= 0 ? '+' : ''}{avgFade.toFixed(1)}%
				</span>
				<span class="sub">last rep vs first rep (all sessions)</span>
			</div>
			{#if selectedLog}
				<div class="fade-stat">
					<span class="label">This session</span>
					<span class="value" class:neg={selectedFade < 0} class:pos={selectedFade > 0}>
						{selectedFade >= 0 ? '+' : ''}{selectedFade.toFixed(1)}%
					</span>
					<span class="sub">
						{selectedLog.date
							.toDate()
							.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
					</span>
				</div>
			{/if}
		</div>

		<div class="controls">
			<label class="control">
				<span class="control-label">Session</span>
				<select bind:value={selectedLogId}>
					{#each logsWithReps as l}
						<option value={l.id}>
							{l.date.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
							· {l.laps?.length ?? 0} reps
						</option>
					{/each}
				</select>
			</label>
		</div>

		{#if selectedLog && perRepChart.datasets.length > 0}
			<div class="chart-wrap">
				<h4>Per-rep curve (selected session)</h4>
				<LineChart
					data={perRepChart}
					height={220}
					yTickFormatter={formatTime}
					tooltipValueFormatter={formatTime}
				/>
			</div>
		{/if}

		{#if avgChart.datasets.length > 0}
			<div class="chart-wrap">
				<h4>Average rep curve ({logsWithReps.length} sessions)</h4>
				<LineChart
					data={avgChart}
					height={220}
					yTickFormatter={formatTime}
					tooltipValueFormatter={formatTime}
				/>
			</div>
		{/if}
	</div>
{/if}

<style>
	.rep-card {
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

	.fade-stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.fade-stat {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.fade-stat .label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
	}

	.fade-stat .value {
		font-size: 1.35rem;
		font-weight: 700;
		color: var(--color-text);
	}

	.fade-stat .value.pos { color: #f87171; }
	.fade-stat .value.neg { color: #22c55e; }

	.fade-stat .sub {
		font-size: 0.72rem;
		color: var(--color-text-muted);
	}

	.controls {
		margin-bottom: 0.9rem;
	}

	.control {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 220px;
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
		max-width: 100%;
	}

	.chart-wrap {
		margin-top: 1rem;
	}

	.chart-wrap h4 {
		margin: 0 0 0.5rem;
		font-size: 0.88rem;
		color: var(--color-text-muted);
		font-weight: 600;
	}
</style>
