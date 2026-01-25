<script lang="ts">
	/**
	 * VisibilityToggle - Public/Private session visibility selector
	 */
	import type { SessionVisibility } from '$lib/types';

	interface Props {
		visibility: SessionVisibility;
		onChange: (visibility: SessionVisibility) => void;
	}

	let { visibility, onChange }: Props = $props();
</script>

<div class="visibility-toggle">
	<span class="field-label" id="visibility-label">Visibility</span>
	<div class="tag-row" role="radiogroup" aria-labelledby="visibility-label">
		<button
			type="button"
			class="tag-button"
			class:active={visibility === 'private'}
			onclick={() => onChange('private')}
			role="radio"
			aria-checked={visibility === 'private'}
		>
			Private
		</button>
		<button
			type="button"
			class="tag-button"
			class:active={visibility === 'public'}
			onclick={() => onChange('public')}
			role="radio"
			aria-checked={visibility === 'public'}
		>
			Public
		</button>
	</div>
	<p class="field-hint">Public sessions can appear in the community feed.</p>
</div>

<style>
	.visibility-toggle {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
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
	}

	.tag-button {
		padding: 0.5rem 1rem;
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

	.field-hint {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin: 0;
	}
</style>
