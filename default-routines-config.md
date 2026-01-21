# New routines

## RV breath hold series

This is a routine that I often use. It's performed dry, lying down with a small pillow under my head and no facial equipment (for safety reasons).

The aim is to become as hypoxic as possible and to maintain concentration at lower and lower levels or spo2. I tend to measure this using an spo2 meter on my finger, ear or nose.

Typically I'll do a series of 6-10 holds and the longest duration hold will be on the third or fourth hold. But this is a bit unpredictable. Duration changes from rep to rep and from day to day.

The important metrics for the routine are:
- longest breath hold time
- number of reps
- Lowest Spo2
- Amount of cumulative breath hold time
- Amount of cumulative breath hold time with spo2 below 70%, below 60%, below 50% and below 40%
The important metrics for comparison over time include:
- longest breath hold time
- lowest spo2
- Amount of cumulative breath hold time below a selected spo2% (70%, 60%, 50%, 40%)

This routine is always dry (never in the pool) so none of the pool metrics need to be recorded. No equipment is used. Other metrics should be available for recording.

---
## Implementation Complete! ✅

I've successfully implemented the biometric tracking feature for dry static breath hold training. Here's what was created:

### Files Created:

1. **[biometricCsvParser.ts](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html)** - Utility to parse pulse oximeter CSV exports with:
    
    - `parseBiometricCsv()` - Parse raw CSV content
    - `processRepBiometrics()` - Calculate per-rep SpO2/HR stats
    - `calculateSessionBiometricSummary()` - Aggregate session-level metrics
    - Helper functions for time formatting and SpO2 severity colors
2. **[BiometricImportModal.svelte](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html)** - Modal for importing CSV data with:
    
    - Drag-and-drop file upload
    - Preview of parsed data with session summary
    - Per-rep biometric stats display
    - Safety warnings for low SpO2 readings

### Files Updated:

3. **[types.ts](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html)** - Added biometric fields to:
    
    - [TrackingConfig](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html) - New fields: [trackPerRepSpO2](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html), [trackPerRepHR](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html), [trackSpO2Thresholds](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html), [isDryTraining](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html)
    - [LapData](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html) - New fields: [spo2Min](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html), [spo2Avg](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html), [hrMin](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html), [hrMax](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html), [hrAvg](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html), [timeBelow70/60/50/40](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html)
    - [RepEditorData](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html) - Same biometric fields
    - [RoutineLog](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html) - Session summary fields: [hasBiometricData](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html), [longestHold](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html), [lowestSpO2](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html), etc.
    - New types: [BiometricReading](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html), [BiometricRoundSummary](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html), [ParsedBiometricSession](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html), [ProcessedRepBiometrics](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html)
4. **[RepEditor.svelte](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html)** - Added:
    
    - Optional SpO2 and HR input columns
    - Color-coded SpO2 severity display
    - Props for biometric tracking options
5. **[QuickLogForm.svelte](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html)** - Added:
    
    - Biometric tracking section (appears when routine has biometric tracking enabled)
    - Import CSV button that opens BiometricImportModal
    - Integration with RepEditor for manual entry
    - Session summary display after import
6. **[seed-data.ts](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html)** - Added:
    
    - [dryStaticBiometricTracking](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html) config with all biometric fields enabled
    - New **RV Breath Hold Series** routine (system-rv-breath-hold)
    - Updated all other tracking configs with biometric fields (disabled)

### How to Test:

1. Run `npm run seed` to add the new RV Breath Hold Series routine
2. Start the dev server with `npm run dev`
3. Log a session for "RV Breath Hold Series"
4. You should see the biometric section with:
    - Import CSV button
    - RepEditor with SpO2/HR columns
    - Session summary after importing data
## Implementation Plan for RV Breath Hold Series

### Overview
This implementation adds support for the RV Breath Hold Series routine, including:
1. Per-rep SpO2 and HR tracking
2. CSV import from oximeter/HR monitor exports
3. Threshold-based analytics (time below 70/60/50/40% SpO2)
4. New data model fields and calculated metrics

### Phase 1: Data Model Updates

#### 1.1 Update `LapData` Interface (src/lib/types.ts)
Add new fields for biometric data per rep:
```typescript
export interface LapData {
  // ... existing fields ...
  
  // NEW: Per-rep biometric data
  spo2Min?: number;      // Minimum SpO2 during this rep (0-100)
  spo2Avg?: number;      // Average SpO2 during this rep
  hrMin?: number;        // Minimum HR during this rep
  hrMax?: number;        // Maximum HR during this rep
  hrAvg?: number;        // Average HR during this rep
  
  // NEW: Time spent below thresholds during this rep (seconds)
  timeBelow70?: number;  // Seconds below 70% SpO2
  timeBelow60?: number;  // Seconds below 60% SpO2
  timeBelow50?: number;  // Seconds below 50% SpO2
  timeBelow40?: number;  // Seconds below 40% SpO2
}
```

#### 1.2 Update `RepEditorData` Interface (src/lib/types.ts)
Add fields for biometric editing:
```typescript
export interface RepEditorData {
  // ... existing fields ...
  
  // NEW: Per-rep biometric inputs
  spo2Min?: number;
  hrMin?: number;
  hrMax?: number;
  
  // NEW: Threshold times (optional, calculated from CSV import)
  timeBelow70?: number;
  timeBelow60?: number;
  timeBelow50?: number;
  timeBelow40?: number;
}
```

#### 1.3 Update `TrackingConfig` Interface (src/lib/types.ts)
Add new tracking flags:
```typescript
export interface TrackingConfig {
  // ... existing fields ...
  
  // NEW: Per-rep biometric tracking
  trackPerRepSpO2: boolean;    // Show SpO2 input per rep
  trackPerRepHR: boolean;      // Show HR input per rep
  trackSpO2Thresholds: boolean; // Enable threshold calculations
}
```

#### 1.4 Update `RoutineLog` Interface (src/lib/types.ts)
Add session-level calculated fields:
```typescript
export interface RoutineLog {
  // ... existing fields ...
  
  // NEW: Session-level biometric summaries (calculated)
  longestHold?: number;        // Max rep duration in seconds
  lowestSpO2?: number;         // Min SpO2 across all reps
  totalTimeBelow70?: number;   // Cumulative seconds below 70%
  totalTimeBelow60?: number;   // Cumulative seconds below 60%
  totalTimeBelow50?: number;   // Cumulative seconds below 50%
  totalTimeBelow40?: number;   // Cumulative seconds below 40%
  
  // NEW: Flag for imported biometric data
  hasBiometricData?: boolean;
  importedFromCsv?: string;    // Original filename if imported
}
```

### Phase 2: CSV Importer

#### 2.1 Create CSV Parser Utility (src/lib/utils/biometricCsvParser.ts)
```typescript
interface RoundSummary {
  roundNumber: number;
  recoverySeconds: number;
  apneaSeconds: number;
}

interface BiometricReading {
  absoluteTime: string;    // "08:46"
  intervalTime: string;    // "00:00"
  intervalType: 'Rest' | 'Apnea';
  hr: number;
  spo2: number;
}

interface ParsedBiometricCsv {
  routineName: string;
  timestamp: Date;
  rounds: RoundSummary[];
  biometrics: BiometricReading[];
  
  // Calculated per-round metrics
  roundMetrics: {
    roundNumber: number;
    apneaSeconds: number;
    recoverySeconds: number;
    minSpO2: number;
    avgSpO2: number;
    minHR: number;
    maxHR: number;
    avgHR: number;
    timeBelow70: number;
    timeBelow60: number;
    timeBelow50: number;
    timeBelow40: number;
  }[];
}

export function parseBiometricCsv(csvContent: string): ParsedBiometricCsv;
```

#### 2.2 CSV Import Flow
1. User selects CSV file from import page
2. Parser extracts round summaries and biometric readings
3. Calculate per-round metrics from biometric data
4. Pre-populate RoutineLog form with extracted data
5. User can review and edit before saving
6. Store both summary and detailed lap data

### Phase 3: UI Components

#### 3.1 Update RepEditor Component (src/lib/components/RepEditor.svelte)
- Add optional SpO2 and HR columns
- Show threshold time columns when available (from CSV import)
- Color-code SpO2 values (green >80, yellow 60-80, orange 50-60, red <50)
- Add "Import from CSV" button

#### 3.2 Create BiometricImportModal Component
- File picker for CSV upload
- Preview of parsed data before import
- Option to select which routine to associate with
- Validation feedback

#### 3.3 Update QuickLogForm Component
- Conditional rendering of biometric fields based on routine config
- Support for manual SpO2/HR entry per rep
- Summary display: longest hold, lowest SpO2, threshold times

### Phase 4: Analytics & Display

#### 4.1 Session Card Display
- Hero metric: Cumulative hold time OR longest hold
- Secondary metric: Lowest SpO2
- Badge indicators for threshold achievements

#### 4.2 Analytics Charts
- Per-session SpO2 trend over reps
- Historical trend: Lowest SpO2 over time
- Threshold time trends (time below 70/60/50/40%)
- Compare sessions overlay

### Phase 5: Default Routine Template

#### 5.1 RV Breath Hold Series Routine Configuration
```json
{
  "id": "system-rv-breath-hold",
  "name": "RV Breath Hold Series",
  "description": "Series of maximal hypoxic breath holds performed dry. Track SpO2 desaturation and time at extreme hypoxia levels.",
  "disciplines": ["STA"],
  "activityType": "freeform-intervals",
  "tags": ["hypoxic", "dry", "rv"],
  
  "trackingConfig": {
    "trackPoolLength": false,
    "trackPoolType": false,
    "trackWaterTemperature": false,
    "trackInitialBreatheUpTime": true,
    "trackTotalTime": true,
    "trackRepsCompleted": true,
    "trackRepDuration": true,
    "trackRestBetweenLaps": true,
    "trackMinimumSpO2": true,
    "trackMinimumHR": true,
    "trackPerRepSpO2": true,
    "trackPerRepHR": true,
    "trackSpO2Thresholds": true,
    "trackBreathingTechnique": true,
    "trackRPE": true,
    "trackJoyScale": true,
    "trackNotes": true,
    "trackFacialGear": false,
    "trackEquipmentUsed": false,
    "trackBuddyName": false
  },
  
  "displayConfig": {
    "heroMetric": "cumulativeHoldTime",
    "heroMetricLabel": "Total Hold Time",
    "secondaryMetric": "lowestSpO2",
    "secondaryMetricLabel": "Lowest SpO2"
  }
}
```

### Implementation Order

1. **Phase 1**: Data model updates (types.ts)
2. **Phase 2a**: CSV parser utility (can be tested independently)
3. **Phase 3a**: RepEditor enhancements for manual SpO2/HR entry
4. **Phase 2b**: CSV import UI integration
5. **Phase 3b**: QuickLogForm updates
6. **Phase 4**: Analytics charts
7. **Phase 5**: Seed default routine

### Files to Create/Modify

**New Files:**
- `src/lib/utils/biometricCsvParser.ts` - CSV parser
- `src/lib/components/BiometricImportModal.svelte` - Import UI
- `src/routes/(app)/import/biometric/+page.svelte` - Import page

**Modified Files:**
- `src/lib/types.ts` - Data model updates
- `src/lib/components/RepEditor.svelte` - SpO2/HR columns
- `src/lib/components/QuickLogForm.svelte` - Biometric fields
- `src/lib/components/SessionCard.svelte` - Display updates
- `src/lib/utils/metrics.ts` - Threshold calculations
- `scripts/seed-data.ts` - Add RV routine template

---

## Scope: All Dry Static Routines (Not Just RV)

### Applicable Routines
The biometric CSV import and SpO2/HR tracking applies to ALL dry static routines:
1. **RV Breath Hold Series** (new system routine)
2. **Static Max Attempt** (dry training mode)
3. **Gentle 2-Breath** (can be done dry)
4. **Any custom STA routine** marked as dry training

### Not Applicable
- **Dynamic routines** (DYN/DNF/DYNB) - cannot use oximeter in water
- **Wet static** (STA in pool) - cannot use oximeter in water

### Implementation Strategy
1. Add `isDryTraining: boolean` to TrackingConfig
2. When enabled: show biometric fields, enable CSV import button
3. System routines: flag appropriately based on typical use
4. Custom routines: user can toggle in routine builder

---

## Data Entry Tiers

### Tier 1: Quick Log (Default - No CSV)
For fast poolside/post-session entry when no oximeter data is available:
- Number of reps completed
- Duration of **longest hold only**
- Lowest SpO2 (optional, single value)
- Lowest HR (optional, single value)
- Estimated cumulative hold time

### Tier 2: Detailed Manual Entry (Optional)
User taps "Add Rep Details" to expand per-rep editor:
- Duration for each rep
- SpO2 and HR fields per rep (optional)
- Rest times per rep
- Can skip biometrics, just enter durations

### Tier 3: CSV Import (Full Data)
Import from oximeter export for complete data:
- Auto-populates all per-rep durations and rest times
- Calculates per-rep SpO2/HR metrics (min, max, avg)
- Calculates threshold times (below 70/60/50/40%)
- Most comprehensive analytics possible

---

## Additional Considerations

### 1. CSV Format Compatibility
- Current parser designed for specific oximeter app export format
- May need to support multiple formats in future (different apps/devices)
- Consider adding format detection or format selector

### 2. Data Privacy
- Biometric data is sensitive health information
- Ensure it's protected by existing user-only Firestore rules
- Consider whether to include in public/social feed displays

### 3. Offline Support
- CSV import should work offline if possible
- Store file reference, parse on device, sync when online

### 4. Analytics Comparisons
- Enable comparison of SpO2 curves across sessions
- Track improvement in hypoxic tolerance over time
- Show trends in threshold times (improving = more time at low SpO2)

### 5. Safety Considerations
- Consider adding warnings for very low SpO2 values (<50%)
- Could prompt users about safe practices for hypoxic training
- Optional: flag sessions with concerning patterns

### 6. Future Extensions
- Support for other data imports (video timing analysis for wet training)
- Integration with smartwatch HR data
- GPS/depth data for depth disciplines
- Breathing rate analysis from video

---

# Default Routines Configuration

This document specifies the exact configuration for each of the 4 system-provided default routines. Edit the values below, then I'll update `scripts/seed-data.ts` to match.

---

## 1. Dynamic Max Attempt

**Basic Info:**
- **ID:** `system-dynamic-max`
- **Name:** Dynamic Max Attempt
- **Description:** Single maximal effort dive with own-time breathe-up. Track your personal best for DYN, DYNB, or DNF.
- **Disciplines:** DYN, DYNB, DNF - these should be selectable with a change of appearance to indicate which discipline has been selected.
- **Tags:** max-attempt - this should be set by default
- Optional tags: pb-attempt, pb - these should be user selected before/after the dive

**Routine Structure:** *(Pre-defined in template - leave blank if not needed)*
- **restBetweenReps:** _(How many seconds to rest between each rep? Leave blank for max attempts or user-defined rest)_
- **repDistance:** _(Meters per rep - e.g., 50m for Sweet 16. Leave blank for max attempts where distance is unknown)_
- **repDuration:** _(Seconds per rep for static routines - e.g., 90 seconds for Gentle 2-Breath. Leave blank for max attempts)_
- **numberOfReps:** _(Total reps in routine - e.g., 16 for Sweet 16. Leave blank for max attempts)_

**Tracking Configuration:** *(Which fields should appear when logging this routine?)*

**Session Context:**
- **trackPoolLength:** true _(Ask: "What's the pool length?" - needed to calculate actual laps)_
- **trackInitialBreatheUpTime:** true _(Ask: "How long did you breathe up?" - in mm:ss format)_

**Performance Metrics:**
- **trackTotalDistance:** true _(Ask: "Total distance covered?" - for max attempts, in meters)_
- **trackTotalTime:** true _(Ask: "Total dive time?" - in mm:ss format)_
- **trackLapsCompleted:** false _(Not needed - calculated from totalDistance ÷ poolLength)_
- **trackTimePerLap:** true _(Allow entering time for each individual pool lap - optional, can add later from video)_
- **trackRestBetweenLaps:** false _(Single attempt, no rest between laps)_
- **trackKicksPerLap:** true _(Allow entering kicks per lap - optional, can add later from video)_
- **trackArmPullsPerLap:** true _(Allow entering arm pulls per lap - optional, DNF only, can add later from video)_

**Training Context:**
- **trackBreathingTechnique:** true _(Ask: "What breathe-up technique?" - tidal/hyperventilation/hypoventilation)_
- **trackRPE:** true _(Ask: "How difficult?" - 1-10 scale)_
- **trackJoyScale:** true _(Ask: "How enjoyable?" - 1-10 scale)_
- **trackHoursSinceLastMeal:** true _(Ask: "Hours since last meal?" - optional)_
- **trackNotes:** true _(Free text notes field)_

---

## 2. Static Max Attempt

**Basic Info:**
- **ID:** `system-static-max`
- **Name:** Static Max Attempt
- **Description:** Single maximal static breath-hold with own-time breathe-up. Track your personal best for STA.
- **Disciplines:** STA
- **Tags:** max-attempt, pb

**Routine Structure:** *(Pre-defined in template - leave blank if not needed)*
- **restBetweenReps:** _(Leave blank - single max attempt)_
- **repDistance:** _(N/A for static)_
- **repDuration:** _(Leave blank - duration is what we're trying to maximize)_
- **numberOfReps:** _(Leave blank - single attempt)_

**Tracking Configuration:** *(Which fields should appear when logging this routine?)*

**Session Context:**
- **trackPoolLength:** false _(Not needed for static)_
- **trackInitialBreatheUpTime:** true _(Ask: "How long did you breathe up?" - in mm:ss format)_

**Performance Metrics:**
- **trackTotalDistance:** false _(N/A for static)_
- **trackTotalTime:** true _(Ask: "How long did you hold?" - in mm:ss format)_
- **trackLapsCompleted:** false _(N/A for static)_
- **trackTimePerLap:** false _(N/A for static - only one hold)_
- **trackRestBetweenLaps:** false _(N/A for static)_
- **trackKicksPerLap:** false _(N/A for static)_
- **trackArmPullsPerLap:** false _(N/A for static)_

**Training Context:**
- **trackBreathingTechnique:** true _(Ask: "What breathe-up technique?" - tidal/hyperventilation/hypoventilation)_
- **trackRPE:** true _(Ask: "How difficult?" - 1-10 scale)_
- **trackJoyScale:** true _(Ask: "How enjoyable?" - 1-10 scale)_
- **trackHoursSinceLastMeal:** true _(Ask: "Hours since last meal?" - optional)_
- **trackNotes:** true _(Free text notes field)_

---

## 3. Sweet 16

**Basic Info:**
- **ID:** `system-sweet-16`
- **Name:** Sweet 16
- **Description:** Sixteen 50-meter reps with user-defined rest intervals. Classic CO₂ tolerance builder for dynamic disciplines.
- **Disciplines:** DYN, DYNB, DNF
- **Tags:** co2, endurance

**Routine Structure:** *(Pre-defined in template - leave blank if not needed)*
- **restBetweenReps:** _N/A
- **repDistance:** 50m
- **repDuration:** _(N/A for dynamic)_
- **numberOfReps:** 16 _(16 reps total)_

**Tracking Configuration:** *(Which fields should appear when logging this routine?)*

**Session Context:**
- **trackPoolLength:** true _(Ask: "What's the pool length?" - e.g., 25m or 50m)_
- **trackInitialBreatheUpTime:** true _(Ask: "How long did you breathe up?" - in mm:ss format)_

**Performance Metrics:**
- **trackTotalDistance:** false _(Not needed - calculated as 16 × 50m = 800m)_
- **trackTotalTime:** true _(Ask: "Total session time?" - in mm:ss format, optional)_
- **trackLapsCompleted:** true _(Ask: "How many reps completed?" - to see if all 16 were done)_
- **trackTimePerLap:** true _(Allow entering time per rep - optional, can add later from video)_
- **trackRestBetweenLaps:** true _(Allow entering rest per rep - optional, can add later from video)_
- **trackKicksPerLap:** false _(not needed for this routine)_
- **trackArmPullsPerLap:** false _(not needed for this routine)

**Training Context:**
- **trackBreathingTechnique:** false _(Ask: "What breathe-up technique?" - tidal/hyperventilation/hypoventilation)_
- **trackRPE:** true _(Ask: "How difficult?" - 1-10 scale)_
- **trackJoyScale:** true _(Ask: "How enjoyable?" - 1-10 scale)_
- **trackHoursSinceLastMeal:** true _(Optional - skip for quick logging)_
- **trackNotes:** true _(Free text notes field)_

---

## 4. Gentle 2-Breath

**Basic Info:**
- **ID:** `system-gentle-2-breath`
- **Name:** Gentle 2-Breath
- **Description:** Ten static holds of 1:30 with recovery periods long enough for just two breaths. Gentle CO₂ tolerance training.
- **Disciplines:** STA
- **Tags:** co2, beginner

**Routine Structure:** *(Pre-defined in template - leave blank if not needed)*
- **restBetweenReps:** _(Leave blank - user decides, typically 15-20 seconds for 2 breaths)_
- **repDistance:** _(N/A for static)_
- **repDuration:** 90 _(Each hold is 1:30 = 90 seconds)_
- **numberOfReps:** 10 _(10 reps total)_

**Tracking Configuration:** *(Which fields should appear when logging this routine?)*

**Session Context:**
- **trackPoolLength:** false _(Not needed for static)_
- **trackInitialBreatheUpTime:** true _(Ask: "How long did you breathe up?" - in mm:ss format)_

**Performance Metrics:**
- **trackTotalDistance:** false _(N/A for static)_
- **trackTotalTime:** true _(Ask: "Total session time?" - in mm:ss format, optional)_
- **trackLapsCompleted:** true _(Ask: "How many reps completed?" - to see if all 10 were done)_
- **trackTimePerLap:** false _(Each rep is fixed at 1:30, no need to track individual times)_
- **trackRestBetweenLaps:** true _(Allow entering rest per rep - should be ~2 breaths worth)_
- **trackKicksPerLap:** false _(N/A for static)_
- **trackArmPullsPerLap:** false _(N/A for static)_

**Training Context:**
- **trackBreathingTechnique:** true _(Ask: "What breathe-up technique?" - tidal/hyperventilation/hypoventilation)_
- **trackRPE:** true _(Ask: "How difficult?" - 1-10 scale)_
- **trackJoyScale:** true _(Ask: "How enjoyable?" - 1-10 scale)_
- **trackHoursSinceLastMeal:** true _(Optional - skip for quick logging)_
- **trackNotes:** true _(Free text notes field)_

---

## Notes

**Instructions:**
1. Review each routine above
2. Fill in the blank fields or correct any values that are wrong
3. Adjust the tracking configuration booleans (true/false) as needed
4. Once you've made your edits, I'll update `scripts/seed-data.ts` to match

**Key Decisions to Make:**
- Should max attempts track `numberOfReps: 1` or leave it undefined? - leave it undefined
- Should CO₂ routines specify `initialBreatheUpTime` or let users decide each session? - let users decide
- Should `restBetweenReps` be pre-defined or user-defined per session? - user defined
- Which tracking fields are essential vs optional for each routine type? I think this has been addressed above now.
