<script lang="ts">
	/**
	 * Global bottom-sheet duration picker (mm:ss) with **two** independent
	 * wheels — minutes and seconds. Mirrors {@link NumberWheelSheet} in
	 * style but uses two reducers so the user can dial each part
	 * independently. See {@link ../../../../docs/wheel-selector-redesign.md}.
	 *
	 * Side-effect surface only:
	 *   - listens to {@link durationSheetStore}
	 *   - locks body scroll while open
	 *   - traps focus
	 *   - converts pointer events into per-column index changes
	 *
	 * All numeric/state logic delegates to numberWheel/wheel.ts via two
	 * separate {@link WheelSpec}s (one for minutes, one for seconds).
	 */
	import { onDestroy, tick } from 'svelte';
	import {
		indexFromOffset,
		indexOf as wheelIndexOf,
		neighbourIndices,
		valueAt,
		valueCount
	} from './wheel';
	import type { WheelSpec } from './types';
	import {
		closeDurationSheet,
		durationSheet,
		type DurationSheetRequest
	} from './durationSheetStore';
	import { lockBodyScroll, prefersReducedMotion, trapFocus, vibrate } from './sheet-effects';

	const ROW_HEIGHT = 56;
	const VISIBLE_ROWS = 5;

	let request: DurationSheetRequest | null = $state(null);
	let minutesSpec: WheelSpec | null = $state(null);
	let secondsSpec: WheelSpec | null = $state(null);
	let minutesIndex = $state(0);
	let secondsIndex = $state(0);

	let sheetEl: HTMLDivElement | undefined = $state();
	let releaseLock: (() => void) | null = null;
	let releaseTrap: (() => void) | null = null;
	let lastVibratedM: number | null = null;
	let lastVibratedS: number | null = null;

	let minutesCount = $derived(minutesSpec ? valueCount(minutesSpec) : 0);
	let secondsCount = $derived(secondsSpec ? valueCount(secondsSpec) : 0);

	let minutesValue = $derived(minutesSpec ? valueAt(minutesSpec, minutesIndex) : 0);
	let secondsValue = $derived(secondsSpec ? valueAt(secondsSpec, secondsIndex) : 0);
	let totalSeconds = $derived(minutesValue * 60 + secondsValue);

	let minutesNeighbours = $derived(
		minutesSpec ? neighbourIndices({ centre: minutesIndex, radius: 3, count: minutesCount }) : []
	);
	let secondsNeighbours = $derived(
		secondsSpec ? neighbourIndices({ centre: secondsIndex, radius: 3, count: secondsCount }) : []
	);

	function pad(n: number): string {
		return n.toString().padStart(2, '0');
	}

	const unsubStore = durationSheet.subscribe(async (s) => {
		const incoming = s.request;
		if (incoming === request) return;

		if (request) teardown();
		request = incoming;
		if (!incoming) return;

		const minSec = incoming.min ?? 0;
		const maxSec = incoming.max ?? 3600;
		// Derive minute/second bounds from the requested total range.
		// Most callers use 0..3600s (0..60 min). We clamp the per-wheel
		// upper bounds to keep each wheel ≤ 60 rows for fast scrolling.
		const minM = Math.floor(minSec / 60);
		const maxM = Math.min(60, Math.floor(maxSec / 60));
		minutesSpec = { min: minM, max: maxM, step: 1, unit: 'min' };
		secondsSpec = { min: 0, max: 59, step: 1, unit: 'sec' };

		const initialTotal = clamp(incoming.initial ?? 0, minSec, maxSec);
		const initM = Math.floor(initialTotal / 60);
		const initS = initialTotal % 60;
		minutesIndex = wheelIndexOf(minutesSpec, initM);
		secondsIndex = wheelIndexOf(secondsSpec, initS);
		lastVibratedM = minutesIndex;
		lastVibratedS = secondsIndex;

		await tick();
		releaseLock = lockBodyScroll();
		if (sheetEl) {
			releaseTrap = trapFocus(sheetEl);
		}
	});

	function clamp(n: number, lo: number, hi: number): number {
		return n < lo ? lo : n > hi ? hi : n;
	}

	function teardown() {
		releaseLock?.();
		releaseTrap?.();
		releaseLock = null;
		releaseTrap = null;
		request = null;
		minutesSpec = null;
		secondsSpec = null;
		lastVibratedM = null;
		lastVibratedS = null;
	}

	onDestroy(() => {
		unsubStore();
		teardown();
	});

	function commit() {
		if (!request) return;
		const minSec = request.min ?? 0;
		const maxSec = request.max ?? 3600;
		const final = clamp(totalSeconds, minSec, maxSec);
		request.onConfirm(final);
		closeDurationSheet();
	}

	function cancel() {
		request?.onCancel?.();
		closeDurationSheet();
	}

	function clearValue() {
		request?.onConfirm(undefined);
		closeDurationSheet();
	}

	function onBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) cancel();
	}

	function onKey(e: KeyboardEvent) {
		if (!request) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			cancel();
		} else if (e.key === 'Enter') {
			if (document.activeElement?.tagName !== 'BUTTON') {
				e.preventDefault();
				commit();
			}
		}
	}

	// --- Per-column drag handling ----------------------------------------
	type Column = 'minutes' | 'seconds';
	let dragCol: Column | null = null;
	let dragStartY = 0;
	let dragStartIndex = 0;
	let dragPointerId: number | null = null;

	function onPointerDown(e: PointerEvent, col: Column) {
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		dragPointerId = e.pointerId;
		dragCol = col;
		dragStartY = e.clientY;
		dragStartIndex = col === 'minutes' ? minutesIndex : secondsIndex;
	}

	function onPointerMove(e: PointerEvent) {
		if (dragPointerId !== e.pointerId || !dragCol) return;
		const count = dragCol === 'minutes' ? minutesCount : secondsCount;
		const idx = indexFromOffset({
			startIndex: dragStartIndex,
			deltaY: e.clientY - dragStartY,
			rowHeight: ROW_HEIGHT,
			count
		});
		setColumnIndex(dragCol, idx);
	}

	function onPointerUp(e: PointerEvent) {
		if (dragPointerId !== e.pointerId) return;
		(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		dragPointerId = null;
		dragCol = null;
	}

	function onWheel(e: WheelEvent, col: Column) {
		e.preventDefault();
		const delta = Math.sign(e.deltaY);
		if (delta === 0) return;
		const cur = col === 'minutes' ? minutesIndex : secondsIndex;
		setColumnIndex(col, cur + delta);
	}

	function setColumnIndex(col: Column, raw: number) {
		if (col === 'minutes') {
			const idx = clamp(raw, 0, minutesCount - 1);
			if (idx === minutesIndex) return;
			minutesIndex = idx;
			if (idx !== lastVibratedM) {
				lastVibratedM = idx;
				vibrate(5);
			}
		} else {
			const idx = clamp(raw, 0, secondsCount - 1);
			if (idx === secondsIndex) return;
			secondsIndex = idx;
			if (idx !== lastVibratedS) {
				lastVibratedS = idx;
				vibrate(5);
			}
		}
	}

	function onRulerTap(col: Column, idx: number) {
		setColumnIndex(col, idx);
	}
</script>

<svelte:window onkeydown={onKey} />

{#if request && minutesSpec && secondsSpec}
	<div
		class="backdrop"
		class:reduced-motion={prefersReducedMotion()}
		role="presentation"
		onclick={onBackdropClick}
		onpointerdown={(e) => {
			if (e.target === e.currentTarget) cancel();
		}}
	>
		<div
			class="sheet"
			role="dialog"
			aria-modal="true"
			aria-label={request.label || 'Pick a duration'}
			bind:this={sheetEl}
			tabindex="-1"
		>
			<header class="sheet-header">
				<button type="button" class="header-btn cancel" onclick={cancel} aria-label="Cancel">
					Cancel
				</button>
				<div class="header-title">
					{#if request.label}<span class="label">{request.label}</span>{/if}
					<span class="value">
						{pad(minutesValue)}<span class="colon">:</span>{pad(secondsValue)}
					</span>
				</div>
				<button type="button" class="header-btn confirm" onclick={commit} aria-label="Confirm">
					Done
				</button>
			</header>

			<div class="columns">
				<div class="column-block">
					<div class="column-label">Minutes</div>
					<div
						class="wheel"
						role="slider"
						aria-label="Minutes"
						aria-valuemin={minutesSpec.min}
						aria-valuemax={minutesSpec.max}
						aria-valuenow={minutesValue}
						tabindex="0"
						onpointerdown={(e) => onPointerDown(e, 'minutes')}
						onpointermove={onPointerMove}
						onpointerup={onPointerUp}
						onpointercancel={onPointerUp}
						onwheel={(e) => onWheel(e, 'minutes')}
						style="--row-h: {ROW_HEIGHT}px; --rows: {VISIBLE_ROWS};"
					>
						<div class="centre-band" aria-hidden="true"></div>
						<ul
							class="rows"
							style="transform: translateY(calc({(VISIBLE_ROWS - 1) /
								2} * var(--row-h) - {minutesIndex} * var(--row-h)));"
						>
							{#each Array(minutesCount) as _, i (i)}
								<li
									class="row"
									class:current={i === minutesIndex}
									style="--dist: {Math.abs(i - minutesIndex)};"
								>
									{pad(valueAt(minutesSpec, i))}
								</li>
							{/each}
						</ul>
					</div>
				</div>

				<div class="separator" aria-hidden="true">:</div>

				<div class="column-block">
					<div class="column-label">Seconds</div>
					<div
						class="wheel"
						role="slider"
						aria-label="Seconds"
						aria-valuemin={secondsSpec.min}
						aria-valuemax={secondsSpec.max}
						aria-valuenow={secondsValue}
						tabindex="0"
						onpointerdown={(e) => onPointerDown(e, 'seconds')}
						onpointermove={onPointerMove}
						onpointerup={onPointerUp}
						onpointercancel={onPointerUp}
						onwheel={(e) => onWheel(e, 'seconds')}
						style="--row-h: {ROW_HEIGHT}px; --rows: {VISIBLE_ROWS};"
					>
						<div class="centre-band" aria-hidden="true"></div>
						<ul
							class="rows"
							style="transform: translateY(calc({(VISIBLE_ROWS - 1) /
								2} * var(--row-h) - {secondsIndex} * var(--row-h)));"
						>
							{#each Array(secondsCount) as _, i (i)}
								<li
									class="row"
									class:current={i === secondsIndex}
									style="--dist: {Math.abs(i - secondsIndex)};"
								>
									{pad(valueAt(secondsSpec, i))}
								</li>
							{/each}
						</ul>
					</div>
				</div>
			</div>

			<div class="rulers">
				<div class="ruler" role="group" aria-label="Nearby minutes">
					{#each minutesNeighbours as i (i)}
						<button
							type="button"
							class="ruler-chip"
							class:current={i === minutesIndex}
							onclick={() => onRulerTap('minutes', i)}
						>
							{pad(valueAt(minutesSpec, i))}
						</button>
					{/each}
				</div>
				<div class="ruler" role="group" aria-label="Nearby seconds">
					{#each secondsNeighbours as i (i)}
						<button
							type="button"
							class="ruler-chip"
							class:current={i === secondsIndex}
							onclick={() => onRulerTap('seconds', i)}
						>
							{pad(valueAt(secondsSpec, i))}
						</button>
					{/each}
				</div>
			</div>

			{#if request.allowClear}
				<button type="button" class="clear-btn" onclick={clearValue}>No value</button>
			{/if}

			{#if request.hint}
				<p class="hint">{request.hint}</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.55);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		animation: fade-in 180ms ease-out;
		overscroll-behavior: contain;
		touch-action: none;
	}
	.backdrop.reduced-motion {
		animation: none;
	}

	.sheet {
		width: 100%;
		max-width: 480px;
		background: var(--color-bg-card-solid, #0a0f14);
		border-radius: 18px;
		border: 1px solid rgba(148, 163, 184, 0.18);
		box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
		padding: 0.75rem 1rem 1rem;
		max-height: min(86dvh, 720px);
		margin: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		animation: pop-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
		outline: none;
	}
	.backdrop.reduced-motion .sheet {
		animation: none;
	}

	.sheet-header {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0;
	}
	.header-btn {
		background: none;
		border: none;
		font-size: 0.95rem;
		font-weight: 600;
		padding: 0.5rem 0.75rem;
		border-radius: 10px;
		cursor: pointer;
		min-height: 44px;
		color: var(--color-text-muted);
	}
	.header-btn.confirm {
		color: var(--color-primary);
	}
	.header-btn:hover {
		background: rgba(148, 163, 184, 0.08);
	}
	.header-title {
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.125rem;
	}
	.header-title .label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
	}
	.header-title .value {
		font-size: 1.5rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--color-text);
		display: inline-flex;
		align-items: baseline;
	}
	.header-title .colon {
		margin: 0 0.05em;
		color: var(--color-text-muted);
	}

	.columns {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: end;
		gap: 0.5rem;
	}
	.column-block {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.column-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
		text-align: center;
	}
	.separator {
		font-size: 2rem;
		font-weight: 700;
		color: var(--color-text-muted);
		padding-bottom: calc(var(--row-h, 56px) * 5 / 2 - 1.5rem);
		align-self: center;
	}

	.wheel {
		position: relative;
		height: calc(var(--row-h) * var(--rows));
		overflow: hidden;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		mask-image: linear-gradient(
			to bottom,
			transparent 0%,
			black 18%,
			black 82%,
			transparent 100%
		);
		-webkit-mask-image: linear-gradient(
			to bottom,
			transparent 0%,
			black 18%,
			black 82%,
			transparent 100%
		);
		outline: none;
	}
	.wheel:focus-visible {
		box-shadow: inset 0 0 0 2px var(--color-primary);
		border-radius: 12px;
	}
	.centre-band {
		position: absolute;
		left: 0.25rem;
		right: 0.25rem;
		top: calc(var(--row-h) * (var(--rows) - 1) / 2);
		height: var(--row-h);
		border-top: 1px solid rgba(20, 184, 166, 0.35);
		border-bottom: 1px solid rgba(20, 184, 166, 0.35);
		background: rgba(20, 184, 166, 0.06);
		border-radius: 12px;
		pointer-events: none;
	}
	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		transition: transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
		will-change: transform;
	}
	.backdrop.reduced-motion .rows {
		transition: none;
	}
	.row {
		height: var(--row-h);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.75rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--color-text-muted);
		opacity: calc(1 - 0.18 * var(--dist));
	}
	.row.current {
		color: var(--color-text);
		opacity: 1;
	}

	.rulers {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}
	.ruler {
		display: flex;
		gap: 0.25rem;
		justify-content: center;
		flex-wrap: wrap;
	}
	.ruler-chip {
		min-width: 36px;
		min-height: 32px;
		padding: 0.2rem 0.45rem;
		border-radius: 8px;
		background: rgba(148, 163, 184, 0.08);
		border: 1px solid rgba(148, 163, 184, 0.15);
		color: var(--color-text-muted);
		font-size: 0.85rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
	}
	.ruler-chip.current {
		background: rgba(20, 184, 166, 0.18);
		border-color: rgba(20, 184, 166, 0.4);
		color: var(--color-text);
	}
	.clear-btn {
		min-height: 42px;
		border-radius: 10px;
		border: 1px solid rgba(148, 163, 184, 0.18);
		background: rgba(148, 163, 184, 0.08);
		color: var(--color-text-muted);
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
	}
	.clear-btn:hover {
		background: rgba(148, 163, 184, 0.14);
		color: var(--color-text);
	}

	.hint {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		text-align: center;
		margin: 0;
	}

	@keyframes pop-in {
		from {
			transform: translateY(12px) scale(0.98);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}
	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>
