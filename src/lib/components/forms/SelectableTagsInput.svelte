<script lang="ts">
	/**
	 * SelectableTagsInput - Toggle buttons for selecting tags from a routine's selectable tags
	 */
	import { getTagByValue } from '$lib/config/tagConfig';

	interface Props {
		availableTags: string[];
		selectedTags: string[];
		onChange: (tags: string[]) => void;
	}

	let { availableTags, selectedTags, onChange }: Props = $props();

	function toggleTag(tagValue: string) {
		if (selectedTags.includes(tagValue)) {
			onChange(selectedTags.filter(t => t !== tagValue));
		} else {
			onChange([...selectedTags, tagValue]);
		}
	}
</script>

{#if availableTags.length > 0}
	<div class="tags-input">
		<span class="section-label" id="tags-label">Tags</span>
		<p class="section-hint">Select any that apply to this session</p>
		<div class="selectable-tags" role="group" aria-labelledby="tags-label">
			{#each availableTags as tagValue}
				{@const tagInfo = getTagByValue(tagValue)}
				<button
					type="button"
					class="tag-toggle-btn"
					class:selected={selectedTags.includes(tagValue)}
					onclick={() => toggleTag(tagValue)}
					aria-pressed={selectedTags.includes(tagValue)}
				>
					{#if tagInfo?.icon}<span class="tag-icon">{tagInfo.icon}</span>{/if}
					<span class="tag-label">{tagInfo?.label || tagValue}</span>
				</button>
			{/each}
		</div>
	</div>
{/if}

<style>
	.tags-input {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.section-label {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.section-hint {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin: 0;
	}

	.selectable-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.tag-toggle-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.875rem;
		border: 1px solid var(--color-border);
		border-radius: 9999px;
		background: var(--color-bg-card);
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.tag-toggle-btn:hover {
		border-color: var(--color-primary);
	}

	.tag-toggle-btn.selected {
		background: rgba(20, 184, 166, 0.15);
		color: var(--color-primary);
		border-color: var(--color-primary);
	}

	.tag-icon {
		font-size: 1rem;
	}

	.tag-label {
		font-weight: 500;
	}
</style>
