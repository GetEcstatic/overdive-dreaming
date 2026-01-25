# Training Metrics & Tags - Current Structure

This document catalogs all existing training metrics and tags in Overdive, along with their definitions and calculations. Use this for planning the reconceptualization of how metrics are labelled, grouped, and calculated.

---

## 🚧 STATUS: Implementation Plan Ready

**Status:** Activity Types model designed + Implementation plan created.

**Where we are:**
- ✅ Identified 5 Activity Types: Max Attempt, Submax Attempt, Structured Intervals, Freeform Intervals, Free Training
- ✅ Designed editable per-rep logging for interval training
- ✅ Defined adaptive routine editor behavior (discipline-based + activity type-based)
- ✅ Listed UX efficiency improvements
- ✅ Clarified metric naming (diveDuration, cumulativeHoldTime, etc.)
- ✅ Added speed calculations for dynamic intervals
- ✅ Created detailed implementation plan (see below)

**Core Problem Identified:**
> "Currently it feels there are times when a user doesn't really know how to use routines effectively.
> Or because their routine doesn't seem to fit a neatly defined structure, or because they deviate 
> from the structure but still want to capture the data."

**Solution:** 5 clear Activity Types + adaptive editor + editable rep logging = users can always capture what they actually did.

---

# 📋 IMPLEMENTATION PLAN

## Guiding Principles

1. **No breaking changes** - Existing functionality continues to work
2. **No data loss** - All Firebase data preserved
3. **Backward compatible** - Old routines/logs work with new system
4. **Incremental rollout** - Ship in phases, validate each phase
5. **Simple maintenance** - Minimize complexity for future changes

---

## Phase 0: Data Backup & Safety (Pre-work)

### 0.1 Firebase Data Backup
**Goal:** Create a full backup before any changes

**Tasks:**
- [ ] Export all Firestore collections to JSON
  - `/routines/*` (all routine templates)
  - `/routines/*/logs/*` (all routine logs)
  - `/users/*` (user data, settings, PBs)
  - `/config/*` (system config, suggested tags)
- [ ] Store backup in secure location (Cloud Storage or local)
- [ ] Document backup restoration procedure
- [ ] Test restoration on a test project

**Script to create:** `scripts/backup-firestore.ts`

### 0.2 Audit Existing Data
**Goal:** Understand current data shapes and edge cases

**Tasks:**
- [ ] Query all unique `protocolType` values in routines
- [ ] Count routines by structure type (none/uniform/table)
- [ ] Identify routines with custom tracking configs
- [ ] List all unique metric combinations used
- [ ] Export summary report

**Script to create:** `scripts/audit-data.ts`

---

## Phase 1: Schema Evolution (Non-breaking)

### 1.1 Add `activityType` Field to Types
**Goal:** Extend types without breaking existing code

**File:** `src/lib/types.ts`

```typescript
// NEW: Activity type enum
export type ActivityType = 
  | 'max-attempt'
  | 'submax-attempt' 
  | 'structured-intervals'
  | 'freeform-intervals'
  | 'free-training';

// EXTEND: RoutineTemplate
export interface RoutineTemplate {
  // ... existing fields ...
  
  // NEW: Activity type (optional during migration)
  activityType?: ActivityType;
  
  // DEPRECATED (but still supported)
  protocolType?: 'none' | 'uniform' | 'table';
}
```

### 1.2 Add New Metric Field Names (Aliases)
**Goal:** Introduce clearer names while keeping old ones

**File:** `src/lib/types.ts`

```typescript
export interface RoutineLog {
  // ... existing fields ...
  
  // OLD (still supported)
  totalTime?: number;
  totalDistance?: number;
  
  // NEW (aliases - will be populated automatically)
  diveDuration?: number;      // = totalTime
  diveDistance?: number;      // = totalDistance
  cumulativeHoldTime?: number; // calculated
  avgSpeed?: number;          // calculated
}
```

### 1.3 Create Compatibility Layer
**Goal:** Automatically map old fields to new fields on read

**File:** `src/lib/utils/migration.ts` (NEW)

```typescript
export function normalizeRoutineLog(log: RoutineLog): RoutineLog {
  return {
    ...log,
    // Populate new fields from old
    diveDuration: log.diveDuration ?? log.totalTime,
    diveDistance: log.diveDistance ?? log.totalDistance,
    // Calculate derived fields
    cumulativeHoldTime: calculateCumulativeHoldTime(log),
    avgSpeed: calculateAvgSpeed(log),
  };
}

export function normalizeRoutineTemplate(routine: RoutineTemplate): RoutineTemplate {
  return {
    ...routine,
    // Infer activityType from protocolType if not set
    activityType: routine.activityType ?? inferActivityType(routine),
  };
}
```

### 1.4 Infer Activity Type from Existing Routines
**Goal:** Map old protocolType to new activityType

**Mapping logic:**
```typescript
function inferActivityType(routine: RoutineTemplate): ActivityType {
  // Check tags first
  if (routine.tags?.includes('max-attempt')) return 'max-attempt';
  if (routine.tags?.includes('sub-max')) return 'submax-attempt';
  
  // Check protocol type
  if (routine.protocolType === 'table') return 'structured-intervals';
  if (routine.protocolType === 'uniform') return 'structured-intervals';
  if (routine.protocolType === 'none') {
    // Could be max, submax, or free - check tracking config
    if (routine.trackingConfig?.trackRepsCompleted) return 'freeform-intervals';
    return 'max-attempt'; // Default single-dive
  }
  
  return 'free-training'; // Fallback
}
```

---

## Phase 2: Update Data Access Layer

### 2.1 Wrap Firestore Reads with Normalization
**Goal:** All reads return normalized data

**File:** `src/lib/firestore.ts`

```typescript
// Modify existing getRoutineLogs()
export async function getRoutineLogs(routineId: string): Promise<RoutineLog[]> {
  const logs = await fetchLogsFromFirestore(routineId);
  return logs.map(normalizeRoutineLog);  // NEW: normalize on read
}

// Modify existing getRoutineTemplate()
export async function getRoutineTemplate(routineId: string): Promise<RoutineTemplate> {
  const routine = await fetchRoutineFromFirestore(routineId);
  return normalizeRoutineTemplate(routine);  // NEW: normalize on read
}
```

### 2.2 Update Writes to Include New Fields
**Goal:** New logs include both old and new field names

**File:** `src/lib/firestore.ts`

```typescript
export async function createRoutineLog(log: Partial<RoutineLog>): Promise<void> {
  const normalizedLog = {
    ...log,
    // Write both old and new field names
    totalTime: log.totalTime ?? log.diveDuration,
    totalDistance: log.totalDistance ?? log.diveDistance,
    diveDuration: log.diveDuration ?? log.totalTime,
    diveDistance: log.diveDistance ?? log.totalDistance,
  };
  await saveToFirestore(normalizedLog);
}
```

---

## Phase 3: UI Updates (Incremental)

### 3.1 Add Activity Type Selection to Routine Builder
**Goal:** New routines can select activity type

**Changes:**
- Add step to wizard for activity type selection (after basic info)
- Activity type selection controls which subsequent steps appear
- Default to inferring from existing settings for edit mode

### 3.2 Update Tracking Selection Based on Activity Type
**Goal:** Show only relevant tracking options

**Changes:**
- Max/Submax: Show single-dive fields only
- Structured Intervals: Show rep table builder + per-rep tracking
- Freeform Intervals: Show simple rep counter + optional per-rep
- Free Training: Show minimal fields + "add more" button

### 3.3 Create Editable Rep Logger Component
**Goal:** Log intervals with per-rep editing

**New component:** `src/lib/components/RepLogger.svelte`

Features:
- Pre-filled from routine structure (for structured intervals)
- Editable per-rep: duration/distance, rest time
- Add/remove reps
- Shows planned vs actual diff
- Calculates totals and speeds automatically

### 3.4 Update Session Cards with New Metrics
**Goal:** Display new metric names and speed

**Changes:**
- Update `SessionCard.svelte` to use new field names
- Add speed display option
- Update metric formatters

---

## Phase 4: Migration Script (Optional but Recommended)

### 4.1 Backfill Activity Type to Existing Routines
**Goal:** All existing routines have activityType field

**Script:** `scripts/backfill-activity-type.ts`

```typescript
// For each routine without activityType:
// 1. Infer activityType from protocolType/tags
// 2. Update routine document
// 3. Log changes for audit
```

### 4.2 Backfill New Field Names to Existing Logs
**Goal:** All logs have new field names (optional)

**Script:** `scripts/backfill-metric-names.ts`

```typescript
// For each log:
// 1. Copy totalTime -> diveDuration (if not exists)
// 2. Copy totalDistance -> diveDistance (if not exists)
// 3. Calculate and store cumulativeHoldTime, avgSpeed
```

**Note:** This is optional since normalization layer handles it on read. Only run if we want to fully migrate the data.

---

## Phase 5: Cleanup & Deprecation Plan

### 5.1 Field Deprecation Strategy

**Philosophy:** Keep old fields working indefinitely while encouraging use of new names. Firestore is schemaless, so old field names have minimal cost.

**Deprecated Fields → New Names:**

| Old Field | New Field | Notes |
|-----------|-----------|-------|
| `totalTime` | `diveDuration` | Single dive time |
| `totalDistance` | `diveDistance` | Single dive distance |
| `protocolType` | `activityType` | 5 activity types vs 3 protocol types |
| `totalBreathHoldTime` | `cumulativeHoldTime` | Sum of holds in intervals |

**Timeline:**
1. **Now:** Old fields continue to work via normalization layer
2. **3 months:** Add console.warn() for old field usage in dev mode
3. **6 months:** Update documentation to only show new names
4. **Future:** Consider removal only after all active users have migrated

### 5.2 Code Comments for Deprecation

In `types.ts`, old fields are marked with `@deprecated` JSDoc comments:

```typescript
export interface RoutineLog {
  // ...
  
  /** @deprecated Use diveDuration instead */
  totalTime?: number;
  
  /** New preferred name */
  diveDuration?: number;
}
```

### 5.3 Migration Commands

```bash
# Run backup first (always!)
npm run backup

# Dry run to see what would change
npm run migrate:activity-types:dry

# Apply migration
npm run migrate:activity-types

# Audit data to verify
npm run audit
```

### 5.4 Removal Checklist (Future Major Version)

Only proceed when:
- [ ] 6+ months since new fields introduced
- [ ] All active users on new client version
- [ ] No errors in analytics from old field usage
- [ ] Full data migration completed
- [ ] Team sign-off on breaking change

Steps:
1. Remove old field names from TypeScript interfaces
2. Remove normalization mappings from `migration.ts`
3. Update all component references
4. Run full test suite
5. Deploy as major version bump

---

## Testing Strategy

### Unit Tests
- [ ] `normalizeRoutineLog` correctly maps old → new fields
- [ ] `normalizeRoutineTemplate` correctly infers activityType
- [ ] Speed calculations are accurate
- [ ] Metric formatters handle new names

### Integration Tests
- [ ] Existing routines load correctly
- [ ] New routines save with all fields
- [ ] Old logs display correctly
- [ ] New logs include all fields

### Manual Testing Checklist
- [ ] Create routine with each activity type
- [ ] Log session for each activity type
- [ ] Edit existing routine
- [ ] View existing logs
- [ ] Check analytics still work
- [ ] Verify PBs still calculate

---

## Rollout Plan

### Week 1: Phase 0 + 1
- Backup data
- Audit existing data
- Deploy schema changes (types only, no UI changes)
- Validate no breaking changes

### Week 2: Phase 2
- Deploy normalization layer
- Deploy write changes
- Monitor for errors
- Validate data integrity

### Week 3-4: Phase 3
- Deploy UI updates incrementally
- A/B test new routine builder (if possible)
- Gather user feedback
- Iterate on UX

### Week 5+: Phase 4
- Run backfill scripts
- Validate migrated data
- Plan for Phase 5 (future)

---

## Rollback Plan

If issues are detected:

1. **UI Issues:** Revert UI changes, normalization layer keeps data working
2. **Data Issues:** Restore from Phase 0 backup
3. **Critical Issues:** Feature flag to disable new flow, serve old UI

**Key:** Normalization layer means old data always works, reducing risk.

---

## 🔍 Current Complexity Analysis

### Current Routine Structure Options

The current model has **3 protocol types** (from ProtocolSetupStep):

| Type | Fields | Use Case | Problem |
|------|--------|----------|---------|
| **None** | No structure | Max attempts, freeform | Feels undefined |
| **Uniform** | `restBetweenReps`, `repDistance`, `numberOfReps` | Fixed interval training | What if user deviates? |
| **Table** | `RoutineTable` with progressive rows | CO₂/O₂ tables, advanced protocols | Complex to create |

### Current Wizard Steps (5 steps)

1. **Basic Info** - Name, description, disciplines, tags
2. **Protocol Setup** - Structure type (none/uniform/table)
3. **Tracking Selection** - 30+ checkbox toggles
4. **Display Config** - Hero/secondary metrics
5. **Review & Create**

### Pain Points

1. **Protocol rigidity** - What if I do 14 of 16 reps? Structure assumes completion.
2. **Too many tracking options** - 30+ checkboxes is overwhelming
3. **Log entry vs routine definition confusion** - Users conflate "what I did" with "what the routine defines"
4. **Display config complexity** - Users may not understand hero/secondary metric concepts

---

## 💡 Proposed Simplification

### Concept: Separate "Routine Template" from "Activity Type"

Instead of routines defining rigid structures, create **activity types** that define what data to collect. Users create routines based on one of these fundamental types, and the routine editor adapts to show relevant options.

---

## 🎯 ACTIVITY TYPES (5 Types)

### 1. Max Attempt
**Purpose:** Single maximum effort dive for personal bests or competition

| Discipline | Primary Metric | Secondary Metrics |
|------------|----------------|-------------------|
| STA | Duration (mm:ss) | Breathe-up, contractions onset |
| DYN/DNF/DYNB | Distance (m) | Duration, breathe-up |

**Use cases:** PB attempts, competition dives, testing new limits

---

### 2. Submax Attempt
**Purpose:** Single dive below maximum capacity for training or technique

| Discipline | Primary Metric | Secondary Metrics |
|------------|----------------|-------------------|
| STA | Duration (mm:ss) | Breathe-up, RPE, % of max |
| DYN/DNF/DYNB | Distance (m) | Duration, RPE, % of max |

**Use cases:** Warm-ups, technique focus, recovery dives, target training

---

### 3. Structured Intervals
**Purpose:** Multiple reps with defined work/rest ratios per rep

**Key features:**
- **Planned structure:** User defines rest times and rep targets for each rep (e.g., CO₂ table with decreasing rest)
- **Editable during logging:** Each rep can be edited to reflect actual performance
- **Tracks planned vs actual:** System captures both what was planned and what was done

| Discipline | Work Metric | Rest Metric |
|------------|-------------|-------------|
| STA | Duration per rep | Rest duration (seconds or breaths) |
| DYN/DNF/DYNB | Distance per rep | Rest duration (seconds or breaths) |

**Use cases:** CO₂ tables, O₂ tables, progressive protocols, Sweet 16, ladder training

---

### 4. Freeform Intervals
**Purpose:** Multiple reps with no strict structure

**Key features:**
- **No pre-defined structure:** Just log what you did
- **Flexible rep entry:** Add reps as you go, edit each one
- **Summary stats:** System calculates totals, averages

| Discipline | Per-Rep Data | Summary |
|------------|--------------|---------|
| STA | Duration, rest after | Total hold time, avg rep, reps completed |
| DYN/DNF/DYNB | Distance, duration (optional), rest after | Total distance, avg per rep, reps completed |

**Use cases:** "Did some 50m laps with varying rest", exploration sessions, unstructured training

---

### 5. Free Training
**Purpose:** Unstructured session with whatever data user wants to capture

**Key features:**
- **Minimal structure:** Just date, discipline, notes
- **Optional metrics:** User chooses what to log
- **Flexible:** For anything that doesn't fit other types

**Use cases:** Mixed activities, experimenting, "just messing around", dry training

---

## 🔄 Editable Rep Logging (Key Innovation)

For **Structured Intervals** and **Freeform Intervals**, the logging UI includes:

1. **Pre-filled values** (Structured only): Shows planned rep structure from routine
2. **Editable per-rep fields:**
   - Duration (for STA) OR Distance (for dynamic)
   - Rest time after rep
   - Optional: time (for dynamic), notes per rep
3. **Add/remove reps:** User can add extra reps or mark reps as skipped
4. **Deviation tracking:** System notes where actual differs from planned

**Example:** User plans Sweet 16 (16 × 50m) but only completes 14 reps. They can:
- Mark 2 reps as "not completed"
- Edit any rep where they went 45m instead of 50m
- Log the session accurately without feeling the routine "failed"

---

## 📱 Adaptive Routine Editor

The routine editor adapts based on selections to reduce cognitive load:

### Discipline-Based Adaptation

| If discipline is... | Show these metrics | Hide these metrics |
|---------------------|-------------------|-------------------|
| STA | Duration, breath-hold fields | Distance, kicks, arm pulls |
| DYN/DYNB | Distance, duration, kicks | Arm pulls |
| DNF | Distance, duration, arm pulls, kicks | — |

### Activity Type-Based Adaptation

| If activity type is... | Show these sections | Hide these sections |
|------------------------|--------------------|--------------------|
| Max/Submax Attempt | Single dive fields | Rep structure, interval config |
| Structured Intervals | Rep table builder, rest config | — |
| Freeform Intervals | "Add rep" interface | Pre-defined structure |
| Free Training | Minimal fields, "add what you need" | Most structure |

---

## ✨ UX Efficiency Improvements

### 1. Smart Defaults
- **Clone from previous:** "Log same routine as last time" pre-fills everything
- **Recent values:** Pool length, location auto-suggested from recent logs
- **Discipline memory:** Remember last-used discipline per routine

### 2. Progressive Disclosure
- **Required fields first:** Date, discipline, primary metric
- **Expandable sections:** "Add more details" reveals environmental, physiological data
- **Collapsed by default:** Advanced metrics hidden until needed

### 3. Quick Log Mode
- **Minimal entry:** Just the essentials (date, discipline, result)
- **"Enhance later":** Return to add details post-session
- **Voice notes:** Quick audio note option

### 4. Template Suggestions
- **"Based on your training":** Suggest routine types based on past logs
- **"Popular for [discipline]":** Show common routines for selected discipline
- **"Similar to...":** When creating custom, suggest similar existing routines

### 5. Inline Validation
- **Reasonable ranges:** Flag if distance seems off (e.g., 500m DNF)
- **Consistency checks:** Alert if time/distance ratio is unusual
- **Helpful, not blocking:** Warnings don't prevent save

### 6. Bulk Operations
- **"Log entire session":** Add multiple dives from one session
- **Copy rep to next:** Repeat last rep's values
- **Fill down:** Apply same rest time to all remaining reps

---

## 🎨 Hero Metric Selection

Hero metrics are the primary values displayed on session cards. How they're determined depends on activity type:

### Auto-determined (Max & Submax Attempts)
For single-dive activities, hero metrics are automatically determined by discipline:

| Discipline | Hero Metric | Secondary Metric |
|------------|-------------|------------------|
| STA | Duration | Breathe-up time |
| DYN/DNF/DYNB | Distance | Duration |

**Rationale:** For max/submax attempts, the primary result is always the main metric (time for STA, distance for dynamic). No user configuration needed.

### User-selected (Interval & Free Training)
For interval training and free training, users must select their hero metric because the "most important" value varies by training goal:

| Activity Type | Hero Metric Options | Example Scenarios |
|---------------|--------------------|--------------------|
| Structured Intervals | Total time, Avg rep time, Reps completed, Total distance, Avg rep distance | CO₂ table might care about "total time under" while Sweet 16 might care about "reps completed" |
| Freeform Intervals | Same as above | User might prioritize volume (total distance) vs intensity (avg rep) |
| Free Training | Any tracked metric | Entirely depends on what user logged |

### Hero Selection UI (for intervals/free)
When creating or editing a routine, users see:

```
📊 Card Display
What should be the main number shown on session cards?

Hero Metric: [Dropdown]
  - Total Hold Time
  - Total Distance  
  - Reps Completed
  - Average per Rep
  - (other based on tracking config)

Secondary Metric: [Dropdown]
  - (remaining options)
```

**Smart defaults:** System suggests based on activity type:
- Structured Intervals (STA) → Default hero: "Total Hold Time"
- Structured Intervals (Dynamic) → Default hero: "Total Distance"
- Freeform Intervals → Default hero: "Reps Completed"
- Free Training → Default hero: First metric with data

---

## 📊 Simplified Data Capture

### Always captured (all activity types):
- Date, discipline, location
- RPE (1-10), Joy (1-10)
- Notes

### By discipline (required):
- **STA:** Duration (required)
- **DYN/DNF/DYNB:** Distance (required), Duration (optional)

### Optional context (show/hide based on need):
- Reps, rest times, per-lap data
- Environmental (pool length, water temp, pool type)
- Physiological (breathe-up, contractions, SpO₂, HR)
- Equipment, buddy, mood

### Routine Templates Become "Presets"

Instead of defining rigid structure, routines become **presets** that:
- Pre-fill certain fields (e.g., Sweet 16 suggests 16 reps × 50m)
- Enable relevant tracking options
- Set display preferences

**But users can always deviate** - if they did 14 reps instead of 16, that's fine.

---

## 🏷️ Metric Naming Clarification

### The Problem

Current naming is confusing because:
- `totalTime` could mean dive duration OR total session time
- `totalBreathHoldTime` sounds like it should be the main metric but it's only for interval aggregations
- `trackTotalTime` checkbox label doesn't clarify what it's tracking

### Current Fields & Their Actual Meanings

| Current Name | What It Actually Means | Used For |
|--------------|------------------------|----------|
| `totalTime` | Duration of a single dive | Max attempts (STA/Dynamic) |
| `trackTotalTime` | Enable tracking single dive duration | Routine config |
| `totalBreathHoldTime` | Sum of all hold durations across reps | Interval training calculated |
| `repDuration` | Duration of one rep in interval training | Per-rep tracking |

### Proposed Renaming

#### For Single-Dive Activities (Max/Submax Attempt)

| Current | Proposed | Rationale |
|---------|----------|-----------|
| `totalTime` | `diveDuration` | Clearer: it's the duration of THE dive |
| `trackTotalTime` | `trackDiveDuration` | Consistent with above |

#### For Interval Training

| Current | Proposed | Rationale |
|---------|----------|-----------|
| `repDuration` | `holdDuration` | For STA: how long each hold lasted |
| `repDuration` | `repTime` | For Dynamic: how long each rep took |
| `totalBreathHoldTime` | `cumulativeHoldTime` | Sum of all holds (clearer it's an aggregate) |
| (new) | `sessionDuration` | Total time from start to finish of session |

#### Rename Table

| Metric Type | Old Name | New Name | Definition |
|-------------|----------|----------|------------|
| **Single Dive** | `totalTime` | `diveDuration` | Duration of the single dive (seconds) |
| **Single Dive** | `totalDistance` | `diveDistance` | Distance of the single dive (meters) |
| **Per-Rep** | `repDuration` | `holdDuration` (STA) / `repTime` (Dynamic) | Duration of one rep |
| **Per-Rep** | `repDistance` | `lapDistance` | Distance covered in one rep |
| **Aggregate** | `totalBreathHoldTime` | `cumulativeHoldTime` | Sum of all hold durations in session |
| **Aggregate** | (none) | `cumulativeDistance` | Sum of all rep distances in session |
| **Session** | (none) | `sessionDuration` | Total elapsed time of entire session |

### User-Facing Labels

For the UI, use these labels:

| Metric | Card Display Label | Form Input Label |
|--------|-------------------|------------------|
| `diveDuration` | "Time" or "Duration" | "Dive Duration" |
| `diveDistance` | "Distance" | "Distance Covered" |
| `holdDuration` | "Hold Time" | "Hold Duration" |
| `lapDistance` | "Lap Distance" | "Distance per Lap" |
| `cumulativeHoldTime` | "Total Hold Time" | "Total Time Under" |
| `cumulativeDistance` | "Total Distance" | "Total Distance" |
| `sessionDuration` | "Session Time" | "Total Session Time" |

### Migration Path

1. Add new field names alongside old ones
2. Populate new fields on read (backward compatible)
3. Write to both old and new fields temporarily
4. Eventually deprecate old field names

---

## 🚀 Calculated Speed Metrics (NEW)

For **Dynamic Interval Training** where users log both distance and time per rep, we can calculate swim speed.

### Speed Calculations

| Metric | Calculation | Unit | Use Case |
|--------|-------------|------|----------|
| `repSpeed` | `lapDistance / repTime` | m/s | Speed for individual rep |
| `avgSpeed` | `cumulativeDistance / cumulativeTime` | m/s | Average speed across all reps |
| `maxRepSpeed` | `max(repSpeed)` for all reps | m/s | Fastest rep in session |
| `minRepSpeed` | `min(repSpeed)` for all reps | m/s | Slowest rep in session |
| `speedVariance` | Standard deviation of rep speeds | m/s | Consistency indicator |

### Per-Rep Speed Tracking

When user logs time for each rep in interval training:

```
Rep 1: 50m in 42s → Speed: 1.19 m/s
Rep 2: 50m in 45s → Speed: 1.11 m/s
Rep 3: 50m in 44s → Speed: 1.14 m/s
...
Rep 16: 50m in 52s → Speed: 0.96 m/s

Average Speed: 1.09 m/s
Speed Drop: -19% (rep 1 vs rep 16)
```

### Analytics Use Cases

| Metric | Insight |
|--------|---------|
| **Average Speed Trend** | Track improvement over weeks/months |
| **Speed Consistency** | Low variance = consistent technique |
| **Speed Drop-off** | How much slower on later reps (fatigue indicator) |
| **PB Speed** | Track fastest average speed for routine |

### Display Options

For interval routines, add to hero/secondary metric options:
- `avgSpeed` - "Avg Speed" - Average m/s across all reps
- `maxRepSpeed` - "Fastest Rep" - Peak speed achieved

### Implementation Notes

1. **Only calculate if both distance AND time are logged per rep**
2. **Show in Session Detail** - Per-rep speeds in expandable table
3. **Show on Card** - Can be hero/secondary if user selects
4. **Analytics** - Track weekly/monthly average speed trends

### Example Session Card Display

For Sweet 16 with speed tracking:
```
┌─────────────────────────┐
│ Sweet 16 (DYN)          │
│ ══════════════════════  │
│ 800m    ← Total Distance│
│ ──────────────────────  │
│ 16 reps • 1.09 m/s avg  │
└─────────────────────────┘
```

---

## 🏷️ Simplified Tag Model

### Current: 4 categories, many tags

```
trainingAdaptations: ['co2', 'o2', 'technique', 'mental', 'endurance', 'power']
diveTypes: ['max-attempt', 'sub-max', 'warm-up', 'recovery', 'dry']
difficultyLevels: ['beginner', 'intermediate', 'advanced', 'expert']
specialCategories: ['competition', 'fun', 'experimental']
```

### Proposed: 2 primary dimensions

**Training Focus** (what adaptation?):
- CO₂ tolerance
- O₂ efficiency  
- Technique
- Strength/Power
- Mental/Relaxation

**Intensity** (how hard?):
- Max (100%)
- Hard (80-90%)
- Moderate (60-80%)
- Easy/Recovery (<60%)

### Auto-tags (calculated, not user-selected):
- `pb` - When log beats personal best
- `competition` - When isCompetition=true
- `record` - When recordTag is set

---

## 📊 Simplified Metrics Display

### Tier 1: Always Visible (Card View)
- **Hero**: Primary result (distance for dynamic, time for static)
- **Secondary**: Supporting metric (time for dynamic, breathe-up for static)

### Tier 2: Quick Details (Expanded View)
- RPE, Joy rating
- Reps completed (if interval)
- Location

### Tier 3: Full Data (Session Detail Page)
- All captured data
- Per-lap breakdowns
- Media attachments

---

## To continue:**
1. Review this document with user
2. Discuss pain points with current structure
3. Propose new groupings/labels/calculations
4. Plan migration path for existing data

**Key files for changes:**
- `src/lib/types.ts` - Type definitions (TrackingConfig, MetricType, SuggestedTags)
- `src/lib/utils/metrics.ts` - Metric calculations
- `scripts/seed-data.ts` - Default routines and suggested tags config
- `src/lib/utils/analytics.ts` - Analytics aggregations

---

## Table of Contents

1. [Disciplines](#disciplines)
2. [Routine Tags](#routine-tags)
3. [Session/Log Tags](#sessionlog-tags)
4. [Trackable Metrics (TrackingConfig)](#trackable-metrics-trackingconfig)
5. [Calculated Metrics (MetricType)](#calculated-metrics-metrictype)
6. [Display Metrics (Hero/Secondary)](#display-metrics-herosecondary)
7. [Analytics Metrics](#analytics-metrics)
8. [Personal Bests](#personal-bests)

---

## Disciplines

| Code | Name | Unit | Description |
|------|------|------|-------------|
| `STA` | Static Apnea | seconds | Breath-hold without movement |
| `DYN` | Dynamic with Fins | meters | Underwater swimming with monofin/bi-fins |
| `DNF` | Dynamic No Fins | meters | Underwater swimming without fins |
| `DYNB` | Dynamic Bi-fins | meters | Underwater swimming with bi-fins |

**Location:** `src/lib/types.ts` - `Discipline` type

---

## Routine Tags

Tags applied to routine templates to categorize training types.

### Current Suggested Tags Structure

**Location:** `scripts/seed-data.ts` - `suggestedTags` object

| Category | Tags | Purpose |
|----------|------|---------|
| **Training Adaptations** | `co2`, `o2`, `technique`, `mental`, `endurance`, `power` | What physiological adaptation the routine targets |
| **Dive Types** | `max-attempt`, `sub-max`, `warm-up`, `recovery`, `dry` | Type of training session |
| **Difficulty Levels** | `beginner`, `intermediate`, `advanced`, `expert` | Skill level required |
| **Special Categories** | `competition`, `fun`, `experimental` | Special context |

### Tags Used on Default Routines

| Routine | Tags |
|---------|------|
| Dynamic Max Attempt | `max-attempt`, `pb` |
| Static Max Attempt | `max-attempt`, `pb` |
| Sweet 16 | `co2`, `endurance` |
| Gentle 2-Breath | `co2`, `beginner` |

---

## Session/Log Tags

Tags applied to individual routine logs (sessions).

**Location:** `src/lib/types.ts` - `RoutineLog` interface

| Tag Type | Values | Definition |
|----------|--------|------------|
| `isCompetition` | `boolean` | Marks dive as a competition attempt |
| `cardTag` | `'white'` \| `'yellow'` \| `'red'` \| `null` | AIDA competition card result |
| `recordTag` | `'NR'` \| `'CR'` \| `'WR'` \| `null` | National/Continental/World Record |
| `isPB` | `boolean` | Auto-calculated when dive is a personal best |

---

## Trackable Metrics (TrackingConfig)

These are the fields that can be enabled/disabled per routine template. When enabled, users are prompted to enter data.

**Location:** `src/lib/types.ts` - `TrackingConfig` interface

### Session Context

| Field | Type | Description | Default Routines Using |
|-------|------|-------------|------------------------|
| `trackPoolLength` | boolean | Pool length in meters | Dynamic Max, Sweet 16 |
| `trackInitialBreatheUpTime` | boolean | Pre-dive breathe-up duration (seconds) | All routines |

### Performance Metrics

| Field | Type | Description | When to Use |
|-------|------|-------------|-------------|
| `trackTotalDistance` | boolean | Total meters covered | Max attempts (DYN/DNF/DYNB) |
| `trackTotalTime` | boolean | Total dive duration in seconds | All routines |
| `trackRepsCompleted` | boolean | Number of repetitions completed | Interval training |
| `trackRepDuration` | boolean | Duration per rep in seconds | Static interval training |
| `trackRepDistance` | boolean | Distance per rep in meters | Dynamic interval training |
| `trackTimePerLap` | boolean | Detailed per-lap times | Post-video analysis |
| `trackRestBetweenLaps` | boolean | Rest duration between reps | CO₂ tolerance tracking |
| `trackKicksPerLap` | boolean | Kicks per lap | Technique analysis (DYN/DYNB/DNF) |
| `trackArmPullsPerLap` | boolean | Arm pulls per lap | DNF technique analysis |

### Training Context

| Field | Type | Description | Values/Format |
|-------|------|-------------|---------------|
| `trackBreathingTechnique` | boolean | Breathe-up technique used | `tidal`, `hyperventilation`, `hypoventilation` |
| `trackRPE` | boolean | Rate of Perceived Exertion | 1-10 scale |
| `trackJoyScale` | boolean | Enjoyment rating | 1-10 scale |
| `trackHoursSinceLastMeal` | boolean | Time since last meal | Hours (decimal) |
| `trackNotes` | boolean | Free text notes | Text |

### NEW Metrics (Phase 1 - Custom Routine Builder)

| Field | Type | Description | Values/Format |
|-------|------|-------------|---------------|
| `trackWaterTemperature` | boolean | Pool/water temperature | Celsius |
| `trackContractionsOnsetTime` | boolean | When first contraction occurred | Seconds |
| `trackEquipmentUsed` | boolean | Fins type, wetsuit, etc. | Text |
| `trackBuddyName` | boolean | Diving partner name | Text |
| `trackRestingHeartRate` | boolean | Resting HR for the day | BPM |
| `trackHRV` | boolean | Heart Rate Variability | Milliseconds |
| `trackPoolType` | boolean | Indoor vs outdoor | `'indoor'` \| `'outdoor'` |
| `trackSambaBO` | boolean | Samba/BO incident flag | Boolean |
| `trackBreathsBetweenReps` | boolean | Breaths between reps | Number |

### NEW Metrics (Phase 1 - Additional from Testing)

| Field | Type | Description | Values/Format |
|-------|------|-------------|---------------|
| `trackMenstrualCycleDay` | boolean | Day of menstrual cycle | 1-40 |
| `trackFacialGear` | boolean | Face equipment used | Array: `['mask', 'noseclip', 'goggles', 'nothing']` |
| `trackBasalMood` | boolean | Mood before session | 1-10 scale |
| `trackMinimumSpO2` | boolean | Minimum oxygen saturation | 0-100% |
| `trackMinimumHR` | boolean | Minimum heart rate during dive | BPM |
| `trackBodyWeight` | boolean | Body weight that day | kg |

---

## Calculated Metrics (MetricType)

These are derived metrics computed from logged data.

**Location:** `src/lib/utils/metrics.ts`

| MetricType | Calculation | Unit | Use Case |
|------------|-------------|------|----------|
| `totalDistance` | Direct from log | meters | Max attempt distance |
| `totalTime` | Direct from log | seconds | Dive duration |
| `repsCompleted` | `log.repsCompleted \|\| log.summary?.repsCompleted` | count | Interval progress |
| `totalRepDistance` | `repsCompleted × repDistance` | meters | Interval total distance |
| `repDuration` | Direct from log | seconds | Rep duration |
| `avgTimePerLap` / `avgTimePerRep` | `sum(lapTimes) / lapCount` OR `totalTime / repsCompleted` | seconds | Average per-rep time |
| `avgRestBetweenLaps` | `sum(restTimes) / lapCount` | seconds | Average rest duration |
| `totalBreathHoldTime` | Sum of all hold durations (`laps.timeSeconds`) OR `repDuration × repsCompleted` | seconds | Total breath-hold time in session |
| `totalBreathingTime` | Sum of all rest periods (`laps.restAfterSeconds`) | seconds | Total rest/breathing time |
| `totalBreaths` | `(repsCompleted - 1) × 2` | count | For 2-breath protocols |
| `poolLength` | Direct from log | meters | Pool size |
| `initialBreatheUpTime` | Direct from log | seconds | Pre-dive prep |
| `waterTemperature` | Direct from log | °C | Environmental |
| `contractionsOnsetTime` | Direct from log | seconds | Dive quality indicator |
| `restingHeartRate` | Direct from log | BPM | Baseline fitness |
| `hrv` | Direct from log | ms | Recovery indicator |

### Formatting Functions

**Location:** `src/lib/utils/metrics.ts` - `formatMetricValue()`

| Metric Types | Format |
|--------------|--------|
| Distance metrics | `{value}m` |
| Time metrics | `mm:ss` (via `formatTime()`) |
| Count metrics | Raw number |
| Temperature | `{value}°C` |
| Heart rate | `{value} bpm` |
| HRV | `{value}ms` |

---

## Display Metrics (Hero/Secondary)

Each routine template defines which metrics to show prominently on session cards.

**Location:** `src/lib/types.ts` - `DisplayConfig` interface

| Routine | Hero Metric | Hero Label | Secondary Metric | Secondary Label |
|---------|-------------|------------|------------------|-----------------|
| Dynamic Max Attempt | `totalDistance` | "Distance" | `totalTime` | "Time" |
| Static Max Attempt | `totalTime` | "Time" | `initialBreatheUpTime` | "Breathe-Up" |
| Sweet 16 | `totalTime` | "Total Time" | `avgTimePerRep` | "Avg/Rep" |
| Gentle 2-Breath | `totalBreathHoldTime` | "Total Hold" | `totalBreaths` | "Total Breaths" |

---

## Analytics Metrics

Aggregated metrics for progress tracking and insights.

**Location:** `src/lib/utils/analytics.ts`

### Training Summary

| Metric | Calculation | Description |
|--------|-------------|-------------|
| `totalSessions` | Count of unique session groups | Training frequency |
| `totalDives` | Count of routine logs | Volume |
| `totalTime` | Sum of all `log.totalTime` | Time under water |
| `avgPerWeek` | `totalSessions / weeksInTimeframe` | Training consistency |
| `avgRPE` | Average of logs with RPE | Perceived difficulty |
| `avgJoy` | Average of logs with joyScale | Training enjoyment |

### Personal Bests

| Metric | Calculation | Scope |
|--------|-------------|-------|
| Distance PB | Max `totalDistance` per discipline | DYN, DNF, DYNB |
| Time PB | Max `totalTime` per discipline | STA (and optional for dynamic) |

### Session Stats

| Metric | Description |
|--------|-------------|
| `byDiscipline` | Count of sessions per discipline |
| `competitionCount` | Logs with `isCompetition: true` |
| `recordCount` | Logs with `recordTag` set |
| `recordByDiscipline` | Record count per discipline |

### Progress Data

| Calculation | Usage |
|-------------|-------|
| Weekly best distance/time per discipline | Progress charts |
| Volume aggregation by week | Training load visualization |

---

## Breathing Technique

Two systems coexist:

### Legacy System
**Field:** `breathingTechnique`  
**Type:** `'tidal' | 'hyperventilation' | 'hypoventilation'`

### New System  
**Field:** `breathingTechniqueLevel`  
**Type:** `number` (-3 to +3)  
**Scale:**
- -3: Strong hypoventilation
- 0: Tidal (neutral)
- +3: Strong hyperventilation

---

## Data Storage Locations

| Data Type | Firestore Path |
|-----------|----------------|
| Routine Templates | `/routines/{routineId}` |
| Routine Logs | `/routines/{routineId}/logs/{logId}` |
| User Personal Bests | `/users/{userId}.personalBests` |
| Suggested Tags | `/config/suggestedTags` |
| User Settings | `/users/{userId}.settings` |

---

## Questions for Reconceptualization

1. **Tag Categories** - Are the current categories (`trainingAdaptations`, `diveTypes`, `difficultyLevels`, `specialCategories`) the right mental model?

2. **Metric Grouping** - Should metrics be grouped differently (e.g., by when they're relevant: pre-dive, during, post-dive)?

3. **Calculated vs Direct** - Which metrics should be user-entered vs auto-calculated?

4. **Display Priority** - What should be hero vs secondary vs hidden metrics?

5. **Analytics Focus** - What aggregations are most valuable for training insights?

6. **New Metrics** - Are there missing metrics users need?

7. **Deprecated Metrics** - Are any current metrics unused or redundant?
