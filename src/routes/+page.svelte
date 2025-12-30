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
	<div class="flex items-center justify-center min-h-screen">
		<div class="text-2xl text-[var(--color-primary)]">Loading...</div>
	</div>
{:else if !$user}
	<div class="flex flex-col items-center justify-center min-h-screen p-8">
		<h1 class="text-5xl font-bold mb-4 text-transparent bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)] bg-clip-text">
			Overdive Dreaming
		</h1>
		<p class="text-xl text-[var(--color-text-muted)] mb-8">Track your freediving journey</p>

		{#if error}
			<div class="mb-4 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
				{error}
			</div>
		{/if}

		<div class="flex gap-4">
			<button
				on:click={handleGoogleSignIn}
				disabled={signingIn}
				class="px-6 py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{signingIn ? 'Signing in...' : 'Sign in with Google'}
			</button>
		</div>

		<div class="mt-12 max-w-2xl text-center">
			<h2 class="text-2xl font-semibold mb-4">Features</h2>
			<div class="grid md:grid-cols-3 gap-6">
				<div class="bg-[var(--color-bg-card)] p-6 rounded-lg">
					<div class="text-3xl mb-2">📊</div>
					<h3 class="font-semibold mb-2">Track Progress</h3>
					<p class="text-sm text-[var(--color-text-muted)]">Monitor your improvements over time</p>
				</div>
				<div class="bg-[var(--color-bg-card)] p-6 rounded-lg">
					<div class="text-3xl mb-2">🏊</div>
					<h3 class="font-semibold mb-2">Log Dives</h3>
					<p class="text-sm text-[var(--color-text-muted)]">Record STA, DYN, DNF and more</p>
				</div>
				<div class="bg-[var(--color-bg-card)] p-6 rounded-lg">
					<div class="text-3xl mb-2">🤝</div>
					<h3 class="font-semibold mb-2">Share & Compare</h3>
					<p class="text-sm text-[var(--color-text-muted)]">Connect with other freedivers</p>
				</div>
			</div>
		</div>
	</div>
{/if}
