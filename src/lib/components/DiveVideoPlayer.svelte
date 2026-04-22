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
	 */
	async function renderWithOverlay(): Promise<{ blob: Blob; mime: string }> {
		const off = document.createElement('video');
		off.src = srcUrl;
		off.muted = true;
		off.playsInline = true;
		off.crossOrigin = 'anonymous';
		off.preload = 'auto';

		await new Promise<void>((resolve, reject) => {
			const onMeta = () => {
				off.removeEventListener('loadedmetadata', onMeta);
				off.removeEventListener('error', onErr);
				resolve();
			};
			const onErr = () => {
				off.removeEventListener('loadedmetadata', onMeta);
				off.removeEventListener('error', onErr);
				reject(new Error('Failed to load source video'));
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
		const mimeType = candidates.find((m) =>
			typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)
		);
		if (!mimeType) throw new Error('No supported MediaRecorder mime type');

		const stream = canvas.captureStream(30);
		const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
		const chunks: Blob[] = [];
		recorder.ondataavailable = (e) => {
			if (e.data && e.data.size > 0) chunks.push(e.data);
		};

		const durationMs = (off.duration || video.durationSeconds || 0) * 1000;

		const drawHud = (atMs: number): void => {
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
		};

		const offR = off as VideoWithRvfc;
		const useRvfc = typeof offR.requestVideoFrameCallback === 'function';

		let finished = false;
		const onFrame = (_now: number, meta: { mediaTime: number }) => {
			if (finished) return;
			ctx.drawImage(off, 0, 0, w, h);
			drawHud(meta.mediaTime * 1000);
			if (durationMs > 0) {
				exportProgress = Math.min(1, (meta.mediaTime * 1000) / durationMs);
			}
			offR.requestVideoFrameCallback?.(onFrame);
		};

		// Fallback raf loop when rVFC missing.
		let rafId = 0;
		const rafLoop = () => {
			if (finished) return;
			ctx.drawImage(off, 0, 0, w, h);
			drawHud(off.currentTime * 1000);
			if (durationMs > 0) {
				exportProgress = Math.min(1, (off.currentTime * 1000) / durationMs);
			}
			rafId = requestAnimationFrame(rafLoop);
		};

		const stopPromise = new Promise<Blob>((resolve, reject) => {
			recorder.onstop = () => {
				const blob = new Blob(chunks, { type: mimeType });
				resolve(blob);
			};
			recorder.onerror = (e) => {
				reject(
					new Error(
						`MediaRecorder error: ${(e as ErrorEvent).message ?? 'unknown'}`
					)
				);
			};
		});

		const endPromise = new Promise<void>((resolve) => {
			off.onended = () => resolve();
		});

		recorder.start(250);
		if (useRvfc) {
			offR.requestVideoFrameCallback?.(onFrame);
		} else {
			rafId = requestAnimationFrame(rafLoop);
		}
		await off.play();

		await endPromise;
		finished = true;
		if (rafId) cancelAnimationFrame(rafId);

		// Give the recorder a tick to flush the final frame before stopping.
		await new Promise((r) => setTimeout(r, 100));
		recorder.stop();
		const blob = await stopPromise;

		// Clean up.
		off.src = '';
		off.load();

		return { blob, mime: mimeType };
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

<div class="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
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
		<!-- HUD overlay: mirrored layout of the recording HUD for consistency. -->
		<div
			class="pointer-events-none absolute inset-x-0 top-4 mx-4 rounded-xl bg-black/55 px-4 py-3 text-white backdrop-blur-sm"
		>
			<div class="flex items-center justify-between">
				<div>
					<div class="text-[10px] uppercase tracking-wider text-slate-300">Time</div>
					<div class="font-mono text-2xl tabular-nums">{formatMs(elapsedMs)}</div>
				</div>
				<div class="text-right">
					<div class="text-[10px] uppercase tracking-wider text-slate-300">Distance</div>
					<div class="font-mono text-2xl tabular-nums">{distance.toFixed(1)} m</div>
				</div>
			</div>
			<div class="mt-1 flex items-center justify-between text-xs text-slate-300">
				<span>Lap {lapsCompleted}/{timeline.laps.length}</span>
				<span>{speed.toFixed(2)} m/s</span>
			</div>
		</div>

		<!-- Summary footer -->
		<div
			class="pointer-events-none absolute inset-x-0 bottom-16 mx-4 rounded-xl bg-black/55 px-4 py-2 text-xs text-slate-200 backdrop-blur-sm"
		>
			{video.discipline} · {(totalDurationMs / 1000).toFixed(1)}s · {summary.totalDistanceM}
			m · {summary.averageSpeedMs.toFixed(2)} m/s avg
		</div>
	{/if}
</div>

<div class="mt-3 flex flex-col gap-2">
	<label class="flex items-center justify-between rounded-xl bg-slate-800/60 px-4 py-2.5 text-sm text-slate-100">
		<span>Show overlay</span>
		<input
			type="checkbox"
			class="h-5 w-5 accent-teal-400"
			bind:checked={showOverlay}
			disabled={downloading}
		/>
	</label>
	<button
		type="button"
		class="w-full rounded-full bg-teal-400 py-3 text-sm font-semibold text-slate-900 disabled:opacity-60"
		onclick={downloadToPhotos}
		disabled={downloading}
	>
		{#if downloading && showOverlay}
			Baking overlay… {Math.round(exportProgress * 100)}%
		{:else if downloading}
			Preparing…
		{:else if showOverlay}
			Download to Photos (with overlay)
		{:else}
			Download to Photos
		{/if}
	</button>
	<p class="text-center text-[11px] text-slate-400">
		{#if showOverlay}
			Exported clip will have the HUD burned into each frame.
		{:else}
			Exported clip will be the raw recording without any overlay.
		{/if}
	</p>
	{#if downloadError}
		<p class="text-xs text-red-400">{downloadError}</p>
	{/if}
</div>
