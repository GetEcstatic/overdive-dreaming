<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { auth, googleProvider } from '$lib/firebase';
	import { signInWithPopup } from 'firebase/auth';
	import { user, loading } from '$lib/stores/auth';
	import { onAuthStateChanged } from 'firebase/auth';

	let signingIn = false;
	let error = '';

	onMount(() => {
		const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
			user.set(firebaseUser);
			loading.set(false);

			if (firebaseUser) {
				goto('/dashboard');
			}
		});

		return unsubscribe;
	});

	async function handleGoogleSignIn() {
		try {
			signingIn = true;
			error = '';
			await signInWithPopup(auth, googleProvider);
			// User will be redirected by onAuthStateChanged
		} catch (err: any) {
			console.error('Error signing in:', err);
			error = err.message || 'Failed to sign in. Please try again.';
			signingIn = false;
		}
	}
</script>

{#if $loading}
	<div class="loading-screen">
		<div class="loading-spinner"></div>
		<p class="loading-text">Loading...</p>
	</div>
{:else if !$user}
	<div class="landing-page">
		<div class="hero-section">
			<h1 class="app-title">Overdive Dreaming</h1>
			<p class="tagline">Track your freediving journey</p>

			{#if error}
				<div class="error-message">
					{error}
				</div>
			{/if}

			<button
				onclick={handleGoogleSignIn}
				disabled={signingIn}
				class="google-signin-btn"
			>
				<svg class="google-icon" viewBox="0 0 24 24">
					<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
					<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
					<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
					<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
				</svg>
				{signingIn ? 'Signing in...' : 'Sign in with Google'}
			</button>
		</div>

		<div class="features-section">
			<h2 class="features-title">Features</h2>
			<div class="features-grid">
				<div class="feature-card">
					<svg class="feature-icon" viewBox="0 0 24 24" fill="none" stroke="url(#gradient)" stroke-width="2">
						<defs>
							<linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
								<stop offset="0%" style="stop-color:var(--color-primary);stop-opacity:1" />
								<stop offset="100%" style="stop-color:var(--color-secondary);stop-opacity:1" />
							</linearGradient>
						</defs>
						<path d="M3 3v18h18M7 16l4-4 4 4 6-6"/>
					</svg>
					<h3 class="feature-title">Track Progress</h3>
					<p class="feature-description">Monitor your improvements over time with detailed analytics</p>
				</div>
				<div class="feature-card">
					<svg class="feature-icon" viewBox="0 0 24 24" fill="none" stroke="url(#gradient2)" stroke-width="2">
						<defs>
							<linearGradient id="gradient2" x1="0%" y1="0%" x2="100%" y2="100%">
								<stop offset="0%" style="stop-color:var(--color-primary);stop-opacity:1" />
								<stop offset="100%" style="stop-color:var(--color-secondary);stop-opacity:1" />
							</linearGradient>
						</defs>
						<!-- Clipboard/notepad -->
						<rect x="7" y="4" width="10" height="16" rx="1" stroke-width="2"/>
						<path d="M9 2h6v3H9z" fill="url(#gradient2)" stroke="none"/>
						<!-- Checklist lines -->
						<path d="M10 9h4M10 12h4M10 15h4" stroke-width="2" stroke-linecap="round"/>
					</svg>
					<h3 class="feature-title">Log Dives</h3>
					<p class="feature-description">Record STA, DYN, DNF, DYNB and custom training routines</p>
				</div>
				<div class="feature-card">
					<svg class="feature-icon" viewBox="0 0 24 24" fill="none" stroke="url(#gradient3)" stroke-width="2">
						<defs>
							<linearGradient id="gradient3" x1="0%" y1="0%" x2="100%" y2="100%">
								<stop offset="0%" style="stop-color:var(--color-primary);stop-opacity:1" />
								<stop offset="100%" style="stop-color:var(--color-secondary);stop-opacity:1" />
							</linearGradient>
						</defs>
						<circle cx="12" cy="8" r="3"/>
						<circle cx="6" cy="16" r="3"/>
						<circle cx="18" cy="16" r="3"/>
						<path d="M9.5 14.5L10.5 11M14.5 11l1 3.5"/>
					</svg>
					<h3 class="feature-title">Share & Compare</h3>
					<p class="feature-description">Connect with other freedivers and share your journey</p>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Loading Screen */
	.loading-screen {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		background: var(--color-bg);
	}

	.loading-spinner {
		width: 50px;
		height: 50px;
		border: 4px solid rgba(20, 184, 166, 0.1);
		border-top: 4px solid var(--color-primary);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.loading-text {
		margin-top: 1rem;
		font-size: 1.125rem;
		color: var(--color-primary);
	}

	/* Landing Page */
	.landing-page {
		min-height: 100vh;
		background: var(--color-bg);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2rem;
	}

	/* Hero Section */
	.hero-section {
		text-align: center;
		max-width: 600px;
		margin-bottom: 4rem;
	}

	.app-title {
		font-size: 3.5rem;
		font-weight: 700;
		margin-bottom: 1rem;
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		line-height: 1.2;
	}

	.tagline {
		font-size: 1.5rem;
		color: var(--color-text-muted);
		margin-bottom: 2.5rem;
	}

	/* Error Message */
	.error-message {
		margin-bottom: 1.5rem;
		padding: 1rem 1.5rem;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.5);
		border-radius: 8px;
		color: #fca5a5;
		font-size: 0.875rem;
	}

	/* Google Sign In Button */
	.google-signin-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 2rem;
		background: white;
		color: #1f2937;
		font-size: 1rem;
		font-weight: 600;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s ease;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}

	.google-signin-btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
	}

	.google-signin-btn:active {
		transform: translateY(0);
	}

	.google-signin-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
	}

	.google-icon {
		width: 20px;
		height: 20px;
	}

	/* Features Section */
	.features-section {
		max-width: 1000px;
		width: 100%;
	}

	.features-title {
		font-size: 2rem;
		font-weight: 700;
		text-align: center;
		color: var(--color-text);
		margin-bottom: 2rem;
	}

	.features-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1.5rem;
	}

	.feature-card {
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.1);
		border-radius: 12px;
		padding: 2rem;
		text-align: center;
		transition: all 0.3s ease;
	}

	.feature-card:hover {
		transform: translateY(-4px);
		border-color: rgba(148, 163, 184, 0.2);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
	}

	.feature-icon {
		width: 64px;
		height: 64px;
		margin: 0 auto 1.5rem;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.feature-title {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: 0.75rem;
	}

	.feature-description {
		font-size: 0.875rem;
		color: var(--color-text-muted);
		line-height: 1.6;
	}

	/* Mobile Responsiveness */
	@media (max-width: 640px) {
		.app-title {
			font-size: 2.5rem;
		}

		.tagline {
			font-size: 1.125rem;
		}

		.features-grid {
			grid-template-columns: 1fr;
		}

		.landing-page {
			padding: 1rem;
		}

		.hero-section {
			margin-bottom: 2rem;
		}
	}
</style>
