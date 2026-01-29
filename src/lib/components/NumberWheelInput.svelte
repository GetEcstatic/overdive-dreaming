<script lang="ts">
	/**
	 * NumberWheelInput - iOS-style scrolling wheel picker for integer values
	 * Simpler than DurationInput - just a single column for any integer range
	 */
	import { onMount, tick } from 'svelte';

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
		placeholder = ''
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
	} = $props();
	
	// Initialize value if undefined and user hasn't interacted
	let userHasInteracted = $state(value !== undefined);
	
	// Internal state
	let column: HTMLDivElement;
	let isScrolling = false;
	let scrollTimeout: ReturnType<typeof setTimeout>;
	
	// Item height for scroll calculations
	const ITEM_HEIGHT_COMPACT = 28;
	const ITEM_HEIGHT_NORMAL = 32;
	let itemHeight = $derived(compact ? ITEM_HEIGHT_COMPACT : ITEM_HEIGHT_NORMAL);
	
	// Generate array of values based on min, max, step
	let valuesArray = $derived.by(() => {
		const arr: number[] = [];
		for (let i = min; i <= max; i += step) {
			arr.push(i);
		}
		return arr;
	});

	// Current index in the array
	let currentIndex = $derived.by(() => {
		if (value === undefined) return 0;
		const idx = valuesArray.findIndex(v => v === value);
		return idx >= 0 ? idx : 0;
	});

	function updateValue(index: number) {
		const clampedIndex = Math.max(0, Math.min(valuesArray.length - 1, index));
		value = valuesArray[clampedIndex];
		userHasInteracted = true;
	}

	function formatNumber(n: number): string {
		// Show integers without decimals, but allow for decimal steps
		if (Number.isInteger(step) && Number.isInteger(n)) {
			return n.toString();
		}
		return n.toFixed(1);
	}

	function scrollToIndex(col: HTMLDivElement, idx: number, smooth = false) {
		if (!col) return;
		const scrollTop = idx * itemHeight;
		col.scrollTo({
			top: scrollTop,
			behavior: smooth ? 'smooth' : 'instant'
		});
	}

	function handleScroll(col: HTMLDivElement) {
		if (!col) return;
		
		clearTimeout(scrollTimeout);
		isScrolling = true;
		
		scrollTimeout = setTimeout(() => {
			// Snap to nearest item
			const scrollTop = col.scrollTop;
			const index = Math.round(scrollTop / itemHeight);
			const clampedIndex = Math.max(0, Math.min(valuesArray.length - 1, index));
			
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

	// Initialize scroll position on mount
	onMount(() => {
		tick().then(() => {
			if (value !== undefined) {
				scrollToIndex(column, currentIndex);
			}
		});
	});

	// Watch for external value changes
	$effect(() => {
		if (!isScrolling && value !== undefined) {
			tick().then(() => {
				scrollToIndex(column, currentIndex);
			});
		}
	});
</script>

<div class="number-input" class:compact>
	{#if showLabel && label}
		<span class="number-label">{label}</span>
	{/if}
	
	<div class="wheel-picker">
		<!-- Selection highlight (behind column) -->
		<div class="selection-highlight"></div>
		
		<!-- Value Column -->
		<div class="picker-column-wrapper">
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
		left: 0.5rem;
		right: 0.5rem;
		top: calc(50% - 0.5rem);
		transform: translateY(-50%);
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
		top: 50%;
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
</style>
