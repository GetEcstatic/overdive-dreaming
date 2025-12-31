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
