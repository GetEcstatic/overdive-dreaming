<!--
  DiveVideoPlayer.svelte
  In-app playback of a clean DiveVideo with a DOM HUD overlay driven by the
  stored DiveTimeline. See docs/Dynamic video feature.md §5 (Option D).

  Uses `requestVideoFrameCallback` where available to stay frame-accurate;
  falls back to `timeupdate` on platforms that don't support it.

  The HUD can be toggled on/off during replay. When on, the Download action
  re-encodes the clip with the HUD burned into each frame via an offscreen
  canvas + MediaRecorder pipeline so it survives export to Photos / share
  sheets.
-->
<script lang="ts" module>
	const DASHBOARD_AUTOPLAY_MIN_RATIO = 0.65;
	let dashboardAutoplayInstance = 0;

	interface DashboardAutoplayEntry {
		id: string;
		ratio: number;
		play: () => void;
		pause: () => void;
	}

	const dashboardAutoplayEntries = new Map<string, DashboardAutoplayEntry>();
	let activeDashboardAutoplayId: string | null = null;

	function refreshDashboardAutoplay(): void {
		const next =
			[...dashboardAutoplayEntries.values()]
				.filter((entry) => entry.ratio >= DASHBOARD_AUTOPLAY_MIN_RATIO)
				.sort((a, b) => b.ratio - a.ratio)[0]?.id ?? null;

		activeDashboardAutoplayId = next;
		for (const entry of dashboardAutoplayEntries.values()) {
			if (entry.id === activeDashboardAutoplayId) entry.play();
			else entry.pause();
		}
	}

	function pauseDashboardAutoplay(): void {
		activeDashboardAutoplayId = null;
		for (const entry of dashboardAutoplayEntries.values()) entry.pause();
	}

	function dashboardAutoplayDisabledByPreferences(): boolean {
		if (typeof window === 'undefined') return true;
		const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
		const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
		return reducedMotion || connection?.saveData === true;
	}
</script>

<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { doc, onSnapshot } from 'firebase/firestore';
	import { db } from '$lib/firebase';
	import { user } from '$lib/stores/auth';
	import MetricHudSvg from '$lib/components/MetricHudSvg.svelte';
	import SpeedPlotHudSvg from '$lib/components/SpeedPlotHudSvg.svelte';
	import type { DiveTimeline, DiveVideo } from '$lib/types';
	import {
		distanceAt,
		diveElapsedAt,
		speedAt,
		totalTimeMs
	} from '$lib/capture/timeline';
	import { displayTransformFor } from '$lib/capture/orientation';
	import {
		bitrateForResolution,
		DEFAULT_VIDEO_QUALITY_PRESET
	} from '$lib/capture/videoQuality';
	import {
		diveVideoBehavior,
		exitDiveFullscreen,
		requestDiveFullscreen,
		DIVE_FS_EVENT
	} from '$lib/stores/videoPlayback';
	import {
		getDiveVideoBurnedDownloadUrl,
		getDiveVideoDirectDownloadUrl,
		requestDiveVideoOverlayDownload
	} from '$lib/services/diveVideos';
	import { getUserPBRecords, getUserPBs } from '$lib/utils/personalBests';
	import { hasCurrentServerOverlayArtifact } from '$lib/media/processing';
	import {
		canvasFont,
		hudFontLoadDescriptors,
		scaleHudModeDesign,
		type HudRenderMode,
		type HudTextStyle
	} from '$lib/media/hudDesign';
	import { createMetricHudFrame } from '$lib/media/metricHudFrame';
	import {
		createSpeedPlotFrame,
		projectSpeedPlot,
		scaleSpeedPlotHudDesign,
		speedPlotCanvasFonts,
		speedPlotCssVariables
	} from '$lib/media/speedPlotHud';

	const MAX_BROWSER_OVERLAY_EXPORT_BYTES = 200 * 1024 * 1024;

	interface Props {
		video: DiveVideo;
		/** Pre-resolved Storage download URL for the clean video. */
		srcUrl: string;
		/** Optional signed thumbnail/poster URL for faster feed/session rendering. */
		posterUrl?: string;
		/**
		 * Compact variant for feed cards: hides the summary + actions card
		 * (HUD toggle, download button, export progress). The HUD overlay on
		 * top of the video itself is preserved. Defaults to the full layout.
		 */
		compact?: boolean;
		/** Dashboard feed opt-in: entering locked playback immediately on portrait play. */
		fullscreenOnPlay?: boolean;
		/** Disable rotation-driven fullscreen while preserving explicit play fullscreen. */
		allowAutoFullscreen?: boolean;
		/** Hide native inline controls and use Overdive controls in the video frame. */
		customInlineControls?: boolean;
		/** Use the compact action row for feed cards. */
		inlineActions?: boolean;
		/** Muted single-card autoplay for dashboard feed playback. */
		dashboardAutoplay?: boolean;
		/** Pressing inline video opens custom fullscreen instead of toggling inline playback. */
		tapToFullscreen?: boolean;
		/** Mute the inline video while dashboard autoplay owns playback. */
		mutedInline?: boolean;
		/** Fill the dashboard feed media frame instead of preserving source aspect ratio inline. */
		feedFrame?: boolean;
	}

	let {
		video,
		srcUrl,
		posterUrl,
		compact = false,
		fullscreenOnPlay = false,
		allowAutoFullscreen,
		customInlineControls = false,
		inlineActions = false,
		dashboardAutoplay = false,
		tapToFullscreen = false,
		mutedInline = false,
		feedFrame = false
	}: Props = $props();
	function initialLiveVideo(): DiveVideo {
		return video;
	}
	let liveVideo = $state<DiveVideo>(initialLiveVideo());

	let videoEl: HTMLVideoElement | undefined = $state();
	let containerEl: HTMLDivElement | undefined = $state();
	let containerWidth = $state(390);
	let currentMs = $state(0);
	let isPlaying = $state(false);
	let inlineMuted = $state(false);
	let rvfcHandle: number | null = null;

	type HudPreset = 'clean' | 'hud';

	let showOverlay = $state(true);
	const showSpeedPlot = $derived(showOverlay);
	let pbDistanceM = $state<number | null>(null);
	let autoRequestedOverlayVideoId = $state<string | null>(null);

	onMount(() => {
		const unsubscribe = onSnapshot(doc(db, 'diveVideos', video.id), (snapshot) => {
			if (!snapshot.exists()) return;
			liveVideo = { id: snapshot.id, ...snapshot.data() } as DiveVideo;
		});
		return unsubscribe;
	});

	$effect(() => {
		const athleteId = liveVideo.athleteId ?? liveVideo.userId ?? liveVideo.ownerId;
		const discipline = liveVideo.discipline;
		let cancelled = false;
		pbDistanceM = null;
		void resolveDisciplinePbDistance(athleteId, discipline).then((pb) => {
			if (!cancelled) pbDistanceM = pb;
		});
		return () => {
			cancelled = true;
		};
	});

	async function resolveDisciplinePbDistance(
		userId: string | undefined,
		discipline: DiveVideo['discipline']
	): Promise<number | null> {
		if (!userId) return null;
		try {
			const records = await getUserPBRecords(userId);
			const standardRecord = Object.values(records ?? {})
				.filter(
					(record) =>
						record.discipline === discipline &&
						record.metric === 'distance' &&
						record.isStandard &&
						Number.isFinite(record.value)
				)
				.sort((a, b) => b.value - a.value)[0];
			if (standardRecord?.value) return standardRecord.value;

			const legacy = await getUserPBs(userId);
			const value = legacy?.[discipline];
			return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
		} catch {
			return null;
		}
	}

	/**
	 * Pseudo-fullscreen state, driven by the `diveVideoBehavior` action via
	 * the `divefullscreenchange` CustomEvent on the container. Used to swap
	 * native <video> controls for a custom landscape control bar that won't
	 * collide with the HUD.
	 */
	let isFullscreen = $state(false);
	let fullscreenMode = $state<'landscape' | 'portrait' | null>(null);
	let showFullscreenControls = $state(true);
	let isScrubbing = $state(false);
	let scrubPreviewMs = $state(0);
	let portraitSwipeStart: { x: number; y: number } | null = null;
	let fullscreenControlsTimer: ReturnType<typeof setTimeout> | null = null;

	/**
	 * User-configurable fit mode: `cover` fills the screen with no black bars
	 * (crops ~10 % of the video), `contain` letterboxes and shows every pixel.
	 * Persisted in localStorage so the preference sticks across sessions.
	 */
	const FIT_KEY = 'overdive.videoFitMode';
	let fitMode = $state<'cover' | 'contain'>('cover');

	onMount(() => {
		try {
			const saved = localStorage.getItem(FIT_KEY);
			if (saved === 'cover' || saved === 'contain') fitMode = saved;
		} catch {
			/* storage unavailable — fall back to default */
		}
	});

	$effect(() => {
		// Keep the CSS custom property in sync so the pseudo-fullscreen rule
		// (see src/app.css) picks up the latest fit mode. Also persist.
		if (containerEl) {
			containerEl.style.setProperty('--dive-video-fit', fitMode);
		}
		try {
			localStorage.setItem(FIT_KEY, fitMode);
		} catch {
			/* ignore */
		}
	});

	function onFullscreenEvent(e: Event) {
		const ce = e as CustomEvent<{ fullscreen: boolean; mode?: 'landscape' | 'portrait' | null }>;
		isFullscreen = !!ce.detail?.fullscreen;
		fullscreenMode = ce.detail?.mode ?? null;
		revealFullscreenControls();
	}

	$effect(() => {
		// Listen for the custom fullscreen event dispatched by diveVideoBehavior
		// on the container. We wire it imperatively because the event name is
		// custom and Svelte's attribute-based event binding doesn't recognise it.
		if (!containerEl) return;
		containerEl.addEventListener('divefullscreenchange', onFullscreenEvent);
		return () => {
			containerEl?.removeEventListener('divefullscreenchange', onFullscreenEvent);
		};
	});

	function onPlayStateChange() {
		isPlaying = !!videoEl && !videoEl.paused && !videoEl.ended;
		revealFullscreenControls();
	}

	function togglePlay() {
		if (!videoEl) return;
		if (videoEl.paused || videoEl.ended) videoEl.play().catch(() => {});
		else videoEl.pause();
	}

	function toggleFit() {
		fitMode = fitMode === 'cover' ? 'contain' : 'cover';
	}

	function exitFullscreen() {
		exitDiveFullscreen(containerEl ?? null);
	}

	function requestInlineFullscreen(): void {
		if (!tapToFullscreen) return;
		fitMode = 'cover';
		inlineMuted = false;
		if (videoEl) {
			videoEl.muted = false;
			if (videoEl.paused || videoEl.ended) videoEl.play().catch(() => {});
		}
		requestDiveFullscreen(containerEl ?? null);
	}

	const timeline: DiveTimeline = $derived(liveVideo.timeline);
	const poolLength: number = $derived(liveVideo.poolLength);

	const totalDurationMs = $derived(totalTimeMs(timeline) || liveVideo.durationSeconds * 1000);
	const mediaDurationMs = $derived(
		Math.max(
			0,
			Number.isFinite(videoEl?.duration ?? NaN) && (videoEl?.duration ?? 0) > 0
				? (videoEl?.duration ?? 0) * 1000
				: totalDurationMs
		)
	);
	const scrubMs = $derived(isScrubbing ? scrubPreviewMs : currentMs);
	const scrubProgress = $derived(
		mediaDurationMs > 0 ? Math.max(0, Math.min(1, scrubMs / mediaDurationMs)) : 0
	);
	const totalDistance = $derived(
		Math.max(
			0,
			distanceAt(timeline, Math.max(0, totalDurationMs), poolLength),
			...(timeline.samples?.map((sample) => sample.distanceM) ?? []),
			...timeline.laps.map((lap) => lap.cumulativeDistanceM)
		)
	);
	const scrubDistance = $derived(distanceAt(timeline, Math.max(0, scrubMs), poolLength));
	const fullscreenControlsVisible = $derived(
		isFullscreen && (showFullscreenControls || !isPlaying || isScrubbing)
	);
	const autoFullscreenEnabled = $derived(allowAutoFullscreen ?? !compact);
	const nativeControlsVisible = $derived(!isFullscreen && !customInlineControls);
	const showPlayerActions = $derived(!compact);
	const showBelowActions = $derived(showPlayerActions && !isFullscreen);
	const portraitFullscreenAllowed = $derived(fullscreenOnPlay || tapToFullscreen);
	const canDownloadVideo = $derived(
		$user?.uid === liveVideo.ownerId || $user?.uid === liveVideo.userId
	);
	const canEditWaypoints = $derived(
		$user?.uid === liveVideo.ownerId || $user?.uid === liveVideo.userId || $user?.uid === liveVideo.athleteId
	);

	// Orientation-aware display transform. For legacy clips without the
	// new metadata fields, this returns the same landscape layout the
	// player has always used, so existing videos keep rendering as before.
	const displayTransform = $derived(
		displayTransformFor({
			displayOrientation: liveVideo.displayOrientation,
			displayRotationDeg: liveVideo.displayRotationDeg,
			assetOrientation: liveVideo.assetOrientation
		})
	);
	const displayAspectRatioNumber = $derived(
		displayTransform.aspectRatio === '9 / 16' ? 9 / 16 : 16 / 9
	);
	const hudMode = $derived<HudRenderMode>(
		fullscreenMode === 'landscape' || (!isFullscreen && displayTransform.hudMode === 'landscape')
			? 'landscape'
			: 'portrait'
	);
	const metricHudFrame = $derived(
		createMetricHudFrame({
			timeline,
			poolLengthM: poolLength,
			atMs: Math.max(0, currentMs),
			widthPx: Math.max(320, containerWidth || 390),
			mode: hudMode
		})
	);
	const showAnyOverlay = $derived(showOverlay);
	const requiresBrowserOverlayExport = $derived(false);
	const speedPlotFrame = $derived(
		createSpeedPlotFrame({
			timeline,
			poolLengthM: poolLength,
			currentVideoMs: Math.max(0, currentMs),
			pbDistanceM
		})
	);
	const speedPlotViewportWidth = $derived(Math.max(320, containerWidth || 390));
	const speedPlotDomDesign = $derived(scaleSpeedPlotHudDesign(speedPlotViewportWidth));
	const speedPlotModel = $derived(
		projectSpeedPlot(speedPlotFrame, speedPlotViewportWidth, speedPlotDomDesign.bandHeightPx)
	);
	const speedPlotControlsClearance = $derived(isFullscreen ? 72 : nativeControlsVisible ? 42 : 0);
	const speedPlotStyle = $derived(
		speedPlotCssVariables(speedPlotViewportWidth, speedPlotControlsClearance)
	);

	function currentHudPreset(): HudPreset {
		return showOverlay ? 'hud' : 'clean';
	}

	function hudPresetLabel(): string {
		switch (currentHudPreset()) {
			case 'clean':
				return 'Clean';
			case 'hud':
				return 'HUD';
		}
	}

	function cycleHudPreset(): void {
		showOverlay = !showOverlay;
	}

	function formatMs(ms: number): string {
		const secs = Math.floor(ms / 1000);
		const mm = Math.floor(secs / 60).toString().padStart(2, '0');
		const ss = (secs % 60).toString().padStart(2, '0');
		const tenths = Math.floor((ms % 1000) / 100);
		return `${mm}:${ss}.${tenths}`;
	}

	function formatDistanceLabel(meters: number): string {
		if (!Number.isFinite(meters) || meters <= 0) return '0m';
		return `${Math.round(meters)}m`;
	}

	function clearFullscreenControlsTimer(): void {
		if (!fullscreenControlsTimer) return;
		clearTimeout(fullscreenControlsTimer);
		fullscreenControlsTimer = null;
	}

	function revealFullscreenControls(): void {
		showFullscreenControls = true;
		clearFullscreenControlsTimer();
		if (!isFullscreen || !isPlaying || isScrubbing) return;
		fullscreenControlsTimer = setTimeout(() => {
			if (isPlaying && !isScrubbing) showFullscreenControls = false;
		}, 2600);
	}

	function onFullscreenPointerActivity(): void {
		if (!isFullscreen) return;
		revealFullscreenControls();
	}

	function onFullscreenPointerDown(event: PointerEvent): void {
		onFullscreenPointerActivity();
		if (!isFullscreen || fullscreenMode !== 'portrait' || isScrubbing) return;
		if (event.pointerType === 'mouse') return;
		const target = event.target;
		if (target instanceof Element && target.closest('.fs-controls')) return;
		portraitSwipeStart = { x: event.clientX, y: event.clientY };
	}

	function onFullscreenPointerMove(event: PointerEvent): void {
		onFullscreenPointerActivity();
		if (!portraitSwipeStart || !isFullscreen || fullscreenMode !== 'portrait') return;
		const deltaX = event.clientX - portraitSwipeStart.x;
		const deltaY = event.clientY - portraitSwipeStart.y;
		if (deltaY > 96 && deltaY > Math.abs(deltaX) * 1.4) {
			portraitSwipeStart = null;
			exitFullscreen();
		}
	}

	function clearPortraitSwipe(): void {
		portraitSwipeStart = null;
	}

	function onInlineVideoClick(): void {
		if (!customInlineControls || isFullscreen) return;
		if (tapToFullscreen) {
			requestInlineFullscreen();
			return;
		}
		void togglePlay();
	}

	onMount(() => {
		if (!dashboardAutoplay) return;
		if (dashboardAutoplayDisabledByPreferences()) return;
		if (!containerEl) return;

		const id = `${video.id}:${dashboardAutoplayInstance++}`;
		const entry: DashboardAutoplayEntry = {
			id,
			ratio: 0,
			play: () => {
				if (!videoEl || isFullscreen) return;
				inlineMuted = mutedInline;
				videoEl.muted = mutedInline;
				if (videoEl.paused || videoEl.ended) videoEl.play().catch(() => {});
			},
			pause: () => {
				if (!videoEl || isFullscreen || videoEl.paused) return;
				videoEl.pause();
			}
		};
		dashboardAutoplayEntries.set(id, entry);

		const observer = new IntersectionObserver(
			(entries) => {
				const observed = entries[0];
				entry.ratio = observed?.isIntersecting ? observed.intersectionRatio : 0;
				refreshDashboardAutoplay();
			},
			{ threshold: [0, 0.35, 0.65, 0.85, 1] }
		);
		observer.observe(containerEl);

		const onVisibilityChange = () => {
			if (document.hidden) pauseDashboardAutoplay();
			else refreshDashboardAutoplay();
		};
		document.addEventListener('visibilitychange', onVisibilityChange);

		return () => {
			observer.disconnect();
			document.removeEventListener('visibilitychange', onVisibilityChange);
			dashboardAutoplayEntries.delete(id);
			refreshDashboardAutoplay();
		};
	});

	function seekToProgress(progress: number): void {
		const clamped = Math.max(0, Math.min(1, progress));
		const targetMs = clamped * mediaDurationMs;
		scrubPreviewMs = targetMs;
		currentMs = targetMs;
		if (videoEl && mediaDurationMs > 0) {
			videoEl.currentTime = targetMs / 1000;
		}
	}

	function onScrubInput(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		seekToProgress(Number(input.value) / 1000);
	}

	function beginScrub(): void {
		isScrubbing = true;
		scrubPreviewMs = currentMs;
		revealFullscreenControls();
	}

	function endScrub(): void {
		isScrubbing = false;
		revealFullscreenControls();
	}

	type VideoWithRvfc = HTMLVideoElement & {
		requestVideoFrameCallback?: (
			cb: (now: number, metadata: { mediaTime: number }) => void
		) => number;
		cancelVideoFrameCallback?: (handle: number) => void;
	};

	function scheduleRvfc(el: VideoWithRvfc): void {
		if (typeof el.requestVideoFrameCallback !== 'function') return;
		rvfcHandle = el.requestVideoFrameCallback((_now, metadata) => {
			currentMs = metadata.mediaTime * 1000;
			scheduleRvfc(el);
		});
	}

	function onTimeUpdate(): void {
		if (!videoEl) return;
		// Fallback when rVFC isn't available.
		if (rvfcHandle === null) {
			currentMs = videoEl.currentTime * 1000;
		}
	}

	onDestroy(() => {
		clearFullscreenControlsTimer();
		if (videoEl && rvfcHandle !== null) {
			const el = videoEl as VideoWithRvfc;
			el.cancelVideoFrameCallback?.(rvfcHandle);
		}
	});

	// -----------------------------------------------------------------------
	// Downloads: original videos stream directly from storage; overlay exports
	// still use `navigator.share({ files })` with an `<a download>` fallback.
	// See docs/Dynamic video feature.md §7 and QA checklist.
	// Speed-graph exports are re-rendered through a canvas so the growing graph
	// is burned into every frame. Classic-only overlays can use the server path.
	// -----------------------------------------------------------------------
	let downloadError = $state<string | null>(null);
	let exportDiagnostic = $state<string | null>(null);
	let preparedShareFile = $state<File | null>(null);
	let preparedOriginalFile = $state<File | null>(null);
	let preparedServerOverlayFile = $state<File | null>(null);
	let downloading = $state(false);
	let requestingServerOverlay = $state(false);
	let exportProgress = $state(0); // 0..1 while baking
	const overlayDownloadStatus = $derived(liveVideo.processingState?.overlayDownload ?? 'not-requested');
	const hasCurrentServerOverlay = $derived(hasCurrentServerOverlayArtifact(liveVideo));
	const effectiveOverlayDownloadStatus = $derived(
		overlayDownloadStatus === 'ready' && !hasCurrentServerOverlay ? 'retryable' : overlayDownloadStatus
	);

	$effect(() => {
		if (!showPlayerActions || !showOverlay || !canDownloadVideo) return;
		if (autoRequestedOverlayVideoId === liveVideo.id) return;
		if (effectiveOverlayDownloadStatus !== 'not-requested' && effectiveOverlayDownloadStatus !== 'retryable') return;
		autoRequestedOverlayVideoId = liveVideo.id;
		void requestServerOverlay();
	});

	function fileExtensionFromMime(mime: string): string {
		if (mime.includes('mp4')) return 'mp4';
		if (mime.includes('webm')) return 'webm';
		return 'bin';
	}

	function resolutionPresetForDimensions(width: number, height: number): '720p' | '1080p' {
		return Math.max(width, height) >= 1600 || Math.min(width, height) >= 900 ? '1080p' : '720p';
	}

	function formatMbps(bitsPerSecond: number | undefined): string {
		if (!bitsPerSecond || bitsPerSecond <= 0) return 'unknown bitrate';
		return `${(bitsPerSecond / 1_000_000).toFixed(1)} Mbps`;
	}

	function formatBytes(bytes: number | undefined): string {
		if (!bytes || bytes <= 0) return 'unknown size';
		const mb = bytes / (1024 * 1024);
		return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
	}

	type CanvasVideoTrackWithRequestFrame = MediaStreamTrack & {
		requestFrame?: () => void;
	};

	type AudioContextConstructor = new () => AudioContext;

	type ExportAudioHandle = {
		tracks: MediaStreamTrack[];
		close: () => void;
	};

	function captureCanvasStream(canvas: HTMLCanvasElement, allowManualFrameRequest: boolean): {
		stream: MediaStream;
		requestFrame: (() => void) | null;
		manualFrameRequest: boolean;
	} {
		if (!allowManualFrameRequest) {
			return {
				stream: canvas.captureStream(30),
				requestFrame: null,
				manualFrameRequest: false
			};
		}

		const manualStream = canvas.captureStream(0);
		const [manualTrack] = manualStream.getVideoTracks() as CanvasVideoTrackWithRequestFrame[];
		if (typeof manualTrack?.requestFrame === 'function') {
			return {
				stream: manualStream,
				requestFrame: () => manualTrack.requestFrame?.(),
				manualFrameRequest: true
			};
		}
		manualStream.getTracks().forEach((track) => track.stop());
		return {
			stream: canvas.captureStream(30),
			requestFrame: null,
			manualFrameRequest: false
		};
	}

	async function captureAudioFromElement(el: HTMLVideoElement): Promise<ExportAudioHandle> {
		const AudioCtx = (globalThis as unknown as {
			AudioContext?: AudioContextConstructor;
			webkitAudioContext?: AudioContextConstructor;
		}).AudioContext ?? (globalThis as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;

		if (!AudioCtx) return { tracks: [], close: () => undefined };

		try {
			const ctx = new AudioCtx();
			const source = ctx.createMediaElementSource(el);
			const destination = ctx.createMediaStreamDestination();
			source.connect(destination);
			void ctx.resume().catch(() => undefined);
			return {
				tracks: destination.stream.getAudioTracks(),
				close: () => {
					destination.stream.getTracks().forEach((track) => track.stop());
					source.disconnect();
					void ctx.close().catch(() => undefined);
				}
			};
		} catch {
			return { tracks: [], close: () => undefined };
		}
	}

	/**
	 * Sniff the real container of a video blob by inspecting magic bytes.
	 * The MIME stored on the DiveVideo record (or reported by fetch) can
	 * disagree with the actual bytes — that mismatch makes iOS refuse to
	 * expose the "Save Video" (Photos) option in the share sheet. We
	 * normalise to the real type so the share sheet behaves.
	 *
	 *  - MP4 (ISO BMFF): bytes 4..7 == "ftyp"
	 *  - WebM/Matroska:  starts with 0x1A 0x45 0xDF 0xA3 (EBML header)
	 */
	async function sniffVideoContainer(
		blob: Blob
	): Promise<{ mime: 'video/mp4' | 'video/webm' | null }> {
		try {
			const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
			if (
				head.length >= 8 &&
				head[4] === 0x66 /* f */ &&
				head[5] === 0x74 /* t */ &&
				head[6] === 0x79 /* y */ &&
				head[7] === 0x70 /* p */
			) {
				return { mime: 'video/mp4' };
			}
			if (
				head.length >= 4 &&
				head[0] === 0x1a &&
				head[1] === 0x45 &&
				head[2] === 0xdf &&
				head[3] === 0xa3
			) {
				return { mime: 'video/webm' };
			}
		} catch {
			/* fall through */
		}
		return { mime: null };
	}

	function isIOS(): boolean {
		if (typeof navigator === 'undefined') return false;
		const ua = navigator.userAgent || '';
		// iPhone, iPad (iPadOS ≥13 reports as Mac but has touch), iPod.
		if (/iPad|iPhone|iPod/.test(ua)) return true;
		const nav = navigator as Navigator & { maxTouchPoints?: number };
		return /Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1;
	}

	function suggestedFileName(mime: string, withOverlay: boolean): string {
		const stamp = liveVideo.recordedAt?.toDate?.().toISOString?.().replace(/[:.]/g, '-') ?? 'dive';
		const tag = withOverlay ? 'overlay' : 'clean';
		return `overdive-${liveVideo.discipline}-${tag}-${stamp}.${fileExtensionFromMime(mime)}`;
	}

	function clickDownloadUrl(url: string, fileName: string): void {
		const a = document.createElement('a');
		a.href = url;
		a.download = fileName;
		document.body.appendChild(a);
		a.click();
		a.remove();
	}

	async function sharePreparedVideo(file: File, unavailableMessage: string): Promise<boolean> {
		const nav = navigator as Navigator & {
			canShare?: (data: { files: File[] }) => boolean;
			share?: (data: { files: File[]; title?: string; text?: string }) => Promise<void>;
		};
		if (typeof nav.share !== 'function' || !nav.canShare?.({ files: [file] })) {
			downloadError = unavailableMessage;
			return false;
		}
		await nav.share({
			files: [file],
			title: 'Dive video',
			text: `${liveVideo.discipline} dive`
		});
		return true;
	}

	async function downloadOriginalVideo(): Promise<void> {
		if (downloading) return;
		if (!canDownloadVideo) return;
		if (preparedOriginalFile) {
			try {
				const shared = await sharePreparedVideo(
					preparedOriginalFile,
					'This browser cannot share the prepared original video file.'
				);
				if (shared) preparedOriginalFile = null;
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				if (!/abort/i.test(msg)) downloadError = msg;
			}
			return;
		}
		downloading = true;
		downloadError = null;
		exportDiagnostic = null;
		preparedShareFile = null;

		try {
			const fileName = suggestedFileName(liveVideo.mimeType, false);
			const url = await getDiveVideoDirectDownloadUrl(liveVideo, fileName);
			await shareOrDownloadVideoUrl({
				url,
				fileName,
				mime: liveVideo.mimeType || 'video/mp4',
				fallbackError: 'Original video is ready. Tap Download to open the share sheet.',
				preparedKind: 'original'
			});
			if (!downloadError) exportDiagnostic = `Original video ready (${formatBytes(liveVideo.sizeBytes)}).`;
		} catch (err) {
			downloadError = err instanceof Error ? err.message : String(err);
		} finally {
			downloading = false;
		}
	}

	async function shareOrDownloadVideoUrl(args: {
		url: string;
		fileName: string;
		mime: string;
		fallbackError: string;
		preparedKind: 'original' | 'server-overlay';
	}): Promise<void> {
		if (!isIOS()) {
			clickDownloadUrl(args.url, args.fileName);
			return;
		}

		const nav = navigator as Navigator & {
			canShare?: (data: { files: File[] }) => boolean;
			share?: (data: { files: File[]; title?: string; text?: string }) => Promise<void>;
		};

		try {
			const response = await fetch(args.url);
			if (!response.ok) throw new Error(`Download failed with HTTP ${response.status}`);
			let blob = await response.blob();
			let mime = args.mime;
			const sniffed = await sniffVideoContainer(blob);
			if (sniffed.mime) mime = sniffed.mime;
			if (blob.type !== mime) blob = new Blob([blob], { type: mime });
			const fileName = args.fileName.replace(/\.(mp4|webm|bin)$/i, `.${fileExtensionFromMime(mime)}`);
			const file = new File([blob], fileName, { type: mime });

			if (
				typeof nav.share === 'function' &&
				typeof nav.canShare === 'function' &&
				nav.canShare({ files: [file] })
			) {
				try {
					await nav.share({
						files: [file],
						title: 'Dive video',
						text: `${liveVideo.discipline} dive`
					});
					return;
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					const name = (err as { name?: string } | null)?.name ?? '';
					if (/abort/i.test(msg) || name === 'AbortError') return;
					if (name === 'NotAllowedError' || /not allowed/i.test(msg)) {
						if (args.preparedKind === 'original') preparedOriginalFile = file;
						else preparedServerOverlayFile = file;
						downloadError = args.fallbackError;
						return;
					}
					throw err;
				}
			}

			const objectUrl = URL.createObjectURL(blob);
			clickDownloadUrl(objectUrl, fileName);
			setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
		} catch {
			clickDownloadUrl(args.url, args.fileName);
		}
	}

	/**
	 * Render the source clip through an offscreen canvas with the HUD drawn
	 * on top of each frame, producing a new video blob.
	 *
	 * Notes:
	 *  - iOS Safari will not play a <video> element that isn't attached to
	 *    the DOM, so we append a hidden off-DOM element.
	 *  - `crossOrigin = 'anonymous'` must be set BEFORE `src` so the video
	 *    request is CORS; otherwise the canvas becomes tainted and
	 *    `canvas.captureStream()` + MediaRecorder will silently produce an
	 *    empty blob.
	 */
	async function renderWithOverlay(): Promise<{
		blob: Blob;
		mime: string;
		requestedVideoBitrateBps: number;
		audioPreserved: boolean;
		manualFrameRequest: boolean;
		reliableMode: boolean;
		retried: boolean;
	}> {
		const reliableMode = isIOS();
		let retried = false;

		const render = async (preserveAudio: boolean, allowManualFrameRequest: boolean) =>
			renderWithOverlayAttempt({ preserveAudio, allowManualFrameRequest, reliableMode, retried });

		try {
			return await render(!reliableMode, !reliableMode);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (reliableMode || !/exported clip was empty/i.test(msg)) throw err;
			retried = true;
			return await render(false, false);
		}
	}

	async function renderWithOverlayAttempt(options: {
		preserveAudio: boolean;
		allowManualFrameRequest: boolean;
		reliableMode: boolean;
		retried: boolean;
	}): Promise<{
		blob: Blob;
		mime: string;
		requestedVideoBitrateBps: number;
		audioPreserved: boolean;
		manualFrameRequest: boolean;
		reliableMode: boolean;
		retried: boolean;
	}> {
		const off = document.createElement('video');
		off.crossOrigin = 'anonymous';
		off.muted = true;
		off.playsInline = true;
		off.preload = 'auto';
		off.setAttribute('playsinline', '');
		off.setAttribute('webkit-playsinline', '');
		off.style.position = 'fixed';
		off.style.left = '-9999px';
		off.style.top = '0';
		off.style.width = '2px';
		off.style.height = '2px';
		off.style.opacity = '0';
		off.style.pointerEvents = 'none';
		document.body.appendChild(off);
		off.src = srcUrl;

		let audioHandle: ExportAudioHandle | null = null;
		let exportStream: MediaStream | null = null;

		try {
			await new Promise<void>((resolve, reject) => {
				const onMeta = () => {
					off.removeEventListener('loadedmetadata', onMeta);
					off.removeEventListener('error', onErr);
					resolve();
				};
				const onErr = () => {
					off.removeEventListener('loadedmetadata', onMeta);
					off.removeEventListener('error', onErr);
					reject(new Error('Failed to load source video for re-encode'));
				};
				off.addEventListener('loadedmetadata', onMeta);
				off.addEventListener('error', onErr);
			});

			const w = off.videoWidth || liveVideo.widthPx || 1280;
			const h = off.videoHeight || liveVideo.heightPx || 720;

			const canvas = document.createElement('canvas');
			canvas.width = w;
			canvas.height = h;
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('Canvas 2D context unavailable');
			await loadOverlayCanvasFonts(w, h > w ? 'portrait' : 'landscape');

			// Pick a supported mime. Prefer mp4 (iOS/Safari native); fall back to webm.
			const candidates = [
				'video/mp4;codecs=avc1.42E01E',
				'video/mp4',
				'video/webm;codecs=vp9',
				'video/webm;codecs=vp8',
				'video/webm'
			];
			const mimeType = candidates.find(
				(m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)
			);
			if (!mimeType) throw new Error('No supported MediaRecorder mime type');

			const outputResolution = resolutionPresetForDimensions(w, h);
			const outputQuality = liveVideo.qualityPreset ?? DEFAULT_VIDEO_QUALITY_PRESET;
			const requestedVideoBitrateBps = bitrateForResolution(outputResolution, outputQuality);
			audioHandle = options.preserveAudio ? await captureAudioFromElement(off) : null;
			const capture = captureCanvasStream(canvas, options.allowManualFrameRequest);
			exportStream = capture.stream;
			for (const track of audioHandle?.tracks ?? []) {
				exportStream.addTrack(track);
			}
			const recorder = new MediaRecorder(exportStream, {
				mimeType,
				videoBitsPerSecond: requestedVideoBitrateBps
			});
			const chunks: Blob[] = [];
			recorder.ondataavailable = (e) => {
				if (e.data && e.data.size > 0) chunks.push(e.data);
			};

			const durationMs = (off.duration || liveVideo.durationSeconds || 0) * 1000;

			const offR = off as VideoWithRvfc;
			const useRvfc = typeof offR.requestVideoFrameCallback === 'function';

			let finished = false;

			const drawFrame = (atMs: number): void => {
				ctx.drawImage(off, 0, 0, w, h);
				if (showOverlay) drawHud(ctx, w, h, atMs);
				if (showSpeedPlot) drawSpeedPlotHud(ctx, w, h, atMs);
				capture.requestFrame?.();
				if (durationMs > 0) {
					exportProgress = Math.min(1, atMs / durationMs);
				}
			};

			const onFrame = (_now: number, meta: { mediaTime: number }) => {
				if (finished) return;
				drawFrame(meta.mediaTime * 1000);
				offR.requestVideoFrameCallback?.(onFrame);
			};

			let rafId = 0;
			const rafLoop = () => {
				if (finished) return;
				drawFrame(off.currentTime * 1000);
				rafId = requestAnimationFrame(rafLoop);
			};

			const stopPromise = new Promise<Blob>((resolve, reject) => {
				recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
				recorder.onerror = (e) =>
					reject(
						new Error(
							`MediaRecorder error: ${(e as ErrorEvent).message ?? 'unknown'}`
						)
					);
			});

			const endPromise = new Promise<void>((resolve) => {
				off.addEventListener('ended', () => resolve(), { once: true });
			});

			// Hard safety: if the video somehow never ends (iOS quirks), bail
			// after duration × 2 + 5s.
			const timeoutMs = Math.max(10_000, durationMs * 2 + 5000);
			const timeoutPromise = new Promise<void>((resolve) => {
				setTimeout(resolve, timeoutMs);
			});

			recorder.start(250);
			if (useRvfc) {
				offR.requestVideoFrameCallback?.(onFrame);
			} else {
				rafId = requestAnimationFrame(rafLoop);
			}
			// Draw the first frame immediately so we never record a 0-duration
			// clip even if play() is slow to start.
			drawFrame(0);

			const playPromise = off.play();
			if (playPromise) {
				try {
					await playPromise;
				} catch (err) {
					throw new Error(
						`Couldn't play source video for re-encode: ${
							err instanceof Error ? err.message : String(err)
						}`
					);
				}
			}

			await Promise.race([endPromise, timeoutPromise]);
			finished = true;
			if (rafId) cancelAnimationFrame(rafId);

			// Give the recorder a tick to flush the final frame.
			await new Promise((r) => setTimeout(r, 150));
			if (recorder.state !== 'inactive') {
				recorder.requestData();
				recorder.stop();
			}
			const blob = await Promise.race([
				stopPromise,
				new Promise<Blob>((resolve) => {
					setTimeout(() => resolve(new Blob(chunks, { type: mimeType })), 2500);
				})
			]);

			if (blob.size === 0) {
				throw new Error('Exported clip was empty. On iOS this usually means the canvas pipeline was blocked.');
			}

			return {
				blob,
				mime: mimeType,
				requestedVideoBitrateBps,
				audioPreserved: (audioHandle?.tracks.length ?? 0) > 0,
				manualFrameRequest: capture.manualFrameRequest,
				reliableMode: options.reliableMode,
				retried: options.retried
			};
		} finally {
			exportStream?.getTracks().forEach((track) => track.stop());
			audioHandle?.close();
			off.pause();
			off.removeAttribute('src');
			off.load();
			off.remove();
		}
	}

	function drawHud(
		ctx: CanvasRenderingContext2D,
		w: number,
		h: number,
		atMs: number
	): void {
		const dist = distanceAt(timeline, atMs, poolLength);
		const spd = speedAt(timeline, atMs, poolLength);
		const laps = timeline.laps.filter((l) => l.atMs <= atMs).length;
		const mode: HudRenderMode = h > w ? 'portrait' : 'landscape';
		const hud = scaleHudModeDesign(w, mode);
		const boxX = Math.round(hud.offsetXPx);
		const boxY = Math.round(hud.offsetYPx);
		const boxW = mode === 'portrait'
			? w - 2 * boxX
			: Math.min(Math.round(w * (hud.maxWidthRatio ?? 1)), w - boxX * 2);
		const padX = Math.round(hud.paddingXPx);
		const padY = Math.round(hud.paddingYPx);
		const labelLine = hud.label.sizePx * hud.label.lineHeight;
		const valueLine = hud.value.sizePx * hud.value.lineHeight;
		const subLine = hud.sub.sizePx * hud.sub.lineHeight;
		const boxH = Math.round(padY * 2 + labelLine + hud.valueGapPx + valueLine + hud.subMarginTopPx + subLine);
		const radius = Math.round(hud.radiusPx);

		ctx.save();
		ctx.fillStyle = hud.background;
		roundRect(ctx, boxX, boxY, boxW, boxH, radius);
		ctx.fill();

		applyCanvasText(ctx, hud.label);
		ctx.textBaseline = 'top';

		const innerX = boxX + padX;
		const innerY = boxY + padY;
		const rightX = boxX + boxW - padX;

		ctx.textAlign = 'left';
		ctx.fillText('TIME', innerX, innerY);
		ctx.textAlign = 'right';
		ctx.fillText('DISTANCE', rightX, innerY);

		applyCanvasText(ctx, hud.value);
		ctx.textAlign = 'left';
		const diveTimeMs = diveElapsedAt(timeline, atMs);
		const valueY = innerY + labelLine + hud.valueGapPx;
		ctx.fillText(formatMs(diveTimeMs), innerX, valueY);
		ctx.textAlign = 'right';
		ctx.fillText(
			`${dist.toFixed(1)} m`,
			rightX,
			valueY
		);

		applyCanvasText(ctx, hud.sub);
		const subY = valueY + valueLine + hud.subMarginTopPx;
		ctx.textAlign = 'left';
		ctx.fillText(`Lap ${laps}/${timeline.laps.length}`, innerX, subY);
		applyCanvasText(ctx, hud.mono);
		ctx.textAlign = 'right';
		ctx.fillText(
			`${spd.toFixed(2)} m/s`,
			rightX,
			subY
		);
		ctx.restore();
	}

	function drawSpeedPlotHud(
		ctx: CanvasRenderingContext2D,
		w: number,
		h: number,
		atMs: number
	): void {
		const frame = createSpeedPlotFrame({
			timeline,
			poolLengthM: poolLength,
			currentVideoMs: atMs,
			pbDistanceM
		});
		const model = projectSpeedPlot(frame, w, h);
		const design = scaleSpeedPlotHudDesign(w);

		ctx.save();
		const gradient = ctx.createLinearGradient(0, model.bandRect.y, 0, model.bandRect.y + model.bandRect.height);
		gradient.addColorStop(0, colorWithOpacity(design.background.top, design.background.opacity));
		gradient.addColorStop(1, colorWithOpacity(design.background.bottom, design.background.opacity));
		ctx.fillStyle = gradient;
		roundRect(ctx, model.bandRect.x, model.bandRect.y, model.bandRect.width, model.bandRect.height, design.radiusPx);
		ctx.fill();

		ctx.strokeStyle = design.grid.color;
		ctx.lineWidth = design.grid.widthPx;
		ctx.setLineDash([]);
		for (const line of model.gridLines) {
			ctx.beginPath();
			ctx.moveTo(line.x1, line.y1);
			ctx.lineTo(line.x2, line.y2);
			ctx.stroke();
		}

		if (model.pbMarker) {
			ctx.save();
			ctx.strokeStyle = design.pbMarker.color;
			ctx.lineWidth = design.pbMarker.widthPx;
			ctx.setLineDash([design.pbMarker.symbolSizePx * 0.45, design.pbMarker.symbolSizePx * 0.45]);
			ctx.beginPath();
			ctx.moveTo(model.pbMarker.x, model.pbMarker.y1);
			ctx.lineTo(model.pbMarker.x, model.pbMarker.y2);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.fillStyle = design.pbMarker.color;
			const size = design.pbMarker.symbolSizePx;
			const y = model.pbMarker.y2 + size * 0.68;
			ctx.beginPath();
			ctx.moveTo(model.pbMarker.x, y - size / 2);
			ctx.lineTo(model.pbMarker.x + size / 2, y);
			ctx.lineTo(model.pbMarker.x, y + size / 2);
			ctx.lineTo(model.pbMarker.x - size / 2, y);
			ctx.closePath();
			ctx.fill();
			ctx.restore();
		}

		if (model.speedLine.length > 0) {
			const lineGradient = ctx.createLinearGradient(model.plotRect.x, 0, model.plotRect.x + model.plotRect.width, 0);
			lineGradient.addColorStop(0, design.line.from);
			lineGradient.addColorStop(1, design.line.to);
			ctx.strokeStyle = lineGradient;
			ctx.lineWidth = design.line.widthPx;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
			drawSteppedCanvasPath(ctx, model.speedLine);
			ctx.stroke();
		}

		if (model.currentPoint) {
			ctx.fillStyle = design.currentPoint.color;
			ctx.beginPath();
			ctx.arc(model.currentPoint.x, model.currentPoint.y, design.currentPoint.radiusPx, 0, Math.PI * 2);
			ctx.fill();
		}

		ctx.fillStyle = design.axisText.color;
		ctx.font = `${design.axisText.weight} ${design.axisText.sizePx}px ${design.axisText.family}`;
		ctx.textBaseline = 'middle';
		for (const label of model.xLabels) {
			ctx.textAlign = label.align;
			ctx.fillText(label.text, label.x, label.y);
		}
		for (const label of model.yLabels) {
			ctx.textAlign = label.align;
			ctx.fillText(label.text, label.x, label.y);
		}
		ctx.save();
		ctx.translate(model.yAxisLabel.x, model.yAxisLabel.y);
		ctx.rotate(-Math.PI / 2);
		ctx.textAlign = 'center';
		ctx.fillText(model.yAxisLabel.text, 0, 0);
		ctx.restore();
		ctx.restore();
	}

	function drawSteppedCanvasPath(ctx: CanvasRenderingContext2D, points: readonly { x: number; y: number }[]): void {
		ctx.beginPath();
		if (points.length === 0) return;
		ctx.moveTo(points[0].x, points[0].y);
		if (points.length === 1) return;
		for (let i = 0; i < points.length - 1; i += 1) {
			const current = points[i];
			const next = points[i + 1];
			ctx.lineTo(next.x, current.y);
			ctx.lineTo(next.x, next.y);
		}
	}

	async function loadOverlayCanvasFonts(widthPx: number, mode: HudRenderMode): Promise<void> {
		if (typeof document === 'undefined' || !document.fonts) return;
		await Promise.all(
			[
				...(showOverlay ? hudFontLoadDescriptors(widthPx, mode) : []),
				...(showSpeedPlot ? speedPlotCanvasFonts(widthPx) : [])
			].map((font) => document.fonts.load(font))
		);
		await document.fonts.ready;
	}

	function applyCanvasText(ctx: CanvasRenderingContext2D, style: HudTextStyle): void {
		ctx.fillStyle = style.opacity === 1 ? style.color : colorWithOpacity(style.color, style.opacity);
		ctx.font = canvasFont(style);
	}

	function colorWithOpacity(color: string, opacity: number): string {
		if (color.startsWith('#') && color.length === 7) {
			const red = parseInt(color.slice(1, 3), 16);
			const green = parseInt(color.slice(3, 5), 16);
			const blue = parseInt(color.slice(5, 7), 16);
			return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
		}
		return color;
	}

	function roundRect(
		ctx: CanvasRenderingContext2D,
		x: number,
		y: number,
		w: number,
		h: number,
		r: number
	): void {
		const radius = Math.min(r, w / 2, h / 2);
		ctx.beginPath();
		ctx.moveTo(x + radius, y);
		ctx.arcTo(x + w, y, x + w, y + h, radius);
		ctx.arcTo(x + w, y + h, x, y + h, radius);
		ctx.arcTo(x, y + h, x, y, radius);
		ctx.arcTo(x, y, x + w, y, radius);
		ctx.closePath();
	}

	async function downloadToPhotos(): Promise<void> {
		if (downloading) return;
		if (!showAnyOverlay) {
			await downloadOriginalVideo();
			return;
		}
		downloading = true;
		downloadError = null;
		exportProgress = 0;
		try {
			const nav = navigator as Navigator & {
				canShare?: (data: { files: File[] }) => boolean;
				share?: (data: { files: File[]; title?: string; text?: string }) => Promise<void>;
			};

			if (preparedShareFile) {
				if (typeof nav.share !== 'function' || !nav.canShare?.({ files: [preparedShareFile] })) {
					throw new Error('This browser cannot share the prepared video file to Photos.');
				}
				await nav.share({
					files: [preparedShareFile],
					title: 'Dive video',
					text: `${liveVideo.discipline} dive`
				});
				preparedShareFile = null;
				return;
			}

			exportDiagnostic = null;
			if (liveVideo.sizeBytes > MAX_BROWSER_OVERLAY_EXPORT_BYTES) {
				downloadError = `This clip is ${formatBytes(liveVideo.sizeBytes)}, which is too large for reliable in-browser overlay export. Use Download original for now.`;
				return;
			}

			const baked = await renderWithOverlay();
			let blob: Blob = baked.blob;
			let mime: string = baked.mime;
			exportDiagnostic = `Overlay export requested ${formatMbps(
				baked.requestedVideoBitrateBps
			)}, actual ${formatMbps(
				liveVideo.durationSeconds > 0 ? Math.round((blob.size * 8) / liveVideo.durationSeconds) : undefined
			)}. ${baked.audioPreserved ? 'Audio preserved.' : 'Audio unavailable in browser export.'} ${
				baked.manualFrameRequest ? 'Manual frame pacing.' : 'Fixed-rate canvas pacing.'
			}${baked.reliableMode ? ' Reliable iOS export mode.' : ''}${
				baked.retried ? ' Retried with compatible export mode.' : ''
			}`;

			// Trust the bytes, not the metadata. iOS only exposes "Save Video"
			// (→ Photos) in the share sheet when the File.type matches the real
			// container (video/mp4 with .mp4 extension). Mismatches force the
			// user down the "Save to Files" path.
			const sniffed = await sniffVideoContainer(blob);
			if (sniffed.mime) {
				mime = sniffed.mime;
			} else if (!/mp4|webm/.test(mime)) {
				// Unknown container — best effort fallback.
				mime = 'application/octet-stream';
			}

			// Re-wrap the blob so its .type matches what we're advertising.
			if (blob.type !== mime) {
				blob = new Blob([blob], { type: mime });
			}

			const fileName = suggestedFileName(mime, showAnyOverlay);
			const file = new File([blob], fileName, { type: mime });

			// If we're on iOS and the container isn't mp4, iOS Photos can't
			// accept the file — surface a clear message so the user knows why
			// only "Save to Files" appears in the share sheet.
			const iosSaveToPhotosBlocked = isIOS() && mime !== 'video/mp4';

			if (
				typeof nav.share === 'function' &&
				typeof nav.canShare === 'function' &&
				nav.canShare({ files: [file] })
			) {
				try {
					await nav.share({
						files: [file],
						title: 'Dive video',
						text: `${liveVideo.discipline} dive`
					});
					if (iosSaveToPhotosBlocked) {
						downloadError =
							'iOS Photos only accepts .mp4 — this clip is .webm, so only "Save to Files" is available. Re-record with overlay on to get an .mp4.';
					}
					return;
				} catch (err) {
					// iOS Safari throws NotAllowedError when the original user
					// gesture has expired during the bake. Fall through to the
					// anchor-download path instead of surfacing a scary error.
					const msg = err instanceof Error ? err.message : String(err);
					const name = (err as { name?: string } | null)?.name ?? '';
					if (/abort/i.test(msg) || name === 'AbortError') return;
					if (name !== 'NotAllowedError' && !/not allowed/i.test(msg)) {
						throw err;
					}
					preparedShareFile = file;
					downloadError =
						'Export is ready. Tap Share prepared video to open the iOS share sheet.';
					return;
				}
			}

			if (isIOS() && typeof nav.share === 'function' && !nav.canShare?.({ files: [file] })) {
				downloadError = iosSaveToPhotosBlocked
					? 'iOS Photos needs a real .mp4 video. This browser produced a non-MP4 export, so only Save to Files is available.'
					: 'iOS could not accept this video through the share sheet, so it will fall back to Files.';
			}

			// Fallback: anchor download.
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = fileName;
			document.body.appendChild(a);
			a.click();
			a.remove();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			// User-cancelled shares throw AbortError — don't surface those as errors.
			if (!/abort/i.test(msg)) downloadError = msg;
		} finally {
			downloading = false;
			exportProgress = 0;
		}
	}

	async function requestServerOverlay(): Promise<void> {
		if (requestingServerOverlay) return;
		if (!canDownloadVideo) return;
		requestingServerOverlay = true;
		downloadError = null;
		try {
			await requestDiveVideoOverlayDownload(liveVideo.id);
			exportDiagnostic = 'Server overlay export queued. The download button will update when it is ready.';
		} catch (err) {
			downloadError = err instanceof Error ? err.message : String(err);
		} finally {
			requestingServerOverlay = false;
		}
	}

	async function downloadServerOverlay(): Promise<void> {
		if (downloading || requestingServerOverlay) return;
		if (!canDownloadVideo) return;
		if (preparedServerOverlayFile) {
			const shared = await sharePreparedVideo(
				preparedServerOverlayFile,
				'This browser cannot share the prepared overlay video file.'
			);
			if (shared) preparedServerOverlayFile = null;
			return;
		}

		if (effectiveOverlayDownloadStatus === 'queued') {
			exportDiagnostic = 'Overlay video is processing in the background.';
			return;
		}
		if (
			effectiveOverlayDownloadStatus === 'retryable' ||
			effectiveOverlayDownloadStatus === 'not-requested' ||
			effectiveOverlayDownloadStatus === 'processing'
		) {
			await requestServerOverlay();
			return;
		}

		downloading = true;
		downloadError = null;
		try {
			const fileName = `overdive-overlay-${liveVideo.discipline}-${liveVideo.id}.mp4`;
			const url = await getDiveVideoBurnedDownloadUrl(liveVideo);
			await shareOrDownloadVideoUrl({
				url,
				fileName,
				mime: 'video/mp4',
				fallbackError: 'Overlay export is ready. Tap Download to open the share sheet.',
				preparedKind: 'server-overlay'
			});
		} catch (err) {
			downloadError = err instanceof Error ? err.message : String(err);
		} finally {
			downloading = false;
		}
	}

	async function downloadCurrentVideo(): Promise<void> {
		if (requiresBrowserOverlayExport) {
			await downloadToPhotos();
			return;
		}
		if (showOverlay) {
			await downloadServerOverlay();
			return;
		}
		await downloadOriginalVideo();
	}
</script>

<div
	bind:this={containerEl}
	bind:clientWidth={containerWidth}
	class="relative w-full overflow-hidden rounded-2xl bg-black shadow-lg"
	class:dive-video-feed-player={feedFrame}
	class:feed-frame={feedFrame && !isFullscreen}
	style="position: relative; --dive-video-fit: {fitMode}; --dive-video-display-ratio: {displayAspectRatioNumber}; --dive-video-display-aspect: {displayTransform.aspectRatio}; aspect-ratio: {displayTransform.aspectRatio};"
	data-fullscreen-root
	data-display-orientation={displayTransform.hudMode}
	onpointermove={onFullscreenPointerMove}
	onpointerdown={onFullscreenPointerDown}
	onpointerup={clearPortraitSwipe}
	onpointercancel={clearPortraitSwipe}
>
	<!-- svelte-ignore a11y_media_has_caption -->
	<video
		bind:this={videoEl}
		src={srcUrl}
		poster={posterUrl}
		class="h-full w-full"
		style="object-fit: {isFullscreen ? 'var(--dive-video-fit, cover)' : 'contain'}; transform: {displayTransform.transform}; transform-origin: center;"
		controls={nativeControlsVisible}
		preload="metadata"
		muted={inlineMuted}
		playsinline
		onclick={onInlineVideoClick}
		ontimeupdate={onTimeUpdate}
		onplay={onPlayStateChange}
		onpause={onPlayStateChange}
		onended={onPlayStateChange}
		onloadedmetadata={() => videoEl && scheduleRvfc(videoEl as VideoWithRvfc)}
		use:diveVideoBehavior={{
			allowAutoFullscreen: autoFullscreenEnabled,
			allowPortraitPlayFullscreen: portraitFullscreenAllowed,
			requestFullscreenOnPlay: fullscreenOnPlay
		}}
	></video>

	{#if customInlineControls && !isFullscreen && !isPlaying}
		<button
			type="button"
			class="inline-play-button"
			aria-label="Play dive video"
			onclick={tapToFullscreen ? requestInlineFullscreen : togglePlay}
		>
			<span aria-hidden="true">▶</span>
		</button>
	{/if}

	{#if showOverlay}
		<MetricHudSvg frame={metricHudFrame} />
	{/if}

	{#if showSpeedPlot}
		<SpeedPlotHudSvg model={speedPlotModel} style={speedPlotStyle} />
	{/if}

	{#if isFullscreen}
		<button
			type="button"
			class="fs-close-top"
			aria-label="Close video player"
			onclick={exitFullscreen}
		>
			✕
		</button>

		<!--
		  Custom landscape control bar. Replaces the native <video> controls
		  (hidden above) so they don't visually fight the HUD. Positioned at
		  the bottom with safe-area padding.
		-->
		<div
			class="fs-controls"
			class:fs-controls-visible={fullscreenControlsVisible}
			style="--scrub-progress-percent: {scrubProgress * 100}%;"
		>
			<div class="fs-scrubber" class:fs-scrubber-active={isScrubbing}>
				<div
					class="fs-scrub-badge"
					style="left: calc({scrubProgress * 100}%);"
				>
					{formatDistanceLabel(scrubDistance)}
				</div>
				<input
					class="fs-scrub-input"
					type="range"
					min="0"
					max="1000"
					step="1"
					value={Math.round(scrubProgress * 1000)}
					aria-label="Scrub dive video by distance"
					onpointerdown={beginScrub}
					onpointerup={endScrub}
					onpointercancel={endScrub}
					onblur={endScrub}
					oninput={onScrubInput}
				/>
				<div class="fs-scrub-labels">
					<span>0m</span>
					<span>{formatDistanceLabel(totalDistance)}</span>
				</div>
			</div>

			<div class="fs-button-row">
				<button
					type="button"
					class="fs-btn"
					aria-label={isPlaying ? 'Pause' : 'Play'}
					onclick={togglePlay}
				>
					{isPlaying ? '❚❚' : '▶'}
				</button>
				<button
					type="button"
					class="fs-btn"
					aria-label={fitMode === 'cover' ? 'Switch to fit (letterbox)' : 'Switch to fill'}
					aria-pressed={fitMode === 'cover'}
					onclick={toggleFit}
					title={fitMode === 'cover' ? 'Fill' : 'Fit'}
				>
					{fitMode === 'cover' ? '▣' : '▢'}
				</button>
				<button
					type="button"
					class="fs-btn"
					aria-label="Change HUD overlay"
					aria-pressed={showAnyOverlay}
					onclick={cycleHudPreset}
				>
					{hudPresetLabel()}
				</button>
				{#if fullscreenMode !== 'portrait'}
					<button
						type="button"
						class="fs-btn fs-btn-exit"
						aria-label="Exit fullscreen"
						onclick={exitFullscreen}
					>
						✕
					</button>
				{/if}
			</div>
		</div>
	{/if}

</div>

{#if showBelowActions}
	<!-- Overlay toggle — standalone pill button directly below the video. -->
	<div class="player-actions" class:player-actions-compact={inlineActions}>
		<button
			type="button"
			class="pill pill-toggle"
			class:pill-active={showAnyOverlay}
			onclick={cycleHudPreset}
			disabled={downloading}
			aria-pressed={showAnyOverlay}
		>
			<span class="pill-dot" class:pill-dot-active={showAnyOverlay}></span>
			<span>{hudPresetLabel()}</span>
		</button>

		{#if canDownloadVideo}
			<button
				type="button"
				class="pill pill-primary"
				onclick={downloadCurrentVideo}
				disabled={downloading || requestingServerOverlay || (showOverlay && !requiresBrowserOverlayExport && effectiveOverlayDownloadStatus === 'queued')}
			>
				{#if downloading}
					<span class="pill-spinner" aria-hidden="true"></span>
					<span>Preparing…</span>
				{:else if showOverlay && !requiresBrowserOverlayExport && requestingServerOverlay}
					<span class="pill-spinner" aria-hidden="true"></span>
					<span>Queueing...</span>
				{:else if showOverlay && !requiresBrowserOverlayExport && effectiveOverlayDownloadStatus === 'queued'}
					<span class="pill-spinner" aria-hidden="true"></span>
					<span>Overlay processing...</span>
				{:else if showOverlay && !requiresBrowserOverlayExport && (effectiveOverlayDownloadStatus === 'not-requested' || effectiveOverlayDownloadStatus === 'retryable' || effectiveOverlayDownloadStatus === 'processing')}
					<span aria-hidden="true">⬇︎</span>
					<span>Download</span>
				{:else}
					<span aria-hidden="true">⬇︎</span>
					<span>Download</span>
				{/if}
			</button>
		{/if}

		{#if canEditWaypoints && !inlineActions}
			<button
				type="button"
				class="pill pill-secondary"
				onclick={() => goto(`/dive/video/${liveVideo.id}/waypoints`)}
				disabled={downloading || requestingServerOverlay}
			>
				<span>Edit waypoints</span>
			</button>
		{/if}

		{#if downloadError}
			<p class="download-error">{downloadError}</p>
		{/if}
		{#if exportDiagnostic && !downloadError}
			<p class="export-diagnostic">{exportDiagnostic}</p>
		{/if}
	</div>
{/if}

<style>
	.feed-frame {
		position: relative;
		width: 100%;
		height: auto;
		border-radius: 8px;
		box-shadow: none;
	}
	.feed-frame video {
		height: 100%;
		object-fit: contain;
	}
	@media (hover: hover) and (pointer: fine) {
		:global(.dive-video-pseudo-fullscreen.dive-video-feed-player) {
			left: 50% !important;
			top: 50% !important;
			right: auto !important;
			bottom: auto !important;
			width: min(470px, calc(100vw - 2rem), calc((100dvh - 2rem) * var(--dive-video-display-ratio))) !important;
			height: auto !important;
			aspect-ratio: var(--dive-video-display-aspect) !important;
			transform: translate(-50%, -50%) !important;
			border-radius: 8px !important;
		}
		:global(.dive-video-pseudo-fullscreen.dive-video-feed-player video) {
			height: 100% !important;
			object-fit: contain !important;
		}
	}
	.fs-close-top {
		position: absolute;
		right: max(0.75rem, env(safe-area-inset-right));
		top: max(0.75rem, env(safe-area-inset-top));
		z-index: 13;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border: 1px solid rgba(255, 255, 255, 0.22);
		border-radius: 9999px;
		background: rgba(15, 23, 42, 0.72);
		color: #f8fafc;
		font: inherit;
		font-size: 0.95rem;
		line-height: 1;
		cursor: pointer;
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
	}
	.inline-play-button {
		position: absolute;
		left: 50%;
		top: 50%;
		z-index: 12;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 4rem;
		height: 4rem;
		transform: translate(-50%, -50%);
		border: 1px solid rgba(255, 255, 255, 0.28);
		border-radius: 9999px;
		background: rgba(15, 23, 42, 0.72);
		color: #f8fafc;
		font: inherit;
		font-size: 1.6rem;
		line-height: 1;
		cursor: pointer;
		box-shadow: 0 18px 40px rgba(0, 0, 0, 0.34);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		-webkit-tap-highlight-color: transparent;
	}
	.inline-play-button span {
		transform: translateX(0.08em);
	}
	.inline-play-button:active {
		transform: translate(-50%, -50%) scale(0.96);
	}

	/*
	 * Landscape fullscreen control bar. Only rendered while in pseudo-
	 * fullscreen (see isFullscreen in the script). Anchored to the bottom
	 * with safe-area padding so it clears the iPhone home-indicator.
	 */
	.fs-controls {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 11;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		gap: 0.7rem;
		padding:
			2.2rem
			max(0.75rem, env(safe-area-inset-right))
			max(0.75rem, env(safe-area-inset-bottom))
			max(0.75rem, env(safe-area-inset-left));
		background: linear-gradient(
			to top,
			rgba(0, 0, 0, 0.72) 0%,
			rgba(0, 0, 0, 0.42) 58%,
			rgba(0, 0, 0, 0) 100%
		);
		opacity: 0;
		pointer-events: none;
		transform: translateY(12px);
		transition:
			opacity 0.18s ease,
			transform 0.18s ease;
	}
	.fs-controls-visible {
		opacity: 1;
		pointer-events: auto;
		transform: translateY(0);
	}
	.fs-button-row {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 0.6rem;
		width: min(100%, 34rem);
	}
	.fs-scrubber {
		position: relative;
		width: min(100%, 34rem);
		padding-top: 1.35rem;
	}
	.fs-scrub-input {
		--track-height: 6px;
		width: 100%;
		height: 32px;
		margin: 0;
		appearance: none;
		-webkit-appearance: none;
		background: transparent;
		cursor: pointer;
		touch-action: none;
	}
	.fs-scrub-input::-webkit-slider-runnable-track {
		height: var(--track-height);
		border-radius: 9999px;
		background: linear-gradient(
			to right,
			var(--color-primary) 0%,
			var(--color-primary) var(--scrub-progress-percent),
			rgba(226, 232, 240, 0.34) var(--scrub-progress-percent),
			rgba(226, 232, 240, 0.34) 100%
		);
	}
	.fs-scrub-input::-moz-range-track {
		height: var(--track-height);
		border-radius: 9999px;
		background: rgba(226, 232, 240, 0.34);
	}
	.fs-scrub-input::-moz-range-progress {
		height: var(--track-height);
		border-radius: 9999px;
		background: var(--color-primary);
	}
	.fs-scrub-input::-webkit-slider-thumb {
		appearance: none;
		-webkit-appearance: none;
		width: 22px;
		height: 22px;
		margin-top: -8px;
		border-radius: 9999px;
		border: 3px solid #0f172a;
		background: var(--color-primary);
		box-shadow: 0 0 0 3px rgba(248, 250, 252, 0.22);
	}
	.fs-scrub-input::-moz-range-thumb {
		width: 22px;
		height: 22px;
		border-radius: 9999px;
		border: 3px solid #0f172a;
		background: var(--color-primary);
		box-shadow: 0 0 0 3px rgba(248, 250, 252, 0.22);
	}
	.fs-scrub-badge {
		position: absolute;
		top: 0;
		transform: translateX(-50%);
		padding: 0.28rem 0.48rem;
		border-radius: 9999px;
		background: rgba(15, 23, 42, 0.86);
		border: 1px solid rgba(255, 255, 255, 0.18);
		color: #f8fafc;
		font-size: 0.76rem;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		white-space: nowrap;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
		opacity: 0;
		transition: opacity 0.15s ease;
	}
	.fs-scrubber-active .fs-scrub-badge,
	.fs-scrubber:focus-within .fs-scrub-badge {
		opacity: 1;
	}
	.fs-scrub-labels {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: -0.15rem;
		color: rgba(241, 245, 249, 0.78);
		font-size: 0.74rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.fs-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 44px;
		min-height: 44px;
		padding: 0.5rem 0.85rem;
		border-radius: 9999px;
		border: 1px solid rgba(255, 255, 255, 0.22);
		background: rgba(15, 23, 42, 0.55);
		color: #f1f5f9;
		font-size: 1rem;
		font-weight: 700;
		line-height: 1;
		cursor: pointer;
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		-webkit-tap-highlight-color: transparent;
		transition:
			background-color 0.15s ease,
			transform 0.06s ease;
	}
	.fs-btn:hover {
		background: rgba(30, 41, 59, 0.7);
	}
	.fs-btn:active {
		transform: scale(0.95);
	}
	.fs-btn[aria-pressed='true'] {
		background: var(--color-primary);
		color: #0f172a;
		border-color: var(--color-primary);
	}
	.fs-btn-exit {
		margin-left: auto;
		background: rgba(15, 23, 42, 0.75);
	}

	/*
	 * When the wrapping container is placed into fullscreen (via the
	 * Fullscreen API), the browser removes our Tailwind aspect-video/rounded
	 * constraints via the :fullscreen pseudo-class. We re-assert sensible
	 * fullscreen sizing so the HUD overlay keeps its absolute positioning
	 * relative to a full-viewport container and the <video> fills it.
	 */
	[data-fullscreen-root]:fullscreen {
		width: 100vw;
		height: 100vh;
		border-radius: 0;
		aspect-ratio: auto;
		background: black;
	}
	[data-fullscreen-root]:fullscreen video {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	/* Safari still prefixes the pseudo-class on some versions. */
	[data-fullscreen-root]:-webkit-full-screen {
		width: 100vw;
		height: 100vh;
		border-radius: 0;
		aspect-ratio: auto;
		background: black;
	}
	[data-fullscreen-root]:-webkit-full-screen video {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	/*
	 * Landscape phones: the inline player (feed card + session detail modal)
	 * uses aspect-video + w-full, which at 100vw × 9/16 easily overflows the
	 * short landscape viewport and looks "way oversized". Cap the container
	 * to the available viewport height and drop the fixed aspect-ratio so the
	 * <video>'s own object-contain handles letterboxing. Scoped to phone-like
	 * viewports (max-height: 600px) so desktop landscape is unaffected.
	 */
	@media (orientation: landscape) and (max-height: 600px) {
		[data-fullscreen-root]:not(:fullscreen):not(:-webkit-full-screen) {
			aspect-ratio: auto;
			height: calc(100dvh - 1rem);
			max-height: calc(100dvh - 1rem);
		}
	}

	/*
	 * Pill-styled action buttons beneath the video (Hide/Show overlay,
	 * download/export actions). Plain CSS so they render correctly regardless of
	 * whether Tailwind utilities are compiled for this file.
	 */
	.player-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		justify-content: center;
		align-items: center;
		margin-top: 0.9rem;
	}
	.player-actions-compact {
		margin-top: 0;
		margin-bottom: 0.55rem;
		padding: 0.55rem 0;
		justify-content: flex-end;
	}
	.player-actions-compact .pill {
		min-height: 36px;
		padding: 0.56rem 0.82rem;
		font-size: 0.78rem;
	}
	.player-actions-compact .download-error,
	.player-actions-compact .export-diagnostic {
		flex-basis: 100%;
		margin: 0;
		padding: 0 0.15rem;
		text-align: right;
	}
	.pill {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		font: inherit;
		font-size: 0.9rem;
		font-weight: 600;
		line-height: 1;
		padding: 0.65rem 1.1rem;
		min-height: 40px;
		border-radius: 9999px;
		border: 1px solid transparent;
		cursor: pointer;
		transition:
			transform 0.06s ease,
			background-color 0.15s ease,
			border-color 0.15s ease,
			filter 0.12s ease;
		-webkit-tap-highlight-color: transparent;
	}
	.pill:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.pill:active:not(:disabled) {
		transform: scale(0.97);
	}
	.pill-toggle {
		background: rgba(30, 41, 59, 0.85);
		border-color: rgba(148, 163, 184, 0.2);
		color: var(--color-text);
	}
	.pill-toggle:hover:not(:disabled) {
		background: rgba(51, 65, 85, 0.9);
	}
	.pill-secondary {
		background: rgba(30, 41, 59, 0.85);
		border-color: rgba(148, 163, 184, 0.2);
		color: var(--color-text);
	}
	.pill-secondary:hover:not(:disabled) {
		background: rgba(51, 65, 85, 0.9);
	}
	.pill-toggle.pill-active {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: #0f172a;
	}
	.pill-toggle.pill-active:hover:not(:disabled) {
		filter: brightness(1.05);
	}
	.pill-dot {
		display: inline-block;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 9999px;
		background: #94a3b8; /* slate-400 */
	}
	.pill-dot.pill-dot-active {
		background: #0f172a; /* slate-900 */
	}
	.pill-primary {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: #0f172a;
		font-weight: 700;
		padding: 0.75rem 1.25rem;
	}
	.pill-primary:hover:not(:disabled) {
		filter: brightness(1.05);
	}
	.pill-spinner {
		display: inline-block;
		width: 0.9rem;
		height: 0.9rem;
		border-radius: 9999px;
		border: 2px solid rgba(15, 23, 42, 0.25);
		border-top-color: #0f172a;
		animation: pill-spin 0.7s linear infinite;
	}
	@keyframes pill-spin {
		to {
			transform: rotate(360deg);
		}
	}
	.download-error {
		flex-basis: 100%;
		text-align: center;
		margin: 0;
		padding: 0.5rem 0.75rem;
		border-radius: 10px;
		background: rgba(239, 68, 68, 0.15);
		color: #fecaca;
		font-size: 0.8rem;
	}
	.export-diagnostic {
		flex-basis: 100%;
		text-align: center;
		margin: 0;
		color: var(--color-text-muted);
		font-size: 0.75rem;
	}
</style>
