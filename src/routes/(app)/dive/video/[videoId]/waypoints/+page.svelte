<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto, invalidateAll } from '$app/navigation';
	import { doc, getDoc } from 'firebase/firestore';
	import { db } from '$lib/firebase';
	import { user } from '$lib/stores/auth';
	import { diveRecording } from '$lib/stores/videoPlayback';
	import type { DiveTimeline, DiveVideo } from '$lib/types';
	import { defaultSpeedMs } from '$lib/capture/disciplineSpeeds';
	import { summariseTimeline } from '$lib/capture/timeline';
	import {
		createPrecisionMarkingState,
		endDive,
		inferPrecisionMarkerConfig,
		markDiveStart,
		markNextWaypoint,
		precisionElapsedMs,
		precisionPrimaryLabel,
		projectPrecisionStateToTimeline,
		restartMarking,
		summarisePrecisionState,
		undoLastMark,
		type PrecisionMarkingState
	} from '$lib/capture/precisionWaypointMarker';
	import {
		getPreferredDiveVideoPlaybackUrl,
		saveDiveVideoTimelineCorrection
	} from '$lib/services/diveVideos';

	let video = $state<DiveVideo | null>(null);
	let videoUrl = $state<string | null>(null);
	let videoEl = $state<HTMLVideoElement | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let currentMs = $state(0);
	let durationMs = $state(0);
	let marker = $state<PrecisionMarkingState>(createPrecisionMarkingState({ poolLengthM: 25, waypointsPerLap: 1 }));
	let holdTimer: ReturnType<typeof setTimeout> | null = null;
	let longPressHandled = false;
	let primaryClickSuppressed = false;

	const videoId = $derived($page.params.videoId);
	const canEdit = $derived(
		!!video && ($user?.uid === video.ownerId || $user?.uid === video.userId || $user?.uid === video.athleteId)
	);
	const primaryLabel = $derived(precisionPrimaryLabel(marker));
	const elapsedMs = $derived(precisionElapsedMs(marker, currentMs));
	const newSummary = $derived(summarisePrecisionState(marker));
	const oldSummary = $derived(
		video
			? summariseTimeline(video.timeline, defaultSpeedMs(video.discipline))
			: null
	);
	const projectedTimeline = $derived(projectPrecisionStateToTimeline(marker));
	const editorActive = $derived(!loading && !!video && !!videoUrl && canEdit);
	const progressLabel = $derived(
		marker.phase === 'start'
			? 'Choose dive start'
			: marker.phase === 'ended'
				? `${newSummary.waypointCount} marks ready`
				: `Marked ${newSummary.waypointCount} - next ${marker.nextDistanceM.toFixed(marker.nextDistanceM % 1 === 0 ? 0 : 1)} m`
	);

	$effect(() => {
		if (!editorActive) return;
		diveRecording.begin();
		return () => diveRecording.end();
	});

	$effect(() => {
		if (typeof document === 'undefined' || !editorActive) return;
		const html = document.documentElement;
		const body = document.body;
		const previousHtmlOverflow = html.style.overflow;
		const previousHtmlOverscroll = html.style.overscrollBehavior;
		const previousHtmlTouchAction = html.style.touchAction;
		const previousBodyOverflow = body.style.overflow;
		const previousBodyOverscroll = body.style.overscrollBehavior;
		const previousBodyTouchAction = body.style.touchAction;
		const preventGesture = (event: Event) => event.preventDefault();

		html.style.overflow = 'hidden';
		html.style.overscrollBehavior = 'none';
		html.style.touchAction = 'none';
		body.style.overflow = 'hidden';
		body.style.overscrollBehavior = 'none';
		body.style.touchAction = 'none';
		document.addEventListener('gesturestart', preventGesture, { passive: false });
		document.addEventListener('gesturechange', preventGesture, { passive: false });
		document.addEventListener('gestureend', preventGesture, { passive: false });

		return () => {
			html.style.overflow = previousHtmlOverflow;
			html.style.overscrollBehavior = previousHtmlOverscroll;
			html.style.touchAction = previousHtmlTouchAction;
			body.style.overflow = previousBodyOverflow;
			body.style.overscrollBehavior = previousBodyOverscroll;
			body.style.touchAction = previousBodyTouchAction;
			document.removeEventListener('gesturestart', preventGesture);
			document.removeEventListener('gesturechange', preventGesture);
			document.removeEventListener('gestureend', preventGesture);
		};
	});

	onMount(async () => {
		try {
			const id = videoId;
			if (!id) throw new Error('Missing dive video id');
			const snap = await getDoc(doc(db, 'diveVideos', id));
			if (!snap.exists()) throw new Error('Dive video not found');
			const loaded = { id: snap.id, ...snap.data() } as DiveVideo;
			video = loaded;
			if (!($user?.uid === loaded.ownerId || $user?.uid === loaded.userId || $user?.uid === loaded.athleteId)) {
				throw new Error('You cannot edit waypoints for this video');
			}
			videoUrl = await getPreferredDiveVideoPlaybackUrl(loaded);
			const inferredConfig = inferPrecisionMarkerConfig(loaded.timeline, loaded.poolLength ?? 25);
			marker = createPrecisionMarkingState({
				poolLengthM: inferredConfig.poolLengthM,
				waypointsPerLap: inferredConfig.waypointsPerLap,
				defaultSpeedMs: defaultSpeedMs(loaded.discipline)
			});
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	});

	function videoMs(): number {
		return Math.max(0, Math.round(videoEl?.currentTime ? videoEl.currentTime * 1000 : currentMs));
	}

	function syncVideoTime(): void {
		currentMs = videoMs();
	}

	function onLoadedMetadata(): void {
		durationMs = Math.max(0, Math.round((videoEl?.duration ?? 0) * 1000));
		syncVideoTime();
	}

	function seekTo(ms: number): void {
		const next = Math.max(0, Math.min(durationMs || ms, Math.round(ms)));
		currentMs = next;
		if (videoEl) videoEl.currentTime = next / 1000;
	}

	function nudge(deltaMs: number): void {
		seekTo(videoMs() + deltaMs);
	}

	function handlePrimaryTap(): void {
		if (primaryClickSuppressed) {
			primaryClickSuppressed = false;
			return;
		}
		if (saving) return;
		const atMs = videoMs();
		if (marker.phase === 'start') marker = markDiveStart(marker, atMs);
		else if (marker.phase === 'waypoints') marker = markNextWaypoint(marker, atMs);
		else if (marker.phase === 'ended') void saveCorrections();
	}

	function startEndHold(): void {
		if (marker.phase !== 'waypoints' || saving) return;
		longPressHandled = false;
		holdTimer = setTimeout(() => {
			marker = endDive(marker, videoMs());
			longPressHandled = true;
			primaryClickSuppressed = true;
		}, 650);
	}

	function finishEndHold(): void {
		if (holdTimer) clearTimeout(holdTimer);
		holdTimer = null;
		if (longPressHandled) {
			longPressHandled = false;
			return;
		}
	}

	async function cancelEdit(): Promise<void> {
		if (video?.sessionId) {
			if (window.history.length > 1) {
				history.back();
				return;
			}
			await goto(`/session/${video.sessionId}`, { replaceState: true });
			return;
		}
		history.back();
	}

	async function saveCorrections(): Promise<void> {
		if (!video || marker.phase !== 'ended' || saving) return;
		saving = true;
		error = null;
		try {
			await saveDiveVideoTimelineCorrection({ videoId: video.id, timeline: projectedTimeline });
			await invalidateAll();
			if (window.history.length > 1) {
				history.back();
				return;
			}
			await goto(`/session/${video.sessionId}`, { replaceState: true });
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			saving = false;
		}
	}

	function formatTime(ms: number): string {
		const totalSeconds = Math.max(0, Math.floor(ms / 1000));
		const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
		const seconds = (totalSeconds % 60).toString().padStart(2, '0');
		const tenths = Math.floor((Math.max(0, ms) % 1000) / 100);
		return `${minutes}:${seconds}.${tenths}`;
	}
</script>

{#if loading}
	<section class="waypoint-page centered">Loading video...</section>
{:else if error || !video || !videoUrl || !canEdit}
	<section class="stored-waypoint-loading">
		<p class="error-text">{error ?? 'Waypoint editing is unavailable for this video.'}</p>
		<button type="button" class="utility-button" onclick={() => history.back()}>Back</button>
	</section>
{:else}
	<section class="import-recorder scrub-recorder stored-waypoint-editor">
		<div class="import-recorder-preview">
			<!-- svelte-ignore a11y_media_has_caption -->
			<video
				bind:this={videoEl}
				class="import-recorder-video"
				src={videoUrl}
				preload="metadata"
				playsinline
				onloadedmetadata={onLoadedMetadata}
				ontimeupdate={syncVideoTime}
				onseeked={syncVideoTime}
			></video>

			<div class="import-hud hud-top">
				<div class="hud-row">
					<div class="hud-cell">
						<div class="hud-label">Time</div>
						<div class="hud-value">{formatTime(elapsedMs)}</div>
					</div>
					<div class="hud-cell right">
						<div class="hud-label">Marked</div>
						<div class="hud-value">{newSummary.totalDistanceM.toFixed(1)} m</div>
					</div>
				</div>
				<div class="hud-sub">
					<span>{newSummary.waypointCount} marks · {marker.phase === 'ended' ? 'review' : primaryLabel}</span>
					<span>{newSummary.averageSpeedMs.toFixed(2)} m/s</span>
				</div>
			</div>

			{#if error}
				<div class="import-toast" role="alert">{error}</div>
			{/if}
		</div>

		<div class="import-recorder-controls scrub-controls">
			<button class="editor-close" type="button" aria-label="Cancel waypoint edit" onclick={cancelEdit} disabled={saving}>×</button>

			<div class="import-secondary-actions left">
				<button class="utility-button" type="button" onclick={cancelEdit} disabled={saving}>Cancel</button>
				<button class="utility-button" type="button" disabled={saving || marker.phase === 'start'} onclick={() => (marker = undoLastMark(marker))}>Undo</button>
				{#if marker.phase === 'ended'}
					<button class="utility-button save-button" type="button" onclick={saveCorrections} disabled={saving}>{saving ? 'Saving' : 'Save'}</button>
				{/if}
			</div>

			<div class="import-secondary-actions right">
				<button class="utility-button scrub-nudge scrub-reset" type="button" aria-label="Restart marks" title="Restart marks" disabled={saving || marker.phase === 'start'} onclick={() => (marker = restartMarking(marker))}>↺</button>
				<button class="utility-button scrub-nudge" type="button" aria-label="Move scrubber back 0.2 seconds" onclick={() => nudge(-200)}>←</button>
				<button class="utility-button scrub-nudge" type="button" aria-label="Move scrubber forward 0.2 seconds" onclick={() => nudge(200)}>→</button>
			</div>

			<div class="scrub-rail-wrap">
				<div class="scrub-meta">
					<span>{formatTime(currentMs)}</span>
					<span>{progressLabel}</span>
				</div>
				<input
					class="scrub-range"
					type="range"
					min="0"
					max={Math.max(1, durationMs)}
					step="100"
					value={currentMs}
					oninput={(event) => seekTo(Number(event.currentTarget.value))}
				/>
				<div class="scrub-meta dim">
					<span>00:00.0</span>
					<span>{formatTime(durationMs)}</span>
				</div>
			</div>

			<div class="primary-wrap import-primary-wrap scrub-primary-wrap">
				<button
					class="primary-action"
					class:action-startDive={marker.phase === 'start'}
					class:action-waypoint={marker.phase === 'waypoints'}
					class:action-disabled={marker.phase === 'ended'}
					type="button"
					disabled={saving}
					onpointerdown={startEndHold}
					onpointerup={finishEndHold}
					onpointercancel={finishEndHold}
					onpointerleave={finishEndHold}
					oncontextmenu={(event) => event.preventDefault()}
					onclick={handlePrimaryTap}
				>
					<span class="btn-main">{primaryLabel}</span>
					<span class="btn-sub">{progressLabel}</span>
				</button>
			</div>

			{#if marker.phase === 'ended'}
				<div class="summary-line scrub-summary-line">
					{newSummary.totalDistanceM.toFixed(1)} m · {newSummary.totalTimeSeconds.toFixed(1)}s · old {oldSummary ? oldSummary.totalDistanceM.toFixed(1) : '-'} m
				</div>
			{:else if newSummary.waypointCount > 0}
				<div class="summary-line scrub-summary-line">
					Marked {newSummary.waypointCount} · Last {newSummary.totalDistanceM.toFixed(1)} m
				</div>
			{/if}

		</div>
	</section>
{/if}

<style>
	.stored-waypoint-loading {
		min-height: 100svh;
		padding: max(0.75rem, env(safe-area-inset-top)) 0.75rem max(1rem, env(safe-area-inset-bottom));
		background: #030712;
		color: #f8fafc;
		display: grid;
		place-content: center;
		gap: 1rem;
		text-align: center;
	}

	.import-recorder {
		position: fixed;
		inset: 0;
		z-index: 1000;
		background: #000;
		color: var(--color-text);
		overflow: hidden;
		overscroll-behavior: none;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
	}

	.import-recorder-preview {
		position: absolute;
		inset: 0;
		background: #000;
	}

	.import-recorder-video {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
		background: #000;
	}

	.stored-waypoint-editor .import-recorder-video {
		object-fit: cover;
	}

	.import-hud {
		position: absolute;
		left: 0.75rem;
		right: 0.75rem;
		top: max(0.75rem, env(safe-area-inset-top));
		z-index: 5;
		padding: 0.75rem 1.05rem;
		border-radius: 14px;
		background: rgba(15, 23, 42, 0.55);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		color: #f1f5f9;
		pointer-events: none;
	}

	.stored-waypoint-editor .hud-top {
		top: calc(max(0.75rem, env(safe-area-inset-top)) + 3.15rem);
	}

	.hud-row,
	.hud-sub,
	.scrub-meta {
		display: flex;
		justify-content: space-between;
		gap: 1.25rem;
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
		font-size: 1.9rem;
		font-variant-numeric: tabular-nums;
		line-height: 1.1;
	}

	.hud-sub {
		margin-top: 0.4rem;
		color: #cbd5e1;
		font-size: 0.85rem;
	}

	.import-toast {
		position: absolute;
		left: 50%;
		top: calc(max(0.75rem, env(safe-area-inset-top)) + 6.25rem);
		transform: translateX(-50%);
		max-width: min(28rem, calc(100vw - 2rem));
		padding: 0.55rem 0.85rem;
		border-radius: 14px;
		background: rgba(239, 68, 68, 0.95);
		color: #fff;
		font-size: 0.85rem;
		font-weight: 650;
		text-align: center;
	}

	.import-recorder-controls {
		position: absolute;
		inset: 0;
		z-index: 6;
		pointer-events: none;
		padding: max(0.75rem, env(safe-area-inset-top)) max(0.75rem, env(safe-area-inset-right)) calc(1rem + env(safe-area-inset-bottom)) max(0.75rem, env(safe-area-inset-left));
	}

	.editor-close {
		position: absolute;
		top: max(0.75rem, env(safe-area-inset-top));
		right: max(0.75rem, env(safe-area-inset-right));
		z-index: 8;
		width: 2.55rem;
		height: 2.55rem;
		border: 1px solid rgba(226, 232, 240, 0.28);
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.72);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		color: #f8fafc;
		font: inherit;
		font-size: 1.45rem;
		font-weight: 650;
		line-height: 1;
		pointer-events: auto;
	}

	.editor-close:disabled {
		opacity: 0.45;
	}

	.import-secondary-actions {
		position: absolute;
		display: flex;
		gap: 0.5rem;
		pointer-events: auto;
	}

	.import-secondary-actions.left {
		left: max(0.9rem, env(safe-area-inset-left));
		bottom: calc(1.45rem + env(safe-area-inset-bottom));
	}

	.import-secondary-actions.right {
		right: max(0.9rem, env(safe-area-inset-right));
		bottom: calc(8.35rem + env(safe-area-inset-bottom));
		flex-direction: column;
	}

	.utility-button {
		min-width: 4.75rem;
		min-height: 2.5rem;
		border: 1px solid rgba(226, 232, 240, 0.24);
		border-radius: 999px;
		padding: 0.45rem 0.8rem;
		background: rgba(15, 23, 42, 0.68);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		color: #f8fafc;
		font: inherit;
		font-size: 0.86rem;
		font-weight: 700;
		touch-action: manipulation;
	}

	.utility-button:disabled {
		opacity: 0.45;
	}

	.save-button {
		border-color: rgba(20, 184, 166, 0.58);
		background: rgba(15, 118, 110, 0.82);
	}

	.primary-wrap {
		position: absolute;
		left: 50%;
		bottom: calc(1rem + env(safe-area-inset-bottom));
		transform: translateX(-50%);
		display: flex;
		pointer-events: auto;
	}

	.scrub-primary-wrap {
		bottom: calc(8.6rem + env(safe-area-inset-bottom));
	}

	.primary-action {
		position: relative;
		width: clamp(11rem, 58vw, 16rem);
		min-height: 5.2rem;
		border: 2px solid rgba(255, 255, 255, 0.22);
		border-radius: 18px;
		padding: 0.9rem 1.15rem;
		box-shadow: 0 18px 52px rgba(0, 0, 0, 0.46), inset 0 0 0 6px rgba(255, 255, 255, 0.08);
		color: #fff;
		font: inherit;
		font-weight: 800;
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.2rem;
		user-select: none;
		-webkit-user-select: none;
		-webkit-tap-highlight-color: transparent;
		touch-action: manipulation;
	}

	.primary-action:active:not(:disabled) {
		transform: scale(0.96);
	}

	.primary-action.action-startDive {
		background: #10b981;
		color: #052e25;
	}

	.primary-action.action-waypoint {
		background: var(--color-primary);
		color: #042f2e;
	}

	.primary-action.action-disabled {
		background: rgba(30, 41, 59, 0.9);
	}

	.btn-main {
		font-size: clamp(1.25rem, 5.2vw, 1.7rem);
		line-height: 1.1;
	}

	.btn-sub {
		max-width: 12rem;
		font-size: clamp(0.82rem, 3.4vw, 1rem);
		font-weight: 500;
		opacity: 0.8;
		text-align: center;
	}

	.summary-line {
		position: absolute;
		left: 50%;
		bottom: calc(8.9rem + env(safe-area-inset-bottom));
		transform: translateX(-50%);
		padding: 0.3rem 0.55rem;
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.58);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		color: #cbd5e1;
		font-size: 0.8rem;
		text-align: center;
		white-space: nowrap;
		pointer-events: none;
	}

	.scrub-nudge {
		min-width: 2.75rem;
		font-size: 1.15rem;
		line-height: 1;
	}

	.scrub-rail-wrap {
		position: absolute;
		left: max(0.9rem, env(safe-area-inset-left));
		right: max(0.9rem, env(safe-area-inset-right));
		bottom: calc(1.1rem + env(safe-area-inset-bottom));
		padding: 0.7rem 0.8rem 0.6rem;
		border: 1px solid rgba(226, 232, 240, 0.18);
		border-radius: 14px;
		background: rgba(15, 23, 42, 0.74);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		pointer-events: auto;
		touch-action: none;
	}

	.scrub-meta {
		color: #e2e8f0;
		font-size: 0.78rem;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}

	.scrub-meta.dim {
		color: #94a3b8;
		font-weight: 650;
	}

	.scrub-range {
		width: 100%;
		height: 2.4rem;
		margin: 0.1rem 0;
		accent-color: var(--color-primary);
		touch-action: pan-x;
	}

	.scrub-summary-line {
		bottom: calc(14.8rem + env(safe-area-inset-bottom));
	}

	.scrub-reset {
		min-width: 2.75rem;
		min-height: 2.35rem;
		border: 1px solid rgba(248, 113, 113, 0.28);
		border-radius: 999px;
		padding: 0.35rem;
		background: rgba(127, 29, 29, 0.42);
		color: #fecaca;
		font-size: 1.15rem;
		font-weight: 800;
	}

	.scrub-reset:disabled {
		display: none;
	}

	.error-text {
		text-align: center;
		color: #fecaca;
	}
</style>