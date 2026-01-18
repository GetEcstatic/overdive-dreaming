<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { auth, googleProvider } from '$lib/firebase';
	import { signInWithPopup } from 'firebase/auth';
	import { user, loading } from '$lib/stores/auth';
	import { onAuthStateChanged } from 'firebase/auth';

	let signingIn = false;
	let error = '';
	let trainingCardRef: HTMLElement;
	let trainingCardFocused = false;

	onMount(() => {
		const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
			user.set(firebaseUser);
			loading.set(false);

			if (firebaseUser) {
				goto('/dashboard');
			}
		});

		// Mobile: IntersectionObserver for focus effect
		const isMobile = window.matchMedia('(hover: none)').matches;
		let observer: IntersectionObserver | null = null;
		
		if (isMobile && trainingCardRef) {
			observer = new IntersectionObserver(
				(entries) => {
					entries.forEach((entry) => {
						trainingCardFocused = entry.isIntersecting && entry.intersectionRatio >= 0.6;
					});
				},
				{ threshold: [0, 0.6, 1] }
			);
			observer.observe(trainingCardRef);
		}

		return () => {
			unsubscribe();
			observer?.disconnect();
		};
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
			<h1 class="app-title">Overdive</h1>
			<p class="tagline">Track deeper. Adapt faster. Dive better.</p>
		</div>

		<div class="services-section">
			<h2 class="services-title">Overdive Services</h2>
			<div class="services-grid">
				<div 
					bind:this={trainingCardRef}
					class="service-card service-card--training"
					class:focused={trainingCardFocused}
				>
					<svg class="service-icon" viewBox="0 0 24 24" fill="none" stroke="url(#gradient)" stroke-width="2">
						<defs>
							<linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
								<stop offset="0%" style="stop-color:var(--color-primary);stop-opacity:1" />
								<stop offset="100%" style="stop-color:var(--color-secondary);stop-opacity:1" />
							</linearGradient>
						</defs>
						<path d="M3 3v18h18M7 16l4-4 4 4 6-6"/>
					</svg>
					<h3 class="service-title">Training App</h3>
					<p class="service-description">Track your freediving progress with detailed analytics and training logs</p>
					<span class="service-status service-status--alpha">Private Alpha</span>
					
					{#if error}
						<div class="card-error">
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
				<a href="https://into-the-unknown.overdive.app" class="service-card service-card--active" target="_blank" rel="noopener">
					<svg class="service-icon" viewBox="0 0 24 24" fill="none" stroke="url(#gradient2)" stroke-width="2">
						<defs>
							<linearGradient id="gradient2" x1="0%" y1="0%" x2="100%" y2="100%">
								<stop offset="0%" style="stop-color:var(--color-primary);stop-opacity:1" />
								<stop offset="100%" style="stop-color:var(--color-secondary);stop-opacity:1" />
							</linearGradient>
						</defs>
						<circle cx="12" cy="12" r="9"/>
						<path d="M12 8v4l3 3"/>
					</svg>
					<h3 class="service-title">Into The Unknown</h3>
					<p class="service-description">Live competition results and event information</p>
					<span class="service-status service-status--live">Live</span>
				</a>
				<div class="service-card service-card--coming-soon">
					<svg class="service-icon" viewBox="0 0 24 24" fill="none" stroke="url(#gradient3)" stroke-width="2">
						<defs>
							<linearGradient id="gradient3" x1="0%" y1="0%" x2="100%" y2="100%">
								<stop offset="0%" style="stop-color:var(--color-primary);stop-opacity:1" />
								<stop offset="100%" style="stop-color:var(--color-secondary);stop-opacity:1" />
							</linearGradient>
						</defs>
						<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
						<circle cx="9" cy="7" r="4"/>
						<path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
					</svg>
					<h3 class="service-title">Coaches Portal</h3>
					<p class="service-description">Manage athletes, training plans, and team analytics</p>
					<span class="service-status service-status--soon">Coming Soon</span>
				</div>
				<div class="service-card service-card--coming-soon">
					<svg class="service-icon" viewBox="0 0 24 24" fill="none" stroke="url(#gradient4)" stroke-width="2">
						<defs>
							<linearGradient id="gradient4" x1="0%" y1="0%" x2="100%" y2="100%">
								<stop offset="0%" style="stop-color:var(--color-primary);stop-opacity:1" />
								<stop offset="100%" style="stop-color:var(--color-secondary);stop-opacity:1" />
							</linearGradient>
						</defs>
						<rect x="3" y="4" width="18" height="14" rx="2"/>
						<path d="M8 21h8M12 18v3"/>
					</svg>
					<h3 class="service-title">Comp Organisers</h3>
					<p class="service-description">Tools for running freediving competitions</p>
					<span class="service-status service-status--soon">Coming Soon</span>
				</div>
				<div class="service-card service-card--coming-soon">
					<svg class="service-icon" viewBox="0 0 24 24" fill="none" stroke="url(#gradient5)" stroke-width="2">
						<defs>
							<linearGradient id="gradient5" x1="0%" y1="0%" x2="100%" y2="100%">
								<stop offset="0%" style="stop-color:var(--color-primary);stop-opacity:1" />
								<stop offset="100%" style="stop-color:var(--color-secondary);stop-opacity:1" />
							</linearGradient>
						</defs>
						<polygon points="23 7 16 12 23 17 23 7"/>
						<rect x="1" y="5" width="15" height="14" rx="2"/>
					</svg>
					<h3 class="service-title">Live Stream</h3>
					<p class="service-description">Broadcast competitions with real-time depth and timing overlays</p>
					<span class="service-status service-status--soon">Coming Soon</span>
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
		background: transparent;
		position: relative;
		z-index: 1;
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
		background: transparent;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		position: relative;
		z-index: 1;
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
	}

	/* Google Sign In Button */
	.google-signin-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 2rem;
		background: rgba(15, 23, 30, 0.8);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		color: var(--color-text);
		font-size: 1rem;
		font-weight: 600;
		border: 1px solid rgba(100, 116, 139, 0.3);
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s ease;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
	}

	.google-signin-btn:hover {
		transform: translateY(-2px);
		border-color: #00FFFF;
		box-shadow: 0 6px 20px rgba(0, 255, 255, 0.15);
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

	/* Services Section */
	.services-section {
		max-width: 1100px;
		width: 100%;
	}

	.services-title {
		font-size: 2rem;
		font-weight: 700;
		text-align: center;
		color: var(--color-text);
		margin-bottom: 2rem;
	}

	.services-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1.5rem;
	}

	.service-card {
		display: block;
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.1);
		border-radius: 12px;
		padding: 2rem;
		text-align: center;
		text-decoration: none;
		transition: all 0.3s ease;
		position: relative;
	}

	.service-card--active:hover {
		transform: translateY(-4px) scale(1.02);
		border-color: #00FFFF;
		box-shadow: 0 8px 24px rgba(0, 255, 255, 0.15);
	}

	/* Training card hover/focus effects */
	.service-card--training {
		cursor: default;
		transition: all 0.3s ease;
	}

	/* Desktop: hover effect */
	@media (hover: hover) {
		.service-card--training:hover {
			transform: translateY(-4px) scale(1.02);
			border-color: #00FFFF;
			box-shadow: 0 8px 24px rgba(0, 255, 255, 0.15);
		}
	}

	/* Mobile: focus effect when scrolled into view */
	@media (hover: none) {
		.service-card--training.focused {
			transform: scale(1.03);
			border-color: #00FFFF;
			box-shadow: 0 8px 24px rgba(0, 255, 255, 0.15);
		}
	}

	.service-card--training .google-signin-btn {
		margin-top: 1rem;
		width: 100%;
		justify-content: center;
	}

	.service-card--coming-soon {
		opacity: 0.6;
		cursor: default;
	}

	.service-icon {
		width: 56px;
		height: 56px;
		margin: 0 auto 1.25rem;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.service-title {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: 0.75rem;
	}

	.service-description {
		font-size: 0.875rem;
		color: var(--color-text-muted);
		line-height: 1.6;
		margin-bottom: 1rem;
	}

	.service-status {
		display: inline-block;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.25rem 0.75rem;
		border-radius: 12px;
	}

	.service-status--live {
		background: rgba(20, 184, 166, 0.2);
		color: var(--color-primary);
	}

	.service-status--alpha {
		background: rgba(251, 191, 36, 0.2);
		color: #fbbf24;
	}

	.service-status--soon {
		background: rgba(100, 116, 139, 0.2);
		color: var(--color-text-muted);
	}

	.card-error {
		margin-top: 1rem;
		padding: 0.75rem 1rem;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 6px;
		color: #fca5a5;
		font-size: 0.8rem;
	}

	/* Mobile Responsiveness */
	@media (max-width: 640px) {
		.app-title {
			font-size: 2.5rem;
		}

		.tagline {
			font-size: 1.125rem;
		}

		.services-grid {
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
