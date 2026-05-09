# Routine Metric Map

This is the builder-facing map for metrics that can be tracked or calculated for newly built routines. The older broad inventory is [training-metrics.md](training-metrics.md), especially `Trackable Metrics (TrackingConfig)`, `Calculated Metrics (MetricType)`, and `Display Metrics (Hero/Secondary)`. This document narrows that inventory into routine-builder decisions for static and dynamic disciplines.

## Collection-First Philosophy

New routine templates should turn on every metric that could plausibly be relevant to the routine's discipline, environment, layer shape, and training intent. The routine builder should not use `trackingConfig` as the main user-facing filter for what exists. Instead, `trackingConfig` and layer metric profiles should describe the full collection capacity of the routine.

Filtering belongs at logging time. The athlete should be able to choose what they actually see and fill in through a primary standard/geek mode filter, then by hiding or showing categories of metrics. This keeps routine data rich enough for future analysis while preventing the logging screen from becoming noisy by default.

## Current Sources Of Truth

| Source | File | Purpose |
|--------|------|---------|
| Routine logging flags | `src/lib/types.ts` `TrackingConfig` | Controls which log-form fields are shown for a routine. |
| Display and chart keys | `src/lib/types.ts` `MetricType` | Controls hero/secondary/tertiary display metrics and analytics metric values. |
| Layer-builder metric vocabulary | `src/lib/routineLayers/model.ts` `CanonicalMetricKey` | Builder-level vocabulary used to derive metric profiles from routine layers. |
| Layer create projection | `src/lib/routineLayers/create.ts` `deriveTrackingConfig` | Current generated `trackingConfig` for v2-created routines. |
| Layer display projection | `src/lib/routineLayers/model.ts` `deriveDisplayMetrics` and `src/lib/routineLayers/contract.ts` | Current generated display metric suggestions. |
| Metric calculation | `src/lib/utils/metrics.ts` | Converts a `MetricType` and routine log into a display value. |
| Routine analytics availability | `src/lib/utils/routineAnalytics.ts` | Lists chartable metrics based on `trackingConfig`. |

## Builder Rule Of Thumb

New routines should not ask the user to manually choose every tracking flag, and they should not disable a relevant metric simply to simplify the builder. Build the routine from layers, derive the broad relevant metric set from the layer shape, then let logging UI filters decide which fields are visible at the moment of entry:

| Layer signal | Include in new routine |
|--------------|------------------------|
| Any dynamic layer (`DYN`, `DYNB`, `DNF`, `TORT`) | Distance, pool length, lap/time detail, speed, kicks, water context. |
| Any static layer (`STA`) | Duration, contractions, minimum SpO2/HR where appropriate, lung-volume context. |
| More than one layer or repeat count greater than 1 | Reps completed, per-rep duration/distance, rest, cumulative dive time, session duration. |
| Dry environment | Dry-training flag, minimum SpO2/HR, per-rep SpO2/HR, SpO2 threshold time. |
| Wet or both environment | Buddy, safety outcome, pool/water context. |
| Max or submax effort | Store effort/analytics role on the plan/log row; do not make it only a routine tag. |
| Dynamic recorder-capable routine | Mark distance/time/speed capture sources as recorder or either where supported. |

## Discipline Families

| Family | Disciplines | Primary measured output | Typical secondary outputs | Notes |
|--------|-------------|-------------------------|---------------------------|-------|
| Static | `STA` | Time under breath hold | Breathe-up, contractions, lung volume, min SpO2, min HR, RPE | Static has no distance target. Repeated static tables should expose cumulative hold time. |
| Dynamic | `DYN`, `DYNB`, `DNF` | Distance and/or duration | Pool length, lap times, speed, kicks, arm pulls for DNF, water temperature | Dynamic routines can use recorder-seeded distance/time/speed. |
| Dynamic training | `TORT` | Distance/duration like dynamic | Same as dynamic, with training-specific tags/classification | The v2 layer model treats this as dynamic-training rather than a classic competition discipline. |
| Mixed | Any combination | Per-row actual discipline and row metrics | Routine-level summary metrics plus row-level snapshots | Mixed routines need row-level metric snapshots for analytics to stay meaningful. |

## Hero Metric Dropdowns By Routine Type

These are the builder-facing dropdown lists for `displayConfig.heroMetric`, `displayConfig.secondaryMetric`, and `displayConfig.tertiaryMetric`. The lists should be generated from the routine's layer-derived metric profile, but only metrics with current `MetricType` display support should be selectable until adapters exist for the remaining canonical keys.

| Routine type            | Hero dropdown                                                                                                     | Secondary dropdown                                                                                               | Tertiary dropdown                                                                    | Default combination                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Static single hold      | `totalTime`, `diveDuration`, `initialBreatheUpTime`, `contractionsOnsetTime`, `longestHold`, `breathingTechnique` | `initialBreatheUpTime`, `contractionsOnsetTime`, `breathingTechnique`, `totalTime`, `longestHold`                | `contractionsOnsetTime`, `longestHold`, `breathingTechnique`, `packingVolume`, none  | Hero `totalTime`; secondary `initialBreatheUpTime`; tertiary `contractionsOnsetTime` or none                  |
| Static wet table        | `cumulativeHoldTime`, `totalBreathHoldTime`, `longestHold`, `repsCompleted`, `totalTime`, `avgRestBetweenLaps`    | `longestHold`, `repsCompleted`, `avgRestBetweenLaps`, `totalBreathingTime`, `totalBreaths`                       | `repsCompleted`, `avgRestBetweenLaps`, `totalBreaths`, `contractionsOnsetTime`, none | Hero `cumulativeHoldTime`; secondary `longestHold`; tertiary `repsCompleted`                                  |
| Static dry/RV/FRC table | `longestHold`, `cumulativeHoldTime`, `totalBreathHoldTime`, `repsCompleted`, `avgRestBetweenLaps`                 | `cumulativeHoldTime`, `longestHold`, `repsCompleted`, `avgRestBetweenLaps`, `packingVolume`                      | `repsCompleted`, `packingVolume`, `contractionsOnsetTime`, none                      | Hero `longestHold`; secondary `cumulativeHoldTime`; tertiary none until SpO2 threshold display support exists |
| Dynamic single attempt  | `totalDistance`, `diveDistance`, `totalTime`, `diveDuration`, `avgSpeedMs`, `poolLength`                          | `totalTime`, `diveDuration`, `avgSpeedMs`, `poolLength`, `waterTemperature`                                      | `avgSpeedMs`, `poolLength`, `waterTemperature`, `breathingTechnique`, none           | Hero `totalDistance`; secondary `totalTime`; tertiary `avgSpeedMs`                                            |
| Dynamic interval/table  | `sessionDuration`, `cumulativeDistance`, `totalDistance`, `repsCompleted`, `avgSpeedMs`, `avgTimePerLap`          | `cumulativeDistance`, `repsCompleted`, `avgTimePerLap`, `avgRestBetweenLaps`, `avgSpeedMs`, `totalBreathingTime` | `avgSpeedMs`, `avgRestBetweenLaps`, `avgTimePerLap`, `waterTemperature`, none        | Hero `sessionDuration`; secondary `cumulativeDistance` or `repsCompleted`; tertiary `avgSpeedMs`              |
| Mixed or hybrid         | `sessionDuration`, `totalDistance`, `cumulativeDistance`, `cumulativeHoldTime`, `longestHold`, `repsCompleted`    | `totalDistance`, `totalTime`, `cumulativeHoldTime`, `longestHold`, `repsCompleted`, `avgRestBetweenLaps`         | `avgSpeedMs`, `repsCompleted`, `avgRestBetweenLaps`, `contractionsOnsetTime`, none   | Pick the routine intent: max result, cumulative workload, or session duration                                 |

### Recommended Display Combinations

| Routine intent | Hero | Secondary | Tertiary |
|----------------|------|-----------|----------|
| Static max or submax | `totalTime` | `initialBreatheUpTime` | `contractionsOnsetTime` |
| Static two-breath or CO2 table | `cumulativeHoldTime` | `longestHold` | `repsCompleted` |
| Dry RV/FRC physiology table | `longestHold` | `cumulativeHoldTime` | none until `timeBelowSpO2Threshold` has display support |
| Dynamic max distance | `totalDistance` | `totalTime` | `avgSpeedMs` |
| Dynamic time trial | `totalTime` | `totalDistance` | `avgSpeedMs` |
| Dynamic repeated distance set | `cumulativeDistance` | `repsCompleted` | `avgSpeedMs` |
| Dynamic repeated time set | `sessionDuration` | `avgTimePerLap` | `avgRestBetweenLaps` |
| Mixed routine with max layer | Max-layer result metric (`totalDistance` or `totalTime`) | `sessionDuration` | `repsCompleted` |
| Mixed routine with workload focus | `sessionDuration` | `cumulativeDistance` or `cumulativeHoldTime` | `avgRestBetweenLaps` |

### Dropdown Gaps

| Missing dropdown option | Needed for | Current blocker |
|-------------------------|------------|-----------------|
| Time below SpO2 threshold | Dry static/RV/FRC tertiary metric | Has canonical key and lap fields, but no `MetricType` display adapter. |
| Minimum SpO2 | Dry/static hero or tertiary metric | Has tracking fields, but no `MetricType` display adapter. |
| Minimum HR | Dry/static tertiary metric | Has tracking fields, but no `MetricType` display adapter. |
| Kicks per lap | Dynamic technique tertiary metric | Captured in lap data, but no display metric calculation. |
| Arm pulls per lap | DNF technique tertiary metric | Captured in lap data, but no display metric calculation. |
| Safety outcome | Max attempt tertiary/status metric | Better represented as a status/facet than a numeric hero metric. |

## Static Routine Metric Map

| Metric | Canonical key | TrackingConfig / log source | MetricType / display key | Include when | Calculated? |
|--------|---------------|-----------------------------|--------------------------|--------------|-------------|
| Dive or hold duration | `durationSeconds` | `trackTotalTime` for single hold, `trackRepDuration` for repeated holds | `totalTime`, `diveDuration`, `repDuration`, `holdDuration` | All static routines | No |
| Initial breathe-up | `breatheUpSeconds` | `trackInitialBreatheUpTime`, `initialBreatheUpTime` | `initialBreatheUpTime` | All routines with breathe-up segment | No |
| Reps completed | `repsCompleted` | `trackRepsCompleted`, `repsCompleted`, `summary.repsCompleted` | `repsCompleted` | Repeated static tables | No |
| Rest or breathing between holds | `restSeconds` | `trackRestBetweenLaps`, lap `restAfterSeconds` | `avgRestBetweenLaps`, `totalBreathingTime` | Repeated static tables | Average/total can be calculated |
| Cumulative hold time | `cumulativeDiveTimeSeconds` | `cumulativeHoldTime` or sum lap `timeSeconds` | `cumulativeHoldTime`, `totalBreathHoldTime` | Repeated static tables | Yes |
| Longest hold | `longestHoldSeconds` | `longestHold` or max lap `timeSeconds` | `longestHold` | Static tables, dry biometric imports | Yes |
| Contractions onset | `contractionsOnsetSeconds` | `trackContractionsOnsetTime`, `contractionsOnsetTime` | `contractionsOnsetTime` | Static routines where athlete records contractions | No |
| Minimum SpO2 | `minSpO2` | `trackMinimumSpO2`, `trackPerRepSpO2`, lap `spo2Min` | Not currently a `MetricType` display key | Dry static, biometric CSV, advanced static | Direct or roll-up needed |
| Minimum HR | `minHeartRate` | `trackMinimumHR`, `trackPerRepHR`, lap `hrMin` | Not currently a `MetricType` display key | Dry static, biometric CSV, advanced static | Direct or roll-up needed |
| Time below SpO2 threshold | `timeBelowSpO2Threshold` | `trackSpO2Thresholds`, lap `timeBelow70/60/50/40` | Not currently a `MetricType` display key | Dry static tables and RV/FRC work | Sum by threshold |
| Lung volume | Layer `lungVolume`; log `defaultLungVolume` / lap `lungVolume` | `trackLungVolume` is legacy-ish; UI now exposes lung volume broadly | Not numeric display metric | All static, especially RV/FRC/FL comparison | Classification, not numeric |
| Packing volume | `packingVolumePercent` | `trackPackingVolume`, `packingVolume` | `packingVolume` | Packed static or special attempts | No |
| FVC | `fvcLiters`, `fvcWithPackingLiters` | `trackFVC`, `trackFVCWithPacking` | Not currently a `MetricType` display key | Lung-capacity-focused routines | No |
| O2/gas context | `gasMix` concept in `TrackingConfig` | `trackGasMix`, attempt conditions | Not currently a `MetricType` display key | O2-assisted static | Classification/context |

### Static Display Defaults

| Routine shape | Hero | Secondary | Tertiary |
|---------------|------|-----------|----------|
| Single static hold | `durationSeconds` -> `totalTime` | `breathingTechnique` | `minHeartRate` when tracked |
| Repeated wet static table | `cumulativeDiveTimeSeconds` -> `cumulativeHoldTime` | `longestHoldSeconds` -> `longestHold` | `repsCompleted` |
| Dry static or RV/FRC table | `longestHoldSeconds` -> `longestHold` | `cumulativeDiveTimeSeconds` -> `cumulativeHoldTime` | `timeBelowSpO2Threshold` once display support exists |

## Dynamic Routine Metric Map

| Metric | Canonical key | TrackingConfig / log source | MetricType / display key | Include when | Calculated? |
|--------|---------------|-----------------------------|--------------------------|--------------|-------------|
| Dive distance | `distanceMeters` | `trackTotalDistance`, `totalDistance` / `diveDistance` | `totalDistance`, `diveDistance` | Single dynamic attempts | No |
| Dive duration | `durationSeconds` | `trackTotalTime`, `totalTime` / `diveDuration` | `totalTime`, `diveDuration` | Single dynamic attempts, dynamic time trials | No |
| Pool length | `poolLengthMeters` | `trackPoolLength`, `poolLength` | `poolLength` | All dynamic pool routines | No |
| Reps completed | `repsCompleted` | `trackRepsCompleted`, `repsCompleted`, `summary.repsCompleted` | `repsCompleted` | Dynamic intervals/tables | No |
| Per-rep distance | `distanceMeters` at row level | `trackRepDistance`, `repDistance`, lap `distanceMeters` | `totalRepDistance`, `lapDistance` | Dynamic intervals/tables | Total can be calculated |
| Per-rep or lap time | `lapTimes` | `trackTimePerLap`, lap `timeSeconds` | `avgTimePerLap`, `avgTimePerRep` | Dynamic intervals, recorder imports | Average can be calculated |
| Rest between reps | `restSeconds` | `trackRestBetweenLaps`, lap `restAfterSeconds` | `avgRestBetweenLaps`, `totalBreathingTime` | Dynamic intervals/tables | Average/total can be calculated |
| Cumulative distance | `distanceMeters` roll-up | `cumulativeDistance` or sum lap `distanceMeters` | `cumulativeDistance` | Dynamic intervals/tables | Yes |
| Cumulative dive time | `cumulativeDiveTimeSeconds` | `cumulativeHoldTime` or sum lap `timeSeconds` | `cumulativeHoldTime` | Dynamic intervals/tables | Yes |
| Session duration | `totalRoutineTimeSeconds` | `sessionDuration` or elapsed session timing | `sessionDuration` | Intervals/tables | Yes when timestamps/rests exist |
| Average speed | `speedPerLap` / roll-up | `trackAvgSpeed`, `avgSpeedMs`, deprecated `avgSpeed` | `avgSpeedMs`, `avgSpeed` | Dynamic routines with distance and time | Yes |
| Fastest lap speed | `speedPerLap` roll-up | `fastestLapSpeedMs`, deprecated `maxRepSpeed` | `fastestLapSpeedMs`, `maxRepSpeed` | Dynamic intervals/recorder logs | Yes |
| Slowest lap speed | `speedPerLap` roll-up | `slowestLapSpeedMs`, deprecated `minRepSpeed` | `slowestLapSpeedMs`, `minRepSpeed` | Dynamic intervals/recorder logs | Yes |
| Kicks per lap | `kicksPerLap` | `trackKicksPerLap`, lap `kicks` | Not currently a `MetricType` display key | DYN/DYNB/DNF technique | No or average roll-up needed |
| Arm pulls per lap | No canonical key yet | `trackArmPullsPerLap`, lap `armPulls` | Not currently a `MetricType` display key | DNF technique | No or average roll-up needed |
| Water temperature | `waterTemperatureCelsius` | `trackWaterTemperature`, `waterTemperature` | `waterTemperature` | Wet dynamic routines | No |
| Equipment | `equipment`, `facialGear` | `trackEquipmentUsed`, `trackFacialGear` | Not numeric display metric | Technique comparisons and filtering | Classification/context |

### Dynamic Display Defaults

| Routine shape | Hero | Secondary | Tertiary |
|---------------|------|-----------|----------|
| Single dynamic attempt | `distanceMeters` -> `totalDistance` | `durationSeconds` -> `totalTime` | `speedPerLap` -> `avgSpeedMs` when distance and time exist |
| Dynamic interval/table | `totalRoutineTimeSeconds` -> `sessionDuration` | `distanceMeters` -> `totalDistance` or `cumulativeDistance` | `speedPerLap` -> `avgSpeedMs` |
| Dynamic time-focused interval | `durationSeconds` / `lapTimes` | `repsCompleted` | `avgRestBetweenLaps` |

## Shared Context Metrics

These metrics are useful across static and dynamic routines. They should generally be optional defaults unless the routine family makes them core.

| Metric | Canonical key | TrackingConfig / log source | Include by default |
|--------|---------------|-----------------------------|--------------------|
| Breathing technique | `breathingTechnique` | `trackBreathingTechnique`, `breathingTechnique` | Yes, all routines |
| RPE | `rpe` | `trackRPE`, `rpe` | Yes, all routines |
| Joy scale | `joyScale` | `trackJoyScale`, `joyScale` | Yes, all routines |
| Basal mood | `basalMood` | `trackBasalMood`, `basalMood` | Yes, all new v2 routines |
| Notes | `notes` | `trackNotes`, `notes` | Yes, all routines |
| Buddy name | `buddyName` | `trackBuddyName`, `buddyName` | Wet/both routines |
| Safety outcome | `safetyOutcome` | `trackSambaBO`, samba/BO flags | Wet/both routines and max attempts |
| Hours since last meal | `hoursSinceLastMeal` | `trackHoursSinceLastMeal`, `hoursSinceLastMeal` | Geek/advanced option |
| Resting HR | `restingHeartRate` | `trackRestingHeartRate`, `restingHeartRate` | Geek/advanced option |
| HRV | `hrv` | `trackHRV`, `hrv` | Geek/advanced option |
| Body weight | `bodyWeightKg` | `trackBodyWeight`, `bodyWeight` | Geek/advanced option |
| Menstrual cycle day | No canonical key yet | `trackMenstrualCycleDay`, `menstrualCycleDay` | User opt-in only |

## Calculated Metrics To Preserve

| Calculated metric | Inputs | Applies to | Current display support |
|-------------------|--------|------------|-------------------------|
| Cumulative hold time | Lap/rep durations, or `repDuration * repsCompleted` | Static tables, dynamic interval time-under | `cumulativeHoldTime`, `totalBreathHoldTime` |
| Cumulative distance | Lap distances or `repDistance * repsCompleted` | Dynamic intervals/tables | `cumulativeDistance` is a `MetricType`, but `getMetricValue` does not currently calculate it directly. |
| Average time per rep/lap | Lap durations or total time divided by reps | Static and dynamic intervals | `avgTimePerRep`, `avgTimePerLap` |
| Average rest | Lap rest values | Static and dynamic intervals | `avgRestBetweenLaps` |
| Total breathing/rest time | Lap rest values | Static and dynamic intervals | `totalBreathingTime` |
| Total breaths | Reps completed and protocol assumption | Two-breath static tables | `totalBreaths` |
| Average speed | Distance divided by time | Dynamic routines | `avgSpeedMs`, `avgSpeed` |
| Fastest/slowest lap speed | Per-lap speed values | Dynamic intervals/recorder logs | `fastestLapSpeedMs`, `slowestLapSpeedMs` |
| Longest hold | Max lap duration | Static and dry biometric tables | `longestHold` |
| Time below SpO2 threshold | Sum lap threshold durations | Dry static biometric routines | Needs `MetricType`/display adapter before hero use. |

## New Routine Inclusion Profiles

Use these profiles as the first pass for the layer builder. A later registry can turn these rows into data instead of keeping parallel hand-written mappings.

### Static Single Hold

| Category | Include |
|----------|---------|
| TrackingConfig | `trackTotalTime`, `trackInitialBreatheUpTime`, `trackBreathingTechnique`, `trackRPE`, `trackJoyScale`, `trackBasalMood`, `trackNotes`, `trackContractionsOnsetTime`, `trackMinimumSpO2`, `trackMinimumHR` when dry/biometric. |
| DisplayConfig | Hero `totalTime`/`diveDuration`, secondary `initialBreatheUpTime`, tertiary `contractionsOnsetTime` or `longestHold` for biometric. |
| Row snapshot | Discipline, effort, environment, lung volume, planned duration if fixed. |

### Static Table Or Repeated Holds

| Category | Include |
|----------|---------|
| TrackingConfig | `trackRepsCompleted`, `trackRepDuration`, `trackRestBetweenLaps`, `trackInitialBreatheUpTime`, shared context fields, dry biometric fields when environment is dry. |
| DisplayConfig | Hero `cumulativeHoldTime`, secondary `longestHold`, tertiary `repsCompleted`; dry RV/FRC may prefer `longestHold` hero and cumulative hold secondary. |
| Row snapshot | One result row per planned rep with actual duration, rest, completion, lung volume, optional SpO2/HR. |

### Dynamic Single Attempt

| Category | Include |
|----------|---------|
| TrackingConfig | `trackTotalDistance`, `trackTotalTime`, `trackPoolLength`, `trackTimePerLap`, `trackKicksPerLap`, `trackAvgSpeed`, `trackSpeedPerLap`, `trackWaterTemperature`, shared context fields. DNF should also include `trackArmPullsPerLap`. |
| DisplayConfig | Hero `totalDistance`/`diveDistance`, secondary `totalTime`/`diveDuration`, tertiary `avgSpeedMs`. |
| Row snapshot | Discipline, effort, environment, planned/open distance and duration, recorder capture source where available. |

### Dynamic Interval Or Table

| Category | Include |
|----------|---------|
| TrackingConfig | `trackRepsCompleted`, `trackRepDistance`, `trackRepDuration` when duration is planned/logged per rep, `trackTimePerLap`, `trackRestBetweenLaps`, `trackPoolLength`, speed fields, technique fields, shared context fields. |
| DisplayConfig | Hero `sessionDuration` or `cumulativeDistance` depending on intent, secondary `repsCompleted` or `avgTimePerLap`, tertiary `avgSpeedMs` or `avgRestBetweenLaps`. |
| Row snapshot | Expanded rep rows with actual distance, duration, rest, completion, optional kicks/arm pulls/speed. |

### Mixed Or Hybrid Routine

| Category | Include |
|----------|---------|
| TrackingConfig | Union of participating layer-family metrics, but keep log UI grouped by layer/row so static-only fields do not appear on dynamic rows. |
| DisplayConfig | Pick the routine's training intent: max attempt hero, cumulative table hero, or session-duration hero. |
| Row snapshot | Actual discipline, actual effort, actual environment, analytics role, and metric profile per expanded row. |

## Gaps To Close

| Gap | Why it matters |
|-----|----------------|
| `MetricType` does not cover all canonical keys, including min SpO2, min HR, time below SpO2 threshold, kicks, arm pulls, equipment, and safety outcome. | Some useful routine metrics cannot yet be hero/display metrics. |
| `getMetricValue()` does not currently calculate every declared alias, notably `cumulativeDistance` and some per-lap speed roll-ups. | Display selection can outpace calculation support. |
| `TrackingConfig` and `CanonicalMetricKey` are parallel vocabularies. | Builder-derived routines need adapters to avoid drift. |
| Routine-level `trackingConfig` is too coarse for mixed routines. | Mixed static/dynamic routines should show row-specific fields during logging. |
| Some context values are better filters than numeric metrics. | Equipment, lung volume, environment, effort, and safety outcomes need analytics facets, not only chart metrics. |

## Recommended Next Implementation Shape

1. Create a data registry where each metric has: canonical key, label, unit, discipline family, capture source, `TrackingConfig` flag, `MetricType` adapter, log field path, and calculation function.
2. Generate `TrackingConfig` from selected layer metric profiles for backward compatibility.
3. Generate hero/secondary/tertiary options from metrics that have display adapters.
4. Store per-row metric profiles in the log plan snapshot for mixed and repeated routines.
5. Keep routine-level `displayConfig` as the summary choice, but make analytics read from row-level facts when a routine is mixed.

## 1. Strategy To Close Hero Metric Gaps

Goal: every metric that is tracked for a routine should be selectable as a hero, secondary, or tertiary display metric. This includes direct fields, calculated fields, row-level rollups, and useful non-numeric status/facet values where the UI can render them clearly.

### 1.0 Implementation Progress

- [x] Step 1: Canonical metric registry foundation added in `src/lib/metrics/registry.ts`.
- [x] Step 2: Layer projection now uses registry adapters for canonical metric keys and labels.
- [ ] Step 3: Expand display metrics so tracked P0/P1/P2/P3 metrics can be selected.
- [x] Step 3a: P0 display metrics added for minimum SpO2, minimum HR, time below SpO2 threshold, cumulative distance, fastest lap, and slowest lap.
- [x] Step 3b: P1 display metrics added for kicks, arm pulls, equipment, and facial gear.
- [ ] Step 3c: P2/P3 display metrics still need capacity, gas, recovery, and status/facet coverage.
- [ ] Step 4: Move metric value resolution behind registry-backed resolvers.
- [x] Step 5a: Hero metric dropdowns now use registry options filtered by the routine tracking config.
- [ ] Step 5b: Add grouped/searchable picker UX and row-level mixed-routine filtering.
- [ ] Step 6: Add routine-family display option and safe-resolution tests.
- [ ] Step 7: Preserve stored display config compatibility through migration/adapters.

### 1.1 Technical Strategy

| Step | Implementation | Acceptance check |
|------|----------------|------------------|
| 1 | Introduce a canonical metric registry in code, starting in `src/lib/routineLayers/metrics.ts` or `src/lib/metrics/registry.ts`. Each entry should include canonical key, display label, short label, category, unit, value kind, compatible discipline families, relevant `TrackingConfig` flags, log field paths, and optional calculation function. | A single registry can answer: tracked by routine, shown in log form, selectable as display metric, and chartable in analytics. |
| 2 | Add adapters between `CanonicalMetricKey`, current `MetricType`, and `TrackingConfig`. Keep current names working, but stop adding new one-off switch cases without a registry entry. | Existing routines still display, while new metrics have an explicit adapter or an explicit no-display reason. |
| 3 | Expand `MetricType` or replace display selection with registry metric IDs so missing tracked metrics can be selected. Start with min SpO2, min HR, time below SpO2 thresholds, kicks, arm pulls, equipment, facial gear, safety outcome, FVC, FVC with packing, gas mix, and per-row lung volume. | Every tracked field in `TrackingConfig` has either a display metric entry or a documented status/facet display entry. |
| 4 | Move metric value resolution out of the large `getMetricValue()` switch into registry-backed resolvers. Support direct log fields, row/lap aggregations, routine-level fallbacks, and formatted non-numeric values. | `getFormattedMetric()` can render both numeric metrics and status/facet metrics without custom UI per metric. |
| 5 | Generate hero metric options from the routine's layer-derived tracking profile. Options should include all metrics relevant to the routine, not only default/standard metrics. | A dry static table exposes SpO2 threshold metrics; a DNF routine exposes arm pulls; a dynamic routine exposes speed/kick metrics. |
| 6 | Add tests for each routine family using default examples and blank custom layers. Tests should assert that tracked metrics are present in display options and that each option resolves safely for empty and populated logs. | No tracked metric can be added without a display-option test failing until it has a registry entry. |
| 7 | Keep backwards compatibility by preserving existing `displayConfig.heroMetric` values and labels. Add a migration adapter only when the stored key is not in the new registry. | Old sessions and cards keep rendering while new routines use registry-backed options. |

### 1.2 Metric Coverage Backlog

| Priority | Metrics | Why first |
|----------|---------|-----------|
| P0 | `minimumSpO2`, `minimumHR`, `timeBelowSpO2Threshold`, `cumulativeDistance`, `fastestLapSpeedMs`, `slowestLapSpeedMs` | Already tracked or partly represented, high value for dry/static and dynamic analytics, and good hero/tertiary candidates. |
| P1 | `kicksPerLap`, `armPullsPerLap`, `averageKicksPerLap`, `averageArmPullsPerLap`, `equipment`, `facialGear` | Important technique metrics, especially for DNF and dynamic training. |
| P2 | `fvcLiters`, `fvcWithPackingLiters`, `packingVolumePercent`, `gasMix`, `endSpO2`, `recoveryQuality`, `urgeToBreathe`, `lucidity`, `contractions` | Advanced static and O2-assisted routines need these, but they can follow once registry rendering supports mixed numeric/status values. |
| P3 | `safetyOutcome`, `sambaBO`, `competitionStatus`, `cardColor`, `recordTag`, `attemptConditions`, `lungVolume` | Better as badges/status/facets than chart metrics, but still useful for hero card context. |

### 1.3 UX Strategy For Metric Selection

The display metric picker should not be one huge alphabetical dropdown. It should behave like a guided chooser over a complete metric catalog.

| UX element | Behavior |
|------------|----------|
| Recommended strip | Show 3-6 suggested metrics first based on routine type, current layer display suggestion, and common combinations. One click sets hero/secondary/tertiary presets. |
| Category tabs | Group the full list into `Performance`, `Workload`, `Recovery`, `Technique`, `Biometrics`, `Environment`, and `Safety/Context`. Only categories with relevant metrics for the current routine appear. |
| Standard/Geek segmented control | `Standard` shows common metrics and recommended defaults. `Geek` reveals all tracked metrics, including advanced physiology and technique fields. This mirrors the logging-stage philosophy. |
| Search field | Search labels, synonyms, units, and descriptions. Searching `oxygen` should find SpO2 metrics; searching `pulls` should find arm-pull metrics. |
| Metric cards, not raw options | Each selectable metric should show label, unit, source (`manual`, `recorder`, `calculated`, `status`), and a one-line meaning. This avoids cryptic keys like `avgSpeedMs`. |
| Compatibility indicators | Show small badges such as `Tracked`, `Calculated`, `Recorder`, `Needs data`, or `Advanced`. Do not hide relevant metrics only because the current log has no value yet. |
| Preview panel | Show a session-card preview with the chosen hero/secondary/tertiary labels. Empty values can render as placeholders, so users understand card layout before logs exist. |
| Duplicate guard | Once a metric is selected as hero, dim or mark it in secondary/tertiary lists to avoid accidental duplicate cards. |
| Missing-adapter handling | During migration, metrics that are tracked but not yet display-ready should appear in a `Coming soon display support` group only in dev/admin mode, not in the normal user picker. |

### 1.4 Picker Flow

1. User clicks `Next` from layer authoring to display metrics.
2. The app derives all relevant metrics from layers and `trackingConfig`.
3. The top of the page offers recommended preset combinations for that routine type.
4. The user can accept a preset or open the full picker for hero, secondary, or tertiary.
5. The picker opens with category tabs and standard/geek mode, not a long select list.
6. Selecting a metric updates the preview immediately.
7. Save writes `displayConfig` using registry metric IDs/labels while preserving legacy `MetricType` compatibility.

### 1.5 Implementation Phases

| Phase | Scope | Commit target |
|-------|-------|---------------|
| A | Add metric registry data and adapters for current `MetricType` metrics. | No UI change; tests prove old display metrics still resolve. |
| B | Add missing P0 display adapters and calculations. | Dry static and dynamic interval gaps become selectable. |
| C | Replace hard-coded hero metric dropdowns with registry-derived option groups. | UI shows recommended strip, categories, and search. |
| D | Add preview and duplicate-guard behavior to the display metric step. | UX becomes clear without a huge flat list. |
| E | Add P1/P2/P3 metric adapters and status/facet rendering. | Every tracked metric has a display path or intentional status-card path. |
