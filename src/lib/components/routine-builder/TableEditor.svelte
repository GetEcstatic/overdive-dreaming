<script lang="ts">
	/**
	 * TableEditor - Edit variable table rows for progressive protocols
	 * Allows adding, editing, removing, and reordering rows
	 */

	import type { RoutineTable, TableRow } from '$lib/types';
	import TableRowEditor from './TableRowEditor.svelte';

	let {
		table = $bindable<RoutineTable>({ rows: [] }),
		isStatic
	}: {
		table: RoutineTable;
		isStatic: boolean;
	} = $props();

	// Add a new row
	function addRow() {
		const newRepNumber = table.rows.length + 1;
		const newRow: TableRow = {
			repNumber: newRepNumber,
			restBefore: 0,
			...(isStatic ? { targetDuration: 0 } : { targetDistance: 0, targetTime: 0 })
		};
		table = {
			...table,
			rows: [...table.rows, newRow]
		};
	}

	// Remove a row
	function removeRow(index: number) {
		const updatedRows = table.rows.filter((_, i) => i !== index);
		// Renumber remaining rows
		const renumbered = updatedRows.map((row, i) => ({
			...row,
			repNumber: i + 1
		}));
		table = {
			...table,
			rows: renumbered
		};
	}

	// Copy last row
	function copyLastRow() {
		if (table.rows.length === 0) return;

		const lastRow = table.rows[table.rows.length - 1];
		const newRow: TableRow = {
			...lastRow,
			repNumber: table.rows.length + 1
		};
		table = {
			...table,
			rows: [...table.rows, newRow]
		};
	}

	// Move row up
	function moveRowUp(index: number) {
		if (index === 0) return;
		const updatedRows = [...table.rows];
		[updatedRows[index - 1], updatedRows[index]] = [updatedRows[index], updatedRows[index - 1]];
		// Renumber
		const renumbered = updatedRows.map((row, i) => ({
			...row,
			repNumber: i + 1
		}));
		table = {
			...table,
			rows: renumbered
		};
	}

	// Move row down
	function moveRowDown(index: number) {
		if (index === table.rows.length - 1) return;
		const updatedRows = [...table.rows];
		[updatedRows[index], updatedRows[index + 1]] = [updatedRows[index + 1], updatedRows[index]];
		// Renumber
		const renumbered = updatedRows.map((row, i) => ({
			...row,
			repNumber: i + 1
		}));
		table = {
			...table,
			rows: renumbered
		};
	}
</script>

<div class="table-editor">
	<div class="editor-header">
		<div class="header-info">
			<h4>Table Rows ({table.rows.length})</h4>
			<p class="hint">
				{isStatic
					? 'Define breathing time and target hold duration for each rep'
					: 'Define breathing time and target distance for each rep'}
			</p>
		</div>
		<div class="header-actions">
			<button type="button" class="btn-secondary btn-sm" onclick={copyLastRow}>
				Copy Last Row
			</button>
			<button type="button" class="btn-primary btn-sm" onclick={addRow}> + Add Row </button>
		</div>
	</div>

	{#if table.rows.length === 0}
		<div class="empty-state">
			<p>No rows yet. Click "Add Row" to get started.</p>
		</div>
	{:else}
		<div class="table-rows">
			<!-- Header row -->
			<div class="table-header">
				<div class="col-rep">Rep #</div>
				<div class="col-rest">Breathe</div>
				{#if isStatic}
					<div class="col-target">Hold</div>
				{:else}
					<div class="col-target">Distance</div>
					<div class="col-time">Time</div>
				{/if}
				<div class="col-actions">Actions</div>
			</div>

			<!-- Data rows -->
			{#each table.rows as row, index}
				<TableRowEditor
					bind:row={table.rows[index]}
					{isStatic}
					{index}
					totalRows={table.rows.length}
					onRemove={() => removeRow(index)}
					onMoveUp={() => moveRowUp(index)}
					onMoveDown={() => moveRowDown(index)}
				/>
			{/each}
		</div>
	{/if}
</div>

<style>
	.table-editor {
		width: 100%;
	}

	.editor-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 1.5rem;
		gap: 1rem;
	}

	.header-info h4 {
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 0.25rem 0;
	}

	.hint {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin: 0;
	}

	.header-actions {
		display: flex;
		gap: 0.75rem;
	}

	.btn-primary,
	.btn-secondary {
		padding: 0.5rem 1rem;
		border-radius: 6px;
		font-weight: 600;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s ease;
		border: none;
	}

	.btn-sm {
		padding: 0.4rem 0.875rem;
		font-size: 0.8125rem;
	}

	.btn-primary {
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
		color: white;
		box-shadow: 0 2px 8px rgba(20, 184, 166, 0.3);
	}

	.btn-primary:hover {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(20, 184, 166, 0.4);
	}

	.btn-secondary {
		background: rgba(148, 163, 184, 0.1);
		color: var(--color-text);
		border: 1px solid rgba(148, 163, 184, 0.2);
	}

	.btn-secondary:hover {
		background: rgba(148, 163, 184, 0.15);
	}

	.empty-state {
		text-align: center;
		padding: 3rem 1rem;
		color: var(--color-text-muted);
		background: rgba(15, 23, 42, 0.3);
		border: 1px dashed rgba(148, 163, 184, 0.3);
		border-radius: 8px;
	}

	.table-rows {
		width: 100%;
		overflow-x: auto;
	}

	.table-header {
		display: grid;
		grid-template-columns: 60px 120px 120px 120px 1fr;
		gap: 0.75rem;
		padding: 0.75rem;
		background: rgba(148, 163, 184, 0.1);
		border-radius: 6px;
		margin-bottom: 0.5rem;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.col-rep {
		text-align: center;
	}

	.col-rest,
	.col-target,
	.col-time {
		text-align: left;
	}

	.col-actions {
		text-align: right;
	}

	/* Mobile responsive */
	@media (max-width: 768px) {
		.editor-header {
			flex-direction: column;
		}

		.header-actions {
			width: 100%;
		}

		.btn-primary,
		.btn-secondary {
			flex: 1;
		}

		.table-header {
			grid-template-columns: 50px 100px 100px 100px 80px;
			gap: 0.5rem;
			font-size: 0.75rem;
		}
	}
</style>
