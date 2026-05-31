<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { createEmptyTimeline, finalizeTimeline } from '$lib/capture/timeline';
	import { requestWakeLock, type WakeLockHandle } from '$lib/capture/wakeLock';
	import type { DiveTimeline } from '$lib/types';

	interface StaticOnlyCaptureResult {
		source: 'static-metrics-only';
		timeline: DiveTimeline;
		discipline: 'STA';
		durationSeconds: number;
	}

	interface Props {
		onCapture: (result: StaticOnlyCaptureResult) => void;
		onCancel?: () => void;
	}

	let { onCapture, onCancel }: Props = $props();

	type Phase = 'ready' | 'holding' | 'ended';

	let phase = $state<Phase>('ready');
	let nowMs = $state(0);
	let holdStartedPerfMs = $state(0);
	let holdEndedPerfMs = $state(0);
	let tickHandle: number | null = null;
	let wakeLock: WakeLockHandle | null = null;

	const elapsedMs = $derived.by(() => {
		if (phase === 'ready') return 0;
		const endMs = phase === 'holding' ? nowMs : holdEndedPerfMs;
		return Math.max(0, endMs - holdStartedPerfMs);
	});

	function formatMs(ms: number): string {
		const safeMs = Math.max(0, ms);
		const totalSecs = Math.floor(safeMs / 1000);
		const mm = Math.floor(totalSecs / 60).toString().padStart(2, '0');
		const ss = (totalSecs % 60).toString().padStart(2, '0');
		const tenths = Math.floor((safeMs % 1000) / 100);
		return `${mm}:${ss}.${tenths}`;
	}

	function startTicking(): void {
		const tick = () => {
			nowMs = performance.now();
			tickHandle = requestAnimationFrame(tick);
		};
		tickHandle = requestAnimationFrame(tick);
	}

	function stopTicking(): void {
		if (tickHandle !== null) {
			cancelAnimationFrame(tickHandle);
			tickHandle = null;
		}
	}

	async function startHold(): Promise<void> {
		if (phase !== 'ready') return;
		try {
			wakeLock = await requestWakeLock();
		} catch {
			wakeLock = null;
		}
		const atPerfMs = performance.now();
		holdStartedPerfMs = atPerfMs;
		nowMs = atPerfMs;
		phase = 'holding';
		startTicking();
		vibrate(12);
	}

	function endHold(): void {
		if (phase !== 'holding') return;
		holdEndedPerfMs = performance.now();
		nowMs = holdEndedPerfMs;
		phase = 'ended';
		stopTicking();
		vibrate([40, 30, 80]);
	}

	function review(): void {
		if (phase !== 'ended') return;
		const durationMs = Math.max(0, holdEndedPerfMs - holdStartedPerfMs);
		const timeline = finalizeTimeline(createEmptyTimeline(0), durationMs);
		cleanup(false);
		onCapture({
			source: 'static-metrics-only',
			timeline,
			discipline: 'STA',
			durationSeconds: durationMs / 1000
		});
	}

	function cancel(): void {
		cleanup();
		onCancel?.();
	}

	function cleanup(reset = true): void {
		stopTicking();
		if (wakeLock) {
			wakeLock.release().catch(() => undefined);
			wakeLock = null;
		}
		if (reset) {
			phase = 'ready';
			nowMs = 0;
			holdStartedPerfMs = 0;
			holdEndedPerfMs = 0;
		}
	}

	function handlePrimaryAction(): void {
		if (phase === 'ready') {
			void startHold();
			return;
		}
		if (phase === 'holding') {
			endHold();
			return;
		}
		review();
	}

	function primaryLabel(): string {
		if (phase === 'ready') return 'Start hold';
		if (phase === 'holding') return 'End hold';
		return 'Review';
	}

	function primarySubLabel(): string {
		if (phase === 'ready') return 'Static max stopwatch';
		if (phase === 'holding') return 'Tap when the hold ends';
		return 'Save time';
	}

	function vibrate(pattern: number | number[]): void {
		if (typeof navigator === 'undefined') return;
		const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
		if (typeof nav.vibrate !== 'function') return;
		try {
			nav.vibrate(pattern);
		} catch {
			/* ignore */
		}
	}

	onMount(() => {
		nowMs = performance.now();
	});

	onDestroy(() => {
		cleanup();
	});
</script>

<div class="static-recorder">
	<header class="static-head">
		<div>
			<span class="mode-label">Metrics only</span>
			<strong>STA</strong>
		</div>
		<div class="setup-pill">Static max</div>
	</header>

	<main class="static-main" class:is-holding={phase === 'holding'}>
		<section class="hero-time" aria-label="Live static hold time">
			<span>{formatMs(elapsedMs)}</span>
			<small>{phase === 'holding' ? 'holding' : 'hold time'}</small>
		</section>

		<section class="status-panel" aria-label="Static hold status">
			<div>
				<span>Status</span>
				<strong>{phase === 'ready' ? 'Ready' : phase === 'holding' ? 'In hold' : 'Ended'}</strong>
			</div>
			<div>
				<span>Discipline</span>
				<strong>Static</strong>
			</div>
		</section>
	</main>

	<footer class="static-controls">
		{#if phase === 'ready'}
			<button class="utility-button" type="button" onclick={cancel}>Cancel</button>
		{/if}

		<button
			class="primary-action"
			class:action-ready={phase === 'ready'}
			class:action-end={phase === 'holding'}
			class:action-review={phase === 'ended'}
			type="button"
			onclick={handlePrimaryAction}
		>
			<span class="btn-main">{primaryLabel()}</span>
			<span class="btn-sub">{primarySubLabel()}</span>
		</button>
	</footer>
</div>

<style>
	.static-recorder {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: grid;
		grid-template-rows: auto 1fr auto;
		height: 100dvh;
		min-height: 100vh;
		padding: max(0.9rem, env(safe-area-inset-top)) max(0.9rem, env(safe-area-inset-right)) calc(1rem + env(safe-area-inset-bottom)) max(0.9rem, env(safe-area-inset-left));
		background: #020617;
		color: var(--color-text);
		overflow: hidden;
		overscroll-behavior: none;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
	}

	.static-head,
	.static-main,
	.static-controls {
		width: min(100%, 32rem);
		justify-self: center;
	}

	.static-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		min-height: 3.3rem;
	}

	.static-head div:first-child {
		display: grid;
		gap: 0.12rem;
	}

	.mode-label,
	.setup-pill,
	.hero-time small,
	.status-panel span {
		color: #94a3b8;
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.static-head strong {
		font-size: 1.1rem;
		line-height: 1;
	}

	.setup-pill {
		padding: 0.55rem 0.75rem;
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.78);
		color: #cbd5e1;
		white-space: nowrap;
	}

	.static-main {
		display: grid;
		align-content: center;
		gap: 1.15rem;
		min-height: 0;
		padding: 0.75rem 0 1rem;
	}

	.hero-time {
		display: grid;
		gap: 0.2rem;
		text-align: center;
	}

	.hero-time span {
		font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		font-size: clamp(4rem, 22vw, 7.4rem);
		font-variant-numeric: tabular-nums;
		font-weight: 720;
		line-height: 1;
		letter-spacing: 0;
	}

	.status-panel {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.7rem;
		padding: 0.95rem;
		border: 1px solid rgba(148, 163, 184, 0.14);
		border-radius: 8px;
		background: rgba(15, 23, 42, 0.62);
	}

	.status-panel div {
		display: grid;
		gap: 0.18rem;
		padding: 0.65rem 0.55rem;
		border-radius: 8px;
		background: rgba(2, 6, 23, 0.38);
		text-align: center;
	}

	.status-panel strong {
		font-size: 1rem;
		font-weight: 850;
		color: #e2e8f0;
	}

	.static-controls {
		display: grid;
		gap: 0.7rem;
		padding-bottom: clamp(2.8rem, 10vh, 4.75rem);
	}

	.utility-button {
		width: 100%;
		min-height: 3rem;
		border: 1px solid rgba(226, 232, 240, 0.2);
		border-radius: 8px;
		background: rgba(15, 23, 42, 0.76);
		color: #e2e8f0;
		font: inherit;
		font-size: 0.94rem;
		font-weight: 800;
	}

	.primary-action {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.18rem;
		width: 100%;
		min-height: clamp(8.6rem, 26vh, 12rem);
		border: 2px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		padding: 1rem;
		box-shadow: 0 18px 46px rgba(0, 0, 0, 0.35), inset 0 0 0 5px rgba(255, 255, 255, 0.08);
		font: inherit;
		font-weight: 820;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
	}

	.primary-action:active:not(:disabled) {
		transform: scale(0.97);
	}

	.primary-action.action-ready,
	.primary-action.action-review {
		background: #10b981;
		color: #052e25;
	}

	.primary-action.action-end {
		background: #ef4444;
		color: #fff;
	}

	.btn-main,
	.btn-sub {
		text-align: center;
	}

	.btn-main {
		font-size: clamp(2rem, 11vw, 4.2rem);
		font-weight: 820;
		line-height: 0.98;
	}

	.btn-sub {
		font-size: clamp(0.95rem, 4vw, 1.2rem);
		font-weight: 650;
		opacity: 0.78;
	}

	@media (orientation: landscape) {
		.static-controls {
			padding-bottom: clamp(1rem, 5vh, 2.5rem);
		}

		.hero-time span {
			font-size: clamp(3.4rem, 12vw, 6rem);
		}
	}
</style>