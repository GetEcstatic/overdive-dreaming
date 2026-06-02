<!--
  /record — top-level entry point for the dynamic dive recorder.

  Creates a fresh "ad-hoc" session on mount and redirects to the
  dive-record setup screen for that session id. If the user is not
  signed in, shows a sign-in prompt instead.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { Timestamp } from 'firebase/firestore';
	import { user } from '$lib/stores/auth';
	import { createSession } from '$lib/firestore';

	let errorMessage = $state<string | null>(null);

	onMount(async () => {
		const uid = $user?.uid;
		if (!uid) {
			// auth store may still be hydrating; give it a brief moment.
			await new Promise((r) => setTimeout(r, 400));
		}
		const resolvedUid = $user?.uid;
		if (!resolvedUid) {
			errorMessage = 'Please sign in to record a dive.';
			return;
		}
		try {
			const sessionId = await createSession({
				userId: resolvedUid,
				date: Timestamp.now()
			});
			const params = $page.url.searchParams.toString();
			await goto(`/dive/record/${sessionId}${params ? `?${params}` : ''}`, { replaceState: true });
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : String(err);
		}
	});
</script>

<svelte:head>
	<title>Record dive</title>
</svelte:head>

<div class="screen">
	{#if errorMessage}
		<p class="error">{errorMessage}</p>
		<a class="btn" href="/dashboard">Back to feed</a>
	{:else}
		<p class="loading">Preparing your session…</p>
	{/if}
</div>

<style>
	.screen {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		padding: 2rem 1rem calc(2rem + env(safe-area-inset-bottom));
		color: var(--color-text);
		background: var(--color-bg);
	}
	.loading {
		color: var(--color-text-muted);
		font-size: 0.95rem;
	}
	.error {
		color: #fca5a5;
		text-align: center;
		max-width: 32ch;
	}
	.btn {
		padding: 0.75rem 1.25rem;
		border-radius: 12px;
		background: var(--color-primary);
		color: #0f172a;
		font-weight: 600;
		text-decoration: none;
	}
</style>
