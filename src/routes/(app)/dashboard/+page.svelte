<script lang="ts">
	import { user } from '$lib/stores/auth';
	import { getRecentActivityPaginated, getPublicActivityPaginated, getPublicUserProfile, getLogCountInDays, getRoutineOrPlaceholder } from '$lib/firestore';
	import { type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore';
	import type { PersonalBests, Discipline, PersonalBestRecord, PersonalBestRecords } from '$lib/types';
	import SessionCard from '$lib/components/SessionCard.svelte';
	import PendingGifts from '$lib/components/PendingGifts.svelte';
	import { getUserPBRecords, getUserPBs, formatPBRecord } from '$lib/utils/personalBests';
	import { onMount } from 'svelte';
	import { getDashboardCache, updateDashboardCache, type LogWithRoutine } from '$lib/utils/dashboardCache';

	type FeedMode = 'mine' | 'community';

	let feedMode = $state<FeedMode>('mine');
	let personalSessions: LogWithRoutine[] = $state([]);
	let communitySessions: LogWithRoutine[] = $state([]);
	const sessions = $derived.by(() => (feedMode === 'mine' ? personalSessions : communitySessions));
	let loading = $state(true);
	let loadingMore = $state(false);
	let error = $state<string | null>(null);
	let personalBests = $state<PersonalBests | undefined>(undefined);
	let personalBestRecords = $state<PersonalBestRecords | undefined>(undefined);
	let thisWeekCount = $state(0);
	let last30DaysCount = $state(0);
	let personalLastDoc: QueryDocumentSnapshot<DocumentData> | null = $state(null);
	let communityLastDoc: QueryDocumentSnapshot<DocumentData> | null = $state(null);
	let personalHasMore = $state(true);
	let communityHasMore = $state(true);
	const lastDoc = $derived.by(() => (feedMode === 'mine' ? personalLastDoc : communityLastDoc));
	const hasMore = $derived.by(() => (feedMode === 'mine' ? personalHasMore : communityHasMore));
	let feedContainer: HTMLElement | undefined = $state();
	let loadMoreSentinel: HTMLDivElement | undefined = $state();
	let observer: IntersectionObserver | null = null;
	let lastRefreshAt = 0;
	const dashboardCacheTtlMs = 2 * 60 * 1000;
	const profileCache = new Map<string, { displayName: string; photoURL?: string }>();
	const feedTitle = $derived.by(() => (feedMode === 'community' ? 'Community Sessions' : 'Recent Sessions'));
	const emptyTitle = $derived.by(() => (feedMode === 'community' ? 'No community sessions yet' : 'No sessions yet'));
	const emptyText = $derived.by(() =>
		feedMode === 'community'
			? 'Public dives will appear here once people share them'
			: 'Start logging your dives to see them here'
	);
	const standardPBRecords = $derived.by(() =>
		Object.values(personalBestRecords ?? {})
			.filter((record) => record.isStandard)
			.sort((a, b) => disciplineOrder(a.discipline) - disciplineOrder(b.discipline))
	);
	// Disciplines that have a legacy `personalBests[discipline]` value but no
	// standard PB record yet. Without this, those legacy PBs disappear from the
	// dashboard as soon as any per-category record (e.g. an O2-assisted STA) is
	// written, because the existing fallback only triggers when the records
	// array is completely empty.
	const legacyOnlyDisciplines = $derived.by<Discipline[]>(() => {
		if (!personalBests) return [];
		const covered = new Set(standardPBRecords.map((r) => r.discipline));
		return (['STA', 'DYN', 'DNF', 'DYNB'] as Discipline[]).filter(
			(d) => !covered.has(d) && personalBests?.[d] !== undefined
		);
	});
	const specialPBRecords = $derived.by(() =>
		Object.values(personalBestRecords ?? {})
			.filter((record) => !record.isStandard)
			.sort((a, b) => disciplineOrder(a.discipline) - disciplineOrder(b.discipline) || a.categoryLabel.localeCompare(b.categoryLabel))
	);

	function setFeedMode(mode: FeedMode) {
		feedMode = mode;
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('feedMode', mode);
		}
		if (mode === 'community' && communitySessions.length === 0) {
			fetchCommunitySessions();
		}
	}

	async function fetchPersonalSessions(options: { silent?: boolean } = {}) {
		if (!$user) return;

		try {
			if (!options.silent) {
				loading = true;
				error = null;
			}

			// Query recent routine logs with pagination (initial load: 20 items)
			const result = await getRecentActivityPaginated($user.uid, 20);

			const sessionsData: LogWithRoutine[] = [];

			// Fetch routine template for each log (includes placeholder for deleted routines)
			for (const log of result.logs) {
				const routine = await getRoutineOrPlaceholder(log.routineId);
				sessionsData.push({ log, routine });
			}

			// Calculate "This Week" count using server query (accurate count)
			thisWeekCount = await getLogCountInDays($user.uid, 7);

			personalSessions = sessionsData;
			personalLastDoc = result.lastDoc;
			personalHasMore = result.hasMore;
			updateDashboardCache($user.uid, {
				personalSessions: sessionsData,
				personalLastDoc: result.lastDoc,
				personalHasMore: result.hasMore,
				thisWeekCount
			});
		} catch (err) {
			console.error('Error fetching sessions:', err);
			if (!options.silent) {
				error = `Failed to load recent sessions: ${err instanceof Error ? err.message : String(err)}`;
			}
		} finally {
			if (!options.silent) {
				loading = false;
			}
		}
	}

	async function fetchCommunitySessions(options: { silent?: boolean } = {}) {
		if (!$user) return;

		try {
			if (!options.silent) {
				loading = true;
				error = null;
			}

			const result = await getPublicActivityPaginated(20);
			const sessionsData: LogWithRoutine[] = [];

			for (const log of result.logs) {
				const routine = await getRoutineOrPlaceholder(log.routineId);
				if (!log.authorDisplayName) {
					let profile = profileCache.get(log.userId);
					if (!profile) {
						const publicProfile = await getPublicUserProfile(log.userId);
						if (publicProfile) {
							profile = {
								displayName: publicProfile.displayName,
								photoURL: publicProfile.photoURL ?? undefined
							};
							profileCache.set(log.userId, profile);
						}
					}
					if (profile) {
						log.authorDisplayName = profile.displayName;
						log.authorPhotoURL = profile.photoURL;
					}
				}
				sessionsData.push({ log, routine });
			}

			communitySessions = sessionsData;
			communityLastDoc = result.lastDoc;
			communityHasMore = result.hasMore;
			updateDashboardCache($user.uid, {
				communitySessions: sessionsData,
				communityLastDoc: result.lastDoc,
				communityHasMore: result.hasMore
			});
		} catch (err) {
			console.error('Error fetching community sessions:', err);
			if (!options.silent) {
				error = `Failed to load community sessions: ${err instanceof Error ? err.message : String(err)}`;
			}
		} finally {
			if (!options.silent) {
				loading = false;
			}
		}
	}

	async function loadMorePersonalSessions() {
		if (!$user || !personalHasMore || loadingMore || !personalLastDoc) return;

		try {
			loadingMore = true;

			// Load next 10 items
			const result = await getRecentActivityPaginated($user.uid, 10, personalLastDoc);

			const newSessionsData: LogWithRoutine[] = [];

			// Fetch routine template for each log (includes placeholder for deleted routines)
			for (const log of result.logs) {
				const routine = await getRoutineOrPlaceholder(log.routineId);
				if (!log.authorDisplayName) {
					let profile = profileCache.get(log.userId);
					if (!profile) {
						const publicProfile = await getPublicUserProfile(log.userId);
						if (publicProfile) {
							profile = {
								displayName: publicProfile.displayName,
								photoURL: publicProfile.photoURL ?? undefined
							};
							profileCache.set(log.userId, profile);
						}
					}
					if (profile) {
						log.authorDisplayName = profile.displayName;
						log.authorPhotoURL = profile.photoURL;
					}
				}
				newSessionsData.push({ log, routine });
			}

			// Append new sessions to existing ones
			personalSessions = [...personalSessions, ...newSessionsData];
			personalLastDoc = result.lastDoc;
			personalHasMore = result.hasMore;
			updateDashboardCache($user.uid, {
				personalSessions,
				personalLastDoc,
				personalHasMore
			});
		} catch (err) {
			console.error('Error loading more sessions:', err);
		} finally {
			loadingMore = false;
		}
	}

	async function loadMoreCommunitySessions() {
		if (!$user || !communityHasMore || loadingMore || !communityLastDoc) return;

		try {
			loadingMore = true;

			const result = await getPublicActivityPaginated(10, communityLastDoc);
			const newSessionsData: LogWithRoutine[] = [];

			for (const log of result.logs) {
				const routine = await getRoutineOrPlaceholder(log.routineId);
				newSessionsData.push({ log, routine });
			}

			communitySessions = [...communitySessions, ...newSessionsData];
			communityLastDoc = result.lastDoc;
			communityHasMore = result.hasMore;
			updateDashboardCache($user.uid, {
				communitySessions,
				communityLastDoc,
				communityHasMore
			});
		} catch (err) {
			console.error('Error loading community sessions:', err);
		} finally {
			loadingMore = false;
		}
	}

	function loadMoreSessions() {
		if (feedMode === 'community') {
			loadMoreCommunitySessions();
			return;
		}
		loadMorePersonalSessions();
	}

	async function fetchPBs() {
		if (!$user) return;

		try {
			personalBests = await getUserPBs($user.uid);
			personalBestRecords = await getUserPBRecords($user.uid);
		} catch (err) {
			console.error('Error fetching PBs:', err);
		}
	}

	function disciplineOrder(discipline: Discipline): number {
		return ['STA', 'DYN', 'DNF', 'DYNB'].indexOf(discipline);
	}

	function formatLegacyPB(discipline: Discipline, value: number): string {
		if (discipline === 'STA') {
			return `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, '0')}`;
		}
		return `${value}m`;
	}

	function formatRecordValue(record: PersonalBestRecord): string {
		return formatPBRecord(record).replace(`${record.categoryLabel}: `, '');
	}

	async function fetch30DayCount() {
		if (!$user) return;
		try {
			last30DaysCount = await getLogCountInDays($user.uid, 30);
			updateDashboardCache($user.uid, { last30DaysCount });
		} catch (err) {
			console.error('Error fetching 30-day count:', err);
		}
	}

	onMount(() => {
		const savedMode = typeof localStorage !== 'undefined' ? localStorage.getItem('feedMode') : null;
		if (savedMode === 'community') {
			feedMode = 'community';
		}

		if ($user) {
			const cached = getDashboardCache($user.uid);
			if (cached) {
				personalSessions = cached.personalSessions;
				communitySessions = cached.communitySessions;
				personalLastDoc = cached.personalLastDoc;
				communityLastDoc = cached.communityLastDoc;
				personalHasMore = cached.personalHasMore;
				communityHasMore = cached.communityHasMore;
				thisWeekCount = cached.thisWeekCount;
				last30DaysCount = cached.last30DaysCount;
				loading = false;
			}
			const isStale = !cached?.fetchedAt || Date.now() - cached.fetchedAt > dashboardCacheTtlMs;
			if (isStale) {
				fetchPersonalSessions({ silent: !!cached });
				fetch30DayCount();
				if (feedMode === 'community') {
					fetchCommunitySessions({ silent: !!cached });
				}
			} else {
				// Always refresh the 30-day count in the background even if cache isn't stale
				// This ensures the count stays accurate
				fetch30DayCount();
			}
		}
		fetchPBs();

		const refreshSessions = () => {
			if (loading || loadingMore) return;
			const now = Date.now();
			if (now - lastRefreshAt < 1500) return;
			lastRefreshAt = now;
			fetchPersonalSessions({ silent: true });
			fetch30DayCount();
			if (feedMode === 'community') {
				fetchCommunitySessions({ silent: true });
			}
		};

		const handleVisibilityChange = () => {
			if (document.visibilityState === 'visible') {
				refreshSessions();
			}
		};

		window.addEventListener('focus', refreshSessions);
		document.addEventListener('visibilitychange', handleVisibilityChange);

		return () => {
			window.removeEventListener('focus', refreshSessions);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	});

	$effect(() => {
		if (!loadMoreSentinel) return;

		observer?.disconnect();
		observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					loadMoreSessions();
				}
			},
			{ rootMargin: '300px' }
		);
		observer.observe(loadMoreSentinel);

		return () => observer?.disconnect();
	});
</script>

{#if $user}
	<div class="content-wrapper" bind:this={feedContainer}>
		<!-- Page Header -->
		<h1 class="page-heading">Your Freediving Journey</h1>

		<!-- Pending dive-video gifts -->
		<PendingGifts />

		<!-- Summary Stats Card -->
		<div class="summary-card">
				<h2 class="summary-title">Training Overview</h2>
				<div class="stats-grid">
					<div class="stat-box">
						<div class="stat-label">Last 30 Days</div>
						<div class="stat-value primary">{last30DaysCount}</div>
					</div>
					<div class="stat-box">
						<div class="stat-label">This Week</div>
						<div class="stat-value secondary">{thisWeekCount}</div>
					</div>

						<!-- Standard PBs -->
						{#if standardPBRecords.length > 0}
							{#each standardPBRecords as record (record.key)}
								<div class="stat-box">
									<div class="stat-label">{record.categoryLabel} PB</div>
									<div class="stat-value primary">{formatRecordValue(record)}</div>
								</div>
							{/each}
							<!-- Legacy PB values for disciplines not yet covered by a standard record -->
							{#each legacyOnlyDisciplines as discipline (discipline)}
								{@const value = personalBests?.[discipline]}
								{#if value !== undefined}
									<div class="stat-box">
										<div class="stat-label">{discipline} PB</div>
										<div class="stat-value primary">{formatLegacyPB(discipline, value)}</div>
									</div>
								{/if}
							{/each}
						{:else if personalBests}
							{#each ['STA', 'DYN', 'DNF', 'DYNB'] as discipline}
								{@const value = personalBests[discipline as Discipline]}
								{#if value !== undefined}
									<div class="stat-box">
										<div class="stat-label">{discipline} PB</div>
										<div class="stat-value primary">{formatLegacyPB(discipline as Discipline, value)}</div>
									</div>
								{/if}
							{/each}
						{/if}

						<!-- Show placeholder if no PBs yet -->
						{#if standardPBRecords.length === 0 && (!personalBests || (personalBests.STA === undefined && personalBests.DYN === undefined && personalBests.DNF === undefined && personalBests.DYNB === undefined))}
							<div class="stat-box">
								<div class="stat-label">Personal Bests</div>
								<div class="stat-value primary">—</div>
							</div>
						{/if}
						{#each specialPBRecords as record (record.key)}
							<div class="stat-box special-pb">
								<div class="stat-label">{record.categoryLabel} PB</div>
								<div class="stat-value secondary">{formatRecordValue(record)}</div>
							</div>
						{/each}
					</div>
				</div>

			<div class="gradient-divider"></div>

			<!-- Recent Sessions Feed -->
			<section class="sessions-section">
				<div class="section-header">
					<h2 class="section-title">{feedTitle}</h2>
					<div class="feed-toggle">
						<button
							type="button"
							class:active={feedMode === 'mine'}
							onclick={() => setFeedMode('mine')}
						>
							My Sessions
						</button>
						<button
							type="button"
							class:active={feedMode === 'community'}
							onclick={() => setFeedMode('community')}
						>
							Community
						</button>
					</div>
				</div>

				{#if loading}
					<!-- Loading State -->
					<div class="flex items-center justify-center py-12">
						<div class="text-center">
							<div
								class="inline-block w-8 h-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mb-2"
							></div>
							<p class="text-[var(--color-text-muted)]">Loading sessions...</p>
						</div>
					</div>
				{:else if error}
					<!-- Error State -->
					<div class="bg-red-900/20 border border-red-500/50 rounded-lg p-6 text-center">
						<p class="text-red-400">{error}</p>
						<button
							onclick={() =>
								feedMode === 'community' ? fetchCommunitySessions() : fetchPersonalSessions()
							}
							class="mt-4 px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:opacity-80 transition"
						>
							Try Again
						</button>
					</div>
				{:else if sessions.length === 0}
					<!-- Empty State -->
					<div class="empty-state">
						<div class="empty-icon">🏊‍♂️</div>
						<h3 class="empty-title">{emptyTitle}</h3>
						<p class="empty-text">{emptyText}</p>
						{#if feedMode === 'mine'}
							<a href="/dives" class="empty-cta">Log Your First Dive</a>
						{/if}
					</div>
				{:else}
					<!-- Sessions Feed -->
					<div class="flex flex-col gap-6">
						{#each sessions as { log, routine }}
							<SessionCard {log} {routine} />
						{/each}
					</div>

					<!-- Load More Indicator -->
					{#if loadingMore}
						<div class="flex items-center justify-center py-8">
							<div class="text-center">
								<div
									class="inline-block w-6 h-6 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mb-2"
								></div>
								<p class="text-sm text-[var(--color-text-muted)]">Loading more...</p>
							</div>
						</div>
					{:else if !hasMore && sessions.length > 0}
						<div class="flex items-center justify-center py-8">
							<p class="text-sm text-[var(--color-text-muted)]">
								You've reached the end • {sessions.length} sessions total
							</p>
						</div>
					{/if}

					{#if hasMore}
						<div
							bind:this={loadMoreSentinel}
							class="load-more-sentinel"
							aria-hidden="true"
						></div>
					{/if}
				{/if}
		</section>
	</div>
{/if}

<style>
	/* Content Wrapper */
	.content-wrapper {
		display: flex;
		flex-direction: column;
		gap: 0;
	}
	/* Page Heading */
	.page-heading {
		font-size: 1.75rem;
		font-weight: 600;
		background: linear-gradient(135deg, var(--color-primary), #00FFFF);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		margin-bottom: 1.5rem;
		letter-spacing: -0.01em;
	}
	/* Summary Stats Card - distinct dark design */
	.summary-card {
		background: linear-gradient(
			145deg,
			rgba(6, 12, 18, 0.95),
			rgba(10, 18, 26, 0.9)
		);
		border: 1px solid rgba(20, 184, 166, 0.3);
		border-radius: 16px;
		padding: 1.25rem;
		margin-bottom: 2rem;
		box-shadow:
			0 8px 24px rgba(0, 0, 0, 0.4),
			inset 0 1px 0 rgba(20, 184, 166, 0.1);
	}

	.summary-title {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-primary);
		margin-bottom: 1rem;
		text-align: left;
		text-transform: uppercase;
		letter-spacing: 0.12em;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
	}

	@media (max-width: 640px) {
		.stats-grid {
			grid-template-columns: repeat(2, 1fr);
			gap: 0.5rem;
		}
	}

	.stat-box {
		text-align: center;
		padding: 0.625rem 0.5rem;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 10px;
		border: 1px solid rgba(20, 184, 166, 0.15);
		transition: all 0.2s ease;
	}

	.stat-box:hover {
		background: rgba(20, 184, 166, 0.08);
		border-color: rgba(20, 184, 166, 0.3);
	}

	.stat-label {
		font-size: 0.625rem;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.25rem;
		font-weight: 500;
	}

	.stat-value {
		font-size: 1.25rem;
		font-weight: 700;
		line-height: 1.2;
	}

	.stat-value.primary {
		color: var(--color-primary);
	}

	.stat-value.secondary {
		color: var(--color-secondary);
	}

	/* Sessions Section */
	.sessions-section {
		margin-top: 0;
		padding-bottom: 3.5rem; /* Extra space for bottom nav */
	}

	.load-more-sentinel {
		height: 1px;
	}

	.section-title {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-text);
		padding-left: 0.25rem;
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.feed-toggle {
		display: inline-flex;
		background: rgba(15, 23, 42, 0.5);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 999px;
		padding: 0.25rem;
		gap: 0.25rem;
	}

	.feed-toggle button {
		background: transparent;
		border: none;
		color: var(--color-text-muted);
		padding: 0.35rem 0.9rem;
		border-radius: 999px;
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
		transition: color 0.2s ease, background 0.2s ease;
	}

	.feed-toggle button.active {
		background: rgba(20, 184, 166, 0.2);
		color: #99f6e4;
	}

	@media (max-width: 640px) {
		.section-header {
			flex-direction: column;
			align-items: flex-start;
		}
	}

	@media (max-width: 768px) {
		.stat-value {
			font-size: 1.75rem;
		}
	}

	/* Empty State */
	.empty-state {
		background: linear-gradient(
			135deg,
			rgba(20, 184, 166, 0.05),
			rgba(16, 185, 129, 0.05)
		);
		border: 1px solid rgba(148, 163, 184, 0.15);
		border-radius: 12px;
		padding: 3rem 2rem;
		text-align: center;
		margin-bottom: 2rem;
	}

	.empty-icon {
		font-size: 4rem;
		line-height: 1;
		margin-bottom: 1.5rem;
		animation: float 3s ease-in-out infinite;
	}

	@keyframes float {
		0%, 100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-10px);
		}
	}

	.empty-title {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-text);
		margin-bottom: 0.75rem;
	}

	.empty-text {
		font-size: 1rem;
		color: var(--color-text-muted);
		margin-bottom: 2rem;
		max-width: 400px;
		margin-left: auto;
		margin-right: auto;
	}

	.empty-cta {
		display: inline-block;
		padding: 0.875rem 2rem;
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
		color: white;
		font-weight: 600;
		font-size: 1rem;
		border-radius: 8px;
		text-decoration: none;
		transition: all 0.2s ease;
		box-shadow: 0 4px 12px rgba(20, 184, 166, 0.3);
	}

	.empty-cta:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 16px rgba(20, 184, 166, 0.4);
	}

	.empty-cta:active {
		transform: translateY(0);
	}
</style>
