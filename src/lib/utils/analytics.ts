/**
 * Analytics utilities for aggregating and processing training data
 */

import type { RoutineLog, Discipline } from '$lib/types';
import { format, subMonths, subYears, isAfter, differenceInDays, isBefore } from 'date-fns';

export type Timeframe = '1month' | '6months' | '1year' | 'all';

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

interface SessionStats {
	totalSessions: number;
	byDiscipline: Record<Discipline, number>;
}

interface CompetitionStats {
	competitionCount: number;
	recordCount: number;
	recordByDiscipline: Record<Discipline, number>;
}

function getSessionKey(log: RoutineLog): string {
	return log.sessionGroup || log.date.toDate().toDateString();
}

function getCutoffDate(timeframe: Exclude<Timeframe, 'all'>): Date {
	const now = new Date();

	switch (timeframe) {
		case '1month':
			return subMonths(now, 1);
		case '6months':
			return subMonths(now, 6);
		case '1year':
			return subYears(now, 1);
	}
}

/**
 * Get logs within a timeframe
 */
export function filterLogsByTimeframe(
	logs: RoutineLog[],
	timeframe: Timeframe
): RoutineLog[] {
	if (timeframe === 'all') {
		return logs;
	}

	const cutoffDate = getCutoffDate(timeframe);
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
	timeframe: Timeframe
): TrainingSummary {
	const filteredLogs = filterLogsByTimeframe(logs, timeframe);

	// Get unique sessions (prefer sessionGroup, fallback to date bucket)
	const uniqueSessions = new Set(filteredLogs.map((log) => getSessionKey(log)));

	// Calculate weeks in timeframe
	let weeksInTimeframe = {
		'1month': 4,
		'6months': 26,
		'1year': 52,
		'all': 52
	}[timeframe];

	if (timeframe === 'all' && filteredLogs.length > 0) {
		const dates = filteredLogs.map((log) => log.date.toDate().getTime());
		const earliest = new Date(Math.min(...dates));
		const days = Math.max(1, differenceInDays(new Date(), earliest));
		weeksInTimeframe = Math.max(1, days / 7);
	}

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

export function calculateTrainingSummaryForRange(
	logs: RoutineLog[],
	startDate: Date,
	endDate?: Date
): TrainingSummary {
	const end = endDate ?? new Date();
	const filteredLogs = filterLogsByDateRange(logs, startDate, end);
	const uniqueSessions = new Set(filteredLogs.map((log) => getSessionKey(log)));
	const days = Math.max(1, differenceInDays(end, startDate));
	const weeksInRange = Math.max(1, days / 7);
	const totalTime = filteredLogs.reduce((sum, log) => sum + (log.totalTime || 0), 0);

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
		avgPerWeek: uniqueSessions.size / weeksInRange,
		avgRPE,
		avgJoy
	};
}

/**
 * Calculate pool session stats for a timeframe
 */
export function calculatePoolSessionStats(
	logs: RoutineLog[],
	timeframe: Timeframe
): SessionStats {
	const filteredLogs = filterLogsByTimeframe(logs, timeframe);
	const sessions = new Set<string>();
	const byDiscipline: Record<Discipline, Set<string>> = {
		DYN: new Set(),
		DNF: new Set(),
		DYNB: new Set(),
		STA: new Set()
	};

	for (const log of filteredLogs) {
		const key = getSessionKey(log);
		sessions.add(key);
		byDiscipline[log.disciplineUsed]?.add(key);
	}

	const counts: Record<Discipline, number> = {
		DYN: byDiscipline.DYN.size,
		DNF: byDiscipline.DNF.size,
		DYNB: byDiscipline.DYNB.size,
		STA: byDiscipline.STA.size
	};

	return {
		totalSessions: sessions.size,
		byDiscipline: counts
	};
}

export function calculatePoolSessionStatsForRange(
	logs: RoutineLog[],
	startDate: Date,
	endDate?: Date
): SessionStats {
	const filteredLogs = filterLogsByDateRange(logs, startDate, endDate);
	const sessions = new Set<string>();
	const byDiscipline: Record<Discipline, Set<string>> = {
		DYN: new Set(),
		DNF: new Set(),
		DYNB: new Set(),
		STA: new Set()
	};

	for (const log of filteredLogs) {
		const key = getSessionKey(log);
		sessions.add(key);
		byDiscipline[log.disciplineUsed]?.add(key);
	}

	const counts: Record<Discipline, number> = {
		DYN: byDiscipline.DYN.size,
		DNF: byDiscipline.DNF.size,
		DYNB: byDiscipline.DYNB.size,
		STA: byDiscipline.STA.size
	};

	return {
		totalSessions: sessions.size,
		byDiscipline: counts
	};
}

/**
 * Calculate competition and record stats for a timeframe
 */
export function calculateCompetitionStats(
	logs: RoutineLog[],
	timeframe: Timeframe
): CompetitionStats {
	const filteredLogs = filterLogsByTimeframe(logs, timeframe);
	let competitionCount = 0;
	let recordCount = 0;
	const recordByDiscipline: Record<Discipline, number> = {
		DYN: 0,
		DNF: 0,
		DYNB: 0,
		STA: 0
	};

	for (const log of filteredLogs) {
		if (log.isCompetition) {
			competitionCount += 1;
		}

		if (log.recordTag) {
			recordCount += 1;
			recordByDiscipline[log.disciplineUsed] += 1;
		}
	}

	return {
		competitionCount,
		recordCount,
		recordByDiscipline
	};
}

export function calculateCompetitionStatsForRange(
	logs: RoutineLog[],
	startDate: Date,
	endDate?: Date
): CompetitionStats {
	const filteredLogs = filterLogsByDateRange(logs, startDate, endDate);
	let competitionCount = 0;
	let recordCount = 0;
	const recordByDiscipline: Record<Discipline, number> = {
		DYN: 0,
		DNF: 0,
		DYNB: 0,
		STA: 0
	};

	for (const log of filteredLogs) {
		if (log.isCompetition) {
			competitionCount += 1;
		}

		if (log.recordTag) {
			recordCount += 1;
			recordByDiscipline[log.disciplineUsed] += 1;
		}
	}

	return {
		competitionCount,
		recordCount,
		recordByDiscipline
	};
}

export function filterLogsByDateRange(
	logs: RoutineLog[],
	startDate: Date,
	endDate?: Date
): RoutineLog[] {
	const end = endDate ?? new Date();
	return logs.filter((log) => {
		const logDate = log.date.toDate();
		return !isBefore(logDate, startDate) && !isAfter(logDate, end);
	});
}

export function getTimeframeStartDate(timeframe: Exclude<Timeframe, 'all'>): Date {
	return getCutoffDate(timeframe);
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

// ============================================================================
// RPE Zone Analysis
// ============================================================================

/**
 * RPE Zone definitions for freediving training analysis
 * Philosophy: ~80% of training should be in RPE 3-6 (Easy + Moderate = "freediving zone 2")
 */
export type RPEZone = 'veryEasy' | 'easy' | 'moderate' | 'hard' | 'veryHard';

export interface RPEZoneConfig {
	zone: RPEZone;
	label: string;
	rpeRange: [number, number]; // inclusive
	color: string;
	bgColor: string;
}

export const RPE_ZONES: RPEZoneConfig[] = [
	{ zone: 'veryEasy', label: 'Very Easy (RPE 1-2)', rpeRange: [1, 2], color: '#10b981', bgColor: 'rgba(16, 185, 129, 0.7)' },
	{ zone: 'easy', label: 'Easy (RPE 3-4)', rpeRange: [3, 4], color: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.7)' },
	{ zone: 'moderate', label: 'Moderate (RPE 5-6)', rpeRange: [5, 6], color: '#eab308', bgColor: 'rgba(234, 179, 8, 0.7)' },
	{ zone: 'hard', label: 'Hard (RPE 7-8)', rpeRange: [7, 8], color: '#f97316', bgColor: 'rgba(249, 115, 22, 0.7)' },
	{ zone: 'veryHard', label: 'Very Hard (RPE 9-10)', rpeRange: [9, 10], color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.7)' }
];

/**
 * Get RPE zone from a numeric RPE value
 */
export function getRPEZone(rpe: number): RPEZone {
	if (rpe <= 2) return 'veryEasy';
	if (rpe <= 4) return 'easy';
	if (rpe <= 6) return 'moderate';
	if (rpe <= 8) return 'hard';
	return 'veryHard';
}

export interface VolumeByRPEZoneDataPoint {
	week: string;
	byZone: Record<RPEZone, number>;
	total: number;
}

/**
 * Aggregate training volume by week and RPE zone
 * @param logs - Array of routine logs
 * @param metric - 'distance' (meters) or 'time' (seconds)
 * @returns Weekly data with volume split by RPE zone
 */
export function aggregateVolumeByRPEZone(
	logs: RoutineLog[],
	metric: 'distance' | 'time'
): VolumeByRPEZoneDataPoint[] {
	const weeklyData: Record<string, Record<RPEZone, number>> = {};

	for (const log of logs) {
		// Skip logs without RPE data
		if (log.rpe === undefined || log.rpe === null) continue;

		// Get week start (Monday-based for consistency)
		const logDate = log.date.toDate();
		const dayOfWeek = logDate.getDay();
		const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
		const weekStart = new Date(logDate);
		weekStart.setDate(logDate.getDate() + mondayOffset);
		const weekKey = format(weekStart, 'yyyy-MM-dd');

		if (!weeklyData[weekKey]) {
			weeklyData[weekKey] = { veryEasy: 0, easy: 0, moderate: 0, hard: 0, veryHard: 0 };
		}

		const zone = getRPEZone(log.rpe);
		const value = metric === 'distance' 
			? (log.totalDistance || 0) 
			: (log.totalTime || 0);

		weeklyData[weekKey][zone] += value;
	}

	// Convert to sorted array
	return Object.entries(weeklyData)
		.map(([week, byZone]) => ({
			week,
			byZone,
			total: byZone.veryEasy + byZone.easy + byZone.moderate + byZone.hard + byZone.veryHard
		}))
		.sort((a, b) => a.week.localeCompare(b.week));
}

/**
 * RPE zone distribution with balance analysis
 */
export interface RPEZoneDistribution {
	veryEasy: { volume: number; percentage: number };
	easy: { volume: number; percentage: number };
	moderate: { volume: number; percentage: number };
	hard: { volume: number; percentage: number };
	veryHard: { volume: number; percentage: number };
	// Combined "freediving zone 2" (Easy + Moderate, RPE 3-6)
	freedivingZone2: { volume: number; percentage: number };
	isBalanced: boolean;
	balanceMessage: string;
	logsWithRPE: number;
	logsWithoutRPE: number;
}

/**
 * Calculate overall RPE zone distribution percentages
 */
export function calculateRPEZoneDistribution(
	logs: RoutineLog[],
	metric: 'distance' | 'time'
): RPEZoneDistribution {
	const totals: Record<RPEZone, number> = { veryEasy: 0, easy: 0, moderate: 0, hard: 0, veryHard: 0 };
	let logsWithRPE = 0;
	let logsWithoutRPE = 0;

	for (const log of logs) {
		if (log.rpe === undefined || log.rpe === null) {
			logsWithoutRPE++;
			continue;
		}
		logsWithRPE++;
		const zone = getRPEZone(log.rpe);
		const value = metric === 'distance' ? (log.totalDistance || 0) : (log.totalTime || 0);
		totals[zone] += value;
	}

	const total = totals.veryEasy + totals.easy + totals.moderate + totals.hard + totals.veryHard;
	
	// "Freediving zone 2" = Easy + Moderate (RPE 3-6)
	const freediverZone2Volume = totals.easy + totals.moderate;
	
	const distribution: RPEZoneDistribution = {
		veryEasy: {
			volume: totals.veryEasy,
			percentage: total > 0 ? (totals.veryEasy / total) * 100 : 0
		},
		easy: {
			volume: totals.easy,
			percentage: total > 0 ? (totals.easy / total) * 100 : 0
		},
		moderate: {
			volume: totals.moderate,
			percentage: total > 0 ? (totals.moderate / total) * 100 : 0
		},
		hard: {
			volume: totals.hard,
			percentage: total > 0 ? (totals.hard / total) * 100 : 0
		},
		veryHard: {
			volume: totals.veryHard,
			percentage: total > 0 ? (totals.veryHard / total) * 100 : 0
		},
		freedivingZone2: {
			volume: freediverZone2Volume,
			percentage: total > 0 ? (freediverZone2Volume / total) * 100 : 0
		},
		isBalanced: false,
		balanceMessage: '',
		logsWithRPE,
		logsWithoutRPE
	};

	// Determine balance status: ~80% should be in RPE 3-6 (Easy + Moderate = "Freediving Zone 2")
	const zone2Pct = distribution.freedivingZone2.percentage;
	const highIntensityPct = distribution.hard.percentage + distribution.veryHard.percentage;

	if (total === 0) {
		distribution.balanceMessage = 'No volume data available';
	} else if (zone2Pct >= 75 && highIntensityPct <= 25) {
		distribution.isBalanced = true;
		distribution.balanceMessage = '✓ Great balance! ~80% in freediving zone 2 (RPE 3-6)';
	} else if (zone2Pct >= 70) {
		distribution.isBalanced = true;
		distribution.balanceMessage = '✓ Good balance — majority in optimal zone';
	} else if (highIntensityPct > 30) {
		distribution.balanceMessage = '⚠️ Too much high intensity — add more Easy/Moderate sessions';
	} else if (zone2Pct < 60) {
		distribution.balanceMessage = '⚠️ Aim for ~80% in RPE 3-6 for optimal adaptation';
	} else {
		distribution.isBalanced = true;
		distribution.balanceMessage = '✓ Reasonable balance';
	}

	return distribution;
}
