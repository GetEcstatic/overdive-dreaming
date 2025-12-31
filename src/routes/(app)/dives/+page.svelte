<script lang="ts">
	import { onMount } from 'svelte';
	import { Timestamp } from 'firebase/firestore';
	import { user } from '$lib/stores/auth';
	import { getRoutinesForUser, createSession, createRoutineLog } from '$lib/firestore';
	import RoutineSelector from '$lib/components/RoutineSelector.svelte';
	import QuickLogForm, { type LogFormData } from '$lib/components/QuickLogForm.svelte';
	import type { RoutineTemplate } from '$lib/types';

	let routines = $state<RoutineTemplate[]>([]);
	let selectedRoutine = $state<RoutineTemplate | null>(null);
	let selectedRoutineId = $state<string | undefined>(undefined);
	let loading = $state(true);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);

	onMount(async () => {
		if (!$user) return;

		try {
			routines = await getRoutinesForUser($user.uid);
			loading = false;
		} catch (err) {
			console.error('Error loading routines:', err);
			error = 'Failed to load routines';
			loading = false;
		}
	});

	function handleRoutineSelect(routine: RoutineTemplate) {
		selectedRoutine = routine;
		error = null;
		success = null;
	}

	function handleCancel() {
		selectedRoutine = null;
		selectedRoutineId = undefined;
	}

	async function handleSubmit(logData: LogFormData) {
		if (!$user || !selectedRoutine) return;

		saving = true;
		error = null;
		success = null;

		try {
			// 1. Create session for this dive
			const sessionId = await createSession({
				userId: $user.uid,
				date: Timestamp.now()
			});

			// 2. Build routine log data, filtering out undefined values
			const routineLogData: any = {
				routineId: selectedRoutine.id,
				sessionId,
				userId: $user.uid,
				date: Timestamp.now(),
				disciplineUsed: logData.disciplineUsed,
				hasDetailedData: false // Quick summary only
			};

			// Session context
			if (logData.poolLength !== undefined) routineLogData.poolLength = logData.poolLength;
			if (logData.initialBreatheUpTime !== undefined) routineLogData.initialBreatheUpTime = logData.initialBreatheUpTime;

			// Performance metrics
			if (logData.totalDistance !== undefined) routineLogData.totalDistance = logData.totalDistance;
			if (logData.totalTime !== undefined) routineLogData.totalTime = logData.totalTime;

			// Summary (for interval routines)
			if (logData.lapsCompleted !== undefined || logData.totalTime !== undefined) {
				routineLogData.summary = {};
				if (logData.lapsCompleted !== undefined) {
					routineLogData.summary.lapsCompleted = logData.lapsCompleted;
				}
				if (logData.totalTime !== undefined) {
					routineLogData.summary.totalTimeSeconds = logData.totalTime;
				}
			}

			// Training context
			if (logData.breathingTechnique) routineLogData.breathingTechnique = logData.breathingTechnique;
			if (logData.rpe !== undefined) routineLogData.rpe = logData.rpe;
			if (logData.joyScale !== undefined) routineLogData.joyScale = logData.joyScale;
			if (logData.hoursSinceLastMeal !== undefined) routineLogData.hoursSinceLastMeal = logData.hoursSinceLastMeal;
			if (logData.notes) routineLogData.notes = logData.notes;

			// 3. Create routine log within the session
			await createRoutineLog(sessionId, routineLogData);

			success = 'Routine logged successfully! 🎉';
			selectedRoutine = null;
			selectedRoutineId = undefined;

			// Clear success message after 3 seconds
			setTimeout(() => {
				success = null;
			}, 3000);
		} catch (err) {
			console.error('Error saving routine log:', err);
			error = 'Failed to save routine log. Please try again.';
		} finally {
			saving = false;
		}
	}
</script>

<div class="p-6 max-w-2xl mx-auto">
	<h1
		class="text-3xl font-bold mb-6 bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)] bg-clip-text text-transparent"
	>
		Log Training
	</h1>

	<!-- Loading State -->
	{#if loading}
		<div class="bg-[var(--color-bg-card)] p-8 rounded-lg text-center">
			<div
				class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[var(--color-primary)] border-r-transparent"
			></div>
			<p class="mt-4 text-[var(--color-text-muted)]">Loading routines...</p>
		</div>

		<!-- Error State -->
	{:else if error}
		<div class="bg-red-500/10 border border-red-500/50 text-red-500 p-4 rounded-lg mb-6">
			{error}
		</div>

		<!-- Success Message -->
	{:else if success}
		<div class="bg-green-500/10 border border-green-500/50 text-green-500 p-4 rounded-lg mb-6">
			{success}
		</div>
	{/if}

	<!-- Main Content -->
	{#if !loading}
		<div class="bg-[var(--color-bg-card)] p-6 rounded-lg">
			{#if !selectedRoutine}
				<!-- Step 1: Select Routine -->
				<RoutineSelector {routines} bind:selectedRoutineId onSelect={handleRoutineSelect} />
			{:else}
				<!-- Step 2: Quick Log Form -->
				<QuickLogForm routine={selectedRoutine} onSubmit={handleSubmit} onCancel={handleCancel} />

				{#if saving}
					<div class="mt-4 p-4 bg-[var(--color-bg)] rounded-lg text-center">
						<div
							class="inline-block h-6 w-6 animate-spin rounded-full border-4 border-solid border-[var(--color-primary)] border-r-transparent"
						></div>
						<p class="mt-2 text-sm text-[var(--color-text-muted)]">Saving...</p>
					</div>
				{/if}
			{/if}
		</div>

		<!-- Info Card -->
		{#if !selectedRoutine && routines.length > 0}
			<div class="mt-6 p-4 bg-[var(--color-bg-card)] rounded-lg">
				<h3 class="text-sm font-semibold text-[var(--color-text)] mb-2">💡 Quick Tips</h3>
				<ul class="text-sm text-[var(--color-text-muted)] space-y-1">
					<li>• Select a routine to log your training session</li>
					<li>• Only configured fields will be shown in the form</li>
					<li>• You can add detailed per-lap data later from video review</li>
				</ul>
			</div>
		{/if}

		<!-- Empty State -->
		{#if routines.length === 0}
			<div class="text-center py-8">
				<p class="text-[var(--color-text-muted)] mb-4">No routines available yet.</p>
				<p class="text-sm text-[var(--color-text-muted)]">
					Contact admin to check if default routines have been seeded.
				</p>
			</div>
		{/if}
	{/if}
</div>
