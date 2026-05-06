<script lang="ts">
	import type { RoutineLog, RoutineTemplate } from '$lib/types';
	import { getFormattedMetric } from '$lib/utils/metrics';
	import { getYouTubeEmbedUrl } from '$lib/storage';
	import { formatTimeOfDay } from '$lib/utils/sessions';
	import { format, formatDistanceToNow } from 'date-fns';
	import { goto } from '$app/navigation';
	import { user } from '$lib/stores/auth';
	import { db } from '$lib/firebase';
	import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
	import { getPublicUserProfilesByIds } from '$lib/firestore';
	import { shareCard } from '$lib/utils/shareCard';
	import { formatAttemptBadge } from '$lib/utils/attemptCategories';
	import { formatGroupParticipants } from '$lib/utils/groupParticipants';
	import { getWasabiReadUrl } from '$lib/media/client';
	import { onMount } from 'svelte';
	import { diveVideoBehavior } from '$lib/stores/videoPlayback';
	import CommentSection from '$lib/components/CommentSection.svelte';
	import DiveVideoPlayer from '$lib/components/DiveVideoPlayer.svelte';
	import {
		listDiveVideosForSession,
		getDiveVideoThumbnailUrl,
		getPreferredDiveVideoPlaybackUrl
	} from '$lib/services/diveVideos';
	import type { DiveVideo } from '$lib/types';

	let {
		log,
		routine
	}: {
		log: RoutineLog;
		routine: RoutineTemplate;
	} = $props();

	// Mobile visibility state for intersection observer
	let cardElement: HTMLElement | null = $state(null);
	let isMobileFocused = $state(false);

	// Set up IntersectionObserver for mobile focus effect
	onMount(() => {
		// Only enable on devices that don't have hover capability (true mobile/touch devices)
		// Using 'hover: none' is the most reliable way to detect this
		const isNoHoverDevice = window.matchMedia('(hover: none)').matches;
		
		if (isNoHoverDevice && cardElement) {
			const observer = new IntersectionObserver(
				(entries) => {
					entries.forEach((entry) => {
						// Card is "focused" when it's at least 60% visible in the viewport
						isMobileFocused = entry.intersectionRatio >= 0.6;
					});
				},
				{
					threshold: [0, 0.3, 0.6, 0.9, 1.0],
					rootMargin: '-10% 0px -10% 0px' // Shrink the effective viewport to catch center cards
				}
			);
			
			observer.observe(cardElement);
			
			return () => {
				observer.disconnect();
			};
		}
	});

	// Get hero and secondary metrics from routine's displayConfig
	const heroMetric = $derived(getFormattedMetric(
		routine.displayConfig.heroMetric,
		routine.displayConfig.heroMetricLabel,
		log,
		routine
	));

	const secondaryMetric = $derived(getFormattedMetric(
		routine.displayConfig.secondaryMetric,
		routine.displayConfig.secondaryMetricLabel,
		log,
		routine
	));

	const tertiaryMetric = $derived(
		routine.displayConfig.tertiaryMetric && routine.displayConfig.tertiaryMetricLabel
			? getFormattedMetric(
					routine.displayConfig.tertiaryMetric,
					routine.displayConfig.tertiaryMetricLabel,
					log,
					routine
				)
			: null
	);

	const isOwner = $derived($user?.uid === log.userId);
	const displayName = $derived(
		isOwner ? ($user?.displayName ?? log.authorDisplayName ?? 'User') : (log.authorDisplayName ?? 'Diver')
	);
	const displayPhoto = $derived(
		isOwner ? ($user?.photoURL ?? log.authorPhotoURL) : log.authorPhotoURL
	);
	const displayInitial = $derived(displayName?.charAt(0) ?? 'U');

	const sessionTags = $derived.by(() => {
		const tags: string[] = [];
		if (log.isCompetition) tags.push('Comp');
		if (log.compeitionOrg) tags.push(log.compeitionOrg.toUpperCase());
		if (log.cardTag) {
			const cardLabels: Record<string, string> = {
				white: '⬜️',
				yellow: '🟨',
				red: '🟥'
			};
			tags.push(cardLabels[log.cardTag] ?? log.cardTag);
		}
		if (log.recordTag) tags.push(log.recordTag);
		return tags;
	});

	// Format timestamps
	const timeAgo = $derived(formatDistanceToNow(log.date.toDate(), { addSuffix: true }));
	const fullDate = $derived(format(log.date.toDate(), 'MMM d, yyyy'));
	const fullTime = $derived(format(log.date.toDate(), 'h:mm a'));

	// RPE and Joy emoji mapping
	const rpeEmoji = '💪';
	const joyEmoji = '😊';

	// Notes preview for tooltip
	const notesPreview = $derived.by(() => {
		if (!log.notes) return null;
		const trimmed = log.notes.trim();
		if (trimmed.length <= 100) return trimmed;
		return trimmed.slice(0, 100) + '…';
	});

	// Like state - initialize from Firestore (intentionally capture initial value)
	let likeCount = $state((() => log.likes?.length ?? 0)());
	let isLiked = $state((() => log.likes?.includes($user?.uid ?? '') ?? false)());
	let showFlowList = $state(false);
	let flowProfiles = $state<{ userId: string; displayName: string }[]>([]);
	let flowLoading = $state(false);
	let flowError = $state<string | null>(null);
	let flowIdsCacheKey = $state('');

	async function toggleLike() {
		if (!$user) return;

		const newIsLiked = !isLiked;

		// Optimistic update
		isLiked = newIsLiked;
		likeCount += newIsLiked ? 1 : -1;

		try {
			// Update Firestore
			const logRef = doc(db, 'routineLogs', log.id);

			if (newIsLiked) {
				await updateDoc(logRef, {
					likes: arrayUnion($user.uid)
				});
			} else {
				await updateDoc(logRef, {
					likes: arrayRemove($user.uid)
				});
			}
		} catch (error) {
			// Revert optimistic update on error
			console.error('Error toggling like:', error);
			isLiked = !newIsLiked;
			likeCount += newIsLiked ? -1 : 1;
		}
	}

	async function openFlowList(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();

		if (showFlowList) {
			showFlowList = false;
			return;
		}

		showFlowList = true;
		flowError = null;

		const ids = log.likes ?? [];
		const cacheKey = ids.join(',');
		if (cacheKey === flowIdsCacheKey && flowProfiles.length > 0) return;

		if (ids.length === 0) {
			flowProfiles = [];
			flowIdsCacheKey = cacheKey;
			return;
		}

		try {
			flowLoading = true;
			const profiles = await getPublicUserProfilesByIds(ids);
			const profileMap = new Map(profiles.map((profile) => [profile.userId, profile.displayName]));
			const displayNames = ids
				.map((id) => {
					if ($user?.uid === id && $user.displayName) return $user.displayName;
					return profileMap.get(id) ?? 'Unknown';
				})
				.map((name, index) => ({ userId: ids[index], displayName: name }));

			flowProfiles = displayNames;
			flowIdsCacheKey = cacheKey;
		} catch (error) {
			console.error('Failed to load flow users:', error);
			flowError = 'Unable to load users';
		} finally {
			flowLoading = false;
		}
	}

	function closeFlowList(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		showFlowList = false;
	}

	// Share state
	let isGeneratingShare = $state(false);

	// Comment state
	let showComments = $state(false);
	let commentCount = $state(log.commentCount ?? 0);
	const attemptBadge = $derived(formatAttemptBadge(log));

	// "Logged as group" indicator — names of co-participants captured at
	// log time. Falls back to a "with N others" label for legacy logs
	// that only have a count.
	const groupLabel = $derived(
		formatGroupParticipants({
			authorDisplayName: log.authorDisplayName ?? displayName,
			participantNames: log.groupRoutineParticipantNames,
			participantCount: log.groupRoutineParticipantCount
		})
	);

	function toggleComments(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		showComments = !showComments;
	}

	async function handleShare(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (isGeneratingShare) return;

		isGeneratingShare = true;
		try {
			await shareCard(
				{ log, routine, userName: displayName },
				{}
			);
		} catch (error) {
			console.error('Failed to generate share card:', error);
		} finally {
			isGeneratingShare = false;
		}
	}

	// Dive video preview (dynamic disciplines only). Loads any DiveVideo
	// doc linked to this routineLog id and, if uploaded, resolves a download
	// URL so we can render an inline <video> in the feed card. See
	// docs/Dynamic video feature.md — feed-level preview complements the
	// full HUD playback on the session detail page.
	const isDynamicDiscipline = $derived(
		log.disciplineUsed === 'DYN' ||
			log.disciplineUsed === 'DYNB' ||
			log.disciplineUsed === 'DNF'
	);
	let diveVideo = $state<DiveVideo | null>(null);
	let diveVideoUrl = $state<string | null>(null);
	let diveVideoPosterUrl = $state<string | null>(null);
	let sessionPhotoUrl = $state<string | null>(log.photoUrl ?? null);
	const showDiveVideoUploadStatus = $derived(
		diveVideo?.uploadStatus === 'pending' ||
			diveVideo?.uploadStatus === 'uploading' ||
			diveVideo?.uploadStatus === 'failed'
	);

	onMount(() => {
		if (log.photoObject?.provider !== 'wasabi') return;
		let cancelled = false;
		(async () => {
			try {
				const read = await getWasabiReadUrl({
					kind: 'session-photo',
					routineLogId: log.id,
					key: log.photoObject?.key,
					bucket: log.photoObject?.bucket
				});
				if (!cancelled) sessionPhotoUrl = read.url;
			} catch (err) {
				console.warn('[SessionCard] failed to resolve photo URL', err);
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	onMount(() => {
		if (!isDynamicDiscipline) return;
		let cancelled = false;
		(async () => {
			try {
				const videos = await listDiveVideosForSession(log.id);
				if (cancelled || videos.length === 0) return;
				// Prefer the pinned one, else newest.
				const pick =
					videos.find((v) => v.retentionTier === 'pinned') ?? videos[0];
				diveVideo = pick;
				if (pick.uploadStatus === 'uploaded') {
					const url = await getPreferredDiveVideoPlaybackUrl(pick);
					if (!cancelled) diveVideoUrl = url;
					if (pick.thumbnailObject || pick.thumbnailPath) {
						const posterUrl = await getDiveVideoThumbnailUrl(pick).catch(() => null);
						if (!cancelled) diveVideoPosterUrl = posterUrl;
					}
				}
			} catch (err) {
				console.warn('[SessionCard] failed to load dive video preview', err);
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	// Card-level navigation. We render the card as a role="link" div (not an
	// <a>) so the inline dive-video player can receive taps without the
	// surrounding anchor hijacking the gesture on mobile Safari. Any click
	// whose target is inside the .dive-video region is ignored here and left
	// to the native <video controls> to handle.
	function isInsideVideo(el: EventTarget | null): boolean {
		if (!(el instanceof Element)) return false;
		return el.closest('.dive-video') !== null;
	}
	function handleCardClick(e: MouseEvent): void {
		if (isInsideVideo(e.target)) return;
		// Buttons / popovers inside the card already call stopPropagation, so
		// if we reach here it's a neutral region of the card → navigate.
		void goto(`/session/${log.id}`);
	}
	function handleCardKey(e: KeyboardEvent): void {
		if (e.key !== 'Enter' && e.key !== ' ') return;
		if (isInsideVideo(e.target)) return;
		e.preventDefault();
		void goto(`/session/${log.id}`);
	}

</script>

<div class="card-wrapper">
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="card-link"
	role="link"
	tabindex="0"
	bind:this={cardElement}
	onclick={handleCardClick}
	onkeydown={handleCardKey}
>
	<div class="session-card" class:mobile-focused={isMobileFocused} class:comments-open={showComments}>
	<!-- Header with profile info -->
	<div class="card-header">
		<div class="profile-section">
			{#if displayPhoto}
				<img src={displayPhoto} alt={displayName} class="profile-pic" />
			{:else}
				<div class="profile-pic-placeholder">
					{displayInitial}
				</div>
			{/if}
			<div class="profile-info">
				<div class="user-name">{displayName}</div>
				{#if groupLabel}
					<div class="group-label" title="Logged as group">
						<svg
							class="group-icon"
							viewBox="0 0 24 24"
							fill="currentColor"
							aria-hidden="true"
						>
							<path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
						</svg>
						<span>{groupLabel}</span>
					</div>
				{/if}
				<div class="session-meta">
					<span class="date">{fullDate}</span>
					{#if log.timeOfDay}
						<span class="separator">•</span>
						<span class="time-of-day">{formatTimeOfDay(log.timeOfDay)}</span>
					{/if}
					<span class="separator">•</span>
					<span class="time">{fullTime}</span>
					<span class="separator">•</span>
					<span class="time-ago">{timeAgo}</span>
				</div>
			</div>
		</div>
		<div class="routine-meta">
			<span class="routine-name">{routine.name}</span>
				<span class="separator">•</span>
				<span class="discipline">{log.disciplineUsed}</span>
				{#if attemptBadge}
					<span class="attempt-badge">{attemptBadge}</span>
				{/if}
			</div>
		{#if sessionTags.length > 0}
			<div class="session-tags">
				{#each sessionTags as tag}
					<span class="session-tag">{tag}</span>
				{/each}
			</div>
		{/if}
		<div class="gradient-line"></div>
	</div>

	<!-- Notes preview section -->
	{#if notesPreview}
		<div class="notes-preview">
			<span class="notes-text">"{notesPreview}"</span>
		</div>
	{/if}

	<!-- Hero Metric -->
	<div class="hero-section">
		<div class="hero-label">{heroMetric.label}</div>
		<div class="hero-value">{heroMetric.value}</div>
	</div>

	<!-- Secondary Metric, RPE, Joy in boxes -->
	<div class="metrics-row">
		<div class="metric-box">
			<div class="metric-label">{secondaryMetric.label}</div>
			<div class="metric-value">{secondaryMetric.value}</div>
		</div>

		{#if tertiaryMetric}
			<div class="metric-box">
				<div class="metric-label">{tertiaryMetric.label}</div>
				<div class="metric-value">{tertiaryMetric.value}</div>
			</div>
		{/if}

		<div class="metric-box">
			<div class="metric-label">{rpeEmoji} RPE</div>
			<div class="metric-value">{log.rpe ?? '—'}</div>
		</div>

		<div class="metric-box">
			<div class="metric-label">{joyEmoji} Joy</div>
			<div class="metric-value">{log.joyScale ?? '—'}</div>
		</div>
	</div>

	<!-- Media Section -->
	{#if sessionPhotoUrl || log.youtubeUrl || diveVideoUrl || showDiveVideoUploadStatus}
		<div class="media-section">
			{#if diveVideoUrl}
				<!--
				  The `.dive-video` marker class is used by handleCardClick /
				  handleCardKey to ignore taps in this region so the native
				  <video controls> stays fully interactive.
				-->
				<div class="dive-video">
					{#if diveVideo}
						<!--
						  Render the full DiveVideoPlayer in the feed so the
						  landscape-rotation fullscreen behavior matches the
						  session detail page exactly (same component, same
						  props). Rotating the phone to landscape promotes
						  this card's video to pseudo-fullscreen, gated by
						  the IntersectionObserver so only the on-screen
						  card takes over.
						-->
						<DiveVideoPlayer
							video={diveVideo}
							srcUrl={diveVideoUrl}
							posterUrl={diveVideoPosterUrl ?? undefined}
							fullscreenOnPlay
						/>
					{:else}
						<!-- svelte-ignore a11y_media_has_caption -->
						<video
							src={diveVideoUrl}
							poster={diveVideoPosterUrl ?? undefined}
							class="dive-video-player"
							controls
							playsinline
							preload="metadata"
							use:diveVideoBehavior={{ allowPortraitPlayFullscreen: true }}
						></video>
					{/if}
				</div>
			{:else if diveVideo && showDiveVideoUploadStatus}
				<div class="dive-video">
					<div class="upload-status-card" class:failed={diveVideo.uploadStatus === 'failed'}>
						<div class="upload-status-icon" aria-hidden="true">
							{diveVideo.uploadStatus === 'failed' ? '!' : 'UP'}
						</div>
						<div>
							<div class="upload-status-label">
								{diveVideo.uploadStatus === 'failed' ? 'Upload failed' : 'Video uploading'}
							</div>
							<div class="upload-status-sub">
								{diveVideo.uploadStatus === 'failed'
									? "We'll retry next time you're online."
									: 'Leave the app open to finish this upload.'}
							</div>
						</div>
					</div>
				</div>
			{/if}

			{#if sessionPhotoUrl}
				<div class="session-photo">
					<img src={sessionPhotoUrl} alt="Session" class="photo-image" />
				</div>
			{/if}

			{#if log.youtubeUrl}
				<div class="youtube-embed">
					<iframe
						src={getYouTubeEmbedUrl(log.youtubeUrl) || ''}
						title="Session Video"
						frameborder="0"
						allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
						allowfullscreen
						class="youtube-iframe"
					></iframe>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Like/Kudos Footer -->
	<div class="card-footer">
		<div class="footer-left">
			<button
				class="like-button"
				class:liked={isLiked}
				onclick={(e) => { e.preventDefault(); e.stopPropagation(); toggleLike(); }}
				aria-label="Like this session"
			>
				<svg class="like-icon" viewBox="0 0 24 24" fill="currentColor">
					<path
						d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
					/>
				</svg>
				<span class="like-text">Flow</span>
			</button>
			<button class="like-count" onclick={openFlowList}>
			{likeCount} {likeCount === 1 ? 'flow' : 'flows'}
		</button>
		{#if showFlowList}
			<div class="flow-popover" onclick={(event) => event.stopPropagation()}>
				<div class="flow-popover-header">
					<span>Flows</span>
					<button type="button" class="flow-close" onclick={closeFlowList}>×</button>
				</div>
				{#if flowLoading}
					<div class="flow-status">Loading...</div>
				{:else if flowError}
					<div class="flow-status error">{flowError}</div>
				{:else if flowProfiles.length === 0}
					<div class="flow-status">No flows yet</div>
				{:else}
					<div class="flow-list">
						{#each flowProfiles as profile}
							<div class="flow-item">{profile.displayName}</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
		</div>
		<button
			class="comment-button"
			class:active={showComments}
			onclick={toggleComments}
			aria-label="Toggle comments"
		>
			<svg class="comment-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
			</svg>
			{#if commentCount > 0}
				<span class="comment-count">{commentCount}</span>
			{/if}
		</button>
		<button
			class="share-button"
			onclick={handleShare}
			disabled={isGeneratingShare}
			aria-label="Share this session"
		>
			{#if isGeneratingShare}
				<span class="share-spinner"></span>
			{:else}
				<svg class="share-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
					<polyline points="16 6 12 2 8 6"></polyline>
					<line x1="12" y1="2" x2="12" y2="15"></line>
				</svg>
			{/if}
		</button>
	</div>
	</div>
</div>
<!-- Inline comment panel (outside card-link div to avoid nested interactive elements) -->
{#if showComments}
	<div class="comment-panel">
		<CommentSection
			routineLogId={log.id}
			onCountChange={(n) => { commentCount = n; }}
		/>
	</div>
{/if}
</div>

<style>
	.card-wrapper {
		margin-bottom: 1.5rem;
	}

	.card-wrapper:last-child {
		margin-bottom: 0;
	}

	.card-link {
		display: block;
		text-decoration: none;
		color: inherit;
	}

	.session-card {
		background: var(--color-bg-card);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		border: 1px solid var(--color-border, rgba(100, 116, 139, 0.15));
		border-radius: 12px;
		overflow: hidden;
		transition: all 0.2s ease;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		cursor: pointer;
	}

	.session-card.comments-open {
		border-radius: 12px 12px 0 0;
		border-bottom: none;
	}

	/* Hover effect - cyan border on desktop */
	.card-link:hover .session-card {
		border-color: #00FFFF;
		box-shadow: 0 4px 16px rgba(0, 255, 255, 0.15);
		transform: translateY(-2px);
	}

	/* Mobile focus effect - cyan border when card is prominently visible (only on devices without hover) */
	@media (hover: none) {
		.session-card.mobile-focused {
			border-color: #00FFFF;
			box-shadow: 0 4px 16px rgba(0, 255, 255, 0.15);
		}
	}

	/* Header */
	.card-header {
		padding: 1rem;
		padding-bottom: 0.75rem;
	}

	.session-tags {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
		margin-top: 0.5rem;
		margin-bottom: 0.6rem;
	}

	.session-tag {
		border: 1px solid rgba(56, 189, 248, 0.4);
		background: rgba(56, 189, 248, 0.12);
		color: #e0f2fe;
		border-radius: 999px;
		padding: 0.2rem 0.5rem;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	/* Profile Section */
	.profile-section {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
	}

	.profile-pic {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		object-fit: cover;
		border: 2px solid rgba(148, 163, 184, 0.2);
	}

	.profile-pic-placeholder {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--color-primary);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 1.125rem;
		color: white;
		border: 2px solid rgba(148, 163, 184, 0.2);
	}

	.profile-info {
		flex: 1;
	}

	.user-name {
		color: var(--color-text);
		font-weight: 600;
		font-size: 0.9375rem;
		margin-bottom: 0.125rem;
	}

	.group-label {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin-bottom: 0.125rem;
	}

	.group-icon {
		width: 0.875rem;
		height: 0.875rem;
		flex-shrink: 0;
		opacity: 0.85;
	}

	.session-meta {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		flex-wrap: wrap;
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.time-of-day {
		color: var(--color-primary);
		font-weight: 600;
	}

	.date {
		color: var(--color-text-muted);
	}

	.time {
		color: var(--color-text-muted);
	}

	.time-ago {
		color: var(--color-text-muted);
	}

	/* Routine Meta */
	.routine-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		font-size: 0.875rem;
		margin-bottom: 0.75rem;
		padding-left: 0.25rem;
	}

	.routine-name {
		color: var(--color-text);
		font-weight: 600;
	}

	.separator {
		color: var(--color-text-muted);
	}

	.discipline {
		color: var(--color-primary);
		font-weight: 500;
		text-transform: uppercase;
		font-size: 0.75rem;
		letter-spacing: 0.05em;
	}

	.attempt-badge {
		border: 1px solid rgba(20, 184, 166, 0.35);
		border-radius: 999px;
		padding: 0.15rem 0.45rem;
		background: rgba(20, 184, 166, 0.1);
		color: #99f6e4;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.gradient-line {
		height: 2px;
		background: linear-gradient(
			to right,
			var(--color-primary),
			var(--color-secondary),
			transparent
		);
		border-radius: 2px;
	}

	/* Notes Preview */
	.notes-preview {
		padding: 0.5rem 1rem 0;
	}

	.notes-preview .notes-text {
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		font-style: italic;
		line-height: 1.4;
		opacity: 0.85;
	}

	/* Hero Section */
	.hero-section {
		padding: 2rem 1rem;
		text-align: center;
		border-bottom: 1px solid rgba(148, 163, 184, 0.1);
	}

	.hero-label {
		color: var(--color-text-muted);
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		margin-bottom: 0.5rem;
		font-weight: 500;
	}

	.hero-value {
		color: var(--color-text);
		font-size: 2.5rem;
		font-weight: 700;
		line-height: 1;
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	/* Metrics Row */
	.metrics-row {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.75rem;
		padding: 1rem;
	}

	.metric-box {
		background: rgba(15, 23, 42, 0.5);
		border: 1px solid rgba(148, 163, 184, 0.1);
		border-radius: 8px;
		padding: 0.75rem 0.5rem;
		text-align: center;
		transition: all 0.2s ease;
	}

	.metric-box:hover {
		background: rgba(15, 23, 42, 0.7);
		border-color: rgba(148, 163, 184, 0.2);
	}

	.metric-label {
		color: var(--color-text-muted);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.25rem;
		font-weight: 500;
	}

	.metric-value {
		color: var(--color-text);
		font-size: 1.125rem;
		font-weight: 600;
		line-height: 1.2;
	}

	/* Footer with Like Button */
	.card-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-top: 1px solid rgba(148, 163, 184, 0.1);
		background: rgba(15, 23, 42, 0.3);
		position: relative;
	}

	.like-button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: transparent;
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 6px;
		padding: 0.5rem 0.75rem;
		color: var(--color-text-muted);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.like-button:hover {
		background: rgba(148, 163, 184, 0.05);
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.like-button.liked {
		background: rgba(20, 184, 166, 0.1);
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.like-button.liked .like-icon {
		fill: var(--color-primary);
	}

	.like-icon {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		transition: fill 0.2s ease;
	}

	.like-button.liked .like-icon {
		fill: var(--color-primary);
		stroke: var(--color-primary);
	}

	.like-count {
		color: var(--color-text-muted);
		font-size: 0.875rem;
		font-weight: 500;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
	}

	.footer-left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		position: relative;
	}

	.comment-button {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		background: transparent;
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 6px;
		padding: 0.5rem 0.625rem;
		color: var(--color-text-muted);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.comment-button:hover,
	.comment-button.active {
		background: rgba(148, 163, 184, 0.05);
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.comment-icon {
		width: 16px;
		height: 16px;
	}

	.comment-count {
		font-size: 0.8125rem;
	}

	.comment-panel {
		padding: 0.75rem 1rem 1rem;
		border-top: 1px solid rgba(148, 163, 184, 0.1);
		background: var(--color-bg-card);
		border: 1px solid var(--color-border, rgba(100, 116, 139, 0.15));
		border-top: none;
		border-radius: 0 0 12px 12px;
	}

	.share-button {
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 6px;
		padding: 0.5rem;
		color: var(--color-text-muted);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.share-button:hover {
		background: rgba(148, 163, 184, 0.05);
		border-color: var(--color-secondary);
		color: var(--color-secondary);
	}

	.share-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.share-icon {
		width: 18px;
		height: 18px;
	}

	.share-spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(148, 163, 184, 0.3);
		border-top-color: var(--color-secondary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.flow-popover {
		position: absolute;
		left: 0;
		bottom: 3.1rem;
		width: 220px;
		background: rgba(12, 18, 28, 0.96);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 10px;
		padding: 0.75rem;
		box-shadow: 0 12px 30px rgba(2, 6, 23, 0.45);
		z-index: 5;
	}

	.flow-popover-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: 0.5rem;
	}

	.flow-close {
		background: none;
		border: none;
		color: var(--color-text-muted);
		font-size: 1rem;
		cursor: pointer;
	}

	.flow-list {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		max-height: 180px;
		overflow-y: auto;
	}

	.flow-item {
		font-size: 0.8125rem;
		color: var(--color-text);
	}

	.flow-status {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}

	.flow-status.error {
		color: #f87171;
	}

	/* Media Section */
	.media-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 0 1rem 1rem 1rem;
	}

	.session-photo {
		border-radius: 8px;
		overflow: hidden;
		border: 1px solid rgba(148, 163, 184, 0.1);
	}

	.photo-image {
		width: 100%;
		height: auto;
		display: block;
	}

	.youtube-embed {
		position: relative;
		width: 100%;
		padding-bottom: 56.25%; /* 16:9 aspect ratio */
		border-radius: 8px;
		overflow: hidden;
		background: rgba(15, 23, 42, 0.5);
	}

	.youtube-iframe {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		border: none;
	}

	.dive-video {
		border-radius: 8px;
		overflow: hidden;
		background: rgba(15, 23, 42, 0.6);
		border: 1px solid rgba(148, 163, 184, 0.1);
	}

	.dive-video-player {
		width: 100%;
		height: auto;
		display: block;
		background: black;
	}

	.upload-status-card {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.95rem 1rem;
		border: 1px dashed rgba(20, 184, 166, 0.35);
		border-radius: 8px;
		background: rgba(20, 184, 166, 0.08);
		cursor: default;
	}

	.upload-status-card.failed {
		border-color: rgba(239, 68, 68, 0.4);
		background: rgba(239, 68, 68, 0.08);
	}

	.upload-status-icon {
		width: 2rem;
		height: 2rem;
		border-radius: 999px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
		background: rgba(20, 184, 166, 0.18);
		color: var(--color-primary);
		font-weight: 800;
	}

	.upload-status-card.failed .upload-status-icon {
		background: rgba(239, 68, 68, 0.18);
		color: #fca5a5;
	}

	.upload-status-label {
		font-weight: 650;
		color: var(--color-text);
		font-size: 0.9rem;
	}

	.upload-status-sub {
		color: var(--color-text-muted);
		font-size: 0.8rem;
		line-height: 1.35;
		margin-top: 0.1rem;
	}

	/* Desktop enhancements */
	@media (min-width: 768px) {
		.card-header {
			padding: 1.25rem 1.5rem;
			padding-bottom: 1rem;
		}

		.hero-section {
			padding: 2.5rem 1.5rem;
		}

		.hero-value {
			font-size: 3rem;
		}

		.metrics-row {
			padding: 1.25rem 1.5rem;
			gap: 1rem;
		}

		.metric-box {
			padding: 1rem 0.75rem;
		}

		.metric-value {
			font-size: 1.25rem;
		}

		.card-footer {
			padding: 1rem 1.5rem;
		}

		.profile-pic,
		.profile-pic-placeholder {
			width: 48px;
			height: 48px;
		}
	}

	/* Mobile adjustments */
	@media (max-width: 640px) {
		.hero-value {
			font-size: 2rem;
		}

		.metrics-row {
			gap: 0.5rem;
			padding: 0.75rem;
		}

		.metric-box {
			padding: 0.5rem 0.25rem;
		}

		.metric-label {
			font-size: 0.65rem;
		}

		.metric-value {
			font-size: 1rem;
		}

		.profile-pic,
		.profile-pic-placeholder {
			width: 36px;
			height: 36px;
		}

		.session-meta {
			font-size: 0.7rem;
		}

		.like-button {
			padding: 0.4rem 0.6rem;
			font-size: 0.8125rem;
		}

		.like-icon {
			width: 16px;
			height: 16px;
		}

		.media-section {
			padding: 0 0.75rem 0.75rem 0.75rem;
		}

		.photo-image {
			height: auto;
		}
	}
</style>
