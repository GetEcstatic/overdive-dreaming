<script lang="ts">
	import { onMount } from 'svelte';
	import { Timestamp } from 'firebase/firestore';
	import { user } from '$lib/stores/auth';
	import { getRoutinesForUser, createRoutineLog, updateRoutineLog } from '$lib/firestore';
	import { uploadSessionPhoto } from '$lib/storage';
	import { getUserPBs, checkIsPB, updateUserPB } from '$lib/utils/personalBests';
	import { getTimeOfDay } from '$lib/utils/sessions';
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
			// 1. Calculate time of day and session group using selected date
			const sessionDateTime = new Date(logData.sessionDate); // Parse YYYY-MM-DD from form
			const timeOfDay = getTimeOfDay(sessionDateTime);
			const dateStr = logData.sessionDate; // Already in YYYY-MM-DD format
			const sessionGroup = `${dateStr}-${timeOfDay}`; // e.g., "2026-01-01-morning"

			// 2. Check if this is a PB (for max-attempt routines only)
			let isPB = false;
			const isMaxAttempt = selectedRoutine.tags.includes('max-attempt') || selectedRoutine.tags.includes('pb');

			if (isMaxAttempt) {
				// Get the dive result (time for STA, distance for dynamic disciplines)
				const result = logData.disciplineUsed === 'STA'
					? logData.totalTime
					: logData.totalDistance;

				if (result !== undefined) {
					// Get user's current PBs
					const currentPBs = await getUserPBs($user.uid);

					// Check if this beats the PB
					isPB = checkIsPB(logData.disciplineUsed, result, currentPBs);

					// If it's a PB, update the user's PBs
					if (isPB) {
						await updateUserPB($user.uid, logData.disciplineUsed, result);
					}
				}
			}

			// 3. Build routine log data, filtering out undefined values
			const routineLogData: any = {
				routineId: selectedRoutine.id,
				userId: $user.uid,
				date: Timestamp.fromDate(sessionDateTime), // Use selected date instead of now
				timeOfDay,
				sessionGroup,
				disciplineUsed: logData.disciplineUsed,
				hasDetailedData: false, // Quick summary only
				...(isPB && { isPB: true }) // Mark as PB if applicable
			};

			if (logData.isCompetition) routineLogData.isCompetition = true;
			if (logData.recordTag) routineLogData.recordTag = logData.recordTag;

			// Session context
			if (logData.poolLength !== undefined) routineLogData.poolLength = logData.poolLength;
			if (logData.initialBreatheUpTime !== undefined) routineLogData.initialBreatheUpTime = logData.initialBreatheUpTime;

			// Performance metrics
			if (logData.totalDistance !== undefined) routineLogData.totalDistance = logData.totalDistance;
			if (logData.totalTime !== undefined) routineLogData.totalTime = logData.totalTime;
			if (logData.repDuration !== undefined) routineLogData.repDuration = logData.repDuration;

			// Summary (for interval routines)
			if (logData.repsCompleted !== undefined || logData.totalTime !== undefined) {
				routineLogData.summary = {};
				if (logData.repsCompleted !== undefined) {
					routineLogData.summary.repsCompleted = logData.repsCompleted;
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

			// NEW METRICS (from previous custom routine builder)
			if (logData.waterTemperature !== undefined) routineLogData.waterTemperature = logData.waterTemperature;
			if (logData.contractionsOnsetTime !== undefined) routineLogData.contractionsOnsetTime = logData.contractionsOnsetTime;
			if (logData.equipmentUsed) routineLogData.equipmentUsed = logData.equipmentUsed;
			if (logData.buddyName) routineLogData.buddyName = logData.buddyName;
			if (logData.restingHeartRate !== undefined) routineLogData.restingHeartRate = logData.restingHeartRate;
			if (logData.hrv !== undefined) routineLogData.hrv = logData.hrv;
			if (logData.poolType) routineLogData.poolType = logData.poolType;
			if (logData.sambaBO) routineLogData.sambaBO = logData.sambaBO;
			if (logData.breathsBetweenReps !== undefined) routineLogData.breathsBetweenReps = logData.breathsBetweenReps;

			// NEW METRICS - Phase 1 (Additional from testing)
			if (logData.menstrualCycleDay !== undefined) routineLogData.menstrualCycleDay = logData.menstrualCycleDay;
			if (logData.facialGear) routineLogData.facialGear = logData.facialGear;
			if (logData.basalMood !== undefined) routineLogData.basalMood = logData.basalMood;
			if (logData.minimumSpO2 !== undefined) routineLogData.minimumSpO2 = logData.minimumSpO2;
			if (logData.minimumHR !== undefined) routineLogData.minimumHR = logData.minimumHR;
			if (logData.bodyWeight !== undefined) routineLogData.bodyWeight = logData.bodyWeight;
			if (logData.breathingTechniqueLevel !== undefined) routineLogData.breathingTechniqueLevel = logData.breathingTechniqueLevel;

			// Media - add YouTube URL if provided
			if (logData.youtubeUrl) routineLogData.youtubeUrl = logData.youtubeUrl;

			// 4. Create routine log (get the ID for photo upload)
			const routineLogId = await createRoutineLog(routineLogData);

			// 5. Upload photo if provided and update routine log
			if (logData.photoFile) {
				try {
					const photoUrl = await uploadSessionPhoto(
						$user.uid,
						routineLogId, // Use routineLogId as folder name
						logData.photoFile,
						(progress) => {
							console.log('Upload progress:', progress);
						}
					);

					// Update routine log with photo URL
					await updateRoutineLog(routineLogId, { photoUrl });
				} catch (uploadError) {
					console.error('Photo upload failed:', uploadError);
					error = 'Failed to upload photo. Routine saved without photo.';
				}
			}

			// Show success message with PB indicator
			success = isPB
				? '🎉 NEW PERSONAL BEST! Routine logged successfully!'
				: 'Routine logged successfully! 🎉';
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
	<h1 class="page-title">
		Log Your Training
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
			<div class="info-card">
				<h3 class="info-title">💡 Quick Tips</h3>
				<ul class="info-list">
					<li>Select a routine to log your training session</li>
					<li>Only configured fields will be shown in the form</li>
					<li>You can add detailed per-lap data later from video review</li>
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

<style>
	.page-title {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-text);
		margin-bottom: 1.5rem;
		padding-left: 0.25rem;
	}

	/* Info Card */
	.info-card {
		margin-top: 1.5rem;
		margin-bottom: 4rem;
		padding: 1.25rem;
		background: linear-gradient(
			135deg,
			rgba(20, 184, 166, 0.05),
			rgba(16, 185, 129, 0.05)
		);
		border: 1px solid rgba(148, 163, 184, 0.15);
		border-radius: 8px;
	}

	.info-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: 0.75rem;
	}

	.info-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.info-list li {
		font-size: 0.875rem;
		color: var(--color-text-muted);
		padding-left: 1.25rem;
		position: relative;
	}

	.info-list li::before {
		content: '→';
		position: absolute;
		left: 0;
		color: var(--color-primary);
		font-weight: 600;
	}
</style>
