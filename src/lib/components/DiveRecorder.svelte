<!--
  DiveRecorder.svelte
  One-screen capture UI for a dynamic dive. See docs/Dynamic video feature.md.

  Flow:
    arming  → camera acquisition
    ready   → preview shown; "Start dive" arms the clock (recording starts too)
    diving  → waypoint button advances the timeline by one waypoint-spacing
              (= poolLength / waypointsPerLap); "Stop dive" ends the dive clock
              but keeps recording for the surface protocol.
    surface → dive is over but the MediaRecorder keeps running. "Stop recording"
              finalises and emits the capture result.
-->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		acquireCameraStream,
		ensurePortraitStream,
		stopStream,
		type AcquiredStream,
		type EnsuredPortraitStream
	} from '$lib/capture/cameraStream';
	import { createRecorder, type RecorderHandle } from '$lib/capture/recorder';
	import { requestWakeLock, type WakeLockHandle } from '$lib/capture/wakeLock';
	import {
		appendLap,
		createEmptyTimeline,
		finalizeTimeline,
		removeLastLap,
		summariseTimeline
	} from '$lib/capture/timeline';
	import type { DiveTimeline, DiveVideoDiscipline, DiveVideoResolution } from '$lib/types';

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
		onCapture: (result: CaptureResult) => void;
		onCancel?: () => void;
	}

	let {
		poolLength,
		waypointsPerLap = 2,
		resolution = '720p',
		discipline = 'DYN',
		onCapture,
		onCancel
	}: Props = $props();

	type Phase = 'arming' | 'ready' | 'diving' | 'surface' | 'stopping' | 'error';

	let phase = $state<Phase>('arming');
	let errorMessage = $state<string | null>(null);

	let videoEl: HTMLVideoElement;
	let acquired: AcquiredStream | null = null;
	let portraitStream: EnsuredPortraitStream | null = null;
	let recorder: RecorderHandle | null = null;
	let wakeLock: WakeLockHandle | null = null;

	// Debug overlay state (visible on-device so we can verify orientation
	// handling without needing DevTools).
	let debugSourceW = $state(0);
	let debugSourceH = $state(0);
	let debugPortraitW = $state(0);
	let debugPortraitH = $state(0);
	let debugRotated = $state(false);
	let debugRecorderTrackW = $state(0);
	let debugRecorderTrackH = $state(0);

	// Meters added per waypoint tap. For a 50 m pool with 2 waypoints per lap
	// this is 25 m; for a 25 m pool with 2 waypoints per lap this is 12.5 m.
	const waypointSpacing = $derived(
		waypointsPerLap > 0 ? poolLength / waypointsPerLap : poolLength
	);

	// Clocks — monotonic, relative to the MediaRecorder start.
	let recordingStartedAtPerfMs = 0;
	let diveEndPerfMs = 0; // set when the user taps Stop dive

	let timeline = $state<DiveTimeline>(createEmptyTimeline(0));

	// Display tick.
	let nowMs = $state(0);
	let tickHandle: number | null = null;

	const diveElapsedMs = $derived.by(() => {
		if (phase === 'diving') return Math.max(0, nowMs - recordingStartedAtPerfMs);
		if (phase === 'surface' || phase === 'stopping')
			return Math.max(0, diveEndPerfMs - recordingStartedAtPerfMs);
		return 0;
	});
	const waypointCount = $derived(timeline.laps.length);
	const nextWaypointDistanceM = $derived((waypointCount + 1) * waypointSpacing);

	// Live speed. Defaults to 1 m/s before the first waypoint so the HUD isn't
	// stuck at 0 m/s while the diver is still accelerating.
	const liveSpeedMs = $derived.by(() => {
		if (phase !== 'diving' && phase !== 'surface' && phase !== 'stopping') return 0;
		if (waypointCount === 0) return 1;
		const last = timeline.laps[waypointCount - 1];
		if (last.splitMs <= 0) return 0;
		return waypointSpacing / (last.splitMs / 1000);
	});

	// Interpolated cumulative distance. Starts incrementing from dive-start at the
	// live speed (default 1 m/s) so the HUD doesn't sit at 0 m until the first
	// waypoint tap. After a waypoint, we snap to the exact waypoint distance and
	// continue interpolating from there using the last measured split speed.
	// Capped at the next waypoint target so the diver's distance doesn't
	// visibly "jump back" when they tap a late waypoint.
	const cumulativeDistanceM = $derived.by(() => {
		if (waypointCount > 0 && phase !== 'diving') {
			return timeline.laps[waypointCount - 1].cumulativeDistanceM;
		}
		if (phase !== 'diving') return 0;
		const lastLap = waypointCount === 0 ? null : timeline.laps[waypointCount - 1];
		const baseDistance = lastLap?.cumulativeDistanceM ?? 0;
		const baseAtMs = lastLap?.atMs ?? 0;
		const elapsedSinceBaseMs = Math.max(0, nowMs - recordingStartedAtPerfMs - baseAtMs);
		const speed = liveSpeedMs > 0 ? liveSpeedMs : 1;
		const interpolated = baseDistance + (elapsedSinceBaseMs / 1000) * speed;
		return Math.min(interpolated, nextWaypointDistanceM);
	});

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
		phase = 'arming';
		errorMessage = null;
		try {
			acquired = await acquireCameraStream({ resolution, facingMode: 'environment' });
			debugSourceW = acquired.actualWidth;
			debugSourceH = acquired.actualHeight;
			if (videoEl) {
				videoEl.srcObject = acquired.stream;
				await videoEl.play().catch(() => undefined);
			}
			phase = 'ready';
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : String(err);
			phase = 'error';
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

	/** "Start dive": begin MediaRecorder AND the dive clock at the same instant. */
	async function startDive(): Promise<void> {
		if (phase !== 'ready' || !acquired) return;
		try {
			wakeLock = await requestWakeLock();
			// Ensure the stream we hand to MediaRecorder is portrait, even if
			// the browser gave us a landscape stream from getUserMedia. This
			// means the saved file is natively portrait — no playback-side
			// rotation or container-side cropping required.
			portraitStream = await ensurePortraitStream(acquired);
			debugPortraitW = portraitStream.portraitWidth;
			debugPortraitH = portraitStream.portraitHeight;
			debugRotated = portraitStream.rotated;
			const recTrack = portraitStream.stream.getVideoTracks()[0];
			const recSettings = recTrack?.getSettings() ?? {};
			debugRecorderTrackW = recSettings.width ?? 0;
			debugRecorderTrackH = recSettings.height ?? 0;
			const bitrate = resolution === '1080p' ? 5_000_000 : 3_000_000;
			recorder = createRecorder(portraitStream.stream, {
				videoBitsPerSecond: bitrate,
				timesliceMs: 2000
			});
			recordingStartedAtPerfMs = performance.now();
			timeline = createEmptyTimeline(0);
			recorder.start();
			phase = 'diving';
			startTicking();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : String(err);
			phase = 'error';
		}
	}

	function markWaypoint(): void {
		if (phase !== 'diving') return;
		const atMs = performance.now() - recordingStartedAtPerfMs;
		timeline = appendLap(timeline, atMs, waypointSpacing);
	}

	function undoWaypoint(): void {
		if (phase !== 'diving') return;
		timeline = removeLastLap(timeline);
	}

	/** Stop dive: freeze clock + distance, keep camera rolling for surface protocol. */
	function stopDive(): void {
		if (phase !== 'diving') return;
		diveEndPerfMs = performance.now();
		timeline = finalizeTimeline(timeline, diveEndPerfMs - recordingStartedAtPerfMs);
		phase = 'surface';
	}

	/** Stop recording: finalise MediaRecorder and emit capture. */
	async function stopRecording(): Promise<void> {
		if (phase !== 'diving' && phase !== 'surface') return;
		if (!recorder) return;
		if (phase === 'diving') {
			diveEndPerfMs = performance.now();
			timeline = finalizeTimeline(timeline, diveEndPerfMs - recordingStartedAtPerfMs);
		}

		phase = 'stopping';
		stopTicking();
		try {
			const result = await recorder.stop();
			const recordingEndPerfMs = performance.now();
			const durationSeconds = (recordingEndPerfMs - recordingStartedAtPerfMs) / 1000;
			const settings = acquired?.stream.getVideoTracks()[0]?.getSettings() ?? {};

			// Prefer the portrait pipeline's dimensions when it rotated the
			// source; otherwise use the raw track settings (which are already
			// portrait).
			const widthPx =
				portraitStream?.rotated && portraitStream.portraitWidth > 0
					? portraitStream.portraitWidth
					: (settings.width ?? acquired?.actualWidth ?? 0);
			const heightPx =
				portraitStream?.rotated && portraitStream.portraitHeight > 0
					? portraitStream.portraitHeight
					: (settings.height ?? acquired?.actualHeight ?? 0);

			onCapture({
				blob: result.blob,
				mimeType: result.mimeType,
				sizeBytes: result.sizeBytes,
				widthPx,
				heightPx,
				durationSeconds,
				deviceLabel: acquired?.deviceLabel,
				timeline
			});
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : String(err);
			phase = 'error';
		} finally {
			cleanup();
		}
	}

	function cleanup(): void {
		if (wakeLock) {
			wakeLock.release().catch(() => undefined);
			wakeLock = null;
		}
		if (portraitStream) {
			portraitStream.release();
			portraitStream = null;
		}
		if (acquired) {
			stopStream(acquired.stream);
			acquired = null;
		}
		stopTicking();
	}

	onMount(() => {
		void arm();
	});

	onDestroy(() => {
		cleanup();
	});

	function cancel(): void {
		cleanup();
		onCancel?.();
	}
</script>

<div class="recorder">
	<!-- Camera preview: full bleed, native aspect ratio. -->
	<div class="preview">
		<!-- svelte-ignore a11y_media_has_caption -->
		<video bind:this={videoEl} muted playsinline autoplay></video>

		<!-- Top HUD -->
		<div class="hud hud-top">
			<div class="hud-row">
				<div class="hud-cell">
					<div class="hud-label">Time</div>
					<div class="hud-value">{formatMs(diveElapsedMs)}</div>
				</div>
				<div class="hud-cell right">
					<div class="hud-label">Distance</div>
					<div class="hud-value">{formatMeters(cumulativeDistanceM)} m</div>
				</div>
			</div>
			<div class="hud-sub">
				<span>
					{#if phase === 'diving' || phase === 'surface' || phase === 'stopping'}
						Waypoint {waypointCount}
					{:else}
						{discipline} · Pool {poolLength} m
					{/if}
				</span>
				<span>
					{#if phase === 'diving'}
						{liveSpeedMs.toFixed(2)} m/s
					{:else if phase === 'surface'}
						Surface protocol
					{:else}
						{waypointsPerLap} waypoints/lap · step {formatMeters(waypointSpacing)} m
					{/if}
				</span>
			</div>
		</div>

		{#if phase === 'arming'}
			<div class="overlay">
				<span>Arming camera…</span>
			</div>
		{/if}

		<!-- Orientation debug overlay (temporary — remove once verified). -->
		{#if phase !== 'arming' && phase !== 'error'}
			<div class="debug-overlay">
				<div>src {debugSourceW}×{debugSourceH}</div>
				{#if debugPortraitW > 0}
					<div>rec {debugPortraitW}×{debugPortraitH} rot={debugRotated ? 'Y' : 'N'}</div>
					<div>trk {debugRecorderTrackW}×{debugRecorderTrackH}</div>
				{/if}
			</div>
		{/if}

		{#if phase === 'error' && errorMessage}
			<div class="overlay error">
				<p>{errorMessage}</p>
				<button class="btn btn-primary" onclick={arm}>Retry</button>
			</div>
		{/if}
	</div>

	<!-- Controls -->
	<div class="controls">
		{#if phase === 'ready'}
			<div class="row">
				<button class="btn btn-secondary" onclick={cancel}>Cancel</button>
				<button class="btn btn-record" onclick={startDive}>● Start dive</button>
			</div>
			<p class="hint">Press <strong>Start dive</strong> when the diver leaves the wall.</p>
		{:else if phase === 'diving'}
			<div class="row">
				<button
					class="btn btn-secondary small"
					onclick={undoWaypoint}
					disabled={waypointCount === 0}
				>
					Undo
				</button>
				<button class="btn btn-primary big" onclick={markWaypoint}>
					<span class="btn-main">Waypoint {waypointCount + 1}</span>
					<span class="btn-sub">at {formatMeters(nextWaypointDistanceM)} m</span>
				</button>
				<button class="btn btn-danger small" onclick={stopDive}>Stop dive</button>
			</div>
		{:else if phase === 'surface'}
			<div class="row">
				<button class="btn btn-danger big" onclick={stopRecording}>■ Stop recording</button>
			</div>
			<p class="hint">
				Dive clock stopped at <strong>{formatMs(diveElapsedMs)}</strong>. Keep the camera on
				the diver for the surface protocol, then tap <strong>Stop recording</strong>.
			</p>
		{:else if phase === 'stopping'}
			<div class="center-msg">Finalising recording…</div>
		{:else}
			<div class="center-msg">Preparing camera…</div>
		{/if}

		{#if phase === 'diving' || phase === 'surface'}
			{@const summary = summariseTimeline({ ...timeline, diveEndMs: diveElapsedMs })}
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

	.debug-overlay {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		z-index: 20;
		padding: 0.35rem 0.5rem;
		border-radius: 8px;
		background: rgba(0, 0, 0, 0.6);
		color: #fef3c7;
		font: 600 0.7rem/1.15 ui-monospace, SFMono-Regular, Menlo, monospace;
		text-align: right;
		pointer-events: none;
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
	}
	.btn:active:not(:disabled) {
		transform: scale(0.97);
	}
	.btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.btn.small {
		min-width: 96px;
		flex: 0 0 auto;
		padding: 0.85rem 0.6rem;
		font-size: 0.9rem;
	}
	.btn.big {
		flex: 1 1 auto;
		min-height: 84px;
		font-size: 1.15rem;
		font-weight: 700;
	}

	.btn-primary {
		background: var(--color-primary);
		color: #0f172a;
		flex: 1 1 auto;
		font-weight: 700;
		font-size: 1.1rem;
	}
	.btn-primary:hover {
		filter: brightness(1.05);
	}
	.btn-primary .btn-main {
		font-size: 1.2rem;
		line-height: 1.1;
	}
	.btn-primary .btn-sub {
		font-size: 0.85rem;
		font-weight: 500;
		color: #0f172a;
		opacity: 0.8;
	}

	.btn-secondary {
		background: #1e293b;
		color: var(--color-text);
		flex: 1 1 auto;
		font-weight: 600;
	}
	.btn-secondary:hover {
		background: #273244;
	}

	.btn-danger {
		background: #ef4444;
		color: #fff;
		font-weight: 700;
	}
	.btn-danger:hover {
		filter: brightness(1.05);
	}

	.btn-record {
		background: #ef4444;
		color: #fff;
		flex: 2 1 auto;
		font-size: 1.15rem;
		font-weight: 700;
		min-height: 72px;
	}
	.btn-record:hover {
		filter: brightness(1.05);
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
</style>
