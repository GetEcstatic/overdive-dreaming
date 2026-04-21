<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import type { RoutineLog, RoutineTemplate } from '$lib/types';
	import { getMetricValue, formatMetricValue } from '$lib/utils/metrics';
	import { formatTime } from '$lib/utils/time';
	import { getAvailableMetricsForRoutine, isTimeMetric } from '$lib/utils/routineAnalytics';

	let {
		log,
		routine,
		onClose
	}: {
		log: RoutineLog;
		routine: RoutineTemplate;
		onClose: () => void;
	} = $props();

	const metrics = $derived(getAvailableMetricsForRoutine(routine, []));

	const metricRows = $derived.by(() => {
		const rows: { key: string; label: string; display: string }[] = [];
		for (const m of metrics) {
			const v = getMetricValue(m.key, log, routine);
			if (!Number.isFinite(v) || v <= 0) continue;
			rows.push({
				key: m.key,
				label: m.label,
				display: isTimeMetric(m.key) ? formatTime(v) : formatMetricValue(m.key, v)
			});
		}
		return rows;
	});

	const formattedDate = $derived(
		log.date
			.toDate()
			.toLocaleDateString('en-US', {
				weekday: 'short',
				month: 'short',
				day: 'numeric',
				year: 'numeric'
			})
	);

	const readinessRows = $derived.by(() => {
		const rows: { label: string; value: string }[] = [];
		if (log.rpe != null) rows.push({ label: 'RPE', value: String(log.rpe) });
		if (log.joyScale != null) rows.push({ label: 'Joy', value: String(log.joyScale) });
		if (log.basalMood != null) rows.push({ label: 'Basal mood', value: String(log.basalMood) });
		if (log.restingHeartRate != null)
			rows.push({ label: 'Resting HR', value: `${log.restingHeartRate} bpm` });
		if (log.hrv != null) rows.push({ label: 'HRV', value: `${log.hrv} ms` });
		if (log.hoursSinceLastMeal != null)
			rows.push({ label: 'Hours fasted', value: `${log.hoursSinceLastMeal}h` });
		if (log.bodyWeight != null)
			rows.push({ label: 'Body weight', value: `${log.bodyWeight} kg` });
		return rows;
	});

	const bioRows = $derived.by(() => {
		const rows: { label: string; value: string }[] = [];
		if (log.lowestSpO2 != null) rows.push({ label: 'Lowest SpO₂', value: `${log.lowestSpO2}%` });
		if (log.sessionAvgSpO2 != null)
			rows.push({ label: 'Avg SpO₂', value: `${log.sessionAvgSpO2}%` });
		if (log.sessionMinHR != null) rows.push({ label: 'Min HR', value: `${log.sessionMinHR} bpm` });
		if (log.longestHold != null)
			rows.push({ label: 'Longest hold', value: formatTime(log.longestHold) });
		return rows;
	});

	const contextRows = $derived.by(() => {
		const rows: { label: string; value: string }[] = [];
		if (log.location) rows.push({ label: 'Location', value: log.location });
		if (log.poolLength != null) rows.push({ label: 'Pool', value: `${log.poolLength}m` });
		if (log.waterTemperature != null)
			rows.push({ label: 'Water temp', value: `${log.waterTemperature}°C` });
		if (log.buddyName) rows.push({ label: 'Buddy', value: log.buddyName });
		if (log.equipmentUsed) rows.push({ label: 'Equipment', value: log.equipmentUsed });
		return rows;
	});

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onClose();
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onClose();
	}

	function openFullSession() {
		goto(`/session/${log.id}`);
	}

	onMount(() => {
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = prevOverflow;
		};
	});
</script>

<svelte:window onkeydown={handleKey} />

<div
	class="backdrop"
	role="presentation"
	onclick={handleBackdropClick}
>
	<div
		class="modal"
		role="dialog"
		aria-modal="true"
		aria-labelledby="quickview-title"
	>
		<header class="modal-header">
			<div>
				<div class="eyebrow">{log.disciplineUsed ?? 'Session'}</div>
				<h2 id="quickview-title">{formattedDate}</h2>
			</div>
			<button class="close" onclick={onClose} aria-label="Close">×</button>
		</header>

		<div class="modal-body">
			{#if metricRows.length > 0}
				<section class="group">
					<h3>Performance</h3>
					<dl class="stat-grid">
						{#each metricRows as r}
							<div class="stat">
								<dt>{r.label}</dt>
								<dd>{r.display}</dd>
							</div>
						{/each}
					</dl>
				</section>
			{/if}

			{#if readinessRows.length > 0}
				<section class="group">
					<h3>Readiness</h3>
					<dl class="stat-grid compact">
						{#each readinessRows as r}
							<div class="stat">
								<dt>{r.label}</dt>
								<dd>{r.value}</dd>
							</div>
						{/each}
					</dl>
				</section>
			{/if}

			{#if bioRows.length > 0}
				<section class="group">
					<h3>Biometrics</h3>
					<dl class="stat-grid compact">
						{#each bioRows as r}
							<div class="stat">
								<dt>{r.label}</dt>
								<dd>{r.value}</dd>
							</div>
						{/each}
					</dl>
				</section>
			{/if}

			{#if contextRows.length > 0}
				<section class="group">
					<h3>Context</h3>
					<dl class="stat-grid compact">
						{#each contextRows as r}
							<div class="stat">
								<dt>{r.label}</dt>
								<dd>{r.value}</dd>
							</div>
						{/each}
					</dl>
				</section>
			{/if}

			{#if log.notes}
				<section class="group">
					<h3>Notes</h3>
					<p class="notes">{log.notes}</p>
				</section>
			{/if}
		</div>

		<footer class="modal-footer">
			<button class="btn secondary" onclick={onClose}>Close</button>
			<button class="btn primary" onclick={openFullSession}>Open full session →</button>
		</footer>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(2px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		z-index: 1000;
		animation: fade-in 0.12s ease-out;
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.modal {
		background: var(--color-bg-card, #1e293b);
		border-radius: 14px;
		width: 100%;
		max-width: 560px;
		max-height: calc(100vh - 2rem);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid rgba(148, 163, 184, 0.15);
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}

	.modal-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 1.1rem 0.85rem;
		border-bottom: 1px solid rgba(148, 163, 184, 0.12);
	}

	.eyebrow {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-primary, #14b8a6);
		margin-bottom: 0.1rem;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.1rem;
		color: var(--color-text);
	}

	.close {
		background: transparent;
		border: none;
		color: var(--color-text-muted);
		font-size: 1.6rem;
		line-height: 1;
		cursor: pointer;
		padding: 0 0.3rem;
	}

	.close:hover {
		color: var(--color-text);
	}

	.modal-body {
		padding: 1rem 1.1rem;
		overflow-y: auto;
		flex: 1;
	}

	.group {
		margin-bottom: 1rem;
	}

	.group:last-child {
		margin-bottom: 0;
	}

	.group h3 {
		margin: 0 0 0.5rem;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
		font-weight: 600;
	}

	.stat-grid {
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 0.6rem 0.8rem;
	}

	.stat-grid.compact {
		grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.stat dt {
		font-size: 0.72rem;
		color: var(--color-text-muted);
	}

	.stat dd {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--color-text);
		font-variant-numeric: tabular-nums;
	}

	.notes {
		margin: 0;
		font-size: 0.9rem;
		color: var(--color-text);
		line-height: 1.5;
		white-space: pre-wrap;
		background: rgba(148, 163, 184, 0.06);
		padding: 0.65rem 0.75rem;
		border-radius: 8px;
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		padding: 0.8rem 1.1rem;
		border-top: 1px solid rgba(148, 163, 184, 0.12);
		background: rgba(15, 23, 42, 0.3);
	}

	.btn {
		border-radius: 8px;
		padding: 0.55rem 0.95rem;
		font-size: 0.88rem;
		font-weight: 500;
		cursor: pointer;
		border: 1px solid transparent;
	}

	.btn.secondary {
		background: transparent;
		color: var(--color-text-muted);
		border-color: rgba(148, 163, 184, 0.25);
	}

	.btn.secondary:hover {
		color: var(--color-text);
		background: rgba(148, 163, 184, 0.08);
	}

	.btn.primary {
		background: var(--color-primary, #14b8a6);
		color: #0f172a;
		border-color: var(--color-primary, #14b8a6);
	}

	.btn.primary:hover {
		filter: brightness(1.08);
	}
</style>
