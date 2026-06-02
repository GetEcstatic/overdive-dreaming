<script lang="ts">
	import { onMount } from 'svelte';
	import { Timestamp, collection, getDocs, query, where, writeBatch } from 'firebase/firestore';
	import { user } from '$lib/stores/auth';
	import { createRoutineLog, getUserSettings } from '$lib/firestore';
	import { db } from '$lib/firebase';
	import { getTimeOfDay } from '$lib/utils/sessions';
	import { recalculatePBsForDisciplines } from '$lib/utils/personalBests';
	import { buildAidaAttempt } from '$lib/competition/aida';
	import type {
		CardTag,
		Discipline,
		RecordTag,
		RoutineLogFormData,
		SessionVisibility
	} from '$lib/types';

	type ParsedRow = {
		rowNumber: number;
		competition: string;
		date: Date;
		discipline: Discipline;
		totalDistance?: number;
		totalTime?: number;
		cardTag?: CardTag;
		recordTag?: RecordTag;
		notes?: string;
		realisedRaw: string;
	};

	type SkippedRow = {
		rowNumber: number;
		reason: string;
	};

	const disciplineSet = new Set<Discipline>(['STA', 'DYN', 'DNF', 'DYNB']);
	const recordTags = new Set<RecordTag>(['NR', 'CR', 'WR']);

	let fileName = $state<string | null>(null);
	let parsedRows = $state<ParsedRow[]>([]);
	let skippedRows = $state<SkippedRow[]>([]);
	let defaultVisibility = $state<SessionVisibility>('private');
	let loading = $state(false);
let importing = $state(false);
let error = $state<string | null>(null);
let success = $state<string | null>(null);
let importCurrent = $state(0);
	let lastImportBatchId = $state<string | null>(null);
	let undoing = $state(false);
	let xlsxModule: typeof import('xlsx') | null = null;
	const lastImportStorageKey = 'aidaLastImportBatchId';

	onMount(async () => {
		if (!$user) return;
		const settings = await getUserSettings($user.uid);
		if (settings?.defaultSessionVisibility) {
			defaultVisibility = settings.defaultSessionVisibility;
		}
	});

	function normalizeDiscipline(value: unknown): Discipline | undefined {
		if (!value) return undefined;
		const discipline = String(value).trim().toUpperCase() as Discipline;
		return disciplineSet.has(discipline) ? discipline : undefined;
	}

	function parseExcelDate(value: unknown, preferDayMonth = false): Date | null {
		if (!value) return null;

		if (value instanceof Date && !Number.isNaN(value.getTime())) {
			const year = value.getFullYear();
			let month = value.getMonth() + 1;
			let day = value.getDate();
			if (preferDayMonth && day <= 12 && month <= 12) {
				const swapped = day;
				day = month;
				month = swapped;
			}
			return new Date(year, month - 1, day, 12, 0, 0, 0);
		}

		if (typeof value === 'number' && Number.isFinite(value)) {
			const parsed = xlsxModule?.SSF?.parse_date_code?.(value);
			if (parsed?.y && parsed?.m && parsed?.d) {
				return new Date(parsed.y, parsed.m - 1, parsed.d, 12, 0, 0, 0);
			}
		}

		if (typeof value === 'string') {
			const trimmed = value.trim();
			const isoMatch = trimmed.match(
				/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/
			);
			if (isoMatch) {
				const year = Number(isoMatch[1]);
				const month = Number(isoMatch[2]);
				const day = Number(isoMatch[3]);
				return new Date(year, month - 1, day, 12, 0, 0, 0);
			}

			const ukMatch = trimmed.match(
				/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/
			);
			if (ukMatch) {
				const day = Number(ukMatch[1]);
				const month = Number(ukMatch[2]);
				let year = Number(ukMatch[3]);
				if (year < 100) {
					year = year >= 70 ? 1900 + year : 2000 + year;
				}
				return new Date(year, month - 1, day, 12, 0, 0, 0);
			}

			if (trimmed.includes('/') || trimmed.includes('-')) {
				return null;
			}

			const parsed = new Date(trimmed);
			if (!Number.isNaN(parsed.getTime())) {
				return new Date(
					parsed.getFullYear(),
					parsed.getMonth(),
					parsed.getDate(),
					12,
					0,
					0,
					0
				);
			}
		}

		return null;
	}

	function splitRecordTag(raw: string): { value: string; recordTag?: RecordTag } {
		const trimmed = raw.trim();
		const match = trimmed.match(/\s*(NR|CR|WR)$/i);
		if (!match) return { value: trimmed };
		const tag = match[1].toUpperCase() as RecordTag;
		return {
			value: trimmed.replace(/\s*(NR|CR|WR)$/i, '').trim(),
			recordTag: recordTags.has(tag) ? tag : undefined
		};
	}

	function parseTimeToSeconds(raw: unknown): { seconds?: number; recordTag?: RecordTag } {
		if (raw === null || raw === undefined || raw === '') return {};

		if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
			const seconds =
				raw.getUTCHours() * 3600 + raw.getUTCMinutes() * 60 + raw.getUTCSeconds();
			return seconds > 0 ? { seconds } : {};
		}

		if (typeof raw === 'number' && Number.isFinite(raw)) {
			if (raw > 0 && raw < 1) {
				const seconds = Math.round(raw * 86400);
				return seconds > 0 ? { seconds } : {};
			}
			if (raw >= 1 && raw <= 86400) {
				const seconds = Math.round(raw);
				return seconds > 0 ? { seconds } : {};
			}
		}

		const rawString = String(raw).trim();
		if (!rawString) return {};
		const { value, recordTag } = splitRecordTag(rawString);
		if (!/^\d{1,2}:\d{2}$/.test(value)) return { recordTag };
		const parts = value.split(':').map((part) => Number(part));
		if (parts.some((part) => Number.isNaN(part))) return { recordTag };
		if (parts[1] >= 60) return { recordTag };
		const seconds = parts[0] * 60 + parts[1];
		return seconds > 0 ? { seconds, recordTag } : { recordTag };
	}

	function parseDistance(raw: unknown): { meters?: number; recordTag?: RecordTag } {
		if (raw === null || raw === undefined || raw === '') return {};

		if (typeof raw === 'number' && Number.isFinite(raw)) {
			return raw > 0 ? { meters: raw } : {};
		}

		const rawString = String(raw).trim();
		if (!rawString) return {};
		const { value, recordTag } = splitRecordTag(rawString);
		const match = value.match(/^(\d{1,4})\s*m$/i);
		if (!match) return { recordTag };
		const meters = Number(match[1]);
		return Number.isFinite(meters) ? { meters, recordTag } : { recordTag };
	}

	function normalizeCardTag(value: unknown): CardTag | undefined {
		if (!value) return undefined;
		const normalized = String(value).trim().toLowerCase();
		if (normalized === 'white' || normalized === 'yellow' || normalized === 'red') {
			return normalized as CardTag;
		}
		return undefined;
	}

	function formatLocalDate(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	function formatRealisedValue(raw: unknown): string {
		if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
			const hours = String(raw.getUTCHours()).padStart(2, '0');
			const minutes = String(raw.getUTCMinutes()).padStart(2, '0');
			const seconds = String(raw.getUTCSeconds()).padStart(2, '0');
			return `${hours}:${minutes}:${seconds}`;
		}
		if (typeof raw === 'number' && raw > 0 && raw < 1) {
			const totalSeconds = Math.round(raw * 86400);
			const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
			const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
			const seconds = String(totalSeconds % 60).padStart(2, '0');
			return `${hours}:${minutes}:${seconds}`;
		}
		return String(raw ?? '').trim();
	}

	function getRowValue(row: Record<string, unknown>, key: string): unknown {
		if (key in row) return row[key];
		const bomKey = `\ufeff${key}`;
		if (bomKey in row) return row[bomKey];
		return undefined;
	}

	function buildNotes(competition: string, remarksRaw: unknown): string | undefined {
		const remarks = String(remarksRaw ?? '').trim();
		const parts: string[] = [];
		if (competition) parts.push(`Competition: ${competition}`);
		if (remarks) parts.push(`Remarks: ${remarks}`);
		return parts.length > 0 ? parts.join('\n') : undefined;
	}

	async function handleFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		error = null;
		success = null;
		loading = true;
		fileName = file.name;

		try {
			if (!xlsxModule) {
				xlsxModule = await import('xlsx');
			}
			const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
			let workbook;
			if (isCsv) {
				const text = await file.text();
				workbook = xlsxModule.read(text, { type: 'string', cellDates: true });
			} else {
				const buffer = await file.arrayBuffer();
				workbook = xlsxModule.read(buffer, { type: 'array', cellDates: true });
			}
			const sheetName = workbook.SheetNames[0];
			const sheet = workbook.Sheets[sheetName];
			const rows = xlsxModule.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

			const parsed: ParsedRow[] = [];
			const skipped: SkippedRow[] = [];

			rows.forEach((row, index) => {
				const rowNumber = index + 2;
				const competition = String(getRowValue(row, 'Competition') ?? '').trim();
				const discipline = normalizeDiscipline(getRowValue(row, 'Discipline'));
				const date = parseExcelDate(getRowValue(row, 'Date'), isCsv);
				const realisedValue = getRowValue(row, 'Realised performance');
				const realisedRaw = formatRealisedValue(realisedValue);
				const cardTag = normalizeCardTag(getRowValue(row, 'Card'));
				const notes = buildNotes(competition, getRowValue(row, 'Remarks'));

				if (!discipline) {
					skipped.push({ rowNumber, reason: 'Missing or invalid discipline' });
					return;
				}
				if (!date) {
					skipped.push({ rowNumber, reason: 'Missing or invalid date' });
					return;
				}
				if (!realisedRaw) {
					skipped.push({ rowNumber, reason: 'Missing realised performance' });
					return;
				}

				if (discipline === 'STA') {
					const { seconds, recordTag } = parseTimeToSeconds(realisedValue);
					if (!seconds) {
						skipped.push({ rowNumber, reason: 'Unable to parse STA time' });
						return;
					}
					parsed.push({
						rowNumber,
						competition,
						date,
						discipline,
						totalTime: seconds,
						cardTag,
						recordTag,
						notes,
						realisedRaw
					});
					return;
				}

				const { meters, recordTag } = parseDistance(realisedValue);
				if (!meters) {
					skipped.push({ rowNumber, reason: 'Unable to parse distance' });
					return;
				}

				parsed.push({
					rowNumber,
					competition,
					date,
					discipline,
					totalDistance: meters,
					cardTag,
					recordTag,
					notes,
					realisedRaw
				});
			});

			parsedRows = parsed;
			skippedRows = skipped;
		} catch (err) {
			console.error('Failed to parse file:', err);
			error = 'Unable to read the spreadsheet. Please confirm it matches the AIDA export format.';
			parsedRows = [];
			skippedRows = [];
		} finally {
			loading = false;
		}
	}

	async function handleImport() {
		if (!$user || parsedRows.length === 0) return;

		importing = true;
		error = null;
		success = null;
		importCurrent = 0;
		lastImportBatchId = null;

		const disciplineSet = new Set<Discipline>();
		const batchId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
			? crypto.randomUUID()
			: `import-${Date.now()}-${Math.random().toString(16).slice(2)}`;

		try {
			for (let i = 0; i < parsedRows.length; i += 1) {
				const row = parsedRows[i];
				const sessionDate = new Date(row.date);
				const timeOfDay = getTimeOfDay(sessionDate);
				const sessionGroup = `${formatLocalDate(sessionDate)}-${timeOfDay}`;
				const routineId = row.discipline === 'STA' ? 'system-static-max' : 'system-dynamic-max';

				const logData: RoutineLogFormData = {
					routineId,
					userId: $user.uid,
					date: Timestamp.fromDate(sessionDate),
					timeOfDay,
					sessionGroup,
					disciplineUsed: row.discipline,
					hasDetailedData: false,
					isCompetition: true,
					compeitionOrg: 'AIDA',
					importBatchId: batchId,
					visibility: defaultVisibility
				};

				if (row.totalTime !== undefined) logData.totalTime = row.totalTime;
				if (row.totalDistance !== undefined) logData.totalDistance = row.totalDistance;
				if (row.cardTag) logData.cardTag = row.cardTag;
				if (row.recordTag) logData.recordTag = row.recordTag;
				logData.aidaCompetition = buildAidaAttempt({
					mode: 'official-competition',
					discipline: row.discipline,
					realizedPerformanceSeconds: row.totalTime,
					realizedPerformanceMeters: row.totalDistance,
					card: row.cardTag,
					recordTag: row.recordTag,
					judgeNotes: row.notes
				});
				if (row.notes) logData.notes = row.notes;
				if ($user.displayName) logData.authorDisplayName = $user.displayName;
				if ($user.photoURL) logData.authorPhotoURL = $user.photoURL;

				await createRoutineLog(logData);

				disciplineSet.add(row.discipline);
				importCurrent = i + 1;
			}

			if (disciplineSet.size > 0) {
				await recalculatePBsForDisciplines($user.uid, Array.from(disciplineSet));
			}

			lastImportBatchId = batchId;
			if (typeof window !== 'undefined') {
				window.localStorage.setItem(lastImportStorageKey, batchId);
				window.localStorage.setItem(`${lastImportStorageKey}:at`, String(Date.now()));
			}
			success = `Imported ${parsedRows.length} AIDA results successfully.`;
		} catch (err) {
			console.error('Import failed:', err);
			error = 'Import failed. Please retry or check the console for details.';
		} finally {
			importing = false;
		}
	}

	async function handleUndoImport() {
		if (!$user || !lastImportBatchId || undoing) return;
		if (!confirm('Undo this import? This will delete all logs created in the last import.')) return;

		undoing = true;
		error = null;

		try {
			const logsRef = collection(db, 'routineLogs');
			const logsQuery = query(
				logsRef,
				where('userId', '==', $user.uid),
				where('importBatchId', '==', lastImportBatchId)
			);
			const snapshot = await getDocs(logsQuery);

			if (snapshot.empty) {
				error = 'No logs found for this import batch.';
				return;
			}

			const docs = snapshot.docs;
			for (let i = 0; i < docs.length; i += 500) {
				const batch = writeBatch(db);
				docs.slice(i, i + 500).forEach((docSnap) => batch.delete(docSnap.ref));
				await batch.commit();
			}

			success = 'Import undone. You can upload again when ready.';
			lastImportBatchId = null;
			parsedRows = [];
			skippedRows = [];
			if (typeof window !== 'undefined') {
				window.localStorage.removeItem(lastImportStorageKey);
				window.localStorage.removeItem(`${lastImportStorageKey}:at`);
			}
		} catch (err) {
			console.error('Undo failed:', err);
			error = 'Failed to undo the import. Please try again.';
		} finally {
			undoing = false;
		}
	}

	function handleReset() {
		fileName = null;
		parsedRows = [];
		skippedRows = [];
		error = null;
		success = null;
		importCurrent = 0;
		lastImportBatchId = null;
		if (typeof window !== 'undefined') {
			window.localStorage.removeItem(lastImportStorageKey);
			window.localStorage.removeItem(`${lastImportStorageKey}:at`);
		}
	}
</script>

<div class="import-page">
	<header class="page-hero">
		<div class="hero-text">
			<p class="eyebrow">AIDA Import</p>
			<h1>Bring competition results into your training log</h1>
			<p class="lead">
				Upload your AIDA results spreadsheet and we will create Static and Dynamic Max Attempt logs with competition tags, cards, and records applied automatically.
			</p>
			<div class="hero-meta">
				<div class="meta-item">Formats: .xlsx, .xls, .csv</div>
				<div class="meta-item">Organizer set to AIDA</div>
				<div class="meta-item">Mapped to max attempts</div>
			</div>
			<div class="prep-block">
				<h3>Before you upload</h3>
				<ul>
					<li>Date column uses `DD/MM/YYYY` (e.g. `01/09/2025`)</li>
					<li>STA results use `MM:SS` (e.g. `09:31 NR`)</li>
					<li>Dynamic results use meters (e.g. `330 m WR`)</li>
					<li>Records appear after the result: `NR`, `CR`, or `WR`</li>
				</ul>
			</div>
		</div>
		<div class="hero-panel">
			<div class="panel-card">
				<h2>How it works</h2>
				<ol>
					<li>Upload the AIDA export file.</li>
					<li>Review parsed rows and skipped items.</li>
					<li>Import results to your log.</li>
				</ol>
				<p class="panel-note">
					We keep your original competition name in notes and mark each entry as a competition.
				</p>
			</div>
		</div>
	</header>

	<section class="upload-card">
		<div class="step-chip">Step 1</div>
		<h2>Upload Spreadsheet</h2>
		<p class="section-help">Drop your file here or browse to select it.</p>
		<label class="dropzone">
			<input
				type="file"
				accept=".xlsx,.xls,.csv"
				onchange={handleFileChange}
				class="file-input"
			/>
			<div class="dropzone-content">
				<div class="dropzone-title">Choose a file</div>
				<div class="dropzone-subtitle">AIDA export in .xlsx, .xls, or .csv</div>
			</div>
		</label>
		{#if fileName}
			<p class="file-name">Loaded: {fileName}</p>
		{/if}
		{#if loading}
			<p class="status">Parsing file...</p>
		{/if}
	</section>

	{#if error}
		<div class="alert error">{error}</div>
	{/if}
	{#if success}
		<div class="alert success">
			<div class="alert-row">
				<span>{success}</span>
				{#if lastImportBatchId}
					<button class="btn ghost" type="button" onclick={handleUndoImport} disabled={undoing}>
						{undoing ? 'Undoing...' : 'Undo this import'}
					</button>
				{/if}
			</div>
		</div>
	{/if}

	{#if parsedRows.length > 0}
		<section class="preview-card">
			<div class="preview-header">
				<div>
					<div class="step-chip">Step 2</div>
					<h2>Preview Import</h2>
				</div>
				<div class="summary-chips">
					<span class="summary-chip">Parsed: {parsedRows.length}</span>
					{#if skippedRows.length > 0}
						<span class="summary-chip warn">Skipped: {skippedRows.length}</span>
					{/if}
				</div>
			</div>

			<div class="summary-grid">
				<div class="summary-card">
					<span class="summary-label">Total Rows</span>
					<span class="summary-value">{parsedRows.length}</span>
				</div>
				<div class="summary-card">
					<span class="summary-label">Disciplines</span>
					<span class="summary-value">
						{Array.from(new Set(parsedRows.map((row) => row.discipline))).join(', ')}
					</span>
				</div>
				<div class="summary-card">
					<span class="summary-label">Date Range</span>
					<span class="summary-value">
						{formatLocalDate(parsedRows[parsedRows.length - 1].date)} - {formatLocalDate(parsedRows[0].date)}
					</span>
				</div>
			</div>

			<div class="preview-table">
				<div class="preview-row preview-header-row">
					<span>Date</span>
					<span>Discipline</span>
					<span>Result</span>
					<span>Card</span>
					<span>Record</span>
				</div>
				{#each parsedRows.slice(0, 12) as row}
					<div class="preview-row">
						<span>{formatLocalDate(row.date)}</span>
						<span>{row.discipline}</span>
						<span>{row.realisedRaw}</span>
						<span>{row.cardTag ?? '-'}</span>
						<span>{row.recordTag ?? '-'}</span>
					</div>
				{/each}
			</div>
			{#if parsedRows.length > 12}
				<p class="status">Showing first 12 rows.</p>
			{/if}

			<div class="actions">
				<button class="btn secondary" type="button" onclick={handleReset} disabled={importing}>
					Clear
				</button>
				<button class="btn primary" type="button" onclick={handleImport} disabled={importing}>
					{#if importing}
						Importing {importCurrent}/{parsedRows.length}...
					{:else}
						Import Results
					{/if}
				</button>
			</div>
		</section>
	{/if}

	{#if skippedRows.length > 0}
		<section class="skipped-card">
			<div class="skipped-header">
				<h2>Skipped Rows</h2>
				<span>{skippedRows.length} rows need attention</span>
			</div>
			<div class="skipped-list">
				{#each skippedRows.slice(0, 8) as row}
					<div class="skipped-item">
						<span>Row {row.rowNumber}</span>
						<span>{row.reason}</span>
					</div>
				{/each}
			</div>
			{#if skippedRows.length > 8}
				<p class="status">Showing first 8 skipped rows.</p>
			{/if}
		</section>
	{/if}
</div>

<style>
	.import-page {
		max-width: 980px;
		margin: 0 auto;
		padding: 2rem 1rem 4rem;
		background:
			radial-gradient(circle at top left, rgba(34, 197, 94, 0.12), transparent 45%),
			radial-gradient(circle at 20% 50%, rgba(59, 130, 246, 0.12), transparent 40%),
			radial-gradient(circle at bottom right, rgba(244, 63, 94, 0.1), transparent 45%);
	}

	.page-hero {
		display: grid;
		gap: 2rem;
		align-items: start;
		margin-bottom: 2rem;
	}

	@media (min-width: 900px) {
		.page-hero {
			grid-template-columns: 1.1fr 0.9fr;
		}
	}

	.eyebrow {
		text-transform: uppercase;
		letter-spacing: 0.24em;
		font-size: 0.7rem;
		color: var(--color-text-muted);
		margin-bottom: 0.75rem;
	}

	.page-hero h1 {
		font-size: clamp(2rem, 2vw + 1.5rem, 2.8rem);
		margin: 0 0 0.75rem;
		color: var(--color-text);
	}

	.lead {
		font-size: 1rem;
		color: var(--color-text-muted);
		line-height: 1.6;
	}

	.hero-meta {
		display: grid;
		gap: 0.5rem;
		margin-top: 1.5rem;
	}

	.meta-item {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		background: rgba(148, 163, 184, 0.08);
		border-radius: 999px;
		padding: 0.35rem 0.8rem;
		display: inline-flex;
		width: fit-content;
	}

	.prep-block {
		margin-top: 1.75rem;
		padding: 1rem 1.2rem;
		border-radius: 14px;
		background: rgba(15, 23, 42, 0.55);
		border: 1px solid rgba(148, 163, 184, 0.18);
	}

	.prep-block h3 {
		margin: 0 0 0.75rem;
		font-size: 1rem;
		color: var(--color-text);
	}

	.prep-block ul {
		margin: 0;
		padding-left: 1.2rem;
		color: var(--color-text-muted);
		line-height: 1.6;
	}

	.hero-panel .panel-card {
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 16px;
		padding: 1.5rem;
		box-shadow: 0 10px 30px rgba(15, 23, 42, 0.15);
	}

	.panel-card h2 {
		margin-top: 0;
		margin-bottom: 0.75rem;
		font-size: 1.1rem;
		color: var(--color-text);
	}

	.panel-card ol {
		margin: 0 0 1rem;
		padding-left: 1.2rem;
		color: var(--color-text-muted);
		line-height: 1.6;
	}

	.panel-note {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		margin: 0;
	}

	.upload-card,
	.preview-card,
	.skipped-card {
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.18);
		border-radius: 16px;
		padding: 1.5rem;
		margin-top: 1.5rem;
		box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
	}

	.upload-card h2,
	.preview-card h2,
	.skipped-card h2 {
		margin: 0.5rem 0 0.75rem;
		font-size: 1.2rem;
		color: var(--color-text);
	}

	.section-help {
		color: var(--color-text-muted);
		margin: 0 0 1rem;
	}

	.step-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.75rem;
		border-radius: 999px;
		background: rgba(59, 130, 246, 0.15);
		color: #93c5fd;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
	}

	.dropzone {
		position: relative;
		display: block;
		border: 1px dashed rgba(148, 163, 184, 0.4);
		border-radius: 16px;
		padding: 2rem;
		text-align: center;
		cursor: pointer;
		transition: border-color 0.2s ease, background 0.2s ease;
		background: linear-gradient(135deg, rgba(15, 23, 42, 0.6), rgba(15, 23, 42, 0.3));
	}

	.dropzone:hover {
		border-color: rgba(59, 130, 246, 0.7);
		background: linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(15, 23, 42, 0.4));
	}

	.file-input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}

	.dropzone-title {
		font-size: 1.1rem;
		color: var(--color-text);
		font-weight: 600;
	}

	.dropzone-subtitle {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		margin-top: 0.4rem;
	}

	.file-name {
		margin-top: 0.75rem;
		font-size: 0.9rem;
		color: var(--color-text-muted);
	}

	.status {
		margin-top: 0.75rem;
		color: var(--color-text-muted);
	}

	.alert {
		margin-top: 1rem;
		padding: 0.75rem 1rem;
		border-radius: 12px;
	}

	.alert-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.alert.error {
		background: rgba(239, 68, 68, 0.15);
		color: #fecaca;
		border: 1px solid rgba(239, 68, 68, 0.35);
	}

	.alert.success {
		background: rgba(34, 197, 94, 0.12);
		color: #bbf7d0;
		border: 1px solid rgba(34, 197, 94, 0.35);
	}

	.preview-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.summary-chips {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.summary-chip {
		background: rgba(15, 23, 42, 0.55);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 999px;
		padding: 0.35rem 0.75rem;
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.summary-chip.warn {
		background: rgba(245, 158, 11, 0.15);
		border-color: rgba(245, 158, 11, 0.35);
		color: #fde68a;
	}

	.summary-grid {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		margin: 1.5rem 0;
	}

	.summary-card {
		background: rgba(15, 23, 42, 0.6);
		border: 1px solid rgba(148, 163, 184, 0.12);
		border-radius: 14px;
		padding: 1rem;
	}

	.summary-label {
		display: block;
		color: var(--color-text-muted);
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin-bottom: 0.4rem;
	}

	.summary-value {
		color: var(--color-text);
		font-size: 1rem;
		font-weight: 600;
	}

	.preview-table {
		display: grid;
		gap: 0.5rem;
	}

	.preview-row {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.5rem;
		padding: 0.6rem 0.4rem;
		border-bottom: 1px solid rgba(148, 163, 184, 0.12);
		font-size: 0.85rem;
		color: var(--color-text-muted);
	}

	.preview-header-row {
		font-weight: 600;
		color: var(--color-text);
		border-bottom: 1px solid rgba(148, 163, 184, 0.2);
		text-transform: uppercase;
		letter-spacing: 0.12em;
		font-size: 0.7rem;
	}

	.actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
		margin-top: 1.5rem;
	}

	.btn {
		border-radius: 999px;
		border: 1px solid transparent;
		padding: 0.65rem 1.4rem;
		font-weight: 600;
		cursor: pointer;
		transition: transform 0.2s ease, box-shadow 0.2s ease;
	}

	.btn.primary {
		background: var(--color-primary);
		color: #0f172a;
		box-shadow: 0 8px 16px rgba(59, 130, 246, 0.25);
	}

	.btn.primary:hover {
		transform: translateY(-1px);
	}

	.btn.secondary {
		background: transparent;
		border-color: rgba(148, 163, 184, 0.3);
		color: var(--color-text);
	}

	.btn.ghost {
		background: transparent;
		border-color: rgba(148, 163, 184, 0.4);
		color: #e2e8f0;
		padding: 0.45rem 1rem;
		font-size: 0.8rem;
		border-radius: 999px;
	}

	.skipped-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
	}

	.skipped-header span {
		color: var(--color-text-muted);
		font-size: 0.85rem;
	}

	.skipped-list {
		display: grid;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.skipped-item {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.65rem 0.9rem;
		background: rgba(148, 163, 184, 0.08);
		border-radius: 10px;
		font-size: 0.85rem;
		color: var(--color-text-muted);
	}

	@media (max-width: 720px) {
		.preview-row {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.preview-row span:nth-child(n + 3) {
			display: none;
		}
	}
</style>
