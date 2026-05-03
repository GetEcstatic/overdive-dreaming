<script lang="ts">
	import { page } from '$app/stores';
	import { onDestroy, onMount } from 'svelte';
	import { acquireCameraStream, stopStream, type AcquiredStream } from '$lib/capture/cameraStream';
	import { createRecorder } from '$lib/capture/recorder';
	import { bitrateForResolution, DEFAULT_VIDEO_QUALITY_PRESET } from '$lib/capture/videoQuality';
	import {
		probeWebCodecsSupport,
		type WebCodecsCapabilitySnapshot,
		type WebCodecsCodec
	} from '$lib/capture/webCodecsCapabilities';
	import {
		runWebCodecsVideoOnlySpike,
		type WebCodecsSpikeResult
	} from '$lib/capture/webCodecsSpike';

	type MediaRecorderSampleResult = {
		mimeType: string;
		sizeBytes: number;
		durationMs: number;
		actualAverageBitrateBps?: number;
	};

	const enabled = $derived($page.url.searchParams.get('enabled') === '1');
	const sampleDurationMs = 10_000;
	const sampleBitrateBps = bitrateForResolution('720p', DEFAULT_VIDEO_QUALITY_PRESET);

	let previewEl = $state<HTMLVideoElement | undefined>();
	let acquired = $state<AcquiredStream | null>(null);
	let capabilities = $state<WebCodecsCapabilitySnapshot | null>(null);
	let selectedCodec = $state<WebCodecsCodec>('h264');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let mediaRecorderResult = $state<MediaRecorderSampleResult | null>(null);
	let webCodecsResult = $state<WebCodecsSpikeResult | null>(null);

	function formatMbps(bitsPerSecond: number | undefined): string {
		if (!bitsPerSecond || bitsPerSecond <= 0) return 'Unknown';
		return `${(bitsPerSecond / 1_000_000).toFixed(1)} Mbps`;
	}

	function formatMegabytes(bytes: number): string {
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	$effect(() => {
		if (!previewEl) return;
		previewEl.srcObject = acquired?.stream ?? null;
	});

	onMount(() => {
		if (!enabled) return;
		probeWebCodecsSupport()
			.then((snapshot) => {
				capabilities = snapshot;
				if (snapshot.supportedCodecs.h264 !== 'supported' && snapshot.supportedCodecs.vp9 === 'supported') {
					selectedCodec = 'vp9';
				}
			})
			.catch((err) => {
				error = err instanceof Error ? err.message : String(err);
			});
	});

	onDestroy(() => {
		stopStream(acquired?.stream);
	});

	async function ensureCamera(): Promise<AcquiredStream> {
		if (acquired) return acquired;
		const next = await acquireCameraStream({ resolution: '720p', facingMode: 'environment', withAudio: true });
		acquired = next;
		return next;
	}

	async function startCamera(): Promise<void> {
		busy = true;
		error = null;
		try {
			await ensureCamera();
			await previewEl?.play().catch(() => undefined);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			busy = false;
		}
	}

	async function runMediaRecorderSample(): Promise<void> {
		busy = true;
		error = null;
		mediaRecorderResult = null;
		try {
			const camera = await ensureCamera();
			const recorder = createRecorder(camera.stream, {
				videoBitsPerSecond: sampleBitrateBps,
				timesliceMs: 1000
			});
			const startedAt = performance.now();
			recorder.start();
			await new Promise((resolve) => setTimeout(resolve, sampleDurationMs));
			const result = await recorder.stop();
			const durationMs = performance.now() - startedAt;
			mediaRecorderResult = {
				mimeType: result.mimeType,
				sizeBytes: result.sizeBytes,
				durationMs,
				actualAverageBitrateBps: Math.round((result.sizeBytes * 8 * 1000) / durationMs)
			};
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			busy = false;
		}
	}

	async function runWebCodecsSample(): Promise<void> {
		busy = true;
		error = null;
		webCodecsResult = null;
		try {
			const camera = await ensureCamera();
			webCodecsResult = await runWebCodecsVideoOnlySpike(camera.stream, {
				codec: selectedCodec,
				resolution: '720p',
				bitrateBps: sampleBitrateBps,
				durationMs: sampleDurationMs
			});
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>WebCodecs spike</title>
</svelte:head>

<div class="spike-screen">
	<div class="spike-inner">
		<header class="spike-head">
			<h1>WebCodecs spike</h1>
			<p>Dev-only video quality comparison. No files are uploaded or saved.</p>
		</header>

		{#if !enabled}
			<section class="card">
				<strong>Disabled</strong>
				<p>Add <code>?enabled=1</code> to the URL to run this local device spike.</p>
			</section>
		{:else}
			<section class="preview-card">
				<video bind:this={previewEl} muted playsinline></video>
			</section>

			<section class="card">
				<h2>Capabilities</h2>
				{#if capabilities}
					<div class="grid">
						<div><span>VideoEncoder</span><strong>{capabilities.hasVideoEncoder ? 'yes' : 'no'}</strong></div>
						<div><span>VideoFrame</span><strong>{capabilities.hasVideoFrame ? 'yes' : 'no'}</strong></div>
						<div><span>Track processor</span><strong>{capabilities.hasMediaStreamTrackProcessor ? 'yes' : 'no'}</strong></div>
						<div><span>Muxer need</span><strong>{capabilities.muxerStrategy}</strong></div>
						<div><span>H.264</span><strong>{capabilities.supportedCodecs.h264}</strong></div>
						<div><span>VP9</span><strong>{capabilities.supportedCodecs.vp9}</strong></div>
					</div>
				{:else}
					<p>Checking browser support…</p>
				{/if}
			</section>

			<section class="card">
				<h2>Samples</h2>
				<div class="segmented" role="radiogroup" aria-label="WebCodecs codec">
					{#each ['h264', 'vp9'] as codec}
						<button
							type="button"
							class="seg-btn"
							class:active={selectedCodec === codec}
							disabled={busy}
							onclick={() => (selectedCodec = codec as WebCodecsCodec)}
						>
							{codec.toUpperCase()}
						</button>
					{/each}
				</div>
				<div class="actions">
					<button class="btn btn-secondary" onclick={startCamera} disabled={busy}>Start camera</button>
					<button class="btn btn-primary" onclick={runMediaRecorderSample} disabled={busy}>MediaRecorder 10s</button>
					<button class="btn btn-primary" onclick={runWebCodecsSample} disabled={busy || !capabilities?.canAttemptVideoOnlySpike}>WebCodecs 10s</button>
				</div>
				<p class="hint">Both samples request {formatMbps(sampleBitrateBps)} at 720p/high.</p>
			</section>

			{#if mediaRecorderResult || webCodecsResult}
				<section class="card">
					<h2>Results</h2>
					{#if mediaRecorderResult}
						<div class="result-block">
							<strong>MediaRecorder</strong>
							<div class="grid">
								<div><span>Container</span><strong>{mediaRecorderResult.mimeType}</strong></div>
								<div><span>Size</span><strong>{formatMegabytes(mediaRecorderResult.sizeBytes)}</strong></div>
								<div><span>Actual avg</span><strong>{formatMbps(mediaRecorderResult.actualAverageBitrateBps)}</strong></div>
								<div><span>Duration</span><strong>{(mediaRecorderResult.durationMs / 1000).toFixed(1)} s</strong></div>
							</div>
						</div>
					{/if}
					{#if webCodecsResult}
						<div class="result-block">
							<strong>WebCodecs video-only</strong>
							<div class="grid">
								<div><span>Codec</span><strong>{webCodecsResult.codec}</strong></div>
								<div><span>Frames</span><strong>{webCodecsResult.sourceFrames} → {webCodecsResult.encodedChunks}</strong></div>
								<div><span>Bytes</span><strong>{formatMegabytes(webCodecsResult.encodedBytes)}</strong></div>
								<div><span>Queue max</span><strong>{webCodecsResult.maxEncodeQueueSize}</strong></div>
								<div><span>Late/dropped</span><strong>{webCodecsResult.droppedOrLateFrames}</strong></div>
								<div><span>Ended</span><strong>{webCodecsResult.endedBecause}</strong></div>
							</div>
						</div>
					{/if}
				</section>
			{/if}

			{#if error}
				<p class="error">{error}</p>
			{/if}
		{/if}
	</div>
</div>

<style>
	.spike-screen {
		min-height: 100vh;
		background: var(--color-bg);
		color: var(--color-text);
		padding: 1rem 1rem calc(2rem + env(safe-area-inset-bottom));
	}
	.spike-inner {
		max-width: 38rem;
		margin: 0 auto;
	}
	.spike-head h1 {
		margin: 0 0 0.25rem;
		font-size: 1.5rem;
	}
	.spike-head p,
	.hint {
		margin: 0 0 1rem;
		color: var(--color-text-muted);
		font-size: 0.9rem;
	}
	.card,
	.preview-card {
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.16);
		border-radius: 12px;
		padding: 1rem;
		margin-bottom: 1rem;
	}
	.preview-card {
		padding: 0;
		overflow: hidden;
		aspect-ratio: 16 / 9;
	}
	.preview-card video {
		width: 100%;
		height: 100%;
		object-fit: cover;
		background: #020617;
	}
	.card h2 {
		margin: 0 0 0.75rem;
		font-size: 1rem;
	}
	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem 1rem;
	}
	.grid span {
		display: block;
		color: var(--color-text-muted);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.grid strong {
		font-size: 0.9rem;
		word-break: break-word;
	}
	.segmented {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.4rem;
		margin-bottom: 0.8rem;
	}
	.seg-btn,
	.btn {
		font: inherit;
		border-radius: 10px;
		border: 1px solid rgba(148, 163, 184, 0.22);
		padding: 0.8rem;
		background: rgba(15, 23, 42, 0.65);
		color: var(--color-text);
	}
	.seg-btn.active {
		border-color: rgba(20, 184, 166, 0.55);
		color: var(--color-primary);
	}
	.actions {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.6rem;
	}
	.btn-primary {
		background: linear-gradient(90deg, var(--color-primary), var(--color-secondary));
		color: #0f172a;
		font-weight: 700;
	}
	.btn-secondary {
		color: var(--color-text-muted);
	}
	button:disabled {
		opacity: 0.5;
	}
	.result-block + .result-block {
		border-top: 1px solid rgba(148, 163, 184, 0.14);
		margin-top: 1rem;
		padding-top: 1rem;
	}
	.error {
		background: rgba(239, 68, 68, 0.15);
		border-radius: 10px;
		padding: 0.8rem;
		color: #fecaca;
	}
</style>