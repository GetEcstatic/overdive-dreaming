<!--
  Share reel sheet (docs/video/social-cut-implementation.md §5.2). Share first:
  the reel is normally rendered after upload, so the sheet opens ready to share.
  The preview uses the same edit list and HUD the server burns in; edits (behind
  "Edit reel") re-render on the server automatically, with progress.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { DiveVideo } from '$lib/types';
	import { getUserSettings } from '$lib/firestore';
	import {
		displayRotationDeg,
		displaySize,
		prepareDive,
		resultCard,
		SOCIAL_BACKGROUND,
		shareHudContextForVideo,
		socialCutEditList,
		socialCutFrameSvg,
		socialCutInputForDive,
		socialCutSourceAt,
		socialHudContext,
		socialVideoPlacement,
		HUD_TICK_MS,
		type SocialCutTick
	} from '$lib/media/shareHud';
	import {
		shouldRequestSocialCut,
		socialCutOptionsFromSettings,
		socialCutProgress,
		socialCutStatus,
		socialRenderKey,
		type SocialCutRenderOptions
	} from '$lib/media/processing';
	import { portal } from '$lib/actions/portal';
	import { editStrip, previewSync, type PreviewMode } from '$lib/media/socialPreview';
	import { socialCaption } from '$lib/media/socialCaption';
	import {
		getDiveVideoSocialCutUrl,
		requestDiveVideoSocialCut,
		saveSocialCutOptions,
		setDiveVideoGraphDirection,
		setDiveVideoProtocolEnd,
		socialCutFileName
	} from '$lib/services/diveVideos';

	interface Props {
		/** Live video document (status updates arrive through it). */
		video: DiveVideo;
		/** Playable URL for the clip. */
		srcUrl: string;
		poolLength: number;
		ownerId: string;
		onClose: () => void;
	}

	let { video, srcUrl, poolLength, ownerId, onClose }: Props = $props();

	// --- What the reel shows -------------------------------------------------
	let options = $state<SocialCutRenderOptions>(socialCutOptionsFromSettings(undefined));
	let settingsLoaded = $state(false);
	let showEdit = $state(false);
	let protocolDraftMs = $state<number | null>(null);
	let elementDurationMs = $state(0);
	const recordingMs = $derived(
		Math.max((video.durationSeconds ?? 0) * 1000, elementDurationMs, video.timeline.diveEndMs)
	);
	const baseContext = $derived(shareHudContextForVideo({ ...video, poolLength }));
	const dive = $derived(prepareDive(video.timeline, socialHudContext(baseContext, options)));
	const override = $derived(protocolDraftMs ?? video.shareEdit?.protocolEndMs ?? null);
	const edl = $derived(socialCutEditList(socialCutInputForDive(dive, recordingMs, override)));
	const strip = $derived(
		editStrip(edl, {
			diveEndMs: video.timeline.diveEndMs,
			recordingEndMs: recordingMs,
			wallsMs: dive.walls.map((wall) => wall.atMs)
		})
	);
	const hasPb = $derived(baseContext.pbBeforeM !== null && baseContext.pbBeforeM > 0);
	const hasName = $derived(Boolean(baseContext.athleteName));
	const protocolSeconds = $derived((edl.protocolEndMs - video.timeline.diveEndMs) / 1000);
	const protocolSource = $derived(
		override !== null ? 'set by you' : video.timeline.protocolEndMs !== undefined ? 'from your Protocol done tap' : 'default'
	);
	const summary = $derived(
		`${formatClock(edl.outputDurationMs)} reel · ${
			edl.fastForwardFactor > 1 ? `${edl.fastForwardFactor}× between turns` : 'no fast-forward'
		}`
	);

	function formatClock(ms: number): string {
		const total = Math.round(ms / 1000);
		return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
	}

	// --- Preview ---------------------------------------------------------------
	let videoEl = $state<HTMLVideoElement | null>(null);
	let previewW = $state(0);
	const previewH = $derived((previewW * 16) / 9);
	let outputMs = $state(0);
	let playing = $state(true);
	let dragging = $state(false);
	let mode: PreviewMode = 'rate';
	let fastSeeks = 0;
	let lastSegment = -1;
	let raf = 0;
	let lastFrameAt = 0;

	const tickOutputMs = $derived(Math.floor(outputMs / HUD_TICK_MS) * HUD_TICK_MS);
	const tick = $derived.by((): SocialCutTick => {
		const position = socialCutSourceAt(edl, tickOutputMs);
		return {
			outputMs: tickOutputMs,
			sourceMs: position.sourceMs,
			speed: position.speed,
			cardAtMs: position.inCard ? edl.protocolEndMs : null
		};
	});
	const instanceId = $props.id();
	const hudSvg = $derived(
		previewW > 0
			? socialCutFrameSvg(dive, tick, { width: Math.round(previewW), height: Math.round(previewH) }, { hook: options.hook }).replace(
					/(id="|url\(#)hud-/g,
					`$1reel-${instanceId}-`
				)
			: ''
	);

	// Same framing as the render: cover for portrait clips, the clear band for landscape ones.
	const placement = $derived(socialVideoPlacement(displaySize(video)));
	const rotation = $derived(displayRotationDeg(video));
	const videoBox = $derived.by(() => {
		const k = previewW / 1080;
		const boxW = placement.scaleW * k;
		const boxH = placement.scaleH * k;
		const sideways = rotation === 90 || rotation === 270;
		return {
			clip: `left:${placement.x * k}px;top:${placement.y * k}px;width:${placement.cropW * k}px;height:${placement.cropH * k}px;`,
			video:
				`left:${-placement.cropX * k + (sideways ? (boxW - boxH) / 2 : 0)}px;` +
				`top:${-placement.cropY * k + (sideways ? (boxH - boxW) / 2 : 0)}px;` +
				`width:${sideways ? boxH : boxW}px;height:${sideways ? boxW : boxH}px;` +
				(rotation ? `transform:rotate(${rotation}deg);` : '')
		};
	});

	function syncVideo(): void {
		const el = videoEl;
		if (!el || el.readyState < 1) return;
		const sync = previewSync(edl, outputMs, el.currentTime * 1000, mode);
		const segment = socialCutSourceAt(edl, outputMs).segmentIndex;
		if (segment !== lastSegment) {
			lastSegment = segment;
			fastSeeks = 0;
		}
		if (sync.seek) {
			el.currentTime = sync.targetSourceMs / 1000;
			// A browser that can't keep up with high rates keeps drifting: step through fast-forward instead.
			if (sync.playbackRate > 1 && ++fastSeeks >= 3) mode = 'step';
		}
		const rate = playing && !dragging ? sync.playbackRate : 0;
		if (rate === 0) {
			if (!el.paused) el.pause();
			return;
		}
		if (el.playbackRate !== rate) {
			try {
				el.playbackRate = rate;
			} catch {
				mode = 'step';
			}
		}
		if (el.paused) void el.play().catch(() => (playing = false));
	}

	function frame(now: number): void {
		const dt = lastFrameAt ? Math.min(100, now - lastFrameAt) : 0;
		lastFrameAt = now;
		if (playing && !dragging && edl.outputDurationMs > 0) outputMs = (outputMs + dt) % edl.outputDurationMs;
		syncVideo();
		raf = requestAnimationFrame(frame);
	}

	function togglePlay(): void {
		playing = !playing;
	}

	// --- Edits -------------------------------------------------------------------
	function onProtocolInput(event: Event): void {
		protocolDraftMs = Number((event.currentTarget as HTMLInputElement).value);
		dragging = true;
		// Show the last frame of the cut, i.e. the moment under the handle.
		outputMs = Math.max(0, edl.clipDurationMs - 50);
	}

	async function onProtocolChange(event: Event): Promise<void> {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		dragging = false;
		outputMs = Math.max(0, edl.clipDurationMs - 3_000);
		playing = true;
		try {
			await setDiveVideoProtocolEnd(video.id, value);
		} catch {
			error = "Couldn't save the protocol end. Try again.";
		} finally {
			protocolDraftMs = null;
		}
	}

	async function resetProtocolEnd(): Promise<void> {
		protocolDraftMs = null;
		try {
			await setDiveVideoProtocolEnd(video.id, null);
		} catch {
			error = "Couldn't reset the protocol end. Try again.";
		}
	}

	function setOption(key: keyof SocialCutRenderOptions): void {
		options = { ...options, [key]: !options[key] };
		void saveSocialCutOptions(ownerId, options).catch(() => undefined);
	}

	async function flipGraph(): Promise<void> {
		const current = video.shareEdit?.firstLengthDirection ?? 'ltr';
		try {
			await setDiveVideoGraphDirection({ videoId: video.id, ownerId, direction: current === 'rtl' ? 'ltr' : 'rtl' });
		} catch {
			error = "Couldn't flip the graph. Try again.";
		}
	}

	// --- Create and share ------------------------------------------------------------
	let nowMs = $state(Date.now());
	let requesting = $state(false);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let prepared = $state<{ key: string; file: File } | null>(null);
	let preparing = $state(false);
	let fetchProgress = $state(0);
	const FETCH_STALL_MS = 20_000;
	/** Settings key whose download failed: sharing then falls back to a download link instead of retrying. */
	let fetchFailedKey = $state<string | null>(null);
	const renderKey = $derived(socialRenderKey(video, options));
	const updatedAtMs = $derived(
		(video.updatedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? nowMs
	);
	const status = $derived(socialCutStatus({ video, options, updatedAtMs, nowMs }));
	const preparedFile = $derived(prepared?.key === renderKey ? prepared.file : null);
	const caption = $derived(
		socialCaption({
			discipline: dive.context.discipline,
			finalM: dive.finalM,
			totalMs: Math.max(0, video.timeline.diveEndMs - video.timeline.diveStartMs),
			pb: options.showPb ? resultCard(dive).pb : null
		})
	);

	const progress = $derived(socialCutProgress(video));
	// Before the first request lands, "none" is about to be "rendering": never flash a button.
	const busy = $derived(status === 'rendering' || requesting || (status === 'none' && !error));

	let lastRequestedKey: string | null = null;
	let requestTimer: ReturnType<typeof setTimeout> | null = null;

	async function requestReel(): Promise<void> {
		if (requesting) return;
		lastRequestedKey = renderKey;
		requesting = true;
		error = null;
		try {
			await requestDiveVideoSocialCut(video.id, options);
		} catch {
			error = "We couldn't start the reel. Check your connection and try again.";
		} finally {
			requesting = false;
		}
	}

	// Ask for the reel whenever none exists for the current settings: on open
	// (older dives, or settings changed elsewhere) and after each edit, debounced
	// so a run of toggles costs one render.
	$effect(() => {
		const wanted = shouldRequestSocialCut({ status, renderKey, lastRequestedKey, settingsLoaded });
		if (requestTimer) clearTimeout(requestTimer);
		requestTimer = null;
		if (!wanted) return;
		requestTimer = setTimeout(() => void requestReel(), lastRequestedKey === null ? 0 : 900);
	});

	// Fetch the ready reel while the sheet is open, so the share tap can open the share sheet at once (iOS needs the tap).
	$effect(() => {
		if (status !== 'ready' || preparedFile || preparing || fetchFailedKey === renderKey) return;
		const key = renderKey;
		preparing = true;
		fetchProgress = 0;
		// Give up after a stall (no link or no bytes for a while): Share then falls back to a download link.
		const controller = new AbortController();
		let stall = setTimeout(() => controller.abort(), FETCH_STALL_MS);
		const alive = () => {
			clearTimeout(stall);
			stall = setTimeout(() => controller.abort(), FETCH_STALL_MS);
		};
		const aborted = new Promise<never>((_, reject) =>
			controller.signal.addEventListener('abort', () => reject(new Error('stalled')))
		);
		void (async () => {
			try {
				const url = await Promise.race([getDiveVideoSocialCutUrl(video), aborted]);
				alive();
				const response = await fetch(url, { signal: controller.signal });
				if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
				const total = Number(response.headers.get('content-length')) || 0;
				const reader = response.body.getReader();
				const chunks: Uint8Array[] = [];
				let received = 0;
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					alive();
					chunks.push(value);
					received += value.byteLength;
					if (total > 0) fetchProgress = received / total;
				}
				prepared = { key, file: new File(chunks as BlobPart[], socialCutFileName(video), { type: 'video/mp4' }) };
			} catch {
				fetchFailedKey = key;
			} finally {
				clearTimeout(stall);
				preparing = false;
			}
		})();
	});

	function copyCaption(): void {
		void navigator.clipboard?.writeText(caption).then(
			() => {
				notice = 'Caption copied. Paste it into your post.';
			},
			() => undefined
		);
	}

	async function shareReel(): Promise<void> {
		error = null;
		// Start the copy and the share in the same tap: iOS only opens the share sheet from a user gesture.
		copyCaption();
		const file = preparedFile;
		if (file && navigator.canShare?.({ files: [file] })) {
			try {
				await navigator.share({ files: [file], text: caption });
			} catch (err) {
				if (!(err instanceof DOMException && err.name === 'AbortError')) error = "Couldn't open the share sheet. Use Save video instead.";
			}
			return;
		}
		await saveReel();
	}

	async function saveReel(): Promise<void> {
		try {
			const a = document.createElement('a');
			a.href = await getDiveVideoSocialCutUrl(video);
			a.download = socialCutFileName(video);
			a.rel = 'noopener';
			document.body.appendChild(a);
			a.click();
			a.remove();
		} catch {
			error = "Couldn't download the reel. Try again.";
		}
	}

	// --- Lifecycle -------------------------------------------------------------------
	let sheetEl = $state<HTMLElement | null>(null);

	function onKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') onClose();
	}

	onMount(() => {
		raf = requestAnimationFrame(frame);
		const clock = setInterval(() => (nowMs = Date.now()), 15_000);
		sheetEl?.focus();
		// Keep the feed behind still while the sheet is open.
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		void getUserSettings(ownerId)
			.then((settings) => (options = socialCutOptionsFromSettings(settings?.shareHud)))
			.catch(() => undefined)
			.finally(() => (settingsLoaded = true));
		return () => {
			cancelAnimationFrame(raf);
			clearInterval(clock);
			if (requestTimer) clearTimeout(requestTimer);
			document.body.style.overflow = previousOverflow;
		};
	});
</script>

<svelte:window onkeydown={onKeydown} />

<div class="reel-layer" use:portal>
	<button type="button" class="reel-backdrop" aria-label="Close" onclick={onClose}></button>
	<div class="reel-sheet" role="dialog" aria-modal="true" aria-labelledby="reel-title" tabindex="-1" bind:this={sheetEl}>
		<header class="reel-header">
			<h2 id="reel-title">Share reel</h2>
			<button type="button" class="reel-close" aria-label="Close" onclick={onClose}>×</button>
		</header>

		<div class="reel-body">
			<button
				type="button"
				class="reel-preview"
				style="background:{SOCIAL_BACKGROUND};"
				bind:clientWidth={previewW}
				onclick={togglePlay}
				aria-label={playing ? 'Pause preview' : 'Play preview'}
			>
				<span class="reel-clip" style={videoBox.clip}>
					<video
						bind:this={videoEl}
						src={srcUrl}
						muted
						playsinline
						preload="auto"
						style={videoBox.video}
						onloadedmetadata={(event) => (elementDurationMs = (event.currentTarget as HTMLVideoElement).duration * 1000 || 0)}
					></video>
				</span>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- generated from numbers and escaped text -->
				<span class="reel-hud" aria-hidden="true">{@html hudSvg}</span>
				{#if !playing}
					<span class="reel-paused" aria-hidden="true">▶</span>
				{/if}
			</button>

			<div class="reel-controls">
				<p class="reel-summary">{summary}</p>
				{#if !showEdit}
					<p class="reel-about">Turns and the surface protocol play at normal speed, then your result card.</p>
					<button type="button" class="reel-edit" aria-expanded="false" onclick={() => (showEdit = true)}>
						Edit reel <span aria-hidden="true">›</span>
					</button>
				{:else}

				<div class="reel-strip-wrap">
					<div class="reel-strip" aria-hidden="true">
						{#each strip.blocks as block, i (i)}
							<span class="strip-block strip-{block.kind}" style="left:{block.left}%;width:{block.width}%;"></span>
						{/each}
						{#each strip.walls as wall, i (i)}
							<span class="strip-wall" style="left:{wall}%;"></span>
						{/each}
					</div>
					<input
						class="reel-handle"
						type="range"
						min={video.timeline.diveEndMs}
						max={recordingMs}
						step="100"
						value={edl.protocolEndMs}
						style="left:{strip.handleLeft}%;width:{strip.handleWidth}%;"
						aria-label="Surface protocol end"
						oninput={onProtocolInput}
						onchange={onProtocolChange}
					/>
				</div>
				<p class="reel-protocol">
					Protocol ends <strong>{protocolSeconds.toFixed(1)} s</strong> after surfacing
					<span class="reel-muted">({protocolSource})</span>
					{#if override !== null}
						<button type="button" class="reel-link" onclick={resetProtocolEnd}>Reset</button>
					{/if}
				</p>

				<div class="reel-toggles" role="group" aria-label="Show on the reel">
					<button type="button" class="reel-toggle" aria-pressed={options.showName && hasName} disabled={!hasName} onclick={() => setOption('showName')}>
						Name
					</button>
					<button type="button" class="reel-toggle" aria-pressed={options.showPb && hasPb} disabled={!hasPb} onclick={() => setOption('showPb')}>
						PB
					</button>
					<button
						type="button"
						class="reel-toggle"
						aria-pressed={options.hook && options.showPb && hasPb}
						disabled={!hasPb || !options.showPb}
						onclick={() => setOption('hook')}
					>
						PB intro
					</button>
					<button type="button" class="reel-toggle reel-flip" onclick={flipGraph} aria-label="Flip the speed graph direction">⇄ Graph</button>
				</div>
				{/if}
			</div>
		</div>

		<footer class="reel-footer">
			{#if status === 'ready'}
				<button type="button" class="reel-primary" onclick={shareReel} disabled={preparing && !preparedFile}>
					{#if preparing && !preparedFile}
						<span class="reel-spinner" aria-hidden="true"></span>
						{fetchProgress > 0 ? `Getting your reel… ${Math.round(fetchProgress * 100)}%` : 'Getting your reel…'}
					{:else}
						Share reel
					{/if}
				</button>
				<div class="reel-secondary">
					<button type="button" class="reel-link" onclick={copyCaption}>Copy caption</button>
					<button type="button" class="reel-link" onclick={saveReel}>Save video</button>
				</div>
			{:else if busy}
				<div
					class="reel-progress"
					role="progressbar"
					aria-label="Preparing your reel"
					aria-valuemin="0"
					aria-valuemax="100"
					aria-valuenow={Math.round(progress * 100)}
				>
					<span class="reel-progress-fill" style="width:{Math.max(6, progress * 100)}%;"></span>
					<span class="reel-progress-label">
						{progress > 0 ? `Preparing your reel… ${Math.round(progress * 100)}%` : 'Preparing your reel…'}
					</span>
				</div>
				<p class="reel-hint">Usually ready in under a minute. You can close this; it keeps going.</p>
			{:else}
				<button type="button" class="reel-primary" onclick={requestReel}>Try again</button>
				<p class="reel-hint">We couldn't prepare the reel.</p>
			{/if}
			{#if error}
				<p class="reel-error" role="alert">{error}</p>
			{:else if notice}
				<p class="reel-notice" role="status">{notice}</p>
			{/if}
		</footer>
	</div>
</div>

<style>
	.reel-layer {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: flex;
		align-items: flex-end;
		justify-content: center;
	}
	.reel-backdrop {
		position: absolute;
		inset: 0;
		border: 0;
		padding: 0;
		background: rgba(2, 6, 23, 0.72);
		cursor: default;
	}
	.reel-sheet {
		position: relative;
		display: flex;
		flex-direction: column;
		width: min(100%, 30rem);
		max-height: 100dvh;
		padding: 0.9rem 1rem calc(1rem + env(safe-area-inset-bottom));
		border: 1px solid rgba(148, 163, 184, 0.18);
		border-bottom: 0;
		border-radius: 1.1rem 1.1rem 0 0;
		background: var(--color-bg-card-solid);
		color: var(--color-text);
		outline: none;
		animation: reel-up 0.22s ease-out;
	}
	@keyframes reel-up {
		from {
			transform: translateY(24px);
			opacity: 0;
		}
	}
	.reel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.7rem;
	}
	.reel-header h2 {
		margin: 0;
		font-size: 1.05rem;
	}
	.reel-close {
		width: 2.2rem;
		height: 2.2rem;
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.85);
		color: var(--color-text);
		font: inherit;
		font-size: 1.3rem;
		line-height: 1;
		cursor: pointer;
	}
	.reel-body {
		display: flex;
		gap: 0.9rem;
		min-height: 0;
		overflow-y: auto;
	}
	.reel-preview {
		position: relative;
		flex: 0 0 auto;
		width: min(42vw, calc((100dvh - 15rem) * 9 / 16), 11.5rem);
		aspect-ratio: 9 / 16;
		padding: 0;
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 0.7rem;
		overflow: hidden;
		cursor: pointer;
	}
	.reel-clip {
		position: absolute;
		overflow: hidden;
	}
	.reel-clip video {
		position: absolute;
		max-width: none;
		object-fit: fill;
		transform-origin: center;
		pointer-events: none;
	}
	.reel-hud,
	.reel-hud :global(svg) {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
	.reel-paused {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-size: 2rem;
		color: #fff;
		background: rgba(2, 6, 23, 0.35);
	}
	.reel-controls {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 0.7rem;
		min-width: 0;
	}
	.reel-summary {
		margin: 0;
		font-weight: 600;
		font-size: 0.95rem;
	}
	.reel-about {
		margin: 0;
		color: var(--color-text-muted);
		font-size: 0.82rem;
		line-height: 1.4;
	}
	.reel-edit {
		align-self: flex-start;
		min-height: 2.2rem;
		padding: 0 0.9rem;
		border: 1px solid rgba(148, 163, 184, 0.28);
		border-radius: 999px;
		background: transparent;
		color: var(--color-text);
		font: inherit;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.reel-progress {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 3rem;
		border-radius: 999px;
		background: rgba(20, 184, 166, 0.14);
		overflow: hidden;
	}
	.reel-progress-fill {
		position: absolute;
		inset: 0 auto 0 0;
		background: linear-gradient(135deg, rgba(45, 212, 191, 0.55), rgba(16, 185, 129, 0.55));
		transition: width 1.8s linear;
	}
	.reel-progress-label {
		position: relative;
		font-weight: 700;
		font-size: 0.95rem;
	}
	.reel-strip-wrap {
		position: relative;
		height: 2.4rem;
	}
	.reel-strip {
		position: absolute;
		left: 0;
		right: 0;
		top: 0.7rem;
		height: 1rem;
		border-radius: 0.3rem;
		background: rgba(148, 163, 184, 0.12);
		overflow: hidden;
	}
	.strip-block {
		position: absolute;
		top: 0;
		bottom: 0;
	}
	.strip-normal {
		background: var(--color-primary);
	}
	.strip-fast {
		background: repeating-linear-gradient(90deg, rgba(148, 163, 184, 0.45) 0 3px, rgba(148, 163, 184, 0.2) 3px 6px);
	}
	.strip-unused {
		background: transparent;
	}
	.strip-wall {
		position: absolute;
		top: -2px;
		bottom: -2px;
		width: 2px;
		margin-left: -1px;
		background: rgba(255, 255, 255, 0.7);
	}
	.reel-handle {
		position: absolute;
		top: 0;
		height: 2.4rem;
		margin: 0;
		background: transparent;
		appearance: none;
		-webkit-appearance: none;
		cursor: ew-resize;
	}
	.reel-handle::-webkit-slider-runnable-track {
		height: 2.4rem;
		background: transparent;
	}
	.reel-handle::-moz-range-track {
		height: 2.4rem;
		background: transparent;
	}
	.reel-handle::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 1.1rem;
		height: 2.4rem;
		border-radius: 0.35rem;
		border: 2px solid #fff;
		background: var(--color-bg-card-solid);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
	}
	.reel-handle::-moz-range-thumb {
		width: 1.1rem;
		height: 2.4rem;
		border-radius: 0.35rem;
		border: 2px solid #fff;
		background: var(--color-bg-card-solid);
	}
	.reel-handle:focus-visible::-webkit-slider-thumb {
		border-color: var(--color-primary);
	}
	.reel-protocol {
		margin: 0;
		font-size: 0.82rem;
		line-height: 1.4;
	}
	.reel-muted {
		color: var(--color-text-muted);
	}
	.reel-toggles {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.reel-toggle {
		min-height: 2.2rem;
		padding: 0 0.8rem;
		border: 1px solid rgba(148, 163, 184, 0.28);
		border-radius: 999px;
		background: transparent;
		color: var(--color-text);
		font: inherit;
		font-size: 0.82rem;
		cursor: pointer;
	}
	.reel-toggle[aria-pressed='true'] {
		border-color: var(--color-primary);
		background: rgba(20, 184, 166, 0.18);
		color: #ccfbf1;
	}
	.reel-toggle:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.reel-footer {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		padding-top: 0.9rem;
	}
	.reel-primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		min-height: 3rem;
		border: 0;
		border-radius: 999px;
		background: linear-gradient(135deg, #2dd4bf, #10b981);
		color: #04201c;
		font: inherit;
		font-weight: 700;
		font-size: 1rem;
		cursor: pointer;
	}
	.reel-primary:disabled {
		opacity: 0.7;
		cursor: default;
	}
	.reel-secondary {
		display: flex;
		justify-content: center;
		gap: 1.4rem;
	}
	.reel-link {
		padding: 0.3rem 0;
		border: 0;
		background: none;
		color: #5eead4;
		font: inherit;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.reel-hint,
	.reel-error,
	.reel-notice {
		margin: 0;
		text-align: center;
		font-size: 0.8rem;
	}
	.reel-hint {
		color: var(--color-text-muted);
	}
	.reel-error {
		color: #fca5a5;
	}
	.reel-notice {
		color: #99f6e4;
	}
	.reel-spinner {
		width: 1rem;
		height: 1rem;
		border: 2px solid rgba(4, 32, 28, 0.3);
		border-top-color: #04201c;
		border-radius: 999px;
		animation: reel-spin 0.8s linear infinite;
	}
	@keyframes reel-spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
