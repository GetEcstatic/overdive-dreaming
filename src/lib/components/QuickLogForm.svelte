<script lang="ts">
	import type { RoutineTemplate, Discipline, BreathingTechnique, PoolType } from '$lib/types';
	import { isValidYouTubeUrl } from '$lib/storage';

	interface Props {
		routine: RoutineTemplate;
		onSubmit: (data: LogFormData) => void;
		onCancel: () => void;
	}

	export interface LogFormData {
		disciplineUsed: Discipline;
		// Session context
		poolLength?: number;
		initialBreatheUpTime?: number;
		// Performance metrics
		totalDistance?: number;
		totalTime?: number;
		repsCompleted?: number;
		repDuration?: number;
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
		// Media
		photoFile?: File;
		youtubeUrl?: string;
	}

	let { routine, onSubmit, onCancel }: Props = $props();

	// Form state
	let disciplineUsed = $state<Discipline>(routine.disciplines[0]);

	// Smart defaults from routine table
	const defaultRepsCompleted = routine.table?.rows.length;
	const calculatedRepDuration = routine.table?.rows.reduce((sum, row) => {
		return sum + (row.targetDuration || 0);
	}, 0);
	const avgRepDuration =
		calculatedRepDuration && routine.table ? calculatedRepDuration / routine.table.rows.length : undefined;

	// Session context
	let poolLength = $state<number | undefined>(undefined);
	let breatheUpMinutes = $state<number | undefined>(undefined);
	let breatheUpSeconds = $state<number | undefined>(undefined);

	// Performance metrics
	let totalDistance = $state<number | undefined>(undefined);
	let totalTimeMinutes = $state<number | undefined>(undefined);
	let totalTimeSeconds = $state<number | undefined>(undefined);
	let repsCompleted = $state<number | undefined>(defaultRepsCompleted);
	let repDurationMinutes = $state<number | undefined>(
		avgRepDuration ? Math.floor(avgRepDuration / 60) : undefined
	);
	let repDurationSeconds = $state<number | undefined>(
		avgRepDuration ? avgRepDuration % 60 : undefined
	);

	// Training context
	let breathingTechnique = $state<BreathingTechnique | undefined>(undefined);
	let rpe = $state<number | undefined>(undefined);
	let joyScale = $state<number | undefined>(undefined);
	let hoursSinceLastMeal = $state<number | undefined>(undefined);
	let notes = $state<string>('');

	// NEW METRICS
	let waterTemperature = $state<number | undefined>(undefined);
	let contractionsOnsetMinutes = $state<number | undefined>(undefined);
	let contractionsOnsetSeconds = $state<number | undefined>(undefined);
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

	// Auto-calculate total time from variable table based on reps completed
	$effect(() => {
		if (routine.table && repsCompleted !== undefined && repsCompleted > 0) {
			// Sum the targetDuration for the first X reps (where X = repsCompleted)
			const totalSeconds = routine.table.rows
				.slice(0, repsCompleted)
				.reduce((sum, row) => sum + (row.targetDuration || 0), 0);

			totalTimeMinutes = Math.floor(totalSeconds / 60);
			totalTimeSeconds = totalSeconds % 60;
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
	let photoPreviewUrl = $state<string | undefined>(undefined);
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

		if (!file.type.startsWith('image/')) {
			alert('Please select an image file');
			return;
		}

		if (file.size > 5 * 1024 * 1024) {
			alert('Image must be under 5MB');
			return;
		}

		photoFile = file;

		const reader = new FileReader();
		reader.onload = (e) => {
			photoPreviewUrl = e.target?.result as string;
		};
		reader.readAsDataURL(file);
	}

	function removePhoto() {
		photoFile = undefined;
		photoPreviewUrl = undefined;
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

	function handleSubmit(e: Event) {
		e.preventDefault();

		// Convert mm:ss to total seconds
		const initialBreatheUp =
			breatheUpMinutes !== undefined && breatheUpSeconds !== undefined
				? breatheUpMinutes * 60 + breatheUpSeconds
				: undefined;

		const totalTimeInSeconds =
			totalTimeMinutes !== undefined && totalTimeSeconds !== undefined
				? totalTimeMinutes * 60 + totalTimeSeconds
				: undefined;

		const repDurationInSeconds =
			repDurationMinutes !== undefined && repDurationSeconds !== undefined
				? repDurationMinutes * 60 + repDurationSeconds
				: undefined;

		const contractionsOnset =
			contractionsOnsetMinutes !== undefined && contractionsOnsetSeconds !== undefined
				? contractionsOnsetMinutes * 60 + contractionsOnsetSeconds
				: undefined;

		// Collect facial gear array
		const facialGear: string[] = [];
		if (facialGearMask) facialGear.push('mask');
		if (facialGearNoseclip) facialGear.push('noseclip');
		if (facialGearGoggles) facialGear.push('goggles');
		if (facialGearNothing) facialGear.push('nothing');

		const data: LogFormData = {
			disciplineUsed,
			// Session context
			poolLength,
			initialBreatheUpTime: initialBreatheUp,
			// Performance metrics
			totalDistance,
			totalTime: totalTimeInSeconds,
			repsCompleted,
			repDuration: repDurationInSeconds,
			// Training context
			breathingTechnique,
			rpe,
			joyScale,
			hoursSinceLastMeal,
			notes: notes.trim() || undefined,
			// NEW METRICS
			waterTemperature,
			contractionsOnsetTime: contractionsOnset,
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
			// Media
			photoFile,
			youtubeUrl: youtubeUrl.trim() || undefined
		};

		onSubmit(data);
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
		<p class="routine-subtitle">Quick Log</p>
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
					<label class="field-label">
						Total Time
						{#if routine.table}
							<span class="field-hint-inline">(auto-calculated from table)</span>
						{/if}
					</label>
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
					<label for="contractionsOnset" class="field-label">Contractions Onset Time (mm:ss)</label>
					<div class="time-input-group">
						<input
							type="number"
							bind:value={contractionsOnsetMinutes}
							min="0"
							max="10"
							placeholder="MM"
							class="time-input"
						/>
						<span class="time-separator">:</span>
						<input
							type="number"
							bind:value={contractionsOnsetSeconds}
							min="0"
							max="59"
							placeholder="SS"
							class="time-input"
						/>
					</div>
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
					<label for="breathsBetweenReps" class="field-label">Breaths Between Reps</label>
					<input
						id="breathsBetweenReps"
						type="number"
						bind:value={breathsBetweenReps}
						min="1"
						class="field-input"
						placeholder="e.g., 2"
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
		</div>
	{/if}

	<!-- Media Section (Optional) -->
	<div class="form-section">
		<h4 class="section-title">Media (Optional)</h4>

		<!-- Photo Upload -->
		<div class="field-group">
			<label class="field-label">Session Photo</label>

			{#if photoPreviewUrl}
				<div class="photo-preview">
					<img src={photoPreviewUrl} alt="Preview" class="preview-image" />
					<button type="button" onclick={removePhoto} class="remove-photo-btn">
						Remove
					</button>
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
		<button type="button" onclick={onCancel} class="btn-cancel"> Cancel </button>
		<button type="submit" class="btn-submit"> Save Log </button>
	</div>
</form>

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

	/* Input Fields */
	.field-input {
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

	.remove-photo-btn {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
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
		/* No specific overrides needed for new slider-based UI */
	}
</style>
