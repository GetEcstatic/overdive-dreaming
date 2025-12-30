<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { user, loading } from '$lib/stores/auth';
	import { auth } from '$lib/firebase';
	import { onAuthStateChanged } from 'firebase/auth';
	import BottomNav from '$lib/components/BottomNav.svelte';

	onMount(() => {
		const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
			user.set(firebaseUser);
			loading.set(false);

			if (!firebaseUser) {
				goto('/');
			}
		});

		return unsubscribe;
	});
</script>

{#if $loading}
	<div class="flex items-center justify-center min-h-screen">
		<div class="text-2xl text-[var(--color-primary)]">Loading...</div>
	</div>
{:else if $user}
	<div class="pb-16">
		<slot />
	</div>
	<BottomNav />
{/if}
