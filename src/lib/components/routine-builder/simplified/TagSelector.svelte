<script lang="ts">
	/**
	 * TagSelector - Tag configuration for routine builder
	 * 
	 * Allows users to configure:
	 * 1. Default tags - automatically applied to every log
	 * 2. Selectable tags - available for user to choose when logging
	 */

	import { 
		ALL_TAG_CATEGORIES, 
		type TagCategory, 
		type TagOption 
	} from '$lib/config/tagConfig';

	let {
		defaultTags = $bindable<string[]>([]),
		selectableTags = $bindable<string[]>([])
	}: {
		defaultTags: string[];
		selectableTags: string[];
	} = $props();

	// Track which category is expanded
	let expandedCategory = $state<string | null>('effort');

	function toggleCategory(categoryId: string) {
		expandedCategory = expandedCategory === categoryId ? null : categoryId;
	}

	function isDefault(tagValue: string): boolean {
		return defaultTags.includes(tagValue);
	}

	function isSelectable(tagValue: string): boolean {
		return selectableTags.includes(tagValue);
	}

	function toggleDefault(tag: TagOption) {
		if (!tag.allowAsDefault) return;
		
		if (defaultTags.includes(tag.value)) {
			defaultTags = defaultTags.filter(t => t !== tag.value);
		} else {
			// If it was selectable, move it to default
			if (selectableTags.includes(tag.value)) {
				selectableTags = selectableTags.filter(t => t !== tag.value);
			}
			defaultTags = [...defaultTags, tag.value];
		}
	}

	function toggleSelectable(tag: TagOption) {
		if (!tag.allowAsSelectable) return;
		
		if (selectableTags.includes(tag.value)) {
			selectableTags = selectableTags.filter(t => t !== tag.value);
		} else {
			// If it was default, move it to selectable
			if (defaultTags.includes(tag.value)) {
				defaultTags = defaultTags.filter(t => t !== tag.value);
			}
			selectableTags = [...selectableTags, tag.value];
		}
	}

	function getTagState(tag: TagOption): 'default' | 'selectable' | 'none' {
		if (defaultTags.includes(tag.value)) return 'default';
		if (selectableTags.includes(tag.value)) return 'selectable';
		return 'none';
	}
</script>

<div class="tag-selector">
	<div class="header">
		<h2>Configure Routine Tags</h2>
		<p class="section-hint">Tags help categorize sessions and enable powerful filtering in analytics</p>
	</div>

	<div class="instructions">
		<div class="instruction-card">
			<div class="instruction-header">
				<span class="legend-badge default">D</span>
				<span class="instruction-title">Default Tags</span>
			</div>
			<p class="instruction-text">
				Automatically applied to every log created with this routine. 
				Great for training focus (CO₂/O₂), difficulty level, or adaptation type.
			</p>
		</div>
		<div class="instruction-card">
			<div class="instruction-header">
				<span class="legend-badge selectable">S</span>
				<span class="instruction-title">Selectable Tags</span>
			</div>
			<p class="instruction-text">
				Users choose from these when logging a session. 
				Useful for variable conditions like effort level or session context.
			</p>
		</div>
	</div>

	<div class="categories">
		{#each ALL_TAG_CATEGORIES as category}
			<div class="category" class:expanded={expandedCategory === category.id}>
				<button 
					type="button"
					class="category-header"
					onclick={() => toggleCategory(category.id)}
				>
					<span class="category-title">{category.label}</span>
					<span class="category-toggle">{expandedCategory === category.id ? '−' : '+'}</span>
				</button>
				
				{#if expandedCategory === category.id}
					<div class="category-content">
						<p class="category-description">{category.description}</p>
						
						<div class="tags-list">
							{#each category.tags as tag}
								{@const state = getTagState(tag)}
								<div class="tag-row">
									<div class="tag-info">
										{#if tag.icon}
											<span class="tag-icon">{tag.icon}</span>
										{/if}
										<div class="tag-text">
											<span class="tag-label">{tag.label}</span>
											<span class="tag-description">{tag.description}</span>
										</div>
									</div>
									
									<div class="tag-actions">
										{#if tag.allowAsDefault}
											<button
												type="button"
												class="action-btn default"
												class:active={state === 'default'}
												title="Set as default (always applied)"
												onclick={() => toggleDefault(tag)}
											>
												D
											</button>
										{:else}
											<span class="action-placeholder"></span>
										{/if}
										
										{#if tag.allowAsSelectable}
											<button
												type="button"
												class="action-btn selectable"
												class:active={state === 'selectable'}
												title="Make selectable (user chooses)"
												onclick={() => toggleSelectable(tag)}
											>
												S
											</button>
										{:else}
											<span class="action-placeholder"></span>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	{#if defaultTags.length > 0 || selectableTags.length > 0}
		<div class="summary">
			<h3>Selected Tags</h3>
			
			{#if defaultTags.length > 0}
				<div class="summary-section">
					<span class="summary-label">Default:</span>
					<div class="tag-chips">
						{#each defaultTags as tagValue}
							<span class="chip default">{tagValue}</span>
						{/each}
					</div>
				</div>
			{/if}
			
			{#if selectableTags.length > 0}
				<div class="summary-section">
					<span class="summary-label">Selectable:</span>
					<div class="tag-chips">
						{#each selectableTags as tagValue}
							<span class="chip selectable">{tagValue}</span>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.tag-selector {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.header h2 {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 0.25rem;
	}

	.section-hint {
		font-size: 0.875rem;
		color: var(--color-text-muted);
		margin: 0;
	}

	.instructions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.instruction-card {
		padding: 1rem;
		background: var(--color-bg);
		border-radius: 10px;
		border: 1px solid rgba(148, 163, 184, 0.2);
	}

	.instruction-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.instruction-title {
		font-weight: 600;
		font-size: 0.9rem;
		color: var(--color-text);
	}

	.instruction-text {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		margin: 0;
		line-height: 1.4;
	}

	.legend-badge {
		width: 1.5rem;
		height: 1.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.legend-badge.default {
		background: rgba(20, 184, 166, 0.2);
		color: var(--color-primary);
		border: 1px solid var(--color-primary);
	}

	.legend-badge.selectable {
		background: rgba(168, 85, 247, 0.2);
		color: #a855f7;
		border: 1px solid #a855f7;
	}

	.categories {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.category {
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 12px;
		overflow: hidden;
	}

	.category.expanded {
		border-color: var(--color-primary);
	}

	.category-header {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		background: none;
		border: none;
		color: var(--color-text);
		font-size: 1rem;
		font-weight: 500;
		cursor: pointer;
		text-align: left;
	}

	.category-header:hover {
		background: rgba(148, 163, 184, 0.1);
	}

	.category-toggle {
		font-size: 1.25rem;
		color: var(--color-text-muted);
	}

	.category-content {
		padding: 0 1rem 1rem;
	}

	.category-description {
		font-size: 0.875rem;
		color: var(--color-text-muted);
		margin: 0 0 1rem;
	}

	.tags-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.tag-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem;
		background: var(--color-bg);
		border-radius: 8px;
		border: 1px solid rgba(148, 163, 184, 0.15);
	}

	.tag-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
		min-width: 0;
	}

	.tag-icon {
		font-size: 1.25rem;
		flex-shrink: 0;
	}

	.tag-text {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}

	.tag-label {
		font-size: 0.9rem;
		font-weight: 500;
		color: var(--color-text);
	}

	.tag-description {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tag-actions {
		display: flex;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.action-btn {
		width: 2rem;
		height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 6px;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.action-btn.default {
		background: transparent;
		border: 1.5px solid rgba(20, 184, 166, 0.4);
		color: rgba(20, 184, 166, 0.6);
	}

	.action-btn.default:hover,
	.action-btn.default.active {
		background: rgba(20, 184, 166, 0.2);
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.action-btn.selectable {
		background: transparent;
		border: 1.5px solid rgba(168, 85, 247, 0.4);
		color: rgba(168, 85, 247, 0.6);
	}

	.action-btn.selectable:hover,
	.action-btn.selectable.active {
		background: rgba(168, 85, 247, 0.2);
		border-color: #a855f7;
		color: #a855f7;
	}

	.action-placeholder {
		width: 2rem;
		height: 2rem;
	}

	.summary {
		padding: 1rem;
		background: var(--color-bg);
		border-radius: 12px;
		border: 1px solid rgba(148, 163, 184, 0.2);
	}

	.summary h3 {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--color-text-muted);
		margin: 0 0 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.summary-section {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.summary-section:last-child {
		margin-bottom: 0;
	}

	.summary-label {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		min-width: 5rem;
	}

	.tag-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.chip {
		padding: 0.25rem 0.625rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 500;
	}

	.chip.default {
		background: rgba(20, 184, 166, 0.15);
		color: var(--color-primary);
		border: 1px solid rgba(20, 184, 166, 0.3);
	}

	.chip.selectable {
		background: rgba(168, 85, 247, 0.15);
		color: #a855f7;
		border: 1px solid rgba(168, 85, 247, 0.3);
	}

	/* Mobile adjustments */
	@media (max-width: 640px) {
		.instructions {
			grid-template-columns: 1fr;
		}

		.tag-row {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.75rem;
		}

		.tag-actions {
			width: 100%;
			justify-content: flex-end;
		}

		.tag-description {
			white-space: normal;
		}
	}
</style>
