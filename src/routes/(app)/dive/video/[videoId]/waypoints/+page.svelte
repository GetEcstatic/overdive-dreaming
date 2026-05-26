<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { doc, getDoc } from 'firebase/firestore';
	import { db } from '$lib/firebase';
	import { user } from '$lib/stores/auth';
	import type { DiveTimeline, DiveVideo } from '$lib/types';
	import { defaultSpeedMs } from '$lib/capture/disciplineSpeeds';
	import { summariseTimeline } from '$lib/capture/timeline';
	import {
		createPrecisionMarkingState,
		endDive,
		markDiveStart,
		markNextWaypoint,
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

	const videoId = $derived($page.params.videoId);
	const canEdit = $derived(
		!!video && ($user?.uid === video.ownerId || $user?.uid === video.userId || $user?.uid === video.athleteId)
	);
	const primaryLabel = $derived(precisionPrimaryLabel(marker));
	const newSummary = $derived(summarisePrecisionState(marker));
	const oldSummary = $derived(
		video
			? summariseTimeline(video.timeline, defaultSpeedMs(video.discipline))
			: null
	);
	const projectedTimeline = $derived(projectPrecisionStateToTimeline(marker));
	const progressLabel = $derived(
		marker.phase === 'start'
			? 'Choose dive start'
			: marker.phase === 'ended'
				? `${newSummary.waypointCount} marks ready`
				: `Marked ${newSummary.waypointCount} - next ${marker.nextDistanceM.toFixed(marker.nextDistanceM % 1 === 0 ? 0 : 1)} m`
	);

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
			marker = createPrecisionMarkingState({
				poolLengthM: loaded.poolLength ?? 25,
				waypointsPerLap: inferWaypointsPerLap(loaded.timeline),
				defaultSpeedMs: defaultSpeedMs(loaded.discipline)
			});
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	});

	function inferWaypointsPerLap(timeline: DiveTimeline): number {
		const firstWall = timeline.laps[0];
		if (!firstWall) return 1;
		const subSplitsBeforeFirstWall = (timeline.subSplits ?? []).filter(
			(split) => split.atMs < firstWall.atMs && split.cumulativeDistanceM < firstWall.cumulativeDistanceM
		).length;
		return Math.max(1, subSplitsBeforeFirstWall + 1);
	}

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
		if (saving) return;
		const atMs = videoMs();
		if (marker.phase === 'start') marker = markDiveStart(marker, atMs);
		else if (marker.phase === 'waypoints') marker = markNextWaypoint(marker, atMs);
	}

	function startEndHold(): void {
		if (marker.phase !== 'waypoints' || saving) return;
		longPressHandled = false;
		holdTimer = setTimeout(() => {
			marker = endDive(marker, videoMs());
			longPressHandled = true;
		}, 650);
	}

	function finishEndHold(): void {
		if (holdTimer) clearTimeout(holdTimer);
		holdTimer = null;
		if (longPressHandled) {
			longPressHandled = false;
			return;
		}
		handlePrimaryTap();
	}

	async function saveCorrections(): Promise<void> {
		if (!video || marker.phase !== 'ended' || saving) return;
		saving = true;
		error = null;
		try {
			await saveDiveVideoTimelineCorrection({ videoId: video.id, timeline: projectedTimeline });
			await goto(`/session/${video.sessionId}`);
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
	<section class="waypoint-page centered">
		<p class="error-text">{error ?? 'Waypoint editing is unavailable for this video.'}</p>
		<button type="button" class="secondary" onclick={() => history.back()}>Back</button>
	</section>
{:else}
	<section class="waypoint-page">
		<div class="topbar">
			<button type="button" class="secondary" onclick={() => history.back()} disabled={saving}>Cancel</button>
			<div class="topbar-copy">
				<p class="eyebrow">Edit waypoints</p>
				<h1>{video.discipline} video</h1>
			</div>
			<button type="button" class="secondary" onclick={() => (marker = restartMarking(marker))} disabled={saving}>Restart</button>
		</div>

		<div class="video-shell">
			<video
				bind:this={videoEl}
				src={videoUrl}
				playsinline
				controls={false}
				onloadedmetadata={onLoadedMetadata}
				ontimeupdate={syncVideoTime}
				onseeked={syncVideoTime}
			></video>
			<div class="hud">
				<div>
					<span>Time</span>
					<strong>{formatTime(currentMs)}</strong>
				</div>
				<div class="right">
					<span>Status</span>
					<strong>{progressLabel}</strong>
				</div>
			</div>
		</div>

		<div class="controls">
			<input
				class="scrubber"
				type="range"
				min="0"
				max={Math.max(1, durationMs)}
				step="100"
				value={currentMs}
				oninput={(event) => seekTo(Number(event.currentTarget.value))}
			/>

			<div class="nudge-row">
				<button type="button" onclick={() => nudge(-500)}>-0.5s</button>
				<button type="button" onclick={() => nudge(-100)}>-0.1s</button>
				<button type="button" onclick={() => videoEl?.paused ? videoEl.play() : videoEl?.pause()}>Play/Pause</button>
				<button type="button" onclick={() => nudge(100)}>+0.1s</button>
				<button type="button" onclick={() => nudge(500)}>+0.5s</button>
			</div>

			<button
				type="button"
				class="primary"
				onpointerdown={startEndHold}
				onpointerup={finishEndHold}
				onpointercancel={finishEndHold}
				disabled={saving || marker.phase === 'ended'}
			>
				{primaryLabel}
			</button>

			<div class="action-row">
				<button type="button" class="secondary" onclick={() => (marker = undoLastMark(marker))} disabled={saving}>Undo last</button>
				<button type="button" class="save" onclick={saveCorrections} disabled={saving || marker.phase !== 'ended'}>
					{saving ? 'Saving...' : 'Save corrections'}
				</button>
			</div>

			<div class="summary-grid">
				<div>
					<span>Old</span>
					<strong>{oldSummary ? `${oldSummary.totalDistanceM.toFixed(1)} m` : '-'}</strong>
					<small>{oldSummary ? formatTime(oldSummary.totalTimeSeconds * 1000) : '-'}</small>
				</div>
				<div>
					<span>New</span>
					<strong>{newSummary.totalDistanceM.toFixed(1)} m</strong>
					<small>{formatTime(newSummary.totalTimeSeconds * 1000)}</small>
				</div>
			</div>

			{#if newSummary.warnings.length > 0}
				<p class="warning">Check: {newSummary.warnings.join(', ')}</p>
			{/if}
			{#if error}
				<p class="error-text">{error}</p>
			{/if}
		</div>
	</section>
{/if}

<style>
	.waypoint-page {
		min-height: 100svh;
		padding: max(0.75rem, env(safe-area-inset-top)) 0.75rem max(1rem, env(safe-area-inset-bottom));
		background: #030712;
		color: #f8fafc;
	}
	.centered {
		display: grid;
		place-content: center;
		gap: 1rem;
		text-align: center;
	}
	.topbar,
	.action-row,
	.nudge-row,
	.summary-grid {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.topbar {
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}
	.topbar-copy {
		text-align: center;
	}
	h1,
	p {
		margin: 0;
	}
	h1 {
		font-size: 1rem;
	}
	.eyebrow,
	.hud span,
	.summary-grid span {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #cbd5e1;
	}
	.video-shell {
		position: relative;
		border-radius: 8px;
		overflow: hidden;
		background: #000;
		max-height: 58svh;
	}
	video {
		display: block;
		width: 100%;
		max-height: 58svh;
		object-fit: contain;
	}
	.hud {
		position: absolute;
		left: 0.75rem;
		right: 0.75rem;
		top: 0.75rem;
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem 1.05rem;
		border-radius: 8px;
		background: rgba(15, 23, 42, 0.62);
		backdrop-filter: blur(8px);
	}
	.hud strong {
		display: block;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 1.1rem;
	}
	.right {
		text-align: right;
	}
	.controls {
		display: grid;
		gap: 0.75rem;
		padding-top: 0.9rem;
	}
	.scrubber {
		width: 100%;
		min-height: 36px;
	}
	.nudge-row,
	.action-row {
		justify-content: center;
		flex-wrap: wrap;
	}
	button {
		border: 1px solid rgba(148, 163, 184, 0.28);
		border-radius: 8px;
		background: rgba(15, 23, 42, 0.92);
		color: #f8fafc;
		font: inherit;
		padding: 0.65rem 0.8rem;
	}
	button:disabled {
		opacity: 0.45;
	}
	.primary,
	.save {
		border-color: rgba(20, 184, 166, 0.72);
		background: #0f766e;
		font-weight: 700;
	}
	.primary {
		width: min(100%, 28rem);
		justify-self: center;
		min-height: 4rem;
		font-size: 1.1rem;
	}
	.secondary {
		background: rgba(15, 23, 42, 0.72);
	}
	.summary-grid {
		justify-content: stretch;
	}
	.summary-grid > div {
		flex: 1;
		padding: 0.75rem;
		border: 1px solid rgba(148, 163, 184, 0.18);
		border-radius: 8px;
		background: rgba(15, 23, 42, 0.52);
	}
	.summary-grid strong,
	.summary-grid small {
		display: block;
	}
	.warning,
	.error-text {
		text-align: center;
		color: #fbbf24;
	}
	.error-text {
		color: #fecaca;
	}
</style>