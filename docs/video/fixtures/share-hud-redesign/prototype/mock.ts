// Prototype renderer for HUD redesign directions. Renders transparent overlay PNGs
// with resvg (same rasteriser as the server worker) using bundled Barlow fonts.
import { Resvg } from '../../../../../functions/node_modules/@resvg/resvg-js/index.js';
import { distanceAt, speedAt, diveElapsedAt } from '../../../../../src/lib/capture/timeline.ts';
import { timeline } from './timeline.ts';
import { writeFileSync } from 'node:fs';

const FONT_DIR = process.env.HUD_FONT_DIR ?? '/tmp/hud-audit/fonts';
const fontFiles = [
	'Barlow-Medium.ttf', 'Barlow-SemiBold.ttf', 'Barlow-Bold.ttf',
	'BarlowCondensed-Medium.ttf', 'BarlowCondensed-SemiBold.ttf', 'BarlowCondensed-Bold.ttf'
].map((f) => `${FONT_DIR}/${f}`);

export const POOL = 50;
export const PB_M = 175;
export const TL = timeline as any;
const W = 1080;
const H = 1920;
export const TEAL = '#2dd4bf';
export const GOLD = '#facc15';
export const COND = "Barlow Condensed";
export const SANS = "Barlow";

export function render(svg: string, out: string): void {
	const png = new Resvg(svg, {
		fitTo: { mode: 'original' },
		font: { loadSystemFonts: false, fontFiles, defaultFontFamily: SANS }
	}).render().asPng();
	writeFileSync(out, png);
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
export function fmtTime(ms: number, tenths = true): string {
	const s = Math.max(0, ms) / 1000;
	const m = Math.floor(s / 60);
	const sec = Math.floor(s % 60).toString().padStart(2, '0');
	const t = Math.floor((s * 10) % 10);
	return m > 0 ? `${m}:${sec}${tenths ? `.${t}` : ''}` : `${Math.floor(s)}${tenths ? `.${t}` : ''}`;
}

export interface State {
	elapsedMs: number; distM: number; speed: number; length: number;
	lastSplit?: { n: number; ms: number; deltaMs: number | null; sinceMs: number };
	pbPassedSinceMs: number | null; ended: boolean; endSinceMs: number;
	segs: { from: number; to: number; speed: number }[];
}

export function state(atMs: number): State {
	const elapsedMs = diveElapsedAt(TL, atMs);
	const distM = distanceAt(TL, atMs, POOL);
	const speed = speedAt(TL, atMs, POOL);
	const lapsDone = TL.laps.filter((l: any) => l.atMs <= atMs);
	const last = lapsDone[lapsDone.length - 1];
	const prev = lapsDone[lapsDone.length - 2];
	const lastSplit = last
		? { n: last.lapNumber, ms: last.splitMs, deltaMs: prev ? last.splitMs - prev.splitMs : null, sinceMs: atMs - last.atMs }
		: undefined;
	const events = [...TL.laps, ...TL.subSplits].filter((e: any) => e.atMs <= TL.diveEndMs).sort((a: any, b: any) => a.atMs - b.atMs);
	const segs: State['segs'] = [];
	let pt = TL.diveStartMs, pd = 0;
	for (const e of events) {
		if (e.atMs > atMs) {
			if (atMs > pt) segs.push({ from: pd, to: distM, speed: (e.cumulativeDistanceM - pd) / ((e.atMs - pt) / 1000) });
			break;
		}
		segs.push({ from: pd, to: e.cumulativeDistanceM, speed: (e.cumulativeDistanceM - pd) / ((e.atMs - pt) / 1000) });
		pt = e.atMs; pd = e.cumulativeDistanceM;
	}
	// approximate time PB was passed
	let pbAt: number | null = null;
	for (let t = TL.diveStartMs; t <= Math.min(atMs, TL.diveEndMs); t += 100) {
		if (distanceAt(TL, t, POOL) >= PB_M) { pbAt = t; break; }
	}
	return {
		elapsedMs, distM, speed, length: Math.min(Math.floor(distM / POOL) + 1, Math.ceil(distM / POOL) || 1),
		lastSplit, pbPassedSinceMs: pbAt === null ? null : atMs - pbAt,
		ended: atMs >= TL.diveEndMs, endSinceMs: atMs - TL.diveEndMs, segs
	};
}

export const shadow = `<filter id="ts" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="6" flood-color="#000" flood-opacity="0.55"/></filter>`;

export function text(x: number, y: number, s: string, size: number, opts: { family?: string; weight?: number; fill?: string; anchor?: string; ls?: number; op?: number; filter?: boolean } = {}): string {
	return `<text x="${x}" y="${y}" font-family="${opts.family ?? SANS}" font-size="${size}" font-weight="${opts.weight ?? 600}" fill="${opts.fill ?? '#fff'}" text-anchor="${opts.anchor ?? 'start'}" letter-spacing="${opts.ls ?? 0}" ${opts.op !== undefined ? `opacity="${opts.op}"` : ''} ${opts.filter === false ? '' : 'filter="url(#ts)"'}>${esc(s)}</text>`;
}

export function logo(x: number, y: number, size: number): string {
	// ring + wave mark approximating the app icon
	const r = size / 2;
	const cx = x + r, cy = y + r;
	const wave = `M ${cx - r * 0.5} ${cy + r * 0.05} q ${r * 0.18} ${-r * 0.6} ${r * 0.33} 0 t ${r * 0.33} 0 t ${r * 0.33} 0`;
	return `<circle cx="${cx}" cy="${cy}" r="${r * 0.82}" fill="none" stroke="url(#brand)" stroke-width="${r * 0.16}"/><path d="${wave}" fill="none" stroke="url(#brand)" stroke-width="${r * 0.16}" stroke-linecap="round"/>`;
}

export const defs = `<defs>${shadow}
<linearGradient id="brand" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#10b981"/><stop offset="1" stop-color="#2dd4bf"/></linearGradient>
<linearGradient id="topScrim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.62"/><stop offset="0.6" stop-color="#000" stop-opacity="0.25"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
<linearGradient id="botScrim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="0.35" stop-color="#000" stop-opacity="0.45"/><stop offset="1" stop-color="#000" stop-opacity="0.7"/></linearGradient>
<linearGradient id="fill" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#10b981"/><stop offset="1" stop-color="#5eead4"/></linearGradient>
<linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2dd4bf" stop-opacity="0.55"/><stop offset="1" stop-color="#2dd4bf" stop-opacity="0.04"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="#5eead4" stop-opacity="0.9"/><stop offset="1" stop-color="#5eead4" stop-opacity="0"/></radialGradient>
</defs>`;

export const FINAL_M = 190;
const DOMAIN_M = Math.max(PB_M, FINAL_M) * 1.08;

/** Progress rail + pace sparkline. */
export function rail(st: State, x: number, y: number, w: number, opts: { spark?: boolean } = {}): string {
	const toX = (d: number) => x + (Math.min(d, DOMAIN_M) / DOMAIN_M) * w;
	const parts: string[] = [];
	const trackH = 12;
	// sparkline above track: auto-scaled speed range
	if (opts.spark !== false && st.segs.length) {
		const sh = 110;
		const top = y - 34 - sh;
		const lo = 0.8, hi = 1.4;
		const toY = (v: number) => top + sh - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * sh;
		let d = `M ${toX(0)} ${top + sh}`;
		for (const s of st.segs) d += ` L ${toX(s.from)} ${toY(s.speed)} L ${toX(s.to)} ${toY(s.speed)}`;
		const lastX = toX(st.segs[st.segs.length - 1].to);
		parts.push(`<path d="${d} L ${lastX} ${top + sh} Z" fill="url(#area)"/>`);
		let l = '';
		st.segs.forEach((s, i) => { l += `${i === 0 ? 'M' : 'L'} ${toX(s.from)} ${toY(s.speed)} L ${toX(s.to)} ${toY(s.speed)} `; });
		parts.push(`<path d="${l}" fill="none" stroke="${TEAL}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`);
	}
	parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${trackH}" rx="${trackH / 2}" fill="#ffffff" fill-opacity="0.22"/>`);
	parts.push(`<rect x="${x}" y="${y}" width="${Math.max(trackH, toX(st.distM) - x)}" height="${trackH}" rx="${trackH / 2}" fill="url(#fill)"/>`);
	for (let d = POOL; d < DOMAIN_M; d += POOL) {
		parts.push(`<rect x="${toX(d) - 2}" y="${y - 10}" width="4" height="${trackH + 20}" rx="2" fill="#fff" fill-opacity="0.75"/>`);
		parts.push(text(toX(d), y + trackH + 50, `${d}`, 34, { family: COND, weight: 600, anchor: 'middle', fill: '#e2e8f0', op: 0.85 }));
	}
	// PB flag
	const pbX = toX(PB_M);
	const pbHit = st.distM >= PB_M;
	parts.push(`<rect x="${pbX - 3}" y="${y - 28}" width="6" height="${trackH + 38}" rx="3" fill="${GOLD}"/>`);
	parts.push(`<path d="M ${pbX + 3} ${y - 28} l 46 14 l -46 14 z" fill="${GOLD}"/>`);
	parts.push(text(pbX - 10, y - 40, pbHit ? 'PB' : `PB ${PB_M}`, 32, { family: COND, weight: 700, anchor: 'end', fill: GOLD }));
	// current dot
	const cx = toX(st.distM);
	parts.push(`<circle cx="${cx}" cy="${y + trackH / 2}" r="34" fill="url(#glow)"/><circle cx="${cx}" cy="${y + trackH / 2}" r="15" fill="#fff"/>`);
	return parts.join('\n');
}

export function splitToast(st: State, x: number, y: number): string {
	const s = st.lastSplit;
	if (!s || s.sinceMs > 3800 || st.ended) return '';
	const fadeIn = Math.min(1, s.sinceMs / 250);
	const fadeOut = Math.min(1, (3800 - s.sinceMs) / 400);
	const op = Math.min(fadeIn, fadeOut);
	const slide = (1 - fadeIn) * -40;
	const delta = s.deltaMs === null ? '' : `${s.deltaMs <= 0 ? '−' : '+'}${Math.abs(s.deltaMs / 1000).toFixed(1)}`;
	const dColor = s.deltaMs === null ? '#94a3b8' : s.deltaMs <= 0 ? '#34d399' : '#fbbf24';
	return `<g opacity="${op.toFixed(2)}" transform="translate(${slide} 0)">
<rect x="${x}" y="${y}" width="470" height="104" rx="22" fill="#0b1220" fill-opacity="0.78"/>
<rect x="${x}" y="${y}" width="10" height="104" rx="5" fill="${TEAL}"/>
${text(x + 34, y + 44, `LENGTH ${s.n}`, 30, { family: COND, weight: 600, fill: '#94a3b8', ls: 2, filter: false })}
${text(x + 34, y + 88, `${(s.ms / 1000).toFixed(1)} s`, 50, { family: COND, weight: 700, filter: false })}
${delta ? `<rect x="${x + 300}" y="${y + 30}" width="140" height="56" rx="28" fill="${dColor}" fill-opacity="0.18"/>${text(x + 370, y + 70, delta, 38, { family: COND, weight: 700, fill: dColor, anchor: 'middle', filter: false })}` : ''}
</g>`;
}

export function pbToast(st: State, x: number, y: number): string {
	if (st.pbPassedSinceMs === null || st.pbPassedSinceMs > 3000 || st.ended) return '';
	const op = Math.min(1, st.pbPassedSinceMs / 200, (3000 - st.pbPassedSinceMs) / 400);
	return `<g opacity="${op.toFixed(2)}"><rect x="${x}" y="${y}" width="470" height="104" rx="22" fill="${GOLD}"/>
${text(x + 235, y + 70, 'PAST YOUR PB', 52, { family: COND, weight: 700, fill: '#111827', anchor: 'middle', ls: 2, filter: false })}</g>`;
}

/** Direction B — "Broadcast", portrait 9:16 full-bleed. */
export function broadcastPortrait(atMs: number, graph?: (st: State, atMs: number) => string, card: (atMs: number) => string = endCard): string {
	const st = state(atMs);
	if (st.ended && st.endSinceMs > 600) return card(atMs);
	const L = 70;
	const beyond = st.distM - PB_M;
	const distColor = beyond >= 0 ? GOLD : '#fff';
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${defs}
<rect x="0" y="0" width="${W}" height="720" fill="url(#topScrim)"/>
<rect x="0" y="1060" width="${W}" height="860" fill="url(#botScrim)"/>
<rect x="${L}" y="252" width="96" height="50" rx="12" fill="${TEAL}"/>
${text(L + 48, 290, 'DYN', 36, { family: COND, weight: 700, fill: '#04201c', anchor: 'middle', filter: false, ls: 1 })}
${text(L + 116, 290, `${POOL} M POOL`, 34, { family: COND, weight: 600, fill: '#e2e8f0', ls: 2 })}
${logo(W - 70 - 52, 250, 52)}
${text(W - 70 - 66, 290, 'OVERDIVE', 34, { family: COND, weight: 700, anchor: 'end', ls: 3, op: 0.9 })}
${text(L, 372, 'TIME', 30, { family: COND, weight: 600, fill: '#cbd5e1', ls: 3 })}
${text(L, 500, fmtTime(st.elapsedMs), 140, { family: COND, weight: 700 })}
${text(W - L, 372, 'DISTANCE', 30, { family: COND, weight: 600, fill: '#cbd5e1', ls: 3, anchor: 'end' })}
${text(W - L - 70, 500, `${Math.floor(st.distM)}`, 140, { family: COND, weight: 700, anchor: 'end', fill: distColor })}
${text(W - L, 500, 'm', 64, { family: COND, weight: 600, anchor: 'end', fill: distColor })}
${text(L, 566, `${st.speed.toFixed(2)} m/s`, 44, { family: COND, weight: 600, fill: '#e2e8f0' })}
${beyond >= 0 ? `<rect x="${W - L - 196}" y="526" width="196" height="54" rx="27" fill="${GOLD}"/>${text(W - L - 98, 566, beyond < 1 ? 'AT PB' : `+${Math.floor(beyond)} m PB`, 38, { family: COND, weight: 700, anchor: 'middle', fill: '#111827', filter: false })}` : text(W - L, 566, `LENGTH ${st.length}`, 40, { family: COND, weight: 600, fill: '#e2e8f0', anchor: 'end', ls: 2 })}
${splitToast(st, L, 640)}
${pbToast(st, L, 640)}
${graph ? graph(st, atMs) : rail(st, L + 10, 1290, 900 - L - 10)}
</svg>`;
}

/** End card overlay: shown after the dive ends; also the poster/cover frame. */
export function endCard(atMs: number, w = W, h = H, yOff = 0): string {
	const segsAll = state(TL.diveEndMs).segs;
	const lengthSplits = TL.laps.map((l: any) => l.splitMs / 1000);
	const tail = (TL.diveEndMs - TL.laps[TL.laps.length - 1].atMs) / 1000;
	const total = TL.diveEndMs - TL.diveStartMs;
	const avg = FINAL_M / (total / 1000);
	const cx = w / 2;
	const y0 = 300 + yOff;
	const barsX = 140, barsW = w - 280, maxS = Math.max(...lengthSplits, tail);
	const all = [...lengthSplits.map((s: number, i: number) => ({ label: `${(i + 1) * POOL} m`, s, part: false })), { label: `${FINAL_M % POOL} m`, s: tail, part: true }];
	const bw = barsW / all.length;
	void segsAll; void atMs;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${defs}
<rect x="0" y="0" width="${w}" height="${h}" fill="#020617" fill-opacity="0.74"/>
${logo(cx - 34, y0 - 20, 68)}
${text(cx, y0 + 110, 'DYNAMIC WITH FINS · DYN', 36, { family: COND, weight: 600, anchor: 'middle', fill: '#94a3b8', ls: 4 })}
${text(cx, y0 + 380, `${FINAL_M}`, 300, { family: COND, weight: 700, anchor: 'middle' })}
${text(cx, y0 + 470, 'METRES', 46, { family: COND, weight: 600, anchor: 'middle', fill: '#e2e8f0', ls: 10 })}
<rect x="${cx - 190}" y="${y0 + 515}" width="380" height="76" rx="38" fill="${GOLD}"/>
${text(cx, y0 + 568, `NEW PB  +${FINAL_M - PB_M} m`, 46, { family: COND, weight: 700, anchor: 'middle', fill: '#111827', filter: false, ls: 1 })}
${text(cx - 200, y0 + 690, fmtTime(total), 76, { family: COND, weight: 700, anchor: 'middle' })}
${text(cx - 200, y0 + 735, 'TIME', 30, { family: COND, weight: 600, anchor: 'middle', fill: '#94a3b8', ls: 3 })}
${text(cx + 200, y0 + 690, `${avg.toFixed(2)}`, 76, { family: COND, weight: 700, anchor: 'middle' })}
${text(cx + 200, y0 + 735, 'AVG M/S', 30, { family: COND, weight: 600, anchor: 'middle', fill: '#94a3b8', ls: 3 })}
${all.map((b: any, i: number) => {
		const pace = b.part ? b.s * POOL / (FINAL_M % POOL) : b.s; const bh = 60 + ((pace - 38) / (maxS * 1.25 - 38)) * 120;
		const x = barsX + i * bw + 14;
		const by = y0 + 960 - bh;
		return `<rect x="${x}" y="${by}" width="${bw - 28}" height="${bh}" rx="10" fill="${b.part ? '#334155' : 'url(#fill)'}"/>${text(x + (bw - 28) / 2, by - 16, `${b.s.toFixed(1)}s`, 34, { family: COND, weight: 700, anchor: 'middle', filter: false })}${text(x + (bw - 28) / 2, y0 + 1000, b.label, 30, { family: COND, weight: 600, anchor: 'middle', fill: '#94a3b8', filter: false })}`;
	}).join('')}
${text(cx, y0 + 1080, 'Diver Name · 17 Oct 2026 · overdive.app', 34, { family: SANS, weight: 500, anchor: 'middle', fill: '#cbd5e1' })}
</svg>`;
}

/** Direction A — refined classic (same structure, fixed safe zones/typography). */
export function refinedPortrait(atMs: number): string {
	const st = state(atMs);
	const L = 60;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${defs}
<rect x="${L}" y="250" width="${W - 2 * L}" height="250" rx="28" fill="#0f172a" fill-opacity="0.6"/>
${text(L + 40, 312, 'TIME', 30, { family: COND, weight: 600, fill: '#cbd5e1', ls: 3, filter: false })}
${text(W - L - 40, 312, 'DISTANCE', 30, { family: COND, weight: 600, fill: '#cbd5e1', ls: 3, anchor: 'end', filter: false })}
${text(L + 40, 420, fmtTime(st.elapsedMs), 110, { family: COND, weight: 700, filter: false })}
${text(W - L - 40, 420, `${Math.floor(st.distM)} m`, 110, { family: COND, weight: 700, anchor: 'end', filter: false })}
${text(L + 40, 472, `Length ${st.length}`, 38, { family: SANS, weight: 500, fill: '#cbd5e1', filter: false })}
${text(W - L - 40, 472, `${st.speed.toFixed(2)} m/s`, 38, { family: SANS, weight: 500, fill: '#cbd5e1', anchor: 'end', filter: false })}
<rect x="${L}" y="1110" width="${W - 2 * L}" height="250" rx="28" fill="#0b1220" fill-opacity="0.72"/>
${rail(st, L + 50, 1280, 880 - L - 50)}
${text(W - 70, 1880, 'overdive.app', 30, { family: SANS, weight: 500, anchor: 'end', op: 0.7 })}
</svg>`;
}

/** Direction C — stacked story canvas for landscape sources (video band in the middle). */
export function stackedLandscape(atMs: number, videoY: number, videoH: number): string {
	const st = state(atMs);
	if (st.ended && st.endSinceMs > 600) return endCard(atMs);
	const L = 70;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${defs}
<rect x="${L}" y="252" width="96" height="50" rx="12" fill="${TEAL}"/>
${text(L + 48, 290, 'DYN', 36, { family: COND, weight: 700, fill: '#04201c', anchor: 'middle', filter: false })}
${text(L + 116, 290, `${POOL} M POOL · DIVER NAME`, 34, { family: COND, weight: 600, fill: '#e2e8f0', ls: 2, filter: false })}
${logo(W - 70 - 52, 250, 52)}
${text(L, 360, 'TIME', 30, { family: COND, weight: 600, fill: '#94a3b8', ls: 3, filter: false })}
${text(L, 500, fmtTime(st.elapsedMs), 150, { family: COND, weight: 700, filter: false })}
${text(W - L, 360, 'DISTANCE', 30, { family: COND, weight: 600, fill: '#94a3b8', ls: 3, anchor: 'end', filter: false })}
${text(W - L - 74, 500, `${Math.floor(st.distM)}`, 150, { family: COND, weight: 700, anchor: 'end', filter: false })}
${text(W - L, 500, 'm', 64, { family: COND, weight: 600, anchor: 'end', filter: false })}
${text(L, 566, `${st.speed.toFixed(2)} m/s`, 44, { family: COND, weight: 600, fill: '#e2e8f0', filter: false })}
${text(W - L, 566, `LENGTH ${st.length}`, 40, { family: COND, weight: 600, fill: '#e2e8f0', anchor: 'end', ls: 2, filter: false })}
${rail(st, L + 10, videoY - 80, W - 2 * L - 20)}
<rect x="0" y="${videoY - 4}" width="${W}" height="4" fill="url(#fill)"/>
${splitToast(st, L, videoY + videoH - 140)}
${pbToast(st, L, videoY + videoH - 140)}
</svg>`;
}

/** Instagram Reels UI approximation for safe-zone checks. */
export function igChrome(): string {
	const icons = [0, 1, 2, 3].map((i) => `<circle cx="1010" cy="${1240 + i * 130}" r="30" fill="none" stroke="#fff" stroke-width="6"/>`).join('');
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<rect x="0" y="0" width="${W}" height="${H}" fill="none"/>
<rect x="0" y="0" width="${W}" height="250" fill="#ff2d55" fill-opacity="0.16"/>
<rect x="0" y="1340" width="${W}" height="580" fill="#ff2d55" fill-opacity="0.16"/>
<rect x="940" y="1100" width="140" height="820" fill="#ff2d55" fill-opacity="0.16"/>
<text x="60" y="150" font-family="Barlow" font-weight="700" font-size="52" fill="#fff">Reels</text>
<rect x="940" y="110" width="60" height="50" rx="10" fill="none" stroke="#fff" stroke-width="6"/>
${icons}
<circle cx="90" cy="1620" r="42" fill="#cbd5e1"/>
<text x="150" y="1635" font-family="Barlow" font-weight="700" font-size="40" fill="#fff">username · Follow</text>
<text x="60" y="1720" font-family="Barlow" font-weight="500" font-size="38" fill="#fff">190 m DYN · new PB at the club pool…</text>
<text x="60" y="1800" font-family="Barlow" font-weight="500" font-size="34" fill="#fff" opacity="0.85">Original audio</text>
<rect x="0" y="1890" width="${W}" height="30" fill="#000" fill-opacity="0.5"/>
</svg>`;
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'still') {
	const [kind, at, out, vy, vh] = rest;
	const atMs = Number(at);
	const svg = kind === 'broadcast' ? broadcastPortrait(atMs)
		: kind === 'refined' ? refinedPortrait(atMs)
		: kind === 'stacked' ? stackedLandscape(atMs, Number(vy), Number(vh))
		: kind === 'end' ? endCard(atMs)
		: igChrome();
	render(svg, out);
} else if (cmd === 'seq') {
	const [kind, from, to, outDir, vy, vh] = rest;
	for (let t = Number(from), i = 0; t <= Number(to); t += 100, i++) {
		const svg = kind === 'broadcast' ? broadcastPortrait(t) : stackedLandscape(t, Number(vy), Number(vh));
		render(svg, `${outDir}/frame-${String(i).padStart(6, '0')}.png`);
	}
}
