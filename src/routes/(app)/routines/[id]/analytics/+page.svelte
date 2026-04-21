<script lang="ts">
	import { goto } from '$app/navigation';
	import type { Discipline, RoutineLog } from '$lib/types';
	import OverviewStats from '$lib/components/analytics/routine/OverviewStats.svelte';
	import ProgressChart from '$lib/components/analytics/routine/ProgressChart.svelte';
	import CompareGroupsCard from '$lib/components/analytics/routine/CompareGroupsCard.svelte';
	import MetricScatterCard from '$lib/components/analytics/routine/MetricScatterCard.svelte';
	import RepDetailCard from '$lib/components/analytics/routine/RepDetailCard.svelte';
	import BiometricSummaryCard from '$lib/components/analytics/routine/BiometricSummaryCard.svelte';
	import ConsistencyCard from '$lib/components/analytics/routine/ConsistencyCard.svelte';
	import ReadinessCorrelatesCard from '$lib/components/analytics/routine/ReadinessCorrelatesCard.svelte';
	import RoutineSessionsList from '$lib/components/analytics/routine/RoutineSessionsList.svelte';
	import SessionQuickViewModal from '$lib/components/analytics/routine/SessionQuickViewModal.svelte';
	import {
		getAvailableMetricsForRoutine,
		hasRepDetail,
		hasBiometricData
	} from '$lib/utils/routineAnalytics';

	let { data } = $props();
	let { routine, logs, initialDiscipline } = $derived(data);

	let activeDiscipline = $state<Discipline | undefined>(undefined);

	$effect(() => {
		if (activeDiscipline === undefined) {
			const fallback = routine.disciplines?.[0];
			activeDiscipline = (initialDiscipline as Discipline | undefined) ?? fallback;
		}
	});

	const availableDisciplines = $derived(routine.disciplines ?? []);

	// Filter logs by active discipline when the routine supports more than one.
	const filteredLogs = $derived<RoutineLog[]>(
		availableDisciplines.length > 1 && activeDiscipline
			? logs.filter((l) => l.disciplineUsed === activeDiscipline)
			: logs
	);

	const sessionCount = $derived(filteredLogs.length);

	// Hidden metrics support (UserSettings.hiddenAnalyticsMetrics). Not yet stored in settings UI,
	// so we default to empty; passing the prop now means wiring it later is a one-line change.
	const hiddenMetrics: string[] = [];

	const availableMetrics = $derived(getAvailableMetricsForRoutine(routine, hiddenMetrics));

	// Hero metric descriptor for OverviewStats.
	const heroMetric = $derived.by(() => {
		const heroKey = routine.displayConfig?.heroMetric;
		const fromTrack = availableMetrics.find((m) => m.key === heroKey);
		return fromTrack ?? availableMetrics[0];
	});

	const showRepDetail = $derived(hasRepDetail(filteredLogs));
	const showBiometrics = $derived(hasBiometricData(filteredLogs));

	// Quick-view modal for clicking a session node on any graph.
	let activeLog = $state<RoutineLog | null>(null);
	function openQuickView(log: RoutineLog) {
		activeLog = log;
	}
	function closeQuickView() {
		activeLog = null;
	}

	function handleBack() {
		if (window.history.length > 1) {
			window.history.back();
		} else {
			goto('/dashboard');
		}
	}
</script>

<svelte:head>
	<title>{routine.name} - Analytics | Overdive Dreaming</title>
</svelte:head>

<div class="page">
	<header class="page-header">
		<button class="back-button" onclick={handleBack} aria-label="Go back">
			<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
				<path
					d="M12.5 15L7.5 10L12.5 5"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			Back
		</button>

		<div class="header-content">
			<div class="eyebrow">Routine Analytics</div>
			<h1>{routine.name}</h1>
			<div class="meta">
				{#if availableDisciplines.length > 0}
					<span class="discipline-list">
						{availableDisciplines.join(' · ')}
					</span>
				{/if}
				<span class="separator">•</span>
				<span class="session-count">
					{sessionCount} session{sessionCount === 1 ? '' : 's'} logged
				</span>
			</div>
			{#if routine.tags && routine.tags.length > 0}
				<div class="tag-row">
					{#each routine.tags as tag}
						<span class="tag">{tag}</span>
					{/each}
				</div>
			{/if}
		</div>
	</header>

	{#if availableDisciplines.length > 1}
		<div class="discipline-tabs" role="tablist" aria-label="Discipline">
			{#each availableDisciplines as disc}
				<button
					role="tab"
					aria-selected={activeDiscipline === disc}
					class="discipline-tab"
					class:active={activeDiscipline === disc}
					onclick={() => (activeDiscipline = disc)}
				>
					{disc}
				</button>
			{/each}
		</div>
	{/if}

	<section class="section">
		{#if heroMetric}
			<OverviewStats
				logs={filteredLogs}
				{routine}
				metric={heroMetric.key}
				lowerIsBetter={heroMetric.lowerIsBetter}
				metricLabel={heroMetric.label}
			/>
		{/if}
	</section>

	<section class="section">
		<ProgressChart logs={filteredLogs} {routine} {hiddenMetrics} onSessionClick={openQuickView} />
	</section>

	<section class="section">
		<CompareGroupsCard logs={filteredLogs} {routine} {hiddenMetrics} />
	</section>

	<section class="section">
		<MetricScatterCard logs={filteredLogs} {routine} {hiddenMetrics} onSessionClick={openQuickView} />
	</section>

	{#if showRepDetail}
		<section class="section">
			<RepDetailCard logs={filteredLogs} {routine} />
		</section>
	{/if}

	{#if showBiometrics}
		<section class="section">
			<BiometricSummaryCard logs={filteredLogs} onSessionClick={openQuickView} />
		</section>
	{/if}

	<section class="section">
		<ConsistencyCard logs={filteredLogs} {routine} {hiddenMetrics} />
	</section>

	<section class="section">
		<ReadinessCorrelatesCard logs={filteredLogs} {routine} {hiddenMetrics} onSessionClick={openQuickView} />
	</section>

	<section class="section">
		<RoutineSessionsList logs={filteredLogs} {routine} {hiddenMetrics} />
	</section>
</div>

{#if activeLog}
	<SessionQuickViewModal log={activeLog} {routine} onClose={closeQuickView} />
{/if}

<style>
	.page {
		max-width: 960px;
		margin: 0 auto;
		padding: 1.25rem 1rem 6rem;
		color: var(--color-text);
	}

	.page-header {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.back-button {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		background: transparent;
		border: none;
		color: var(--color-text-muted);
		font-size: 0.9rem;
		cursor: pointer;
		padding: 0.25rem 0;
	}

	.back-button:hover {
		color: var(--color-text);
	}

	.header-content h1 {
		font-size: 1.75rem;
		font-weight: 700;
		margin: 0.15rem 0 0.5rem;
		background: linear-gradient(
			90deg,
			var(--color-primary),
			var(--color-secondary)
		);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}

	.eyebrow {
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
		color: var(--color-text-muted);
	}

	.separator {
		opacity: 0.6;
	}

	.tag-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-top: 0.5rem;
	}

	.tag {
		font-size: 0.75rem;
		padding: 0.2rem 0.55rem;
		border-radius: 999px;
		background: rgba(20, 184, 166, 0.12);
		color: var(--color-primary);
		border: 1px solid rgba(20, 184, 166, 0.2);
	}

	.discipline-tabs {
		display: flex;
		gap: 0.4rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.discipline-tab {
		background: var(--color-bg-card);
		border: 1px solid transparent;
		color: var(--color-text-muted);
		padding: 0.4rem 0.8rem;
		border-radius: 999px;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
	}

	.discipline-tab.active {
		color: var(--color-primary);
		border-color: rgba(20, 184, 166, 0.4);
		background: rgba(20, 184, 166, 0.12);
	}

	.section {
		margin-bottom: 1.25rem;
	}
</style>
