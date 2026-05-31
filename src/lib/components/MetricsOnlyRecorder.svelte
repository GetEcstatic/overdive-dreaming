<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { requestWakeLock, type WakeLockHandle } from '$lib/capture/wakeLock';
	import { finalizeTimeline, summariseTimeline } from '$lib/capture/timeline';
	import {
		initialRecorderState,
		recorderReducer,
		waypointSpacingM,
		type RecorderConfig,
		type RecorderEvent,
		type RecorderState
	} from '$lib/capture/recorderState';
	import {
		canMoveWaypointCursorBack,
		completedLapCount,
		cumulativeDistanceM,
		diveElapsedMs,
		liveSpeedMs,
		nextTapKind,
		nextWaypointM,
		shouldAutoAdvance,
		waypointCount
	} from '$lib/capture/recorderSelectors';
	import type {
		CameraPreference,
		DiveTimeline,
		DiveVideoDiscipline,
		DiveVideoResolution
	} from '$lib/types';
	import { AUTO_REAR_CAMERA } from '$lib/capture/cameraDevices';

	interface MetricsOnlyCaptureResult {
		source: 'metrics-only';
		timeline: DiveTimeline;
		discipline: DiveVideoDiscipline;
		poolLength: number;
		waypointsPerLap: number;
		durationSeconds: number;
	}

	interface Props {
		poolLength: number;
		waypointsPerLap?: number;
		discipline?: DiveVideoDiscipline;
		autoAdvanceThresholdM?: number;
		onCapture: (result: MetricsOnlyCaptureResult) => void;
		onCancel?: () => void;
	}

	let {
		poolLength,
		waypointsPerLap = 2,
		discipline = 'DYN',
		autoAdvanceThresholdM = 10,
		onCapture,
		onCancel
	}: Props = $props();

	function initialConfig(): RecorderConfig {
		return {
			poolLengthM: poolLength,
			waypointsPerLap,
			discipline,
			resolution: '720p' satisfies DiveVideoResolution,
			autoAdvanceThresholdM,
			cameraPreference: AUTO_REAR_CAMERA satisfies CameraPreference
		};
	}

	let rs: RecorderState = $state(initialRecorderState(initialConfig()));
	let wakeLock: WakeLockHandle | null = null;
	let nowMs = $state(0);
	let tickHandle: number | null = null;
	let bannerClearHandle: ReturnType<typeof setTimeout> | null = null;
	let waypointTapLockHandle: ReturnType<typeof setTimeout> | null = null;
	let waypointTapLocked = $state(false);
	let pendingEndDiveAtPerfMs = $state<number | null>(null);
	let endDiveHoldHandle: ReturnType<typeof setTimeout> | null = null;
	let endDiveHeld = $state(false);
	let primaryRequiresFreshPress = false;

	const canMoveWaypointBack = $derived(canMoveWaypointCursorBack(rs));
	const elapsedMs = $derived(diveElapsedMs(rs, nowMs));
	const distanceM = $derived(cumulativeDistanceM(rs, nowMs));
	const speedMs = $derived(liveSpeedMs(rs));
	const nextM = $derived(nextWaypointM(rs));
	const waypointTapCount = $derived(waypointCount(rs));
	const lapCount = $derived(completedLapCount(rs));
	const spacing = $derived(waypointSpacingM(rs.config));

	function dispatch(event: RecorderEvent): RecorderState {
		rs = recorderReducer(rs, event);
		return rs;
	}

	function formatMs(ms: number): string {
		const totalSecs = Math.floor(Math.max(0, ms) / 1000);
		const mm = Math.floor(totalSecs / 60).toString().padStart(2, '0');
		const ss = (totalSecs % 60).toString().padStart(2, '0');
		const tenths = Math.floor((Math.max(0, ms) % 1000) / 100);
		return `${mm}:${ss}.${tenths}`;
	}

	function formatMeters(m: number): string {
		return Number.isInteger(m) ? `${m}` : m.toFixed(1);
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

	async function startTracking(): Promise<void> {
		if (rs.phase !== 'ready') return;
		try {
			wakeLock = await requestWakeLock();
		} catch {
			wakeLock = null;
		}
		dispatch({ type: 'recording/started', atPerfMs: performance.now() });
		startTicking();
	}

	function startDive(): void {
		dispatch({ type: 'dive/started', atPerfMs: performance.now() });
	}

	function onPressWaypoint(): void {
		if (waypointTapLocked || rs.phase !== 'diving') return;
		const atPerfMs = performance.now();
		const kind = nextTapKind(rs);
		pulseTap(kind === 'wall' ? 'wall' : 'split');
		dispatch({ type: 'waypoint/manualTapped', atPerfMs });
		waypointTapLocked = true;
		if (waypointTapLockHandle) clearTimeout(waypointTapLockHandle);
		waypointTapLockHandle = setTimeout(() => {
			waypointTapLockHandle = null;
			waypointTapLocked = false;
		}, 2000);
	}

	function moveWaypointCursor(direction: -1 | 1): void {
		dispatch({ type: 'waypoint/cursorMoved', direction });
	}

	function completeCapture(state: RecorderState): void {
		const timeline = state.timeline;
		const durationSeconds = Math.max(0, timeline.diveEndMs - timeline.diveStartMs) / 1000;
		cleanup(false);
		onCapture({
			source: 'metrics-only',
			timeline,
			discipline,
			poolLength,
			waypointsPerLap,
			durationSeconds
		});
	}

	function stopTracking(): void {
		let nextState = rs;
		if (nextState.phase === 'diving') {
			nextState = dispatch({ type: 'dive/ended', atPerfMs: performance.now() });
		}
		if (nextState.phase === 'prepping') {
			nextState = dispatch({ type: 'recording/stopping' });
		} else if (nextState.phase === 'ended') {
			nextState = dispatch({ type: 'recording/stopping' });
		}
		stopTicking();
		completeCapture(nextState);
	}

	function confirmEndDive(): void {
		const atPerfMs = pendingEndDiveAtPerfMs;
		if (atPerfMs === null) return;
		pendingEndDiveAtPerfMs = null;
		nowMs = atPerfMs;
		dispatch({ type: 'dive/ended', atPerfMs });
		stopTicking();
	}

	function resumeDiveAfterEndRequest(): void {
		pendingEndDiveAtPerfMs = null;
	}

	function handlePrimaryAction(): void {
		if (primaryRequiresFreshPress) return;
		if (rs.phase === 'ready') {
			pulseTap();
			void startTracking();
			return;
		}
		if (rs.phase === 'prepping') {
			pulseTap();
			startDive();
			return;
		}
		if (rs.phase === 'diving') {
			onPressWaypoint();
			return;
		}
		if (rs.phase === 'ended') {
			stopTracking();
		}
	}

	function primaryLabel(): string {
		if (rs.phase === 'ready') return 'Start tracking';
		if (rs.phase === 'prepping') return 'Start dive';
		if (rs.phase === 'diving') return endDiveHeld ? 'Hold' : `${formatMeters(nextM)}m`;
		if (rs.phase === 'ended') return 'Review';
		return 'Ready';
	}

	function primarySubLabel(): string {
		if (rs.phase === 'ready') return 'No video';
		if (rs.phase === 'prepping') return 'Diver leaves wall';
		if (rs.phase === 'diving') return endDiveHeld ? 'end dive' : 'Tap mark · hold end';
		if (rs.phase === 'ended') return 'Save metrics';
		return '';
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

	function pulseTap(kind: 'primary' | 'split' | 'wall' = 'primary'): void {
		if (kind === 'wall') {
			vibrate(30);
			return;
		}
		vibrate(kind === 'split' ? 15 : 12);
	}

	function pulseHoldStart(): void {
		vibrate([20, 30, 20]);
	}

	function pulseHoldCommit(): void {
		vibrate([60, 40, 120, 40, 180]);
	}

	const END_DIVE_HOLD_MS = 500;

	function onPrimaryHoldStart(ev: PointerEvent): void {
		primaryRequiresFreshPress = false;
		if (rs.phase !== 'diving') return;
		const holdStartedAtPerfMs = performance.now();
		const target = ev.currentTarget as HTMLElement | null;
		if (target && typeof target.setPointerCapture === 'function') {
			try {
				target.setPointerCapture(ev.pointerId);
			} catch {
				/* ignore */
			}
		}
		endDiveHeld = true;
		pulseHoldStart();
		endDiveHoldHandle = setTimeout(() => {
			endDiveHoldHandle = null;
			endDiveHeld = false;
			primaryRequiresFreshPress = true;
			pulseHoldCommit();
			pendingEndDiveAtPerfMs = holdStartedAtPerfMs;
		}, END_DIVE_HOLD_MS);
	}

	function onPrimaryHoldEnd(): void {
		if (endDiveHoldHandle !== null) {
			clearTimeout(endDiveHoldHandle);
			endDiveHoldHandle = null;
		}
		endDiveHeld = false;
	}

	function cleanup(resetState = true): void {
		if (wakeLock) {
			wakeLock.release().catch(() => undefined);
			wakeLock = null;
		}
		stopTicking();
		if (bannerClearHandle) {
			clearTimeout(bannerClearHandle);
			bannerClearHandle = null;
		}
		if (waypointTapLockHandle) {
			clearTimeout(waypointTapLockHandle);
			waypointTapLockHandle = null;
		}
		waypointTapLocked = false;
		pendingEndDiveAtPerfMs = null;
		onPrimaryHoldEnd();
		if (resetState) rs = initialRecorderState(initialConfig());
	}

	function cancel(): void {
		cleanup();
		onCancel?.();
	}

	$effect(() => {
		if (shouldAutoAdvance(rs, nowMs)) {
			dispatch({ type: 'waypoint/auto', atPerfMs: nowMs, count: 1 });
		}
	});

	let lastSampleAtMs = 0;
	$effect(() => {
		if (rs.phase !== 'diving') {
			lastSampleAtMs = 0;
			return;
		}
		if (nowMs - lastSampleAtMs < 1000) return;
		lastSampleAtMs = nowMs;
		dispatch({
			type: 'sample/recorded',
			atPerfMs: nowMs,
			distanceM: cumulativeDistanceM(rs, nowMs),
			speedMs: liveSpeedMs(rs)
		});
	});

	$effect(() => {
		if (rs.autoAdvance && !bannerClearHandle) {
			bannerClearHandle = setTimeout(() => {
				bannerClearHandle = null;
				dispatch({ type: 'banner/cleared' });
			}, 2200);
		}
	});

	onMount(() => {
		nowMs = performance.now();
		dispatch({ type: 'arm/succeeded' });
	});

	onDestroy(() => {
		cleanup();
	});
</script>

<div class="metrics-recorder">
	<header class="metrics-head">
		<div>
			<span class="mode-label">Metrics only</span>
			<strong>{discipline}</strong>
		</div>
		<div class="setup-pill">{formatMeters(poolLength)}m pool · {formatMeters(spacing)}m step</div>
	</header>

	<main class="metrics-main" class:is-diving={rs.phase === 'diving'}>
		<section class="hero-metrics" aria-label="Live dive metrics">
			<div class="hero-time">
				<span>{formatMs(elapsedMs)}</span>
				<small>elapsed</small>
			</div>
			<div class="hero-distance">
				<span>{formatMeters(distanceM)}m</span>
				<small>distance</small>
			</div>
		</section>

		<section class="target-panel" aria-label="Waypoint target">
			<div class="target-meta">
				<span>Target</span>
				<strong>{formatMeters(nextM)}m</strong>
			</div>
			<div class="secondary-metrics">
				<div><span>Speed</span><strong>{speedMs.toFixed(2)} m/s</strong></div>
				<div><span>Marks</span><strong>{waypointTapCount}</strong></div>
				<div><span>Lap</span><strong>{lapCount}</strong></div>
			</div>
		</section>

		{#if rs.autoAdvance}
			<div class="advance-banner" role="status">
				Skipped {formatMeters(rs.autoAdvance.fromDistanceM ?? nextM)}m → target {formatMeters(rs.autoAdvance.toDistanceM ?? nextM)}m
			</div>
		{/if}

		{#if pendingEndDiveAtPerfMs !== null && rs.phase === 'diving'}
			{@const pendingEndElapsedMs = diveElapsedMs(rs, pendingEndDiveAtPerfMs)}
			{@const pendingEndDistanceM = cumulativeDistanceM(rs, pendingEndDiveAtPerfMs)}
			<div class="end-confirm-layer">
				<div class="end-confirm-card" role="dialog" aria-modal="true" aria-labelledby="metrics-end-confirm-title">
					<h2 id="metrics-end-confirm-title">End dive?</h2>
					<div class="end-confirm-metrics" aria-label="Pending final dive metrics">
						<div class="end-confirm-time">{formatMs(pendingEndElapsedMs)}</div>
						<div class="end-confirm-distance">{formatMeters(pendingEndDistanceM)}m</div>
					</div>
					<div class="end-confirm-actions">
						<button class="end-confirm-button resume" type="button" onclick={resumeDiveAfterEndRequest}>Resume</button>
						<button class="end-confirm-button end" type="button" onclick={confirmEndDive}>Confirm End</button>
					</div>
				</div>
			</div>
		{/if}
	</main>

	<footer class="metrics-controls">
		{#if rs.phase === 'ready'}
			<button class="utility-button" type="button" onclick={cancel}>Cancel</button>
		{:else if rs.phase === 'prepping'}
			<button class="utility-button danger" type="button" onclick={stopTracking}>Stop</button>
		{/if}

		<div class="primary-row">
			{#if rs.phase === 'diving'}
				<button
					class="waypoint-step-button"
					type="button"
					aria-label="Previous waypoint distance"
					disabled={!canMoveWaypointBack}
					onclick={() => moveWaypointCursor(-1)}
				>
					&larr;
				</button>
			{/if}
			<button
				class="primary-action"
				class:action-ready={rs.phase === 'ready'}
				class:action-startDive={rs.phase === 'prepping'}
				class:action-waypoint={rs.phase === 'diving'}
				class:action-review={rs.phase === 'ended'}
				class:is-waypoint-locked={waypointTapLocked && rs.phase === 'diving'}
				class:is-held={endDiveHeld}
				type="button"
				onpointerdown={onPrimaryHoldStart}
				onpointerup={onPrimaryHoldEnd}
				onpointercancel={onPrimaryHoldEnd}
				onpointerleave={onPrimaryHoldEnd}
				oncontextmenu={(event) => event.preventDefault()}
				onclick={handlePrimaryAction}
			>
				<span class="btn-main">{primaryLabel()}</span>
				<span class="btn-sub">{primarySubLabel()}</span>
				{#if endDiveHeld}
					<span class="hold-progress" aria-hidden="true"></span>
				{/if}
			</button>
			{#if rs.phase === 'diving'}
				<button
					class="waypoint-step-button"
					type="button"
					aria-label="Next waypoint distance"
					onclick={() => moveWaypointCursor(1)}
				>
					&rarr;
				</button>
			{/if}
		</div>

		{#if rs.phase === 'diving' || rs.phase === 'ended'}
			{@const summary = summariseTimeline({
				...rs.timeline,
				diveEndMs: rs.timeline.diveStartMs + elapsedMs
			})}
			<div class="summary-line">
				Avg split {summary.avgSplitSeconds.toFixed(1)}s · Avg speed {summary.averageSpeedMs.toFixed(2)} m/s
			</div>
		{/if}
	</footer>
</div>

<style>
	.metrics-recorder {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: grid;
		grid-template-rows: auto 1fr auto;
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

	.metrics-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		min-height: 3.3rem;
	}

	.metrics-head div:first-child {
		display: grid;
		gap: 0.12rem;
	}

	.mode-label,
	.setup-pill,
	.hero-metrics small,
	.target-meta span,
	.secondary-metrics span {
		color: #94a3b8;
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.metrics-head strong {
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

	.metrics-main {
		display: grid;
		align-content: center;
		gap: 1.15rem;
		min-height: 0;
		padding: 0.75rem 0 1rem;
	}

	.hero-metrics {
		display: grid;
		gap: 0.75rem;
		text-align: center;
	}

	.hero-time,
	.hero-distance {
		display: grid;
		gap: 0.18rem;
	}

	.hero-time span,
	.hero-distance span {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-variant-numeric: tabular-nums;
		font-weight: 900;
		line-height: 0.95;
		letter-spacing: 0;
	}

	.hero-time span {
		font-size: clamp(3.4rem, 19vw, 6.6rem);
	}

	.hero-distance span {
		font-size: clamp(3rem, 17vw, 5.8rem);
		color: #f8fafc;
	}

	.target-panel {
		display: grid;
		gap: 0.75rem;
		padding: 0.95rem;
		border: 1px solid rgba(148, 163, 184, 0.14);
		border-radius: 8px;
		background: rgba(15, 23, 42, 0.62);
	}

	.target-meta {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
	}

	.target-meta strong {
		font-size: clamp(1.6rem, 8vw, 2.4rem);
		font-weight: 900;
		color: #5eead4;
	}

	.secondary-metrics {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.55rem;
	}

	.secondary-metrics div {
		display: grid;
		gap: 0.18rem;
		padding: 0.65rem 0.55rem;
		border-radius: 8px;
		background: rgba(2, 6, 23, 0.38);
		text-align: center;
	}

	.secondary-metrics strong {
		font-size: 0.95rem;
		font-weight: 850;
		color: #e2e8f0;
	}

	.advance-banner {
		justify-self: center;
		max-width: min(100%, 24rem);
		padding: 0.65rem 0.85rem;
		border-radius: 999px;
		background: rgba(234, 179, 8, 0.95);
		color: #1f2937;
		font-size: 0.86rem;
		font-weight: 800;
		text-align: center;
	}

	.metrics-controls {
		display: grid;
		gap: 0.7rem;
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

	.utility-button.danger {
		border-color: rgba(248, 113, 113, 0.34);
		background: rgba(127, 29, 29, 0.62);
		color: #fee2e2;
	}

	.primary-row {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 0.7rem;
		align-items: stretch;
	}

	.primary-row > .primary-action:first-child {
		grid-column: 1 / -1;
	}

	.primary-action,
	.waypoint-step-button {
		position: relative;
		min-height: clamp(6.4rem, 19vh, 9.5rem);
		border-radius: 8px;
		font: inherit;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
	}

	.primary-action {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.18rem;
		width: 100%;
		border: 2px solid rgba(255, 255, 255, 0.2);
		padding: 1rem;
		box-shadow: 0 18px 46px rgba(0, 0, 0, 0.35), inset 0 0 0 5px rgba(255, 255, 255, 0.08);
		font-weight: 900;
		overflow: hidden;
	}

	.primary-action:active:not(:disabled),
	.waypoint-step-button:active:not(:disabled) {
		transform: scale(0.97);
	}

	.primary-action.action-ready,
	.primary-action.action-startDive,
	.primary-action.action-review {
		background: #10b981;
		color: #052e25;
	}

	.primary-action.action-waypoint {
		min-height: clamp(8.6rem, 26vh, 12rem);
		background: var(--color-primary);
		color: #042f2e;
	}

	.primary-action.is-waypoint-locked {
		filter: saturate(0.8) brightness(0.88);
	}

	.primary-action.is-held {
		background: #b91c1c;
		color: #fff;
	}

	.btn-main,
	.btn-sub {
		position: relative;
		z-index: 1;
		text-align: center;
	}

	.btn-main {
		font-size: clamp(2rem, 11vw, 4.2rem);
		line-height: 0.95;
	}

	.btn-sub {
		font-size: clamp(0.95rem, 4vw, 1.2rem);
		font-weight: 650;
		opacity: 0.78;
	}

	.waypoint-step-button {
		width: clamp(4.2rem, 18vw, 5.8rem);
		border: 1px solid rgba(125, 211, 252, 0.28);
		background: rgba(8, 47, 73, 0.72);
		color: #e0f2fe;
		font-size: clamp(2.2rem, 10vw, 3.3rem);
		font-weight: 850;
		line-height: 1;
	}

	.waypoint-step-button:disabled {
		opacity: 0.4;
	}

	.summary-line {
		justify-self: center;
		padding: 0.35rem 0.6rem;
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.72);
		color: #cbd5e1;
		font-size: 0.8rem;
		text-align: center;
		white-space: nowrap;
	}

	.primary-action .hold-progress {
		position: absolute;
		inset: 0;
		background: rgba(255, 255, 255, 0.18);
		transform-origin: left center;
		animation: hold-fill 500ms linear forwards;
		pointer-events: none;
	}

	@keyframes hold-fill {
		from {
			transform: scaleX(0);
		}
		to {
			transform: scaleX(1);
		}
	}

	.end-confirm-layer {
		position: fixed;
		inset: 0;
		z-index: 8;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		background: rgba(2, 6, 23, 0.58);
	}

	.end-confirm-card {
		width: min(100%, 24rem);
		padding: 1.25rem;
		border: 1px solid rgba(226, 232, 240, 0.18);
		border-radius: 8px;
		background: rgba(15, 23, 42, 0.96);
		box-shadow: 0 22px 62px rgba(0, 0, 0, 0.44);
	}

	.end-confirm-card h2 {
		margin: 0;
		font-size: 1.25rem;
		text-align: center;
	}

	.end-confirm-metrics {
		display: grid;
		gap: 0.25rem;
		margin-top: 1rem;
		padding: 0.9rem;
		border: 1px solid rgba(20, 184, 166, 0.24);
		border-radius: 8px;
		background: rgba(8, 47, 73, 0.52);
		text-align: center;
	}

	.end-confirm-time {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: clamp(2rem, 11vw, 3.1rem);
		font-variant-numeric: tabular-nums;
		font-weight: 850;
		line-height: 1;
		color: #f8fafc;
	}

	.end-confirm-distance {
		font-size: clamp(1.35rem, 7vw, 2rem);
		font-weight: 850;
		line-height: 1.05;
		color: #5eead4;
	}

	.end-confirm-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		margin-top: 1.05rem;
	}

	.end-confirm-button {
		min-height: 3.25rem;
		border: 1px solid rgba(226, 232, 240, 0.18);
		border-radius: 8px;
		font: inherit;
		font-weight: 750;
	}

	.end-confirm-button.resume {
		background: rgba(8, 47, 73, 0.82);
		color: #e0f2fe;
	}

	.end-confirm-button.end {
		background: #ef4444;
		color: #fff;
	}

	@media (orientation: landscape) {
		.metrics-recorder {
			grid-template-columns: minmax(0, 1fr) minmax(20rem, 34vw);
			grid-template-rows: auto 1fr;
			column-gap: 1rem;
		}

		.metrics-head {
			grid-column: 1 / -1;
		}

		.metrics-main {
			align-content: center;
		}

		.metrics-controls {
			align-self: end;
		}

		.primary-action.action-waypoint {
			min-height: clamp(7rem, 42vh, 10rem);
		}

		.hero-time span {
			font-size: clamp(3rem, 9vw, 5rem);
		}

		.hero-distance span {
			font-size: clamp(2.6rem, 8vw, 4.4rem);
		}
	}
</style>