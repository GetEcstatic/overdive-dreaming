<script lang="ts">
	/**
	 * WizardNavigation - Back/Next navigation buttons for wizard
	 * Handles step transitions with validation
	 */

	let {
		currentStep,
		totalSteps,
		canProceed = true,
		onBack,
		onNext,
		onSubmit
	}: {
		currentStep: number;
		totalSteps: number;
		canProceed?: boolean;
		onBack: () => void;
		onNext: () => void;
		onSubmit: () => void;
	} = $props();

	let isFirstStep = $derived(currentStep === 1);
	let isLastStep = $derived(currentStep === totalSteps);
</script>

<div class="wizard-navigation">
	<button type="button" class="btn-secondary" onclick={onBack} disabled={isFirstStep}>
		← Back
	</button>

	<div class="step-indicator">
		Step {currentStep} of {totalSteps}
	</div>

	{#if isLastStep}
		<button type="button" class="btn-primary" onclick={onSubmit} disabled={!canProceed}>
			Create Routine
		</button>
	{:else}
		<button type="button" class="btn-primary" onclick={onNext} disabled={!canProceed}>
			Next →
		</button>
	{/if}
</div>

<style>
	.wizard-navigation {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem 0;
		margin-top: 2rem;
		border-top: 1px solid rgba(148, 163, 184, 0.1);
	}

	.step-indicator {
		font-size: 0.875rem;
		color: var(--color-text-muted);
		font-weight: 500;
	}

	.btn-primary,
	.btn-secondary {
		padding: 0.75rem 1.5rem;
		border-radius: 8px;
		font-weight: 600;
		font-size: 0.9375rem;
		cursor: pointer;
		transition: all 0.2s ease;
		border: none;
		min-width: 120px;
	}

	.btn-primary {
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
		color: white;
		box-shadow: 0 4px 12px rgba(20, 184, 166, 0.3);
	}

	.btn-primary:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 6px 16px rgba(20, 184, 166, 0.4);
	}

	.btn-primary:active:not(:disabled) {
		transform: translateY(0);
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		box-shadow: none;
	}

	.btn-secondary {
		background: rgba(148, 163, 184, 0.1);
		color: var(--color-text);
		border: 1px solid rgba(148, 163, 184, 0.2);
	}

	.btn-secondary:hover:not(:disabled) {
		background: rgba(148, 163, 184, 0.15);
		border-color: rgba(148, 163, 184, 0.3);
	}

	.btn-secondary:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	/* Mobile responsive */
	@media (max-width: 640px) {
		.btn-primary,
		.btn-secondary {
			min-width: 100px;
			padding: 0.625rem 1.25rem;
			font-size: 0.875rem;
		}

		.step-indicator {
			font-size: 0.8125rem;
		}
	}
</style>
