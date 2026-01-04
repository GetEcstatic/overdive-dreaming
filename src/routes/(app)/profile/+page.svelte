<script lang="ts">
	import { user } from '$lib/stores/auth';
	import { auth } from '$lib/firebase';
	import { signOut } from 'firebase/auth';
	import { goto } from '$app/navigation';

	async function handleSignOut() {
		try {
			await signOut(auth);
			goto('/');
		} catch (error) {
			console.error('Error signing out:', error);
		}
	}
</script>

<div class="p-6 max-w-2xl mx-auto">
	<h1 class="text-3xl font-bold mb-6 text-[var(--color-primary)]">Profile</h1>

	{#if $user}
		<div class="bg-[var(--color-bg-card)] p-6 rounded-lg mb-6">
			<div class="flex items-center gap-4 mb-6">
				{#if $user.photoURL}
					<img src={$user.photoURL} alt="Profile" class="w-20 h-20 rounded-full" />
				{:else}
					<div class="w-20 h-20 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-2xl font-bold">
						{$user.displayName?.charAt(0) || 'U'}
					</div>
				{/if}
				<div>
					<h2 class="text-2xl font-semibold">{$user.displayName || 'User'}</h2>
					<p class="text-[var(--color-text-muted)]">{$user.email}</p>
				</div>
			</div>

			<div class="space-y-4">
				<div>
					<label class="block mb-2 font-semibold">Email</label>
					<p class="text-[var(--color-text-muted)]">{$user.email}</p>
				</div>

				<div>
					<label class="block mb-2 font-semibold">User ID</label>
					<p class="text-[var(--color-text-muted)] font-mono text-sm break-all">{$user.uid}</p>
				</div>

				<div>
					<label class="block mb-2 font-semibold">Member Since</label>
					<p class="text-[var(--color-text-muted)]">
						{new Date($user.metadata.creationTime || '').toLocaleDateString()}
					</p>
				</div>
			</div>
		</div>

		<button
			on:click={handleSignOut}
			class="w-full py-3 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-colors"
		>
			Sign Out
		</button>
	{/if}
</div>
