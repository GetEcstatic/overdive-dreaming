<script lang="ts">
	import type { RoutineLog, RoutineTemplate } from '$lib/types';
	import { getFormattedMetric } from '$lib/utils/metrics';
	import { getYouTubeEmbedUrl } from '$lib/storage';
	import { formatTimeOfDay } from '$lib/utils/sessions';
	import { format, formatDistanceToNow } from 'date-fns';
	import { user } from '$lib/stores/auth';
	import { db } from '$lib/firebase';
	import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
	import { getPublicUserProfilesByIds } from '$lib/firestore';

	let {
		log,
		routine
	}: {
		log: RoutineLog;
		routine: RoutineTemplate;
	} = $props();

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

</script>

<a href="/session/{log.id}" class="card-link">
	<div class="session-card">
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
	{#if log.photoUrl || log.youtubeUrl}
		<div class="media-section">
			{#if log.photoUrl}
				<div class="session-photo">
					<img src={log.photoUrl} alt="Session" class="photo-image" />
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
	</div>
</a>

<style>
	.card-link {
		display: block;
		text-decoration: none;
		color: inherit;
		margin-bottom: 1.5rem;
	}

	.card-link:last-child {
		margin-bottom: 0;
	}

	.session-card {
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.1);
		border-radius: 12px;
		overflow: hidden;
		transition: all 0.2s ease;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		cursor: pointer;
	}

	.card-link:hover .session-card {
		border-color: rgba(148, 163, 184, 0.2);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		transform: translateY(-2px);
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
		grid-template-columns: repeat(3, 1fr);
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

	.flow-popover {
		position: absolute;
		right: 1rem;
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
