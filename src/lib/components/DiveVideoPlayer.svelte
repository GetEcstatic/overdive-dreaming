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
		totalTimeMs
	} from '$lib/capture/timeline';
	import { diveVideoBehavior } from '$lib/stores/videoPlayback';

	interface Props {
		video: DiveVideo;
		/** Pre-resolved Storage download URL for the clean video. */
		srcUrl: string;
		/**
		 * Compact variant for feed cards: hides the summary + actions card
		 * (HUD toggle, download button, export progress). The HUD overlay on
		 * top of the video itself is preserved. Defaults to the full layout.
		 */
		compact?: boolean;
	}

	let { video, srcUrl, compact = false }: Props = $props();

	let videoEl: HTMLVideoElement | undefined = $state();
	let currentMs = $state(0);
	let rvfcHandle: number | null = null;

	let showOverlay = $state(true);

	const timeline: DiveTimeline = $derived(video.timeline);
	const poolLength: number = $derived(video.poolLength);

	// Live overlay values.
	// `currentMs` is mediaTime relative to the start of the recording. The
	// recording may include breathe-up footage before the dive begins, so
	// the HUD Time is offset by `timeline.diveStartMs` and clamped to 0
	// until the diver has "left the wall".
	const elapsedMs = $derived(Math.max(0, currentMs - (timeline.diveStartMs ?? 0)));
	// Distance/speed helpers still key off recording-relative offsets so we
	// pass the raw `currentMs` through.
	const distance = $derived(distanceAt(timeline, Math.max(0, currentMs), poolLength));
	const speed = $derived(speedAt(timeline, Math.max(0, currentMs), poolLength));

	// Lap count shown = laps already completed by this point in the recording.
	const lapsCompleted = $derived(timeline.laps.filter((l) => l.atMs <= currentMs).length);

	const totalDurationMs = $derived(totalTimeMs(timeline) || video.durationSeconds * 1000);

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

	/**
	 * Sniff the real container of a video blob by inspecting magic bytes.
	 * The MIME stored on the DiveVideo record (or reported by fetch) can
	 * disagree with the actual bytes — that mismatch makes iOS refuse to
	 * expose the "Save Video" (Photos) option in the share sheet. We
	 * normalise to the real type so the share sheet behaves.
	 *
	 *  - MP4 (ISO BMFF): bytes 4..7 == "ftyp"
	 *  - WebM/Matroska:  starts with 0x1A 0x45 0xDF 0xA3 (EBML header)
	 */
	async function sniffVideoContainer(
		blob: Blob
	): Promise<{ mime: 'video/mp4' | 'video/webm' | null }> {
		try {
			const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
			if (
				head.length >= 8 &&
				head[4] === 0x66 /* f */ &&
				head[5] === 0x74 /* t */ &&
				head[6] === 0x79 /* y */ &&
				head[7] === 0x70 /* p */
			) {
				return { mime: 'video/mp4' };
			}
			if (
				head.length >= 4 &&
				head[0] === 0x1a &&
				head[1] === 0x45 &&
				head[2] === 0xdf &&
				head[3] === 0xa3
			) {
				return { mime: 'video/webm' };
			}
		} catch {
			/* fall through */
		}
		return { mime: null };
	}

	function isIOS(): boolean {
		if (typeof navigator === 'undefined') return false;
		const ua = navigator.userAgent || '';
		// iPhone, iPad (iPadOS ≥13 reports as Mac but has touch), iPod.
		if (/iPad|iPhone|iPod/.test(ua)) return true;
		const nav = navigator as Navigator & { maxTouchPoints?: number };
		return /Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1;
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
		const diveTimeMs = Math.max(0, atMs - (timeline.diveStartMs ?? 0));
		ctx.fillText(formatMs(diveTimeMs), innerX, innerY + labelSize + Math.round(boxH * 0.03));
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

			// Trust the bytes, not the metadata. iOS only exposes "Save Video"
			// (→ Photos) in the share sheet when the File.type matches the real
			// container (video/mp4 with .mp4 extension). Mismatches force the
			// user down the "Save to Files" path.
			const sniffed = await sniffVideoContainer(blob);
			if (sniffed.mime) {
				mime = sniffed.mime;
			} else if (!/mp4|webm/.test(mime)) {
				// Unknown container — best effort fallback.
				mime = 'application/octet-stream';
			}

			// Re-wrap the blob so its .type matches what we're advertising.
			if (blob.type !== mime) {
				blob = new Blob([blob], { type: mime });
			}

			const fileName = suggestedFileName(mime, showOverlay);
			const file = new File([blob], fileName, { type: mime });

			// If we're on iOS and the container isn't mp4, iOS Photos can't
			// accept the file — surface a clear message so the user knows why
			// only "Save to Files" appears in the share sheet.
			const iosSaveToPhotosBlocked = isIOS() && mime !== 'video/mp4';

			const nav = navigator as Navigator & {
				canShare?: (data: { files: File[] }) => boolean;
				share?: (data: { files: File[]; title?: string; text?: string }) => Promise<void>;
			};

			if (
				typeof nav.share === 'function' &&
				typeof nav.canShare === 'function' &&
				nav.canShare({ files: [file] })
			) {
				try {
					await nav.share({
						files: [file],
						title: 'Dive video',
						text: `${video.discipline} dive`
					});
					if (iosSaveToPhotosBlocked) {
						downloadError =
							'iOS Photos only accepts .mp4 — this clip is .webm, so only "Save to Files" is available. Re-record with overlay on to get an .mp4.';
					}
					return;
				} catch (err) {
					// iOS Safari throws NotAllowedError when the original user
					// gesture has expired during the bake. Fall through to the
					// anchor-download path instead of surfacing a scary error.
					const msg = err instanceof Error ? err.message : String(err);
					const name = (err as { name?: string } | null)?.name ?? '';
					if (/abort/i.test(msg) || name === 'AbortError') return;
					if (name !== 'NotAllowedError' && !/not allowed/i.test(msg)) {
						throw err;
					}
					// else: fall through to anchor download below.
				}
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

<div
	class="relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-lg"
	style="position: relative;"
	data-fullscreen-root
>
	<!-- svelte-ignore a11y_media_has_caption -->
	<video
		bind:this={videoEl}
		src={srcUrl}
		class="h-full w-full object-contain"
		controls
		playsinline
		ontimeupdate={onTimeUpdate}
		onloadedmetadata={() => videoEl && scheduleRvfc(videoEl as VideoWithRvfc)}
		use:diveVideoBehavior
	></video>

	{#if showOverlay}
		<!--
		  HUD overlay: compact variant of the recording HUD, sized to stay
		  out of the way in both portrait and landscape replay.
		-->
		<div
			style="
				position: absolute;
				left: 0.5rem;
				right: 0.5rem;
				top: 0.5rem;
				z-index: 10;
				pointer-events: none;
				padding: 0.4rem 0.6rem;
				border-radius: 10px;
				background: rgba(15, 23, 42, 0.4);
				backdrop-filter: blur(6px);
				-webkit-backdrop-filter: blur(6px);
				color: #f1f5f9;
			"
		>
			<div
				style="display: flex; justify-content: space-between; align-items: baseline; gap: 0.75rem;"
			>
				<div>
					<div
						style="font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.06em; color: #cbd5e1; line-height: 1;"
					>
						Time
					</div>
					<div
						style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 1.1rem; font-variant-numeric: tabular-nums; line-height: 1.1;"
					>
						{formatMs(elapsedMs)}
					</div>
				</div>
				<div style="text-align: right;">
					<div
						style="font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.06em; color: #cbd5e1; line-height: 1;"
					>
						Distance
					</div>
					<div
						style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 1.1rem; font-variant-numeric: tabular-nums; line-height: 1.1;"
					>
						{distance.toFixed(1)} m
					</div>
				</div>
			</div>
			<div
				style="display: flex; justify-content: space-between; color: #cbd5e1; font-size: 0.65rem; margin-top: 0.15rem;"
			>
				<span>Lap {lapsCompleted}/{timeline.laps.length}</span>
				<span
					style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums;"
					>{speed.toFixed(2)} m/s</span
				>
			</div>
		</div>
	{/if}
</div>

{#if !compact}
	<!-- Overlay toggle — standalone pill button directly below the video. -->
	<div class="player-actions">
		<button
			type="button"
			class="pill pill-toggle"
			class:pill-active={showOverlay}
			onclick={() => (showOverlay = !showOverlay)}
			disabled={downloading}
			aria-pressed={showOverlay}
		>
			<span class="pill-dot" class:pill-dot-active={showOverlay}></span>
			<span>{showOverlay ? 'Hide overlay' : 'Show overlay'}</span>
		</button>

		<button
			type="button"
			class="pill pill-primary"
			onclick={downloadToPhotos}
			disabled={downloading}
		>
			{#if downloading && showOverlay}
				<span class="pill-spinner" aria-hidden="true"></span>
				<span>Baking overlay… {Math.round(exportProgress * 100)}%</span>
			{:else if downloading}
				<span class="pill-spinner" aria-hidden="true"></span>
				<span>Preparing…</span>
			{:else}
				<span aria-hidden="true">⬇︎</span>
				<span>Save to Photos</span>
			{/if}
		</button>

		{#if downloadError}
			<p class="download-error">{downloadError}</p>
		{/if}
	</div>
{/if}

<style>
	/*
	 * When the wrapping container is placed into fullscreen (via the
	 * Fullscreen API), the browser removes our Tailwind aspect-video/rounded
	 * constraints via the :fullscreen pseudo-class. We re-assert sensible
	 * fullscreen sizing so the HUD overlay keeps its absolute positioning
	 * relative to a full-viewport container and the <video> fills it.
	 */
	[data-fullscreen-root]:fullscreen {
		width: 100vw;
		height: 100vh;
		border-radius: 0;
		aspect-ratio: auto;
		background: black;
	}
	[data-fullscreen-root]:fullscreen video {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	/* Safari still prefixes the pseudo-class on some versions. */
	[data-fullscreen-root]:-webkit-full-screen {
		width: 100vw;
		height: 100vh;
		border-radius: 0;
		aspect-ratio: auto;
		background: black;
	}
	[data-fullscreen-root]:-webkit-full-screen video {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	/*
	 * Pill-styled action buttons beneath the video (Hide/Show overlay,
	 * Save to Photos). Plain CSS so they render correctly regardless of
	 * whether Tailwind utilities are compiled for this file.
	 */
	.player-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		justify-content: center;
		align-items: center;
		margin-top: 0.9rem;
	}
	.pill {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		font: inherit;
		font-size: 0.9rem;
		font-weight: 600;
		line-height: 1;
		padding: 0.65rem 1.1rem;
		min-height: 40px;
		border-radius: 9999px;
		border: 1px solid transparent;
		cursor: pointer;
		transition:
			transform 0.06s ease,
			background-color 0.15s ease,
			border-color 0.15s ease,
			filter 0.12s ease;
		-webkit-tap-highlight-color: transparent;
	}
	.pill:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.pill:active:not(:disabled) {
		transform: scale(0.97);
	}
	.pill-toggle {
		background: rgba(30, 41, 59, 0.85);
		border-color: rgba(148, 163, 184, 0.2);
		color: var(--color-text);
	}
	.pill-toggle:hover:not(:disabled) {
		background: rgba(51, 65, 85, 0.9);
	}
	.pill-toggle.pill-active {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: #0f172a;
	}
	.pill-toggle.pill-active:hover:not(:disabled) {
		filter: brightness(1.05);
	}
	.pill-dot {
		display: inline-block;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 9999px;
		background: #94a3b8; /* slate-400 */
	}
	.pill-dot.pill-dot-active {
		background: #0f172a; /* slate-900 */
	}
	.pill-primary {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: #0f172a;
		font-weight: 700;
		padding: 0.75rem 1.25rem;
	}
	.pill-primary:hover:not(:disabled) {
		filter: brightness(1.05);
	}
	.pill-spinner {
		display: inline-block;
		width: 0.9rem;
		height: 0.9rem;
		border-radius: 9999px;
		border: 2px solid rgba(15, 23, 42, 0.25);
		border-top-color: #0f172a;
		animation: pill-spin 0.7s linear infinite;
	}
	@keyframes pill-spin {
		to {
			transform: rotate(360deg);
		}
	}
	.download-error {
		flex-basis: 100%;
		text-align: center;
		margin: 0;
		padding: 0.5rem 0.75rem;
		border-radius: 10px;
		background: rgba(239, 68, 68, 0.15);
		color: #fecaca;
		font-size: 0.8rem;
	}
</style>
