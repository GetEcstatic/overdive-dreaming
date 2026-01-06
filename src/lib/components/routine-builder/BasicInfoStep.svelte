<script lang="ts">
	/**
	 * BasicInfoStep - Step 1 of routine builder wizard
	 * Collects name, description, disciplines, and tags
	 */

	import type { Discipline } from '$lib/types';
	import { onMount } from 'svelte';
	import { getSuggestedTags } from '$lib/firestore';

	let {
		name = $bindable(''),
		description = $bindable(''),
		disciplines = $bindable<Discipline[]>([]),
		tags = $bindable<string[]>([])
	}: {
		name: string;
		description: string;
		disciplines: Discipline[];
		tags: string[];
	} = $props();

	// Suggested tags from Firestore
	let suggestedTags = $state<{
		trainingAdaptations: string[];
		diveTypes: string[];
		difficultyLevels: string[];
		specialCategories: string[];
	} | null>(null);

	// All available disciplines
	const availableDisciplines: { value: Discipline; label: string; description: string }[] = [
		{ value: 'STA', label: 'STA', description: 'Static Apnea (breath hold)' },
		{ value: 'DYN', label: 'DYN', description: 'Dynamic with fins' },
		{ value: 'DNF', label: 'DNF', description: 'Dynamic no fins' },
		{ value: 'DYNB', label: 'DYNB', description: 'Dynamic bifins' }
	];

	// Toggle discipline selection
	function toggleDiscipline(discipline: Discipline) {
		if (disciplines.includes(discipline)) {
			disciplines = disciplines.filter((d) => d !== discipline);
		} else {
			disciplines = [...disciplines, discipline];
		}
	}

	// Toggle tag selection
	function toggleTag(tag: string) {
		if (tags.includes(tag)) {
			tags = tags.filter((t) => t !== tag);
		} else {
			tags = [...tags, tag];
		}
	}

	onMount(async () => {
		try {
			const fetchedTags = await getSuggestedTags();
			if (fetchedTags) {
				suggestedTags = fetchedTags;
			}
		} catch (err) {
			console.error('Failed to fetch suggested tags:', err);
		}
	});
</script>

<div class="basic-info-step">
	<h2 class="step-title">Basic Information</h2>
	<p class="step-description">
		Give your routine a name and description, then select which disciplines it applies to.
	</p>

	<div class="form-section">
		<label for="routine-name" class="form-label">
			Routine Name <span class="required">*</span>
		</label>
		<input
			id="routine-name"
			type="text"
			class="form-input"
			bind:value={name}
			placeholder="e.g., CO₂ Builder 8x50"
			maxlength="50"
		/>
		<div class="char-count">{name.length}/50</div>
	</div>

	<div class="form-section">
		<label for="routine-description" class="form-label">
			Description <span class="required">*</span>
		</label>
		<textarea
			id="routine-description"
			class="form-textarea"
			bind:value={description}
			placeholder="Describe the routine and its purpose..."
			rows="4"
			maxlength="800"
		></textarea>
		<div class="char-count">{description.length}/800</div>
	</div>

	<div class="form-section">
		<div class="form-label">
			Disciplines <span class="required">*</span>
		</div>
		<p class="field-hint">Select all disciplines this routine can be used for</p>
		<div class="checkbox-grid">
			{#each availableDisciplines as disc}
				<label class="checkbox-card" class:selected={disciplines.includes(disc.value)}>
					<input
						type="checkbox"
						checked={disciplines.includes(disc.value)}
						onchange={() => toggleDiscipline(disc.value)}
					/>
					<div class="checkbox-content">
						<div class="checkbox-label">{disc.label}</div>
						<div class="checkbox-description">{disc.description}</div>
					</div>
				</label>
			{/each}
		</div>
	</div>

	<div class="form-section">
		<div class="form-label">Tags (Optional)</div>
		<p class="field-hint">Select tags that describe this routine</p>

		{#if suggestedTags}
			<div class="tags-container">
				<div class="tag-category">
					<div class="category-label">Training Adaptations</div>
					<div class="tag-pills">
						{#each suggestedTags.trainingAdaptations as tag}
							<button
								type="button"
								class="tag-pill"
								class:selected={tags.includes(tag)}
								onclick={() => toggleTag(tag)}
							>
								{tag}
							</button>
						{/each}
					</div>
				</div>

				<div class="tag-category">
					<div class="category-label">Dive Types</div>
					<div class="tag-pills">
						{#each suggestedTags.diveTypes as tag}
							<button
								type="button"
								class="tag-pill"
								class:selected={tags.includes(tag)}
								onclick={() => toggleTag(tag)}
							>
								{tag}
							</button>
						{/each}
					</div>
				</div>

				<div class="tag-category">
					<div class="category-label">Difficulty</div>
					<div class="tag-pills">
						{#each suggestedTags.difficultyLevels as tag}
							<button
								type="button"
								class="tag-pill"
								class:selected={tags.includes(tag)}
								onclick={() => toggleTag(tag)}
							>
								{tag}
							</button>
						{/each}
					</div>
				</div>

				<div class="tag-category">
					<div class="category-label">Special Categories</div>
					<div class="tag-pills">
						{#each suggestedTags.specialCategories as tag}
							<button
								type="button"
								class="tag-pill"
								class:selected={tags.includes(tag)}
								onclick={() => toggleTag(tag)}
							>
								{tag}
							</button>
						{/each}
					</div>
				</div>
			</div>
		{:else}
			<div class="loading-tags">Loading suggested tags...</div>
		{/if}
	</div>
</div>

<style>
	.basic-info-step {
		max-width: 800px;
		margin: 0 auto;
	}

	.step-title {
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--color-text);
		margin-bottom: 0.5rem;
	}

	.step-description {
		font-size: 1rem;
		color: var(--color-text-muted);
		margin-bottom: 2rem;
	}

	.form-section {
		margin-bottom: 2rem;
	}

	.form-label {
		display: block;
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: 0.5rem;
	}

	.required {
		color: #ef4444;
	}

	.field-hint {
		font-size: 0.875rem;
		color: var(--color-text-muted);
		margin-bottom: 1rem;
	}

	.form-input,
	.form-textarea {
		width: 100%;
		padding: 0.75rem 1rem;
		background: rgba(15, 23, 42, 0.5);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 8px;
		color: var(--color-text);
		font-size: 0.9375rem;
		transition: all 0.2s ease;
	}

	.form-input:focus,
	.form-textarea:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.1);
	}

	.form-textarea {
		resize: vertical;
		min-height: 100px;
		font-family: inherit;
	}

	.char-count {
		text-align: right;
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin-top: 0.25rem;
	}

	.checkbox-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 1rem;
	}

	.checkbox-card {
		position: relative;
		display: flex;
		align-items: flex-start;
		padding: 1rem;
		background: rgba(15, 23, 42, 0.5);
		border: 2px solid rgba(148, 163, 184, 0.2);
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.checkbox-card:hover {
		border-color: rgba(148, 163, 184, 0.4);
		background: rgba(15, 23, 42, 0.7);
	}

	.checkbox-card.selected {
		border-color: var(--color-primary);
		background: rgba(20, 184, 166, 0.1);
	}

	.checkbox-card input[type='checkbox'] {
		margin-right: 0.75rem;
		margin-top: 0.25rem;
		width: 18px;
		height: 18px;
		cursor: pointer;
	}

	.checkbox-content {
		flex: 1;
	}

	.checkbox-label {
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: 0.25rem;
	}

	.checkbox-description {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}

	.tags-container {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.tag-category {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.category-label {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.tag-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.tag-pill {
		padding: 0.5rem 1rem;
		background: rgba(148, 163, 184, 0.1);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 20px;
		color: var(--color-text);
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.tag-pill:hover {
		background: rgba(148, 163, 184, 0.15);
		border-color: rgba(148, 163, 184, 0.3);
	}

	.tag-pill.selected {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: white;
	}

	.loading-tags {
		text-align: center;
		padding: 2rem;
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	/* Mobile responsive */
	@media (max-width: 640px) {
		.step-title {
			font-size: 1.5rem;
		}

		.checkbox-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
