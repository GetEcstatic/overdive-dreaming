<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { user } from '$lib/stores/auth';
	import { db } from '$lib/firebase';
	import { collection, query, getDocs, where, orderBy } from 'firebase/firestore';
	import type { RoutineLog, Discipline, Season } from '$lib/types';
	import LineChart from '$lib/components/LineChart.svelte';
	import ScatterChart from '$lib/components/ScatterChart.svelte';
	import TimeOfDayAnalysis from '$lib/components/analytics/TimeOfDayAnalysis.svelte';
	import RPEZoneChart from '$lib/components/analytics/RPEZoneChart.svelte';
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
	import { format, intervalToDuration, type Duration } from 'date-fns';
	import { getUserSettings, getSeasonsForUser } from '$lib/firestore';
	import {
		buildAvgSpeedSeries,
		buildFastestLapScatter,
		buildSpeedVsDistance,
		buildPacingProfile
	} from '$lib/utils/dynamicAnalytics';

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
	const disciplineColorMap: Record<Discipline, { border: string; fill: string }> = {
		DYN: { border: '#14b8a6', fill: 'rgba(20, 184, 166, 0.12)' },
		DNF: { border: '#38bdf8', fill: 'rgba(56, 189, 248, 0.12)' },
		DYNB: { border: '#fbbf24', fill: 'rgba(251, 191, 36, 0.12)' },
		STA: { border: '#a78bfa', fill: 'rgba(167, 139, 250, 0.12)' }
	};
	let progressCompOnly = $state(false);

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
	// Only show max attempt routines in progress chart
	const MAX_ATTEMPT_ROUTINE_IDS = ['system-dynamic-max', 'system-static-max'];
	const progressLogs = $derived.by(() => {
		// First filter to only max attempt routines
		let logs = filteredLogs.filter((log) => MAX_ATTEMPT_ROUTINE_IDS.includes(log.routineId));
		// Then optionally filter to competition-only
		if (progressCompOnly) {
			logs = logs.filter((log) => log.isCompetition);
		}
		return logs;
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

	const breathingImpactDisciplines: Discipline[] = ['DYN', 'DNF', 'DYNB', 'STA'];
	let breathingImpactSelection = $state<Discipline[]>(['DYN', 'DNF', 'DYNB']);

	// Dynamic analytics — speed-focused charts for DYN/DYNB/DNF
	const dynamicAvgSpeedChart = $derived(buildAvgSpeedSeries(filteredLogs));
	const dynamicFastestLapChart = $derived(buildFastestLapScatter(filteredLogs));
	const dynamicSpeedVsDistanceChart = $derived(buildSpeedVsDistance(filteredLogs));
	const dynamicPacingProfileChart = $derived(buildPacingProfile(filteredLogs, 10));

	const breathingImpactData = $derived.by(() => {
		const hasDynamic = breathingImpactSelection.some((disc) =>
			dynamicDisciplines.includes(disc)
		);
		const hasSta = breathingImpactSelection.includes('STA');
		const useSecondaryAxis = hasDynamic && hasSta;

		const datasets = breathingImpactSelection.map((disc) => {
			const points = filteredLogs
				.filter((log) => log.disciplineUsed === disc && log.breathingTechniqueLevel !== undefined)
				.map((log) => {
					if (disc === 'STA') {
						if (log.totalTime === undefined) return null;
						return {
							x: log.totalTime,
							y: log.breathingTechniqueLevel,
							meta: { unit: 'time', axis: useSecondaryAxis ? 'x2' : 'x' }
						};
					}
					if (log.totalDistance === undefined) return null;
					return {
						x: log.totalDistance,
						y: log.breathingTechniqueLevel,
						meta: { unit: 'distance', axis: 'x' }
					};
				})
				.filter(Boolean);

			return {
				label: disc,
				data: points,
				xAxisID: disc === 'STA' && useSecondaryAxis ? 'x2' : 'x',
				borderColor: disciplineColorMap[disc].border,
				backgroundColor: disciplineColorMap[disc].fill,
				pointRadius: 4,
				pointHoverRadius: 6
			};
		});

		const hasData = datasets.some((dataset) => dataset.data.length > 0);

		return {
			datasets,
			hasData,
			hasDynamic,
			hasSta,
			useSecondaryAxis
		};
	});

	const breathingImpactChartData = $derived.by(() => ({
		datasets: breathingImpactData.datasets
	}));

	const formatBreathingLevel = (value: number) => (value > 0 ? `+${value}` : `${value}`);
	const formatBreathingTooltip = (context: any) => {
		const raw = context.raw as { x: number; y: number; meta?: { unit?: string } };
		const unit = raw?.meta?.unit;
		const xLabel = unit === 'time' ? formatTime(raw.x) : `${raw.x}m`;
		return `${context.dataset.label}: ${xLabel} · Level ${formatBreathingLevel(raw.y)}`;
	};

	const timeToPbStats = $derived.by(() => {
		const stats: Record<Discipline, Duration | null> = {
			DYN: null,
			DNF: null,
			DYNB: null,
			STA: null
		};
		const now = new Date();

		for (const disc of disciplines) {
			const logs = allLogs.filter((log) => log.disciplineUsed === disc);
			const metricValues = logs
				.map((log) => {
					if (disc === 'STA') return log.totalTime;
					return log.totalDistance;
				})
				.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
			if (metricValues.length === 0) {
				stats[disc] = null;
				continue;
			}
			const maxValue = Math.max(...metricValues);
			const pbLog = logs
				.filter((log) => {
					const value = disc === 'STA' ? log.totalTime : log.totalDistance;
					return value === maxValue;
				})
				.sort((a, b) => b.date.toMillis() - a.date.toMillis())[0];
			if (!pbLog) {
				stats[disc] = null;
				continue;
			}
			stats[disc] = intervalToDuration({
				start: pbLog.date.toDate(),
				end: now
			});
		}

		return stats;
	});

	const formatTimeToPb = (duration: Duration | null) => {
		if (!duration) return '—';
		const parts = [];
		if (duration.years) parts.push(`${duration.years}y`);
		if (duration.months) parts.push(`${duration.months}m`);
		if (duration.days || parts.length === 0) parts.push(`${duration.days ?? 0}d`);
		return parts.join(' ');
	};

	const progressChartData = $derived.by((): {
		labels: string[];
		datasets: any[];
		labelDates: string[];
	} => {
		const activeDynamics = activeDynamicDisciplines();
		const activeDisciplines: Discipline[] =
			selectedProgressDisciplines.length > 0
				? selectedProgressDisciplines
				: ['DYN'];
		const series = activeDisciplines.map((disc) => ({
			disc,
			data: prepareProgressData(progressLogs, disc, selectedProgressMetric())
		}));

		const labelDates = Array.from(
			new Set(series.flatMap((entry) => entry.data.map((point) => point.date)))
		).sort((a, b) => a.localeCompare(b));

		const datasets = series.map((entry) => {
			const lookup = new Map(entry.data.map((point) => [point.date, point.value]));
			return {
				label: entry.disc,
				data: labelDates.map((date) => lookup.get(date) ?? null),
				borderColor: disciplineColorMap[entry.disc].border,
				backgroundColor: disciplineColorMap[entry.disc].fill,
				tension: 0.3,
				fill: false,
				spanGaps: true
			};
		});

		if (series.length === 1) {
			const values = datasets[0].data as Array<number | null>;
			const points = values
				.map((value, index) => (value === null ? null : { x: index, y: value }))
				.filter(Boolean) as Array<{ x: number; y: number }>;

			if (points.length >= 2) {
				const sumX = points.reduce((acc, point) => acc + point.x, 0);
				const sumY = points.reduce((acc, point) => acc + point.y, 0);
				const sumXY = points.reduce((acc, point) => acc + point.x * point.y, 0);
				const sumXX = points.reduce((acc, point) => acc + point.x * point.x, 0);
				const n = points.length;
				const denominator = n * sumXX - sumX * sumX;
				const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
				const intercept = n !== 0 ? (sumY - slope * sumX) / n : 0;

				const trendData = values.map((value, index) =>
					value === null ? null : slope * index + intercept
				);

				datasets.push({
					label: `${series[0].disc} Trend`,
					data: trendData,
					borderColor: disciplineColorMap[series[0].disc].border,
					borderDash: [6, 6],
					borderWidth: 2,
					pointRadius: 0,
					fill: false,
					tension: 0
				} as any);
			}
		}

		return {
			labels: labelDates.map((date) => format(new Date(date), 'MMM d, yyyy')),
			labelDates,
			datasets
		};
	});

	const progressSeasonBands = $derived.by(() => {
		if (filterKey !== 'tf:all' || seasons.length === 0) return [];
		const labelDates = progressChartData.labelDates;
		if (labelDates.length === 0) return [];

		return seasons
			.map((season) => {
				const startKey = format(season.startDate.toDate(), 'yyyy-MM-dd');
				const endKey = format(season.endDate?.toDate() ?? new Date(), 'yyyy-MM-dd');
				let startIndex: number | null = null;
				let endIndex: number | null = null;

				labelDates.forEach((dateKey, index) => {
					if (dateKey >= startKey && dateKey <= endKey) {
						if (startIndex === null) startIndex = index;
						endIndex = index;
					}
				});

				if (startIndex === null || endIndex === null) return null;
				return {
					label: season.name,
					startIndex,
					endIndex,
					color: 'rgba(20, 184, 166, 0.08)',
					startLabel: format(season.startDate.toDate(), 'MMM d, yyyy'),
					endLabel: format((season.endDate?.toDate() ?? new Date()), 'MMM d, yyyy')
				};
			})
			.filter((band): band is NonNullable<typeof band> => band !== null);
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

				<!-- Sessions Since Last PB -->
				<div class="stat-card">
					<h2>Time-to-PB Tracker</h2>
					<div class="stat-list">
						{#each disciplines as disc}
							<div class="stat-item">
								<span class="stat-label">{disc} Since PB</span>
								<span class="stat-value">{formatTimeToPb(timeToPbStats[disc])}</span>
							</div>
						{/each}
					</div>
				</div>
			</div>

			<!-- Progress Over Time Chart -->
			<div class="chart-card">
				<div class="chart-header">
					<h2>Max Dive Progress</h2>
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
					<button
						type="button"
						class="discipline-toggle"
						class:active={progressCompOnly}
						style="--pill-accent: #f97316"
						onclick={() => (progressCompOnly = !progressCompOnly)}
					>
						Comp
					</button>
				</div>
				<LineChart
					data={progressChartData}
					height={300}
					yTickFormatter={selectedProgressMetric() === 'time' ? formatTime : undefined}
					tooltipValueFormatter={selectedProgressMetric() === 'time' ? formatTime : undefined}
					seasonBands={progressSeasonBands}
				/>
			</div>

			<!-- Breathing Impact -->
			<div class="chart-card">
				<div class="chart-header breathing-impact-header">
					<h2>Breathing Impact</h2>
					<div class="discipline-toggle-row">
						{#each breathingImpactDisciplines as disc}
							<button
								type="button"
								class="discipline-toggle"
								class:active={breathingImpactSelection.includes(disc)}
								style={`--pill-accent: ${disciplineColorMap[disc].border}`}
								onclick={() => {
									if (breathingImpactSelection.includes(disc)) {
										const next = breathingImpactSelection.filter((item) => item !== disc);
										breathingImpactSelection = next.length > 0 ? next : [disc];
									} else {
										breathingImpactSelection = [...breathingImpactSelection, disc];
									}
								}}
							>
								{disc}
							</button>
						{/each}
					</div>
				</div>
				{#if !breathingImpactData.hasData}
					<div class="stat-list">
						<div class="stat-item">
							<span class="stat-label">No breathing data yet</span>
							<span class="stat-value">—</span>
						</div>
					</div>
				{:else}
					<ScatterChart
						data={breathingImpactChartData}
						height={300}
						xTickFormatter={
							breathingImpactData.hasSta && !breathingImpactData.hasDynamic ? formatTime : undefined
						}
						xSecondaryTickFormatter={formatTime}
						yTickFormatter={formatBreathingLevel}
						yStepSize={1}
						tooltipFormatter={formatBreathingTooltip}
						showLegend={false}
						yMin={-3}
						yMax={3.5}
						showSecondaryX={breathingImpactData.useSecondaryAxis}
						xTitle={breathingImpactData.hasDynamic ? 'Distance (m)' : 'Time (mm:ss)'}
						xSecondaryTitle={breathingImpactData.useSecondaryAxis ? 'Time (mm:ss)' : undefined}
						yTitle="Breathing Level"
					/>
				{/if}
			</div>

			<!-- Training Intensity by RPE Zone -->
			<RPEZoneChart logs={filteredLogs} />

			<!-- Dynamic Training (Speed) -->
			<div class="chart-card">
				<div class="chart-header">
					<h2>Dynamic — Avg Speed Over Time</h2>
				</div>
				{#if !dynamicAvgSpeedChart.hasData}
					<div class="stat-list">
						<div class="stat-item">
							<span class="stat-label">No dynamic speed data yet</span>
							<span class="stat-value">—</span>
						</div>
					</div>
				{:else}
					<LineChart
						data={dynamicAvgSpeedChart}
						height={280}
						tooltipValueFormatter={(v) => `${v.toFixed(2)} m/s`}
					/>
				{/if}
			</div>

			<div class="chart-card">
				<div class="chart-header">
					<h2>Dynamic — Fastest Lap Speed</h2>
				</div>
				{#if !dynamicFastestLapChart.hasData}
					<div class="stat-list">
						<div class="stat-item">
							<span class="stat-label">No per-lap data yet</span>
							<span class="stat-value">—</span>
						</div>
					</div>
				{:else}
					<ScatterChart
						data={dynamicFastestLapChart}
						height={280}
						yTickFormatter={(v) => `${v.toFixed(2)}`}
						xTickFormatter={(v) => new Date(v).toLocaleDateString()}
						yTitle="Speed (m/s)"
						xTitle="Date"
					/>
				{/if}
			</div>

			<div class="chart-card">
				<div class="chart-header">
					<h2>Dynamic — Pacing Profile (last 10 dives)</h2>
				</div>
				{#if !dynamicPacingProfileChart.hasData}
					<div class="stat-list">
						<div class="stat-item">
							<span class="stat-label">No per-lap splits yet</span>
							<span class="stat-value">—</span>
						</div>
					</div>
				{:else}
					<LineChart
						data={dynamicPacingProfileChart}
						height={280}
						tooltipValueFormatter={(v) => `${v.toFixed(2)} m/s`}
					/>
				{/if}
			</div>

			<div class="chart-card">
				<div class="chart-header">
					<h2>Dynamic — Speed vs Distance</h2>
				</div>
				{#if !dynamicSpeedVsDistanceChart.hasData}
					<div class="stat-list">
						<div class="stat-item">
							<span class="stat-label">Need avg speed + distance on at least one dive</span>
							<span class="stat-value">—</span>
						</div>
					</div>
				{:else}
					<ScatterChart
						data={dynamicSpeedVsDistanceChart}
						height={280}
						xTitle="Distance (m)"
						yTitle="Avg Speed (m/s)"
						yTickFormatter={(v) => `${v.toFixed(2)}`}
					/>
				{/if}
			</div>

			<!-- Performance by Time of Day -->
	<TimeOfDayAnalysis logs={filteredLogs} />
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

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin-bottom: 1rem;
	}

	.card-header h2 {
		margin-bottom: 0;
	}

	.card-header .metric-toggle-row {
		margin-top: 0;
	}

	.breathing-impact-header {
		margin-bottom: 1.5rem;
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
