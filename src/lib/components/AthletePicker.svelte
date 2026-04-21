<!--
  AthletePicker.svelte
  Search-and-pick UI for selecting the athlete recipient of a dive video gift.
  Searches `usersPublic` by display-name prefix (case-sensitive — matches
  existing `searchPublicUsersByDisplayName`).

  Emits the selected athlete's userId (or undefined for "self / no gift").
-->
<script lang="ts">
	import { searchPublicUsersByDisplayName, getPublicUserProfile } from '$lib/firestore';
	import type { PublicUserProfile } from '$lib/types';

	interface Props {
		/** Current selection. undefined means "this is my own dive" (no gift). */
		athleteId?: string;
		/** Coach's own uid, used to skip self from results and label "Me". */
		selfId: string;
		onChange: (athleteId: string | undefined) => void;
	}

	let { athleteId = $bindable(), selfId, onChange }: Props = $props();

	let searchTerm = $state('');
	let results = $state<PublicUserProfile[]>([]);
	let searching = $state(false);
	let searchError = $state<string | null>(null);
	let selectedProfile = $state<PublicUserProfile | null>(null);
	let loadTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		const id = athleteId;
		if (!id || id === selfId) {
			selectedProfile = null;
			return;
		}
		if (selectedProfile?.userId === id) return;
		getPublicUserProfile(id)
			.then((p) => {
				selectedProfile = p;
			})
			.catch(() => {
				selectedProfile = null;
			});
	});

	function handleInput(value: string): void {
		searchTerm = value;
		if (loadTimer) clearTimeout(loadTimer);
		loadTimer = setTimeout(() => {
			void runSearch(value);
		}, 200);
	}

	async function runSearch(term: string): Promise<void> {
		if (!term.trim()) {
			results = [];
			return;
		}
		searching = true;
		searchError = null;
		try {
			const found = await searchPublicUsersByDisplayName(term, 8);
			results = found.filter((p) => p.userId !== selfId);
		} catch (err) {
			searchError = err instanceof Error ? err.message : String(err);
			results = [];
		} finally {
			searching = false;
		}
	}

	function pick(profile: PublicUserProfile): void {
		athleteId = profile.userId;
		selectedProfile = profile;
		searchTerm = '';
		results = [];
		onChange(profile.userId);
	}

	function clearSelection(): void {
		athleteId = undefined;
		selectedProfile = null;
		onChange(undefined);
	}
</script>

<div class="athlete-picker">
	{#if athleteId && athleteId !== selfId}
		<div class="selected">
			<div class="selected-info">
				{#if selectedProfile?.photoURL}
					<img class="avatar" src={selectedProfile.photoURL} alt="" />
				{:else}
					<div class="avatar placeholder" aria-hidden="true"></div>
				{/if}
				<div class="selected-text">
					<div class="selected-name">
						{selectedProfile?.displayName ?? 'Selected athlete'}
					</div>
					<div class="selected-sub">Will receive this video as a gift.</div>
				</div>
			</div>
			<button type="button" class="clear-btn" onclick={clearSelection}>
				Clear
			</button>
		</div>
	{:else}
		<div class="self-hint">
			This dive is yours. <span class="muted">Search below to gift it to another athlete instead.</span>
		</div>
	{/if}

	<input
		type="search"
		class="search-input"
		placeholder="Search athletes by display name…"
		value={searchTerm}
		oninput={(e) => handleInput((e.target as HTMLInputElement).value)}
	/>

	{#if searching}
		<div class="status">Searching…</div>
	{:else if searchError}
		<div class="status error">{searchError}</div>
	{:else if results.length > 0}
		<ul class="result-list">
			{#each results as profile (profile.userId)}
				<li>
					<button type="button" class="result-row" onclick={() => pick(profile)}>
						{#if profile.photoURL}
							<img class="avatar sm" src={profile.photoURL} alt="" />
						{:else}
							<div class="avatar sm placeholder" aria-hidden="true"></div>
						{/if}
						<span class="result-name">{profile.displayName}</span>
					</button>
				</li>
			{/each}
		</ul>
	{:else if searchTerm.trim() && !searching}
		<div class="status muted">No matches for "{searchTerm}".</div>
	{/if}
</div>

<style>
	.athlete-picker {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.self-hint {
		font-size: 0.85rem;
		color: var(--color-text);
	}

	.muted {
		color: var(--color-text-muted);
	}

	.selected {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 0.75rem;
		background: rgba(20, 184, 166, 0.12);
		border: 1px solid rgba(20, 184, 166, 0.35);
		border-radius: 10px;
	}

	.selected-info {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.selected-name {
		font-weight: 600;
		color: var(--color-text);
	}

	.selected-sub {
		font-size: 0.8rem;
		color: var(--color-text-muted);
	}

	.avatar {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		object-fit: cover;
	}

	.avatar.sm {
		width: 28px;
		height: 28px;
	}

	.avatar.placeholder {
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
	}

	.clear-btn {
		background: transparent;
		border: 1px solid rgba(148, 163, 184, 0.3);
		color: var(--color-text-muted);
		padding: 0.35rem 0.7rem;
		border-radius: 8px;
		cursor: pointer;
		font-size: 0.85rem;
	}

	.search-input {
		background: #0f172a;
		color: var(--color-text);
		border: 1px solid rgba(148, 163, 184, 0.25);
		border-radius: 8px;
		padding: 0.55rem 0.7rem;
		font: inherit;
	}

	.status {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		padding: 0.25rem 0;
	}

	.status.error {
		color: #ef4444;
	}

	.result-list {
		list-style: none;
		padding: 0;
		margin: 0;
		background: #0f172a;
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 8px;
		overflow: hidden;
	}

	.result-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		padding: 0.55rem 0.7rem;
		background: transparent;
		border: none;
		color: var(--color-text);
		cursor: pointer;
		text-align: left;
		font: inherit;
	}

	.result-row:hover {
		background: rgba(148, 163, 184, 0.08);
	}

	.result-name {
		color: var(--color-text);
	}
</style>
