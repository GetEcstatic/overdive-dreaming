# Custom Routine Builder - Planning Document

## Project Context

The user wants to create a UI for users to build their own custom training routines. This is described as "one of the most important components of the app."

**Key Requirements:**
- All metrics should be available for recording in custom routines
- Need to audit existing metrics first
- User wants to be highly involved in decision-making
- User wants multiple UI design options before finalizing

---

## Phase 1: Metrics System Audit

### Existing TrackingConfig Fields (Boolean Toggles)

These fields determine what gets captured when logging a routine:

#### Session Context
| Field | Description | Used In | Firebase Field |
|-------|-------------|---------|----------------|
| `trackPoolLength` | Pool size in meters | All pool routines | `poolLength` |
| `trackInitialBreatheUpTime` | Pre-dive breathe-up time | All routines | `initialBreatheUpTime` |

#### Performance Metrics
| Field | Description | Used In | Firebase Field |
|-------|-------------|---------|----------------|
| `trackTotalDistance` | Total meters covered | Max attempts | `totalDistance` |
| `trackTotalTime` | Total dive duration | Max attempts, intervals | `totalTime` |
| `trackRepsCompleted` | Number of reps completed | Interval training | `repsCompleted` (in summary) |
| `trackRepDuration` | Duration per rep | Static intervals | `repDuration` |
| `trackTimePerLap` | Detailed per-lap times | Advanced tracking | `laps[].timeSeconds` |
| `trackRestBetweenLaps` | Rest between reps | Interval training | `laps[].restAfterSeconds` |
| `trackKicksPerLap` | Kicks per lap | DYN/DYNB/DNF | `laps[].kicks` |
| `trackArmPullsPerLap` | Arm pulls per lap | DNF only | `laps[].armPulls` |

#### Training Context
| Field | Description | Used In | Firebase Field |
|-------|-------------|---------|----------------|
| `trackBreathingTechnique` | Tidal/hyper/hypo | Most routines | `breathingTechnique` |
| `trackRPE` | Rate of Perceived Exertion (1-10) | All routines | `rpe` |
| `trackJoyScale` | Enjoyment rating (1-10) | All routines | `joyScale` |
| `trackHoursSinceLastMeal` | Hours since eating | All routines | `hoursSinceLastMeal` |
| `trackNotes` | Freeform notes | All routines | `notes` |

**Total: 14 trackable fields**

---

### Existing MetricType Values (Display Metrics)

These are used for analytics and display in `DisplayConfig`:

| MetricType | Description | Calculated? |
|------------|-------------|-------------|
| `totalDistance` | Total meters | No |
| `totalTime` | Total seconds | No |
| `repsCompleted` | Number of reps | No |
| `avgTimePerLap` | Average time per lap/rep | Yes (calculated) |
| `avgTimePerRep` | Same as avgTimePerLap | Yes (calculated) |
| `avgRestBetweenLaps` | Average rest interval | Yes (calculated) |
| `totalBreathHoldTime` | Sum of all hold durations | Yes (repDuration × repsCompleted) |
| `totalBreathingTime` | Sum of all rest periods | Yes (sum of laps[].restAfterSeconds) |
| `totalBreaths` | Total breaths taken | Yes ((repsCompleted - 1) × 2) |
| `poolLength` | Pool size | No |
| `initialBreatheUpTime` | Breathe-up time | No |

**Total: 11 display metrics**

---

### Fields in RoutineLog NOT Controlled by TrackingConfig

These are always available or auto-generated:

| Field | Description | Type |
|-------|-------------|------|
| `location` | Pool name/location | Optional string |
| `photoUrl` | Session photo | Optional URL (Firebase Storage) |
| `youtubeUrl` | Video link | Optional URL |
| `timeOfDay` | Morning/afternoon/evening | Auto-calculated |
| `sessionGroup` | Auto-grouping ID | Auto-generated |
| `breathingNotes` | Additional notes on breathing | Optional string |
| `likes` | Social feature | Array of user IDs |
| `isPB` | Personal best flag | Boolean |
| `hasDetailedData` | Has lap-level data | Boolean |

**Note:** `location`, `photoUrl`, and `youtubeUrl` are always available in the logging UI but not controlled by TrackingConfig.

---

### Potential Missing Metrics (Pool-Specific)

Metrics that could be useful but aren't currently tracked:

#### Performance-Related
1. **Water temperature** - Affects performance, especially for longer dives: YES
2. **Contractions count** - Number of diaphragm contractions (useful for static): NO
3. **Contractions onset time** - When first contraction occurred: YES
4. **Finning technique** - Flutter vs dolphin kick (for dynamic): NO

#### Equipment & Environment
5. **Pool type** - Indoor/outdoor: NO
6. **Equipment used** - Monofin, bifins, wetsuit type, etc.: YES AS A TEXT INPUT AS THIS WILL VARY GREATLY
7. **Visibility** - Water clarity (if training with eyes open/closed): NO

#### Recovery & Safety
8. **Recovery time** - How long to feel normal after dive: NO
9. **Rest position** - Active vs passive recovery: NO
10. **Samba/BO incidents** - Safety-related notes: YES, USEFUL FOR TRACKING BUT AS A CHECKMARK METRIC ONLY. DETAILS CAN BE ADDED IN THE NOTES.
11. **Buddy name** - Who you were diving with: YES

---

## Phase 2: Routine Structure Fields

In addition to TrackingConfig, custom routines need these template fields:

### Required Fields
- `name` - Routine name (string)
- `description` - What the routine is for (string)
- `disciplines` - Which disciplines it applies to (Discipline[])
- `tags` - Training tags (string[])
- `displayConfig` - Hero and secondary metrics (DisplayConfig)

### Optional Structure Fields

**For Uniform Intervals:**
- `restBetweenReps` - Default rest time (seconds)
- `repDistance` - Distance per rep (meters)
- `numberOfReps` - Total reps in routine
- `instructionalVideoUrl` - YouTube/Vimeo URL

**For Variable Tables (NEW):**
- `table` - Per-rep targets with variable intervals

---

## Phase 2.5: Variable Table Structure (NEW - MVP Requirement)

### Use Case
Many freediving tables have **variable/progressive** protocols where each rep has different targets.

**Example - Static "Get-High" Table:**
```
Rep 1: Breathe 1:00 → Hold 2:00
Rep 2: Breathe 1:30 → Hold 2:30
Rep 3: Breathe 1:30 → Hold 3:00
Rep 4: Breathe 2:00 → Hold 3:45
Rep 5: Breathe 2:00 → Hold 4:30
Rep 6: Breathe 2:30 → Hold 5:30
```

**Example - Dynamic "Pyramid" Table:**
```
Rep 1: Breathe 1:00 → Swim 50m
Rep 2: Breathe 1:00 → Swim 75m
Rep 3: Breathe 1:30 → Swim 100m
Rep 4: Breathe 1:30 → Swim 75m
Rep 5: Breathe 1:00 → Swim 50m
```

### New Type Definitions

#### TableRow Interface
```typescript
// Add to src/lib/types.ts

export interface TableRow {
  repNumber: number;                // 1, 2, 3, ...
  restBefore: number;               // Seconds - breathing time before this rep

  // Static disciplines (STA)
  targetDuration?: number;          // Seconds - target hold time

  // Dynamic disciplines (DYN, DNF, DYNB)
  targetDistance?: number;          // Meters - target distance
  targetTime?: number;              // Seconds - target time (optional, can add from video)
}

export interface RoutineTable {
  rows: TableRow[];
}
```

#### Updated RoutineTemplate
```typescript
export interface RoutineTemplate {
  // ... existing fields ...

  // Routine structure - EITHER uniform OR variable table
  // Uniform intervals (original)
  restBetweenReps?: number;
  repDistance?: number;
  numberOfReps?: number;

  // OR Variable table (NEW)
  table?: RoutineTable;             // Mutually exclusive with above

  // ... rest of fields ...
}
```

### Template Validation Rules

**Mutually Exclusive:**
- If `table` exists → `numberOfReps`, `repDistance`, `restBetweenReps` must be undefined
- If `numberOfReps` exists → `table` must be undefined

**Table Validation:**
- At least 1 row
- `repNumber` must be sequential (1, 2, 3, ...)
- `restBefore` required for all rows
- Static (STA): `targetDuration` required, `targetDistance` must be undefined
- Dynamic (DYN/DNF/DYNB): `targetDistance` required, `targetDuration` must be undefined
- `targetTime` always optional (can be added during logging or from video review)

### Logging with Tables

**Display During Logging:**
```
Current Rep: 3 / 6
┌─────────────────────────────┐
│ Target: Breathe 1:30        │
│         Hold 3:00           │
└─────────────────────────────┘

Actual Hold Time: [mm:ss input]
```

**After Each Rep:**
- Show next rep's targets
- Auto-advance to next row
- Allow going back to edit previous reps

**Actual vs Target:**
- Display visual indicator (✓ hit target, ~ close, ✗ missed)
- Store both target and actual in `laps[]` array

---

## Phase 3: UI Design Options

### **Option 1: Wizard-Style Multi-Step Form** (Recommended for Mobile-First) - I CONFIRM THIS IS THE PREFERENCE

Step-by-step progression with progress indicator.

**Screens:**
1. Basic Info (name, description, disciplines, tags)
2. Routine Structure (interval settings: reps, distance, rest)
3. Tracking Configuration (checkboxes for all  metrics)
4. Display Configuration (hero + secondary metric selection with preview)
5. Review & Save

**Pros:**
- Clear, guided process
- Hard to make mistakes
- Good for first-time users
- Mobile-friendly (one section at a time)

**Cons:**
- More clicks (5 steps)
- Slower for experienced users

---

### **Option 2: Single-Page Form with Collapsible Sections**

All fields on one scrollable page with expandable sections.

**Sections:**
- ▼ Basic Information (always expanded)
- ▶ Routine Structure (optional, collapsed by default)
- ▼ Tracking Configuration (expanded, grouped checkboxes)
- ▶ Display Configuration (collapsed until tracking is done)

**Pros:**
- See everything at once
- Faster for experienced users
- Can skip irrelevant sections

**Cons:**
- Can feel overwhelming
- Long scroll on mobile
- Harder to validate step-by-step

---

### **Option 3: Template-Based Quick Start**

Choose from templates (Max Attempt, Interval, Static), then customize.

**Templates:**
1. Max Attempt (tracks distance, time, breathing, RPE, joy)
2. Interval Training (tracks reps, rep duration, rest, RPE, joy)
3. Static Hold (tracks time, breathing, contractions)
4. Blank (start from scratch)

**Flow:**
1. Select template
2. Customize name, disciplines, tags
3. Toggle any additional metrics
4. Set display metrics
5. Save

**Pros:**
- Fastest for common cases
- Good defaults reduce errors
- Easy to understand

**Cons:**
- Limited to template types
- Users may not explore full customization

---

### **Option 4: Hybrid (Recommended)**

Combine wizard for first-time creation + templates for quick creation + single-page for editing.

**User Flow:**
```
Create Routine
├─ "Start from Template" → Quick customization (Option 3)
└─ "Build from Scratch" → Wizard (Option 1)

Edit Routine
└─ Single-page form (Option 2)
```

**Why This Works:**
- Beginners get guidance
- Experienced users get speed
- Best tool for each job
- Templates reduce decision fatigue

---

## Phase 4: Finalized Implementation Plan

### User Decisions Summary
- **UI:** Wizard-Style Multi-Step Form (Option 1)
- **New Metrics:** 7 new tracking fields
- **Scope:** Complete - all checked metrics
- **Platform:** Responsive, mobile-first

---

### New Metrics to Add

#### TrackingConfig Additions (7 new boolean fields)

```typescript
// Add to existing TrackingConfig interface in src/lib/types.ts

export interface TrackingConfig {
  // ... existing 14 fields ...

  // NEW METRICS (7 additions)
  trackWaterTemperature: boolean;        // Pool/water temperature in Celsius
  trackContractionsOnsetTime: boolean;   // When first contraction occurred (seconds)
  trackEquipmentUsed: boolean;           // Fins type, wetsuit, etc. (freeform text)
  trackBuddyName: boolean;               // Diving partner name
  trackRestingHeartRate: boolean;        // Resting HR for the day (bpm)
  trackHRV: boolean;                     // Heart Rate Variability (ms)
  trackPoolType: boolean;                // Indoor vs outdoor
  trackSambaBO: boolean;                 // Samba/BO incident flag (boolean)
}
```

**Total tracking fields: 14 existing + 7 new = 21 fields**

#### RoutineLog Additions (7 new optional fields)

```typescript
// Add to existing RoutineLog interface in src/lib/types.ts

export interface RoutineLog {
  // ... existing fields ...

  // NEW TRACKED DATA (7 additions)
  waterTemperature?: number;             // Celsius (e.g., 28.5)
  contractionsOnsetTime?: number;        // Seconds into dive when first contraction
  equipmentUsed?: string;                // Freeform text (e.g., "Monofin, 3mm wetsuit")
  buddyName?: string;                    // Diving partner
  restingHeartRate?: number;             // bpm (e.g., 58)
  hrv?: number;                          // milliseconds (e.g., 65)
  poolType?: 'indoor' | 'outdoor';       // Enum
  sambaBO?: boolean;                     // True if incident occurred
}
```

#### New Type Definition

```typescript
// Add to src/lib/types.ts

export type PoolType = 'indoor' | 'outdoor';
```

---

### Component Structure

#### New Components to Create

```
src/lib/components/routineBuilder/
  ├── RoutineBuilderWizard.svelte       # Main wizard container
  ├── WizardStep1BasicInfo.svelte       # Name, description, disciplines, tags
  ├── WizardStep2Structure.svelte       # Protocol type selection
  ├── TableEditor.svelte                # NEW: Variable table builder
  ├── TableRowEditor.svelte             # NEW: Single row in table
  ├── PatternBuilder.svelte             # NEW: Generate progressive patterns
  ├── WizardStep3Tracking.svelte        # 21 tracking config checkboxes
  ├── WizardStep4Display.svelte         # Hero + secondary metric selection
  ├── WizardStep5Review.svelte          # Final review before save
  ├── RoutinePreviewCard.svelte         # Live preview component
  └── MetricCheckboxGroup.svelte        # Reusable checkbox group component
```

**Total: 11 components** (was 8, added 3 for table editing)

#### New Routes

```
src/routes/(app)/
  └── routines/
      ├── +page.svelte                  # Routine library (list user's routines)
      ├── create/
      │   └── +page.svelte              # Create new routine wizard
      └── [id]/
          └── edit/
              └── +page.svelte          # Edit existing routine
```

#### Files to Modify

```
src/lib/types.ts                        # Add 7 new TrackingConfig fields + RoutineLog fields
src/lib/components/QuickLogForm.svelte  # Add form inputs for 7 new metrics
scripts/seed-data.ts                    # Update system routines if needed
```

**Firestore:** `createRoutine()` and `updateRoutine()` already exist - no changes needed.

---

### Wizard Step Breakdown

#### Step 1: Basic Info
**Fields:**
- Name* (text input, required)
- Description (textarea, optional)
- Disciplines* (multi-select buttons: STA, DYN, DNF, DYNB)
- Tags (multi-select chips from suggested tags + custom input)

**Validation:**
- Name: required, min 3 characters
- Disciplines: at least one required

---

#### Step 2: Routine Structure (Optional)

**Protocol Type Selection:**
- Radio buttons:
  - ( ) No structure (freeform routine)
  - ( ) Uniform intervals (same for all reps)
  - ( ) Variable table (different per rep) ← **NEW**

---

**If "No structure" → Skip to Step 3**

---

**If "Uniform intervals":**

Fields:
- Number of Reps (number input)
- For Static (STA): Rep Duration target (mm:ss) - optional guide
- For Dynamic (DYN/DNF/DYNB): Distance per Rep (meters)
- Rest Between Reps (seconds or mm:ss)

Validation:
- numberOfReps must be > 0
- If distance specified, must be > 0

---

**If "Variable table" (NEW):**

**Table Editor Component:**

```
┌─────────────────────────────────────────────────┐
│  Rep Table Editor                               │
├─────────────────────────────────────────────────┤
│  Discipline: STA (static) ← determined by Step 1│
│                                                  │
│  ┌─────┬──────────┬───────────┬─────────────┐  │
│  │ Rep │ Breathe  │ Hold      │ Actions     │  │
│  ├─────┼──────────┼───────────┼─────────────┤  │
│  │  1  │ [1:00]   │ [2:00]    │ [×]         │  │
│  │  2  │ [1:30]   │ [2:30]    │ [×]         │  │
│  │  3  │ [1:30]   │ [3:00]    │ [×]         │  │
│  │  4  │ [2:00]   │ [3:45]    │ [×]         │  │
│  └─────┴──────────┴───────────┴─────────────┘  │
│                                                  │
│  [+ Add Row]                                    │
│                                                  │
│  Quick Fill: [Copy Last Row] [Pattern Builder] │
└─────────────────────────────────────────────────┘
```

**For Static (STA):**
- Columns: Rep # | Breathe (mm:ss) | Hold (mm:ss) | [Delete]

**For Dynamic (DYN/DNF/DYNB):**
- Columns: Rep # | Breathe (mm:ss) | Distance (m) | Time (mm:ss, optional) | [Delete]

**Features:**
- Auto-increment rep numbers
- Add/remove rows
- Drag to reorder (nice-to-have)
- "Copy Last Row" - duplicates last row for easy entry
- "Pattern Builder" - generate linear/exponential progressions
  - Example: Start 2:00, increase by 30s each rep, 6 reps
  - Generates: 2:00, 2:30, 3:00, 3:30, 4:00, 4:30

**Mobile UI:**
- Stack fields vertically per row
- Swipe left to delete row
- Tap-and-hold to reorder

**Validation:**
- At least 1 row required
- All breathe times must be > 0
- For static: hold times must be > 0
- For dynamic: distances must be > 0
- Rep numbers must be sequential (auto-managed)

---

#### Step 3: Tracking Configuration
**21 Checkboxes organized in 3 groups:**

**Session Context (4 fields)**
- [ ] Pool Length
- [ ] Initial Breathe-Up Time
- [ ] Pool Type *(NEW)*
- [ ] Water Temperature *(NEW)*

**Performance Metrics (8 fields)**
- [ ] Total Distance
- [ ] Total Time
- [ ] Reps Completed
- [ ] Rep Duration
- [ ] Detailed Per-Lap Times
- [ ] Rest Between Laps
- [ ] Kicks Per Lap
- [ ] Arm Pulls Per Lap

**Training Context & Health (9 fields)**
- [ ] Breathing Technique
- [ ] RPE (Difficulty)
- [ ] Joy Scale
- [ ] Hours Since Last Meal
- [ ] Notes
- [ ] Contractions Onset Time *(NEW)*
- [ ] Equipment Used *(NEW)*
- [ ] Buddy Name *(NEW)*
- [ ] Resting Heart Rate *(NEW)*
- [ ] HRV *(NEW)*
- [ ] Samba/BO Incident *(NEW)*

**UI Features:**
- "Select All" / "Deselect All" buttons per group
- Presets: "Minimal", "Standard", "Complete"

---

#### Step 4: Display Configuration
**Select metrics for feed card display:**

**Hero Metric** (large display):
- Dropdown: Select from enabled metrics
- Label input: Custom label text
- Live preview shows how it will look

**Secondary Metric** (smaller):
- Dropdown: Select from enabled metrics (different from hero)
- Label input: Custom label text

**Preview Card:**
Shows real-time preview of how routine will appear in feed

**Validation:**
- Hero and secondary metrics must be different
- Both must be from enabled tracking metrics

---

#### Step 5: Review & Save
**Summary display:**
- ✓ Basic Info (name, disciplines, tags)
- ✓ Structure (if interval routine)
- ✓ Tracking (X/21 metrics enabled)
- ✓ Display (hero + secondary)

**Actions:**
- Edit buttons for each section (jump back to that step)
- Save Routine (primary button)
- Cancel (secondary button)

---

### Mobile-First Design Patterns

**Progress Indicator:**
```
[1]───[2]───[3]───[4]───[5]
 •─────•─────○─────○─────○
Basic Structure Track Display Review
```

**Navigation:**
- Top: Progress bar + current step name
- Bottom: [Back] [Next] buttons (sticky footer)
- Step 1: No back button
- Step 5: [Back] [Save Routine]

**Responsive Breakpoints:**
- Mobile (< 640px): Full-width steps, single column
- Tablet (640-1024px): Max-width container, two-column checkboxes
- Desktop (> 1024px): Sidebar preview, two-column checkboxes

**Form Field Styles:**
- Large tap targets (min 44px height)
- Clear labels with helper text
- Inline validation with icons
- Smooth step transitions (slide animation)

---

## Phase 5: Questions for User

Before finalizing the implementation plan, I need your input:

### Q1: UI Preference
Which UI approach do you prefer?
- **A) Wizard (Option 1)** - Step-by-step, mobile-first: THIS IS THE CHOSEN OPTION

### Q2: Missing Metrics Priority
Which missing metrics should we add to TrackingConfig?

PLEASE ADD ALL THE METRICS WITH CHECKMARKS AS AN APPROPRIATE METRIC TYPE.
**High Priority (should add):**
- [x] Water temperature
- [ ] Contractions count
- [x] Equipment used (fins type, wetsuit)
- [x] Buddy name
- [x] Contractions onset time
- [x] Resting heartrate for the day
- [x] HRV for the day

**Medium Priority (nice to have):**
- [x] Pool type (indoor/outdoor)
- [ ] Finning technique (flutter/dolphin)


**Low Priority (can skip):**
- [ ] Visibility
- [ ] Rest position

### Q3: Scope
Should the first version include:
- **Minimal:** Just the UI to create/edit custom routines (no new metrics)
- **Standard:** UI + add 3-5 high-priority missing metrics *(Recommended)* 
- **Complete:** UI + all suggested metrics + advanced features
I CHOOSE THE COMPLETE VERSION = UI + ALL OF THE MISSING METRICS THAT HAVE BEEN CHECKED WITH A CHECK MARK SHOULD BE ADDED
### Q4: Mobile vs Desktop Priority
Which should we prioritize?
- **Mobile-first** - Wizard approach, one field at a time
- **Desktop-first** - Single-page, see everything
- **Responsive** - Adapt layout based on screen size *(Recommended)*
IT NEEDS TO BE RESPONSIVE, BUT ALL DESIGN DECISIONS SHOULD PRIORITISE MOBILE USAGE
---

## Critical Files Reference

**Current Implementation:**
- `src/lib/types.ts:40-117` - RoutineTemplate interface with TrackingConfig and DisplayConfig
- `src/lib/firestore.ts:84-124` - createRoutine(), updateRoutine(), deleteRoutine() functions
- `src/lib/components/QuickLogForm.svelte` - Shows how TrackingConfig dynamically controls form fields
- `scripts/seed-data.ts:29-204` - Example system routines with different tracking configs

**No Existing Routine Builder:** This will be a completely new feature.

---

## Phase 6: Implementation Roadmap

### Milestone 1: Type System Updates (Day 1)
**Goal:** Add new metrics AND table structure to type definitions

**Tasks:**
- [ ] Add 7 new fields to `TrackingConfig` interface
- [ ] Add 7 new optional fields to `RoutineLog` interface
- [ ] Add `PoolType` type definition
- [ ] Add `TableRow` interface ← **NEW**
- [ ] Add `RoutineTable` interface ← **NEW**
- [ ] Update `RoutineTemplate` to include optional `table` field ← **NEW**
- [ ] Update `RoutineTemplateFormData` type
- [ ] Run type checks (`npm run check`)

**Files Modified:**
- `src/lib/types.ts`

**Estimated Time:** 2-3 hours (increased due to table types)

---

### Milestone 2: Wizard Components (Days 2-4)
**Goal:** Build all 5 wizard step components

**Tasks:**
- [ ] Create `RoutineBuilderWizard.svelte` (main container with state management)
- [ ] Create `WizardStep1BasicInfo.svelte` (name, disciplines, tags)
- [ ] Create `WizardStep2Structure.svelte` (interval settings)
- [ ] Create `WizardStep3Tracking.svelte` (21 checkboxes in 3 groups)
- [ ] Create `WizardStep4Display.svelte` (hero/secondary metric selection)
- [ ] Create `WizardStep5Review.svelte` (summary + save)
- [ ] Create `MetricCheckboxGroup.svelte` (reusable component)
- [ ] Create `RoutinePreviewCard.svelte` (live preview)

**Files Created:**
- `src/lib/components/routineBuilder/` (8 new files)

---

### Milestone 3: Routes & Navigation (Day 5)
**Goal:** Create routing structure for routine management

**Tasks:**
- [ ] Create `/routines` page (list all user routines)
- [ ] Create `/routines/create` page (wizard entry point)
- [ ] Create `/routines/[id]/edit` page (edit existing)
- [ ] Add navigation link from main menu/dashboard
- [ ] Test routing and navigation flow

**Files Created:**
- `src/routes/(app)/routines/+page.svelte`
- `src/routes/(app)/routines/create/+page.svelte`
- `src/routes/(app)/routines/[id]/edit/+page.svelte`

---

### Milestone 4: Form Updates (Day 6)
**Goal:** Update logging form to support new metrics

**Tasks:**
- [ ] Add water temperature input to `QuickLogForm.svelte`
- [ ] Add contractions onset time input (mm:ss)
- [ ] Add equipment used text input
- [ ] Add buddy name input
- [ ] Add resting heart rate input
- [ ] Add HRV input
- [ ] Add pool type dropdown (indoor/outdoor)
- [ ] Add samba/BO checkbox
- [ ] Test dynamic form rendering based on `trackingConfig`

**Files Modified:**
- `src/lib/components/QuickLogForm.svelte`

---

### Milestone 5: Testing & Polish (Day 7)
**Goal:** End-to-end testing and UI refinements

**Tasks:**
- [ ] Test wizard flow (all 5 steps)
- [ ] Test validation (required fields, metric selection)
- [ ] Test routine creation (saves to Firestore correctly)
- [ ] Test routine editing (loads existing data)
- [ ] Test logging with new metrics (form displays correctly)
- [ ] Mobile responsive testing (iPhone, Android)
- [ ] Desktop testing (various screen sizes)
- [ ] Accessibility check (keyboard navigation, labels)
- [ ] Polish animations and transitions
- [ ] Error handling and user feedback

---

## Critical Next Steps

### Immediate Action Items:

1. **Exit Plan Mode** - Ready for implementation
2. **Start with Milestone 1** - Update type definitions first
3. **Progressive Build** - Complete milestones sequentially
4. **Test Frequently** - After each component, verify it works

### Key Implementation Notes:

**State Management Pattern:**
- Wizard uses single parent state object
- Each step is a "controlled component" receiving props
- Parent handles navigation and validation
- Use Svelte 5 runes ($state, $derived, $props)

**Validation Strategy:**
- Client-side validation per step
- Required field checks before "Next" button
- Final validation in Step 5 before save
- Display friendly error messages

**Data Flow:**
```
User Input → Step Component → Wizard State → Review → Firestore
```

**Firestore Save:**
```typescript
const newRoutine: RoutineTemplateFormData = {
  name,
  description,
  disciplines,
  tags,
  trackingConfig: {
    // All 21 boolean fields
  },
  displayConfig: {
    heroMetric,
    heroMetricLabel,
    secondaryMetric,
    secondaryMetricLabel
  },
  // Optional structure fields
  restBetweenReps,
  repDistance,
  numberOfReps
};

const routineId = await createRoutine(user.uid, newRoutine);
```

---

## Success Criteria

The custom routine builder will be complete when:

- ✅ Users can create custom routines with all 21 tracking options
- ✅ Wizard guides users through 5 clear steps
- ✅ Mobile-first design works smoothly on phones
- ✅ New metrics appear in logging form when enabled
- ✅ Preview card accurately shows how routine will display
- ✅ Routines save correctly to Firestore
- ✅ Existing routines can be edited
- ✅ No TypeScript errors or warnings
- ✅ Responsive across all screen sizes
