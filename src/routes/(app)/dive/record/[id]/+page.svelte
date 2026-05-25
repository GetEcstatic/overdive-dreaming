<!--
  Dive video capture page.
  Route: /dive/record/[sessionId]

  Stages:
    setup  → pick discipline, pool length (wheel), waypoints per lap (wheel)
    record → full-screen DiveRecorder
    review → confirm details, pin, choose athlete, save
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { user } from '$lib/stores/auth';
	import DiveRecorder from '$lib/components/DiveRecorder.svelte';
	import AthletePicker from '$lib/components/AthletePicker.svelte';
	import NumberWheelInput from '$lib/components/NumberWheelInput.svelte';
	import {
		buildDiveVideoFormData,
		createDiveVideo,
		listDiveVideosForSession
	} from '$lib/services/diveVideos';
	import { AUTO_REAR_CAMERA } from '$lib/capture/cameraDevices';
	import { canWriteToIndexedDB, enqueueUpload, updatePendingUpload } from '$lib/capture/uploadQueue';
	import { drainUploadQueue } from '$lib/capture/uploadProcessor';
	import { logUploadDiagnostic } from '$lib/capture/uploadDiagnostics';
	import { summariseTimeline, totalDistanceM } from '$lib/capture/timeline';
	import { defaultSpeedMs } from '$lib/capture/disciplineSpeeds';
	import {
		bitrateForResolution,
		DEFAULT_VIDEO_QUALITY_PRESET,
		estimateBytesPerMinute
	} from '$lib/capture/videoQuality';
	import { getUserSettings, updateUserSettings } from '$lib/firestore';
	import { diveRecording } from '$lib/stores/videoPlayback';
	import type {
		CameraFacing,
		CameraPreference,
		DiveTimeline,
		DiveVideoDiscipline,
		DiveVideoQualityPreset,
		DiveVideoDisplayOrientation,
		DiveVideoCapturePosture,
		DiveVideoResolution,
		DiveVideoRotation
	} from '$lib/types';

	const sessionId = $derived($page.params.id ?? '');

	interface CaptureResult {
		blob: Blob;
		source?: 'camera' | 'import';
		mimeType: string;
		sizeBytes: number;
		widthPx: number;
		heightPx: number;
		durationSeconds: number;
		deviceLabel?: string;
		cameraDeviceId?: string;
		cameraPreference: CameraPreference;
		cameraFacing?: CameraFacing;
		qualityPreset: DiveVideoQualityPreset;
		requestedVideoBitrateBps: number;
		actualAverageBitrateBps?: number;
		actualFrameRate?: number;
		timeline: DiveTimeline;
		capturePosture: DiveVideoCapturePosture;
		displayOrientation: DiveVideoDisplayOrientation;
		displayRotationDeg: DiveVideoRotation;
	}

	type Stage = 'setup' | 'record' | 'review' | 'saving' | 'done';
	let stage = $state<Stage>('setup');

	/**
	 * Hide the bottom nav while the recorder is active. Increments a global
	 * counter on entry to the `record` stage and decrements on leaving it,
	 * covering both the "recording ended" (→ review) and cancel (→ setup)
	 * transitions. The $effect cleanup runs whenever `stage` changes so the
	 * counter stays balanced even if the user navigates away mid-record.
	 */
	$effect(() => {
		if (stage !== 'record') return;
		diveRecording.begin();
		return () => diveRecording.end();
	});

	let poolLength = $state<number | undefined>(25);
	let waypointsPerLap = $state<number | undefined>(2);
	let discipline = $state<DiveVideoDiscipline | undefined>(undefined);
	let resolution = $state<DiveVideoResolution>('720p');
	let qualityPreset = $state<DiveVideoQualityPreset>(DEFAULT_VIDEO_QUALITY_PRESET);
	let cameraPreference = $state<CameraPreference>(AUTO_REAR_CAMERA);
	let resolutionLoaded = $state(false);
	/**
	 * Quick-start state.
	 * - `hasQuickStart` = we loaded saved pool defaults and can skip the form.
	 * - `quickStartExpanded` = user tapped "Change settings" to reveal the form.
	 * - `sessionLocked` = a prior DiveVideo on this sessionId already set pool length.
	 */
	let hasQuickStart = $state(false);
	let quickStartExpanded = $state(false);
	let sessionLocked = $state(false);
	let pinned = $state(false);
	let athleteId = $state<string | undefined>(undefined);

	let capture = $state<CaptureResult | null>(null);
	let saveError = $state<string | null>(null);
	let importError = $state<string | null>(null);
	let importingVideo = $state(false);
	let importPreviewUrl = $state<string | null>(null);
	let importPreviewVideo = $state<HTMLVideoElement | null>(null);
	let storageHealthy = $state<boolean | null>(null);

	const canStartRecording = $derived(Boolean(discipline && poolLength && waypointsPerLap));
	const waypointSpacing = $derived(
		poolLength && waypointsPerLap ? poolLength / waypointsPerLap : 0
	);

	function formatMeters(m: number): string {
		return Number.isInteger(m) ? `${m}` : m.toFixed(1);
	}

	function formatMegabytes(bytes: number): string {
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function formatMegabytesPerMinute(bytes: number): string {
		return `${(bytes / (1024 * 1024)).toFixed(0)} MB/min`;
	}

	function formatMbps(bitsPerSecond: number | undefined): string {
		if (!bitsPerSecond || bitsPerSecond <= 0) return 'Unknown';
		return `${(bitsPerSecond / 1_000_000).toFixed(1)} Mbps`;
	}

	function formatFrameRate(frameRate: number | undefined): string {
		if (!frameRate || frameRate <= 0) return 'Unknown';
		return `${frameRate.toFixed(frameRate % 1 === 0 ? 0 : 1)} fps`;
	}

	function qualityWarningsFor(result: CaptureResult): string[] {
		const warnings: string[] = [];
		if (
			result.actualAverageBitrateBps &&
			result.actualAverageBitrateBps < result.requestedVideoBitrateBps * 0.7
		) {
			warnings.push('Actual average bitrate landed below 70% of the request.');
		}
		if (result.actualFrameRate && result.actualFrameRate < 24) {
			warnings.push('Actual frame rate was below 24 fps.');
		}
		return warnings;
	}

	function estimatedRecordingSize(
		resolution: DiveVideoResolution,
		preset: DiveVideoQualityPreset
	): string {
		return formatMegabytesPerMinute(
			estimateBytesPerMinute(bitrateForResolution(resolution, preset))
		);
	}

	function diveDurationSeconds(result: CaptureResult): number {
		return Math.max(0, result.timeline.diveEndMs - result.timeline.diveStartMs) / 1000;
	}

	function secondsFromMs(ms: number): string {
		return `${(ms / 1000).toFixed(1)} s`;
	}

	$effect(() => {
		const uid = $user?.uid;
		if (!uid || resolutionLoaded) return;
		resolutionLoaded = true;

		// Load user-level defaults (resolution + last-used pool setup).
		getUserSettings(uid)
			.then((settings) => {
				if (settings?.defaultVideoResolution) {
					resolution = settings.defaultVideoResolution;
				}
				if (settings?.defaultVideoQualityPreset) {
					qualityPreset = settings.defaultVideoQualityPreset;
				}
				let gotAnyDefault = false;
				if (typeof settings?.defaultPoolLength === 'number') {
					poolLength = settings.defaultPoolLength;
					gotAnyDefault = true;
				}
				if (typeof settings?.defaultWaypointsPerLap === 'number') {
					waypointsPerLap = settings.defaultWaypointsPerLap;
					gotAnyDefault = true;
				}
				// Discipline is deliberately not restored from saved settings. Each
				// recording needs an explicit fresh choice so the recorder never starts
				// with a stale fin/no-fin mode.
				// Note: we no longer restore `defaultCameraPreference` here. The
				// recorder always starts with the auto rear camera and the user
				// switches lenses from the on-screen pill once the preview is
				// live. Pre-selecting a saved deviceId before the camera is
				// opened is unreliable on mobile — the same lens often surfaces
				// under a different id after a new permission prompt, which then
				// fails the getUserMedia call.
				if (gotAnyDefault) hasQuickStart = true;
			})
			.catch((err) => {
				// eslint-disable-next-line no-console
				console.warn('[dive-record] could not load recorder preferences', err);
			});

		// Phase 2: session-scoped lock. If this session already has a recorded
		// dive, reuse its pool length — the diver cannot change pools
		// mid-session. Discipline is intentionally NOT propagated: each dive
		// video is treated as its own routine and the diver may switch
		// between DYN / DYNB / DNF freely within a session.
		if (sessionId) {
			listDiveVideosForSession(sessionId)
				.then((videos) => {
					const prior = videos.find((v) => v.uploadStatus === 'uploaded') ?? videos[0];
					if (!prior) return;
					if (typeof prior.poolLength === 'number') {
						poolLength = prior.poolLength;
					}
					sessionLocked = true;
					hasQuickStart = true;
				})
				.catch((err) => {
					// eslint-disable-next-line no-console
					console.warn('[dive-record] could not check session lock', err);
				});
		}
	});

	function onCaptured(result: CaptureResult): void {
		capture = result;
		stage = 'review';
	}

	async function importVideoFile(event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (!discipline) {
			importError = 'Choose a discipline before selecting a video.';
			return;
		}

		importingVideo = true;
		importError = null;
		try {
			const metadata = await readVideoMetadata(file);
			if (importPreviewUrl) URL.revokeObjectURL(importPreviewUrl);
			importPreviewUrl = URL.createObjectURL(file);
			const durationSeconds = Math.max(0, metadata.durationSeconds);
			const durationMs = Math.round(durationSeconds * 1000);
			capture = {
				blob: file,
				source: 'import',
				mimeType: file.type || 'video/mp4',
				sizeBytes: file.size,
				widthPx: metadata.widthPx,
				heightPx: metadata.heightPx,
				durationSeconds,
				deviceLabel: 'Imported video',
				cameraPreference: AUTO_REAR_CAMERA,
				cameraFacing: 'unknown',
				qualityPreset,
				requestedVideoBitrateBps: bitrateForResolution(resolution, qualityPreset),
				actualAverageBitrateBps: durationSeconds > 0 ? Math.round((file.size * 8) / durationSeconds) : undefined,
				timeline: {
					diveStartMs: 0,
					diveEndMs: durationMs,
					laps: []
				},
				capturePosture: 'unknown',
				displayOrientation: metadata.heightPx > metadata.widthPx ? 'portrait-left' : 'landscape',
				displayRotationDeg: 0
			};
			stage = 'review';
		} catch (err) {
			importError = err instanceof Error ? err.message : 'Could not read this video file.';
		} finally {
			importingVideo = false;
		}
	}

	function setImportedTimelineMarker(kind: 'start' | 'end' | 'halfway'): void {
		if (!capture || capture.source !== 'import' || !importPreviewVideo) return;
		const atMs = Math.round(importPreviewVideo.currentTime * 1000);
		const current = capture.timeline;
		const next: DiveTimeline = {
			...current,
			laps: [...current.laps],
			subSplits: current.subSplits ? [...current.subSplits] : undefined
		};

		if (kind === 'start') {
			next.diveStartMs = Math.min(atMs, Math.max(0, next.diveEndMs - 100));
			next.laps = next.laps.filter((lap) => lap.atMs > next.diveStartMs);
			next.subSplits = next.subSplits?.filter((event) => event.atMs > next.diveStartMs);
		} else if (kind === 'end') {
			next.diveEndMs = Math.max(atMs, next.diveStartMs + 100);
			next.laps = next.laps.filter((lap) => lap.atMs < next.diveEndMs);
			next.subSplits = next.subSplits?.filter((event) => event.atMs < next.diveEndMs);
		} else {
			const splitMs = Math.max(0, atMs - next.diveStartMs);
			next.subSplits = [{
				lapNumber: 1,
				atMs: clamp(atMs, next.diveStartMs, next.diveEndMs),
				cumulativeDistanceM: (poolLength ?? 25) / 2,
				splitMs
			}];
		}

		capture = { ...capture, timeline: next };
	}

	function clamp(value: number, min: number, max: number): number {
		return Math.max(min, Math.min(max, value));
	}

	function readVideoMetadata(file: File): Promise<{ durationSeconds: number; widthPx: number; heightPx: number }> {
		return new Promise((resolve, reject) => {
			const url = URL.createObjectURL(file);
			const video = document.createElement('video');
			video.preload = 'metadata';
			video.onloadedmetadata = () => {
				URL.revokeObjectURL(url);
				resolve({
					durationSeconds: Number.isFinite(video.duration) ? video.duration : 0,
					widthPx: video.videoWidth || 0,
					heightPx: video.videoHeight || 0
				});
			};
			video.onerror = () => {
				URL.revokeObjectURL(url);
				reject(new Error('Could not read this video file.'));
			};
			video.src = url;
		});
	}

	async function save(): Promise<void> {
		if (!capture) return;
		const uid = $user?.uid;
		if (!uid) {
			saveError = 'You must be signed in.';
			return;
		}
		const selectedDiscipline = discipline;
		if (!selectedDiscipline) {
			saveError = 'Choose a discipline before saving this dive.';
			return;
		}
		stage = 'saving';
		saveError = null;
		try {
			logUploadDiagnostic({
				level: 'info',
				step: 'record-save:start',
				message: 'Record page save started',
				details: {
					sessionId,
					hasCapture: Boolean(capture),
					sizeBytes: capture.sizeBytes,
					mimeType: capture.mimeType
				}
			});
			const metadata = buildDiveVideoFormData({
				sessionId,
				userId: uid,
				ownerId: uid,
				athleteId: athleteId ?? uid,
				discipline: selectedDiscipline,
				poolLength: poolLength ?? 25,
				mimeType: capture.mimeType,
				sizeBytes: capture.sizeBytes,
				widthPx: capture.widthPx,
				heightPx: capture.heightPx,
				durationSeconds: capture.durationSeconds,
				resolutionPreset: resolution,
				timeline: capture.timeline,
				deviceLabel: capture.deviceLabel,
				cameraDeviceId: capture.cameraDeviceId,
				cameraPreference: capture.cameraPreference,
				cameraFacing: capture.cameraFacing,
				qualityPreset: capture.qualityPreset,
				requestedVideoBitrateBps: capture.requestedVideoBitrateBps,
				actualAverageBitrateBps: capture.actualAverageBitrateBps,
				actualFrameRate: capture.actualFrameRate,
				capturePosture: capture.capturePosture,
				displayOrientation: capture.displayOrientation,
				displayRotationDeg: capture.displayRotationDeg
			});
			if (pinned) metadata.retentionTier = 'pinned';
			const pending = await enqueueUpload(capture.blob, metadata);
			logUploadDiagnostic({
				level: 'info',
				step: 'record-save:queued',
				message: 'Record page queued capture for upload',
				localId: pending.localId,
				details: {
					sizeBytes: pending.sizeBytes,
					mimeType: pending.mimeType,
					sessionId
				}
			});

			const videoId = await createDiveVideo({ ...metadata });
			await updatePendingUpload(pending.localId, { remoteVideoId: videoId });
			logUploadDiagnostic({
				level: 'info',
				step: 'record-save:remote-created',
				message: 'Record page created dive video before background upload',
				localId: pending.localId,
				videoId
			});

			void drainUploadQueue(undefined, { localIds: [pending.localId] })
				.then((result) => {
					logUploadDiagnostic({
						level: result.uploaded > 0 ? 'info' : 'warn',
						step: 'record-save:background-upload',
						message:
							result.uploaded > 0
								? 'Record page background upload completed'
								: 'Record page background upload did not complete',
						localId: pending.localId,
						videoId,
						details: result
					});
				})
				.catch((err) => {
					logUploadDiagnostic({
						level: 'error',
						step: 'record-save:background-upload',
						message: 'Record page background upload failed',
						localId: pending.localId,
						videoId,
						details: { error: err instanceof Error ? err.message : String(err) }
					});
				});

			// Stash a pre-fill bundle for the dive-log form on the
			// session page. This is pure data — the form picks it up by
			// session id. Kept on sessionStorage so a full reload still
			// finds it; cleared after one read by the consumer.
			//
			// We deliberately SKIP this seed (and the routine-log redirect
			// below) when the dive is being gifted to someone else. The
			// recipient owns the metrics — they'll fill in the form via the
			// gift review route — and we don't want a stub routine log
			// showing up on the gifter's dashboard feed.
			const isGift = Boolean(athleteId && athleteId !== uid);
			if (capture && !isGift) {
				const summary = summariseTimeline(
					capture.timeline,
					defaultSpeedMs(selectedDiscipline)
				);
				try {
					sessionStorage.setItem(
						`dive-log-seed:${sessionId}`,
						JSON.stringify({
							discipline: selectedDiscipline,
							poolLength: poolLength ?? 25,
							summary,
							capturedAt: Date.now()
						})
					);
				} catch {
					// storage quota / private mode — non-fatal
				}
			}

			stage = 'done';
			// Persist the last-used recorder setup so next time we can offer
			// a one-tap quick start. Fire-and-forget — any failure here is
			// purely a UX regression for the *next* session.
			//
			// `defaultCameraPreference` is intentionally NOT saved: the
			// recorder always starts on the auto rear camera and the user
			// switches lenses from the on-screen pill once the preview is
			// live (see comment on the setup-stage camera field).
			if (poolLength && waypointsPerLap) {
				updateUserSettings(uid, {
					defaultPoolLength: poolLength,
					defaultWaypointsPerLap: waypointsPerLap,
					defaultVideoResolution: resolution,
					defaultVideoQualityPreset: qualityPreset
				}).catch((err) => {
					// eslint-disable-next-line no-console
					console.warn('[dive-record] could not save recorder defaults', err);
				});
			}
			if (isGift) {
				// Gifted dive: send the gifter back to the dashboard. The
				// recipient receives the video in their PendingGifts list and
				// fills in the routine log themselves via /gift/{videoId}.
				await goto('/dashboard');
				return;
			}
			// Personal dive: open a new dynamic-max dive log pre-filled
			// with the metrics parsed from the video (discipline, pool
			// length, total distance, total time). The /dives page reads
			// the `dive-log-seed:{sessionId}` sessionStorage bundle and
			// auto-selects the system-dynamic-max routine.
			await goto(
				`/dives?routine=system-dynamic-max&seed=${encodeURIComponent(sessionId)}`
			);
		} catch (err) {
			saveError = err instanceof Error ? err.message : String(err);
			stage = 'review';
		}
	}

	function discard(): void {
		capture = null;
		stage = 'record';
	}

	// While the recorder is active, lock scroll + iOS rubber-banding + pinch
	// zoom. The full-bleed capture UI is fixed-positioned so normal scrolling
	// is meaningless and only causes visual jank.
	$effect(() => {
		if (typeof document === 'undefined') return;
		const html = document.documentElement;
		const body = document.body;
		if (stage === 'record') {
			const prevHtmlOverflow = html.style.overflow;
			const prevBodyOverflow = body.style.overflow;
			const prevHtmlOverscroll = html.style.overscrollBehavior;
			const prevBodyTouch = body.style.touchAction;
			html.style.overflow = 'hidden';
			body.style.overflow = 'hidden';
			html.style.overscrollBehavior = 'none';
			body.style.touchAction = 'none';
			return () => {
				html.style.overflow = prevHtmlOverflow;
				body.style.overflow = prevBodyOverflow;
				html.style.overscrollBehavior = prevHtmlOverscroll;
				body.style.touchAction = prevBodyTouch;
			};
		}
	});

	onMount(() => {
		// Block iOS pinch-zoom for the whole record route.
		const prevent = (e: Event) => e.preventDefault();
		document.addEventListener('gesturestart', prevent);
		document.addEventListener('gesturechange', prevent);

		// Smoke-test IndexedDB writes BEFORE recording. iOS Safari has been
		// observed silently dropping writes under quota / private mode, which
		// causes the recorder to "save" but lose the blob. We surface that
		// state on the setup screen so the user doesn't record into a void.
		canWriteToIndexedDB().then((ok) => {
			storageHealthy = ok;
		});

		return () => {
			document.removeEventListener('gesturestart', prevent);
			document.removeEventListener('gesturechange', prevent);
			if (importPreviewUrl) URL.revokeObjectURL(importPreviewUrl);
		};
	});
</script>

<svelte:head>
	<title>Record dive</title>
</svelte:head>

{#if stage === 'setup'}
	<div class="setup-screen">
		<div class="setup-inner">
			<header class="setup-head">
				<h1>Record dive</h1>
				<p>
					{#if discipline}
						{discipline} selected. Check the pool setup, then start recording.
					{:else if hasQuickStart && !quickStartExpanded}
						Choose this dive's discipline. Your pool setup is already loaded.
					{:else}
						Choose discipline, pool length, and waypoints, then start the camera.
					{/if}
				</p>
			</header>

			{#if storageHealthy === false}
				<div class="storage-warning" role="alert">
					<strong>Browser storage check failed.</strong>
					<p>
						This device can't save uploads locally — recordings made now will
						most likely be lost. Try closing private browsing, freeing up
						space, or using a different device. If you record anyway, check
						Profile › Pending video uploads after saving.
					</p>
				</div>
			{/if}

			{#if importError}
				<div class="storage-warning" role="alert">
					<strong>Video import failed.</strong>
					<p>{importError}</p>
				</div>
			{/if}

			<section class="card discipline-card" class:needs-choice={!discipline}>
				<div class="field">
					<span class="field-label">Choose discipline</span>
					<div class="segmented" role="radiogroup" aria-label="Discipline">
						{#each [
							{ value: 'DYN', label: 'DYN', sub: 'fins' },
							{ value: 'DYNB', label: 'DYNB', sub: 'bifins' },
							{ value: 'DNF', label: 'DNF', sub: 'no fins' }
						] as opt (opt.value)}
							<button
								type="button"
								class="seg-btn"
								class:active={discipline === opt.value}
								role="radio"
								aria-checked={discipline === opt.value}
								onclick={() => (discipline = opt.value as DiveVideoDiscipline)}
							>
								<span class="seg-label">{opt.label}</span>
								<span class="seg-sub">{opt.sub}</span>
							</button>
						{/each}
					</div>
					<p class="field-hint">
						Required for every recording so the video never starts with a stale
						fin/no-fin mode.
					</p>
				</div>
			</section>

			{#if hasQuickStart && !quickStartExpanded && poolLength && waypointsPerLap}
				<section class="quick-start">
					<div class="quick-defaults">
						<span class="quick-eyebrow">Pool setup</span>
						<strong class="quick-summary">
							{formatMeters(poolLength)} m pool · {waypointsPerLap}
							waypoint{waypointsPerLap === 1 ? '' : 's'}
						</strong>
					</div>
					{#if sessionLocked}
						<p class="quick-hint">
							Pool length locked to this session from a previous dive.
						</p>
					{/if}
					<button
						class="link-btn"
						type="button"
						onclick={() => (quickStartExpanded = true)}
					>
						Change settings
					</button>
				</section>
			{:else}
				<section class="card">
					<div class="field">
						<NumberWheelInput
							bind:value={poolLength}
							variant="chip"
							label="Pool length"
							min={10}
							max={100}
							step={5}
							unit="m"
							hint={sessionLocked
								? "Pool length is locked to this session from a previous dive."
								: "The full length of the pool you're recording in."}
						/>
					</div>

					<!--
						Camera selection deliberately removed from setup. Choosing a
						lens before the camera is actually opened often fails on
						iOS/Android (the deviceId may not survive a fresh permission
						prompt). The recorder defaults to the auto rear camera and
						exposes a pill on the live preview to switch lenses once the
						camera image is showing.
					-->

					<div class="field">
						<NumberWheelInput
							bind:value={waypointsPerLap}
							variant="chip"
							label="Waypoints per lap"
							min={1}
							max={8}
							step={1}
							unit={waypointsPerLap === 1 ? 'point' : 'points'}
							hint="2 = tap at the mid-pool mark and at the wall."
						/>
					</div>

					{#if waypointSpacing > 0}
						<div class="summary">
							You'll tap every
							<strong>{formatMeters(waypointSpacing)} m</strong>
							— first waypoint at
							<strong>{formatMeters(waypointSpacing)} m</strong>,
							next at <strong>{formatMeters(waypointSpacing * 2)} m</strong>,
							and so on.
						</div>
					{/if}
				</section>
			{/if}

			<section class="card">
				<div class="field">
					<span class="field-label">Video resolution</span>
					<div class="segmented two" role="radiogroup" aria-label="Video resolution">
						{#each [
							{ value: '720p', label: '720p', sub: 'lighter' },
							{ value: '1080p', label: '1080p', sub: 'sharper' }
						] as opt (opt.value)}
							<button
								type="button"
								class="seg-btn"
								class:active={resolution === opt.value}
								role="radio"
								aria-checked={resolution === opt.value}
								onclick={() => (resolution = opt.value as DiveVideoResolution)}
							>
								<span class="seg-label">{opt.label}</span>
								<span class="seg-sub">{opt.sub}</span>
							</button>
						{/each}
					</div>
				</div>

				<div class="field">
					<span class="field-label">Recording quality</span>
					<div class="segmented" role="radiogroup" aria-label="Recording quality">
						{#each [
							{ value: 'standard', label: 'Std', sub: 'smaller' },
							{ value: 'high', label: 'High', sub: 'default' },
							{ value: 'max', label: 'Max', sub: 'largest' }
						] as opt (opt.value)}
							<button
								type="button"
								class="seg-btn"
								class:active={qualityPreset === opt.value}
								role="radio"
								aria-checked={qualityPreset === opt.value}
								onclick={() => (qualityPreset = opt.value as DiveVideoQualityPreset)}
							>
								<span class="seg-label">{opt.label}</span>
								<span class="seg-sub">{opt.sub}</span>
							</button>
						{/each}
					</div>
					<p class="field-hint">
						About {estimatedRecordingSize(resolution, qualityPreset)} before audio and container overhead.
					</p>
				</div>
			</section>

			<div class="actions">
				<button class="btn btn-secondary" onclick={() => history.back()}>
					Cancel
				</button>
				<label class="btn btn-secondary import-video-button" class:disabled={!discipline || importingVideo}>
					<input
						type="file"
						accept="video/*"
						disabled={!discipline || importingVideo}
						onchange={importVideoFile}
					/>
					{importingVideo ? 'Reading video...' : 'Select video'}
				</label>
				<button
					class="btn btn-primary"
					disabled={!canStartRecording}
					onclick={() => {
						if (canStartRecording) stage = 'record';
					}}
				>
					{discipline ? 'Start recording' : 'Select discipline to start'}
				</button>
			</div>
		</div>
	</div>
{:else if stage === 'record' && discipline}
	<DiveRecorder
		poolLength={poolLength ?? 25}
		waypointsPerLap={waypointsPerLap ?? 2}
		{resolution}
		{qualityPreset}
		{discipline}
		{cameraPreference}
		onCameraPreferenceResolved={(preference) => (cameraPreference = preference)}
		onCapture={onCaptured}
		onCancel={() => (stage = 'setup')}
	/>
{:else}
	<div class="review-screen">
		<div class="review-inner">
			<h1 class="review-title">Review &amp; save</h1>

			{#if capture && discipline}
				{#if capture.source === 'import' && importPreviewUrl}
					<section class="import-review-card">
						<video
							bind:this={importPreviewVideo}
							class="import-preview"
							src={importPreviewUrl}
							controls
							playsinline
						>
							<track kind="captions" />
						</video>
						<div class="import-marker-grid">
							<button type="button" onclick={() => setImportedTimelineMarker('start')}>Set start</button>
							<button type="button" onclick={() => setImportedTimelineMarker('halfway')}>Set halfway</button>
							<button type="button" onclick={() => setImportedTimelineMarker('end')}>Set end</button>
						</div>
						<div class="import-marker-summary">
							<div><span>Start</span><strong>{secondsFromMs(capture.timeline.diveStartMs)}</strong></div>
							<div><span>End</span><strong>{secondsFromMs(capture.timeline.diveEndMs)}</strong></div>
							<div>
								<span>Halfway</span>
								<strong>{capture.timeline.subSplits?.[0] ? secondsFromMs(capture.timeline.subSplits[0].atMs) : 'Optional'}</strong>
							</div>
						</div>
					</section>
				{/if}

				<div class="stats-card">
					<div><span>Dive time</span><strong>{diveDurationSeconds(capture).toFixed(1)} s</strong></div>
					<div><span>Waypoints tapped</span><strong>{capture.timeline.laps.length}</strong></div>
					<div>
						<span>Distance</span>
						<!--
						  Distance includes a best-effort estimate for:
						   • dives that ended before the first waypoint tap
						     (estimated from the default 1 m/s pace), and
						   • dives that ended mid-lap (last waypoint + tail
						     estimated from the most recent measured pace).
						  See `totalDistanceM` in src/lib/capture/timeline.ts.
						-->
						<strong>{formatMeters(totalDistanceM(capture.timeline, defaultSpeedMs(discipline)))} m</strong>
					</div>
					<div><span>Size</span><strong>{formatMegabytes(capture.sizeBytes)}</strong></div>
				</div>

				<section class="diagnostics-card" aria-label="Capture diagnostics">
					<div class="diagnostics-head">
						<div>
							<span class="diagnostics-eyebrow">Capture diagnostics</span>
							<strong>{capture.widthPx} × {capture.heightPx}</strong>
						</div>
						<span class="diagnostics-status" class:warn={qualityWarningsFor(capture).length > 0}>
							{qualityWarningsFor(capture).length > 0 ? 'Check' : 'OK'}
						</span>
					</div>
					<div class="diagnostics-grid">
						<div><span>Requested</span><strong>{formatMbps(capture.requestedVideoBitrateBps)}</strong></div>
						<div><span>Actual avg</span><strong>{formatMbps(capture.actualAverageBitrateBps)}</strong></div>
						<div><span>Frame rate</span><strong>{formatFrameRate(capture.actualFrameRate)}</strong></div>
						<div><span>Container</span><strong>{capture.mimeType || 'Unknown'}</strong></div>
						<div><span>Video length</span><strong>{capture.durationSeconds.toFixed(1)} s</strong></div>
					</div>
					{#if qualityWarningsFor(capture).length > 0}
						<ul class="diagnostics-warnings">
							{#each qualityWarningsFor(capture) as warning}
								<li>{warning}</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/if}

			<section class="card">
				<label class="pin">
					<input type="checkbox" bind:checked={pinned} />
					Pin this dive (keep beyond the 20-video cap)
				</label>

				<div class="gift">
					<div class="gift-label">Gift this dive to…</div>
					{#if $user}
						<AthletePicker
							bind:athleteId
							selfId={$user.uid}
							onChange={(id) => (athleteId = id)}
						/>
					{/if}
				</div>
			</section>

			{#if saveError}
				<p class="error">{saveError}</p>
			{/if}

			<div class="actions">
				<button
					class="btn btn-secondary"
					onclick={discard}
					disabled={stage === 'saving'}
				>
					Re-record
				</button>
				<button
					class="btn btn-primary"
					onclick={save}
					disabled={stage === 'saving' || !capture}
				>
					{stage === 'saving' ? 'Saving locally…' : 'Save dive'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.setup-screen,
	.review-screen {
		min-height: 100vh;
		background: var(--color-bg);
		color: var(--color-text);
		padding: 1rem 1rem calc(2rem + env(safe-area-inset-bottom));
	}
	.setup-inner,
	.review-inner {
		max-width: 32rem;
		margin: 0 auto;
	}

	.setup-head h1 {
		font-size: 1.6rem;
		font-weight: 700;
		margin: 0 0 0.25rem;
		background: linear-gradient(90deg, var(--color-primary), var(--color-secondary));
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
	.setup-head p {
		margin: 0 0 1.25rem;
		color: var(--color-text-muted);
		font-size: 0.9rem;
	}

	.card {
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.15);
		border-radius: 14px;
		padding: 1.1rem 1rem;
		margin-bottom: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
	}
	.discipline-card.needs-choice {
		border-color: rgba(20, 184, 166, 0.45);
		box-shadow: 0 0 0 1px rgba(20, 184, 166, 0.08);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.field-label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.select {
		appearance: none;
		width: 100%;
		padding: 0.85rem 0.9rem;
		border-radius: 10px;
		background: rgba(15, 23, 42, 0.65);
		color: var(--color-text);
		border: 1px solid rgba(148, 163, 184, 0.2);
		font: inherit;
		font-size: 1rem;
	}

	.field-hint {
		margin: 0;
		font-size: 0.78rem;
		color: var(--color-text-muted);
	}

	.segmented {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.4rem;
		padding: 0.3rem;
		background: rgba(15, 23, 42, 0.65);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 12px;
	}
	.segmented.two {
		grid-template-columns: repeat(2, 1fr);
	}
	.seg-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.1rem;
		padding: 0.6rem 0.4rem;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 9px;
		color: var(--color-text-muted);
		font: inherit;
		cursor: pointer;
		transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
		-webkit-tap-highlight-color: transparent;
	}
	.seg-btn:hover {
		color: var(--color-text);
	}
	.seg-btn.active {
		background: rgba(20, 184, 166, 0.18);
		border-color: rgba(20, 184, 166, 0.55);
		color: var(--color-primary);
	}
	.seg-label {
		font-weight: 700;
		font-size: 0.95rem;
		letter-spacing: 0.02em;
	}
	.seg-sub {
		font-size: 0.7rem;
		color: var(--color-text-muted);
	}
	.seg-btn.active .seg-sub {
		color: var(--color-primary);
		opacity: 0.85;
	}

	.summary {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		background: rgba(20, 184, 166, 0.08);
		border: 1px solid rgba(20, 184, 166, 0.25);
		border-radius: 10px;
		padding: 0.7rem 0.85rem;
	}
	.summary strong {
		color: var(--color-primary);
	}

	.actions {
		display: flex;
		gap: 0.65rem;
		margin-top: 0.5rem;
	}
	.btn {
		flex: 1 1 auto;
		font: inherit;
		padding: 1rem 1rem;
		border-radius: 12px;
		border: 1px solid transparent;
		font-weight: 600;
		font-size: 1rem;
		cursor: pointer;
		transition:
			filter 0.12s ease,
			transform 0.06s ease;
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.btn:active:not(:disabled) {
		transform: scale(0.98);
	}
	.btn-primary {
		flex: 2 1 auto;
		background: linear-gradient(90deg, var(--color-primary), var(--color-secondary));
		color: #0f172a;
		font-weight: 700;
	}
	.btn-primary:hover:not(:disabled) {
		filter: brightness(1.05);
	}
	.btn-secondary {
		background: transparent;
		border-color: rgba(148, 163, 184, 0.25);
		color: var(--color-text-muted);
	}
	.import-video-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		text-align: center;
	}
	.import-video-button input {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	.import-video-button.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	@media (max-width: 520px) {
		.actions {
			flex-wrap: wrap;
		}
		.actions .btn,
		.actions .import-video-button {
			flex-basis: 100%;
		}
	}

	.review-title {
		font-size: 1.4rem;
		font-weight: 700;
		margin: 0 0 1rem;
	}

	.import-review-card {
		background: rgba(15, 23, 42, 0.72);
		border: 1px solid rgba(148, 163, 184, 0.16);
		border-radius: 12px;
		padding: 0.8rem;
		margin-bottom: 1rem;
	}

	.import-preview {
		display: block;
		width: 100%;
		max-height: 60vh;
		border-radius: 8px;
		background: #000;
	}

	.import-marker-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.45rem;
		margin-top: 0.7rem;
	}

	.import-marker-grid button {
		min-height: 2.6rem;
		border: 1px solid rgba(20, 184, 166, 0.34);
		border-radius: 8px;
		background: rgba(20, 184, 166, 0.1);
		color: var(--color-text);
		font: inherit;
		font-size: 0.82rem;
		font-weight: 750;
	}

	.import-marker-summary {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.45rem;
		margin-top: 0.6rem;
	}

	.import-marker-summary div {
		padding: 0.55rem;
		border-radius: 8px;
		background: rgba(2, 6, 23, 0.35);
		text-align: center;
	}

	.import-marker-summary span {
		display: block;
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	.import-marker-summary strong {
		display: block;
		margin-top: 0.15rem;
		font-size: 0.88rem;
		color: var(--color-text);
	}

	.stats-card {
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.15);
		border-radius: 12px;
		padding: 0.9rem 1rem;
		margin-bottom: 1rem;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.55rem 1rem;
	}
	.stats-card > div {
		display: flex;
		flex-direction: column;
	}
	.stats-card span {
		color: var(--color-text-muted);
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.stats-card strong {
		font-size: 1rem;
		color: var(--color-text);
	}

	.diagnostics-card {
		background: rgba(15, 23, 42, 0.72);
		border: 1px solid rgba(148, 163, 184, 0.16);
		border-radius: 12px;
		padding: 0.85rem 1rem;
		margin-bottom: 1rem;
	}
	.diagnostics-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.75rem;
	}
	.diagnostics-eyebrow,
	.diagnostics-grid span {
		display: block;
		color: var(--color-text-muted);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.diagnostics-head strong,
	.diagnostics-grid strong {
		color: var(--color-text);
		font-size: 0.9rem;
		font-weight: 700;
		word-break: break-word;
	}
	.diagnostics-status {
		flex: 0 0 auto;
		border-radius: 999px;
		padding: 0.18rem 0.5rem;
		background: rgba(16, 185, 129, 0.14);
		border: 1px solid rgba(16, 185, 129, 0.32);
		color: var(--color-secondary);
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0.05em;
	}
	.diagnostics-status.warn {
		background: rgba(245, 158, 11, 0.14);
		border-color: rgba(245, 158, 11, 0.36);
		color: #fbbf24;
	}
	.diagnostics-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.55rem 1rem;
	}
	.diagnostics-warnings {
		margin: 0.75rem 0 0;
		padding-left: 1rem;
		color: #fbbf24;
		font-size: 0.8rem;
		line-height: 1.35;
	}

	.pin {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		font-size: 0.9rem;
		color: var(--color-text);
	}
	.gift {
		border-top: 1px solid rgba(148, 163, 184, 0.12);
		padding-top: 0.85rem;
	}
	.gift-label {
		font-size: 0.85rem;
		font-weight: 600;
		margin-bottom: 0.45rem;
	}

	.error {
		color: #fca5a5;
		font-size: 0.9rem;
		margin: 0.75rem 0;
	}

	/* ──────────────── Quick pool setup ──────────────── */
	.quick-start {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.85rem;
		margin-bottom: 1.25rem;
	}
	.quick-defaults {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.25rem;
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.15);
		border-radius: 12px;
		padding: 0.9rem 1rem;
	}
	.quick-eyebrow {
		color: var(--color-text-muted);
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.quick-summary {
		color: var(--color-text);
		font-size: 1rem;
		font-weight: 700;
	}
	.quick-hint {
		margin: 0;
		font-size: 0.8rem;
		color: var(--color-text-muted);
		text-align: center;
	}
	.link-btn {
		align-self: center;
		background: transparent;
		border: none;
		color: var(--color-primary);
		font: inherit;
		font-size: 0.9rem;
		text-decoration: underline;
		cursor: pointer;
		padding: 0.35rem 0.5rem;
	}

	.storage-warning {
		background: rgba(248, 113, 113, 0.12);
		border: 1px solid rgba(248, 113, 113, 0.4);
		color: #fecaca;
		border-radius: 12px;
		padding: 0.85rem 1rem;
		margin-bottom: 1rem;
		font-size: 0.9rem;
	}

	.storage-warning strong {
		display: block;
		color: #fca5a5;
		margin-bottom: 0.35rem;
	}

	.storage-warning p {
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.4;
	}
</style>
