<!--
  Dive video capture page.
  Route: /dive/record/[sessionId]

  Flow:
    1. Show DiveRecorder (camera preview, GO/LAP/STOP).
    2. On capture, show a save panel (pool length, discipline, athlete, pin).
    3. On confirm: enqueue upload in IndexedDB, then drain immediately.
    4. Navigate back to the session detail on success.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { user } from '$lib/stores/auth';
	import DiveRecorder from '$lib/components/DiveRecorder.svelte';
	import AthletePicker from '$lib/components/AthletePicker.svelte';
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

	type Stage = 'record' | 'review' | 'saving' | 'done';
	let stage = $state<Stage>('record');

	let poolLength = $state(25);
	let discipline = $state<DiveVideoDiscipline>('DYN');
	let resolution = $state<DiveVideoResolution>('720p');
	let resolutionLoaded = $state(false);
	let pinned = $state(false);
	let athleteId = $state<string | undefined>(undefined);

	let capture = $state<CaptureResult | null>(null);
	let saveError = $state<string | null>(null);
	let uploadProgress = $state(0);

	// Load the user's default video resolution preference once on mount.
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
				// Non-fatal — just keep the 720p default.
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
				poolLength,
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

			// Fire-and-forget drain. User can navigate away; we resume on reconnect.
			drainUploadQueue((p) => {
				uploadProgress = p.fraction;
			}).catch((err) => {
				// Non-fatal — item stays queued.
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

{#if stage === 'record'}
	<DiveRecorder
		{poolLength}
		{resolution}
		onCapture={onCaptured}
		onCancel={() => history.back()}
	/>
{:else}
	<div class="min-h-screen bg-slate-950 text-white">
		<div class="mx-auto max-w-md p-4">
			<h1 class="mb-4 text-xl font-bold">Review &amp; save</h1>

			{#if capture}
				<div class="mb-4 rounded-xl bg-slate-900 p-3 text-sm text-slate-300">
					<div>Duration: {capture.durationSeconds.toFixed(1)}s</div>
					<div>Laps tapped: {capture.timeline.laps.length}</div>
					<div>
						Distance: {capture.timeline.laps.length > 0
							? capture.timeline.laps[capture.timeline.laps.length - 1].cumulativeDistanceM
							: 0} m
					</div>
					<div>Size: {(capture.sizeBytes / (1024 * 1024)).toFixed(1)} MB</div>
				</div>
			{/if}

			<div class="space-y-4">
				<label class="block">
					<span class="text-sm text-slate-400">Pool length (m)</span>
					<input
						type="number"
						min="10"
						max="100"
						step="5"
						bind:value={poolLength}
						class="mt-1 w-full rounded-lg bg-slate-900 p-2"
					/>
				</label>

				<label class="block">
					<span class="text-sm text-slate-400">Discipline</span>
					<select
						bind:value={discipline}
						class="mt-1 w-full rounded-lg bg-slate-900 p-2"
					>
						<option value="DYN">DYN (with fins)</option>
						<option value="DYNB">DYNB (bifins)</option>
						<option value="DNF">DNF (no fins)</option>
					</select>
				</label>

				<label class="flex items-center gap-2 text-sm text-slate-300">
					<input type="checkbox" bind:checked={pinned} />
					Pin this dive (keep beyond the 5-video cap)
				</label>

				<div class="rounded-lg bg-slate-900 p-3">
					<div class="mb-2 text-sm text-slate-400">Gift this dive to…</div>
					{#if $user}
						<AthletePicker
							bind:athleteId
							selfId={$user.uid}
							onChange={(id) => (athleteId = id)}
						/>
					{/if}
				</div>
			</div>

			{#if saveError}
				<p class="mt-4 text-sm text-red-400">{saveError}</p>
			{/if}

			<div class="mt-6 flex items-center gap-3">
				<button
					class="flex-1 rounded-full bg-slate-800 py-3 font-semibold text-slate-200"
					onclick={discard}
					disabled={stage === 'saving'}
				>
					Re-record
				</button>
				<button
					class="flex-1 rounded-full bg-teal-400 py-3 font-semibold text-slate-900 disabled:opacity-50"
					onclick={save}
					disabled={stage === 'saving' || !capture}
				>
					{stage === 'saving' ? `Saving… ${Math.round(uploadProgress * 100)}%` : 'Save dive'}
				</button>
			</div>
		</div>
	</div>
{/if}
