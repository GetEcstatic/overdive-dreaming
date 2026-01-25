# Analytics Exploration

 RPE to Training Zone Mapping

  Standard 5-Zone Model:

  | RPE (1-10) | Zone          | Lactate      | % Max HR | Description                     | Purpose                    |
  |------------|---------------|--------------|----------|---------------------------------|----------------------------|
  | 1-2        | Recovery      | <2 mmol/L    | 50-60%   | Very easy, fully conversational | Active recovery            |
  | 3-4        | Aerobic Base  | 2-2.5 mmol/L | 60-70%   | Easy, can talk in sentences     | Fat burning, base building |
  | 5-6        | Tempo         | 2.5-4 mmol/L | 70-80%   | Moderate, short phrases         | Aerobic capacity           |
  | 7-8        | Threshold     | 4-6 mmol/L   | 80-90%   | Hard, few words only            | Lactate threshold          |
  | 9-10       | Max/Anaerobic | >6 mmol/L    | 90-100%  | Cannot talk, maximal            | Peak performance           |

  The 80/20 Rule (Polarized Training)

  Sports science strongly supports:
  - 80% of volume at low intensity (RPE 1-4 / Zones 1-2)
  - 20% of volume at high intensity (RPE 7-10 / Zones 4-5)
  - Avoid the "gray zone" (RPE 5-6 / Zone 3) - too hard to recover, not hard enough to adapt

  Freediving-Specific Considerations

  Freediving is unique because:
  - CO2 tolerance work (high contractions, discomfort) = high RPE but different from lactate-based sports
  - O2 tolerance work (pushing hypoxia limits) = very high RPE, actual anaerobic stress
  - Technique work = low RPE, skill acquisition
  - Max attempts = RPE 9-10, testing not training

  ## What We Could Visualize

  Training Load Dashboard:

  1. Volume by RPE Zone (stacked bar chart)
    - Show weekly volume (meters + time) split by RPE zone
    - Color code: Green (RPE 1-4), Yellow (5-6), Red (7-10)
    - Flag weeks with >30% in "red zone" (overtraining risk)
  2. 80/20 Balance Meter
    - Gauge showing current low/high intensity split
    - Target: 80% green zone, 20% red zone
    - Warn if deviating too far
  3. Training Stress Score (TSS)
    - Calculate: Volume × (RPE/10)² × duration_multiplier
    - Track cumulative weekly TSS
    - Show "chronic load" (4-week avg) vs "acute load" (7-day)
    - Freshness ratio: If acute >> chronic = overreaching risk
  4. RPE Distribution Histogram
    - Show how many sessions fall into each RPE bucket
    - Compare current period vs historical average

  Would you like me to implement a Training Load & Balance card with these metrics? I'm thinking:
  - Main chart: Stacked area showing weekly volume by RPE zone
  - Side metrics: 80/20 ratio, average RPE, volume trend
  - Alert badge if training is too polarized to high intensity

## Previous ideas

My prompt:

Okay, let's conceptualise:

We are tracking a lot of variables for each dive session, plus a number of tags.

There must be some powerful ways we can represent this data visually, perhaps giving the user control over which variable they want to include in charts and filter by.

Some example:
I want to know all my Max DYN dives with noseclip only. I'd like to compare those dives with the same but when I was also wearing goggles.

Or..

I want to know all my max STA dives when I was in the first 10 days of my menstrual cycle.

Or...
I want to see all my contraction times for max STA dives when I ate my last meal <14 hours before, and compare those with my contraction times for max STA dives when I ate my last meal <5 hours before

The possiblities are endless.

At this point I don't want to implement anything as this is probably going to be the most important part of the app. I'd like to consider some great options.

Could you provide four or five solid ideas, evaluate them for UX and difficulty of implementation. Provide bullet pointed benefits and challenges. Create a new .md file named analytics.md to store all your thinking for easy reading and evaluation.

Codex response:

## Goal
Enable flexible visual comparisons across dive sessions using variables and tags (e.g., discipline, equipment, cycle phase, fasting window), without committing to a UI or data model yet.

## Idea 1: Guided Filter Builder (step-by-step chips)
A wizard-like panel that lets users pick: base set (discipline + routine tag) → optional filters (tags/variables) → comparison groups.

Benefits
- Clear mental model; users can build from simple → complex.
- Works well on mobile with progressive disclosure.
- Easy to explain in tooltips (e.g., “Group A vs Group B”).

Challenges
- Still needs a flexible schema for variables/values.
- UI complexity grows with nested conditions.

## Idea 2: Compare Modes (A/B or Multi-group)
Provide an A/B (or multi-group) compare toggle where each group gets its own filter chips, and charts render stacked datasets.

Benefits
- Mirrors the “compare goggles vs no goggles” use case.
- Reusable pattern across charts (line, bar, scatter).
- Strong visual feedback when tweaking filters.

Challenges
- Data volume can spike; needs caching or pre-aggregation.
- Users may create overlapping groups unintentionally.

## Idea 3: Metric + Condition Matrix
Two axes UI: rows are variables/filters, columns are comparison groups. Each cell defines a constraint (e.g., “noseclip: yes”).

Benefits
- Compact way to express multiple conditions.
- Encourages clean, comparable group definitions.
- Scales to power users.

Challenges
- Higher learning curve.
- Harder to implement well on mobile.

## Idea 4: Saved “Focus Sets”
Allow users to save a named analytics setup (filters + metric + chart type) and re-open it later.

Benefits
- Keeps the interface tidy; advanced users can iterate.
- Lets users reuse insights without rebuilding filters.
- Good foundation for sharing later.

Challenges
- Requires storage and versioning of filter definitions.
- Needs a discovery UI (list, edit, delete).

## Idea 5: Tag-first Analytics
Start with a tags-first lens: “Show me all dives tagged X,” then optionally add variables. Keeps an immediate, low-friction entry point.

Benefits
- Fast to implement and easy to understand.
- Encourages tagging discipline.
- Works with existing data sooner.

Challenges
- Limited for deeper comparisons without extra layers.
- Could bias the UX towards tags over numeric variables.

## Suggested Next Step
Prototype two low-effort UX patterns:
1) Guided Filter Builder (Idea 1)
2) A/B Compare Modes (Idea 2)
Then test which is easier to understand for your examples.

## Additional Analytics Card Ideas

### 1. Recovery vs Performance (scatter)
Plot `totalDistance/totalTime` against `hoursSinceLastMeal`, `restingHeartRate`, or `hrv`.
- Benefits: quickly shows if recovery metrics correlate with performance.
- Challenges: requires enough data points and sensible outlier handling.

### 2. Prep Quality Impact
Compare results by `initialBreatheUpTime` or `breathingTechniqueLevel` buckets.
- Benefits: actionable insight into pre-dive routines.
- Challenges: need to define meaningful bucket ranges and handle mixed disciplines.

### 3. Consistency Meter
Show variance (stdev) of max results over last N sessions by discipline.
- Benefits: highlights stability vs volatility; good for trend awareness.
- Challenges: requires clear explanation and consistent data history.

### 4. Competition vs Training Split
Side-by-side averages and PBs for `isCompetition` vs normal sessions.
- Benefits: helps users see if comp performance is lower/higher than training.
- Challenges: smaller competition sample sizes.

### 5. Contraction Window Insight
Correlate `contractionsOnsetTime` with max result for STA.
- Benefits: deep insight for advanced users; unique value.
- Challenges: limited data availability and higher noise.

### 6. Temperature Impact
Trendline of `waterTemperature` vs result.
- Benefits: highlights environmental effects on performance.
- Challenges: seasonality confounds; needs filtering guidance.

### 7. Mood vs Performance
Compare `basalMood` vs max outcomes by discipline.
- Benefits: easy personal insight; can reinforce positive habits.
- Challenges: subjective data; may need gentle framing.

### 8. Time-to-PB Tracker
Count sessions since last PB by discipline.
- Benefits: motivating and simple.
- Challenges: needs clear reset logic on PB detection.

## Volume by RPE Zone

### Overview

This visualisation aims to show weekly training volume broken down by RPE zone, helping athletes understand their training intensity distribution and apply the 80/20 polarized training principle to freediving.

Based on the zone mapping defined above:
- **Recovery Zone (RPE 1-4)**: Low intensity, base building — should be ~80% of volume
- **Gray Zone (RPE 5-6)**: Tempo work — should be minimized
- **High Intensity Zone (RPE 7-10)**: Threshold/max work — should be ~20% of volume

### Three Solution Approaches

---

#### Solution 1: Stacked Bar Chart with Weekly Buckets

**Description**: A classic stacked bar chart where each bar represents a week, and colored segments show the proportion of volume in each RPE zone. X-axis shows weeks, Y-axis shows volume (meters or time).

**Visual Example**:
```
Volume (m)
  1200 |    ████
  1000 |    ████  ████
   800 |████████  ████  ████
   600 |████████  ████  ████
   400 |████████  ████  ████
   200 |████████  ████  ████
       |--------------------
         W1     W2     W3
       
Legend: 🟢 Recovery (1-4) | 🟡 Gray (5-6) | 🔴 High (7-10)
```

**Pros**:
- Clear visual representation of volume distribution over time
- Easy to compare week-to-week changes
- Familiar chart type for most users
- Shows both absolute volume and proportion at a glance
- Works well with Chart.js (already in project)

**Cons**:
- Can get cluttered with many weeks
- Hard to precisely compare proportions between distant weeks
- Requires horizontal scrolling on mobile for long timeframes

**Implementation Complexity**: ⭐⭐ (Low-Medium)
- Reuse existing `aggregateVolumeByWeek` pattern from `analytics.ts`
- Chart.js supports stacked bars natively
- Minimal new data processing needed

---

#### Solution 2: Stacked Area Chart with 80/20 Reference Line

**Description**: A stacked area chart showing cumulative volume by zone over time, with a horizontal reference band showing the ideal 80/20 split. This gives a flowing visual of training load evolution.

**Visual Example**:
```
Volume
  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ High (red)
  ░░░░░░░░░░░░░░░░░░░░░░░░░░ Gray (yellow)
  ████████████████████████████ Recovery (green)
  ─────────────────────────── 80% target line
```

**Pros**:
- Smooth visual showing trends over time
- Reference line makes it immediately clear if distribution is healthy
- Elegant, modern look matching existing VolumeChart style
- Great for showing cumulative progress

**Cons**:
- Areas can make precise reading difficult
- May suggest continuity between discrete sessions
- Reference line calculation is tricky (80% of what?)

**Implementation Complexity**: ⭐⭐⭐ (Medium)
- Extend existing `LineChart.svelte` with stacking support
- Add reference line annotation (Chart.js plugin or custom drawing)
- Need to calculate running totals per zone

---

#### Solution 3: Donut/Gauge with Sparkline Trend

**Description**: A primary donut chart showing the overall RPE zone distribution for the selected timeframe, paired with a small sparkline showing how the distribution has shifted over time. Includes a "health" indicator for the 80/20 balance.

**Visual Example**:
```
┌─────────────────────────────────┐
│  Training Intensity Balance     │
│                                 │
│      ╭───────────╮              │
│     ╱    72%     ╲    ✓ Good    │
│    │   Recovery   │   balance   │
│     ╲____________╱              │
│                                 │
│  🟢 72% Low  🟡 8% Mid  🔴 20% High │
│                                 │
│  Trend: ▁▂▃▄▅▆▇█ (improving)    │
└─────────────────────────────────┘
```

**Pros**:
- Extremely scannable — user sees health status at a glance
- Compact, works well in a dashboard card format
- "Gamification" aspect — users want to hit the green zone
- Mobile-friendly
- Can include actionable feedback ("Too much gray zone this week")

**Cons**:
- Loses week-over-week granularity without the sparkline
- Donut charts can be hard to read precisely
- Requires additional library for gauge or custom SVG
- Less useful for spotting weekly patterns

**Implementation Complexity**: ⭐⭐⭐⭐ (Medium-High)
- Need donut/gauge component (new or Chart.js doughnut)
- Sparkline is a separate component
- More complex state management for drill-down

---

### Ranking & Recommendation

| Rank | Solution | UX Score | Implementation Effort | Best For |
|------|----------|----------|----------------------|----------|
| 1 | **Solution 1: Stacked Bar** | ⭐⭐⭐⭐ | ⭐⭐ Low-Med | Detailed weekly analysis |
| 2 | Solution 3: Donut + Sparkline | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ Med-High | Dashboard overview |
| 3 | Solution 2: Stacked Area | ⭐⭐⭐ | ⭐⭐⭐ Medium | Trend visualization |

**Recommendation: Solution 1 (Stacked Bar Chart)**

**Rationale**:
1. **Consistency**: Matches the existing `VolumeChart.svelte` pattern — users already see weekly stacked data by discipline
2. **Clarity**: Bar charts are universally understood and work well for categorical data (weeks) with sub-categories (zones)
3. **Actionable**: Easy to spot a "red week" and correlate with feeling overtrained
4. **Extensible**: Can later add the donut summary as a companion component
5. **Low Risk**: Uses existing Chart.js setup, no new dependencies
6. **Mobile Friendly**: Horizontal scroll is natural for time series

---

### Detailed Implementation Plan: Stacked Bar Chart by RPE Zone

#### 1. Data Layer (`src/lib/utils/analytics.ts`)

Add a new aggregation function:

```typescript
// RPE Zone definitions
export type RPEZone = 'recovery' | 'gray' | 'highIntensity';

export interface RPEZoneConfig {
  zone: RPEZone;
  label: string;
  rpeRange: [number, number]; // inclusive
  color: string;
  bgColor: string;
}

export const RPE_ZONES: RPEZoneConfig[] = [
  { zone: 'recovery', label: 'Recovery (1-4)', rpeRange: [1, 4], color: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.7)' },
  { zone: 'gray', label: 'Gray Zone (5-6)', rpeRange: [5, 6], color: '#eab308', bgColor: 'rgba(234, 179, 8, 0.7)' },
  { zone: 'highIntensity', label: 'High Intensity (7-10)', rpeRange: [7, 10], color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.7)' }
];

export function getRPEZone(rpe: number): RPEZone {
  if (rpe <= 4) return 'recovery';
  if (rpe <= 6) return 'gray';
  return 'highIntensity';
}

export interface VolumeByRPEZoneDataPoint {
  week: string;
  byZone: Record<RPEZone, number>;
  total: number;
}

/**
 * Aggregate training volume by week and RPE zone
 * @param logs - Array of routine logs
 * @param metric - 'distance' (meters) or 'time' (seconds)
 * @returns Weekly data with volume split by RPE zone
 */
export function aggregateVolumeByRPEZone(
  logs: RoutineLog[],
  metric: 'distance' | 'time'
): VolumeByRPEZoneDataPoint[] {
  const weeklyData: Record<string, Record<RPEZone, number>> = {};

  for (const log of logs) {
    // Skip logs without RPE data
    if (log.rpe === undefined || log.rpe === null) continue;

    // Get week start (Monday-based for consistency)
    const weekStart = format(startOfWeek(log.date.toDate(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

    if (!weeklyData[weekStart]) {
      weeklyData[weekStart] = { recovery: 0, gray: 0, highIntensity: 0 };
    }

    const zone = getRPEZone(log.rpe);
    const value = metric === 'distance' 
      ? (log.totalDistance || 0) 
      : (log.totalTime || 0);

    weeklyData[weekStart][zone] += value;
  }

  // Convert to sorted array
  return Object.entries(weeklyData)
    .map(([week, byZone]) => ({
      week,
      byZone,
      total: byZone.recovery + byZone.gray + byZone.highIntensity
    }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

/**
 * Calculate overall RPE zone distribution percentages
 */
export interface RPEZoneDistribution {
  recovery: { volume: number; percentage: number };
  gray: { volume: number; percentage: number };
  highIntensity: { volume: number; percentage: number };
  isBalanced: boolean; // true if recovery >= 70% and highIntensity <= 30%
  balanceMessage: string;
}

export function calculateRPEZoneDistribution(
  logs: RoutineLog[],
  metric: 'distance' | 'time'
): RPEZoneDistribution {
  const totals: Record<RPEZone, number> = { recovery: 0, gray: 0, highIntensity: 0 };

  for (const log of logs) {
    if (log.rpe === undefined || log.rpe === null) continue;
    const zone = getRPEZone(log.rpe);
    const value = metric === 'distance' ? (log.totalDistance || 0) : (log.totalTime || 0);
    totals[zone] += value;
  }

  const total = totals.recovery + totals.gray + totals.highIntensity;
  
  const distribution: RPEZoneDistribution = {
    recovery: {
      volume: totals.recovery,
      percentage: total > 0 ? (totals.recovery / total) * 100 : 0
    },
    gray: {
      volume: totals.gray,
      percentage: total > 0 ? (totals.gray / total) * 100 : 0
    },
    highIntensity: {
      volume: totals.highIntensity,
      percentage: total > 0 ? (totals.highIntensity / total) * 100 : 0
    },
    isBalanced: false,
    balanceMessage: ''
  };

  // Determine balance status
  const recoveryPct = distribution.recovery.percentage;
  const highPct = distribution.highIntensity.percentage;
  const grayPct = distribution.gray.percentage;

  if (recoveryPct >= 75 && highPct <= 25) {
    distribution.isBalanced = true;
    distribution.balanceMessage = '✓ Great balance! Following 80/20 principle';
  } else if (grayPct > 30) {
    distribution.balanceMessage = '⚠️ Too much gray zone — consider more easy or hard sessions';
  } else if (highPct > 30) {
    distribution.balanceMessage = '⚠️ High intensity overload — increase recovery volume';
  } else if (recoveryPct < 60) {
    distribution.balanceMessage = '⚠️ Not enough base work — add more low-intensity sessions';
  } else {
    distribution.isBalanced = true;
    distribution.balanceMessage = '✓ Reasonable balance';
  }

  return distribution;
}
```

#### 2. UI Component (`src/lib/components/analytics/RPEZoneChart.svelte`)

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Chart,
    BarController,
    BarElement,
    LinearScale,
    CategoryScale,
    Title,
    Tooltip,
    Legend
  } from 'chart.js';
  import type { RoutineLog } from '$lib/types';
  import { 
    aggregateVolumeByRPEZone, 
    calculateRPEZoneDistribution,
    RPE_ZONES,
    type RPEZone 
  } from '$lib/utils/analytics';
  import { format } from 'date-fns';

  Chart.register(BarController, BarElement, LinearScale, CategoryScale, Title, Tooltip, Legend);

  let { logs, metric = 'distance' }: { logs: RoutineLog[]; metric?: 'distance' | 'time' } = $props();

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  const chartData = $derived.by(() => {
    const weeklyData = aggregateVolumeByRPEZone(logs, metric);

    if (weeklyData.length === 0) {
      return { labels: [], datasets: [] };
    }

    const labels = weeklyData.map((w) => format(new Date(w.week), 'MMM d'));

    const datasets = RPE_ZONES.map((zone) => ({
      label: zone.label,
      data: weeklyData.map((w) => w.byZone[zone.zone]),
      backgroundColor: zone.bgColor,
      borderColor: zone.color,
      borderWidth: 1
    }));

    return { labels, datasets };
  });

  const distribution = $derived(calculateRPEZoneDistribution(logs, metric));

  const logsWithRPE = $derived(logs.filter((l) => l.rpe !== undefined).length);
  const logsWithoutRPE = $derived(logs.length - logsWithRPE);

  onMount(() => {
    if (!canvas || chartData.labels.length === 0) return;

    chart = new Chart(canvas, {
      type: 'bar',
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: {
            stacked: true,
            title: {
              display: true,
              text: metric === 'distance' ? 'Volume (m)' : 'Time (s)'
            }
          }
        },
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const value = ctx.raw as number;
                return metric === 'distance'
                  ? `${ctx.dataset.label}: ${value}m`
                  : `${ctx.dataset.label}: ${Math.floor(value / 60)}:${(value % 60).toString().padStart(2, '0')}`;
              }
            }
          }
        }
      }
    });

    return () => chart?.destroy();
  });

  $effect(() => {
    if (chart && chartData.labels.length > 0) {
      chart.data = chartData;
      chart.update();
    }
  });
</script>

<div class="rpe-zone-chart">
  <div class="chart-header">
    <h3 class="chart-title">Training Intensity by RPE Zone</h3>
    <div class="balance-indicator" class:balanced={distribution.isBalanced}>
      {distribution.balanceMessage}
    </div>
  </div>

  {#if logsWithoutRPE > 0}
    <p class="data-warning">
      ⚠️ {logsWithoutRPE} of {logs.length} sessions missing RPE data
    </p>
  {/if}

  <div class="distribution-summary">
    <div class="zone-stat recovery">
      <span class="zone-label">Recovery</span>
      <span class="zone-value">{distribution.recovery.percentage.toFixed(0)}%</span>
    </div>
    <div class="zone-stat gray">
      <span class="zone-label">Gray Zone</span>
      <span class="zone-value">{distribution.gray.percentage.toFixed(0)}%</span>
    </div>
    <div class="zone-stat high">
      <span class="zone-label">High Intensity</span>
      <span class="zone-value">{distribution.highIntensity.percentage.toFixed(0)}%</span>
    </div>
  </div>

  {#if chartData.labels.length === 0}
    <div class="empty-state">
      <p>No training data with RPE available</p>
    </div>
  {:else}
    <div class="chart-container" style="height: 280px;">
      <canvas bind:this={canvas}></canvas>
    </div>
  {/if}
</div>

<style>
  .rpe-zone-chart {
    background: var(--color-bg-card);
    border: 1px solid rgba(148, 163, 184, 0.1);
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .chart-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .chart-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }

  .balance-indicator {
    font-size: 0.875rem;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    background: rgba(234, 179, 8, 0.2);
    color: #eab308;
  }

  .balance-indicator.balanced {
    background: rgba(34, 197, 94, 0.2);
    color: #22c55e;
  }

  .data-warning {
    font-size: 0.8rem;
    color: var(--color-text-secondary);
    margin-bottom: 1rem;
  }

  .distribution-summary {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }

  .zone-stat {
    flex: 1;
    min-width: 80px;
    padding: 0.75rem;
    border-radius: 8px;
    text-align: center;
  }

  .zone-stat.recovery {
    background: rgba(34, 197, 94, 0.15);
  }

  .zone-stat.gray {
    background: rgba(234, 179, 8, 0.15);
  }

  .zone-stat.high {
    background: rgba(239, 68, 68, 0.15);
  }

  .zone-label {
    display: block;
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    margin-bottom: 0.25rem;
  }

  .zone-value {
    display: block;
    font-size: 1.5rem;
    font-weight: 700;
  }

  .zone-stat.recovery .zone-value { color: #22c55e; }
  .zone-stat.gray .zone-value { color: #eab308; }
  .zone-stat.high .zone-value { color: #ef4444; }

  .chart-container {
    position: relative;
  }

  .empty-state {
    padding: 3rem 1rem;
    text-align: center;
    color: var(--color-text-secondary);
  }
</style>
```

#### 3. Integration Points

**Add to Analytics Page** (`src/routes/(app)/analytics/+page.svelte`):

```svelte
<script>
  import RPEZoneChart from '$lib/components/analytics/RPEZoneChart.svelte';
  // ... existing imports
</script>

<!-- Add after VolumeChart or in a new "Training Load" section -->
<RPEZoneChart {logs} metric={selectedMetric} />
```

#### 4. Testing Checklist

- [ ] Empty state when no logs have RPE data
- [ ] Partial data warning displays correctly
- [ ] Chart renders with 1, 2, and 10+ weeks of data
- [ ] Mobile responsiveness (horizontal scroll)
- [ ] Toggle between distance/time metrics
- [ ] Balance indicator shows correct status
- [ ] Tooltip formatting for both metrics

#### 5. Future Enhancements

1. **Drill-down**: Click a bar to see individual sessions in that week/zone
2. **Target line**: Add configurable 80/20 reference overlay
3. **Export**: Allow users to export their intensity distribution
4. **Alerts**: Push notification when consistently in red zone
5. **Compare periods**: Side-by-side comparison of two timeframes
