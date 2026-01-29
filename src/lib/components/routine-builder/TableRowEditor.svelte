<script lang="ts">
	/**
	 * TableRowEditor - Edit a single row in a variable table
	 * Uses DurationInput wheel picker for times
	 * Compact action menu instead of up/down arrows
	 */

	import type { TableRow } from '$lib/types';
	import DurationInput from '../DurationInput.svelte';

	let {
		row = $bindable<TableRow>({
			repNumber: 1,
			restBefore: 0,
			targetDuration: 0
		}),
		isStatic,
		index,
		totalRows,
		onRemove,
		onMoveUp,
		onMoveDown
	}: {
		row: TableRow;
		isStatic: boolean;
		index: number;
		totalRows: number;
		onRemove: () => void;
		onMoveUp: () => void;
		onMoveDown: () => void;
	} = $props();

	// Menu state
	let showMenu = $state(false);
	let menuRef: HTMLDivElement;

	// Close menu when clicking outside
	function handleClickOutside(event: MouseEvent) {
		if (menuRef && !menuRef.contains(event.target as Node)) {
			showMenu = false;
		}
	}

	$effect(() => {
		if (showMenu) {
			document.addEventListener('click', handleClickOutside);
			return () => document.removeEventListener('click', handleClickOutside);
		}
	});

	function handleMenuAction(action: 'up' | 'down' | 'remove') {
		showMenu = false;
		if (action === 'up') onMoveUp();
		else if (action === 'down') onMoveDown();
		else onRemove();
	}
</script>

<div class="table-row-editor">
	<!-- Rep Number -->
	<div class="col-rep">
		<div class="rep-number">{row.repNumber}</div>
	</div>

	<!-- Rest Before (Breathing Time) - using DurationInput wheel picker -->
	<div class="col-rest">
		<DurationInput
			bind:value={row.restBefore}
			compact={true}
			showLabel={false}
		/>
	</div>

	{#if isStatic}
		<!-- Target Duration (Static) - using DurationInput wheel picker -->
		<div class="col-target">
			<DurationInput
				bind:value={row.targetDuration}
				compact={true}
				showLabel={false}
			/>
		</div>
	{:else}
		<!-- Target Distance (Dynamic) -->
		<div class="col-target">
			<input
				type="number"
				class="numeric-input"
				bind:value={row.targetDistance}
				min="1"
				placeholder="50"
			/>
			<span class="unit-label">m</span>
		</div>

		<!-- Target Time (Dynamic) - using DurationInput wheel picker -->
		<div class="col-time">
			<DurationInput
				bind:value={row.targetTime}
				compact={true}
				showLabel={false}
			/>
		</div>
	{/if}

	<!-- Actions - compact menu button -->
	<div class="col-actions">
		<div class="action-menu" bind:this={menuRef}>
			<button
				type="button"
				class="btn-menu"
				onclick={() => showMenu = !showMenu}
				title="Row actions"
			>
				⋮
			</button>
			{#if showMenu}
				<div class="menu-dropdown">
					<button
						type="button"
						class="menu-item"
						onclick={() => handleMenuAction('up')}
						disabled={index === 0}
					>
						↑ Move Up
					</button>
					<button
						type="button"
						class="menu-item"
						onclick={() => handleMenuAction('down')}
						disabled={index === totalRows - 1}
					>
						↓ Move Down
					</button>
					<button
						type="button"
						class="menu-item menu-item-danger"
						onclick={() => handleMenuAction('remove')}
					>
						× Remove
					</button>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.table-row-editor {
		display: grid;
		grid-template-columns: 50px 1fr 1fr 1fr 40px;
		gap: 0.5rem;
		padding: 0.75rem;
		background: rgba(15, 23, 42, 0.3);
		border: 1px solid rgba(148, 163, 184, 0.1);
		border-radius: 6px;
		margin-bottom: 0.5rem;
		align-items: center;
		transition: all 0.2s ease;
	}

	.table-row-editor:hover {
		background: rgba(15, 23, 42, 0.5);
		border-color: rgba(148, 163, 184, 0.2);
	}

	.col-rep {
		text-align: center;
	}

	.rep-number {
		font-weight: 600;
		color: var(--color-text);
		font-size: 1rem;
	}

	.col-rest,
	.col-target,
	.col-time {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.numeric-input {
		width: 60px;
		padding: 0.4rem 0.5rem;
		background: rgba(15, 23, 42, 0.6);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 4px;
		color: var(--color-text);
		font-size: 0.875rem;
	}

	.numeric-input:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 2px rgba(20, 184, 166, 0.1);
	}

	.unit-label {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}

	.col-actions {
		display: flex;
		justify-content: flex-end;
	}

	.action-menu {
		position: relative;
	}

	.btn-menu {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(148, 163, 184, 0.1);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 4px;
		color: var(--color-text);
		font-size: 1.25rem;
		font-weight: bold;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-menu:hover {
		background: rgba(148, 163, 184, 0.2);
		border-color: rgba(148, 163, 184, 0.3);
	}

	.menu-dropdown {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: 4px;
		background: var(--color-surface, #1e293b);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 6px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		z-index: 100;
		min-width: 120px;
		overflow: hidden;
	}

	.menu-item {
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: transparent;
		border: none;
		color: var(--color-text);
		font-size: 0.8125rem;
		text-align: left;
		cursor: pointer;
		transition: background 0.15s ease;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.menu-item:hover:not(:disabled) {
		background: rgba(148, 163, 184, 0.15);
	}

	.menu-item:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.menu-item-danger {
		color: #ef4444;
	}

	.menu-item-danger:hover:not(:disabled) {
		background: rgba(239, 68, 68, 0.15);
	}

	/* Mobile responsive */
	@media (max-width: 768px) {
		.table-row-editor {
			grid-template-columns: 40px 1fr 1fr 1fr 36px;
			gap: 0.375rem;
			padding: 0.5rem;
		}

		.numeric-input {
			width: 50px;
			font-size: 0.8125rem;
		}

		.btn-menu {
			width: 24px;
			height: 24px;
			font-size: 1rem;
		}
	}
</style>
