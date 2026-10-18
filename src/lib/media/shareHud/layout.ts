/**
 * Share HUD layout (plan §4.3, §4.4, §4.8): frame model → primitives in
 * canvas pixels. Geometry is designed at a 1080-px short edge and scaled.
 *
 * - Portrait canvases use the reel geometry: everything inside Instagram's
 *   safe zones (top 250, bottom 1536 on 1920, right column below 1100).
 *   Taller or shorter canvases keep the top block pinned to the top and the
 *   graph block pinned to the bottom.
 * - Landscape canvases use the native landscape geometry: stats top-left,
 *   speed graph bottom-left, inside a 5% margin.
 */

import {
	disciplineLabel,
	formatFinalDistance,
	formatHudTime,
	formatLiveDistance,
	formatSignedDelta,
	formatSpeed,
	formatSplit
} from './format';
import type { ResultCardModel, ShareHudDive, ShareHudFrame } from './model';
import type { GraphDirection, SpeedGraphFrame, SpeedScale, SpeedSegment } from './speedGraph';
import type { HudPrimitive } from './svg';
import { COLOURS, PAINT, REFERENCE_SHORT_EDGE_PX } from './tokens';

export interface HudCanvas {
	readonly width: number;
	readonly height: number;
}

type Prims = HudPrimitive[];

/** Rectangle in reference pixels. */
export interface Rect {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

/**
 * Reel safe zones on the 1080×1920 canvas (§4.3). The bottom 20% is reserved
 * for an organic Reel's username, collapsed caption and audio line. Meta's
 * ads guidance (bottom 35%) is stricter than posts need.
 */
export const REEL_SAFE = {
	top: 250,
	bottom: 1536,
	side: 70,
	actionColumnX: 940,
	actionColumnTopY: 1100
} as const;

interface GraphBox {
	readonly x0: number;
	readonly x1: number;
	readonly headerY: number;
	readonly top: number;
	readonly base: number;
	readonly railY: number;
}

interface Geometry {
	readonly portrait: boolean;
	/** Reference size (short edge 1080). */
	readonly rw: number;
	readonly rh: number;
	readonly scale: number;
	readonly left: number;
	readonly right: number;
	readonly headerY: number;
	readonly labelY: number;
	readonly valueY: number;
	readonly valueSize: number;
	/** Right edge of the stats block. */
	readonly statsRight: number;
	readonly subY: number;
	readonly topScrim: number;
	readonly bottomScrimY: number;
	readonly graph: GraphBox;
}

export function isPortraitCanvas(canvas: HudCanvas): boolean {
	return canvas.height / canvas.width >= 1.3;
}

export function geometry(canvas: HudCanvas): Geometry {
	const portrait = isPortraitCanvas(canvas);
	const scale = Math.min(canvas.width, canvas.height) / REFERENCE_SHORT_EDGE_PX;
	const rw = canvas.width / scale;
	const rh = canvas.height / scale;
	if (portrait) {
		const dy = rh - 1920;
		// Graph block sits on the safe bottom; offsets are from that line.
		const b = REEL_SAFE.bottom + dy;
		const left = REEL_SAFE.side;
		return {
			portrait,
			rw,
			rh,
			scale,
			left,
			right: rw - left,
			headerY: 250,
			labelY: 372,
			valueY: 500,
			valueSize: 140,
			statsRight: rw - left,
			subY: 566,
			topScrim: 720,
			bottomScrimY: b - 280,
			graph: { x0: 124, x1: 900, headerY: b - 274, top: b - 230, base: b - 72, railY: b - 24 }
		};
	}
	const left = 96;
	return {
		portrait,
		rw,
		rh,
		scale,
		left,
		right: rw - left,
		headerY: 54,
		labelY: 168,
		valueY: 284,
		valueSize: 124,
		statsRight: left + 800,
		subY: 346,
		topScrim: 470,
		bottomScrimY: 690,
		graph: { x0: left + 60, x1: left + 836, headerY: 772, top: 830, base: 970, railY: 1018 }
	};
}

// ---------------------------------------------------------------------------
// Small builders
// ---------------------------------------------------------------------------

function text(
	x: number,
	y: number,
	value: string,
	size: number,
	opts: Partial<Extract<HudPrimitive, { kind: 'text' }>> = {}
): HudPrimitive {
	return {
		kind: 'text',
		x,
		y,
		text: value,
		size,
		font: opts.font ?? 'cond',
		weight: opts.weight ?? 600,
		fill: opts.fill ?? COLOURS.text,
		anchor: opts.anchor,
		tracking: opts.tracking,
		opacity: opts.opacity,
		shadow: opts.shadow ?? true
	};
}

function logo(x: number, y: number, size: number): Prims {
	const r = size / 2;
	const cx = x + r;
	const cy = y + r;
	const wave = `M ${cx - r * 0.5} ${cy + r * 0.05} q ${r * 0.18} ${-r * 0.6} ${r * 0.33} 0 t ${r * 0.33} 0 t ${r * 0.33} 0`;
	return [
		{ kind: 'circle', cx, cy, r: r * 0.82, stroke: PAINT.brand, strokeWidth: r * 0.16 },
		{ kind: 'path', d: wave, stroke: PAINT.brand, strokeWidth: r * 0.16, round: true }
	];
}

function header(dive: ShareHudDive, g: Geometry): Prims {
	const y = g.headerY;
	const out: Prims = [
		{ kind: 'rect', x: g.left, y: y + 2, w: 96, h: 50, rx: 12, fill: COLOURS.teal },
		text(g.left + 48, y + 40, dive.context.discipline, 36, { weight: 700, fill: COLOURS.onTeal, anchor: 'middle', shadow: false, tracking: 1 }),
		text(g.left + 116, y + 40, `${dive.context.poolLengthM} M POOL`, 34, { fill: COLOURS.textSoft, tracking: 2 })
	];
	if (dive.context.branding === 'subtle') {
		out.push({
			kind: 'group',
			opacity: 0.7,
			children: [
				...logo(g.right - 52, y, 52),
				text(g.right - 66, y + 40, 'OVERDIVE', 34, { weight: 700, anchor: 'end', tracking: 3 })
			]
		});
	}
	return out;
}

function stats(frame: ShareHudFrame, g: Geometry): Prims {
	const gold = frame.pb?.passed === true;
	const distanceFill = gold ? COLOURS.gold : COLOURS.text;
	const unitSize = Math.round(g.valueSize * 0.46);
	const distance = frame.phase === 'finish' || frame.phase === 'card' ? formatFinalDistance(frame.distanceM) : formatLiveDistance(frame.distanceM);
	const out: Prims = [
		text(g.left, g.labelY, 'TIME', 30, { fill: COLOURS.label, tracking: 3 }),
		text(g.left, g.valueY, formatHudTime(frame.elapsedMs), g.valueSize, { weight: 700 }),
		text(g.statsRight, g.labelY, 'DISTANCE', 30, { fill: COLOURS.label, tracking: 3, anchor: 'end' }),
		text(g.statsRight - unitSize * 1.1, g.valueY, distance, g.valueSize, { weight: 700, anchor: 'end', fill: distanceFill }),
		text(g.statsRight, g.valueY, 'm', unitSize, { anchor: 'end', fill: distanceFill })
	];
	if (frame.toast) {
		out.push(toast(frame, g));
		return out;
	}
	if (frame.phase !== 'pre') {
		const prefix = frame.phase === 'live' ? '' : 'AVG ';
		out.push(text(g.left, g.subY, `${prefix}${formatSpeed(frame.speedMs)} m/s`, 44, { fill: COLOURS.textSoft }));
	}
	if (frame.pb?.passed) {
		const label = frame.pb.beyondM < 1 ? 'AT PB' : `+${Math.floor(frame.pb.beyondM)} m PB`;
		out.push({ kind: 'rect', x: g.statsRight - 196, y: g.subY - 40, w: 196, h: 54, rx: 27, fill: COLOURS.gold });
		out.push(text(g.statsRight - 98, g.subY, label, 38, { weight: 700, anchor: 'middle', fill: COLOURS.onGold, shadow: false }));
	} else {
		out.push(text(g.statsRight, g.subY, `LENGTH ${frame.length}`, 40, { fill: COLOURS.textSoft, anchor: 'end', tracking: 2 }));
	}
	return out;
}

/** Compact toast pill that replaces the speed / LENGTH line (§4.4). */
function toast(frame: ShareHudFrame, g: Geometry): HudPrimitive {
	const t = frame.toast!;
	const y = g.subY - 44;
	const h = 62;
	if (t.kind === 'pb') {
		return {
			kind: 'group',
			opacity: t.opacity,
			children: [
				{ kind: 'rect', x: g.left, y, w: 460, h, rx: h / 2, fill: COLOURS.gold },
				text(g.left + 230, y + 45, 'PAST YOUR PB', 42, { weight: 700, fill: COLOURS.onGold, anchor: 'middle', tracking: 2, shadow: false })
			]
		};
	}
	const w = 600;
	const children: Prims = [
		{ kind: 'rect', x: g.left, y, w, h, rx: h / 2, fill: COLOURS.panel, opacity: 0.82 },
		{ kind: 'rect', x: g.left + 14, y: y + 14, w: 8, h: h - 28, rx: 4, fill: COLOURS.teal },
		text(g.left + 40, y + 44, `LENGTH ${t.length}`, 32, { fill: COLOURS.muted, tracking: 2, shadow: false }),
		text(g.left + 210, y + 46, formatSplit(t.splitMs), 44, { weight: 700, shadow: false })
	];
	if (t.deltaMs !== null) {
		const faster = t.deltaMs <= 0;
		const colour = Math.abs(t.deltaMs) < 50 ? COLOURS.label : faster ? COLOURS.faster : COLOURS.slowerSplit;
		children.push({ kind: 'rect', x: g.left + w - 160, y: y + 9, w: 146, h: h - 18, rx: (h - 18) / 2, fill: colour, opacity: 0.2 });
		children.push(text(g.left + w - 87, y + 45, formatSignedDelta(t.deltaMs / 1000, 1), 38, { weight: 700, fill: colour, anchor: 'middle', shadow: false }));
	}
	return { kind: 'group', opacity: t.opacity, transform: t.offsetX ? `translate(${t.offsetX.toFixed(1)} 0)` : undefined, children };
}

// ---------------------------------------------------------------------------
// Speed graph (§4.8.3)
// ---------------------------------------------------------------------------

function yFor(scale: SpeedScale, top: number, base: number): (v: number) => number {
	return (v) => base - ((Math.max(scale.lo, Math.min(scale.hi, v)) - scale.lo) / (scale.hi - scale.lo)) * (base - top);
}

function steppedPath(segs: readonly SpeedSegment[], toX: (d: number) => number, y: (v: number) => number): string {
	return segs
		.map((s, i) => `${i === 0 ? 'M' : 'L'} ${toX(s.fromM).toFixed(1)} ${y(s.speedMs).toFixed(1)} L ${toX(s.toM).toFixed(1)} ${y(s.speedMs).toFixed(1)}`)
		.join(' ');
}

function areaPath(segs: readonly SpeedSegment[], toX: (d: number) => number, y: (v: number) => number, base: number): string {
	if (segs.length === 0) return '';
	return `M ${toX(segs[0].fromM).toFixed(1)} ${base} ${steppedPath(segs, toX, y).replace(/^M/, 'L')} L ${toX(segs[segs.length - 1].toM).toFixed(1)} ${base} Z`;
}

/** Stepped line: measured segments solid, the estimated tail dashed. */
function speedLine(segs: readonly SpeedSegment[], toX: (d: number) => number, y: (v: number) => number, base: number, width: number): Prims {
	if (segs.length === 0) return [];
	const measured = segs.filter((s) => !s.estimated);
	const estimated = segs.filter((s) => s.estimated);
	const out: Prims = [{ kind: 'path', d: areaPath(segs, toX, y, base), fill: PAINT.area }];
	if (measured.length) out.push({ kind: 'path', d: steppedPath(measured, toX, y), stroke: COLOURS.teal, strokeWidth: width });
	if (estimated.length) {
		const joined = measured.length ? [{ ...estimated[0], fromM: estimated[0].fromM }] : estimated;
		out.push({ kind: 'path', d: steppedPath(joined, toX, y), stroke: COLOURS.teal, strokeWidth: width, dash: '12 10' });
	}
	return out;
}

function guideLines(scale: SpeedScale, x0: number, x1: number, top: number, base: number, labelX: number | null): Prims {
	const y = yFor(scale, top, base);
	return scale.guides.flatMap((v): Prims => {
		const gy = y(v);
		const line: HudPrimitive = { kind: 'line', x1: x0, y1: gy, x2: x1, y2: gy, stroke: '#ffffff', strokeWidth: 2, opacity: 0.16, dash: '6 10' };
		return labelX === null
			? [line]
			: [line, text(labelX, gy + 9, v.toFixed(1), 26, { fill: COLOURS.label, anchor: 'end', opacity: 0.8 })];
	});
}

function xForLength(box: GraphBox, direction: GraphDirection, startM: number, poolLengthM: number): (d: number) => number {
	const w = box.x1 - box.x0;
	return (d) => {
		const f = (d - startM) / poolLengthM;
		return direction === 'rtl' ? box.x1 - f * w : box.x0 + f * w;
	};
}

function cursorTag(box: GraphBox, x: number, y: number, speedMs: number, anchorRight: boolean): Prims {
	const w = 150;
	const h = 46;
	const bx = Math.max(box.x0, Math.min(box.x1 - w, anchorRight ? x - w + 20 : x - 20));
	const by = Math.max(box.top - 70, y - h - 30);
	return [
		{ kind: 'circle', cx: x, cy: y, r: 26, fill: PAINT.glow },
		{ kind: 'circle', cx: x, cy: y, r: 11, fill: '#ffffff' },
		{ kind: 'rect', x: bx, y: by, w, h, rx: h / 2, fill: '#ffffff' },
		text(bx + w / 2, by + 34, `${formatSpeed(speedMs)} m/s`, 32, { weight: 700, fill: COLOURS.panel, anchor: 'middle', shadow: false })
	];
}

function tickSpacingM(poolLengthM: number): number {
	return poolLengthM % 12.5 === 0 ? 12.5 : poolLengthM / 4;
}

function liveGraph(graph: SpeedGraphFrame, box: GraphBox): Prims {
	const { poolLengthM, startM, direction } = graph;
	const toX = xForLength(box, direction, startM, poolLengthM);
	const y = yFor(graph.scale, box.top, box.base);
	const out: Prims = [];
	const hy = box.headerY;
	const rtl = direction === 'rtl';

	// Header: LENGTH n, wall distances above their walls, chevrons in the swim direction.
	out.push(text(box.x0, hy, `LENGTH ${graph.length}`, 32, { weight: 700, tracking: 2 }));
	out.push(text(rtl ? box.x1 : box.x0 + 160, hy, `${startM} m`, 28, { anchor: rtl ? 'end' : 'start', fill: COLOURS.label }));
	out.push(text(rtl ? box.x0 + 160 : box.x1, hy, `${graph.endM} m`, 28, { anchor: rtl ? 'start' : 'end', fill: COLOURS.label }));
	const dir = rtl ? -1 : 1;
	const chevronX = (box.x0 + 160 + box.x1) / 2;
	for (let i = 0; i < 3; i++) {
		const x = chevronX + (i - 1) * 26 * dir;
		out.push({
			kind: 'path',
			d: `M ${x - 6 * dir} ${hy - 22} L ${x + 6 * dir} ${hy - 11} L ${x - 6 * dir} ${hy}`,
			stroke: '#ffffff',
			strokeWidth: 5,
			opacity: 0.35 + i * 0.3,
			round: true
		});
	}

	// Pool: walls, waypoint ticks, guides, baseline.
	for (const x of [box.x0, box.x1]) {
		out.push({ kind: 'rect', x: x - 3, y: box.top - 30, w: 6, h: box.base - box.top + 30, rx: 3, fill: '#ffffff', opacity: 0.5 });
	}
	const spacing = tickSpacingM(poolLengthM);
	for (let d = spacing; d < poolLengthM - 1e-9; d += spacing) {
		const x = box.x0 + (d / poolLengthM) * (box.x1 - box.x0);
		out.push({ kind: 'line', x1: x, y1: box.top - 10, x2: x, y2: box.base, stroke: '#ffffff', strokeWidth: 2, opacity: 0.08 });
	}
	out.push(...guideLines(graph.scale, box.x0 + 8, box.x1 - 8, box.top, box.base, box.x0 - 14));
	out.push({ kind: 'line', x1: box.x0, y1: box.base, x2: box.x1, y2: box.base, stroke: '#ffffff', strokeWidth: 2, opacity: 0.35 });

	// Ghost of the previous length, mirrored into place around the graph centre.
	const ghost = graph.ghost;
	if (ghost) {
		const ghostX = xForLength(box, ghost.direction, startM - poolLengthM, poolLengthM);
		const cx = (box.x0 + box.x1) / 2;
		const sx = 1 - 2 * ghost.flip;
		out.push({
			kind: 'group',
			opacity: ghost.opacity,
			transform: ghost.flip === 0 ? undefined : `translate(${cx} 0) scale(${sx.toFixed(3)} 1) translate(${-cx} 0)`,
			children: [{ kind: 'path', d: steppedPath(ghost.segments, ghostX, y), stroke: '#ffffff', strokeWidth: 4, dash: ghost.dashed ? '10 10' : undefined }]
		});
		if (ghost.showLabel) {
			const last = ghost.segments[ghost.segments.length - 1];
			out.push(
				text(rtl ? box.x0 + 14 : box.x1 - 14, y(last.speedMs) - 12, `L${ghost.length}`, 26, {
					weight: 700,
					fill: COLOURS.textSoft,
					anchor: rtl ? 'start' : 'end',
					opacity: 0.8
				})
			);
		}
	}

	// PB post, only in the length that contains it.
	if (graph.pbPost) {
		const x = toX(graph.pbPost.distanceM);
		out.push({ kind: 'rect', x: x - 3, y: box.top - 30, w: 6, h: box.base - box.top + 30, rx: 3, fill: COLOURS.gold });
		// Label on the swim-ahead side of the post, unless that runs past the far wall.
		const ahead = rtl ? -1 : 1;
		const room = rtl ? x - box.x0 : box.x1 - x;
		const side = room < 120 ? -ahead : ahead;
		out.push(
			text(x + side * 12, box.top - 8, graph.pbPost.passed ? 'PB' : `PB ${graph.pbPost.distanceM}`, 28, {
				weight: 700,
				fill: COLOURS.gold,
				anchor: side > 0 ? 'start' : 'end'
			})
		);
	}

	// Current length line, labels and deltas.
	out.push(...speedLine(graph.segments, toX, y, box.base, 6));
	for (const s of graph.segments) {
		if (!s.label) continue;
		const mid = (toX(s.fromM) + toX(s.toM)) / 2;
		out.push(text(mid, y(s.speedMs) - 14, formatSpeed(s.speedMs), 34, { weight: 700, anchor: 'middle' }));
		if (s.label.deltaMs !== null) {
			const d = s.label.deltaMs;
			const fill = d > 0.005 ? COLOURS.faster : d < -0.005 ? COLOURS.slower : COLOURS.label;
			out.push(text(mid, y(s.speedMs) + 36, formatSignedDelta(d, 2), 28, { weight: 700, anchor: 'middle', fill }));
		}
	}
	if (graph.cursor) {
		const cx = toX(graph.cursor.distanceM);
		const cy = y(graph.cursor.speedMs);
		if (graph.cursor.showTag) out.push(...cursorTag(box, cx, cy, graph.cursor.speedMs, rtl));
		else out.push({ kind: 'circle', cx, cy, r: 11, fill: '#ffffff' });
	}
	return out;
}

/** Thin whole-dive progress rail with a tick per length and the PB tick. */
function rail(dive: ShareHudDive, distanceM: number, box: GraphBox): Prims {
	const pb = dive.context.pbBeforeM;
	const domain = Math.max(pb ?? 0, dive.finalM, dive.context.poolLengthM) * 1.08;
	const w = box.x1 - box.x0;
	const toX = (d: number) => box.x0 + (Math.min(d, domain) / domain) * w;
	const y = box.railY;
	const out: Prims = [
		{ kind: 'rect', x: box.x0, y, w, h: 8, rx: 4, fill: '#ffffff', opacity: 0.22 },
		{ kind: 'rect', x: box.x0, y, w: Math.max(8, toX(distanceM) - box.x0), h: 8, rx: 4, fill: PAINT.fill }
	];
	for (let d = dive.context.poolLengthM; d < domain; d += dive.context.poolLengthM) {
		out.push({ kind: 'rect', x: toX(d) - 1.5, y: y - 6, w: 3, h: 20, fill: '#ffffff', opacity: 0.6 });
	}
	if (pb !== null && pb > 0) out.push({ kind: 'rect', x: toX(pb) - 3, y: y - 14, w: 6, h: 36, rx: 3, fill: COLOURS.gold });
	out.push({ kind: 'circle', cx: toX(distanceM), cy: y + 4, r: 9, fill: '#ffffff' });
	return out;
}

// ---------------------------------------------------------------------------
// Public layouts
// ---------------------------------------------------------------------------

function scaled(children: Prims, g: Geometry): Prims {
	return g.scale === 1 ? children : [{ kind: 'group', transform: `scale(${g.scale.toFixed(5)})`, children }];
}

/** Live HUD (pre, live and finish phases). */
export function layoutLiveHud(dive: ShareHudDive, frame: ShareHudFrame, canvas: HudCanvas): HudPrimitive[] {
	const g = geometry(canvas);
	const children: Prims = [
		{ kind: 'rect', x: 0, y: 0, w: g.rw, h: g.topScrim, fill: PAINT.topScrim },
		{ kind: 'rect', x: 0, y: g.bottomScrimY, w: g.rw, h: g.rh - g.bottomScrimY, fill: PAINT.bottomScrim },
		...header(dive, g),
		...stats(frame, g),
		...liveGraph(frame.graph, g.graph),
		...rail(dive, frame.distanceM, g.graph)
	];
	return scaled(children, g);
}

function cardHeadline(card: ResultCardModel, cx: number, y0: number): Prims {
	const out: Prims = [
		...logo(cx - 34, y0 - 20, 68),
		text(cx, y0 + 100, `${disciplineLabel(card.discipline).toUpperCase()} · ${card.discipline}`, 36, { anchor: 'middle', fill: COLOURS.muted, tracking: 4, shadow: false }),
		text(cx, y0 + 340, formatFinalDistance(card.finalM), 270, { weight: 700, anchor: 'middle', shadow: false }),
		text(cx, y0 + 420, 'METRES', 44, { anchor: 'middle', fill: COLOURS.textSoft, tracking: 10, shadow: false })
	];
	if (card.pb?.kind === 'new') {
		out.push({ kind: 'rect', x: cx - 190, y: y0 + 455, w: 380, h: 72, rx: 36, fill: COLOURS.gold });
		out.push(text(cx, y0 + 505, `NEW PB  +${formatFinalDistance(card.pb.deltaM)} m`, 44, { weight: 700, anchor: 'middle', fill: COLOURS.onGold, shadow: false, tracking: 1 }));
	} else if (card.pb) {
		out.push(text(cx, y0 + 505, `PB ${formatFinalDistance(card.pb.targetM)} m · −${formatFinalDistance(card.pb.deltaM)} m`, 40, { anchor: 'middle', fill: COLOURS.label, shadow: false, tracking: 1 }));
	}
	out.push(
		text(cx - 200, y0 + 625, formatHudTime(card.totalMs), 72, { weight: 700, anchor: 'middle', shadow: false }),
		text(cx - 200, y0 + 668, 'TIME', 28, { anchor: 'middle', fill: COLOURS.muted, tracking: 3, shadow: false }),
		text(cx + 200, y0 + 625, formatSpeed(card.avgSpeedMs), 72, { weight: 700, anchor: 'middle', shadow: false }),
		text(cx + 200, y0 + 668, 'AVG M/S', 28, { anchor: 'middle', fill: COLOURS.muted, tracking: 3, shadow: false })
	);
	return out;
}

/** Whole-dive graph with length bands, average speed above and split below (§4.8.4). */
function cardGraph(card: ResultCardModel, pbM: number | null, gx0: number, gx1: number, top: number, base: number): Prims {
	const domain = Math.max(card.finalM, 1);
	const toX = (d: number) => gx0 + (d / domain) * (gx1 - gx0);
	const y = yFor(card.scale, top, base);
	const out: Prims = [text(gx0, top - 74, 'SPEED · M/S PER LENGTH', 26, { fill: COLOURS.muted, tracking: 3, shadow: false })];
	for (const len of card.lengths) {
		const a = toX(len.startM);
		const b = toX(len.endM);
		if (len.n % 2 === 0) out.push({ kind: 'rect', x: a, y: top - 50, w: b - a, h: base - top + 50, fill: '#ffffff', opacity: 0.06 });
		out.push(text((a + b) / 2, top - 16, formatSpeed(len.avgSpeedMs), 30, { weight: 700, anchor: 'middle', fill: COLOURS.textSoft, shadow: false }));
		out.push(text((a + b) / 2, base + 44, `${(len.splitMs / 1000).toFixed(1)}s`, 36, { weight: 700, anchor: 'middle', shadow: false }));
		out.push(
			text((a + b) / 2, base + 80, len.partial ? `${Math.round(len.distanceM)} m` : `L${len.n}`, 26, { anchor: 'middle', fill: COLOURS.muted, shadow: false })
		);
	}
	out.push(...guideLines(card.scale, gx0, gx1, top, base, null));
	out.push(...speedLine(card.segments, toX, y, base, 5));
	if (pbM !== null && pbM > 0 && pbM < domain) out.push({ kind: 'rect', x: toX(pbM) - 3, y: top, w: 6, h: base - top, rx: 3, fill: COLOURS.gold });
	out.push({ kind: 'line', x1: gx0, y1: base, x2: gx1, y2: base, stroke: '#ffffff', strokeWidth: 2, opacity: 0.4 });
	return out;
}

/** Result card: dims the video and shows the dive summary. */
export function layoutResultCard(card: ResultCardModel, pbBeforeM: number | null, canvas: HudCanvas, opacity = 1): HudPrimitive[] {
	const g = geometry(canvas);
	const children: Prims = [{ kind: 'rect', x: 0, y: 0, w: g.rw, h: g.rh, fill: COLOURS.cardDim, opacity: 0.74 }];
	if (g.portrait) {
		const cx = g.rw / 2;
		const y0 = 300 + (g.rh - 1920) / 2;
		children.push(...cardHeadline(card, cx, y0));
		children.push(...cardGraph(card, pbBeforeM, 110, g.rw - 110, y0 + 790, y0 + 1000));
		if (card.footer) children.push(text(cx, y0 + 1130, card.footer, 32, { font: 'sans', weight: 500, anchor: 'middle', fill: COLOURS.label, shadow: false }));
	} else {
		// Two columns: headline left, graph right.
		const colW = (g.rw - 2 * g.left) / 2;
		const cx = g.left + colW / 2;
		const y0 = (g.rh - 700) / 2 + 20;
		children.push(...cardHeadline(card, cx, y0));
		const gx0 = g.left + colW + 60;
		const gx1 = g.rw - g.left;
		children.push(...cardGraph(card, pbBeforeM, gx0, gx1, y0 + 300, y0 + 540));
		if (card.footer) children.push(text((gx0 + gx1) / 2, y0 + 700, card.footer, 32, { font: 'sans', weight: 500, anchor: 'middle', fill: COLOURS.label, shadow: false }));
	}
	return [{ kind: 'group', opacity, children: scaled(children, g) }];
}
