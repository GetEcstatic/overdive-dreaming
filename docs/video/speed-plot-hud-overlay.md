# Speed Plot HUD Overlay Plan

Status: planning only.

## Goal

Add an optional bottom HUD overlay for dive-video playback and overlay downloads: a compact line graph of speed over distance that grows as the video plays. The graph should match the visual intent in `docs/video/line-plot-v2.svg`, work at any video resolution, and render consistently in-app and in burned-in exports.

The overlay should answer one glanceable question: how did speed change through the dive, relative to distance and the diver's PB?

## Mockup Read

`line-plot-v2.svg` is a low, full-width graph band:

- Canvas/viewBox: `-30 0 850 133` with a black page background.
- Background: vertical gradient from `#0d1320` to `#000000`.
- Plot area: x `40..800`, y `20..113`.
- Grid: thin white lines at roughly `rgba(255,255,255,0.1)`, stroke `0.75`.
- X labels: `0m`, `50m`, `100m`, `150m`, `200m`.
- Y labels: visible examples `1.2`, `1.4`, `1.6`; requested domain should be `0..2 m/s`.
- Axis label: `speed [m/s]` rotated on the left.
- Speed path: stepped teal line, gradient `#2dd4bf` to `#5eead4`, stroke `1.5`, no fill.

The mockup is intentionally compact and analytical, not a big chart card. In video it should feel like a broadcast lower-third instrument.

## Data Requirements

### Inputs

Use existing video/timeline data where possible:

- `DiveVideo.timeline`: `diveStartMs`, `diveEndMs`, `laps`, `subSplits`, and existing timeline helpers.
- `poolLength`: to interpret lap/sub-split distances when needed.
- `discipline`: to pick the correct dynamic PB.
- `currentVideoMs`: for the live reveal cursor and the growing line.
- `pbDistanceM`: the diver's current distance PB for that discipline.

### PB Source

PBs already exist in the app through `src/lib/utils/personalBests.ts`, `getUserPBRecords`, and legacy `getUserPBs`. For this overlay, the player needs a simple resolved number:

```ts
interface SpeedPlotContext {
  discipline: 'DYN' | 'DNF' | 'DYNB';
  pbDistanceM: number | null;
  currentVideoMs: number;
  timeline: DiveTimeline;
  poolLengthM: number;
}
```

Recommended PB resolution order:

1. Use a standard distance PB record matching the video discipline and category.
2. Fall back to legacy `personalBests[discipline]` if the standard record is unavailable.
3. Fall back to `max(totalDistanceM(video.timeline), 100)` if the user has no PB yet.

For burned exports, pass `pbDistanceM` into the export request/job and snapshot it in the render inputs. That prevents an export from changing if the user's PB changes while a queued server job is waiting.

## Scaling Rules

- X-axis domain: `0..(pbDistanceM * 1.25)`.
- PB marker: vertical line at `pbDistanceM`, plus a small symbol at the x-axis. Use a small diamond or triangular flag rather than text-heavy labeling.
- Y-axis domain: `0..2 m/s`.
- Values above `2 m/s`: clamp visually to the top edge but mark the clipped segment with a subtle cap/flat top, not a blown-out chart.
- Values below `0`: clamp to 0.
- Current reveal: only include samples where sample time `<= currentVideoMs`, plus an interpolated current sample so the line grows smoothly during video playback.

## Pure Model

Create pure graph logic in a new module, likely `src/lib/media/speedPlotHud.ts`:

```ts
export interface SpeedPlotSample {
  readonly atMs: number;
  readonly distanceM: number;
  readonly speedMs: number;
}

export interface SpeedPlotFrame {
  readonly domainDistanceM: number;
  readonly pbDistanceM: number | null;
  readonly samples: readonly SpeedPlotSample[];
  readonly currentDistanceM: number;
  readonly currentSpeedMs: number;
}

export interface PlotPoint {
  readonly x: number;
  readonly y: number;
}

export interface SpeedPlotRenderModel {
  readonly plotRect: Rect;
  readonly gridLines: readonly Line[];
  readonly xLabels: readonly AxisLabel[];
  readonly yLabels: readonly AxisLabel[];
  readonly pbMarker?: PlotMarker;
  readonly speedLine: readonly PlotPoint[];
  readonly currentPoint?: PlotPoint;
}
```

Pure functions:

- `samplesFromTimeline(timeline, poolLengthM)` derives speed-over-distance samples from laps/sub-splits. Prefer actual event-to-event speeds over rolling-window estimates for the chart line.
- `frameAtTime(samples, currentVideoMs, timeline)` returns the revealed samples plus the current interpolated point.
- `speedPlotDomain(pbDistanceM, fallbackDistanceM)` returns `pb * 1.25` or fallback.
- `projectSpeedPlot(frame, design, width, height)` maps data space into render coordinates.

This keeps math testable and shared. DOM/SVG/canvas renderers should receive `SpeedPlotRenderModel` and draw it without owning the projection rules.

## Visual Design Data

Follow the new HUD pattern: one plain-data design object, pure scaling helpers, side effects at renderer edges.

Create something like:

```ts
export const SPEED_PLOT_HUD_DESIGN = {
  referenceWidthPx: 1080,
  bandHeightPx: 190,
  safeInsetXPx: 36,
  bottomInsetPx: 32,
  plotPadding: { leftPx: 64, rightPx: 36, topPx: 24, bottomPx: 32 },
  background: {
    top: '#0d1320',
    bottom: '#000000',
    opacity: 0.86
  },
  grid: { color: 'rgba(255,255,255,0.1)', widthPx: 1 },
  axisText: { family: ..., sizePx: 20, weight: 400, color: 'rgba(255,255,255,0.72)' },
  line: { from: '#2dd4bf', to: '#5eead4', widthPx: 3, join: 'round' },
  pbMarker: { color: '#facc15', widthPx: 2, symbolSizePx: 12 },
  currentPoint: { radiusPx: 5, color: '#f8fafc' }
} as const;
```

Keep it separate from the top metric HUD design, but use the same pattern as `HUD_DESIGN`: canonical 1080px reference width, scaled by actual video width.

## Renderer Options

### Option A: SVG In App, Canvas For Export

In-app playback renders a positioned `<svg>` at the bottom of `DiveVideoPlayer.svelte`. Burned export draws the same `SpeedPlotRenderModel` onto canvas.

Pros:

- SVG is crisp, easy to inspect, and natural for path/grid/labels.
- Canvas export integrates with the existing browser overlay export.
- Uses the pure model to keep geometry identical.

Cons:

- Text metrics may differ slightly between SVG and canvas unless font loading and line-height are managed carefully.
- Need visual regression screenshots to keep parity honest.

### Option B: Canvas In App And Canvas For Export

In-app playback uses a transparent `<canvas>` overlay and export reuses the same drawing function.

Pros:

- Highest visual parity; literally the same draw function.
- Easy to animate by redrawing on `requestVideoFrameCallback`.
- Same font loading rules apply to both.

Cons:

- Less declarative than SVG.
- Needs resize/DPR handling for crisp in-app display.
- Harder to inspect and style in devtools.

### Option C: Generate SVG, Rasterize For Export

Build one SVG string from `SpeedPlotRenderModel`; in app render the SVG, for export draw it into an `ImageBitmap` per frame.

Pros:

- Strong single-renderer story.
- Great for static overlays.

Cons:

- Per-frame SVG rasterization is likely too expensive.
- Font/image loading in export gets fiddly, especially on mobile Safari.

## Recommendation

Use **Option A** for v1: SVG in-app, canvas for burned export, both fed by one pure `SpeedPlotRenderModel` and one `SPEED_PLOT_HUD_DESIGN` object.

Reasoning:

- The graph is vector-first, so SVG makes the in-app implementation clean and responsive.
- Burned export already has a canvas path, and canvas is the right final pixel surface.
- The pure render model is the actual source of truth. SVG and canvas should be thin renderers over the same projected points, ticks, PB marker, and design values.
- If parity proves fragile, Option B is the fallback: swap the in-app SVG renderer for a canvas overlay without changing data/projection code.

## In-App Playback Plan

1. Resolve `pbDistanceM` in `DiveVideoPlayer.svelte` or in its parent (`SessionDiveVideos`) and pass it down.
2. Add overlay state:

```ts
type VideoHudElement = 'metrics' | 'speed-plot';
interface VideoHudSelection {
  playback: ReadonlySet<VideoHudElement>;
  export: ReadonlySet<VideoHudElement>;
}
```

3. Derive `SpeedPlotFrame` from `timeline`, `poolLength`, PB, and `currentMs`.
4. Render `<SpeedPlotHudSvg model={speedPlotModel} />` anchored at the bottom of the video container.
5. Respect fullscreen modes:
   - Portrait: bottom band above custom controls / safe-area.
   - Landscape: compact band along the bottom, with enough opacity to read over pool footage.
   - Feed compact cards: default off unless fullscreen/opened, to avoid visual noise.
6. When timeline waypoints are edited, the graph updates automatically because it derives from `DiveVideo.timeline`.

## Burned Export Plan

Browser canvas export:

1. Extend the existing overlay export render loop to accept `hudSelection.export`.
2. Keep the top metrics HUD render as-is when selected.
3. Add `drawSpeedPlotHud(ctx, args)` that consumes the same `SpeedPlotRenderModel` and `SPEED_PLOT_HUD_DESIGN` scaling.
4. Ensure fonts used by graph labels are loaded with `document.fonts.load(...)` before export starts.
5. Draw order:
   - Source video frame.
   - Top metrics HUD if enabled.
   - Bottom speed plot HUD if enabled.

Server export:

The current server overlay path uses ffmpeg/ASS. For a dynamic growing graph, ASS is possible but awkward. Recommended server path is:

- Phase 1: support speed plot only in browser canvas export.
- Phase 2: move server overlay generation to a frame/image overlay strategy if server-side speed plots are required. Options include generating transparent PNG frames or using a Node canvas renderer piped into ffmpeg. Do not hand-build a growing line graph in ASS unless this remains tiny and strictly sampled.

If server overlay download remains the default for large videos, the UI must either:

- hide speed-plot export for server-only exports until Phase 2, or
- explicitly route speed-plot exports through browser canvas with a clear progress state.

## HUD Selection UX

Goal: minimal friction, no export wizard unless the user asks.

Recommended UX:

- Replace the single `HUD` toggle with a small HUD button/menu in the video action row.
- Default presets:
  - `Clean`: no overlays.
  - `Classic`: top metrics only. This remains the default for playback and export.
  - `Speed graph`: top metrics + bottom speed plot.
  - `Graph only`: bottom speed plot only.
- The main button cycles between `Clean`, `Classic`, and `Speed graph` on tap; long-press or chevron opens details.
- Export uses the current playback selection by default, with a one-line confirmation in the download action: `Download with Classic + Speed graph`.
- Persist per-user defaults in user settings:

```ts
interface VideoHudPreferences {
  playbackPreset: 'clean' | 'classic' | 'speed-graph' | 'graph-only';
  exportPreset: 'match-playback' | 'clean' | 'classic' | 'speed-graph' | 'graph-only';
}
```

This avoids forcing a choice every time, but keeps control close to the video.

## Implementation Steps

1. Add plan tests around pure sampling and projection.
2. Add `SPEED_PLOT_HUD_DESIGN` and scaling helpers beside the existing HUD design data.
3. Implement `samplesFromTimeline`, `frameAtTime`, and `projectSpeedPlot` as pure functions with tests.
4. Add `SpeedPlotHudSvg.svelte` as a thin renderer for in-app playback.
5. Add `drawSpeedPlotHud` for browser canvas export.
6. Add HUD preset state and lightweight selection UI in `DiveVideoPlayer.svelte`.
7. Persist user defaults after the UI feels right.
8. Revisit server export after browser parity is proven.

## Test Plan

Pure tests:

- Domain is PB × 1.25.
- No PB falls back to current/fallback distance.
- Speed samples are derived correctly from split distances and times.
- Current frame clips samples after `currentVideoMs` and interpolates the current point.
- Projection maps x/y correctly for 720p, 1080p, and 4K widths.
- PB marker clamps only if PB is outside domain, which should not happen when domain is PB × 1.25.

Visual checks:

- Side-by-side SVG and canvas renders at 720p, 1080p, and 4K.
- Portrait and landscape fullscreen positions.
- Videos with no PB, short dives, and speeds over 2 m/s.
- Export with top metrics only, speed graph only, and both.

## Open Questions

- Should PB be discipline-wide, pool-length-specific, or routine-category-specific? Recommendation: discipline-wide for v1, because it is easiest to understand.
- Should the y-axis show `m/s` or pace (`s/50m`) for swimmers who think in split pace? Recommendation: keep `m/s` for parity with the current HUD speed metric.
- Should the graph line be stepped, like the mockup, or interpolated? Recommendation: stepped for event-to-event split speed; optionally smooth later if we add dense speed samples.
- Should the graph show the whole line ghosted and reveal the active portion? Recommendation: v1 reveal only the active line to keep the overlay calm.
