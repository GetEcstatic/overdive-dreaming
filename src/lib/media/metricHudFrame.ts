import type { DiveTimeline } from '$lib/types';
import { distanceAt, diveElapsedAt, speedAt } from '$lib/capture/timeline';
import type { HudModeDesign, HudRenderMode, HudTextStyle } from './hudDesign';
import { scaleHudModeDesign } from './hudDesign';

export type MetricHudTextKey =
	| 'time-label'
	| 'distance-label'
	| 'time-value'
	| 'distance-value'
	| 'lap-sub'
	| 'speed-sub';

export interface MetricHudRect {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	readonly radius: number;
}

export interface MetricHudTextRun {
	readonly key: MetricHudTextKey;
	readonly text: string;
	readonly x: number;
	readonly y: number;
	readonly align: 'left' | 'right';
	readonly style: HudTextStyle;
}

export interface MetricHudFrame {
	readonly widthPx: number;
	readonly mode: HudRenderMode;
	readonly box: MetricHudRect;
	readonly background: string;
	readonly foreground: string;
	readonly textRuns: readonly MetricHudTextRun[];
	readonly values: {
		readonly elapsedMs: number;
		readonly distanceM: number;
		readonly speedMs: number;
		readonly lapsCompleted: number;
		readonly totalLaps: number;
	};
	readonly design: HudModeDesign;
}

export function formatMetricHudTime(ms: number): string {
	const safeMs = Math.max(0, ms);
	const secs = Math.floor(safeMs / 1000);
	const mm = Math.floor(secs / 60).toString().padStart(2, '0');
	const ss = (secs % 60).toString().padStart(2, '0');
	const tenths = Math.floor((safeMs % 1000) / 100);
	return `${mm}:${ss}.${tenths}`;
}

export function createMetricHudFrame(args: {
	timeline: DiveTimeline;
	poolLengthM: number;
	atMs: number;
	widthPx: number;
	mode: HudRenderMode;
}): MetricHudFrame {
	const design = scaleHudModeDesign(args.widthPx, args.mode);
	const boxX = Math.round(design.offsetXPx);
	const boxY = Math.round(design.offsetYPx);
	const boxW =
		args.mode === 'portrait'
			? args.widthPx - 2 * boxX
			: Math.min(Math.round(args.widthPx * (design.maxWidthRatio ?? 1)), args.widthPx - boxX * 2);
	const padX = Math.round(design.paddingXPx);
	const padY = Math.round(design.paddingYPx);
	const labelLine = design.label.sizePx * design.label.lineHeight;
	const valueLine = design.value.sizePx * design.value.lineHeight;
	const subLine = design.sub.sizePx * design.sub.lineHeight;
	const boxH = Math.round(
		padY * 2 + labelLine + design.valueGapPx + valueLine + design.subMarginTopPx + subLine
	);
	const innerX = boxX + padX;
	const innerY = boxY + padY;
	const rightX = boxX + boxW - padX;
	const valueY = innerY + labelLine + design.valueGapPx;
	const subY = valueY + valueLine + design.subMarginTopPx;

	const elapsedMs = diveElapsedAt(args.timeline, args.atMs);
	const distanceM = distanceAt(args.timeline, args.atMs, args.poolLengthM);
	const speedMs = speedAt(args.timeline, args.atMs, args.poolLengthM);
	const lapsCompleted = args.timeline.laps.filter((lap) => lap.atMs <= args.atMs).length;
	const totalLaps = args.timeline.laps.length;

	return {
		widthPx: args.widthPx,
		mode: args.mode,
		box: {
			x: boxX,
			y: boxY,
			width: boxW,
			height: boxH,
			radius: Math.round(design.radiusPx)
		},
		background: design.background,
		foreground: design.foreground,
		textRuns: [
			{ key: 'time-label', text: 'TIME', x: innerX, y: innerY, align: 'left', style: design.label },
			{ key: 'distance-label', text: 'DISTANCE', x: rightX, y: innerY, align: 'right', style: design.label },
			{
				key: 'time-value',
				text: formatMetricHudTime(elapsedMs),
				x: innerX,
				y: valueY,
				align: 'left',
				style: design.value
			},
			{
				key: 'distance-value',
				text: `${distanceM.toFixed(1)} m`,
				x: rightX,
				y: valueY,
				align: 'right',
				style: design.value
			},
			{
				key: 'lap-sub',
				text: `Lap ${lapsCompleted}/${totalLaps}`,
				x: innerX,
				y: subY,
				align: 'left',
				style: design.sub
			},
			{
				key: 'speed-sub',
				text: `${speedMs.toFixed(2)} m/s`,
				x: rightX,
				y: subY,
				align: 'right',
				style: design.mono
			}
		],
		values: { elapsedMs, distanceM, speedMs, lapsCompleted, totalLaps },
		design
	};
}