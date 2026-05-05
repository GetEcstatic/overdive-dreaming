# Biometric CSV Parser — Fix Plan (April 2026 format)

## Context

The pulse oximeter app exports a CSV that we ingest in
`src/lib/utils/biometricCsvParser.ts`. The export format has changed at least
twice. The latest sample
(`data/stamina-exercise-2026-04-26-00-00.csv`) is **not parsed correctly** by
the current code: round summaries come back empty and the timestamp can be
wrong because of an AM/PM marker the parser doesn't understand.

This plan describes a data-oriented refactor that handles **all three known
formats** without scattering format-specific logic across the codebase.

---

## Known formats

### Format A — single-round, no `Number` column
File: `data/Sunday, March 23, 2025.csv`

```
sep=,
Personal Best Attempt,23/03/2025 12:27:14
Rounds,,
Recovery,Apnea
04:30,07:46
Biometrics,,
Time,Interval Time,Interval Type,HR,SpO2
00:00,00:00,Rest,60,98
…
```

Characteristics:
- Date format: `DD/MM/YYYY HH:mm:ss` (24h, zero-padded).
- Round summary block uses a `Recovery,Apnea` header followed by a single
  `mm:ss,mm:ss` row.
- Biometric rows have `Rest`/`Apnea` interval types only.

### Format B — multi-round with `ROUND N` rows
File: `data/Monday, August 18, 2026.csv`

```
sep=,
Rvs only,18/08/2025 18:29:56
Rounds,,
Number,Recovery,Apnea
ROUND 1,02:00,01:41
ROUND 2,02:35,02:30
…
ROUND 11,03:00,03:31
COOLDOWN,01:00
Biometrics,,
Time,Interval Time,Interval Type,HR,SpO2
…
```

Characteristics:
- Date format: `DD/MM/YYYY HH:mm:ss` (24h).
- Header `Number,Recovery,Apnea`; rounds prefixed `ROUND <n>` (uppercase) plus
  a trailing `COOLDOWN,mm:ss` row.
- Biometric rows have `Rest`/`Apnea` (and possibly `Cooldown`).

### Format C — per-round block with explicit intervals (NEW)
File: `data/stamina-exercise-2026-04-26-00-00.csv`

```
sep=,
Rami 1.2 crazeballs table 🤪,26/4/2026 12:00:00 AM
Round 1,,
Number,Type,Time
Interval 1,Rest,02:00
Interval 2,Apnea,02:11
Round 2,,
Number,Type,Time
Interval 1,Rest,03:30
Interval 2,Apnea,02:49
…
Round 10,,
Number,Type,Time
Interval 1,Cooldown,01:00
Biometrics,,
Time,Interval Time,Interval Type,HR,SpO2
00:00,00:00,Rest,72,95
…
```

Characteristics:
- Date format: `D/M/YYYY h:mm:ss AM|PM` — **no zero-padding** on day/month/hour
  and an AM/PM marker. (`12:00:00 AM` is midnight, not noon.)
- Each round is its own block: a `Round N,,` divider, a per-block
  `Number,Type,Time` header, then one row per interval (`Interval k,<Type>,<mm:ss>`).
- `<Type>` values are `Rest`, `Apnea`, `Cooldown` (and possibly more in the
  future — should be tolerant).
- Biometric rows now include `Cooldown` as an interval type.

---

## Failure analysis of current parser

`parseBiometricCsv` does the following today:

1. `parseTimestamp` splits on the first space and takes only two parts:
   - On Format C `26/4/2026 12:00:00 AM` it discards the `AM` suffix entirely
     and uses `12:00:00`, producing **noon instead of midnight**. The same
     bug fires for any `... PM` time (it stays interpreted as 12-hour without
     +12).
2. `parseRoundSummaries` only matches lines starting with `ROUND ` (uppercase
   prefix). Format C uses `Round N,,` headers (lowercase `n`) and stores the
   actual times in separate `Interval k,<Type>,<mm:ss>` rows, so for Format C
   the function returns an **empty array**. Downstream effects:
   - `session.rounds` is empty → `processRepBiometrics` never gets a
     `roundSummary` and falls back to counting biometric readings.
   - `totalRounds`, `totalApneaTime`, `totalRecoveryTime` are all `0`.
   - UI surfaces (e.g. session detail page) that depend on these summary
     values render incorrectly or show zero rounds.
3. `parseBiometricReadings` already handles `Cooldown`, so live-reading
   parsing still produces sensible per-second data — masking the round-summary
   regression in basic visualisations.

Net effect: Format C imports parse "halfway" — biometrics still appear, but
rounds, apnea totals and recovery totals are blank.

---

## Design goals

Following the project's data-oriented design rule (see `claude.md` →
"Data-oriented design"):

1. **Pure functions over a plain data model.** Keep `BiometricRoundSummary`,
   `BiometricReading`, `ParsedBiometricSession` as the canonical shapes; the
   parser's job is to turn raw CSV text into those records.
2. **Format detection as data.** Express each format as a small descriptor
   (`{ id, headerMatcher, parseRounds }`) and pick one based on what the file
   contains. No format-specific branching outside of that table.
3. **Side-effect free.** No `Date.now()`, no logging, no I/O — easy to unit
   test with the three sample CSVs in `data/`.

---

## Implementation plan

### 1. Refactor `biometricCsvParser.ts` into clear stages

Pipeline (each stage a pure function):

```
csvText
  → splitLines              : string[]
  → parseHeader             : { routineName, timestamp }
  → splitSections           : { roundLines, biometricLines }
  → detectRoundFormat       : 'A' | 'B' | 'C'
  → parseRoundsByFormat     : BiometricRoundSummary[]
  → parseBiometricReadings  : BiometricReading[]
  → assembleSession         : ParsedBiometricSession
```

`parseBiometricCsv` becomes a thin orchestration over these functions.

### 2. Fix `parseTimestamp`

Replace the current implementation with one that:

- Accepts `D/M/YYYY` or `DD/MM/YYYY` (no zero-pad required).
- Accepts `H:mm:ss` or `HH:mm:ss`.
- Optionally consumes a trailing ` AM` / ` PM` token (case-insensitive) and
  applies the standard 12-hour conversion:
  - `12:xx:xx AM` → `00:xx:xx`
  - `1–11 AM` → unchanged
  - `12:xx:xx PM` → unchanged
  - `1–11 PM` → `+12`
- Falls back to `new Date(NaN)` (or returns `null`) on unrecognised input so
  the caller can decide what to do.

This single fix covers Format C and is backwards compatible with A/B.

### 3. Add a Format-C round parser

Algorithm (pure):

```text
state := { rounds: [], current: null }
for each line:
  if line matches /^Round\s+(\d+),,?$/i:
    flush(current) into rounds
    current := { roundNumber, recoveryTime: 0, apneaTime: 0 }
  else if line matches /^Interval\s+\d+,(Rest|Apnea|Cooldown),(\d{1,2}:\d{2})$/i:
    seconds := parseTimeToSeconds(time)
    switch type:
      case 'Rest':     current.recoveryTime += seconds
      case 'Apnea':    current.apneaTime    += seconds
      case 'Cooldown': // ignore, or attach to a separate "cooldown" field if useful
flush(current)
```

Notes:
- The grammar is forgiving: multiple `Rest`/`Apnea` intervals in the same
  round accumulate (future-proofing for tables with warm-up + max).
- We **drop** the trailing `Round N` block whose only interval is `Cooldown`,
  because it isn't an apnea round. (Optional: surface `cooldownTime` on the
  session if we want to display it.)

### 4. Generalise the existing Format-A/B parsers

- Format A: detect a `Recovery,Apnea` header line; parse the next non-empty
  line as `recovery,apnea` → single `BiometricRoundSummary` with `roundNumber: 1`.
- Format B: keep current `ROUND N,…` regex; ignore `COOLDOWN,…` for the
  rounds list (optionally capture `cooldownTime`).

### 5. Format detection

Detection is a function of the lines between `Rounds,,` (or any non-biometric
prefix) and `Biometrics,,`:

| Signal                                              | Format |
| --------------------------------------------------- | ------ |
| Any line matches `^ROUND \d+,`                      | B      |
| Any line matches `^Round \d+,,`                     | C      |
| Otherwise (a `Recovery,Apnea` header is present)    | A      |

If none match, return `[]` rounds and let validation produce a clear error.

### 6. Tighten `validateBiometricCsv`

- Keep the `sep=` and `Biometrics` checks.
- Replace the round-format hard-coding with a check that *some* round summary
  was extracted by the new parser, OR that the biometric data section is
  non-empty (single-hold sessions in Format A still produce ≥1 round).

### 7. Tests (Vitest)

A `vitest.config.ts` is already in the repo. Add
`src/lib/utils/biometricCsvParser.test.ts` with three fixtures (one per
format) read from `data/`. Assertions:

- **Format A** (`Sunday, March 23, 2025.csv`):
  - 1 round, recovery 270s, apnea 466s.
  - `timestamp.toISOString()` matches `2025-03-23T…`.
  - `readings.length > 0`, all `intervalType ∈ {apnea, recovery}`.
- **Format B** (`Monday, August 18, 2026.csv`):
  - 11 rounds, recovery/apnea totals match a hand sum from the file.
  - First round: recovery 120s, apnea 101s.
- **Format C** (`stamina-exercise-2026-04-26-00-00.csv`):
  - 9 apnea rounds (round 10 is cooldown-only and excluded).
  - Recovery + apnea per round equal to the values in the CSV.
  - Timestamp = `2026-04-26T00:00:00` local time (midnight).
  - Readings include `Cooldown` rows (mapped to `recovery`).

Add a fourth focused unit test for `parseTimestamp` covering:
`12:00:00 AM`, `12:00:00 PM`, `1:05:09 PM`, `09:30:00`, `26/4/2026`,
`26/04/2026`.

### 8. UI / call-site impact

`src/routes/(app)/session/[id]/+page.svelte` and any other consumer of
`parseBiometricCsv` keep using the same return shape. No call sites should
need changes.

If we decide to track cooldown time, that's an additive optional field on
`ParsedBiometricSession` and can be surfaced later.

---

## Risks & rollback

- The refactor is purely additive in behaviour: existing files (Format A/B)
  must still produce identical `ParsedBiometricSession` output. The fixture
  tests guard this.
- If a future format appears, the new pipeline isolates the change to a new
  format descriptor; no other code needs to be touched.
- Rollback: revert the parser file; the storage format on Firebase is
  unchanged.

---

## Step-by-step TODO

1. Add fixture tests for the three sample CSVs (red).
2. Refactor `biometricCsvParser.ts` into the staged pipeline.
3. Fix `parseTimestamp` (AM/PM + flexible padding).
4. Implement Format-C round parser; generalise A/B parsers.
5. Make all fixture tests pass (green).
6. Run `npm run check` and `npm run test` (or `npx vitest run`).
7. Manually re-import the three sample CSVs in dev to spot-check the UI.

---

## Open questions

- Do we want to surface cooldown time on the session detail page? (Currently
  silently dropped from rounds, but available in biometric readings.) *no need*
- Should the parser tolerate non-Western digit groups or differently
  localised AM/PM markers? (Out of scope until we see a real example.) *not for now*
