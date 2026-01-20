<script lang="ts">
	/**
	 * BiometricImportModal - Import pulse oximeter CSV data
	 * 
	 * Allows users to:
	 * - Upload CSV files from pulse oximeter apps
	 * - Preview parsed biometric data before importing
	 * - See per-rep SpO2/HR statistics
	 * - Import data into routine log
	 * 
	 * Also stores the raw CSV for future reprocessing.
	 */

	import type { ProcessedRepBiometrics, ParsedBiometricSession, RepEditorData } from '$lib/types';
	import {
		parseBiometricCsv,
		processRepBiometrics,
		validateBiometricCsv,
		formatDuration,
		getSpO2ColorClass,
		getSpO2Severity,
		calculateSessionBiometricSummary
	} from '$lib/utils/biometricCsvParser';

	let {
		isOpen = $bindable(false),
		onImport = (reps: RepEditorData[], summary: ReturnType<typeof calculateSessionBiometricSummary>, rawCsv: string) => {}
	}: {
		isOpen: boolean;
		onImport: (reps: RepEditorData[], summary: ReturnType<typeof calculateSessionBiometricSummary>, rawCsv: string) => void;
	} = $props();

	let fileInput: HTMLInputElement | undefined = $state();
	let dragOver = $state(false);
	let error = $state<string | null>(null);
	let parsedSession = $state<ParsedBiometricSession | null>(null);
	let processedReps = $state<ProcessedRepBiometrics[]>([]);
	let sessionSummary = $state<ReturnType<typeof calculateSessionBiometricSummary>>(null);
	let rawCsvContent = $state<string>(''); // Store raw CSV for upload

	// Handle file selection
	async function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			await processFile(file);
		}
	}

	// Handle drag and drop
	function handleDrop(event: DragEvent) {
		event.preventDefault();
		dragOver = false;
		const file = event.dataTransfer?.files[0];
		if (file) {
			processFile(file);
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		dragOver = true;
	}

	function handleDragLeave() {
		dragOver = false;
	}

	// Process uploaded file
	async function processFile(file: File) {
		error = null;
		parsedSession = null;
		processedReps = [];
		sessionSummary = null;
		rawCsvContent = '';

		if (!file.name.endsWith('.csv')) {
			error = 'Please upload a CSV file';
			return;
		}

		try {
			const content = await file.text();
			
			// Validate CSV format
			const validationError = validateBiometricCsv(content);
			if (validationError) {
				error = validationError;
				return;
			}

			// Store raw CSV for later upload
			rawCsvContent = content;

			// Parse the CSV
			parsedSession = parseBiometricCsv(content);
			
			// Process per-rep statistics
			processedReps = processRepBiometrics(parsedSession);
			
			// Calculate session summary
			sessionSummary = calculateSessionBiometricSummary(processedReps);
		} catch (e) {
			error = `Failed to parse CSV: ${e instanceof Error ? e.message : 'Unknown error'}`;
		}
	}

	// Import the data
	function handleImport() {
		if (!processedReps.length) return;

		// Convert processed reps to RepEditorData format
		const reps: RepEditorData[] = processedReps.map(rep => ({
			repNumber: rep.repNumber,
			actualDuration: rep.apneaDuration,
			actualRest: rep.recoveryDuration,
			completed: true,
			notes: '',
			spo2Min: rep.spo2Min,
			spo2Avg: rep.spo2Avg,
			hrMin: rep.hrMin,
			hrMax: rep.hrMax,
			hrAvg: rep.hrAvg,
			timeBelow70: rep.timeBelow70,
			timeBelow60: rep.timeBelow60,
			timeBelow50: rep.timeBelow50,
			timeBelow40: rep.timeBelow40
		}));

		onImport(reps, sessionSummary, rawCsvContent);
		close();
	}

	function close() {
		isOpen = false;
		parsedSession = null;
		processedReps = [];
		sessionSummary = null;
		rawCsvContent = '';
		error = null;
	}

	function triggerFileSelect() {
		fileInput?.click();
	}
</script>

{#if isOpen}
	<div class="modal-backdrop" onclick={close} role="presentation">
		<div 
			class="modal" 
			onclick={(e) => e.stopPropagation()} 
			onkeydown={(e) => e.key === 'Escape' && close()}
			role="dialog" 
			aria-modal="true"
			tabindex="-1"
		>
			<div class="modal-header">
				<h2>Import Biometric Data</h2>
				<button type="button" class="close-btn" onclick={close} aria-label="Close">×</button>
			</div>

			<div class="modal-content">
				{#if !parsedSession}
					<!-- Upload area -->
					<div 
						class="upload-area"
						class:drag-over={dragOver}
						ondrop={handleDrop}
						ondragover={handleDragOver}
						ondragleave={handleDragLeave}
						onclick={triggerFileSelect}
						role="button"
						tabindex="0"
						onkeypress={(e) => e.key === 'Enter' && triggerFileSelect()}
					>
						<div class="upload-icon">📊</div>
						<p class="upload-text">Drop CSV file here or click to browse</p>
						<p class="upload-hint">Supports pulse oximeter exports (e.g., Oximeter app)</p>
						<input 
							type="file" 
							accept=".csv"
							bind:this={fileInput}
							onchange={handleFileSelect}
							hidden
						/>
					</div>

					{#if error}
						<div class="error-message">
							⚠️ {error}
						</div>
					{/if}
				{:else}
					<!-- Preview parsed data -->
					<div class="preview-container">
						<div class="session-info">
							<h3>{parsedSession.routineName}</h3>
							<p class="timestamp">{parsedSession.timestamp.toLocaleString()}</p>
							<div class="stats-row">
								<span class="stat">
									<strong>{parsedSession.totalRounds}</strong> rounds
								</span>
								<span class="stat">
									<strong>{formatDuration(parsedSession.totalApneaTime)}</strong> total apnea
								</span>
							</div>
						</div>

						{#if sessionSummary}
							<div class="session-summary">
								<h4>Session Summary</h4>
								<div class="summary-grid">
									<div class="summary-item">
										<span class="label">Longest Hold</span>
										<span class="value">{formatDuration(sessionSummary.longestHold ?? 0)}</span>
									</div>
									<div class="summary-item">
										<span class="label">Lowest SpO2</span>
										<span class="value {getSpO2ColorClass(sessionSummary.lowestSpO2 ?? 100)}">
											{sessionSummary.lowestSpO2}%
										</span>
									</div>
									<div class="summary-item">
										<span class="label">Min HR</span>
										<span class="value">{sessionSummary.sessionMinHR} bpm</span>
									</div>
									<div class="summary-item">
										<span class="label">Max HR</span>
										<span class="value">{sessionSummary.sessionMaxHR} bpm</span>
									</div>
								</div>

								{#if (sessionSummary.totalTimeBelow70 ?? 0) > 0}
									<div class="threshold-warning warning">
										⚠️ {sessionSummary.totalTimeBelow70}s below 70% SpO2
									</div>
								{/if}
								{#if (sessionSummary.totalTimeBelow60 ?? 0) > 0}
									<div class="threshold-warning danger">
										🚨 {sessionSummary.totalTimeBelow60}s below 60% SpO2
									</div>
								{/if}
								{#if (sessionSummary.totalTimeBelow50 ?? 0) > 0}
									<div class="threshold-warning critical">
										💀 {sessionSummary.totalTimeBelow50}s below 50% SpO2
									</div>
								{/if}
								{#if (sessionSummary.totalTimeBelow40 ?? 0) > 0}
									<div class="threshold-warning extreme">
										☠️ {sessionSummary.totalTimeBelow40}s below 40% SpO2
									</div>
								{/if}
							</div>
						{/if}

						<div class="reps-preview">
							<h4>Per-Rep Data</h4>
							<div class="reps-table">
								<div class="table-header">
									<div class="col">#</div>
									<div class="col">Hold</div>
									<div class="col">Rest</div>
									<div class="col">SpO2 Min</div>
									<div class="col">HR Min/Max</div>
								</div>
								{#each processedReps as rep}
									<div class="table-row">
										<div class="col">{rep.repNumber}</div>
										<div class="col">{formatDuration(rep.apneaDuration)}</div>
										<div class="col">{formatDuration(rep.recoveryDuration)}</div>
										<div class="col {getSpO2ColorClass(rep.spo2Min)}">{rep.spo2Min}%</div>
										<div class="col">{rep.hrMin}/{rep.hrMax}</div>
									</div>
								{/each}
							</div>
						</div>
					</div>

					<div class="modal-actions">
						<button type="button" class="btn-secondary" onclick={() => { parsedSession = null; processedReps = []; }}>
							Choose Different File
						</button>
						<button type="button" class="btn-primary" onclick={handleImport}>
							Import Data
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: 1rem;
	}

	.modal {
		background: var(--color-surface);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 16px;
		width: 100%;
		max-width: 500px;
		max-height: 90vh;
		overflow-y: auto;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid rgba(148, 163, 184, 0.2);
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.close-btn {
		width: 32px;
		height: 32px;
		border-radius: 8px;
		border: none;
		background: rgba(148, 163, 184, 0.1);
		color: var(--color-text-muted);
		font-size: 1.25rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.close-btn:hover {
		background: rgba(148, 163, 184, 0.2);
	}

	.modal-content {
		padding: 1.25rem;
	}

	.upload-area {
		border: 2px dashed rgba(148, 163, 184, 0.3);
		border-radius: 12px;
		padding: 2rem;
		text-align: center;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.upload-area:hover,
	.upload-area.drag-over {
		border-color: var(--color-primary);
		background: rgba(20, 184, 166, 0.05);
	}

	.upload-icon {
		font-size: 2.5rem;
		margin-bottom: 0.75rem;
	}

	.upload-text {
		font-size: 1rem;
		color: var(--color-text);
		margin-bottom: 0.5rem;
	}

	.upload-hint {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}

	.error-message {
		margin-top: 1rem;
		padding: 0.75rem 1rem;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 8px;
		color: #ef4444;
		font-size: 0.875rem;
	}

	.preview-container {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.session-info {
		text-align: center;
	}

	.session-info h3 {
		margin: 0 0 0.25rem;
		font-size: 1.125rem;
		color: var(--color-text);
	}

	.timestamp {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin: 0 0 0.75rem;
	}

	.stats-row {
		display: flex;
		justify-content: center;
		gap: 1.5rem;
	}

	.stat {
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}

	.stat strong {
		color: var(--color-primary);
	}

	.session-summary {
		background: rgba(148, 163, 184, 0.05);
		border-radius: 12px;
		padding: 1rem;
	}

	.session-summary h4 {
		margin: 0 0 0.75rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.75rem;
	}

	.summary-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.summary-item .label {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.summary-item .value {
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.threshold-warning {
		margin-top: 0.75rem;
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		font-size: 0.8125rem;
	}

	.threshold-warning.warning {
		background: rgba(249, 115, 22, 0.1);
		border: 1px solid rgba(249, 115, 22, 0.3);
		color: #f97316;
	}

	.threshold-warning.danger {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		color: #ef4444;
	}

	.threshold-warning.critical {
		background: rgba(185, 28, 28, 0.15);
		border: 1px solid rgba(185, 28, 28, 0.4);
		color: #dc2626;
	}

	.threshold-warning.extreme {
		background: rgba(127, 29, 29, 0.2);
		border: 1px solid rgba(127, 29, 29, 0.5);
		color: #991b1b;
		font-weight: 600;
	}

	.reps-preview {
		max-height: 200px;
		overflow-y: auto;
	}

	.reps-preview h4 {
		margin: 0 0 0.5rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.reps-table {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.table-header {
		display: flex;
		gap: 0.5rem;
		padding: 0.5rem;
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		border-bottom: 1px solid rgba(148, 163, 184, 0.2);
	}

	.table-row {
		display: flex;
		gap: 0.5rem;
		padding: 0.5rem;
		font-size: 0.8125rem;
		background: rgba(148, 163, 184, 0.05);
		border-radius: 6px;
	}

	.col {
		flex: 1;
		text-align: center;
	}

	.col:first-child {
		flex: 0.5;
	}

	/* SpO2 color classes */
	.text-green-500 { color: #22c55e; }
	.text-yellow-500 { color: #eab308; }
	.text-orange-500 { color: #f97316; }
	.text-red-500 { color: #ef4444; }
	.text-red-700 { color: #b91c1c; }

	.modal-actions {
		display: flex;
		gap: 0.75rem;
		margin-top: 1.25rem;
	}

	.btn-secondary,
	.btn-primary {
		flex: 1;
		padding: 0.75rem 1rem;
		border-radius: 8px;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-secondary {
		background: transparent;
		border: 1px solid rgba(148, 163, 184, 0.3);
		color: var(--color-text);
	}

	.btn-secondary:hover {
		background: rgba(148, 163, 184, 0.1);
	}

	.btn-primary {
		background: var(--color-primary);
		border: none;
		color: #000;
	}

	.btn-primary:hover {
		background: var(--color-primary-hover);
	}
</style>
