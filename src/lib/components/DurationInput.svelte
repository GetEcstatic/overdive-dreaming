<script lang="ts">
	/**
	 * DurationInput - Compact iOS-style scrolling wheel picker for duration (mm:ss format)
	 * Creates a mobile-native touch-scroll experience
	 */
	import { onMount, tick } from 'svelte';

	let {
		value = $bindable(0),
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

	// Internal state
	let minutesColumn: HTMLDivElement;
	let secondsColumn: HTMLDivElement;
	let isScrolling = false;
	let scrollTimeout: ReturnType<typeof setTimeout>;
	
	// Item height for scroll calculations - smaller for more compact feel
	const ITEM_HEIGHT_COMPACT = 28;
	const ITEM_HEIGHT_NORMAL = 32;
	let itemHeight = $derived(compact ? ITEM_HEIGHT_COMPACT : ITEM_HEIGHT_NORMAL);
	
	// Generate arrays for minutes (0-59) and seconds (0-59)
	const minutesArray = Array.from({ length: 60 }, (_, i) => i);
	const secondsArray = Array.from({ length: 60 }, (_, i) => i);

	// Derived state from value (in seconds)
	let currentMinutes = $derived(Math.floor((value ?? 0) / 60));
	let currentSeconds = $derived((value ?? 0) % 60);

	function updateValue(minutes: number, seconds: number) {
		const newValue = minutes * 60 + seconds;
		value = Math.max(min, Math.min(max, newValue));
	}

	function formatNumber(n: number): string {
		return n.toString().padStart(2, '0');
	}

	function scrollToValue(column: HTMLDivElement, val: number, smooth = false) {
		if (!column) return;
		const scrollTop = val * itemHeight;
		column.scrollTo({
			top: scrollTop,
			behavior: smooth ? 'smooth' : 'instant'
		});
	}

	function handleScroll(column: HTMLDivElement, type: 'minutes' | 'seconds') {
		if (!column) return;
		
		clearTimeout(scrollTimeout);
		isScrolling = true;
		
		scrollTimeout = setTimeout(() => {
			// Snap to nearest item
			const scrollTop = column.scrollTop;
			const index = Math.round(scrollTop / itemHeight);
			const clampedIndex = Math.max(0, Math.min(59, index));
			
			// Snap scroll position
			scrollToValue(column, clampedIndex, true);
			
			// Update value
			if (type === 'minutes') {
				updateValue(clampedIndex, currentSeconds);
			} else {
				updateValue(currentMinutes, clampedIndex);
			}
			
			isScrolling = false;
		}, 100);
	}

	function selectValue(type: 'minutes' | 'seconds', val: number) {
		const column = type === 'minutes' ? minutesColumn : secondsColumn;
		scrollToValue(column, val, true);
		
		if (type === 'minutes') {
			updateValue(val, currentSeconds);
		} else {
			updateValue(currentMinutes, val);
		}
	}

	// Initialize scroll positions on mount and when value changes
	onMount(() => {
		tick().then(() => {
			scrollToValue(minutesColumn, currentMinutes);
			scrollToValue(secondsColumn, currentSeconds);
		});
	});

	// Watch for external value changes
	$effect(() => {
		if (!isScrolling) {
			tick().then(() => {
				scrollToValue(minutesColumn, currentMinutes);
				scrollToValue(secondsColumn, currentSeconds);
			});
		}
	});
</script>

<div class="duration-input" class:compact>
	{#if showLabel && label}
		<span class="duration-label">{label}</span>
	{/if}
	
	<div class="wheel-picker">
		<!-- Selection highlight (behind columns) -->
		<div class="selection-highlight"></div>
		
		<!-- Minutes Column -->
		<div class="picker-column-wrapper">
			<div 
				class="picker-column"
				bind:this={minutesColumn}
				onscroll={() => handleScroll(minutesColumn, 'minutes')}
			>
				<div class="picker-spacer"></div>
				{#each minutesArray as min}
					<button
						type="button"
						class="picker-item"
						class:selected={min === currentMinutes}
						onclick={() => selectValue('minutes', min)}
					>
						{formatNumber(min)}
					</button>
				{/each}
				<div class="picker-spacer"></div>
			</div>
			<span class="picker-unit">min</span>
		</div>

		<span class="picker-separator">:</span>

		<!-- Seconds Column -->
		<div class="picker-column-wrapper">
			<div 
				class="picker-column"
				bind:this={secondsColumn}
				onscroll={() => handleScroll(secondsColumn, 'seconds')}
			>
				<div class="picker-spacer"></div>
				{#each secondsArray as sec}
					<button
						type="button"
						class="picker-item"
						class:selected={sec === currentSeconds}
						onclick={() => selectValue('seconds', sec)}
					>
						{formatNumber(sec)}
					</button>
				{/each}
				<div class="picker-spacer"></div>
			</div>
			<span class="picker-unit">sec</span>
		</div>
	</div>

	{#if hint}
		<p class="duration-hint">{hint}</p>
	{/if}
</div>

<style>
	.duration-input {
		width: 100%;
	}

	.duration-label {
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
		gap: 0.125rem;
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
		width: 3rem;
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
		font-size: 0.6rem;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.picker-separator {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0 0.125rem;
		margin-bottom: 1rem;
		line-height: 1;
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

	.duration-hint {
		font-size: 0.7rem;
		color: var(--color-text-muted);
		margin: 0.375rem 0 0;
		text-align: center;
	}

	/* Compact mode for inline/table usage */
	.compact .wheel-picker {
		padding: 0.375rem 0.5rem;
		gap: 0.125rem;
	}

	.compact .picker-column {
		height: calc(28px * 3);
		width: 2.5rem;
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

	.compact .picker-separator {
		font-size: 1rem;
		margin-bottom: 0;
	}

	.compact .selection-highlight {
		height: 28px;
		top: 50%;
	}

	/* Mobile adjustments */
	@media (max-width: 640px) {
		.picker-column {
			width: 3.25rem;
		}

		.picker-item {
			font-size: 1.25rem;
		}
	}
</style>
