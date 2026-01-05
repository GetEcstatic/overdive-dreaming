<script lang="ts">
	import { user } from '$lib/stores/auth';
	import { getRecentActivityPaginated } from '$lib/firestore';
	import { doc, getDoc, collection, query, where, getDocs, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore';
	import { db } from '$lib/firebase';
	import type { RoutineLog, RoutineTemplate, PersonalBests, Discipline } from '$lib/types';
	import SessionCard from '$lib/components/SessionCard.svelte';
	import { getUserPBs, updateUserPB, checkIsPB } from '$lib/utils/personalBests';
	import { onMount } from 'svelte';

	interface LogWithRoutine {
		log: RoutineLog;
		routine: RoutineTemplate;
	}

	let sessions: LogWithRoutine[] = $state([]);
	let loading = $state(true);
	let loadingMore = $state(false);
	let error = $state<string | null>(null);
	let personalBests = $state<PersonalBests | undefined>(undefined);
	let thisWeekCount = $state(0);
	let lastDoc: QueryDocumentSnapshot<DocumentData> | null = $state(null);
	let hasMore = $state(true);
	let feedContainer: HTMLElement | undefined = $state();
	let loadMoreSentinel: HTMLDivElement | undefined = $state();
	let observer: IntersectionObserver | null = null;

	async function fetchRecentSessions() {
		if (!$user) return;

		try {
			loading = true;
			error = null;

			// Query recent routine logs with pagination (initial load: 20 items)
			const result = await getRecentActivityPaginated($user.uid, 20);

			const sessionsData: LogWithRoutine[] = [];

			// Fetch routine template for each log
			for (const log of result.logs) {
				// Fetch the associated routine template
				const routineRef = doc(db, 'routines', log.routineId);
				const routineSnap = await getDoc(routineRef);

				if (routineSnap.exists()) {
					const routine = { id: routineSnap.id, ...routineSnap.data() } as RoutineTemplate;
					sessionsData.push({ log, routine });
				}
			}

			// Calculate "This Week" count (last 7 days)
			const oneWeekAgo = Date.now() / 1000 - 7 * 24 * 60 * 60; // 7 days in seconds
			thisWeekCount = sessionsData.filter(
				(item) => item.log.date.seconds >= oneWeekAgo
			).length;

			sessions = sessionsData;
			lastDoc = result.lastDoc;
			hasMore = result.hasMore;

			console.log(`Displaying ${sessions.length} routine logs in feed (hasMore: ${hasMore})`);
		} catch (err) {
			console.error('Error fetching sessions:', err);
			error = `Failed to load recent sessions: ${err instanceof Error ? err.message : String(err)}`;
		} finally {
			loading = false;
		}
	}

	async function loadMoreSessions() {
		if (!$user || !hasMore || loadingMore || !lastDoc) return;

		try {
			loadingMore = true;

			// Load next 10 items
			const result = await getRecentActivityPaginated($user.uid, 10, lastDoc);

			const newSessionsData: LogWithRoutine[] = [];

			// Fetch routine template for each log
			for (const log of result.logs) {
				const routineRef = doc(db, 'routines', log.routineId);
				const routineSnap = await getDoc(routineRef);

				if (routineSnap.exists()) {
					const routine = { id: routineSnap.id, ...routineSnap.data() } as RoutineTemplate;
					newSessionsData.push({ log, routine });
				}
			}

			// Append new sessions to existing ones
			sessions = [...sessions, ...newSessionsData];
			lastDoc = result.lastDoc;
			hasMore = result.hasMore;

			console.log(`Loaded ${newSessionsData.length} more sessions (total: ${sessions.length}, hasMore: ${hasMore})`);
		} catch (err) {
			console.error('Error loading more sessions:', err);
		} finally {
			loadingMore = false;
		}
	}

	// Infinite scroll detection
	function handleScroll() {
		if (!feedContainer || !hasMore || loadingMore) return;

		const { scrollTop, scrollHeight, clientHeight } = feedContainer;
		const scrolledToBottom = scrollTop + clientHeight >= scrollHeight - 300; // Trigger 300px before bottom

		if (scrolledToBottom) {
			loadMoreSessions();
		}
	}

	async function fetchPBs() {
		if (!$user) return;

		try {
			personalBests = await getUserPBs($user.uid);
		} catch (err) {
			console.error('Error fetching PBs:', err);
		}
	}

	// Helper function to recalculate PB for a discipline from all max attempts
	async function recalculatePBForDiscipline(discipline: Discipline) {
		if (!$user) return;

		try {
			// Query all routine logs for this user and discipline
			const logsRef = collection(db, 'routineLogs');
			const q = query(logsRef, where('userId', '==', $user.uid), where('disciplineUsed', '==', discipline));

			const logsSnapshot = await getDocs(q);

			// Find the maximum value from all max attempt logs
			let maxValue = 0;

			for (const logDoc of logsSnapshot.docs) {
				const log = logDoc.data() as RoutineLog;

				// Get the routine to check if it's a max attempt
				const routineRef = doc(db, 'routines', log.routineId);
				const routineSnap = await getDoc(routineRef);

				if (routineSnap.exists()) {
					const routine = routineSnap.data() as RoutineTemplate;
					const isMaxAttempt =
						routine.tags.includes('max-attempt') || routine.tags.includes('pb');

					if (isMaxAttempt) {
						// Get the result value
						const result = discipline === 'STA' ? log.totalTime : log.totalDistance;

						if (result !== undefined && result > maxValue) {
							maxValue = result;
						}
					}
				}
			}

			// Update the user's PB with the recalculated value
			if (maxValue > 0) {
				await updateUserPB($user.uid, discipline, maxValue);
			}

			// Refetch PBs to update the UI
			await fetchPBs();
		} catch (err) {
			console.error('Error recalculating PB:', err);
		}
	}

	onMount(() => {
		fetchRecentSessions();
		fetchPBs();
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
	<div class="content-wrapper" bind:this={feedContainer} onscroll={handleScroll}>
		<!-- Summary Stats Card -->
		<div class="summary-card">
				<h2 class="summary-title">Training Overview</h2>
				<div class="stats-grid">
					<div class="stat-box">
						<div class="stat-label">Recent Dives</div>
						<div class="stat-value primary">{sessions.length}</div>
					</div>
					<div class="stat-box">
						<div class="stat-label">This Week</div>
						<div class="stat-value secondary">{thisWeekCount}</div>
					</div>

					<!-- Personal Bests - show all disciplines with PBs -->
					{#if personalBests}
						{#if personalBests.STA !== undefined}
							<div class="stat-box">
								<div class="stat-label">STA PB</div>
								<div class="stat-value primary">
									{Math.floor(personalBests.STA / 60)}:{(Math.floor(personalBests.STA % 60)).toString().padStart(2, '0')}
								</div>
							</div>
						{/if}
						{#if personalBests.DYN !== undefined}
							<div class="stat-box">
								<div class="stat-label">DYN PB</div>
								<div class="stat-value primary">{personalBests.DYN}m</div>
							</div>
						{/if}
						{#if personalBests.DNF !== undefined}
							<div class="stat-box">
								<div class="stat-label">DNF PB</div>
								<div class="stat-value primary">{personalBests.DNF}m</div>
							</div>
						{/if}
						{#if personalBests.DYNB !== undefined}
							<div class="stat-box">
								<div class="stat-label">DYNB PB</div>
								<div class="stat-value primary">{personalBests.DYNB}m</div>
							</div>
						{/if}
					{/if}

					<!-- Show placeholder if no PBs yet -->
					{#if !personalBests || (personalBests.STA === undefined && personalBests.DYN === undefined && personalBests.DNF === undefined && personalBests.DYNB === undefined)}
						<div class="stat-box">
							<div class="stat-label">Personal Bests</div>
							<div class="stat-value primary">—</div>
						</div>
					{/if}
				</div>
			</div>

			<div class="gradient-divider"></div>

			<!-- Recent Sessions Feed -->
			<section class="sessions-section">
				<h2 class="section-title">Recent Sessions</h2>

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
							onclick={() => fetchRecentSessions()}
							class="mt-4 px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:opacity-80 transition"
						>
							Try Again
						</button>
					</div>
				{:else if sessions.length === 0}
					<!-- Empty State -->
					<div class="empty-state">
						<div class="empty-icon">🏊‍♂️</div>
						<h3 class="empty-title">No sessions yet</h3>
						<p class="empty-text">Start logging your dives to see them here</p>
						<a href="/dives" class="empty-cta">Log Your First Dive</a>
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

	/* Summary Stats Card */
	.summary-card {
		background: linear-gradient(
			135deg,
			rgba(20, 184, 166, 0.12),
			rgba(16, 185, 129, 0.08)
		);
		border: 1px solid rgba(56, 189, 248, 0.35);
		border-radius: 16px;
		padding: 1.25rem;
		margin-bottom: 2rem;
		box-shadow:
			0 12px 32px rgba(15, 23, 42, 0.15),
			0 0 0 1px rgba(56, 189, 248, 0.2),
			0 0 20px rgba(56, 189, 248, 0.2);
	}

	.summary-title {
		font-size: 0.75rem;
		font-weight: 600;
		color: rgba(56, 189, 248, 0.9);
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
		background: rgba(15, 23, 42, 0.2);
		border-radius: 10px;
		border: 1px solid rgba(148, 163, 184, 0.12);
		transition: all 0.2s ease;
	}

	.stat-box:hover {
		background: rgba(15, 23, 42, 0.5);
		border-color: rgba(148, 163, 184, 0.2);
	}

	.stat-label {
		font-size: 0.625rem;
		color: rgba(125, 211, 252, 0.8);
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
		margin-bottom: 1.5rem;
		padding-left: 0.25rem;
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
