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

	import type { RepEditorData, Discipline, RoutineTable, LungVolume } from '$lib/types';
	import { formatTime, parseTimeInput } from '$lib/utils/time';
	import { getSpO2ColorClass } from '$lib/utils/biometricCsvParser';
	import {
		LUNG_VOLUME_OPTIONS,
		applyDefaultLungVolume,
		formatLungVolume
	} from '$lib/utils/lungVolume';
	import DurationInput from '$lib/components/DurationInput.svelte';
	import NumberWheelInput from '$lib/components/NumberWheelInput.svelte';
	import LungVolumePill from '$lib/components/LungVolumePill.svelte';

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
		allowEditPlanned = false,
		// Lung-volume tag (FL/RV/FRC) — universal: session-default banner is
		// always shown; per-row pill is gated on multi-rep routines (derived).
		defaultLungVolume = $bindable<LungVolume | undefined>(undefined)
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
		defaultLungVolume?: LungVolume;
	} = $props();

	// Per-rep tagging only makes sense when there's more than one rep.
	const isMultiRep = $derived(
		(plannedReps ?? 0) > 1 || (routineTable?.rows.length ?? 0) > 1 || reps.length > 1
	);

	// Apply the session-level default to any rep with no explicit volume.
	function applyDefaultToReps(vol: LungVolume | undefined) {
		reps = applyDefaultLungVolume(reps, vol);
	}

	function setDefaultLungVolume(vol: LungVolume) {
		defaultLungVolume = vol;
		applyDefaultToReps(vol);
	}

	function setRepLungVolume(index: number, vol: LungVolume) {
		reps[index].lungVolume = vol;
		reps = [...reps];
	}

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

	{#if isMultiRep}
		<div class="default-volume-row" role="group" aria-label="Default lung volume">
			<span class="default-volume-label">Default volume</span>
			<div class="volume-chip-group">
				{#each LUNG_VOLUME_OPTIONS as vol}
					<button
						type="button"
						class="volume-chip"
						class:selected={(defaultLungVolume ?? 'FL') === vol}
						title={formatLungVolume(vol)}
						aria-pressed={(defaultLungVolume ?? 'FL') === vol}
						onclick={() => setDefaultLungVolume(vol)}
					>
						{vol}
					</button>
				{/each}
			</div>
			<span class="default-volume-hint">Tap a row's pill to override.</span>
		</div>
	{/if}

	<div class="reps-table" class:has-biometrics={trackSpO2 || trackHR} class:has-volume={isMultiRep}>
		<div class="table-header">
			<div class="col-rep">#</div>
			{#if isStatic}
				<div class="col-duration">{allowEditPlanned ? 'Target' : 'Hold'}</div>
			{:else}
				<div class="col-distance">Dist</div>
				<div class="col-duration">Time</div>
			{/if}
			<div class="col-rest">Rest</div>
			{#if isMultiRep}
				<div class="col-volume">Vol</div>
			{/if}
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
					{#if !allowEditPlanned && rep.plannedDuration && rep.actualDuration !== rep.plannedDuration}
						<span class="deviation-marker" title="Differs from planned">⚡</span>
					{/if}
				</div>

				{#if isStatic}
					<!-- STA: Duration only -->
					<div class="col-duration">
						{#if rep.completed}
							{#if allowEditPlanned}
								<DurationInput
									bind:value={rep.plannedDuration}
									compact={true}
									showLabel={false}
									max={600}
								/>
							{:else}
								<DurationInput
									bind:value={rep.actualDuration}
									compact={true}
									showLabel={false}
									max={600}
								/>
							{/if}
						{:else}
							<span class="skipped-value">
								{formatTimeForInput(allowEditPlanned ? rep.plannedDuration : rep.actualDuration) || '—'}
							</span>
						{/if}
					</div>
				{:else}
					<!-- Dynamic: Distance + Time -->
					<div class="col-distance">
						{#if rep.completed}
							{#if allowEditPlanned}
								<NumberWheelInput
									bind:value={rep.plannedDistance}
									variant="chip"
									min={5}
									max={200}
									step={5}
									unit="m"
									compact={true}
									showLabel={false}
								/>
							{:else}
								<NumberWheelInput
									bind:value={rep.actualDistance}
									variant="chip"
									min={5}
									max={200}
									step={5}
									unit="m"
									compact={true}
									showLabel={false}
								/>
							{/if}
						{:else}
							<span class="skipped-value">
								{allowEditPlanned ? (rep.plannedDistance || '—') : (rep.actualDistance || '—')}m
							</span>
						{/if}
					</div>
					<div class="col-duration">
						{#if rep.completed}
							{#if allowEditPlanned}
								<DurationInput
									bind:value={rep.plannedDuration}
									compact={true}
									showLabel={false}
									max={600}
								/>
							{:else}
								<DurationInput
									bind:value={rep.actualDuration}
									compact={true}
									showLabel={false}
									max={600}
								/>
							{/if}
						{:else}
							<span class="skipped-value">
								{formatTimeForInput(allowEditPlanned ? rep.plannedDuration : rep.actualDuration) || '—'}
							</span>
						{/if}
					</div>
				{/if}

				<div class="col-rest">
					{#if rep.completed}
						{#if allowEditPlanned}
							<DurationInput
								bind:value={rep.plannedRest}
								compact={true}
								showLabel={false}
								max={600}
							/>
						{:else}
							<DurationInput
								bind:value={rep.actualRest}
								compact={true}
								showLabel={false}
								max={600}
							/>
						{/if}
					{:else}
						<span class="skipped-value">
							{formatTimeForInput(allowEditPlanned ? rep.plannedRest : rep.actualRest) || '—'}
						</span>
					{/if}
				</div>

				{#if isMultiRep}
					<div class="col-volume">
						{#if rep.completed}
							<LungVolumePill
								value={rep.lungVolume ?? defaultLungVolume ?? 'FL'}
								onChange={(v) => setRepLungVolume(i, v)}
								ariaLabelPrefix={`Rep ${rep.repNumber} lung volume`}
							/>
						{:else}
							<span class="skipped-value">{rep.lungVolume ?? '—'}</span>
						{/if}
					</div>
				{/if}

				{#if trackSpO2}
					<div class="col-spo2">
						{#if rep.completed}
							<NumberWheelInput
								bind:value={rep.spo2Min}
								min={40}
								max={100}
								step={1}
								unit="%"
								compact={true}
								showLabel={false}
							/>
						{:else}
							<span class="skipped-value">—</span>
						{/if}
					</div>
				{/if}

				{#if trackHR}
					<div class="col-hr">
						{#if rep.completed}
							<NumberWheelInput
								bind:value={rep.hrMin}
								min={30}
								max={200}
								step={1}
								compact={true}
								showLabel={false}
							/>
						{:else}
							<span class="skipped-value">—</span>
						{/if}
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

	/* Session-level default lung volume */
	.default-volume-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
		padding: 0.5rem 0.625rem;
		background: rgba(148, 163, 184, 0.05);
		border: 1px dashed rgba(148, 163, 184, 0.2);
		border-radius: 8px;
	}

	.default-volume-label {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		flex-shrink: 0;
	}

	.default-volume-hint {
		font-size: 0.6875rem;
		color: var(--color-text-muted);
		margin-left: auto;
		opacity: 0.8;
	}

	.volume-chip-group {
		display: flex;
		gap: 0.25rem;
	}

	.volume-chip {
		flex: 1;
		min-width: 2.5rem;
		padding: 0.375rem 0.5rem;
		border-radius: 8px;
		background: rgba(148, 163, 184, 0.08);
		border: 1px solid rgba(148, 163, 184, 0.2);
		color: var(--color-text);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s, color 0.15s;
	}

	.volume-chip:hover {
		background: rgba(148, 163, 184, 0.15);
	}

	.volume-chip.selected {
		background: rgba(20, 184, 166, 0.18);
		border-color: var(--color-primary);
		color: var(--color-primary);
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

	/* Lung-volume column — narrow, fits the FL/RV/FRC chip group */
	.col-volume {
		flex: 0 0 auto;
		min-width: 6.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.col-status {
		width: 36px;
		display: flex;
		justify-content: center;
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

	/* When lung-volume enabled, give the FL/RV/FRC group a touch more room */
	.reps-table.has-volume .table-header,
	.reps-table.has-volume .table-row {
		gap: 0.375rem;
	}
	.reps-table.has-volume .col-volume {
		min-width: 6.25rem;
	}
	@media (max-width: 480px) {
		.reps-table.has-volume .col-volume {
			min-width: 5.5rem;
		}
	}

	/* Skipped rep value display */
	.skipped-value {
		color: var(--color-text-muted);
		font-size: 0.875rem;
		text-align: center;
		padding: 0.375rem;
	}

	/* Wheel selector container within table cells */
	.col-duration :global(.duration-input),
	.col-distance :global(.number-wheel),
	.col-rest :global(.duration-input),
	.col-spo2 :global(.number-wheel),
	.col-hr :global(.number-wheel) {
		margin: 0;
		padding: 0;
	}

	.col-duration :global(.wheel-container),
	.col-distance :global(.wheel-container),
	.col-rest :global(.wheel-container),
	.col-spo2 :global(.wheel-container),
	.col-hr :global(.wheel-container) {
		height: 84px;
	}
</style>
