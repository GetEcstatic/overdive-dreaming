<script lang="ts">
	import type { RoutineLog, RoutineTemplate } from '$lib/types';
	import type { LogFormData } from '$lib/components/QuickLogForm.svelte';
	import EditableLogForm from '$lib/components/EditableLogForm.svelte';
	import { uploadSessionPhotoMedia, deleteSessionPhotoMedia } from '$lib/storage';
	import { user } from '$lib/stores/auth';
	import { onMount } from 'svelte';
	import { getTimeOfDay } from '$lib/utils/sessions';
	import { deriveAttemptCategory } from '$lib/utils/attemptCategories';

	interface Props {
		open: boolean;
		log: RoutineLog;
		routine: RoutineTemplate;
		showMenstrualCycleTracking?: boolean;
		onClose: () => void;
		onSave: (updates: Partial<RoutineLog>) => Promise<void>;
	}

	let { open, log, routine, showMenstrualCycleTracking = false, onClose, onSave }: Props = $props();

	// State
	let saveError = $state<string | null>(null);
	let isSaving = $state(false);
	let isDirty = $state(false);
	let modalElement: HTMLDivElement | undefined = $state();

	// Handle form submission
	async function handleSubmit(
		formData: LogFormData,
		photoAction: 'keep' | 'remove' | 'replace' | 'add',
		youtubeAction: 'keep' | 'remove' | 'update' | 'add'
	) {
		if (!$user) return;

		saveError = null;
		isSaving = true;

		try {
			// Build updates object (only changed fields)
			const updates: Partial<RoutineLog> = {};

			// Handle photo changes
			if (photoAction === 'remove' && (log.photoUrl || log.photoObject)) {
				await deleteSessionPhotoMedia({
					photoUrl: log.photoUrl,
					photoObject: log.photoObject,
					routineLogId: log.id
				});
				(updates as Record<string, unknown>).photoUrl = null;
				(updates as Record<string, unknown>).photoObject = null;
			} else if (photoAction === 'replace' && formData.photoFile) {
				if (log.photoUrl || log.photoObject) {
					await deleteSessionPhotoMedia({
						photoUrl: log.photoUrl,
						photoObject: log.photoObject,
						routineLogId: log.id
					});
				}
				const photo = await uploadSessionPhotoMedia($user.uid, log.id, formData.photoFile);
				updates.photoUrl = photo.url;
				updates.photoObject = photo.object;
			} else if (photoAction === 'add' && formData.photoFile) {
				const photo = await uploadSessionPhotoMedia($user.uid, log.id, formData.photoFile);
				updates.photoUrl = photo.url;
				updates.photoObject = photo.object;
			}

			// Handle YouTube changes
			if (youtubeAction === 'remove') {
				updates.youtubeUrl = undefined;
			} else if (youtubeAction === 'update' || youtubeAction === 'add') {
				if (formData.youtubeUrl) {
					updates.youtubeUrl = formData.youtubeUrl;
				}
			}

			// Handle session date/time changes (requires Firestore Timestamp import)
			const originalDateTime = log.date.toDate();
			const originalDate = originalDateTime.toISOString().split('T')[0];
			const originalTime = originalDateTime.toTimeString().slice(0, 5);
			const dateChanged = formData.sessionDate !== originalDate;
			const timeChanged = (formData.sessionTime ?? originalTime) !== originalTime;

			if (dateChanged || timeChanged) {
				const { Timestamp } = await import('firebase/firestore');
				const [hours, minutes] = (formData.sessionTime ?? originalTime).split(':').map(Number);
				const newDateTime = new Date(formData.sessionDate);
				newDateTime.setHours(hours, minutes, 0, 0);
				updates.date = Timestamp.fromDate(newDateTime);

				const derivedTimeOfDay = getTimeOfDay(newDateTime);
				updates.timeOfDay = derivedTimeOfDay;
				updates.sessionGroup = `${formData.sessionDate}-${derivedTimeOfDay}`;
			}

			// Add changed fields (compare with original log)
				if (formData.poolLength !== log.poolLength) updates.poolLength = formData.poolLength;
				const attemptCategory = deriveAttemptCategory({
					disciplineUsed: formData.disciplineUsed,
					attemptConditions: formData.attemptConditions,
					defaultLungVolume: formData.defaultLungVolume,
					gasMix: formData.gasMix,
					breatheUpType: formData.breatheUpType
				});
				updates.attemptConditions = attemptCategory.conditions;
				updates.pbCategoryKey = attemptCategory.key;
				updates.pbCategoryLabel = attemptCategory.label;
				if (formData.initialBreatheUpTime !== log.initialBreatheUpTime)
					updates.initialBreatheUpTime = formData.initialBreatheUpTime;
			if (formData.totalDistance !== log.totalDistance) updates.totalDistance = formData.totalDistance;
			if (formData.totalTime !== log.totalTime) updates.totalTime = formData.totalTime;
			if (formData.repsCompleted !== log.summary?.repsCompleted) {
				if (formData.repsCompleted !== undefined) {
					updates.summary = {
						repsCompleted: formData.repsCompleted
					};
				}
			}
			if (formData.repDuration !== log.repDuration) updates.repDuration = formData.repDuration;
			if (formData.repDistance !== log.repDistance) updates.repDistance = formData.repDistance;
			if (formData.breathingTechnique !== log.breathingTechnique)
				updates.breathingTechnique = formData.breathingTechnique;
			if (formData.breathingTechniqueLevel !== log.breathingTechniqueLevel) {
				updates.breathingTechniqueLevel = formData.breathingTechniqueLevel;
			}
			if (formData.waterTemperature !== log.waterTemperature)
				updates.waterTemperature = formData.waterTemperature;
			if (formData.contractionsOnsetTime !== log.contractionsOnsetTime)
				updates.contractionsOnsetTime = formData.contractionsOnsetTime;
			if (formData.equipmentUsed !== log.equipmentUsed)
				updates.equipmentUsed = formData.equipmentUsed;
			if (formData.buddyName !== log.buddyName) updates.buddyName = formData.buddyName;
			if (formData.restingHeartRate !== log.restingHeartRate)
				updates.restingHeartRate = formData.restingHeartRate;
			if (formData.hrv !== log.hrv) updates.hrv = formData.hrv;
			if (formData.poolType !== log.poolType) updates.poolType = formData.poolType;
			if ((formData.sambaBO ?? false) !== (log.sambaBO ?? false)) {
				updates.sambaBO = formData.sambaBO ?? false;
			}
			if (formData.breathsBetweenReps !== log.breathsBetweenReps)
				updates.breathsBetweenReps = formData.breathsBetweenReps;
			if (formData.menstrualCycleDay !== log.menstrualCycleDay)
				updates.menstrualCycleDay = formData.menstrualCycleDay;
			if (formData.facialGear !== log.facialGear) updates.facialGear = formData.facialGear;
			if (formData.basalMood !== log.basalMood) updates.basalMood = formData.basalMood;
			if (formData.minimumSpO2 !== log.minimumSpO2)
				updates.minimumSpO2 = formData.minimumSpO2;
			if (formData.minimumHR !== log.minimumHR) updates.minimumHR = formData.minimumHR;
			if (formData.bodyWeight !== log.bodyWeight) updates.bodyWeight = formData.bodyWeight;
				if (formData.fvc !== log.fvc) updates.fvc = formData.fvc;
				if (formData.fvcWithPacking !== log.fvcWithPacking) updates.fvcWithPacking = formData.fvcWithPacking;
				if (formData.defaultLungVolume !== log.defaultLungVolume) updates.defaultLungVolume = formData.defaultLungVolume;
			// O2-Assisted Static Apnea
			if (formData.lucidity !== log.lucidity) updates.lucidity = formData.lucidity;
			if (formData.urgeToBreathe !== log.urgeToBreathe) updates.urgeToBreathe = formData.urgeToBreathe;
			if (formData.contractions !== log.contractions) updates.contractions = formData.contractions;
			if (formData.etco2 !== log.etco2) updates.etco2 = formData.etco2;
			if (formData.expiredAirPostHold !== log.expiredAirPostHold) updates.expiredAirPostHold = formData.expiredAirPostHold;
			if (formData.lungVolumeLossPerMin !== log.lungVolumeLossPerMin) updates.lungVolumeLossPerMin = formData.lungVolumeLossPerMin;
			if (formData.gasMix !== log.gasMix) updates.gasMix = formData.gasMix;
			if (formData.co2TremorOnset !== log.co2TremorOnset) updates.co2TremorOnset = formData.co2TremorOnset;
			if (formData.mentalChangeTime !== log.mentalChangeTime) updates.mentalChangeTime = formData.mentalChangeTime;
			if (formData.recoveryQuality !== log.recoveryQuality) updates.recoveryQuality = formData.recoveryQuality;
			if (formData.endSpO2 !== log.endSpO2) updates.endSpO2 = formData.endSpO2;
			if (formData.breatheUpType !== log.breatheUpType) updates.breatheUpType = formData.breatheUpType;
			if (formData.rpe !== log.rpe) updates.rpe = formData.rpe;
			if (formData.joyScale !== log.joyScale) updates.joyScale = formData.joyScale;
			if (formData.hoursSinceLastMeal !== log.hoursSinceLastMeal)
				updates.hoursSinceLastMeal = formData.hoursSinceLastMeal;
			if (formData.notes !== log.notes) updates.notes = formData.notes;
			if ((formData.isCompetition ?? false) !== (log.isCompetition ?? false)) {
				updates.isCompetition = formData.isCompetition ?? false;
			}
			const normalizedOrg = formData.compeitionOrg?.trim() || null;
			if (formData.isCompetition) {
				if (normalizedOrg !== (log.compeitionOrg ?? null)) {
					updates.compeitionOrg = normalizedOrg;
				}
			} else if (log.compeitionOrg) {
				updates.compeitionOrg = null;
			}
			if (formData.cardTag !== log.cardTag) updates.cardTag = formData.cardTag ?? null;
			if (formData.recordTag !== log.recordTag) updates.recordTag = formData.recordTag ?? null;
			if (formData.visibility !== log.visibility) updates.visibility = formData.visibility;

			// Biometric tracking data updates
			if (formData.hasBiometricData !== log.hasBiometricData) 
				updates.hasBiometricData = formData.hasBiometricData;
			if (formData.laps !== log.laps) updates.laps = formData.laps;
			if (formData.longestHold !== log.longestHold) updates.longestHold = formData.longestHold;
			if (formData.cumulativeHoldTime !== log.cumulativeHoldTime) 
				updates.cumulativeHoldTime = formData.cumulativeHoldTime;
			if (formData.lowestSpO2 !== log.lowestSpO2) updates.lowestSpO2 = formData.lowestSpO2;
			if (formData.sessionAvgSpO2 !== log.sessionAvgSpO2) 
				updates.sessionAvgSpO2 = formData.sessionAvgSpO2;
			if (formData.sessionMinHR !== log.sessionMinHR) updates.sessionMinHR = formData.sessionMinHR;
			if (formData.sessionMaxHR !== log.sessionMaxHR) updates.sessionMaxHR = formData.sessionMaxHR;
			if (formData.totalTimeBelow70 !== log.totalTimeBelow70) 
				updates.totalTimeBelow70 = formData.totalTimeBelow70;
			if (formData.totalTimeBelow60 !== log.totalTimeBelow60) 
				updates.totalTimeBelow60 = formData.totalTimeBelow60;
			if (formData.totalTimeBelow50 !== log.totalTimeBelow50) 
				updates.totalTimeBelow50 = formData.totalTimeBelow50;
			if (formData.totalTimeBelow40 !== log.totalTimeBelow40) 
				updates.totalTimeBelow40 = formData.totalTimeBelow40;

			// Only save if there are actual updates
			if (Object.keys(updates).length > 0) {
				await onSave(updates);
			} else {
				// No changes, just close
				onClose();
			}
		} catch (error) {
			console.error('Failed to save routine log:', error);
			saveError = error instanceof Error ? error.message : 'Failed to save changes';
		} finally {
			isSaving = false;
		}
	}

	// Handle close with confirmation if dirty
	function handleCloseClick() {
		if (isDirty && !isSaving) {
			if (confirm('You have unsaved changes. Are you sure you want to close?')) {
				onClose();
			}
		} else if (!isSaving) {
			onClose();
		}
	}

	// Handle backdrop click
	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			handleCloseClick();
		}
	}

	// Handle ESC key
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			handleCloseClick();
		}
	}

	// Set up keyboard listener
	onMount(() => {
		if (open) {
			window.addEventListener('keydown', handleKeydown);
			// Focus modal for accessibility
			modalElement?.focus();
		}

		return () => {
			window.removeEventListener('keydown', handleKeydown);
		};
	});

	// Update keyboard listener when open changes
	$effect(() => {
		if (open) {
			window.addEventListener('keydown', handleKeydown);
			modalElement?.focus();
		} else {
			window.removeEventListener('keydown', handleKeydown);
		}

		return () => {
			window.removeEventListener('keydown', handleKeydown);
		};
	});
</script>

{#if open}
	<div class="modal-backdrop" onclick={handleBackdropClick} role="presentation">
		<div
			bind:this={modalElement}
			class="modal-content"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			aria-labelledby="modal-title"
			tabindex="-1"
		>
			<!-- Header -->
			<div class="modal-header">
				<h2 id="modal-title" class="modal-title">Edit {routine.name}</h2>
				<button
					type="button"
					onclick={handleCloseClick}
					class="close-button"
					aria-label="Close modal"
					disabled={isSaving}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<line x1="18" y1="6" x2="6" y2="18"></line>
						<line x1="6" y1="6" x2="18" y2="18"></line>
					</svg>
				</button>
			</div>

			<!-- Error Banner -->
			{#if saveError}
				<div class="error-banner">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<circle cx="12" cy="12" r="10"></circle>
						<line x1="12" y1="8" x2="12" y2="12"></line>
						<line x1="12" y1="16" x2="12.01" y2="16"></line>
					</svg>
					<span>{saveError}</span>
				</div>
			{/if}

			<!-- Scrollable Content -->
			<div class="modal-body">
				<EditableLogForm
					{routine}
					initialData={log}
					mode="edit"
					{showMenstrualCycleTracking}
					onSubmit={handleSubmit}
					onCancel={handleCloseClick}
				/>
			</div>

			<!-- Loading Overlay -->
			{#if isSaving}
				<div class="loading-overlay">
					<div class="loading-spinner"></div>
					<p class="loading-text">Saving changes...</p>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(15, 23, 42, 0.95);
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		overflow-y: auto;
		animation: fadeIn 0.2s ease;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.modal-content {
		background: var(--color-bg-card);
		border-radius: 12px;
		border: 1px solid rgba(148, 163, 184, 0.2);
		max-width: 600px;
		width: 100%;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		position: relative;
		animation: slideUp 0.3s ease;
		outline: none;
	}

	@keyframes slideUp {
		from {
			transform: translateY(20px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	/* Mobile: full screen */
	@media (max-width: 640px) {
		.modal-backdrop {
			padding: 0;
		}

		.modal-content {
			max-width: 100%;
			max-height: 100vh;
			border-radius: 0;
			border: none;
		}
	}

	/* Header */
	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		/* Use safe-area-inset-top so the header clears the iPhone notch /
		   Dynamic Island in standalone PWA mode. env(...) is 0 on
		   non-notched devices/browsers, so 1.5rem remains the floor. */
		padding: max(1.5rem, env(safe-area-inset-top)) 1.5rem 1.5rem;
		border-bottom: 1px solid rgba(148, 163, 184, 0.15);
		flex-shrink: 0;
	}

	.modal-title {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0;
	}

	.close-button {
		padding: 0.5rem;
		background: transparent;
		border: none;
		color: var(--color-text-muted);
		cursor: pointer;
		border-radius: 6px;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.close-button:hover:not(:disabled) {
		background: rgba(148, 163, 184, 0.1);
		color: var(--color-text);
	}

	.close-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Error Banner */
	.error-banner {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem 1.5rem;
		background: rgba(239, 68, 68, 0.1);
		border-bottom: 1px solid rgba(239, 68, 68, 0.3);
		color: #ef4444;
		font-size: 0.875rem;
		flex-shrink: 0;
	}

	/* Body */
	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem;
	}

	/* Loading Overlay */
	.loading-overlay {
		position: absolute;
		inset: 0;
		background: rgba(15, 23, 42, 0.9);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		border-radius: 12px;
		z-index: 10;
	}

	@media (max-width: 640px) {
		.loading-overlay {
			border-radius: 0;
		}
	}

	.loading-spinner {
		width: 48px;
		height: 48px;
		border: 4px solid rgba(148, 163, 184, 0.2);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.loading-text {
		color: var(--color-text);
		font-size: 0.875rem;
		font-weight: 500;
	}
</style>
