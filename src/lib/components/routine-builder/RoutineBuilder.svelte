<script lang="ts">
	/**
	 * RoutineBuilder - Main wizard container for custom routine creation
	 * Orchestrates all wizard steps and manages form state
	 */

	import { user } from '$lib/stores/auth';
	import { createRoutine } from '$lib/firestore';
	import type {
		Discipline,
		TrackingConfig,
		DisplayConfig,
		RoutineTable,
		RoutineTemplateFormData
	} from '$lib/types';

	// Step components
	import ProgressIndicator from './ProgressIndicator.svelte';
	import WizardNavigation from './WizardNavigation.svelte';
	import BasicInfoStep from './BasicInfoStep.svelte';
	import ProtocolSetupStep from './ProtocolSetupStep.svelte';
	import TrackingSelectionStep from './TrackingSelectionStep.svelte';
	import DisplayConfigStep from './DisplayConfigStep.svelte';
	import ReviewSubmitStep from './ReviewSubmitStep.svelte';

	// Props
	let {
		onSuccess,
		onCancel
	}: {
		onSuccess?: (routineId: string) => void;
		onCancel?: () => void;
	} = $props();

	// Wizard state
	let currentStep = $state(1);
	const totalSteps = 5;
	const stepLabels = ['Basic Info', 'Protocol', 'Tracking', 'Display', 'Review'];

	// Form data (Step 1 - Basic Info)
	let name = $state('');
	let description = $state('');
	let disciplines = $state<Discipline[]>([]);
	let tags = $state<string[]>([]);

	// Form data (Step 2 - Protocol Setup)
	let protocolType = $state<'none' | 'uniform' | 'table'>('none');
	let restBetweenReps = $state<number | undefined>(undefined);
	let repDistance = $state<number | undefined>(undefined);
	let numberOfReps = $state<number | undefined>(undefined);
	let table = $state<RoutineTable | undefined>(undefined);

	// Form data (Step 3 - Tracking Configuration)
	let trackingConfig = $state<TrackingConfig>({
		trackPoolLength: false,
		trackInitialBreatheUpTime: false,
		trackTotalDistance: false,
		trackTotalTime: false,
		trackRepsCompleted: false,
		trackRepDuration: false,
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
		trackSambaBO: false
	});

	// Form data (Step 4 - Display Config)
	let displayConfig = $state<DisplayConfig>({
		heroMetric: 'totalDistance',
		heroMetricLabel: 'Distance',
		secondaryMetric: 'totalTime',
		secondaryMetricLabel: 'Time'
	});

	// Submission state
	let isSubmitting = $state(false);
	let error = $state<string | null>(null);

	// Validation
	let canProceed = $derived.by(() => {
		switch (currentStep) {
			case 1: // Basic Info
				return name.trim().length > 0 && description.trim().length > 0 && disciplines.length > 0;
			case 2: // Protocol Setup
				// Protocol setup is always valid (all fields optional)
				return true;
			case 3: // Tracking
				// Tracking is always valid (can have no fields enabled)
				return true;
			case 4: // Display Config
				return (
					displayConfig.heroMetric &&
					displayConfig.secondaryMetric &&
					displayConfig.heroMetricLabel &&
					displayConfig.secondaryMetricLabel
				);
			case 5: // Review
				return true;
			default:
				return false;
		}
	});

	// Navigation functions
	function goBack() {
		if (currentStep > 1) {
			currentStep--;
			error = null;
		}
	}

	function goNext() {
		if (currentStep < totalSteps && canProceed) {
			currentStep++;
			error = null;
		}
	}

	// Submit routine
	async function handleSubmit() {
		if (!$user) {
			error = 'You must be logged in to create a routine';
			return;
		}

		isSubmitting = true;
		error = null;

		try {
			const routineData: RoutineTemplateFormData = {
				name,
				description,
				disciplines,
				tags,
				trackingConfig,
				displayConfig,
				// Protocol structure (conditional based on type)
				...(protocolType === 'uniform' && {
					restBetweenReps,
					repDistance,
					numberOfReps
				}),
				...(protocolType === 'table' && { table })
			};

			const routineId = await createRoutine($user.uid, routineData);

			// Success callback
			if (onSuccess) {
				onSuccess(routineId);
			}
		} catch (err) {
			console.error('Failed to create routine:', err);
			error = err instanceof Error ? err.message : 'Failed to create routine';
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="routine-builder">
	<!-- Progress Indicator -->
	<ProgressIndicator {currentStep} {totalSteps} {stepLabels} />

	<!-- Step Content -->
	<div class="step-content">
		{#if currentStep === 1}
			<BasicInfoStep bind:name bind:description bind:disciplines bind:tags />
		{:else if currentStep === 2}
			<ProtocolSetupStep
				{disciplines}
				bind:protocolType
				bind:restBetweenReps
				bind:repDistance
				bind:numberOfReps
				bind:table
			/>
		{:else if currentStep === 3}
			<TrackingSelectionStep bind:trackingConfig />
		{:else if currentStep === 4}
			<DisplayConfigStep bind:displayConfig />
		{:else if currentStep === 5}
			<ReviewSubmitStep
				{name}
				{description}
				{disciplines}
				{tags}
				{protocolType}
				{restBetweenReps}
				{repDistance}
				{numberOfReps}
				{table}
				{trackingConfig}
				{displayConfig}
			/>
		{/if}
	</div>

	<!-- Error Message -->
	{#if error}
		<div class="error-message">
			<p>{error}</p>
		</div>
	{/if}

	<!-- Navigation -->
	<WizardNavigation
		{currentStep}
		{totalSteps}
		{canProceed}
		onBack={goBack}
		onNext={goNext}
		onSubmit={handleSubmit}
	/>

	<!-- Cancel Button -->
	{#if onCancel}
		<div class="cancel-section">
			<button type="button" class="btn-cancel" onclick={onCancel}> Cancel </button>
		</div>
	{/if}

	<!-- Loading Overlay -->
	{#if isSubmitting}
		<div class="loading-overlay">
			<div class="loading-spinner"></div>
			<p>Creating routine...</p>
		</div>
	{/if}
</div>

<style>
	.routine-builder {
		width: 100%;
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem 1.5rem;
		position: relative;
	}

	.step-content {
		min-height: 500px;
		margin-bottom: 2rem;
	}

	.error-message {
		background: rgba(239, 68, 68, 0.15);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 8px;
		padding: 1rem;
		margin-bottom: 1rem;
		text-align: center;
	}

	.error-message p {
		color: #ef4444;
		font-size: 0.9375rem;
		margin: 0;
	}

	.cancel-section {
		text-align: center;
		margin-top: 1.5rem;
		padding-top: 1.5rem;
		border-top: 1px solid rgba(148, 163, 184, 0.1);
	}

	.btn-cancel {
		padding: 0.5rem 1.5rem;
		background: transparent;
		border: none;
		color: var(--color-text-muted);
		font-size: 0.875rem;
		cursor: pointer;
		text-decoration: underline;
		transition: opacity 0.2s ease;
	}

	.btn-cancel:hover {
		opacity: 0.7;
	}

	.loading-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(15, 23, 42, 0.9);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		z-index: 9999;
	}

	.loading-spinner {
		width: 48px;
		height: 48px;
		border: 4px solid rgba(20, 184, 166, 0.2);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.loading-overlay p {
		color: var(--color-text);
		font-size: 1rem;
		font-weight: 500;
	}

	/* Mobile responsive */
	@media (max-width: 640px) {
		.routine-builder {
			padding: 1rem;
		}

		.step-content {
			min-height: 400px;
		}
	}
</style>
