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

	import type { RepEditorData, Discipline, RoutineLogPlanRow, RoutineTable, LungVolume } from '$lib/types';
	import type { LayerDiscipline } from '$lib/routineLayers/model';
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
		plannedRows = undefined as RoutineLogPlanRow[] | undefined,
		defaultRestSeconds = 0,
		defaultDistanceMeters = 0,
		reps = $bindable<RepEditorData[]>([]),
		// Biometric tracking options
		trackSpO2 = false,
		trackHR = false,
		trackKicksPerLap = false,
		trackArmPullsPerLap = false,
		trackNotes = false,
		isDryTraining = false,
		// Allow editing planned values (for variable tables)
		allowEditPlanned = false,
		selectableLayerDisciplines = {} as Record<string, LayerDiscipline[]>,
		selectedLayerDisciplines = {} as Record<string, LayerDiscipline>,
		onLayerDisciplineChange = undefined as ((sourceLayerId: string, discipline: LayerDiscipline) => void) | undefined,
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
		trackKicksPerLap?: boolean;
		trackArmPullsPerLap?: boolean;
		trackNotes?: boolean;
		isDryTraining?: boolean;
		allowEditPlanned?: boolean;
		selectableLayerDisciplines?: Record<string, LayerDiscipline[]>;
		selectedLayerDisciplines?: Record<string, LayerDiscipline>;
		onLayerDisciplineChange?: (sourceLayerId: string, discipline: LayerDiscipline) => void;
		defaultLungVolume?: LungVolume;
		plannedRows?: RoutineLogPlanRow[];
	} = $props();

	let showRowNotes = $state(false);

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
		setRepValue(index, 'lungVolume', vol);
	}

	function setRepValue<K extends keyof RepEditorData>(index: number, key: K, value: RepEditorData[K]) {
		reps[index] = {
			...reps[index],
			[key]: value
		};
		reps = [...reps];
	}

	type OptionalNumberRepField = 'plannedRest' | 'actualRest' | 'plannedDistance' | 'actualDistance' | 'plannedDuration' | 'actualDuration';

	function setOptionalRepValue(index: number, key: OptionalNumberRepField, value: number | undefined) {
		reps[index] = {
			...reps[index],
			[key]: value
		};
		reps = [...reps];
	}

	const rowPlansByIndex = $derived(new Map((plannedRows ?? []).map((row) => [row.globalRowIndex, row])));
	const rowPlan = (rep: RepEditorData): RoutineLogPlanRow | undefined => rowPlansByIndex.get(rep.repNumber);
	const rowMode = (rep: RepEditorData): 'static' | 'dynamic' => {
		const plannedRow = rowPlan(rep);
		if (plannedRow) return plannedRow.discipline === 'STA' ? 'static' : 'dynamic';
		return discipline === 'STA' ? 'static' : 'dynamic';
	};
	const isFirstLayerRow = (rep: RepEditorData): boolean => {
		const plannedRow = rowPlan(rep);
		const previousRow = rowPlansByIndex.get(rep.repNumber - 1);
		return Boolean(plannedRow && plannedRow.sourceLayerId !== previousRow?.sourceLayerId);
	};
	const layerModeLabel = (row: RoutineLogPlanRow): string => row.discipline === 'STA' ? 'Static' : 'Dynamic';
	const hasDynamicRows = $derived(plannedRows?.some((row) => row.discipline !== 'STA') ?? discipline !== 'STA');
	const hasStaticRows = $derived(plannedRows?.some((row) => row.discipline === 'STA') ?? discipline === 'STA');

	// Initialize reps if empty
	$effect(() => {
		if (reps.length === 0 && plannedReps > 0) {
			const initialReps: RepEditorData[] = [];
			for (let i = 0; i < plannedReps; i++) {
				const plannedRow = plannedRows?.[i];
				const row = routineTable?.rows[i];
				const isDynamicRow = plannedRow ? plannedRow.discipline !== 'STA' : discipline !== 'STA';
				initialReps.push({
					repNumber: i + 1,
					plannedDuration: plannedRow?.plannedDurationSeconds ?? row?.targetDuration,
					plannedDistance: isDynamicRow ? plannedRow?.plannedDistanceMeters ?? row?.targetDistance ?? defaultDistanceMeters : undefined,
					plannedRest: plannedRow?.plannedBreatheUpSeconds ?? row?.restBefore ?? defaultRestSeconds,
					actualDuration: plannedRow?.plannedDurationSeconds ?? row?.targetDuration,
					actualDistance: isDynamicRow ? plannedRow?.plannedDistanceMeters ?? row?.targetDistance ?? defaultDistanceMeters : undefined,
					actualRest: plannedRow?.plannedBreatheUpSeconds ?? row?.restBefore ?? defaultRestSeconds,
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
		setRepValue(index, 'completed', !reps[index].completed);
	}

	// Handle time input change
	function handleTimeChange(index: number, field: 'actualDuration' | 'actualRest', event: Event) {
		const input = event.target as HTMLInputElement;
		const seconds = parseTimeInput(input.value);
		if (seconds !== null) {
			setRepValue(index, field, seconds);
		}
	}

	// Handle planned time input change (for variable table editing)
	function handlePlannedTimeChange(index: number, field: 'plannedDuration' | 'plannedRest', event: Event) {
		const input = event.target as HTMLInputElement;
		const seconds = parseTimeInput(input.value);
		if (seconds !== null) {
			const updatedRep = { ...reps[index], [field]: seconds };
			// Also update actual if it matches the old planned (user hasn't changed it)
			const actualField = field === 'plannedDuration' ? 'actualDuration' : 'actualRest';
			if (updatedRep[actualField] === undefined || updatedRep[actualField] === 0) {
				updatedRep[actualField] = seconds;
			}
			reps[index] = updatedRep;
			reps = [...reps];
		}
	}

	// Handle planned distance input change (for variable table editing)
	function handlePlannedDistanceChange(index: number, event: Event) {
		const input = event.target as HTMLInputElement;
		const meters = parseInt(input.value, 10);
		if (!isNaN(meters)) {
			const updatedRep = { ...reps[index], plannedDistance: meters };
			// Also update actual if it matches the old planned (user hasn't changed it)
			if (updatedRep.actualDistance === undefined || updatedRep.actualDistance === 0) {
				updatedRep.actualDistance = meters;
			}
			reps[index] = updatedRep;
			reps = [...reps];
		}
	}

	// Handle distance input change
	function handleDistanceChange(index: number, event: Event) {
		const input = event.target as HTMLInputElement;
		const meters = parseInt(input.value, 10);
		if (!isNaN(meters)) {
			setRepValue(index, 'actualDistance', meters);
		}
	}

	// Handle SpO2 input change
	function handleSpO2Change(index: number, field: 'spo2Min' | 'spo2Avg', event: Event) {
		const input = event.target as HTMLInputElement;
		const value = parseInt(input.value, 10);
		if (!isNaN(value) && value >= 0 && value <= 100) {
			setRepValue(index, field, value);
		}
	}

	// Handle HR input change
	function handleHRChange(index: number, field: 'hrMin' | 'hrMax' | 'hrAvg', event: Event) {
		const input = event.target as HTMLInputElement;
		const value = parseInt(input.value, 10);
		if (!isNaN(value) && value >= 0 && value <= 300) {
			setRepValue(index, field, value);
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

	{#if trackNotes}
		<div class="row-notes-toggle-row">
			<button type="button" class="row-notes-toggle" aria-expanded={showRowNotes} onclick={() => (showRowNotes = !showRowNotes)}>
				{showRowNotes ? 'Hide row notes' : 'Add row notes'}
			</button>
		</div>
	{/if}

	<div class="reps-table" class:has-biometrics={trackSpO2 || trackHR} class:has-volume={isMultiRep} class:has-technique={trackKicksPerLap || trackArmPullsPerLap}>
		<div class="table-header">
			<div class="col-rep">#</div>
			<div class="col-rest">Rest</div>
			{#if hasDynamicRows}
				<div class="col-distance">Dist</div>
			{/if}
			{#if hasStaticRows || hasDynamicRows}
				<div class="col-duration">{hasStaticRows && !hasDynamicRows ? (allowEditPlanned ? 'Target' : 'Hold') : 'Time'}</div>
			{/if}
			{#if isMultiRep}
				<div class="col-volume">Vol</div>
			{/if}
			{#if trackKicksPerLap}
				<div class="col-technique">Kicks</div>
			{/if}
			{#if trackArmPullsPerLap}
				<div class="col-technique">Pulls</div>
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
			{@const planRow = rowPlan(rep)}
			{@const mode = rowMode(rep)}
			<div class="table-row-group">
				{#if planRow && isFirstLayerRow(rep)}
					{@const options = selectableLayerDisciplines[planRow.sourceLayerId] ?? []}
					<div class="layer-row-header" class:static-layer={planRow.discipline === 'STA'} class:dynamic-layer={planRow.discipline !== 'STA'}>
						<div class="layer-row-copy">
							<span class="layer-row-name">{planRow.layerName ?? `Layer ${planRow.sourceLayerId}`}</span>
							<span class="layer-row-meta">{layerModeLabel(planRow)} rows</span>
						</div>
						{#if options.length > 1}
							<select
								class="layer-row-select"
								aria-label={`Discipline for ${planRow.layerName ?? `Layer ${planRow.sourceLayerId}`}`}
								value={selectedLayerDisciplines[planRow.sourceLayerId] ?? options[0]}
								onchange={(event) => onLayerDisciplineChange?.(planRow.sourceLayerId, event.currentTarget.value as LayerDiscipline)}
							>
								{#each options as option}
									<option value={option}>{option}</option>
								{/each}
							</select>
						{:else}
							<span class="layer-discipline-badge">{planRow.discipline}</span>
						{/if}
					</div>
				{/if}
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

				<div class="col-rest" data-label="Rest">
					{#if rep.completed}
						{#if allowEditPlanned}
							<DurationInput
								value={rep.plannedRest}
								onValueChange={(value) => setOptionalRepValue(i, 'plannedRest', value)}
								compact={true}
								showLabel={false}
								allowClear={true}
								max={600}
							/>
						{:else}
							<DurationInput
								value={rep.actualRest}
								onValueChange={(value) => setOptionalRepValue(i, 'actualRest', value)}
								compact={true}
								showLabel={false}
								allowClear={true}
								max={600}
							/>
						{/if}
					{:else}
						<span class="skipped-value">
							{formatTimeForInput(allowEditPlanned ? rep.plannedRest : rep.actualRest) || '—'}
						</span>
					{/if}
				</div>

				{#if hasDynamicRows}
					<div class="col-distance" class:not-applicable-cell={mode !== 'dynamic'} data-label="Distance">
						{#if mode === 'dynamic'}
							{#if rep.completed}
								{#if allowEditPlanned}
									<NumberWheelInput
										value={rep.plannedDistance}
										onValueChange={(value) => setOptionalRepValue(i, 'plannedDistance', value)}
										variant="chip"
										min={0}
										max={200}
										step={5}
										unit="m"
										compact={true}
										showLabel={false}
										allowClear={true}
									/>
								{:else}
									<NumberWheelInput
										value={rep.actualDistance}
										onValueChange={(value) => setOptionalRepValue(i, 'actualDistance', value)}
										variant="chip"
										min={0}
										max={200}
										step={5}
										unit="m"
										compact={true}
										showLabel={false}
										allowClear={true}
									/>
								{/if}
							{:else}
								<span class="skipped-value">
									{allowEditPlanned ? (rep.plannedDistance || '—') : (rep.actualDistance || '—')}m
								</span>
							{/if}
						{:else}
							<span class="not-applicable">—</span>
						{/if}
					</div>
				{/if}

				{#if hasStaticRows || hasDynamicRows}
					<div class="col-duration" data-label={mode === 'static' ? 'Hold' : 'Time'}>
						{#if rep.completed}
							{#if allowEditPlanned}
								<DurationInput
									value={rep.plannedDuration}
									onValueChange={(value) => setOptionalRepValue(i, 'plannedDuration', value)}
									compact={true}
									showLabel={false}
									allowClear={true}
									max={600}
								/>
							{:else}
								<DurationInput
									value={rep.actualDuration}
									onValueChange={(value) => setOptionalRepValue(i, 'actualDuration', value)}
									compact={true}
									showLabel={false}
									allowClear={true}
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

				{#if isMultiRep}
					<div class="col-volume" data-label="Volume">
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

				{#if trackKicksPerLap}
					<div class="col-technique" class:not-applicable-cell={mode !== 'dynamic'} data-label="Kicks">
						{#if mode === 'dynamic' && rep.completed}
							<NumberWheelInput
								value={rep.kicks}
								onValueChange={(value) => setRepValue(i, 'kicks', value)}
								min={0}
								max={100}
								step={1}
								compact={true}
								showLabel={false}
							/>
						{:else if mode !== 'dynamic'}
							<span class="not-applicable">—</span>
						{:else}
							<span class="skipped-value">—</span>
						{/if}
					</div>
				{/if}

				{#if trackArmPullsPerLap}
					<div class="col-technique" class:not-applicable-cell={mode !== 'dynamic'} data-label="Pulls">
						{#if mode === 'dynamic' && rep.completed}
							<NumberWheelInput
								value={rep.armPulls}
								onValueChange={(value) => setRepValue(i, 'armPulls', value)}
								min={0}
								max={100}
								step={1}
								compact={true}
								showLabel={false}
							/>
						{:else if mode !== 'dynamic'}
							<span class="not-applicable">—</span>
						{:else}
							<span class="skipped-value">—</span>
						{/if}
					</div>
				{/if}

				{#if trackSpO2}
					<div class="col-spo2" data-label="SpO2">
						{#if rep.completed}
							<NumberWheelInput
								value={rep.spo2Min}
								onValueChange={(value) => setRepValue(i, 'spo2Min', value)}
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
					<div class="col-hr" data-label="HR">
						{#if rep.completed}
							<NumberWheelInput
								value={rep.hrMin}
								onValueChange={(value) => setRepValue(i, 'hrMin', value)}
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
				{#if trackNotes && showRowNotes && rep.completed}
					<input
						class="rep-note-input"
						value={rep.notes ?? ''}
						oninput={(event) => setRepValue(i, 'notes', event.currentTarget.value)}
						placeholder={`Row ${rep.repNumber} note`}
						aria-label={`Row ${rep.repNumber} note`}
					/>
				{/if}
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

	.table-row-group {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.layer-row-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.55rem 0.65rem;
		border: 1px solid rgba(148, 163, 184, 0.16);
		border-radius: 8px;
		background: rgba(15, 23, 42, 0.42);
	}

	.layer-row-header.static-layer {
		border-color: rgba(125, 211, 252, 0.28);
		background: rgba(14, 116, 144, 0.12);
	}

	.layer-row-header.dynamic-layer {
		border-color: rgba(20, 184, 166, 0.28);
		background: rgba(20, 184, 166, 0.1);
	}

	.layer-row-copy {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		min-width: 0;
	}

	.layer-row-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--color-text);
		font-size: 0.82rem;
		font-weight: 750;
	}

	.layer-row-meta,
	.layer-discipline-badge {
		color: var(--color-text-muted);
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
	}

	.layer-row-select {
		flex: 0 0 auto;
		min-width: 5rem;
		min-height: 2rem;
		border: 1px solid rgba(148, 163, 184, 0.24);
		border-radius: 8px;
		background: rgba(15, 23, 42, 0.78);
		color: var(--color-text);
		padding: 0.35rem 0.5rem;
		font-size: 0.8rem;
		font-weight: 750;
	}

	.row-notes-toggle-row {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 0.25rem;
	}

	.row-notes-toggle {
		min-height: 2rem;
		padding: 0.35rem 0.65rem;
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.45);
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-weight: 650;
		cursor: pointer;
	}

	.row-notes-toggle[aria-expanded='true'] {
		border-color: rgba(20, 184, 166, 0.45);
		background: rgba(20, 184, 166, 0.1);
		color: var(--color-primary);
	}

	.rep-note-input {
		width: 100%;
		min-height: 2.25rem;
		padding: 0.45rem 0.65rem;
		border: 1px solid rgba(148, 163, 184, 0.16);
		border-radius: 8px;
		background: rgba(15, 23, 42, 0.45);
		color: var(--color-text);
		font: inherit;
		font-size: 0.8125rem;
	}

	.rep-note-input::placeholder {
		color: var(--color-text-muted);
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
	.col-hr,
	.col-technique {
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

	/* When biometrics enabled, adjust table layout */
	.reps-table.has-biometrics .table-header,
	.reps-table.has-biometrics .table-row,
	.reps-table.has-technique .table-header,
	.reps-table.has-technique .table-row {
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

	@media (max-width: 640px) {
		.rep-editor {
			padding: 0.75rem;
		}

		.default-volume-row {
			align-items: stretch;
			flex-direction: column;
		}

		.default-volume-hint {
			margin-left: 0;
		}

		.table-header {
			display: none;
		}

		.table-row-group {
			gap: 0.45rem;
		}

		.layer-row-header {
			align-items: stretch;
			flex-direction: column;
			gap: 0.5rem;
		}

		.layer-row-copy {
			justify-content: space-between;
			width: 100%;
		}

		.layer-row-select {
			width: 100%;
		}

		.table-row,
		.reps-table.has-biometrics .table-row,
		.reps-table.has-technique .table-row,
		.reps-table.has-volume .table-row {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			gap: 0.65rem;
			padding: 0.75rem;
			font-size: 0.8125rem;
			align-items: stretch;
		}

		.col-rep {
			grid-column: 1;
			width: auto;
			align-self: center;
		}

		.rep-number::before {
			content: 'Row ';
			color: var(--color-text-muted);
			font-weight: 650;
		}

		.col-status {
			grid-column: 2;
			width: auto;
			align-self: center;
			justify-content: flex-end;
		}

		.status-btn {
			width: 2.25rem;
			height: 2.25rem;
		}

		.col-rest,
		.col-distance,
		.col-duration,
		.col-volume,
		.col-technique,
		.col-spo2,
		.col-hr {
			min-width: 0;
			width: 100%;
			flex: none;
			display: flex;
			flex-direction: column;
			align-items: stretch;
			justify-content: flex-start;
			gap: 0.3rem;
		}

		.col-rest::before,
		.col-distance::before,
		.col-duration::before,
		.col-volume::before,
		.col-technique::before,
		.col-spo2::before,
		.col-hr::before {
			content: attr(data-label);
			color: var(--color-text-muted);
			font-size: 0.68rem;
			font-weight: 750;
			text-transform: uppercase;
		}

		.not-applicable-cell {
			display: none;
		}

		.col-duration :global(.wheel-container),
		.col-distance :global(.wheel-container),
		.col-rest :global(.wheel-container),
		.col-spo2 :global(.wheel-container),
		.col-hr :global(.wheel-container),
		.col-technique :global(.wheel-container) {
			height: 72px;
		}

		.rep-note-input {
			font-size: 0.85rem;
		}
	}

	/* Skipped rep value display */
	.skipped-value {
		color: var(--color-text-muted);
		font-size: 0.875rem;
		text-align: center;
		padding: 0.375rem;
	}

	.not-applicable {
		color: var(--color-text-muted);
		font-size: 0.875rem;
		text-align: center;
		opacity: 0.45;
		padding: 0.375rem;
	}

	/* Wheel selector container within table cells */
	.col-duration :global(.duration-input),
	.col-distance :global(.number-wheel),
	.col-rest :global(.duration-input),
	.col-spo2 :global(.number-wheel),
	.col-hr :global(.number-wheel),
	.col-technique :global(.number-wheel) {
		margin: 0;
		padding: 0;
	}

	.col-duration :global(.wheel-container),
	.col-distance :global(.wheel-container),
	.col-rest :global(.wheel-container),
	.col-spo2 :global(.wheel-container),
	.col-hr :global(.wheel-container),
	.col-technique :global(.wheel-container) {
		height: 84px;
	}
</style>
