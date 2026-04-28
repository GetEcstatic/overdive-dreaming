<script lang="ts">
	import { onMount } from 'svelte';
	import { Timestamp } from 'firebase/firestore';
	import { page } from '$app/stores';
	import { user } from '$lib/stores/auth';
	import { getRoutinesForUser, createRoutineLog, updateRoutineLog, getUserSettings, upsertPublicUserProfile } from '$lib/firestore';
	import { uploadSessionPhotoMedia, uploadBiometricCsv } from '$lib/storage';
	import {
		checkIsCategoryPB,
		getUserPBRecords,
		updateUserPBRecord
	} from '$lib/utils/personalBests';
	import { deriveAttemptCategory } from '$lib/utils/attemptCategories';
	import { getTimeOfDay } from '$lib/utils/sessions';
	import { clearDashboardCache } from '$lib/utils/dashboardCache';
	import RoutineSelector from '$lib/components/RoutineSelector.svelte';
	import QuickLogForm, { type LogFormData } from '$lib/components/QuickLogForm.svelte';
	import type { Discipline, LapData, RoutineTemplate, SessionVisibility } from '$lib/types';

	let routines = $state<RoutineTemplate[]>([]);
	let selectedRoutine = $state<RoutineTemplate | null>(null);
	let selectedRoutineId = $state<string | undefined>(undefined);
	let loading = $state(true);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);
	let defaultSessionVisibility = $state<SessionVisibility>('private');
	let showMenstrualCycleTracking = $state<boolean>(false);

	// Seed values passed in by the dynamic dive recorder via ?seed=<sessionId>
	// and a sessionStorage bundle at `dive-log-seed:<sessionId>`.
	let seedInitialValues = $state<{
		discipline?: Discipline;
		totalDistance?: number;
		totalTimeSeconds?: number;
		poolLength?: number;
		notes?: string;
		avgSpeed?: number;
		laps?: LapData[];
	} | undefined>(undefined);
	// Recorder's ad-hoc session id carried through from ?seed=… — used
	// after save to re-link diveVideo docs onto the new routineLog id.
	let seedSessionId = $state<string | null>(null);

	onMount(async () => {
		if (!$user) return;

		try {
			routines = await getRoutinesForUser($user.uid);
			const settings = await getUserSettings($user.uid);
			if (settings?.defaultSessionVisibility) {
				defaultSessionVisibility = settings.defaultSessionVisibility;
			}
			if (settings?.showMenstrualCycleTracking) {
				showMenstrualCycleTracking = settings.showMenstrualCycleTracking;
			}

			// Auto-select a routine + seed the form if we were sent here
			// from the dynamic dive recorder.
			const searchParams = $page.url.searchParams;
			const routineParam = searchParams.get('routine');
			const seedParam = searchParams.get('seed');

			// Always capture the seed session id when present — even if the
			// routine param doesn't match a loaded routine. This ensures the
			// post-save `reassignDiveVideoSession` step runs so freshly
			// uploaded diveVideo docs get re-linked to the new routineLog id
			// (otherwise they stay pinned to the ad-hoc recorder session and
			// never show up in the feed card or session detail).
			if (seedParam) {
				seedSessionId = seedParam;
				if (typeof sessionStorage !== 'undefined') {
					try {
						const raw = sessionStorage.getItem(`dive-log-seed:${seedParam}`);
						if (raw) {
							const parsed = JSON.parse(raw) as {
								discipline?: Discipline;
								poolLength?: number;
								summary?: {
									totalDistanceM?: number;
									totalTimeSeconds?: number;
									averageSpeedMs?: number;
									perLap?: Array<{
										lapNumber: number;
										splitSeconds: number;
										avgSpeedMs: number;
										cumulativeDistanceM: number;
									}>;
								};
							};
							const perLap = parsed.summary?.perLap ?? [];
							const lapsSeed: LapData[] | undefined =
								perLap.length > 0
									? perLap.map((lap, idx) => {
											const prevCumulative =
												idx === 0 ? 0 : perLap[idx - 1].cumulativeDistanceM;
											const lapDistance =
												lap.cumulativeDistanceM - prevCumulative;
											return {
												lapNumber: lap.lapNumber,
												timeSeconds: Number(lap.splitSeconds.toFixed(2)),
												distanceMeters: Number(lapDistance.toFixed(2)),
												speedMs: Number(lap.avgSpeedMs.toFixed(3)),
												completed: true
											};
										})
									: undefined;
							seedInitialValues = {
								discipline: parsed.discipline,
								poolLength: parsed.poolLength,
								totalDistance: parsed.summary?.totalDistanceM
									? Math.round(parsed.summary.totalDistanceM)
									: undefined,
								totalTimeSeconds: parsed.summary?.totalTimeSeconds
									? Math.round(parsed.summary.totalTimeSeconds)
									: undefined,
								avgSpeed:
									parsed.summary?.averageSpeedMs !== undefined
										? Number(parsed.summary.averageSpeedMs.toFixed(3))
										: undefined,
								laps: lapsSeed
							};
							sessionStorage.removeItem(`dive-log-seed:${seedParam}`);
						}
					} catch (seedErr) {
						console.warn('Failed to read dive-log-seed:', seedErr);
					}
				}
			}

			if (routineParam) {
				const match = routines.find((r) => r.id === routineParam);
				if (match) {
					selectedRoutine = match;
					selectedRoutineId = match.id;
				} else {
					console.warn(
						`[dives] routine "${routineParam}" not found for user; skipping auto-select`
					);
				}
			}

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

	function buildSessionDateTime(dateStr: string, timeStr?: string): Date {
		const dateTime = new Date(dateStr);
		const fallback = new Date();
		const [hours, minutes] = (timeStr ?? `${fallback.getHours()}:${fallback.getMinutes()}`)
			.split(':')
			.map((value) => Number(value));
		dateTime.setHours(hours || 0, minutes || 0, 0, 0);
		return dateTime;
	}

	async function handleSubmit(logData: LogFormData) {
		if (!$user || !selectedRoutine) return;

		saving = true;
		error = null;
		success = null;

		try {
			// 1. Calculate time of day and session group using selected date/time
			const sessionDateTime = buildSessionDateTime(logData.sessionDate, logData.sessionTime);
			const timeOfDay = getTimeOfDay(sessionDateTime);
			const dateStr = logData.sessionDate; // Already in YYYY-MM-DD format
			const sessionGroup = `${dateStr}-${timeOfDay}`; // e.g., "2026-01-01-morning"

			const category = deriveAttemptCategory({
				disciplineUsed: logData.disciplineUsed,
				attemptConditions: logData.attemptConditions,
				defaultLungVolume: logData.defaultLungVolume,
				gasMix: logData.gasMix,
				breatheUpType: logData.breatheUpType
			});

			// 2. Check if this is a PB (for max-attempt routines only)
			let isPB = false;
			const isMaxAttempt = selectedRoutine.tags.includes('max-attempt') || selectedRoutine.tags.includes('pb');
			const result = logData.disciplineUsed === 'STA'
				? logData.totalTime
				: logData.totalDistance;

			if (isMaxAttempt && result !== undefined) {
				try {
					const currentPBRecords = await getUserPBRecords($user.uid);
					isPB = checkIsCategoryPB({ key: category.key, value: result }, currentPBRecords);
				} catch (pbCheckError) {
					console.warn('Could not check PB status before saving routine:', pbCheckError);
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
					attemptConditions: category.conditions,
					pbCategoryKey: category.key,
					pbCategoryLabel: category.label,
					hasDetailedData: false, // Quick summary only
					visibility: logData.visibility ?? defaultSessionVisibility,
					...(isPB && { isPB: true }) // Mark as PB if applicable
			};

			if ($user.displayName) routineLogData.authorDisplayName = $user.displayName;
			if ($user.photoURL) routineLogData.authorPhotoURL = $user.photoURL;

			if ($user.displayName) {
				try {
					await upsertPublicUserProfile($user.uid, {
						displayName: $user.displayName,
						photoURL: $user.photoURL ?? undefined
					});
				} catch (profileError) {
					console.warn('Failed to update public profile:', profileError);
				}
			}

			if (logData.isCompetition) routineLogData.isCompetition = true;
			if (logData.isCompetition && logData.compeitionOrg) {
				routineLogData.compeitionOrg = logData.compeitionOrg;
			}
			if (logData.cardTag) routineLogData.cardTag = logData.cardTag;
			if (logData.recordTag) routineLogData.recordTag = logData.recordTag;

			// Session context
			if (logData.poolLength !== undefined) routineLogData.poolLength = logData.poolLength;
			if (logData.initialBreatheUpTime !== undefined) routineLogData.initialBreatheUpTime = logData.initialBreatheUpTime;

			// Performance metrics
			if (logData.totalDistance !== undefined) routineLogData.totalDistance = logData.totalDistance;
			if (logData.totalTime !== undefined) routineLogData.totalTime = logData.totalTime;
			if (logData.repDuration !== undefined) routineLogData.repDuration = logData.repDuration;
			if (logData.repDistance !== undefined) routineLogData.repDistance = logData.repDistance;
			// Average speed + per-lap splits — either user-entered or seeded
			// from the dynamic dive recorder. Persisted on the routineLog so
			// analytics + session detail can show the per-lap breakdown.
			if (logData.avgSpeed !== undefined) routineLogData.avgSpeed = logData.avgSpeed;

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

			// Lung capacity
			if (logData.fvc !== undefined) routineLogData.fvc = logData.fvc;
			if (logData.fvcWithPacking !== undefined) routineLogData.fvcWithPacking = logData.fvcWithPacking;
			if (logData.packingVolume !== undefined) routineLogData.packingVolume = logData.packingVolume;
			if (logData.defaultLungVolume !== undefined) routineLogData.defaultLungVolume = logData.defaultLungVolume;

			// O2-Assisted Static Apnea
			if (logData.lucidity !== undefined) routineLogData.lucidity = logData.lucidity;
			if (logData.urgeToBreathe !== undefined) routineLogData.urgeToBreathe = logData.urgeToBreathe;
			if (logData.contractions !== undefined) routineLogData.contractions = logData.contractions;
			if (logData.etco2 !== undefined) routineLogData.etco2 = logData.etco2;
			if (logData.expiredAirPostHold !== undefined) routineLogData.expiredAirPostHold = logData.expiredAirPostHold;
			if (logData.lungVolumeLossPerMin !== undefined) routineLogData.lungVolumeLossPerMin = logData.lungVolumeLossPerMin;
			if (logData.gasMix !== undefined) routineLogData.gasMix = logData.gasMix;
			if (logData.co2TremorOnset !== undefined) routineLogData.co2TremorOnset = logData.co2TremorOnset;
			if (logData.mentalChangeTime !== undefined) routineLogData.mentalChangeTime = logData.mentalChangeTime;
			if (logData.recoveryQuality !== undefined) routineLogData.recoveryQuality = logData.recoveryQuality;
			if (logData.endSpO2 !== undefined) routineLogData.endSpO2 = logData.endSpO2;
			if (logData.breatheUpType !== undefined) routineLogData.breatheUpType = logData.breatheUpType;

			// BIOMETRIC TRACKING - Per-rep SpO2/HR data
			if (logData.laps && logData.laps.length > 0) routineLogData.laps = logData.laps;
			if (logData.hasBiometricData) routineLogData.hasBiometricData = logData.hasBiometricData;
			if (logData.longestHold !== undefined) routineLogData.longestHold = logData.longestHold;
			if (logData.cumulativeHoldTime !== undefined) routineLogData.cumulativeHoldTime = logData.cumulativeHoldTime;
			if (logData.lowestSpO2 !== undefined) routineLogData.lowestSpO2 = logData.lowestSpO2;
			if (logData.sessionAvgSpO2 !== undefined) routineLogData.sessionAvgSpO2 = logData.sessionAvgSpO2;
			if (logData.sessionMinHR !== undefined) routineLogData.sessionMinHR = logData.sessionMinHR;
			if (logData.sessionMaxHR !== undefined) routineLogData.sessionMaxHR = logData.sessionMaxHR;
			if (logData.totalTimeBelow70 !== undefined) routineLogData.totalTimeBelow70 = logData.totalTimeBelow70;
			if (logData.totalTimeBelow60 !== undefined) routineLogData.totalTimeBelow60 = logData.totalTimeBelow60;
			if (logData.totalTimeBelow50 !== undefined) routineLogData.totalTimeBelow50 = logData.totalTimeBelow50;
			if (logData.totalTimeBelow40 !== undefined) routineLogData.totalTimeBelow40 = logData.totalTimeBelow40;

			// Media - add YouTube URL if provided
			if (logData.youtubeUrl) routineLogData.youtubeUrl = logData.youtubeUrl;

			// 4. Create routine log (get the ID for photo and CSV upload)
			const routineLogId = await createRoutineLog(routineLogData);

			// 4b. If this log was opened from the dynamic dive recorder,
			// re-link the freshly-uploaded diveVideo(s) from the ad-hoc
			// recorder session id onto the new routineLog id so session
			// detail and feed cards can find them.
			if (seedSessionId && seedSessionId !== routineLogId) {
				try {
					const { reassignDiveVideoSession } = await import(
						'$lib/services/diveVideos'
					);
					const reassignedCount = await reassignDiveVideoSession(
						seedSessionId,
						routineLogId
					);
					console.log(
						`[dives] Re-linked ${reassignedCount} diveVideo(s) from ${seedSessionId} → ${routineLogId}`
					);
				} catch (reassignErr) {
					console.warn('Failed to re-link dive video session:', reassignErr);
				}
			} else if (seedSessionId) {
				console.log(
					`[dives] seedSessionId === routineLogId (${routineLogId}); no re-link needed`
				);
			}

			// PB bookkeeping should never make the saved routine/video look
			// failed. If it breaks, preserve the session and allow PB repair
			// separately.
			if (isMaxAttempt && isPB && result !== undefined) {
				try {
					await updateUserPBRecord($user.uid, {
						key: category.key,
						discipline: logData.disciplineUsed,
						categoryKind: category.conditions.kind,
						categoryLabel: category.label,
						metric: category.metric,
						value: result,
						routineLogId,
						date: Timestamp.fromDate(sessionDateTime),
						conditions: category.conditions,
						isStandard: category.isStandard
					});
				} catch (pbError) {
					console.warn('Routine saved, but PB update failed:', pbError);
					error = 'Routine saved, but PB update failed. PBs can be recalculated later.';
				}
			}

			// 5. Upload photo if provided and update routine log
			if (logData.photoFile) {
				try {
					const photo = await uploadSessionPhotoMedia(
						$user.uid,
						routineLogId, // Use routineLogId as folder name
						logData.photoFile,
						(progress) => {
							console.log('Upload progress:', progress);
						}
					);

					// Update routine log with photo URL + durable object ref
					await updateRoutineLog(routineLogId, {
						photoUrl: photo.url,
						photoObject: photo.object
					});
				} catch (uploadError) {
					console.error('Photo upload failed:', uploadError);
					error = 'Failed to upload photo. Routine saved without photo.';
				}
			}

			// 6. Upload raw biometric CSV if provided
			if (logData.rawBiometricCsv) {
				try {
					const biometricCsvUrl = await uploadBiometricCsv(
						$user.uid,
						routineLogId,
						logData.rawBiometricCsv
					);

					// Update routine log with CSV URL
					await updateRoutineLog(routineLogId, { biometricCsvUrl });
				} catch (uploadError) {
					console.error('Biometric CSV upload failed:', uploadError);
					// Don't show error - parsed data is already saved
				}
			}

			// Show success message with PB indicator
			success = isPB
				? '🎉 NEW PERSONAL BEST! Routine logged successfully!'
				: 'Routine logged successfully! 🎉';
			clearDashboardCache($user.uid);
			selectedRoutine = null;
			selectedRoutineId = undefined;

			// Clear success message after 3 seconds
			setTimeout(() => {
				success = null;
			}, 3000);
		} catch (err) {
			console.error('Error saving routine log:', err);
			const detail = err instanceof Error ? err.message : String(err);
			error = `Failed to save routine log: ${detail}`;
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
				<QuickLogForm
					routine={selectedRoutine}
					onSubmit={handleSubmit}
					onCancel={handleCancel}
					defaultVisibility={defaultSessionVisibility}
					{showMenstrualCycleTracking}
					{saving}
					initialValues={seedInitialValues}
				/>
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
