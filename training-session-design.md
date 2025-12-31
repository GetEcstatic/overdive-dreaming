# Training Session Design

## Purpose
Define the user experience and data model for logging freediving training sessions in Overdive Dreaming.

---

## 1. Core Concepts

### What is a "session" vs a "dive"?

**Session definition:**
> [Your answer: Is a session one pool visit? One training block? How do you think about grouping dives?]
> A session is one pool visit. A session may include a number of different training routines. A routine may be a single dive (For example a max attempt dive) or it may be a series of dives (for example a series of short dives with short intervals in between designed to improve CO₂ tolerance)

**Dive definition:**
> [Your answer: Is each attempt a separate dive? What makes one dive distinct from another?]
> A dive is singular: it's a separate, single attempt. However much training focuses on routines that include multiple dives. In this instance, we may or may not want to include details of each individual dive, but we might want to record details about the routine as a whole. I'm not sure of the best way to capture information about these routines: possibly a narrative comment that could be inputted by the user would suffice. I need to explore this further.

**Preferred logging approach:**
- [ ] Log individual dives as standalone entries - No
- [ ] Log a session with multiple dives grouped together - No
- [ ] Both (sessions contain multiple dives) - No
- [ ] Other: Yes, my current thinking is that we log sessions, and within each session there could be multiple individual dives logged, or multiple routines.

---

## 1A. Routine Templates & Editor

Based on your response above, routines are a core concept. This section explores how to define, create, and log routines.

### Routine Definition Structure

**What is a routine template?**
> [Your definition: A routine template is a reusable training pattern that can be logged multiple times. What else defines it?] Routines have a training purpose aimed at a specific adaptation. The adaptation could be: technique; CO₂ tolerance; hypoxia tolerance; mental (confidence building, relaxation, teaching the CNS it's safe); fitness; muscle development, or other.

**How structured should routine definitions be?**

Select your preferred approach:

- [ ] **Freeform** - Just name + text description
  - Example: Name: "Tom's CO₂ Crusher" | Description: "8x50m DYN with 1min rest, trying to hold consistent pace"
  - Pro: Maximum flexibility, captures any creative routine
  - Con: No structure for guided logging or analytics

- [ ] **Structured** - Define sets, reps, intervals, targets as data fields
  - Example: Discipline: DYN | Sets: 8 | Distance: 50m | Rest: 60s | Target pace: 45s
  - Pro: Can provide structured logging interface, better analytics, progress tracking
  - Con: More complex to build, might not capture all creative variations

- [x] **Hybrid** - Basic structure + freeform description Hybrid is my preferred structure
  - Example: Name + Discipline + Tags + Freeform description
  - Pro: Balance of structure and flexibility
  - Con: Might be redundant

**Your preference:**
> Hybrid: I think each training routine should capture basic data points that can be easily analysed and compared over time, but also allow for individual notes that a diver can reference for more information.
> 


---

### Routine Template Fields

If you chose structured or hybrid above, what fields should a routine template include?

**Required fields:**
- [ ] Name (e.g., "CO₂ Table - Progressive")
- [ ] Description (freeform text)
- [ ] Discipline (STA/DYN/DNF/DYNB or "Mixed")
- [ ] Tags (e.g., "CO2", "intervals", "endurance")
- [ ] Other: ___________

**Optional/Advanced fields:**
- [ ] Number of repetitions
- [ ] Target distance per rep
- [ ] Target duration per rep
- [ ] Rest intervals
- [ ] Progression pattern (increasing/decreasing)
- [ ] Difficulty level (beginner/intermediate/advanced)
- [ ] Equipment needed
- [ ] Other: ___________

**Your specific needs:**

A routine should be *setup* to include the following constants for the routine:
> 	Name of the routine
> 	Brief description of the routine
> 	Disciplines (the routine could be used for more than one discipline, so check boxes could be used here to indicate aplicable disciplines, and these would then need to be user selectable before dives also to differentiate)
> 	Tags (multi-select flexible tagging system) - User selects from suggested tags or creates custom tags. Same routine can have different tags for different users based on their training goals. Suggested tags include: co2, o2, technique, mental, endurance, power, max-attempt, sub-max, warm-up, recovery, beginner, intermediate, advanced, expert, competition, fun, experimental.
> 	Initial breathe-up time (rest before routine starts)
> 	Rest between reps (breathing time between each repetition)
> 	⁠Distance of each lap (e.g. 12.5m/25m/50m) - dynamic disciplines only - OPTIONAL
> 	Duration of each rep - static disciplines only - OPTIONAL
> 	⁠⁠Number of laps/reps - all disciplines - OPTIONAL
> The setup stage should also allow the user to check which variables would entered when performing the routine in the pool:
> 	 Number of laps completed
> 	 Time per lap
> 	 Rest between each lap
> 	 Number of kicks per lap (for DYN or DYNB or DNF)
> 	 Number of arm-pulls per lap (DNF only)
> 	 Breathing used (tidal, hyperventilation, hypoventilation) + a note on this
> 	 RPE scale to record level of difficulty
> 	 Joy scale, to record how much the diver enjoyed the routine.
> 	 Number of hours since last meal
> 	 Notes section for user to record observations

---

### Default Routine Library (Free Tier)

Four default routines will be provided. Tags are suggestions only - users can modify tags to match their own training goals.

**1. Dynamic Max Attempt**
- **Disciplines:** DYN/DYNB/DNF (user selects)
- **Description:** Single maximal effort dive with own-time breathe-up
- **Suggested tags:** `max-attempt`, `pb`
- **Notes:** Users might also tag as `co2`, `mental`, `competition`, etc. depending on their focus

**2. Static Max Attempt**
- **Disciplines:** STA
- **Description:** Single maximal static hold with own-time breathe-up
- **Suggested tags:** `max-attempt`, `pb`
- **Notes:** Users might also tag as `o2`, `mental`, `competition`, etc.

**3. Sweet 16**
- **Disciplines:** DYN/DYNB/DNF (user selects)
- **Description:** 16×50m with user-defined rest intervals
- **Suggested tags:** `co2`, `endurance`
- **Notes:** Beginners might tag as `challenging`, advanced divers as `warm-up` or `mental`

**4. Gentle 2-Breath**
- **Disciplines:** STA
- **Description:** 10×1:30 static with 2-breath recovery periods
- **Suggested tags:** `co2`, `beginner`
- **Notes:** Could also be tagged `recovery`, `mental`, `relaxation`, etc.

**Free tier allowance:**
- 4 system default routines (above)
- 1 custom user-created routine
- Total: 5 routines for free users during MVP

---

### Logging a Routine Instance

When you complete a routine at the pool, what data do you need to capture?

Based on your "Routine Template Fields" response above, the routine template defines which variables are tracked. When logging an instance, you'll enter values for the variables you selected during routine setup.

**Always captured:**
- Which routine template was used (reference)
- Date/time
- Discipline used (if routine applies to multiple)

**Variables (as selected in template setup):**
- Number of laps (DYN/DYNB/DNF only) /reps (STA) completed
- Time per lap/rep
- Rest between each lap/rep
- Number of kicks per lap (DYN/DYNB/DNF only)
- Number of arm-pulls per lap (DNF only)
- Breathing technique used (tidal/hyperventilation/hypoventilation) + notes
- RPE scale (difficulty rating)
- Joy scale (enjoyment rating)
- Hours since last meal
- Notes section

**Poolside logging UX:**
> [Walk through the ideal flow:
> 1. You select the routine template
> 2. Select discipline (if multi-discipline routine)
> 3. The app shows ONLY the variables you configured for this routine
> 4. You enter values for each variable (per lap where specified in the variable name)
> 5. How many taps/inputs is acceptable poolside? - I think that entering data *during* a dive will be difficult. I imagine that the diver's buddy will video the dive (perhaps using the phone, perhaps in the app later once developed) and then the video can be replayed to enter more specific data. The user will have that option.

---

### Routine Editor UX (Premium Feature)

**Who should access the routine editor?**
- [ ] Free tier - limited number of custom routines (e.g., 3 max)
- [ ] Premium only - unlimited custom routines
- [ ] Freemium - free users can duplicate/modify defaults, premium can create from scratch
- [ ] Other: ___________

**What should the editor interface include?**
>Let's make everything free for beta versions, but allow a free-tier model later. This would need to be selected by me on the back end for each user. I see this is as something to develop later.

**Pre-built templates vs. blank slate:**
- [x] Start from blank template (empty form)
- [ ] Start from default routine and customize it
- [ ] Start from common patterns (wizard-style: "Select routine type → Fill in details")
- [ ] All of the above

**Organizing custom routines:**
>I think from a blank template would be best. Any kind of wizard would be reductive I feel.

---

### Routine Sharing & Community (Future)

**Future monetization/engagement ideas:**

- [x] Public routine marketplace (users share routines)
- [x] Coach accounts (can assign routines to athletes)
- [ ] Routine ratings/reviews
- [x] Featured community routines
- [x] Export/import routines (JSON)
- [ ] Other: ___________

**Your thoughts on sharing:**
>I think sharing is a good idea. I'd like to see specific users routines (especially if they were well known/expert divers). And sharing routines as a coach is also a valuable application.

---

### Data Model: Routine Template

Based on your detailed specifications above, here's the proposed routine template structure:

```typescript
interface RoutineTemplate {
  id: string;
  name: string;
  description: string;

  // Disciplines this routine applies to (multi-select)
  disciplines: ('STA' | 'DYN' | 'DNF' | 'DYNB')[];

  // Flexible tagging system (replaces single adaptationTag)
  tags: string[]; // Multi-select, user-defined
  // Examples: ['co2', 'endurance'], ['mental', 'relaxation'], ['max-attempt', 'pb']
  // Same routine can have different tags for different users

  // Routine structure (constants) - ALL OPTIONAL
  initialBreatheUpTime?: number; // seconds, breathe-up before routine starts
  restBetweenReps?: number; // seconds, breathing time between each rep
  lapDistance?: number; // meters, for dynamic disciplines only
  repDuration?: number; // seconds, for static disciplines only
  numberOfReps?: number; // total laps/reps in routine

  // Configurable variables - which fields to track when logging?
  trackingConfig: {
    trackLapsCompleted: boolean;
    trackTimePerLap: boolean;
    trackRestBetweenLaps: boolean;
    trackKicksPerLap: boolean; // DYN/DYNB/DNF
    trackArmPullsPerLap: boolean; // DNF only
    trackBreathingTechnique: boolean;
    trackRPE: boolean; // Rate of Perceived Exertion
    trackJoyScale: boolean;
    trackHoursSinceLastMeal: boolean;
    trackNotes: boolean;
  };

  // Media
  instructionalVideoUrl?: string; // YouTube/Vimeo URL for how-to videos

  // Metadata
  createdBy: 'system' | string; // 'system' for defaults, userId for custom
  isPublic: boolean; // For future sharing features
  tier?: 'free' | 'premium'; // For future freemium model (all free during beta)
  createdAt: timestamp;
  updatedAt: timestamp;
}
```

**Tag System Notes:**
- **Suggested tags** (shown as checkboxes in UI): `co2`, `o2`, `technique`, `mental`, `endurance`, `power`, `max-attempt`, `sub-max`, `warm-up`, `recovery`, `beginner`, `intermediate`, `advanced`, `expert`, `competition`, `fun`, `experimental`
- **Custom tags:** Users can type any tag they want
- **Admin control:** New suggested tags can be easily added on backend (stored in app config, not hardcoded)
- **Multi-purpose:** Same routine can have different tags for different users

**Implementation notes:**
- **Beta phase:** All users can create unlimited custom routines (free)
- **Post-beta:** Admin can assign tier per user; tier restrictions enforced on backend
- **Sharing:** Users can publish routines to public marketplace; coach accounts can assign to athletes

---

### Data Model: Routine Log (Instance)

Based on your tracking variables, here's the proposed structure for a logged routine instance:

```typescript
interface RoutineLog {
  id: string;
  routineId: string; // References the template
  sessionId: string; // Part of which session
  userId: string;
  date: timestamp;

  // Which discipline was used (required if routine applies to multiple)
  disciplineUsed: 'STA' | 'DYN' | 'DNF' | 'DYNB';

  // Performance data - structure depends on your preference:
  // Option A: Array of laps (detailed, per-lap tracking)
  laps?: {
    lapNumber: number;
    timeSeconds?: number; // if tracking time per lap
    restAfterSeconds?: number; // if tracking rest between laps
    kicks?: number; // if tracking kicks per lap
    armPulls?: number; // if tracking arm pulls (DNF only)
  }[];

  // Option B: Summary metrics only (simpler)
  summary?: {
    lapsCompleted: number; // if tracking laps completed
    totalTimeSeconds?: number;
    averageTimePerLap?: number;
    // ... other summary stats
  };

  // Routine-level data (not per-lap)
  breathingTechnique?: 'tidal' | 'hyperventilation' | 'hypoventilation';
  breathingNotes?: string;
  rpe?: number; // 1-10 scale, Rate of Perceived Exertion
  joyScale?: number; // 1-10 scale
  hoursSinceLastMeal?: number;
  notes?: string;

  // Video support (future feature)
  videoUrl?: string; // Reference to buddy video (local or cloud storage)
  videoTimestamp?: timestamp; // When video was recorded
  hasDetailedData: boolean; // Has per-lap data been added from video review?

  // Metadata
  createdAt: timestamp;
  updatedAt: timestamp;
}
```

**Per-lap tracking approach - RESOLVED:**

Based on your "Poolside logging UX" response, the solution is:

> **Hybrid approach with video support:**
> - Initial log can be quick summary (fast poolside entry)
> - Option to add detailed per-lap data later by reviewing buddy video
> - Video can be recorded on phone (or in-app in future)
> - User replays video to enter specific metrics (time, kicks, etc.)

This resolves the tedious-poolside vs rich-data trade-off by decoupling performance from logging.

---

### Example: Concrete Routine Flow

**Scenario:** Creating and logging a CO₂ tolerance routine

**Step 1: Create the routine template (one-time, free during beta)**

You open the Routine Editor and create:
- **Name:** "CO₂ Builder - 8x50"
- **Description:** "Progressive CO₂ tolerance with short intervals"
- **Disciplines:** [✓] DYN, [✓] DNF (can be used for both)
- **Tags:**
  - Suggested: [✓] co2, [✓] endurance, [ ] mental, [ ] technique...
  - Custom: (none added)
  - Final tags: `['co2', 'endurance']`
- **Initial breathe-up time:** 120 seconds (before starting routine)
- **Rest between reps:** 45 seconds (breathing time between each lap)
- **Lap distance:** 50 meters
- **Number of reps:** 8
- **Track these variables when logging:**
  - [✓] Laps completed
  - [✓] Time per lap
  - [✓] Rest between laps
  - [ ] Kicks per lap (not tracking)
  - [ ] Arm pulls (not tracking)
  - [✓] Breathing technique
  - [✓] RPE scale
  - [✓] Joy scale
  - [ ] Hours since meal (not tracking)
  - [✓] Notes

**Step 2: At the pool, you perform the routine**

You do your 2-minute breathe-up, then swim:
- 8x50m DYN with 45 seconds rest between each
- You complete all 8 laps
- Times vary: 45s, 46s, 47s, 48s, 50s, 51s, 53s, 55s (fatigue setting in)
- You used tidal breathing before each dive
- Difficulty felt like 7/10
- You actually enjoyed it: 8/10

**Step 3: Log the routine instance (quick summary)**

Immediately after the routine, you do a quick log:
1. Tap "Log Routine"
2. Select "CO₂ Builder - 8x50"
3. Select discipline: DYN
4. Enter quick summary:
   - Laps completed: 8 (all of them!)
   - Breathing: Tidal
   - RPE: 7
   - Joy: 8
   - Notes: "Last 3 laps were tough, felt CO₂ building nicely"
5. Save

Your buddy recorded video on their phone during the routine.

**Step 3b: Add detailed data later (optional)**

Later that evening, you:
1. Open the saved routine log
2. Tap "Add detailed data"
3. Play back the buddy video
4. Enter per-lap times: 45s, 46s, 47s, 48s, 50s, 51s, 53s, 55s
5. Enter rest intervals: 45s between each
6. Save detailed data

Now you have both quick poolside capture AND rich per-lap analytics.

**Step 4: View in dashboard/analytics**

- Routine log appears in your session history
- Analytics show: "CO₂ Builder - 8x50 completed 3 times this month"
- Filter by tags: "Show all co2 training" → 12 sessions this month
- Progress graph shows RPE improving over time (getting easier)
- Can compare with DNF version of same routine

---

### Tag Management System

**Suggested Tags (UI Checkboxes):**

These tags are shown as checkboxes in the routine editor. Admin can easily add new suggested tags via backend config.

**Training Adaptations:**
- `co2` - CO₂ tolerance training
- `o2` - O₂ depletion / hypoxia tolerance
- `technique` - Form, efficiency, stroke work
- `mental` - Relaxation, confidence, mind training
- `endurance` - Distance, stamina building
- `power` - Speed, strength work

**Dive Types:**
- `max-attempt` - Personal best attempts
- `sub-max` - Working at lower percentages
- `warm-up` - Pre-session warm-ups
- `recovery` - Active recovery, easy work

**Difficulty Levels:**
- `beginner`
- `intermediate`
- `advanced`
- `expert`

**Special Categories:**
- `competition` - Competition simulation
- `fun` - Enjoyment-focused
- `experimental` - Trying new approaches

**Custom Tags:**
- Users can type any custom tag
- Custom tags are stored per routine
- No validation or limit on custom tags
- Case-insensitive for consistency

**Admin Control:**
- Suggested tags stored in app config (Firestore or environment variable)
- Admin can add new suggested tags without code changes
- Tags propagate to all users' editor interfaces
- No need to update existing routines when adding new suggested tags

**Tag Storage:**
```typescript
// Simple string array, lowercase for consistency
tags: ['co2', 'endurance', 'intermediate']
```

**UI Components Needed:**
1. **Tag selector** (routine editor): Checkboxes + custom input field
2. **Tag filter** (routine library): Filter routines by selected tags
3. **Tag display** (routine cards): Show tags as colored chips/badges
4. **Tag analytics** (dashboard): Group sessions by tags, show tag-based stats

---

### Open Questions About Routines

**✅ RESOLVED decisions:**
1. ✅ **Per-lap tracking:** Hybrid approach - quick summary + optional detailed data via video review
2. ✅ **Routine editor access:** Free during beta; admin-controlled tiers later
3. ✅ **Editor UX:** Blank template (no wizard)
4. ✅ **Sharing priorities:** Public marketplace, coach accounts, export/import
5. ✅ **Tag system:** Flexible multi-tag system replaces single adaptationTag; suggested tags + custom tags; admin can easily add new suggested tags via backend config
6. ✅ **Breathe-up timing:** Two separate fields - initialBreatheUpTime and restBetweenReps
7. ✅ **Video integration:** MVP with external reference + YouTube URL + thumbnail images
8. ✅ **Routine structure:** All structure fields (lapDistance, repDuration, numberOfReps) are optional
9. ✅ **Default routines:** 4 system defaults + 1 custom user routine (5 total for free tier)

**❓ STILL NEED answers:**

All major design questions have been resolved! The routine system is fully defined and ready for implementation.

**Minor implementation details to finalize during development:**
1. **Tag color coding:** Should different tag types have different colors in the UI? (e.g., green for CO₂, blue for mental, red for max-attempt)
2. **TrackingConfig defaults:** What should be the default tracking config for new custom routines? (All enabled? Minimal set?)
3. **Routine sorting:** Default sort order in library (alphabetical, most recent, most used, by tags?)

---

## 2. Disciplines & Metrics

For each discipline, define what data should be captured.
- Note: this will be entirely determined by the user input.
  
  However for Max attempts, and Sub-max attempts (the two standard routines) the following would be captured:

### STA (Static Apnea)

**Primary metric:**
- [ ] Duration only (mm:ss)
- [ ] Other: ___________

**Secondary metrics to track:**
> [List any additional data: e.g., heart rate, recovery time, pre-dive breathing, etc.]

**Optional notes/fields:**
> [What else might you want to record? Pool depth, water temp, how you felt, etc.]

---

### DYN (Dynamic Apnea with Fins)

**Primary metric:**
- [ ] Distance only (meters)
- [ ] Duration only (mm:ss)
- [ ] Both distance and duration
- [ ] Other: ___________

**Secondary metrics to track:**
> [List any additional data]

**Optional notes/fields:**
> [What else might you want to record?]

---

### DNF (Dynamic No Fins)

**Primary metric:**
- [ ] Distance only (meters)
- [ ] Duration only (mm:ss)
- [ ] Both distance and duration
- [ ] Other: ___________

**Secondary metrics to track:**
> [List any additional data]

**Optional notes/fields:**
> [What else might you want to record?]

---

### DYNB (Dynamic Bifins)

**Primary metric:**
- [ ] Distance only (meters)
- [ ] Duration only (mm:ss)
- [ ] Both distance and duration
- [ ] Other: ___________

**Secondary metrics to track:**
> [List any additional data]

**Optional notes/fields:**
> [What else might you want to record?]

---

## 3. Common Metadata

What metadata applies to all dives/sessions?

**Date & Time:**
- [ ] Date only
- [ ] Date and time
- [ ] Auto-populate with current time (editable)

**Location:**
- [ ] Not tracked
- [ ] Free text field
- [ ] Dropdown of saved locations
- [ ] Other: ___________

**Pool specifications:**
> [Do you want to track pool depth, length, temperature? How?]

**Training context:**
> [Training vs competition? Warm-up vs max attempt? Tags or categories?]

**Personal state:**
> [Any fields for how you felt, sleep quality, nutrition, stress level, etc.?]

**Notes/Comments:**
- [ ] Required
- [ ] Optional
- [ ] Not needed

---

## 4. User Flow at Poolside

Imagine you just finished a dive. Walk through the ideal logging experience:

**Step 1: Starting a log entry**
> [How do you initiate? One tap from dashboard? Pre-start a session? Quick-add button?]

**Step 2: Selecting discipline**
> [Dropdown? Buttons? Remember last used? How many taps?]

**Step 3: Entering metrics**
> [What's the fastest way to input? Number pad? Timer? Voice input consideration?]

**Step 4: Adding optional data**
> [How much friction is acceptable? Collapsible "advanced" section? Skip entirely?]

**Step 5: Saving**
> [Save and done? Save and add another? Review before save?]

**Critical constraint:**
> [What's the maximum number of taps/interactions you'd tolerate when logging poolside?]

---

## 5. Required vs Optional Fields

Mark each field as required (R) or optional (O):

**For every dive:**
- [ ] Discipline (R/O)
- [ ] Date (R/O)
- [ ] Primary metric (distance or duration) (R/O)
- [ ] Notes (R/O)

**Other fields:**
> [List any other fields and mark them R or O]

---

## 6. Data Validation

**Duration format:**
> [How should users input time? mm:ss with keyboard? Separate minutes/seconds fields? Timer mode?]

**Distance format:**
> [Meters only? Support decimal (25.5m)? Whole numbers only?]

**Acceptable ranges:**
> [Any validation? E.g., STA must be < 15 minutes, DYN must be < 300m, etc.?]

---

## 7. Edge Cases & Special Scenarios

**Failed attempts:**
> [How do you want to log a dive that you had to abort? Separate flag? Just use notes?]

**Personal bests:**
> [Should the app auto-detect and highlight PBs? Manual flag? Calculate from history?]

**Training vs Competition:**
> [Do you want to distinguish these? Separate mode? Tag? Not important?]

**Multiple sessions per day:**
> [Do you sometimes train multiple times in one day? How should these be handled?]

**Editing/deleting:**
> [Should you be able to edit past dives? Delete them? How far back?]

---

## 8. Future Considerations

These don't need to be built now, but thinking ahead helps shape the data model:

**Video uploads:**
> [Would you ever want to attach form-check videos to dives?]

**Equipment tracking:**
> [Track which fins, wetsuit, etc. you used?]

**Training plans:**
> [Structured programs with goals? Integration with planned workouts?]

**Social features:**
> [What would you want to share? Individual dives? Weekly summaries? PBs only?]

**Offline support:**
> [Critical feature or nice-to-have? How long offline? Auto-sync when back online?]

**Export/backup:**
> [What format? CSV? JSON? PDF report?]

---

## 9. Data Model Summary

Based on your answers above, write a proposed data structure:

### Session Object (if using sessions)
```typescript
{
  // Fill in based on your decisions above
}
```

### Dive Object
```typescript
{
  // Fill in based on your decisions above
}
```

### Example Entry
> [Write out a concrete example of what a logged dive/session would look like with real data]

---

## 10. Open Questions

List anything you're still unsure about or want to explore:

1.
2.
3.

---

## Next Steps

After completing this document:
- [ ] Review and validate data model
- [ ] Update `claude.md` with finalized data structures
- [ ] Implement Firestore collections based on this design
- [ ] Build UI forms matching this UX flow
