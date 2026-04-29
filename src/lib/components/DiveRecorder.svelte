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
		isExactDeviceFailure,
		stopStream,
		type AcquiredStream
	} from '$lib/capture/cameraStream';
	import CameraSelector from '$lib/components/CameraSelector.svelte';
	import {
		AUTO_REAR_CAMERA,
		cameraPreferenceLabel,
		classifyCameraLabel,
		enumerateCameraDevices,
		type CameraDeviceOption
	} from '$lib/capture/cameraDevices';
	import { createRecorder, type RecorderHandle } from '$lib/capture/recorder';
	import { requestWakeLock, type WakeLockHandle } from '$lib/capture/wakeLock';
	import { finalizeTimeline, summariseTimeline } from '$lib/capture/timeline';
	import {
		decideDisplayOrientation,
		posturefromViewport,
		readViewportSnapshot
	} from '$lib/capture/orientation';
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
		CameraFacing,
		CameraPreference,
		DiveTimeline,
		DiveVideoCapturePosture,
		DiveVideoDiscipline,
		DiveVideoDisplayOrientation,
		DiveVideoResolution,
		DiveVideoRotation
	} from '$lib/types';

	interface CaptureResult {
		blob: Blob;
		mimeType: string;
		sizeBytes: number;
		widthPx: number;
		heightPx: number;
		durationSeconds: number;
		deviceLabel?: string;
		cameraDeviceId?: string;
		cameraPreference: CameraPreference;
		cameraFacing?: CameraFacing;
		timeline: DiveTimeline;
		capturePosture: DiveVideoCapturePosture;
		displayOrientation: DiveVideoDisplayOrientation;
		displayRotationDeg: DiveVideoRotation;
	}

	interface Props {
		poolLength: number;
		waypointsPerLap?: number;
		resolution?: DiveVideoResolution;
		discipline?: DiveVideoDiscipline;
		cameraPreference?: CameraPreference;
		autoAdvanceThresholdM?: number;
		onCapture: (result: CaptureResult) => void;
		onCancel?: () => void;
		onCameraPreferenceResolved?: (preference: CameraPreference) => void;
	}

	let {
		poolLength,
		waypointsPerLap = 2,
		resolution = '720p',
		discipline = 'DYN',
		cameraPreference = AUTO_REAR_CAMERA,
		autoAdvanceThresholdM = 10,
		onCapture,
		onCancel,
		onCameraPreferenceResolved
	}: Props = $props();

	function initialCameraPreference(): CameraPreference {
		return cameraPreference;
	}

	function initialConfig(): RecorderConfig {
		return {
			poolLengthM: poolLength,
			waypointsPerLap,
			discipline,
			resolution,
			autoAdvanceThresholdM,
			cameraPreference: selectedCamera
		};
	}

	let selectedCamera = $state<CameraPreference>(initialCameraPreference());
	let cameraOptions = $state<CameraDeviceOption[]>([]);
	let showCameraSheet = $state(false);
	let cameraMessage = $state<string | null>(null);

	let rs: RecorderState = $state(initialRecorderState(initialConfig()));
	function dispatch(event: RecorderEvent): void {
		rs = recorderReducer(rs, event);
	}

	// Imperative handles (edges of the system).
	let videoEl: HTMLVideoElement;
	let acquired = $state<AcquiredStream | null>(null);
	let recorder: RecorderHandle | null = null;
	let wakeLock: WakeLockHandle | null = null;

	// Captured at the moment recording starts so that orientation
	// metadata reflects the actual phone posture and not whatever the
	// user does later (rotating to review the clip, etc.).
	let capturePosture: DiveVideoCapturePosture = 'unknown';

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
	const activeCameraLabel = $derived(
		acquired?.deviceLabel
			? classifyCameraLabel(acquired.deviceLabel).displayLabel
			: cameraPreferenceLabel(selectedCamera)
	);

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

	async function refreshCameraOptions(): Promise<void> {
		try {
			cameraOptions = await enumerateCameraDevices();
		} catch {
			cameraOptions = [];
		}
	}

	async function acquireForPreference(
		preference: CameraPreference
	): Promise<{ stream: AcquiredStream; preference: CameraPreference; message?: string }> {
		try {
			const stream = await acquireCameraStream({
				resolution,
				facingMode: 'environment',
				deviceId: preference.kind === 'device' ? preference.deviceId : undefined
			});
			return { stream, preference };
		} catch (err) {
			if (preference.kind === 'device' && isExactDeviceFailure(err)) {
				const stream = await acquireCameraStream({
					resolution,
					facingMode: 'environment'
				});
				return {
					stream,
					preference: AUTO_REAR_CAMERA,
					message: 'Using Auto rear instead'
				};
			}
			throw err;
		}
	}

	async function bindAcquiredStream(stream: AcquiredStream): Promise<void> {
		if (videoEl) {
			videoEl.srcObject = stream.stream;
			await videoEl.play().catch(() => undefined);
		}
	}

	async function arm(preference: CameraPreference = selectedCamera): Promise<void> {
		dispatch({ type: 'arm/started' });
		try {
			const previous = acquired;
			const result = await acquireForPreference(preference);
			acquired = result.stream;
			selectedCamera = result.preference;
			rs = recorderReducer(rs, {
				type: 'config/updated',
				patch: { cameraPreference: result.preference }
			});
			await bindAcquiredStream(acquired);
			stopStream(previous?.stream);
			cameraMessage = result.message ?? null;
			onCameraPreferenceResolved?.(result.preference);
			await refreshCameraOptions();
			dispatch({ type: 'arm/succeeded' });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			dispatch({ type: 'arm/failed', message });
		}
	}

	async function switchCamera(preference: CameraPreference): Promise<void> {
		if (rs.phase !== 'ready') return;
		showCameraSheet = false;
		await arm(preference);
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
			capturePosture = posturefromViewport(readViewportSnapshot());
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
		vibrate(kind === 'wall' ? 30 : 15);
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

	// ---- Haptics -----------------------------------------------------------
	// Tiny helper around navigator.vibrate. No-op on browsers without the
	// Vibration API (desktop, iOS Safari).
	function vibrate(pattern: number | number[]): void {
		if (typeof navigator === 'undefined') return;
		const nav = navigator as Navigator & {
			vibrate?: (p: number | number[]) => boolean;
		};
		if (typeof nav.vibrate !== 'function') return;
		try {
			if (Array.isArray(pattern)) nav.vibrate(pattern);
			else nav.vibrate(pattern);
		} catch {
			/* ignore */
		}
	}

	// ---- Tap-and-hold End-dive ---------------------------------------------
	// End-dive is destructive (commits the dive's duration), so we require
	// the coach to press-and-hold for 500 ms before it fires. A short tap
	// does nothing. Haptics: short pulse on hold-start, long pattern on
	// confirm.
	const END_DIVE_HOLD_MS = 500;
	let endDiveHoldHandle: ReturnType<typeof setTimeout> | null = null;
	let endDiveHeld = $state(false);

	function onEndDiveHoldStart(ev: PointerEvent): void {
		if (rs.phase !== 'diving') return;
		ev.preventDefault();
		const target = ev.currentTarget as HTMLElement | null;
		if (target && typeof target.setPointerCapture === 'function') {
			try {
				target.setPointerCapture(ev.pointerId);
			} catch {
				/* ignore — some browsers reject */
			}
		}
		endDiveHeld = true;
		vibrate(20);
		endDiveHoldHandle = setTimeout(() => {
			endDiveHoldHandle = null;
			endDiveHeld = false;
			vibrate([50, 60, 150]);
			onPressEndDive();
		}, END_DIVE_HOLD_MS);
	}

	function onEndDiveHoldEnd(): void {
		if (endDiveHoldHandle !== null) {
			clearTimeout(endDiveHoldHandle);
			endDiveHoldHandle = null;
		}
		endDiveHeld = false;
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

			const assetOrientation = widthPx >= heightPx ? 'landscape' : 'portrait';
			const { displayOrientation, displayRotationDeg } = decideDisplayOrientation({
				assetOrientation,
				capturePosture
			});

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
				cameraDeviceId: acquired?.deviceId,
				cameraPreference: selectedCamera,
				cameraFacing: acquired?.facingMode,
				timeline: finalTimeline,
				capturePosture,
				displayOrientation,
				displayRotationDeg
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

	// 1 Hz sample recorder — writes a (atMs, distanceM, speedMs) point
	// every ~1000 ms while diving so analytics can draw a smooth speed
	// curve without relying on wall/split taps alone.
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

		<div class="camera-control">
			{#if rs.phase === 'ready'}
				<button class="camera-pill" type="button" onclick={() => (showCameraSheet = true)}>
					{activeCameraLabel}
				</button>
			{:else if rs.phase !== 'arming' && rs.phase !== 'error'}
				<div class="camera-pill readonly">{activeCameraLabel}</div>
			{/if}
			{#if cameraMessage && rs.phase === 'ready'}
				<div class="camera-message">{cameraMessage}</div>
			{/if}
		</div>

		{#if rs.autoAdvance}
			<div class="toast" role="status">
				Looks like the diver passed a wall — tap Waypoint to snap to the
				next wall.
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
				<button class="btn btn-primary" onclick={() => arm()}>Retry</button>
			</div>
		{/if}

		{#if showCameraSheet && rs.phase === 'ready'}
			<div class="sheet-layer">
				<button
					type="button"
					class="sheet-backdrop"
					aria-label="Close camera selector"
					onclick={() => (showCameraSheet = false)}
				></button>
				<div
					class="camera-sheet"
					role="dialog"
					aria-modal="true"
					aria-labelledby="camera-sheet-title"
				>
					<div class="sheet-header">
						<h2 id="camera-sheet-title">Camera</h2>
						<button type="button" class="sheet-close" onclick={() => (showCameraSheet = false)}>
							×
						</button>
					</div>
					<CameraSelector
						bind:value={selectedCamera}
						options={cameraOptions}
						activeDeviceId={acquired?.deviceId}
						compact
						onChange={switchCamera}
					/>
				</div>
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
					{#if btn.kind === 'endDive' && rs.phase === 'diving'}
						<button
							class="btn btn-{btn.kind} w-{btn.weight}"
							class:is-held={endDiveHeld}
							class:is-disabled={btn.disabled}
							disabled={btn.disabled}
							onpointerdown={onEndDiveHoldStart}
							onpointerup={onEndDiveHoldEnd}
							onpointercancel={onEndDiveHoldEnd}
							onpointerleave={onEndDiveHoldEnd}
							aria-label="Hold to end dive"
						>
							<span class="btn-main">
								{endDiveHeld ? 'Hold…' : btn.label}
							</span>
							<span class="btn-sub">
								{endDiveHeld ? 'keep holding' : 'hold 0.5s'}
							</span>
							{#if endDiveHeld}
								<span class="hold-progress" aria-hidden="true"></span>
							{/if}
						</button>
					{:else}
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
					{/if}
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
	.camera-control {
		position: absolute;
		top: max(0.75rem, env(safe-area-inset-top));
		right: max(0.75rem, env(safe-area-inset-right));
		z-index: 4;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.25rem;
	}
	.camera-pill {
		max-width: 12rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		border: 1px solid rgba(20, 184, 166, 0.4);
		border-radius: 999px;
		padding: 0.28rem 0.55rem;
		background: rgba(15, 23, 42, 0.82);
		color: #d1fae5;
		font: inherit;
		font-size: 0.72rem;
		font-weight: 650;
		pointer-events: auto;
	}
	.camera-pill.readonly {
		pointer-events: none;
		opacity: 0.75;
	}
	.camera-message {
		color: #fef3c7;
		font-size: 0.72rem;
		text-align: right;
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
	.sheet-layer {
		position: absolute;
		inset: 0;
		z-index: 12;
		display: flex;
		align-items: flex-end;
		justify-content: center;
	}
	.sheet-backdrop {
		position: absolute;
		inset: 0;
		width: 100%;
		border: 0;
		padding: 0;
		background: rgba(2, 6, 23, 0.55);
		cursor: default;
	}
	.camera-sheet {
		position: relative;
		z-index: 1;
		width: min(100%, 28rem);
		max-height: min(80vh, 34rem);
		overflow-y: auto;
		padding: 1rem;
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 12px 12px 0 0;
		background: rgba(15, 23, 42, 0.98);
		box-shadow: 0 -18px 40px rgba(0, 0, 0, 0.35);
	}
	.sheet-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.8rem;
	}
	.sheet-header h2 {
		margin: 0;
		font-size: 1rem;
	}
	.sheet-close {
		width: 2.2rem;
		height: 2.2rem;
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.85);
		color: var(--color-text);
		font: inherit;
		font-size: 1.2rem;
		cursor: pointer;
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
	/* Hold-to-end-dive progress affordance. */
	.btn.btn-endDive {
		position: relative;
		overflow: hidden;
	}
	.btn.btn-endDive.is-held {
		background: #b91c1c;
	}
	.btn.btn-endDive .hold-progress {
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
		.camera-control {
			top: max(0.5rem, env(safe-area-inset-top));
			right: 0.5rem;
		}
		.camera-pill {
			font-size: 0.64rem;
			max-width: 9rem;
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
