<script lang="ts">
	/**
	 * LungVolumePill — compact, tap-to-cycle FL/RV/FRC tag.
	 *
	 * Renders one small coloured pill. Tapping cycles
	 * `FL → RV → FRC → FL`. The component is purely presentational +
	 * a single-bit interaction; persistence is the caller's job via
	 * `bind:value` or the `onChange` callback.
	 */
	import type { LungVolume } from '$lib/types';
	import { cycleLungVolume, formatLungVolume } from '$lib/utils/lungVolume';

	let {
		value = $bindable<LungVolume | undefined>(undefined),
		onChange,
		disabled = false,
		ariaLabelPrefix = 'Lung volume'
	}: {
		value?: LungVolume;
		onChange?: (v: LungVolume) => void;
		disabled?: boolean;
		ariaLabelPrefix?: string;
	} = $props();

	const effective = $derived<LungVolume>(value ?? 'FL');

	function handleClick() {
		if (disabled) return;
		const next = cycleLungVolume(value);
		value = next;
		onChange?.(next);
	}
</script>

<button
	type="button"
	class="lv-pill"
	class:fl={effective === 'FL'}
	class:rv={effective === 'RV'}
	class:frc={effective === 'FRC'}
	{disabled}
	onclick={handleClick}
	title="{ariaLabelPrefix}: {formatLungVolume(effective)}. Tap to change."
	aria-label="{ariaLabelPrefix}: {formatLungVolume(effective)}. Tap to cycle."
>
	{effective}
</button>

<style>
	.lv-pill {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 2.25rem;
		height: 1.75rem;
		padding: 0 0.4rem;
		border-radius: 999px;
		border: 1px solid rgba(148, 163, 184, 0.3);
		background: rgba(148, 163, 184, 0.08);
		color: var(--color-text);
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		cursor: pointer;
		transition:
			background 0.15s,
			border-color 0.15s,
			color 0.15s;
		user-select: none;
	}

	.lv-pill:hover {
		background: rgba(148, 163, 184, 0.18);
	}

	.lv-pill:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Colour coding — neutral FL, cool RV, warm FRC. */
	.lv-pill.fl {
		background: rgba(148, 163, 184, 0.12);
		border-color: rgba(148, 163, 184, 0.4);
		color: var(--color-text);
	}

	.lv-pill.rv {
		background: rgba(56, 189, 248, 0.18);
		border-color: rgba(56, 189, 248, 0.55);
		color: #38bdf8;
	}

	.lv-pill.frc {
		background: rgba(251, 191, 36, 0.18);
		border-color: rgba(251, 191, 36, 0.55);
		color: #fbbf24;
	}
</style>
