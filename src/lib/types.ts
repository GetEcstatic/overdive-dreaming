// Overdive Dreaming - Type Definitions
// Core data model interfaces for Firestore collections

import type { Timestamp } from 'firebase/firestore';

// ============================================================================
// DISCIPLINES
// ============================================================================

export type Discipline = 'STA' | 'DYN' | 'DNF' | 'DYNB';

export type BreathingTechnique = 'tidal' | 'hyperventilation' | 'hypoventilation';

export type UserTier = 'free' | 'premium';

// ============================================================================
// USER
// ============================================================================

export interface PersonalBests {
	STA?: number; // Best static apnea time in seconds
	DYN?: number; // Best dynamic with fins distance in meters
	DNF?: number; // Best dynamic no fins distance in meters
	DYNB?: number; // Best dynamic bifins distance in meters
}

export interface User {
	uid: string;
	email: string;
	displayName: string;
	photoURL: string;
	tier?: UserTier;
	customRoutineCount?: number;
	personalBests?: PersonalBests; // Track PB per discipline
	createdAt: Timestamp;
	updatedAt: Timestamp;
}

// ============================================================================
// ROUTINE TEMPLATE
// ============================================================================

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
	| 'initialBreatheUpTime';

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
	restBetweenReps?: number; // seconds, breathing time between each rep
	repDistance?: number; // meters, distance per rep (for dynamic disciplines)
	numberOfReps?: number; // total reps in routine

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
}

export interface RoutineLog {
	id: string;
	routineId: string; // References routines/{routineId}
	sessionId: string; // Parent session
	userId: string;
	date: Timestamp;

	// Which discipline was used (required if routine applies to multiple)
	disciplineUsed: Discipline;

	// Session context
	poolLength?: number; // meters - pool size for this routine
	initialBreatheUpTime?: number; // seconds - actual breathe-up before dive

	// Performance data - max attempt metrics
	totalDistance?: number; // meters - total distance covered (for max attempts)
	totalTime?: number; // seconds - total dive duration

	// Performance data - interval training metrics
	repDuration?: number; // seconds - duration per rep (for interval training)

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

	// Media support
	thumbnailImageUrl?: string; // Photo from session (for social feed)
	performanceVideoUrl?: string; // Reference to buddy video (MVP: external URL)
	videoTimestamp?: Timestamp;
	hasDetailedData: boolean; // Has per-lap data been added from video review?

	// Social features
	likes?: string[]; // Array of user IDs who have liked this log

	// PB tracking
	isPB?: boolean; // True if this dive was a personal best when logged

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
