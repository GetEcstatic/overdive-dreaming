<!--
  DiveRecorder.svelte
  One-screen capture UI for a dynamic dive. See docs/Dynamic video feature.md.

  Responsibilities:
    - Acquire portrait camera stream (rear-facing).
    - Lock screen orientation to portrait + request Wake Lock.
    - Start MediaRecorder on "GO"; build a DiveTimeline on LAP taps.
    - STOP finalises timeline; emits { blob, mimeType, timeline, size, width, height, duration, deviceLabel }.

  Consumers drive `poolLength`, `resolution`, and handle the resulting capture
  via the `onCapture` callback.
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
		resolution?: DiveVideoResolution;
		plannedReps?: number;
		discipline?: DiveVideoDiscipline;
		onCapture: (result: CaptureResult) => void;
		onCancel?: () => void;
	}

	let {
		poolLength,
		resolution = '720p',
		plannedReps = 0,
		discipline = 'DYN',
		onCapture,
		onCancel
	}: Props = $props();

	type Phase = 'idle' | 'arming' | 'ready' | 'recording' | 'stopping' | 'error';

	let phase = $state<Phase>('idle');
	let errorMessage = $state<string | null>(null);

	let videoEl: HTMLVideoElement;
	let acquired: AcquiredStream | null = null;
	let recorder: RecorderHandle | null = null;
	let wakeLock: WakeLockHandle | null = null;

	// When the camera sensor delivers a landscape stream but the device is held
	// in portrait (typical on iOS Safari where screen.orientation.lock() is not
	// supported), we rotate the preview with CSS so the diver looks upright.
	let needsRotation = $state(false);
	let containerW = $state(0);
	let containerH = $state(0);

	function onVideoLoaded(): void {
		if (!videoEl) return;
		const vw = videoEl.videoWidth;
		const vh = videoEl.videoHeight;
		if (vw > 0 && vh > 0) {
			const streamIsLandscape = vw > vh;
			const deviceIsPortrait =
				typeof window !== 'undefined' ? window.innerHeight >= window.innerWidth : true;
			needsRotation = streamIsLandscape && deviceIsPortrait;
		}
	}

	// Timeline clock uses performance.now() so it stays monotonic.
	let recordingStartedAtPerfMs = 0;
	let recordingStartedAtWallMs = 0;
	let timeline = $state<DiveTimeline>(createEmptyTimeline(0));

	// Display tick — drives the live timer readout at ~10 Hz.
	let nowMs = $state(0);
	let tickHandle: number | null = null;

	const elapsedMs = $derived(
		phase === 'recording' ? Math.max(0, nowMs - recordingStartedAtPerfMs) : 0
	);
	const lapCount = $derived(timeline.laps.length);
	const cumulativeDistanceM = $derived(
		lapCount === 0 ? 0 : timeline.laps[lapCount - 1].cumulativeDistanceM
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

	async function lockPortrait(): Promise<void> {
		try {
			const orientation = (screen.orientation as unknown as {
				lock?: (o: string) => Promise<void>;
			}) ?? null;
			if (orientation && typeof orientation.lock === 'function') {
				await orientation.lock('portrait');
			}
		} catch {
			// Non-fatal: iOS Safari doesn't support lock, but the UI still works.
		}
	}

	function unlockPortrait(): void {
		try {
			const orientation = screen.orientation as unknown as { unlock?: () => void };
			orientation?.unlock?.();
		} catch {
			/* ignore */
		}
	}

	async function arm(): Promise<void> {
		if (phase !== 'idle') return;
		phase = 'arming';
		errorMessage = null;
		try {
			await lockPortrait();
			acquired = await acquireCameraStream({ resolution, facingMode: 'environment' });
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

	async function start(): Promise<void> {
		if (phase !== 'ready' || !acquired) return;
		try {
			wakeLock = await requestWakeLock();
			const bitrate = resolution === '1080p' ? 5_000_000 : 3_000_000;
			recorder = createRecorder(acquired.stream, {
				videoBitsPerSecond: bitrate,
				timesliceMs: 2000
			});
			recordingStartedAtPerfMs = performance.now();
			recordingStartedAtWallMs = Date.now();
			timeline = createEmptyTimeline(0); // ms offsets from recording start
			recorder.start();
			phase = 'recording';
			startTicking();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : String(err);
			phase = 'error';
		}
	}

	function markLap(): void {
		if (phase !== 'recording') return;
		const atMs = performance.now() - recordingStartedAtPerfMs;
		timeline = appendLap(timeline, atMs, poolLength);
	}

	function undoLap(): void {
		if (phase !== 'recording') return;
		timeline = removeLastLap(timeline);
	}

	async function stop(): Promise<void> {
		if (phase !== 'recording' || !recorder) return;
		phase = 'stopping';
		stopTicking();
		try {
			const result = await recorder.stop();
			const endMs = performance.now() - recordingStartedAtPerfMs;
			const finalTimeline = finalizeTimeline(timeline, endMs);
			timeline = finalTimeline;

			const settings = acquired?.stream.getVideoTracks()[0]?.getSettings() ?? {};
			const durationSeconds = endMs / 1000;

			onCapture({
				blob: result.blob,
				mimeType: result.mimeType,
				sizeBytes: result.sizeBytes,
				widthPx: settings.width ?? acquired?.actualWidth ?? 0,
				heightPx: settings.height ?? acquired?.actualHeight ?? 0,
				durationSeconds,
				deviceLabel: acquired?.deviceLabel,
				timeline: finalTimeline
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
		if (acquired) {
			stopStream(acquired.stream);
			acquired = null;
		}
		unlockPortrait();
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

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const _unused = recordingStartedAtWallMs; // keep reference for debugging; lint-safe
</script>

<div class="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white">
	<!-- Camera preview -->
	<div
		class="relative flex-1 overflow-hidden"
		bind:clientWidth={containerW}
		bind:clientHeight={containerH}
	>
		<!-- svelte-ignore a11y_media_has_caption -->
		<video
			bind:this={videoEl}
			class="absolute left-1/2 top-1/2 object-cover"
			style:width={needsRotation ? `${containerH}px` : '100%'}
			style:height={needsRotation ? `${containerW}px` : '100%'}
			style:transform={needsRotation
				? 'translate(-50%, -50%) rotate(90deg)'
				: 'translate(-50%, -50%)'}
			muted
			playsinline
			autoplay
			onloadedmetadata={onVideoLoaded}
		></video>

		<!-- Top HUD: always visible so the coach sees discipline + pool info -->
		<div
			class="pointer-events-none absolute inset-x-0 top-4 mx-4 rounded-xl bg-black/55 px-4 py-3 backdrop-blur-sm"
		>
			<div class="flex items-center justify-between">
				<div>
					<div class="text-xs uppercase tracking-wider text-slate-300">Time</div>
					<div class="font-mono text-3xl tabular-nums">
						{phase === 'recording' ? formatMs(elapsedMs) : '00:00.0'}
					</div>
				</div>
				<div class="text-right">
					<div class="text-xs uppercase tracking-wider text-slate-300">Distance</div>
					<div class="font-mono text-3xl tabular-nums">{cumulativeDistanceM} m</div>
				</div>
			</div>
			<div class="mt-1 flex items-center justify-between text-sm text-slate-300">
				<span>
					Lap {lapCount}{plannedReps > 0 ? ` of ${plannedReps}` : ''}
				</span>
				<span>{discipline} · Pool {poolLength} m</span>
			</div>
		</div>

		{#if phase === 'arming'}
			<div class="absolute inset-0 flex items-center justify-center">
				<span class="text-sm text-slate-300">Arming camera…</span>
			</div>
		{/if}

		{#if phase === 'error' && errorMessage}
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950/80 p-6 text-center">
				<p class="text-red-300">{errorMessage}</p>
				<button
					class="rounded-full bg-teal-400 px-6 py-3 text-base font-semibold text-slate-900"
					onclick={arm}
				>
					Retry
				</button>
			</div>
		{/if}
	</div>

	<!-- Controls -->
	<div class="shrink-0 border-t border-slate-800 bg-slate-950/95 p-4 pb-8">
		{#if phase === 'ready'}
			<div class="flex items-center gap-3">
				<button
					class="h-16 flex-1 rounded-2xl bg-slate-800 text-base font-semibold text-slate-200 active:scale-95"
					onclick={cancel}
				>
					Cancel
				</button>
				<button
					class="h-20 flex-2 rounded-2xl bg-red-500 text-xl font-bold text-white shadow-lg active:scale-95"
					onclick={start}
				>
					GO
				</button>
			</div>
			<p class="mt-3 text-center text-xs text-slate-400">
				Press GO when the diver leaves the wall.
			</p>
		{:else if phase === 'recording'}
			<div class="flex items-stretch gap-3">
				<button
					class="h-20 w-24 rounded-2xl bg-slate-800 text-sm font-semibold text-slate-200 active:scale-95 disabled:opacity-40"
					onclick={undoLap}
					disabled={lapCount === 0}
				>
					Undo
				</button>
				<button
					class="h-20 flex-1 rounded-2xl bg-teal-400 text-2xl font-bold text-slate-900 shadow-lg active:scale-95"
					onclick={markLap}
				>
					LAP
				</button>
				<button
					class="h-20 w-24 rounded-2xl bg-red-500 text-base font-semibold text-white active:scale-95"
					onclick={stop}
				>
					STOP
				</button>
			</div>
		{:else if phase === 'stopping'}
			<div class="py-4 text-center text-slate-300">Finalising recording…</div>
		{:else}
			<div class="py-4 text-center text-slate-400">Preparing camera…</div>
		{/if}

		{#if phase === 'recording'}
			{@const summary = summariseTimeline({ ...timeline, diveEndMs: elapsedMs })}
			<div class="mt-3 text-center text-xs text-slate-400">
				Avg split {summary.avgSplitSeconds.toFixed(1)}s · Avg speed
				{summary.averageSpeedMs.toFixed(2)} m/s
			</div>
		{/if}
	</div>
</div>

<style>
	/* (styles reserved for future tweaks) */
</style>
