<script lang="ts">
	/**
	 * NumberWheelInput - iOS-style scrolling wheel picker for integer values
	 * Simpler than DurationInput - just a single column for any integer range.
	 *
	 * The numeric logic lives in the pure {@link ./numberWheel/wheel.ts}
	 * module. This component only owns side-effects (DOM scrolling,
	 * timers).
	 */
	import { onMount, tick } from 'svelte';
	import {
		format as formatValue,
		indexOf as wheelIndexOf,
		valueAt,
		valueCount,
		values as wheelValues
	} from '$lib/components/numberWheel/wheel';
	import type { WheelSpec } from '$lib/components/numberWheel/types';
	import { openWheelSheet } from '$lib/components/numberWheel/wheelSheetStore';
	import { Minus, Plus } from 'lucide-svelte';

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
		variant = 'wheel',
		showNudgeButtons = true
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
		/** "wheel" = inline iOS-style scroll wheel (legacy).
		 *  "chip"  = collapsed tap-target that opens NumberWheelSheet. */
		variant?: 'wheel' | 'chip';
		/** Render ± buttons inline on the chip variant. */
		showNudgeButtons?: boolean;
	} = $props();

	// Initialize value if undefined and user hasn't interacted
	let userHasInteracted = $state(value !== undefined);

	// Internal state
	let column: HTMLDivElement | undefined = $state();
	let isScrolling = false;
	let scrollTimeout: ReturnType<typeof setTimeout>;

	// Item height for scroll calculations
	const ITEM_HEIGHT_COMPACT = 28;
	const ITEM_HEIGHT_NORMAL = 32;
	let itemHeight = $derived(compact ? ITEM_HEIGHT_COMPACT : ITEM_HEIGHT_NORMAL);

	// Wheel spec derived from props (pure data structure consumed by wheel.ts)
	let spec = $derived<WheelSpec>({ min, max, step, unit, label });

	// Generate array of values based on spec
	let valuesArray = $derived(wheelValues(spec));
	let count = $derived(valueCount(spec));

	// Current index in the array
	let currentIndex = $derived(value === undefined ? 0 : wheelIndexOf(spec, value));

	function updateValue(index: number) {
		value = valueAt(spec, index);
		userHasInteracted = true;
	}

	function formatNumber(n: number): string {
		return formatValue(spec, n);
	}

	function scrollToIndex(col: HTMLDivElement | undefined, idx: number, smooth = false) {
		if (!col) return;
		const scrollTop = idx * itemHeight;
		col.scrollTo({
			top: scrollTop,
			behavior: smooth ? 'smooth' : 'instant'
		});
	}

	function handleScroll(col: HTMLDivElement | undefined) {
		if (!col) return;

		clearTimeout(scrollTimeout);
		isScrolling = true;

		scrollTimeout = setTimeout(() => {
			// Snap to nearest item
			const scrollTop = col.scrollTop;
			const index = Math.round(scrollTop / itemHeight);
			const clampedIndex = Math.max(0, Math.min(count - 1, index));

			// Snap scroll position
			scrollToIndex(col, clampedIndex, true);

			// Update value
			updateValue(clampedIndex);

			isScrolling = false;
		}, 100);
	}

	function selectValue(idx: number) {
		scrollToIndex(column, idx, true);
		updateValue(idx);
	}

	// ---- Chip variant -----------------------------------------------------
	function nudge(delta: number) {
		const idx = wheelIndexOf(spec, value) + delta;
		value = valueAt(spec, idx);
		userHasInteracted = true;
	}

	let canDecrement = $derived(
		value !== undefined && wheelIndexOf(spec, value) > 0
	);
	let canIncrement = $derived(
		value !== undefined && wheelIndexOf(spec, value) < count - 1
	);

	function openSheet() {
		openWheelSheet({
			spec,
			initial: value,
			placeholder,
			hint,
			onConfirm: (v) => {
				value = v;
				userHasInteracted = true;
			}
		});
	}

	let displayText = $derived(
		value !== undefined ? formatValue(spec, value) : placeholder || '—'
	);
	let hasValue = $derived(value !== undefined);

	// Initialize scroll position on mount (wheel variant only)
	onMount(() => {
		if (variant !== 'wheel') return;
		tick().then(() => {
			if (value !== undefined) {
				scrollToIndex(column, currentIndex);
			}
		});
	});

	// Watch for external value changes (wheel variant only)
	$effect(() => {
		if (variant !== 'wheel') return;
		if (!isScrolling && value !== undefined) {
			tick().then(() => {
				scrollToIndex(column, currentIndex);
			});
		}
	});
</script>

{#if variant === 'chip'}
	<div class="chip-input" class:compact>
		{#if showLabel && label}
			<span class="number-label">{label}</span>
		{/if}
		<div class="chip-row">
			{#if showNudgeButtons}
				<button
					type="button"
					class="nudge-btn"
					aria-label="Decrease {label || 'value'}"
					disabled={!canDecrement}
					onclick={() => nudge(-1)}
				>
					<Minus size={18} strokeWidth={2.25} />
				</button>
			{/if}
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
			{#if showNudgeButtons}
				<button
					type="button"
					class="nudge-btn"
					aria-label="Increase {label || 'value'}"
					disabled={!canIncrement}
					onclick={() => nudge(1)}
				>
					<Plus size={18} strokeWidth={2.25} />
				</button>
			{/if}
		</div>
		{#if hint}
			<p class="number-hint">{hint}</p>
		{/if}
	</div>
{:else}
	<div class="number-input" class:compact>
		{#if showLabel && label}
			<span class="number-label">{label}</span>
		{/if}

		<div class="wheel-picker">
			<!-- Value Column -->
			<div class="picker-column-wrapper">
				<!-- Selection highlight (behind column) -->
				<div class="selection-highlight"></div>
				<div
					class="picker-column"
					bind:this={column}
					onscroll={() => handleScroll(column)}
				>
					<div class="picker-spacer"></div>
					{#each valuesArray as val, idx}
						<button
							type="button"
							class="picker-item"
							class:selected={idx === currentIndex && userHasInteracted}
							onclick={() => selectValue(idx)}
						>
							{formatNumber(val)}
						</button>
					{/each}
					<div class="picker-spacer"></div>
				</div>
				{#if unit}
					<span class="picker-unit">{unit}</span>
				{/if}
			</div>
		</div>

		{#if hint}
			<p class="number-hint">{hint}</p>
		{/if}
	</div>
{/if}

<style>
	.number-input {
		width: 100%;
	}

	.number-label {
		display: block;
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--color-text-muted);
		margin-bottom: 0.375rem;
	}

	.wheel-picker {
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		padding: 0.5rem 0.75rem;
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 10px;
	}

	.picker-column-wrapper {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.125rem;
		position: relative;
		z-index: 1;
	}

	.picker-column {
		height: calc(32px * 3); /* Show 3 items */
		width: 4rem;
		overflow-y: scroll;
		scroll-snap-type: y mandatory;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
		-ms-overflow-style: none;
		position: relative;
		mask-image: linear-gradient(
			to bottom,
			transparent 0%,
			black 30%,
			black 70%,
			transparent 100%
		);
		-webkit-mask-image: linear-gradient(
			to bottom,
			transparent 0%,
			black 30%,
			black 70%,
			transparent 100%
		);
	}

	.picker-column::-webkit-scrollbar {
		display: none;
	}

	.picker-spacer {
		height: 32px;
		flex-shrink: 0;
	}

	.picker-item {
		height: 32px;
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.125rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--color-text-muted);
		scroll-snap-align: center;
		background: none;
		border: none;
		cursor: pointer;
		transition: color 0.15s, transform 0.15s;
		padding: 0;
		line-height: 1;
	}

	.picker-item.selected {
		color: var(--color-text);
		transform: scale(1.05);
	}

	.picker-item:hover:not(.selected) {
		color: var(--color-text);
	}

	.picker-unit {
		font-size: 0.65rem;
		color: var(--color-text-muted);
		text-transform: lowercase;
		letter-spacing: 0.3px;
		margin-top: 0.125rem;
	}

	.selection-highlight {
		position: absolute;
		left: -0.25rem;
		right: -0.25rem;
		top: 32px;  /* Position at the middle item (second row in 3-item view) */
		height: 32px;
		background: rgba(20, 184, 166, 0.08);
		border-radius: 6px;
		border: 1px solid rgba(20, 184, 166, 0.25);
		pointer-events: none;
		z-index: 0;
	}

	.number-hint {
		font-size: 0.7rem;
		color: var(--color-text-muted);
		margin: 0.375rem 0 0;
		text-align: center;
	}

	/* Compact mode for inline/table usage */
	.compact .wheel-picker {
		padding: 0.375rem 0.5rem;
	}

	.compact .picker-column {
		height: calc(28px * 3);
		width: 3.5rem;
	}

	.compact .picker-spacer {
		height: 28px;
	}

	.compact .picker-item {
		height: 28px;
		font-size: 0.95rem;
	}

	.compact .picker-unit {
		display: none;
	}

	.compact .selection-highlight {
		height: 28px;
		top: 28px;  /* Position at middle item in compact mode */
	}

	/* Mobile adjustments */
	@media (max-width: 640px) {
		.picker-column {
			width: 4.5rem;
		}

		.picker-item {
			font-size: 1.25rem;
		}
	}

	/* ---- Chip variant ---------------------------------------------------- */
	.chip-input {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
	.chip-input.compact {
		gap: 0.25rem;
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
	.nudge-btn {
		flex: 0 0 auto;
		width: 44px;
		height: 44px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 12px;
		background: rgba(148, 163, 184, 0.08);
		border: 1px solid rgba(148, 163, 184, 0.18);
		color: var(--color-text);
		cursor: pointer;
	}
	.nudge-btn:hover:not(:disabled) {
		background: rgba(148, 163, 184, 0.18);
	}
	.nudge-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.nudge-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}
</style>
