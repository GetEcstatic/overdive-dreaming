# Data Model Updates - Based on Dynamic Max Review

## Changes Required

### 1. RoutineTemplate Interface

**Current:**
```typescript
interface RoutineTemplate {
  // ...
  initialBreatheUpTime?: number;
  lapDistance?: number;
  // ...
}
```

**Updated:**
```typescript
interface RoutineTemplate {
  // ...
  // REMOVED: initialBreatheUpTime (moved to tracking/log)
  repDistance?: number; // RENAMED from lapDistance for clarity
  // ...
}
```

---

### 2. TrackingConfig Interface

**Current:**
```typescript
interface TrackingConfig {
  trackLapsCompleted: boolean;
  trackTimePerLap: boolean;
  trackRestBetweenLaps: boolean;
  trackKicksPerLap: boolean;
  trackArmPullsPerLap: boolean;
  trackBreathingTechnique: boolean;
  trackRPE: boolean;
  trackJoyScale: boolean;
  trackHoursSinceLastMeal: boolean;
  trackNotes: boolean;
}
```

**Updated:**
```typescript
interface TrackingConfig {
  // Session context
  trackPoolLength: boolean;                // NEW - pool size in meters
  trackInitialBreatheUpTime: boolean;      // NEW - pre-dive breathe-up

  // Performance metrics
  trackTotalDistance: boolean;             // NEW - total meters (for max attempts)
  trackTotalTime: boolean;                 // NEW - total dive duration
  trackLapsCompleted: boolean;             // EXISTING - number of pool laps completed
  trackTimePerLap: boolean;                // EXISTING - detailed per-lap times
  trackRestBetweenLaps: boolean;           // EXISTING - rest between reps
  trackKicksPerLap: boolean;               // EXISTING - kicks per lap
  trackArmPullsPerLap: boolean;            // EXISTING - arm pulls per lap (DNF only)

  // Training context
  trackBreathingTechnique: boolean;        // EXISTING
  trackRPE: boolean;                       // EXISTING
  trackJoyScale: boolean;                  // EXISTING
  trackHoursSinceLastMeal: boolean;        // EXISTING
  trackNotes: boolean;                     // EXISTING
}
```

---

### 3. RoutineLog Interface

**Current:**
```typescript
interface RoutineLog {
  id: string;
  routineId: string;
  sessionId: string;
  userId: string;
  date: timestamp;
  disciplineUsed: Discipline;

  // Performance data - per-lap details
  laps?: {
    lapNumber: number;
    timeSeconds?: number;
    restAfterSeconds?: number;
    kicks?: number;
    armPulls?: number;
  }[];

  // OR summary metrics
  summary?: {
    lapsCompleted: number;
    totalTimeSeconds?: number;
    averageTimePerLap?: number;
  };

  // Routine-level data
  breathingTechnique?: BreathingTechnique;
  breathingNotes?: string;
  rpe?: number;
  joyScale?: number;
  hoursSinceLastMeal?: number;
  notes?: string;

  // Media
  thumbnailImageUrl?: string;
  performanceVideoUrl?: string;
  videoTimestamp?: timestamp;
  hasDetailedData: boolean;

  createdAt: timestamp;
  updatedAt: timestamp;
}
```

**Updated:**
```typescript
interface RoutineLog {
  id: string;
  routineId: string;
  sessionId: string;
  userId: string;
  date: timestamp;
  disciplineUsed: Discipline;

  // Session context (NEW)
  poolLength?: number;                     // meters - pool size for this routine
  initialBreatheUpTime?: number;           // seconds - actual breathe-up before dive

  // Performance data - max attempt metrics (NEW)
  totalDistance?: number;                  // meters - for max attempts (DYN/DNF/DYNB)
  totalTime?: number;                      // seconds - total dive duration

  // Performance data - per-lap details (EXISTING)
  laps?: {
    lapNumber: number;                     // which lap (pool length)
    timeSeconds?: number;                  // time for this lap
    restAfterSeconds?: number;             // rest after this lap
    kicks?: number;                        // kicks during this lap
    armPulls?: number;                     // arm pulls during this lap (DNF only)
  }[];

  // OR summary metrics (EXISTING, UPDATED)
  summary?: {
    lapsCompleted?: number;                // total pool laps completed
    totalTimeSeconds?: number;             // DEPRECATED - use totalTime instead
    averageTimePerLap?: number;            // average time per lap
  };

  // Routine-level data (EXISTING)
  breathingTechnique?: BreathingTechnique;
  breathingNotes?: string;
  rpe?: number;                            // 1-10
  joyScale?: number;                       // 1-10
  hoursSinceLastMeal?: number;
  notes?: string;

  // Media (EXISTING)
  thumbnailImageUrl?: string;
  performanceVideoUrl?: string;
  videoTimestamp?: timestamp;
  hasDetailedData: boolean;                // true if laps[] is populated

  createdAt: timestamp;
  updatedAt: timestamp;
}
```

---

## Data Entry Flow Examples

### Max Attempt (Poolside Quick Entry)
User completes a DYN max and immediately logs:
```typescript
{
  disciplineUsed: 'DYN',
  poolLength: 50,                    // pool is 50m
  totalDistance: 175,                // covered 175m total
  totalTime: 225,                    // 3:45 in seconds
  initialBreatheUpTime: 180,         // did 3min breathe-up
  breathingTechnique: 'tidal',
  rpe: 8,
  joyScale: 9,
  notes: 'Felt strong, good turn at 150m',
  hasDetailedData: false             // didn't enter per-lap times yet
}
```

### Max Attempt (Later - Video Review)
User watches video and adds detailed per-lap data:
```typescript
{
  // ... all previous fields stay ...
  laps: [
    { lapNumber: 1, timeSeconds: 42, kicks: 18 },
    { lapNumber: 2, timeSeconds: 45, kicks: 20 },
    { lapNumber: 3, timeSeconds: 48, kicks: 22 },
    { lapNumber: 4, timeSeconds: 50, kicks: 21 }  // partial lap (25m of 50m)
  ],
  hasDetailedData: true              // NOW has detailed data
}
```

### Sweet 16 (Poolside Quick Entry)
User completes all 16 reps:
```typescript
{
  disciplineUsed: 'DYN',
  poolLength: 50,                    // pool is 50m
  summary: {
    lapsCompleted: 16,               // completed all 16 reps
    averageTimePerLap: 52            // average 52s per rep
  },
  initialBreatheUpTime: 120,         // did 2min initial breathe-up
  breathingTechnique: 'tidal',
  rpe: 7,
  joyScale: 8,
  hasDetailedData: false
}
```

### Sweet 16 (With Detailed Per-Rep Data)
User enters or adds detailed times:
```typescript
{
  // ... all previous fields ...
  laps: [
    { lapNumber: 1, timeSeconds: 48, restAfterSeconds: 30 },
    { lapNumber: 2, timeSeconds: 50, restAfterSeconds: 30 },
    // ... all 16 reps ...
    { lapNumber: 16, timeSeconds: 58, restAfterSeconds: 0 }
  ],
  hasDetailedData: true
}
```

---

## Terminology Clarifications

- **Lap** = One length of the pool (e.g., 25m or 50m)
- **Rep** = One repetition of the routine element (e.g., in Sweet 16, one rep = 50m, which might be 1 or 2 pool laps depending on pool length)
- **Pool Length** = Size of the pool (25m, 50m, 33m, etc.)
- **Total Distance** = Total meters covered (for max attempts)
- **Laps Completed** = Total number of pool lengths completed

---

## Files to Update

1. `src/lib/types.ts` - Update interfaces
2. `scripts/seed-data.ts` - Update default routines with new tracking config
3. `src/lib/firestore.ts` - Update type imports (no logic changes needed)
4. `src/lib/components/QuickLogForm.svelte` - Add new fields, support detailed entry
5. `src/routes/(app)/dives/+page.svelte` - Update handleSubmit to include new fields
6. `firestore-structure.md` - Update documentation
7. `CLAUDE.md` - Update data models section

---

## Implementation Order

1. ✅ Review this document
2. Update `src/lib/types.ts`
3. Update `scripts/seed-data.ts` with corrected tracking configs
4. Update QuickLogForm to support new fields
5. Update dives page to handle new data
6. Test logging flow
7. Update documentation
8. Git commit
