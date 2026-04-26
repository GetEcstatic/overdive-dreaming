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
 * Parse date string in D/M/YYYY [H]H:mm:ss [AM|PM] format.
 *
 * Accepts both zero-padded and unpadded day/month/hour values, and an
 * optional AM/PM marker (case-insensitive). Returns an invalid Date
 * (`new Date(NaN)`) on unrecognised input so callers can detect failure.
 *
 * Examples:
 *   "23/03/2025 12:27:14"       → 2025-03-23 12:27:14 (24h)
 *   "26/4/2026 12:00:00 AM"     → 2026-04-26 00:00:00
 *   "26/4/2026 1:05:09 PM"      → 2026-04-26 13:05:09
 */
export function parseTimestamp(dateStr: string): Date {
	if (!dateStr) return new Date(NaN);
	const trimmed = dateStr.trim();
	const match = trimmed.match(
		/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\s*(AM|PM))?$/i
	);
	if (!match) return new Date(NaN);

	const day = parseInt(match[1], 10);
	const month = parseInt(match[2], 10);
	const year = parseInt(match[3], 10);
	let hours = parseInt(match[4], 10);
	const minutes = parseInt(match[5], 10);
	const seconds = parseInt(match[6], 10);
	const meridiem = match[7]?.toUpperCase();

	if (meridiem === 'AM') {
		// 12 AM = midnight (00:xx), 1-11 AM unchanged
		if (hours === 12) hours = 0;
	} else if (meridiem === 'PM') {
		// 12 PM = noon (unchanged), 1-11 PM → +12
		if (hours !== 12) hours += 12;
	}

	return new Date(year, month - 1, day, hours, minutes, seconds);
}

/**
 * Detect which round-summary format a file uses.
 * The decision is based on the lines BEFORE the `Biometrics,,` divider.
 *
 *  - Format B: any line matches `^ROUND \d+,`             (multi-round)
 *  - Format C: any line matches `^Round \d+,`             (per-round blocks)
 *  - Format A: a `Recovery,Apnea` header is present       (single-round)
 */
type RoundFormat = 'A' | 'B' | 'C' | 'unknown';

function detectRoundFormat(lines: string[]): RoundFormat {
	for (const line of lines) {
		if (/^ROUND\s+\d+,/.test(line)) return 'B';
	}
	for (const line of lines) {
		if (/^Round\s+\d+,/.test(line)) return 'C';
	}
	for (const line of lines) {
		// Header for Format A is the bare "Recovery,Apnea" pair.
		if (/^Recovery,\s*Apnea\s*$/i.test(line)) return 'A';
	}
	return 'unknown';
}

/**
 * Format A: one `Recovery,Apnea` header followed by a `mm:ss,mm:ss` row.
 * Produces a single round.
 */
function parseRoundsFormatA(lines: string[]): BiometricRoundSummary[] {
	for (let i = 0; i < lines.length; i++) {
		if (/^Recovery,\s*Apnea\s*$/i.test(lines[i])) {
			const dataLine = lines[i + 1];
			if (!dataLine) return [];
			const parts = dataLine.split(',');
			if (parts.length < 2) return [];
			return [
				{
					roundNumber: 1,
					recoveryTime: parseTimeToSeconds(parts[0]),
					apneaTime: parseTimeToSeconds(parts[1])
				}
			];
		}
	}
	return [];
}

/**
 * Format B: rows of the shape `ROUND <n>,<recovery>,<apnea>`.
 * `COOLDOWN,<time>` rows are ignored for the rounds list.
 */
function parseRoundsFormatB(lines: string[]): BiometricRoundSummary[] {
	const rounds: BiometricRoundSummary[] = [];
	for (const line of lines) {
		const match = line.match(/^ROUND\s+(\d+),([^,]*),([^,]*)$/);
		if (!match) continue;
		rounds.push({
			roundNumber: parseInt(match[1], 10),
			recoveryTime: parseTimeToSeconds(match[2]),
			apneaTime: parseTimeToSeconds(match[3])
		});
	}
	return rounds;
}

/**
 * Format C: per-round blocks
 *   Round <n>,,
 *   Number,Type,Time
 *   Interval k,Rest|Apnea|Cooldown,<mm:ss>
 *   ...
 *
 * Multiple Rest/Apnea intervals within a round accumulate.
 * Rounds whose only intervals are Cooldown are excluded from the list
 * (they don't represent an apnea attempt).
 */
function parseRoundsFormatC(lines: string[]): BiometricRoundSummary[] {
	const rounds: BiometricRoundSummary[] = [];
	let current: {
		roundNumber: number;
		recoveryTime: number;
		apneaTime: number;
		hasApneaOrRecovery: boolean;
	} | null = null;

	const flush = () => {
		if (current && current.hasApneaOrRecovery) {
			rounds.push({
				roundNumber: current.roundNumber,
				recoveryTime: current.recoveryTime,
				apneaTime: current.apneaTime
			});
		}
	};

	for (const line of lines) {
		const roundHeader = line.match(/^Round\s+(\d+),/i);
		if (roundHeader) {
			flush();
			current = {
				roundNumber: parseInt(roundHeader[1], 10),
				recoveryTime: 0,
				apneaTime: 0,
				hasApneaOrRecovery: false
			};
			continue;
		}

		const interval = line.match(/^Interval\s+\d+,(Rest|Apnea|Cooldown),(\d{1,2}:\d{2})$/i);
		if (interval && current) {
			const type = interval[1].toLowerCase();
			const seconds = parseTimeToSeconds(interval[2]);
			if (type === 'rest') {
				current.recoveryTime += seconds;
				current.hasApneaOrRecovery = true;
			} else if (type === 'apnea') {
				current.apneaTime += seconds;
				current.hasApneaOrRecovery = true;
			}
			// Cooldown intervals are intentionally dropped from the rounds list.
		}
	}
	flush();
	return rounds;
}

/**
 * Parse the round summaries from the CSV header section, dispatching on
 * the detected format. Public-facing surface is unchanged.
 */
function parseRoundSummaries(lines: string[]): BiometricRoundSummary[] {
	switch (detectRoundFormat(lines)) {
		case 'A':
			return parseRoundsFormatA(lines);
		case 'B':
			return parseRoundsFormatB(lines);
		case 'C':
			return parseRoundsFormatC(lines);
		default:
			return [];
	}
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
		
		// Skip header or empty rows - include Rest, Apnea, and Cooldown
		if (intervalType !== 'Rest' && intervalType !== 'Apnea' && intervalType !== 'Cooldown') continue;
		
		const hr = parseInt(hrStr, 10);
		const spo2 = parseInt(spo2Str, 10);
		
		// Skip invalid readings
		if (isNaN(hr) || isNaN(spo2)) continue;
		
		// Map CSV values to our type: 'Rest'/'Cooldown' -> 'recovery', 'Apnea' -> 'apnea'
		const mappedIntervalType: 'apnea' | 'recovery' = intervalType === 'Apnea' ? 'apnea' : 'recovery';
		
		readings.push({
			time,
			intervalTime: parseTimeToSeconds(intervalTime),
			intervalType: mappedIntervalType,
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
 * Calculate the initial breathe-up time from biometric readings.
 * This is the duration of 'Rest' readings before the first 'Apnea' reading.
 * More reliable than using ROUND summaries for single-hold sessions.
 */
export function getInitialBreatheUpFromReadings(readings: BiometricReading[]): number {
	if (readings.length === 0) return 0;
	
	// Find the first Apnea reading
	const firstApneaIndex = readings.findIndex(r => r.intervalType === 'apnea');
	
	// If no apnea found, all readings are rest (shouldn't happen normally)
	if (firstApneaIndex === -1) return 0;
	if (firstApneaIndex === 0) return 0; // No initial rest
	
	// Count the number of Rest readings before first Apnea
	// Each reading represents approximately 1 second
	return firstApneaIndex;
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
	
	// Second pass: process apnea intervals with their preceding and following recovery
	let roundNumber = 0;
	for (let i = 0; i < intervals.length; i++) {
		const interval = intervals[i];
		
		if (interval.type === 'apnea') {
			roundNumber++;
			const apneaReadings = interval.readings;
			
			// Get the PRECEDING recovery interval (breathe-up/rest before this apnea)
			const prevInterval = intervals[i - 1];
			const precedingRecoveryReadings = prevInterval?.type === 'recovery' ? prevInterval.readings : [];
			
			// Get the FOLLOWING recovery interval (for SpO2 lag correction)
			const nextInterval = intervals[i + 1];
			const followingRecoveryReadings = nextInterval?.type === 'recovery' ? nextInterval.readings : [];
			
			// Get round summary from CSV header (if available)
			const roundSummary = session.rounds[roundNumber - 1];
			
			if (apneaReadings.length > 0) {
				const repData = calculateRepBiometrics(
					roundNumber,
					apneaReadings,
					precedingRecoveryReadings,
					followingRecoveryReadings,
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
	precedingRecoveryReadings: BiometricReading[],
	followingRecoveryReadings: BiometricReading[],
	roundSummary: BiometricRoundSummary | undefined,
	lagWindow: number
): ProcessedRepBiometrics {
	// For SpO2 stats, include apnea + early FOLLOWING recovery readings (within lag window)
	const laggedRecoveryReadings = followingRecoveryReadings.slice(0, lagWindow);
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
	
	// Get apnea duration from round summary or count of readings
	const apneaDuration = roundSummary?.apneaTime ?? apneaReadings.length;
	
	// Recovery duration (breathe-up/rest BEFORE this rep):
	// - Prefer round summary if available (more accurate)
	// - Fallback to counting preceding recovery readings (each reading ~1 second)
	const recoveryDuration = roundSummary?.recoveryTime ?? precedingRecoveryReadings.length;
	
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
 * @param processedReps - Processed per-rep biometrics
 * @param initialBreatheUpTime - Optional initial breathe-up time in seconds (from first round's recovery time)
 */
export function calculateSessionBiometricSummary(processedReps: ProcessedRepBiometrics[], initialBreatheUpTime?: number) {
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
		totalTimeBelow40,
		initialBreatheUpTime
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
