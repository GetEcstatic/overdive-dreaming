<script lang="ts">
	/**
	 * TrackingOptions - Configure what data to track with preset levels
	 */

	import type { 
		TrackingConfig, 
		TrackingPreset, 
		SimplifiedRoutineType,
		Discipline 
	} from '$lib/types';

	let {
		trackingPreset = $bindable(),
		trackingConfig = $bindable(),
		selectedType,
		disciplines,
		isDry
	}: {
		trackingPreset: TrackingPreset;
		trackingConfig: TrackingConfig;
		selectedType: SimplifiedRoutineType | null;
		disciplines: Discipline[];
		isDry: boolean;
	} = $props();

	let showAdvanced = $state(false);

	const presets: Array<{ 
		value: TrackingPreset; 
		label: string; 
		icon: string; 
		description: string 
	}> = [
		{ 
			value: 'minimal', 
			label: 'Minimal', 
			icon: '📝', 
			description: 'Just the basics: distance/time and notes' 
		},
		{ 
			value: 'standard', 
			label: 'Standard', 
			icon: '📊', 
			description: 'Core metrics plus RPE, joy, and breathing' 
		},
		{ 
			value: 'full', 
			label: 'Full', 
			icon: '🔬', 
			description: 'Everything! For data enthusiasts' 
		},
		{ 
			value: 'custom', 
			label: 'Custom', 
			icon: '⚙️', 
			description: 'Choose exactly what to track' 
		}
	];

	// Categories for custom tracking options
	const trackingCategories = [
		{
			name: 'Performance',
			icon: '🎯',
			fields: [
				{ key: 'trackTotalDistance', label: 'Total Distance', hint: 'Distance covered' },
				{ key: 'trackTotalTime', label: 'Total Time', hint: 'Dive duration' },
				{ key: 'trackRepsCompleted', label: 'Reps Completed', hint: 'Number of repetitions' },
				{ key: 'trackRepDuration', label: 'Rep Duration', hint: 'Time per rep (intervals)' },
				{ key: 'trackRepDistance', label: 'Rep Distance', hint: 'Distance per rep (intervals)' },
				{ key: 'trackTimePerLap', label: 'Time Per Lap', hint: 'Detailed lap times' },
				{ key: 'trackKicksPerLap', label: 'Kicks Per Lap', hint: 'Count kicks (dynamic)' },
				{ key: 'trackArmPullsPerLap', label: 'Arm Pulls', hint: 'For DNF technique' }
			]
		},
		{
			name: 'Session Context',
			icon: '🏊',
			fields: [
				{ key: 'trackPoolLength', label: 'Pool Length', hint: '25m or 50m' },
				{ key: 'trackPoolType', label: 'Pool Type', hint: 'Indoor/outdoor' },
				{ key: 'trackWaterTemperature', label: 'Water Temperature', hint: 'Affects performance' },
				{ key: 'trackInitialBreatheUpTime', label: 'Breathe-up Time', hint: 'Pre-dive preparation' },
				{ key: 'trackRestBetweenLaps', label: 'Rest Between Reps', hint: 'Recovery intervals' }
			]
		},
		{
			name: 'Body & Recovery',
			icon: '❤️',
			fields: [
				{ key: 'trackRPE', label: 'RPE', hint: 'Rate of Perceived Exertion (1-10)' },
				{ key: 'trackJoyScale', label: 'Joy Scale', hint: 'How much fun? (1-10)' },
				{ key: 'trackBreathingTechnique', label: 'Breathing Technique', hint: 'Tidal/hyper/hypo' },
				{ key: 'trackContractionsOnsetTime', label: 'Contractions Onset', hint: 'When first contraction' },
				{ key: 'trackHoursSinceLastMeal', label: 'Hours Since Meal', hint: 'Digestion state' },
				{ key: 'trackRestingHeartRate', label: 'Resting HR', hint: 'Heart rate for the day' },
				{ key: 'trackHRV', label: 'HRV', hint: 'Heart rate variability' },
				{ key: 'trackBodyWeight', label: 'Body Weight', hint: 'Weight that day' },
				{ key: 'trackBasalMood', label: 'Mood', hint: 'How you feel (1-10)' },
				{ key: 'trackMenstrualCycleDay', label: 'Cycle Day', hint: 'Menstrual cycle tracking' }
			]
		},
		{
			name: 'Equipment & Safety',
			icon: '🤿',
			fields: [
				{ key: 'trackEquipmentUsed', label: 'Equipment', hint: 'Fins, wetsuit, etc.' },
				{ key: 'trackFacialGear', label: 'Facial Gear', hint: 'Mask, noseclip, goggles' },
				{ key: 'trackBuddyName', label: 'Buddy Name', hint: 'Who you dive with' },
				{ key: 'trackSambaBO', label: 'Samba/BO', hint: 'Safety incidents flag' }
			]
		},
		{
			name: 'Notes',
			icon: '📝',
			fields: [
				{ key: 'trackNotes', label: 'Session Notes', hint: 'Freeform notes' }
			]
		}
	];

	// Biometric fields (for dry STA)
	const biometricFields = [
		{ key: 'trackPerRepSpO2', label: 'Per-Rep SpO2', hint: 'Oxygen saturation per rep' },
		{ key: 'trackPerRepHR', label: 'Per-Rep HR', hint: 'Heart rate per rep' },
		{ key: 'trackSpO2Thresholds', label: 'SpO2 Thresholds', hint: 'Time below critical levels' },
		{ key: 'trackMinimumSpO2', label: 'Minimum SpO2', hint: 'Lowest SpO2 reached' },
		{ key: 'trackMinimumHR', label: 'Minimum HR', hint: 'Lowest HR reached' }
	];

	function applyPreset(preset: TrackingPreset) {
		trackingPreset = preset;
		
		if (preset === 'custom') {
			showAdvanced = true;
			return;
		}

		// Reset all to false first
		const base: TrackingConfig = {
			trackPoolLength: false,
			trackInitialBreatheUpTime: false,
			trackTotalDistance: false,
			trackTotalTime: false,
			trackRepsCompleted: false,
			trackRepDuration: false,
			trackRepDistance: false,
			trackTimePerLap: false,
			trackRestBetweenLaps: false,
			trackKicksPerLap: false,
			trackArmPullsPerLap: false,
			trackBreathingTechnique: false,
			trackRPE: false,
			trackJoyScale: false,
			trackHoursSinceLastMeal: false,
			trackNotes: false,
			trackWaterTemperature: false,
			trackContractionsOnsetTime: false,
			trackEquipmentUsed: false,
			trackBuddyName: false,
			trackRestingHeartRate: false,
			trackHRV: false,
			trackPoolType: false,
			trackSambaBO: false,
			trackBreathsBetweenReps: false,
			trackMenstrualCycleDay: false,
			trackFacialGear: false,
			trackBasalMood: false,
			trackMinimumSpO2: false,
			trackMinimumHR: false,
			trackBodyWeight: false,
			trackPerRepSpO2: false,
			trackPerRepHR: false,
			trackSpO2Thresholds: false,
			isDryTraining: isDry
		};

		switch (preset) {
			case 'minimal':
				trackingConfig = {
					...base,
					trackTotalDistance: true,
					trackTotalTime: true,
					trackNotes: true
				};
				break;
			case 'standard':
				trackingConfig = {
					...base,
					trackTotalDistance: true,
					trackTotalTime: true,
					trackPoolLength: true,
					trackRPE: true,
					trackJoyScale: true,
					trackNotes: true,
					trackBreathingTechnique: true,
					trackRepsCompleted: selectedType !== 'max-attempt'
				};
				break;
			case 'full':
				trackingConfig = {
					...base,
					trackPoolLength: true,
					trackInitialBreatheUpTime: true,
					trackTotalDistance: true,
					trackTotalTime: true,
					trackRepsCompleted: true,
					trackRepDuration: true,
					trackRepDistance: true,
					trackTimePerLap: true,
					trackRestBetweenLaps: true,
					trackKicksPerLap: disciplines.some(d => ['DYN', 'DNF', 'DYNB'].includes(d)),
					trackArmPullsPerLap: disciplines.includes('DNF'),
					trackBreathingTechnique: true,
					trackRPE: true,
					trackJoyScale: true,
					trackHoursSinceLastMeal: true,
					trackNotes: true,
					trackWaterTemperature: true,
					trackContractionsOnsetTime: disciplines.includes('STA'),
					trackEquipmentUsed: true,
					trackBuddyName: true,
					trackSambaBO: true,
					trackPerRepSpO2: isDry,
					trackPerRepHR: isDry
				};
				break;
		}
	}

	function toggleField(key: string) {
		trackingConfig = {
			...trackingConfig,
			[key]: !trackingConfig[key as keyof TrackingConfig]
		};
		// If user manually changes, switch to custom
		if (trackingPreset !== 'custom') {
			trackingPreset = 'custom';
		}
	}

	// Count enabled fields
	let enabledCount = $derived(
		Object.values(trackingConfig).filter(v => v === true).length
	);
</script>

<div class="tracking-options">
	<div class="header">
		<h1>📊 Data Tracking</h1>
		<p class="subtitle">Choose what to track when logging this routine</p>
	</div>

	<!-- Preset Selection -->
	<section class="form-section">
		<h2>Tracking Level</h2>
		<p class="section-hint">Select a preset or customize your tracking</p>

		<div class="preset-grid">
			{#each presets as preset}
				<button
					type="button"
					class="preset-btn"
					class:active={trackingPreset === preset.value}
					onclick={() => applyPreset(preset.value)}
				>
					<span class="preset-icon">{preset.icon}</span>
					<span class="preset-label">{preset.label}</span>
					<span class="preset-desc">{preset.description}</span>
				</button>
			{/each}
		</div>

		<div class="tracking-summary">
			<span class="summary-count">{enabledCount}</span>
			<span class="summary-label">fields enabled</span>
		</div>
	</section>

	<!-- Advanced Options (Expandable) -->
	{#if trackingPreset === 'custom' || showAdvanced}
		<section class="form-section">
			<button 
				type="button" 
				class="expand-btn"
				onclick={() => (showAdvanced = !showAdvanced)}
			>
				<span>{showAdvanced ? '▼' : '▶'} Advanced Options</span>
			</button>

			{#if showAdvanced}
				<div class="categories">
					{#each trackingCategories as category}
						<div class="category">
							<h3>{category.icon} {category.name}</h3>
							<div class="field-list">
								{#each category.fields as field}
									<label class="field-toggle">
										<input
											type="checkbox"
											checked={trackingConfig[field.key as keyof TrackingConfig] === true}
											onchange={() => toggleField(field.key)}
										/>
										<span class="field-info">
											<span class="field-label">{field.label}</span>
											<span class="field-hint">{field.hint}</span>
										</span>
									</label>
								{/each}
							</div>
						</div>
					{/each}

					<!-- Biometric fields for dry STA -->
					{#if isDry || disciplines.includes('STA')}
						<div class="category biometric">
							<h3>🫀 Biometrics (Dry Training)</h3>
							<p class="category-hint">For Stamina app CSV import support</p>
							<div class="field-list">
								{#each biometricFields as field}
									<label class="field-toggle">
										<input
											type="checkbox"
											checked={trackingConfig[field.key as keyof TrackingConfig] === true}
											onchange={() => toggleField(field.key)}
										/>
										<span class="field-info">
											<span class="field-label">{field.label}</span>
											<span class="field-hint">{field.hint}</span>
										</span>
									</label>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</section>
	{:else}
		<button 
			type="button" 
			class="show-advanced-btn"
			onclick={() => (showAdvanced = true)}
		>
			Show Advanced Options ▼
		</button>
	{/if}
</div>

<style>
	.tracking-options {
		padding: 1rem 0;
	}

	.header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.header h1 {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0 0 0.5rem;
	}

	.subtitle {
		color: var(--color-text-muted);
		font-size: 0.9rem;
		margin: 0;
	}

	/* Form Sections */
	.form-section {
		margin-bottom: 1.5rem;
	}

	.form-section h2 {
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 0.5rem;
	}

	.section-hint {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		margin: 0 0 1rem;
	}

	/* Preset Grid */
	.preset-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.75rem;
	}

	.preset-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 1rem;
		background: var(--color-bg-card);
		border: 2px solid transparent;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: center;
	}

	.preset-btn:hover {
		border-color: rgba(20, 184, 166, 0.4);
	}

	.preset-btn.active {
		border-color: var(--color-primary);
		background: rgba(20, 184, 166, 0.1);
	}

	.preset-icon {
		font-size: 1.5rem;
		margin-bottom: 0.5rem;
	}

	.preset-label {
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.preset-desc {
		font-size: 0.7rem;
		color: var(--color-text-muted);
		margin-top: 0.25rem;
		line-height: 1.3;
	}

	/* Tracking Summary */
	.tracking-summary {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		margin-top: 1rem;
		padding: 0.75rem;
		background: rgba(20, 184, 166, 0.1);
		border-radius: 8px;
	}

	.summary-count {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--color-primary);
	}

	.summary-label {
		font-size: 0.85rem;
		color: var(--color-text-muted);
	}

	/* Expand Button */
	.expand-btn,
	.show-advanced-btn {
		width: 100%;
		padding: 0.75rem;
		background: var(--color-bg-card);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 8px;
		color: var(--color-text-muted);
		font-size: 0.9rem;
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
	}

	.expand-btn:hover,
	.show-advanced-btn:hover {
		border-color: var(--color-primary);
		color: var(--color-text);
	}

	.show-advanced-btn {
		text-align: center;
		margin-top: 1rem;
	}

	/* Categories */
	.categories {
		margin-top: 1rem;
	}

	.category {
		margin-bottom: 1.5rem;
		padding: 1rem;
		background: var(--color-bg-card);
		border-radius: 8px;
	}

	.category h3 {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 0.75rem;
	}

	.category-hint {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin: -0.5rem 0 0.75rem;
	}

	.category.biometric {
		border: 1px solid rgba(167, 139, 250, 0.3);
		background: rgba(167, 139, 250, 0.05);
	}

	/* Field List */
	.field-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.field-toggle {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.5rem;
		border-radius: 4px;
		cursor: pointer;
		transition: background 0.2s ease;
	}

	.field-toggle:hover {
		background: rgba(148, 163, 184, 0.1);
	}

	.field-toggle input[type="checkbox"] {
		width: 18px;
		height: 18px;
		margin-top: 2px;
		accent-color: var(--color-primary);
	}

	.field-info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.field-label {
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--color-text);
	}

	.field-hint {
		font-size: 0.7rem;
		color: var(--color-text-muted);
	}
</style>
