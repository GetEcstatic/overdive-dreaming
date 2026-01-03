<script lang="ts">
	/**
	 * TableRowEditor - Edit a single row in a variable table
	 * Handles time inputs (mm:ss) and numeric inputs
	 */

	import type { TableRow } from '$lib/types';

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

	// Time input states for breathing time (restBefore)
	let restMinutes = $state(0);
	let restSeconds = $state(0);

	// Time input states for target duration (static only)
	let targetMinutes = $state(0);
	let targetSeconds = $state(0);

	// Initialize from existing data
	$effect(() => {
		restMinutes = Math.floor(row.restBefore / 60);
		restSeconds = row.restBefore % 60;

		if (isStatic && row.targetDuration) {
			targetMinutes = Math.floor(row.targetDuration / 60);
			targetSeconds = row.targetDuration % 60;
		}
	});

	// Update row when time inputs change
	function updateRestTime() {
		row.restBefore = restMinutes * 60 + restSeconds;
	}

	function updateTargetTime() {
		if (isStatic) {
			row.targetDuration = targetMinutes * 60 + targetSeconds;
		}
	}
</script>

<div class="table-row-editor">
	<!-- Rep Number -->
	<div class="col-rep">
		<div class="rep-number">{row.repNumber}</div>
	</div>

	<!-- Rest Before (Breathing Time) -->
	<div class="col-rest">
		<div class="time-input-compact">
			<input
				type="number"
				class="time-input"
				bind:value={restMinutes}
				onchange={updateRestTime}
				min="0"
				max="59"
				placeholder="0"
			/>
			<span class="time-sep">:</span>
			<input
				type="number"
				class="time-input"
				bind:value={restSeconds}
				onchange={updateRestTime}
				min="0"
				max="59"
				placeholder="00"
			/>
		</div>
	</div>

	{#if isStatic}
		<!-- Target Duration (Static) -->
		<div class="col-target">
			<div class="time-input-compact">
				<input
					type="number"
					class="time-input"
					bind:value={targetMinutes}
					onchange={updateTargetTime}
					min="0"
					max="59"
					placeholder="0"
				/>
				<span class="time-sep">:</span>
				<input
					type="number"
					class="time-input"
					bind:value={targetSeconds}
					onchange={updateTargetTime}
					min="0"
					max="59"
					placeholder="00"
				/>
			</div>
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

		<!-- Target Time (Dynamic - Optional) -->
		<div class="col-time">
			<input
				type="number"
				class="numeric-input"
				bind:value={row.targetTime}
				min="0"
				placeholder="Optional"
			/>
			<span class="unit-label">s</span>
		</div>
	{/if}

	<!-- Actions -->
	<div class="col-actions">
		<div class="action-buttons">
			<button
				type="button"
				class="btn-icon"
				onclick={onMoveUp}
				disabled={index === 0}
				title="Move up"
			>
				↑
			</button>
			<button
				type="button"
				class="btn-icon"
				onclick={onMoveDown}
				disabled={index === totalRows - 1}
				title="Move down"
			>
				↓
			</button>
			<button type="button" class="btn-icon btn-danger" onclick={onRemove} title="Remove">
				×
			</button>
		</div>
	</div>
</div>

<style>
	.table-row-editor {
		display: grid;
		grid-template-columns: 60px 120px 120px 120px 1fr;
		gap: 0.75rem;
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

	.time-input-compact {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.time-input {
		width: 45px;
		padding: 0.4rem 0.25rem;
		background: rgba(15, 23, 42, 0.6);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 4px;
		color: var(--color-text);
		font-size: 0.875rem;
		text-align: center;
	}

	.time-input:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 2px rgba(20, 184, 166, 0.1);
	}

	.time-sep {
		font-weight: 600;
		color: var(--color-text-muted);
	}

	.numeric-input {
		width: 70px;
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
		margin-left: 0.25rem;
	}

	.action-buttons {
		display: flex;
		justify-content: flex-end;
		gap: 0.25rem;
	}

	.btn-icon {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(148, 163, 184, 0.1);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 4px;
		color: var(--color-text);
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-icon:hover:not(:disabled) {
		background: rgba(148, 163, 184, 0.2);
		border-color: rgba(148, 163, 184, 0.3);
	}

	.btn-icon:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.btn-danger {
		color: #ef4444;
		font-size: 1.5rem;
		line-height: 1;
	}

	.btn-danger:hover:not(:disabled) {
		background: rgba(239, 68, 68, 0.15);
		border-color: rgba(239, 68, 68, 0.3);
	}

	/* Mobile responsive */
	@media (max-width: 768px) {
		.table-row-editor {
			grid-template-columns: 50px 100px 100px 100px 80px;
			gap: 0.5rem;
			padding: 0.5rem;
		}

		.time-input {
			width: 38px;
			font-size: 0.8125rem;
		}

		.numeric-input {
			width: 60px;
			font-size: 0.8125rem;
		}

		.btn-icon {
			width: 24px;
			height: 24px;
			font-size: 0.875rem;
		}
	}
</style>
