<script lang="ts">
	/**
	 * TrackingOptions - Configure what data to track
	 * Shows all metrics organized under collapsible section headings
	 */

	import type { 
		TrackingConfig, 
		SimplifiedRoutineType,
		Discipline,
		TrainingEnvironment
	} from '$lib/types';

	let {
		trackingConfig = $bindable(),
		selectedType,
		disciplines,
		trainingEnvironment
	}: {
		trackingConfig: TrackingConfig;
		selectedType: SimplifiedRoutineType | null;
		disciplines: Discipline[];
		trainingEnvironment: TrainingEnvironment;
	} = $props();

	// Track which sections are expanded
	let expandedSections = $state<Record<string, boolean>>({
		performance: true,  // Open by default
		session: false,
		body: false,
		equipment: false,
		notes: true,  // Open by default
		biometrics: false
	});

	// Categories for tracking options
	const trackingCategories = [
		{
			id: 'performance',
			name: 'Performance Metrics',
			icon: '🎯',
			fields: [
				{ key: 'trackTotalDistance', label: 'Total Distance', hint: 'Distance covered in meters' },
				{ key: 'trackTotalTime', label: 'Total Time', hint: 'Total dive duration' },
				{ key: 'trackRepsCompleted', label: 'Reps Completed', hint: 'Number of repetitions completed' },
				{ key: 'trackRepDuration', label: 'Rep Duration', hint: 'Time per rep (for intervals)' },
				{ key: 'trackRepDistance', label: 'Rep Distance', hint: 'Distance per rep (for intervals)' },
				{ key: 'trackRestBetweenLaps', label: 'Rest Between Reps', hint: 'Recovery time between reps' },
				{ key: 'trackTimePerLap', label: 'Time Per Lap', hint: 'Detailed lap-by-lap times' },
				{ key: 'trackKicksPerLap', label: 'Kicks Per Lap', hint: 'Count kicks (dynamic disciplines)' },
				{ key: 'trackArmPullsPerLap', label: 'Arm Pulls Per Lap', hint: 'Count arm pulls (DNF)' }
			]
		},
		{
			id: 'session',
			name: 'Session Context',
			icon: '🏊',
			fields: [
				{ key: 'trackPoolLength', label: 'Pool Length', hint: '25m or 50m pool' },
				{ key: 'trackPoolType', label: 'Pool Type', hint: 'Indoor or outdoor' },
				{ key: 'trackWaterTemperature', label: 'Water Temperature', hint: 'Temperature in °C' },
				{ key: 'trackInitialBreatheUpTime', label: 'Initial Breathe-up Time', hint: 'Pre-dive preparation time' }
			]
		},
		{
			id: 'body',
			name: 'Body & Recovery',
			icon: '❤️',
			fields: [
				{ key: 'trackRPE', label: 'RPE (Effort)', hint: 'Rate of Perceived Exertion 1-10' },
				{ key: 'trackJoyScale', label: 'Joy Scale', hint: 'How enjoyable? 1-10' },
				{ key: 'trackBreathingTechnique', label: 'Breathing Technique', hint: 'Tidal, hyper, hypo, etc.' },
				{ key: 'trackContractionsOnsetTime', label: 'Contractions Onset', hint: 'Time to first contraction' },
				{ key: 'trackHoursSinceLastMeal', label: 'Hours Since Meal', hint: 'Digestion state' },
				{ key: 'trackRestingHeartRate', label: 'Resting Heart Rate', hint: 'Pre-session resting HR' },
				{ key: 'trackHRV', label: 'HRV', hint: 'Heart rate variability' },
				{ key: 'trackBodyWeight', label: 'Body Weight', hint: 'Weight on training day' },
				{ key: 'trackBasalMood', label: 'Mood', hint: 'General mood 1-10' },
				{ key: 'trackMenstrualCycleDay', label: 'Cycle Day', hint: 'Menstrual cycle tracking' }
			]
		},
		{
			id: 'equipment',
			name: 'Equipment & Safety',
			icon: '🤿',
			fields: [
				{ key: 'trackEquipmentUsed', label: 'Equipment Used', hint: 'Fins, wetsuit, weights, etc.' },
				{ key: 'trackFacialGear', label: 'Facial Gear', hint: 'Mask, noseclip, goggles' },
				{ key: 'trackBuddyName', label: 'Buddy Name', hint: 'Who you trained with' },
				{ key: 'trackSambaBO', label: 'Samba/BO Incident', hint: 'Safety incident flag' }
			]
		},
		{
			id: 'notes',
			name: 'Notes',
			icon: '📝',
			fields: [
				{ key: 'trackNotes', label: 'Session Notes', hint: 'Freeform notes and observations' }
			]
		}
	];

	// Biometric fields (for dry STA)
	const biometricCategory = {
		id: 'biometrics',
		name: 'Biometrics (Dry Training)',
		icon: '🫀',
		hint: 'For Stamina app CSV import',
		fields: [
			{ key: 'trackPerRepSpO2', label: 'Per-Rep SpO2', hint: 'Oxygen saturation per rep' },
			{ key: 'trackPerRepHR', label: 'Per-Rep Heart Rate', hint: 'Heart rate per rep' },
			{ key: 'trackSpO2Thresholds', label: 'SpO2 Thresholds', hint: 'Time below critical SpO2 levels' },
			{ key: 'trackMinimumSpO2', label: 'Minimum SpO2', hint: 'Lowest SpO2 reached' },
			{ key: 'trackMinimumHR', label: 'Minimum HR', hint: 'Lowest heart rate reached' }
		]
	};

	function toggleSection(sectionId: string) {
		expandedSections[sectionId] = !expandedSections[sectionId];
	}

	function toggleField(key: string) {
		trackingConfig = {
			...trackingConfig,
			[key]: !trackingConfig[key as keyof TrackingConfig]
		};
	}

	function toggleAllInSection(sectionFields: Array<{ key: string }>, enable: boolean) {
		const updates: Partial<TrackingConfig> = {};
		for (const field of sectionFields) {
			updates[field.key as keyof TrackingConfig] = enable;
		}
		trackingConfig = { ...trackingConfig, ...updates };
	}

	// Count enabled fields per section
	function getEnabledCount(fields: Array<{ key: string }>): number {
		return fields.filter(f => trackingConfig[f.key as keyof TrackingConfig] === true).length;
	}

	// Total enabled fields
	let totalEnabled = $derived(
		Object.values(trackingConfig).filter(v => v === true).length
	);

	// Show biometrics section for dry or both STA
	let showBiometrics = $derived(trainingEnvironment !== 'wet' || disciplines.includes('STA'));
</script>

<div class="tracking-options">
	<div class="header">
		<h1>📊 Data Tracking</h1>
		<p class="subtitle">Select which metrics to track when logging this routine</p>
		<div class="tracking-summary">
			<span class="summary-count">{totalEnabled}</span>
			<span class="summary-label">metrics selected</span>
		</div>
	</div>

	<!-- Tracking Categories -->
	<div class="categories">
		{#each trackingCategories as category}
			{@const enabledInSection = getEnabledCount(category.fields)}
			<div class="category" class:expanded={expandedSections[category.id]}>
				<button 
					type="button"
					class="category-header"
					onclick={() => toggleSection(category.id)}
				>
					<span class="category-icon">{category.icon}</span>
					<span class="category-name">{category.name}</span>
					<span class="category-count">
						{enabledInSection}/{category.fields.length}
					</span>
					<span class="expand-icon">
						{expandedSections[category.id] ? '▼' : '▶'}
					</span>
				</button>

				{#if expandedSections[category.id]}
					<div class="category-content">
						<div class="quick-actions">
							<button 
								type="button" 
								class="quick-btn"
								onclick={() => toggleAllInSection(category.fields, true)}
							>
								Select All
							</button>
							<button 
								type="button" 
								class="quick-btn"
								onclick={() => toggleAllInSection(category.fields, false)}
							>
								Clear All
							</button>
						</div>
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
				{/if}
			</div>
		{/each}

		<!-- Biometric fields for dry STA -->
		{#if showBiometrics}
			{@const enabledBio = getEnabledCount(biometricCategory.fields)}
			<div class="category biometric" class:expanded={expandedSections.biometrics}>
				<button 
					type="button"
					class="category-header"
					onclick={() => toggleSection('biometrics')}
				>
					<span class="category-icon">{biometricCategory.icon}</span>
					<span class="category-name">{biometricCategory.name}</span>
					<span class="category-count">
						{enabledBio}/{biometricCategory.fields.length}
					</span>
					<span class="expand-icon">
						{expandedSections.biometrics ? '▼' : '▶'}
					</span>
				</button>

				{#if expandedSections.biometrics}
					<div class="category-content">
						<p class="category-hint">{biometricCategory.hint}</p>
						<div class="quick-actions">
							<button 
								type="button" 
								class="quick-btn"
								onclick={() => toggleAllInSection(biometricCategory.fields, true)}
							>
								Select All
							</button>
							<button 
								type="button" 
								class="quick-btn"
								onclick={() => toggleAllInSection(biometricCategory.fields, false)}
							>
								Clear All
							</button>
						</div>
						<div class="field-list">
							{#each biometricCategory.fields as field}
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
	</div>
</div>

<style>
	.tracking-options {
		padding: 1rem 0;
	}

	.header {
		text-align: center;
		margin-bottom: 1.5rem;
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
		margin: 0 0 1rem;
	}

	.tracking-summary {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: rgba(20, 184, 166, 0.1);
		border-radius: 20px;
	}

	.summary-count {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--color-primary);
	}

	.summary-label {
		font-size: 0.85rem;
		color: var(--color-text-muted);
	}

	/* Categories */
	.categories {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.category {
		background: var(--color-bg-card);
		border-radius: 12px;
		overflow: hidden;
		border: 1px solid transparent;
		transition: border-color 0.2s ease;
	}

	.category.expanded {
		border-color: rgba(20, 184, 166, 0.3);
	}

	.category.biometric {
		border-color: rgba(167, 139, 250, 0.3);
		background: rgba(167, 139, 250, 0.05);
	}

	.category-header {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 1rem;
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
		gap: 0.75rem;
	}

	.category-header:hover {
		background: rgba(148, 163, 184, 0.05);
	}

	.category-icon {
		font-size: 1.25rem;
	}

	.category-name {
		flex: 1;
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.category-count {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		background: rgba(148, 163, 184, 0.1);
		padding: 0.2rem 0.5rem;
		border-radius: 10px;
	}

	.expand-icon {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		width: 1rem;
		text-align: center;
	}

	/* Category Content */
	.category-content {
		padding: 0 1rem 1rem;
		border-top: 1px solid rgba(148, 163, 184, 0.1);
	}

	.category-hint {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		margin: 0.75rem 0;
		font-style: italic;
	}

	/* Quick Actions */
	.quick-actions {
		display: flex;
		gap: 0.5rem;
		margin: 0.75rem 0;
	}

	.quick-btn {
		padding: 0.35rem 0.75rem;
		background: rgba(148, 163, 184, 0.1);
		border: none;
		border-radius: 6px;
		color: var(--color-text-muted);
		font-size: 0.75rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.quick-btn:hover {
		background: rgba(20, 184, 166, 0.2);
		color: var(--color-primary);
	}

	/* Field List */
	.field-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.field-toggle {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.6rem 0.5rem;
		border-radius: 6px;
		cursor: pointer;
		transition: background 0.2s ease;
	}

	.field-toggle:hover {
		background: rgba(148, 163, 184, 0.08);
	}

	.field-toggle input[type="checkbox"] {
		width: 18px;
		height: 18px;
		margin-top: 2px;
		accent-color: var(--color-primary);
		flex-shrink: 0;
	}

	.field-info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}

	.field-label {
		font-size: 0.9rem;
		font-weight: 500;
		color: var(--color-text);
	}

	.field-hint {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}
</style>
