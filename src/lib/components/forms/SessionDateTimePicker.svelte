<script lang="ts">
	/**
	 * SessionDateTimePicker - Date and time input for training sessions
	 * Supports dates from 2016 onwards
	 */

	interface Props {
		sessionDate: string;
		sessionTime: string;
		onDateChange: (date: string) => void;
		onTimeChange: (time: string) => void;
	}

	let { sessionDate, sessionTime, onDateChange, onTimeChange }: Props = $props();

	const today = new Date();
	const maxPastDate = new Date('2016-01-01');

	const formatDateForInput = (date: Date) => {
		return date.toISOString().split('T')[0];
	};
</script>

<div class="datetime-picker">
	<div class="field-group">
		<label for="sessionDate" class="field-label">Date *</label>
		<input
			id="sessionDate"
			type="date"
			value={sessionDate}
			onchange={(e) => onDateChange(e.currentTarget.value)}
			min={formatDateForInput(maxPastDate)}
			max={formatDateForInput(today)}
			class="field-input"
			required
		/>
	</div>
	<div class="field-group">
		<label for="sessionTime" class="field-label">Time</label>
		<input
			id="sessionTime"
			type="time"
			value={sessionTime}
			onchange={(e) => onTimeChange(e.currentTarget.value)}
			class="field-input"
		/>
	</div>
</div>

<style>
	.datetime-picker {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.field-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.field-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text);
	}

	.field-input {
		padding: 0.75rem;
		background: var(--color-bg-input);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		color: var(--color-text);
		font-size: 1rem;
	}

	.field-input:focus {
		outline: none;
		border-color: var(--color-primary);
	}
</style>
