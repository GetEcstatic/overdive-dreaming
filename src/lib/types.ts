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

export interface User {
	uid: string;
	email: string;
	displayName: string;
	photoURL: string;
	tier?: UserTier;
	customRoutineCount?: number;
	createdAt: Timestamp;
	updatedAt: Timestamp;
}

// ============================================================================
// ROUTINE TEMPLATE
// ============================================================================

export interface TrackingConfig {
	trackLapsCompleted: boolean;
	trackTimePerLap: boolean;
	trackRestBetweenLaps: boolean;
	trackKicksPerLap: boolean; // DYN/DYNB/DNF
	trackArmPullsPerLap: boolean; // DNF only
	trackBreathingTechnique: boolean;
	trackRPE: boolean; // Rate of Perceived Exertion (1-10)
	trackJoyScale: boolean; // Enjoyment rating (1-10)
	trackHoursSinceLastMeal: boolean;
	trackNotes: boolean;
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
	initialBreatheUpTime?: number; // seconds, breathe-up before routine starts
	restBetweenReps?: number; // seconds, breathing time between each rep
	lapDistance?: number; // meters, for dynamic disciplines only
	repDuration?: number; // seconds, for static disciplines only
	numberOfReps?: number; // total laps/reps in routine

	// Configurable tracking
	trackingConfig: TrackingConfig;

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

export interface Session {
	id: string;
	userId: string;
	date: Timestamp;
	location?: string;
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
	lapsCompleted: number;
	totalTimeSeconds?: number;
	averageTimePerLap?: number;
}

export interface RoutineLog {
	id: string;
	routineId: string; // References routines/{routineId}
	sessionId: string; // Parent session
	userId: string;
	date: Timestamp;

	// Which discipline was used (required if routine applies to multiple)
	disciplineUsed: Discipline;

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
