<script lang="ts">
	import { user } from '$lib/stores/auth';
	import { db } from '$lib/firebase';
	import { collection, query, getDocs, doc, getDoc, orderBy, limit } from 'firebase/firestore';
	import type { RoutineLog, RoutineTemplate } from '$lib/types';
	import SessionCard from '$lib/components/SessionCard.svelte';
	import { onMount } from 'svelte';

	interface SessionWithRoutine {
		log: RoutineLog;
		routine: RoutineTemplate;
	}

	let sessions: SessionWithRoutine[] = $state([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let mobileMenuOpen = $state(false);

	async function fetchRecentSessions() {
		if (!$user) return;

		try {
			loading = true;
			error = null;

			// Query user's sessions
			const sessionsQuery = query(
				collection(db, 'sessions'),
				orderBy('date', 'desc'),
				limit(10)
			);

			const sessionsSnapshot = await getDocs(sessionsQuery);
			const sessionsData: SessionWithRoutine[] = [];

			// For each session, get its routine logs
			for (const sessionDoc of sessionsSnapshot.docs) {
				const sessionData = sessionDoc.data();

				// Only process this user's sessions
				if (sessionData.userId !== $user.uid) continue;

				// Get routine logs for this session
				const routineLogsRef = collection(db, 'sessions', sessionDoc.id, 'routineLogs');
				const routineLogsSnapshot = await getDocs(routineLogsRef);

				// Process each routine log
				for (const logDoc of routineLogsSnapshot.docs) {
					const log = { id: logDoc.id, ...logDoc.data() } as RoutineLog;

					// Fetch the associated routine template
					const routineRef = doc(db, 'routines', log.routineId);
					const routineSnap = await getDoc(routineRef);

					if (routineSnap.exists()) {
						const routine = { id: routineSnap.id, ...routineSnap.data() } as RoutineTemplate;
						sessionsData.push({ log, routine });
					}
				}
			}

			// Sort by date descending
			sessionsData.sort((a, b) => b.log.date.seconds - a.log.date.seconds);

			// Take only the 10 most recent
			sessions = sessionsData.slice(0, 10);
		} catch (err) {
			console.error('Error fetching sessions:', err);
			error = `Failed to load recent sessions: ${err instanceof Error ? err.message : String(err)}`;
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		fetchRecentSessions();
	});
</script>

<div class="dashboard-container">
	<!-- Top Navigation Menu -->
	<nav class="top-nav">
		<div class="nav-content">
			<h1 class="nav-title">Overdive</h1>

			<!-- Hamburger Button (Mobile) -->
			<button
				class="hamburger"
				onclick={() => mobileMenuOpen = !mobileMenuOpen}
				aria-label="Toggle menu"
			>
				<span class="hamburger-line"></span>
				<span class="hamburger-line"></span>
				<span class="hamburger-line"></span>
			</button>

			<!-- Navigation Links -->
			<div class="nav-links" class:open={mobileMenuOpen}>
				<a href="/dashboard" class="nav-link active" onclick={() => mobileMenuOpen = false}>Feed</a>
				<a href="/analytics" class="nav-link" onclick={() => mobileMenuOpen = false}>Analytics</a>
				<a href="/dives" class="nav-link" onclick={() => mobileMenuOpen = false}>Log Dive</a>
				<a href="/profile" class="nav-link" onclick={() => mobileMenuOpen = false}>Profile</a>
			</div>
		</div>
	</nav>

	<div class="gradient-divider"></div>

	{#if $user}
		<div class="content-wrapper">
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
						<div class="stat-value secondary">0</div>
					</div>
					<div class="stat-box">
						<div class="stat-label">Personal Best</div>
						<div class="stat-value primary">—</div>
					</div>
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
					<div
						class="bg-[var(--color-bg-card)] border border-[rgba(148,163,184,0.1)] rounded-lg p-12 text-center"
					>
						<div class="text-4xl mb-4">🏊‍♂️</div>
						<h3 class="text-xl font-semibold mb-2 text-[var(--color-text)]">
							No sessions yet
						</h3>
						<p class="text-[var(--color-text-muted)] mb-6">
							Start logging your dives to see them here
						</p>
						<a
							href="/dives"
							class="inline-block px-6 py-3 bg-[var(--color-primary)] text-white rounded-lg hover:opacity-80 transition font-semibold"
						>
							Log Your First Dive
						</a>
					</div>
				{:else}
					<!-- Sessions Feed -->
					<div class="flex flex-col gap-6">
						{#each sessions as { log, routine }}
							<SessionCard {log} {routine} />
						{/each}
					</div>
				{/if}
			</section>
		</div>
	{/if}
</div>

<style>
	.dashboard-container {
		max-width: 896px;
		margin: 0 auto;
		padding: 1rem;
	}

	/* Tablet */
	@media (min-width: 768px) {
		.dashboard-container {
			padding: 1.5rem 3rem;
		}
	}

	/* Desktop */
	@media (min-width: 1024px) {
		.dashboard-container {
			padding: 1.5rem 4rem;
		}
	}

	/* Large Desktop */
	@media (min-width: 1280px) {
		.dashboard-container {
			padding: 1.5rem 6rem;
		}
	}

	/* Top Navigation */
	.top-nav {
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.1);
		border-radius: 12px;
		padding: 1rem 1.5rem;
		margin-bottom: 2rem;
	}

	.nav-content {
		display: flex;
		justify-content: space-between;
		align-items: center;
		position: relative;
	}

	.nav-title {
		font-size: 1.5rem;
		font-weight: 700;
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	/* Hamburger Menu Button */
	.hamburger {
		display: none;
		flex-direction: column;
		gap: 4px;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.5rem;
		z-index: 10;
	}

	.hamburger-line {
		width: 24px;
		height: 2px;
		background: var(--color-primary);
		border-radius: 2px;
		transition: all 0.3s ease;
	}

	/* Navigation Links */
	.nav-links {
		display: flex;
		gap: 0.5rem;
	}

	.nav-link {
		padding: 0.5rem 1rem;
		border-radius: 6px;
		color: var(--color-text-muted);
		text-decoration: none;
		font-size: 0.875rem;
		font-weight: 500;
		transition: all 0.2s ease;
	}

	.nav-link:hover {
		color: var(--color-text);
		background: rgba(148, 163, 184, 0.1);
	}

	.nav-link.active {
		color: var(--color-primary);
		background: rgba(20, 184, 166, 0.1);
	}

	/* Gradient Divider */
	.gradient-divider {
		height: 2px;
		background: linear-gradient(
			to right,
			transparent,
			var(--color-primary) 20%,
			var(--color-secondary) 50%,
			var(--color-primary) 80%,
			transparent
		);
		margin: 2rem 0;
		border-radius: 2px;
	}

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
			rgba(20, 184, 166, 0.05),
			rgba(16, 185, 129, 0.05)
		);
		border: 1px solid rgba(148, 163, 184, 0.15);
		border-radius: 12px;
		padding: 1.5rem;
		margin-bottom: 2rem;
	}

	.summary-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: 1.25rem;
		text-align: center;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
	}

	@media (max-width: 640px) {
		.stats-grid {
			grid-template-columns: 1fr;
			gap: 0.75rem;
		}
	}

	.stat-box {
		text-align: center;
		padding: 1rem;
		background: rgba(15, 23, 42, 0.3);
		border-radius: 8px;
		border: 1px solid rgba(148, 163, 184, 0.1);
	}

	.stat-label {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.5rem;
		font-weight: 500;
	}

	.stat-value {
		font-size: 2rem;
		font-weight: 700;
		line-height: 1;
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
	}

	.section-title {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-text);
		margin-bottom: 1.5rem;
		padding-left: 0.25rem;
	}

	/* Mobile Navigation (≤768px) */
	@media (max-width: 768px) {
		.hamburger {
			display: flex;
		}

		.nav-links {
			position: absolute;
			top: 100%;
			right: 0;
			margin-top: 1rem;
			flex-direction: column;
			background: var(--color-bg-card);
			border: 1px solid rgba(148, 163, 184, 0.15);
			border-radius: 8px;
			padding: 0.5rem;
			gap: 0.25rem;
			min-width: 200px;
			box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
			opacity: 0;
			pointer-events: none;
			transform: translateY(-10px);
			transition: all 0.3s ease;
		}

		.nav-links.open {
			opacity: 1;
			pointer-events: all;
			transform: translateY(0);
		}

		.nav-link {
			width: 100%;
			text-align: left;
			padding: 0.75rem 1rem;
		}

		.stat-value {
			font-size: 1.75rem;
		}
	}
</style>
