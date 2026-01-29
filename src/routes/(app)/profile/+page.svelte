<script lang="ts">
	import { user } from '$lib/stores/auth';
	import { auth, db } from '$lib/firebase';
	import { signOut } from 'firebase/auth';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { Timestamp, collection, getDocs, query, where, writeBatch } from 'firebase/firestore';
	import {
		getSeasonsForUser,
		createSeason,
		updateSeason,
		updateUserSettings
	} from '$lib/firestore';
	import { getProfileCache, refreshProfileCache, updateProfileCache } from '$lib/utils/profileCache';
	import type { Season, SessionVisibility, UserSettings } from '$lib/types';

	type DefaultTimeframe = '1month' | '6months' | '1year';

	const timeframeOptions: { value: DefaultTimeframe; label: string }[] = [
		{ value: '1month', label: 'Last Month' },
		{ value: '6months', label: 'Last 6 Months' },
		{ value: '1year', label: 'Last Year' }
	];

	let defaultFilterKey = $state<string>('tf:1month');
	let defaultTimeframeFallback = $state<DefaultTimeframe>('1month');
	let defaultSessionVisibility = $state<SessionVisibility>('private');
	let showMenstrualCycleTracking = $state<boolean>(false);
	let settingsSaving = $state(false);
	let settingsError = $state<string | null>(null);

	let seasons = $state<Season[]>([]);
	let seasonsLoading = $state(false);
	let seasonsError = $state<string | null>(null);
	let lastImportBatchId = $state<string | null>(null);
	let lastImportAt = $state<number | null>(null);
	let importUndoing = $state(false);
	let importUndoError = $state<string | null>(null);
	let importUndoSuccess = $state<string | null>(null);
	const lastImportStorageKey = 'aidaLastImportBatchId';

	let newSeasonName = $state('');
	let newSeasonStart = $state('');
	let newSeasonEnd = $state('');
	let seasonSaving = $state(false);

	let editingSeasonId = $state<string | null>(null);
	let editSeasonName = $state('');
	let editSeasonStart = $state('');
	let editSeasonEnd = $state('');
	const profileCacheTtlMs = 5 * 60 * 1000;

	const toInputDate = (date: Date) => {
		const year = date.getUTCFullYear();
		const month = String(date.getUTCMonth() + 1).padStart(2, '0');
		const day = String(date.getUTCDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	};
	const fromInputDate = (value: string) => {
		const [year, month, day] = value.split('-').map(Number);
		return new Date(Date.UTC(year, month - 1, day));
	};
	const getTimeframeFromFilter = (value: string): DefaultTimeframe | null => {
		if (!value.startsWith('tf:')) return null;
		const timeframe = value.replace('tf:', '') as DefaultTimeframe;
		return timeframeOptions.some((option) => option.value === timeframe) ? timeframe : null;
	};

	function startEditSeason(season: Season) {
		editingSeasonId = season.id;
		editSeasonName = season.name;
		editSeasonStart = toInputDate(season.startDate.toDate());
		editSeasonEnd = season.endDate ? toInputDate(season.endDate.toDate()) : '';
	}

	function cancelEditSeason() {
		editingSeasonId = null;
		editSeasonName = '';
		editSeasonStart = '';
		editSeasonEnd = '';
	}

	function applySettings(settings?: UserSettings) {
		if (settings?.defaultTimeframe) {
			defaultTimeframeFallback = settings.defaultTimeframe;
		}
		if (settings?.defaultAnalyticsFilter) {
			defaultFilterKey = settings.defaultAnalyticsFilter;
		} else if (settings?.defaultTimeframe) {
			defaultFilterKey = `tf:${settings.defaultTimeframe}`;
		}
		if (settings?.defaultSessionVisibility) {
			defaultSessionVisibility = settings.defaultSessionVisibility;
		}
		if (settings?.showMenstrualCycleTracking !== undefined) {
			showMenstrualCycleTracking = settings.showMenstrualCycleTracking;
		}
	}

	function applyProfileCache(entry: { settings?: UserSettings; seasons?: Season[] }) {
		if (entry.settings) {
			applySettings(entry.settings);
		}
		if (entry.seasons) {
			seasons = entry.seasons;
		}
	}

	async function initializeProfileData() {
		if (!$user) return;
		const cached = getProfileCache($user.uid);
		if (cached) {
			applyProfileCache(cached);
		}

		const isStale =
			!cached?.fetchedAt || Date.now() - cached.fetchedAt > profileCacheTtlMs;
		if (!isStale) return;

		try {
			seasonsLoading = true;
			settingsError = null;
			seasonsError = null;
			const fresh = await refreshProfileCache($user.uid);
			applyProfileCache(fresh);
		} catch (error) {
			console.error('Failed to load profile data:', error);
			settingsError = 'Failed to load settings.';
			seasonsError = 'Failed to load seasons.';
		} finally {
			seasonsLoading = false;
		}
	}

	async function handleDefaultFilterChange() {
		if (!$user) return;
		try {
			settingsSaving = true;
			settingsError = null;
			const selectedTimeframe = getTimeframeFromFilter(defaultFilterKey);
			if (selectedTimeframe) {
				defaultTimeframeFallback = selectedTimeframe;
			}
			const nextSettings: UserSettings = {
				defaultAnalyticsFilter: defaultFilterKey,
				defaultTimeframe: defaultTimeframeFallback,
				defaultSessionVisibility,
				showMenstrualCycleTracking
			};
			await updateUserSettings($user.uid, nextSettings);
			updateProfileCache($user.uid, { settings: nextSettings });
		} catch (error) {
			console.error('Failed to update settings:', error);
			settingsError = 'Failed to save settings.';
		} finally {
			settingsSaving = false;
		}
	}

	async function handleDefaultVisibilityChange() {
		if (!$user) return;
		try {
			settingsSaving = true;
			settingsError = null;
			const nextSettings: UserSettings = {
				defaultAnalyticsFilter: defaultFilterKey,
				defaultTimeframe: defaultTimeframeFallback,
				defaultSessionVisibility,
				showMenstrualCycleTracking
			};
			await updateUserSettings($user.uid, nextSettings);
			updateProfileCache($user.uid, { settings: nextSettings });
		} catch (error) {
			console.error('Failed to update settings:', error);
			settingsError = 'Failed to save settings.';
		} finally {
			settingsSaving = false;
		}
	}

	async function handleMenstrualCycleTrackingChange() {
		if (!$user) return;
		try {
			settingsSaving = true;
			settingsError = null;
			const nextSettings: UserSettings = {
				defaultAnalyticsFilter: defaultFilterKey,
				defaultTimeframe: defaultTimeframeFallback,
				defaultSessionVisibility,
				showMenstrualCycleTracking
			};
			await updateUserSettings($user.uid, nextSettings);
			updateProfileCache($user.uid, { settings: nextSettings });
		} catch (error) {
			console.error('Failed to update settings:', error);
			settingsError = 'Failed to save settings.';
		} finally {
			settingsSaving = false;
		}
	}

	async function handleCreateSeason() {
		if (!$user || !newSeasonName.trim() || !newSeasonStart) return;

		const startDate = fromInputDate(newSeasonStart);
		const endDate = newSeasonEnd ? fromInputDate(newSeasonEnd) : undefined;
		if (endDate && endDate < startDate) {
			seasonsError = 'End date must be after the start date.';
			return;
		}

		try {
			seasonSaving = true;
			seasonsError = null;
			await createSeason({
				userId: $user.uid,
				name: newSeasonName.trim(),
				startDate: Timestamp.fromDate(startDate),
				...(endDate && { endDate: Timestamp.fromDate(endDate) })
			});
			newSeasonName = '';
			newSeasonStart = '';
			newSeasonEnd = '';
			const freshSeasons = await getSeasonsForUser($user.uid);
			seasons = freshSeasons;
			updateProfileCache($user.uid, { seasons: freshSeasons });
		} catch (error) {
			console.error('Failed to create season:', error);
			seasonsError = 'Failed to create season.';
		} finally {
			seasonSaving = false;
		}
	}

	async function handleUpdateSeason(seasonId: string) {
		if (!$user || !editSeasonName.trim() || !editSeasonStart) return;

		const startDate = fromInputDate(editSeasonStart);
		const endDate = editSeasonEnd ? fromInputDate(editSeasonEnd) : undefined;
		if (endDate && endDate < startDate) {
			seasonsError = 'End date must be after the start date.';
			return;
		}

		try {
			seasonSaving = true;
			seasonsError = null;
			await updateSeason(seasonId, {
				name: editSeasonName.trim(),
				startDate: Timestamp.fromDate(startDate),
				endDate: endDate ? Timestamp.fromDate(endDate) : null
			});
			cancelEditSeason();
			const freshSeasons = await getSeasonsForUser($user.uid);
			seasons = freshSeasons;
			updateProfileCache($user.uid, { seasons: freshSeasons });
		} catch (error) {
			console.error('Failed to update season:', error);
			seasonsError = 'Failed to update season.';
		} finally {
			seasonSaving = false;
		}
	}

	async function handleSignOut() {
		try {
			await signOut(auth);
			// Use window.location to ensure we stay on the same origin
			if (typeof window !== 'undefined') {
				window.location.href = window.location.origin;
			} else {
				goto('/');
			}
		} catch (error) {
			console.error('Error signing out:', error);
		}
	}

	onMount(() => {
		if (typeof window !== 'undefined') {
			lastImportBatchId = window.localStorage.getItem(lastImportStorageKey);
			const storedAt = window.localStorage.getItem(`${lastImportStorageKey}:at`);
			lastImportAt = storedAt ? Number(storedAt) : null;
		}
		initializeProfileData();
	});

	function formatImportTimestamp(timestamp: number | null): string | null {
		if (!timestamp) return null;
		const now = Date.now();
		const diffMs = now - timestamp;
		if (diffMs < 0) return null;

		const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
		if (diffHours < 24) {
			const hoursLabel = diffHours === 1 ? 'hour' : 'hours';
			return `Imported ${diffHours} ${hoursLabel} ago`;
		}

		const date = new Date(timestamp);
		return `Imported ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
	}

	async function handleUndoLastImport() {
		if (!$user || !lastImportBatchId || importUndoing) return;
		if (!confirm('Undo last AIDA import? This will delete all logs created by that import.')) return;

		importUndoing = true;
		importUndoError = null;
		importUndoSuccess = null;

		try {
			const logsRef = collection(db, 'routineLogs');
			const logsQuery = query(
				logsRef,
				where('userId', '==', $user.uid),
				where('importBatchId', '==', lastImportBatchId)
			);
			const snapshot = await getDocs(logsQuery);

			if (snapshot.empty) {
				importUndoError = 'No logs found for the last import.';
				lastImportBatchId = null;
				lastImportAt = null;
				if (typeof window !== 'undefined') {
					window.localStorage.removeItem(lastImportStorageKey);
					window.localStorage.removeItem(`${lastImportStorageKey}:at`);
				}
				return;
			}

			const docs = snapshot.docs;
			for (let i = 0; i < docs.length; i += 500) {
				const batch = writeBatch(db);
				docs.slice(i, i + 500).forEach((docSnap) => batch.delete(docSnap.ref));
				await batch.commit();
			}

			importUndoSuccess = 'Import undone. You can upload again when ready.';
			lastImportBatchId = null;
			lastImportAt = null;
			if (typeof window !== 'undefined') {
				window.localStorage.removeItem(lastImportStorageKey);
				window.localStorage.removeItem(`${lastImportStorageKey}:at`);
			}
		} catch (error) {
			console.error('Failed to undo import:', error);
			importUndoError = 'Failed to undo the import.';
		} finally {
			importUndoing = false;
		}
	}
</script>

<div class="profile-container">
	<div class="profile-header">
		<div>
			<h1 class="profile-title">Profile</h1>
			<p class="profile-subtitle">Manage your account, default analytics view, and seasons.</p>
		</div>
	</div>

	{#if $user}
		<div class="profile-grid">
			<section class="profile-card">
				<div class="card-header">
					<h2 class="card-title">Account</h2>
				</div>
				<div class="account-identity">
					{#if $user.photoURL}
						<img src={$user.photoURL} alt="Profile" class="avatar" />
					{:else}
						<div class="avatar placeholder">
							{$user.displayName?.charAt(0) || 'U'}
						</div>
					{/if}
					<div>
						<h3 class="account-name">{$user.displayName || 'User'}</h3>
					</div>
				</div>
				<div class="detail-grid">
					<div class="detail-item">
						<span class="detail-label">Email</span>
						<span class="detail-value">{$user.email}</span>
					</div>
					<div class="detail-item">
						<span class="detail-label">Member Since</span>
						<span class="detail-value">
							{new Date($user.metadata.creationTime || '').toLocaleDateString()}
						</span>
					</div>
					<div class="detail-item full-width">
						<span class="detail-label">User ID</span>
						<span class="detail-value mono">{$user.uid}</span>
					</div>
				</div>
			</section>

			<section class="profile-card">
				<div class="card-header">
					<h2 class="card-title">Settings</h2>
				</div>
				<div class="form-group">
					<label class="form-label" for="default-filter">Default Analytics Filter</label>
					<select
						id="default-filter"
						class="form-select"
						bind:value={defaultFilterKey}
						onchange={handleDefaultFilterChange}
						disabled={settingsSaving}
					>
						<optgroup label="Timeframes">
							{#each timeframeOptions as option}
								<option value={`tf:${option.value}`}>{option.label}</option>
							{/each}
						</optgroup>
						{#if seasons.length > 0}
							<optgroup label="Seasons">
								{#each seasons as season}
									<option value={`season:${season.id}`}>{season.name}</option>
								{/each}
							</optgroup>
						{/if}
					</select>
					<p class="form-hint">Applies to analytics charts across the app.</p>
					{#if settingsError}
						<p class="form-hint error-text">{settingsError}</p>
					{/if}
				</div>
				<div class="form-group">
					<label class="form-label" for="default-visibility">Default Session Visibility</label>
					<select
						id="default-visibility"
						class="form-select"
						bind:value={defaultSessionVisibility}
						onchange={handleDefaultVisibilityChange}
						disabled={settingsSaving}
					>
						<option value="private">Private</option>
						<option value="public">Public</option>
					</select>
					<p class="form-hint">New logs default to this setting unless you override per session.</p>
				</div>
				<div class="form-group">
					<label class="form-label toggle-label">
						<input
							type="checkbox"
							bind:checked={showMenstrualCycleTracking}
							onchange={handleMenstrualCycleTrackingChange}
							disabled={settingsSaving}
						/>
						<span>Show menstrual cycle tracking</span>
					</label>
					<p class="form-hint">Enable to track cycle day in session logs. Useful for correlating performance with your cycle.</p>
				</div>
			</section>
		</div>

		<section class="profile-card">
			<div class="card-header">
				<h2 class="card-title">Imports</h2>
				<span class="card-subtitle">Bring in competition results from AIDA spreadsheets</span>
			</div>
			<a class="button button-secondary full-width" href="/import/aida">
				Import AIDA Results
			</a>
			{#if lastImportBatchId}
				{#if formatImportTimestamp(lastImportAt)}
					<p class="form-hint">{formatImportTimestamp(lastImportAt)}</p>
				{/if}
				<button
					type="button"
					class="button button-secondary full-width"
					onclick={handleUndoLastImport}
					disabled={importUndoing}
				>
					{importUndoing ? 'Undoing Import...' : 'Undo Last Import'}
				</button>
			{/if}
			{#if importUndoSuccess}
				<p class="form-hint">{importUndoSuccess}</p>
			{/if}
			{#if importUndoError}
				<p class="form-hint error-text">{importUndoError}</p>
			{/if}
		</section>

		<section class="profile-card">
			<div class="card-header">
				<h2 class="card-title">Seasons</h2>
				<span class="card-subtitle">Define training blocks for analytics</span>
			</div>

			<div class="season-form">
				<div class="form-group">
					<label class="form-label" for="season-name">Season Name</label>
					<input
						id="season-name"
						type="text"
						class="form-input"
						bind:value={newSeasonName}
						placeholder="e.g., Winter build"
					/>
				</div>
				<div class="form-row">
					<div class="form-group">
						<label class="form-label" for="season-start">Start Date</label>
						<input
							id="season-start"
							type="date"
							class="form-input"
							bind:value={newSeasonStart}
						/>
					</div>
					<div class="form-group">
						<label class="form-label" for="season-end">End Date (optional)</label>
						<input
							id="season-end"
							type="date"
							class="form-input"
							bind:value={newSeasonEnd}
						/>
					</div>
				</div>
				<button
					type="button"
					class="button button-primary full-width"
					onclick={handleCreateSeason}
					disabled={seasonSaving}
				>
					{seasonSaving ? 'Saving...' : 'Add Season'}
				</button>
			</div>

			{#if seasonsLoading}
				<p class="form-hint">Loading seasons...</p>
			{:else if seasons.length === 0}
				<p class="form-hint">No seasons yet.</p>
			{:else}
				<div class="season-list">
					{#each seasons as season}
						<div class="season-card">
							{#if editingSeasonId === season.id}
								<div class="season-edit-grid">
									<div class="form-group">
										<label class="form-label" for={`season-name-${season.id}`}>Season Name</label>
										<input
											id={`season-name-${season.id}`}
											type="text"
											class="form-input"
											bind:value={editSeasonName}
										/>
									</div>
									<div class="form-row">
										<div class="form-group">
											<label class="form-label" for={`season-start-${season.id}`}>Start Date</label>
											<input
												id={`season-start-${season.id}`}
												type="date"
												class="form-input"
												bind:value={editSeasonStart}
											/>
										</div>
										<div class="form-group">
											<label class="form-label" for={`season-end-${season.id}`}>End Date</label>
											<input
												id={`season-end-${season.id}`}
												type="date"
												class="form-input"
												bind:value={editSeasonEnd}
											/>
										</div>
									</div>
									<div class="button-row">
										<button
											type="button"
											class="button button-primary"
											onclick={() => handleUpdateSeason(season.id)}
											disabled={seasonSaving}
										>
											Save
										</button>
										<button
											type="button"
											class="button button-secondary"
											onclick={cancelEditSeason}
											disabled={seasonSaving}
										>
											Cancel
										</button>
									</div>
								</div>
							{:else}
								<div class="season-row">
									<div>
										<h3 class="season-name">{season.name}</h3>
										<p class="season-dates">
											{toInputDate(season.startDate.toDate())}
											{#if season.endDate}
												→ {toInputDate(season.endDate.toDate())}
											{:else}
												→ Present
											{/if}
										</p>
									</div>
									<button
										type="button"
										class="button button-secondary compact"
										onclick={() => startEditSeason(season)}
									>
										Edit
									</button>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			{#if seasonsError}
				<p class="form-hint error-text">{seasonsError}</p>
			{/if}
		</section>

		<div class="profile-footer">
			<button onclick={handleSignOut} class="button button-danger full-width">
				Sign Out
			</button>
		</div>
	{/if}
</div>

<style>
	.profile-container {
		max-width: 980px;
		margin: 0 auto;
		padding: 1.5rem 1rem 3rem;
	}

	@media (min-width: 768px) {
		.profile-container {
			padding: 1.5rem 3rem 3rem;
		}
	}

	@media (min-width: 1280px) {
		.profile-container {
			padding: 1.5rem 6rem 3rem;
		}
	}

	.profile-header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.profile-title {
		font-size: 2rem;
		font-weight: 700;
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
		margin-bottom: 0.35rem;
	}

	.profile-subtitle {
		color: var(--color-text-muted);
		font-size: 0.95rem;
	}

	.profile-grid {
		display: grid;
		gap: 1.5rem;
		margin-bottom: 1.5rem;
	}

	@media (min-width: 768px) {
		.profile-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			align-items: start;
		}
	}

	.profile-card {
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.15);
		border-radius: 16px;
		padding: 1.5rem;
		box-shadow: 0 10px 24px rgba(15, 23, 42, 0.25);
	}

	.card-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.25rem;
	}

	.card-title {
		font-size: 1.1rem;
		font-weight: 600;
		letter-spacing: 0.02em;
	}

	.card-subtitle {
		font-size: 0.85rem;
		color: var(--color-text-muted);
	}

	.account-identity {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		border-radius: 14px;
		border: 1px solid rgba(148, 163, 184, 0.12);
		background: rgba(15, 23, 42, 0.4);
		margin-bottom: 1.25rem;
	}

	.avatar {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		object-fit: cover;
		border: 2px solid rgba(20, 184, 166, 0.4);
		display: grid;
		place-items: center;
		font-size: 1.5rem;
		font-weight: 700;
		color: white;
		background: var(--color-primary);
	}

	.avatar.placeholder {
		text-transform: uppercase;
	}

	.account-name {
		font-size: 1.25rem;
		font-weight: 600;
	}

	.account-email {
		color: var(--color-text-muted);
		font-size: 0.9rem;
	}

	.detail-grid {
		display: grid;
		gap: 1rem;
	}

	@media (min-width: 640px) {
		.detail-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	.detail-item {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		background: rgba(15, 23, 42, 0.2);
		border-radius: 12px;
		padding: 0.75rem 1rem;
		border: 1px solid rgba(148, 163, 184, 0.08);
	}

	.detail-item.full-width {
		grid-column: 1 / -1;
	}

	.detail-label {
		color: var(--color-text-muted);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.detail-value {
		font-size: 0.95rem;
	}

	.detail-value.mono {
		font-family: ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
		font-size: 0.8rem;
		word-break: break-all;
		color: rgba(226, 232, 240, 0.8);
	}

	.form-group {
		display: grid;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.form-label {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.form-input,
	.form-select {
		width: 100%;
		padding: 0.65rem 0.85rem;
		border-radius: 12px;
		border: 1px solid rgba(148, 163, 184, 0.2);
		background: rgba(15, 23, 42, 0.6);
		color: var(--color-text);
		font-size: 0.9rem;
		transition: border-color 0.2s ease, box-shadow 0.2s ease;
	}

	.form-input:focus,
	.form-select:focus {
		outline: none;
		border-color: rgba(20, 184, 166, 0.7);
		box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.15);
	}

	.form-input:disabled,
	.form-select:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.form-hint {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		margin-top: 0.35rem;
	}

	.toggle-label {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		cursor: pointer;
	}

	.toggle-label input[type="checkbox"] {
		width: 1.25rem;
		height: 1.25rem;
		accent-color: var(--color-primary, #14b8a6);
		cursor: pointer;
	}

	.toggle-label input[type="checkbox"]:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.error-text {
		color: #f87171;
	}

	.form-row {
		display: grid;
		gap: 1rem;
	}

	@media (min-width: 640px) {
		.form-row {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	.button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 0.6rem 1rem;
		border-radius: 999px;
		font-weight: 600;
		transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
		border: 1px solid transparent;
		cursor: pointer;
	}

	.button:disabled {
		cursor: not-allowed;
		opacity: 0.7;
	}

	.button-primary {
		background: linear-gradient(135deg, rgba(20, 184, 166, 0.9), rgba(16, 185, 129, 0.9));
		color: #0f172a;
		box-shadow: 0 10px 20px rgba(20, 184, 166, 0.2);
	}

	.button-primary:hover {
		transform: translateY(-1px);
		box-shadow: 0 14px 24px rgba(20, 184, 166, 0.25);
	}

	.button-secondary {
		background: rgba(30, 41, 59, 0.7);
		color: var(--color-text);
		border-color: rgba(148, 163, 184, 0.25);
	}

	.button-secondary:hover {
		border-color: rgba(148, 163, 184, 0.5);
	}

	.button-danger {
		background: rgba(248, 113, 113, 0.15);
		border-color: rgba(248, 113, 113, 0.35);
		color: #fecaca;
	}

	.button-danger:hover {
		background: rgba(248, 113, 113, 0.3);
	}

	.full-width {
		width: 100%;
	}

	.button-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.season-form {
		display: grid;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid rgba(148, 163, 184, 0.1);
	}

	.season-list {
		display: grid;
		gap: 1rem;
	}

	.season-card {
		border-radius: 14px;
		padding: 1rem 1.25rem;
		background: rgba(15, 23, 42, 0.35);
		border: 1px solid rgba(148, 163, 184, 0.12);
	}

	.season-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.season-name {
		font-size: 1rem;
		font-weight: 600;
	}

	.season-dates {
		font-size: 0.85rem;
		color: var(--color-text-muted);
	}

	.season-edit-grid {
		display: grid;
		gap: 1rem;
	}

	.button.compact {
		padding: 0.45rem 0.9rem;
		font-size: 0.85rem;
		border-radius: 999px;
	}

	.profile-footer {
		margin-top: 1.5rem;
	}
</style>
