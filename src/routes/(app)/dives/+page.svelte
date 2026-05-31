<script lang="ts">
	import { onMount } from 'svelte';
	import { Timestamp } from 'firebase/firestore';
	import { page } from '$app/stores';
	import { Video } from 'lucide-svelte';
	import { user } from '$lib/stores/auth';
	import {
		getRoutinesForUser,
		getRoutine,
		createRoutine,
		createRoutineLog,
		updateRoutineLog,
		getUserSettings,
		upsertPublicUserProfile,
		createGroupRoutineInvites,
		getGroupRoutineInvite,
		updateGroupRoutineInvite
	} from '$lib/firestore';
	import { uploadSessionPhotoMedia, uploadBiometricCsv } from '$lib/storage';
	import {
		checkIsCategoryPB,
		getUserPBRecords,
		updateUserPBRecord
	} from '$lib/utils/personalBests';
	import { deriveAttemptCategory } from '$lib/utils/attemptCategories';
	import { getTimeOfDay } from '$lib/utils/sessions';
	import { clearDashboardCache } from '$lib/utils/dashboardCache';
	import { derivePublicModeCapabilities, readLocalAdvancedOverride } from '$lib/publicMode/capabilities';
	import {
		buildPublicPresetRoutineCreateData,
		publicRoutinePresets,
		type PublicRoutinePreset
	} from '$lib/publicMode/presets';
	import {
		buildInitialRoutineLogResultRows,
		buildRoutineLogPlanRows,
		deriveRoutineLogSummaryFromRows
	} from '$lib/routineLayers/logPlan';
	import RoutineSelector from '$lib/components/RoutineSelector.svelte';
	import QuickLogForm, { type LogFormData } from '$lib/components/QuickLogForm.svelte';
	import DiveBuddyPicker from '$lib/components/DiveBuddyPicker.svelte';
	import type {
		Discipline,
		GroupRoutineInvite,
		LapData,
		PublicUserProfile,
		RoutineLogFormData,
		RoutineTemplate,
		SessionVisibility
	} from '$lib/types';

	let routines = $state<RoutineTemplate[]>([]);
	let selectedRoutine = $state<RoutineTemplate | null>(null);
	let selectedRoutineId = $state<string | undefined>(undefined);
	let loading = $state(true);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);
	let defaultSessionVisibility = $state<SessionVisibility>('private');
	let showMenstrualCycleTracking = $state<boolean>(false);
	let isPublicMode = $state(true);
	let creatingPublicPresetId = $state<string | null>(null);
	let selectedDiveBuddies = $state<PublicUserProfile[]>([]);
	let activeGroupInvite = $state<GroupRoutineInvite | null>(null);
	let publicPresetRows = $derived(publicRoutinePresets.map((preset) => ({
		preset,
		routine: findRoutineForPublicPreset(preset)
	})));

	// Seed values passed in by the dynamic dive recorder via ?seed=<sessionId>
	// and a sessionStorage bundle at `dive-log-seed:<sessionId>`.
	let seedInitialValues = $state<{
		discipline?: Discipline;
		sessionDate?: string;
		sessionTime?: string;
		totalDistance?: number;
		totalTimeSeconds?: number;
		repsCompleted?: number;
		repDuration?: number;
		repDistance?: number;
		poolLength?: number;
		initialBreatheUpTime?: number;
		breathingTechnique?: LogFormData['breathingTechnique'];
		rpe?: number;
		joyScale?: number;
		hoursSinceLastMeal?: number;
		notes?: string;
		waterTemperature?: number;
		contractionsOnsetTime?: number;
		equipmentUsed?: string;
		buddyName?: string;
		breathsBetweenReps?: number;
		defaultLungVolume?: LogFormData['defaultLungVolume'];
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
			isPublicMode = derivePublicModeCapabilities({
				uid: $user.uid,
				email: $user.email,
				settings,
				localAdvancedOverride: typeof window !== 'undefined'
					? readLocalAdvancedOverride(window.localStorage)
					: false
			}).isPublicMode;
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
			const publicPresetParam = searchParams.get('publicPreset');
			const seedParam = searchParams.get('seed');
			const groupInviteParam = searchParams.get('groupInvite');

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
			} else if (publicPresetParam) {
				const preset = publicRoutinePresets.find((entry) => entry.id === publicPresetParam);
				if (preset) {
					await handlePublicPresetSelect(preset, findRoutineForPublicPreset(preset));
				} else {
					console.warn(
						`[dives] public preset "${publicPresetParam}" not found; skipping auto-select`
					);
				}
			}

			if (groupInviteParam) {
				const invite = await getGroupRoutineInvite(groupInviteParam);
				if (!invite) {
					throw new Error('Group routine invite not found.');
				}
				if (invite.recipientUserId !== $user.uid) {
					throw new Error('This group routine invite is for another athlete.');
				}
				if (invite.status !== 'pending') {
					throw new Error(`This group routine invite has already been ${invite.status}.`);
				}

				let routine = routines.find((r) => r.id === invite.routineId) ?? null;
				if (!routine) routine = await getRoutine(invite.routineId);
				if (!routine) {
					throw new Error('The routine for this group invite could not be loaded.');
				}

				activeGroupInvite = invite;
				selectedRoutine = routine;
				selectedRoutineId = routine.id;
				seedInitialValues = seedFromRoutineLog(invite.sourceLogData);
			}

			loading = false;
		} catch (err) {
			console.error('Error loading routines:', err);
			error = err instanceof Error ? err.message : 'Failed to load routines';
			loading = false;
		}
	});

	function handleRoutineSelect(routine: RoutineTemplate) {
		selectedRoutine = routine;
		selectedRoutineId = routine.id;
		error = null;
		success = null;
	}

	async function handlePublicPresetSelect(preset: PublicRoutinePreset, routine: RoutineTemplate | undefined) {
		if (routine) {
			handleRoutineSelect(routine);
			return;
		}
		if (!$user || creatingPublicPresetId) return;

		try {
			creatingPublicPresetId = preset.id;
			error = null;
			const routineId = await createRoutine($user.uid, buildPublicPresetRoutineCreateData(preset));
			const createdRoutine = await getRoutine(routineId);
			if (!createdRoutine) throw new Error('Preset routine was created but could not be loaded.');
			routines = [...routines, createdRoutine];
			handleRoutineSelect(createdRoutine);
		} catch (err) {
			console.error('Failed to create public preset routine:', err);
			error = err instanceof Error ? err.message : 'Failed to create preset routine';
		} finally {
			creatingPublicPresetId = null;
		}
	}

	function findRoutineForPublicPreset(preset: PublicRoutinePreset): RoutineTemplate | undefined {
		const presetName = preset.name.trim().toLowerCase();
		const exampleName = preset.example.name.trim().toLowerCase();
		return routines.find((routine) => {
			const routineName = routine.name.trim().toLowerCase();
			return routine.id === `system-${preset.id}`
				|| routine.id === preset.id
				|| routine.publicPresetId === preset.id
				|| routineName === presetName
				|| routineName === exampleName
				|| preset.example.defaultTags.every((tag) => routine.tags.includes(tag));
		});
	}

	function handleCancel() {
		selectedRoutine = null;
		selectedRoutineId = undefined;
		selectedDiveBuddies = [];
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

	function seedFromRoutineLog(log: RoutineLogFormData): typeof seedInitialValues {
		const date = log.date.toDate();
		return {
			discipline: log.disciplineUsed,
			sessionDate: date.toISOString().split('T')[0],
			sessionTime: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
			poolLength: log.poolLength,
			initialBreatheUpTime: log.initialBreatheUpTime,
			totalDistance: log.totalDistance ?? log.diveDistance,
			totalTimeSeconds: log.totalTime ?? log.diveDuration,
			repsCompleted: log.summary?.repsCompleted ?? log.repsCompleted,
			repDuration: log.repDuration,
			repDistance: log.repDistance,
			avgSpeed: log.avgSpeed ?? log.avgSpeedMs,
			laps: log.laps,
			breathingTechnique: log.breathingTechnique,
			rpe: log.rpe,
			joyScale: log.joyScale,
			hoursSinceLastMeal: log.hoursSinceLastMeal,
			notes: log.notes,
			waterTemperature: log.waterTemperature,
			contractionsOnsetTime: log.contractionsOnsetTime,
			equipmentUsed: log.equipmentUsed,
			buddyName: log.buddyName,
			breathsBetweenReps: log.breathsBetweenReps,
			defaultLungVolume: log.defaultLungVolume
		};
	}

	async function handleSubmit(logData: LogFormData) {
		if (!$user || !selectedRoutine) return;
		const routine = selectedRoutine;

		saving = true;
		error = null;
		success = null;

		try {
			let groupInviteError: string | null = null;

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

			const plannedRows = logData.plannedRows ?? buildRoutineLogPlanRows(routine);
			const resultRows = logData.resultRows ?? buildInitialRoutineLogResultRows(plannedRows, {
				repsCompleted: logData.repsCompleted,
				totalTimeSeconds: logData.totalTime,
				totalDistanceMeters: logData.totalDistance,
				repDurationSeconds: logData.repDuration,
				repDistanceMeters: logData.repDistance
			});
			const rowSummary = deriveRoutineLogSummaryFromRows(plannedRows, resultRows);
			const totalDistance = rowSummary.dynamicDistanceMeters ?? logData.totalDistance;
			const totalTime = rowSummary.totalDurationSeconds ?? logData.totalTime;
			const repsCompleted = rowSummary.completedCount || logData.repsCompleted;
			const avgSpeed = rowSummary.averageDynamicSpeedMs ?? logData.avgSpeed;
			const repDuration = rowSummary.uniformRepDurationSeconds ?? logData.repDuration;
			const repDistance = rowSummary.uniformRepDistanceMeters ?? logData.repDistance;

			// 2. Check if this is a PB (for max-attempt routines only)
			let isPB = false;
			const isMaxAttempt = routine.tags.includes('max-attempt') || routine.tags.includes('pb');
			const result = logData.disciplineUsed === 'STA'
				? totalTime
				: totalDistance;

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
					routineId: routine.id,
					userId: $user.uid,
					date: Timestamp.fromDate(sessionDateTime), // Use selected date instead of now
				timeOfDay,
					sessionGroup,
					disciplineUsed: logData.disciplineUsed,
					plannedRows,
					resultRows,
					attemptConditions: category.conditions,
					pbCategoryKey: category.key,
					pbCategoryLabel: category.label,
					hasDetailedData: false, // Quick summary only
					visibility: logData.visibility ?? defaultSessionVisibility,
					...(isPB && { isPB: true }) // Mark as PB if applicable
			};

			if ($user.displayName) routineLogData.authorDisplayName = $user.displayName;
			if ($user.photoURL) routineLogData.authorPhotoURL = $user.photoURL;

			if (activeGroupInvite) {
				routineLogData.groupRoutineId = activeGroupInvite.groupRoutineId;
				routineLogData.groupRoutineInviteId = activeGroupInvite.id;
				routineLogData.groupRoutineSourceLogId = activeGroupInvite.sourceRoutineLogId;
				const inheritedNames = activeGroupInvite.sourceLogData?.groupRoutineParticipantNames;
				if (inheritedNames && inheritedNames.length > 0) {
					routineLogData.groupRoutineParticipantNames = inheritedNames;
				}
				const inheritedCount = activeGroupInvite.sourceLogData?.groupRoutineParticipantCount;
				if (typeof inheritedCount === 'number') {
					routineLogData.groupRoutineParticipantCount = inheritedCount;
				}
			}

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
			if (totalDistance !== undefined) {
				routineLogData.totalDistance = totalDistance;
				routineLogData.cumulativeDistance = totalDistance;
			}
			if (totalTime !== undefined) {
				routineLogData.totalTime = totalTime;
				routineLogData.cumulativeHoldTime = rowSummary.cumulativeHoldSeconds ?? totalTime;
			}
			if (repDuration !== undefined) routineLogData.repDuration = repDuration;
			if (repDistance !== undefined) routineLogData.repDistance = repDistance;
			// Average speed + per-lap splits — either user-entered or seeded
			// from the dynamic dive recorder. Persisted on the routineLog so
			// analytics + session detail can show the per-lap breakdown.
			if (avgSpeed !== undefined) {
				routineLogData.avgSpeed = avgSpeed;
				routineLogData.avgSpeedMs = avgSpeed;
			}
			if (rowSummary.longestHoldSeconds !== undefined) {
				routineLogData.longestHold = rowSummary.longestHoldSeconds;
			}

			// Summary (for interval routines)
			if (repsCompleted !== undefined || totalTime !== undefined) {
				routineLogData.summary = {};
				if (repsCompleted !== undefined) {
					routineLogData.summary.repsCompleted = repsCompleted;
				}
				if (totalTime !== undefined) {
					routineLogData.summary.totalTimeSeconds = totalTime;
				}
				if (repsCompleted && totalTime !== undefined) {
					routineLogData.summary.averageTimePerRep = totalTime / repsCompleted;
					routineLogData.summary.averageTimePerLap = totalTime / repsCompleted;
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

			if (activeGroupInvite) {
				await updateGroupRoutineInvite(activeGroupInvite.id, {
					status: 'accepted',
					acceptedRoutineLogId: routineLogId
				});
			} else if (!seedSessionId && selectedDiveBuddies.length > 0) {
				const groupRoutineId = routineLogId;
				// Denormalised participant list — host first so feed cards can
				// render "with X, Y + N others" without fanout queries. Each
				// invitee inherits this list when they accept the invite.
				const hostName = $user.displayName ?? 'Host';
				const groupRoutineParticipantNames = [
					hostName,
					...selectedDiveBuddies.map((buddy) => buddy.displayName)
				];
				try {
					await updateRoutineLog(routineLogId, {
						groupRoutineId,
						groupRoutineParticipantCount: selectedDiveBuddies.length + 1,
						groupRoutineParticipantNames
					} as Partial<RoutineLogFormData>);

					const sourceLogData = {
						...routineLogData,
						groupRoutineId,
						groupRoutineParticipantCount: selectedDiveBuddies.length + 1,
						groupRoutineParticipantNames
					} as RoutineLogFormData;

					await createGroupRoutineInvites(
						selectedDiveBuddies.map((buddy) => ({
							groupRoutineId,
							sourceRoutineLogId: routineLogId,
							hostUserId: $user.uid,
							hostDisplayName: $user.displayName ?? undefined,
							hostPhotoURL: $user.photoURL ?? undefined,
							recipientUserId: buddy.userId,
							recipientDisplayName: buddy.displayName,
							recipientPhotoURL: buddy.photoURL ?? undefined,
							routineId: routine.id,
							routineName: routine.name,
							date: Timestamp.fromDate(sessionDateTime),
							status: 'pending',
							sourceLogData
						}))
					);
				} catch (inviteErr) {
					console.error('Routine saved, but group invite failed:', inviteErr);
					groupInviteError = inviteErr instanceof Error ? inviteErr.message : String(inviteErr);
				}
			}

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
			const groupMessage = groupInviteError
				? ` Routine saved, but group invites failed: ${groupInviteError}`
				: activeGroupInvite
				? ' Group routine saved to your log.'
				: selectedDiveBuddies.length > 0
					? ` Sent to ${selectedDiveBuddies.length} dive buddy${selectedDiveBuddies.length === 1 ? '' : 'ies'}.`
					: '';
			success = isPB
				? `NEW PERSONAL BEST! Routine logged successfully!${groupMessage}`
				: `Routine logged successfully!${groupMessage}`;
			clearDashboardCache($user.uid);
			selectedRoutine = null;
			selectedRoutineId = undefined;
			selectedDiveBuddies = [];
			activeGroupInvite = null;

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
		<div class="bg-(--color-bg-card) p-8 rounded-lg text-center">
			<div
				class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-(--color-primary) border-r-transparent"
			></div>
			<p class="mt-4 text-(--color-text-muted)">Loading routines...</p>
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
		<div class="bg-(--color-bg-card) p-6 rounded-lg">
			{#if !selectedRoutine}
				<!-- Step 1: Select Routine -->
				<a class="public-record-link" href="/record">
					<Video size={18} aria-hidden="true" />
					<span>Record a dynamic dive</span>
				</a>
				{#if isPublicMode}
					<section class="public-presets" aria-labelledby="public-presets-title">
						<div class="public-presets-head">
							<h2 id="public-presets-title">Choose a session</h2>
							<p>Start with a simple preset and log only the useful result.</p>
						</div>
						<div class="public-preset-list">
							{#each publicPresetRows as row}
								<button
									type="button"
									class="public-preset-button"
									disabled={creatingPublicPresetId !== null}
									onclick={() => handlePublicPresetSelect(row.preset, row.routine)}
								>
									<span>
										<strong>{row.preset.name}</strong>
										<small>{row.preset.description}</small>
									</span>
									<em>{creatingPublicPresetId === row.preset.id ? 'Creating' : row.routine ? row.preset.shareEmphasis : 'Create'}</em>
								</button>
							{/each}
						</div>
					</section>
				{:else}
					<RoutineSelector {routines} bind:selectedRoutineId onSelect={handleRoutineSelect} />
				{/if}
			{:else}
				<!-- Step 2: Quick Log Form -->
				{#if activeGroupInvite}
					<div class="group-invite-banner">
						<div>
							<strong>Group routine invite</strong>
							<p>
								Review the copy from {activeGroupInvite.hostDisplayName ?? 'your dive buddy'}, adjust your own data, then save it to your analytics.
							</p>
						</div>
					</div>
				{:else if !seedSessionId}
					<section class="group-log-panel">
						<div class="group-log-head">
							<div>
								<h2>Log as group</h2>
								<p>Invite dive buddies to review a prefilled copy and save their own personal log.</p>
							</div>
							{#if selectedDiveBuddies.length > 0}
								<span>{selectedDiveBuddies.length}</span>
							{/if}
						</div>
						<DiveBuddyPicker
							bind:selected={selectedDiveBuddies}
							selfId={$user?.uid ?? ''}
							disabled={saving}
							onChange={(profiles) => (selectedDiveBuddies = profiles)}
						/>
					</section>
				{/if}
				<QuickLogForm
					routine={selectedRoutine}
					onSubmit={handleSubmit}
					onCancel={handleCancel}
					defaultVisibility={defaultSessionVisibility}
					{showMenstrualCycleTracking}
					publicMode={isPublicMode}
					{saving}
					initialValues={seedInitialValues}
				/>
			{/if}
		</div>

		<!-- Info Card -->
		{#if !selectedRoutine && routines.length > 0 && !isPublicMode}
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
				<p class="text-(--color-text-muted) mb-4">No routines available yet.</p>
				<p class="text-sm text-(--color-text-muted)">
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

	.group-log-panel,
	.group-invite-banner {
		margin-bottom: 1.25rem;
		padding: 1rem;
		background: rgba(15, 23, 42, 0.7);
		border: 1px solid rgba(20, 184, 166, 0.25);
		border-radius: 8px;
	}

	.group-log-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.85rem;
	}

	.group-log-head h2,
	.group-invite-banner strong {
		font-size: 1rem;
		font-weight: 700;
		color: var(--color-text);
	}

	.group-log-head p,
	.group-invite-banner p {
		margin: 0.2rem 0 0;
		font-size: 0.85rem;
		color: var(--color-text-muted);
	}

	.group-log-head span {
		min-width: 1.6rem;
		height: 1.6rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		background: var(--color-primary);
		color: #0f172a;
		font-size: 0.8rem;
		font-weight: 800;
	}

	.public-presets {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.public-presets-head h2 {
		font-size: 1.2rem;
		font-weight: 750;
		color: var(--color-text);
		margin: 0;
	}

	.public-presets-head p {
		margin: 0.25rem 0 0;
		font-size: 0.9rem;
		color: var(--color-text-muted);
	}

	.public-preset-list {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.7rem;
	}

	.public-record-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.55rem;
		width: 100%;
		min-height: 3rem;
		margin-bottom: 1.35rem;
		padding: 0.8rem 1rem;
		border: 1px solid rgba(20, 184, 166, 0.45);
		border-radius: 8px;
		background: rgba(20, 184, 166, 0.12);
		color: var(--color-text);
		font-size: 0.94rem;
		font-weight: 780;
		text-decoration: none;
	}

	.public-record-link:hover {
		border-color: rgba(20, 184, 166, 0.72);
		background: rgba(20, 184, 166, 0.16);
	}

	.public-preset-button {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.9rem 1rem;
		border: 1px solid rgba(148, 163, 184, 0.18);
		border-radius: 8px;
		background: rgba(15, 23, 42, 0.62);
		color: var(--color-text);
		text-align: left;
		transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease;
	}

	.public-preset-button:not(:disabled):hover {
		border-color: rgba(20, 184, 166, 0.48);
		background: rgba(20, 184, 166, 0.08);
		transform: translateY(-1px);
	}

	.public-preset-button:disabled {
		cursor: not-allowed;
		opacity: 0.52;
	}

	.public-preset-button span {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 0.18rem;
	}

	.public-preset-button strong {
		font-size: 0.98rem;
		font-weight: 720;
	}

	.public-preset-button small {
		font-size: 0.82rem;
		line-height: 1.35;
		color: var(--color-text-muted);
	}

	.public-preset-button em {
		flex: 0 0 auto;
		padding: 0.22rem 0.45rem;
		border-radius: 999px;
		background: rgba(20, 184, 166, 0.12);
		color: var(--color-primary);
		font-size: 0.72rem;
		font-style: normal;
		font-weight: 750;
		text-transform: capitalize;
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
