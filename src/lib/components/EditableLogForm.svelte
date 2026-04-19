<script lang="ts">
	import type {
		RoutineTemplate,
		RoutineLog,
		Discipline,
		BreathingTechnique,
		PoolType,
		RecordTag,
		CardTag,
		SessionVisibility,
		LapData,
		RepEditorData
	} from '$lib/types';
	import type { LogFormData } from '$lib/components/QuickLogForm.svelte';
	import {
		routineLogToFormData
	} from '$lib/utils/formData';
	import MediaManager from '$lib/components/MediaManager.svelte';
	import BiometricImportModal from '$lib/components/BiometricImportModal.svelte';
	import DurationInput from '$lib/components/DurationInput.svelte';
	import NumberWheelInput from '$lib/components/NumberWheelInput.svelte';
	import { calculateSessionBiometricSummary } from '$lib/utils/biometricCsvParser';
	import { formatTime } from '$lib/utils/time';

	interface Props {
		routine: RoutineTemplate;
		initialData: RoutineLog;
		mode: 'create' | 'edit';
		showMenstrualCycleTracking?: boolean;
		onSubmit: (
			data: LogFormData,
			photoAction: 'keep' | 'remove' | 'replace' | 'add',
			youtubeAction: 'keep' | 'remove' | 'update' | 'add'
		) => void;
		onCancel: () => void;
	}

	let { routine, initialData, mode, showMenstrualCycleTracking = false, onSubmit, onCancel }: Props = $props();

	// Pre-populate from initialData
	const formData = routineLogToFormData(initialData);

	// Form state
	let disciplineUsed = $state<Discipline>(formData.disciplineUsed);

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

	let sessionDate = $state<string>(formData.sessionDate);
	let sessionTime = $state<string>(formData.sessionTime ?? formatTimeForInput(new Date()));
	let isCompetition = $state<boolean>(formData.isCompetition || false);
	let compeitionOrg = $state<string>(formData.compeitionOrg ?? '');
	let cardTag = $state<CardTag | undefined>(formData.cardTag);
	let recordTag = $state<RecordTag | undefined>(formData.recordTag);
	let visibility = $state<SessionVisibility>(formData.visibility ?? 'private');

	// Check if this is an STA routine - show wet/dry toggle for all STA routines
	const isSTARoutine = routine.disciplines.includes('STA');
	// Initialize from existing log data or routine default
	let isDrySession = $state<boolean>(initialData.isDrySession ?? routine.trackingConfig.isDryTraining ?? false);

	// Session context
	let poolLength = $state<number | undefined>(formData.poolLength);
	let initialBreatheUpTime = $state<number | undefined>(formData.initialBreatheUpTime);

	// Performance metrics
	let totalDistance = $state<number | undefined>(formData.totalDistance);
	let totalTimeSeconds = $state<number | undefined>(formData.totalTime);
	let repsCompleted = $state<number | undefined>(formData.repsCompleted);
	let repDurationSeconds = $state<number | undefined>(formData.repDuration);
	let repDistance = $state<number | undefined>(formData.repDistance);

	// Training context
	let breathingTechnique = $state<BreathingTechnique | undefined>(formData.breathingTechnique);
	let waterTemperature = $state<number | undefined>(formData.waterTemperature);
	let contractionsOnsetTime = $state<number | undefined>(formData.contractionsOnsetTime);
	let equipmentUsed = $state<string>(formData.equipmentUsed ?? '');
	let buddyName = $state<string>(formData.buddyName ?? '');
	let restingHeartRate = $state<number | undefined>(formData.restingHeartRate);
	let hrv = $state<number | undefined>(formData.hrv);
	let poolType = $state<PoolType | undefined>(formData.poolType);
	let sambaBO = $state<boolean>(formData.sambaBO || false);
	let breathsBetweenReps = $state<number | undefined>(formData.breathsBetweenReps);
	let rpe = $state<number | undefined>(formData.rpe);
	let joyScale = $state<number | undefined>(formData.joyScale);
	let hoursSinceLastMeal = $state<number | undefined>(formData.hoursSinceLastMeal);
	let notes = $state<string>(formData.notes || '');

	// NEW METRICS - Phase 1
	let menstrualCycleDay = $state<number | undefined>(formData.menstrualCycleDay);
	let facialGearMask = $state<boolean>(formData.facialGear?.includes('mask') || false);
	let facialGearNoseclip = $state<boolean>(formData.facialGear?.includes('noseclip') || false);
	let facialGearGoggles = $state<boolean>(formData.facialGear?.includes('goggles') || false);
	let facialGearNothing = $state<boolean>(formData.facialGear?.includes('nothing') || false);
	let basalMood = $state<number | undefined>(formData.basalMood);
	let minimumSpO2 = $state<number | undefined>(formData.minimumSpO2);
	let minimumHR = $state<number | undefined>(formData.minimumHR);
	let bodyWeight = $state<number | undefined>(formData.bodyWeight);
	let breathingTechniqueLevel = $state<number | undefined>(formData.breathingTechniqueLevel ?? 0);

	// Lung capacity
	let fvc = $state<number | undefined>(formData.fvc);
	let fvcWithPacking = $state<number | undefined>(formData.fvcWithPacking);

	// O2-Assisted Static Apnea
	let lucidity = $state<number | undefined>(formData.lucidity);
	let urgeToBreathe = $state<number | undefined>(formData.urgeToBreathe);
	let contractions = $state<number | undefined>(formData.contractions);
	let etco2 = $state<number | undefined>(formData.etco2);
	let vcAfterStretch = $state<number | undefined>(formData.vcAfterStretch);
	let wetPackedVC = $state<number | undefined>(formData.wetPackedVC);
	let expiredAirPostHold = $state<number | undefined>(formData.expiredAirPostHold);
	let lungVolumeLossPerMin = $state<number | undefined>(formData.lungVolumeLossPerMin);
	let gasMix = $state<string | undefined>(formData.gasMix);
	let co2TremorOnset = $state<number | undefined>(formData.co2TremorOnset);
	let mentalChangeTime = $state<number | undefined>(formData.mentalChangeTime);
	let recoveryQuality = $state<number | undefined>(formData.recoveryQuality);
	let endSpO2 = $state<number | undefined>(formData.endSpO2);
	let breatheUpType = $state<string | undefined>(formData.breatheUpType);

	// Biometric tracking state (from CSV import)
	let showBiometricModal = $state(false);
	let repEditorData = $state<RepEditorData[]>([]);
	let biometricSummary = $state<ReturnType<typeof calculateSessionBiometricSummary>>(
		formData.hasBiometricData ? {
			hasBiometricData: true,
			longestHold: formData.longestHold || 0,
			cumulativeHoldTime: formData.cumulativeHoldTime || 0,
			lowestSpO2: formData.lowestSpO2 || 0,
			sessionAvgSpO2: formData.sessionAvgSpO2 || 0,
			sessionMinHR: formData.sessionMinHR || 0,
			sessionMaxHR: formData.sessionMaxHR || 0,
			totalTimeBelow70: formData.totalTimeBelow70 || 0,
			totalTimeBelow60: formData.totalTimeBelow60 || 0,
			totalTimeBelow50: formData.totalTimeBelow50 || 0,
			totalTimeBelow40: formData.totalTimeBelow40 || 0,
			initialBreatheUpTime: formData.initialBreatheUpTime
		} : null
	);
	let rawBiometricCsv = $state<string | undefined>(undefined);
	let existingLaps = $state<LapData[] | undefined>(formData.laps);

	// Media state
	let photoFile = $state<File | undefined>(undefined);
	let photoAction = $state<'keep' | 'remove' | 'replace' | 'add'>('keep');
	let youtubeUrl = $state<string>(formData.youtubeUrl || '');
	let youtubeAction = $state<'keep' | 'remove' | 'update' | 'add'>('keep');
	let triggerMediaCrop = $state<(() => void) | undefined>(undefined);

	// Handle biometric import from CSV
	function handleBiometricImport(
		reps: RepEditorData[],
		summary: ReturnType<typeof calculateSessionBiometricSummary>,
		rawCsv: string
	) {
		repEditorData = reps;
		biometricSummary = summary;
		rawBiometricCsv = rawCsv;
		// Update reps completed from imported data
		repsCompleted = reps.length;
		// Update session-level SpO2/HR from summary
		if (summary) {
			minimumSpO2 = summary.lowestSpO2;
			minimumHR = summary.sessionMinHR;
		}
		showBiometricModal = false;
	}

	// Reactive heart color based on joy scale (same as QuickLogForm)
	const joyHeartColor = $derived(() => {
		if (!joyScale) return '#1a1a1a';
		const colors = [
			'#1a1a1a',
			'#3a1a2a',
			'#5a1a3a',
			'#7a1a4a',
			'#9a1a5a',
			'#ba1a6a',
			'#da1a7a',
			'#ea1483',
			'#f514a0',
			'#ff1493'
		];
		const index = Math.min(Math.max(joyScale - 1, 0), 9);
		return colors[index];
	});

	const joyHeartIcon = $derived(() => {
		return joyScale && joyScale >= 6 ? '💗' : '💔';
	});

	// Helper function for breathing technique labels
	function getTechniqueLabel(level: number): string {
		if (level === 0) return 'Tidal (0)';
		if (level < 0) return `Hypoventilation (${level})`;
		return `Hyperventilation (+${level})`;
	}

	function normalizeNumber(value: number | undefined | null): number | undefined {
		if (value === undefined || value === null) return undefined;
		const numeric = typeof value === 'number' ? value : Number(value);
		return Number.isFinite(numeric) ? numeric : undefined;
	}

	// Media handlers
	function handlePhotoChange(file: File | null, action: 'add' | 'remove' | 'replace') {
		photoFile = file || undefined;
		photoAction = action;
	}

	function handleYoutubeChange(url: string | null, action: 'add' | 'remove' | 'update') {
		youtubeUrl = url || '';
		youtubeAction = action;
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

	// Form submission
	function handleSubmit(e: Event) {
		e.preventDefault();

		// Auto-apply photo crop if cropper is still open
		if (triggerMediaCrop) {
			triggerMediaCrop();
			// Give time for crop to complete, then submit
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

		// Prepare per-rep biometric lap data (convert RepEditorData to LapData)
		const lapsData: LapData[] | undefined = repEditorData.length > 0 
			? repEditorData.map((r): LapData => ({
				lapNumber: r.repNumber,
				timeSeconds: r.actualDuration || 0,
				restAfterSeconds: r.actualRest || 0,
				completed: r.completed,
				notes: r.notes,
				spo2Min: r.spo2Min,
				spo2Avg: r.spo2Avg,
				hrMin: r.hrMin,
				hrMax: r.hrMax,
				hrAvg: r.hrAvg,
				timeBelow70: r.timeBelow70 || 0,
				timeBelow60: r.timeBelow60 || 0,
				timeBelow50: r.timeBelow50 || 0,
				timeBelow40: r.timeBelow40 || 0
			}))
			: existingLaps; // Keep existing laps if no new import

		const data: LogFormData = {
			disciplineUsed,
			sessionDate,
			sessionTime,
			isCompetition,
			compeitionOrg: isCompetition ? compeitionOrg.trim() || undefined : undefined,
			cardTag,
			recordTag,
			visibility,
			// Session context
			isDrySession: isSTARoutine ? isDrySession : undefined,
			poolLength: normalizeNumber(poolLength),
			initialBreatheUpTime: initialBreatheUpTime,
			// Performance metrics
			totalDistance: normalizeNumber(totalDistance),
			totalTime: totalTimeSeconds,
			repsCompleted: normalizeNumber(repsCompleted),
			repDuration: repDurationSeconds,
			repDistance: normalizeNumber(repDistance),
			// Training context
			breathingTechnique,
			waterTemperature: normalizeNumber(waterTemperature),
			contractionsOnsetTime: contractionsOnsetTime,
			equipmentUsed: equipmentUsed.trim() || undefined,
			buddyName: buddyName.trim() || undefined,
			restingHeartRate: normalizeNumber(restingHeartRate),
			hrv: normalizeNumber(hrv),
			poolType,
			sambaBO,
			breathsBetweenReps: normalizeNumber(breathsBetweenReps),
			rpe: normalizeNumber(rpe),
			joyScale: normalizeNumber(joyScale),
			hoursSinceLastMeal: normalizeNumber(hoursSinceLastMeal),
			notes: notes.trim() || undefined,
			// NEW METRICS - Phase 1
			menstrualCycleDay: normalizeNumber(menstrualCycleDay),
			facialGear: facialGear.length > 0 ? facialGear : undefined,
			basalMood: normalizeNumber(basalMood),
			minimumSpO2: normalizeNumber(minimumSpO2),
			minimumHR: normalizeNumber(minimumHR),
			bodyWeight: normalizeNumber(bodyWeight),
			breathingTechniqueLevel: normalizeNumber(breathingTechniqueLevel),
			// Lung capacity
			fvc: normalizeNumber(fvc),
			fvcWithPacking: normalizeNumber(fvcWithPacking),
			// O2-Assisted Static Apnea
			lucidity: normalizeNumber(lucidity),
			urgeToBreathe: normalizeNumber(urgeToBreathe),
			contractions: normalizeNumber(contractions),
			etco2: normalizeNumber(etco2),
			vcAfterStretch: normalizeNumber(vcAfterStretch),
			wetPackedVC: normalizeNumber(wetPackedVC),
			expiredAirPostHold: normalizeNumber(expiredAirPostHold),
			lungVolumeLossPerMin: normalizeNumber(lungVolumeLossPerMin),
			gasMix: gasMix?.trim() || undefined,
			co2TremorOnset: normalizeNumber(co2TremorOnset),
			mentalChangeTime: normalizeNumber(mentalChangeTime),
			recoveryQuality: normalizeNumber(recoveryQuality),
			endSpO2: normalizeNumber(endSpO2),
			breatheUpType: breatheUpType?.trim() || undefined,
			// Biometric tracking data
			laps: lapsData,
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
			rawBiometricCsv: rawBiometricCsv || undefined,
			// Media
			photoFile,
			youtubeUrl: youtubeUrl.trim() || undefined
		};

		onSubmit(data, photoAction, youtubeAction);
	}

	const config = routine.trackingConfig;

	// Check if any fields exist in each section
	const hasSessionContext = $derived(config.trackPoolLength || config.trackInitialBreatheUpTime);
	const hasPerformanceMetrics = $derived(
		config.trackTotalDistance ||
			config.trackTotalTime ||
			config.trackRepsCompleted ||
			config.trackRepDuration ||
			config.trackRepDistance
	);
	const hasTrainingContext = $derived(
		config.trackBreathingTechnique ||
			config.trackRPE ||
			config.trackJoyScale ||
			config.trackHoursSinceLastMeal ||
			config.trackNotes ||
			config.trackWaterTemperature ||
			config.trackContractionsOnsetTime ||
			config.trackEquipmentUsed ||
			config.trackBuddyName ||
			config.trackRestingHeartRate ||
			config.trackHRV ||
			config.trackPoolType ||
			config.trackSambaBO ||
			config.trackBreathsBetweenReps ||
			config.trackMenstrualCycleDay ||
			config.trackFacialGear ||
			config.trackBasalMood ||
			config.trackMinimumSpO2 ||
			config.trackMinimumHR ||
			config.trackBodyWeight ||
			config.trackFVC ||
			config.trackFVCWithPacking
	);

	// Check if biometric CSV import should be shown - for STA routines when user selects "Dry"
	const hasBiometricTracking = $derived(
		isSTARoutine && isDrySession
	);

	// Check if there's existing biometric data (either from formData or from new import)
	const hasBiometricData = $derived(biometricSummary?.hasBiometricData || false);
</script>

<form onsubmit={handleSubmit} class="log-form">
	<!-- Form Header -->
	<div class="form-header">
		<h3 class="routine-name">{routine.name}</h3>
		<p class="routine-subtitle">{mode === 'edit' ? 'Edit Log' : 'Quick Log'}</p>
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

	<!-- Discipline Selector / Badge -->
	{#if routine.disciplines.length > 1}
		<div class="form-section">
			{#if mode === 'edit'}
				<!-- Locked discipline display -->
				<label class="section-label">Discipline (locked)</label>
				<div class="discipline-locked">
					<span class="discipline-badge">{disciplineUsed}</span>
					<span class="discipline-hint">Discipline cannot be changed after creation</span>
				</div>
			{:else}
				<!-- Editable discipline selector -->
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
			{/if}
		</div>
	{:else if mode === 'edit'}
		<!-- Single discipline, show locked badge -->
		<div class="form-section">
			<label class="section-label">Discipline (locked)</label>
			<div class="discipline-locked">
				<span class="discipline-badge">{disciplineUsed}</span>
				<span class="discipline-hint">Discipline cannot be changed after creation</span>
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
						label="Pool Length"
						min={15}
						max={50}
						step={5}
						unit="m"
					/>
				</div>
			{/if}

			{#if config.trackInitialBreatheUpTime}
				<div class="field-group">
					<label class="field-label">Initial Breathe-Up</label>
					<DurationInput
						bind:value={initialBreatheUpTime}
						max={900}
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
					<label for="totalDistance" class="field-label">Total Distance (m)</label>
					<input
						id="totalDistance"
						type="number"
						bind:value={totalDistance}
						min="0"
						class="field-input"
						placeholder="e.g., 175"
					/>
				</div>
			{/if}

			{#if config.trackTotalTime}
				<div class="field-group">
					<label class="field-label">Total Time</label>
					<DurationInput
						bind:value={totalTimeSeconds}
						max={3600}
					/>
				</div>
			{/if}

			{#if config.trackRepsCompleted}
				<div class="field-group">
					<NumberWheelInput
						bind:value={repsCompleted}
						label="Reps Completed"
						min={1}
						max={50}
						hint={routine.numberOfReps ? `Target: ${routine.numberOfReps}` : ''}
					/>
				</div>
			{/if}

			{#if config.trackRepDuration}
				<div class="field-group">
					<label class="field-label">Rep Duration (target: 1:30)</label>
					<DurationInput
						bind:value={repDurationSeconds}
						max={600}
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
					<label class="field-label">Contractions Onset Time</label>
					<DurationInput
						bind:value={contractionsOnsetTime}
						max={600}
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
						label="Breaths Between Reps"
						min={1}
						max={10}
					/>
				</div>
			{/if}

			<!-- NEW METRICS - Phase 1 -->
			{#if config.trackMenstrualCycleDay && showMenstrualCycleTracking}
				<div class="field-group">
					<NumberWheelInput
						bind:value={menstrualCycleDay}
						label="Menstrual Cycle Day"
						min={1}
						max={40}
						hint="Day of cycle (1 = day after menstruation starts)"
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

			<!-- O2-Assisted Static Apnea Fields -->
			{#if config.trackGasMix}
				<div class="field-group">
					<label for="edit-gasMix" class="field-label">Gas Mix</label>
					<input id="edit-gasMix" type="text" bind:value={gasMix} class="field-input" placeholder="e.g., 100% O2" />
				</div>
			{/if}
			{#if config.trackBreatheUpType}
				<div class="field-group">
					<label for="edit-breatheUpType" class="field-label">Breathe-Up Type</label>
					<input id="edit-breatheUpType" type="text" bind:value={breatheUpType} class="field-input" placeholder="e.g., continuous 4:6 on 100% O2" />
				</div>
			{/if}
			{#if config.trackVCAfterStretch}
				<div class="field-group">
					<label for="edit-vcAfterStretch" class="field-label">VC After Stretch (liters)</label>
					<input id="edit-vcAfterStretch" type="number" bind:value={vcAfterStretch} min="0" max="15" step="0.1" class="field-input" placeholder="e.g., 3.8" />
				</div>
			{/if}
			{#if config.trackWetPackedVC}
				<div class="field-group">
					<label for="edit-wetPackedVC" class="field-label">Wet Packed VC (liters)</label>
					<input id="edit-wetPackedVC" type="number" bind:value={wetPackedVC} min="0" max="15" step="0.1" class="field-input" placeholder="e.g., 4.92" />
				</div>
			{/if}
			{#if config.trackExpiredAirPostHold}
				<div class="field-group">
					<label for="edit-expiredAirPostHold" class="field-label">Expired Air Post-Hold (liters)</label>
					<input id="edit-expiredAirPostHold" type="number" bind:value={expiredAirPostHold} min="0" max="15" step="0.1" class="field-input" placeholder="e.g., 1.7" />
				</div>
			{/if}
			{#if config.trackLungVolumeLossPerMin}
				<div class="field-group">
					<label for="edit-lungVolumeLossPerMin" class="field-label">Lung Volume Loss (L/min)</label>
					<input id="edit-lungVolumeLossPerMin" type="number" bind:value={lungVolumeLossPerMin} min="0" max="5" step="0.01" class="field-input" placeholder="e.g., 0.27" />
				</div>
			{/if}
			{#if config.trackETCO2}
				<div class="field-group">
					<label for="edit-etco2" class="field-label">ETCO₂ (mmHg)</label>
					<input id="edit-etco2" type="number" bind:value={etco2} min="0" max="100" class="field-input" placeholder="e.g., 35" />
				</div>
			{/if}
			{#if config.trackEndSpO2}
				<div class="field-group">
					<label for="edit-endSpO2" class="field-label">End SpO₂ (%)</label>
					<input id="edit-endSpO2" type="number" bind:value={endSpO2} min="0" max="100" class="field-input" placeholder="e.g., 65" />
				</div>
			{/if}
			{#if config.trackCO2TremorOnset}
				<div class="field-group">
					<DurationInput bind:value={co2TremorOnset} label="CO₂ Tremor Onset" compact={true} />
				</div>
			{/if}
			{#if config.trackMentalChangeTime}
				<div class="field-group">
					<DurationInput bind:value={mentalChangeTime} label="Mental Change Time" compact={true} />
				</div>
			{/if}
			{#if config.trackLucidity}
				<div class="field-group">
					<label for="edit-lucidity" class="field-label">Lucidity{lucidity !== undefined ? `: ${lucidity}/10` : ''}</label>
					<input id="edit-lucidity" type="range" bind:value={lucidity} min="0" max="10" class="slider" />
					<div class="slider-labels"><span>Confused</span><span>Crystal clear</span></div>
				</div>
			{/if}
			{#if config.trackContractions}
				<div class="field-group">
					<label for="edit-contractions" class="field-label">Contractions{contractions !== undefined ? `: ${contractions}/10` : ''}</label>
					<input id="edit-contractions" type="range" bind:value={contractions} min="0" max="10" class="slider" />
					<div class="slider-labels"><span>None</span><span>Violent</span></div>
				</div>
			{/if}
			{#if config.trackUrgeToBreathe}
				<div class="field-group">
					<label for="edit-urgeToBreathe" class="field-label">Urge to Breathe{urgeToBreathe !== undefined ? `: ${urgeToBreathe}/10` : ''}</label>
					<input id="edit-urgeToBreathe" type="range" bind:value={urgeToBreathe} min="0" max="10" class="slider" />
					<div class="slider-labels"><span>Mild</span><span>Overwhelming</span></div>
				</div>
			{/if}
			{#if config.trackRecoveryQuality}
				<div class="field-group">
					<label for="edit-recoveryQuality" class="field-label">Recovery Quality{recoveryQuality !== undefined ? `: ${recoveryQuality}/10` : ''}</label>
					<input id="edit-recoveryQuality" type="range" bind:value={recoveryQuality} min="0" max="10" class="slider" />
					<div class="slider-labels"><span>Poor</span><span>Clean</span></div>
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
		</div>
	{/if}

	<!-- Biometric Tracking Section -->
	{#if hasBiometricTracking || hasBiometricData}
		<div class="form-section biometric-section">
			<h4 class="section-title">📊 Biometric Tracking</h4>
			
			{#if hasBiometricData && biometricSummary}
				<!-- Display existing biometric summary -->
				<div class="biometric-summary">
					<div class="summary-grid">
						<div class="summary-item">
							<span class="summary-label">Longest Hold</span>
							<span class="summary-value">{formatTime(biometricSummary.longestHold || 0)}</span>
						</div>
						{#if biometricSummary.cumulativeHoldTime}
							<div class="summary-item">
								<span class="summary-label">Total Hold Time</span>
								<span class="summary-value">{formatTime(biometricSummary.cumulativeHoldTime)}</span>
							</div>
						{/if}
						<div class="summary-item">
							<span class="summary-label">Lowest SpO2</span>
							<span class="summary-value spo2-value" class:warning={(biometricSummary.lowestSpO2 || 100) < 80} class:danger={(biometricSummary.lowestSpO2 || 100) < 70}>
								{biometricSummary.lowestSpO2}%
							</span>
						</div>
						<div class="summary-item">
							<span class="summary-label">HR Range</span>
							<span class="summary-value">{biometricSummary.sessionMinHR}-{biometricSummary.sessionMaxHR} bpm</span>
						</div>
					</div>
					
					<!-- Time Below Thresholds -->
					{#if biometricSummary.totalTimeBelow70 || biometricSummary.totalTimeBelow60 || biometricSummary.totalTimeBelow50 || biometricSummary.totalTimeBelow40}
						<div class="threshold-alerts">
							{#if biometricSummary.totalTimeBelow70}
								<div class="threshold-alert warning">
									⚠️ {formatTime(biometricSummary.totalTimeBelow70)} below 70%
								</div>
							{/if}
							{#if biometricSummary.totalTimeBelow60}
								<div class="threshold-alert danger">
									🔴 {formatTime(biometricSummary.totalTimeBelow60)} below 60%
								</div>
							{/if}
							{#if biometricSummary.totalTimeBelow50}
								<div class="threshold-alert critical">
									⛔ {formatTime(biometricSummary.totalTimeBelow50)} below 50%
								</div>
							{/if}
							{#if biometricSummary.totalTimeBelow40}
								<div class="threshold-alert extreme">
									☠️ {formatTime(biometricSummary.totalTimeBelow40)} below 40%
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Import/Re-import button -->
			<button 
				type="button" 
				class="import-csv-btn" 
				onclick={() => showBiometricModal = true}
			>
				{hasBiometricData ? '📥 Re-import CSV Data' : '📥 Import Pulse Oximeter CSV'}
			</button>
			
			{#if !hasBiometricData}
				<p class="helper-text">Import data from your pulse oximeter to track per-rep SpO2 and heart rate.</p>
			{/if}
		</div>
	{/if}

	<!-- Biometric Import Modal -->
	<BiometricImportModal
		bind:isOpen={showBiometricModal}
		onImport={handleBiometricImport}
	/>

	<!-- Media Section -->
	<div class="form-section">
		<h4 class="section-title">Media (Optional)</h4>
		<MediaManager
			existingPhotoUrl={initialData.photoUrl}
			existingYoutubeUrl={initialData.youtubeUrl}
			onPhotoChange={handlePhotoChange}
			onYoutubeChange={handleYoutubeChange}
			bind:triggerApplyCrop={triggerMediaCrop}
		/>
	</div>

	<!-- Action Buttons -->
	<div class="form-actions">
		<button type="button" onclick={onCancel} class="btn-cancel"> Cancel </button>
		<button type="submit" class="btn-submit"> Save Changes </button>
	</div>
</form>

<style>
	/* Copy all styles from QuickLogForm.svelte */
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

	/* Discipline Locked Display */
	.discipline-locked {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: rgba(148, 163, 184, 0.05);
		border: 1px solid rgba(148, 163, 184, 0.15);
		border-radius: 6px;
	}

	.discipline-badge {
		display: inline-block;
		padding: 0.5rem 1rem;
		background: rgba(20, 184, 166, 0.15);
		border: 2px solid var(--color-primary);
		border-radius: 6px;
		color: var(--color-primary);
		font-family: 'Courier New', monospace;
		font-size: 0.875rem;
		font-weight: 600;
		text-transform: uppercase;
		width: fit-content;
	}

	.discipline-hint {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		font-style: italic;
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

	/* Checkbox Group (for multi-select like facial gear) */
	.checkbox-group {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.5rem 0;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		cursor: pointer;
		font-size: 0.875rem;
		color: var(--color-text);
	}

	.checkbox-input {
		width: 20px;
		height: 20px;
		cursor: pointer;
		accent-color: var(--color-primary);
	}

	/* Field Hints */
	.field-hint {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		font-style: italic;
		margin-top: 0.25rem;
	}

	/* Action Buttons */
	.form-actions {
		display: flex;
		gap: 0.75rem;
		padding-top: 1rem;
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

	/* Mobile Responsive Adjustments */
	@media (max-width: 640px) {
		.date-time-row {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	/* Biometric Section Styles */
	.biometric-section {
		border: 1px solid rgba(20, 184, 166, 0.3);
		border-radius: 12px;
		padding: 1rem;
		background: rgba(20, 184, 166, 0.05);
	}

	.biometric-summary {
		margin-bottom: 1rem;
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.summary-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.summary-label {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.summary-value {
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text);
		font-variant-numeric: tabular-nums;
	}

	.summary-value.spo2-value.warning {
		color: #f59e0b;
	}

	.summary-value.spo2-value.danger {
		color: #f97316;
	}

	.summary-value.spo2-value.critical {
		color: #ef4444;
	}

	.summary-value.spo2-value.extreme {
		color: #d946ef;
	}

	.threshold-alerts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.threshold-alert {
		padding: 0.375rem 0.75rem;
		border-radius: 6px;
		font-size: 0.75rem;
		font-weight: 500;
	}

	.threshold-alert.warning {
		background: rgba(245, 158, 11, 0.15);
		color: #f59e0b;
		border: 1px solid rgba(245, 158, 11, 0.3);
	}

	.threshold-alert.danger {
		background: rgba(249, 115, 22, 0.15);
		color: #f97316;
		border: 1px solid rgba(249, 115, 22, 0.3);
	}

	.threshold-alert.critical {
		background: rgba(239, 68, 68, 0.2);
		color: #ef4444;
		border: 1px solid rgba(239, 68, 68, 0.5);
	}

	.threshold-alert.extreme {
		background: rgba(217, 70, 239, 0.2);
		color: #d946ef;
		border: 1px solid rgba(217, 70, 239, 0.5);
	}

	.import-csv-btn {
		width: 100%;
		padding: 0.75rem 1rem;
		background: rgba(20, 184, 166, 0.1);
		border: 1px dashed rgba(20, 184, 166, 0.5);
		border-radius: 8px;
		color: var(--color-primary);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.import-csv-btn:hover {
		background: rgba(20, 184, 166, 0.15);
		border-style: solid;
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
</style>
