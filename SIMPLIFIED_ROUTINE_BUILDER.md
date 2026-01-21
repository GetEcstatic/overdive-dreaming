
# Simplified Routine Builder

## Overview

This document outlines a simplified approach to building custom routines based on three main routine types.

---

## User Instructions (For Review)




#### Archived instructions (Already implemented/ignore!)
In the routine builder, there is an either/or option for wet or dry (STA). However it's possible that a routine could be used for both. In the routine builder there should be an option to select dry, wet or both ( in which case the quick-log form and log editor toggle will be active)

The 'effort level' section to select max or submax could be replace by tags for those. In fact all the tags need to be added to the routine builder. I see tags as a main method for filtering sessions in analytics. Where trackedmetrics don't require an actual value, tags are extremely important.
a Note on the max-position option in the routine builder (hybrid routines):
- `maxPosition?: 'start' | 'middle' | 'end'` - this isn't required. The max dive could be any one of the reps in a series. It should be easy to parse from the results data: the biggest dive (longest duration/distance) but the user may want to indicate which rep is expected for max in the routine builder. e.g. the routine expects a max on the 3rd rep, but actually the diver achieves the max dive on the 4th and needs to indicate this in the quick log.
- When selecting  "variable" interval settings, the user should be presented with a table indicating rest times and duration (if STA intervals) or distance (if DYN/DYNB/DNF intervals)

I believe there are only three routine types required to build almost all of the routines a user may need.

1. **Type 1:** A max attempt routine (dynamic disciplines or static). This is a record of a single long dive and may be a true max dive (Max) or slightly below (Sub Max)
2. **Type 2:** Interval series. This is a routine with a series of dives specified by the user. Each interval may have uniform or variable breathe-up, rest and dive durations (STA) or distance (Dynamic disciplines)
3. **Type 3:** A hybrid where an interval series may have a sub max/max dive somewhere in the series

Type 1 routines may be true max attempts or sub max attempts, and these should be indicated via a tag in the routine builder. The tag will then allow correct filtering and analysis in the analytics module.

Static apnea breath holds can be dry or wet. Dry routines should allow for a .csv import from Stamina app for direct parsing of HR and spo2 data and other metrics already defined.

Every type should allow the collection of ALL data metrics currently built into the app.

I would like a new routine builder that will allow the user to either:
1. Create a new routine based on the the three types above
2. duplicate and modify an existing default routine

Please evaluate a simple, intuitive UX flow that would take these principles, and allow for powerful implementation of the new routine builder, maintaining maximal data opportunites for data capture for geek users while not being threatening to novice users.







---

## Three Main Routine Types (Confirmed)

### Type 1: Max Attempt
**Single Performance Dive**
- A record of one long dive (dynamic or static)
- **Sub-types via tag:** Max / Sub-Max
- **Disciplines:** DYN, DNF, DYNB, STA
- **Static variant:** Dry or Wet (toggle)
- **Special:** Dry STA allows Stamina app CSV import (HR, SpO2, etc.)

### Type 2: Interval Series
**Multiple Reps with Structured Rest**
- Series of dives with defined parameters
- **Structure options:**
  - Uniform: Same breathe-up, rest, duration/distance for all reps
  - Variable/Progressive: Per-rep customization (CO2/O2 tables, etc.)
- **Disciplines:** All (STA uses duration, Dynamic uses distance)

### Type 3: Hybrid
**Interval Series + Max Component**
- Interval series with a max/sub-max dive embedded
- **Use case:** Warmup intervals → Max attempt → Optional cooldown
- **Position:** Max dive can be at start, middle, or end of series

---

## UX Flow Proposal

### Entry Points (2 paths)

```
[Routine Builder]
      │
      ├── [Create New] ────────────┐
      │                            │
      └── [Duplicate Existing] ────┴──→ [Type Selector]
```

### Option A: Progressive Disclosure (Recommended)

**Step 1: Choose Entry**
- "Start Fresh" → Type selector
- "Based on Existing" → Shows default routines list → Select → Pre-fills form

**Step 2: Type Selection (Visual Cards)**
```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   🎯 MAX        │  │   🔄 INTERVAL   │  │   ⚡ HYBRID     │
│   ATTEMPT       │  │   SERIES        │  │                 │
│                 │  │                 │  │                 │
│ Single dive     │  │ Multiple reps   │  │ Intervals +     │
│ performance     │  │ with structure  │  │ max attempt     │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

**Step 3: Basic Config (Type-Specific)**

*For Max Attempt:*
- Name, Description
- Discipline selector (DYN/DNF/DYNB/STA)
- Effort level: [Max] [Sub-Max]
- If STA: [Wet] [Dry]

*For Interval Series:*
- Name, Description  
- Discipline selector
- Structure: [Uniform] [Variable]
- Number of reps

*For Hybrid:*
- Name, Description
- Discipline selector
- Interval structure (same as Type 2)
- Max dive position: [Start] [Middle] [End]

**Step 4: Interval Details (Types 2 & 3 only)**

*Uniform mode:*
```
Breathe-up: [___] sec    Rest: [___] sec
Distance/Duration: [___]
Total Reps: [___]
```

*Variable mode:*
```
[+ Add Rep]

Rep 1: Breathe [__] → Hold/Swim [__] → Rest [__]
Rep 2: Breathe [__] → Hold/Swim [__] → Rest [__]
...
```

**Step 5: Data Tracking (Expandable Advanced Section)**

```
━━━ What to track ━━━━━━━━━━━━━━━━━━━━━━━

[Essential - Always On]
☑ Total distance/time
☑ Date/time

[Show Advanced Options ▼]
  ┌──────────────────────────────────┐
  │ ☐ Pool length                    │
  │ ☐ Initial breathe-up time        │
  │ ☐ Kicks per lap (dynamic)        │
  │ ☐ Arm pulls per lap (DNF)        │
  │ ☐ Time per rep                   │
  │ ☐ Rest between reps              │
  │ ☐ Contractions onset             │
  │ ☐ RPE (1-10)                     │
  │ ☐ Joy scale (1-10)               │
  │ ☐ Hours since meal               │
  │ ☐ Breathing technique level      │
  │ ☐ Equipment notes                │
  │ ☐ Buddy name                     │
  │ ☐ Samba/BO incident              │
  └──────────────────────────────────┘
```

**Step 6: Review & Save**
- Summary of routine configuration
- [Save as Draft] [Save & Test Log]

---

### Option B: Single-Page Wizard

All on one scrollable page with collapsible sections:
1. **Header:** Name + Description (always visible)
2. **Type Toggle:** Three large buttons (Type 1/2/3)
3. **Config Panel:** Dynamic fields based on type
4. **Tracking Accordion:** "Advanced Data Collection ▼"
5. **Save Button:** Fixed at bottom

---

## Design Principles

### For Novice Users
- Default tracking options pre-selected (minimal)
- Visual type selector with clear descriptions
- "Duplicate Existing" gives safe starting points
- Single-tap presets for common routines

### For Power Users  
- All metrics available via expandable "Advanced" section
- Variable interval table editor
- CSV import capability (Stamina app for dry STA)
- Full customization without limitations

### Progressive Complexity
```
Basic User Path:                Power User Path:
─────────────────               ─────────────────
Type → Discipline → Save        Type → Discipline → Advanced → 
                                Variable Table → All Metrics → Save
```

---

## Technical Notes

### Data Model Mapping to Existing Types

| UI Type | Maps To | Key Fields |
|---------|---------|------------|
| Max Attempt | `system-dynamic-max` / `system-static-max` variants | `isMaxAttempt: true`, `effortLevel: 'max'/'submax'` |
| Interval | Existing interval templates | `hasIntervals: true`, `intervalConfig: {...}` |
| Hybrid | New type needed | `isHybrid: true`, `maxPosition: 'start'/'middle'/'end'` |

### New Fields Required
- `effortLevel?: 'max' | 'submax'` - For filtering analytics
- `isDry?: boolean` - For STA routines
- `isHybrid?: boolean` - Type 3 identifier  
- `maxPosition?: 'start' | 'middle' | 'end'` - Where max dive occurs in hybrid - NOTE: this isn't required. The max dive could be any one of the reps. It should be easy to parse from the results data: the biggest dive (longest duration/distance) but the user may want to indicate which rep is expected for max in the routine.

### Stamina CSV Import
- Already have CSV parsing infrastructure
- Need to add Stamina-specific format support
- Fields: HR, SpO2, timestamps, contraction markers

---

## Questions for Clarification

1. **Hybrid max position:** Should users be able to place the max attempt at ANY position (between any two intervals), or just start/middle/end? *Yes, the could be at any point, and this might not always be predictable. It might be the max attempt can only be identified after the dives have been completed, so their needs to be provision for amending this in the quik-log form/editor*

2. **Duplicate & Modify:** When duplicating, should the new routine start with the same name + "(Copy)" or force user to rename immediately? Same name + (copy), but allow user to rename immediately if they wish

3. **Draft system:** Should we support saving incomplete routines as drafts, or require complete configuration before save? Even if complete config is saved, the routine should be editable later. So draft saving isn't really required.

4. **Default tracking presets:** Should we offer preset tracking profiles?
   - "Minimal" - Just basics (distance/time, date)
   - "Standard" - + RPE, notes, pool length
   - "Full" - All metrics enabled
No. I would prefer all metrics to be offered, but organised carefully under user friendly section headings that can be expanded/closed to avoid cluttering the UI.

4. **Competition tagging:** Should Max Attempt routines have a "Competition" toggle separate from the Max/Sub-Max distinction? Comp toggle should be selectable for all max attempt routines from the quick-log page/editor.

---

## Recommendation

I recommend **Option A (Progressive Disclosure)** with:
- Visual card-based type selector
- Collapsible "Advanced Options" for tracking
- Pre-built tracking presets (Minimal/Standard/Full) 
- "Duplicate Existing" prominently featured for nervous users

This balances power with simplicity and leverages existing UI patterns from the app.

