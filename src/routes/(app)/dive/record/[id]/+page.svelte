<!--
  Dive video capture page.
  Route: /dive/record/[sessionId]

  Stages:
	setup          → pick discipline, pool length (wheel), waypoints per lap (wheel)
	record         → full-screen DiveRecorder
	importModeChoice → choose live playback marking or precision scrub-to-mark
	importPlayback → full-screen imported-video review with recorder-style HUD
	importScrubMark → fullscreen imported-video precision scrub-to-mark flow
	review         → confirm details, pin, choose athlete, save
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { user } from '$lib/stores/auth';
	import DiveRecorder from '$lib/components/DiveRecorder.svelte';
	import MetricsOnlyRecorder from '$lib/components/MetricsOnlyRecorder.svelte';
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
	import {
		createPrecisionMarkingState,
		endDive as endPrecisionDive,
		markDiveStart as markPrecisionDiveStart,
		markNextWaypoint as markPrecisionNextWaypoint,
		precisionElapsedMs,
		precisionPrimaryLabel,
		projectPrecisionStateToTimeline,
		restartMarking as restartPrecisionMarking,
		summarisePrecisionState,
		undoLastMark as undoPrecisionLastMark,
		type PrecisionMarkingState
	} from '$lib/capture/precisionWaypointMarker';
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
		LapEvent,
		DiveVideoDiscipline,
		DiveVideoQualityPreset,
		DiveVideoDisplayOrientation,
		DiveVideoCapturePosture,
		DiveVideoResolution,
		DiveVideoRotation
	} from '$lib/types';

	const sessionId = $derived($page.params.id ?? '');

	interface VideoCaptureResult {
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

	interface MetricsOnlyCaptureResult {
		source: 'metrics-only';
		timeline: DiveTimeline;
		discipline: DiveVideoDiscipline;
		poolLength: number;
		waypointsPerLap: number;
		durationSeconds: number;
	}

	type CaptureResult = VideoCaptureResult | MetricsOnlyCaptureResult;

	interface ImportWaypointRow {
		index: number;
		kind: 'split' | 'wall';
		atMs: number;
		distanceM: number;
		cumulativeDistanceM: number;
		splitMs: number;
		speedMs: number;
	}

	type Stage = 'setup' | 'record' | 'importModeChoice' | 'importPlayback' | 'importScrubMark' | 'review' | 'saving' | 'done';
	type ImportFlowPhase = 'ready' | 'playing' | 'diving' | 'ended';
	let stage = $state<Stage>('setup');

	/**
	 * Hide the bottom nav while the recorder is active. Increments a global
	 * counter on entry to the `record` stage and decrements on leaving it,
	 * covering both the "recording ended" (→ review) and cancel (→ setup)
	 * transitions. The $effect cleanup runs whenever `stage` changes so the
	 * counter stays balanced even if the user navigates away mid-record.
	 */
	$effect(() => {
		if (stage !== 'record' && stage !== 'importPlayback' && stage !== 'importScrubMark') return;
		diveRecording.begin();
		return () => diveRecording.end();
	});

	$effect(() => {
		if (typeof document === 'undefined' || (stage !== 'importPlayback' && stage !== 'importScrubMark')) return;
		const html = document.documentElement;
		const body = document.body;
		const previousHtmlOverflow = html.style.overflow;
		const previousHtmlOverscroll = html.style.overscrollBehavior;
		const previousHtmlTouchAction = html.style.touchAction;
		const previousBodyOverflow = body.style.overflow;
		const previousBodyOverscroll = body.style.overscrollBehavior;
		const previousBodyTouchAction = body.style.touchAction;
		const preventGesture = (event: Event) => event.preventDefault();

		html.style.overflow = 'hidden';
		html.style.overscrollBehavior = 'none';
		html.style.touchAction = 'none';
		body.style.overflow = 'hidden';
		body.style.overscrollBehavior = 'none';
		body.style.touchAction = 'none';
		document.addEventListener('gesturestart', preventGesture, { passive: false });
		document.addEventListener('gesturechange', preventGesture, { passive: false });
		document.addEventListener('gestureend', preventGesture, { passive: false });

		return () => {
			html.style.overflow = previousHtmlOverflow;
			html.style.overscrollBehavior = previousHtmlOverscroll;
			html.style.touchAction = previousHtmlTouchAction;
			body.style.overflow = previousBodyOverflow;
			body.style.overscrollBehavior = previousBodyOverscroll;
			body.style.touchAction = previousBodyTouchAction;
			document.removeEventListener('gesturestart', preventGesture);
			document.removeEventListener('gesturechange', preventGesture);
			document.removeEventListener('gestureend', preventGesture);
		};
	});

	let poolLength = $state<number | undefined>(25);
	let waypointsPerLap = $state<number | undefined>(2);
	let discipline = $state<DiveVideoDiscipline | undefined>(undefined);
	let resolution = $state<DiveVideoResolution>('720p');
	let qualityPreset = $state<DiveVideoQualityPreset>(DEFAULT_VIDEO_QUALITY_PRESET);
	let captureMode = $state<'video' | 'metrics-only'>('video');
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
	let importPreviewPlaying = $state(false);
	let importPreviewTimeMs = $state(0);
	let importFlowPhase = $state<ImportFlowPhase>('ready');
	let importEndDiveHeld = $state(false);
	let importPrimaryClickSuppressed = false;
	let importEndDiveHoldHandle: ReturnType<typeof setTimeout> | null = null;
	let precisionState = $state<PrecisionMarkingState | null>(null);
	let precisionEndDiveHeld = $state(false);
	let precisionPrimaryClickSuppressed = false;
	let precisionEndDiveHoldHandle: ReturnType<typeof setTimeout> | null = null;
	let importScrubSeeking = $state(false);
	let importPreviewUrl = $state<string | null>(null);
	let importPreviewVideo = $state<HTMLVideoElement | null>(null);
	let storageHealthy = $state<boolean | null>(null);

	const canStartRecording = $derived(Boolean(discipline && poolLength && waypointsPerLap));
	const waypointSpacing = $derived(
		poolLength && waypointsPerLap ? poolLength / waypointsPerLap : 0
	);
	const IMPORT_END_DIVE_HOLD_MS = 500;

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

	function isVideoCapture(result: CaptureResult): result is VideoCaptureResult {
		return result.source !== 'metrics-only';
	}

	function qualityWarningsFor(result: VideoCaptureResult): string[] {
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

	function formatMs(ms: number): string {
		const safeMs = Math.max(0, ms);
		const totalSecs = Math.floor(safeMs / 1000);
		const mm = Math.floor(totalSecs / 60).toString().padStart(2, '0');
		const ss = (totalSecs % 60).toString().padStart(2, '0');
		const tenths = Math.floor((safeMs % 1000) / 100);
		return `${mm}:${ss}.${tenths}`;
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
			importPreviewTimeMs = 0;
			importFlowPhase = 'ready';
			importEndDiveHeld = false;
			importPrimaryClickSuppressed = false;
			precisionState = null;
			precisionEndDiveHeld = false;
			precisionPrimaryClickSuppressed = false;
			stage = 'importModeChoice';
		} catch (err) {
			importError = err instanceof Error ? err.message : 'Could not read this video file.';
		} finally {
			importingVideo = false;
		}
	}

	function precisionMarkerConfig() {
		return {
			poolLengthM: poolLength ?? 25,
			waypointsPerLap: Math.max(1, waypointsPerLap ?? 1),
			defaultSpeedMs: discipline ? defaultSpeedMs(discipline) : 1
		};
	}

	function startLiveImportMarking(): void {
		if (!capture || capture.source !== 'import') return;
		importPreviewTimeMs = 0;
		importFlowPhase = 'ready';
		importEndDiveHeld = false;
		importPrimaryClickSuppressed = false;
		stage = 'importPlayback';
	}

	function startScrubImportMarking(): void {
		if (!capture || capture.source !== 'import') return;
		precisionState = createPrecisionMarkingState(precisionMarkerConfig());
		precisionEndDiveHeld = false;
		precisionPrimaryClickSuppressed = false;
		importScrubSeeking = false;
		importPreviewTimeMs = 0;
		stage = 'importScrubMark';
	}

	function syncPrecisionCapture(nextState: PrecisionMarkingState): void {
		precisionState = nextState;
		if (!capture || capture.source !== 'import') return;
		capture = { ...capture, timeline: projectPrecisionStateToTimeline(nextState) };
	}

	function addImportedWaypointAtCurrentTime(): void {
		if (!capture || capture.source !== 'import' || !importPreviewVideo) return;
		const atMs = clamp(
			Math.round(importPreviewVideo.currentTime * 1000),
			capture.timeline.diveStartMs,
			capture.timeline.diveEndMs
		);
		const next = rebuildImportedWaypoints(capture.timeline, [
			...waypointTimesFromTimeline(capture.timeline),
			atMs
		]);
		capture = { ...capture, timeline: next };
	}

	function waypointTimesFromTimeline(timeline: DiveTimeline): number[] {
		return [...timeline.laps, ...(timeline.subSplits ?? [])]
			.map((event) => event.atMs)
			.filter((atMs) => atMs > timeline.diveStartMs && atMs < timeline.diveEndMs)
			.sort((a, b) => a - b);
	}

	function rebuildImportedWaypoints(timeline: DiveTimeline, waypointTimesMs: number[]): DiveTimeline {
		const poolLengthM = poolLength ?? 25;
		const wpl = Math.max(1, waypointsPerLap ?? 1);
		const spacingM = poolLengthM / wpl;
		const sortedTimes = waypointTimesMs
			.map((atMs) => clamp(atMs, timeline.diveStartMs, timeline.diveEndMs))
			.filter((atMs) => atMs > timeline.diveStartMs && atMs < timeline.diveEndMs)
			.sort((a, b) => a - b);
		const rows = sortedTimes.map((atMs, index) => {
				const waypointIndex = index + 1;
				const previousAtMs = index === 0 ? timeline.diveStartMs : sortedTimes[index - 1];
				const event: LapEvent = {
					lapNumber: waypointIndex % wpl === 0 ? waypointIndex / wpl : waypointIndex % wpl,
					atMs,
					splitMs: Math.max(0, atMs - previousAtMs),
					cumulativeDistanceM: waypointIndex * spacingM
				};
				return { event, kind: waypointIndex % wpl === 0 ? 'wall' : 'split' };
			});

		return {
			...timeline,
			laps: rows.filter((row) => row.kind === 'wall').map((row) => row.event),
			subSplits: rows.filter((row) => row.kind === 'split').map((row) => row.event)
		};
	}

	function importWaypointRows(timeline: DiveTimeline): ImportWaypointRow[] {
		const poolLengthM = poolLength ?? 25;
		const wpl = Math.max(1, waypointsPerLap ?? 1);
		const spacingM = poolLengthM / wpl;
		return waypointTimesFromTimeline(timeline).map((atMs, index, times) => {
			const waypointIndex = index + 1;
			const previousAtMs = index === 0 ? timeline.diveStartMs : times[index - 1];
			const splitMs = Math.max(0, atMs - previousAtMs);
			return {
				index: waypointIndex,
				kind: waypointIndex % wpl === 0 ? 'wall' : 'split',
				atMs,
				distanceM: spacingM,
				cumulativeDistanceM: waypointIndex * spacingM,
				splitMs,
				speedMs: splitMs > 0 ? spacingM / (splitMs / 1000) : 0
			};
		});
	}

	function importElapsedMs(timeline: DiveTimeline): number {
		if (importFlowPhase === 'ready' || importFlowPhase === 'playing') return 0;
		if (importFlowPhase === 'ended') return Math.max(0, timeline.diveEndMs - timeline.diveStartMs);
		return Math.max(0, clamp(importPreviewTimeMs, timeline.diveStartMs, timeline.diveEndMs) - timeline.diveStartMs);
	}

	function importDistanceAt(timeline: DiveTimeline): number {
		if (importFlowPhase === 'ready' || importFlowPhase === 'playing') return 0;
		if (importFlowPhase === 'ended') return importDistanceAtTime(timeline, timeline.diveEndMs);
		return importDistanceAtTime(timeline, importPreviewTimeMs);
	}

	function importDistanceAtTime(timeline: DiveTimeline, targetMs: number): number {
		const atMs = clamp(targetMs, timeline.diveStartMs, timeline.diveEndMs);
		const rows = importWaypointRows(timeline);
		const defaultSpeed = discipline ? defaultSpeedMs(discipline) : 1;
		if (rows.length === 0) {
			return ((atMs - timeline.diveStartMs) / 1000) * defaultSpeed;
		}

		const nextIndex = rows.findIndex((row) => row.atMs >= atMs);
		const previous = nextIndex <= 0 ? null : rows[nextIndex - 1];
		const next = nextIndex >= 0 ? rows[nextIndex] : null;
		if (!previous && next) {
			const elapsedMs = Math.max(0, atMs - timeline.diveStartMs);
			return next.speedMs * (elapsedMs / 1000);
		}
		if (previous && next) {
			const elapsedMs = Math.max(0, atMs - previous.atMs);
			return previous.cumulativeDistanceM + next.speedMs * (elapsedMs / 1000);
		}
		const last = rows[rows.length - 1];
		const elapsedMs = Math.max(0, atMs - last.atMs);
		const speed = last.speedMs > 0 ? last.speedMs : defaultSpeed;
		return last.cumulativeDistanceM + speed * (elapsedMs / 1000);
	}

	function captureDistanceM(result: CaptureResult): number {
		if (result.source === 'import') return importDistanceAtTime(result.timeline, result.timeline.diveEndMs);
		return totalDistanceM(result.timeline, discipline ? defaultSpeedMs(discipline) : 1);
	}

	function waypointCountForCapture(result: CaptureResult): number {
		if (result.source === 'import') return importWaypointRows(result.timeline).length;
		return result.timeline.laps.length + (result.timeline.subSplits?.length ?? 0);
	}

	function importSpeedAt(timeline: DiveTimeline): number {
		if (importFlowPhase === 'ready' || importFlowPhase === 'playing' || importFlowPhase === 'ended') return 0;
		const atMs = clamp(importPreviewTimeMs, timeline.diveStartMs, timeline.diveEndMs);
		const rows = importWaypointRows(timeline);
		const defaultSpeed = discipline ? defaultSpeedMs(discipline) : 1;
		const next = rows.find((row) => row.atMs >= atMs);
		if (next) return next.speedMs;
		const last = rows[rows.length - 1];
		return last?.speedMs && last.speedMs > 0 ? last.speedMs : defaultSpeed;
	}

	function importAvgSplitSeconds(timeline: DiveTimeline): number {
		const rows = importWaypointRows(timeline);
		if (rows.length === 0) return 0;
		return rows.reduce((sum, row) => sum + row.splitMs / 1000, 0) / rows.length;
	}

	function updateImportPreviewTime(): void {
		if (!importPreviewVideo) return;
		importPreviewTimeMs = Math.round(importPreviewVideo.currentTime * 1000);
	}

	function currentImportVideoMs(): number {
		return importPreviewVideo
			? Math.round(importPreviewVideo.currentTime * 1000)
			: importPreviewTimeMs;
	}

	function seekImportScrubTo(ms: number): void {
		if (!capture) return;
		const nextMs = clamp(Math.round(ms), 0, Math.round(capture.durationSeconds * 1000));
		if (importPreviewVideo) {
			importPreviewVideo.pause();
			importScrubSeeking = true;
			importPreviewVideo.currentTime = nextMs / 1000;
		}
		importPreviewTimeMs = nextMs;
	}

	function nudgeImportScrub(deltaMs: number): void {
		seekImportScrubTo(currentImportVideoMs() + deltaMs);
	}

	function onImportScrubRangeInput(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		seekImportScrubTo(Number(input.value));
	}

	function handlePrecisionPrimaryAction(): void {
		if (!precisionState) return;
		if (precisionPrimaryClickSuppressed) {
			precisionPrimaryClickSuppressed = false;
			return;
		}
		if (importScrubSeeking) return;
		const currentMs = currentImportVideoMs();
		if (precisionState.phase === 'start') {
			syncPrecisionCapture(markPrecisionDiveStart(precisionState, currentMs));
			return;
		}
		if (precisionState.phase === 'waypoints') {
			syncPrecisionCapture(markPrecisionNextWaypoint(precisionState, currentMs));
			return;
		}
		reviewImportedCapture();
	}

	function onPrecisionPrimaryHoldStart(): void {
		if (!precisionState || precisionState.phase !== 'waypoints') return;
		precisionEndDiveHeld = true;
		if (precisionEndDiveHoldHandle) clearTimeout(precisionEndDiveHoldHandle);
		precisionEndDiveHoldHandle = setTimeout(() => {
			precisionEndDiveHoldHandle = null;
			precisionEndDiveHeld = false;
			precisionPrimaryClickSuppressed = true;
			syncPrecisionCapture(endPrecisionDive(precisionState!, currentImportVideoMs()));
		}, IMPORT_END_DIVE_HOLD_MS);
	}

	function onPrecisionPrimaryHoldEnd(): void {
		precisionEndDiveHeld = false;
		if (!precisionEndDiveHoldHandle) return;
		clearTimeout(precisionEndDiveHoldHandle);
		precisionEndDiveHoldHandle = null;
	}

	function undoPrecisionMark(): void {
		if (!precisionState) return;
		syncPrecisionCapture(undoPrecisionLastMark(precisionState));
	}

	function restartPrecisionMarks(): void {
		if (!precisionState) return;
		syncPrecisionCapture(restartPrecisionMarking(precisionState));
	}

	function precisionPrimarySubLabel(): string {
		if (!precisionState) return '';
		if (precisionEndDiveHeld) return 'end dive';
		if (importScrubSeeking) return 'Waiting for video';
		if (precisionState.phase === 'start') return 'Scrub to the start frame';
		if (precisionState.phase === 'ended') return 'Save with markers';
		return `Scrub to ${precisionPrimaryLabel(precisionState)} · hold to end`;
	}

	function precisionProgressLabel(): string {
		if (!precisionState) return '';
		const summary = summarisePrecisionState(precisionState);
		if (precisionState.phase === 'start') return 'Choose dive start';
		if (precisionState.phase === 'ended') return `${summary.waypointCount} marks ready`;
		const nextDistance = precisionState.nextDistanceM;
		return `Marked ${summary.waypointCount} - next ${nextDistance.toFixed(nextDistance % 1 === 0 ? 0 : 1)} m`;
	}

	function reviewImportedCapture(): void {
		if (importPreviewVideo) importPreviewVideo.pause();
		importPreviewPlaying = false;
		stage = 'review';
	}

	async function playImportedPreview(): Promise<void> {
		await toggleImportPreviewPlayback();
		if (importFlowPhase === 'ready') importFlowPhase = 'playing';
	}

	function startImportedDiveAtCurrentTime(): void {
		if (!capture || capture.source !== 'import' || !importPreviewVideo) return;
		const atMs = Math.round(importPreviewVideo.currentTime * 1000);
		const endMs = Math.max(capture.timeline.diveEndMs, atMs + 100);
		const next = rebuildImportedWaypoints(
			{ ...capture.timeline, diveStartMs: atMs, diveEndMs: endMs, laps: [], subSplits: [] },
			[]
		);
		capture = { ...capture, timeline: next };
		importFlowPhase = 'diving';
		importPreviewTimeMs = atMs;
	}

	function endImportedDiveAtCurrentTime(): void {
		if (!capture || capture.source !== 'import' || !importPreviewVideo) return;
		const atMs = Math.round(importPreviewVideo.currentTime * 1000);
		let next: DiveTimeline = {
			...capture.timeline,
			diveEndMs: Math.max(atMs, capture.timeline.diveStartMs + 100)
		};
		next = rebuildImportedWaypoints(next, waypointTimesFromTimeline(next));
		capture = { ...capture, timeline: next };
		importFlowPhase = 'ended';
		importPreviewTimeMs = next.diveEndMs;
	}

	function handleImportPrimaryAction(): void {
		if (importPrimaryClickSuppressed) {
			importPrimaryClickSuppressed = false;
			return;
		}
		if (importFlowPhase === 'ready') {
			void playImportedPreview();
			return;
		}
		if (importFlowPhase === 'playing') {
			startImportedDiveAtCurrentTime();
			return;
		}
		if (importFlowPhase === 'diving') {
			addImportedWaypointAtCurrentTime();
			return;
		}
		reviewImportedCapture();
	}

	function onImportPrimaryHoldStart(): void {
		if (importFlowPhase !== 'diving') return;
		importEndDiveHeld = true;
		if (importEndDiveHoldHandle) clearTimeout(importEndDiveHoldHandle);
		importEndDiveHoldHandle = setTimeout(() => {
			importEndDiveHoldHandle = null;
			importEndDiveHeld = false;
			importPrimaryClickSuppressed = true;
			endImportedDiveAtCurrentTime();
		}, IMPORT_END_DIVE_HOLD_MS);
	}

	function onImportPrimaryHoldEnd(): void {
		importEndDiveHeld = false;
		if (!importEndDiveHoldHandle) return;
		clearTimeout(importEndDiveHoldHandle);
		importEndDiveHoldHandle = null;
	}

	function seekImportedPreview(deltaSeconds: number): void {
		if (!importPreviewVideo || !capture) return;
		const nextSeconds = clamp(
			importPreviewVideo.currentTime + deltaSeconds,
			0,
			Math.max(0, capture.durationSeconds)
		);
		importPreviewVideo.currentTime = nextSeconds;
		importPreviewTimeMs = Math.round(nextSeconds * 1000);
	}

	function importPrimaryLabel(): string {
		if (importEndDiveHeld) return 'Hold';
		if (importFlowPhase === 'ready') return 'Play';
		if (importFlowPhase === 'playing') return 'Start dive';
		if (importFlowPhase === 'diving') return 'Waypoint';
		return 'Review';
	}

	function importPrimarySubLabel(): string {
		if (importEndDiveHeld) return 'end dive';
		if (importFlowPhase === 'ready') return 'Start playback';
		if (importFlowPhase === 'playing') return 'Diver leaves wall';
		if (importFlowPhase === 'diving') return `Mark ${formatMeters((importWaypointRows(capture?.timeline ?? { diveStartMs: 0, diveEndMs: 0, laps: [] }).length + 1) * waypointSpacing)} m · hold to end`;
		return 'Save with markers';
	}

	function summaryWithWaypointSegments(summary: ReturnType<typeof summariseTimeline>, timeline: DiveTimeline): ReturnType<typeof summariseTimeline> {
		const rows = importWaypointRows(timeline);
		if (rows.length === 0) return summary;
		const distanceM = importDistanceAtTime(timeline, timeline.diveEndMs);
		const durationSeconds = Math.max(0, timeline.diveEndMs - timeline.diveStartMs) / 1000;
		return {
			...summary,
			totalDistanceM: distanceM,
			averageSpeedMs: durationSeconds > 0 ? distanceM / durationSeconds : 0,
			perLap: rows.map((row) => ({
				lapNumber: row.index,
				splitSeconds: row.splitMs / 1000,
				avgSpeedMs: row.speedMs,
				cumulativeDistanceM: row.cumulativeDistanceM
			}))
		};
	}

	async function toggleImportPreviewPlayback(): Promise<void> {
		if (!importPreviewVideo) return;
		try {
			importError = null;
			if (importPreviewVideo.paused) {
				await importPreviewVideo.play();
				importPreviewPlaying = true;
			} else {
				importPreviewVideo.pause();
				importPreviewPlaying = false;
			}
		} catch (error) {
			importPreviewPlaying = false;
			importError = error instanceof Error
				? `Could not play this video: ${error.message}`
				: 'Could not play this video in this browser.';
		}
	}

	function handleImportPreviewPlaybackError(): void {
		importPreviewPlaying = false;
		importError = 'This browser could not play the selected video. Try an MP4/H.264 clip if this came from another camera app.';
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

	async function saveMetricsOnlyCapture(
		uid: string,
		selectedDiscipline: DiveVideoDiscipline,
		result: MetricsOnlyCaptureResult
	): Promise<void> {
		const summary = summaryWithWaypointSegments(
			summariseTimeline(result.timeline, defaultSpeedMs(selectedDiscipline)),
			result.timeline
		);
		try {
			sessionStorage.setItem(
				`dive-log-seed:${sessionId}`,
				JSON.stringify({
					discipline: selectedDiscipline,
					poolLength: result.poolLength,
					summary,
					capturedAt: Date.now(),
					source: 'metrics-only'
				})
			);
		} catch {
			// storage quota / private mode — the user can still fill the log manually
		}

		stage = 'done';
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
		await goto(
			`/dives?publicPreset=dynamic-max&seed=${encodeURIComponent(sessionId)}`
		);
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
			if (capture.source === 'metrics-only') {
				await saveMetricsOnlyCapture(uid, selectedDiscipline, capture);
				return;
			}

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
				const summary = summaryWithWaypointSegments(
					summariseTimeline(capture.timeline, defaultSpeedMs(selectedDiscipline)),
					capture.timeline
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
				`/dives?publicPreset=dynamic-max&seed=${encodeURIComponent(sessionId)}`
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

			{#if storageHealthy === false && captureMode === 'video'}
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

			<section class="card capture-mode-card">
				<div class="field">
					<span class="field-label">Capture mode</span>
					<div class="mode-selector" role="radiogroup" aria-label="Capture mode">
						<button
							type="button"
							class="mode-option"
							class:active={captureMode === 'video'}
							role="radio"
							aria-checked={captureMode === 'video'}
							onclick={() => (captureMode = 'video')}
						>
							<strong>Record video</strong>
							<span>Camera, upload, and overlay review.</span>
						</button>
						<button
							type="button"
							class="mode-option"
							class:active={captureMode === 'metrics-only'}
							role="radio"
							aria-checked={captureMode === 'metrics-only'}
							onclick={() => (captureMode = 'metrics-only')}
						>
							<strong>Track metrics only</strong>
							<span>Large timing and waypoint controls, no upload.</span>
						</button>
					</div>
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

			{#if captureMode === 'video'}
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
			{/if}

			<div class="actions">
				<button class="btn btn-secondary" onclick={() => history.back()}>
					Cancel
				</button>
				{#if captureMode === 'video'}
				<label class="btn btn-secondary import-video-button" class:disabled={!discipline || importingVideo}>
					<input
						type="file"
						accept="video/*"
						disabled={!discipline || importingVideo}
						onchange={importVideoFile}
					/>
					{importingVideo ? 'Reading video...' : 'Select video'}
				</label>
				{/if}
				<button
					class="btn btn-primary"
					disabled={!canStartRecording}
					onclick={() => {
						if (canStartRecording) stage = 'record';
					}}
				>
					{#if !discipline}
						Select discipline to start
					{:else if captureMode === 'metrics-only'}
						Start metrics
					{:else}
						Start recording
					{/if}
				</button>
			</div>
		</div>
	</div>
{:else if stage === 'importModeChoice' && capture && discipline && importPreviewUrl}
	<div class="setup-screen">
		<div class="setup-inner">
			<header class="setup-head">
				<h1>Mark imported video</h1>
				<p>{discipline} · {formatMeters(poolLength ?? 25)} m pool · tap every {formatMeters(waypointSpacing)} m</p>
			</header>

			<section class="card import-mode-card">
				<button type="button" class="import-mode-option recommended" onclick={startScrubImportMarking}>
					<span class="mode-kicker">Recommended</span>
					<strong>Scrub and mark</strong>
					<span>Pause the video, scrub to each exact frame, then press the big button to commit start, waypoints, and end.</span>
				</button>

				<button type="button" class="import-mode-option" onclick={startLiveImportMarking}>
					<span class="mode-kicker">Original flow</span>
					<strong>Mark while playing</strong>
					<span>Play the video and tap waypoints in real time, using the existing recorder-style flow.</span>
				</button>
			</section>

			<div class="actions">
				<button class="btn btn-secondary" type="button" onclick={() => (stage = 'setup')}>Back</button>
			</div>
		</div>
	</div>
{:else if stage === 'importPlayback' && capture && discipline && importPreviewUrl}
	<div class="import-recorder">
		<div class="import-recorder-preview">
			<!-- svelte-ignore a11y_media_has_caption -->
			<video
				bind:this={importPreviewVideo}
				class="import-recorder-video"
				src={importPreviewUrl}
				preload="metadata"
				playsinline
				onloadedmetadata={updateImportPreviewTime}
				ontimeupdate={updateImportPreviewTime}
				onseeking={updateImportPreviewTime}
				onseeked={updateImportPreviewTime}
				onplay={() => (importPreviewPlaying = true)}
				onpause={() => (importPreviewPlaying = false)}
				onended={() => (importPreviewPlaying = false)}
				onerror={handleImportPreviewPlaybackError}
			></video>

			<div class="import-hud hud-top">
				<div class="hud-row">
					<div class="hud-cell">
						<div class="hud-label">Time</div>
						<div class="hud-value">{formatMs(importElapsedMs(capture.timeline))}</div>
					</div>
					<div class="hud-cell right">
						<div class="hud-label">Distance</div>
						<div class="hud-value">{formatMeters(importDistanceAt(capture.timeline))} m</div>
					</div>
				</div>
				<div class="hud-sub">
					<span>
						Waypoint {importWaypointRows(capture.timeline).length} · lap {Math.floor(importWaypointRows(capture.timeline).length / Math.max(1, waypointsPerLap ?? 1))} · next {formatMeters((importWaypointRows(capture.timeline).length + 1) * waypointSpacing)} m
					</span>
					<span>{importSpeedAt(capture.timeline).toFixed(2)} m/s</span>
				</div>
			</div>

			{#if importError}
				<div class="import-toast" role="alert">{importError}</div>
			{/if}
		</div>

		<div class="import-recorder-controls">
			<div class="import-secondary-actions left">
				<button class="utility-button" type="button" onclick={() => (stage = 'setup')}>Cancel</button>
			</div>

			<div class="import-secondary-actions right">
				<button class="utility-button" type="button" onclick={() => seekImportedPreview(-10)}>-10s</button>
				<button class="utility-button" type="button" onclick={() => seekImportedPreview(10)}>+10s</button>
			</div>

			<div class="primary-wrap import-primary-wrap">
				<button
					class="primary-action"
					class:action-startDive={importFlowPhase === 'ready' || importFlowPhase === 'playing'}
					class:action-waypoint={importFlowPhase === 'diving'}
					class:action-disabled={importFlowPhase === 'ended'}
					type="button"
					onpointerdown={onImportPrimaryHoldStart}
					onpointerup={onImportPrimaryHoldEnd}
					onpointercancel={onImportPrimaryHoldEnd}
					onpointerleave={onImportPrimaryHoldEnd}
					oncontextmenu={(e) => e.preventDefault()}
					onclick={handleImportPrimaryAction}
				>
					<span class="btn-main">{importPrimaryLabel()}</span>
					<span class="btn-sub">{importPrimarySubLabel()}</span>
					{#if importEndDiveHeld}
						<span class="hold-progress" aria-hidden="true"></span>
					{/if}
				</button>
			</div>

			{#if importWaypointRows(capture.timeline).length > 0}
				<div class="summary-line">
					Avg split {importAvgSplitSeconds(capture.timeline).toFixed(1)}s · Avg speed {importSpeedAt(capture.timeline).toFixed(2)} m/s
				</div>
			{/if}
		</div>
	</div>
	{:else if stage === 'importScrubMark' && capture && discipline && importPreviewUrl && precisionState}
	{@const precisionSummary = summarisePrecisionState(precisionState)}
	<div class="import-recorder scrub-recorder stored-waypoint-editor">
		<div class="import-recorder-preview">
			<!-- svelte-ignore a11y_media_has_caption -->
			<video
				bind:this={importPreviewVideo}
				class="import-recorder-video"
				src={importPreviewUrl}
				preload="metadata"
				playsinline
				onloadedmetadata={updateImportPreviewTime}
				ontimeupdate={updateImportPreviewTime}
				onseeking={() => {
					importScrubSeeking = true;
					updateImportPreviewTime();
				}}
				onseeked={() => {
					importScrubSeeking = false;
					updateImportPreviewTime();
				}}
				onplay={() => (importPreviewPlaying = true)}
				onpause={() => (importPreviewPlaying = false)}
				onended={() => (importPreviewPlaying = false)}
				onerror={handleImportPreviewPlaybackError}
			></video>

			<div class="import-hud hud-top">
				<div class="hud-row">
					<div class="hud-cell">
						<div class="hud-label">Time</div>
						<div class="hud-value">{formatMs(precisionElapsedMs(precisionState, importPreviewTimeMs))}</div>
					</div>
					<div class="hud-cell right">
						<div class="hud-label">Marked</div>
						<div class="hud-value">{formatMeters(precisionSummary.totalDistanceM)} m</div>
					</div>
				</div>
				<div class="hud-sub">
					<span>{precisionSummary.waypointCount} marks · next {precisionState.phase === 'ended' ? 'review' : precisionPrimaryLabel(precisionState)}</span>
					<span>{precisionSummary.averageSpeedMs.toFixed(2)} m/s</span>
				</div>
			</div>

			{#if importError}
				<div class="import-toast" role="alert">{importError}</div>
			{/if}
		</div>

		<div class="import-recorder-controls scrub-controls">
			<button class="editor-close" type="button" aria-label="Cancel waypoint edit" onclick={() => (stage = 'importModeChoice')}>×</button>

			<div class="import-secondary-actions left">
				<button class="utility-button" type="button" onclick={() => (stage = 'importModeChoice')}>Cancel</button>
				<button class="utility-button" type="button" disabled={precisionState.phase === 'start'} onclick={undoPrecisionMark}>Undo</button>
			</div>

			<div class="import-secondary-actions right">
				<button class="utility-button scrub-nudge scrub-reset" type="button" aria-label="Restart marks" title="Restart marks" disabled={precisionState.phase === 'start'} onclick={restartPrecisionMarks}>↺</button>
				<button class="utility-button scrub-nudge" type="button" aria-label="Move scrubber back 0.2 seconds" onclick={() => nudgeImportScrub(-200)}>←</button>
				<button class="utility-button scrub-nudge" type="button" aria-label="Move scrubber forward 0.2 seconds" onclick={() => nudgeImportScrub(200)}>→</button>
			</div>

			<div class="scrub-rail-wrap">
				<div class="scrub-meta">
					<span>{formatMs(importPreviewTimeMs)}</span>
					<span>{importScrubSeeking ? 'Seeking…' : precisionProgressLabel()}</span>
				</div>
				<input
					class="scrub-range"
					type="range"
					min="0"
					max={Math.max(0, Math.round(capture.durationSeconds * 1000))}
					step="100"
					value={importPreviewTimeMs}
					oninput={onImportScrubRangeInput}
				/>
				<div class="scrub-meta dim">
					<span>00:00.0</span>
					<span>{formatMs(Math.round(capture.durationSeconds * 1000))}</span>
				</div>
			</div>

			<div class="primary-wrap import-primary-wrap scrub-primary-wrap">
				<button
					class="primary-action"
					class:action-startDive={precisionState.phase === 'start'}
					class:action-waypoint={precisionState.phase === 'waypoints'}
					class:action-disabled={precisionState.phase === 'ended'}
					type="button"
					disabled={importScrubSeeking}
					onpointerdown={onPrecisionPrimaryHoldStart}
					onpointerup={onPrecisionPrimaryHoldEnd}
					onpointercancel={onPrecisionPrimaryHoldEnd}
					onpointerleave={onPrecisionPrimaryHoldEnd}
					oncontextmenu={(e) => e.preventDefault()}
					onclick={handlePrecisionPrimaryAction}
				>
					<span class="btn-main">{precisionEndDiveHeld ? 'Hold' : precisionPrimaryLabel(precisionState)}</span>
					<span class="btn-sub">{precisionProgressLabel()}</span>
					{#if precisionEndDiveHeld}
						<span class="hold-progress" aria-hidden="true"></span>
					{/if}
				</button>
			</div>

			{#if precisionState.phase === 'ended'}
				<div class="summary-line scrub-summary-line">
					{formatMeters(precisionSummary.totalDistanceM)} m · {precisionSummary.totalTimeSeconds.toFixed(1)}s · {precisionSummary.warnings.length} warning{precisionSummary.warnings.length === 1 ? '' : 's'}
				</div>
			{:else if precisionSummary.waypointCount > 0}
				<div class="summary-line scrub-summary-line">
					Marked {precisionSummary.waypointCount} · Last {formatMeters(precisionSummary.totalDistanceM)} m
				</div>
			{/if}
		</div>
	</div>
{:else if stage === 'record' && discipline}
	{#if captureMode === 'metrics-only'}
		<MetricsOnlyRecorder
			poolLength={poolLength ?? 25}
			waypointsPerLap={waypointsPerLap ?? 2}
			{discipline}
			onCapture={onCaptured}
			onCancel={() => (stage = 'setup')}
		/>
	{:else}
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
	{/if}
{:else}
	<div class="review-screen">
		<div class="review-inner">
			<h1 class="review-title">Review &amp; save</h1>

			{#if capture && discipline}
				{#if capture.source === 'import' && importPreviewUrl}
					<section class="import-review-card">
						<p class="import-review-hint">Imported video markers are ready to save. Re-open the marker flow if you need to adjust start, end, or waypoints.</p>
						{#if importError}
							<p class="import-review-error">{importError}</p>
						{/if}
						<div class="import-marker-grid compact">
							<button type="button" onclick={() => (stage = 'importModeChoice')}>Mark again</button>
						</div>
						<div class="import-marker-summary">
							<div><span>Start</span><strong>{secondsFromMs(capture.timeline.diveStartMs)}</strong></div>
							<div><span>End</span><strong>{secondsFromMs(capture.timeline.diveEndMs)}</strong></div>
							<div>
								<span>Next waypoint</span>
								<strong>{formatMeters((importWaypointRows(capture.timeline).length + 1) * waypointSpacing)} m</strong>
							</div>
						</div>
						{#if importWaypointRows(capture.timeline).length > 0}
							<div class="import-waypoint-list" aria-label="Imported video waypoint splits">
								{#each importWaypointRows(capture.timeline) as row}
									<div class="import-waypoint-row">
										<div>
											<span>{row.kind === 'wall' ? 'Wall' : 'Split'} {row.index}</span>
											<strong>{formatMeters(row.cumulativeDistanceM)} m</strong>
										</div>
										<div><span>Time</span><strong>{secondsFromMs(row.splitMs)}</strong></div>
										<div><span>Speed</span><strong>{row.speedMs.toFixed(2)} m/s</strong></div>
									</div>
								{/each}
							</div>
						{/if}
					</section>
				{/if}

				<div class="stats-card">
					<div><span>Dive time</span><strong>{diveDurationSeconds(capture).toFixed(1)} s</strong></div>
					<div>
						<span>Waypoints tapped</span>
						<strong>{waypointCountForCapture(capture)}</strong>
					</div>
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
						<strong>{formatMeters(captureDistanceM(capture))} m</strong>
					</div>
					{#if isVideoCapture(capture)}
						<div><span>Size</span><strong>{formatMegabytes(capture.sizeBytes)}</strong></div>
					{/if}
				</div>

				{#if isVideoCapture(capture)}
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
				{:else}
				<section class="import-review-card metrics-review-card">
					<p class="import-review-hint">Metrics are ready to save into the dive log. No video will be uploaded for this dive.</p>
				</section>
				{/if}
			{/if}

			{#if capture && isVideoCapture(capture)}
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
			{/if}

			{#if saveError}
				<p class="error">{saveError}</p>
			{/if}

			<div class="actions">
				<button
					class="btn btn-secondary"
					onclick={discard}
					disabled={stage === 'saving'}
				>
					{capture?.source === 'metrics-only' ? 'Re-track' : 'Re-record'}
				</button>
				<button
					class="btn btn-primary"
					onclick={save}
					disabled={stage === 'saving' || !capture}
				>
					{stage === 'saving' ? 'Saving locally…' : capture?.source === 'metrics-only' ? 'Save metrics' : 'Save dive'}
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

	.capture-mode-card {
		gap: 0.75rem;
	}

	.mode-selector {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.55rem;
	}

	.mode-option {
		display: flex;
		min-height: 5.4rem;
		flex-direction: column;
		align-items: flex-start;
		justify-content: center;
		gap: 0.22rem;
		padding: 0.85rem;
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 8px;
		background: rgba(15, 23, 42, 0.58);
		color: var(--color-text);
		font: inherit;
		text-align: left;
	}

	.mode-option.active {
		border-color: rgba(20, 184, 166, 0.55);
		background: rgba(20, 184, 166, 0.11);
		box-shadow: inset 0 0 0 1px rgba(20, 184, 166, 0.08);
	}

	.mode-option strong {
		font-size: 0.96rem;
		font-weight: 850;
	}

	.mode-option span {
		color: var(--color-text-muted);
		font-size: 0.78rem;
		line-height: 1.3;
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

	.import-mode-card {
		gap: 0.75rem;
	}

	.import-mode-option {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.28rem;
		width: 100%;
		border: 1px solid rgba(148, 163, 184, 0.18);
		border-radius: 10px;
		padding: 0.95rem;
		background: rgba(15, 23, 42, 0.55);
		color: var(--color-text);
		font: inherit;
		text-align: left;
	}

	.import-mode-option.recommended {
		border-color: rgba(20, 184, 166, 0.45);
		background: rgba(20, 184, 166, 0.1);
	}

	.import-mode-option strong {
		font-size: 1.02rem;
		font-weight: 800;
	}

	.import-mode-option span:last-child {
		color: var(--color-text-muted);
		font-size: 0.84rem;
		line-height: 1.35;
	}

	.mode-kicker {
		color: var(--color-primary);
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	@media (max-width: 520px) {
		.mode-selector {
			grid-template-columns: 1fr;
		}

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

	.import-recorder {
		position: fixed;
		inset: 0;
		z-index: 1000;
		background: #000;
		color: var(--color-text);
		overflow: hidden;
		overscroll-behavior: none;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
	}

	.import-recorder-preview {
		position: absolute;
		inset: 0;
		background: #000;
		overflow: hidden;
	}

	.import-recorder-video {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
		background: #000;
	}

	.stored-waypoint-editor .import-recorder-video {
		object-fit: cover;
	}

	.import-hud {
		position: absolute;
		left: 0.75rem;
		right: 0.75rem;
		padding: 0.75rem 1.05rem;
		border-radius: 14px;
		background: rgba(15, 23, 42, 0.55);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		color: #f1f5f9;
		pointer-events: none;
	}

	.hud-top {
		top: max(0.75rem, env(safe-area-inset-top));
	}

	.stored-waypoint-editor .hud-top {
		top: calc(max(0.75rem, env(safe-area-inset-top)) + 3.15rem);
	}

	.hud-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 1.25rem;
	}

	.hud-cell.right {
		text-align: right;
	}

	.hud-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #cbd5e1;
	}

	.hud-value {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 1.9rem;
		font-variant-numeric: tabular-nums;
		line-height: 1.1;
	}

	.hud-sub {
		display: flex;
		justify-content: space-between;
		gap: 1.25rem;
		margin-top: 0.4rem;
		color: #cbd5e1;
		font-size: 0.85rem;
	}

	.import-toast {
		position: absolute;
		left: 50%;
		top: calc(max(0.75rem, env(safe-area-inset-top)) + 6.25rem);
		transform: translateX(-50%);
		max-width: min(28rem, calc(100vw - 2rem));
		padding: 0.55rem 0.85rem;
		border-radius: 14px;
		background: rgba(239, 68, 68, 0.95);
		color: #fff;
		font-size: 0.85rem;
		font-weight: 650;
		text-align: center;
	}

	.import-recorder-controls {
		position: absolute;
		inset: 0;
		z-index: 6;
		pointer-events: none;
		padding: max(0.75rem, env(safe-area-inset-top)) max(0.75rem, env(safe-area-inset-right)) calc(1rem + env(safe-area-inset-bottom)) max(0.75rem, env(safe-area-inset-left));
	}

	.editor-close {
		position: absolute;
		top: max(0.75rem, env(safe-area-inset-top));
		right: max(0.75rem, env(safe-area-inset-right));
		z-index: 8;
		width: 2.55rem;
		height: 2.55rem;
		border: 1px solid rgba(226, 232, 240, 0.28);
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.72);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		color: #f8fafc;
		font: inherit;
		font-size: 1.45rem;
		font-weight: 650;
		line-height: 1;
		pointer-events: auto;
		touch-action: manipulation;
	}

	.import-secondary-actions {
		position: absolute;
		display: flex;
		gap: 0.5rem;
		pointer-events: auto;
	}

	.import-secondary-actions.left {
		left: max(0.9rem, env(safe-area-inset-left));
		bottom: calc(1.45rem + env(safe-area-inset-bottom));
	}

	.import-secondary-actions.right {
		right: max(0.9rem, env(safe-area-inset-right));
		bottom: calc(8.35rem + env(safe-area-inset-bottom));
		flex-direction: column;
	}

	.utility-button {
		min-width: 4.75rem;
		min-height: 2.5rem;
		border: 1px solid rgba(226, 232, 240, 0.24);
		border-radius: 999px;
		padding: 0.45rem 0.8rem;
		background: rgba(15, 23, 42, 0.68);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		color: #f8fafc;
		font: inherit;
		font-size: 0.86rem;
		font-weight: 700;
		touch-action: manipulation;
	}

	.utility-button:disabled {
		opacity: 0.45;
	}

	.primary-wrap {
		position: absolute;
		left: 50%;
		bottom: calc(1rem + env(safe-area-inset-bottom));
		transform: translateX(-50%);
		display: flex;
		pointer-events: auto;
	}

	.import-primary-wrap {
		bottom: calc(1rem + env(safe-area-inset-bottom));
	}

	.primary-action {
		position: relative;
		width: clamp(11rem, 58vw, 16rem);
		min-height: 5.2rem;
		border: 2px solid rgba(255, 255, 255, 0.22);
		border-radius: 18px;
		padding: 0.9rem 1.15rem;
		box-shadow: 0 18px 52px rgba(0, 0, 0, 0.46), inset 0 0 0 6px rgba(255, 255, 255, 0.08);
		color: #fff;
		font: inherit;
		font-weight: 800;
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.2rem;
		user-select: none;
		-webkit-user-select: none;
		-webkit-tap-highlight-color: transparent;
		touch-action: manipulation;
	}

	.primary-action:active:not(:disabled) {
		transform: scale(0.96);
	}

	.primary-action.action-startDive {
		background: #10b981;
		color: #052e25;
	}

	.primary-action.action-waypoint {
		background: var(--color-primary);
		color: #042f2e;
	}

	.primary-action.action-disabled {
		background: rgba(30, 41, 59, 0.9);
	}

	.primary-action .hold-progress {
		position: absolute;
		inset: 0;
		background: rgba(255, 255, 255, 0.18);
		transform-origin: left center;
		animation: hold-fill 500ms linear forwards;
		pointer-events: none;
	}

	@keyframes hold-fill {
		from {
			transform: scaleX(0);
		}
		to {
			transform: scaleX(1);
		}
	}

	.btn-main {
		font-size: clamp(1.25rem, 5.2vw, 1.7rem);
		line-height: 1.1;
	}

	.btn-sub {
		max-width: 12rem;
		font-size: clamp(0.82rem, 3.4vw, 1rem);
		font-weight: 500;
		opacity: 0.8;
		text-align: center;
	}

	.summary-line {
		position: absolute;
		left: 50%;
		bottom: calc(8.9rem + env(safe-area-inset-bottom));
		transform: translateX(-50%);
		padding: 0.3rem 0.55rem;
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.58);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		color: #cbd5e1;
		font-size: 0.8rem;
		text-align: center;
		white-space: nowrap;
		pointer-events: none;
	}

	.scrub-controls {
		padding-bottom: calc(1rem + env(safe-area-inset-bottom));
	}

	.scrub-primary-wrap {
		bottom: calc(8.6rem + env(safe-area-inset-bottom));
	}

	.scrub-nudge {
		min-width: 2.75rem;
		font-size: 1.15rem;
		line-height: 1;
	}

	.scrub-rail-wrap {
		position: absolute;
		left: max(0.9rem, env(safe-area-inset-left));
		right: max(0.9rem, env(safe-area-inset-right));
		bottom: calc(1.1rem + env(safe-area-inset-bottom));
		padding: 0.7rem 0.8rem 0.6rem;
		border: 1px solid rgba(226, 232, 240, 0.18);
		border-radius: 14px;
		background: rgba(15, 23, 42, 0.74);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		pointer-events: auto;
		touch-action: none;
	}

	.scrub-meta {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		color: #e2e8f0;
		font-size: 0.78rem;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}

	.scrub-meta.dim {
		color: #94a3b8;
		font-weight: 650;
	}

	.scrub-range {
		width: 100%;
		height: 2.4rem;
		margin: 0.1rem 0;
		accent-color: var(--color-primary);
		touch-action: pan-x;
	}

	.scrub-summary-line {
		bottom: calc(14.8rem + env(safe-area-inset-bottom));
	}

	.scrub-reset {
		min-width: 2.75rem;
		min-height: 2.35rem;
		border: 1px solid rgba(248, 113, 113, 0.28);
		border-radius: 999px;
		padding: 0.35rem;
		background: rgba(127, 29, 29, 0.42);
		color: #fecaca;
		font: inherit;
		font-size: 1.15rem;
		font-weight: 800;
	}

	.scrub-reset:disabled {
		display: none;
	}

	.import-review-card {
		background: rgba(15, 23, 42, 0.72);
		border: 1px solid rgba(148, 163, 184, 0.16);
		border-radius: 12px;
		padding: 0.8rem;
		margin-bottom: 1rem;
	}

	.import-review-hint,
	.import-review-error {
		margin: 0.6rem 0 0;
		font-size: 0.82rem;
		line-height: 1.35;
		color: var(--color-text-muted);
	}

	.import-review-error {
		color: #fca5a5;
	}

	.import-marker-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
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

	.import-marker-grid button:disabled {
		opacity: 0.45;
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

	.import-waypoint-list {
		display: grid;
		gap: 0.45rem;
		margin-top: 0.7rem;
	}

	.import-waypoint-row {
		display: grid;
		grid-template-columns: 1.3fr 1fr 1fr;
		gap: 0.45rem;
		padding: 0.55rem;
		border: 1px solid rgba(148, 163, 184, 0.14);
		border-radius: 8px;
		background: rgba(2, 6, 23, 0.28);
	}

	.import-waypoint-row span {
		display: block;
		font-size: 0.66rem;
		font-weight: 700;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	.import-waypoint-row strong {
		display: block;
		margin-top: 0.14rem;
		font-size: 0.84rem;
		color: var(--color-text);
	}

	@media (max-width: 520px) {
		.import-marker-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.import-waypoint-row {
			grid-template-columns: 1fr;
		}
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
