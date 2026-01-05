<script lang="ts">
	import { user } from '$lib/stores/auth';
	import { auth } from '$lib/firebase';
	import { signOut } from 'firebase/auth';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { Timestamp } from 'firebase/firestore';
	import {
		getSeasonsForUser,
		createSeason,
		updateSeason,
		getUserSettings,
		updateUserSettings
	} from '$lib/firestore';
	import type { Season } from '$lib/types';

	type DefaultTimeframe = '1month' | '6months' | '1year';

	const timeframeOptions: { value: DefaultTimeframe; label: string }[] = [
		{ value: '1month', label: 'Last Month' },
		{ value: '6months', label: 'Last 6 Months' },
		{ value: '1year', label: 'Last Year' }
	];

	let defaultFilterKey = $state<string>('tf:1month');
	let defaultTimeframeFallback = $state<DefaultTimeframe>('1month');
	let settingsSaving = $state(false);
	let settingsError = $state<string | null>(null);

	let seasons = $state<Season[]>([]);
	let seasonsLoading = $state(false);
	let seasonsError = $state<string | null>(null);

	let newSeasonName = $state('');
	let newSeasonStart = $state('');
	let newSeasonEnd = $state('');
	let seasonSaving = $state(false);

	let editingSeasonId = $state<string | null>(null);
	let editSeasonName = $state('');
	let editSeasonStart = $state('');
	let editSeasonEnd = $state('');

	const toInputDate = (date: Date) => date.toISOString().split('T')[0];
	const fromInputDate = (value: string) => new Date(`${value}T00:00:00`);
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

	async function loadSettings() {
		if (!$user) return;
		try {
			settingsError = null;
			const settings = await getUserSettings($user.uid);
			if (settings?.defaultTimeframe) {
				defaultTimeframeFallback = settings.defaultTimeframe;
			}
			if (settings?.defaultAnalyticsFilter) {
				defaultFilterKey = settings.defaultAnalyticsFilter;
			} else if (settings?.defaultTimeframe) {
				defaultFilterKey = `tf:${settings.defaultTimeframe}`;
			}
		} catch (error) {
			console.error('Failed to load settings:', error);
			settingsError = 'Failed to load settings.';
		}
	}

	async function loadSeasons() {
		if (!$user) return;
		try {
			seasonsLoading = true;
			seasonsError = null;
			seasons = await getSeasonsForUser($user.uid);
		} catch (error) {
			console.error('Failed to load seasons:', error);
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
			await updateUserSettings($user.uid, {
				defaultAnalyticsFilter: defaultFilterKey,
				defaultTimeframe: defaultTimeframeFallback
			});
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
			await loadSeasons();
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
			await loadSeasons();
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
			goto('/');
		} catch (error) {
			console.error('Error signing out:', error);
		}
	}

	onMount(() => {
		loadSettings();
		loadSeasons();
	});
</script>

<div class="p-6 max-w-2xl mx-auto">
	<h1 class="text-3xl font-bold mb-6 text-[var(--color-primary)]">Profile</h1>

	{#if $user}
		<div class="bg-[var(--color-bg-card)] p-6 rounded-lg mb-6">
			<div class="flex items-center gap-4 mb-6">
				{#if $user.photoURL}
					<img src={$user.photoURL} alt="Profile" class="w-20 h-20 rounded-full" />
				{:else}
					<div class="w-20 h-20 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-2xl font-bold">
						{$user.displayName?.charAt(0) || 'U'}
					</div>
				{/if}
				<div>
					<h2 class="text-2xl font-semibold">{$user.displayName || 'User'}</h2>
					<p class="text-[var(--color-text-muted)]">{$user.email}</p>
				</div>
			</div>

			<div class="space-y-4">
				<div>
					<label class="block mb-2 font-semibold">Email</label>
					<p class="text-[var(--color-text-muted)]">{$user.email}</p>
				</div>

				<div>
					<label class="block mb-2 font-semibold">User ID</label>
					<p class="text-[var(--color-text-muted)] font-mono text-sm break-all">{$user.uid}</p>
				</div>

				<div>
					<label class="block mb-2 font-semibold">Member Since</label>
					<p class="text-[var(--color-text-muted)]">
						{new Date($user.metadata.creationTime || '').toLocaleDateString()}
					</p>
				</div>
			</div>
		</div>

		<div class="bg-[var(--color-bg-card)] p-6 rounded-lg mb-6">
			<h2 class="text-xl font-semibold mb-4">Settings</h2>
			<label class="block mb-2 font-semibold">Default Analytics Filter</label>
			<select
				class="w-full p-2 rounded-md bg-[var(--color-bg)] border border-[rgba(148,163,184,0.2)]"
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
			<p class="text-[var(--color-text-muted)] text-sm mt-2">
				Applies to analytics charts across the app.
			</p>
			{#if settingsError}
				<p class="text-red-400 text-sm mt-2">{settingsError}</p>
			{/if}
		</div>

		<div class="bg-[var(--color-bg-card)] p-6 rounded-lg mb-6">
			<h2 class="text-xl font-semibold mb-4">Seasons</h2>

			<div class="grid gap-3 mb-6">
				<div>
					<label class="block mb-2 font-semibold">Season Name</label>
					<input
						type="text"
						class="w-full p-2 rounded-md bg-[var(--color-bg)] border border-[rgba(148,163,184,0.2)]"
						bind:value={newSeasonName}
						placeholder="e.g., Winter build"
					/>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block mb-2 font-semibold">Start Date</label>
						<input
							type="date"
							class="w-full p-2 rounded-md bg-[var(--color-bg)] border border-[rgba(148,163,184,0.2)]"
							bind:value={newSeasonStart}
						/>
					</div>
					<div>
						<label class="block mb-2 font-semibold">End Date (optional)</label>
						<input
							type="date"
							class="w-full p-2 rounded-md bg-[var(--color-bg)] border border-[rgba(148,163,184,0.2)]"
							bind:value={newSeasonEnd}
						/>
					</div>
				</div>
				<button
					type="button"
					class="mt-2 w-full py-2 bg-[var(--color-primary)] hover:bg-[var(--color-secondary)] rounded-lg font-semibold transition-colors"
					onclick={handleCreateSeason}
					disabled={seasonSaving}
				>
					{seasonSaving ? 'Saving...' : 'Add Season'}
				</button>
			</div>

			{#if seasonsLoading}
				<p class="text-[var(--color-text-muted)]">Loading seasons...</p>
			{:else if seasons.length === 0}
				<p class="text-[var(--color-text-muted)]">No seasons yet.</p>
			{:else}
				<div class="space-y-4">
					{#each seasons as season}
						<div class="border border-[rgba(148,163,184,0.15)] rounded-lg p-4">
							{#if editingSeasonId === season.id}
								<div class="grid gap-3">
									<div>
										<label class="block mb-2 font-semibold">Season Name</label>
										<input
											type="text"
											class="w-full p-2 rounded-md bg-[var(--color-bg)] border border-[rgba(148,163,184,0.2)]"
											bind:value={editSeasonName}
										/>
									</div>
									<div class="grid grid-cols-2 gap-3">
										<div>
											<label class="block mb-2 font-semibold">Start Date</label>
											<input
												type="date"
												class="w-full p-2 rounded-md bg-[var(--color-bg)] border border-[rgba(148,163,184,0.2)]"
												bind:value={editSeasonStart}
											/>
										</div>
										<div>
											<label class="block mb-2 font-semibold">End Date</label>
											<input
												type="date"
												class="w-full p-2 rounded-md bg-[var(--color-bg)] border border-[rgba(148,163,184,0.2)]"
												bind:value={editSeasonEnd}
											/>
										</div>
									</div>
									<div class="flex gap-2">
										<button
											type="button"
											class="flex-1 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-secondary)] rounded-lg font-semibold transition-colors"
											onclick={() => handleUpdateSeason(season.id)}
											disabled={seasonSaving}
										>
											Save
										</button>
										<button
											type="button"
											class="flex-1 py-2 border border-[rgba(148,163,184,0.3)] rounded-lg"
											onclick={cancelEditSeason}
											disabled={seasonSaving}
										>
											Cancel
										</button>
									</div>
								</div>
							{:else}
								<div class="flex items-start justify-between gap-4">
									<div>
										<h3 class="text-lg font-semibold">{season.name}</h3>
										<p class="text-[var(--color-text-muted)] text-sm">
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
										class="px-3 py-1 border border-[rgba(148,163,184,0.3)] rounded-md text-sm"
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
				<p class="text-red-400 text-sm mt-3">{seasonsError}</p>
			{/if}
		</div>

		<button
			onclick={handleSignOut}
			class="w-full py-3 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-colors"
		>
			Sign Out
		</button>
	{/if}
</div>
