<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { user } from '$lib/stores/auth';
	import MiniAnalytics from '$lib/components/MiniAnalytics.svelte';
	import EditRoutineLogModal from '$lib/components/EditRoutineLogModal.svelte';
	import BiometricTimeChart from '$lib/components/BiometricTimeChart.svelte';
	import { getFormattedMetric } from '$lib/utils/metrics';
	import { formatTime } from '$lib/utils/time';
	import { getYouTubeEmbedUrl, deleteSessionPhoto, deleteBiometricCsv } from '$lib/storage';
	import { format } from 'date-fns';
	import { updateRoutineLog, deleteRoutineLog, deleteSessionByGroup } from '$lib/firestore';
	import { recalculatePBsForDisciplines } from '$lib/utils/personalBests';
	import { clearDashboardCache } from '$lib/utils/dashboardCache';
	import { shareCard, downloadShareCard } from '$lib/utils/shareCard';
	import { parseBiometricCsv } from '$lib/utils/biometricCsvParser';
	import type { RoutineLog, Discipline, BiometricReading } from '$lib/types';
	import CommentSection from '$lib/components/CommentSection.svelte';
	import SessionDiveVideos from '$lib/components/SessionDiveVideos.svelte';

	let { data } = $props();
	let { log, routine, showMenstrualCycleTracking } = $derived(data);

	// Edit modal state
	let editingLog = $state<{ log: RoutineLog; routine: typeof routine } | null>(null);
	let saveError = $state<string | null>(null);

	// Delete confirmation state
	let showDeleteConfirm = $state(false);
	let isDeleting = $state(false);
	let deleteError = $state<string | null>(null);

	// Share state
	let isGeneratingShare = $state(false);

	// Biometric chart state
	let biometricReadings = $state<BiometricReading[]>([]);
	let loadingBiometrics = $state(false);

	// Load biometric readings from CSV if available
	$effect(() => {
		const csvUrl = log.biometricCsvUrl;
		
		if (csvUrl && biometricReadings.length === 0 && !loadingBiometrics) {
			loadingBiometrics = true;
			fetch(csvUrl)
				.then(res => res.text())
				.then(csvContent => {
					const parsed = parseBiometricCsv(csvContent);
					biometricReadings = parsed.readings;
				})
				.catch(err => {
					console.error('Failed to load biometric CSV:', err);
				})
				.finally(() => {
					loadingBiometrics = false;
				});
		}
	});

	// Format date/time
	const fullDate = $derived(format(log.date.toDate(), 'EEEE, MMMM d, yyyy'));
	const fullTime = $derived(format(log.date.toDate(), 'h:mm a'));

	// Get hero and secondary metrics
	const heroMetric = $derived(
		getFormattedMetric(routine.displayConfig.heroMetric, routine.displayConfig.heroMetricLabel, log, routine)
	);

	const secondaryMetric = $derived(
		getFormattedMetric(
			routine.displayConfig.secondaryMetric,
			routine.displayConfig.secondaryMetricLabel,
			log,
			routine
		)
	);
	const isOwner = $derived($user?.uid === log.userId);

	// Discipline badge color
	const disciplineColor = $derived.by(() => {
		switch (log.disciplineUsed) {
			case 'DYN':
				return '#14b8a6'; // teal
			case 'DNF':
				return '#10b981'; // green
			case 'DYNB':
				return '#06b6d4'; // cyan
			case 'STA':
				return '#8b5cf6'; // purple
			default:
				return '#94a3b8'; // gray
		}
	});

	function handleEdit() {
		editingLog = { log, routine };
	}

	async function handleSaveLog(updates: Partial<RoutineLog>) {
		if (!editingLog) return;

		try {
			// Update Firestore
			await updateRoutineLog(editingLog.log.id, updates);
			if ($user) {
				clearDashboardCache($user.uid);
			}

			// Reload page to show updated data
			window.location.reload();
		} catch (err) {
			console.error('Failed to save log:', err);
			saveError = 'Failed to save changes. Please try again.';
		}
	}

	function handleViewAnalytics() {
		goto(`/routines/${routine.id}/analytics?discipline=${log.disciplineUsed}`);
	}

	function handleBack() {
		if (window.history.length > 1) {
			window.history.back();
		} else {
			goto('/dashboard');
		}
	}

	function handleDeleteClick() {
		showDeleteConfirm = true;
		deleteError = null;
	}

	async function handleShare() {
		if (isGeneratingShare) return;
		
		isGeneratingShare = true;
		try {
			const userName = $user?.displayName?.replace(/\s+/g, '') || undefined;
			const shared = await shareCard(
				{ log, routine, userName },
				{} // Use default story format (1080x1920, 9:16)
			);
			
			// If Web Share API wasn't available, it downloaded instead
			if (!shared) {
				console.log('Share card downloaded');
			}
		} catch (error) {
			console.error('Failed to generate share card:', error);
		} finally {
			isGeneratingShare = false;
		}
	}

	async function handleConfirmDelete() {
		if (!$user) return;

		isDeleting = true;
		deleteError = null;

		try {
			let photoUrls: string[] = [];
			let disciplines: Discipline[] = [];

			if (log.sessionGroup) {
				// Delete all routine logs in this session group
				const result = await deleteSessionByGroup($user.uid, log.sessionGroup);
				photoUrls = result.photoUrls;
				disciplines = result.disciplines;
			} else {
				// Fallback for legacy logs without sessionGroup
				if (log.photoUrl) {
					photoUrls = [log.photoUrl];
				}
				disciplines = log.disciplineUsed ? [log.disciplineUsed] : [];
				await deleteRoutineLog(log.id);
			}

			// Clean up photos from storage
			for (const photoUrl of photoUrls) {
				try {
					await deleteSessionPhoto(photoUrl);
				} catch (photoError) {
					console.error('Failed to delete photo:', photoError);
					// Continue even if photo deletion fails
				}
			}

			// Clean up biometric CSV from storage if present
			if (log.biometricCsvUrl) {
				try {
					await deleteBiometricCsv(log.biometricCsvUrl);
				} catch (csvError) {
					console.error('Failed to delete biometric CSV:', csvError);
					// Continue even if CSV deletion fails
				}
			}

			if (disciplines.length > 0) {
				try {
					await recalculatePBsForDisciplines($user.uid, disciplines);
				} catch (pbError) {
					console.error('Failed to recalculate PBs:', pbError);
				}
			}

			// Navigate back to dashboard
			clearDashboardCache($user.uid);
			goto('/dashboard');
		} catch (err) {
			console.error('Failed to delete session:', err);
			deleteError = 'Failed to delete session. Please try again.';
			isDeleting = false;
		}
	}

	function handleCancelDelete() {
		showDeleteConfirm = false;
		deleteError = null;
	}

	// Helper function for breathing technique labels
	function getTechniqueLabel(level: number): string {
		if (level === 0) return 'Tidal (0)';
		if (level < 0) return `Hypoventilation (${level})`;
		return `Hyperventilation (+${level})`;
	}
</script>

<svelte:head>
	<title>{routine.name} - Session Detail | Overdive Dreaming</title>
</svelte:head>

<div class="detail-page">
	<!-- Header -->
	<header class="page-header">
		<button class="back-button" onclick={handleBack} aria-label="Go back">
			<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
				<path
					d="M12.5 15L7.5 10L12.5 5"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			Back
		</button>

		<div class="header-content">
			<h1>{routine.name}</h1>
			<div class="session-meta">
				<span class="discipline-badge" style="background-color: {disciplineColor}20; color: {disciplineColor}">
					{log.disciplineUsed}
				</span>
				<span class="date">{fullDate}</span>
				<span class="time">{fullTime}</span>
			</div>
		</div>
	</header>

	<!-- Mini Analytics -->
	<MiniAnalytics {routine} currentLogId={log.id} />

	<!-- Hero Metrics -->
	<section class="hero-metrics">
		<div class="hero-metric">
			<div class="metric-label">{heroMetric.label}</div>
			<div class="metric-value">{heroMetric.value}</div>
		</div>
		{#if secondaryMetric.value !== '-'}
			<div class="secondary-metric">
				<div class="metric-label">{secondaryMetric.label}</div>
				<div class="metric-value">{secondaryMetric.value}</div>
			</div>
		{/if}
	</section>

	<!-- Performance Metrics -->
	{#if log.totalDistance || log.totalTime || log.summary?.repsCompleted || log.repDuration || log.avgSpeed}
		<section class="metrics-section">
			<h2>Performance Metrics</h2>
			<div class="metrics-grid">
				{#if log.totalDistance}
					<div class="metric-item">
						<span class="label">Total Distance</span>
						<span class="value">{log.totalDistance}m</span>
					</div>
				{/if}
				{#if log.totalTime}
					<div class="metric-item">
						<span class="label">Total Time</span>
						<span class="value">{formatTime(log.totalTime)}</span>
					</div>
				{/if}
				{#if log.avgSpeed}
					<div class="metric-item">
						<span class="label">Avg Speed</span>
						<span class="value">{log.avgSpeed.toFixed(2)} m/s</span>
					</div>
				{/if}
				{#if log.summary?.repsCompleted}
					<div class="metric-item">
						<span class="label">Reps Completed</span>
						<span class="value">{log.summary.repsCompleted}</span>
					</div>
				{/if}
				{#if log.repDuration}
					<div class="metric-item">
						<span class="label">Rep Duration</span>
						<span class="value">{formatTime(log.repDuration)}</span>
					</div>
				{/if}
				{#if log.summary?.averageTimePerRep}
					<div class="metric-item">
						<span class="label">Avg Time Per Rep</span>
						<span class="value">{formatTime(log.summary.averageTimePerRep)}</span>
					</div>
				{/if}
				{#if log.maxRepSpeed}
					<div class="metric-item">
						<span class="label">Max Rep Speed</span>
						<span class="value">{log.maxRepSpeed.toFixed(2)} m/s</span>
					</div>
				{/if}
				{#if log.minRepSpeed}
					<div class="metric-item">
						<span class="label">Min Rep Speed</span>
						<span class="value">{log.minRepSpeed.toFixed(2)} m/s</span>
					</div>
				{/if}
				{#if log.cumulativeHoldTime}
					<div class="metric-item">
						<span class="label">Cumulative Hold Time</span>
						<span class="value">{formatTime(log.cumulativeHoldTime)}</span>
					</div>
				{/if}
			</div>
		</section>
	{/if}

	<!-- Competition -->
	{#if log.isCompetition || log.compeitionOrg || log.cardTag || log.recordTag}
		<section class="metrics-section">
			<h2>Competition</h2>
			<div class="metrics-grid">
				{#if log.isCompetition}
					<div class="metric-item">
						<span class="label">Competition</span>
						<span class="value">Yes</span>
					</div>
				{/if}
				{#if log.compeitionOrg}
					<div class="metric-item">
						<span class="label">Organization</span>
						<span class="value">{log.compeitionOrg.toUpperCase()}</span>
					</div>
				{/if}
				{#if log.cardTag}
					<div class="metric-item">
						<span class="label">Card</span>
						<span class="value capitalize">{log.cardTag}</span>
					</div>
				{/if}
				{#if log.recordTag}
					<div class="metric-item">
						<span class="label">Record</span>
						<span class="value">{log.recordTag}</span>
					</div>
				{/if}
			</div>
		</section>
	{/if}

	<!-- Session Context -->
	{#if log.poolLength || log.initialBreatheUpTime || log.breathingTechnique || log.breathingTechniqueLevel !== undefined}
		<section class="metrics-section">
			<h2>Session Context</h2>
			<div class="metrics-grid">
				{#if log.poolLength}
					<div class="metric-item">
						<span class="label">Pool Length</span>
						<span class="value">{log.poolLength}m</span>
					</div>
				{/if}
				{#if log.initialBreatheUpTime}
					<div class="metric-item">
						<span class="label">Initial Breathe-Up</span>
						<span class="value">{formatTime(log.initialBreatheUpTime)}</span>
					</div>
				{/if}
				{#if log.breathingTechniqueLevel !== undefined}
					<div class="metric-item">
						<span class="label">Breathing Technique</span>
						<span class="value">{getTechniqueLabel(log.breathingTechniqueLevel)}</span>
					</div>
				{:else if log.breathingTechnique}
					<div class="metric-item">
						<span class="label">Breathing Technique</span>
						<span class="value capitalize">{log.breathingTechnique}</span>
					</div>
				{/if}
			</div>
		</section>
	{/if}

	<!-- Subjective Ratings & Health Metrics -->
	{#if log.rpe || log.joyScale || log.hoursSinceLastMeal || log.basalMood || log.menstrualCycleDay || log.minimumSpO2 || log.minimumHR || log.restingHeartRate || log.bodyWeight || log.fvc || log.fvcWithPacking || log.waterTemperature || log.contractionsOnsetTime || log.equipmentUsed || log.buddyName || log.hrv || log.poolType || log.sambaBO || log.breathsBetweenReps || (log.facialGear && log.facialGear.length > 0)}
		<section class="metrics-section">
			<h2>Subjective Ratings & Health Metrics</h2>
			<div class="metrics-grid">
				{#if log.rpe}
					<div class="metric-item">
						<span class="label">RPE (Difficulty)</span>
						<span class="value">{log.rpe}/10 💪</span>
					</div>
				{/if}
				{#if log.joyScale}
					<div class="metric-item">
						<span class="label">Joy Scale</span>
						<span class="value">{log.joyScale}/10 😊</span>
					</div>
				{/if}
				{#if log.basalMood}
					<div class="metric-item">
						<span class="label">Basal Mood</span>
						<span class="value">{log.basalMood}/10</span>
					</div>
				{/if}
				{#if log.hoursSinceLastMeal}
					<div class="metric-item">
						<span class="label">Hours Since Last Meal</span>
						<span class="value">{log.hoursSinceLastMeal}h</span>
					</div>
				{/if}
				{#if log.waterTemperature}
					<div class="metric-item">
						<span class="label">Water Temp</span>
						<span class="value">{log.waterTemperature}°C</span>
					</div>
				{/if}
				{#if log.contractionsOnsetTime}
					<div class="metric-item">
						<span class="label">Contractions Onset</span>
						<span class="value">{formatTime(log.contractionsOnsetTime)}</span>
					</div>
				{/if}
				{#if log.equipmentUsed}
					<div class="metric-item">
						<span class="label">Equipment</span>
						<span class="value">{log.equipmentUsed}</span>
					</div>
				{/if}
				{#if log.buddyName}
					<div class="metric-item">
						<span class="label">Buddy Name</span>
						<span class="value">{log.buddyName}</span>
					</div>
				{/if}
				{#if log.menstrualCycleDay}
					<div class="metric-item">
						<span class="label">Menstrual Cycle Day</span>
						<span class="value">Day {log.menstrualCycleDay}</span>
					</div>
				{/if}
				{#if log.facialGear && log.facialGear.length > 0}
					<div class="metric-item">
						<span class="label">Facial Gear</span>
						<span class="value capitalize">{log.facialGear.join(', ')}</span>
					</div>
				{/if}
				{#if log.minimumSpO2}
					<div class="metric-item">
						<span class="label">Min SpO2</span>
						<span class="value">{log.minimumSpO2}%</span>
					</div>
				{/if}
				{#if log.minimumHR}
					<div class="metric-item">
						<span class="label">Min HR</span>
						<span class="value">{log.minimumHR} bpm</span>
					</div>
				{/if}
				{#if log.restingHeartRate}
					<div class="metric-item">
						<span class="label">Resting HR</span>
						<span class="value">{log.restingHeartRate} bpm</span>
					</div>
				{/if}
				{#if log.hrv}
					<div class="metric-item">
						<span class="label">HRV</span>
						<span class="value">{log.hrv} ms</span>
					</div>
				{/if}
				{#if log.poolType}
					<div class="metric-item">
						<span class="label">Pool Type</span>
						<span class="value capitalize">{log.poolType}</span>
					</div>
				{/if}
				{#if log.sambaBO}
					<div class="metric-item">
						<span class="label">Samba/BO</span>
						<span class="value">Yes</span>
					</div>
				{/if}
				{#if log.breathsBetweenReps}
					<div class="metric-item">
						<span class="label">Breaths Between Reps</span>
						<span class="value">{log.breathsBetweenReps}</span>
					</div>
				{/if}
				{#if log.bodyWeight}
					<div class="metric-item">
						<span class="label">Body Weight</span>
						<span class="value">{log.bodyWeight} kg</span>
					</div>
				{/if}
				{#if log.fvc}
					<div class="metric-item">
						<span class="label">FVC</span>
						<span class="value">{log.fvc} L</span>
					</div>
				{/if}
				{#if log.fvcWithPacking}
					<div class="metric-item">
						<span class="label">FVC with Packing</span>
						<span class="value">{log.fvcWithPacking} L</span>
					</div>
				{/if}
			</div>
		</section>
	{/if}

	<!-- Biometric Tracking (from pulse oximeter CSV) -->
	{#if log.hasBiometricData || log.biometricCsvUrl}
		<section class="metrics-section biometric-section">
			<h2>📊 Biometric Tracking</h2>
			
			<!-- SpO2 & HR Time Chart (loads from CSV) -->
			{#if biometricReadings.length > 0}
				<div class="chart-section chart-first">
					<h3>SpO2 & Heart Rate Over Time</h3>
					<BiometricTimeChart readings={biometricReadings} height={220} />
				</div>
			{:else if loadingBiometrics}
				<div class="chart-section chart-first">
					<h3>SpO2 & Heart Rate Over Time</h3>
					<div class="chart-loading">Loading chart data...</div>
				</div>
			{/if}
			
			{#if log.hasBiometricData}
				<div class="metrics-grid">
					{#if log.longestHold}
						<div class="metric-item">
							<span class="label">Longest Hold</span>
							<span class="value">{formatTime(log.longestHold)}</span>
						</div>
					{/if}
					{#if log.cumulativeHoldTime}
						<div class="metric-item">
							<span class="label">Total Hold Time</span>
							<span class="value">{formatTime(log.cumulativeHoldTime)}</span>
						</div>
					{/if}
					{#if log.lowestSpO2}
						<div class="metric-item">
							<span class="label">Lowest SpO2</span>
							<span class="value spo2-value" class:warning={log.lowestSpO2 < 80} class:danger={log.lowestSpO2 < 70} class:critical={log.lowestSpO2 < 60} class:extreme={log.lowestSpO2 < 50}>{log.lowestSpO2}%</span>
						</div>
					{/if}
					{#if log.sessionAvgSpO2}
						<div class="metric-item">
							<span class="label">Session Avg SpO2</span>
							<span class="value">{log.sessionAvgSpO2}%</span>
						</div>
					{/if}
					{#if log.sessionMinHR}
						<div class="metric-item">
							<span class="label">Min Heart Rate</span>
							<span class="value">{log.sessionMinHR} bpm</span>
						</div>
					{/if}
					{#if log.sessionMaxHR}
						<div class="metric-item">
							<span class="label">Max Heart Rate</span>
							<span class="value">{log.sessionMaxHR} bpm</span>
						</div>
					{/if}
				</div>

				<!-- Time Below Thresholds -->
				{#if log.totalTimeBelow70 || log.totalTimeBelow60 || log.totalTimeBelow50 || log.totalTimeBelow40}
					<div class="threshold-section">
						<h3>Time Below SpO2 Thresholds</h3>
						<div class="threshold-grid">
							{#if log.totalTimeBelow70}
								<div class="threshold-item warning">
									<span class="threshold-label">Below 70%</span>
									<span class="threshold-value">{formatTime(log.totalTimeBelow70)}</span>
								</div>
							{/if}
							{#if log.totalTimeBelow60}
								<div class="threshold-item danger">
									<span class="threshold-label">Below 60%</span>
									<span class="threshold-value">{formatTime(log.totalTimeBelow60)}</span>
								</div>
							{/if}
							{#if log.totalTimeBelow50}
								<div class="threshold-item critical">
									<span class="threshold-label">Below 50%</span>
									<span class="threshold-value">{formatTime(log.totalTimeBelow50)}</span>
								</div>
							{/if}
							{#if log.totalTimeBelow40}
								<div class="threshold-item extreme">
									<span class="threshold-label">Below 40%</span>
									<span class="threshold-value">{formatTime(log.totalTimeBelow40)}</span>
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Per-Rep Biometrics -->
				{#if log.laps && log.laps.length > 0 && log.laps[0].spo2Min}
					<div class="per-rep-section">
						<h3>Per-Rep Biometrics</h3>
						<div class="rep-table">
							<div class="rep-header">
								<span class="rep-col">Rep</span>
								<span class="rep-col">Duration</span>
								<span class="rep-col">SpO2 Min</span>
								<span class="rep-col">SpO2 Avg</span>
								<span class="rep-col">HR Range</span>
							</div>
							{#each log.laps as lap, i}
								<div class="rep-row">
									<span class="rep-col">{i + 1}</span>
									<span class="rep-col">{formatTime(lap.timeSeconds || 0)}</span>
									<span class="rep-col spo2-value" class:warning={(lap.spo2Min || 100) < 80} class:danger={(lap.spo2Min || 100) < 70}>{lap.spo2Min || '-'}%</span>
									<span class="rep-col">{lap.spo2Avg || '-'}%</span>
									<span class="rep-col">{lap.hrMin || '-'}-{lap.hrMax || '-'}</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			{/if}
		</section>
	{/if}

	<!-- Notes -->
	{#if log.notes || log.breathingNotes}
		<section class="notes-section">
			<h2>Notes</h2>
			{#if log.notes}
				<div class="note-block">
					<h3>Session Notes</h3>
					<p>{log.notes}</p>
				</div>
			{/if}
			{#if log.breathingNotes}
				<div class="note-block">
					<h3>Breathing Notes</h3>
					<p>{log.breathingNotes}</p>
				</div>
			{/if}
		</section>
	{/if}

	<!-- Dive Videos (dynamic-only) -->
	<SessionDiveVideos
		routineLogId={log.id}
		discipline={log.disciplineUsed}
		{isOwner}
	/>

	<!-- Media -->
	{#if log.thumbnailImageUrl || log.performanceVideoUrl}
		<section class="media-section">
			<h2>Media</h2>
			{#if log.thumbnailImageUrl}
				<div class="session-photo">
					<img src={log.thumbnailImageUrl} alt="Session photo" />
				</div>
			{/if}
			{#if log.performanceVideoUrl}
				<div class="video-container">
					{#if log.performanceVideoUrl.includes('youtube.com') || log.performanceVideoUrl.includes('youtu.be')}
						<iframe
							src={getYouTubeEmbedUrl(log.performanceVideoUrl)}
							title="Performance video"
							frameborder="0"
							allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
							allowfullscreen
						></iframe>
					{:else}
						<a href={log.performanceVideoUrl} target="_blank" rel="noopener noreferrer" class="video-link">
							📹 View Performance Video
						</a>
					{/if}
				</div>
			{/if}
		</section>
	{/if}

	<!-- Comments -->
	<section class="comments-section">
		<h2>Comments</h2>
		<CommentSection routineLogId={log.id} />
	</section>

	<!-- Action Bar -->
	{#if isOwner}
		<div class="action-bar">
			<button class="btn btn-secondary" onclick={handleEdit}>Edit</button>
			<button class="btn btn-primary" onclick={handleViewAnalytics}>Analytics</button>
			<button 
				class="btn btn-share" 
				onclick={handleShare}
				disabled={isGeneratingShare}
			>
				{#if isGeneratingShare}
					<span class="spinner"></span> Creating...
				{:else}
					📤 Share
				{/if}
			</button>
			<button class="btn btn-danger" onclick={handleDeleteClick}>Delete</button>
		</div>
	{/if}
</div>

<!-- Delete Confirmation Dialog -->
{#if showDeleteConfirm && isOwner}
	<div 
		class="modal-overlay" 
		onclick={handleCancelDelete}
		onkeydown={(e) => e.key === 'Escape' && handleCancelDelete()}
		role="dialog"
		aria-modal="true"
		aria-labelledby="delete-dialog-title"
		tabindex="-1"
	>
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<h2 class="modal-title" id="delete-dialog-title">Delete Session?</h2>
			<p class="modal-message">
				This will permanently delete this session and all associated data. This action cannot be undone.
			</p>

			{#if deleteError}
				<div class="error-message">{deleteError}</div>
			{/if}

			<div class="modal-actions">
				<button class="btn btn-secondary" onclick={handleCancelDelete} disabled={isDeleting}>
					Cancel
				</button>
				<button class="btn btn-danger" onclick={handleConfirmDelete} disabled={isDeleting}>
					{isDeleting ? 'Deleting...' : 'Delete Permanently'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Edit Modal -->
{#if editingLog && isOwner}
	<EditRoutineLogModal
		open={true}
		log={editingLog.log}
		routine={editingLog.routine}
		{showMenstrualCycleTracking}
		onClose={() => {
			editingLog = null;
			saveError = null;
		}}
		onSave={handleSaveLog}
	/>
{/if}

<style>
	.detail-page {
		max-width: 800px;
		margin: 0 auto;
		padding: 1rem 1rem 5rem; /* Bottom padding for bottom nav clearance */
		min-height: 100vh;
	}

	/* Header */
	.page-header {
		margin-bottom: 1.5rem;
	}

	.back-button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: transparent;
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 8px;
		color: var(--color-text);
		font-size: 0.9375rem;
		cursor: pointer;
		transition: all 0.2s;
		margin-bottom: 1rem;
	}

	.back-button:hover {
		background: rgba(148, 163, 184, 0.1);
		border-color: rgba(148, 163, 184, 0.3);
	}

	.header-content h1 {
		font-size: 1.875rem;
		font-weight: 700;
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		margin: 0 0 0.75rem;
	}

	.session-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: center;
		color: var(--color-text-muted);
		font-size: 0.9375rem;
	}

	.discipline-badge {
		padding: 0.25rem 0.75rem;
		border-radius: 9999px;
		font-weight: 600;
		font-size: 0.8125rem;
		text-transform: uppercase;
		letter-spacing: 0.025em;
	}

	/* Hero Metrics */
	.hero-metrics {
		background: var(--color-bg-card);
		border-radius: 12px;
		padding: 1.5rem;
		margin-bottom: 1.5rem;
		display: grid;
		gap: 1rem;
	}

	.hero-metric {
		text-align: center;
	}

	.hero-metric .metric-value {
		font-size: 3rem;
		font-weight: 700;
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		line-height: 1;
		margin-bottom: 0.5rem;
	}

	.hero-metric .metric-label {
		font-size: 0.9375rem;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.secondary-metric {
		text-align: center;
		padding-top: 1rem;
		border-top: 1px solid rgba(148, 163, 184, 0.1);
	}

	.secondary-metric .metric-value {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: 0.25rem;
	}

	.secondary-metric .metric-label {
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}

	/* Sections */
	.metrics-section,
	.notes-section,
	.media-section,
	.comments-section {
		background: var(--color-bg-card);
		border-radius: 12px;
		padding: 1.25rem;
		margin-bottom: 1.5rem;
	}

	.metrics-section h2,
	.notes-section h2,
	.media-section h2,
	.comments-section h2 {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 1rem;
	}

	.metrics-grid {
		display: grid;
		gap: 0.75rem;
	}

	.metric-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem;
		background: rgba(148, 163, 184, 0.05);
		border-radius: 8px;
	}

	.metric-item .label {
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	.metric-item .value {
		color: var(--color-text);
		font-weight: 600;
		font-size: 0.9375rem;
	}

	.metric-item .value.capitalize {
		text-transform: capitalize;
	}

	/* Notes */
	.note-block {
		margin-bottom: 1rem;
	}

	.note-block:last-child {
		margin-bottom: 0;
	}

	.note-block h3 {
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 0.5rem;
	}

	.note-block p {
		color: var(--color-text-muted);
		line-height: 1.6;
		margin: 0;
		white-space: pre-wrap;
	}

	/* Media */
	.session-photo {
		margin-bottom: 1rem;
		border-radius: 8px;
		overflow: hidden;
	}

	.session-photo img {
		width: 100%;
		display: block;
	}

	.video-container {
		position: relative;
		padding-bottom: 56.25%; /* 16:9 aspect ratio */
		height: 0;
		overflow: hidden;
		border-radius: 8px;
	}

	.video-container iframe {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
	}

	.video-link {
		display: block;
		padding: 1rem;
		background: rgba(148, 163, 184, 0.1);
		border-radius: 8px;
		text-align: center;
		color: var(--color-primary);
		text-decoration: none;
		font-weight: 600;
		transition: background 0.2s;
	}

	.video-link:hover {
		background: rgba(148, 163, 184, 0.15);
	}

	/* Action Bar */
	.action-bar {
		margin-top: 2rem;
		padding: 0.75rem 0;
		display: flex;
		gap: 0.5rem;
		border-top: 1px solid rgba(148, 163, 184, 0.1);
		padding-top: 1.5rem;
	}

	.btn {
		flex: 1;
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		font-weight: 500;
		font-size: 0.8125rem;
		cursor: pointer;
		transition: all 0.2s;
		border: none;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.btn-primary {
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
		color: white;
	}

	.btn-primary:hover {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(20, 184, 166, 0.3);
	}

	.btn-secondary {
		background: rgba(148, 163, 184, 0.1);
		color: var(--color-text);
		border: 1px solid rgba(148, 163, 184, 0.2);
	}

	.btn-secondary:hover {
		background: rgba(148, 163, 184, 0.15);
		border-color: rgba(148, 163, 184, 0.3);
	}

	.btn-danger {
		background: rgba(239, 68, 68, 0.1);
		color: #ef4444;
		border: 1px solid rgba(239, 68, 68, 0.3);
	}

	.btn-danger:hover {
		background: rgba(239, 68, 68, 0.2);
		border-color: rgba(239, 68, 68, 0.5);
	}

	.btn-danger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-share {
		background: rgba(59, 130, 246, 0.1);
		color: #3b82f6;
		border: 1px solid rgba(59, 130, 246, 0.3);
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}

	.btn-share:hover:not(:disabled) {
		background: rgba(59, 130, 246, 0.2);
		border-color: rgba(59, 130, 246, 0.5);
	}

	.btn-share:disabled {
		opacity: 0.7;
		cursor: wait;
	}

	.spinner {
		display: inline-block;
		width: 1em;
		height: 1em;
		border: 2px solid currentColor;
		border-right-color: transparent;
		border-radius: 50%;
		animation: spin 0.75s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* Modal */
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.75);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	.modal-content {
		background: var(--color-bg-card);
		border-radius: 12px;
		padding: 1.5rem;
		max-width: 500px;
		width: 100%;
		box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
	}

	.modal-title {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0 0 1rem;
	}

	.modal-message {
		color: var(--color-text-muted);
		line-height: 1.6;
		margin: 0 0 1.5rem;
	}

	.modal-actions {
		display: flex;
		gap: 0.75rem;
	}

	.error-message {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		color: #ef4444;
		padding: 0.75rem 1rem;
		border-radius: 8px;
		margin-bottom: 1rem;
		font-size: 0.875rem;
	}

	@media (min-width: 768px) {
		.detail-page {
			padding: 2rem 2rem 3rem;
		}

		.hero-metrics {
			grid-template-columns: 1fr 1fr;
		}

		.secondary-metric {
			border-top: none;
			border-left: 1px solid rgba(148, 163, 184, 0.1);
			padding-top: 0;
			padding-left: 1rem;
		}

		.metrics-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.btn {
			font-size: 0.875rem;
			padding: 0.625rem 1rem;
		}

		.threshold-grid {
			grid-template-columns: repeat(4, 1fr);
		}

		.rep-table {
			font-size: 0.875rem;
		}
	}

	/* Biometric Tracking Section Styles */
	.biometric-section h2 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.threshold-section {
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(148, 163, 184, 0.1);
	}

	.threshold-section h3 {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text-muted);
		margin: 0 0 0.75rem;
	}

	.threshold-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.75rem;
	}

	.threshold-item {
		display: flex;
		flex-direction: column;
		padding: 0.75rem;
		border-radius: 8px;
		background: rgba(148, 163, 184, 0.05);
	}

	.threshold-item.warning {
		background: rgba(245, 158, 11, 0.1);
		border: 1px solid rgba(245, 158, 11, 0.3);
	}

	.threshold-item.danger {
		background: rgba(249, 115, 22, 0.1);
		border: 1px solid rgba(249, 115, 22, 0.3);
	}

	.threshold-item.critical {
		background: rgba(239, 68, 68, 0.15);
		border: 1px solid rgba(239, 68, 68, 0.5);
	}

	.threshold-item.extreme {
		background: rgba(217, 70, 239, 0.15);
		border: 1px solid rgba(217, 70, 239, 0.5);
	}

	.threshold-label {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.threshold-value {
		font-size: 1.125rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.threshold-item.warning .threshold-value {
		color: #f59e0b;
	}

	.threshold-item.danger .threshold-value {
		color: #f97316;
	}

	.threshold-item.critical .threshold-value {
		color: #ef4444;
	}

	.threshold-item.extreme .threshold-value {
		color: #d946ef;
	}

	/* SpO2 value colors */
	.spo2-value.warning {
		color: #f59e0b;
	}

	.spo2-value.danger {
		color: #f97316;
	}

	.spo2-value.critical {
		color: #ef4444;
	}

	.spo2-value.extreme {
		color: #d946ef;
	}

	/* Biometric Time Chart */
	.chart-section {
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(148, 163, 184, 0.1);
	}

	.chart-section.chart-first {
		margin-top: 0;
		padding-top: 0;
		border-top: none;
	}

	.chart-section h3 {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text-muted);
		margin: 0 0 0.75rem;
	}

	.chart-loading {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 220px;
		background: rgba(148, 163, 184, 0.05);
		border-radius: 12px;
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	/* Per-Rep Table */
	.per-rep-section {
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(148, 163, 184, 0.1);
	}

	.per-rep-section h3 {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text-muted);
		margin: 0 0 0.75rem;
	}

	.rep-table {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.8125rem;
	}

	.rep-header {
		display: grid;
		grid-template-columns: 2.5rem 4rem 4.5rem 4.5rem 1fr;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: rgba(148, 163, 184, 0.1);
		border-radius: 6px;
		font-weight: 600;
		color: var(--color-text-muted);
	}

	.rep-row {
		display: grid;
		grid-template-columns: 2.5rem 4rem 4.5rem 4.5rem 1fr;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		background: rgba(148, 163, 184, 0.05);
	}

	.rep-row:hover {
		background: rgba(148, 163, 184, 0.1);
	}

	.rep-col {
		font-variant-numeric: tabular-nums;
	}
</style>
