# Firestore Database Structure

## Visual Hierarchy

```
firestore/
├── users/ (collection)
│   └── {userId}/ (document)
│       ├── uid: string
│       ├── email: string
│       ├── displayName: string
│       ├── photoURL: string
│       ├── tier?: 'free' | 'premium'
│       ├── customRoutineCount?: number
│       ├── createdAt: timestamp
│       └── updatedAt: timestamp
│
├── routines/ (collection) - Reusable training templates
│   └── {routineId}/ (document)
│       ├── id: string
│       ├── name: string
│       ├── description: string
│       ├── disciplines: string[]
│       ├── tags: string[]  ⭐ FLEXIBLE TAG SYSTEM
│       ├── restBetweenReps?: number (seconds)
│       ├── repDistance?: number (meters - renamed from lapDistance)
│       ├── repDuration?: number (seconds)
│       ├── numberOfReps?: number
│       ├── trackingConfig: {
│       │   trackPoolLength: boolean
│       │   trackInitialBreatheUpTime: boolean
│       │   trackTotalDistance: boolean
│       │   trackTotalTime: boolean
│       │   trackLapsCompleted: boolean
│       │   trackTimePerLap: boolean
│       │   trackRestBetweenLaps: boolean
│       │   trackKicksPerLap: boolean
│       │   trackArmPullsPerLap: boolean
│       │   trackBreathingTechnique: boolean
│       │   trackRPE: boolean
│       │   trackJoyScale: boolean
│       │   trackHoursSinceLastMeal: boolean
│       │   trackNotes: boolean
│       │   }
│       ├── instructionalVideoUrl?: string
│       ├── createdBy: 'system' | userId
│       ├── isPublic: boolean
│       ├── tier?: 'free' | 'premium'
│       ├── createdAt: timestamp
│       └── updatedAt: timestamp
│
├── sessions/ (collection) - Pool visits
│   └── {sessionId}/ (document)
│       ├── id: string
│       ├── userId: string
│       ├── date: timestamp
│       ├── location?: string
│       ├── notes?: string
│       ├── createdAt: timestamp
│       ├── updatedAt: timestamp
│       │
│       ├── routineLogs/ (subcollection) - Routine instances
│       │   └── {routineLogId}/ (document)
│       │       ├── id: string
│       │       ├── routineId: string → references /routines/{routineId}
│       │       ├── sessionId: string
│       │       ├── userId: string
│       │       ├── date: timestamp
│       │       ├── disciplineUsed: 'STA' | 'DYN' | 'DNF' | 'DYNB'
│       │       ├── isCompetition?: boolean
│       │       ├── compeitionOrg?: string (e.g., 'AIDA', 'CMAS')
│       │       ├── importBatchId?: string
│       │       ├── cardTag?: 'white' | 'yellow' | 'red'
│       │       ├── recordTag?: 'NR' | 'CR' | 'WR'
│       │       ├── poolLength?: number (meters - pool size for this routine)
│       │       ├── initialBreatheUpTime?: number (seconds - actual breathe-up)
│       │       ├── totalDistance?: number (meters - for max attempts)
│       │       ├── totalTime?: number (seconds - total dive duration)
│       │       ├── laps?: [{lapNumber, timeSeconds, restAfterSeconds, kicks, armPulls}]
│       │       ├── summary?: {lapsCompleted, totalTimeSeconds, averageTimePerLap}
│       │       ├── breathingTechnique?: string
│       │       ├── breathingNotes?: string
│       │       ├── rpe?: number (1-10)
│       │       ├── joyScale?: number (1-10)
│       │       ├── hoursSinceLastMeal?: number
│       │       ├── notes?: string
│       │       ├── thumbnailImageUrl?: string
│       │       ├── performanceVideoUrl?: string
│       │       ├── videoTimestamp?: timestamp
│       │       ├── hasDetailedData: boolean
│       │       ├── createdAt: timestamp
│       │       └── updatedAt: timestamp
│       │
│       └── dives/ (subcollection) - Individual dives (non-routine)
│           └── {diveId}/ (document)
│               ├── id: string
│               ├── sessionId: string
│               ├── userId: string
│               ├── discipline: 'STA' | 'DYN' | 'DNF' | 'DYNB'
│               ├── date: timestamp
│               ├── duration?: number
│               ├── distance?: number
│               ├── notes?: string
│               ├── breathingTechnique?: string
│               ├── rpe?: number
│               ├── createdAt: timestamp
│               └── updatedAt: timestamp
│
└── config/ (collection) - App configuration
    └── suggestedTags/ (document) ⭐ ADMIN-EDITABLE
        ├── trainingAdaptations: string[]
        ├── diveTypes: string[]
        ├── difficultyLevels: string[]
        └── specialCategories: string[]
```

---

## Collection Relationships

### One-to-Many Relationships

```
User (1) ─────< Sessions (many)
         ─────< Routines (many custom)

Session (1) ─────< RoutineLogs (many)
            ─────< Dives (many)

RoutineTemplate (1) ─────< RoutineLogs (many instances logged by users)
```

### Reference Relationships

```
RoutineLog.routineId → Routines/{routineId}
RoutineLog.userId → Users/{userId}
RoutineLog.sessionId → Sessions/{sessionId} (parent)

Session.userId → Users/{userId}
```

---

## Example Data Flow

### Scenario: User creates and logs a routine

**1. User creates custom routine**
```
POST /routines/{newRoutineId}
{
  "name": "Tom's CO₂ Builder",
  "description": "8×50m DYN progressive CO₂ work",
  "disciplines": ["DYN", "DNF"],
  "tags": ["co2", "endurance", "intermediate"],  // User selects from suggested + adds custom
  "initialBreatheUpTime": 120,
  "restBetweenReps": 45,
  "lapDistance": 50,
  "numberOfReps": 8,
  "trackingConfig": {
    "trackLapsCompleted": true,
    "trackTimePerLap": true,
    "trackRPE": true,
    "trackJoyScale": true,
    // ... other fields
  },
  "createdBy": "user123",
  "isPublic": false
}
```

**2. User goes to pool and starts a session**
```
POST /sessions/{newSessionId}
{
  "userId": "user123",
  "date": "2025-01-15T10:00:00Z",
  "location": "Main Street Pool"
}
```

**3. User performs the routine and logs it (quick summary)**
```
POST /sessions/{sessionId}/routineLogs/{newRoutineLogId}
{
  "routineId": "routine456",  // References Tom's CO₂ Builder
  "sessionId": "session789",
  "userId": "user123",
  "disciplineUsed": "DYN",
  "summary": {
    "lapsCompleted": 8,
    "totalTimeSeconds": 384  // 6 min 24 sec total
  },
  "rpe": 7,
  "joyScale": 8,
  "notes": "Last 3 laps were tough, felt CO₂ building nicely",
  "hasDetailedData": false  // No per-lap data yet
}
```

**4. Later, user adds detailed data from video review**
```
PATCH /sessions/{sessionId}/routineLogs/{routineLogId}
{
  "laps": [
    {"lapNumber": 1, "timeSeconds": 45, "restAfterSeconds": 45},
    {"lapNumber": 2, "timeSeconds": 46, "restAfterSeconds": 45},
    {"lapNumber": 3, "timeSeconds": 47, "restAfterSeconds": 45},
    {"lapNumber": 4, "timeSeconds": 48, "restAfterSeconds": 45},
    {"lapNumber": 5, "timeSeconds": 50, "restAfterSeconds": 45},
    {"lapNumber": 6, "timeSeconds": 51, "restAfterSeconds": 45},
    {"lapNumber": 7, "timeSeconds": 53, "restAfterSeconds": 45},
    {"lapNumber": 8, "timeSeconds": 55, "restAfterSeconds": 0}
  ],
  "hasDetailedData": true,
  "performanceVideoUrl": "https://youtube.com/watch?v=example"
}
```

---

## Query Patterns

### Common Queries

**Get all routines for a user:**
```javascript
// System defaults (everyone sees these)
db.collection('routines')
  .where('createdBy', '==', 'system')
  .get()

// User's custom routines
db.collection('routines')
  .where('createdBy', '==', currentUserId)
  .get()
```

**Get all sessions for a user:**
```javascript
db.collection('sessions')
  .where('userId', '==', currentUserId)
  .orderBy('date', 'desc')
  .limit(20)
  .get()
```

**Get all routine logs in a session:**
```javascript
db.collection('sessions')
  .doc(sessionId)
  .collection('routineLogs')
  .get()
```

**Get all sessions with a specific routine (for analytics):**
```javascript
// Requires composite index: routineLogs.userId + routineLogs.routineId + routineLogs.date
db.collectionGroup('routineLogs')
  .where('userId', '==', currentUserId)
  .where('routineId', '==', specificRoutineId)
  .orderBy('date', 'desc')
  .get()
```

**Filter routines by tag:**
```javascript
db.collection('routines')
  .where('tags', 'array-contains', 'co2')
  .get()

// Or filter by multiple tags (requires array-contains-any)
db.collection('routines')
  .where('tags', 'array-contains-any', ['co2', 'mental', 'endurance'])
  .get()
```

**Get suggested tags (for routine editor UI):**
```javascript
const tagsDoc = await db.collection('config').doc('suggestedTags').get()
const { trainingAdaptations, diveTypes, difficultyLevels, specialCategories } = tagsDoc.data()
```

---

## Composite Indexes Required

Firestore will require these composite indexes for certain queries:

1. **routineLogs collection group queries:**
   ```
   Collection: routineLogs (collection group)
   Fields: userId (Ascending), date (Descending)
   ```

2. **routineLogs by routine and user:**
   ```
   Collection: routineLogs (collection group)
   Fields: userId (Ascending), routineId (Ascending), date (Descending)
   ```

3. **sessions by user and date:**
   ```
   Collection: sessions
   Fields: userId (Ascending), date (Descending)
   ```

4. **routines by tag and creator:**
   ```
   Collection: routines
   Fields: tags (Arrays), createdBy (Ascending)
   ```

These indexes will be auto-generated when you first run the queries in development. Firestore will provide the index creation link in the console error.

---

## Data Size Estimates

### Per User (Active Training - 3 sessions/week for 1 year)

**Routines:**
- 4 system defaults (shared)
- ~5-10 custom routines = ~5KB

**Sessions:**
- 156 sessions/year
- ~500 bytes per session
- Total: ~78KB

**Routine Logs:**
- ~2 routines per session average
- 312 routine logs/year
- ~1-2KB per log (with detailed data)
- Total: ~468KB

**Individual Dives:**
- ~1-2 individual dives per session
- 234 dives/year
- ~300 bytes per dive
- Total: ~70KB

**Total per active user per year:** ~600KB

**For 1000 active users:** ~600MB/year of core data
*Note: Does not include images/videos (stored separately in Firebase Storage)*

---

## Admin Operations

### Adding a New Suggested Tag

**No code changes required!** Admin simply updates Firestore:

```javascript
// Via Firebase Console or admin script
await db.collection('config').doc('suggestedTags').update({
  trainingAdaptations: firebase.firestore.FieldValue.arrayUnion('flexibility')
})
```

New tag immediately appears in all users' routine editor UI.

### Creating System Default Routines

**Seed script to run once during initial deployment:**

```javascript
const systemRoutines = [
  {
    id: 'system-dynamic-max',
    name: 'Dynamic Max Attempt',
    description: 'Single maximal effort dive with own-time breathe-up',
    disciplines: ['DYN', 'DYNB', 'DNF'],
    tags: ['max-attempt', 'pb'],
    trackingConfig: {
      trackLapsCompleted: false,
      trackTimePerLap: true,
      trackRestBetweenLaps: false,
      trackKicksPerLap: false,
      trackArmPullsPerLap: false,
      trackBreathingTechnique: true,
      trackRPE: true,
      trackJoyScale: true,
      trackHoursSinceLastMeal: false,
      trackNotes: true
    },
    createdBy: 'system',
    isPublic: true,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  },
  // ... other 3 default routines
]

// Create all defaults
for (const routine of systemRoutines) {
  await db.collection('routines').doc(routine.id).set(routine)
}
```

---

## Migration Strategy

### From Old Simple Model to New Hierarchical Model

If you had old data in a simple `dives/{diveId}` collection:

```javascript
// Migration script (run once)
const oldDives = await db.collection('dives').get()

for (const diveDoc of oldDives.docs) {
  const dive = diveDoc.data()

  // Create session for this dive's date (or group by date)
  const sessionId = await createOrGetSession(dive.userId, dive.date)

  // Move dive to new structure
  await db.collection('sessions')
    .doc(sessionId)
    .collection('dives')
    .doc(diveDoc.id)
    .set({
      ...dive,
      sessionId: sessionId
    })

  // Delete old dive
  await diveDoc.ref.delete()
}
```

---

## Security Considerations

1. **User data isolation:** Users can only read/write their own sessions and routine logs
2. **System routines are protected:** Users cannot modify routines with `createdBy == 'system'`
3. **Public routines:** All authenticated users can read all routines (for marketplace browsing)
4. **Config is read-only:** Users can read suggested tags but cannot modify them
5. **TODO:** Add admin role for config write access

---

## Performance Optimization

### Best Practices

1. **Denormalize routine name in logs:**
   - Store `routineName: string` in RoutineLog to avoid extra read
   - Update when routine is renamed (rare)

2. **Use subcollections for scalability:**
   - Sessions can have unlimited routine logs and dives
   - Avoids document size limits (1MB)

3. **Limit queries with pagination:**
   - Use `.limit(20)` and cursor-based pagination
   - Don't load entire history at once

4. **Cache config document:**
   - Suggested tags rarely change
   - Cache locally, refresh daily

5. **Use collection group queries sparingly:**
   - They're powerful but slower than direct collection queries
   - Good for analytics, not real-time UI

---

## Backup Strategy

**Firestore automatic backups:** Enable daily automated exports to Cloud Storage

**Manual export command:**
```bash
gcloud firestore export gs://[BUCKET_NAME]/[EXPORT_FOLDER]
```

**What to back up:**
- `/users` - Critical user data
- `/routines` - User-created templates
- `/sessions` - All training logs
- `/config` - App configuration

**Recovery:**
```bash
gcloud firestore import gs://[BUCKET_NAME]/[EXPORT_FOLDER]
```
