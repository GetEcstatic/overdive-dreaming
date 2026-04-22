<!--
  DiveVideoPlayer.svelte
  In-app playback of a clean DiveVideo with a DOM HUD overlay driven by the
  stored DiveTimeline. See docs/Dynamic video feature.md §5 (Option D).

  Uses `requestVideoFrameCallback` where available to stay frame-accurate;
  falls back to `timeupdate` on platforms that don't support it.

  The HUD can be toggled on/off during replay. When on, the Download action
  re-encodes the clip with the HUD burned into each frame via an offscreen
  canvas + MediaRecorder pipeline so it survives export to Photos / share
  sheets.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { DiveTimeline, DiveVideo } from '$lib/types';
	import {
		distanceAt,
		speedAt,
		summariseTimeline,
		totalTimeMs
	} from '$lib/capture/timeline';

	interface Props {
		video: DiveVideo;
		/** Pre-resolved Storage download URL for the clean video. */
		srcUrl: string;
	}

	let { video, srcUrl }: Props = $props();

	let videoEl: HTMLVideoElement | undefined = $state();
	let currentMs = $state(0);
	let rvfcHandle: number | null = null;

	let showOverlay = $state(true);

	const timeline: DiveTimeline = $derived(video.timeline);
	const poolLength: number = $derived(video.poolLength);

	// Live overlay values.
	const elapsedMs = $derived(Math.max(0, currentMs));
	const distance = $derived(distanceAt(timeline, elapsedMs, poolLength));
	const speed = $derived(speedAt(timeline, elapsedMs, poolLength));

	// Lap count shown = laps already completed by this time.
	const lapsCompleted = $derived(timeline.laps.filter((l) => l.atMs <= elapsedMs).length);

	const totalDurationMs = $derived(totalTimeMs(timeline) || video.durationSeconds * 1000);
	const summary = $derived(summariseTimeline(timeline));

	function formatMs(ms: number): string {
		const secs = Math.floor(ms / 1000);
		const mm = Math.floor(secs / 60).toString().padStart(2, '0');
		const ss = (secs % 60).toString().padStart(2, '0');
		const tenths = Math.floor((ms % 1000) / 100);
		return `${mm}:${ss}.${tenths}`;
	}

	type VideoWithRvfc = HTMLVideoElement & {
		requestVideoFrameCallback?: (
			cb: (now: number, metadata: { mediaTime: number }) => void
		) => number;
		cancelVideoFrameCallback?: (handle: number) => void;
	};

	function scheduleRvfc(el: VideoWithRvfc): void {
		if (typeof el.requestVideoFrameCallback !== 'function') return;
		rvfcHandle = el.requestVideoFrameCallback((_now, metadata) => {
			currentMs = metadata.mediaTime * 1000;
			scheduleRvfc(el);
		});
	}

	function onTimeUpdate(): void {
		if (!videoEl) return;
		// Fallback when rVFC isn't available.
		if (rvfcHandle === null) {
			currentMs = videoEl.currentTime * 1000;
		}
	}

	onDestroy(() => {
		if (videoEl && rvfcHandle !== null) {
			const el = videoEl as VideoWithRvfc;
			el.cancelVideoFrameCallback?.(rvfcHandle);
		}
	});

	// -----------------------------------------------------------------------
	// Download-to-Photos: `navigator.share({ files })` with `<a download>`
	// fallback. See docs/Dynamic video feature.md §7 and QA checklist.
	// When `showOverlay` is true, the clip is re-rendered through a canvas
	// so the HUD is burned into every exported frame.
	// -----------------------------------------------------------------------
	let downloadError = $state<string | null>(null);
	let downloading = $state(false);
	let exportProgress = $state(0); // 0..1 while baking

	function fileExtensionFromMime(mime: string): string {
		if (mime.includes('mp4')) return 'mp4';
		if (mime.includes('webm')) return 'webm';
		return 'bin';
	}

	function suggestedFileName(mime: string, withOverlay: boolean): string {
		const stamp = video.recordedAt?.toDate?.().toISOString?.().replace(/[:.]/g, '-') ?? 'dive';
		const tag = withOverlay ? 'overlay' : 'clean';
		return `overdive-${video.discipline}-${tag}-${stamp}.${fileExtensionFromMime(mime)}`;
	}

	async function fetchBlob(): Promise<Blob> {
		const res = await fetch(srcUrl);
		if (!res.ok) throw new Error(`Download failed (${res.status})`);
		return await res.blob();
	}

	/**
	 * Render the source clip through an offscreen canvas with the HUD drawn
	 * on top of each frame, producing a new video blob.
	 *
	 * Notes:
	 *  - iOS Safari will not play a <video> element that isn't attached to
	 *    the DOM, so we append a hidden off-DOM element.
	 *  - `crossOrigin = 'anonymous'` must be set BEFORE `src` so the video
	 *    request is CORS; otherwise the canvas becomes tainted and
	 *    `canvas.captureStream()` + MediaRecorder will silently produce an
	 *    empty blob.
	 */
	async function renderWithOverlay(): Promise<{ blob: Blob; mime: string }> {
		const off = document.createElement('video');
		off.crossOrigin = 'anonymous';
		off.muted = true;
		off.playsInline = true;
		off.preload = 'auto';
		off.setAttribute('playsinline', '');
		off.setAttribute('webkit-playsinline', '');
		off.style.position = 'fixed';
		off.style.left = '-9999px';
		off.style.top = '0';
		off.style.width = '2px';
		off.style.height = '2px';
		off.style.opacity = '0';
		off.style.pointerEvents = 'none';
		document.body.appendChild(off);
		off.src = srcUrl;

		try {
			await new Promise<void>((resolve, reject) => {
				const onMeta = () => {
					off.removeEventListener('loadedmetadata', onMeta);
					off.removeEventListener('error', onErr);
					resolve();
				};
				const onErr = () => {
					off.removeEventListener('loadedmetadata', onMeta);
					off.removeEventListener('error', onErr);
					reject(new Error('Failed to load source video for re-encode'));
				};
				off.addEventListener('loadedmetadata', onMeta);
				off.addEventListener('error', onErr);
			});

			const w = off.videoWidth || video.widthPx || 1280;
			const h = off.videoHeight || video.heightPx || 720;

			const canvas = document.createElement('canvas');
			canvas.width = w;
			canvas.height = h;
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('Canvas 2D context unavailable');

			// Pick a supported mime. Prefer mp4 (iOS/Safari native); fall back to webm.
			const candidates = [
				'video/mp4;codecs=avc1.42E01E',
				'video/mp4',
				'video/webm;codecs=vp9',
				'video/webm;codecs=vp8',
				'video/webm'
			];
			const mimeType = candidates.find(
				(m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)
			);
			if (!mimeType) throw new Error('No supported MediaRecorder mime type');

			const stream = canvas.captureStream(30);
			const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
			const chunks: Blob[] = [];
			recorder.ondataavailable = (e) => {
				if (e.data && e.data.size > 0) chunks.push(e.data);
			};

			const durationMs = (off.duration || video.durationSeconds || 0) * 1000;

			const offR = off as VideoWithRvfc;
			const useRvfc = typeof offR.requestVideoFrameCallback === 'function';

			let finished = false;

			const drawFrame = (atMs: number): void => {
				ctx.drawImage(off, 0, 0, w, h);
				drawHud(ctx, w, h, atMs);
				if (durationMs > 0) {
					exportProgress = Math.min(1, atMs / durationMs);
				}
			};

			const onFrame = (_now: number, meta: { mediaTime: number }) => {
				if (finished) return;
				drawFrame(meta.mediaTime * 1000);
				offR.requestVideoFrameCallback?.(onFrame);
			};

			let rafId = 0;
			const rafLoop = () => {
				if (finished) return;
				drawFrame(off.currentTime * 1000);
				rafId = requestAnimationFrame(rafLoop);
			};

			const stopPromise = new Promise<Blob>((resolve, reject) => {
				recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
				recorder.onerror = (e) =>
					reject(
						new Error(
							`MediaRecorder error: ${(e as ErrorEvent).message ?? 'unknown'}`
						)
					);
			});

			const endPromise = new Promise<void>((resolve) => {
				off.addEventListener('ended', () => resolve(), { once: true });
			});

			// Hard safety: if the video somehow never ends (iOS quirks), bail
			// after duration × 2 + 5s.
			const timeoutMs = Math.max(10_000, durationMs * 2 + 5000);
			const timeoutPromise = new Promise<void>((resolve) => {
				setTimeout(resolve, timeoutMs);
			});

			recorder.start(250);
			if (useRvfc) {
				offR.requestVideoFrameCallback?.(onFrame);
			} else {
				rafId = requestAnimationFrame(rafLoop);
			}
			// Draw the first frame immediately so we never record a 0-duration
			// clip even if play() is slow to start.
			drawFrame(0);

			const playPromise = off.play();
			if (playPromise) {
				try {
					await playPromise;
				} catch (err) {
					throw new Error(
						`Couldn't play source video for re-encode: ${
							err instanceof Error ? err.message : String(err)
						}`
					);
				}
			}

			await Promise.race([endPromise, timeoutPromise]);
			finished = true;
			if (rafId) cancelAnimationFrame(rafId);

			// Give the recorder a tick to flush the final frame.
			await new Promise((r) => setTimeout(r, 150));
			if (recorder.state !== 'inactive') recorder.stop();
			const blob = await stopPromise;

			if (blob.size === 0) {
				throw new Error(
					'Exported clip was empty. On iOS this usually means the canvas pipeline was blocked — please try with "Show overlay" turned off.'
				);
			}

			return { blob, mime: mimeType };
		} finally {
			off.pause();
			off.removeAttribute('src');
			off.load();
			off.remove();
		}
	}

	function drawHud(
		ctx: CanvasRenderingContext2D,
		w: number,
		h: number,
		atMs: number
	): void {
		const dist = distanceAt(timeline, atMs, poolLength);
		const spd = speedAt(timeline, atMs, poolLength);
		const laps = timeline.laps.filter((l) => l.atMs <= atMs).length;

		// Scale HUD sizes with the canvas so text reads well at any resolution.
		const pad = Math.round(w * 0.025);
		const boxW = w - pad * 2;
		const boxH = Math.round(h * 0.16);
		const boxX = pad;
		const boxY = pad;
		const radius = Math.round(boxH * 0.12);

		ctx.save();
		ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
		roundRect(ctx, boxX, boxY, boxW, boxH, radius);
		ctx.fill();

		const labelSize = Math.round(boxH * 0.15);
		const valueSize = Math.round(boxH * 0.38);
		const subSize = Math.round(boxH * 0.17);

		ctx.fillStyle = '#cbd5e1';
		ctx.font = `600 ${labelSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
		ctx.textBaseline = 'top';

		const innerX = boxX + Math.round(boxW * 0.04);
		const innerY = boxY + Math.round(boxH * 0.12);

		ctx.textAlign = 'left';
		ctx.fillText('TIME', innerX, innerY);
		ctx.textAlign = 'right';
		ctx.fillText('DISTANCE', boxX + boxW - Math.round(boxW * 0.04), innerY);

		ctx.fillStyle = '#f8fafc';
		ctx.font = `700 ${valueSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
		ctx.textAlign = 'left';
		ctx.fillText(formatMs(atMs), innerX, innerY + labelSize + Math.round(boxH * 0.03));
		ctx.textAlign = 'right';
		ctx.fillText(
			`${dist.toFixed(1)} m`,
			boxX + boxW - Math.round(boxW * 0.04),
			innerY + labelSize + Math.round(boxH * 0.03)
		);

		ctx.fillStyle = '#cbd5e1';
		ctx.font = `500 ${subSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
		const subY = innerY + labelSize + valueSize + Math.round(boxH * 0.08);
		ctx.textAlign = 'left';
		ctx.fillText(`Lap ${laps}/${timeline.laps.length}`, innerX, subY);
		ctx.textAlign = 'right';
		ctx.fillText(
			`${spd.toFixed(2)} m/s`,
			boxX + boxW - Math.round(boxW * 0.04),
			subY
		);
		ctx.restore();
	}

	function roundRect(
		ctx: CanvasRenderingContext2D,
		x: number,
		y: number,
		w: number,
		h: number,
		r: number
	): void {
		const radius = Math.min(r, w / 2, h / 2);
		ctx.beginPath();
		ctx.moveTo(x + radius, y);
		ctx.arcTo(x + w, y, x + w, y + h, radius);
		ctx.arcTo(x + w, y + h, x, y + h, radius);
		ctx.arcTo(x, y + h, x, y, radius);
		ctx.arcTo(x, y, x + w, y, radius);
		ctx.closePath();
	}

	async function downloadToPhotos(): Promise<void> {
		if (downloading) return;
		downloading = true;
		downloadError = null;
		exportProgress = 0;
		try {
			let blob: Blob;
			let mime: string;
			if (showOverlay) {
				const baked = await renderWithOverlay();
				blob = baked.blob;
				mime = baked.mime;
			} else {
				blob = await fetchBlob();
				mime = video.mimeType;
			}
			const fileName = suggestedFileName(mime, showOverlay);
			const file = new File([blob], fileName, { type: mime });

			const nav = navigator as Navigator & {
				canShare?: (data: { files: File[] }) => boolean;
				share?: (data: { files: File[]; title?: string; text?: string }) => Promise<void>;
			};

			if (
				typeof nav.share === 'function' &&
				typeof nav.canShare === 'function' &&
				nav.canShare({ files: [file] })
			) {
				await nav.share({
					files: [file],
					title: 'Dive video',
					text: `${video.discipline} dive`
				});
				return;
			}

			// Fallback: anchor download.
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = fileName;
			document.body.appendChild(a);
			a.click();
			a.remove();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			// User-cancelled shares throw AbortError — don't surface those as errors.
			if (!/abort/i.test(msg)) downloadError = msg;
		} finally {
			downloading = false;
			exportProgress = 0;
		}
	}</script>

<div class="relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-lg">
	<!-- svelte-ignore a11y_media_has_caption -->
	<video
		bind:this={videoEl}
		src={srcUrl}
		class="h-full w-full object-contain"
		controls
		playsinline
		ontimeupdate={onTimeUpdate}
		onloadedmetadata={() => videoEl && scheduleRvfc(videoEl as VideoWithRvfc)}
	></video>

	{#if showOverlay}
		<!-- HUD overlay: mirrors the recording HUD styling exactly. -->
		<div class="hud hud-top">
			<div class="hud-row">
				<div class="hud-cell">
					<div class="hud-label">Time</div>
					<div class="hud-value">{formatMs(elapsedMs)}</div>
				</div>
				<div class="hud-cell right">
					<div class="hud-label">Distance</div>
					<div class="hud-value">{distance.toFixed(1)} m</div>
				</div>
			</div>
			<div class="hud-sub">
				<span>Lap {lapsCompleted}/{timeline.laps.length}</span>
				<span class="hud-speed">{speed.toFixed(2)} m/s</span>
			</div>
		</div>
	{/if}
</div>

<!-- Summary and actions card -->
<div class="mt-3 rounded-2xl bg-slate-900/70 p-4 ring-1 ring-white/5">
	<!-- Summary row -->
	<div class="mb-3 grid grid-cols-3 gap-2 text-center">
		<div>
			<div class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Distance</div>
			<div class="font-mono text-lg font-bold tabular-nums text-slate-100">{summary.totalDistanceM} m</div>
		</div>
		<div>
			<div class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Duration</div>
			<div class="font-mono text-lg font-bold tabular-nums text-slate-100">{(totalDurationMs / 1000).toFixed(1)}s</div>
		</div>
		<div>
			<div class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Avg Speed</div>
			<div class="font-mono text-lg font-bold tabular-nums text-slate-100">{summary.averageSpeedMs.toFixed(2)}</div>
		</div>
	</div>

	<!-- Overlay toggle switch -->
	<button
		type="button"
		class="flex w-full items-center justify-between rounded-xl bg-slate-800/80 px-4 py-3 text-left transition hover:bg-slate-800 disabled:opacity-60"
		onclick={() => (showOverlay = !showOverlay)}
		disabled={downloading}
	>
		<div>
			<div class="text-sm font-semibold text-slate-100">Show overlay</div>
			<div class="mt-0.5 text-xs text-slate-400">
				{#if showOverlay}
					HUD visible in replay and baked into downloads
				{:else}
					Clean video — no HUD in replay or downloads
				{/if}
			</div>
		</div>
		<span
			class="ml-3 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors"
			class:bg-teal-400={showOverlay}
			class:bg-slate-600={!showOverlay}
		>
			<span
				class="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform"
				class:translate-x-6={showOverlay}
				class:translate-x-1={!showOverlay}
			></span>
		</span>
	</button>

	<!-- Download button -->
	<button
		type="button"
		class="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-400 py-3.5 text-base font-semibold text-slate-900 shadow-sm transition active:scale-[0.98] disabled:opacity-60"
		onclick={downloadToPhotos}
		disabled={downloading}
	>
		{#if downloading && showOverlay}
			<span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900"></span>
			<span>Baking overlay… {Math.round(exportProgress * 100)}%</span>
		{:else if downloading}
			<span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900"></span>
			<span>Preparing…</span>
		{:else}
			<span>⬇︎ Save to Photos</span>
		{/if}
	</button>
	{#if downloadError}
		<p class="mt-2 rounded-md bg-red-500/15 px-3 py-2 text-center text-xs text-red-300">{downloadError}</p>
	{/if}
</div>

<style>
	/* HUD overlay styling mirrors DiveRecorder.svelte so replay matches the
	   in-camera recording view exactly. */
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
		z-index: 10;
	}
	.hud-top {
		top: 0.75rem;
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
	.hud-speed {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-variant-numeric: tabular-nums;
	}
</style>
