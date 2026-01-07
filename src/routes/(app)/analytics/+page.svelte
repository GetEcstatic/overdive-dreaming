<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { user } from '$lib/stores/auth';
	import { db } from '$lib/firebase';
	import { collection, query, getDocs, where, orderBy } from 'firebase/firestore';
	import type { RoutineLog, Discipline, Season } from '$lib/types';
	import LineChart from '$lib/components/LineChart.svelte';
	import TimeOfDayAnalysis from '$lib/components/analytics/TimeOfDayAnalysis.svelte';
	import {
		calculatePersonalBests,
		calculateTrainingSummary,
		calculatePoolSessionStats,
		calculateCompetitionStats,
		calculateTrainingSummaryForRange,
		calculatePoolSessionStatsForRange,
		calculateCompetitionStatsForRange,
		prepareProgressData,
		filterLogsByTimeframe,
		filterLogsByDateRange,
		type Timeframe
	} from '$lib/utils/analytics';
	import { formatTime } from '$lib/utils/time';
	import { format } from 'date-fns';
	import { getUserSettings, getSeasonsForUser } from '$lib/firestore';

	let filterKey = $state<string>('tf:1month');
	let allLogs = $state<RoutineLog[]>([]);
	let loading = $state(true);
	let seasons = $state<Season[]>([]);
	let selectedProgressDisciplines = $state<Discipline[]>(['DYN', 'DNF', 'DYNB']);
	let progressMetric = $state<'distance' | 'time'>('distance');

	const timeframes = [
		{ value: '1month', label: 'Last Month' },
		{ value: '6months', label: 'Last 6 Months' },
		{ value: '1year', label: 'Last Year' },
		{ value: 'all', label: 'All Time' }
	];

	const disciplines = ['DYN', 'DNF', 'DYNB', 'STA'] as Discipline[];
	const progressDisciplines: Discipline[] = ['DYN', 'DNF', 'DYNB', 'STA'];

	// Reactive computations
	const selectedSeason = $derived.by(() => {
		if (!filterKey.startsWith('season:')) return undefined;
		const id = filterKey.replace('season:', '');
		return seasons.find((season) => season.id === id);
	});

	const activeTimeframe = $derived.by(() => {
		if (filterKey.startsWith('tf:')) {
			return filterKey.replace('tf:', '') as Timeframe;
		}
		return '1month' as Timeframe;
	});

	const filteredLogs = $derived.by(() => {
		if (selectedSeason) {
			return filterLogsByDateRange(
				allLogs,
				selectedSeason.startDate.toDate(),
				selectedSeason.endDate?.toDate()
			);
		}
		return filterLogsByTimeframe(allLogs, activeTimeframe);
	});
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

	const trainingSummary = $derived.by(() => {
		if (selectedSeason) {
			return calculateTrainingSummaryForRange(
				allLogs,
				selectedSeason.startDate.toDate(),
				selectedSeason.endDate?.toDate()
			);
		}
		return calculateTrainingSummary(allLogs, activeTimeframe);
	});

	const poolStats = $derived.by(() => {
		if (selectedSeason) {
			return calculatePoolSessionStatsForRange(
				allLogs,
				selectedSeason.startDate.toDate(),
				selectedSeason.endDate?.toDate()
			);
		}
		return calculatePoolSessionStats(allLogs, activeTimeframe);
	});

	const competitionStats = $derived.by(() => {
		if (selectedSeason) {
			return calculateCompetitionStatsForRange(
				allLogs,
				selectedSeason.startDate.toDate(),
				selectedSeason.endDate?.toDate()
			);
		}
		return calculateCompetitionStats(allLogs, activeTimeframe);
	});

	const dynamicDisciplines: Discipline[] = ['DYN', 'DNF', 'DYNB'];
	const isStaSelected = $derived(() => selectedProgressDisciplines.includes('STA'));
	const activeDynamicDisciplines = $derived(() =>
		selectedProgressDisciplines.filter((disc) => disc !== 'STA')
	);
	const selectedProgressMetric = $derived(() =>
		isStaSelected() ? 'time' : progressMetric
	);
	const timeOfDayDiscipline = $derived(() =>
		isStaSelected() ? 'STA' : (activeDynamicDisciplines()[0] ?? 'DYN')
	);

	const progressChartData = $derived.by((): {
		labels: string[];
		datasets: any[];
		labelDates: string[];
	} => {
		const activeDynamics = activeDynamicDisciplines();
		const activeDisciplines =
			selectedProgressDisciplines.length > 0
				? selectedProgressDisciplines
				: ['DYN'];
		const series = activeDisciplines.map((disc) => ({
			disc,
			data: prepareProgressData(filteredLogs, disc, selectedProgressMetric())
		}));

		const labelDates = Array.from(
			new Set(series.flatMap((entry) => entry.data.map((point) => point.date)))
		).sort((a, b) => a.localeCompare(b));

		const colorMap: Record<Discipline, { border: string; fill: string }> = {
			DYN: { border: '#14b8a6', fill: 'rgba(20, 184, 166, 0.12)' },
			DNF: { border: '#38bdf8', fill: 'rgba(56, 189, 248, 0.12)' },
			DYNB: { border: '#fbbf24', fill: 'rgba(251, 191, 36, 0.12)' },
			STA: { border: '#a78bfa', fill: 'rgba(167, 139, 250, 0.12)' }
		};

		return {
			labels: labelDates.map((date) => format(new Date(date), 'MMM d, yyyy')),
			labelDates,
			datasets: series.map((entry) => {
				const lookup = new Map(entry.data.map((point) => [point.date, point.value]));
				return {
					label: entry.disc,
					data: labelDates.map((date) => lookup.get(date) ?? null),
					borderColor: colorMap[entry.disc].border,
					backgroundColor: colorMap[entry.disc].fill,
					tension: 0.3,
					fill: false,
					spanGaps: true
				};
			})
		};
	});

	const progressSeasonBands = $derived.by(() => {
		if (filterKey !== 'tf:all' || seasons.length === 0) return [];
		const labelDates = progressChartData.labelDates;
		if (labelDates.length === 0) return [];

		const parsedLabels = labelDates.map((date) => new Date(date));
		return seasons
			.map((season) => {
				const start = season.startDate.toDate();
				const end = season.endDate?.toDate() ?? new Date();
				let startIndex: number | null = null;
				let endIndex: number | null = null;

				parsedLabels.forEach((date, index) => {
					if (date >= start && date <= end) {
						if (startIndex === null) startIndex = index;
						endIndex = index;
					}
				});

				if (startIndex === null || endIndex === null) return null;
				return {
					label: season.name,
					startIndex,
					endIndex,
					color: 'rgba(20, 184, 166, 0.08)'
				};
			})
			.filter(Boolean);
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

	async function fetchSettingsAndSeasons() {
		if (!$user) return;
		try {
			const settings = await getUserSettings($user.uid);
			if (settings?.defaultAnalyticsFilter && filterKey === 'tf:1month') {
				filterKey = settings.defaultAnalyticsFilter;
			} else if (settings?.defaultTimeframe && filterKey === 'tf:1month') {
				filterKey = `tf:${settings.defaultTimeframe}`;
			}
			seasons = await getSeasonsForUser($user.uid);
		} catch (error) {
			console.error('Error loading settings or seasons:', error);
		}
	}

	onMount(() => {
		// Check for query params to pre-select filters
		const disciplineParam = $page.url.searchParams.get('discipline');
		if (disciplineParam && disciplines.includes(disciplineParam as Discipline)) {
			selectedProgressDisciplines = [disciplineParam as Discipline];
			if (disciplineParam === 'STA') {
				progressMetric = 'time';
			}
		}

		// Note: routine param is captured but not used yet (would require adding routine filter)
		const routineParam = $page.url.searchParams.get('routine');
		if (routineParam) {
			console.log('Routine filter requested:', routineParam);
			// TODO: Add routine-specific filtering in future
		}

		fetchAllLogs();
		fetchSettingsAndSeasons();
	});
</script>

<div class="analytics-container">
	<div class="header">
		<h1 class="title">Analytics</h1>
		<select
			bind:value={filterKey}
			class="timeframe-select"
		>
			<optgroup label="Timeframes">
				{#each timeframes as tf}
					<option value={`tf:${tf.value}`}>{tf.label}</option>
				{/each}
			</optgroup>
			{#if seasons.length > 0}
				<optgroup label="Seasons">
					{#each seasons as season}
						<option value={`season:${season.id}`}>{season.name}</option>
					{/each}
				</optgroup>
			{/if}
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
					<h2>Personal Bests (All-time)</h2>
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
				</div>
				<div class="metric-toggle-row">
					<button
						type="button"
						class="metric-toggle"
						class:active={selectedProgressMetric() === 'distance'}
						disabled={isStaSelected()}
						onclick={() => {
							if (!isStaSelected()) {
								progressMetric = 'distance';
							}
						}}
					>
						Distance
					</button>
					<button
						type="button"
						class="metric-toggle"
						class:active={selectedProgressMetric() === 'time'}
						onclick={() => (progressMetric = 'time')}
					>
						Time
					</button>
				</div>
				<div class="discipline-toggle-row">
					{#each progressDisciplines as disc}
						<button
							type="button"
							class="discipline-toggle"
							class:active={selectedProgressDisciplines.includes(disc)}
							style={`--pill-accent: ${
								disc === 'DYN'
									? '#14b8a6'
									: disc === 'DNF'
										? '#38bdf8'
										: disc === 'DYNB'
											? '#fbbf24'
											: '#a78bfa'
							}`}
							onclick={() => {
								if (disc === 'STA') {
									if (selectedProgressDisciplines.includes('STA')) {
										selectedProgressDisciplines = selectedProgressDisciplines.filter(
											(item) => item !== 'STA'
										);
									} else {
										selectedProgressDisciplines = [...selectedProgressDisciplines, 'STA'];
									}
									progressMetric = 'time';
								} else if (selectedProgressDisciplines.includes(disc)) {
									const next = selectedProgressDisciplines.filter((item) => item !== disc);
									selectedProgressDisciplines =
										next.length > 0 ? next : [disc];
								} else {
									selectedProgressDisciplines = [...selectedProgressDisciplines, disc];
								}
							}}
						>
							{disc}
						</button>
					{/each}
				</div>
				<LineChart
					data={progressChartData}
					height={300}
					yTickFormatter={selectedProgressMetric() === 'time' ? formatTime : undefined}
					tooltipValueFormatter={selectedProgressMetric() === 'time' ? formatTime : undefined}
					seasonBands={progressSeasonBands}
				/>
			</div>

			<!-- Performance by Time of Day -->
			<TimeOfDayAnalysis
				logs={filteredLogs}
				discipline={timeOfDayDiscipline()}
				metric={['DYN', 'DNF', 'DYNB'].includes(timeOfDayDiscipline()) ? 'distance' : 'time'}
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

	.timeframe-select {
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

	.timeframe-select:focus {
		border-color: var(--color-primary);
	}

	.discipline-toggle-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	.metric-toggle-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.discipline-toggle {
		border: 1px solid rgba(148, 163, 184, 0.2);
		background: rgba(15, 23, 42, 0.4);
		color: var(--color-text);
		border-radius: 999px;
		padding: 0.35rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.discipline-toggle:hover {
		border-color: rgba(148, 163, 184, 0.35);
	}

	.discipline-toggle.active {
		border-color: color-mix(in srgb, var(--pill-accent), #ffffff 40%);
		background: color-mix(in srgb, var(--pill-accent), transparent 82%);
		color: #e0f2fe;
	}

	.metric-toggle {
		border: 1px solid rgba(148, 163, 184, 0.2);
		background: rgba(15, 23, 42, 0.4);
		color: var(--color-text);
		border-radius: 999px;
		padding: 0.35rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.metric-toggle:hover:not(:disabled) {
		border-color: rgba(148, 163, 184, 0.35);
	}

	.metric-toggle.active {
		border-color: rgba(56, 189, 248, 0.6);
		background: rgba(56, 189, 248, 0.18);
		color: #e0f2fe;
	}

	.metric-toggle:disabled {
		opacity: 0.45;
		cursor: not-allowed;
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

	@media (max-width: 640px) {
		.chart-card {
			padding: 1.1rem 1rem;
		}
	}
</style>
