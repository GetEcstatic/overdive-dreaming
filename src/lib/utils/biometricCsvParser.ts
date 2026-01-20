/**
 * Biometric CSV Parser
 * Parses pulse oximeter CSV exports (e.g., from Oximeter app)
 * for RV Breath Hold Series and other dry static breath hold training.
 * 
 * CSV Format:
 * - Line 1: sep=,
 * - Line 2: Routine name, timestamp (DD/MM/YYYY HH:mm:ss)
 * - Lines 3-4: "Rounds,," header
 * - Lines 5-16ish: ROUND N, Recovery time (MM:SS), Apnea time (MM:SS)
 * - After COOLDOWN: "Biometrics,,"
 * - Biometric header: Time,Interval Time,Interval Type,HR,SpO2
 * - Data rows: HH:MM,MM:SS,Rest|Apnea,HR,SpO2
 */

import type {
	BiometricReading,
	BiometricRoundSummary,
	ParsedBiometricSession,
	ProcessedRepBiometrics,
	LapData
} from '$lib/types';

/**
 * Parse MM:SS time format to seconds
 */
function parseTimeToSeconds(timeStr: string): number {
	if (!timeStr || timeStr === '--:--') return 0;
	const parts = timeStr.split(':').map(Number);
	if (parts.length === 2) {
		const [minutes, seconds] = parts;
		return minutes * 60 + seconds;
	}
	if (parts.length === 3) {
		const [hours, minutes, seconds] = parts;
		return hours * 3600 + minutes * 60 + seconds;
	}
	return 0;
}

/**
 * Parse date string in DD/MM/YYYY HH:mm:ss format
 */
function parseTimestamp(dateStr: string): Date {
	// Format: DD/MM/YYYY HH:mm:ss
	const [datePart, timePart] = dateStr.split(' ');
	const [day, month, year] = datePart.split('/').map(Number);
	const [hours, minutes, seconds] = timePart.split(':').map(Number);
	return new Date(year, month - 1, day, hours, minutes, seconds);
}

/**
 * Parse the round summaries from CSV header section
 */
function parseRoundSummaries(lines: string[]): BiometricRoundSummary[] {
	const rounds: BiometricRoundSummary[] = [];
	
	for (const line of lines) {
		const parts = line.split(',');
		if (parts[0]?.startsWith('ROUND ')) {
			const roundNum = parseInt(parts[0].replace('ROUND ', ''), 10);
			const recoveryTime = parseTimeToSeconds(parts[1]);
			const apneaTime = parseTimeToSeconds(parts[2]);
			rounds.push({
				roundNumber: roundNum,
				recoveryTime,
				apneaTime
			});
		}
	}
	
	return rounds;
}

/**
 * Parse the biometric readings from CSV data section
 */
function parseBiometricReadings(lines: string[]): BiometricReading[] {
	const readings: BiometricReading[] = [];
	let inBiometrics = false;
	
	for (const line of lines) {
		// Detect start of biometrics section
		if (line.startsWith('Time,Interval')) {
			inBiometrics = true;
			continue;
		}
		
		if (!inBiometrics) continue;
		
		const parts = line.split(',');
		if (parts.length < 5) continue;
		
		const [time, intervalTime, intervalType, hrStr, spo2Str] = parts;
		
		// Skip header or empty rows
		if (intervalType !== 'Rest' && intervalType !== 'Apnea') continue;
		
		const hr = parseInt(hrStr, 10);
		const spo2 = parseInt(spo2Str, 10);
		
		// Skip invalid readings
		if (isNaN(hr) || isNaN(spo2)) continue;
		
		readings.push({
			time,
			intervalTime: parseTimeToSeconds(intervalTime),
			intervalType: intervalType.toLowerCase() as 'apnea' | 'recovery',
			hr,
			spo2
		});
	}
	
	return readings;
}

/**
 * Main parser function - parses a complete biometric CSV file
 */
export function parseBiometricCsv(csvContent: string): ParsedBiometricSession {
	const lines = csvContent.split('\n').map(line => line.trim()).filter(Boolean);
	
	// Parse header - Line 2 has routine name and timestamp
	const headerLine = lines[1] || '';
	const [routineName, timestampStr] = headerLine.split(',');
	const timestamp = timestampStr ? parseTimestamp(timestampStr) : new Date();
	
	// Parse round summaries (before biometrics section)
	const rounds = parseRoundSummaries(lines);
	
	// Parse biometric readings
	const readings = parseBiometricReadings(lines);
	
	// Calculate totals
	const totalApneaTime = rounds.reduce((sum, r) => sum + r.apneaTime, 0);
	const totalRecoveryTime = rounds.reduce((sum, r) => sum + r.recoveryTime, 0);
	
	return {
		routineName: routineName || 'Unknown Routine',
		timestamp,
		rounds,
		readings,
		totalRounds: rounds.length,
		totalApneaTime,
		totalRecoveryTime
	};
}

/**
 * Process parsed biometric data into per-rep statistics
 * This is the main function for extracting training metrics
 * 
 * IMPORTANT: SpO2 lag correction
 * SpO2 readings have a physiological lag of up to 90 seconds because:
 * 1. Deoxygenated blood from peripheral tissues takes time to reach the finger sensor
 * 2. The pulse oximeter has measurement delay
 * Therefore, the true minimum SpO2 for a breath hold may occur during the recovery phase.
 * We include recovery readings up to SPO2_LAG_WINDOW seconds when calculating minimums.
 */
const SPO2_LAG_WINDOW = 90; // seconds to look into recovery for true SpO2 nadir

export function processRepBiometrics(session: ParsedBiometricSession): ProcessedRepBiometrics[] {
	const processedReps: ProcessedRepBiometrics[] = [];
	
	// First pass: collect all intervals with their readings
	const intervals: Array<{
		type: 'apnea' | 'recovery';
		readings: BiometricReading[];
	}> = [];
	
	let currentType: 'apnea' | 'recovery' | null = null;
	let currentReadings: BiometricReading[] = [];
	
	for (const reading of session.readings) {
		const readingType = reading.intervalType === 'apnea' ? 'apnea' : 'recovery';
		
		if (currentType !== readingType) {
			if (currentReadings.length > 0 && currentType) {
				intervals.push({ type: currentType, readings: currentReadings });
			}
			currentType = readingType;
			currentReadings = [];
		}
		currentReadings.push(reading);
	}
	// Don't forget the last interval
	if (currentReadings.length > 0 && currentType) {
		intervals.push({ type: currentType, readings: currentReadings });
	}
	
	// Second pass: process apnea intervals with their following recovery
	let roundNumber = 0;
	for (let i = 0; i < intervals.length; i++) {
		const interval = intervals[i];
		
		if (interval.type === 'apnea') {
			roundNumber++;
			const apneaReadings = interval.readings;
			
			// Get the following recovery interval (if any)
			const nextInterval = intervals[i + 1];
			const recoveryReadings = nextInterval?.type === 'recovery' ? nextInterval.readings : [];
			
			// Get round summary from CSV header
			const roundSummary = session.rounds[roundNumber - 1];
			
			if (apneaReadings.length > 0) {
				const repData = calculateRepBiometrics(
					roundNumber,
					apneaReadings,
					recoveryReadings,
					roundSummary,
					SPO2_LAG_WINDOW
				);
				processedReps.push(repData);
			}
		}
	}
	
	return processedReps;
}

/**
 * Calculate biometric statistics for a single rep
 * 
 * SpO2 Lag Correction:
 * We include recovery readings up to `lagWindow` seconds to capture the true SpO2 nadir.
 * The diver's lowest SpO2 often occurs during recovery as deoxygenated blood reaches the sensor.
 */
function calculateRepBiometrics(
	repNumber: number,
	apneaReadings: BiometricReading[],
	recoveryReadings: BiometricReading[],
	roundSummary: BiometricRoundSummary | undefined,
	lagWindow: number
): ProcessedRepBiometrics {
	// For SpO2 stats, include apnea + early recovery readings (within lag window)
	const laggedRecoveryReadings = recoveryReadings.slice(0, lagWindow);
	const spo2Readings = [...apneaReadings, ...laggedRecoveryReadings];
	
	// Calculate SpO2 stats from combined readings
	const spo2Values = spo2Readings.map(r => r.spo2);
	const spo2Min = Math.min(...spo2Values);
	const spo2Avg = spo2Values.reduce((a, b) => a + b, 0) / spo2Values.length;
	
	// Calculate HR stats - include lagged recovery for consistency
	const hrValues = spo2Readings.map(r => r.hr);
	const hrMin = Math.min(...hrValues);
	const hrMax = Math.max(...hrValues);
	const hrAvg = hrValues.reduce((a, b) => a + b, 0) / hrValues.length;
	
	// Calculate time below thresholds - include lagged recovery readings
	// Note: Each reading is approximately 1 second
	const timeBelow70 = spo2Readings.filter(r => r.spo2 < 70).length;
	const timeBelow60 = spo2Readings.filter(r => r.spo2 < 60).length;
	const timeBelow50 = spo2Readings.filter(r => r.spo2 < 50).length;
	const timeBelow40 = spo2Readings.filter(r => r.spo2 < 40).length;
	
	// Get durations from round summary or calculate from readings
	const apneaDuration = roundSummary?.apneaTime ?? apneaReadings.length;
	const recoveryDuration = roundSummary?.recoveryTime ?? recoveryReadings.length;
	
	return {
		repNumber,
		apneaDuration,
		recoveryDuration,
		spo2Min,
		spo2Avg: Math.round(spo2Avg * 10) / 10,
		hrMin,
		hrMax,
		hrAvg: Math.round(hrAvg * 10) / 10,
		timeBelow70,
		timeBelow60,
		timeBelow50,
		timeBelow40,
		readings: apneaReadings
	};
}

/**
 * Convert processed biometrics to LapData format for storage
 */
export function biometricsToLapData(processedReps: ProcessedRepBiometrics[]): LapData[] {
	return processedReps.map(rep => ({
		lapNumber: rep.repNumber,
		timeSeconds: rep.apneaDuration,
		restAfterSeconds: rep.recoveryDuration,
		completed: true,
		spo2Min: rep.spo2Min,
		spo2Avg: rep.spo2Avg,
		hrMin: rep.hrMin,
		hrMax: rep.hrMax,
		hrAvg: rep.hrAvg,
		timeBelow70: rep.timeBelow70,
		timeBelow60: rep.timeBelow60,
		timeBelow50: rep.timeBelow50,
		timeBelow40: rep.timeBelow40
	}));
}

/**
 * Calculate session-level biometric summary
 */
export function calculateSessionBiometricSummary(processedReps: ProcessedRepBiometrics[]) {
	if (processedReps.length === 0) {
		return null;
	}
	
	const longestHold = Math.max(...processedReps.map(r => r.apneaDuration));
	const cumulativeHoldTime = processedReps.reduce((sum, r) => sum + r.apneaDuration, 0);
	const lowestSpO2 = Math.min(...processedReps.map(r => r.spo2Min));
	const allSpo2Avgs = processedReps.map(r => r.spo2Avg);
	const sessionAvgSpO2 = allSpo2Avgs.reduce((a, b) => a + b, 0) / allSpo2Avgs.length;
	
	const sessionMinHR = Math.min(...processedReps.map(r => r.hrMin));
	const sessionMaxHR = Math.max(...processedReps.map(r => r.hrMax));
	
	const totalTimeBelow70 = processedReps.reduce((sum, r) => sum + r.timeBelow70, 0);
	const totalTimeBelow60 = processedReps.reduce((sum, r) => sum + r.timeBelow60, 0);
	const totalTimeBelow50 = processedReps.reduce((sum, r) => sum + r.timeBelow50, 0);
	const totalTimeBelow40 = processedReps.reduce((sum, r) => sum + r.timeBelow40, 0);
	
	return {
		hasBiometricData: true,
		longestHold,
		cumulativeHoldTime,
		lowestSpO2,
		sessionAvgSpO2: Math.round(sessionAvgSpO2 * 10) / 10,
		sessionMinHR,
		sessionMaxHR,
		totalTimeBelow70,
		totalTimeBelow60,
		totalTimeBelow50,
		totalTimeBelow40
	};
}

/**
 * Validate CSV file format
 * Returns error message if invalid, null if valid
 */
export function validateBiometricCsv(csvContent: string): string | null {
	if (!csvContent || csvContent.trim().length === 0) {
		return 'CSV file is empty';
	}
	
	const lines = csvContent.split('\n');
	
	// Check for separator line
	if (!lines[0]?.startsWith('sep=')) {
		return 'Invalid CSV format: Missing separator declaration';
	}
	
	// Check for biometrics section
	const hasBiometrics = lines.some(line => 
		line.includes('Time,Interval') || line.startsWith('Time,')
	);
	if (!hasBiometrics) {
		return 'Invalid CSV format: No biometrics data section found';
	}
	
	// Check for at least some readings
	const hasReadings = lines.some(line => {
		const parts = line.split(',');
		return parts[2] === 'Apnea' || parts[2] === 'Rest';
	});
	if (!hasReadings) {
		return 'Invalid CSV format: No biometric readings found';
	}
	
	return null;
}

/**
 * Format seconds as MM:SS string
 */
export function formatDuration(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Get color class for SpO2 level (for UI display)
 */
export function getSpO2ColorClass(spo2: number): string {
	if (spo2 >= 90) return 'text-green-500';
	if (spo2 >= 80) return 'text-yellow-500';
	if (spo2 >= 70) return 'text-orange-500';
	if (spo2 >= 60) return 'text-red-500';
	return 'text-red-700';
}

/**
 * Get severity level for SpO2 (for safety warnings)
 */
export function getSpO2Severity(spo2: number): 'safe' | 'caution' | 'warning' | 'danger' | 'critical' {
	if (spo2 >= 90) return 'safe';
	if (spo2 >= 80) return 'caution';
	if (spo2 >= 70) return 'warning';
	if (spo2 >= 60) return 'danger';
	return 'critical';
}
