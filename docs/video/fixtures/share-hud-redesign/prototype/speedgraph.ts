// Speed graph exploration for the share HUD (plan §4.8). Throwaway prototype:
// same resvg pipeline and Barlow fonts as mock.ts, same hard-coded timeline.
//
//   npx tsx speedgraph.ts still <variant> <atMs> <out.png>
//   npx tsx speedgraph.ts seq <variant> <fromMs> <toMs> <outDir>
//   npx tsx speedgraph.ts card <full|stacked> <out.png>
//
// Variants: spark (today's B sparkline), full (annotated full dive),
// lane (50 m per length, reverses each length; lane-rtl starts right→left), reset (50 m per length, always left→right).
import {
	broadcastPortrait, render, text, logo, defs, fmtTime, state, esc,
	TL, POOL, PB_M, FINAL_M, TEAL, GOLD, COND, SANS, type State
} from './mock.ts';

const W = 1080;
const H = 1920;
const X0 = 124;
const X1 = 900;
const GW = X1 - X0;
const G_TOP = 1110;
const G_BASE = 1268;
const FASTER = '#34d399';
const SLOWER = '#fb7185';
const HOLD_MS = 500; // completed length stays on screen after the wall touch
const FLIP_MS = 600; // then flips/fades into the ghost

interface Seg { from: number; to: number; speed: number; startMs: number; endMs: number }

/** Whole-dive waypoint segments (walls + mid-pool splits). */
function allSegs(): Seg[] {
	const events = [...TL.laps, ...TL.subSplits]
		.filter((e: any) => e.atMs <= TL.diveEndMs)
		.sort((a: any, b: any) => a.atMs - b.atMs);
	const out: Seg[] = [];
	let pt = TL.diveStartMs, pd = 0;
	for (const e of events) {
		out.push({ from: pd, to: e.cumulativeDistanceM, speed: (e.cumulativeDistanceM - pd) / ((e.atMs - pt) / 1000), startMs: pt, endMs: e.atMs });
		pt = e.atMs; pd = e.cumulativeDistanceM;
	}
	return out;
}
const SEGS = allSegs();

/** Dive-wide y scale, fixed for the whole video so every length is comparable. */
const LO = Math.floor((Math.min(...SEGS.map((s) => s.speed)) - 0.05) * 10) / 10;
const HI = Math.ceil((Math.max(...SEGS.map((s) => s.speed)) + 0.05) * 10) / 10;
const toY = (v: number, top = G_TOP, base = G_BASE) => base - ((Math.max(LO, Math.min(HI, v)) - LO) / (HI - LO)) * (base - top);

/** Segments revealed up to `distM`, the last one truncated at the current position. */
function revealed(distM: number): Seg[] {
	const out: Seg[] = [];
	for (const s of SEGS) {
		if (s.from >= distM) break;
		out.push(s.to <= distM ? s : { ...s, to: distM });
	}
	return out;
}

/** Segments that fall inside length n (1-based), clipped to it. */
function lengthSegs(segs: Seg[], n: number): Seg[] {
	const a = (n - 1) * POOL, b = n * POOL;
	return segs.filter((s) => s.to > a && s.from < b).map((s) => ({ ...s, from: Math.max(a, s.from), to: Math.min(b, s.to) }));
}

function steppedPath(segs: Seg[], toX: (d: number) => number, y: (v: number) => number): string {
	return segs.map((s, i) => `${i === 0 ? 'M' : 'L'} ${toX(s.from).toFixed(1)} ${y(s.speed).toFixed(1)} L ${toX(s.to).toFixed(1)} ${y(s.speed).toFixed(1)}`).join(' ');
}

function area(segs: Seg[], toX: (d: number) => number, base = G_BASE, y: (v: number) => number = (v) => toY(v)): string {
	if (!segs.length) return '';
	return `<path d="M ${toX(segs[0].from)} ${base} ${steppedPath(segs, toX, y).replace(/^M/, 'L')} L ${toX(segs[segs.length - 1].to)} ${base} Z" fill="url(#area)"/>`;
}

function guides(x0: number, x1: number, top = G_TOP, base = G_BASE, labelSide: 'left' | 'none' = 'left'): string {
	const ticks: number[] = [];
	for (let v = Math.ceil(LO * 10) / 10; v <= HI + 1e-9; v += 0.1) ticks.push(Math.round(v * 10) / 10);
	const pick = ticks.filter((_, i) => i % 2 === (ticks.length > 3 ? 1 : 0));
	return pick.map((v) => {
		const y = toY(v, top, base);
		return `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="#fff" stroke-opacity="0.16" stroke-width="2" stroke-dasharray="6 10"/>` +
			(labelSide === 'left' ? text(X0 - 14, y + 9, v.toFixed(1), 26, { family: COND, weight: 600, fill: '#cbd5e1', anchor: 'end', op: 0.8 }) : '');
	}).join('');
}

function cursorTag(x: number, y: number, speed: number, anchorRight: boolean): string {
	const label = `${speed.toFixed(2)} m/s`;
	const w = 150, h = 46;
	const bx = Math.max(X0, Math.min(X1 - w, anchorRight ? x - w + 20 : x - 20));
	const by = Math.max(G_TOP - 70, y - h - 30);
	return `<circle cx="${x}" cy="${y}" r="26" fill="url(#glow)"/><circle cx="${x}" cy="${y}" r="11" fill="#fff"/>
<rect x="${bx}" y="${by}" width="${w}" height="${h}" rx="23" fill="#fff"/>
${text(bx + w / 2, by + 34, label, 32, { family: COND, weight: 700, fill: '#0b1220', anchor: 'middle', filter: false })}`;
}

/** Thin whole-dive progress rail with PB flag (kept under the per-length graph). */
function miniRail(st: State, y = 1316): string {
	const dom = Math.max(PB_M, FINAL_M) * 1.08;
	const toX = (d: number) => X0 + (Math.min(d, dom) / dom) * GW;
	const parts = [`<rect x="${X0}" y="${y}" width="${GW}" height="8" rx="4" fill="#fff" fill-opacity="0.22"/>`,
		`<rect x="${X0}" y="${y}" width="${Math.max(8, toX(st.distM) - X0)}" height="8" rx="4" fill="url(#fill)"/>`];
	for (let d = POOL; d < dom; d += POOL) parts.push(`<rect x="${toX(d) - 1.5}" y="${y - 6}" width="3" height="20" fill="#fff" fill-opacity="0.6"/>`);
	parts.push(`<rect x="${toX(PB_M) - 3}" y="${y - 14}" width="6" height="36" rx="3" fill="${GOLD}"/>`);
	parts.push(`<circle cx="${toX(st.distM)}" cy="${y + 4}" r="9" fill="#fff"/>`);
	return parts.join('');
}

// ---------- V0: today's direction-B sparkline (baseline, from mock.ts) ----------

// ---------- V1: full dive, annotated ----------
function fullGraph(st: State): string {
	const dom = Math.max(PB_M, FINAL_M) * 1.08;
	const toX = (d: number) => X0 + (Math.min(d, dom) / dom) * GW;
	const segs = revealed(st.distM);
	const parts: string[] = [guides(X0, X1)];
	const lengthsDone = Math.floor(st.distM / POOL);
	for (let n = 1; n * POOL - POOL < dom; n++) {
		const a = toX((n - 1) * POOL), b = toX(Math.min(n * POOL, dom));
		if (n % 2 === 0) parts.push(`<rect x="${a}" y="${G_TOP - 40}" width="${b - a}" height="${G_BASE - G_TOP + 40}" fill="#fff" fill-opacity="0.05"/>`);
		if (n <= lengthsDone) {
			const ls = lengthSegs(SEGS, n);
			const avg = POOL / ls.reduce((t, s) => t + (s.to - s.from) / s.speed, 0);
			parts.push(text((a + b) / 2, G_TOP - 12, avg.toFixed(2), 32, { family: COND, weight: 700, anchor: 'middle', fill: '#e2e8f0' }));
		}
	}
	parts.push(area(segs, toX));
	parts.push(`<path d="${steppedPath(segs, toX, (v) => toY(v))}" fill="none" stroke="${TEAL}" stroke-width="5" stroke-linejoin="round"/>`);
	parts.push(`<rect x="${toX(PB_M) - 3}" y="${G_TOP - 40}" width="6" height="${G_BASE - G_TOP + 70}" rx="3" fill="${GOLD}"/>`);
	parts.push(text(toX(PB_M) - 10, G_BASE + 26, 'PB', 28, { family: COND, weight: 700, anchor: 'end', fill: GOLD }));
	for (let d = POOL; d < dom; d += POOL) parts.push(text(toX(d), G_BASE + 30, `${d}`, 26, { family: COND, weight: 600, anchor: 'middle', fill: '#cbd5e1', op: 0.8 }));
	parts.push(`<line x1="${X0}" y1="${G_BASE}" x2="${X1}" y2="${G_BASE}" stroke="#fff" stroke-opacity="0.35" stroke-width="2"/>`);
	parts.push(cursorTag(toX(st.distM), toY(st.speed), st.speed, toX(st.distM) > X1 - 160));
	return parts.join('\n');
}

// ---------- V2/V3: one 50 m length per screen ----------
function lengthGraph(st: State, atMs: number, reverse: boolean, firstRtl = false): string {
	let n = Math.min(Math.floor(st.distM / POOL) + 1, Math.ceil(FINAL_M / POOL));
	// hold the length just finished on screen for a beat after the wall touch
	if (n > 1 && atMs - TL.laps[n - 2].atMs < HOLD_MS) {
		n -= 1;
		st = { ...st, distM: n * POOL, speed: lengthSegs(SEGS, n).at(-1)!.speed };
	}
	const startM = (n - 1) * POOL;
	// length 1 runs in the direction the diver swims on screen; later lengths alternate
	const rtlFor = (k: number) => reverse ? (k % 2 === 1) === firstRtl : false;
	const rtl = rtlFor(n);
	// position along the screen for distance-into-length
	const xIn = (rtlLen: boolean, lenStartM: number) => (d: number) => {
		const f = (d - lenStartM) / POOL;
		return rtlLen ? X1 - f * GW : X0 + f * GW;
	};
	const toX = (d: number) => { const f = (d - startM) / POOL; return rtl ? X1 - f * GW : X0 + f * GW; };
	const segs = lengthSegs(revealed(st.distM), n);
	const holding = segs.length > 0 && st.distM === n * POOL;
	const prev = n > 1 ? lengthSegs(SEGS, n - 1) : [];
	const parts: string[] = [];

	// header: length + absolute distances with direction chevrons
	const from = `${startM}`, to = `${Math.min(n * POOL, Math.ceil(FINAL_M / POOL) * POOL)}`;
	const hy = G_TOP - 58;
	parts.push(text(X0, hy, `LENGTH ${n}`, 32, { family: COND, weight: 700, ls: 2 }));
	// wall distances sit above the wall they belong to
	parts.push(text(rtl ? X1 : X0 + 160, hy, `${from} m`, 28, { family: COND, weight: 600, anchor: rtl ? 'end' : 'start', fill: '#cbd5e1' }));
	parts.push(text(rtl ? X0 + 160 : X1, hy, `${to} m`, 28, { family: COND, weight: 600, anchor: rtl ? 'start' : 'end', fill: '#cbd5e1' }));
	// chevrons pointing in the swim direction
	const dir = rtl ? -1 : 1;
	for (let i = 0; i < 3; i++) {
		const x = (X0 + 160 + X1) / 2 + (i - 1) * 26 * dir;
		parts.push(`<path d="M ${x - 6 * dir} ${hy - 22} L ${x + 6 * dir} ${hy - 11} L ${x - 6 * dir} ${hy}" fill="none" stroke="#fff" stroke-opacity="${0.35 + i * 0.3}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`);
	}

	// walls
	for (const x of [X0, X1]) parts.push(`<rect x="${x - 3}" y="${G_TOP - 30}" width="6" height="${G_BASE - G_TOP + 30}" rx="3" fill="#fff" fill-opacity="0.5"/>`);
	// waypoint ticks
	for (let d = 12.5; d < POOL; d += 12.5) { const x = X0 + (d / POOL) * GW; parts.push(`<line x1="${x}" y1="${G_TOP - 10}" x2="${x}" y2="${G_BASE}" stroke="#fff" stroke-opacity="0.08" stroke-width="2"/>`); }
	parts.push(guides(X0 + 8, X1 - 8));
	parts.push(`<line x1="${X0}" y1="${G_BASE}" x2="${X1}" y2="${G_BASE}" stroke="#fff" stroke-opacity="0.35" stroke-width="2"/>`);

	// ghost of the previous length, aligned by distance from its wall
	const sinceWall = n > 1 ? atMs - TL.laps[n - 2].atMs - HOLD_MS : Infinity;
	if (prev.length) {
		const prevRtl = rtlFor(n - 1);
		const p = Math.min(1, Math.max(0, sinceWall / FLIP_MS));
		const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
		// drawn where it was swum, then flipped (reverse) or faded (reset) into the ghost position
		const ghostPath = steppedPath(prev, xIn(prevRtl, startM - POOL), (v) => toY(v));
		const sx = reverse ? 1 - 2 * e : 1;
		const cx = (X0 + X1) / 2;
		const op = 1 - 0.62 * e;
		parts.push(`<g transform="translate(${cx} 0) scale(${sx.toFixed(3)} 1) translate(${-cx} 0)" opacity="${op.toFixed(2)}">
<path d="${ghostPath}" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="${e > 0.5 ? '10 10' : 'none'}" stroke-linejoin="round"/></g>`);
		if (e >= 1 && !holding) {
			const endX = rtl ? X0 + 14 : X1 - 14;
			parts.push(text(endX, toY(prev[prev.length - 1].speed) - 12, `L${n - 1}`, 26, { family: COND, weight: 700, fill: '#e2e8f0', anchor: rtl ? 'start' : 'end', op: 0.8 }));
		}
	}

	// PB post when the PB falls inside this length
	if (PB_M > startM && PB_M < n * POOL) {
		const x = toX(PB_M);
		const hit = st.distM >= PB_M;
		parts.push(`<rect x="${x - 3}" y="${G_TOP - 30}" width="6" height="${G_BASE - G_TOP + 30}" rx="3" fill="${GOLD}"/>`);
		parts.push(text(x + (rtl ? -12 : 12), G_TOP - 8, hit ? 'PB' : `PB ${PB_M}`, 28, { family: COND, weight: 700, fill: GOLD, anchor: rtl ? 'end' : 'start' }));
	}

	// current length
	parts.push(area(segs, toX));
	parts.push(`<path d="${steppedPath(segs, toX, (v) => toY(v))}" fill="none" stroke="${TEAL}" stroke-width="6" stroke-linejoin="round"/>`);
	// value labels for completed waypoint segments, with the delta vs the same segment of the previous length
	const done = segs.filter((s) => s.to - s.from > 12.4);
	for (const s of done) {
		if (!holding && s.to >= st.distM - 0.01 && s === segs[segs.length - 1]) continue;
		const k = Math.round((s.from - startM) / 12.5);
		const ref = prev[k];
		const mid = (toX(s.from) + toX(s.to)) / 2;
		parts.push(text(mid, toY(s.speed) - 14, s.speed.toFixed(2), 34, { family: COND, weight: 700, anchor: 'middle' }));
		if (ref) {
			const d = s.speed - ref.speed;
			const label = Math.abs(d) < 0.005 ? '=' : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(2)}`;
			parts.push(text(mid, toY(s.speed) + 36, label, 28, { family: COND, weight: 700, anchor: 'middle', fill: d > 0.005 ? FASTER : d < -0.005 ? SLOWER : '#cbd5e1' }));
		}
	}
	const cx = toX(st.distM);
	// while holding at the wall the split toast carries the news; just mark the wall
	parts.push(holding ? `<circle cx="${cx}" cy="${toY(st.speed)}" r="11" fill="#fff"/>` : cursorTag(cx, toY(st.speed), st.speed, rtl));
	parts.push(miniRail(st));
	return parts.join('\n');
}

const variants: Record<string, ((st: State, atMs: number) => string) | undefined> = {
	spark: undefined,
	full: (st) => fullGraph(st),
	lane: (st, at) => lengthGraph(st, at, true),
	'lane-rtl': (st, at) => lengthGraph(st, at, true, true),
	reset: (st, at) => lengthGraph(st, at, false)
};

// ---------- result card with the full graph ----------
function cardHead(y0: number, cx: number): string {
	const total = TL.diveEndMs - TL.diveStartMs;
	return `${logo(cx - 34, y0 - 20, 68)}
${text(cx, y0 + 100, 'DYNAMIC WITH FINS · DYN', 36, { family: COND, weight: 600, anchor: 'middle', fill: '#94a3b8', ls: 4 })}
${text(cx, y0 + 340, `${FINAL_M}`, 270, { family: COND, weight: 700, anchor: 'middle' })}
${text(cx, y0 + 420, 'METRES', 44, { family: COND, weight: 600, anchor: 'middle', fill: '#e2e8f0', ls: 10 })}
<rect x="${cx - 190}" y="${y0 + 455}" width="380" height="72" rx="36" fill="${GOLD}"/>
${text(cx, y0 + 505, `NEW PB  +${FINAL_M - PB_M} m`, 44, { family: COND, weight: 700, anchor: 'middle', fill: '#111827', filter: false, ls: 1 })}
${text(cx - 200, y0 + 625, fmtTime(total), 72, { family: COND, weight: 700, anchor: 'middle' })}
${text(cx - 200, y0 + 668, 'TIME', 28, { family: COND, weight: 600, anchor: 'middle', fill: '#94a3b8', ls: 3 })}
${text(cx + 200, y0 + 625, (FINAL_M / (total / 1000)).toFixed(2), 72, { family: COND, weight: 700, anchor: 'middle' })}
${text(cx + 200, y0 + 668, 'AVG M/S', 28, { family: COND, weight: 600, anchor: 'middle', fill: '#94a3b8', ls: 3 })}`;
}

function lengthStats(n: number) {
	const ls = lengthSegs(SEGS, n);
	const dist = ls.reduce((t, s) => t + s.to - s.from, 0);
	const secs = ls.reduce((t, s) => t + (s.to - s.from) / s.speed, 0);
	return { ls, dist, secs, avg: dist / secs };
}

function cardFull(): string {
	const cx = W / 2, y0 = 300;
	const top = y0 + 790, base = y0 + 1000;
	const dom = FINAL_M;
	const gx0 = 110, gx1 = W - 110;
	const toX = (d: number) => gx0 + (d / dom) * (gx1 - gx0);
	const y = (v: number) => toY(v, top, base);
	const nLen = Math.ceil(FINAL_M / POOL);
	const parts: string[] = [];
	for (let n = 1; n <= nLen; n++) {
		const { secs, avg, dist } = lengthStats(n);
		const a = toX((n - 1) * POOL), b = toX(Math.min(n * POOL, dom));
		if (n % 2 === 0) parts.push(`<rect x="${a}" y="${top - 50}" width="${b - a}" height="${base - top + 50}" fill="#fff" fill-opacity="0.06"/>`);
		parts.push(text((a + b) / 2, top - 16, avg.toFixed(2), 30, { family: COND, weight: 700, anchor: 'middle', fill: '#e2e8f0', filter: false }));
		parts.push(text((a + b) / 2, base + 44, `${secs.toFixed(1)}s`, 36, { family: COND, weight: 700, anchor: 'middle', filter: false }));
		parts.push(text((a + b) / 2, base + 80, dist < POOL ? `${Math.round(dist)} m` : `L${n}`, 26, { family: COND, weight: 600, anchor: 'middle', fill: '#94a3b8', filter: false }));
	}
	parts.push(guides(gx0, gx1, top, base, 'none'));
	parts.push(area(SEGS, toX, base, y));
	parts.push(`<path d="${steppedPath(SEGS, toX, y)}" fill="none" stroke="${TEAL}" stroke-width="5" stroke-linejoin="round"/>`);
	parts.push(`<rect x="${toX(PB_M) - 3}" y="${top}" width="6" height="${base - top}" rx="3" fill="${GOLD}"/>`);
	parts.push(`<line x1="${gx0}" y1="${base}" x2="${gx1}" y2="${base}" stroke="#fff" stroke-opacity="0.4" stroke-width="2"/>`);
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${defs}
<rect x="0" y="0" width="${W}" height="${H}" fill="#020617" fill-opacity="0.74"/>
${cardHead(y0, cx)}
${text(gx0, top - 74, 'SPEED · M/S PER LENGTH', 26, { family: COND, weight: 600, fill: '#94a3b8', ls: 3, filter: false })}
${parts.join('\n')}
${text(cx, y0 + 1130, 'Diver Name · 17 Oct 2026 · overdive.app', 32, { family: SANS, weight: 500, anchor: 'middle', fill: '#cbd5e1' })}
</svg>`;
}

function cardStacked(): string {
	const cx = W / 2, y0 = 300;
	const nLen = Math.ceil(FINAL_M / POOL);
	const gx0 = 190, gx1 = W - 230;
	const rowH = 78, gap = 14, top0 = y0 + 770;
	const parts: string[] = [];
	for (let n = 1; n <= nLen; n++) {
		const { ls, secs, dist } = lengthStats(n);
		const top = top0 + (n - 1) * (rowH + gap), base = top + rowH;
		const startM = (n - 1) * POOL;
		const toX = (d: number) => gx0 + ((d - startM) / POOL) * (gx1 - gx0);
		const y = (v: number) => toY(v, top + 8, base);
		parts.push(`<rect x="${gx0}" y="${top}" width="${gx1 - gx0}" height="${rowH}" rx="10" fill="#fff" fill-opacity="0.05"/>`);
		parts.push(text(gx0 - 24, top + rowH / 2 + 12, `L${n}`, 34, { family: COND, weight: 700, anchor: 'end', fill: '#94a3b8', filter: false }));
		parts.push(area(ls, toX, base, y));
		parts.push(`<path d="${steppedPath(ls, toX, y)}" fill="none" stroke="${TEAL}" stroke-width="4" stroke-linejoin="round"/>`);
		if (PB_M > startM && PB_M < n * POOL) parts.push(`<rect x="${toX(PB_M) - 3}" y="${top - 4}" width="6" height="${rowH + 8}" rx="3" fill="${GOLD}"/>`);
		parts.push(text(gx1 + 24, top + rowH / 2 + 14, `${secs.toFixed(1)}s`, 40, { family: COND, weight: 700, filter: false }));
		if (dist < POOL) parts.push(text(gx1 + 130, top + rowH / 2 + 12, `${Math.round(dist)} m`, 26, { family: COND, weight: 600, fill: '#94a3b8', filter: false }));
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${defs}
<rect x="0" y="0" width="${W}" height="${H}" fill="#020617" fill-opacity="0.74"/>
${cardHead(y0, cx)}
${text(gx0, top0 - 22, 'EACH LENGTH · WALL TO WALL', 26, { family: COND, weight: 600, fill: '#94a3b8', ls: 3, filter: false })}
${parts.join('\n')}
${text(cx, y0 + 1190, 'Diver Name · 17 Oct 2026 · overdive.app', 32, { family: SANS, weight: 500, anchor: 'middle', fill: '#cbd5e1' })}
</svg>`;
}

const [cmd, ...rest] = process.argv.slice(2);
const cards: Record<string, () => string> = { full: cardFull, stacked: cardStacked };
if (cmd === 'still') {
	const [v, at, out] = rest;
	render(broadcastPortrait(Number(at), variants[v], () => cardFull()), out);
} else if (cmd === 'seq') {
	const [v, from, to, outDir] = rest;
	for (let t = Number(from), i = 0; t <= Number(to); t += 100, i++) {
		render(broadcastPortrait(t, variants[v], () => cardFull()), `${outDir}/frame-${String(i).padStart(6, '0')}.png`);
	}
} else if (cmd === 'card') {
	render(cards[rest[0]](), rest[1]);
}
void esc; void state;
