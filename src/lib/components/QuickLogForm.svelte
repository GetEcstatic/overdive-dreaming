<script lang="ts">
	import type {
		RoutineTemplate,
		Discipline,
		BreathingTechnique,
		PoolType,
		RecordTag,
		CardTag,
		SessionVisibility,
		TimeOfDay,
		RepEditorData,
		LapData,
		LungVolume,
		AttemptCategoryKind,
		AttemptConditions,
		BreathingGas
	} from '$lib/types';
	import PhotoCropper from '$lib/components/PhotoCropper.svelte';
	import RepEditor from '$lib/components/RepEditor.svelte';
	import BiometricImportModal from '$lib/components/BiometricImportModal.svelte';
	import DurationInput from '$lib/components/DurationInput.svelte';
	import NumberWheelInput from '$lib/components/NumberWheelInput.svelte';
	import { isValidYouTubeUrl } from '$lib/storage';
	import { biometricsToLapData, calculateSessionBiometricSummary } from '$lib/utils/biometricCsvParser';
	import { applyDefaultLungVolume } from '$lib/utils/lungVolume';
	import { getTagByValue } from '$lib/config/tagConfig';
	import { resolveMetricInput } from '$lib/utils/resolveMetricInput';
	import {
		DEFAULT_O2_GAS_MIX,
		attemptOptionsForDiscipline,
		defaultConditionsForKind
	} from '$lib/utils/attemptCategories';

	interface Props {
		routine: RoutineTemplate;
		onSubmit: (data: LogFormData) => void;
		onCancel: () => void;
		defaultVisibility?: SessionVisibility;
		showMenstrualCycleTracking?: boolean;
		saving?: boolean;
		/**
		 * Optional seed values used to pre-fill the form — e.g. after a
		 * dynamic dive video is saved, the recorder writes a
		 * TimelineSummary-derived seed into sessionStorage and the
		 * /dives page passes it in here.
		 */
		initialValues?: {
			discipline?: Discipline;
			totalDistance?: number;
			totalTimeSeconds?: number;
			poolLength?: number;
			notes?: string;
			/** Average speed (m/s) across the whole dive, from video. */
			avgSpeed?: number;
			/** Per-lap splits (number, timeSeconds, distanceMeters, speedMs). */
			laps?: LapData[];
		};
	}

	export interface LogFormData {
		disciplineUsed: Discipline;
		sessionDate: string; // YYYY-MM-DD format
		sessionTime?: string; // HH:MM format
		timeOfDay?: TimeOfDay;
		isCompetition?: boolean;
		compeitionOrg?: string;
		cardTag?: CardTag;
		recordTag?: RecordTag;
		attemptConditions?: AttemptConditions;
		// Session context
		isDrySession?: boolean; // True if dry training (out of water)
		poolLength?: number;
		initialBreatheUpTime?: number;
		// Performance metrics
		totalDistance?: number;
		totalTime?: number;
		repsCompleted?: number;
		repDuration?: number;
		repDistance?: number;
		/** Average speed (m/s) for the whole dive — seeded from video recorder. */
		avgSpeed?: number;
		// Training context
		breathingTechnique?: BreathingTechnique;
		rpe?: number;
		joyScale?: number;
		hoursSinceLastMeal?: number;
		notes?: string;
		// NEW METRICS
		waterTemperature?: number;
		contractionsOnsetTime?: number;
		equipmentUsed?: string;
		buddyName?: string;
		restingHeartRate?: number;
		hrv?: number;
		poolType?: PoolType;
		sambaBO?: boolean;
		breathsBetweenReps?: number;
		// NEW METRICS - Phase 1
		menstrualCycleDay?: number;
		facialGear?: string[];
		basalMood?: number;
		minimumSpO2?: number;
		minimumHR?: number;
		bodyWeight?: number;
		breathingTechniqueLevel?: number;
		// Lung capacity
		fvc?: number;
		fvcWithPacking?: number;
		packingVolume?: number;
		// Session-level default lung volume (FL/RV/FRC) — pre-fills any rep
		// that has no explicit per-rep value
		defaultLungVolume?: LungVolume;
		// O2-Assisted Static Apnea
		lucidity?: number;
		urgeToBreathe?: number;
		contractions?: number;
		etco2?: number;
		expiredAirPostHold?: number;
		lungVolumeLossPerMin?: number;
		gasMix?: string;
		co2TremorOnset?: number;
		mentalChangeTime?: number;
		recoveryQuality?: number;
		endSpO2?: number;
		breatheUpType?: string;
		// Per-rep data (for detailed logging)
		laps?: LapData[];
		// Biometric session summary (aggregated from per-rep data)
		hasBiometricData?: boolean;
		longestHold?: number;
		cumulativeHoldTime?: number;
		lowestSpO2?: number;
		sessionAvgSpO2?: number;
		sessionMinHR?: number;
		sessionMaxHR?: number;
		totalTimeBelow70?: number;
		totalTimeBelow60?: number;
		totalTimeBelow50?: number;
		totalTimeBelow40?: number;
		// Raw biometric CSV for storage (will be uploaded to Firebase Storage)
		rawBiometricCsv?: string;
		// Media
		photoFile?: File;
		youtubeUrl?: string;
		visibility?: SessionVisibility;
		// Tags selected by user from routine's selectableTags
		selectedTags?: string[];
	}

	let { routine, onSubmit, onCancel, defaultVisibility = 'private', showMenstrualCycleTracking = false, saving = false, initialValues = undefined }: Props = $props();

	// Form state - use effect to sync initial value from routine prop
	let disciplineUsed = $state<Discipline>(initialValues?.discipline ?? routine.disciplines[0]);
	
	// Keep discipline in sync if routine changes
	$effect(() => {
		if (routine.disciplines.length > 0 && !routine.disciplines.includes(disciplineUsed)) {
			disciplineUsed = routine.disciplines[0];
		}
	});

	// Session date - default to today, allow dates from 2016 onwards
	const today = new Date();
	const maxPastDate = new Date('2016-01-01'); // Allow dates from 2016

	const formatDateForInput = (date: Date) => {
		return date.toISOString().split('T')[0]; // YYYY-MM-DD
	};

	const formatTimeForInput = (date: Date) => {
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		return `${hours}:${minutes}`;
	};

	let sessionDate = $state<string>(formatDateForInput(today));
	let sessionTime = $state<string>(formatTimeForInput(today));
	let isCompetition = $state<boolean>(false);
	let compeitionOrg = $state<string>('');
	let cardTag = $state<CardTag | undefined>(undefined);
	let recordTag = $state<RecordTag | undefined>(undefined);
	let visibility = $state<SessionVisibility>(defaultVisibility);
	
	// Selectable tags from routine - user can toggle these
	let selectedTags = $state<string[]>([]);
	let hasSelectableTags = $derived(routine.selectableTags && routine.selectableTags.length > 0);
	let attemptKind = $state<AttemptCategoryKind>('standard');
	let customAttemptLabel = $state('');
	let breathingGas = $state<BreathingGas>('air');
	
	// Wet/Dry toggle - defaults to routine's isDryTraining setting for STA disciplines
	// Only show for STA routines that support biometric tracking
	let isSTARoutine = $derived(routine.disciplines.includes('STA'));
	let supportsBiometrics = $derived(routine.trackingConfig.trackPerRepSpO2 || routine.trackingConfig.trackPerRepHR || routine.trackingConfig.isDryTraining);
	let isDrySession = $state<boolean>(routine.trackingConfig.isDryTraining ?? false);

	// Check if this is a max-type routine (show competition toggle for these)
	let isMaxTypeRoutine = $derived(routine.activityType === 'max-attempt' || 
		routine.activityType === 'submax-attempt' ||
		routine.tags?.includes('hybrid') ||
		(routine.protocolType === 'none' && !routine.tags?.includes('free-training')));

	// Smart defaults from routine table - use derived for reactivity
	let defaultRepsCompleted = $derived(routine.table?.rows.length);
	let calculatedRepDuration = $derived(routine.table?.rows.reduce((sum, row) => {
		return sum + (row.targetDuration || 0);
	}, 0));
	let avgRepDuration = $derived(
		calculatedRepDuration && routine.table ? calculatedRepDuration / routine.table.rows.length : undefined
	);

	// Session context
	let poolLength = $state<number | undefined>(initialValues?.poolLength);
	let initialBreatheUpTime = $state<number | undefined>(undefined); // in seconds

	// Performance metrics
	let totalDistance = $state<number | undefined>(initialValues?.totalDistance);
	let totalTimeSeconds = $state<number | undefined>(initialValues?.totalTimeSeconds); // in seconds
	let repsCompleted = $state<number | undefined>(defaultRepsCompleted);
	let repDurationSeconds = $state<number | undefined>(avgRepDuration); // in seconds
	let repDistance = $state<number | undefined>(undefined);
	// Pre-seeded per-lap splits + average speed parsed from a dynamic dive
	// video. These are passed straight through to the log so coaches don't
	// have to retype numbers that the recorder already measured.
	const seededAvgSpeed = initialValues?.avgSpeed;
	const seededLaps = initialValues?.laps;
	// avgSpeed is editable (unless source === 'recorder'), so keep it in state
	// seeded from the recorder output.
	let avgSpeed = $state<number | undefined>(seededAvgSpeed);

	// Training context
	let breathingTechnique = $state<BreathingTechnique | undefined>(undefined);
	let rpe = $state<number | undefined>(undefined);
	let joyScale = $state<number | undefined>(undefined);
	let hoursSinceLastMeal = $state<number | undefined>(undefined);
	let notes = $state<string>(initialValues?.notes ?? '');

	// NEW METRICS
	let waterTemperature = $state<number | undefined>(undefined);
	let contractionsOnsetTime = $state<number | undefined>(undefined); // in seconds
	let equipmentUsed = $state<string>('');
	let buddyName = $state<string>('');
	let restingHeartRate = $state<number | undefined>(undefined);
	let hrv = $state<number | undefined>(undefined);
	let poolType = $state<PoolType | undefined>(undefined);
	let sambaBO = $state<boolean>(false);
	let breathsBetweenReps = $state<number | undefined>(undefined);

	// NEW METRICS - Phase 1
	let menstrualCycleDay = $state<number | undefined>(undefined);
	let facialGearMask = $state<boolean>(false);
	let facialGearNoseclip = $state<boolean>(false);
	let facialGearGoggles = $state<boolean>(false);
	let facialGearNothing = $state<boolean>(false);
	let basalMood = $state<number | undefined>(undefined);
	let minimumSpO2 = $state<number | undefined>(undefined);
	let minimumHR = $state<number | undefined>(undefined);
	let bodyWeight = $state<number | undefined>(undefined);
	let breathingTechniqueLevel = $state<number | undefined>(0); // Default to tidal (0)

	// LUNG CAPACITY
	let fvc = $state<number | undefined>(undefined);
	let fvcWithPacking = $state<number | undefined>(undefined);
	let packingVolume = $state<number | undefined>(undefined);

	// O2-ASSISTED STATIC APNEA
	let lucidity = $state<number | undefined>(undefined);
	let urgeToBreathe = $state<number | undefined>(undefined);
	let contractions = $state<number | undefined>(undefined);
	let etco2 = $state<number | undefined>(undefined);
	let expiredAirPostHold = $state<number | undefined>(undefined);
	let lungVolumeLossPerMin = $state<number | undefined>(undefined);
	let gasMix = $state<string | undefined>(undefined);
	let co2TremorOnset = $state<number | undefined>(undefined);
	let mentalChangeTime = $state<number | undefined>(undefined);
	let recoveryQuality = $state<number | undefined>(undefined);
	let endSpO2 = $state<number | undefined>(undefined);
	let breatheUpType = $state<string | undefined>(undefined);

	// BIOMETRIC TRACKING - Per-rep SpO2/HR for dry static training
	let repEditorData = $state<RepEditorData[]>([]);
	let showBiometricImportModal = $state(false);
	let biometricSummary = $state<ReturnType<typeof calculateSessionBiometricSummary>>(null);
	let rawBiometricCsv = $state<string>(''); // Raw CSV for storage

	// Per-rep starting lung volume (FL/RV/FRC) — opt-in via trackingConfig
	let defaultLungVolume = $state<LungVolume | undefined>(undefined);
	const attemptOptions = $derived(attemptOptionsForDiscipline(disciplineUsed));

	// Handle biometric import from CSV
	function handleBiometricImport(
		reps: RepEditorData[],
		summary: ReturnType<typeof calculateSessionBiometricSummary>,
		rawCsv: string
	) {
		repEditorData = applyDefaultLungVolume(reps, defaultLungVolume);
		biometricSummary = summary;
		rawBiometricCsv = rawCsv;
		// Update reps completed from imported data
		repsCompleted = reps.length;
		// Update session-level SpO2/HR from summary
		if (summary) {
			minimumSpO2 = summary.lowestSpO2;
			minimumHR = summary.sessionMinHR;
			
			// For single max attempt routines (trackTotalTime but not reps-based), 
			// set totalTime from the longest hold
			if (config.trackTotalTime && !config.trackRepsCompleted) {
				totalTimeSeconds = summary.longestHold;
			}
			
			// Set initial breathe-up time from CSV if available and tracked
			if (summary.initialBreatheUpTime !== undefined && config.trackInitialBreatheUpTime) {
				initialBreatheUpTime = summary.initialBreatheUpTime;
			}
		}
	}

	// Auto-calculate total time/distance from interval data based on best (longest) rep
	// For interval training, "total time" means the best rep duration, not sum of all
	let isIntervalRoutine = $derived(routine.table && routine.table.rows.length > 0);
	let isStaticDiscipline = $derived(disciplineUsed === 'STA');
	
	$effect(() => {
		if (!isIntervalRoutine) return; // Only for interval routines
		
		// Calculate longest rep from either repEditorData (if edited) or routine table (default)
		let longestDuration = 0;
		let longestDistance = 0;
		
		if (repEditorData.length > 0) {
			// Use edited data - only completed reps
			for (const rep of repEditorData) {
				if (rep.completed) {
					if (rep.actualDuration && rep.actualDuration > longestDuration) {
						longestDuration = rep.actualDuration;
					}
					if (rep.actualDistance && rep.actualDistance > longestDistance) {
						longestDistance = rep.actualDistance;
					}
				}
			}
		} else if (routine.table) {
			// Use routine table targets (based on reps completed)
			const rowsToUse = routine.table.rows.slice(0, repsCompleted || routine.table.rows.length);
			for (const row of rowsToUse) {
				if (row.targetDuration && row.targetDuration > longestDuration) {
					longestDuration = row.targetDuration;
				}
				if (row.targetDistance && row.targetDistance > longestDistance) {
					longestDistance = row.targetDistance;
				}
			}
		}
		
		if (isStaticDiscipline && longestDuration > 0) {
			// For STA intervals: total time = longest hold duration
			totalTimeSeconds = longestDuration;
		} else if (!isStaticDiscipline && longestDistance > 0) {
			// For dynamic intervals: total distance = longest distance
			totalDistance = longestDistance;
		}
	});

	// Reactive heart color based on joy scale
	const joyHeartColor = $derived(() => {
		if (!joyScale) return '#1a1a1a'; // Very dark for no value
		// Color gradient from dark to neon pink
		const colors = [
			'#1a1a1a', // 0-1: Very dark/black
			'#3a1a2a', // 2: Dark purple
			'#5a1a3a', // 3: Purple
			'#7a1a4a', // 4: Dark magenta
			'#9a1a5a', // 5: Magenta
			'#ba1a6a', // 6: Bright magenta
			'#da1a7a', // 7: Hot pink
			'#ea1483', // 8: Deeper pink
			'#f514a0', // 9: Bright pink
			'#ff1493'  // 10: Neon pink!
		];
		const index = Math.min(Math.max(joyScale - 1, 0), 9);
		return colors[index];
	});

	const joyHeartIcon = $derived(() => {
		// Use broken heart for low values, full heart for high
		return joyScale && joyScale >= 6 ? '💗' : '💔';
	});

	// Breathing technique label helper
	function getTechniqueLabel(level: number): string {
		if (level === 0) return 'Tidal (0)';
		if (level < 0) return `Hypoventilation (${level})`;
		return `Hyperventilation (+${level})`;
	}

	// Media
	let photoFile = $state<File | undefined>(undefined);
	let sourcePhotoFile = $state<File | undefined>(undefined);
	let photoPreviewUrl = $state<string | undefined>(undefined);
	let showPhotoCropper = $state(false);
	let triggerPhotoCrop = $state<(() => void) | undefined>(undefined);
	let youtubeUrl = $state<string>('');
	let youtubeError = $state<string | null>(null);

	function handlePhotoChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];

		if (!file) {
			photoFile = undefined;
			photoPreviewUrl = undefined;
			return;
		}

		if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
			alert('Please select a JPG, PNG, or WebP image');
			return;
		}

		if (file.size > 5 * 1024 * 1024) {
			alert('Image must be under 5MB');
			return;
		}

		sourcePhotoFile = file;
		showPhotoCropper = true;
	}

	function removePhoto() {
		photoFile = undefined;
		sourcePhotoFile = undefined;
		photoPreviewUrl = undefined;
		showPhotoCropper = false;
	}

	function applyCrop(croppedFile: File, previewUrl: string) {
		photoFile = croppedFile;
		photoPreviewUrl = previewUrl;
		showPhotoCropper = false;
	}

	function cancelCrop() {
		showPhotoCropper = false;
		if (!photoPreviewUrl) {
			sourcePhotoFile = undefined;
		}
	}

	function adjustCrop() {
		if (!sourcePhotoFile) return;
		showPhotoCropper = true;
	}

	function handleYouTubeChange() {
		if (!youtubeUrl.trim()) {
			youtubeError = null;
			return;
		}

		if (!isValidYouTubeUrl(youtubeUrl)) {
			youtubeError = 'Invalid YouTube URL';
		} else {
			youtubeError = null;
		}
	}

	function toggleRecordTag(tag: RecordTag) {
		recordTag = recordTag === tag ? undefined : tag;
	}

	function toggleCardTag(tag: CardTag) {
		cardTag = cardTag === tag ? undefined : tag;
	}

	$effect(() => {
		if (!isCompetition) {
			cardTag = undefined;
			recordTag = undefined;
			compeitionOrg = '';
		}
	});

	function handleSubmit(e: Event) {
		e.preventDefault();

		// Auto-apply photo crop if cropper is still open
		if (showPhotoCropper && sourcePhotoFile && !photoFile && triggerPhotoCrop) {
			triggerPhotoCrop();
			// The applyCrop callback will set photoFile, then we continue with submit
			// Use a small timeout to let the crop complete
			setTimeout(() => doSubmit(), 100);
			return;
		}
		
		doSubmit();
	}
	
	function doSubmit() {

		// Collect facial gear array
		const facialGear: string[] = [];
		if (facialGearMask) facialGear.push('mask');
		if (facialGearNoseclip) facialGear.push('noseclip');
		if (facialGearGoggles) facialGear.push('goggles');
		if (facialGearNothing) facialGear.push('nothing');

		const data: LogFormData = {
			disciplineUsed,
			sessionDate,
			sessionTime,
			isCompetition,
			compeitionOrg: isCompetition ? compeitionOrg.trim() || undefined : undefined,
			cardTag,
			recordTag,
			attemptConditions: buildAttemptConditions(),
			visibility,
			// Session context
			isDrySession: isSTARoutine ? isDrySession : undefined,
			poolLength,
			initialBreatheUpTime: initialBreatheUpTime,
			// Performance metrics
			totalDistance,
			totalTime: totalTimeSeconds,
			repsCompleted,
			repDuration: repDurationSeconds,
			repDistance,
			avgSpeed: avgSpeed,
			// Training context
			breathingTechnique,
			rpe,
			joyScale,
			hoursSinceLastMeal,
			notes: notes.trim() || undefined,
			// NEW METRICS
			waterTemperature,
			contractionsOnsetTime: contractionsOnsetTime,
			equipmentUsed: equipmentUsed.trim() || undefined,
			buddyName: buddyName.trim() || undefined,
			restingHeartRate,
			hrv,
			poolType,
			sambaBO: sambaBO || undefined,
			breathsBetweenReps,
			// NEW METRICS - Phase 1
			menstrualCycleDay,
			facialGear: facialGear.length > 0 ? facialGear : undefined,
			basalMood,
			minimumSpO2,
			minimumHR,
			bodyWeight,
			breathingTechniqueLevel,
			// Lung capacity
			fvc,
			fvcWithPacking,
			packingVolume,
			// O2-Assisted Static Apnea
			lucidity,
			urgeToBreathe,
			contractions,
			etco2,
			expiredAirPostHold,
			lungVolumeLossPerMin,
			gasMix: gasMix?.trim() || undefined,
			co2TremorOnset,
			mentalChangeTime,
			recoveryQuality,
			endSpO2,
			breatheUpType: breatheUpType?.trim() || undefined,
			// Per-rep data (biometric tracking)
			laps: repEditorData.length > 0 ? biometricsToLapData(repEditorData.map(r => ({
				repNumber: r.repNumber,
				apneaDuration: r.actualDuration || 0,
				recoveryDuration: r.actualRest || 0,
				spo2Min: r.spo2Min || 0,
				spo2Avg: r.spo2Avg || 0,
				hrMin: r.hrMin || 0,
				hrMax: r.hrMax || 0,
				hrAvg: r.hrAvg || 0,
				timeBelow70: r.timeBelow70 || 0,
				timeBelow60: r.timeBelow60 || 0,
				timeBelow50: r.timeBelow50 || 0,
				timeBelow40: r.timeBelow40 || 0,
				readings: []
			}))).map((lap, i) => ({
				...lap,
				lungVolume: repEditorData[i]?.lungVolume
			})) : seededLaps,
			// Session-level default lung volume (FL/RV/FRC)
			defaultLungVolume,
			// Biometric session summary
			hasBiometricData: biometricSummary?.hasBiometricData,
			longestHold: biometricSummary?.longestHold,
			cumulativeHoldTime: biometricSummary?.cumulativeHoldTime,
			lowestSpO2: biometricSummary?.lowestSpO2,
			sessionAvgSpO2: biometricSummary?.sessionAvgSpO2,
			sessionMinHR: biometricSummary?.sessionMinHR,
			sessionMaxHR: biometricSummary?.sessionMaxHR,
			totalTimeBelow70: biometricSummary?.totalTimeBelow70,
			totalTimeBelow60: biometricSummary?.totalTimeBelow60,
			totalTimeBelow50: biometricSummary?.totalTimeBelow50,
			totalTimeBelow40: biometricSummary?.totalTimeBelow40,
			// Raw biometric CSV for storage
			rawBiometricCsv: rawBiometricCsv || undefined,
			// Media
			photoFile,
			youtubeUrl: youtubeUrl.trim() || undefined,
			// User-selected tags
			selectedTags: selectedTags.length > 0 ? selectedTags : undefined
		};

		onSubmit(data);
	}

	// Use derived for tracking config to ensure reactivity
	let config = $derived(routine.trackingConfig);

	// Per-metric capture-source decisions. Each decision tells the template
	// whether to render an editable input, a read-only "From recording" view,
	// or a disabled CTA prompting the user to record a dive first.
	const totalDistanceDecision = $derived(
		resolveMetricInput(config, 'totalDistance', seededLaps !== undefined || initialValues?.totalDistance !== undefined)
	);
	const totalTimeDecision = $derived(
		resolveMetricInput(config, 'totalTime', initialValues?.totalTimeSeconds !== undefined || (seededLaps?.length ?? 0) > 0)
	);
	const avgSpeedDecision = $derived(
		resolveMetricInput(config, 'avgSpeed', seededAvgSpeed !== undefined)
	);
	const timePerLapDecision = $derived(
		resolveMetricInput(config, 'timePerLap', (seededLaps?.length ?? 0) > 0)
	);
	const speedPerLapDecision = $derived(
		resolveMetricInput(config, 'speedPerLap', (seededLaps?.length ?? 0) > 0)
	);

	// Check if any fields exist in each section
	const hasSessionContext = $derived(config.trackPoolLength || config.trackInitialBreatheUpTime);
	const hasPerformanceMetrics = $derived(
		config.trackTotalDistance ||
			config.trackTotalTime ||
			config.trackRepsCompleted ||
			config.trackRepDuration ||
			config.trackRepDistance ||
			config.trackAvgSpeed
	);
	const hasTrainingContext = $derived(
		config.trackBreathingTechnique ||
			config.trackRPE ||
			config.trackJoyScale ||
			config.trackHoursSinceLastMeal ||
			config.trackNotes
	);
	
	// Check if biometric tracking is enabled - show CSV import for STA routines when user selects "Dry"
	const hasBiometricTracking = $derived(
		isSTARoutine && isDrySession
	);
	
	// Check if this is an interval routine with a variable table (shows per-rep editor)
	const hasVariableTable = $derived(
		routine.table && routine.table.rows.length > 0
	);
	
	// Show interval rep logging if has variable table but NOT showing biometric tracking
	// (biometric tracking already includes the RepEditor with SpO2/HR)
	const showIntervalRepLogging = $derived(
		hasVariableTable && !hasBiometricTracking
	);

	function selectAttemptKind(kind: AttemptCategoryKind): void {
		attemptKind = kind;
		const defaults = defaultConditionsForKind(kind, {
			label: customAttemptLabel,
			breathingGas,
			gasMix,
			lungVolume: defaultLungVolume
		});
		defaultLungVolume = defaults.lungVolume;
		breathingGas = defaults.breathingGas ?? (kind === 'standard' ? 'air' : breathingGas);
		if (kind === 'o2-assisted') gasMix = defaults.gasMix ?? DEFAULT_O2_GAS_MIX;
		if (kind === 'standard') {
			gasMix = undefined;
			customAttemptLabel = '';
		}
	}

	function selectLungVolume(vol: LungVolume): void {
		defaultLungVolume = vol;
		if (vol === 'FRC') attemptKind = 'frc';
		else if (vol === 'RV') attemptKind = 'rv';
		else if (attemptKind === 'frc' || attemptKind === 'rv') attemptKind = 'standard';
	}

	function buildAttemptConditions(): AttemptConditions {
		const effectiveKind: AttemptCategoryKind =
			attemptKind === 'standard' && defaultLungVolume === 'FRC'
				? 'frc'
				: attemptKind === 'standard' && defaultLungVolume === 'RV'
					? 'rv'
					: attemptKind;
		const base = defaultConditionsForKind(effectiveKind, {
			label: customAttemptLabel.trim() || undefined,
			breathingGas,
			gasMix: gasMix?.trim() || undefined,
			lungVolume: defaultLungVolume
		});
		return {
			...base,
			label: effectiveKind === 'custom' ? customAttemptLabel.trim() || undefined : base.label,
			breathingGas,
			gasMix: gasMix?.trim() || base.gasMix,
			lungVolume: defaultLungVolume ?? base.lungVolume
		};
	}
</script>

<form onsubmit={handleSubmit} class="log-form">
	<!-- Form Header -->
	<div class="form-header">
		<h3 class="routine-name">{routine.name}</h3>
		<p class="routine-subtitle">Quick Log</p>
	</div>

	<!-- Wet/Dry Toggle - Show for ALL STA routines so users can choose at session level -->
	{#if isSTARoutine}
		<div class="form-section environment-toggle">
			<div class="pill-switch">
				<button
					type="button"
					class="pill-option"
					class:active={!isDrySession}
					onclick={() => isDrySession = false}
				>
					💧 Wet
				</button>
				<button
					type="button"
					class="pill-option"
					class:active={isDrySession}
					onclick={() => isDrySession = true}
				>
					🏠 Dry
				</button>
			</div>
			<p class="field-hint">
				{isDrySession 
					? 'Dry training enables pulse oximeter CSV import' 
					: 'Wet training (in water) - no oximeter tracking'}
			</p>
		</div>
	{/if}

	<div class="form-section">
		<div class="field-label">Attempt type</div>
		<div class="tag-row">
			{#each attemptOptions as option}
				<button
					type="button"
					class="tag-button"
					class:active={attemptKind === option.kind}
					onclick={() => selectAttemptKind(option.kind)}
					title={option.hint}
				>
					{option.label}
				</button>
			{/each}
		</div>
		{#if attemptKind === 'o2-assisted'}
			<div class="field-grid">
				<label class="field-group">
					<span class="field-label">Gas</span>
					<select bind:value={breathingGas} class="field-input">
						<option value="oxygen">Oxygen</option>
						<option value="nitrox">Nitrox</option>
						<option value="custom">Custom</option>
					</select>
				</label>
				<label class="field-group">
					<span class="field-label">Mix</span>
					<input class="field-input" bind:value={gasMix} placeholder="e.g., 100% O2" />
				</label>
			</div>
		{:else if attemptKind === 'custom'}
			<label class="field-group">
				<span class="field-label">Category label</span>
				<input class="field-input" bind:value={customAttemptLabel} placeholder="e.g., Hypoxic" />
			</label>
		{/if}
	</div>

	<!-- Session Date -->
	<div class="form-section">
		<div class="date-time-row">
			<div class="field-group">
				<label for="sessionDate" class="section-label">Session Date</label>
				<input
					id="sessionDate"
					type="date"
					bind:value={sessionDate}
					min={formatDateForInput(maxPastDate)}
					max={formatDateForInput(today)}
					class="date-input"
					required
				/>
			</div>
			<div class="field-group">
				<label for="sessionTime" class="section-label">Time</label>
				<input
					id="sessionTime"
					type="time"
					bind:value={sessionTime}
					class="field-input time-field"
					required
				/>
			</div>
		</div>
		<p class="field-hint">When did this session take place? (dates from 2016 onwards)</p>

		{#if isMaxTypeRoutine}
			<div class="field-group">
				<label class="field-label">Session Tags</label>
				<div class="tag-row">
					<button
						type="button"
						class="tag-button"
						class:active={isCompetition}
						onclick={() => (isCompetition = !isCompetition)}
					>
						Comp
					</button>
					{#if isCompetition}
						<span class="tag-group-label">Cards</span>
						<div class="tag-group">
							{#each [
								{ value: 'white', label: '⬜️' },
								{ value: 'yellow', label: '🟨' },
								{ value: 'red', label: '🟥' }
							] as card}
								<button
									type="button"
									class="tag-button"
									class:active={cardTag === card.value}
									onclick={() => toggleCardTag(card.value as CardTag)}
									aria-label={`${card.value} card`}
								>
									{card.label}
								</button>
							{/each}
						</div>
						<span class="tag-group-label">Record</span>
						<div class="tag-group">
							{#each ['NR', 'CR', 'WR'] as tag}
								<button
									type="button"
									class="tag-button"
									class:active={recordTag === tag}
									onclick={() => toggleRecordTag(tag as RecordTag)}
								>
									{tag}
								</button>
							{/each}
						</div>
					{/if}
				</div>
				<p class="field-hint">Pick a record tag if applicable (one max)</p>
			</div>
			{#if isCompetition}
				<div class="field-group">
					<label for="competitionOrg" class="field-label">Competition Org</label>
					<input
						id="competitionOrg"
						type="text"
						bind:value={compeitionOrg}
						class="field-input"
						list="competition-org-options"
						placeholder="AIDA or CMAS"
					/>
					<datalist id="competition-org-options">
						<option value="AIDA"></option>
						<option value="CMAS"></option>
					</datalist>
				</div>
			{/if}
		{/if}

		<div class="field-group">
			<label class="field-label">Visibility</label>
			<div class="tag-row">
				<button
					type="button"
					class="tag-button"
					class:active={visibility === 'private'}
					onclick={() => (visibility = 'private')}
				>
					Private
				</button>
				<button
					type="button"
					class="tag-button"
					class:active={visibility === 'public'}
					onclick={() => (visibility = 'public')}
				>
					Public
				</button>
			</div>
			<p class="field-hint">Public sessions can appear in the community feed.</p>
		</div>
	</div>

	<!-- Discipline Selector (if multi-discipline) -->
	{#if routine.disciplines.length > 1}
		<div class="form-section">
			<label class="section-label">Discipline *</label>
			<div class="discipline-buttons">
				{#each routine.disciplines as disc}
					<button
						type="button"
						onclick={() => (disciplineUsed = disc)}
						class="discipline-btn"
						class:active={disciplineUsed === disc}
					>
						{disc}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Selectable Tags (from routine configuration) -->
	{#if hasSelectableTags}
		<div class="form-section">
			<label class="section-label">Tags</label>
			<p class="section-hint">Select any that apply to this session</p>
			<div class="selectable-tags">
				{#each routine.selectableTags || [] as tagValue}
					{@const tagInfo = getTagByValue(tagValue)}
					<button
						type="button"
						class="tag-toggle-btn"
						class:selected={selectedTags.includes(tagValue)}
						onclick={() => {
							if (selectedTags.includes(tagValue)) {
								selectedTags = selectedTags.filter(t => t !== tagValue);
							} else {
								selectedTags = [...selectedTags, tagValue];
							}
						}}
					>
						{#if tagInfo?.icon}<span class="tag-icon">{tagInfo.icon}</span>{/if}
						<span class="tag-label">{tagInfo?.label || tagValue}</span>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Session Context Section -->
	{#if hasSessionContext}
		<div class="form-section">
			<h4 class="section-title">Session Details</h4>

			{#if config.trackPoolLength}
				<div class="field-group">
					<NumberWheelInput
						bind:value={poolLength}
						variant="chip"
						label="Pool Length"
						min={15}
						max={50}
						step={5}
						unit="m"
						compact={true}
					/>
				</div>
			{/if}

			{#if config.trackInitialBreatheUpTime}
				<div class="field-group">
					<DurationInput
						bind:value={initialBreatheUpTime}
						label="Initial Breathe-Up"
						compact={true}
					/>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Performance Metrics Section -->
	{#if hasPerformanceMetrics}
		<div class="form-section">
			<h4 class="section-title">Performance</h4>

			{#if config.trackTotalDistance}
				<div class="field-group">
					<label for="totalDistance" class="field-label">
						Total Distance (m)
						{#if totalDistanceDecision.mode === 'readonly-from-recorder'}
							<span class="from-recorder-badge">From recording</span>
						{/if}
					</label>
					{#if totalDistanceDecision.mode === 'disabled-needs-recorder'}
						<a class="recorder-cta" href="/record">Record a dive to capture this automatically</a>
					{:else}
						<input
							id="totalDistance"
							type="number"
							bind:value={totalDistance}
							min="0"
							class="field-input"
							placeholder="e.g., 175"
							readonly={totalDistanceDecision.mode === 'readonly-from-recorder'}
						/>
					{/if}
				</div>
			{/if}

			{#if config.trackTotalTime}
				<div class="field-group">
					{#if totalTimeDecision.mode === 'readonly-from-recorder'}
						<label class="field-label">
							Total Time
							<span class="from-recorder-badge">From recording</span>
						</label>
						<div class="readonly-display">{totalTimeSeconds ?? '—'} s</div>
					{:else if totalTimeDecision.mode === 'disabled-needs-recorder'}
						<label class="field-label">Total Time</label>
						<a class="recorder-cta" href="/record">Record a dive to capture this automatically</a>
					{:else}
						<DurationInput
							bind:value={totalTimeSeconds}
							label="Total Time"
							hint={routine.table ? '(auto-calculated from table)' : ''}
							compact={true}
						/>
					{/if}
				</div>
			{/if}

			{#if config.trackAvgSpeed}
				<div class="field-group">
					<label for="avgSpeed" class="field-label">
						Avg Speed (m/s)
						{#if avgSpeedDecision.mode === 'readonly-from-recorder'}
							<span class="from-recorder-badge">From recording</span>
						{/if}
					</label>
					{#if avgSpeedDecision.mode === 'disabled-needs-recorder'}
						<a class="recorder-cta" href="/record">Record a dive to capture this automatically</a>
					{:else}
						<input
							id="avgSpeed"
							type="number"
							bind:value={avgSpeed}
							min="0"
							step="0.01"
							class="field-input"
							placeholder="e.g., 1.25"
							readonly={avgSpeedDecision.mode === 'readonly-from-recorder'}
						/>
					{/if}
				</div>
			{/if}

			{#if config.trackSpeedPerLap || config.trackTimePerLap}
				<div class="field-group">
					<label class="field-label">
						Per-Lap Data
						{#if (speedPerLapDecision.mode === 'readonly-from-recorder' || timePerLapDecision.mode === 'readonly-from-recorder')}
							<span class="from-recorder-badge">From recording</span>
						{/if}
					</label>
					{#if speedPerLapDecision.mode === 'disabled-needs-recorder' && timePerLapDecision.mode === 'disabled-needs-recorder'}
						<a class="recorder-cta" href="/record">Record a dive to capture per-lap splits automatically</a>
					{:else if seededLaps && seededLaps.length > 0}
						<div class="readonly-display">{seededLaps.length} lap{seededLaps.length === 1 ? '' : 's'} captured from recording</div>
					{:else}
						<div class="field-hint">Per-lap splits are optional — add them later from video review.</div>
					{/if}
				</div>
			{/if}

			{#if config.trackRepsCompleted}
				<div class="field-group">
					<NumberWheelInput
						bind:value={repsCompleted}
						variant="chip"
						label="Reps Completed"
						min={1}
						max={50}
						hint={routine.numberOfReps ? `Target: ${routine.numberOfReps}` : ''}
						compact={true}
					/>
				</div>
			{/if}

			{#if config.trackRepDuration}
				<div class="field-group">
					<DurationInput
						bind:value={repDurationSeconds}
						label="Rep Duration"
						hint="Target: 1:30"
						compact={true}
					/>
				</div>
			{/if}

			{#if config.trackRepDistance}
				<div class="field-group">
					<label for="repDistance" class="field-label">Rep Distance (m)</label>
					<input
						id="repDistance"
						type="number"
						bind:value={repDistance}
						min="0"
						class="field-input"
						placeholder="e.g., 50"
					/>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Lung Volume (single-rep flows) — when RepEditor isn't shown,
	     the user still needs to tag the session's lung volume. -->
	{#if !showIntervalRepLogging && !hasBiometricTracking}
		<div class="form-section lung-volume-section">
			<label class="field-label" for="qlf-default-lung-volume">Lung volume</label>
			<div id="qlf-default-lung-volume" class="lv-chip-row" role="group" aria-label="Lung volume">
				{#each ['FL', 'RV', 'FRC'] as const as vol}
					<button
						type="button"
						class="lv-chip"
						class:selected={(defaultLungVolume ?? 'FL') === vol}
						aria-pressed={(defaultLungVolume ?? 'FL') === vol}
						onclick={() => selectLungVolume(vol)}
					>
						{vol}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Interval Rep Logging Section (for routines with variable tables) -->
	{#if showIntervalRepLogging}
		<div class="form-section interval-section">
			<div class="section-header">
				<h4 class="section-title">⏱️ Rep Times</h4>
			</div>
			
			<p class="section-description">
				Edit actual times for each rep. Tap a row to mark it skipped.
			</p>

			<RepEditor
				discipline={disciplineUsed}
				plannedReps={routine.numberOfReps || routine.table?.rows.length || 8}
				routineTable={routine.table}
				defaultRestSeconds={routine.restBetweenReps || 180}
				bind:reps={repEditorData}
				trackSpO2={false}
				trackHR={false}
				isDryTraining={false}
				allowEditPlanned={hasVariableTable}
				bind:defaultLungVolume
			/>
		</div>
	{/if}

	<!-- Biometric Tracking Section (for dry static training) -->
	{#if hasBiometricTracking}
		<div class="form-section biometric-section">
			<div class="section-header">
				<h4 class="section-title">
					{#if config.isDryTraining}
						🫁 Dry Static Biometrics
					{:else}
						📊 SpO2/HR Tracking
					{/if}
				</h4>
				<button 
					type="button" 
					class="import-btn"
					onclick={() => showBiometricImportModal = true}
				>
					📊 Import CSV
				</button>
			</div>

			{#if biometricSummary}
				<!-- Show summary from imported data -->
				<div class="biometric-summary">
					<div class="summary-row">
						<span class="summary-label">Longest Hold</span>
						<span class="summary-value">{Math.floor((biometricSummary.longestHold || 0) / 60)}:{((biometricSummary.longestHold || 0) % 60).toString().padStart(2, '0')}</span>
					</div>
					<div class="summary-row">
						<span class="summary-label">Lowest SpO2</span>
						<span class="summary-value spo2-value" class:warning={(biometricSummary.lowestSpO2 || 100) < 80} class:danger={(biometricSummary.lowestSpO2 || 100) < 70}>
							{biometricSummary.lowestSpO2}%
						</span>
					</div>
					<div class="summary-row">
						<span class="summary-label">Min/Max HR</span>
						<span class="summary-value">{biometricSummary.sessionMinHR}/{biometricSummary.sessionMaxHR} bpm</span>
					</div>
					{#if (biometricSummary.totalTimeBelow70 || 0) > 0}
						<div class="threshold-alert warning">
							⚠️ {biometricSummary.totalTimeBelow70}s below 70% SpO2
						</div>
					{/if}
					{#if (biometricSummary.totalTimeBelow60 || 0) > 0}
						<div class="threshold-alert danger">
							🚨 {biometricSummary.totalTimeBelow60}s below 60% SpO2
						</div>
					{/if}
					{#if (biometricSummary.totalTimeBelow50 || 0) > 0}
						<div class="threshold-alert critical">
							💀 {biometricSummary.totalTimeBelow50}s below 50% SpO2
						</div>
					{/if}
					{#if (biometricSummary.totalTimeBelow40 || 0) > 0}
						<div class="threshold-alert extreme">
							☠️ {biometricSummary.totalTimeBelow40}s below 40% SpO2
						</div>
					{/if}
				</div>
			{/if}

			<!-- Per-rep editor -->
			<RepEditor
				discipline={disciplineUsed}
				plannedReps={routine.numberOfReps || routine.table?.rows.length || 8}
				routineTable={routine.table}
				defaultRestSeconds={routine.restBetweenReps || 180}
				bind:reps={repEditorData}
				trackSpO2={config.trackPerRepSpO2 ?? true}
				trackHR={config.trackPerRepHR ?? true}
				isDryTraining={config.isDryTraining ?? true}
				allowEditPlanned={hasVariableTable}
				bind:defaultLungVolume
			/>

			<p class="biometric-hint">
				{#if !biometricSummary}
					💡 Tip: Import CSV data from your pulse oximeter app for detailed tracking
				{:else}
					✅ Biometric data imported. Edit values below if needed.
				{/if}
			</p>
		</div>
	{/if}

	<!-- Training Context Section -->
	{#if hasTrainingContext}
		<div class="form-section">
			<h4 class="section-title">Training Context</h4>

			{#if config.trackBreathingTechnique}
				<div class="field-group">
					<label for="breathingTechniqueLevel" class="field-label">
						Breathing Technique{breathingTechniqueLevel !== undefined ? `: ${getTechniqueLabel(breathingTechniqueLevel)}` : ''}
					</label>
					<input
						id="breathingTechniqueLevel"
						type="range"
						bind:value={breathingTechniqueLevel}
						min="-3"
						max="3"
						step="1"
						class="slider breathing-slider"
					/>
					<div class="slider-labels breathing-labels">
						<span>-3<br/><small>💀 Hypo</small></span>
						<span>-2</span>
						<span>-1</span>
						<span>0<br/><small>Tidal</small></span>
						<span>+1</span>
						<span>+2</span>
						<span>+3<br/><small>Hyper 👽</small></span>
					</div>
				</div>
			{/if}

			{#if config.trackRPE}
				<div class="field-group">
					<label for="rpe" class="field-label">
						Difficulty (RPE){rpe !== undefined ? `: ${rpe}/10` : ''}
					</label>
					<input
						id="rpe"
						type="range"
						bind:value={rpe}
						min="0"
						max="10"
						class="slider"
					/>
					<div class="slider-labels">
						<span>Easy</span>
						<span>Hard</span>
					</div>
				</div>
			{/if}

			{#if config.trackJoyScale}
				<div class="field-group">
					<label for="joyScale" class="field-label">
						Enjoyment{joyScale !== undefined ? `: ${joyScale}/10 ${joyHeartIcon()}` : ''}
					</label>
					<input
						id="joyScale"
						type="range"
						bind:value={joyScale}
						min="0"
						max="10"
						class="slider joy-slider"
						style="--joy-heart-color: {joyHeartColor()}"
					/>
				</div>
			{/if}

			{#if config.trackHoursSinceLastMeal}
				<div class="field-group">
					<label for="hoursSinceLastMeal" class="field-label">Hours Since Last Meal</label>
					<input
						id="hoursSinceLastMeal"
						type="number"
						bind:value={hoursSinceLastMeal}
						min="0"
						step="0.5"
						class="field-input"
						placeholder="e.g., 2.5"
					/>
				</div>
			{/if}

			{#if config.trackNotes}
				<div class="field-group">
					<label for="notes" class="field-label">Notes</label>
					<textarea
						id="notes"
						bind:value={notes}
						rows="3"
						class="field-textarea"
						placeholder="How did it feel? Any observations..."
					></textarea>
				</div>
			{/if}

			{#if config.trackWaterTemperature}
				<div class="field-group">
					<label for="waterTemperature" class="field-label">Water Temperature (°C)</label>
					<input
						id="waterTemperature"
						type="number"
						bind:value={waterTemperature}
						min="0"
						max="40"
						step="0.5"
						class="field-input"
						placeholder="e.g., 28"
					/>
				</div>
			{/if}

			{#if config.trackContractionsOnsetTime}
				<div class="field-group">
					<DurationInput
						bind:value={contractionsOnsetTime}
						label="Contractions Onset Time"
						compact={true}
					/>
				</div>
			{/if}

			{#if config.trackEquipmentUsed}
				<div class="field-group">
					<label for="equipmentUsed" class="field-label">Equipment Used</label>
					<input
						id="equipmentUsed"
						type="text"
						bind:value={equipmentUsed}
						class="field-input"
						placeholder="e.g., Monofin, wetsuit, nose clip"
					/>
				</div>
			{/if}

			{#if config.trackBuddyName}
				<div class="field-group">
					<label for="buddyName" class="field-label">Buddy Name</label>
					<input
						id="buddyName"
						type="text"
						bind:value={buddyName}
						class="field-input"
						placeholder="Training partner's name"
					/>
				</div>
			{/if}

			{#if config.trackRestingHeartRate}
				<div class="field-group">
					<label for="restingHeartRate" class="field-label">Resting Heart Rate (bpm)</label>
					<input
						id="restingHeartRate"
						type="number"
						bind:value={restingHeartRate}
						min="30"
						max="120"
						class="field-input"
						placeholder="e.g., 60"
					/>
				</div>
			{/if}

			{#if config.trackHRV}
				<div class="field-group">
					<label for="hrv" class="field-label">HRV (ms)</label>
					<input
						id="hrv"
						type="number"
						bind:value={hrv}
						min="0"
						class="field-input"
						placeholder="e.g., 50"
					/>
				</div>
			{/if}

			{#if config.trackPoolType}
				<div class="field-group">
					<label for="poolType" class="field-label">Pool Type</label>
					<select id="poolType" bind:value={poolType} class="field-input">
						<option value={undefined}>Select pool type...</option>
						<option value="indoor">Indoor</option>
						<option value="outdoor">Outdoor</option>
					</select>
				</div>
			{/if}

			{#if config.trackSambaBO}
				<div class="field-group">
					<label class="checkbox-label">
						<input type="checkbox" bind:checked={sambaBO} class="checkbox-input" />
						<span>Samba/BO Incident Occurred</span>
					</label>
				</div>
			{/if}

			{#if config.trackBreathsBetweenReps}
				<div class="field-group">
					<NumberWheelInput
						bind:value={breathsBetweenReps}
						variant="chip"
						label="Breaths Between Reps"
						min={1}
						max={10}
						compact={true}
					/>
				</div>
			{/if}

			<!-- NEW METRICS - Phase 1 -->
			{#if config.trackMenstrualCycleDay && showMenstrualCycleTracking}
				<div class="field-group">
					<NumberWheelInput
						bind:value={menstrualCycleDay}
						variant="chip"
						label="Menstrual Cycle Day"
						min={1}
						max={40}
						hint="Day of cycle (1 = day after menstruation starts)"
						compact={true}
					/>
				</div>
			{/if}

			{#if config.trackFacialGear}
				<div class="field-group">
					<label class="field-label">Facial Gear Used</label>
					<div class="checkbox-group">
						<label class="checkbox-label">
							<input type="checkbox" bind:checked={facialGearMask} class="checkbox-input" />
							<span>Mask</span>
						</label>
						<label class="checkbox-label">
							<input type="checkbox" bind:checked={facialGearNoseclip} class="checkbox-input" />
							<span>Nose Clip</span>
						</label>
						<label class="checkbox-label">
							<input type="checkbox" bind:checked={facialGearGoggles} class="checkbox-input" />
							<span>Goggles</span>
						</label>
						<label class="checkbox-label">
							<input type="checkbox" bind:checked={facialGearNothing} class="checkbox-input" />
							<span>Nothing</span>
						</label>
					</div>
				</div>
			{/if}

			{#if config.trackBasalMood}
				<div class="field-group">
					<label for="basalMood" class="field-label">
						Basal Mood (before session){basalMood !== undefined ? `: ${basalMood}/10` : ''}
					</label>
					<input
						id="basalMood"
						type="range"
						bind:value={basalMood}
						min="0"
						max="10"
						class="slider"
					/>
					<div class="slider-labels">
						<span>Low</span>
						<span>High</span>
					</div>
					<p class="field-hint">How was your mood/energy before starting?</p>
				</div>
			{/if}

			{#if config.trackMinimumSpO2}
				<div class="field-group">
					<label for="minimumSpO2" class="field-label">Minimum SpO2 (%)</label>
					<input
						id="minimumSpO2"
						type="number"
						bind:value={minimumSpO2}
						min="0"
						max="100"
						class="field-input"
						placeholder="e.g., 85"
					/>
				</div>
			{/if}

			{#if config.trackMinimumHR}
				<div class="field-group">
					<label for="minimumHR" class="field-label">Minimum HR (bpm)</label>
					<input
						id="minimumHR"
						type="number"
						bind:value={minimumHR}
						min="20"
						max="200"
						class="field-input"
						placeholder="e.g., 42"
					/>
				</div>
			{/if}

			{#if config.trackBodyWeight}
				<div class="field-group">
					<label for="bodyWeight" class="field-label">Body Weight (kg)</label>
					<input
						id="bodyWeight"
						type="number"
						bind:value={bodyWeight}
						min="30"
						max="200"
						step="0.1"
						class="field-input"
						placeholder="e.g., 72.5"
					/>
				</div>
			{/if}

			{#if config.trackFVC}
				<div class="field-group">
					<label for="fvc" class="field-label">FVC (liters)</label>
					<input
						id="fvc"
						type="number"
						bind:value={fvc}
						min="0"
						max="15"
						step="0.1"
						class="field-input"
						placeholder="e.g., 5.2"
					/>
				</div>
			{/if}

			{#if config.trackFVCWithPacking}
				<div class="field-group">
					<label for="fvcWithPacking" class="field-label">FVC with Packing (liters)</label>
					<input
						id="fvcWithPacking"
						type="number"
						bind:value={fvcWithPacking}
						min="0"
						max="15"
						step="0.1"
						class="field-input"
						placeholder="e.g., 7.8"
					/>
				</div>
			{/if}

			{#if config.trackPackingVolume}
				<div class="field-group">
					<label for="packingVolume" class="field-label">
						Packing Volume <span class="field-value-badge">{packingVolume ?? 0}%</span>
					</label>
					<input
						id="packingVolume"
						type="range"
						bind:value={packingVolume}
						min="0"
						max="100"
						step="5"
						class="field-input"
					/>
				</div>
			{/if}
		</div>
	{/if}

	<!-- O2-Assisted Static Apnea Section -->
	{#if config.trackLucidity || config.trackUrgeToBreathe || config.trackContractions || config.trackETCO2 || config.trackExpiredAirPostHold || config.trackLungVolumeLossPerMin || config.trackGasMix || config.trackCO2TremorOnset || config.trackMentalChangeTime || config.trackRecoveryQuality || config.trackEndSpO2 || config.trackBreatheUpType}
		<div class="form-section">
			<h4 class="section-title">🫁 O₂-Assisted Static Metrics</h4>

			{#if config.trackGasMix}
				<div class="field-group">
					<label for="gasMix" class="field-label">Gas Mix</label>
					<input
						id="gasMix"
						type="text"
						bind:value={gasMix}
						class="field-input"
						placeholder="e.g., 100% O2"
					/>
				</div>
			{/if}

			{#if config.trackBreatheUpType}
				<div class="field-group">
					<label for="breatheUpType" class="field-label">Breathe-Up Type</label>
					<input
						id="breatheUpType"
						type="text"
						bind:value={breatheUpType}
						class="field-input"
						placeholder="e.g., continuous 4:6 on 100% O2"
					/>
				</div>
			{/if}



			{#if config.trackExpiredAirPostHold}
				<div class="field-group">
					<label for="expiredAirPostHold" class="field-label">Expired Air Post-Hold (liters)</label>
					<input
						id="expiredAirPostHold"
						type="number"
						bind:value={expiredAirPostHold}
						min="0"
						max="15"
						step="0.1"
						class="field-input"
						placeholder="e.g., 1.7"
					/>
				</div>
			{/if}

			{#if config.trackLungVolumeLossPerMin}
				<div class="field-group">
					<label for="lungVolumeLossPerMin" class="field-label">Lung Volume Loss (L/min)</label>
					<input
						id="lungVolumeLossPerMin"
						type="number"
						bind:value={lungVolumeLossPerMin}
						min="0"
						max="5"
						step="0.01"
						class="field-input"
						placeholder="e.g., 0.27"
					/>
				</div>
			{/if}

			{#if config.trackETCO2}
				<div class="field-group">
					<label for="etco2" class="field-label">ETCO₂ (mmHg)</label>
					<input
						id="etco2"
						type="number"
						bind:value={etco2}
						min="0"
						max="100"
						class="field-input"
						placeholder="e.g., 35"
					/>
				</div>
			{/if}

			{#if config.trackEndSpO2}
				<div class="field-group">
					<label for="endSpO2" class="field-label">End SpO₂ (%)</label>
					<input
						id="endSpO2"
						type="number"
						bind:value={endSpO2}
						min="0"
						max="100"
						class="field-input"
						placeholder="e.g., 65"
					/>
				</div>
			{/if}

			{#if config.trackCO2TremorOnset}
				<div class="field-group">
					<DurationInput
						bind:value={co2TremorOnset}
						label="CO₂ Tremor Onset"
						compact={true}
					/>
				</div>
			{/if}

			{#if config.trackMentalChangeTime}
				<div class="field-group">
					<DurationInput
						bind:value={mentalChangeTime}
						label="Mental Change Time"
						compact={true}
					/>
				</div>
			{/if}

			{#if config.trackLucidity}
				<div class="field-group">
					<label for="lucidity" class="field-label">
						Lucidity{lucidity !== undefined ? `: ${lucidity}/10` : ''}
					</label>
					<input
						id="lucidity"
						type="range"
						bind:value={lucidity}
						min="0"
						max="10"
						class="slider"
					/>
					<div class="slider-labels">
						<span>Confused</span>
						<span>Crystal clear</span>
					</div>
				</div>
			{/if}

			{#if config.trackContractions}
				<div class="field-group">
					<label for="contractions" class="field-label">
						Contractions{contractions !== undefined ? `: ${contractions}/10` : ''}
					</label>
					<input
						id="contractions"
						type="range"
						bind:value={contractions}
						min="0"
						max="10"
						class="slider"
					/>
					<div class="slider-labels">
						<span>None</span>
						<span>Violent</span>
					</div>
				</div>
			{/if}

			{#if config.trackUrgeToBreathe}
				<div class="field-group">
					<label for="urgeToBreathe" class="field-label">
						Urge to Breathe{urgeToBreathe !== undefined ? `: ${urgeToBreathe}/10` : ''}
					</label>
					<input
						id="urgeToBreathe"
						type="range"
						bind:value={urgeToBreathe}
						min="0"
						max="10"
						class="slider"
					/>
					<div class="slider-labels">
						<span>Mild</span>
						<span>Overwhelming</span>
					</div>
				</div>
			{/if}

			{#if config.trackRecoveryQuality}
				<div class="field-group">
					<label for="recoveryQuality" class="field-label">
						Recovery Quality{recoveryQuality !== undefined ? `: ${recoveryQuality}/10` : ''}
					</label>
					<input
						id="recoveryQuality"
						type="range"
						bind:value={recoveryQuality}
						min="0"
						max="10"
						class="slider"
					/>
					<div class="slider-labels">
						<span>Poor</span>
						<span>Clean</span>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Media Section (Optional) -->
	<div class="form-section">
		<h4 class="section-title">Media (Optional)</h4>

		<!-- Photo Upload -->
		<div class="field-group">
			<label class="field-label">Session Photo</label>

			{#if showPhotoCropper && sourcePhotoFile}
				<PhotoCropper 
					file={sourcePhotoFile} 
					onApply={applyCrop} 
					onCancel={cancelCrop}
					bind:triggerApply={triggerPhotoCrop}
				/>
			{:else if photoPreviewUrl}
				<div class="photo-preview">
					<img src={photoPreviewUrl} alt="Preview" class="preview-image" />
					<div class="photo-actions">
						{#if sourcePhotoFile}
							<button type="button" onclick={adjustCrop} class="btn-secondary">
								Adjust Crop
							</button>
						{/if}
						<button type="button" onclick={removePhoto} class="remove-photo-btn">
							Remove
						</button>
					</div>
				</div>
			{:else}
				<input
					type="file"
					accept="image/jpeg,image/png,image/webp"
					onchange={handlePhotoChange}
					class="file-input"
				/>
				<p class="field-hint">JPG, PNG, or WebP • Max 5MB</p>
			{/if}
		</div>

		<!-- YouTube URL -->
		<div class="field-group">
			<label for="youtubeUrl" class="field-label">YouTube Video URL</label>
			<input
				id="youtubeUrl"
				type="url"
				bind:value={youtubeUrl}
				oninput={handleYouTubeChange}
				class="field-input"
				class:error={youtubeError}
				placeholder="https://www.youtube.com/watch?v=..."
			/>
			{#if youtubeError}
				<p class="field-error">{youtubeError}</p>
			{/if}
			{#if youtubeUrl && !youtubeError}
				<p class="field-hint field-success">✓ Valid YouTube URL</p>
			{/if}
		</div>
	</div>

	<!-- Action Buttons -->
	<div class="form-actions">
		<button type="button" onclick={onCancel} class="btn-cancel" disabled={saving}> Cancel </button>
		<button type="submit" class="btn-submit" disabled={saving}>
			{#if saving}
				<span class="saving-spinner"></span>
				Saving...
			{:else}
				Save Log
			{/if}
		</button>
	</div>
</form>

<!-- Saving Overlay -->
{#if saving}
	<div class="saving-overlay">
		<div class="saving-content">
			<div class="saving-spinner-large"></div>
			<p class="saving-text">Saving your session...</p>
			<p class="saving-hint">This may take a moment if uploading a photo</p>
		</div>
	</div>
{/if}

<!-- Biometric Import Modal -->
<BiometricImportModal 
	bind:isOpen={showBiometricImportModal}
	onImport={handleBiometricImport}
/>

<style>
	.log-form {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	/* Form Header */
	.form-header {
		padding-bottom: 1rem;
		border-bottom: 1px solid rgba(148, 163, 184, 0.15);
	}

	.routine-name {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: 0.25rem;
	}

	.routine-subtitle {
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}

	/* Form Sections */
	.form-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.25rem;
		background: rgba(20, 184, 166, 0.03);
		border: 1px solid rgba(148, 163, 184, 0.1);
		border-radius: 8px;
	}

	.lung-volume-section {
		gap: 0.5rem;
	}

	.lv-chip-row {
		display: flex;
		gap: 0.5rem;
	}

	.lv-chip {
		flex: 1;
		min-height: 2.25rem;
		padding: 0.375rem 0.75rem;
		border-radius: 8px;
		background: rgba(148, 163, 184, 0.08);
		border: 1px solid rgba(148, 163, 184, 0.25);
		color: var(--color-text);
		font-size: 0.8125rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		cursor: pointer;
		transition:
			background 0.15s,
			border-color 0.15s,
			color 0.15s;
	}

	.lv-chip:hover {
		background: rgba(148, 163, 184, 0.15);
	}

	.lv-chip.selected {
		background: rgba(20, 184, 166, 0.2);
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.section-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-primary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.5rem;
	}

	.section-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text);
		margin-bottom: 0.5rem;
		display: block;
	}

	/* Field Groups */
	.field-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.field-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text);
	}

	.tag-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	.tag-group-label {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.tag-group {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}

	.tag-button {
		border: 1px solid rgba(148, 163, 184, 0.2);
		background: rgba(15, 23, 42, 0.4);
		color: var(--color-text);
		border-radius: 999px;
		padding: 0.3rem 0.6rem;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.03em;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.tag-button:hover {
		border-color: rgba(148, 163, 184, 0.35);
	}

	.tag-button.active {
		border-color: rgba(56, 189, 248, 0.6);
		background: rgba(56, 189, 248, 0.18);
		color: #e0f2fe;
	}

	/* Input Fields */
	.field-input,
	.date-input {
		width: 100%;
		padding: 0.75rem 1rem;
		background: var(--color-bg);
		border: 1px solid rgba(148, 163, 184, 0.15);
		border-radius: 6px;
		color: var(--color-text);
		font-size: 0.875rem;
		outline: none;
		transition: border-color 0.2s ease;
	}

	.field-input::placeholder {
		color: var(--color-text-muted);
	}

	.field-input:focus {
		border-color: var(--color-primary);
	}

	.date-input::-webkit-calendar-picker-indicator {
		filter: invert(0.85) brightness(1.2);
		opacity: 0.9;
		cursor: pointer;
	}

	.date-input::-webkit-calendar-picker-indicator:hover {
		opacity: 1;
	}

	.field-textarea {
		width: 100%;
		padding: 0.75rem 1rem;
		background: var(--color-bg);
		border: 1px solid rgba(148, 163, 184, 0.15);
		border-radius: 6px;
		color: var(--color-text);
		font-size: 0.875rem;
		outline: none;
		resize: none;
		transition: border-color 0.2s ease;
		font-family: inherit;
	}

	.field-textarea::placeholder {
		color: var(--color-text-muted);
	}

	.field-textarea:focus {
		border-color: var(--color-primary);
	}

	/* Time Input (mm:ss) */
	.time-input {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.time-part {
		flex: 1;
	}

	.time-separator {
		color: var(--color-text-muted);
		font-weight: 600;
		font-size: 1.25rem;
	}

	.date-time-row {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
		gap: 1rem;
		align-items: end;
	}

	.time-field {
		height: 100%;
	}

	/* Discipline Buttons */
	.discipline-buttons {
		display: flex;
		gap: 0.5rem;
	}

	.discipline-btn {
		flex: 1;
		padding: 0.75rem 1rem;
		background: var(--color-bg);
		border: 2px solid rgba(148, 163, 184, 0.15);
		border-radius: 6px;
		color: var(--color-text-muted);
		font-family: 'Courier New', monospace;
		font-size: 0.875rem;
		font-weight: 600;
		text-transform: uppercase;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.discipline-btn:hover {
		border-color: var(--color-primary);
	}

	.discipline-btn.active {
		background: rgba(20, 184, 166, 0.15);
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	/* Selectable Tags */
	.selectable-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.tag-toggle-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.875rem;
		background: var(--color-bg);
		border: 1.5px solid rgba(148, 163, 184, 0.2);
		border-radius: 9999px;
		color: var(--color-text-muted);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.tag-toggle-btn:hover {
		border-color: rgba(168, 85, 247, 0.5);
		color: var(--color-text);
	}

	.tag-toggle-btn.selected {
		background: rgba(168, 85, 247, 0.15);
		border-color: #a855f7;
		color: #a855f7;
	}

	.tag-toggle-btn .tag-icon {
		font-size: 1rem;
	}

	.section-hint {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		margin: 0 0 0.75rem;
	}


	/* Sliders */
	.slider {
		width: 100%;
		height: 6px;
		background: var(--color-bg);
		border-radius: 3px;
		outline: none;
		appearance: none;
		cursor: pointer;
		accent-color: var(--color-primary);
	}

	.slider::-webkit-slider-thumb {
		appearance: none;
		width: 18px;
		height: 18px;
		background: var(--color-primary);
		border-radius: 50%;
		cursor: pointer;
	}

	.slider::-moz-range-thumb {
		width: 18px;
		height: 18px;
		background: var(--color-primary);
		border-radius: 50%;
		border: none;
		cursor: pointer;
	}

	/* Joy Slider - Dynamic Color Heart */
	.joy-slider {
		--joy-heart-color: #1a1a1a;
		accent-color: var(--joy-heart-color);
	}

	.joy-slider::-webkit-slider-thumb {
		appearance: none;
		width: 24px;
		height: 24px;
		cursor: pointer;
		background: var(--joy-heart-color);
		border: none;
		-webkit-mask-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>');
		-webkit-mask-size: contain;
		-webkit-mask-repeat: no-repeat;
		-webkit-mask-position: center;
		mask-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>');
		mask-size: contain;
		mask-repeat: no-repeat;
		mask-position: center;
		filter: drop-shadow(0 0 8px var(--joy-heart-color));
		transition: all 0.3s ease;
	}

	.joy-slider::-moz-range-thumb {
		width: 24px;
		height: 24px;
		background: var(--joy-heart-color);
		border: none;
		cursor: pointer;
		mask-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>');
		mask-size: contain;
		mask-repeat: no-repeat;
		mask-position: center;
		filter: drop-shadow(0 0 8px var(--joy-heart-color));
		transition: all 0.3s ease;
	}

	.slider-labels {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin-top: 0.25rem;
	}

	/* Action Buttons */
	.form-actions {
		display: flex;
		gap: 0.75rem;
		padding-top: 1rem;
		margin-bottom: 3.5rem;
	}

	.btn-cancel {
		flex: 1;
		padding: 0.875rem 1.5rem;
		background: var(--color-bg);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 8px;
		color: var(--color-text-muted);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-cancel:hover {
		background: rgba(148, 163, 184, 0.1);
		color: var(--color-text);
	}

	.btn-submit {
		flex: 2;
		padding: 0.875rem 1.5rem;
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
		border: none;
		border-radius: 8px;
		color: white;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.2s ease;
	}

	.btn-submit:hover {
		opacity: 0.9;
	}

	/* Photo Upload */
	.photo-preview {
		position: relative;
		border-radius: 8px;
		overflow: hidden;
		border: 1px solid rgba(148, 163, 184, 0.15);
	}

	.preview-image {
		width: 100%;
		height: auto;
		display: block;
		max-height: 300px;
		object-fit: cover;
	}

	.photo-actions {
		position: absolute;
		right: 0.5rem;
		bottom: 0.5rem;
		display: flex;
		gap: 0.5rem;
	}

	.btn-secondary {
		padding: 0.5rem 0.75rem;
		background: rgba(148, 163, 184, 0.2);
		color: white;
		border: none;
		border-radius: 6px;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s ease;
	}

	.btn-secondary:hover {
		background: rgba(148, 163, 184, 0.35);
	}

	.remove-photo-btn {
		padding: 0.5rem 1rem;
		background: rgba(239, 68, 68, 0.9);
		color: white;
		border: none;
		border-radius: 6px;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s ease;
	}

	.remove-photo-btn:hover {
		background: rgba(220, 38, 38, 1);
	}

	.file-input {
		width: 100%;
		padding: 0.75rem;
		background: var(--color-bg);
		border: 2px dashed rgba(148, 163, 184, 0.3);
		border-radius: 8px;
		color: var(--color-text);
		cursor: pointer;
		transition: border-color 0.2s ease;
	}

	.file-input:hover {
		border-color: var(--color-primary);
	}

	.field-hint {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin-top: 0.25rem;
	}

	.field-success {
		color: var(--color-secondary);
	}

	.field-error {
		font-size: 0.75rem;
		color: #ef4444;
		margin-top: 0.25rem;
	}

	.field-input.error {
		border-color: #ef4444;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		cursor: pointer;
		font-size: 0.9375rem;
		color: var(--color-text);
	}

	.checkbox-input {
		width: 20px;
		height: 20px;
		cursor: pointer;
		accent-color: var(--color-primary);
	}

	.field-hint-inline {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		font-weight: 400;
		margin-left: 0.5rem;
	}

	/* Checkbox Group (for multi-select like facial gear) */
	.checkbox-group {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.5rem 0;
	}

	/* Breathing Technique Slider Labels */
	.breathing-labels {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		text-align: center;
		gap: 0.25rem;
	}

	.breathing-labels small {
		font-size: 0.65rem;
		display: block;
		margin-top: 0.125rem;
		color: var(--color-text-muted);
	}

	/* Mobile Responsive Adjustments */
	@media (max-width: 640px) {
		.date-time-row {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	/* Biometric Section Styles */
	.biometric-section {
		border: 1px solid rgba(20, 184, 166, 0.2);
		border-radius: 12px;
		background: rgba(20, 184, 166, 0.03);
	}

	.biometric-section .section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.biometric-section .section-title {
		margin: 0;
	}

	/* Interval Rep Logging Section Styles */
	.interval-section {
		border: 1px solid rgba(59, 130, 246, 0.2);
		border-radius: 12px;
		background: rgba(59, 130, 246, 0.03);
	}

	.interval-section .section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.interval-section .section-title {
		margin: 0;
	}

	.interval-section .section-description {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin: 0 0 1rem 0;
	}

	.import-btn {
		padding: 0.5rem 0.75rem;
		background: rgba(20, 184, 166, 0.1);
		border: 1px solid rgba(20, 184, 166, 0.3);
		border-radius: 8px;
		color: var(--color-primary);
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.import-btn:hover {
		background: rgba(20, 184, 166, 0.2);
	}

	.biometric-summary {
		background: rgba(15, 23, 42, 0.5);
		border-radius: 8px;
		padding: 0.75rem;
		margin-bottom: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.summary-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.summary-label {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}

	.summary-value {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.spo2-value.warning {
		color: #f59e0b;
	}

	.spo2-value.danger {
		color: #f97316;
	}

	.spo2-value.critical {
		color: #ef4444;
	}

	.spo2-value.extreme {
		color: #d946ef;
	}

	.threshold-alert {
		margin-top: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		font-size: 0.8125rem;
	}

	.threshold-alert.warning {
		background: rgba(245, 158, 11, 0.1);
		border: 1px solid rgba(245, 158, 11, 0.3);
		color: #f59e0b;
	}

	.threshold-alert.danger {
		background: rgba(249, 115, 22, 0.1);
		border: 1px solid rgba(249, 115, 22, 0.3);
		color: #f97316;
	}

	.threshold-alert.critical {
		background: rgba(239, 68, 68, 0.15);
		border: 1px solid rgba(239, 68, 68, 0.4);
		color: #ef4444;
	}

	.threshold-alert.extreme {
		background: rgba(217, 70, 239, 0.15);
		border: 1px solid rgba(217, 70, 239, 0.4);
		color: #d946ef;
		font-weight: 600;
	}

	.biometric-hint {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin-top: 0.75rem;
		text-align: center;
	}

	/* Wet/Dry Pill Switch */
	.environment-toggle {
		padding: 0.75rem 1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}

	.pill-switch {
		display: flex;
		background: rgba(15, 23, 42, 0.6);
		border-radius: 9999px;
		padding: 4px;
		gap: 4px;
	}

	.pill-option {
		flex: 1;
		padding: 0.625rem 1rem;
		border: none;
		border-radius: 9999px;
		background: transparent;
		color: var(--color-text-muted);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.pill-option:hover:not(.active) {
		background: rgba(255, 255, 255, 0.05);
		color: var(--color-text);
	}

	.pill-option.active {
		background: var(--color-primary);
		color: var(--color-bg);
		font-weight: 600;
	}

	.environment-toggle .field-hint {
		margin-top: 0.5rem;
	}

	.field-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 0.75rem;
		margin-top: 0.75rem;
	}

	/* Saving Overlay */
	.saving-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(15, 23, 42, 0.85);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.saving-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		padding: 2rem;
		background: var(--color-bg-card);
		border-radius: 12px;
		border: 1px solid rgba(20, 184, 166, 0.3);
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
	}

	.saving-text {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.saving-hint {
		font-size: 0.875rem;
		color: var(--color-text-muted);
		margin: 0;
	}

	.saving-spinner,
	.saving-spinner-large {
		display: inline-block;
		border: 3px solid rgba(20, 184, 166, 0.2);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.saving-spinner {
		width: 16px;
		height: 16px;
		margin-right: 0.5rem;
	}

	.saving-spinner-large {
		width: 48px;
		height: 48px;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.btn-submit:disabled,
	.btn-cancel:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	/* Capture-source UI — "From recording" badge, readonly value, recorder CTA */
	.from-recorder-badge {
		display: inline-block;
		margin-left: 0.5rem;
		padding: 0.1rem 0.45rem;
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--color-primary);
		background: rgba(20, 184, 166, 0.12);
		border: 1px solid rgba(20, 184, 166, 0.4);
		border-radius: 999px;
		vertical-align: middle;
	}

	.readonly-display {
		padding: 0.6rem 0.75rem;
		border-radius: 6px;
		background: rgba(148, 163, 184, 0.08);
		color: var(--color-text);
		font-variant-numeric: tabular-nums;
	}

	.recorder-cta {
		display: block;
		padding: 0.75rem;
		border-radius: 6px;
		background: rgba(20, 184, 166, 0.08);
		border: 1px dashed rgba(20, 184, 166, 0.4);
		color: var(--color-primary);
		font-size: 0.85rem;
		text-align: center;
		text-decoration: none;
		font-weight: 500;
	}

	.recorder-cta:hover {
		background: rgba(20, 184, 166, 0.14);
	}
</style>
