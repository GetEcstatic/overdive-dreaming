// Overdive Dreaming - Type Definitions
// Core data model interfaces for Firestore collections

import type { Timestamp } from 'firebase/firestore';

// ============================================================================
// DISCIPLINES
// ============================================================================

export type Discipline = 'STA' | 'DYN' | 'DNF' | 'DYNB';

export type BreathingTechnique = 'tidal' | 'hyperventilation' | 'hypoventilation';

/**
 * Starting lung volume at the beginning of a breath hold.
 * - FL  = Full Lung (after maximal inhale, possibly with packing)
 * - RV  = Residual Volume (after maximal exhale)
 * - FRC = Functional Residual Capacity (relaxed exhale, neutral lungs)
 */
export type LungVolume = 'FL' | 'RV' | 'FRC';

export type AttemptCategoryKind = 'standard' | 'o2-assisted' | 'frc' | 'rv' | 'custom';

export type BreathingGas = 'air' | 'oxygen' | 'nitrox' | 'custom';

export interface AttemptConditions {
	kind: AttemptCategoryKind;
	label?: string;
	lungVolume?: LungVolume;
	breathingGas?: BreathingGas;
	gasMix?: string;
	countsForStandardPB?: boolean;
}

export interface PersonalBestRecord {
	key: string;
	discipline: Discipline;
	categoryKind: AttemptCategoryKind;
	categoryLabel: string;
	metric: 'time' | 'distance';
	value: number;
	routineLogId: string;
	date: Timestamp;
	conditions?: AttemptConditions;
	isStandard: boolean;
}

export interface PersonalBestRecords {
	[key: string]: PersonalBestRecord;
}

export type UserTier = 'free' | 'premium';

export type PoolType = 'indoor' | 'outdoor';

// ============================================================================
// ACTIVITY TYPES (NEW - for simplified routine model)
// ============================================================================

/**
 * Activity types define the fundamental structure of a training routine.
 * This replaces the old protocolType system with clearer semantics.
 * 
 * - max-attempt: Single maximum effort dive (PB attempts, competition)
 * - submax-attempt: Single dive below max capacity (warmups, technique focus)
 * - structured-intervals: Multiple reps with defined work/rest ratios
 * - freeform-intervals: Multiple reps with no strict structure
 * - free-training: Unstructured session, flexible logging
 */
export type ActivityType = 
  | 'max-attempt'
  | 'submax-attempt'
  | 'structured-intervals'
  | 'freeform-intervals'
  | 'free-training';

// ============================================================================
// SIMPLIFIED ROUTINE TYPES (New Routine Builder)
// ============================================================================

/**
 * Simplified routine types for the new routine builder.
 * Maps to underlying ActivityType for storage.
 * 
 * - max-attempt: Single max or sub-max dive (Type 1)
 * - interval-series: Multiple reps with uniform or variable structure (Type 2)
 * - hybrid: Interval series with a max dive component (Type 3)
 */
export type SimplifiedRoutineType = 'max-attempt' | 'interval-series' | 'hybrid';

/**
 * Effort level for max attempt routines (affects analytics filtering)
 /**
 * Effort level for max attempts
 */
export type EffortLevel = 'max' | 'submax';

/**
 * Training environment for STA routines
 * - 'wet': Pool/water training only
 * - 'dry': Dry/land-based training only  
 * - 'both': Can be used for either (user selects at session level)
 */
export type TrainingEnvironment = 'wet' | 'dry' | 'both';

/**
 * Position of max dive in hybrid routines
 */
export type MaxDivePosition = 'start' | 'middle' | 'end';

/**
 * Interval structure type
 */
export type IntervalStructure = 'uniform' | 'variable';

/**
 * Tracking preset levels for simplified builder
 */
export type TrackingPreset = 'minimal' | 'standard' | 'full' | 'custom';

// ============================================================================
// USER
// ============================================================================

export interface PersonalBests {
	STA?: number; // Best static apnea time in seconds
	DYN?: number; // Best dynamic with fins distance in meters
	DNF?: number; // Best dynamic no fins distance in meters
	DYNB?: number; // Best dynamic bifins distance in meters
}

export type Gender = 'male' | 'female' | 'prefer-not-to-say';

export type CameraFacing = 'rear' | 'front' | 'unknown';

export type CameraPreference =
	| { kind: 'auto-rear' }
	| { kind: 'device'; deviceId: string; label?: string };

export interface UserSettings {
	defaultTimeframe?: '1month' | '6months' | '1year';
	defaultAnalyticsFilter?: string;
	defaultSessionVisibility?: SessionVisibility;
	publicModeAccess?: 'public' | 'advanced' | 'admin';
	fullAccessGranted?: boolean;
	showMenstrualCycleTracking?: boolean; // Opt-in to show menstrual cycle day tracking
	gender?: Gender; // User's gender for analytics/filtering
	/**
	 * Default capture resolution for the Dynamic Video feature.
	 * 720p ≈ 22 MB/min (recommended default); 1080p ≈ 37 MB/min.
	 * See docs/Dynamic video feature.md §7.
	 */
	defaultVideoResolution?: '720p' | '1080p';
	defaultVideoQualityPreset?: DiveVideoQualityPreset;
	/**
	 * Last-used recorder-setup values, persisted on successful capture.
	 * Used to pre-fill the setup screen and enable one-tap quick-start.
	 */
	defaultPoolLength?: number;
	defaultWaypointsPerLap?: number;
	defaultDiscipline?: 'DYN' | 'DYNB' | 'DNF';
	defaultCameraPreference?: CameraPreference;
}

export interface User {
	uid: string;
	email: string;
	displayName: string;
	photoURL: string;
	tier?: UserTier;
	customRoutineCount?: number;
	personalBests?: PersonalBests; // Track PB per discipline
	personalBestRecords?: PersonalBestRecords; // Track PB per discipline + attempt category
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

/**
 * How a given metric is captured when logging a dive.
 *
 * - `manual`: the user types the value into the log form.
 * - `recorder`: the value is auto-populated by the in-app dive recorder
 *   (read-only in the form, shown as "From recording").
 * - `either`: editable field that is pre-filled from the recorder seed
 *   when available, otherwise manual entry (default for most metrics).
 */
export type CaptureSource = 'manual' | 'recorder' | 'either';

export interface TrackingConfig {
	// Session context
	trackPoolLength: boolean; // Pool size in meters
	trackInitialBreatheUpTime: boolean; // Pre-dive breathe-up time

	// Performance metrics
	trackTotalDistance: boolean; // Total meters covered (for max attempts)
	trackTotalTime: boolean; // Total dive duration
	trackRepsCompleted: boolean; // Number of repetitions completed
	trackRepDuration: boolean; // Duration per rep (for interval training)
	trackRepDistance: boolean; // Distance per rep (for interval training)
	trackTimePerLap: boolean; // Detailed per-lap times
	trackRestBetweenLaps: boolean; // Rest between reps
	trackKicksPerLap: boolean; // Kicks per lap (DYN/DYNB/DNF)
	trackArmPullsPerLap: boolean; // Arm pulls per lap (DNF only)

	// Speed metrics (dynamic disciplines only)
	trackAvgSpeed?: boolean; // Overall avg speed (m/s)
	trackSpeedPerLap?: boolean; // Per-lap speed (m/s)

	// Per-metric capture source (optional; default 'either' when omitted).
	// Only a handful of metrics need a capture-source annotation today — the
	// ones that the dynamic dive recorder can auto-fill. Add more as needed.
	totalDistanceSource?: CaptureSource;
	totalTimeSource?: CaptureSource;
	timePerLapSource?: CaptureSource;
	speedPerLapSource?: CaptureSource;
	avgSpeedSource?: CaptureSource;

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

	// ============================================================================
	// BIOMETRIC TRACKING (SpO2/HR for dry static breath hold training)
	// ============================================================================
	// For routines like RV Breath Hold Series, FRC tables, dry STA training
	trackPerRepSpO2: boolean; // Per-rep SpO2 (min, avg) from pulse oximeter
	trackPerRepHR: boolean; // Per-rep HR (min, max, avg) from pulse oximeter
	trackSpO2Thresholds: boolean; // Time below critical SpO2 levels (70%, 60%, 50%, 40%)
	isDryTraining: boolean; // Flag for dry/land-based training (affects UI/safety)

	// ============================================================================
	// LUNG CAPACITY TRACKING (FVC)
	// ============================================================================
	trackFVC: boolean; // Forced Vital Capacity (liters)
	trackFVCWithPacking: boolean; // FVC with packing technique (liters)
	trackPackingVolume: boolean; // Lung packing percentage at start of hold (0-100%)
	trackLungVolume: boolean; // Per-rep starting lung volume tag (FL/RV/FRC)

	// ============================================================================
	// O2-ASSISTED STATIC APNEA TRACKING
	// ============================================================================
	trackLucidity?: boolean; // Lucidity scale (1-10)
	trackUrgeToBreathe?: boolean; // Urge to breathe scale (1-10)
	trackContractions?: boolean; // Contractions intensity scale (1-10)
	trackETCO2?: boolean; // End-tidal CO2 (mmHg)
	trackExpiredAirPostHold?: boolean; // Expired air volume after hold (liters)
	trackLungVolumeLossPerMin?: boolean; // Lung volume loss rate (L/min)
	trackGasMix?: boolean; // Gas mixture (e.g., "100% O2")
	trackCO2TremorOnset?: boolean; // Time when CO2 tremors started (seconds)
	trackMentalChangeTime?: boolean; // Time when mental state changed (seconds)
	trackRecoveryQuality?: boolean; // Recovery breathing quality (1-10)
	trackEndSpO2?: boolean; // SpO2 at end of hold (%)
	trackBreatheUpType?: boolean; // Breathe-up technique description

	// Competition comparison metrics - only enabled for max-attempt routines
	trackCompetitionStatus?: boolean; // Competition vs training comparison facet
	trackCardColor?: boolean; // White/yellow/red card outcome
	trackRecordTag?: boolean; // NR/CR/WR record tag
}

export type MetricType =
	| 'totalDistance'
	| 'totalTime'
	| 'repsCompleted'
	| 'totalRepDistance'
	| 'repDuration'
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
	| 'hrv'
	| 'packingVolume'
	// NEW: Clearer metric names (aliases)
	| 'diveDuration'      // = totalTime (clearer for single dive)
	| 'diveDistance'      // = totalDistance (clearer for single dive)
	| 'holdDuration'      // Per-rep hold time (STA intervals)
	| 'lapDistance'       // Per-rep distance (Dynamic intervals)
	| 'cumulativeHoldTime' // Sum of all holds in session
	| 'cumulativeDistance' // Sum of all distances in session
	| 'sessionDuration'   // Total elapsed time of session
	| 'longestHold'       // Longest single breath hold (from biometrics)
	// NEW: Speed metrics (calculated)
	| 'avgSpeed'          // @deprecated use 'avgSpeedMs' — Average m/s across session
	| 'maxRepSpeed'       // @deprecated use 'fastestLapSpeedMs' — Fastest rep speed
	| 'minRepSpeed'       // @deprecated use 'slowestLapSpeedMs' — Slowest rep speed
	| 'avgSpeedMs'        // Average speed (m/s) — new canonical name
	| 'fastestLapSpeedMs' // Fastest lap/rep speed (m/s) — new canonical name
	| 'slowestLapSpeedMs' // Slowest lap/rep speed (m/s) — new canonical name
	| 'minimumSpO2'      // Minimum SpO2 percentage from session or rep biometrics
	| 'minimumHR'        // Minimum heart rate from session or rep biometrics
	| 'timeBelowSpO2Threshold' // Time below the configured/standard SpO2 threshold
	| 'kicksPerLap'      // Kicks per lap/rep
	| 'armPullsPerLap'  // Arm pulls per lap/rep
	| 'averageKicksPerLap' // Average kicks across laps/reps
	| 'averageArmPullsPerLap' // Average arm pulls across laps/reps
	| 'equipment'        // Equipment text/status
	| 'facialGear'       // Facial gear text/status
	| 'fvcLiters'        // Forced vital capacity in liters
	| 'fvcWithPackingLiters' // Forced vital capacity with packing in liters
	| 'gasMix'           // Breathing gas mix text/status
	| 'endSpO2'          // SpO2 at end of hold
	| 'recoveryQuality'  // Recovery quality scale
	| 'urgeToBreathe'    // Urge-to-breathe scale
	| 'lucidity'         // Lucidity scale
	| 'contractions'     // Contractions intensity scale
	| 'safetyOutcome'    // Safety outcome/status
	| 'lungVolume'       // Starting lung volume/status
	| 'competitionStatus' // Competition vs training status
	| 'cardColor'        // White/yellow/red card status
	| 'recordTag'        // NR/CR/WR record status
	| 'breathingTechnique'; // Breathing technique used

export interface DisplayConfig {
	heroMetric: MetricType;
	heroMetricLabel: string;
	secondaryMetric: MetricType;
	secondaryMetricLabel: string;
	tertiaryMetric?: MetricType;
	tertiaryMetricLabel?: string;
}

export interface RoutineTemplate {
	id: string;
	name: string;
	description: string;

	// NEW: Activity type (optional for backward compatibility with existing routines)
	// If not set, will be inferred from protocolType/tags
	activityType?: ActivityType;

	/**
	 * @deprecated Use activityType instead. This field is kept for backward compatibility.
	 * New routines should use activityType which has clearer semantics:
	 * - 'none' → 'max-attempt' or 'submax-attempt'
	 * - 'uniform' → 'structured-intervals'
	 * - 'table' → 'structured-intervals'
	 */
	protocolType?: 'none' | 'uniform' | 'table';

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

	// Hybrid routine fields (for hybrid activity type)
	maxDivePosition?: MaxDivePosition; // 'start' | 'middle' | 'end' - general position
	maxDiveRepNumber?: number; // Exact rep number for max dive (1-based, within total reps)

	// Training environment (wet/dry/both)
	trainingEnvironment?: TrainingEnvironment;
	
	// Routine-specific tags for filtering (max, submax, competition, training, warmup, pb-attempt)
	// DEPRECATED: Use defaultTags and selectableTags instead
	routineTags?: string[];

	// NEW TAG SYSTEM:
	// Tags that are automatically applied to every log using this routine
	defaultTags?: string[];
	// Tags that users can choose from when logging (shown in quick-log form)
	selectableTags?: string[];

	// Configurable tracking
	trackingConfig: TrackingConfig;

	// Display configuration for feed cards
	displayConfig: DisplayConfig;

	// Media
	instructionalVideoUrl?: string; // YouTube/Vimeo URL
	publicPresetId?: string;

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
export type CardTag = 'white' | 'yellow' | 'red';
export type SessionVisibility = 'private' | 'public';
export type MediaStorageProvider = 'firebase-storage' | 'wasabi';

export interface MediaObjectRef {
	provider: MediaStorageProvider;
	bucket?: string;
	key: string;
	contentType?: string;
	sizeBytes?: number;
	createdAt?: Timestamp;
}

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
	distanceMeters?: number; // NEW: Per-rep distance (for dynamic)
	restAfterSeconds?: number;
	kicks?: number;
	armPulls?: number;
	// NEW: Per-lap speed (calculated)
	speedMs?: number; // meters per second for this lap
	// NEW: Rep status for editable logging
	completed?: boolean; // false = skipped, default true
	notes?: string; // Per-rep notes
	// Starting lung volume for this rep (FL/RV/FRC)
	lungVolume?: LungVolume;

	// ============================================================================
	// BIOMETRIC DATA (SpO2/HR for dry static breath hold training)
	// ============================================================================
	// From pulse oximeter (manual entry or CSV import)
	spo2Min?: number; // Minimum SpO2 during this rep (0-100%)
	spo2Avg?: number; // Average SpO2 during this rep (0-100%)
	hrMin?: number; // Minimum heart rate during this rep (bpm)
	hrMax?: number; // Maximum heart rate during this rep (bpm)
	hrAvg?: number; // Average heart rate during this rep (bpm)
	// Time spent below critical SpO2 thresholds (seconds)
	timeBelow70?: number; // Seconds SpO2 was below 70%
	timeBelow60?: number; // Seconds SpO2 was below 60%
	timeBelow50?: number; // Seconds SpO2 was below 50%
	timeBelow40?: number; // Seconds SpO2 was below 40%
}

// For use in the rep editor UI
export interface RepEditorData {
	repNumber: number;
	plannedDuration?: number; // From routine template
	plannedDistance?: number; // From routine template
	plannedRest?: number; // From routine template
	actualDuration?: number; // User-entered
	actualDistance?: number; // User-entered
	actualRest?: number; // User-entered
	completed: boolean;
	notes?: string;
	kicks?: number;
	armPulls?: number;
	// Starting lung volume for this rep (FL/RV/FRC)
	lungVolume?: LungVolume;

	// ============================================================================
	// BIOMETRIC DATA (SpO2/HR for dry static breath hold training)
	// ============================================================================
	// From pulse oximeter (manual entry or CSV import)
	spo2Min?: number; // Minimum SpO2 during this rep (0-100%)
	spo2Avg?: number; // Average SpO2 during this rep (0-100%)
	hrMin?: number; // Minimum heart rate during this rep (bpm)
	hrMax?: number; // Maximum heart rate during this rep (bpm)
	hrAvg?: number; // Average heart rate during this rep (bpm)
	// Time spent below critical SpO2 thresholds (seconds)
	timeBelow70?: number; // Seconds SpO2 was below 70%
	timeBelow60?: number; // Seconds SpO2 was below 60%
	timeBelow50?: number; // Seconds SpO2 was below 50%
	timeBelow40?: number; // Seconds SpO2 was below 40%
}

export interface RoutineLogSummary {
	repsCompleted: number;
	totalTimeSeconds?: number;
	averageTimePerRep?: number;
	averageTimePerLap?: number;
}

export interface RoutineLogPlanRow {
	planRowId: string;
	sourceLayerId: string;
	layerName?: string;
	repIndex: number;
	globalRowIndex: number;
	discipline: Discipline;
	plannedBreatheUpSeconds?: number;
	plannedDurationSeconds?: number;
	plannedDistanceMeters?: number;
	diveCapabilities?: string[];
	lungVolume: LungVolume;
	effort: 'max' | 'submax' | 'standard';
	environment: TrainingEnvironment;
	analyticsRole?: string;
}

export interface RoutineLogResultRow {
	planRowId: string;
	sourceLayerId: string;
	repIndex: number;
	globalRowIndex: number;
	completed: boolean;
	actualDurationSeconds?: number;
	actualDistanceMeters?: number;
	actualRestSeconds?: number;
	notes?: string;
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
	attemptConditions?: AttemptConditions;
	pbCategoryKey?: string;
	pbCategoryLabel?: string;

	// Session-level metadata (moved from Session)
	location?: string; // Pool name/location
	photoUrl?: string; // Firebase Storage download URL
	photoObject?: MediaObjectRef;
	youtubeUrl?: string; // YouTube video URL

	// Session context
	poolLength?: number; // meters - pool size for this routine
	initialBreatheUpTime?: number; // seconds - actual breathe-up before dive

	/**
	 * @deprecated Use diveDistance instead for single dive distance.
	 * Kept for backward compatibility - normalization layer syncs both fields.
	 */
	totalDistance?: number; // meters - total distance covered (for max attempts)
	
	/**
	 * @deprecated Use diveDuration instead for single dive time.
	 * Kept for backward compatibility - normalization layer syncs both fields.
	 */
	totalTime?: number; // seconds - total dive duration

	// Performance data - NEW clearer field names (aliases)
	// These are populated by normalization layer and written alongside old names
	diveDuration?: number;      // = totalTime (single dive duration)
	diveDistance?: number;      // = totalDistance (single dive distance)
	cumulativeHoldTime?: number; // Sum of all hold durations (intervals)
	cumulativeDistance?: number; // Sum of all distances (intervals)
	sessionDuration?: number;   // Total elapsed time of session

	// Performance data - speed metrics (calculated for dynamic intervals)
	// New canonical names (m/s) — the normalization layer keeps these in sync
	// with the deprecated aliases below for backward compatibility.
	avgSpeedMs?: number;        // Average speed across the dive (m/s)
	fastestLapSpeedMs?: number; // Fastest single-lap speed (m/s)
	slowestLapSpeedMs?: number; // Slowest single-lap speed (m/s)

	/** @deprecated Use `avgSpeedMs`. Kept in sync by the normalization layer. */
	avgSpeed?: number;
	/** @deprecated Use `fastestLapSpeedMs`. Kept in sync by the normalization layer. */
	maxRepSpeed?: number;
	/** @deprecated Use `slowestLapSpeedMs`. Kept in sync by the normalization layer. */
	minRepSpeed?: number;

	// Performance data - interval training metrics
	repDuration?: number; // seconds - duration per rep (for interval training)
	repDistance?: number; // meters - distance per rep (for interval training)
	repsCompleted?: number; // legacy field (prefer summary.repsCompleted)

	// Performance data - per-lap details (optional, can add later from video)
	laps?: LapData[];

	// OR summary metrics (quick poolside entry)
	summary?: RoutineLogSummary;
	plannedRows?: RoutineLogPlanRow[];
	resultRows?: RoutineLogResultRow[];

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

	// Lung capacity
	fvc?: number; // Forced Vital Capacity in liters (to 1 decimal place)
	fvcWithPacking?: number; // FVC with packing in liters (to 1 decimal place)
	packingVolume?: number; // Lung packing volume as percentage (0-100)
	// Session-level default lung volume — pre-fills any rep that has no
	// explicit lungVolume set in laps[].
	defaultLungVolume?: LungVolume;

	// ============================================================================
	// O2-ASSISTED STATIC APNEA DATA
	// ============================================================================
	lucidity?: number; // 1-10 scale, mental clarity during hold
	urgeToBreathe?: number; // 1-10 scale, urge to breathe intensity
	contractions?: number; // 1-10 scale, contraction intensity
	etco2?: number; // End-tidal CO2 in mmHg
	expiredAirPostHold?: number; // Expired air volume after hold (liters)
	lungVolumeLossPerMin?: number; // Lung volume loss rate (L/min)
	gasMix?: string; // Gas mixture description (e.g., "100% O2")
	co2TremorOnset?: number; // Time when CO2 tremors started (seconds)
	mentalChangeTime?: number; // Time when mental state changed (seconds)
	recoveryQuality?: number; // Recovery breathing quality (1-10)
	endSpO2?: number; // SpO2 at end of hold (%)
	breatheUpType?: string; // Breathe-up technique description

	// ============================================================================
	// BIOMETRIC SESSION SUMMARY (Aggregated from per-rep data)
	// ============================================================================
	// For dry static breath hold training with pulse oximeter data
	isDrySession?: boolean; // True if this was a dry (out of water) training session
	hasBiometricData?: boolean; // True if session includes SpO2/HR tracking
	longestHold?: number; // Longest breath hold in session (seconds)
	lowestSpO2?: number; // Lowest SpO2 reading across all reps (0-100%)
	sessionAvgSpO2?: number; // Average SpO2 across all holds
	sessionMinHR?: number; // Lowest HR reading across all reps (bpm)
	sessionMaxHR?: number; // Highest HR reading across all reps (bpm)
	// Total time spent below critical SpO2 thresholds across all reps (seconds)
	totalTimeBelow70?: number;
	totalTimeBelow60?: number;
	totalTimeBelow50?: number;
	totalTimeBelow40?: number;
	// Raw biometric CSV storage (Firebase Storage URL for reprocessing)
	biometricCsvUrl?: string; // URL to raw CSV file in Firebase Storage
	biometricCsvObject?: MediaObjectRef;

	// Media support
	thumbnailImageUrl?: string; // Photo from session (for social feed)
	performanceVideoUrl?: string; // Reference to buddy video (MVP: external URL)
	videoTimestamp?: Timestamp;
	hasDetailedData: boolean; // Has per-lap data been added from video review?

	// Social features
	likes?: string[]; // Array of user IDs who have liked this log
	commentCount?: number; // Denormalized count for display without fetching subcollection

	// PB tracking
	isPB?: boolean; // True if this dive was a personal best when logged
	isCompetition?: boolean; // Competition dive tag
	compeitionOrg?: string | null; // Competition organizer (e.g., AIDA, CMAS)
	importBatchId?: string; // Import batch identifier for undo actions
	cardTag?: CardTag | null; // Card tag (white/yellow/red), only one allowed
	recordTag?: RecordTag | null; // Record tag (NR/CR/WR), only one allowed
	visibility?: SessionVisibility; // Public/private visibility for social feed
	authorDisplayName?: string;
	authorPhotoURL?: string;
	groupRoutineId?: string;
	groupRoutineInviteId?: string;
	groupRoutineSourceLogId?: string;
	groupRoutineParticipantCount?: number;
	/**
	 * Display names of all participants in a group routine session
	 * (host + invited dive buddies). Denormalised onto the log so feed
	 * cards can render a "with X, Y + N others" line without fanout
	 * queries. First entry is the host.
	 */
	groupRoutineParticipantNames?: string[];

	// Tags selected by user at log time (from routine's selectableTags)
	selectedTags?: string[];

	createdAt: Timestamp;
	updatedAt: Timestamp;
}

// ============================================================================
// COMMENT
// ============================================================================

export interface Comment {
	id: string;
	routineLogId: string;
	userId: string;
	authorDisplayName: string;
	authorPhotoURL?: string;
	text: string;
	/** If this is a reply, the parent comment's ID */
	parentCommentId?: string;
	/** Display name of the comment being replied to */
	replyToDisplayName?: string;
	/** Array of user IDs who liked (flowed) this comment */
	likedBy?: string[];
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
// GROUP ROUTINE INVITES
// ============================================================================

export type GroupRoutineInviteStatus = 'pending' | 'accepted' | 'declined';

export interface GroupRoutineInvite {
	id: string;
	groupRoutineId: string;
	sourceRoutineLogId: string;
	hostUserId: string;
	hostDisplayName?: string;
	hostPhotoURL?: string;
	recipientUserId: string;
	recipientDisplayName?: string;
	recipientPhotoURL?: string;
	routineId: string;
	routineName: string;
	date: Timestamp;
	status: GroupRoutineInviteStatus;
	sourceLogData: RoutineLogFormData;
	acceptedRoutineLogId?: string;
	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export type GroupRoutineInviteFormData = Omit<
	GroupRoutineInvite,
	'id' | 'createdAt' | 'updatedAt'
>;

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

// ============================================================================
// BIOMETRIC CSV IMPORT TYPES
// ============================================================================
// For parsing pulse oximeter CSV exports (e.g., from Oximeter app)

// Raw second-by-second biometric reading
export interface BiometricReading {
	time: string; // HH:MM:SS format
	intervalTime: number; // Seconds since interval start
	intervalType: 'apnea' | 'recovery';
	hr: number; // Heart rate in bpm
	spo2: number; // SpO2 percentage (0-100)
}

// Round summary from CSV header section
export interface BiometricRoundSummary {
	roundNumber: number;
	recoveryTime: number; // Seconds
	apneaTime: number; // Seconds
}

// Complete parsed biometric session
export interface ParsedBiometricSession {
	routineName: string; // From CSV header (e.g., "RV Breath Hold Series")
	timestamp: Date; // When the session was recorded
	rounds: BiometricRoundSummary[]; // Summary of each round
	readings: BiometricReading[]; // All second-by-second data
	totalRounds: number;
	totalApneaTime: number; // Sum of all apnea times
	totalRecoveryTime: number; // Sum of all recovery times
}

// Processed per-rep biometric data (calculated from readings)
export interface ProcessedRepBiometrics {
	repNumber: number;
	apneaDuration: number; // Seconds
	recoveryDuration: number; // Seconds before this rep
	spo2Min: number;
	spo2Avg: number;
	hrMin: number;
	hrMax: number;
	hrAvg: number;
	timeBelow70: number;
	timeBelow60: number;
	timeBelow50: number;
	timeBelow40: number;
	// Raw readings for this rep (for detailed charts)
	readings: BiometricReading[];
}

// ============================================================================
// DIVE VIDEO (Dynamic video capture feature - see docs/Dynamic video feature.md)
// ============================================================================

/**
 * One captured lap event during a dive (a wall-touch tap by the coach).
 * Times are milliseconds offset from the START of the recording.
 */
export interface LapEvent {
	lapNumber: number;
	atMs: number;              // ms offset from recording start
	cumulativeDistanceM: number; // laps * poolLength
	splitMs: number;           // ms since previous wall tap (or diveStartMs if lap 1)
}

/**
 * Free-form event marker on the dive timeline (e.g. turn, SP, note).
 */
export interface OverlayEvent {
	atMs: number;
	kind: 'marker' | 'note';
	label?: string;
}

/**
 * Structured timeline of a dive recording.
 * All times are ms offsets from the start of the recording, using a single
 * monotonic clock (`performance.now()`) to stay in sync with the video track.
 *
 * v2 additions (optional, backwards-compatible):
 *   - `subSplits`: mid-pool waypoint taps. Kept SEPARATE from `laps` so
 *     analytics never accidentally counts them as whole lengths. Each
 *     entry's `cumulativeDistanceM` is the fractional distance at the tap
 *     (e.g. 12.5 m for the mid-pool of a 25 m pool). `lapNumber` tracks
 *     the in-lap sub-split index (1-based).
 *   - `samples`: dense position/speed samples captured at ~1 Hz while
 *     diving. Lets analytics draw a smooth speed curve without relying on
 *     wall/split taps alone. Clips recorded pre-v2 have no samples — the
 *     replay HUD falls back to lap-based interpolation in that case.
 */
export interface DiveSample {
	atMs: number;
	distanceM: number;
	speedMs: number;
}

export interface DiveTimeline {
	diveStartMs: number;      // when "GO" was pressed (diver left wall)
	diveEndMs: number;        // when STOP was pressed
	laps: LapEvent[];
	subSplits?: LapEvent[];
	samples?: DiveSample[];
	events?: OverlayEvent[];
}

/**
 * Physical orientation classification of the recorded asset / how the
 * webapp should display it.
 *
 * - 'landscape' — wider than tall (e.g. 1280x720). All current webapp
 *   recordings on iOS Safari fall in here regardless of phone posture.
 * - 'portrait'  — taller than wide. Reserved for future native captures
 *   or post-processed exports.
 */
export type DiveVideoOrientation = 'landscape' | 'portrait';

/** Rotation applied to the asset to reach the intended display orientation. */
export type DiveVideoRotation = 0 | 90 | 180 | 270;

/**
 * How Overdive should treat "up" when displaying the clip in its own
 * player + HUD. Independent of the asset's physical orientation so that
 * a landscape file recorded with the phone held vertically can still be
 * shown framed for portrait review.
 */
export type DiveVideoDisplayOrientation =
	| 'landscape'
	| 'portrait-left'
	| 'portrait-right';

export type DiveVideoAspectRatio = '16:9' | '9:16' | 'unknown';

/**
 * Phone posture at the moment recording started. Captured from the
 * Screen Orientation API (with viewport heuristics as fallback) so that
 * Overdive's player can reconstruct the coach's intended framing.
 */
export type DiveVideoCapturePosture =
	| 'phone-landscape-left'
	| 'phone-landscape-right'
	| 'phone-portrait-upright'
	| 'phone-portrait-upside-down'
	| 'unknown';

export type DiveVideoResolution = '720p' | '1080p';
export type DiveVideoQualityPreset = 'standard' | 'high' | 'max';
export type DiveVideoRetentionTier = 'keep-last-5' | 'pinned';
export type DiveVideoGiftStatus = 'pending' | 'accepted' | 'declined';
export type DiveVideoDiscipline = 'DYN' | 'DYNB' | 'DNF';

export type DiveVideoProcessingStatus =
	| 'not-requested'
	| 'queued'
	| 'processing'
	| 'ready'
	| 'failed'
	| 'retryable';

export type DiveVideoProcessingJob =
	| 'probe-master'
	| 'generate-thumbnail'
	| 'generate-playback-proxy'
	| 'generate-overlay-preview'
	| 'generate-overlay-download';

export type DiveVideoArtifactKind =
	| 'master'
	| 'thumbnail'
	| 'playback-proxy'
	| 'overlay-preview'
	| 'overlay-download'
	| 'hls-manifest';

export type DiveVideoArtifactProfile =
	| 'original'
	| 'thumb-jpeg'
	| 'mp4-720p'
	| 'mp4-1080p'
	| 'hls-adaptive'
	| 'overlay-mp4-540p'
	| 'overlay-mp4-720p'
	| 'overlay-mp4-1080p';

export interface DiveVideoProcessingState {
	master: DiveVideoProcessingStatus;
	thumbnail: DiveVideoProcessingStatus;
	playbackProxy: DiveVideoProcessingStatus;
	overlayPreview: DiveVideoProcessingStatus;
	overlayDownload: DiveVideoProcessingStatus;
	pendingJobs?: DiveVideoProcessingJob[];
	lastError?: string;
	lastErrorAt?: Timestamp;
}

export interface DiveVideoArtifactRef {
	kind: DiveVideoArtifactKind;
	profile: DiveVideoArtifactProfile;
	object: MediaObjectRef;
	widthPx?: number;
	heightPx?: number;
	durationSeconds?: number;
	sizeBytes?: number;
	contentType?: string;
	styleVersion?: string;
	disposable?: boolean;
	expiresAt?: Timestamp;
	createdAt?: Timestamp;
}

/**
 * Upload lifecycle state of the video blob itself.
 * - 'pending': blob lives in IndexedDB, not yet uploaded
 * - 'uploading': resumable upload in progress
 * - 'uploaded': available in object storage
 * - 'failed': upload failed after retries; user can retry manually
 */
export type DiveVideoUploadStatus = 'pending' | 'uploading' | 'uploaded' | 'failed';

/**
 * A dive video captured in-app. Stored under
 * `sessions/{sessionId}/videos/{videoId}` with media blobs in object storage.
 * See docs/Dynamic video feature.md.
 */
export interface DiveVideo {
	id: string;
	sessionId: string;
	userId: string;            // denormalised owner id (same as ownerId)
	ownerId: string;           // user who recorded (coach or self-recording athlete)
	athleteId?: string;        // recipient; equals ownerId when self-recorded
	giftStatus?: DiveVideoGiftStatus; // only set when ownerId !== athleteId

	routineLogId?: string;
	diveId?: string;
	discipline: DiveVideoDiscipline;

	// Storage
	storageProvider?: MediaStorageProvider;
	storagePathClean: string;   // legacy path/key for the raw clip
	storagePathBurned?: string; // optional overlay-burned export
	thumbnailPath?: string;
	cleanObject?: MediaObjectRef;
	burnedObject?: MediaObjectRef;
	thumbnailObject?: MediaObjectRef;

	// Media metadata
	durationSeconds: number;
	widthPx: number;
	heightPx: number;
	mimeType: string;           // 'video/mp4' | 'video/webm'
	sizeBytes: number;

	// Recording metadata
	recordedAt: Timestamp;
	poolLength: number;         // meters (used to derive distance)
	deviceLabel?: string;
	cameraDeviceId?: string;
	cameraPreference?: CameraPreference;
	cameraFacing?: CameraFacing;

	// Orientation is split into three independent concerns:
	//
	//   1. asset*       — what the encoded file physically is.
	//   2. display*     — how Overdive's player should present the clip.
	//   3. capturePosture — how the user was holding the phone at
	//                       record start (raw signal that produced the
	//                       display* fields).
	//
	// `orientation` / `aspectRatio` remain as the legacy display-facing
	// shorthand so existing readers keep working; new fields are optional
	// for backward compatibility with documents written before this change.
	orientation: DiveVideoOrientation;
	aspectRatio: DiveVideoAspectRatio;
	assetOrientation?: DiveVideoOrientation;
	assetRotationDeg?: DiveVideoRotation;
	assetAspectRatio?: DiveVideoAspectRatio;
	displayOrientation?: DiveVideoDisplayOrientation;
	displayRotationDeg?: DiveVideoRotation;
	displayAspectRatio?: DiveVideoAspectRatio;
	capturePosture?: DiveVideoCapturePosture;
	resolutionPreset: DiveVideoResolution; // 720p default, 1080p opt-in
	qualityPreset?: DiveVideoQualityPreset;
	requestedVideoBitrateBps?: number;
	actualAverageBitrateBps?: number;
	actualFrameRate?: number;
	probeFormatName?: string;
	probeVideoCodec?: string;
	probeAudioCodec?: string;
	probeRotationDeg?: DiveVideoRotation;

	// Retention
	retentionTier: DiveVideoRetentionTier; // 'pinned' survives the 5-video reaper

	// Upload lifecycle
	uploadStatus: DiveVideoUploadStatus;
	processingState?: DiveVideoProcessingState;
	artifacts?: DiveVideoArtifactRef[];
	overlayStyleVersion?: string;
	waypointCorrection?: {
		correctedAt: Timestamp;
		correctedBy: string;
		source: 'stored-video-scrub';
	};

	// Timeline — the key analytics artifact
	timeline: DiveTimeline;

	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export type DiveVideoFormData = Omit<DiveVideo, 'id' | 'createdAt' | 'updatedAt'>;
