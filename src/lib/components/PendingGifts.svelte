<!--
  PendingGifts.svelte
  Shows dive videos that have been gifted TO the current user and are awaiting
  an accept/decline decision. Lightweight: renders a compact card list, not a
  full player — user taps through to `/session/[sessionId]` to view.

  See docs/Dynamic video feature.md §14 D2 + P1.11.
-->
<script lang="ts">
	import { user } from '$lib/stores/auth';
	import {
		listGiftedDiveVideos,
		updateDiveVideoGiftStatus
	} from '$lib/services/diveVideos';
	// Accept now navigates to the gift review route, where the athlete
	// previews the clip and triggers the server-side acceptDiveGift
	// callable. We never write giftStatus='accepted' from here directly.

	import { getPublicUserProfilesByIds } from '$lib/firestore';
	import { goto } from '$app/navigation';
	import { format } from 'date-fns';
	import type { DiveVideo } from '$lib/types';

	let videos = $state<DiveVideo[]>([]);
	let ownerNames = $state<Record<string, string>>({});
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let busyVideoId = $state<string | null>(null);

	$effect(() => {
		const uid = $user?.uid;
		if (!uid) return;
		void load(uid);
	});

	async function load(uid: string): Promise<void> {
		loading = true;
		loadError = null;
		try {
			const list = await listGiftedDiveVideos(uid);
			videos = list.filter((v) => v.giftStatus === 'pending');
			const ownerIds = Array.from(new Set(videos.map((v) => v.ownerId)));
			if (ownerIds.length > 0) {
				const profiles = await getPublicUserProfilesByIds(ownerIds);
				ownerNames = Object.fromEntries(
					profiles.map((p) => [p.userId, p.displayName])
				);
			}
		} catch (err) {
			loadError = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}

	function handleReview(video: DiveVideo): void {
		void goto(`/gift/${video.id}`);
	}

	async function handleDecline(video: DiveVideo): Promise<void> {
		if (!confirm('Decline this gift? The video will stay with the coach.')) return;
		busyVideoId = video.id;
		try {
			await updateDiveVideoGiftStatus(video.id, 'declined');
			videos = videos.filter((v) => v.id !== video.id);
		} catch (err) {
			// eslint-disable-next-line no-alert
			alert(`Failed to decline: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			busyVideoId = null;
		}
	}
</script>

{#if !loading && videos.length > 0}
	<section class="pending-gifts">
		<div class="head">
			<h2>🎁 New dive videos for you</h2>
			<span class="count">{videos.length}</span>
		</div>

		{#if loadError}
			<div class="error">Couldn't load gifts: {loadError}</div>
		{/if}

		<ul class="gift-list">
			{#each videos as video (video.id)}
				<li class="gift-card">
					<div class="gift-body">
						<div class="gift-title">
							{ownerNames[video.ownerId] ?? 'A coach'} sent you a
							<strong>{video.discipline}</strong> clip
						</div>
						<div class="gift-meta">
							{format(video.recordedAt.toDate(), 'EEE d MMM • HH:mm')}
							· {video.durationSeconds.toFixed(0)}s
							· {video.poolLength}m pool
						</div>
					</div>
					<div class="gift-actions">
						<button
							class="btn btn-ghost"
							disabled={busyVideoId === video.id}
							onclick={() => handleDecline(video)}
						>
							Decline
						</button>
						<button
							class="btn btn-primary"
							disabled={busyVideoId === video.id}
							onclick={() => handleReview(video)}
						>
							Review &amp; save
						</button>
					</div>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.pending-gifts {
		background: linear-gradient(135deg, rgba(20, 184, 166, 0.12), rgba(16, 185, 129, 0.1));
		border: 1px solid rgba(20, 184, 166, 0.3);
		border-radius: 12px;
		padding: 1rem 1.1rem;
		margin-bottom: 1.25rem;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}

	.head h2 {
		margin: 0;
		font-size: 1rem;
		color: var(--color-text);
	}

	.count {
		background: var(--color-primary);
		color: #0f172a;
		font-weight: 700;
		font-size: 0.8rem;
		border-radius: 999px;
		padding: 0.1rem 0.55rem;
	}

	.error {
		color: #ef4444;
		font-size: 0.85rem;
		margin-bottom: 0.5rem;
	}

	.gift-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.gift-card {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
		background: rgba(15, 23, 42, 0.6);
		border: 1px solid rgba(148, 163, 184, 0.15);
		border-radius: 10px;
		padding: 0.7rem 0.85rem;
	}

	.gift-title {
		font-weight: 600;
		color: var(--color-text);
	}

	.gift-meta {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		margin-top: 0.15rem;
	}

	.gift-actions {
		display: flex;
		gap: 0.4rem;
		flex-shrink: 0;
	}

	.btn {
		font: inherit;
		font-size: 0.85rem;
		padding: 0.45rem 0.75rem;
		border-radius: 8px;
		border: 1px solid transparent;
		cursor: pointer;
	}

	.btn-primary {
		background: var(--color-primary);
		color: #0f172a;
		font-weight: 600;
	}

	.btn-ghost {
		background: transparent;
		border-color: rgba(148, 163, 184, 0.3);
		color: var(--color-text-muted);
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
