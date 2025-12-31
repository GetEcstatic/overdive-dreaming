# Utility Functions

## Time Utilities (`time.ts`)

### Storage vs Display Format

**IMPORTANT:** All time values are stored as **seconds** in the database, but displayed as **mm:ss** in the UI.

**Why store as seconds?**
- Easy calculations (average, sum, compare)
- Simple sorting and querying
- Standard database practice for durations

**Why display as mm:ss?**
- More intuitive for users
- Standard freediving notation
- Easier to read and enter

---

### Usage Examples

#### 1. Input Component (mm:ss format)

```svelte
<script lang="ts">
  import { componentsToSeconds, isValidTime } from '$lib/utils/time';

  let minutes = $state<number | undefined>(undefined);
  let seconds = $state<number | undefined>(undefined);

  function handleSubmit() {
    if (isValidTime(minutes, seconds)) {
      const totalSeconds = componentsToSeconds(minutes!, seconds!);
      // Save totalSeconds to database
      saveToDatabase({ duration: totalSeconds });
    }
  }
</script>

<div class="flex gap-2">
  <input
    type="number"
    bind:value={minutes}
    min="0"
    placeholder="mm"
  />
  <span>:</span>
  <input
    type="number"
    bind:value={seconds}
    min="0"
    max="59"
    placeholder="ss"
  />
</div>
```

#### 2. Display Component (show mm:ss from seconds)

```svelte
<script lang="ts">
  import { formatTime } from '$lib/utils/time';

  let dive = { duration: 225 }; // 3:45 in seconds
</script>

<div>
  Dive time: {formatTime(dive.duration)}
  <!-- Displays: "Dive time: 3:45" -->
</div>
```

#### 3. Editing Existing Data

```svelte
<script lang="ts">
  import { secondsToComponents, componentsToSeconds } from '$lib/utils/time';

  let dive = { duration: 225 }; // 3:45 in seconds

  // Convert database value to form inputs
  let { minutes, seconds } = secondsToComponents(dive.duration);

  function handleUpdate() {
    const totalSeconds = componentsToSeconds(minutes, seconds);
    updateDatabase({ duration: totalSeconds });
  }
</script>
```

#### 4. Parse String Input (alternative approach)

```svelte
<script lang="ts">
  import { parseTime, formatTime } from '$lib/utils/time';

  let timeInput = $state('');

  function handleSubmit() {
    const seconds = parseTime(timeInput);
    if (seconds !== null) {
      saveToDatabase({ duration: seconds });
    } else {
      alert('Invalid time format. Use mm:ss');
    }
  }
</script>

<input
  type="text"
  bind:value={timeInput}
  placeholder="mm:ss (e.g., 3:45)"
/>
```

---

### API Reference

#### `secondsToComponents(totalSeconds: number): TimeComponents`
Convert seconds to mm:ss components.

```typescript
secondsToComponents(225) // { minutes: 3, seconds: 45 }
secondsToComponents(90)  // { minutes: 1, seconds: 30 }
```

#### `componentsToSeconds(minutes: number, seconds: number): number`
Convert mm:ss components to total seconds.

```typescript
componentsToSeconds(3, 45) // 225
componentsToSeconds(1, 30) // 90
```

#### `formatTime(totalSeconds: number): string`
Format seconds as mm:ss string for display.

```typescript
formatTime(225) // "3:45"
formatTime(90)  // "1:30"
formatTime(65)  // "1:05"
```

#### `parseTime(timeString: string): number | null`
Parse mm:ss string to seconds. Returns null if invalid.

```typescript
parseTime("3:45") // 225
parseTime("1:30") // 90
parseTime("1:5")  // 65 (auto-pads seconds)
parseTime("abc")  // null
parseTime("1:65") // null (seconds must be < 60)
```

#### `isValidTime(minutes: number | undefined, seconds: number | undefined): boolean`
Validate mm:ss components.

```typescript
isValidTime(3, 45)         // true
isValidTime(1, 30)         // true
isValidTime(undefined, 30) // false
isValidTime(1, 65)         // false (seconds >= 60)
isValidTime(-1, 30)        // false (negative values)
```

---

### Time Fields in Database

All these fields store time as **seconds** (number):

**RoutineTemplate:**
- `repDuration` - Duration of each rep (for static routines)

**RoutineLog:**
- `totalTime` - Total dive duration
- `initialBreatheUpTime` - Pre-dive breathe-up time
- `laps[].timeSeconds` - Time for each lap
- `laps[].restAfterSeconds` - Rest after each lap
- `summary.totalTimeSeconds` - Total session time (deprecated)
- `summary.averageTimePerLap` - Average lap time

**Always:**
1. Store as seconds in database
2. Convert to mm:ss for display
3. Convert from mm:ss on input
4. Use utility functions for consistency
