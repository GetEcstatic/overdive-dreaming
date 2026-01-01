<script lang="ts">
	import { onMount } from 'svelte';
	import { user } from '$lib/stores/auth';
	import { db } from '$lib/firebase';
	import { collection, query, getDocs, collectionGroup } from 'firebase/firestore';
	import type { RoutineLog, Discipline } from '$lib/types';
	import LineChart from '$lib/components/LineChart.svelte';
	import {
		calculatePersonalBests,
		calculateTrainingSummary,
		prepareProgressData,
		filterLogsByTimeframe
	} from '$lib/utils/analytics';
	import { formatTime } from '$lib/utils/time';
	import { format } from 'date-fns';

	let timeframe = $state<'1month' | '6months' | '1year'>('1month');
	let selectedDiscipline = $state<Discipline>('DYN');
	let allLogs = $state<RoutineLog[]>([]);
	let loading = $state(true);

	const timeframes = [
		{ value: '1month', label: 'Last Month' },
		{ value: '6months', label: 'Last 6 Months' },
		{ value: '1year', label: 'Last Year' }
	];

	const disciplines = ['DYN', 'DNF', 'DYNB', 'STA'] as Discipline[];

	// Reactive computations
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

	const progressChartData = $derived.by(() => {
		const filteredLogs = filterLogsByTimeframe(allLogs, timeframe);
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

			// Query all routine logs for this user across all sessions
			const sessionsQuery = query(collection(db, 'sessions'));
			const sessionsSnapshot = await getDocs(sessionsQuery);

			const logs: RoutineLog[] = [];

			for (const sessionDoc of sessionsSnapshot.docs) {
				const sessionData = sessionDoc.data();
				if (sessionData.userId !== $user.uid) continue;

				const routineLogsRef = collection(db, 'sessions', sessionDoc.id, 'routineLogs');
				const routineLogsSnapshot = await getDocs(routineLogsRef);

				for (const logDoc of routineLogsSnapshot.docs) {
					logs.push({ id: logDoc.id, ...logDoc.data() } as RoutineLog);
				}
			}

			// Sort by date descending
			logs.sort((a, b) => b.date.seconds - a.date.seconds);

			allLogs = logs;
		} catch (error) {
			console.error('Error fetching logs:', error);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
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
				<LineChart data={progressChartData} height={300} />
			</div>

			<!-- Stats Grid -->
			<div class="stats-grid">
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

				<!-- Training Summary -->
				<div class="stat-card">
					<h2>Training Summary</h2>
					<div class="stat-list">
						<div class="stat-item">
							<span class="stat-label">Total Sessions</span>
							<span class="stat-value">{trainingSummary.totalSessions}</span>
						</div>
						<div class="stat-item">
							<span class="stat-label">Total Dives</span>
							<span class="stat-value">{trainingSummary.totalDives}</span>
						</div>
						<div class="stat-item">
							<span class="stat-label">Total Time</span>
							<span class="stat-value">{formatTime(trainingSummary.totalTime)}</span>
						</div>
						<div class="stat-item">
							<span class="stat-label">Avg per Week</span>
							<span class="stat-value">{trainingSummary.avgPerWeek.toFixed(1)}</span>
						</div>
						{#if trainingSummary.avgRPE}
							<div class="stat-item">
								<span class="stat-label">💪 Avg RPE</span>
								<span class="stat-value">{trainingSummary.avgRPE.toFixed(1)}</span>
							</div>
						{/if}
						{#if trainingSummary.avgJoy}
							<div class="stat-item">
								<span class="stat-label">😊 Avg Joy</span>
								<span class="stat-value">{trainingSummary.avgJoy.toFixed(1)}</span>
							</div>
						{/if}
					</div>
				</div>
			</div>
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
		display: flex;
		justify-content: space-between;
		align-items: center;
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
		gap: 1.5rem;
	}

	.chart-card {
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.1);
		border-radius: 12px;
		padding: 1.5rem;
	}

	.chart-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.chart-header h2 {
		font-size: 1.25rem;
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
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.1);
		border-radius: 12px;
		padding: 1.5rem;
	}

	.stat-card h2 {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: 1rem;
	}

	.stat-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.stat-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0;
	}

	.stat-label {
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	.stat-value {
		color: var(--color-text);
		font-weight: 600;
		font-size: 1rem;
	}
</style>
