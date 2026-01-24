<script lang="ts">
	/**
	 * DurationInput - A mobile-friendly duration picker (mm:ss format)
	 * Uses native number inputs with wheel behavior on mobile
	 */

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

	// Derived state from value (in seconds)
	let minutes = $derived(Math.floor((value ?? 0) / 60));
	let seconds = $derived((value ?? 0) % 60);

	function updateMinutes(newMinutes: number) {
		const clamped = Math.max(0, Math.min(59, newMinutes));
		const newValue = clamped * 60 + seconds;
		value = Math.max(min, Math.min(max, newValue));
	}

	function updateSeconds(newSeconds: number) {
		const clamped = Math.max(0, Math.min(59, newSeconds));
		const newValue = minutes * 60 + clamped;
		value = Math.max(min, Math.min(max, newValue));
	}

	function handleMinutesInput(e: Event) {
		const target = e.target as HTMLInputElement;
		const val = parseInt(target.value) || 0;
		updateMinutes(val);
	}

	function handleSecondsInput(e: Event) {
		const target = e.target as HTMLInputElement;
		const val = parseInt(target.value) || 0;
		updateSeconds(val);
	}

	function formatNumber(n: number, pad: boolean = false): string {
		return pad ? n.toString().padStart(2, '0') : n.toString();
	}
</script>

<div class="duration-input" class:compact>
	{#if showLabel && label}
		<label class="duration-label">{label}</label>
	{/if}
	
	<div class="duration-picker">
		<div class="picker-segment">
			<input
				type="number"
				inputmode="numeric"
				class="picker-input"
				value={formatNumber(minutes)}
				min="0"
				max="59"
				oninput={handleMinutesInput}
			/>
			<span class="picker-unit">min</span>
		</div>
		
		<span class="picker-separator">:</span>
		
		<div class="picker-segment">
			<input
				type="number"
				inputmode="numeric"
				class="picker-input"
				value={formatNumber(seconds, true)}
				min="0"
				max="59"
				oninput={handleSecondsInput}
			/>
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
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--color-text-muted);
		margin-bottom: 0.5rem;
	}

	.duration-picker {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		padding: 0.5rem;
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.3);
		border-radius: 12px;
	}

	.picker-segment {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
	}

	.picker-input {
		width: 3.5rem;
		height: 3rem;
		padding: 0;
		background: var(--color-bg);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 8px;
		color: var(--color-text);
		font-size: 1.5rem;
		font-weight: 600;
		text-align: center;
		appearance: textfield;
		-moz-appearance: textfield;
		transition: border-color 0.2s, box-shadow 0.2s;
	}

	.picker-input::-webkit-inner-spin-button,
	.picker-input::-webkit-outer-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.picker-input:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.15);
	}

	.picker-unit {
		font-size: 0.7rem;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.picker-separator {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-text-muted);
		margin: 0 0.25rem;
		padding-bottom: 1.25rem;
	}

	.duration-hint {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin: 0.5rem 0 0;
		text-align: center;
	}

	/* Compact mode for inline/table usage */
	.compact .duration-picker {
		padding: 0.25rem;
		gap: 0.125rem;
	}

	.compact .picker-input {
		width: 2.5rem;
		height: 2rem;
		font-size: 1rem;
	}

	.compact .picker-unit {
		display: none;
	}

	.compact .picker-separator {
		font-size: 1rem;
		padding-bottom: 0;
	}

	/* Touch-friendly on mobile */
	@media (max-width: 640px) {
		.picker-input {
			width: 4rem;
			height: 3.5rem;
			font-size: 1.75rem;
		}
	}
</style>
