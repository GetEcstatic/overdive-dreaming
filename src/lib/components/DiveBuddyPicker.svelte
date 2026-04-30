<!-- Multi-select athlete search used when sharing a manually logged routine. -->
<script lang="ts">
	import { searchPublicUsersByDisplayName } from '$lib/firestore';
	import type { PublicUserProfile } from '$lib/types';

	interface Props {
		selected: PublicUserProfile[];
		selfId: string;
		onChange: (selected: PublicUserProfile[]) => void;
		disabled?: boolean;
	}

	let { selected = $bindable(), selfId, onChange, disabled = false }: Props = $props();

	let searchTerm = $state('');
	let results = $state<PublicUserProfile[]>([]);
	let searching = $state(false);
	let searchError = $state<string | null>(null);
	let loadTimer: ReturnType<typeof setTimeout> | null = null;

	const selectedIds = $derived(new Set(selected.map((profile) => profile.userId)));

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
			results = found.filter(
				(profile) => profile.userId !== selfId && !selectedIds.has(profile.userId)
			);
		} catch (err) {
			searchError = err instanceof Error ? err.message : String(err);
			results = [];
		} finally {
			searching = false;
		}
	}

	function pick(profile: PublicUserProfile): void {
		if (disabled || selectedIds.has(profile.userId)) return;
		selected = [...selected, profile];
		searchTerm = '';
		results = [];
		onChange(selected);
	}

	function remove(userId: string): void {
		if (disabled) return;
		selected = selected.filter((profile) => profile.userId !== userId);
		onChange(selected);
	}
</script>

<div class="buddy-picker">
	{#if selected.length > 0}
		<div class="selected-list" aria-label="Selected dive buddies">
			{#each selected as profile (profile.userId)}
				<div class="selected-chip">
					{#if profile.photoURL}
						<img class="avatar" src={profile.photoURL} alt="" />
					{:else}
						<div class="avatar placeholder" aria-hidden="true"></div>
					{/if}
					<span>{profile.displayName}</span>
					<button type="button" disabled={disabled} aria-label="Remove {profile.displayName}" onclick={() => remove(profile.userId)}>
						×
					</button>
				</div>
			{/each}
		</div>
	{/if}

	<input
		type="search"
		class="search-input"
		placeholder="Search dive buddies by display name..."
		value={searchTerm}
		disabled={disabled}
		oninput={(event) => handleInput((event.target as HTMLInputElement).value)}
	/>

	{#if searching}
		<div class="status">Searching...</div>
	{:else if searchError}
		<div class="status error">{searchError}</div>
	{:else if results.length > 0}
		<ul class="result-list">
			{#each results as profile (profile.userId)}
				<li>
					<button type="button" class="result-row" disabled={disabled} onclick={() => pick(profile)}>
						{#if profile.photoURL}
							<img class="avatar sm" src={profile.photoURL} alt="" />
						{:else}
							<div class="avatar sm placeholder" aria-hidden="true"></div>
						{/if}
						<span>{profile.displayName}</span>
					</button>
				</li>
			{/each}
		</ul>
	{:else if searchTerm.trim() && !searching}
		<div class="status muted">No matches for "{searchTerm}".</div>
	{/if}
</div>

<style>
	.buddy-picker {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}

	.selected-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.selected-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		max-width: 100%;
		padding: 0.35rem 0.45rem;
		background: rgba(20, 184, 166, 0.12);
		border: 1px solid rgba(20, 184, 166, 0.35);
		border-radius: 999px;
		color: var(--color-text);
		font-size: 0.85rem;
	}

	.selected-chip button {
		width: 1.35rem;
		height: 1.35rem;
		border: none;
		border-radius: 50%;
		background: rgba(15, 23, 42, 0.8);
		color: var(--color-text-muted);
		cursor: pointer;
		font: inherit;
		line-height: 1;
	}

	.avatar {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		object-fit: cover;
		flex: 0 0 auto;
	}

	.avatar.sm {
		width: 28px;
		height: 28px;
	}

	.avatar.placeholder {
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
	}

	.search-input {
		background: #0f172a;
		color: var(--color-text);
		border: 1px solid rgba(148, 163, 184, 0.25);
		border-radius: 8px;
		padding: 0.65rem 0.75rem;
		font: inherit;
	}

	.status {
		font-size: 0.85rem;
		color: var(--color-text-muted);
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
		padding: 0.6rem 0.75rem;
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
</style>
