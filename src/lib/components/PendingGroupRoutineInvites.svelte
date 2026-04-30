<!-- Pending manual routine group-log invites. -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { format } from 'date-fns';
	import { listPendingGroupRoutineInvites, updateGroupRoutineInvite } from '$lib/firestore';
	import { user } from '$lib/stores/auth';
	import type { GroupRoutineInvite } from '$lib/types';

	let invites = $state<GroupRoutineInvite[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let busyInviteId = $state<string | null>(null);

	$effect(() => {
		const uid = $user?.uid;
		if (!uid) return;
		void load(uid);
	});

	async function load(uid: string): Promise<void> {
		loading = true;
		loadError = null;
		try {
			invites = await listPendingGroupRoutineInvites(uid);
		} catch (err) {
			loadError = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}

	function handleReview(invite: GroupRoutineInvite): void {
		void goto(`/dives?groupInvite=${encodeURIComponent(invite.id)}`);
	}

	async function handleDecline(invite: GroupRoutineInvite): Promise<void> {
		if (!confirm('Decline this group routine invite?')) return;
		busyInviteId = invite.id;
		try {
			await updateGroupRoutineInvite(invite.id, { status: 'declined' });
			invites = invites.filter((item) => item.id !== invite.id);
		} catch (err) {
			alert(`Failed to decline: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			busyInviteId = null;
		}
	}
</script>

{#if !loading && invites.length > 0}
	<section class="pending-group-invites">
		<div class="head">
			<h2>Group routines to review</h2>
			<span class="count">{invites.length}</span>
		</div>

		{#if loadError}
			<div class="error">Couldn't load group invites: {loadError}</div>
		{/if}

		<ul class="invite-list">
			{#each invites as invite (invite.id)}
				<li class="invite-card">
					<div class="invite-body">
						<div class="invite-title">
							{invite.hostDisplayName ?? 'A dive buddy'} logged
							<strong>{invite.routineName}</strong>
						</div>
						<div class="invite-meta">
							{format(invite.date.toDate(), 'EEE d MMM • HH:mm')}
							· {invite.sourceLogData.disciplineUsed}
						</div>
					</div>
					<div class="invite-actions">
						<button
							class="btn btn-ghost"
							disabled={busyInviteId === invite.id}
							onclick={() => handleDecline(invite)}
						>
							Decline
						</button>
						<button
							class="btn btn-primary"
							disabled={busyInviteId === invite.id}
							onclick={() => handleReview(invite)}
						>
							Review copy
						</button>
					</div>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.pending-group-invites {
		background: rgba(15, 23, 42, 0.72);
		border: 1px solid rgba(20, 184, 166, 0.28);
		border-radius: 12px;
		padding: 1rem 1.1rem;
		margin-bottom: 1.25rem;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}

	.head h2 {
		margin: 0;
		font-size: 1rem;
		color: var(--color-text);
	}

	.count {
		background: var(--color-primary);
		color: #0f172a;
		font-weight: 700;
		font-size: 0.8rem;
		border-radius: 999px;
		padding: 0.1rem 0.55rem;
	}

	.error {
		color: #ef4444;
		font-size: 0.85rem;
		margin-bottom: 0.5rem;
	}

	.invite-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.invite-card {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
		background: rgba(2, 6, 23, 0.35);
		border: 1px solid rgba(148, 163, 184, 0.15);
		border-radius: 10px;
		padding: 0.7rem 0.85rem;
	}

	.invite-title {
		font-weight: 600;
		color: var(--color-text);
	}

	.invite-meta {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		margin-top: 0.15rem;
	}

	.invite-actions {
		display: flex;
		gap: 0.4rem;
		flex-shrink: 0;
	}

	.btn {
		font: inherit;
		font-size: 0.85rem;
		padding: 0.45rem 0.75rem;
		border-radius: 8px;
		border: 1px solid transparent;
		cursor: pointer;
	}

	.btn-primary {
		background: var(--color-primary);
		color: #0f172a;
		font-weight: 600;
	}

	.btn-ghost {
		background: transparent;
		border-color: rgba(148, 163, 184, 0.3);
		color: var(--color-text-muted);
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@media (max-width: 640px) {
		.invite-card {
			align-items: stretch;
			flex-direction: column;
		}

		.invite-actions {
			justify-content: flex-end;
		}
	}
</style>
