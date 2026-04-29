<!--
  /gift/[videoId]/+page.svelte
  Gift review screen for the giftee (athlete). Renders the coach-recorded
  DiveVideoPlayer with HUD overlay so the diver can preview their own dive,
  then exposes two CTAs:

    • "Save to my training" → calls acceptDiveGift Cloud Function which
      synthesises a RoutineLog server-side and re-links the video. On
      success we navigate to /session/{newRoutineLogId}.
    • "Decline" → flips giftStatus to 'declined' and returns to the feed.

  The athlete provides ZERO inputs here — every field that a routine log
  needs is already encoded in the DiveVideo's timeline + metadata. They
  can edit anything later from the session detail page.

  See docs/GIFTED_DIVE_ATTACH_PLAN.md (Phase 1).
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { user } from '$lib/stores/auth';
	import {
		acceptDiveGift,
		getDiveVideo,
		getDiveVideoDownloadUrl,
		updateDiveVideoGiftStatus
	} from '$lib/services/diveVideos';
	import { getPublicUserProfile } from '$lib/firestore';
	import DiveVideoPlayer from '$lib/components/DiveVideoPlayer.svelte';
	import { format } from 'date-fns';
	import type { DiveVideo } from '$lib/types';

	let video = $state<DiveVideo | null>(null);
	let srcUrl = $state<string>('');
	let coachName = $state<string>('A coach');
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let busy = $state<'accept' | 'decline' | null>(null);
	let actionError = $state<string | null>(null);

	const videoId = $derived($page.params.videoId);

	$effect(() => {
		const uid = $user?.uid;
		if (!uid || !videoId) return;
		void load(videoId, uid);
	});

	async function load(id: string, uid: string): Promise<void> {
		loading = true;
		loadError = null;
		try {
			const v = await getDiveVideo(id);
			if (!v) {
				loadError = 'Gift not found.';
				return;
			}
			if (v.athleteId !== uid) {
				loadError = 'This gift was sent to someone else.';
				return;
			}
			video = v;
			// Already accepted → jump to the existing routine log.
			if (v.giftStatus === 'accepted' && v.routineLogId) {
				void goto(`/session/${v.routineLogId}`);
				return;
			}
			if (v.giftStatus === 'declined') {
				loadError = 'You already declined this gift.';
				return;
			}
			const [resolvedUrl, profile] = await Promise.all([
				v.uploadStatus === 'uploaded'
					? getDiveVideoDownloadUrl(v).catch(() => '')
					: Promise.resolve(''),
				getPublicUserProfile(v.ownerId).catch(() => null)
			]);
			srcUrl = resolvedUrl;
			if (profile?.displayName) coachName = profile.displayName;
		} catch (err) {
			loadError = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}

	async function handleAccept(): Promise<void> {
		if (!video) return;
		busy = 'accept';
		actionError = null;
		try {
			const { routineLogId } = await acceptDiveGift(video.id);
			void goto(`/session/${routineLogId}`);
		} catch (err) {
			actionError = err instanceof Error ? err.message : String(err);
			busy = null;
		}
	}

	async function handleDecline(): Promise<void> {
		if (!video) return;
		if (!confirm('Decline this gift? The video will stay with the coach.')) return;
		busy = 'decline';
		actionError = null;
		try {
			await updateDiveVideoGiftStatus(video.id, 'declined');
			void goto('/dashboard');
		} catch (err) {
			actionError = err instanceof Error ? err.message : String(err);
			busy = null;
		}
	}
</script>

<svelte:head>
	<title>Gifted dive · Overdive</title>
</svelte:head>

<div class="gift-review">
	{#if loading}
		<div class="state-message">Loading gift…</div>
	{:else if loadError}
		<div class="state-error">
			<p>{loadError}</p>
			<button class="btn btn-secondary" onclick={() => goto('/dashboard')}>
				Back to feed
			</button>
		</div>
	{:else if video}
		<header class="review-header">
			<div class="badge">🎁 Gift from {coachName}</div>
			<h1>Your {video.discipline} dive</h1>
			<p class="meta">
				{format(video.recordedAt.toDate(), 'EEE d MMM yyyy · HH:mm')}
				· {video.durationSeconds.toFixed(0)}s
				· {video.poolLength}m pool
			</p>
		</header>

		<div class="player-shell">
			{#if srcUrl}
				<DiveVideoPlayer {video} {srcUrl} />
			{:else}
				<div class="state-message">Video is still uploading. Try again in a moment.</div>
			{/if}
		</div>

		<section class="explainer">
			<p>
				Tap <strong>Save to my training</strong> to add this as a logged dive.
				Distance, splits, time and pool length are filled in from what {coachName}
				captured — you can edit anything afterwards.
			</p>
		</section>

		{#if actionError}
			<div class="error">Couldn't save: {actionError}</div>
		{/if}

		<div class="actions">
			<button
				class="btn btn-ghost"
				disabled={busy !== null}
				onclick={handleDecline}
			>
				{busy === 'decline' ? 'Declining…' : 'Decline'}
			</button>
			<button
				class="btn btn-primary"
				disabled={busy !== null || !srcUrl}
				onclick={handleAccept}
			>
				{busy === 'accept' ? 'Saving…' : 'Save to my training'}
			</button>
		</div>
	{/if}
</div>

<style>
	.gift-review {
		max-width: 720px;
		margin: 0 auto;
		padding: 1rem 1rem 6rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.state-message,
	.state-error {
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.15);
		border-radius: 12px;
		padding: 1.25rem;
		text-align: center;
		color: var(--color-text-muted);
	}

	.state-error {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		align-items: center;
	}

	.review-header {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.badge {
		display: inline-block;
		align-self: flex-start;
		background: linear-gradient(135deg, rgba(20, 184, 166, 0.18), rgba(16, 185, 129, 0.14));
		border: 1px solid rgba(20, 184, 166, 0.35);
		color: var(--color-primary);
		font-size: 0.78rem;
		font-weight: 600;
		padding: 0.25rem 0.65rem;
		border-radius: 999px;
	}

	.review-header h1 {
		margin: 0;
		font-size: 1.4rem;
		color: var(--color-text);
	}

	.meta {
		margin: 0;
		color: var(--color-text-muted);
		font-size: 0.85rem;
	}

	.player-shell {
		background: #000;
		border-radius: 12px;
		overflow: hidden;
	}

	.explainer {
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.15);
		border-radius: 12px;
		padding: 0.85rem 1rem;
		color: var(--color-text-muted);
		font-size: 0.9rem;
	}

	.explainer p {
		margin: 0;
	}

	.error {
		color: #ef4444;
		font-size: 0.9rem;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 10px;
		padding: 0.6rem 0.85rem;
	}

	.actions {
		display: flex;
		gap: 0.6rem;
		justify-content: flex-end;
		position: sticky;
		bottom: 1rem;
		background: linear-gradient(180deg, transparent, var(--color-bg) 30%);
		padding-top: 0.75rem;
	}

	.actions .btn {
		flex: 1;
		max-width: 220px;
	}
</style>
