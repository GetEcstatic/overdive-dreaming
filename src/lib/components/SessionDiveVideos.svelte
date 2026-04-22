<!--
  SessionDiveVideos.svelte
  Dive video section for the session detail page. Shows any DiveVideo records
  attached to this routine log (via `sessionId === routineLogId`, the current
  pragmatic mapping), plus a "Record dive video" entry point for the owner
  when the discipline is dynamic.

  See docs/Dynamic video feature.md §12 (Phase 1 P1.9) and the 2026-04-21
  decision log entry re: routing-model mapping.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		listDiveVideosForSession,
		getDiveVideoDownloadUrl,
		deleteDiveVideo,
		pinDiveVideo
	} from '$lib/services/diveVideos';
	import DiveVideoPlayer from './DiveVideoPlayer.svelte';
	import type { DiveVideo, Discipline } from '$lib/types';

	interface Props {
		routineLogId: string;
		discipline: Discipline;
		isOwner: boolean;
	}

	let { routineLogId, discipline, isOwner }: Props = $props();

	const isDynamic = $derived(
		discipline === 'DYN' || discipline === 'DYNB' || discipline === 'DNF'
	);

	let videos = $state<DiveVideo[]>([]);
	let urlMap = $state<Record<string, string>>({});
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let busyVideoId = $state<string | null>(null);

	$effect(() => {
		void loadVideos(routineLogId);
	});

	async function loadVideos(sessionId: string): Promise<void> {
		loading = true;
		loadError = null;
		try {
			const list = await listDiveVideosForSession(sessionId);
			videos = list;
			// Resolve download URLs lazily but in parallel.
			const entries = await Promise.all(
				list.map(async (v) => {
					if (v.uploadStatus !== 'uploaded') return [v.id, ''] as const;
					try {
						const url = await getDiveVideoDownloadUrl(v.storagePathClean);
						return [v.id, url] as const;
					} catch {
						return [v.id, ''] as const;
					}
				})
			);
			urlMap = Object.fromEntries(entries);
		} catch (err) {
			loadError = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}

	function handleRecord(): void {
		void goto(`/dive/record/${routineLogId}`);
	}

	async function handleDelete(video: DiveVideo): Promise<void> {
		if (!confirm('Delete this dive video? This removes the recording forever.')) return;
		busyVideoId = video.id;
		try {
			await deleteDiveVideo(video);
			videos = videos.filter((v) => v.id !== video.id);
		} catch (err) {
			// eslint-disable-next-line no-alert
			alert(`Failed to delete: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			busyVideoId = null;
		}
	}

	async function handleTogglePin(video: DiveVideo): Promise<void> {
		busyVideoId = video.id;
		const nextPinned = video.retentionTier !== 'pinned';
		try {
			await pinDiveVideo(video.id, nextPinned);
			videos = videos.map((v) =>
				v.id === video.id
					? { ...v, retentionTier: nextPinned ? 'pinned' : 'keep-last-5' }
					: v
			);
		} catch (err) {
			// eslint-disable-next-line no-alert
			alert(`Failed to update pin: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			busyVideoId = null;
		}
	}
</script>

{#if isDynamic}
	<section class="dive-videos-section">
		<div class="section-head">
			<h2>🎥 Dive Videos</h2>
			{#if isOwner}
				<button class="btn btn-primary" onclick={handleRecord}>
					Record new
				</button>
			{/if}
		</div>

		{#if loading}
			<div class="status">Loading videos…</div>
		{:else if loadError}
			<div class="status error">Couldn't load videos: {loadError}</div>
		{:else if videos.length === 0}
			<div class="status empty">
				{#if isOwner}
					No videos yet. Tap <strong>Record new</strong> to capture this dive.
				{:else}
					No videos attached to this session.
				{/if}
			</div>
		{:else}
			<div class="video-list">
				{#each videos as video (video.id)}
					<div class="video-card">
						{#if video.uploadStatus === 'uploaded' && urlMap[video.id]}
							<DiveVideoPlayer {video} srcUrl={urlMap[video.id]} />
						{:else if video.uploadStatus === 'pending' || video.uploadStatus === 'uploading'}
							<div class="pending-card">
								<div class="pending-label">Uploading…</div>
								<div class="pending-sub">Leave the app open to finish this upload.</div>
							</div>
						{:else if video.uploadStatus === 'failed'}
							<div class="pending-card failed">
								<div class="pending-label">Upload failed</div>
								<div class="pending-sub">We'll retry next time you're online.</div>
							</div>
						{/if}

						{#if isOwner}
							<div class="video-actions">
								<button
									class="btn btn-action"
									class:pinned={video.retentionTier === 'pinned'}
									disabled={busyVideoId === video.id}
									onclick={() => handleTogglePin(video)}
								>
									<span class="btn-icon">{video.retentionTier === 'pinned' ? '📌' : '📍'}</span>
									<span class="btn-label">{video.retentionTier === 'pinned' ? 'Unpin' : 'Pin'}</span>
								</button>
								<button
									class="btn btn-action danger"
									disabled={busyVideoId === video.id}
									onclick={() => handleDelete(video)}
								>
									<span class="btn-icon">🗑</span>
									<span class="btn-label">Delete</span>
								</button>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</section>
{/if}

<style>
	.dive-videos-section {
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.15);
		border-radius: 16px;
		padding: 1.25rem;
		margin-bottom: 1.5rem;
	}

	.section-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		gap: 0.75rem;
	}

	.section-head h2 {
		margin: 0;
		font-size: 1.15rem;
		font-weight: 700;
		color: var(--color-text);
	}

	.btn {
		font: inherit;
		padding: 0.6rem 1rem;
		border-radius: 10px;
		border: 1px solid transparent;
		cursor: pointer;
		transition:
			transform 0.06s ease,
			filter 0.12s ease,
			background-color 0.15s ease;
	}
	.btn:active:not(:disabled) {
		transform: scale(0.97);
	}

	.btn-primary {
		background: var(--color-primary);
		color: #0f172a;
		font-weight: 700;
		padding: 0.7rem 1.1rem;
		font-size: 0.95rem;
	}

	.btn-primary:hover {
		filter: brightness(1.05);
	}

	.btn-action {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		background: rgba(30, 41, 59, 0.85);
		border-color: rgba(148, 163, 184, 0.2);
		color: var(--color-text);
		font-weight: 600;
		font-size: 0.9rem;
		padding: 0.65rem 1rem;
		min-height: 44px;
	}
	.btn-action:hover {
		background: rgba(51, 65, 85, 0.9);
	}
	.btn-action.pinned {
		background: rgba(250, 204, 21, 0.15);
		border-color: rgba(250, 204, 21, 0.4);
		color: #fde68a;
	}
	.btn-action.danger:hover {
		background: rgba(239, 68, 68, 0.2);
		border-color: rgba(239, 68, 68, 0.5);
		color: #fecaca;
	}
	.btn-icon {
		font-size: 1rem;
		line-height: 1;
	}
	.btn-label {
		letter-spacing: 0.01em;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.status {
		color: var(--color-text-muted);
		font-size: 0.9rem;
		padding: 0.75rem 0;
	}

	.status.error {
		color: #ef4444;
	}

	.status.empty {
		padding: 1.25rem;
		border: 1px dashed rgba(148, 163, 184, 0.25);
		border-radius: 10px;
		text-align: center;
	}

	.video-list {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.video-card {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.video-actions {
		display: flex;
		gap: 0.6rem;
		justify-content: flex-end;
		flex-wrap: wrap;
	}

	.pending-card {
		padding: 1.5rem;
		border: 1px dashed rgba(148, 163, 184, 0.25);
		border-radius: 10px;
		text-align: center;
	}

	.pending-card.failed {
		border-color: rgba(239, 68, 68, 0.4);
	}

	.pending-label {
		font-weight: 600;
		color: var(--color-text);
	}

	.pending-sub {
		color: var(--color-text-muted);
		font-size: 0.85rem;
		margin-top: 0.25rem;
	}
</style>
