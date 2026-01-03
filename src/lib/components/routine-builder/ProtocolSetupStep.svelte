<script lang="ts">
	/**
	 * ProtocolSetupStep - Step 2 of routine builder wizard
	 * Choose protocol type: No structure, Uniform intervals, or Variable table
	 */

	import type { RoutineTable, Discipline } from '$lib/types';
	import TableEditor from './TableEditor.svelte';

	let {
		disciplines,
		protocolType = $bindable<'none' | 'uniform' | 'table'>('none'),
		// Uniform interval fields
		restBetweenReps = $bindable<number | undefined>(undefined),
		repDistance = $bindable<number | undefined>(undefined),
		numberOfReps = $bindable<number | undefined>(undefined),
		// Variable table
		table = $bindable<RoutineTable | undefined>(undefined)
	}: {
		disciplines: Discipline[];
		protocolType: 'none' | 'uniform' | 'table';
		restBetweenReps?: number;
		repDistance?: number;
		numberOfReps?: number;
		table?: RoutineTable;
	} = $props();

	// Determine if routine is static (STA only) or dynamic
	let isStatic = $derived(disciplines.length === 1 && disciplines[0] === 'STA');
	let isDynamic = $derived(disciplines.some((d) => ['DYN', 'DNF', 'DYNB'].includes(d)));

	// Time input helpers (mm:ss)
	let restMinutes = $state(0);
	let restSeconds = $state(0);

	// Update restBetweenReps when time inputs change
	$effect(() => {
		if (protocolType === 'uniform' && (restMinutes > 0 || restSeconds > 0)) {
			restBetweenReps = restMinutes * 60 + restSeconds;
		}
	});

	// Initialize time inputs from existing data
	$effect(() => {
		if (restBetweenReps) {
			restMinutes = Math.floor(restBetweenReps / 60);
			restSeconds = restBetweenReps % 60;
		}
	});

	// Clear fields when protocol type changes
	function handleProtocolChange(newType: 'none' | 'uniform' | 'table') {
		protocolType = newType;

		// Clear uniform fields
		if (newType !== 'uniform') {
			restBetweenReps = undefined;
			repDistance = undefined;
			numberOfReps = undefined;
			restMinutes = 0;
			restSeconds = 0;
		}

		// Clear table
		if (newType !== 'table') {
			table = undefined;
		}

		// Initialize table with empty row if switching to table mode
		if (newType === 'table' && !table) {
			table = {
				rows: [
					{
						repNumber: 1,
						restBefore: 0,
						...(isStatic ? { targetDuration: 0 } : { targetDistance: 0, targetTime: 0 })
					}
				]
			};
		}
	}
</script>

<div class="protocol-setup-step">
	<h2 class="step-title">Protocol Setup</h2>
	<p class="step-description">
		Define the structure of your routine, or leave it flexible for freeform training.
	</p>

	<!-- Protocol Type Selection -->
	<div class="form-section">
		<div class="form-label">Protocol Type</div>
		<p class="field-hint">Choose how you want to structure this routine</p>

		<div class="protocol-options">
			<!-- No Structure -->
			<label class="protocol-card" class:selected={protocolType === 'none'}>
				<input
					type="radio"
					name="protocol-type"
					value="none"
					checked={protocolType === 'none'}
					onchange={() => handleProtocolChange('none')}
				/>
				<div class="protocol-content">
					<div class="protocol-icon">📝</div>
					<div class="protocol-label">No Structure</div>
					<div class="protocol-description">
						Freeform routine - log whatever you do in the moment
					</div>
				</div>
			</label>

			<!-- Uniform Intervals -->
			<label class="protocol-card" class:selected={protocolType === 'uniform'}>
				<input
					type="radio"
					name="protocol-type"
					value="uniform"
					checked={protocolType === 'uniform'}
					onchange={() => handleProtocolChange('uniform')}
				/>
				<div class="protocol-content">
					<div class="protocol-icon">🔁</div>
					<div class="protocol-label">Uniform Intervals</div>
					<div class="protocol-description">Same rest and distance/time for all reps</div>
				</div>
			</label>

			<!-- Variable Table -->
			<label class="protocol-card" class:selected={protocolType === 'table'}>
				<input
					type="radio"
					name="protocol-type"
					value="table"
					checked={protocolType === 'table'}
					onchange={() => handleProtocolChange('table')}
				/>
				<div class="protocol-content">
					<div class="protocol-icon">📊</div>
					<div class="protocol-label">Variable Table</div>
					<div class="protocol-description">
						Progressive protocol - each rep has different targets
					</div>
				</div>
			</label>
		</div>
	</div>

	<!-- Uniform Intervals Configuration -->
	{#if protocolType === 'uniform'}
		<div class="config-section">
			<h3 class="config-title">Uniform Interval Configuration</h3>

			<div class="form-row">
				<div class="form-field">
					<label for="num-reps" class="form-label">Number of Reps</label>
					<input
						id="num-reps"
						type="number"
						class="form-input"
						bind:value={numberOfReps}
						min="1"
						max="99"
						placeholder="e.g., 10"
					/>
				</div>

				{#if isDynamic}
					<div class="form-field">
						<label for="rep-distance" class="form-label">Distance per Rep (meters)</label>
						<input
							id="rep-distance"
							type="number"
							class="form-input"
							bind:value={repDistance}
							min="1"
							placeholder="e.g., 50"
						/>
					</div>
				{/if}
			</div>

			<div class="form-field">
				<label class="form-label">Rest Between Reps</label>
				<div class="time-inputs">
					<div class="time-input-group">
						<input
							type="number"
							class="time-input"
							bind:value={restMinutes}
							min="0"
							max="59"
							placeholder="00"
						/>
						<span class="time-label">min</span>
					</div>
					<span class="time-separator">:</span>
					<div class="time-input-group">
						<input
							type="number"
							class="time-input"
							bind:value={restSeconds}
							min="0"
							max="59"
							placeholder="00"
						/>
						<span class="time-label">sec</span>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Variable Table Configuration -->
	{#if protocolType === 'table' && table}
		<div class="config-section">
			<h3 class="config-title">Variable Table Configuration</h3>
			<TableEditor bind:table {isStatic} />
		</div>
	{/if}
</div>

<style>
	.protocol-setup-step {
		max-width: 900px;
		margin: 0 auto;
	}

	.step-title {
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--color-text);
		margin-bottom: 0.5rem;
	}

	.step-description {
		font-size: 1rem;
		color: var(--color-text-muted);
		margin-bottom: 2rem;
	}

	.form-section {
		margin-bottom: 2rem;
	}

	.form-label {
		display: block;
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: 0.5rem;
	}

	.field-hint {
		font-size: 0.875rem;
		color: var(--color-text-muted);
		margin-bottom: 1rem;
	}

	.protocol-options {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
	}

	.protocol-card {
		position: relative;
		display: flex;
		flex-direction: column;
		padding: 1.5rem;
		background: rgba(15, 23, 42, 0.5);
		border: 2px solid rgba(148, 163, 184, 0.2);
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.protocol-card:hover {
		border-color: rgba(148, 163, 184, 0.4);
		background: rgba(15, 23, 42, 0.7);
		transform: translateY(-2px);
	}

	.protocol-card.selected {
		border-color: var(--color-primary);
		background: rgba(20, 184, 166, 0.1);
		box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.1);
	}

	.protocol-card input[type='radio'] {
		position: absolute;
		top: 1rem;
		right: 1rem;
		width: 20px;
		height: 20px;
		cursor: pointer;
	}

	.protocol-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 0.75rem;
	}

	.protocol-icon {
		font-size: 2.5rem;
	}

	.protocol-label {
		font-weight: 600;
		font-size: 1rem;
		color: var(--color-text);
	}

	.protocol-description {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		line-height: 1.4;
	}

	.config-section {
		background: rgba(15, 23, 42, 0.3);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 12px;
		padding: 1.5rem;
		margin-top: 1.5rem;
	}

	.config-title {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: 1.5rem;
	}

	.form-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.form-field {
		margin-bottom: 1rem;
	}

	.form-input {
		width: 100%;
		padding: 0.75rem 1rem;
		background: rgba(15, 23, 42, 0.5);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 8px;
		color: var(--color-text);
		font-size: 0.9375rem;
		transition: all 0.2s ease;
	}

	.form-input:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.1);
	}

	.time-inputs {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.time-input-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.time-input {
		width: 70px;
		padding: 0.75rem 0.5rem;
		background: rgba(15, 23, 42, 0.5);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 8px;
		color: var(--color-text);
		font-size: 1.125rem;
		text-align: center;
		transition: all 0.2s ease;
	}

	.time-input:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.1);
	}

	.time-label {
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}

	.time-separator {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--color-text);
	}

	/* Mobile responsive */
	@media (max-width: 640px) {
		.protocol-options {
			grid-template-columns: 1fr;
		}

		.form-row {
			grid-template-columns: 1fr;
		}
	}
</style>
