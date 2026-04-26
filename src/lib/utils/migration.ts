/**
 * Migration Utilities
 * 
 * Provides normalization functions for backward-compatible data handling.
 * These functions ensure old data works with new field names and vice versa.
 */

import type { RoutineLog, RoutineTemplate, ActivityType, LapData } from '$lib/types';
import { Timestamp } from 'firebase/firestore';

/**
 * Rehydrate a Firestore Timestamp that was accidentally written as a plain
 * `{seconds, nanoseconds}` map (e.g. by a buggy deep-clone that stripped the
 * Timestamp prototype). Returns the value untouched if it is already a real
 * Timestamp, a JS Date, null, or undefined.
 */
function rehydrateTimestamp(value: unknown): unknown {
  if (value && typeof value === 'object' && !(value instanceof Timestamp) && !(value instanceof Date)) {
    const v = value as { seconds?: unknown; nanoseconds?: unknown; _seconds?: unknown; _nanoseconds?: unknown };
    const seconds = typeof v.seconds === 'number' ? v.seconds : (typeof v._seconds === 'number' ? v._seconds : undefined);
    const nanos = typeof v.nanoseconds === 'number' ? v.nanoseconds : (typeof v._nanoseconds === 'number' ? v._nanoseconds : 0);
    if (typeof seconds === 'number') {
      return new Timestamp(seconds, nanos);
    }
  }
  return value;
}

// ============================================================================
// ACTIVITY TYPE INFERENCE
// ============================================================================

/**
 * Infer activity type from existing routine data (for backward compatibility)
 * Uses tags, protocolType, and trackingConfig to determine the most likely type.
 */
export function inferActivityType(routine: RoutineTemplate): ActivityType {
  // Check tags first - most explicit signal
  const tags = routine.tags || [];
  
  if (tags.includes('max-attempt')) {
    return 'max-attempt';
  }
  if (tags.includes('sub-max') || tags.includes('submax')) {
    return 'submax-attempt';
  }
  
  // Check protocol type
  const protocolType = routine.protocolType;
  
  if (protocolType === 'table') {
    // Table-based protocols are structured intervals
    return 'structured-intervals';
  }
  
  if (protocolType === 'uniform') {
    // Uniform intervals with defined reps
    return 'structured-intervals';
  }
  
  // For 'none' or undefined, check tracking config
  const hasReps = routine.trackingConfig?.trackRepsCompleted;
  const hasRepDuration = routine.trackingConfig?.trackRepDuration;
  const hasRepDistance = routine.trackingConfig?.trackRepDistance;
  
  if (hasReps || hasRepDuration || hasRepDistance) {
    // Has interval-related tracking but no structure = freeform
    return 'freeform-intervals';
  }
  
  // Check if it looks like a max attempt routine
  const tracksTotalDistance = routine.trackingConfig?.trackTotalDistance;
  const tracksTotalTime = routine.trackingConfig?.trackTotalTime;
  
  if (tracksTotalDistance || tracksTotalTime) {
    // Tracks main performance metrics, likely max attempt
    return 'max-attempt';
  }
  
  // Default fallback
  return 'free-training';
}

// ============================================================================
// SPEED CALCULATIONS
// ============================================================================

/**
 * Calculate speed in meters per second
 */
export function calculateSpeed(distanceMeters: number, timeSeconds: number): number {
  if (timeSeconds <= 0) return 0;
  return distanceMeters / timeSeconds;
}

/**
 * Calculate per-lap speeds for a log with laps data
 */
export function calculateLapSpeeds(laps: LapData[], lapDistance: number): LapData[] {
  return laps.map(lap => ({
    ...lap,
    speedMs: lap.timeSeconds && lap.timeSeconds > 0 
      ? calculateSpeed(lapDistance, lap.timeSeconds)
      : undefined
  }));
}

/**
 * Calculate average speed across all laps
 */
export function calculateAvgSpeed(log: RoutineLog): number | undefined {
  // Method 1: From per-lap data
  if (log.laps && log.laps.length > 0 && log.poolLength) {
    const totalDistance = log.laps.length * log.poolLength;
    const totalTime = log.laps.reduce((sum, lap) => sum + (lap.timeSeconds || 0), 0);
    if (totalTime > 0) {
      return calculateSpeed(totalDistance, totalTime);
    }
  }
  
  // Method 2: From cumulative values
  const distance = log.cumulativeDistance || log.totalDistance;
  const time = log.cumulativeHoldTime || log.totalTime;
  
  if (distance && time && time > 0) {
    return calculateSpeed(distance, time);
  }
  
  return undefined;
}

/**
 * Calculate max and min rep speeds
 */
export function calculateSpeedRange(laps: LapData[]): { max: number | undefined; min: number | undefined } {
  const speeds = laps
    .map(lap => lap.speedMs)
    .filter((s): s is number => s !== undefined && s > 0);
  
  if (speeds.length === 0) {
    return { max: undefined, min: undefined };
  }
  
  return {
    max: Math.max(...speeds),
    min: Math.min(...speeds)
  };
}

// ============================================================================
// CUMULATIVE CALCULATIONS
// ============================================================================

/**
 * Calculate cumulative hold time (sum of all hold durations)
 */
export function calculateCumulativeHoldTime(log: RoutineLog): number | undefined {
  // From per-lap data
  if (log.laps && log.laps.length > 0) {
    const total = log.laps.reduce((sum, lap) => sum + (lap.timeSeconds || 0), 0);
    if (total > 0) return total;
  }
  
  // From rep duration and reps completed
  const repsCompleted = log.repsCompleted || log.summary?.repsCompleted;
  if (log.repDuration && repsCompleted) {
    return log.repDuration * repsCompleted;
  }
  
  return undefined;
}

/**
 * Calculate cumulative distance (sum of all lap distances)
 */
export function calculateCumulativeDistance(log: RoutineLog): number | undefined {
  // If we have laps and pool length
  if (log.laps && log.laps.length > 0 && log.poolLength) {
    return log.laps.length * log.poolLength;
  }
  
  // From rep distance and reps completed
  const repsCompleted = log.repsCompleted || log.summary?.repsCompleted;
  if (log.repDistance && repsCompleted) {
    return log.repDistance * repsCompleted;
  }
  
  return undefined;
}

// ============================================================================
// NORMALIZATION FUNCTIONS
// ============================================================================

/**
 * Normalize a routine log by populating new field names from old data.
 * This ensures old logs work with new code that expects new field names.
 * 
 * @param log - The routine log from Firestore
 * @returns Log with all field aliases populated
 */
export function normalizeRoutineLog(log: RoutineLog): RoutineLog {
  // Start with the original log
  const normalized: RoutineLog = { ...log };

  // Heal Timestamp-shaped fields that may have been written as plain maps
  // by an earlier buggy code path. Without this, `.toDate()` calls in the
  // UI throw "toDate is not a function".
  normalized.date = rehydrateTimestamp(normalized.date) as RoutineLog['date'];
  if (normalized.createdAt) {
    normalized.createdAt = rehydrateTimestamp(normalized.createdAt) as RoutineLog['createdAt'];
  }
  if (normalized.updatedAt) {
    normalized.updatedAt = rehydrateTimestamp(normalized.updatedAt) as RoutineLog['updatedAt'];
  }
  if ((normalized as { videoTimestamp?: unknown }).videoTimestamp) {
    (normalized as { videoTimestamp?: unknown }).videoTimestamp = rehydrateTimestamp(
      (normalized as { videoTimestamp?: unknown }).videoTimestamp
    );
  }
  
  // Populate new field names from old (if not already set)
  normalized.diveDuration = log.diveDuration ?? log.totalTime;
  normalized.diveDistance = log.diveDistance ?? log.totalDistance;
  
  // Calculate cumulative values
  normalized.cumulativeHoldTime = log.cumulativeHoldTime ?? calculateCumulativeHoldTime(log);
  normalized.cumulativeDistance = log.cumulativeDistance ?? calculateCumulativeDistance(log);
  
  // Sync new/old speed field names so consumers can read either.
  // `*Ms` are the new canonical names; the old names are kept for back-compat.
  normalized.avgSpeedMs = log.avgSpeedMs ?? log.avgSpeed;
  normalized.fastestLapSpeedMs = log.fastestLapSpeedMs ?? log.maxRepSpeed;
  normalized.slowestLapSpeedMs = log.slowestLapSpeedMs ?? log.minRepSpeed;
  
  // Calculate avg speed if missing (for dynamic disciplines with time data)
  if (normalized.avgSpeedMs === undefined) {
    const computed = calculateAvgSpeed(normalized);
    if (computed !== undefined) {
      normalized.avgSpeedMs = computed;
    }
  }
  
  // Calculate per-lap speeds if we have lap data and pool length
  if (normalized.laps && normalized.laps.length > 0 && normalized.poolLength) {
    normalized.laps = calculateLapSpeeds(normalized.laps, normalized.poolLength);
    
    // Calculate speed range
    const speedRange = calculateSpeedRange(normalized.laps);
    normalized.fastestLapSpeedMs = normalized.fastestLapSpeedMs ?? speedRange.max;
    normalized.slowestLapSpeedMs = normalized.slowestLapSpeedMs ?? speedRange.min;
  }

  // Mirror new canonical names back onto the deprecated aliases so legacy
  // code paths keep working without refactoring every call-site at once.
  normalized.avgSpeed = normalized.avgSpeed ?? normalized.avgSpeedMs;
  normalized.maxRepSpeed = normalized.maxRepSpeed ?? normalized.fastestLapSpeedMs;
  normalized.minRepSpeed = normalized.minRepSpeed ?? normalized.slowestLapSpeedMs;
  
  return normalized;
}

/**
 * Normalize a routine template by inferring activity type if not set.
 * 
 * @param routine - The routine template from Firestore
 * @returns Routine with activityType populated
 */
export function normalizeRoutineTemplate(routine: RoutineTemplate): RoutineTemplate {
  if (routine.activityType) {
    // Already has activity type, return as-is
    return routine;
  }
  
  return {
    ...routine,
    activityType: inferActivityType(routine)
  };
}

/**
 * Prepare a routine log for writing to Firestore.
 * Ensures both old and new field names are populated for backward compatibility.
 * 
 * @param log - The log data to write
 * @returns Log with all field names populated (old and new)
 */
export function prepareLogForWrite(log: Partial<RoutineLog>): Partial<RoutineLog> {
  const prepared = { ...log };
  
  // Ensure old field names are populated from new
  if (prepared.diveDuration !== undefined && prepared.totalTime === undefined) {
    prepared.totalTime = prepared.diveDuration;
  }
  if (prepared.diveDistance !== undefined && prepared.totalDistance === undefined) {
    prepared.totalDistance = prepared.diveDistance;
  }
  
  // Ensure new field names are populated from old
  if (prepared.totalTime !== undefined && prepared.diveDuration === undefined) {
    prepared.diveDuration = prepared.totalTime;
  }
  if (prepared.totalDistance !== undefined && prepared.diveDistance === undefined) {
    prepared.diveDistance = prepared.totalDistance;
  }

  // Sync speed field names both directions so old readers and new readers
  // both see the same value regardless of which name was set.
  if (prepared.avgSpeedMs !== undefined && prepared.avgSpeed === undefined) {
    prepared.avgSpeed = prepared.avgSpeedMs;
  } else if (prepared.avgSpeed !== undefined && prepared.avgSpeedMs === undefined) {
    prepared.avgSpeedMs = prepared.avgSpeed;
  }
  if (prepared.fastestLapSpeedMs !== undefined && prepared.maxRepSpeed === undefined) {
    prepared.maxRepSpeed = prepared.fastestLapSpeedMs;
  } else if (prepared.maxRepSpeed !== undefined && prepared.fastestLapSpeedMs === undefined) {
    prepared.fastestLapSpeedMs = prepared.maxRepSpeed;
  }
  if (prepared.slowestLapSpeedMs !== undefined && prepared.minRepSpeed === undefined) {
    prepared.minRepSpeed = prepared.slowestLapSpeedMs;
  } else if (prepared.minRepSpeed !== undefined && prepared.slowestLapSpeedMs === undefined) {
    prepared.slowestLapSpeedMs = prepared.minRepSpeed;
  }
  
  // Calculate speed if we have the data
  if (prepared.avgSpeedMs === undefined && prepared.laps && prepared.poolLength) {
    prepared.laps = calculateLapSpeeds(prepared.laps, prepared.poolLength);
    const avgSpeed = calculateAvgSpeed(prepared as RoutineLog);
    if (avgSpeed) {
      prepared.avgSpeedMs = avgSpeed;
      prepared.avgSpeed = avgSpeed;
    }
    
    const speedRange = calculateSpeedRange(prepared.laps);
    if (speedRange.max) {
      prepared.fastestLapSpeedMs = speedRange.max;
      prepared.maxRepSpeed = speedRange.max;
    }
    if (speedRange.min) {
      prepared.slowestLapSpeedMs = speedRange.min;
      prepared.minRepSpeed = speedRange.min;
    }
  }
  
  return prepared;
}

/**
 * Prepare a routine template for writing to Firestore.
 * Ensures activityType is set.
 * 
 * @param routine - The routine data to write
 * @returns Routine with activityType populated
 */
export function prepareRoutineForWrite(routine: Partial<RoutineTemplate>): Partial<RoutineTemplate> {
  // If activityType is set, return as-is
  if (routine.activityType) {
    return routine;
  }
  
  // Infer activity type if we have enough data
  if (routine.trackingConfig) {
    return {
      ...routine,
      activityType: inferActivityType(routine as RoutineTemplate)
    };
  }
  
  return routine;
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

export const Migration = {
  inferActivityType,
  normalizeRoutineLog,
  normalizeRoutineTemplate,
  prepareLogForWrite,
  prepareRoutineForWrite,
  calculateSpeed,
  calculateAvgSpeed,
  calculateCumulativeHoldTime,
  calculateCumulativeDistance
};

export default Migration;
