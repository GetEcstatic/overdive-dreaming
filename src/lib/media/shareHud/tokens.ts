/**
 * Share HUD design tokens (plan §4.5). Sizes are at the 1080-px reference
 * short edge; layouts scale them to the canvas.
 */

export const COLOURS = {
	text: '#ffffff',
	textSoft: '#e2e8f0',
	label: '#cbd5e1',
	muted: '#94a3b8',
	teal: '#2dd4bf',
	green: '#10b981',
	gold: '#facc15',
	onGold: '#111827',
	onTeal: '#04201c',
	faster: '#34d399',
	slower: '#fb7185',
	fasterOnGraph: '#6ee7b7',
	slowerOnGraph: '#fda4af',
	slowerSplit: '#fbbf24',
	panel: '#0b1220',
	cardDim: '#020617'
} as const;

export const FONT_FAMILIES = {
	cond: 'Barlow Condensed',
	sans: 'Barlow'
} as const;

export type FontToken = keyof typeof FONT_FAMILIES;

/** Gradient / filter ids defined by `svg.ts`. */
export const PAINT = {
	brand: 'url(#hud-brand)',
	topScrim: 'url(#hud-top-scrim)',
	graphRamp: 'url(#hud-graph-ramp)',
	graphBed: 'url(#hud-graph-bed)',
	fill: 'url(#hud-fill)',
	area: 'url(#hud-area)',
	glow: 'url(#hud-glow)'
} as const;

export const REFERENCE_SHORT_EDGE_PX = 1080;
