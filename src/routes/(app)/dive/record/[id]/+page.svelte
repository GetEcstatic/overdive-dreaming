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

	type Stage = 'setup' | 'record' | 'review' | 'saving' | 'done';
	let stage = $state<Stage>('setup');

	let poolLength = $state(25);
	let discipline = $state<DiveVideoDiscipline>('DYN');
	let plannedReps = $state(0); // 0 = open-ended; >0 shows "Lap X of N" during recording
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

{#if stage === 'setup'}
	<div class="min-h-screen bg-slate-950 text-white">
		<div class="mx-auto max-w-md p-4">
			<h1 class="mb-1 text-2xl font-bold">Record dive</h1>
			<p class="mb-6 text-sm text-slate-400">
				Set up the dive, then tap <strong>Start camera</strong> to frame the diver.
			</p>

			<div class="space-y-5">
				<label class="block">
					<span class="text-sm font-medium text-slate-300">Discipline</span>
					<select
						bind:value={discipline}
						class="mt-1 w-full rounded-lg bg-slate-900 p-3 text-base"
					>
						<option value="DYN">DYN (with fins)</option>
						<option value="DYNB">DYNB (bifins)</option>
						<option value="DNF">DNF (no fins)</option>
					</select>
				</label>

				<label class="block">
					<span class="text-sm font-medium text-slate-300">Pool length (m)</span>
					<input
						type="number"
						min="10"
						max="100"
						step="5"
						bind:value={poolLength}
						class="mt-1 w-full rounded-lg bg-slate-900 p-3 text-base"
					/>
					<span class="mt-1 block text-xs text-slate-500">
						Each LAP tap adds one pool length to the distance counter.
					</span>
				</label>

				<label class="block">
					<span class="text-sm font-medium text-slate-300">
						Planned laps (waypoints)
					</span>
					<input
						type="number"
						min="0"
						max="99"
						step="1"
						bind:value={plannedReps}
						class="mt-1 w-full rounded-lg bg-slate-900 p-3 text-base"
					/>
					<span class="mt-1 block text-xs text-slate-500">
						Optional. Set the number of laps you expect so the HUD shows
						"Lap X of N". Leave at 0 to keep it open-ended.
					</span>
					{#if plannedReps > 0 && poolLength > 0}
						<span class="mt-1 block text-xs text-teal-300">
							Target distance: {plannedReps * poolLength} m
						</span>
					{/if}
				</label>
			</div>

			<div class="mt-8 flex items-center gap-3">
				<button
					class="flex-1 rounded-xl bg-slate-800 py-4 text-base font-semibold text-slate-200 active:scale-95"
					onclick={() => history.back()}
				>
					Cancel
				</button>
				<button
					class="flex-2 rounded-xl bg-teal-400 py-4 text-base font-bold text-slate-900 shadow-lg active:scale-95"
					onclick={() => (stage = 'record')}
				>
					Start camera →
				</button>
			</div>
		</div>
	</div>
{:else if stage === 'record'}
	<DiveRecorder
		{poolLength}
		{resolution}
		{plannedReps}
		{discipline}
		onCapture={onCaptured}
		onCancel={() => (stage = 'setup')}
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
