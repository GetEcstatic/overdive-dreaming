<script lang="ts">
	/**
	 * SimplifiedRoutineBuilder - New streamlined routine creation wizard
	 * Based on three fundamental routine types:
	 * 1. Max Attempt (single dive)
	 * 2. Interval Series (multiple reps)
	 * 3. Hybrid (intervals + max component)
	 */

	import { user } from '$lib/stores/auth';
	import { createRoutine, updateRoutine, getRoutinesForUser } from '$lib/firestore';
	import type {
		Discipline,
		TrackingConfig,
		DisplayConfig,
		RoutineTable,
		RoutineTemplateFormData,
		RoutineTemplate,
		SimplifiedRoutineType,
		EffortLevel,
		MaxDivePosition,
		IntervalStructure,
		TrackingPreset,
		ActivityType
	} from '$lib/types';

	// Step components
	import TypeSelector from './simplified/TypeSelector.svelte';
	import MaxAttemptConfig from './simplified/MaxAttemptConfig.svelte';
	import IntervalConfig from './simplified/IntervalConfig.svelte';
	import HybridConfig from './simplified/HybridConfig.svelte';
	import TrackingOptions from './simplified/TrackingOptions.svelte';
	import ReviewStep from './simplified/ReviewStep.svelte';

	// Props
	let {
		initialData,
		routineId,
		duplicateFrom,
		onSuccess,
		onCancel
	}: {
		initialData?: RoutineTemplate;
		routineId?: string;
		duplicateFrom?: RoutineTemplate;
		onSuccess?: (routineId: string) => void;
		onCancel?: () => void;
	} = $props();

	// Capture initial data at mount time (props are set once at component creation)
	// These are intentionally captured once - the component creates a new routine from this data
	const _sourceData = duplicateFrom || initialData;
	const _isEditing = !!routineId && !!initialData;
	const _isDuplicating = !!duplicateFrom;

	// ============================================================================
	// WIZARD STATE
	// ============================================================================
	
	type WizardStep = 'select-type' | 'configure' | 'tracking' | 'review';
	let currentStep = $state<WizardStep>('select-type');
	
	// Selected routine type - infer from source data if available
	let selectedType = $state<SimplifiedRoutineType | null>(
		_sourceData ? inferTypeFromRoutine(_sourceData) : null
	);

	// ============================================================================
	// FORM STATE - Basic Info (all types)
	// ============================================================================
	
	let name = $state(_isDuplicating ? `${_sourceData?.name} (Copy)` : (_sourceData?.name || ''));
	let description = $state(_sourceData?.description || '');
	let disciplines = $state<Discipline[]>(_sourceData?.disciplines || []);
	let tags = $state<string[]>(_sourceData?.tags || []);

	// ============================================================================
	// FORM STATE - Max Attempt Specific
	// ============================================================================
	
	let effortLevel = $state<EffortLevel>('max');
	let isDry = $state(_sourceData?.trackingConfig?.isDryTraining || false);

	// ============================================================================
	// FORM STATE - Interval Specific
	// ============================================================================
	
	let intervalStructure = $state<IntervalStructure>('uniform');
	let numberOfReps = $state<number>(_sourceData?.numberOfReps || 8);
	let restBetweenReps = $state<number>(_sourceData?.restBetweenReps || 60);
	let repDistance = $state<number | undefined>(_sourceData?.repDistance);
	let repDuration = $state<number | undefined>(undefined);
	let table = $state<RoutineTable | undefined>(_sourceData?.table);

	// ============================================================================
	// FORM STATE - Hybrid Specific
	// ============================================================================
	
	let maxDivePosition = $state<MaxDivePosition>('end');
	let hybridMaxEffort = $state<EffortLevel>('max');

	// ============================================================================
	// FORM STATE - Tracking Configuration
	// ============================================================================
	
	let trackingPreset = $state<TrackingPreset>('standard');
	let trackingConfig = $state<TrackingConfig>(
		_sourceData?.trackingConfig || getDefaultTrackingConfig('standard')
	);

	// ============================================================================
	// FORM STATE - Display Configuration
	// ============================================================================
	
	let displayConfig = $state<DisplayConfig>(
		_sourceData?.displayConfig || getDefaultDisplayConfig()
	);

	// ============================================================================
	// SUBMISSION STATE
	// ============================================================================
	
	let isSubmitting = $state(false);
	let error = $state<string | null>(null);

	// ============================================================================
	// HELPER FUNCTIONS
	// ============================================================================

	function inferTypeFromRoutine(routine: RoutineTemplate): SimplifiedRoutineType {
		// Check if it's a hybrid (has both interval structure and max component)
		// For now, we don't have hybrid data, so check for intervals vs max
		if (routine.table || routine.numberOfReps) {
			return 'interval-series';
		}
		return 'max-attempt';
	}

	function getDefaultTrackingConfig(preset: TrackingPreset): TrackingConfig {
		const base: TrackingConfig = {
			trackPoolLength: false,
			trackInitialBreatheUpTime: false,
			trackTotalDistance: false,
			trackTotalTime: false,
			trackRepsCompleted: false,
			trackRepDuration: false,
			trackRepDistance: false,
			trackTimePerLap: false,
			trackRestBetweenLaps: false,
			trackKicksPerLap: false,
			trackArmPullsPerLap: false,
			trackBreathingTechnique: false,
			trackRPE: false,
			trackJoyScale: false,
			trackHoursSinceLastMeal: false,
			trackNotes: false,
			trackWaterTemperature: false,
			trackContractionsOnsetTime: false,
			trackEquipmentUsed: false,
			trackBuddyName: false,
			trackRestingHeartRate: false,
			trackHRV: false,
			trackPoolType: false,
			trackSambaBO: false,
			trackBreathsBetweenReps: false,
			trackMenstrualCycleDay: false,
			trackFacialGear: false,
			trackBasalMood: false,
			trackMinimumSpO2: false,
			trackMinimumHR: false,
			trackBodyWeight: false,
			trackPerRepSpO2: false,
			trackPerRepHR: false,
			trackSpO2Thresholds: false,
			isDryTraining: false
		};

		switch (preset) {
			case 'minimal':
				return {
					...base,
					trackTotalDistance: true,
					trackTotalTime: true,
					trackNotes: true
				};
			case 'standard':
				return {
					...base,
					trackTotalDistance: true,
					trackTotalTime: true,
					trackPoolLength: true,
					trackRPE: true,
					trackJoyScale: true,
					trackNotes: true,
					trackBreathingTechnique: true
				};
			case 'full':
				return {
					...base,
					trackPoolLength: true,
					trackInitialBreatheUpTime: true,
					trackTotalDistance: true,
					trackTotalTime: true,
					trackRepsCompleted: true,
					trackRepDuration: true,
					trackRepDistance: true,
					trackTimePerLap: true,
					trackRestBetweenLaps: true,
					trackKicksPerLap: true,
					trackArmPullsPerLap: true,
					trackBreathingTechnique: true,
					trackRPE: true,
					trackJoyScale: true,
					trackHoursSinceLastMeal: true,
					trackNotes: true,
					trackWaterTemperature: true,
					trackContractionsOnsetTime: true,
					trackEquipmentUsed: true,
					trackBuddyName: true,
					trackSambaBO: true
				};
			case 'custom':
			default:
				return base;
		}
	}

	function getDefaultDisplayConfig(): DisplayConfig {
		return {
			heroMetric: 'totalDistance',
			heroMetricLabel: 'Distance',
			secondaryMetric: 'totalTime',
			secondaryMetricLabel: 'Time'
		};
	}

	function mapToActivityType(): ActivityType {
		if (selectedType === 'max-attempt') {
			return effortLevel === 'max' ? 'max-attempt' : 'submax-attempt';
		}
		return 'structured-intervals';
	}

	// ============================================================================
	// NAVIGATION
	// ============================================================================

	function goBack() {
		switch (currentStep) {
			case 'configure':
				currentStep = 'select-type';
				break;
			case 'tracking':
				currentStep = 'configure';
				break;
			case 'review':
				currentStep = 'tracking';
				break;
		}
	}

	function goNext() {
		switch (currentStep) {
			case 'select-type':
				if (selectedType) currentStep = 'configure';
				break;
			case 'configure':
				currentStep = 'tracking';
				break;
			case 'tracking':
				currentStep = 'review';
				break;
		}
	}

	function selectType(type: SimplifiedRoutineType) {
		selectedType = type;
		// Set sensible defaults based on type
		if (type === 'max-attempt') {
			displayConfig = {
				heroMetric: disciplines.includes('STA') ? 'totalTime' : 'totalDistance',
				heroMetricLabel: disciplines.includes('STA') ? 'Time' : 'Distance',
				secondaryMetric: disciplines.includes('STA') ? 'totalDistance' : 'totalTime',
				secondaryMetricLabel: disciplines.includes('STA') ? 'Distance' : 'Time'
			};
		}
		currentStep = 'configure';
	}

	// ============================================================================
	// VALIDATION
	// ============================================================================

	let canProceed = $derived.by(() => {
		switch (currentStep) {
			case 'select-type':
				return selectedType !== null;
			case 'configure':
				return name.trim().length > 0 && 
					description.trim().length > 0 && 
					disciplines.length > 0;
			case 'tracking':
				return true; // Always valid
			case 'review':
				return true;
			default:
				return false;
		}
	});

	// ============================================================================
	// SUBMISSION
	// ============================================================================

	async function handleSubmit() {
		if (!$user || !selectedType) return;

		try {
			isSubmitting = true;
			error = null;

			// Build the routine data
			const routineData: RoutineTemplateFormData = {
				name: name.trim(),
				description: description.trim(),
				disciplines,
				tags: buildTags(),
				activityType: mapToActivityType(),
				trackingConfig: {
					...trackingConfig,
					isDryTraining: isDry
				},
				displayConfig
			};

			// Add interval-specific fields
			if (selectedType === 'interval-series' || selectedType === 'hybrid') {
				if (intervalStructure === 'uniform') {
					routineData.restBetweenReps = restBetweenReps;
					routineData.numberOfReps = numberOfReps;
					if (repDistance) routineData.repDistance = repDistance;
				} else if (table) {
					routineData.table = table;
				}
			}

			let resultId: string;

			if (_isEditing && routineId) {
				await updateRoutine(routineId, routineData);
				resultId = routineId;
			} else {
				resultId = await createRoutine($user.uid, routineData);
			}

			onSuccess?.(resultId);
		} catch (err) {
			console.error('Failed to save routine:', err);
			error = err instanceof Error ? err.message : 'Failed to save routine';
		} finally {
			isSubmitting = false;
		}
	}

	function buildTags(): string[] {
		const result = [...tags];
		
		// Add type-based tags
		if (selectedType === 'max-attempt') {
			result.push(effortLevel);
			if (isDry) result.push('dry');
		}
		
		if (selectedType === 'hybrid') {
			result.push('hybrid');
			result.push(`max-${maxDivePosition}`);
		}

		// Remove duplicates
		return [...new Set(result)];
	}

	// ============================================================================
	// STEP LABELS
	// ============================================================================

	const stepLabels: Record<WizardStep, string> = {
		'select-type': 'Choose Type',
		'configure': 'Configure',
		'tracking': 'Tracking',
		'review': 'Review'
	};

	const stepOrder: WizardStep[] = ['select-type', 'configure', 'tracking', 'review'];
	let currentStepIndex = $derived(stepOrder.indexOf(currentStep));
</script>

<div class="simplified-builder">
	<!-- Progress Indicator -->
	<div class="progress-bar">
		{#each stepOrder as step, index}
			<div 
				class="progress-step"
				class:active={index === currentStepIndex}
				class:completed={index < currentStepIndex}
			>
				<div class="step-dot">{index + 1}</div>
				<span class="step-label">{stepLabels[step]}</span>
			</div>
			{#if index < stepOrder.length - 1}
				<div class="progress-line" class:filled={index < currentStepIndex}></div>
			{/if}
		{/each}
	</div>

	<!-- Step Content -->
	<div class="step-content">
		{#if currentStep === 'select-type'}
			<TypeSelector 
				{selectedType}
				onSelect={selectType}
			/>
		{:else if currentStep === 'configure'}
			{#if selectedType === 'max-attempt'}
				<MaxAttemptConfig
					bind:name
					bind:description
					bind:disciplines
					bind:effortLevel
					bind:isDry
					bind:displayConfig
				/>
			{:else if selectedType === 'interval-series'}
				<IntervalConfig
					bind:name
					bind:description
					bind:disciplines
					bind:intervalStructure
					bind:numberOfReps
					bind:restBetweenReps
					bind:repDistance
					bind:repDuration
					bind:table
					bind:displayConfig
				/>
			{:else if selectedType === 'hybrid'}
				<HybridConfig
					bind:name
					bind:description
					bind:disciplines
					bind:intervalStructure
					bind:numberOfReps
					bind:restBetweenReps
					bind:repDistance
					bind:table
					bind:maxDivePosition
					bind:hybridMaxEffort
					bind:displayConfig
				/>
			{/if}
		{:else if currentStep === 'tracking'}
			<TrackingOptions
				bind:trackingConfig
				{selectedType}
				{disciplines}
				{isDry}
			/>
		{:else if currentStep === 'review'}
			<ReviewStep
				{name}
				{description}
				{disciplines}
				{selectedType}
				{effortLevel}
				{isDry}
				{intervalStructure}
				{numberOfReps}
				{restBetweenReps}
				{repDistance}
				{table}
				{maxDivePosition}
				{hybridMaxEffort}
				{trackingConfig}
				{displayConfig}
				{tags}
			/>
		{/if}
	</div>

	<!-- Error Display -->
	{#if error}
		<div class="error-message">
			{error}
		</div>
	{/if}

	<!-- Navigation -->
	<div class="navigation">
		<button 
			type="button" 
			class="nav-btn secondary"
			onclick={() => currentStep === 'select-type' ? onCancel?.() : goBack()}
		>
			{currentStep === 'select-type' ? 'Cancel' : 'Back'}
		</button>

		{#if currentStep === 'review'}
			<button 
				type="button" 
				class="nav-btn primary"
				onclick={handleSubmit}
				disabled={isSubmitting}
			>
				{#if isSubmitting}
					Saving...
				{:else}
					{_isEditing ? 'Update Routine' : 'Create Routine'}
				{/if}
			</button>
		{:else}
			<button 
				type="button" 
				class="nav-btn primary"
				onclick={goNext}
				disabled={!canProceed}
			>
				Next
			</button>
		{/if}
	</div>
</div>

<style>
	.simplified-builder {
		max-width: 600px;
		margin: 0 auto;
		padding: 1.5rem;
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	/* Progress Bar */
	.progress-bar {
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 2rem;
		padding: 1rem 0;
	}

	.progress-step {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.step-dot {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--color-bg-card);
		border: 2px solid var(--color-text-muted);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text-muted);
		transition: all 0.2s ease;
	}

	.progress-step.active .step-dot {
		border-color: var(--color-primary);
		background: var(--color-primary);
		color: var(--color-bg);
	}

	.progress-step.completed .step-dot {
		border-color: var(--color-primary);
		background: var(--color-primary);
		color: var(--color-bg);
	}

	.step-label {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		text-align: center;
		max-width: 80px;
	}

	.progress-step.active .step-label {
		color: var(--color-primary);
		font-weight: 600;
	}

	.progress-line {
		width: 40px;
		height: 2px;
		background: var(--color-text-muted);
		margin: 0 0.5rem;
		margin-bottom: 1.5rem;
		transition: background 0.2s ease;
	}

	.progress-line.filled {
		background: var(--color-primary);
	}

	/* Step Content */
	.step-content {
		flex: 1;
		margin-bottom: 1.5rem;
	}

	/* Error Message */
	.error-message {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid #ef4444;
		border-radius: 8px;
		padding: 1rem;
		color: #ef4444;
		margin-bottom: 1rem;
		font-size: 0.875rem;
	}

	/* Navigation */
	.navigation {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(148, 163, 184, 0.2);
	}

	.nav-btn {
		padding: 0.875rem 1.5rem;
		border-radius: 8px;
		font-weight: 600;
		font-size: 1rem;
		cursor: pointer;
		transition: all 0.2s ease;
		border: none;
	}

	.nav-btn.secondary {
		background: var(--color-bg-card);
		color: var(--color-text);
		border: 1px solid var(--color-text-muted);
	}

	.nav-btn.secondary:hover {
		background: rgba(148, 163, 184, 0.2);
	}

	.nav-btn.primary {
		background: var(--color-primary);
		color: var(--color-bg);
	}

	.nav-btn.primary:hover:not(:disabled) {
		filter: brightness(1.1);
	}

	.nav-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
