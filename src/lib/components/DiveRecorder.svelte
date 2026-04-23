<!--
  DiveRecorder.svelte
  One-screen capture UI for a dynamic dive. See
  docs/DYNAMIC_RECORDER_UX_PLAN.md for the data-oriented architecture.

  This component is a THIN VIEW over the pure `recorderReducer` in
  `$lib/capture/recorderState.ts`. All phase logic, timeline math, and
  auto-advance detection live in pure functions; side effects (camera,
  MediaRecorder, wake lock, RAF ticks) are handled here and dispatched
  back into the reducer as events.
-->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		acquireCameraStream,
		stopStream,
		type AcquiredStream
	} from '$lib/capture/cameraStream';
	import { createRecorder, type RecorderHandle } from '$lib/capture/recorder';
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
		buttonLayout,
		cumulativeDistanceM,
		diveElapsedMs,
		liveSpeedMs,
		nextTapKind,
		nextWaypointM,
		shouldAutoAdvance,
		waypointCount,
		type ButtonSpec
	} from '$lib/capture/recorderSelectors';
	import type {
		DiveTimeline,
		DiveVideoDiscipline,
		DiveVideoResolution
	} from '$lib/types';

	interface CaptureResult {
		blob: Blob;
		mimeType: string;
		sizeBytes: number;
		widthPx: number;
		heightPx: number;
		durationSeconds: number;
		deviceLabel?: string;
		timeline: DiveTimeline;
	}

	interface Props {
		poolLength: number;
		waypointsPerLap?: number;
		resolution?: DiveVideoResolution;
		discipline?: DiveVideoDiscipline;
		autoAdvanceThresholdM?: number;
		onCapture: (result: CaptureResult) => void;
		onCancel?: () => void;
	}

	let {
		poolLength,
		waypointsPerLap = 2,
		resolution = '720p',
		discipline = 'DYN',
		autoAdvanceThresholdM = 10,
		onCapture,
		onCancel
	}: Props = $props();

	const config: RecorderConfig = {
		poolLengthM: poolLength,
		waypointsPerLap,
		discipline,
		resolution,
		autoAdvanceThresholdM
	};

	let rs: RecorderState = $state(initialRecorderState(config));
	function dispatch(event: RecorderEvent): void {
		rs = recorderReducer(rs, event);
	}

	// Imperative handles (edges of the system).
	let videoEl: HTMLVideoElement;
	let acquired: AcquiredStream | null = null;
	let recorder: RecorderHandle | null = null;
	let wakeLock: WakeLockHandle | null = null;

	let nowMs = $state(0);
	let tickHandle: number | null = null;
	let bannerClearHandle: ReturnType<typeof setTimeout> | null = null;

	const layout = $derived(buttonLayout(rs));
	const elapsedMs = $derived(diveElapsedMs(rs, nowMs));
	const distanceM = $derived(cumulativeDistanceM(rs, nowMs));
	const speedMs = $derived(liveSpeedMs(rs));
	const nextM = $derived(nextWaypointM(rs));
	const lapCount = $derived(waypointCount(rs));
	const spacing = $derived(waypointSpacingM(rs.config));

	function formatMs(ms: number): string {
		const totalSecs = Math.floor(ms / 1000);
		const mm = Math.floor(totalSecs / 60)
			.toString()
			.padStart(2, '0');
		const ss = (totalSecs % 60).toString().padStart(2, '0');
		const tenths = Math.floor((ms % 1000) / 100);
		return `${mm}:${ss}.${tenths}`;
	}

	function formatMeters(m: number): string {
		return Number.isInteger(m) ? `${m}` : m.toFixed(1);
	}

	async function arm(): Promise<void> {
		dispatch({ type: 'arm/started' });
		try {
			acquired = await acquireCameraStream({
				resolution,
				facingMode: 'environment'
			});
			if (videoEl) {
				videoEl.srcObject = acquired.stream;
				await videoEl.play().catch(() => undefined);
			}
			dispatch({ type: 'arm/succeeded' });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			dispatch({ type: 'arm/failed', message });
		}
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

	async function onPressRecord(): Promise<void> {
		if (rs.phase !== 'ready' || !acquired) return;
		try {
			wakeLock = await requestWakeLock();
			const bitrate = resolution === '1080p' ? 5_000_000 : 3_000_000;
			recorder = createRecorder(acquired.stream, {
				videoBitsPerSecond: bitrate,
				timesliceMs: 2000
			});
			recorder.start();
			dispatch({ type: 'recording/started', atPerfMs: performance.now() });
			startTicking();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			dispatch({ type: 'error/raised', message });
		}
	}

	function onPressStartDive(): void {
		dispatch({ type: 'dive/started', atPerfMs: performance.now() });
	}

	function onPressWaypoint(): void {
		// Smart-button classification (§9.4.1b): route to wall/tapped or
		// split/tapped based on the next expected tap. Wall beats split
		// whenever the live interpolation has already reached the next
		// wall minus half-a-split tolerance — this is how the system
		// self-heals from a missed split.
		const kind = nextTapKind(rs);
		const atPerfMs = performance.now();
		if (kind === 'wall') {
			dispatch({ type: 'wall/tapped', atPerfMs });
		} else {
			// Split expected — but if the diver has already drifted past
			// the next wall (indicated by the auto-advance banner), snap
			// to the wall instead.
			const interp = cumulativeDistanceM(rs, atPerfMs);
			const wallM =
				(rs.timeline.laps.length + 1) * rs.config.poolLengthM;
			const spacing = waypointSpacingM(rs.config);
			if (interp >= wallM - spacing / 2) {
				dispatch({ type: 'wall/tapped', atPerfMs });
			} else {
				dispatch({ type: 'split/tapped', atPerfMs });
			}
		}
	}

	function onPressUndo(): void {
		dispatch({ type: 'waypoint/undone' });
	}

	function onPressEndDive(): void {
		dispatch({ type: 'dive/ended', atPerfMs: performance.now() });
	}

	async function onPressStopRecording(): Promise<void> {
		if (!recorder) return;
		if (rs.phase === 'diving') {
			dispatch({ type: 'dive/ended', atPerfMs: performance.now() });
		}
		dispatch({ type: 'recording/stopping' });
		stopTicking();
		try {
			const result = await recorder.stop();
			const recordingEndPerfMs = performance.now();
			const durationSeconds =
				(recordingEndPerfMs - rs.clocks.recordingStartedPerfMs) / 1000;
			const settings = acquired?.stream.getVideoTracks()[0]?.getSettings() ?? {};
			const widthPx = settings.width ?? acquired?.actualWidth ?? 0;
			const heightPx = settings.height ?? acquired?.actualHeight ?? 0;

			const finalTimeline: DiveTimeline =
				rs.clocks.diveEndedPerfMs > 0
					? finalizeTimeline(
							rs.timeline,
							rs.clocks.diveEndedPerfMs -
								rs.clocks.recordingStartedPerfMs
						)
					: rs.timeline;

			onCapture({
				blob: result.blob,
				mimeType: result.mimeType,
				sizeBytes: result.sizeBytes,
				widthPx,
				heightPx,
				durationSeconds,
				deviceLabel: acquired?.deviceLabel,
				timeline: finalTimeline
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			dispatch({ type: 'error/raised', message });
		} finally {
			cleanup();
		}
	}

	function handleButton(btn: ButtonSpec): void {
		if (btn.disabled) return;
		switch (btn.kind) {
			case 'cancel':
				cancel();
				return;
			case 'record':
				void onPressRecord();
				return;
			case 'stopRecording':
				void onPressStopRecording();
				return;
			case 'startDive':
				onPressStartDive();
				return;
			case 'waypoint':
				onPressWaypoint();
				return;
			case 'undoWaypoint':
				onPressUndo();
				return;
			case 'endDive':
				onPressEndDive();
				return;
		}
	}

	function cleanup(): void {
		if (wakeLock) {
			wakeLock.release().catch(() => undefined);
			wakeLock = null;
		}
		if (acquired) {
			stopStream(acquired.stream);
			acquired = null;
		}
		stopTicking();
		if (bannerClearHandle) {
			clearTimeout(bannerClearHandle);
			bannerClearHandle = null;
		}
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

	$effect(() => {
		if (rs.autoAdvance && !bannerClearHandle) {
			bannerClearHandle = setTimeout(() => {
				bannerClearHandle = null;
				dispatch({ type: 'banner/cleared' });
			}, 2000);
		}
	});

	onMount(() => {
		const updateOrientation = () => {
			if (typeof window === 'undefined') return;
			dispatch({
				type: 'orientation/changed',
				isLandscape: window.innerWidth >= window.innerHeight
			});
		};
		updateOrientation();
		window.addEventListener('resize', updateOrientation);
		window.addEventListener('orientationchange', updateOrientation);
		void arm();
		return () => {
			window.removeEventListener('resize', updateOrientation);
			window.removeEventListener('orientationchange', updateOrientation);
		};
	});

	onDestroy(() => {
		cleanup();
	});
</script>

<div class="recorder">
	<div class="preview">
		<!-- svelte-ignore a11y_media_has_caption -->
		<video bind:this={videoEl} muted playsinline autoplay></video>

		<div class="hud hud-top">
			<div class="hud-row">
				<div class="hud-cell">
					<div class="hud-label">Time</div>
					<div class="hud-value">{formatMs(elapsedMs)}</div>
				</div>
				<div class="hud-cell right">
					<div class="hud-label">Distance</div>
					<div class="hud-value">{formatMeters(distanceM)} m</div>
				</div>
			</div>
			<div class="hud-sub">
				<span>
					{#if rs.phase === 'diving' || rs.phase === 'ended' || rs.phase === 'stopping'}
						Waypoint {lapCount} · next {formatMeters(nextM)} m
					{:else if rs.phase === 'prepping'}
						● Recording — breathe-up
					{:else}
						{discipline} · Pool {poolLength} m
					{/if}
				</span>
				<span>
					{#if rs.phase === 'diving'}
						{speedMs.toFixed(2)} m/s
					{:else if rs.phase === 'ended'}
						Surface protocol
					{:else if rs.phase === 'prepping'}
						Tap “Start dive” when leaving the wall
					{:else}
						{waypointsPerLap} waypoints/lap · step {formatMeters(spacing)} m
					{/if}
				</span>
			</div>
		</div>

		{#if rs.autoAdvance}
			<div class="toast" role="status">
				Auto-advanced waypoint — tap Undo if that's wrong
			</div>
		{/if}

		{#if rs.phase === 'arming'}
			<div class="overlay">
				<span>Arming camera…</span>
			</div>
		{/if}

		{#if !rs.isLandscape && rs.phase !== 'arming' && rs.phase !== 'error'}
			<div class="overlay orientation">
				<span class="rotate-icon" aria-hidden="true">⟳</span>
				<p>Rotate your phone to landscape to record.</p>
			</div>
		{/if}

		{#if rs.phase === 'error' && rs.errorMessage}
			<div class="overlay error">
				<p>{rs.errorMessage}</p>
				<button class="btn btn-primary" onclick={arm}>Retry</button>
			</div>
		{/if}
	</div>

	<div class="controls">
		{#if rs.phase === 'stopping'}
			<div class="center-msg">Finalising recording…</div>
		{:else if layout.buttons.length === 0}
			<div class="center-msg">Preparing camera…</div>
		{:else}
			<div class="row">
				{#each layout.buttons as btn (btn.kind)}
					<button
						class="btn btn-{btn.kind} w-{btn.weight}"
						class:is-disabled={btn.disabled}
						disabled={btn.disabled}
						onclick={() => handleButton(btn)}
					>
						<span class="btn-main">{btn.label}</span>
						{#if btn.sub}
							<span class="btn-sub">{btn.sub}</span>
						{/if}
					</button>
				{/each}
			</div>
			{#if layout.hint}
				<p class="hint">{layout.hint}</p>
			{/if}
		{/if}

		{#if rs.phase === 'diving' || rs.phase === 'ended'}
			{@const summary = summariseTimeline({
				...rs.timeline,
				diveEndMs: rs.timeline.diveStartMs + elapsedMs
			})}
			<div class="summary-line">
				Avg split {summary.avgSplitSeconds.toFixed(1)}s · Avg speed
				{summary.averageSpeedMs.toFixed(2)} m/s
			</div>
		{/if}
	</div>
</div>

<style>
	.recorder {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		flex-direction: column;
		background: #000;
		color: var(--color-text);
	}

	.preview {
		position: relative;
		flex: 1 1 auto;
		overflow: hidden;
		background: #000;
	}
	.preview video {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.hud {
		position: absolute;
		left: 0.75rem;
		right: 0.75rem;
		padding: 0.65rem 0.9rem;
		border-radius: 14px;
		background: rgba(15, 23, 42, 0.55);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		color: #f1f5f9;
		pointer-events: none;
	}
	.hud-top {
		top: max(0.75rem, env(safe-area-inset-top));
	}
	.hud-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 1rem;
	}
	.hud-cell.right {
		text-align: right;
	}
	.hud-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #cbd5e1;
	}
	.hud-value {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 1.75rem;
		font-variant-numeric: tabular-nums;
		line-height: 1.1;
	}
	.hud-sub {
		display: flex;
		justify-content: space-between;
		color: #cbd5e1;
		font-size: 0.8rem;
		margin-top: 0.25rem;
	}

	.toast {
		position: absolute;
		left: 50%;
		bottom: 1rem;
		transform: translateX(-50%);
		background: rgba(234, 179, 8, 0.95);
		color: #1f2937;
		padding: 0.45rem 0.8rem;
		border-radius: 999px;
		font-size: 0.85rem;
		font-weight: 600;
		pointer-events: none;
		z-index: 5;
	}

	.overlay {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		padding: 1.5rem;
		background: rgba(15, 23, 42, 0.75);
		color: var(--color-text);
	}
	.overlay.error p {
		color: #fca5a5;
		text-align: center;
	}
	.overlay.orientation {
		background: rgba(15, 23, 42, 0.92);
		gap: 0.75rem;
	}
	.overlay.orientation p {
		text-align: center;
		max-width: 28ch;
	}
	.rotate-icon {
		font-size: 2.5rem;
		line-height: 1;
		animation: rotateHint 1.8s ease-in-out infinite;
		display: inline-block;
	}
	@keyframes rotateHint {
		0%, 100% { transform: rotate(0deg); }
		50% { transform: rotate(-90deg); }
	}

	.controls {
		flex: 0 0 auto;
		background: rgba(15, 23, 42, 0.95);
		border-top: 1px solid rgba(148, 163, 184, 0.15);
		padding: 0.9rem 0.9rem calc(1.25rem + env(safe-area-inset-bottom));
	}
	.row {
		display: flex;
		align-items: stretch;
		gap: 0.6rem;
	}

	.btn {
		font: inherit;
		border: 1px solid transparent;
		border-radius: 14px;
		padding: 0.95rem 1rem;
		cursor: pointer;
		transition:
			transform 0.06s ease,
			filter 0.12s ease;
		min-height: 64px;
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.1rem;
		color: #fff;
		font-weight: 600;
	}
	.btn:active:not(:disabled) {
		transform: scale(0.97);
	}
	.btn:disabled,
	.btn.is-disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.btn.w-1 { flex: 0 0 auto; min-width: 96px; padding: 0.85rem 0.6rem; font-size: 0.9rem; }
	.btn.w-2 { flex: 1 1 auto; }
	.btn.w-3 { flex: 2 1 auto; min-height: 84px; font-size: 1.15rem; font-weight: 700; }

	.btn.btn-cancel,
	.btn.btn-undoWaypoint {
		background: #1e293b;
		color: var(--color-text);
	}
	.btn.btn-cancel:hover,
	.btn.btn-undoWaypoint:hover {
		background: #273244;
	}
	.btn.btn-record,
	.btn.btn-stopRecording,
	.btn.btn-endDive {
		background: #ef4444;
	}
	.btn.btn-startDive {
		background: #10b981;
		color: #0f172a;
		font-weight: 700;
	}
	.btn.btn-waypoint {
		background: var(--color-primary);
		color: #0f172a;
		font-weight: 700;
	}
	.btn-main {
		font-size: 1.1rem;
		line-height: 1.1;
	}
	.btn-sub {
		font-size: 0.85rem;
		font-weight: 500;
		opacity: 0.8;
	}

	.hint {
		margin: 0.6rem 0 0;
		text-align: center;
		color: var(--color-text-muted);
		font-size: 0.85rem;
	}
	.center-msg {
		padding: 1rem 0;
		text-align: center;
		color: var(--color-text-muted);
	}
	.summary-line {
		margin-top: 0.6rem;
		text-align: center;
		color: var(--color-text-muted);
		font-size: 0.8rem;
	}

	@media (orientation: landscape) {
		.recorder {
			flex-direction: row;
		}
		.controls {
			width: min(32vw, 280px);
			border-top: none;
			border-left: 1px solid rgba(148, 163, 184, 0.15);
			padding: calc(0.9rem + env(safe-area-inset-top)) 0.9rem
				calc(0.9rem + env(safe-area-inset-bottom))
				calc(0.9rem + env(safe-area-inset-right));
			overflow-y: auto;
		}
		.row {
			flex-direction: column;
		}
		.btn,
		.btn.w-1,
		.btn.w-2,
		.btn.w-3 {
			min-height: 56px;
			width: 100%;
			padding: 0.65rem 0.75rem;
			font-size: 1rem;
			min-width: 0;
		}
		.btn.w-3 {
			min-height: 68px;
			font-size: 1.05rem;
		}
		.hud {
			left: 0.5rem;
			right: auto;
			max-width: 60%;
			padding: 0.45rem 0.7rem;
		}
		.hud-value {
			font-size: 1.25rem;
		}
		.hud-label {
			font-size: 0.6rem;
		}
		.hud-sub {
			font-size: 0.7rem;
		}
		.hint,
		.summary-line,
		.center-msg {
			font-size: 0.75rem;
		}
	}
</style>
