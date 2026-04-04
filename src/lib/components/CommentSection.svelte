<script lang="ts">
	import type { Comment } from '$lib/types';
	import { user } from '$lib/stores/auth';
	import { getCommentsForLog, addComment, deleteComment } from '$lib/firestore';
	import { formatDistanceToNow } from 'date-fns';
	import { onMount } from 'svelte';

	let {
		routineLogId,
		previewCount = 0,
		onCountChange
	}: {
		routineLogId: string;
		/** If > 0, show only this many comments (for card preview). 0 = show all. */
		previewCount?: number;
		/** Called with the new total comment count whenever it changes. */
		onCountChange?: (count: number) => void;
	} = $props();

	$effect(() => {
		onCountChange?.(comments.length);
	});

	let comments = $state<Comment[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let submitting = $state(false);
	let newText = $state('');
	let deleteError = $state<string | null>(null);

	/** The comment being replied to, if any */
	let replyingTo = $state<Comment | null>(null);
	/** Track which comment ID has its delete confirmation visible */
	let confirmingDeleteId = $state<string | null>(null);

	let inputEl = $state<HTMLInputElement | null>(null);

	onMount(async () => {
		await loadComments();
	});

	async function loadComments() {
		loading = true;
		error = null;
		try {
			comments = await getCommentsForLog(routineLogId);
		} catch (e: any) {
			console.error('Failed to load comments:', e);
			error = `Could not load comments: ${e?.code ?? e?.message ?? 'unknown error'}`;
		} finally {
			loading = false;
		}
	}

	function startReply(comment: Comment) {
		replyingTo = comment;
		confirmingDeleteId = null;
		inputEl?.focus();
	}

	function cancelReply() {
		replyingTo = null;
	}

	function startDelete(commentId: string) {
		confirmingDeleteId = commentId;
		// Auto-dismiss after 3 seconds if not confirmed
		setTimeout(() => {
			if (confirmingDeleteId === commentId) {
				confirmingDeleteId = null;
			}
		}, 3000);
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		const text = newText.trim();
		if (!text || !$user) return;

		submitting = true;
		error = null;

		const parentId = replyingTo?.id;
		const replyToName = replyingTo?.authorDisplayName;

		// Optimistic insert
		const optimistic: Comment = {
			id: `optimistic-${Date.now()}`,
			routineLogId,
			userId: $user.uid,
			authorDisplayName: $user.displayName ?? 'You',
			authorPhotoURL: $user.photoURL ?? undefined,
			text,
			parentCommentId: parentId,
			replyToDisplayName: replyToName,
			createdAt: { toDate: () => new Date() } as any,
			updatedAt: { toDate: () => new Date() } as any
		};
		comments = [...comments, optimistic];
		newText = '';
		replyingTo = null;

		try {
			const saved = await addComment(
				routineLogId,
				$user.uid,
				$user.displayName ?? 'Diver',
				$user.photoURL ?? undefined,
				text,
				parentId,
				replyToName
			);
			// Replace optimistic entry with the real one
			comments = comments.map((c) => (c.id === optimistic.id ? saved : c));
		} catch (e) {
			console.error('Failed to post comment:', e);
			// Revert optimistic entry
			comments = comments.filter((c) => c.id !== optimistic.id);
			error = 'Could not post comment. Please try again.';
		} finally {
			submitting = false;
		}
	}

	async function handleDelete(comment: Comment) {
		if (!$user || $user.uid !== comment.userId) return;

		// Require two-step confirmation
		if (confirmingDeleteId !== comment.id) {
			startDelete(comment.id);
			return;
		}

		confirmingDeleteId = null;

		// Optimistic remove
		const prev = comments;
		comments = comments.filter((c) => c.id !== comment.id);
		deleteError = null;

		try {
			await deleteComment(comment.id, routineLogId);
		} catch (e) {
			console.error('Failed to delete comment:', e);
			comments = prev;
			deleteError = 'Could not delete comment.';
		}
	}

	const visibleComments = $derived(
		previewCount > 0 ? comments.slice(-previewCount) : comments
	);
</script>

<div class="comment-section">
	{#if loading}
		<p class="status-text">Loading comments…</p>
	{:else if error}
		<p class="status-text error">{error}</p>
	{:else if visibleComments.length === 0 && previewCount === 0}
		<p class="status-text muted">No comments yet. Be the first!</p>
	{:else}
		<ul class="comment-list">
			{#each visibleComments as comment (comment.id)}
				<li class="comment-item" class:is-reply={!!comment.parentCommentId}>
					<div class="comment-avatar">
						{#if comment.authorPhotoURL}
							<img src={comment.authorPhotoURL} alt={comment.authorDisplayName} class="avatar-img" />
						{:else}
							<div class="avatar-placeholder">{comment.authorDisplayName.charAt(0)}</div>
						{/if}
					</div>
					<div class="comment-body">
						<div class="comment-meta">
							<span class="comment-author">{comment.authorDisplayName}</span>
							<span class="comment-time">
								{formatDistanceToNow(comment.createdAt.toDate(), { addSuffix: true })}
							</span>
						</div>
						{#if comment.replyToDisplayName}
							<span class="reply-badge">↩ {comment.replyToDisplayName}</span>
						{/if}
						<p class="comment-text">{comment.text}</p>
						<button class="reply-btn" onclick={() => startReply(comment)}>Reply</button>
					</div>
					{#if $user?.uid === comment.userId}
						{#if confirmingDeleteId === comment.id}
							<button
								class="delete-btn confirming"
								onclick={() => handleDelete(comment)}
								aria-label="Confirm delete comment"
							>Delete?</button>
						{:else}
							<button
								class="delete-btn"
								onclick={() => handleDelete(comment)}
								aria-label="Delete comment"
							>×</button>
						{/if}
					{/if}
				</li>
			{/each}
		</ul>
		{#if deleteError}
			<p class="status-text error">{deleteError}</p>
		{/if}
	{/if}

	{#if $user}
		<form class="comment-form" onsubmit={handleSubmit}>
			{#if replyingTo}
				<div class="replying-to-bar">
					<span class="replying-to-text">Replying to <strong>{replyingTo.authorDisplayName}</strong></span>
					<button type="button" class="cancel-reply-btn" onclick={cancelReply} aria-label="Cancel reply">×</button>
				</div>
			{/if}
			<div class="input-row">
				<div class="form-avatar">
					{#if $user.photoURL}
						<img src={$user.photoURL} alt={$user.displayName ?? ''} class="avatar-img" />
					{:else}
						<div class="avatar-placeholder">{($user.displayName ?? 'Y').charAt(0)}</div>
					{/if}
				</div>
				<input
					class="comment-input"
					type="text"
					placeholder={replyingTo ? `Reply to ${replyingTo.authorDisplayName}…` : 'Add a comment…'}
					bind:value={newText}
					bind:this={inputEl}
					maxlength={500}
					disabled={submitting}
				/>
				<button
					class="submit-btn"
					type="submit"
					disabled={!newText.trim() || submitting}
					aria-label="Post comment"
				>
					{#if submitting}
						<span class="spinner"></span>
					{:else}
						<svg viewBox="0 0 24 24" fill="currentColor" class="send-icon">
							<path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
						</svg>
					{/if}
				</button>
			</div>
		</form>
	{/if}
</div>

<style>
	.comment-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.comment-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.comment-item {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.comment-avatar,
	.form-avatar {
		flex-shrink: 0;
	}

	.avatar-img {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		object-fit: cover;
		border: 1px solid rgba(148, 163, 184, 0.2);
	}

	.avatar-placeholder {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--color-primary);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		font-weight: 700;
		color: white;
	}

	.comment-body {
		flex: 1;
		min-width: 0;
	}

	.comment-meta {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin-bottom: 0.15rem;
	}

	.comment-author {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.comment-time {
		font-size: 0.7rem;
		color: var(--color-text-muted);
	}

	.comment-text {
		font-size: 0.8125rem;
		color: var(--color-text);
		line-height: 1.4;
		margin: 0;
		word-break: break-word;
	}

	.delete-btn {
		flex-shrink: 0;
		background: none;
		border: none;
		color: var(--color-text-muted);
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
		padding: 0 0.25rem;
		opacity: 0.5;
		transition: opacity 0.15s ease, color 0.15s ease;
	}

	.delete-btn:hover {
		opacity: 1;
		color: #f87171;
	}

	.delete-btn.confirming {
		opacity: 1;
		color: #f87171;
		font-size: 0.7rem;
		font-weight: 600;
		padding: 0.15rem 0.4rem;
		border: 1px solid #f87171;
		border-radius: 4px;
		animation: pulse-delete 1s ease-in-out infinite;
	}

	@keyframes pulse-delete {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.6; }
	}

	.reply-btn {
		background: none;
		border: none;
		color: var(--color-text-muted);
		font-size: 0.7rem;
		cursor: pointer;
		padding: 0;
		margin-top: 0.15rem;
		opacity: 0.6;
		transition: opacity 0.15s ease, color 0.15s ease;
	}

	.reply-btn:hover {
		opacity: 1;
		color: var(--color-primary);
	}

	.reply-badge {
		display: inline-block;
		font-size: 0.7rem;
		color: var(--color-primary);
		opacity: 0.8;
		margin-bottom: 0.1rem;
	}

	.comment-item.is-reply {
		margin-left: 1.5rem;
		padding-left: 0.5rem;
		border-left: 2px solid rgba(20, 184, 166, 0.25);
	}

	.replying-to-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.3rem 0.5rem;
		margin-bottom: 0.25rem;
		background: rgba(20, 184, 166, 0.1);
		border-radius: 8px;
		border-left: 3px solid var(--color-primary);
	}

	.replying-to-text {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.replying-to-text strong {
		color: var(--color-primary);
	}

	.cancel-reply-btn {
		background: none;
		border: none;
		color: var(--color-text-muted);
		font-size: 1rem;
		cursor: pointer;
		padding: 0 0.25rem;
		line-height: 1;
		opacity: 0.7;
		transition: opacity 0.15s ease;
	}

	.cancel-reply-btn:hover {
		opacity: 1;
		color: #f87171;
	}

	.comment-form {
		margin-top: 0.25rem;
	}

	.input-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.comment-input {
		flex: 1;
		background: rgba(15, 23, 42, 0.6);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 20px;
		padding: 0.45rem 0.875rem;
		color: var(--color-text);
		font-size: 0.8125rem;
		outline: none;
		transition: border-color 0.2s ease;
	}

	.comment-input::placeholder {
		color: var(--color-text-muted);
	}

	.comment-input:focus {
		border-color: var(--color-primary);
	}

	.comment-input:disabled {
		opacity: 0.5;
	}

	.submit-btn {
		flex-shrink: 0;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-primary);
		padding: 0.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: opacity 0.2s ease;
	}

	.submit-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.send-icon {
		width: 20px;
		height: 20px;
	}

	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(148, 163, 184, 0.3);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.status-text {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		margin: 0;
		padding: 0.25rem 0;
	}

	.status-text.error {
		color: #f87171;
	}

	.status-text.muted {
		opacity: 0.7;
	}
</style>
