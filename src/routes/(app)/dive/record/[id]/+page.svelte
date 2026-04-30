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
	import { buildDiveVideoFormData, listDiveVideosForSession } from '$lib/services/diveVideos';
	import { AUTO_REAR_CAMERA } from '$lib/capture/cameraDevices';
	import { canWriteToIndexedDB, enqueueUpload } from '$lib/capture/uploadQueue';
	import { drainUploadQueue } from '$lib/capture/uploadProcessor';
	import { logUploadDiagnostic } from '$lib/capture/uploadDiagnostics';
	import { summariseTimeline, totalDistanceM } from '$lib/capture/timeline';
	import { defaultSpeedMs } from '$lib/capture/disciplineSpeeds';
	import { getUserSettings, updateUserSettings } from '$lib/firestore';
	import { diveRecording } from '$lib/stores/videoPlayback';
	import type {
		CameraFacing,
		CameraPreference,
		DiveTimeline,
		DiveVideoDiscipline,
		DiveVideoDisplayOrientation,
		DiveVideoCapturePosture,
		DiveVideoResolution,
		DiveVideoRotation
	} from '$lib/types';

	const sessionId = $derived($page.params.id ?? '');

	interface CaptureResult {
		blob: Blob;
		mimeType: string;
		sizeBytes: number;
		widthPx: number;
		heightPx: number;
		durationSeconds: number;
		deviceLabel?: string;
		cameraDeviceId?: string;
		cameraPreference: CameraPreference;
		cameraFacing?: CameraFacing;
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
	let discipline = $state<DiveVideoDiscipline>('DYN');
	let resolution = $state<DiveVideoResolution>('720p');
	let cameraPreference = $state<CameraPreference>(AUTO_REAR_CAMERA);
	let resolutionLoaded = $state(false);
	/**
	 * Quick-start state.
	 * - `hasQuickStart` = we loaded saved defaults and can offer a one-tap path.
	 * - `quickStartExpanded` = user tapped "Change settings" to reveal the form.
	 * - `sessionLocked` = a prior DiveVideo on this sessionId already set pool/discipline.
	 */
	let hasQuickStart = $state(false);
	let quickStartExpanded = $state(false);
	let sessionLocked = $state(false);
	let pinned = $state(false);
	let athleteId = $state<string | undefined>(undefined);

	let capture = $state<CaptureResult | null>(null);
	let saveError = $state<string | null>(null);
	let uploadProgress = $state(0);
	let storageHealthy = $state<boolean | null>(null);

	const waypointSpacing = $derived(
		poolLength && waypointsPerLap ? poolLength / waypointsPerLap : 0
	);

	function formatMeters(m: number): string {
		return Number.isInteger(m) ? `${m}` : m.toFixed(1);
	}

	$effect(() => {
		const uid = $user?.uid;
		if (!uid || resolutionLoaded) return;
		resolutionLoaded = true;

		// Load user-level defaults (resolution + last-used recorder setup).
		getUserSettings(uid)
			.then((settings) => {
				if (settings?.defaultVideoResolution) {
					resolution = settings.defaultVideoResolution;
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
				if (settings?.defaultDiscipline) {
					discipline = settings.defaultDiscipline;
					gotAnyDefault = true;
				}
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

	async function save(): Promise<void> {
		if (!capture) return;
		const uid = $user?.uid;
		if (!uid) {
			saveError = 'You must be signed in.';
			return;
		}
		stage = 'saving';
		saveError = null;
		uploadProgress = 0;
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
				discipline,
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

			// Drive the upload to completion here so the user gets real
			// progress + clear error surfacing. The queue is still durable
			// across app reloads (see `installOnlineDrainer`), but keeping the
			// user on this screen while the blob uploads avoids the "stuck at
			// Uploading…" experience on the session page.
			const result = await drainUploadQueue(
				(p) => {
					if (p.localId === pending.localId) uploadProgress = p.fraction;
				},
				{ localIds: [pending.localId] }
			);

			// We just enqueued exactly one item, so `uploaded === 0` means our
			// item didn't make it to Storage — either it failed (counted in
			// `failed`), was skipped (past MAX_ATTEMPTS), or the queue was
			// silently empty when drain ran. All three are user-visible failures.
			if (result.uploaded === 0) {
				const detail =
					result.errors[0] ??
					(result.skipped > 0
						? 'queue items past retry limit — go to Profile › Pending video uploads to retry'
						: 'upload did not run (browser storage may have rejected the queue write)');
				logUploadDiagnostic({
					level: 'error',
					step: 'record-save:failed',
					message: 'Record page upload did not complete',
					localId: pending.localId,
					details: result
				});
				throw new Error(
					`Upload failed: ${detail}. The dive is saved locally and will retry when you reopen the app.`
				);
			}
			logUploadDiagnostic({
				level: 'info',
				step: 'record-save:uploaded',
				message: 'Record page upload completed',
				localId: pending.localId,
				details: result
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
					defaultSpeedMs(discipline)
				);
				try {
					sessionStorage.setItem(
						`dive-log-seed:${sessionId}`,
						JSON.stringify({
							discipline,
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
					defaultDiscipline: discipline
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
					{#if hasQuickStart && !quickStartExpanded}
						Ready to go with your last setup.
					{:else}
						Dial in pool length and waypoints, then start the camera.
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

			{#if hasQuickStart && !quickStartExpanded && poolLength && waypointsPerLap}
				<!-- Phase 1/2: one-tap quick-start. Big button uses saved defaults
				     (or session-locked pool/discipline) and skips the form. -->
				<section class="quick-start">
					<button
						class="btn btn-primary btn-quick"
						onclick={() => (stage = 'record')}
					>
						<span class="quick-eyebrow">Start recording</span>
						<span class="quick-summary">
							{formatMeters(poolLength)} m pool · {waypointsPerLap}
							waypoint{waypointsPerLap === 1 ? '' : 's'} · {discipline}
						</span>
					</button>
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

				<div class="actions">
					<button class="btn btn-secondary" onclick={() => history.back()}>
						Cancel
					</button>
				</div>
			{:else}
				<section class="card">
					<div class="field">
						<span class="field-label">Discipline</span>
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
									onclick={() => (discipline = opt.value as typeof discipline)}
								>
									<span class="seg-label">{opt.label}</span>
									<span class="seg-sub">{opt.sub}</span>
								</button>
							{/each}
						</div>
						<p class="field-hint">
							Sets the initial dive speed before your first waypoint
							(DYN 1.1 · DYNB 1.0 · DNF 0.8 m/s).
						</p>
					</div>

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

				<div class="actions">
					<button class="btn btn-secondary" onclick={() => history.back()}>
						Cancel
					</button>
					<button
						class="btn btn-primary"
						disabled={!poolLength || !waypointsPerLap}
						onclick={() => (stage = 'record')}
					>
						Next →
					</button>
				</div>
			{/if}
		</div>
	</div>
{:else if stage === 'record'}
	<DiveRecorder
		poolLength={poolLength ?? 25}
		waypointsPerLap={waypointsPerLap ?? 2}
		{resolution}
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

			{#if capture}
				<div class="stats-card">
					<div><span>Duration</span><strong>{capture.durationSeconds.toFixed(1)} s</strong></div>
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
					<div><span>Size</span><strong>{(capture.sizeBytes / (1024 * 1024)).toFixed(1)} MB</strong></div>
				</div>
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
					{stage === 'saving'
						? `Saving… ${Math.round(uploadProgress * 100)}%`
						: 'Save dive'}
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

	.review-title {
		font-size: 1.4rem;
		font-weight: 700;
		margin: 0 0 1rem;
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

	/* ──────────────── Quick-start (one-tap) ──────────────── */
	.quick-start {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.85rem;
		margin-bottom: 1.25rem;
	}
	.btn-quick {
		flex: 0 0 auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		padding: 1.25rem 1rem;
		font-size: 1.05rem;
	}
	.quick-eyebrow {
		font-size: 1.1rem;
		font-weight: 700;
	}
	.quick-summary {
		font-size: 0.85rem;
		font-weight: 500;
		opacity: 0.85;
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
