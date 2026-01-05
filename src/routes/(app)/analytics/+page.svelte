<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { user } from '$lib/stores/auth';
	import { db } from '$lib/firebase';
	import { collection, query, getDocs, where, orderBy } from 'firebase/firestore';
	import type { RoutineLog, Discipline, PersonalBests } from '$lib/types';
	import LineChart from '$lib/components/LineChart.svelte';
	import TimeOfDayAnalysis from '$lib/components/analytics/TimeOfDayAnalysis.svelte';
	import {
		calculatePersonalBests,
		calculateTrainingSummary,
		calculatePoolSessionStats,
		calculateCompetitionStats,
		prepareProgressData,
		filterLogsByTimeframe,
		type Timeframe
	} from '$lib/utils/analytics';
	import { formatTime } from '$lib/utils/time';
	import { format } from 'date-fns';
	let timeframe = $state<Timeframe>('1month');
	let selectedDiscipline = $state<Discipline>('DYN');
	let allLogs = $state<RoutineLog[]>([]);
	let loading = $state(true);

	const timeframes = [
		{ value: '1month', label: 'Last Month' },
		{ value: '6months', label: 'Last 6 Months' },
		{ value: '1year', label: 'Last Year' },
		{ value: 'all', label: 'All Time' }
	];

	const disciplines = ['DYN', 'DNF', 'DYNB', 'STA'] as Discipline[];

	// Reactive computations
	const filteredLogs = $derived.by(() => filterLogsByTimeframe(allLogs, timeframe));
	const personalBests = $derived.by(() => {
		const pbs = calculatePersonalBests(allLogs);
		// Group by discipline
		const grouped: Record<string, { distance?: number; time?: number }> = {};
		for (const pb of pbs) {
			if (!grouped[pb.discipline]) grouped[pb.discipline] = {};
			if (pb.unit === 'meters') {
				grouped[pb.discipline].distance = pb.value;
			} else {
				grouped[pb.discipline].time = pb.value;
			}
		}
		return grouped;
	});

	const trainingSummary = $derived(calculateTrainingSummary(allLogs, timeframe));
	const poolStats = $derived(calculatePoolSessionStats(allLogs, timeframe));
	const competitionStats = $derived(calculateCompetitionStats(allLogs, timeframe));

	const progressChartData = $derived.by(() => {
		const progressData = prepareProgressData(
			filteredLogs,
			selectedDiscipline,
			['DYN', 'DNF', 'DYNB'].includes(selectedDiscipline) ? 'distance' : 'time'
		);

		return {
			labels: progressData.map((d) => format(new Date(d.date), 'MMM d')),
			datasets: [
				{
					label: ['DYN', 'DNF', 'DYNB'].includes(selectedDiscipline)
						? 'Distance (m)'
						: 'Time (s)',
					data: progressData.map((d) => d.value),
					borderColor: '#14b8a6',
					backgroundColor: 'rgba(20, 184, 166, 0.1)',
					tension: 0.3,
					fill: true
				}
			]
		};
	});

	async function fetchAllLogs() {
		if (!$user) return;

		try {
			loading = true;

			// Query flat routineLogs collection (current data structure)
			const routineLogsRef = collection(db, 'routineLogs');
			const q = query(
				routineLogsRef,
				where('userId', '==', $user.uid),
				orderBy('date', 'desc')
			);

			const snapshot = await getDocs(q);
			const logs: RoutineLog[] = [];

			snapshot.forEach((doc) => {
				logs.push({ id: doc.id, ...doc.data() } as RoutineLog);
			});

			allLogs = logs;
		} catch (error) {
			console.error('Error fetching logs:', error);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		// Check for query params to pre-select filters
		const disciplineParam = $page.url.searchParams.get('discipline');
		if (disciplineParam && disciplines.includes(disciplineParam as Discipline)) {
			selectedDiscipline = disciplineParam as Discipline;
		}

		// Note: routine param is captured but not used yet (would require adding routine filter)
		const routineParam = $page.url.searchParams.get('routine');
		if (routineParam) {
			console.log('Routine filter requested:', routineParam);
			// TODO: Add routine-specific filtering in future
		}

		fetchAllLogs();
	});
</script>

<div class="analytics-container">
	<div class="header">
		<h1 class="title">Analytics</h1>
		<select
			bind:value={timeframe}
			class="timeframe-select"
		>
			{#each timeframes as tf}
				<option value={tf.value}>{tf.label}</option>
			{/each}
		</select>
	</div>

	{#if loading}
		<div class="loading">
			<div class="spinner"></div>
			<p>Loading analytics...</p>
		</div>
	{:else if allLogs.length === 0}
		<div class="empty-state">
			<div class="empty-icon">📊</div>
			<h3>No training data yet</h3>
			<p>Start logging dives to see your progress</p>
		</div>
	{:else}
		<div class="content">
			<!-- Stats Grid -->
			<div class="stats-grid">
				<!-- Training Summary -->
				<div class="stat-card">
					<h2>Training Summary</h2>
					<div class="stat-list">
						<div class="stat-item">
							<span class="stat-label">Total Sessions</span>
							<span class="stat-value">{trainingSummary.totalSessions}</span>
						</div>
						{#each disciplines as disc}
							<div class="stat-item">
								<span class="stat-label">{disc} Sessions</span>
								<span class="stat-value">{poolStats.byDiscipline[disc]}</span>
							</div>
						{/each}
						<div class="stat-item">
							<span class="stat-label">Avg Sessions / Week</span>
							<span class="stat-value">{trainingSummary.avgPerWeek.toFixed(1)}</span>
						</div>
						{#if trainingSummary.avgRPE}
							<div class="stat-item">
								<span class="stat-label">Avg RPE</span>
								<span class="stat-value">{trainingSummary.avgRPE.toFixed(1)}</span>
							</div>
						{/if}
						{#if trainingSummary.avgJoy}
							<div class="stat-item">
								<span class="stat-label">Avg Joy</span>
								<span class="stat-value">{trainingSummary.avgJoy.toFixed(1)}</span>
							</div>
						{/if}
					</div>
				</div>

				<!-- Personal Bests -->
				<div class="stat-card">
					<h2>Personal Bests</h2>
					<div class="stat-list">
						{#each disciplines as disc}
							{@const pb = personalBests[disc]}
							<div class="stat-item">
								<span class="stat-label">{disc}</span>
								<span class="stat-value">
									{#if pb?.distance}
										{pb.distance}m
									{:else if pb?.time}
										{formatTime(pb.time)}
									{:else}
										—
									{/if}
								</span>
							</div>
						{/each}
					</div>
				</div>

				<!-- Competition Summary -->
				<div class="stat-card">
					<h2>Competition Summary</h2>
					<div class="stat-list">
						<div class="stat-item">
							<span class="stat-label">Competition Dives</span>
							<span class="stat-value">{competitionStats.competitionCount}</span>
						</div>
						<div class="stat-item">
							<span class="stat-label">Records Tagged</span>
							<span class="stat-value">
								{competitionStats.recordCount > 0 ? competitionStats.recordCount : '—'}
							</span>
						</div>
						{#each disciplines as disc}
							<div class="stat-item">
								<span class="stat-label">{disc} Records</span>
								<span class="stat-value">
									{competitionStats.recordByDiscipline[disc] > 0
										? competitionStats.recordByDiscipline[disc]
										: '—'}
								</span>
							</div>
						{/each}
					</div>
				</div>
			</div>

			<!-- Progress Over Time Chart -->
			<div class="chart-card">
				<div class="chart-header">
					<h2>Progress Over Time</h2>
					<select bind:value={selectedDiscipline} class="discipline-select">
						{#each disciplines as disc}
							<option value={disc}>{disc}</option>
						{/each}
					</select>
				</div>
				<LineChart
					data={progressChartData}
					height={300}
					yTickFormatter={selectedDiscipline === 'STA' ? formatTime : undefined}
					tooltipValueFormatter={selectedDiscipline === 'STA' ? formatTime : undefined}
				/>
			</div>

			<!-- Performance by Time of Day -->
			<TimeOfDayAnalysis
				logs={filteredLogs}
				discipline={selectedDiscipline}
				metric={['DYN', 'DNF', 'DYNB'].includes(selectedDiscipline) ? 'distance' : 'time'}
			/>
		</div>
	{/if}
</div>

<style>
	.analytics-container {
		max-width: 1024px;
		margin: 0 auto;
		padding: 1.5rem 1rem;
	}

	@media (min-width: 768px) {
		.analytics-container {
			padding: 1.5rem 3rem;
		}
	}

	@media (min-width: 1280px) {
		.analytics-container {
			padding: 1.5rem 6rem;
		}
	}

	.header {
		margin-bottom: 2rem;
	}

	.title {
		font-size: 2rem;
		font-weight: 700;
		background: linear-gradient(
			135deg,
			var(--color-primary),
			var(--color-secondary)
		);
		-webkit-background-clip: text;
		margin-bottom: 1rem;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.timeframe-select,
	.discipline-select {
		padding: 0.5rem 1rem;
		border-radius: 8px;
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.2);
		color: var(--color-text);
		outline: none;
		cursor: pointer;
		font-size: 0.875rem;
		transition: border-color 0.2s ease;
	}

	.timeframe-select:focus,
	.discipline-select:focus {
		border-color: var(--color-primary);
	}

	.loading,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 2rem;
		text-align: center;
	}

	.spinner {
		width: 48px;
		height: 48px;
		border: 4px solid rgba(148, 163, 184, 0.2);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 1rem;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.empty-icon {
		font-size: 4rem;
		margin-bottom: 1rem;
	}

	.empty-state h3 {
		font-size: 1.5rem;
		font-weight: 600;
		margin-bottom: 0.5rem;
		color: var(--color-text);
	}

	.empty-state p {
		color: var(--color-text-muted);
	}

	.content {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.chart-card {
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.15);
		border-radius: 14px;
		padding: 1.5rem;
		box-shadow:
			0 6px 18px rgba(15, 23, 42, 0.12),
			0 0 0 1px rgba(56, 189, 248, 0.15),
			0 0 18px rgba(56, 189, 248, 0.12);
		position: relative;
		overflow: hidden;
		transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
	}

	.chart-card::before {
		content: '';
		position: absolute;
		top: 0;
		left: 1rem;
		right: 1rem;
		height: 2px;
		background: radial-gradient(
			closest-side,
			rgba(56, 189, 248, 0.9) 0%,
			rgba(56, 189, 248, 0.55) 40%,
			rgba(56, 189, 248, 0.1) 75%,
			transparent 100%
		);
		opacity: 0.8;
	}

	.chart-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 10px 26px rgba(15, 23, 42, 0.18);
		border-color: rgba(148, 163, 184, 0.25);
	}

	.chart-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.chart-header h2 {
		font-size: 1.15rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.stats-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1.5rem;
	}

	@media (min-width: 768px) {
		.stats-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	.stat-card {
		background: linear-gradient(
			135deg,
			rgba(20, 184, 166, 0.08),
			rgba(16, 185, 129, 0.04)
		);
		border: 1px solid rgba(56, 189, 248, 0.25);
		border-radius: 14px;
		padding: 1.5rem;
		box-shadow:
			0 8px 22px rgba(15, 23, 42, 0.2),
			0 0 0 1px rgba(56, 189, 248, 0.2),
			0 0 22px rgba(56, 189, 248, 0.16);
		position: relative;
		overflow: hidden;
		transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
	}

	.stat-card::before {
		content: '';
		position: absolute;
		top: 0;
		left: 1rem;
		right: 1rem;
		height: 2px;
		background: radial-gradient(
			closest-side,
			rgba(56, 189, 248, 0.9) 0%,
			rgba(56, 189, 248, 0.55) 40%,
			rgba(56, 189, 248, 0.1) 75%,
			transparent 100%
		);
		opacity: 0.8;
	}

	.stat-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 10px 26px rgba(15, 23, 42, 0.18);
		border-color: rgba(148, 163, 184, 0.25);
	}

	.stat-card h2 {
		font-size: 0.9rem;
		font-weight: 600;
		color: rgba(125, 211, 252, 0.85);
		margin-bottom: 1.25rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
	}

	.stat-list {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}

	.stat-item {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		padding: 0.85rem 0.75rem;
		background: rgba(15, 23, 42, 0.4);
		border: 1px solid rgba(148, 163, 184, 0.15);
		border-radius: 12px;
		text-align: center;
	}

	.stat-label {
		color: rgba(125, 211, 252, 0.75);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.stat-value {
		color: var(--color-primary);
		font-weight: 700;
		font-size: 1.3rem;
		line-height: 1.2;
		margin-top: 0.25rem;
	}
</style>
