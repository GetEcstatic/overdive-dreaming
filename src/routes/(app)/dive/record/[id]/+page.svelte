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
	import { user } from '$lib/stores/auth';
	import DiveRecorder from '$lib/components/DiveRecorder.svelte';
	import AthletePicker from '$lib/components/AthletePicker.svelte';
	import NumberWheelInput from '$lib/components/NumberWheelInput.svelte';
	import { buildDiveVideoFormData } from '$lib/services/diveVideos';
	import { enqueueUpload } from '$lib/capture/uploadQueue';
	import { drainUploadQueue } from '$lib/capture/uploadProcessor';
	import { getUserSettings } from '$lib/firestore';
	import type { DiveTimeline, DiveVideoDiscipline, DiveVideoResolution } from '$lib/types';

	const sessionId = $derived($page.params.id ?? '');

	interface CaptureResult {
		blob: Blob;
		mimeType: string;
		sizeBytes: number;
		widthPx: number;
		heightPx: number;
		durationSeconds: number;
		deviceLabel?: string;
		timeline: DiveTimeline;
	}

	type Stage = 'setup' | 'record' | 'review' | 'saving' | 'done';
	let stage = $state<Stage>('setup');

	let poolLength = $state<number | undefined>(25);
	let waypointsPerLap = $state<number | undefined>(2);
	let discipline = $state<DiveVideoDiscipline>('DYN');
	let resolution = $state<DiveVideoResolution>('720p');
	let resolutionLoaded = $state(false);
	let pinned = $state(false);
	let athleteId = $state<string | undefined>(undefined);

	let capture = $state<CaptureResult | null>(null);
	let saveError = $state<string | null>(null);
	let uploadProgress = $state(0);

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
		getUserSettings(uid)
			.then((settings) => {
				if (settings?.defaultVideoResolution) {
					resolution = settings.defaultVideoResolution;
				}
			})
			.catch((err) => {
				// eslint-disable-next-line no-console
				console.warn('[dive-record] could not load resolution preference', err);
			});
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
		try {
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
				deviceLabel: capture.deviceLabel
			});
			if (pinned) metadata.retentionTier = 'pinned';
			await enqueueUpload(capture.blob, metadata);

			drainUploadQueue((p) => {
				uploadProgress = p.fraction;
			}).catch((err) => {
				// eslint-disable-next-line no-console
				console.warn('[dive-record] drain failed', err);
			});

			stage = 'done';
			await goto(`/session/${sessionId}`);
		} catch (err) {
			saveError = err instanceof Error ? err.message : String(err);
			stage = 'review';
		}
	}

	function discard(): void {
		capture = null;
		stage = 'record';
	}
</script>

<svelte:head>
	<title>Record dive</title>
</svelte:head>

{#if stage === 'setup'}
	<div class="setup-screen">
		<div class="setup-inner">
			<header class="setup-head">
				<h1>Record dive</h1>
				<p>Dial in pool length and waypoints, then start the camera.</p>
			</header>

			<section class="card">
				<label class="field">
					<span class="field-label">Discipline</span>
					<select class="select" bind:value={discipline}>
						<option value="DYN">DYN (with fins)</option>
						<option value="DYNB">DYNB (bifins)</option>
						<option value="DNF">DNF (no fins)</option>
					</select>
				</label>

				<div class="field">
					<NumberWheelInput
						bind:value={poolLength}
						label="Pool length"
						min={10}
						max={100}
						step={5}
						unit="m"
						hint="The full length of the pool you're recording in."
					/>
				</div>

				<div class="field">
					<NumberWheelInput
						bind:value={waypointsPerLap}
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
					Start camera →
				</button>
			</div>
		</div>
	</div>
{:else if stage === 'record'}
	<DiveRecorder
		poolLength={poolLength ?? 25}
		waypointsPerLap={waypointsPerLap ?? 2}
		{resolution}
		{discipline}
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
						<strong>
							{capture.timeline.laps.length > 0
								? formatMeters(
										capture.timeline.laps[capture.timeline.laps.length - 1]
											.cumulativeDistanceM
									)
								: 0} m
						</strong>
					</div>
					<div><span>Size</span><strong>{(capture.sizeBytes / (1024 * 1024)).toFixed(1)} MB</strong></div>
				</div>
			{/if}

			<section class="card">
				<label class="pin">
					<input type="checkbox" bind:checked={pinned} />
					Pin this dive (keep beyond the 5-video cap)
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
</style>
