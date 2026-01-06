// Overdive Dreaming - Type Definitions
// Core data model interfaces for Firestore collections

import type { Timestamp } from 'firebase/firestore';

// ============================================================================
// DISCIPLINES
// ============================================================================

export type Discipline = 'STA' | 'DYN' | 'DNF' | 'DYNB';

export type BreathingTechnique = 'tidal' | 'hyperventilation' | 'hypoventilation';

export type UserTier = 'free' | 'premium';

export type PoolType = 'indoor' | 'outdoor';

// ============================================================================
// USER
// ============================================================================

export interface PersonalBests {
	STA?: number; // Best static apnea time in seconds
	DYN?: number; // Best dynamic with fins distance in meters
	DNF?: number; // Best dynamic no fins distance in meters
	DYNB?: number; // Best dynamic bifins distance in meters
}

export interface UserSettings {
	defaultTimeframe?: '1month' | '6months' | '1year';
	defaultAnalyticsFilter?: string;
	defaultSessionVisibility?: SessionVisibility;
}

export interface User {
	uid: string;
	email: string;
	displayName: string;
	photoURL: string;
	tier?: UserTier;
	customRoutineCount?: number;
	personalBests?: PersonalBests; // Track PB per discipline
	settings?: UserSettings;
	createdAt: Timestamp;
	updatedAt: Timestamp;
}

// ============================================================================
// PUBLIC USER PROFILE (minimal fields for community feed)
// ============================================================================

export interface PublicUserProfile {
	userId: string;
	displayName: string;
	photoURL?: string;
	updatedAt: Timestamp;
}

// ============================================================================
// ROUTINE TEMPLATE
// ============================================================================

// Variable table support for progressive protocols
export interface TableRow {
	repNumber: number; // 1, 2, 3, ...
	restBefore: number; // Seconds - breathing time before this rep

	// Static disciplines (STA)
	targetDuration?: number; // Seconds - target hold time

	// Dynamic disciplines (DYN, DNF, DYNB)
	targetDistance?: number; // Meters - target distance
	targetTime?: number; // Seconds - target time (optional, can add from video)
}

export interface RoutineTable {
	rows: TableRow[];
}

export interface TrackingConfig {
	// Session context
	trackPoolLength: boolean; // Pool size in meters
	trackInitialBreatheUpTime: boolean; // Pre-dive breathe-up time

	// Performance metrics
	trackTotalDistance: boolean; // Total meters covered (for max attempts)
	trackTotalTime: boolean; // Total dive duration
	trackRepsCompleted: boolean; // Number of repetitions completed
	trackRepDuration: boolean; // Duration per rep (for interval training)
	trackTimePerLap: boolean; // Detailed per-lap times
	trackRestBetweenLaps: boolean; // Rest between reps
	trackKicksPerLap: boolean; // Kicks per lap (DYN/DYNB/DNF)
	trackArmPullsPerLap: boolean; // Arm pulls per lap (DNF only)

	// Training context
	trackBreathingTechnique: boolean;
	trackRPE: boolean; // Rate of Perceived Exertion (1-10)
	trackJoyScale: boolean; // Enjoyment rating (1-10)
	trackHoursSinceLastMeal: boolean;
	trackNotes: boolean;

	// NEW METRICS (Custom routine builder)
	trackWaterTemperature: boolean; // Pool/water temp in Celsius
	trackContractionsOnsetTime: boolean; // When first contraction occurred (seconds)
	trackEquipmentUsed: boolean; // Fins type, wetsuit, etc. (text)
	trackBuddyName: boolean; // Diving partner name
	trackRestingHeartRate: boolean; // Resting HR for the day (bpm)
	trackHRV: boolean; // Heart Rate Variability (ms)
	trackPoolType: boolean; // Indoor vs outdoor
	trackSambaBO: boolean; // Samba/BO incident flag (boolean)
	trackBreathsBetweenReps: boolean; // Number of breaths between reps/dives

	// NEW METRICS - Phase 1 (Additional metrics from testing)
	trackMenstrualCycleDay: boolean; // Day of menstrual cycle
	trackFacialGear: boolean; // Mask, noseclip, goggles, nothing
	trackBasalMood: boolean; // Mood before session (1-10 scale)
	trackMinimumSpO2: boolean; // Minimum oxygen saturation percentage
	trackMinimumHR: boolean; // Minimum heart rate during routine
	trackBodyWeight: boolean; // Body weight that day (kg)
}

export type MetricType =
	| 'totalDistance'
	| 'totalTime'
	| 'repsCompleted'
	| 'avgTimePerLap'
	| 'avgTimePerRep'
	| 'avgRestBetweenLaps'
	| 'totalBreathHoldTime'
	| 'totalBreathingTime'
	| 'totalBreaths'
	| 'poolLength'
	| 'initialBreatheUpTime'
	| 'waterTemperature'
	| 'contractionsOnsetTime'
	| 'restingHeartRate'
	| 'hrv';

export interface DisplayConfig {
	heroMetric: MetricType;
	heroMetricLabel: string;
	secondaryMetric: MetricType;
	secondaryMetricLabel: string;
}

export interface RoutineTemplate {
	id: string;
	name: string;
	description: string;

	// Multi-discipline support
	disciplines: Discipline[];

	// Flexible tagging system
	tags: string[]; // e.g., ['co2', 'endurance', 'intermediate']

	// Routine structure (ALL OPTIONAL)
	// EITHER uniform intervals (all reps the same)
	restBetweenReps?: number; // seconds, breathing time between each rep
	repDistance?: number; // meters, distance per rep (for dynamic disciplines)
	numberOfReps?: number; // total reps in routine

	// OR variable table (progressive protocols)
	table?: RoutineTable; // Mutually exclusive with uniform interval fields

	// Configurable tracking
	trackingConfig: TrackingConfig;

	// Display configuration for feed cards
	displayConfig: DisplayConfig;

	// Media
	instructionalVideoUrl?: string; // YouTube/Vimeo URL

	// Metadata
	createdBy: 'system' | string; // 'system' for defaults, userId for custom
	isPublic: boolean;
	tier?: UserTier;
	createdAt: Timestamp;
	updatedAt: Timestamp;
}

// ============================================================================
// SESSION
// ============================================================================

export type TimeOfDay = 'morning' | 'afternoon' | 'evening';
export type RecordTag = 'NR' | 'CR' | 'WR';
export type SessionVisibility = 'private' | 'public';

export interface Session {
	id: string;
	userId: string;
	date: Timestamp;
	timeOfDay?: TimeOfDay; // Auto-determined: morning (6am-12pm), afternoon (12pm-6pm), evening (6pm-12am)
	location?: string;
	notes?: string;
	photoUrl?: string; // Firebase Storage download URL
	youtubeUrl?: string; // YouTube video URL
	createdAt: Timestamp;
	updatedAt: Timestamp;
}

// ============================================================================
// SEASON
// ============================================================================

export interface Season {
	id: string;
	userId: string;
	name: string;
	startDate: Timestamp;
	endDate?: Timestamp | null;
	notes?: string;
	createdAt: Timestamp;
	updatedAt: Timestamp;
}

// ============================================================================
// ROUTINE LOG (Instance of completing a routine)
// ============================================================================

export interface LapData {
	lapNumber: number;
	timeSeconds?: number;
	restAfterSeconds?: number;
	kicks?: number;
	armPulls?: number;
}

export interface RoutineLogSummary {
	repsCompleted: number;
	totalTimeSeconds?: number;
	averageTimePerRep?: number;
	averageTimePerLap?: number;
}

export interface RoutineLog {
	id: string;
	routineId: string; // References routines/{routineId}
	userId: string;
	date: Timestamp;
	timeOfDay?: TimeOfDay; // Auto-determined: morning/afternoon/evening
	sessionGroup?: string; // Auto-generated group ID (e.g., "2026-01-01-morning")

	// Which discipline was used (required if routine applies to multiple)
	disciplineUsed: Discipline;

	// Session-level metadata (moved from Session)
	location?: string; // Pool name/location
	photoUrl?: string; // Firebase Storage download URL
	youtubeUrl?: string; // YouTube video URL

	// Session context
	poolLength?: number; // meters - pool size for this routine
	initialBreatheUpTime?: number; // seconds - actual breathe-up before dive

	// Performance data - max attempt metrics
	totalDistance?: number; // meters - total distance covered (for max attempts)
	totalTime?: number; // seconds - total dive duration

	// Performance data - interval training metrics
	repDuration?: number; // seconds - duration per rep (for interval training)
	repsCompleted?: number; // legacy field (prefer summary.repsCompleted)

	// Performance data - per-lap details (optional, can add later from video)
	laps?: LapData[];

	// OR summary metrics (quick poolside entry)
	summary?: RoutineLogSummary;

	// Routine-level data (not per-lap)
	breathingTechnique?: BreathingTechnique;
	breathingNotes?: string;
	rpe?: number; // 1-10 scale
	joyScale?: number; // 1-10 scale
	hoursSinceLastMeal?: number;
	notes?: string;

	// NEW TRACKED DATA (Custom routine builder)
	waterTemperature?: number; // Celsius
	contractionsOnsetTime?: number; // Seconds - when first contraction occurred
	equipmentUsed?: string; // Freeform text - fins type, wetsuit, etc.
	buddyName?: string; // Diving partner name
	restingHeartRate?: number; // bpm - resting heart rate for the day
	hrv?: number; // milliseconds - Heart Rate Variability
	poolType?: PoolType; // 'indoor' | 'outdoor'
	sambaBO?: boolean; // Samba/BO incident flag
	breathsBetweenReps?: number; // Number of breaths between reps/dives

	// NEW TRACKED DATA - Phase 1 (Additional metrics from testing)
	menstrualCycleDay?: number; // 1-40, day of menstrual cycle
	facialGear?: string[]; // Array: ['mask', 'noseclip', 'goggles', 'nothing']
	basalMood?: number; // 1-10 scale, mood before session
	minimumSpO2?: number; // 0-100, minimum oxygen saturation percentage
	minimumHR?: number; // bpm, minimum heart rate during routine
	bodyWeight?: number; // kg, body weight that day
	breathingTechniqueLevel?: number; // -3 to +3 (NEW field, coexists with old breathingTechnique)

	// Media support
	thumbnailImageUrl?: string; // Photo from session (for social feed)
	performanceVideoUrl?: string; // Reference to buddy video (MVP: external URL)
	videoTimestamp?: Timestamp;
	hasDetailedData: boolean; // Has per-lap data been added from video review?

	// Social features
	likes?: string[]; // Array of user IDs who have liked this log

	// PB tracking
	isPB?: boolean; // True if this dive was a personal best when logged
	isCompetition?: boolean; // Competition dive tag
	recordTag?: RecordTag | null; // Record tag (NR/CR/WR), only one allowed
	visibility?: SessionVisibility; // Public/private visibility for social feed
	authorDisplayName?: string;
	authorPhotoURL?: string;

	createdAt: Timestamp;
	updatedAt: Timestamp;
}

// ============================================================================
// INDIVIDUAL DIVE (Non-routine dives)
// ============================================================================

export interface Dive {
	id: string;
	sessionId: string; // Parent session
	userId: string;
	discipline: Discipline;
	date: Timestamp;

	// Performance
	duration?: number; // seconds, for STA or dynamic duration tracking
	distance?: number; // meters, for DYN/DNF/DYNB

	// Optional metadata
	notes?: string;
	breathingTechnique?: BreathingTechnique;
	rpe?: number;

	createdAt: Timestamp;
	updatedAt: Timestamp;
}

// ============================================================================
// CONFIG - SUGGESTED TAGS
// ============================================================================

export interface SuggestedTags {
	trainingAdaptations: string[];
	diveTypes: string[];
	difficultyLevels: string[];
	specialCategories: string[];
}

// ============================================================================
// FORM DATA TYPES (for creating new records)
// ============================================================================

// Omit auto-generated fields for creation forms
export type RoutineTemplateFormData = Omit<
	RoutineTemplate,
	'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'isPublic' | 'tier'
>;

export type SessionFormData = Omit<Session, 'id' | 'createdAt' | 'updatedAt'>;

export type RoutineLogFormData = Omit<RoutineLog, 'id' | 'createdAt' | 'updatedAt'>;

export type DiveFormData = Omit<Dive, 'id' | 'createdAt' | 'updatedAt'>;

export type SeasonFormData = Omit<Season, 'id' | 'createdAt' | 'updatedAt'>;

// ============================================================================
// HELPER TYPES
// ============================================================================

// For filtering routines by tag
export interface RoutineFilter {
	disciplines?: Discipline[];
	tags?: string[];
	createdBy?: 'system' | 'user' | 'all';
}

// For analytics/stats
export interface RoutineStats {
	routineId: string;
	routineName: string;
	timesCompleted: number;
	averageRPE?: number;
	averageJoyScale?: number;
	lastCompleted?: Timestamp;
}

export interface SessionStats {
	totalSessions: number;
	totalRoutines: number;
	totalDives: number;
	tagBreakdown: Record<string, number>; // e.g., { "co2": 12, "mental": 8 }
}
