/**
 * Share HUD primitives → SVG string. Used by the server renderer (resvg) and,
 * from phase 3, the in-app player.
 */

import { FONT_FAMILIES, type FontToken } from './tokens';

export type HudPrimitive =
	| { readonly kind: 'rect'; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly rx?: number; readonly fill: string; readonly opacity?: number }
	| {
			readonly kind: 'text';
			readonly x: number;
			readonly y: number;
			readonly text: string;
			readonly size: number;
			readonly font: FontToken;
			readonly weight: 500 | 600 | 700;
			readonly fill: string;
			readonly anchor?: 'start' | 'middle' | 'end';
			readonly tracking?: number;
			readonly opacity?: number;
			/** Drop shadow for legibility over video. */
			readonly shadow?: boolean;
	  }
	| {
			readonly kind: 'path';
			readonly d: string;
			readonly fill?: string;
			readonly stroke?: string;
			readonly strokeWidth?: number;
			readonly dash?: string;
			readonly opacity?: number;
			readonly round?: boolean;
	  }
	| { readonly kind: 'circle'; readonly cx: number; readonly cy: number; readonly r: number; readonly fill?: string; readonly stroke?: string; readonly strokeWidth?: number; readonly opacity?: number }
	| { readonly kind: 'line'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly stroke: string; readonly strokeWidth: number; readonly opacity?: number; readonly dash?: string }
	| { readonly kind: 'group'; readonly children: readonly HudPrimitive[]; readonly opacity?: number; readonly transform?: string };

const DEFS = `<defs>
<filter id="hud-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="6" flood-color="#000" flood-opacity="0.55"/></filter>
<linearGradient id="hud-brand" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#10b981"/><stop offset="1" stop-color="#2dd4bf"/></linearGradient>
<linearGradient id="hud-top-scrim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.62"/><stop offset="0.6" stop-color="#000" stop-opacity="0.25"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
<linearGradient id="hud-graph-ramp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="0.55" stop-color="#000" stop-opacity="0.34"/><stop offset="1" stop-color="#000" stop-opacity="0.6"/></linearGradient>
<linearGradient id="hud-graph-bed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.6"/><stop offset="1" stop-color="#000" stop-opacity="0.74"/></linearGradient>
<linearGradient id="hud-fill" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#10b981"/><stop offset="1" stop-color="#5eead4"/></linearGradient>
<linearGradient id="hud-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2dd4bf" stop-opacity="0.42"/><stop offset="1" stop-color="#2dd4bf" stop-opacity="0.04"/></linearGradient>
<radialGradient id="hud-glow"><stop offset="0" stop-color="#5eead4" stop-opacity="0.9"/><stop offset="1" stop-color="#5eead4" stop-opacity="0"/></radialGradient>
</defs>`;

function n(v: number): string {
	return Number.isInteger(v) ? `${v}` : v.toFixed(1);
}

export function escapeXml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function opacityAttr(opacity: number | undefined): string {
	return opacity === undefined || opacity >= 1 ? '' : ` opacity="${opacity.toFixed(2)}"`;
}

function primitive(p: HudPrimitive): string {
	switch (p.kind) {
		case 'rect':
			return `<rect x="${n(p.x)}" y="${n(p.y)}" width="${n(Math.max(0, p.w))}" height="${n(Math.max(0, p.h))}"${p.rx ? ` rx="${n(p.rx)}"` : ''} fill="${p.fill}"${opacityAttr(p.opacity)}/>`;
		case 'text':
			return `<text x="${n(p.x)}" y="${n(p.y)}" font-family="${FONT_FAMILIES[p.font]}" font-size="${n(p.size)}" font-weight="${p.weight}" fill="${p.fill}"${p.anchor && p.anchor !== 'start' ? ` text-anchor="${p.anchor}"` : ''}${p.tracking ? ` letter-spacing="${n(p.tracking)}"` : ''}${opacityAttr(p.opacity)}${p.shadow ? ' filter="url(#hud-shadow)"' : ''}>${escapeXml(p.text)}</text>`;
		case 'path':
			return `<path d="${p.d}" fill="${p.fill ?? 'none'}"${p.stroke ? ` stroke="${p.stroke}" stroke-width="${n(p.strokeWidth ?? 1)}" stroke-linejoin="round"` : ''}${p.round ? ' stroke-linecap="round"' : ''}${p.dash ? ` stroke-dasharray="${p.dash}"` : ''}${opacityAttr(p.opacity)}/>`;
		case 'circle':
			return `<circle cx="${n(p.cx)}" cy="${n(p.cy)}" r="${n(p.r)}" fill="${p.fill ?? 'none'}"${p.stroke ? ` stroke="${p.stroke}" stroke-width="${n(p.strokeWidth ?? 1)}"` : ''}${opacityAttr(p.opacity)}/>`;
		case 'line':
			return `<line x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}" stroke="${p.stroke}" stroke-width="${n(p.strokeWidth)}"${p.dash ? ` stroke-dasharray="${p.dash}"` : ''}${opacityAttr(p.opacity)}/>`;
		case 'group':
			if (p.children.length === 0 || p.opacity === 0) return '';
			return `<g${p.transform ? ` transform="${p.transform}"` : ''}${opacityAttr(p.opacity)}>${p.children.map(primitive).join('')}</g>`;
	}
}

export function renderSvg(primitives: readonly HudPrimitive[], width: number, height: number): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${DEFS}${primitives.map(primitive).join('')}</svg>`;
}
