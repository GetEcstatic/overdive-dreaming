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
									class="btn btn-ghost"
									disabled={busyVideoId === video.id}
									onclick={() => handleTogglePin(video)}
								>
									{video.retentionTier === 'pinned' ? '📌 Unpin' : '📍 Pin'}
								</button>
								<button
									class="btn btn-ghost danger"
									disabled={busyVideoId === video.id}
									onclick={() => handleDelete(video)}
								>
									Delete
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
		border-radius: 12px;
		padding: 1.25rem;
		margin-bottom: 1.5rem;
	}

	.section-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		gap: 0.5rem;
	}

	.section-head h2 {
		margin: 0;
		font-size: 1.1rem;
		color: var(--color-text);
	}

	.btn {
		font: inherit;
		padding: 0.5rem 0.9rem;
		border-radius: 8px;
		border: 1px solid transparent;
		cursor: pointer;
	}

	.btn-primary {
		background: var(--color-primary);
		color: #0f172a;
		font-weight: 600;
	}

	.btn-primary:hover {
		filter: brightness(1.05);
	}

	.btn-ghost {
		background: transparent;
		border-color: rgba(148, 163, 184, 0.25);
		color: var(--color-text-muted);
	}

	.btn-ghost.danger:hover {
		color: #ef4444;
		border-color: rgba(239, 68, 68, 0.5);
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
		padding: 1rem;
		border: 1px dashed rgba(148, 163, 184, 0.2);
		border-radius: 8px;
		text-align: center;
	}

	.video-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.video-card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.video-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
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
