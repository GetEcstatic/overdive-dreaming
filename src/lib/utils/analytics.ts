/**
 * Analytics utilities for aggregating and processing training data
 */

import type { RoutineLog, Discipline } from '$lib/types';
import { format, subMonths, subYears, isAfter } from 'date-fns';

export interface PersonalBest {
	discipline: Discipline;
	value: number;
	unit: 'meters' | 'seconds';
	date: Date;
	routineName?: string;
}

export interface TrainingSummary {
	totalSessions: number;
	totalDives: number;
	totalTime: number; // seconds
	avgPerWeek: number;
	avgRPE?: number;
	avgJoy?: number;
}

export interface ProgressDataPoint {
	date: string;
	value: number;
}

/**
 * Get logs within a timeframe
 */
export function filterLogsByTimeframe(
	logs: RoutineLog[],
	timeframe: '1month' | '6months' | '1year'
): RoutineLog[] {
	const now = new Date();
	let cutoffDate: Date;

	switch (timeframe) {
		case '1month':
			cutoffDate = subMonths(now, 1);
			break;
		case '6months':
			cutoffDate = subMonths(now, 6);
			break;
		case '1year':
			cutoffDate = subYears(now, 1);
			break;
	}

	return logs.filter((log) => isAfter(log.date.toDate(), cutoffDate));
}

/**
 * Calculate personal bests by discipline
 */
export function calculatePersonalBests(logs: RoutineLog[]): PersonalBest[] {
	const pbs: Record<string, PersonalBest> = {};

	for (const log of logs) {
		const discipline = log.disciplineUsed;

		// For dynamic disciplines (DYN, DNF, DYNB), use distance
		if (['DYN', 'DNF', 'DYNB'].includes(discipline) && log.totalDistance) {
			const key = `${discipline}-distance`;
			if (!pbs[key] || log.totalDistance > pbs[key].value) {
				pbs[key] = {
					discipline,
					value: log.totalDistance,
					unit: 'meters',
					date: log.date.toDate()
				};
			}
		}

		// For static (STA) or any discipline with time, use time
		if (log.totalTime) {
			const key = `${discipline}-time`;
			if (!pbs[key] || log.totalTime > pbs[key].value) {
				pbs[key] = {
					discipline,
					value: log.totalTime,
					unit: 'seconds',
					date: log.date.toDate()
				};
			}
		}
	}

	return Object.values(pbs);
}

/**
 * Calculate training summary stats
 */
export function calculateTrainingSummary(
	logs: RoutineLog[],
	timeframe: '1month' | '6months' | '1year'
): TrainingSummary {
	const filteredLogs = filterLogsByTimeframe(logs, timeframe);

	// Get unique sessions
	const uniqueSessions = new Set(filteredLogs.map((log) => log.sessionId));

	// Calculate weeks in timeframe
	const weeksInTimeframe = {
		'1month': 4,
		'6months': 26,
		'1year': 52
	}[timeframe];

	// Total time
	const totalTime = filteredLogs.reduce((sum, log) => sum + (log.totalTime || 0), 0);

	// Average RPE and Joy
	const logsWithRPE = filteredLogs.filter((log) => log.rpe !== undefined);
	const logsWithJoy = filteredLogs.filter((log) => log.joyScale !== undefined);

	const avgRPE =
		logsWithRPE.length > 0
			? logsWithRPE.reduce((sum, log) => sum + (log.rpe || 0), 0) / logsWithRPE.length
			: undefined;

	const avgJoy =
		logsWithJoy.length > 0
			? logsWithJoy.reduce((sum, log) => sum + (log.joyScale || 0), 0) / logsWithJoy.length
			: undefined;

	return {
		totalSessions: uniqueSessions.size,
		totalDives: filteredLogs.length,
		totalTime,
		avgPerWeek: uniqueSessions.size / weeksInTimeframe,
		avgRPE,
		avgJoy
	};
}

/**
 * Prepare progress data for chart
 * Groups logs by week and shows best performance each week
 */
export function prepareProgressData(
	logs: RoutineLog[],
	discipline: Discipline,
	metric: 'distance' | 'time'
): ProgressDataPoint[] {
	// Filter logs by discipline
	const disciplineLogs = logs.filter((log) => log.disciplineUsed === discipline);

	// Group by week
	const weeklyBests: Record<string, number> = {};

	for (const log of disciplineLogs) {
		const weekKey = format(log.date.toDate(), 'yyyy-MM-dd'); // Use daily for now, can group by week later

		const value =
			metric === 'distance' ? log.totalDistance || 0 : log.totalTime || 0;

		if (!weeklyBests[weekKey] || value > weeklyBests[weekKey]) {
			weeklyBests[weekKey] = value;
		}
	}

	// Convert to array and sort by date
	return Object.entries(weeklyBests)
		.map(([date, value]) => ({ date, value }))
		.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Aggregate training volume by week
 */
export interface VolumeDataPoint {
	week: string;
	byDiscipline: Partial<Record<Discipline, number>>;
}

export function aggregateVolumeByWeek(
	logs: RoutineLog[],
	metric: 'distance' | 'time'
): VolumeDataPoint[] {
	const weeklyData: Record<string, Partial<Record<Discipline, number>>> = {};

	for (const log of logs) {
		// Get week key (start of week)
		const weekStart = format(log.date.toDate(), 'yyyy-MM-dd');

		if (!weeklyData[weekStart]) {
			weeklyData[weekStart] = {};
		}

		const discipline = log.disciplineUsed;
		const value = metric === 'distance' ? (log.totalDistance || 0) : (log.totalTime || 0);

		if (!weeklyData[weekStart][discipline]) {
			weeklyData[weekStart][discipline] = 0;
		}

		weeklyData[weekStart][discipline]! += value;
	}

	// Convert to array and sort by week
	return Object.entries(weeklyData)
		.map(([week, byDiscipline]) => ({ week, byDiscipline }))
		.sort((a, b) => a.week.localeCompare(b.week));
}

/**
 * Time of day performance stats
 */
export interface TimeOfDayStats {
	morning: { avg: number; max: number; count: number };
	afternoon: { avg: number; max: number; count: number };
	evening: { avg: number; max: number; count: number };
}

export function aggregateByTimeOfDay(
	logs: RoutineLog[],
	discipline: Discipline,
	metric: 'distance' | 'time'
): TimeOfDayStats {
	const stats: TimeOfDayStats = {
		morning: { avg: 0, max: 0, count: 0 },
		afternoon: { avg: 0, max: 0, count: 0 },
		evening: { avg: 0, max: 0, count: 0 }
	};

	// Filter by discipline
	const disciplineLogs = logs.filter((log) => log.disciplineUsed === discipline);

	// Group by time of day
	const byTimeOfDay: Record<string, number[]> = {
		morning: [],
		afternoon: [],
		evening: []
	};

	for (const log of disciplineLogs) {
		const timeOfDay = log.timeOfDay;
		if (!timeOfDay) continue;

		const value = metric === 'distance' ? (log.totalDistance || 0) : (log.totalTime || 0);
		if (value > 0) {
			byTimeOfDay[timeOfDay].push(value);
		}
	}

	// Calculate stats for each time period
	for (const [period, values] of Object.entries(byTimeOfDay)) {
		if (values.length > 0) {
			const sum = values.reduce((a, b) => a + b, 0);
			const avg = sum / values.length;
			const max = Math.max(...values);

			stats[period as keyof TimeOfDayStats] = {
				avg,
				max,
				count: values.length
			};
		}
	}

	return stats;
}

/**
 * PB proximity calculation
 */
export interface PBProximityPoint {
	date: string;
	percentage: number;
	discipline: Discipline;
	value: number;
}

export function calculatePBProximity(
	logs: RoutineLog[],
	personalBests: Record<Discipline, number>
): PBProximityPoint[] {
	const proximityData: PBProximityPoint[] = [];

	for (const log of logs) {
		const discipline = log.disciplineUsed;
		const pb = personalBests[discipline];

		if (!pb) continue; // No PB for this discipline yet

		// Determine metric based on discipline
		const isDynamic = ['DYN', 'DNF', 'DYNB'].includes(discipline);
		const value = isDynamic ? (log.totalDistance || 0) : (log.totalTime || 0);

		if (value > 0) {
			const percentage = (value / pb) * 100;
			proximityData.push({
				date: format(log.date.toDate(), 'yyyy-MM-dd'),
				percentage,
				discipline,
				value
			});
		}
	}

	// Sort by date
	return proximityData.sort((a, b) => a.date.localeCompare(b.date));
}
