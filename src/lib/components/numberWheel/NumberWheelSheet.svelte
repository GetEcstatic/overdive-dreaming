<script lang="ts">
	/**
	 * Global bottom-sheet wheel picker. Mounted ONCE in the root layout
	 * and driven by {@link wheelSheetStore}. See
	 * {@link ../../../../docs/wheel-selector-redesign.md} (§5–§7).
	 *
	 * Side-effect surface only:
	 *   - listens to the store
	 *   - locks body scroll while open
	 *   - traps focus
	 *   - converts pointer events into WheelIntent.drag / .confirm
	 *
	 * All numeric/state logic delegates to numberWheel/wheel.ts.
	 */
	import { onDestroy, tick } from 'svelte';
	import {
		format as formatValue,
		indexFromOffset,
		indexOf as wheelIndexOf,
		neighbourIndices,
		precisionOf,
		reduce,
		valueAt,
		valueCount
	} from './wheel';
	import type { WheelIntent, WheelSpec, WheelState } from './types';
	import { closeWheelSheet, wheelSheet, type WheelSheetRequest } from './wheelSheetStore';
	import { lockBodyScroll, prefersReducedMotion, trapFocus, vibrate } from './sheet-effects';

	// Visual constants
	const ROW_HEIGHT = 64; // px — large touch target
	const VISIBLE_ROWS = 5; // odd, so there's a clear centre

	let request: WheelSheetRequest | null = $state(null);
	let spec: WheelSpec | null = $state(null);
	let wheelState: WheelState = $state({ value: undefined, dragIndex: null, open: false, pending: undefined });

	let sheetEl: HTMLDivElement | undefined = $state();
	let inputEl: HTMLInputElement | undefined = $state();
	let releaseLock: (() => void) | null = null;
	let releaseTrap: (() => void) | null = null;
	let lastVibratedIndex: number | null = null;

	let count = $derived(spec ? valueCount(spec) : 0);
	let centreIndex = $derived(wheelState.dragIndex ?? (spec ? wheelIndexOf(spec, wheelState.value) : 0));
	let centreValue = $derived(spec && count > 0 ? valueAt(spec, centreIndex) : undefined);
	let neighbours = $derived(spec ? neighbourIndices({ centre: centreIndex, radius: 3, count }) : []);

	function dispatch(intent: WheelIntent) {
		if (!spec) return;
		const next = reduce(wheelState, intent, spec);
		wheelState = next;
		// Haptic feedback on each new snapped index during drag (Android).
		if (
			intent.kind === 'drag' &&
			next.dragIndex !== null &&
			next.dragIndex !== lastVibratedIndex
		) {
			lastVibratedIndex = next.dragIndex;
			vibrate(5);
		}
	}

	// Subscribe to the global store. When a new request arrives we mount
	// the sheet with its spec; when the request is cleared we tear down.
	const unsubStore = wheelSheet.subscribe(async (s) => {
		const incoming = s.request;
		if (incoming === request) return;

		// Tear down previous (a newer request displaces us).
		if (request) teardown();

		request = incoming;
		if (!incoming) return;

		spec = incoming.spec;
		wheelState = reduce(
			{ value: incoming.initial, dragIndex: null, open: false, pending: undefined },
			{ kind: 'open' },
			spec
		);
		lastVibratedIndex = wheelState.dragIndex;

		await tick();
		releaseLock = lockBodyScroll();
		if (sheetEl) {
			releaseTrap = trapFocus(sheetEl, { initial: inputEl });
		}
	});

	function teardown() {
		releaseLock?.();
		releaseTrap?.();
		releaseLock = null;
		releaseTrap = null;
		request = null;
		spec = null;
		lastVibratedIndex = null;
	}

	onDestroy(() => {
		unsubStore();
		teardown();
	});

	function commit() {
		if (!request || !spec) return;
		const candidate = wheelState.pending ?? wheelState.value ?? valueAt(spec, centreIndex);
		const finalValue = valueAt(spec, wheelIndexOf(spec, candidate));
		request.onConfirm(finalValue);
		closeWheelSheet();
	}

	function cancel() {
		request?.onCancel?.();
		closeWheelSheet();
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
			// Don't hijack Enter when a button has focus (let the button click).
			if (document.activeElement?.tagName !== 'BUTTON') {
				e.preventDefault();
				commit();
			}
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			dispatch({ kind: 'drag', index: centreIndex - 1 });
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			dispatch({ kind: 'drag', index: centreIndex + 1 });
		} else if (e.key === 'PageUp') {
			e.preventDefault();
			dispatch({ kind: 'drag', index: centreIndex - 5 });
		} else if (e.key === 'PageDown') {
			e.preventDefault();
			dispatch({ kind: 'drag', index: centreIndex + 5 });
		} else if (e.key === 'Home') {
			e.preventDefault();
			dispatch({ kind: 'drag', index: 0 });
		} else if (e.key === 'End') {
			e.preventDefault();
			dispatch({ kind: 'drag', index: count - 1 });
		}
	}

	// ---- Pointer drag on the BigWheel -------------------------------------
	let dragStartY = 0;
	let dragStartIndex = 0;
	let dragPointerId: number | null = null;

	function onPointerDown(e: PointerEvent) {
		if (!spec) return;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		dragPointerId = e.pointerId;
		dragStartY = e.clientY;
		dragStartIndex = centreIndex;
	}
	function onPointerMove(e: PointerEvent) {
		if (dragPointerId !== e.pointerId || !spec) return;
		const idx = indexFromOffset({
			startIndex: dragStartIndex,
			deltaY: e.clientY - dragStartY,
			rowHeight: ROW_HEIGHT,
			count
		});
		if (idx !== centreIndex) dispatch({ kind: 'drag', index: idx });
	}
	function onPointerUp(e: PointerEvent) {
		if (dragPointerId !== e.pointerId) return;
		(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		dragPointerId = null;
		// On release, `state.pending` already reflects the snapped index;
		// we don't auto-commit — the user explicitly taps ✓.
	}

	// Wheel/scroll on desktop trackpads.
	function onWheel(e: WheelEvent) {
		if (!spec) return;
		e.preventDefault();
		const delta = Math.sign(e.deltaY);
		if (delta !== 0) dispatch({ kind: 'drag', index: centreIndex + delta });
	}

	// ---- Numeric input ----------------------------------------------------
	function onInput(e: Event) {
		const raw = (e.currentTarget as HTMLInputElement).value;
		dispatch({ kind: 'type', raw });
	}

	function onRulerTap(idx: number) {
		dispatch({ kind: 'drag', index: idx });
	}
</script>

<svelte:window onkeydown={onKey} />

{#if request && spec}
	<div
		class="backdrop"
		class:reduced-motion={prefersReducedMotion()}
		role="presentation"
		onclick={onBackdropClick}
		onpointerdown={(e) => {
			// Only cancel on direct backdrop touches (not bubbled from sheet)
			if (e.target === e.currentTarget) cancel();
		}}
	>
		<div
			class="sheet"
			role="dialog"
			aria-modal="true"
			aria-label={spec.label || 'Pick a value'}
			bind:this={sheetEl}
			tabindex="-1"
		>
			<header class="sheet-header">
				<button
					type="button"
					class="header-btn cancel"
					onclick={cancel}
					aria-label="Cancel"
				>
					Cancel
				</button>
				<div class="header-title">
					{#if spec.label}<span class="label">{spec.label}</span>{/if}
					<span class="value">
						{centreValue !== undefined ? formatValue(spec, centreValue) : '—'}
						{#if spec.unit}<span class="unit">{spec.unit}</span>{/if}
					</span>
				</div>
				<button
					type="button"
					class="header-btn confirm"
					onclick={commit}
					aria-label="Confirm"
				>
					Done
				</button>
			</header>

			<div
				class="wheel"
				role="slider"
				aria-valuemin={spec.min}
				aria-valuemax={spec.max}
				aria-valuenow={centreValue ?? spec.min}
				aria-valuetext={centreValue !== undefined ? formatValue(spec, centreValue) : ''}
				tabindex="0"
				onpointerdown={onPointerDown}
				onpointermove={onPointerMove}
				onpointerup={onPointerUp}
				onpointercancel={onPointerUp}
				onwheel={onWheel}
				style="--row-h: {ROW_HEIGHT}px; --rows: {VISIBLE_ROWS};"
			>
				<div class="centre-band" aria-hidden="true"></div>
				<ul
					class="rows"
					style="transform: translateY(calc({(VISIBLE_ROWS - 1) / 2} * var(--row-h) - {centreIndex} * var(--row-h)));"
				>
					{#each Array(count) as _, i (i)}
						<li
							class="row"
							class:current={i === centreIndex}
							style="--dist: {Math.abs(i - centreIndex)};"
						>
							{formatValue(spec, valueAt(spec, i))}
						</li>
					{/each}
				</ul>
			</div>

			<div class="ruler" role="group" aria-label="Nearby values">
				{#each neighbours as i (i)}
					<button
						type="button"
						class="ruler-chip"
						class:current={i === centreIndex}
						onclick={() => onRulerTap(i)}
					>
						{formatValue(spec, valueAt(spec, i))}
					</button>
				{/each}
			</div>

			<div class="numeric">
				<label class="numeric-label" for="wheel-numeric-input">Type</label>
				<input
					id="wheel-numeric-input"
					bind:this={inputEl}
					class="numeric-input"
					inputmode="decimal"
					type="text"
					autocomplete="off"
					value={wheelState.pending !== undefined ? formatValue(spec, wheelState.pending) : ''}
					placeholder={request.placeholder ?? formatValue(spec, valueAt(spec, centreIndex))}
					oninput={onInput}
				/>
				{#if spec.unit}<span class="numeric-unit">{spec.unit}</span>{/if}
			</div>

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
		align-items: flex-end;
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
		border-top-left-radius: 22px;
		border-top-right-radius: 22px;
		border-top: 1px solid rgba(148, 163, 184, 0.18);
		box-shadow: 0 -12px 32px rgba(0, 0, 0, 0.45);
		padding: 0.5rem 1rem
			calc(1rem + env(safe-area-inset-bottom, 0px));
		max-height: 85dvh;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		animation: slide-up 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
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
	.header-btn.cancel {
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
		font-size: 1.4rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--color-text);
	}
	.header-title .unit {
		font-size: 0.95rem;
		font-weight: 500;
		color: var(--color-text-muted);
		margin-left: 0.2rem;
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
		left: 0.5rem;
		right: 0.5rem;
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
		transition: transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
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
		font-size: 2rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--color-text-muted);
		opacity: calc(1 - 0.18 * var(--dist));
	}
	.row.current {
		color: var(--color-text);
		opacity: 1;
	}

	.ruler {
		display: flex;
		gap: 0.375rem;
		justify-content: center;
		flex-wrap: wrap;
	}
	.ruler-chip {
		min-width: 44px;
		min-height: 36px;
		padding: 0.25rem 0.6rem;
		border-radius: 10px;
		background: rgba(148, 163, 184, 0.08);
		border: 1px solid rgba(148, 163, 184, 0.15);
		color: var(--color-text-muted);
		font-size: 0.95rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
	}
	.ruler-chip.current {
		background: rgba(20, 184, 166, 0.18);
		border-color: rgba(20, 184, 166, 0.4);
		color: var(--color-text);
	}

	.numeric {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: rgba(148, 163, 184, 0.06);
		border: 1px solid rgba(148, 163, 184, 0.15);
		border-radius: 10px;
		padding: 0.5rem 0.75rem;
	}
	.numeric-label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
	}
	.numeric-input {
		flex: 1;
		min-width: 0;
		background: none;
		border: none;
		color: var(--color-text);
		font-size: 1.1rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		outline: none;
		min-height: 36px;
	}
	.numeric-unit {
		color: var(--color-text-muted);
		font-size: 0.95rem;
	}

	.hint {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		text-align: center;
		margin: 0;
	}

	@keyframes slide-up {
		from {
			transform: translateY(100%);
		}
		to {
			transform: translateY(0);
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
