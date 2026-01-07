<script lang="ts">
	import type {
		RoutineTemplate,
		RoutineLog,
		Discipline,
		BreathingTechnique,
		RecordTag,
		CardTag,
		SessionVisibility
	} from '$lib/types';
	import type { LogFormData } from '$lib/components/QuickLogForm.svelte';
	import {
		routineLogToFormData,
		convertSecondsToTimeFields,
		convertTimeFieldsToSeconds
	} from '$lib/utils/formData';
	import MediaManager from '$lib/components/MediaManager.svelte';

	interface Props {
		routine: RoutineTemplate;
		initialData: RoutineLog;
		mode: 'create' | 'edit';
		onSubmit: (
			data: LogFormData,
			photoAction: 'keep' | 'remove' | 'replace' | 'add',
			youtubeAction: 'keep' | 'remove' | 'update' | 'add'
		) => void;
		onCancel: () => void;
	}

	let { routine, initialData, mode, onSubmit, onCancel }: Props = $props();

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
	let cardTag = $state<CardTag | undefined>(formData.cardTag);
	let recordTag = $state<RecordTag | undefined>(formData.recordTag);
	let visibility = $state<SessionVisibility>(formData.visibility ?? 'private');

	// Session context
	let poolLength = $state<number | undefined>(formData.poolLength);
	const breatheUpTime = convertSecondsToTimeFields(formData.initialBreatheUpTime);
	let breatheUpMinutes = $state<number | undefined>(breatheUpTime.minutes);
	let breatheUpSeconds = $state<number | undefined>(breatheUpTime.seconds);

	// Performance metrics
	let totalDistance = $state<number | undefined>(formData.totalDistance);
	const totalTimeFields = convertSecondsToTimeFields(formData.totalTime);
	let totalTimeMinutes = $state<number | undefined>(totalTimeFields.minutes);
	let totalTimeSeconds = $state<number | undefined>(totalTimeFields.seconds);
	let repsCompleted = $state<number | undefined>(formData.repsCompleted);
	const repDurationFields = convertSecondsToTimeFields(formData.repDuration);
	let repDurationMinutes = $state<number | undefined>(repDurationFields.minutes);
	let repDurationSeconds = $state<number | undefined>(repDurationFields.seconds);

	// Training context
	let breathingTechnique = $state<BreathingTechnique | undefined>(formData.breathingTechnique);
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

	// Media state
	let photoFile = $state<File | undefined>(undefined);
	let photoAction = $state<'keep' | 'remove' | 'replace' | 'add'>('keep');
	let youtubeUrl = $state<string>(formData.youtubeUrl || '');
	let youtubeAction = $state<'keep' | 'remove' | 'update' | 'add'>('keep');

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
		}
	});

	// Form submission
	function handleSubmit(e: Event) {
		e.preventDefault();

		// Convert mm:ss to total seconds
		const initialBreatheUp = convertTimeFieldsToSeconds(breatheUpMinutes, breatheUpSeconds);
		const totalTimeInSeconds = convertTimeFieldsToSeconds(totalTimeMinutes, totalTimeSeconds);
		const repDurationInSeconds = convertTimeFieldsToSeconds(repDurationMinutes, repDurationSeconds);

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
			cardTag,
			recordTag,
			visibility,
			// Session context
			poolLength: normalizeNumber(poolLength),
			initialBreatheUpTime: initialBreatheUp,
			// Performance metrics
			totalDistance: normalizeNumber(totalDistance),
			totalTime: totalTimeInSeconds,
			repsCompleted: normalizeNumber(repsCompleted),
			repDuration: repDurationInSeconds,
			// Training context
			breathingTechnique,
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
			config.trackRepDuration
	);
	const hasTrainingContext = $derived(
		config.trackBreathingTechnique ||
			config.trackRPE ||
			config.trackJoyScale ||
			config.trackHoursSinceLastMeal ||
			config.trackNotes
	);
</script>

<form onsubmit={handleSubmit} class="log-form">
	<!-- Form Header -->
	<div class="form-header">
		<h3 class="routine-name">{routine.name}</h3>
		<p class="routine-subtitle">{mode === 'edit' ? 'Edit Log' : 'Quick Log'}</p>
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
					<label for="poolLength" class="field-label">Pool Length (m)</label>
					<input
						id="poolLength"
						type="number"
						bind:value={poolLength}
						min="0"
						class="field-input"
						placeholder="25 or 50"
					/>
				</div>
			{/if}

			{#if config.trackInitialBreatheUpTime}
				<div class="field-group">
					<label class="field-label">Initial Breathe-Up</label>
					<div class="time-input">
						<input
							type="number"
							bind:value={breatheUpMinutes}
							min="0"
							class="field-input time-part"
							placeholder="mm"
						/>
						<span class="time-separator">:</span>
						<input
							type="number"
							bind:value={breatheUpSeconds}
							min="0"
							max="59"
							class="field-input time-part"
							placeholder="ss"
						/>
					</div>
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
					<div class="time-input">
						<input
							type="number"
							bind:value={totalTimeMinutes}
							min="0"
							class="field-input time-part"
							placeholder="mm"
						/>
						<span class="time-separator">:</span>
						<input
							type="number"
							bind:value={totalTimeSeconds}
							min="0"
							max="59"
							class="field-input time-part"
							placeholder="ss"
						/>
					</div>
				</div>
			{/if}

			{#if config.trackRepsCompleted}
				<div class="field-group">
					<label for="repsCompleted" class="field-label">Reps Completed</label>
					<input
						id="repsCompleted"
						type="number"
						bind:value={repsCompleted}
						min="0"
						class="field-input"
						placeholder={routine.numberOfReps ? `Target: ${routine.numberOfReps}` : 'e.g., 16'}
					/>
				</div>
			{/if}

			{#if config.trackRepDuration}
				<div class="field-group">
					<label class="field-label">Rep Duration (target: 1:30)</label>
					<div class="time-input">
						<input
							type="number"
							bind:value={repDurationMinutes}
							min="0"
							class="field-input time-part"
							placeholder="mm"
						/>
						<span class="time-separator">:</span>
						<input
							type="number"
							bind:value={repDurationSeconds}
							min="0"
							max="59"
							class="field-input time-part"
							placeholder="ss"
						/>
					</div>
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

			<!-- NEW METRICS - Phase 1 -->
			{#if config.trackMenstrualCycleDay}
				<div class="field-group">
					<label for="menstrualCycleDay" class="field-label">Menstrual Cycle Day</label>
					<input
						id="menstrualCycleDay"
						type="number"
						bind:value={menstrualCycleDay}
						min="1"
						max="40"
						class="field-input"
						placeholder="e.g., 3"
					/>
					<p class="field-hint">Day of cycle (1 = day after menstruation starts)</p>
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

	<!-- Media Section -->
	<div class="form-section">
		<h4 class="section-title">Media (Optional)</h4>
		<MediaManager
			existingPhotoUrl={initialData.photoUrl}
			existingYoutubeUrl={initialData.youtubeUrl}
			onPhotoChange={handlePhotoChange}
			onYoutubeChange={handleYoutubeChange}
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

	/* Technique Buttons */
	.technique-buttons {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.technique-btn {
		flex: 1;
		min-width: 120px;
		padding: 0.625rem 0.75rem;
		background: var(--color-bg);
		border: 2px solid rgba(148, 163, 184, 0.15);
		border-radius: 6px;
		color: var(--color-text-muted);
		font-size: 0.75rem;
		cursor: pointer;
		transition: all 0.2s ease;
		text-transform: capitalize;
	}

	.technique-btn:hover {
		border-color: var(--color-primary);
	}

	.technique-btn.active {
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

		.technique-btn {
			min-width: 100px;
		}
	}
</style>
