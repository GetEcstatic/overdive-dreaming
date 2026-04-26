<script lang="ts">
	/**
	 * DurationInput — mm:ss duration picker.
	 *
	 * Now powered by the global {@link NumberWheelSheet} via
	 * {@link openWheelSheet}, formatted as mm:ss. The previous inline
	 * dual-column scroll wheel was replaced as part of the wheel
	 * selector redesign — see
	 * {@link ../../../docs/wheel-selector-redesign.md}.
	 *
	 * Public prop API is kept stable so existing call-sites
	 * (`<DurationInput bind:value … />`) continue to work unchanged.
	 */
	import { openDurationSheet } from '$lib/components/numberWheel/durationSheetStore';

	let {
		value = $bindable(),
		min = 0,
		max = 3600,
		label = '',
		hint = '',
		showLabel = true,
		compact = false
	}: {
		value: number | undefined; // value in seconds
		min?: number;
		max?: number;
		label?: string;
		hint?: string;
		showLabel?: boolean;
		compact?: boolean;
	} = $props();

	function pad(n: number): string {
		return n.toString().padStart(2, '0');
	}

	function formatMmSs(seconds: number): string {
		const total = Math.max(0, Math.round(seconds));
		const m = Math.floor(total / 60);
		const s = total % 60;
		return `${pad(m)}:${pad(s)}`;
	}

	let displayText = $derived(value !== undefined ? formatMmSs(value) : '—');
	let hasValue = $derived(value !== undefined);

	function openSheet() {
		openDurationSheet({
			initial: value,
			min,
			max,
			label,
			hint,
			onConfirm: (v) => {
				value = v;
			}
		});
	}
</script>

<div class="duration-input chip-input" class:compact>
	{#if showLabel && label}
		<span class="duration-label">{label}</span>
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
		</button>
	</div>
	{#if hint}
		<p class="duration-hint">{hint}</p>
	{/if}
</div>

<style>
	.duration-input {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.duration-label {
		display: block;
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--color-text-muted);
	}

	.chip-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.chip {
		flex: 1;
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 0.25rem;
		min-height: 44px;
		padding: 0.5rem 0.75rem;
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 10px;
		color: var(--color-text);
		font-size: 1.125rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s;
	}
	.chip:hover {
		background: rgba(148, 163, 184, 0.08);
		border-color: rgba(148, 163, 184, 0.35);
	}
	.chip:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}
	.chip.placeholder {
		color: var(--color-text-muted);
		font-weight: 500;
	}

	.duration-hint {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin: 0;
	}

	.compact .chip {
		min-height: 38px;
		padding: 0.375rem 0.625rem;
		font-size: 1rem;
	}
</style>
