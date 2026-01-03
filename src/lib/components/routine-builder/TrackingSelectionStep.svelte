<script lang="ts">
	/**
	 * TrackingSelectionStep - Step 3 of routine builder wizard
	 * Select which metrics to track for this routine
	 */

	import type { TrackingConfig } from '$lib/types';

	let {
		trackingConfig = $bindable<TrackingConfig>({
			// Session context
			trackPoolLength: false,
			trackInitialBreatheUpTime: false,
			// Performance metrics
			trackTotalDistance: false,
			trackTotalTime: false,
			trackRepsCompleted: false,
			trackRepDuration: false,
			trackTimePerLap: false,
			trackRestBetweenLaps: false,
			trackKicksPerLap: false,
			trackArmPullsPerLap: false,
			// Training context
			trackBreathingTechnique: false,
			trackRPE: false,
			trackJoyScale: false,
			trackHoursSinceLastMeal: false,
			trackNotes: false,
			// New metrics
			trackWaterTemperature: false,
			trackContractionsOnsetTime: false,
			trackEquipmentUsed: false,
			trackBuddyName: false,
			trackRestingHeartRate: false,
			trackHRV: false,
			trackPoolType: false,
			trackSambaBO: false
		})
	}: {
		trackingConfig: TrackingConfig;
	} = $props();

	// Preset configurations
	function applyMinimal() {
		trackingConfig = {
			...trackingConfig,
			trackPoolLength: true,
			trackTotalDistance: true,
			trackTotalTime: true,
			trackRepsCompleted: true,
			trackNotes: true
		};
	}

	function applyStandard() {
		trackingConfig = {
			...trackingConfig,
			// Session context
			trackPoolLength: true,
			trackInitialBreatheUpTime: true,
			// Performance
			trackTotalDistance: true,
			trackTotalTime: true,
			trackRepsCompleted: true,
			trackRepDuration: true,
			trackTimePerLap: false,
			trackRestBetweenLaps: true,
			// Training context
			trackBreathingTechnique: true,
			trackRPE: true,
			trackJoyScale: true,
			trackNotes: true
		};
	}

	function applyComplete() {
		// Enable all fields
		trackingConfig = Object.keys(trackingConfig).reduce(
			(acc, key) => {
				acc[key as keyof TrackingConfig] = true;
				return acc;
			},
			{} as TrackingConfig
		);
	}

	// Group toggle functions
	function toggleSessionContext(enable: boolean) {
		trackingConfig.trackPoolLength = enable;
		trackingConfig.trackInitialBreatheUpTime = enable;
	}

	function togglePerformanceMetrics(enable: boolean) {
		trackingConfig.trackTotalDistance = enable;
		trackingConfig.trackTotalTime = enable;
		trackingConfig.trackRepsCompleted = enable;
		trackingConfig.trackRepDuration = enable;
		trackingConfig.trackTimePerLap = enable;
		trackingConfig.trackRestBetweenLaps = enable;
		trackingConfig.trackKicksPerLap = enable;
		trackingConfig.trackArmPullsPerLap = enable;
	}

	function toggleTrainingAndHealth(enable: boolean) {
		trackingConfig.trackBreathingTechnique = enable;
		trackingConfig.trackRPE = enable;
		trackingConfig.trackJoyScale = enable;
		trackingConfig.trackHoursSinceLastMeal = enable;
		trackingConfig.trackNotes = enable;
		trackingConfig.trackWaterTemperature = enable;
		trackingConfig.trackContractionsOnsetTime = enable;
		trackingConfig.trackEquipmentUsed = enable;
		trackingConfig.trackBuddyName = enable;
		trackingConfig.trackRestingHeartRate = enable;
		trackingConfig.trackHRV = enable;
		trackingConfig.trackPoolType = enable;
		trackingConfig.trackSambaBO = enable;
		trackingConfig.trackBreathsBetweenReps = enable;
	}
</script>

<div class="tracking-selection-step">
	<h2 class="step-title">Tracking Configuration</h2>
	<p class="step-description">
		Choose which metrics you want to track when logging this routine. You can always log additional
		data later.
	</p>

	<!-- Preset Buttons -->
	<div class="preset-section">
		<div class="preset-label">Quick Presets:</div>
		<div class="preset-buttons">
			<button type="button" class="preset-btn" onclick={applyMinimal}>Minimal</button>
			<button type="button" class="preset-btn" onclick={applyStandard}>Standard</button>
			<button type="button" class="preset-btn" onclick={applyComplete}>Complete</button>
		</div>
	</div>

	<!-- Session Context -->
	<div class="tracking-group">
		<div class="group-header">
			<h3 class="group-title">Session Context (2)</h3>
			<div class="group-actions">
				<button type="button" class="link-btn" onclick={() => toggleSessionContext(true)}>
					Select All
				</button>
				<span class="separator">|</span>
				<button type="button" class="link-btn" onclick={() => toggleSessionContext(false)}>
					Deselect All
				</button>
			</div>
		</div>

		<div class="checkbox-list">
			<label class="checkbox-item">
				<input type="checkbox" bind:checked={trackingConfig.trackPoolLength} />
				<div class="checkbox-content">
					<div class="checkbox-label">Pool Length</div>
					<div class="checkbox-description">Pool size in meters</div>
				</div>
			</label>

			<label class="checkbox-item">
				<input type="checkbox" bind:checked={trackingConfig.trackInitialBreatheUpTime} />
				<div class="checkbox-content">
					<div class="checkbox-label">Initial Breathe-Up Time</div>
					<div class="checkbox-description">Pre-dive breathe-up duration</div>
				</div>
			</label>
		</div>
	</div>

	<!-- Performance Metrics -->
	<div class="tracking-group">
		<div class="group-header">
			<h3 class="group-title">Performance Metrics (8)</h3>
			<div class="group-actions">
				<button type="button" class="link-btn" onclick={() => togglePerformanceMetrics(true)}>
					Select All
				</button>
				<span class="separator">|</span>
				<button type="button" class="link-btn" onclick={() => togglePerformanceMetrics(false)}>
					Deselect All
				</button>
			</div>
		</div>

		<div class="checkbox-list">
			<label class="checkbox-item">
				<input type="checkbox" bind:checked={trackingConfig.trackTotalDistance} />
				<div class="checkbox-content">
					<div class="checkbox-label">Total Distance</div>
					<div class="checkbox-description">Total meters covered (for max attempts)</div>
				</div>
			</label>

			<label class="checkbox-item">
				<input type="checkbox" bind:checked={trackingConfig.trackTotalTime} />
				<div class="checkbox-content">
					<div class="checkbox-label">Total Time</div>
					<div class="checkbox-description">Total dive duration</div>
				</div>
			</label>

			<label class="checkbox-item">
				<input type="checkbox" bind:checked={trackingConfig.trackRepsCompleted} />
				<div class="checkbox-content">
					<div class="checkbox-label">Reps Completed</div>
					<div class="checkbox-description">Number of repetitions completed</div>
				</div>
			</label>

			<label class="checkbox-item">
				<input type="checkbox" bind:checked={trackingConfig.trackRepDuration} />
				<div class="checkbox-content">
					<div class="checkbox-label">Rep Duration</div>
					<div class="checkbox-description">Duration per rep (for interval training)</div>
				</div>
			</label>

			<label class="checkbox-item">
				<input type="checkbox" bind:checked={trackingConfig.trackTimePerLap} />
				<div class="checkbox-content">
					<div class="checkbox-label">Time Per Lap</div>
					<div class="checkbox-description">Detailed per-lap times</div>
				</div>
			</label>

			<label class="checkbox-item">
				<input type="checkbox" bind:checked={trackingConfig.trackRestBetweenLaps} />
				<div class="checkbox-content">
					<div class="checkbox-label">Rest Between Laps</div>
					<div class="checkbox-description">Rest intervals between reps</div>
				</div>
			</label>

			<label class="checkbox-item">
				<input type="checkbox" bind:checked={trackingConfig.trackKicksPerLap} />
				<div class="checkbox-content">
					<div class="checkbox-label">Kicks Per Lap</div>
					<div class="checkbox-description">Kick count per lap (DYN/DNF/DYNB)</div>
				</div>
			</label>

			<label class="checkbox-item">
				<input type="checkbox" bind:checked={trackingConfig.trackArmPullsPerLap} />
				<div class="checkbox-content">
					<div class="checkbox-label">Arm Pulls Per Lap</div>
					<div class="checkbox-description">Arm pull count per lap (DNF only)</div>
				</div>
			</label>
		</div>
	</div>

	<!-- Training Context & Health -->
	<div class="tracking-group">
		<div class="group-header">
			<h3 class="group-title">Training Context & Health (14)</h3>
			<div class="group-actions">
				<button type="button" class="link-btn" onclick={() => toggleTrainingAndHealth(true)}>
					Select All
				</button>
				<span class="separator">|</span>
				<button type="button" class="link-btn" onclick={() => toggleTrainingAndHealth(false)}>
					Deselect All
				</button>
			</div>
		</div>

		<div class="checkbox-list">
			<label class="checkbox-item">
				<input type="checkbox" bind:checked={trackingConfig.trackBreathingTechnique} />
				<div class="checkbox-content">
					<div class="checkbox-label">Breathing Technique</div>
					<div class="checkbox-description">Tidal / Hyperventilation / Hypoventilation</div>
				</div>
			</label>

			<label class="checkbox-item">
				<input type="checkbox" bind:checked={trackingConfig.trackRPE} />
				<div class="checkbox-content">
					<div class="checkbox-label">RPE (Rate of Perceived Exertion)</div>
					<div class="checkbox-description">1-10 scale of effort</div>
				</div>
			</label>

			<label class="checkbox-item">
				<input type="checkbox" bind:checked={trackingConfig.trackJoyScale} />
				<div class="checkbox-content">
					<div class="checkbox-label">Joy Scale</div>
					<div class="checkbox-description">1-10 scale of enjoyment</div>
				</div>
			</label>

			<label class="checkbox-item">
				<input type="checkbox" bind:checked={trackingConfig.trackHoursSinceLastMeal} />
				<div class="checkbox-content">
					<div class="checkbox-label">Hours Since Last Meal</div>
					<div class="checkbox-description">Time since eating</div>
				</div>
			</label>

			<label class="checkbox-item">
				<input type="checkbox" bind:checked={trackingConfig.trackNotes} />
				<div class="checkbox-content">
					<div class="checkbox-label">Notes</div>
					<div class="checkbox-description">Freeform session notes</div>
				</div>
			</label>

			<!-- NEW METRICS -->
			<label class="checkbox-item new-metric">
				<input type="checkbox" bind:checked={trackingConfig.trackWaterTemperature} />
				<div class="checkbox-content">
					<div class="checkbox-label">
						Water Temperature <span class="badge-new">NEW</span>
					</div>
					<div class="checkbox-description">Pool/water temperature in Celsius</div>
				</div>
			</label>

			<label class="checkbox-item new-metric">
				<input type="checkbox" bind:checked={trackingConfig.trackContractionsOnsetTime} />
				<div class="checkbox-content">
					<div class="checkbox-label">
						Contractions Onset Time <span class="badge-new">NEW</span>
					</div>
					<div class="checkbox-description">When first contraction occurred</div>
				</div>
			</label>

			<label class="checkbox-item new-metric">
				<input type="checkbox" bind:checked={trackingConfig.trackEquipmentUsed} />
				<div class="checkbox-content">
					<div class="checkbox-label">
						Equipment Used <span class="badge-new">NEW</span>
					</div>
					<div class="checkbox-description">Fins type, wetsuit, etc. (text)</div>
				</div>
			</label>

			<label class="checkbox-item new-metric">
				<input type="checkbox" bind:checked={trackingConfig.trackBuddyName} />
				<div class="checkbox-content">
					<div class="checkbox-label">
						Buddy Name <span class="badge-new">NEW</span>
					</div>
					<div class="checkbox-description">Diving partner name</div>
				</div>
			</label>

			<label class="checkbox-item new-metric">
				<input type="checkbox" bind:checked={trackingConfig.trackRestingHeartRate} />
				<div class="checkbox-content">
					<div class="checkbox-label">
						Resting Heart Rate <span class="badge-new">NEW</span>
					</div>
					<div class="checkbox-description">Resting HR for the day (bpm)</div>
				</div>
			</label>

			<label class="checkbox-item new-metric">
				<input type="checkbox" bind:checked={trackingConfig.trackHRV} />
				<div class="checkbox-content">
					<div class="checkbox-label">
						Heart Rate Variability <span class="badge-new">NEW</span>
					</div>
					<div class="checkbox-description">HRV measurement (ms)</div>
				</div>
			</label>

			<label class="checkbox-item new-metric">
				<input type="checkbox" bind:checked={trackingConfig.trackPoolType} />
				<div class="checkbox-content">
					<div class="checkbox-label">
						Pool Type <span class="badge-new">NEW</span>
					</div>
					<div class="checkbox-description">Indoor vs Outdoor</div>
				</div>
			</label>

			<label class="checkbox-item new-metric">
				<input type="checkbox" bind:checked={trackingConfig.trackSambaBO} />
				<div class="checkbox-content">
					<div class="checkbox-label">
						Samba/BO Incident <span class="badge-new">NEW</span>
					</div>
					<div class="checkbox-description">Track loss of motor control incidents</div>
				</div>
			</label>

			<label class="checkbox-item new-metric">
				<input type="checkbox" bind:checked={trackingConfig.trackBreathsBetweenReps} />
				<div class="checkbox-content">
					<div class="checkbox-label">
						Breaths Between Reps <span class="badge-new">NEW</span>
					</div>
					<div class="checkbox-description">Number of breaths between dives/reps</div>
				</div>
			</label>
		</div>
	</div>
</div>

<style>
	.tracking-selection-step {
		max-width: 800px;
		margin: 0 auto;
	}

	.step-title {
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--color-text);
		margin-bottom: 0.5rem;
	}

	.step-description {
		font-size: 1rem;
		color: var(--color-text-muted);
		margin-bottom: 2rem;
	}

	.preset-section {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 2rem;
		padding: 1rem;
		background: rgba(20, 184, 166, 0.05);
		border: 1px solid rgba(20, 184, 166, 0.2);
		border-radius: 8px;
	}

	.preset-label {
		font-weight: 600;
		color: var(--color-text);
		font-size: 0.9375rem;
	}

	.preset-buttons {
		display: flex;
		gap: 0.5rem;
	}

	.preset-btn {
		padding: 0.5rem 1rem;
		background: rgba(20, 184, 166, 0.1);
		border: 1px solid rgba(20, 184, 166, 0.3);
		border-radius: 6px;
		color: var(--color-primary);
		font-weight: 600;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.preset-btn:hover {
		background: rgba(20, 184, 166, 0.2);
		border-color: var(--color-primary);
	}

	.tracking-group {
		background: rgba(15, 23, 42, 0.3);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 12px;
		padding: 1.5rem;
		margin-bottom: 1.5rem;
	}

	.group-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.25rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid rgba(148, 163, 184, 0.1);
	}

	.group-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.group-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.link-btn {
		background: none;
		border: none;
		color: var(--color-primary);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		text-decoration: underline;
		transition: opacity 0.2s ease;
	}

	.link-btn:hover {
		opacity: 0.8;
	}

	.separator {
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	.checkbox-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 0.75rem;
	}

	.checkbox-item {
		display: flex;
		align-items: flex-start;
		padding: 0.75rem;
		background: rgba(15, 23, 42, 0.4);
		border: 1px solid rgba(148, 163, 184, 0.1);
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.checkbox-item:hover {
		background: rgba(15, 23, 42, 0.6);
		border-color: rgba(148, 163, 184, 0.2);
	}

	.checkbox-item input[type='checkbox'] {
		margin-top: 0.25rem;
		margin-right: 0.75rem;
		width: 18px;
		height: 18px;
		cursor: pointer;
	}

	.checkbox-content {
		flex: 1;
	}

	.checkbox-label {
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: 0.25rem;
		font-size: 0.9375rem;
	}

	.checkbox-description {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}

	.badge-new {
		display: inline-block;
		padding: 0.125rem 0.375rem;
		background: var(--color-primary);
		color: white;
		font-size: 0.625rem;
		font-weight: 700;
		text-transform: uppercase;
		border-radius: 3px;
		margin-left: 0.375rem;
	}

	.new-metric {
		border-color: rgba(20, 184, 166, 0.2);
	}

	/* Mobile responsive */
	@media (max-width: 768px) {
		.preset-section {
			flex-direction: column;
			align-items: stretch;
		}

		.preset-buttons {
			flex-direction: column;
		}

		.preset-btn {
			width: 100%;
		}

		.checkbox-list {
			grid-template-columns: 1fr;
		}

		.group-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.75rem;
		}
	}
</style>
