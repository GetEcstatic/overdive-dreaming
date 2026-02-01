<script lang="ts">
	/**
	 * RepEditor - Editable per-rep logging for interval training
	 * 
	 * Allows users to:
	 * - See planned rep structure from routine
	 * - Edit actual values for each rep (duration, distance, rest)
	 * - Mark reps as skipped/not completed
	 * - Add extra reps beyond the planned count
	 * - Track per-rep SpO2/HR for dry static breath hold training
	 */

	import type { RepEditorData, Discipline, RoutineTable } from '$lib/types';
	import { formatTime, parseTimeInput } from '$lib/utils/time';
	import { getSpO2ColorClass } from '$lib/utils/biometricCsvParser';

	let {
		discipline,
		plannedReps = 0,
		routineTable = undefined as RoutineTable | undefined,
		defaultRestSeconds = 0,
		defaultDistanceMeters = 0,
		reps = $bindable<RepEditorData[]>([]),
		// Biometric tracking options
		trackSpO2 = false,
		trackHR = false,
		isDryTraining = false,
		// Allow editing planned values (for variable tables)
		allowEditPlanned = false
	}: {
		discipline: Discipline;
		plannedReps?: number;
		routineTable?: RoutineTable;
		defaultRestSeconds?: number;
		defaultDistanceMeters?: number;
		reps: RepEditorData[];
		trackSpO2?: boolean;
		trackHR?: boolean;
		isDryTraining?: boolean;
		allowEditPlanned?: boolean;
	} = $props();

	// Is this a static discipline (STA)?
	const isStatic = $derived(discipline === 'STA');

	// Initialize reps if empty
	$effect(() => {
		if (reps.length === 0 && plannedReps > 0) {
			const initialReps: RepEditorData[] = [];
			for (let i = 0; i < plannedReps; i++) {
				const row = routineTable?.rows[i];
				initialReps.push({
					repNumber: i + 1,
					plannedDuration: row?.targetDuration,
					plannedDistance: row?.targetDistance || defaultDistanceMeters,
					plannedRest: row?.restBefore || defaultRestSeconds,
					actualDuration: row?.targetDuration,
					actualDistance: row?.targetDistance || defaultDistanceMeters,
					actualRest: row?.restBefore || defaultRestSeconds,
					completed: true,
					notes: ''
				});
			}
			reps = initialReps;
		}
	});

	// Add a new rep
	function addRep() {
		const lastRep = reps[reps.length - 1];
		const newRep: RepEditorData = {
			repNumber: reps.length + 1,
			plannedDuration: undefined, // Extra rep, no plan
			plannedDistance: lastRep?.plannedDistance,
			plannedRest: lastRep?.plannedRest || defaultRestSeconds,
			actualDuration: lastRep?.actualDuration,
			actualDistance: lastRep?.actualDistance,
			actualRest: lastRep?.actualRest || defaultRestSeconds,
			completed: true,
			notes: ''
		};
		reps = [...reps, newRep];
	}

	// Remove the last rep (only if it's extra)
	function removeLastRep() {
		if (reps.length > plannedReps) {
			reps = reps.slice(0, -1);
		}
	}

	// Toggle rep completion
	function toggleCompletion(index: number) {
		reps[index].completed = !reps[index].completed;
		reps = [...reps]; // Trigger reactivity
	}

	// Handle time input change
	function handleTimeChange(index: number, field: 'actualDuration' | 'actualRest', event: Event) {
		const input = event.target as HTMLInputElement;
		const seconds = parseTimeInput(input.value);
		if (seconds !== null) {
			reps[index][field] = seconds;
			reps = [...reps];
		}
	}

	// Handle planned time input change (for variable table editing)
	function handlePlannedTimeChange(index: number, field: 'plannedDuration' | 'plannedRest', event: Event) {
		const input = event.target as HTMLInputElement;
		const seconds = parseTimeInput(input.value);
		if (seconds !== null) {
			reps[index][field] = seconds;
			// Also update actual if it matches the old planned (user hasn't changed it)
			const actualField = field === 'plannedDuration' ? 'actualDuration' : 'actualRest';
			if (reps[index][actualField] === undefined || reps[index][actualField] === 0) {
				reps[index][actualField] = seconds;
			}
			reps = [...reps];
		}
	}

	// Handle planned distance input change (for variable table editing)
	function handlePlannedDistanceChange(index: number, event: Event) {
		const input = event.target as HTMLInputElement;
		const meters = parseInt(input.value, 10);
		if (!isNaN(meters)) {
			// Update planned
			reps[index].plannedDistance = meters;
			// Also update actual if it matches the old planned (user hasn't changed it)
			if (reps[index].actualDistance === undefined || reps[index].actualDistance === 0) {
				reps[index].actualDistance = meters;
			}
			reps = [...reps];
		}
	}

	// Handle distance input change
	function handleDistanceChange(index: number, event: Event) {
		const input = event.target as HTMLInputElement;
		const meters = parseInt(input.value, 10);
		if (!isNaN(meters)) {
			reps[index].actualDistance = meters;
			reps = [...reps];
		}
	}

	// Handle SpO2 input change
	function handleSpO2Change(index: number, field: 'spo2Min' | 'spo2Avg', event: Event) {
		const input = event.target as HTMLInputElement;
		const value = parseInt(input.value, 10);
		if (!isNaN(value) && value >= 0 && value <= 100) {
			reps[index][field] = value;
			reps = [...reps];
		}
	}

	// Handle HR input change
	function handleHRChange(index: number, field: 'hrMin' | 'hrMax' | 'hrAvg', event: Event) {
		const input = event.target as HTMLInputElement;
		const value = parseInt(input.value, 10);
		if (!isNaN(value) && value >= 0 && value <= 300) {
			reps[index][field] = value;
			reps = [...reps];
		}
	}

	// Format time for input display
	function formatTimeForInput(seconds: number | undefined): string {
		if (seconds === undefined || seconds === 0) return '';
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		if (mins > 0) {
			return `${mins}:${secs.toString().padStart(2, '0')}`;
		}
		return secs.toString();
	}

	// Calculate completed count
	const completedCount = $derived(reps.filter(r => r.completed).length);
	const totalCount = $derived(reps.length);
</script>

<div class="rep-editor">
	<div class="editor-header">
		<h3>Rep Logging</h3>
		<div class="completion-badge">
			{completedCount}/{totalCount} completed
		</div>
	</div>

	<div class="help-text">
		{#if allowEditPlanned}
			Adjust targets for this session. Actual values auto-fill from targets.
		{:else}
			Tap a row to mark it skipped. Edit times/distances as needed.
		{/if}
	</div>

	<div class="reps-table" class:has-biometrics={trackSpO2 || trackHR} class:has-targets={allowEditPlanned}>
		<div class="table-header">
			<div class="col-rep">#</div>
			{#if isStatic}
				{#if allowEditPlanned}
					<div class="col-duration col-target">Target</div>
					<div class="col-duration col-actual">Actual</div>
				{:else}
					<div class="col-duration">Hold</div>
				{/if}
			{:else}
				{#if allowEditPlanned}
					<div class="col-distance col-target">Target</div>
					<div class="col-distance col-actual">Actual</div>
				{:else}
					<div class="col-distance">Dist</div>
					<div class="col-duration">Time</div>
				{/if}
			{/if}
			<div class="col-rest">Rest</div>
			{#if trackSpO2}
				<div class="col-spo2">SpO2</div>
			{/if}
			{#if trackHR}
				<div class="col-hr">HR</div>
			{/if}
			<div class="col-status">✓</div>
		</div>

		{#each reps as rep, i}
			<div 
				class="table-row" 
				class:skipped={!rep.completed}
				class:extra={rep.repNumber > plannedReps}
			>
				<div class="col-rep">
					<span class="rep-number">{rep.repNumber}</span>
					{#if rep.plannedDuration && rep.actualDuration !== rep.plannedDuration}
						<span class="deviation-marker" title="Differs from planned">⚡</span>
					{/if}
				</div>

				{#if isStatic}
					<!-- STA: Duration only -->
					{#if allowEditPlanned}
						<!-- Target (editable) -->
						<div class="col-duration col-target">
							<input 
								type="text" 
								class="time-input target-input"
								value={formatTimeForInput(rep.plannedDuration)}
								placeholder="0:00"
								oninput={(e) => handlePlannedTimeChange(i, 'plannedDuration', e)}
								disabled={!rep.completed}
							/>
						</div>
						<!-- Actual -->
						<div class="col-duration col-actual">
							<input 
								type="text" 
								class="time-input"
								value={formatTimeForInput(rep.actualDuration)}
								placeholder={rep.plannedDuration ? formatTimeForInput(rep.plannedDuration) : '0:00'}
								oninput={(e) => handleTimeChange(i, 'actualDuration', e)}
								disabled={!rep.completed}
							/>
						</div>
					{:else}
						<div class="col-duration">
							<input 
								type="text" 
								class="time-input"
								value={formatTimeForInput(rep.actualDuration)}
								placeholder={rep.plannedDuration ? formatTimeForInput(rep.plannedDuration) : '0:00'}
								oninput={(e) => handleTimeChange(i, 'actualDuration', e)}
								disabled={!rep.completed}
							/>
						</div>
					{/if}
				{:else}
					<!-- Dynamic: Distance + Time -->
					{#if allowEditPlanned}
						<!-- Target (editable) -->
						<div class="col-distance col-target">
							<input 
								type="number" 
								class="distance-input target-input"
								value={rep.plannedDistance || ''}
								placeholder="0"
								oninput={(e) => handlePlannedDistanceChange(i, e)}
								disabled={!rep.completed}
							/>
							<span class="unit">m</span>
						</div>
						<!-- Actual -->
						<div class="col-distance col-actual">
							<input 
								type="number" 
								class="distance-input"
								value={rep.actualDistance || ''}
								placeholder={rep.plannedDistance?.toString() || '0'}
								oninput={(e) => handleDistanceChange(i, e)}
								disabled={!rep.completed}
							/>
							<span class="unit">m</span>
						</div>
					{:else}
						<div class="col-distance">
							<input 
								type="number" 
								class="distance-input"
								value={rep.actualDistance || ''}
								placeholder={rep.plannedDistance?.toString() || '0'}
								oninput={(e) => handleDistanceChange(i, e)}
								disabled={!rep.completed}
							/>
							<span class="unit">m</span>
						</div>
						<div class="col-duration">
							<input 
								type="text" 
								class="time-input"
								value={formatTimeForInput(rep.actualDuration)}
								placeholder={rep.plannedDuration ? formatTimeForInput(rep.plannedDuration) : '0:00'}
								oninput={(e) => handleTimeChange(i, 'actualDuration', e)}
								disabled={!rep.completed}
							/>
						</div>
					{/if}
				{/if}

				<div class="col-rest">
					<input 
						type="text" 
						class="time-input"
						value={formatTimeForInput(rep.actualRest)}
						placeholder={rep.plannedRest ? formatTimeForInput(rep.plannedRest) : '0:00'}
						oninput={(e) => handleTimeChange(i, 'actualRest', e)}
						disabled={!rep.completed}
					/>
				</div>

				{#if trackSpO2}
					<div class="col-spo2">
						<input 
							type="number" 
							class="spo2-input {rep.spo2Min ? getSpO2ColorClass(rep.spo2Min) : ''}"
							value={rep.spo2Min ?? ''}
							placeholder="Min"
							oninput={(e) => handleSpO2Change(i, 'spo2Min', e)}
							disabled={!rep.completed}
							min="0"
							max="100"
						/>
					</div>
				{/if}

				{#if trackHR}
					<div class="col-hr">
						<input 
							type="number" 
							class="hr-input"
							value={rep.hrMin ?? ''}
							placeholder="Min"
							oninput={(e) => handleHRChange(i, 'hrMin', e)}
							disabled={!rep.completed}
							min="0"
							max="300"
						/>
					</div>
				{/if}

				<div class="col-status">
					<button 
						type="button"
						class="status-btn"
						class:completed={rep.completed}
						onclick={() => toggleCompletion(i)}
						aria-label={rep.completed ? 'Mark as skipped' : 'Mark as completed'}
					>
						{rep.completed ? '✓' : '✗'}
					</button>
				</div>
			</div>
		{/each}
	</div>

	<div class="editor-actions">
		<button type="button" class="add-rep-btn" onclick={addRep}>
			+ Add Rep
		</button>
		{#if reps.length > plannedReps}
			<button type="button" class="remove-rep-btn" onclick={removeLastRep}>
				− Remove Last
			</button>
		{/if}
	</div>
</div>

<style>
	.rep-editor {
		background: rgba(15, 23, 42, 0.5);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 12px;
		padding: 1rem;
		margin: 1rem 0;
	}

	.editor-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.editor-header h3 {
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.completion-badge {
		font-size: 0.8125rem;
		padding: 0.25rem 0.75rem;
		background: rgba(20, 184, 166, 0.1);
		border: 1px solid rgba(20, 184, 166, 0.3);
		border-radius: 20px;
		color: var(--color-primary);
		font-weight: 600;
	}

	.help-text {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin-bottom: 1rem;
	}

	.reps-table {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.table-header {
		display: flex;
		gap: 0.5rem;
		padding: 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border-bottom: 1px solid rgba(148, 163, 184, 0.2);
	}

	.table-row {
		display: flex;
		gap: 0.5rem;
		padding: 0.5rem;
		background: rgba(148, 163, 184, 0.05);
		border-radius: 8px;
		align-items: center;
		transition: all 0.2s ease;
	}

	.table-row.skipped {
		opacity: 0.5;
		background: rgba(239, 68, 68, 0.1);
	}

	.table-row.extra {
		border: 1px dashed rgba(20, 184, 166, 0.3);
	}

	.col-rep {
		width: 40px;
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.rep-number {
		font-weight: 600;
		color: var(--color-text);
	}

	.deviation-marker {
		font-size: 0.75rem;
		color: #f59e0b;
	}

	.col-duration,
	.col-distance,
	.col-rest {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	/* Biometric columns */
	.col-spo2,
	.col-hr {
		flex: 0.8;
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.col-status {
		width: 36px;
		display: flex;
		justify-content: center;
	}

	.time-input,
	.distance-input {
		width: 100%;
		padding: 0.375rem 0.5rem;
		background: rgba(15, 23, 42, 0.7);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 6px;
		color: var(--color-text);
		font-size: 0.875rem;
		text-align: center;
	}

	/* Biometric inputs */
	.spo2-input,
	.hr-input {
		width: 100%;
		padding: 0.375rem 0.5rem;
		background: rgba(15, 23, 42, 0.7);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 6px;
		color: var(--color-text);
		font-size: 0.875rem;
		text-align: center;
		/* Hide number spinner */
		appearance: textfield;
		-moz-appearance: textfield;
	}

	.spo2-input::-webkit-outer-spin-button,
	.spo2-input::-webkit-inner-spin-button,
	.hr-input::-webkit-outer-spin-button,
	.hr-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.spo2-input:focus,
	.hr-input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.spo2-input:disabled,
	.hr-input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* SpO2 severity colors (global utility classes) */
	.spo2-input.text-green-500 {
		color: #22c55e;
		border-color: rgba(34, 197, 94, 0.3);
	}

	.spo2-input.text-yellow-500 {
		color: #eab308;
		border-color: rgba(234, 179, 8, 0.3);
	}

	.spo2-input.text-orange-500 {
		color: #f97316;
		border-color: rgba(249, 115, 22, 0.3);
	}

	.spo2-input.text-red-500 {
		color: #ef4444;
		border-color: rgba(239, 68, 68, 0.3);
	}

	.spo2-input.text-red-700 {
		color: #b91c1c;
		border-color: rgba(185, 28, 28, 0.5);
		background: rgba(185, 28, 28, 0.1);
	}

	.time-input:focus,
	.distance-input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.time-input:disabled,
	.distance-input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.distance-input {
		width: calc(100% - 20px);
	}

	.unit {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.status-btn {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 2px solid rgba(148, 163, 184, 0.3);
		background: transparent;
		color: var(--color-text-muted);
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.status-btn.completed {
		background: rgba(20, 184, 166, 0.2);
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.status-btn:hover {
		transform: scale(1.1);
	}

	.editor-actions {
		display: flex;
		gap: 0.75rem;
		margin-top: 1rem;
	}

	.add-rep-btn,
	.remove-rep-btn {
		padding: 0.5rem 1rem;
		border-radius: 8px;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.add-rep-btn {
		background: rgba(20, 184, 166, 0.1);
		border: 1px solid rgba(20, 184, 166, 0.3);
		color: var(--color-primary);
	}

	.add-rep-btn:hover {
		background: rgba(20, 184, 166, 0.2);
	}

	.remove-rep-btn {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		color: #ef4444;
	}

	.remove-rep-btn:hover {
		background: rgba(239, 68, 68, 0.2);
	}

	/* Mobile responsive */
	@media (max-width: 480px) {
		.rep-editor {
			padding: 0.75rem;
		}

		.table-header,
		.table-row {
			font-size: 0.8125rem;
		}

		.time-input,
		.distance-input,
		.spo2-input,
		.hr-input {
			padding: 0.25rem 0.375rem;
			font-size: 0.8125rem;
		}

		/* Biometric columns slightly smaller on mobile */
		.col-spo2,
		.col-hr {
			flex: 0.7;
		}
	}

	/* When biometrics enabled, adjust table layout */
	.reps-table.has-biometrics .table-header,
	.reps-table.has-biometrics .table-row {
		gap: 0.375rem;
	}

	.reps-table.has-biometrics .col-rep {
		width: 32px;
	}

	/* Target column styling */
	.col-target {
		position: relative;
	}

	.target-input {
		background: rgba(59, 130, 246, 0.1);
		border-color: rgba(59, 130, 246, 0.3);
	}

	.target-input:focus {
		border-color: rgba(59, 130, 246, 0.5);
		outline: none;
	}

	.col-target .time-input,
	.col-target .distance-input {
		background: rgba(59, 130, 246, 0.1);
		border-color: rgba(59, 130, 246, 0.3);
	}

	/* When targets are editable, adjust layout */
	.reps-table.has-targets .col-duration,
	.reps-table.has-targets .col-distance {
		flex: 0.8;
	}

	.reps-table.has-targets .table-header .col-target,
	.reps-table.has-targets .table-header .col-actual {
		font-size: 0.6875rem;
	}

	.col-actual {
		opacity: 0.85;
	}
</style>
