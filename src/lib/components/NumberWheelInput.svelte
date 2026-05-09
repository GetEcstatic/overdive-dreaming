<script lang="ts">
	/**
	 * NumberWheelInput — collapsed chip. Tapping the chip opens the
	 * global {@link NumberWheelSheet} via {@link openWheelSheet}. The
	 * numeric logic lives in the pure {@link ./numberWheel/wheel.ts}
	 * module; this component only owns side-effects (opening the sheet).
	 *
	 * The legacy inline scroll-wheel variant was removed in Phase 3 of
	 * the wheel selector redesign; the inline ± nudge buttons were
	 * removed afterwards once the sheet became the canonical input —
	 * see {@link ../../../docs/wheel-selector-redesign.md}.
	 */
	import {
		format as formatValue,
		indexOf as wheelIndexOf,
		valueAt,
		valueCount
	} from '$lib/components/numberWheel/wheel';
	import type { WheelSpec } from '$lib/components/numberWheel/types';
	import { openWheelSheet } from '$lib/components/numberWheel/wheelSheetStore';

	let {
		value = $bindable(),
		min = 0,
		max = 100,
		step = 1,
		label = '',
		unit = '',
		hint = '',
		showLabel = true,
		compact = false,
		placeholder = '',
		onValueChange,
		// Accepted for back-compat with old call sites; chip is the only
		// rendering mode now.
		variant: _variant = 'chip'
	}: {
		value: number | undefined;
		min?: number;
		max?: number;
		step?: number;
		label?: string;
		unit?: string;
		hint?: string;
		showLabel?: boolean;
		compact?: boolean;
		placeholder?: string;
		onValueChange?: (value: number) => void;
		/** @deprecated Only "chip" is supported; prop kept for back-compat. */
		variant?: 'wheel' | 'chip';
	} = $props();

	let spec = $derived<WheelSpec>({ min, max, step, unit, label });

	let displayText = $derived(
		value !== undefined ? formatValue(spec, value) : placeholder || '—'
	);
	let hasValue = $derived(value !== undefined);

	function openSheet() {
		openWheelSheet({
			spec,
			initial: value,
			placeholder,
			hint,
			onConfirm: (v) => {
				value = v;
				onValueChange?.(v);
			}
		});
	}
</script>

<div class="chip-input" class:compact>
	{#if showLabel && label}
		<span class="number-label">{label}</span>
	{/if}
	<div class="chip-row">
		<button
			type="button"
			class="chip"
			class:placeholder={!hasValue}
			aria-haspopup="dialog"
			onclick={openSheet}
		>
			<span class="chip-value">{displayText}</span>
			{#if unit}<span class="chip-unit">{unit}</span>{/if}
		</button>
	</div>
	{#if hint}
		<p class="number-hint">{hint}</p>
	{/if}
</div>

<style>
	.chip-input {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
	.chip-input.compact {
		gap: 0.25rem;
	}
	.number-label {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
	}
	.chip-row {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}
	.chip {
		flex: 1;
		min-height: 44px;
		padding: 0.5rem 0.875rem;
		border-radius: 12px;
		background: rgba(148, 163, 184, 0.08);
		border: 1px solid rgba(148, 163, 184, 0.18);
		color: var(--color-text);
		font-size: 1.05rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 0.25rem;
		cursor: pointer;
		transition:
			background 120ms ease-out,
			border-color 120ms ease-out;
	}
	.chip:hover {
		background: rgba(148, 163, 184, 0.14);
	}
	.chip:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}
	.chip.placeholder .chip-value {
		color: var(--color-text-muted);
		font-weight: 500;
	}
	.chip-unit {
		color: var(--color-text-muted);
		font-size: 0.85rem;
		font-weight: 500;
	}
	.number-hint {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin: 0;
	}
</style>
