<!--
  DiveVideoPlayer.svelte
  In-app playback of a clean DiveVideo with a DOM HUD overlay driven by the
  stored DiveTimeline. See docs/Dynamic video feature.md §5 (Option D).

  Uses `requestVideoFrameCallback` where available to stay frame-accurate;
  falls back to `timeupdate` on platforms that don't support it.
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

	// Legacy / defensive: new recordings are always saved portrait by the
	// capture pipeline (which canvas-rotates landscape getUserMedia streams
	// before handing them to MediaRecorder). Older clips recorded before
	// that pipeline landed may still be landscape on disk, so we keep this
	// rotation fallback to present them in the same 9:16 portrait frame.
	const isLandscapeSource = $derived(
		video.widthPx > 0 && video.heightPx > 0 && video.widthPx > video.heightPx
	);	const timeline: DiveTimeline = $derived(video.timeline);
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
	// -----------------------------------------------------------------------
	let downloadError = $state<string | null>(null);
	let downloading = $state(false);

	function fileExtensionFromMime(mime: string): string {
		if (mime.includes('mp4')) return 'mp4';
		if (mime.includes('webm')) return 'webm';
		return 'bin';
	}

	function suggestedFileName(): string {
		const stamp = video.recordedAt?.toDate?.().toISOString?.().replace(/[:.]/g, '-') ?? 'dive';
		return `overdive-${video.discipline}-${stamp}.${fileExtensionFromMime(video.mimeType)}`;
	}

	async function fetchBlob(): Promise<Blob> {
		const res = await fetch(srcUrl);
		if (!res.ok) throw new Error(`Download failed (${res.status})`);
		return await res.blob();
	}

	async function downloadToPhotos(): Promise<void> {
		if (downloading) return;
		downloading = true;
		downloadError = null;
		try {
			const blob = await fetchBlob();
			const fileName = suggestedFileName();
			const file = new File([blob], fileName, { type: video.mimeType });

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
		}
	}</script>

<div class="relative aspect-9/16 w-full overflow-hidden rounded-2xl bg-black">
	<!-- svelte-ignore a11y_media_has_caption -->
	{#if isLandscapeSource}
		<!--
		  Landscape source rotated 90° CW to fit the portrait container.
		  Pre-rotation the <video> is sized 16/9 × containerWidth wide and
		  containerWidth tall (= 177.78% × 56.25% of the container), centered
		  so after rotation it exactly fills the 9:16 frame.
		-->
		<video
			bind:this={videoEl}
			src={srcUrl}
			class="absolute left-1/2 top-1/2 origin-center object-cover"
			style="width: calc(100% * 16 / 9); height: calc(100% * 9 / 16); transform: translate(-50%, -50%) rotate(90deg);"
			controls
			playsinline
			ontimeupdate={onTimeUpdate}
			onloadedmetadata={() => videoEl && scheduleRvfc(videoEl as VideoWithRvfc)}
		></video>
	{:else}
		<video
			bind:this={videoEl}
			src={srcUrl}
			class="h-full w-full object-cover"
			controls
			playsinline
			ontimeupdate={onTimeUpdate}
			onloadedmetadata={() => videoEl && scheduleRvfc(videoEl as VideoWithRvfc)}
		></video>
	{/if}

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
</div>

<div class="mt-3 flex flex-col gap-2">
	<button
		type="button"
		class="w-full rounded-full bg-teal-400 py-3 text-sm font-semibold text-slate-900 disabled:opacity-60"
		onclick={downloadToPhotos}
		disabled={downloading}
	>
		{downloading ? 'Preparing…' : 'Download to Photos'}
	</button>
	{#if downloadError}
		<p class="text-xs text-red-400">{downloadError}</p>
	{/if}
</div>
