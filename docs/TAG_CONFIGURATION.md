# Tag Configuration Reference

This document defines which tags/fields are selectable per-log vs configured in the routine builder.

## Tag Selection Matrix

| Tag/Field | Per-Log Selection | Routine Builder | Notes |
|-----------|:-----------------:|:---------------:|-------|
| **Competition Tags** ||||
| `cardTag` (white/yellow/red) | ✅ | ❌ | Competition result - only relevant at log time |
| `recordTag` (NR/CR/WR) | ✅ | ❌ | Achievement markers - only at log time |
| `isCompetition` | ✅ | ❌ | Flag if this was a competition dive |
| `competitionOrg` | ✅ | ❌ | AIDA, CMAS, etc. - only when isCompetition |
| **Session Context** ||||
| `visibility` (private/public) | ✅ | ❌ | User decides per-session |
| `poolType` (indoor/outdoor) | ✅ | ✅ | Can set default in routine, override in log |
| `location` | ✅ | ❌ | Session-specific |
| `timeOfDay` | ✅ (auto) | ❌ | Auto-determined, can override |
| `isDrySession` | ✅ | ✅ | Routine can specify, user confirms |
| **Performance Tracking** ||||
| `breathingTechnique` | ✅ | ✅ | Routine can suggest, user selects actual |
| `rpe` (1-10) | ✅ | ❌ | Session-specific feeling |
| `joyScale` (1-10) | ✅ | ❌ | Session-specific feeling |
| `isPB` | ✅ (auto) | ❌ | Auto-calculated on save |
| **Biometric Data** ||||
| `restingHeartRate` | ✅ | ❌ | Day-specific |
| `hrv` | ✅ | ❌ | Day-specific |
| `bodyWeight` | ✅ | ❌ | Day-specific |
| `menstrualCycleDay` | ✅ | ❌ | Day-specific |
| `basalMood` | ✅ | ❌ | Day-specific |
| **Routine Classification** ||||
| `discipline` (STA/DYN/DNF/DYNB) | ✅ (from routine) | ✅ | Routine defines options, user selects which |
| `activityType` | ❌ | ✅ | Defined by routine structure |
| `trainingAdaptations` (co2/o2/etc) | ❌ | ✅ | Routine characteristic |
| `diveTypes` (max/submax/warmup) | ❌ | ✅ | Routine characteristic |
| `difficultyLevels` | ❌ | ✅ | Routine characteristic |
| `specialCategories` | ❌ | ✅ | Routine characteristic |

## Implementation Recommendation

### Option 1: TypeScript Configuration (Recommended)

Create a `src/lib/config/tagConfig.ts`:

```typescript
export const TAG_CONFIG = {
  // Always available when logging any session
  perLogTags: {
    competition: ['cardTag', 'recordTag', 'isCompetition', 'competitionOrg'],
    session: ['visibility', 'location', 'poolType', 'isDrySession'],
    performance: ['rpe', 'joyScale', 'breathingTechnique'],
    biometric: ['restingHeartRate', 'hrv', 'bodyWeight', 'menstrualCycleDay', 'basalMood']
  },
  
  // Configured when creating/editing a routine template
  routineBuilderTags: {
    classification: ['discipline', 'activityType'],
    adaptations: ['co2', 'o2', 'technique', 'mental', 'endurance', 'power'],
    diveTypes: ['max-attempt', 'sub-max', 'warm-up', 'recovery', 'dry'],
    difficulty: ['beginner', 'intermediate', 'advanced', 'expert'],
    special: ['competition', 'fun', 'experimental']
  },
  
  // Tags that can be set in routine but overridden in log
  inheritableTags: ['poolType', 'isDrySession', 'breathingTechnique']
} as const;
```

### Option 2: Firestore Config Document

Store in `config/tags` collection for runtime flexibility:

```json
{
  "perLogTags": { ... },
  "routineBuilderTags": { ... },
  "inheritableTags": [ ... ]
}
```

### Recommendation

**Use Option 1 (TypeScript)** because:
1. Type safety - compiler catches mismatches
2. Self-documenting - definitions live with code
3. No network call - available immediately
4. IDE autocomplete - easier development

The markdown table above serves as the **planning/communication document**, while the TypeScript config becomes the **source of truth** in code.

## UI Implementation Notes

### Log Form
- Show all `perLogTags` fields
- Pre-populate `inheritableTags` from routine if available
- Auto-calculate `isPB` on save

### Routine Builder
- Show all `routineBuilderTags` as multi-select chips
- Show `inheritableTags` as "default values" section
- Store selected tags in `RoutineTemplate.tags` array
