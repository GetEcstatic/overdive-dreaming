<script lang="ts">
	/**
	 * CompetitionToggle - Toggle for marking session as competition with card/record tags
	 */
	import type { CardTag, RecordTag } from '$lib/types';

	interface Props {
		isCompetition: boolean;
		cardTag: CardTag | undefined;
		recordTag: RecordTag | undefined;
		competitionOrg: string;
		onCompetitionChange: (value: boolean) => void;
		onCardTagChange: (value: CardTag | undefined) => void;
		onRecordTagChange: (value: RecordTag | undefined) => void;
		onOrgChange: (value: string) => void;
	}

	let { 
		isCompetition, 
		cardTag, 
		recordTag, 
		competitionOrg,
		onCompetitionChange,
		onCardTagChange,
		onRecordTagChange,
		onOrgChange
	}: Props = $props();

	const cardOptions: Array<{ value: CardTag; label: string }> = [
		{ value: 'white', label: '⬜️' },
		{ value: 'yellow', label: '🟨' },
		{ value: 'red', label: '🟥' }
	];

	const recordOptions: RecordTag[] = ['NR', 'CR', 'WR'];

	function toggleCardTag(value: CardTag) {
		onCardTagChange(cardTag === value ? undefined : value);
	}

	function toggleRecordTag(value: RecordTag) {
		onRecordTagChange(recordTag === value ? undefined : value);
	}
</script>

<div class="competition-toggle">
	<span class="field-label" id="session-tags-label">Session Tags</span>
	<div class="tag-row" role="group" aria-labelledby="session-tags-label">
		<button
			type="button"
			class="tag-button"
			class:active={isCompetition}
			onclick={() => onCompetitionChange(!isCompetition)}
			aria-pressed={isCompetition}
		>
			Comp
		</button>
		
		{#if isCompetition}
			<span class="tag-group-label">Cards</span>
			<div class="tag-group" role="group" aria-label="Competition cards">
				{#each cardOptions as card}
					<button
						type="button"
						class="tag-button"
						class:active={cardTag === card.value}
						onclick={() => toggleCardTag(card.value)}
						aria-label={`${card.value} card`}
						aria-pressed={cardTag === card.value}
					>
						{card.label}
					</button>
				{/each}
			</div>
			
			<span class="tag-group-label">Record</span>
			<div class="tag-group" role="group" aria-label="Record type">
				{#each recordOptions as tag}
					<button
						type="button"
						class="tag-button"
						class:active={recordTag === tag}
						onclick={() => toggleRecordTag(tag)}
						aria-pressed={recordTag === tag}
					>
						{tag}
					</button>
				{/each}
			</div>
		{/if}
	</div>
	<p class="field-hint">Pick a record tag if applicable (one max)</p>

	{#if isCompetition}
		<div class="field-group">
			<label for="competitionOrg" class="field-label">Competition Org</label>
			<input
				id="competitionOrg"
				type="text"
				value={competitionOrg}
				oninput={(e) => onOrgChange(e.currentTarget.value)}
				class="field-input"
				list="competition-org-options"
				placeholder="AIDA or CMAS"
			/>
			<datalist id="competition-org-options">
				<option value="AIDA"></option>
				<option value="CMAS"></option>
			</datalist>
		</div>
	{/if}
</div>

<style>
	.competition-toggle {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.field-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.field-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text);
	}

	.tag-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	.tag-group-label {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin-left: 0.5rem;
	}

	.tag-group {
		display: flex;
		gap: 0.25rem;
	}

	.tag-button {
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: 9999px;
		background: var(--color-bg-card);
		color: var(--color-text-muted);
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.tag-button:hover {
		border-color: var(--color-primary);
	}

	.tag-button.active {
		background: var(--color-primary);
		color: white;
		border-color: var(--color-primary);
	}

	.field-input {
		padding: 0.75rem;
		background: var(--color-bg-input);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		color: var(--color-text);
		font-size: 1rem;
	}

	.field-input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.field-hint {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin: 0;
	}
</style>
