<script lang="ts">
	/**
	 * ProgressIndicator - Visual progress bar for wizard steps
	 * Shows which step the user is on and completed steps
	 */

	let {
		currentStep = 1,
		totalSteps = 5,
		stepLabels = ['Basic Info', 'Protocol', 'Tracking', 'Display', 'Review']
	}: {
		currentStep: number;
		totalSteps: number;
		stepLabels: string[];
	} = $props();
</script>

<div class="progress-indicator">
	<div class="steps">
		{#each stepLabels as label, index}
			{@const stepNumber = index + 1}
			{@const isCompleted = stepNumber < currentStep}
			{@const isCurrent = stepNumber === currentStep}

			<div class="step" class:completed={isCompleted} class:current={isCurrent}>
				<div class="step-marker">
					{#if isCompleted}
						<span class="checkmark">✓</span>
					{:else}
						<span class="number">{stepNumber}</span>
					{/if}
				</div>
				<div class="step-label">{label}</div>
			</div>

			{#if stepNumber < totalSteps}
				<div class="step-connector" class:completed={isCompleted}></div>
			{/if}
		{/each}
	</div>
</div>

<style>
	.progress-indicator {
		width: 100%;
		padding: 1.5rem 0;
		background: var(--color-bg-card);
		border-radius: 12px;
		margin-bottom: 2rem;
	}

	.steps {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 2rem;
	}

	.step {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		flex: 0 0 auto;
	}

	.step-marker {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(148, 163, 184, 0.2);
		border: 2px solid rgba(148, 163, 184, 0.3);
		color: var(--color-text-muted);
		font-weight: 600;
		transition: all 0.3s ease;
	}

	.step.current .step-marker {
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
		border-color: var(--color-primary);
		color: white;
		transform: scale(1.1);
		box-shadow: 0 0 0 4px rgba(20, 184, 166, 0.2);
	}

	.step.completed .step-marker {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: white;
	}

	.checkmark {
		font-size: 1.25rem;
		font-weight: bold;
	}

	.number {
		font-size: 1rem;
	}

	.step-label {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		text-align: center;
		white-space: nowrap;
		transition: color 0.3s ease;
	}

	.step.current .step-label {
		color: var(--color-primary);
		font-weight: 600;
	}

	.step.completed .step-label {
		color: var(--color-text);
	}

	.step-connector {
		flex: 1;
		height: 2px;
		background: rgba(148, 163, 184, 0.3);
		margin: 0 1rem;
		transition: background 0.3s ease;
	}

	.step-connector.completed {
		background: var(--color-primary);
	}

	/* Mobile responsive */
	@media (max-width: 640px) {
		.steps {
			padding: 0 1rem;
		}

		.step-marker {
			width: 32px;
			height: 32px;
		}

		.step-label {
			font-size: 0.625rem;
		}

		.step-connector {
			margin: 0 0.5rem;
		}
	}
</style>
