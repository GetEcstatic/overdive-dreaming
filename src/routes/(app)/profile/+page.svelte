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
	import type { DiveVideoQualityPreset, DiveVideoResolution, Season, SessionVisibility, UserSettings, Gender } from '$lib/types';
	import { formatRecordingSizePerMinute, recordingVideoSettings } from '$lib/capture/videoQuality';
	import {
		listPendingUploads,
		resetAttempts,
		type PendingUpload
	} from '$lib/capture/uploadQueue';
	import { drainUploadQueue } from '$lib/capture/uploadProcessor';
	import type { PublicModeAccess } from '$lib/publicMode/capabilities';

	type DefaultTimeframe = '1month' | '6months' | '1year';

	const timeframeOptions: { value: DefaultTimeframe; label: string }[] = [
		{ value: '1month', label: 'Last Month' },
		{ value: '6months', label: 'Last 6 Months' },
		{ value: '1year', label: 'Last Year' }
	];

	const genderOptions: { value: Gender; label: string }[] = [
		{ value: 'male', label: 'Male' },
		{ value: 'female', label: 'Female' },
		{ value: 'prefer-not-to-say', label: 'Other / Prefer not to say' }
	];

	let defaultFilterKey = $state<string>('tf:1month');
	let defaultTimeframeFallback = $state<DefaultTimeframe>('1month');
	let defaultSessionVisibility = $state<SessionVisibility>('private');
	let showMenstrualCycleTracking = $state<boolean>(false);
	let gender = $state<Gender | undefined>(undefined);
	let publicModeAccess = $state<PublicModeAccess>('public');
	let fullAccessGranted = $state(false);
	let defaultVideoResolution = $state<DiveVideoResolution>(recordingVideoSettings(undefined).resolution);
	let defaultVideoQualityPreset = $state<DiveVideoQualityPreset>(recordingVideoSettings(undefined).qualityPreset);
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

	let pendingUploads = $state<PendingUpload[]>([]);
	let pendingRetrying = $state(false);
	let pendingError = $state<string | null>(null);
	let pendingResultMessage = $state<string | null>(null);
	let pendingProgressByLocalId = $state<Record<string, number>>({});
	const pendingOverallFraction = $derived.by(() => {
		const total = pendingUploads.reduce((acc, p) => acc + p.sizeBytes, 0);
		if (total === 0) return 0;
		return pendingUploads.reduce((acc, p) => acc + p.sizeBytes * (pendingProgressByLocalId[p.localId] ?? 0), 0) / total;
	});
	let showSeasonForm = $state(false);

	async function loadPendingUploads() {
		try {
			pendingError = null;
			pendingUploads = await listPendingUploads();
		} catch (error) {
			console.error('Failed to load pending uploads:', error);
			pendingError = 'Failed to read the pending uploads queue.';
		}
	}

	async function handleRetryUploads() {
		if (pendingRetrying || pendingUploads.length === 0) return;
		try {
			pendingRetrying = true;
			pendingError = null;
			pendingResultMessage = null;
			pendingProgressByLocalId = {};
			// Reset attempts so items previously past MAX_ATTEMPTS are tried again.
			await resetAttempts();
			const result = await drainUploadQueue((p) => {
				pendingProgressByLocalId = {
					...pendingProgressByLocalId,
					[p.localId]: p.fraction
				};
			});
			const parts: string[] = [];
			if (result.uploaded > 0) parts.push(`${result.uploaded} uploaded`);
			if (result.failed > 0) parts.push(`${result.failed} failed`);
			if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
			pendingResultMessage = parts.length > 0 ? parts.join(' · ') : 'Nothing to upload.';
			await loadPendingUploads();
		} catch (error) {
			console.error('Retry uploads failed:', error);
			pendingError = error instanceof Error ? error.message : String(error);
		} finally {
			pendingRetrying = false;
		}
	}

	function formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

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
		if (settings?.gender) {
			gender = settings.gender;
		}
		if (settings?.publicModeAccess) {
			publicModeAccess = settings.publicModeAccess;
		}
		if (settings?.fullAccessGranted !== undefined) {
			fullAccessGranted = settings.fullAccessGranted;
		} else if (settings?.publicModeAccess === 'advanced' || settings?.publicModeAccess === 'admin') {
			fullAccessGranted = true;
		}
		({ resolution: defaultVideoResolution, qualityPreset: defaultVideoQualityPreset } = recordingVideoSettings(settings));
	}

	function buildNextSettings(): UserSettings {
		return {
			defaultAnalyticsFilter: defaultFilterKey,
			defaultTimeframe: defaultTimeframeFallback,
			defaultSessionVisibility,
			publicModeAccess,
			fullAccessGranted,
			showMenstrualCycleTracking,
			gender,
			defaultVideoResolution,
			defaultVideoQualityPreset
		};
	}

	async function handlePublicModeAccessChange(enabled: boolean) {
		if (!$user || publicModeAccess === 'admin') return;
		try {
			settingsSaving = true;
			settingsError = null;
			publicModeAccess = enabled ? 'advanced' : 'public';
			fullAccessGranted = true;
			const nextSettings = buildNextSettings();
			await updateUserSettings($user.uid, nextSettings);
			updateProfileCache($user.uid, { settings: nextSettings });
		} catch (error) {
			console.error('Failed to update access mode:', error);
			settingsError = 'Failed to save access mode.';
		} finally {
			settingsSaving = false;
		}
	}

	async function handleVideoSettingsChange() {
		if (!$user) return;
		try {
			settingsSaving = true;
			settingsError = null;
			const nextSettings = buildNextSettings();
			await updateUserSettings($user.uid, nextSettings);
			updateProfileCache($user.uid, { settings: nextSettings });
		} catch (error) {
			console.error('Failed to update settings:', error);
			settingsError = 'Failed to save settings.';
		} finally {
			settingsSaving = false;
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
				publicModeAccess,
				fullAccessGranted,
				showMenstrualCycleTracking,
				gender,
				defaultVideoResolution
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
				publicModeAccess,
				fullAccessGranted,
				showMenstrualCycleTracking,
				gender,
				defaultVideoResolution
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
				publicModeAccess,
				fullAccessGranted,
				showMenstrualCycleTracking,
				gender,
				defaultVideoResolution
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

	async function handleGenderChange() {
		if (!$user) return;
		try {
			settingsSaving = true;
			settingsError = null;
			const nextSettings: UserSettings = {
				defaultAnalyticsFilter: defaultFilterKey,
				defaultTimeframe: defaultTimeframeFallback,
				defaultSessionVisibility,
				publicModeAccess,
				fullAccessGranted,
				showMenstrualCycleTracking,
				gender,
				defaultVideoResolution
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
			showSeasonForm = false;
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
		loadPendingUploads();
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
	<h1 class="profile-title">Profile</h1>

	{#if $user}
		<div class="profile-grid">
			<section class="profile-card">
				<div class="account-identity">
					{#if $user.photoURL}
						<img src={$user.photoURL} alt="" class="avatar" />
					{:else}
						<div class="avatar placeholder">
							{$user.displayName?.charAt(0) || 'U'}
						</div>
					{/if}
					<div class="account-text">
						<h2 class="account-name">{$user.displayName || 'User'}</h2>
						<p class="account-meta">{$user.email}</p>
						{#if $user.metadata.creationTime}
							<p class="account-meta">
								Member since {new Date($user.metadata.creationTime).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
							</p>
						{/if}
					</div>
				</div>
				<div class="access-mode-group">
					{#if publicModeAccess === 'admin'}
						<p class="form-hint">Admin access is enabled for this account.</p>
					{:else if fullAccessGranted || publicModeAccess === 'advanced'}
						<label class="toggle-label">
							<input
								type="checkbox"
								checked={publicModeAccess !== 'public'}
								onchange={(event) => handlePublicModeAccessChange(event.currentTarget.checked)}
								disabled={settingsSaving}
							/>
							<span>Use full private beta app</span>
						</label>
						<p class="form-hint">Turn this off to preview the simpler public app.</p>
					{:else}
						<p class="form-hint">Your account is on the simpler public app.</p>
						<a
							class="access-request-link"
							href="mailto:getecstatic.comp@gmail.com?subject=Overdive%20full%20access%20request"
						>
							Request full private beta access
						</a>
					{/if}
				</div>
			</section>

			{#if pendingUploads.length > 0}
				{@const totalBytes = pendingUploads.reduce((acc, p) => acc + p.sizeBytes, 0)}
				{@const lastError = pendingUploads.find((p) => p.lastError)?.lastError}
				<section class="profile-card pending-card">
					<h2 class="card-title">Videos waiting to upload</h2>
					<p class="card-subtitle">
						{pendingUploads.length} video{pendingUploads.length === 1 ? '' : 's'} on this device · {formatBytes(totalBytes)}.
						They upload automatically when you're online.
					</p>
					{#if pendingRetrying}
						<div class="pending-progress">
							<div class="pending-progress-bar" style="width: {Math.round(pendingOverallFraction * 100)}%"></div>
						</div>
					{/if}
					{#if lastError}
						<p class="form-hint error-text">Last error: {lastError}</p>
					{/if}
					<button
						type="button"
						class="button button-primary full-width"
						onclick={handleRetryUploads}
						disabled={pendingRetrying}
					>
						{pendingRetrying ? 'Uploading...' : 'Upload now'}
					</button>
				</section>
			{/if}
			{#if pendingResultMessage}
				<p class="form-hint">{pendingResultMessage}</p>
			{/if}
			{#if pendingError}
				<p class="form-hint error-text">{pendingError}</p>
			{/if}

			<section class="profile-card">
				<h2 class="card-title">Recording</h2>
				<div class="form-group">
					<label class="form-label" for="video-resolution-select">Video resolution</label>
					<select
						id="video-resolution-select"
						class="form-select"
						bind:value={defaultVideoResolution}
						onchange={handleVideoSettingsChange}
						disabled={settingsSaving}
					>
						<option value="1080p">1080p · sharper, best for sharing</option>
						<option value="720p">720p · smaller files</option>
					</select>
				</div>
				<div class="form-group">
					<label class="form-label" for="video-quality-select">Video quality</label>
					<select
						id="video-quality-select"
						class="form-select"
						bind:value={defaultVideoQualityPreset}
						onchange={handleVideoSettingsChange}
						disabled={settingsSaving}
					>
						<option value="standard">Standard</option>
						<option value="high">High</option>
						<option value="max">Max</option>
					</select>
					<p class="form-hint">
						About {formatRecordingSizePerMinute(defaultVideoResolution, defaultVideoQualityPreset)} of video.
					</p>
				</div>
			</section>

			<section class="profile-card">
				<h2 class="card-title">Logs and analytics</h2>
				<div class="form-group">
					<label class="form-label" for="default-visibility">New logs are</label>
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
					<p class="form-hint">You can still change it for each session.</p>
				</div>
				<div class="form-group">
					<label class="form-label" for="default-filter">Analytics period</label>
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
				</div>
			</section>

			<section class="profile-card">
				<h2 class="card-title">About you</h2>
				<div class="form-group">
					<label class="form-label" for="gender-select">Gender</label>
					<select
						id="gender-select"
						class="form-select"
						bind:value={gender}
						onchange={handleGenderChange}
						disabled={settingsSaving}
					>
						<option value={undefined}>Not specified</option>
						{#each genderOptions as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</div>
				<div class="form-group">
					<label class="toggle-label">
						<input
							type="checkbox"
							bind:checked={showMenstrualCycleTracking}
							onchange={handleMenstrualCycleTrackingChange}
							disabled={settingsSaving}
						/>
						<span>Track menstrual cycle day</span>
					</label>
					<p class="form-hint">Adds a cycle day field to session logs.</p>
				</div>
			</section>
			{#if settingsError}
				<p class="form-hint error-text">{settingsError}</p>
			{/if}

			<section class="profile-card">
				<div class="card-header">
					<h2 class="card-title">Seasons</h2>
					{#if !showSeasonForm}
						<button type="button" class="button button-secondary compact" onclick={() => (showSeasonForm = true)}>
							Add
						</button>
					{/if}
				</div>
				<p class="card-subtitle">Training blocks you can filter analytics by.</p>

				{#if showSeasonForm}
					<div class="season-form">
						<div class="form-group">
							<label class="form-label" for="season-name">Name</label>
							<input
								id="season-name"
								type="text"
								class="form-input"
								bind:value={newSeasonName}
								placeholder="e.g. Winter build"
							/>
						</div>
						<div class="form-row">
							<div class="form-group">
								<label class="form-label" for="season-start">Start</label>
								<input id="season-start" type="date" class="form-input" bind:value={newSeasonStart} />
							</div>
							<div class="form-group">
								<label class="form-label" for="season-end">End (optional)</label>
								<input id="season-end" type="date" class="form-input" bind:value={newSeasonEnd} />
							</div>
						</div>
						<div class="button-row">
							<button
								type="button"
								class="button button-primary"
								onclick={handleCreateSeason}
								disabled={seasonSaving}
							>
								{seasonSaving ? 'Saving...' : 'Add season'}
							</button>
							<button
								type="button"
								class="button button-secondary"
								onclick={() => (showSeasonForm = false)}
								disabled={seasonSaving}
							>
								Cancel
							</button>
						</div>
					</div>
				{/if}

				{#if seasonsLoading}
					<p class="form-hint">Loading seasons...</p>
				{:else if seasons.length > 0}
					<div class="season-list">
						{#each seasons as season}
							<div class="season-card">
								{#if editingSeasonId === season.id}
									<div class="season-edit-grid">
										<div class="form-group">
											<label class="form-label" for={`season-name-${season.id}`}>Name</label>
											<input
												id={`season-name-${season.id}`}
												type="text"
												class="form-input"
												bind:value={editSeasonName}
											/>
										</div>
										<div class="form-row">
											<div class="form-group">
												<label class="form-label" for={`season-start-${season.id}`}>Start</label>
												<input
													id={`season-start-${season.id}`}
													type="date"
													class="form-input"
													bind:value={editSeasonStart}
												/>
											</div>
											<div class="form-group">
												<label class="form-label" for={`season-end-${season.id}`}>End</label>
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

			<section class="profile-card">
				<h2 class="card-title">Import AIDA results</h2>
				<p class="card-subtitle">Bring in competition results from an AIDA spreadsheet.</p>
				<a class="button button-secondary full-width" href="/import/aida">Import results</a>
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
						{importUndoing ? 'Undoing import...' : 'Undo last import'}
					</button>
				{/if}
				{#if importUndoSuccess}
					<p class="form-hint">{importUndoSuccess}</p>
				{/if}
				{#if importUndoError}
					<p class="form-hint error-text">{importUndoError}</p>
				{/if}
			</section>

			<section id="safety" class="profile-card safety-card">
				<h2 class="card-title">Safety first</h2>
				<p class="safety-copy">
					Never freedive alone. Train with a capable buddy, agree on safety signals before the session, and end the dive or session early if conditions change.
				</p>
				<a class="safety-link" href="https://www.aidainternational.org/" target="_blank" rel="noopener noreferrer">
					AIDA International safety resources
				</a>
			</section>
		</div>

		<div class="profile-footer">
			<button onclick={handleSignOut} class="button button-secondary full-width">Sign out</button>
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


	.profile-title {
		margin-bottom: 1.25rem;
		font-size: 2rem;
		font-weight: 700;
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
	}


	.profile-grid {
		display: grid;
		gap: 1rem;
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

	.profile-card {
		display: grid;
		gap: 1rem;
	}

	.card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.card-title {
		font-size: 1.1rem;
		font-weight: 600;
		letter-spacing: 0.02em;
	}

	.card-subtitle {
		margin: -0.6rem 0 0;
		font-size: 0.85rem;
		line-height: 1.45;
		color: var(--color-text-muted);
	}

	.pending-card {
		border-color: rgba(20, 184, 166, 0.4);
	}

	.safety-card {
		border-color: rgba(251, 191, 36, 0.24);
		background: linear-gradient(135deg, rgba(251, 191, 36, 0.07), rgba(15, 23, 42, 0.5));
	}

	.safety-copy {
		margin: 0 0 0.85rem;
		color: var(--color-text-muted);
		font-size: 0.9rem;
		line-height: 1.5;
	}

	.safety-link {
		display: inline-flex;
		align-items: center;
		min-height: 2.4rem;
		color: var(--color-primary);
		font-size: 0.9rem;
		font-weight: 700;
		text-decoration: none;
	}

	.account-identity {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.account-text {
		min-width: 0;
	}

	.account-meta {
		margin: 0.15rem 0 0;
		font-size: 0.85rem;
		color: var(--color-text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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






	.form-group {
		display: grid;
		gap: 0.5rem;
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

	.access-mode-group {
		padding: 0.85rem;
		border: 1px solid rgba(20, 184, 166, 0.2);
		border-radius: 8px;
		background: rgba(20, 184, 166, 0.06);
	}

	.access-request-link {
		display: inline-flex;
		align-items: center;
		min-height: 2.4rem;
		color: var(--color-primary);
		font-size: 0.9rem;
		font-weight: 700;
		text-decoration: none;
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
		gap: 0.75rem;
		padding-bottom: 1rem;
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







	.pending-progress {
		margin-top: 0.75rem;
		height: 4px;
		background: rgba(148, 163, 184, 0.2);
		border-radius: 999px;
		overflow: hidden;
	}

	.pending-progress-bar {
		height: 100%;
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
		transition: width 0.2s ease;
	}
</style>
