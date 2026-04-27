<script lang="ts">
	import {
		AUTO_REAR_CAMERA,
		cameraPreferenceMatches,
		optionToPreference,
		type CameraDeviceOption
	} from '$lib/capture/cameraDevices';
	import type { CameraPreference } from '$lib/types';

	interface Props {
		value?: CameraPreference;
		options?: CameraDeviceOption[];
		activeDeviceId?: string;
		disabled?: boolean;
		compact?: boolean;
		emptyMessage?: string;
		onChange?: (preference: CameraPreference) => void;
	}

	let {
		value = $bindable<CameraPreference>(AUTO_REAR_CAMERA),
		options = [],
		activeDeviceId,
		disabled = false,
		compact = false,
		emptyMessage = 'Specific cameras will appear after camera permission is granted.',
		onChange
	}: Props = $props();

	function select(preference: CameraPreference): void {
		if (disabled) return;
		value = preference;
		onChange?.(preference);
	}

	function isAutoSelected(): boolean {
		return value.kind === 'auto-rear';
	}
</script>

<div class="camera-selector" class:compact>
	<div class="option-list">
		<button
			type="button"
			class="camera-option"
			class:selected={isAutoSelected()}
			disabled={disabled}
			onclick={() => select(AUTO_REAR_CAMERA)}
		>
			<span class="mark">{isAutoSelected() ? '✓' : ''}</span>
			<span class="label-group">
				<span class="label">Auto rear</span>
				<span class="hint">Browser chooses the rear camera</span>
			</span>
		</button>

		{#each options as option (option.id)}
			{@const selected = cameraPreferenceMatches(value, option)}
			<button
				type="button"
				class="camera-option"
				class:selected
				disabled={disabled}
				onclick={() => select(optionToPreference(option))}
			>
				<span class="mark">{selected ? '✓' : ''}</span>
				<span class="label-group">
					<span class="label">
						{option.label}
						{#if activeDeviceId === option.id}
							<span class="current">current</span>
						{/if}
					</span>
					<span class="hint">{option.rawLabel || 'Camera label unavailable'}</span>
				</span>
			</button>
		{/each}
	</div>

	{#if options.length === 0}
		<p class="empty">{emptyMessage}</p>
	{/if}
</div>

<style>
	.camera-selector {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.option-list {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.camera-option {
		width: 100%;
		display: grid;
		grid-template-columns: 1.25rem minmax(0, 1fr);
		gap: 0.55rem;
		align-items: center;
		padding: 0.75rem 0.8rem;
		border: 1px solid rgba(148, 163, 184, 0.18);
		border-radius: 8px;
		background: rgba(15, 23, 42, 0.72);
		color: var(--color-text);
		text-align: left;
		font: inherit;
		cursor: pointer;
	}

	.camera-option:hover:not(:disabled),
	.camera-option.selected {
		border-color: rgba(20, 184, 166, 0.55);
		background: rgba(20, 184, 166, 0.12);
	}

	.camera-option:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.mark {
		width: 1.1rem;
		height: 1.1rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		background: rgba(148, 163, 184, 0.14);
		color: var(--color-primary);
		font-size: 0.75rem;
		font-weight: 700;
	}

	.label-group {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.label {
		font-size: 0.92rem;
		font-weight: 650;
	}

	.current {
		margin-left: 0.35rem;
		font-size: 0.68rem;
		color: var(--color-primary);
		text-transform: uppercase;
	}

	.hint,
	.empty {
		color: var(--color-text-muted);
		font-size: 0.76rem;
	}

	.empty {
		margin: 0;
	}

	.compact .camera-option {
		padding: 0.62rem 0.7rem;
	}
</style>
