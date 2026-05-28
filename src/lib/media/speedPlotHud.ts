import type { DiveTimeline, LapEvent } from '$lib/types';
import { distanceAt, speedAt, totalDistanceM } from '$lib/capture/timeline';

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

export interface Rect {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export interface PlotPoint {
	readonly x: number;
	readonly y: number;
}

export interface Line {
	readonly x1: number;
	readonly y1: number;
	readonly x2: number;
	readonly y2: number;
}

export interface AxisLabel {
	readonly x: number;
	readonly y: number;
	readonly value: number;
	readonly text: string;
	readonly align: 'left' | 'center' | 'right';
}

export interface PlotMarker {
	readonly x: number;
	readonly y1: number;
	readonly y2: number;
	readonly value: number;
}

export interface SpeedPlotRenderModel {
	readonly width: number;
	readonly height: number;
	readonly bandRect: Rect;
	readonly plotRect: Rect;
	readonly gridLines: readonly Line[];
	readonly xLabels: readonly AxisLabel[];
	readonly yLabels: readonly AxisLabel[];
	readonly yAxisLabel: AxisLabel;
	readonly pbMarker?: PlotMarker;
	readonly speedLine: readonly PlotPoint[];
	readonly currentPoint?: PlotPoint;
}

interface SpeedPlotTextStyle {
	readonly family: string;
	readonly sizePx: number;
	readonly weight: number;
	readonly color: string;
}

export interface SpeedPlotHudModeDesign {
	readonly bandHeightPx: number;
	readonly safeInsetXPx: number;
	readonly bottomInsetPx: number;
	readonly radiusPx: number;
	readonly plotPadding: {
		readonly leftPx: number;
		readonly rightPx: number;
		readonly topPx: number;
		readonly bottomPx: number;
	};
	readonly background: {
		readonly top: string;
		readonly bottom: string;
		readonly opacity: number;
	};
	readonly grid: { readonly color: string; readonly widthPx: number };
	readonly axisText: SpeedPlotTextStyle;
	readonly line: { readonly from: string; readonly to: string; readonly widthPx: number };
	readonly pbMarker: { readonly color: string; readonly widthPx: number; readonly symbolSizePx: number };
	readonly currentPoint: { readonly radiusPx: number; readonly color: string };
}

export interface SpeedPlotHudDesign {
	readonly referenceWidthPx: number;
	readonly domWidthPx: number;
	readonly maxSpeedMs: number;
	readonly defaultPbDistanceM: number;
	readonly domainPaddingRatio: number;
	readonly mode: SpeedPlotHudModeDesign;
}

const SANS_FAMILY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const FIRST_SEGMENT_ACCELERATION_DISTANCE_M = 3;

export const SPEED_PLOT_HUD_DESIGN: SpeedPlotHudDesign = {
	referenceWidthPx: 1080,
	domWidthPx: 390,
	maxSpeedMs: 2,
	defaultPbDistanceM: 200,
	domainPaddingRatio: 1.2,
	mode: {
		bandHeightPx: 285,
		safeInsetXPx: 36,
		bottomInsetPx: 32,
		radiusPx: 18,
		plotPadding: { leftPx: 96, rightPx: 42, topPx: 32, bottomPx: 44 },
		background: { top: '#0d1320', bottom: '#000000', opacity: 0.86 },
		grid: { color: 'rgba(255,255,255,0.12)', widthPx: 1.35 },
		axisText: { family: SANS_FAMILY, sizePx: 30, weight: 450, color: 'rgba(255,255,255,0.82)' },
		line: { from: '#2dd4bf', to: '#5eead4', widthPx: 5 },
		pbMarker: { color: '#facc15', widthPx: 3, symbolSizePx: 17 },
		currentPoint: { radiusPx: 7, color: '#f8fafc' }
	}
};

export function scaleSpeedPlotHudDesign(widthPx: number): SpeedPlotHudModeDesign {
	const scale = widthPx / SPEED_PLOT_HUD_DESIGN.referenceWidthPx;
	const source = SPEED_PLOT_HUD_DESIGN.mode;
	return {
		...source,
		bandHeightPx: source.bandHeightPx * scale,
		safeInsetXPx: source.safeInsetXPx * scale,
		bottomInsetPx: source.bottomInsetPx * scale,
		radiusPx: source.radiusPx * scale,
		plotPadding: {
			leftPx: source.plotPadding.leftPx * scale,
			rightPx: source.plotPadding.rightPx * scale,
			topPx: source.plotPadding.topPx * scale,
			bottomPx: source.plotPadding.bottomPx * scale
		},
		grid: { ...source.grid, widthPx: source.grid.widthPx * scale },
		axisText: { ...source.axisText, sizePx: source.axisText.sizePx * scale },
		line: { ...source.line, widthPx: source.line.widthPx * scale },
		pbMarker: {
			...source.pbMarker,
			widthPx: source.pbMarker.widthPx * scale,
			symbolSizePx: source.pbMarker.symbolSizePx * scale
		},
		currentPoint: { ...source.currentPoint, radiusPx: source.currentPoint.radiusPx * scale }
	};
}

export function speedPlotCssVariables(
	widthPx = SPEED_PLOT_HUD_DESIGN.domWidthPx,
	controlsClearancePx = 0
): string {
	const design = scaleSpeedPlotHudDesign(widthPx);
	return [
		`--speed-plot-band-height: ${design.bandHeightPx}px`,
		`--speed-plot-safe-x: ${design.safeInsetXPx}px`,
		`--speed-plot-bottom: ${design.bottomInsetPx}px`,
		`--speed-plot-controls-clearance: ${controlsClearancePx}px`,
		`--speed-plot-radius: ${design.radiusPx}px`,
		`--speed-plot-dom-width: ${widthPx}px`,
		`--speed-plot-axis-family: ${design.axisText.family}`,
		`--speed-plot-axis-size: ${design.axisText.sizePx}px`,
		`--speed-plot-axis-weight: ${design.axisText.weight}`,
		`--speed-plot-axis-color: ${design.axisText.color}`
	].join('; ');
}

export function speedPlotCanvasFonts(widthPx: number): string[] {
	const design = scaleSpeedPlotHudDesign(widthPx);
	return [`${design.axisText.weight} ${design.axisText.sizePx}px ${design.axisText.family}`];
}

export function samplesFromTimeline(timeline: DiveTimeline, poolLengthM: number): SpeedPlotSample[] {
	const denseSamples = (timeline.samples ?? [])
		.filter((sample) => isFiniteSample(sample))
		.sort((a, b) => a.atMs - b.atMs)
		.map((sample) => ({ atMs: sample.atMs, distanceM: sample.distanceM, speedMs: sample.speedMs }));

	if (denseSamples.length > 0) {
		const first = denseSamples[0];
		const startSpeed = timeline.diveStartMs < first.atMs ? first.speedMs : speedAt(timeline, timeline.diveStartMs, poolLengthM);
		const start = { atMs: timeline.diveStartMs, distanceM: 0, speedMs: Math.max(0, startSpeed) };
		return dedupeSamples([start, ...denseSamples]);
	}

	const waypoints = sortedWaypointEvents(timeline);
	if (waypoints.length === 0) {
		const speedMs = speedAt(timeline, Math.max(timeline.diveStartMs + 1, timeline.diveEndMs), poolLengthM);
		return [
			{ atMs: timeline.diveStartMs, distanceM: 0, speedMs },
			{ atMs: timeline.diveEndMs, distanceM: totalDistanceM(timeline), speedMs }
		];
	}

	const samples: SpeedPlotSample[] = [];
	let previousAtMs = timeline.diveStartMs;
	let previousDistanceM = 0;
	for (const waypoint of waypoints) {
		const segmentMs = Math.max(1, waypoint.atMs - previousAtMs);
		const segmentDistanceM = Math.max(0, waypoint.cumulativeDistanceM - previousDistanceM);
		const segmentSpeedMs = segmentDistanceM / (segmentMs / 1000);
		if (samples.length === 0) {
			samples.push({ atMs: previousAtMs, distanceM: previousDistanceM, speedMs: segmentSpeedMs });
		}
		samples.push({ atMs: waypoint.atMs, distanceM: waypoint.cumulativeDistanceM, speedMs: segmentSpeedMs });
		previousAtMs = waypoint.atMs;
		previousDistanceM = waypoint.cumulativeDistanceM;
	}

	if (timeline.diveEndMs > previousAtMs) {
		const tailDistanceM = distanceAt(timeline, timeline.diveEndMs, poolLengthM);
		samples.push({
			atMs: timeline.diveEndMs,
			distanceM: tailDistanceM,
			speedMs: samples[samples.length - 1]?.speedMs ?? 0
		});
	}

	return dedupeSamples(samples);
}

export function realizedDistanceM(timeline: DiveTimeline, poolLengthM: number): number {
	return Math.max(
		0,
		distanceAt(timeline, timeline.diveEndMs, poolLengthM),
		...(timeline.samples?.map((sample) => sample.distanceM).filter(Number.isFinite) ?? []),
		...timeline.laps.map((lap) => lap.cumulativeDistanceM),
		...(timeline.subSplits?.map((split) => split.cumulativeDistanceM) ?? [])
	);
}

export function speedPlotDomain(pbDistanceM: number | null | undefined, fallbackDistanceM: number): number {
	const pbBase = validPositive(pbDistanceM) ? pbDistanceM : SPEED_PLOT_HUD_DESIGN.defaultPbDistanceM;
	const realizedBase = validPositive(fallbackDistanceM) ? fallbackDistanceM : 0;
	return Math.max(pbBase, realizedBase, 1) * SPEED_PLOT_HUD_DESIGN.domainPaddingRatio;
}

export function frameAtTime(args: {
	readonly samples: readonly SpeedPlotSample[];
	readonly currentVideoMs: number;
	readonly pbDistanceM?: number | null;
	readonly fallbackDistanceM: number;
	readonly currentSample?: SpeedPlotSample;
}): SpeedPlotFrame {
	const sortedSamples = args.samples.filter(isFiniteSample).slice().sort((a, b) => a.atMs - b.atMs);
	const domainDistanceM = speedPlotDomain(args.pbDistanceM, args.fallbackDistanceM);
	const currentSample = args.currentSample && isFiniteSample(args.currentSample) ? args.currentSample : undefined;
	if (sortedSamples.length === 0 && !currentSample) {
		return {
			domainDistanceM,
			pbDistanceM: validPositive(args.pbDistanceM) ? args.pbDistanceM : null,
			samples: [],
			currentDistanceM: 0,
			currentSpeedMs: 0
		};
	}

	const current = currentSample ?? interpolateSampleAt(sortedSamples, args.currentVideoMs);
	const revealed = sortedSamples.filter((sample) => sample.atMs <= args.currentVideoMs);
	const line = dedupeSamples([...revealed, current]);

	return {
		domainDistanceM,
		pbDistanceM: validPositive(args.pbDistanceM) ? args.pbDistanceM : null,
		samples: line,
		currentDistanceM: current.distanceM,
		currentSpeedMs: current.speedMs
	};
}

export function createSpeedPlotFrame(args: {
	readonly timeline: DiveTimeline;
	readonly poolLengthM: number;
	readonly currentVideoMs: number;
	readonly pbDistanceM?: number | null;
}): SpeedPlotFrame {
	const fallbackDistanceM = realizedDistanceM(args.timeline, args.poolLengthM);
	const currentVideoMs = Math.max(0, args.currentVideoMs);
	return frameAtTime({
		samples: samplesFromTimeline(args.timeline, args.poolLengthM),
		currentVideoMs,
		pbDistanceM: args.pbDistanceM,
		fallbackDistanceM,
		currentSample: {
			atMs: currentVideoMs,
			distanceM: distanceAt(args.timeline, currentVideoMs, args.poolLengthM),
			speedMs: speedAt(args.timeline, currentVideoMs, args.poolLengthM)
		}
	});
}

export function projectSpeedPlot(frame: SpeedPlotFrame, widthPx: number, heightPx: number): SpeedPlotRenderModel {
	const design = scaleSpeedPlotHudDesign(widthPx);
	const bandHeight = Math.min(design.bandHeightPx, heightPx);
	const bandRect: Rect = {
		x: design.safeInsetXPx,
		y: Math.max(0, heightPx - bandHeight - design.bottomInsetPx),
		width: Math.max(0, widthPx - design.safeInsetXPx * 2),
		height: bandHeight
	};
	const plotRect: Rect = {
		x: bandRect.x + design.plotPadding.leftPx,
		y: bandRect.y + design.plotPadding.topPx,
		width: Math.max(1, bandRect.width - design.plotPadding.leftPx - design.plotPadding.rightPx),
		height: Math.max(1, bandRect.height - design.plotPadding.topPx - design.plotPadding.bottomPx)
	};

	const xTicks = xTickValues(frame.domainDistanceM);
	const yTicks = [0, 0.5, 1, 1.5, SPEED_PLOT_HUD_DESIGN.maxSpeedMs];
	const toPoint = (distanceM: number, speedMs: number): PlotPoint => ({
		x: plotRect.x + (Math.max(0, Math.min(frame.domainDistanceM, distanceM)) / frame.domainDistanceM) * plotRect.width,
		y: plotRect.y + (1 - Math.max(0, Math.min(SPEED_PLOT_HUD_DESIGN.maxSpeedMs, speedMs)) / SPEED_PLOT_HUD_DESIGN.maxSpeedMs) * plotRect.height
	});

	const xLabels: AxisLabel[] = xTicks.map((value) => {
		const x = toPoint(value, 0).x;
		return { x, y: plotRect.y + plotRect.height + design.axisText.sizePx * 1.35, value, text: `${Math.round(value)}m`, align: 'center' };
	});
	const yLabels: AxisLabel[] = yTicks.map((value) => ({
		x: plotRect.x - design.axisText.sizePx * 0.55,
		y: toPoint(0, value).y + design.axisText.sizePx * 0.35,
		value,
		text: value % 1 === 0 ? value.toFixed(0) : value.toFixed(1),
		align: 'right'
	}));
	const gridLines: Line[] = [
		...xTicks.map((value) => {
			const x = toPoint(value, 0).x;
			return { x1: x, y1: plotRect.y, x2: x, y2: plotRect.y + plotRect.height };
		}),
		...yTicks.map((value) => {
			const y = toPoint(0, value).y;
			return { x1: plotRect.x, y1: y, x2: plotRect.x + plotRect.width, y2: y };
		})
	];
	const speedLineSamples = visibleSpeedLineSamples(frame);
	const speedLine = speedLineSamples.map((sample) => toPoint(sample.distanceM, sample.speedMs));
	const currentPoint = frame.samples.length > 0 ? toPoint(frame.currentDistanceM, frame.currentSpeedMs) : undefined;
	const pbMarker = validPositive(frame.pbDistanceM)
		? {
			x: toPoint(frame.pbDistanceM, 0).x,
			y1: plotRect.y,
			y2: plotRect.y + plotRect.height,
			value: frame.pbDistanceM
		}
		: undefined;

	return {
		width: widthPx,
		height: heightPx,
		bandRect,
		plotRect,
		gridLines,
		xLabels,
		yLabels,
		yAxisLabel: {
			x: bandRect.x + design.axisText.sizePx * 0.8,
			y: plotRect.y + plotRect.height / 2,
			value: 0,
			text: 'speed [m/s]',
			align: 'center'
		},
		pbMarker,
		speedLine,
		currentPoint
	};
}

function visibleSpeedLineSamples(frame: SpeedPlotFrame): readonly SpeedPlotSample[] {
	if (frame.currentDistanceM <= 0) return frame.samples;
	const hasRevealedPositiveWaypoint = frame.samples.some(
		(sample) => sample.distanceM > 0.001 && sample.distanceM < frame.currentDistanceM - 0.001
	);
	if (!hasRevealedPositiveWaypoint) {
		const accelerationDistanceM = Math.min(FIRST_SEGMENT_ACCELERATION_DISTANCE_M, frame.currentDistanceM);
		const firstSegment: SpeedPlotSample[] = [
			{ atMs: 0, distanceM: 0, speedMs: 0 },
			{ atMs: 0, distanceM: accelerationDistanceM, speedMs: frame.currentSpeedMs }
		];
		if (frame.currentDistanceM > accelerationDistanceM + 0.001) {
			firstSegment.push({ atMs: 0, distanceM: frame.currentDistanceM, speedMs: frame.currentSpeedMs });
		}
		return firstSegment;
	}
	const samples = [...frame.samples];
	const last = samples[samples.length - 1];
	if (!samples[0]) {
		return [
			{ atMs: 0, distanceM: 0, speedMs: frame.currentSpeedMs },
			{ atMs: 0, distanceM: frame.currentDistanceM, speedMs: frame.currentSpeedMs }
		];
	}
	if (!last || frame.currentDistanceM > last.distanceM + 0.001) {
		samples.push({
			atMs: last?.atMs ?? samples[0].atMs,
			distanceM: frame.currentDistanceM,
			speedMs: frame.currentSpeedMs
		});
	}
	return withFirstSegmentAcceleration(samples, frame.currentDistanceM, frame.currentSpeedMs);
}

function withFirstSegmentAcceleration(
	samples: readonly SpeedPlotSample[],
	currentDistanceM: number,
	currentSpeedMs: number
): readonly SpeedPlotSample[] {
	const firstPositive = samples.find((sample) => sample.distanceM > 0.001);
	const anchorSpeedMs = firstPositive?.speedMs ?? currentSpeedMs;
	const accelerationDistanceM = Math.min(
		FIRST_SEGMENT_ACCELERATION_DISTANCE_M,
		currentDistanceM,
		firstPositive?.distanceM ?? currentDistanceM
	);
	const anchored: SpeedPlotSample[] = [
		{ atMs: samples[0]?.atMs ?? 0, distanceM: 0, speedMs: 0 },
		{ atMs: firstPositive?.atMs ?? samples[0]?.atMs ?? 0, distanceM: accelerationDistanceM, speedMs: anchorSpeedMs }
	];

	for (const sample of samples) {
		if (sample.distanceM > accelerationDistanceM + 0.001) {
			anchored.push(sample);
		}
	}
	return anchored;
}

function sortedWaypointEvents(timeline: DiveTimeline): LapEvent[] {
	return [...timeline.laps, ...(timeline.subSplits ?? [])]
		.filter((event) => event.atMs >= timeline.diveStartMs && event.atMs <= timeline.diveEndMs)
		.sort((a, b) => a.atMs - b.atMs || a.cumulativeDistanceM - b.cumulativeDistanceM);
}

function interpolateSampleAt(samples: readonly SpeedPlotSample[], atMs: number): SpeedPlotSample {
	if (samples.length === 0) return { atMs, distanceM: 0, speedMs: 0 };
	if (atMs <= samples[0].atMs) return { ...samples[0], atMs };
	const last = samples[samples.length - 1];
	if (atMs >= last.atMs) return { ...last, atMs };

	const nextIndex = samples.findIndex((sample) => sample.atMs >= atMs);
	const previous = samples[Math.max(0, nextIndex - 1)];
	const next = samples[nextIndex];
	const deltaMs = next.atMs - previous.atMs;
	if (deltaMs <= 0) return { ...previous, atMs };
	const t = (atMs - previous.atMs) / deltaMs;
	return {
		atMs,
		distanceM: previous.distanceM + (next.distanceM - previous.distanceM) * t,
		speedMs: previous.speedMs + (next.speedMs - previous.speedMs) * t
	};
}

function dedupeSamples(samples: readonly SpeedPlotSample[]): SpeedPlotSample[] {
	const sorted = samples.filter(isFiniteSample).slice().sort((a, b) => a.atMs - b.atMs);
	const out: SpeedPlotSample[] = [];
	for (const sample of sorted) {
		const last = out[out.length - 1];
		if (last && Math.abs(last.atMs - sample.atMs) < 0.001) {
			out[out.length - 1] = sample;
		} else {
			out.push(sample);
		}
	}
	return out;
}

function isFiniteSample(sample: { atMs: number; distanceM: number; speedMs: number }): boolean {
	return Number.isFinite(sample.atMs) && Number.isFinite(sample.distanceM) && Number.isFinite(sample.speedMs);
}

function validPositive(value: number | null | undefined): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function xTickValues(domainDistanceM: number): number[] {
	const step = domainDistanceM <= 300 ? 50 : domainDistanceM <= 600 ? 100 : 200;
	const ticks: number[] = [];
	for (let value = 0; value <= domainDistanceM + 0.001; value += step) {
		ticks.push(value);
	}
	const roundedDomain = Math.round(domainDistanceM);
	if (ticks[ticks.length - 1] !== roundedDomain) ticks.push(roundedDomain);
	return ticks;
}