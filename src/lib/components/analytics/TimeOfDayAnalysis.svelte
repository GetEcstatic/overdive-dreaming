<script lang="ts">
	import type { RoutineLog, Discipline } from '$lib/types';
	import { aggregateByTimeOfDay } from '$lib/utils/analytics';
	import { formatTime } from '$lib/utils/time';

	let {
		logs
	}: { logs: RoutineLog[] } = $props();

	const disciplines: Discipline[] = ['DYN', 'DNF', 'DYNB', 'STA'];
	let selectedDiscipline = $state<Discipline>('DYN');
	const disciplineColorMap: Record<Discipline, { border: string; fill: string }> = {
		DYN: { border: '#14b8a6', fill: 'rgba(20, 184, 166, 0.12)' },
		DNF: { border: '#38bdf8', fill: 'rgba(56, 189, 248, 0.12)' },
		DYNB: { border: '#fbbf24', fill: 'rgba(251, 191, 36, 0.12)' },
		STA: { border: '#a78bfa', fill: 'rgba(167, 139, 250, 0.12)' }
	};

	const metric = $derived(selectedDiscipline === 'STA' ? 'time' : 'distance');

	const timeOfDayStats = $derived(aggregateByTimeOfDay(logs, selectedDiscipline, metric));

	const hasSufficientData = $derived(
		timeOfDayStats.morning.count > 0 ||
		timeOfDayStats.afternoon.count > 0 ||
		timeOfDayStats.evening.count > 0
	);

	const bestPeriod = $derived.by(() => {
		const periods = [
			{ name: 'Morning', avg: timeOfDayStats.morning.avg },
			{ name: 'Afternoon', avg: timeOfDayStats.afternoon.avg },
			{ name: 'Evening', avg: timeOfDayStats.evening.avg }
		];

		return periods.reduce((best, current) =>
			current.avg > best.avg ? current : best
		);
	});

	const formatValue = (value: number) => {
		if (metric === 'distance') {
			return `${Math.round(value)}m`;
		} else {
			return formatTime(value);
		}
	};

	const getBarHeight = (avg: number, maxAvg: number) => {
		if (maxAvg === 0) return 0;
		return (avg / maxAvg) * 100;
	};

	const maxAvg = $derived(
		Math.max(
			timeOfDayStats.morning.avg,
			timeOfDayStats.afternoon.avg,
			timeOfDayStats.evening.avg
		)
	);
</script>

<div class="time-of-day-analysis">
	<div class="header">
		<h3 class="title">Performance by Time of Day</h3>
		<div class="discipline-toggle-row">
			{#each disciplines as disc}
				<button
					type="button"
					class="discipline-toggle"
					class:active={selectedDiscipline === disc}
					style={`--pill-accent: ${disciplineColorMap[disc].border}`}
					onclick={() => (selectedDiscipline = disc)}
				>
					{disc}
				</button>
			{/each}
		</div>
	</div>

	{#if !hasSufficientData}
		<div class="empty-state">
			<p>Log sessions at different times of day to see patterns</p>
		</div>
	{:else}
		<div class="insight-text">
			You perform best in <strong>{bestPeriod.name}</strong> sessions
		</div>

		<div class="bars-container">
			<!-- Morning -->
			<div class="time-period">
				<div class="bar-wrapper">
					<div
						class="bar morning"
						style="height: {getBarHeight(timeOfDayStats.morning.avg, maxAvg)}%"
					></div>
				</div>
				<div class="stats">
					<div class="stat-value">{formatValue(timeOfDayStats.morning.avg)}</div>
					<div class="stat-label">Morning</div>
					<div class="stat-count">{timeOfDayStats.morning.count} sessions</div>
				</div>
			</div>

			<!-- Afternoon -->
			<div class="time-period">
				<div class="bar-wrapper">
					<div
						class="bar afternoon"
						style="height: {getBarHeight(timeOfDayStats.afternoon.avg, maxAvg)}%"
					></div>
				</div>
				<div class="stats">
					<div class="stat-value">{formatValue(timeOfDayStats.afternoon.avg)}</div>
					<div class="stat-label">Afternoon</div>
					<div class="stat-count">{timeOfDayStats.afternoon.count} sessions</div>
				</div>
			</div>

			<!-- Evening -->
			<div class="time-period">
				<div class="bar-wrapper">
					<div
						class="bar evening"
						style="height: {getBarHeight(timeOfDayStats.evening.avg, maxAvg)}%"
					></div>
				</div>
				<div class="stats">
					<div class="stat-value">{formatValue(timeOfDayStats.evening.avg)}</div>
					<div class="stat-label">Evening</div>
					<div class="stat-count">{timeOfDayStats.evening.count} sessions</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.time-of-day-analysis {
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.1);
		border-radius: 12px;
		padding: 1.5rem;
		margin-bottom: 1.5rem;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.title {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.discipline-toggle-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
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

	.insight-text {
		color: var(--color-text-muted);
		font-size: 0.875rem;
		margin-bottom: 1.5rem;
	}

	.insight-text strong {
		color: var(--color-primary);
		font-weight: 600;
	}

	.bars-container {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1.5rem;
		margin-top: 2rem;
	}

	.time-period {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.bar-wrapper {
		width: 100%;
		height: 200px;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding: 0.5rem;
		background: rgba(15, 23, 42, 0.3);
		border-radius: 8px;
		margin-bottom: 1rem;
	}

	.bar {
		width: 60%;
		min-height: 4px;
		border-radius: 4px 4px 0 0;
		transition: height 0.3s ease;
	}

	.bar.morning {
		background: linear-gradient(to top, #f59e0b, #fbbf24);
	}

	.bar.afternoon {
		background: linear-gradient(to top, #14b8a6, #10b981);
	}

	.bar.evening {
		background: linear-gradient(to top, #6366f1, #8b5cf6);
	}

	.stats {
		text-align: center;
	}

	.stat-value {
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--color-text);
		margin-bottom: 0.25rem;
	}

	.stat-label {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: 0.25rem;
	}

	.stat-count {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.empty-state {
		text-align: center;
		padding: 3rem 1rem;
		color: var(--color-text-muted);
	}

	@media (max-width: 640px) {
		.bars-container {
			gap: 1rem;
		}

		.bar-wrapper {
			height: 150px;
		}

		.stat-value {
			font-size: 1rem;
		}
	}
</style>
