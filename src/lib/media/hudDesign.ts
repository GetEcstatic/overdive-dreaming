export type HudRenderMode = 'portrait' | 'landscape';

export interface HudTextStyle {
	readonly family: string;
	readonly sizePx: number;
	readonly weight: number;
	readonly letterSpacingEm: number;
	readonly lineHeight: number;
	readonly color: string;
	readonly opacity: number;
}

export interface HudModeDesign {
	readonly offsetXPx: number;
	readonly offsetYPx: number;
	readonly maxWidthRatio?: number;
	readonly paddingXPx: number;
	readonly paddingYPx: number;
	readonly radiusPx: number;
	readonly rowGapPx: number;
	readonly subGapPx: number;
	readonly subMarginTopPx: number;
	readonly valueGapPx: number;
	readonly background: string;
	readonly foreground: string;
	readonly label: HudTextStyle;
	readonly value: HudTextStyle;
	readonly sub: HudTextStyle;
	readonly mono: HudTextStyle;
}

export interface HudDesign {
	readonly referenceWidthPx: number;
	readonly domWidthPx: number;
	readonly modes: Readonly<Record<HudRenderMode, HudModeDesign>>;
}

const SANS_FAMILY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const MONO_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const REFERENCE_WIDTH_PX = 1080;
const DOM_TARGET_WIDTH_PX = 390;
const REM_PX = 16;
const referenceScale = REFERENCE_WIDTH_PX / DOM_TARGET_WIDTH_PX;
const fromCssPx = (px: number) => px * referenceScale;
const fromRem = (rem: number) => fromCssPx(rem * REM_PX);

const labelText = (sizePx: number): HudTextStyle => ({
	family: SANS_FAMILY,
	sizePx,
	weight: 400,
	letterSpacingEm: 0.08,
	lineHeight: 1.2,
	color: '#cbd5e1',
	opacity: 1
});

const valueText = (sizePx: number): HudTextStyle => ({
	family: MONO_FAMILY,
	sizePx,
	weight: 400,
	letterSpacingEm: 0,
	lineHeight: 1.1,
	color: '#f1f5f9',
	opacity: 1
});

const subText = (sizePx: number): HudTextStyle => ({
	family: SANS_FAMILY,
	sizePx,
	weight: 400,
	letterSpacingEm: 0,
	lineHeight: 1.2,
	color: '#cbd5e1',
	opacity: 1
});

const monoSubText = (sizePx: number): HudTextStyle => ({
	family: MONO_FAMILY,
	sizePx,
	weight: 400,
	letterSpacingEm: 0,
	lineHeight: 1.2,
	color: '#cbd5e1',
	opacity: 1
});

export const HUD_DESIGN: HudDesign = {
	referenceWidthPx: REFERENCE_WIDTH_PX,
	domWidthPx: DOM_TARGET_WIDTH_PX,
	modes: {
		portrait: {
			offsetXPx: fromRem(0.75),
			offsetYPx: fromRem(0.75),
			paddingXPx: fromRem(1.05),
			paddingYPx: fromRem(0.75),
			radiusPx: fromCssPx(14),
			rowGapPx: fromRem(1.25),
			subGapPx: fromRem(1.25),
			subMarginTopPx: fromRem(0.4),
			valueGapPx: fromCssPx(0),
			background: 'rgba(15, 23, 42, 0.55)',
			foreground: '#f1f5f9',
			label: labelText(fromRem(0.7)),
			value: valueText(fromRem(1.9)),
			sub: subText(fromRem(0.85)),
			mono: monoSubText(fromRem(0.85))
		},
		landscape: {
			offsetXPx: fromRem(0.5),
			offsetYPx: fromRem(0.75),
			maxWidthRatio: 0.62,
			paddingXPx: fromRem(0.85),
			paddingYPx: fromRem(0.55),
			radiusPx: fromCssPx(14),
			rowGapPx: fromRem(1.25),
			subGapPx: fromRem(1.25),
			subMarginTopPx: fromRem(0.4),
			valueGapPx: fromCssPx(0),
			background: 'rgba(15, 23, 42, 0.55)',
			foreground: '#f1f5f9',
			label: labelText(fromRem(0.64)),
			value: valueText(fromRem(1.35)),
			sub: subText(fromRem(0.76)),
			mono: monoSubText(fromRem(0.76))
		}
	}
};

export function scaleHudModeDesign(widthPx: number, mode: HudRenderMode): HudModeDesign {
	const scale = widthPx / HUD_DESIGN.referenceWidthPx;
	const source = HUD_DESIGN.modes[mode];
	const scaleText = (text: HudTextStyle): HudTextStyle => ({
		...text,
		sizePx: text.sizePx * scale
	});

	return {
		...source,
		offsetXPx: source.offsetXPx * scale,
		offsetYPx: source.offsetYPx * scale,
		paddingXPx: source.paddingXPx * scale,
		paddingYPx: source.paddingYPx * scale,
		radiusPx: source.radiusPx * scale,
		rowGapPx: source.rowGapPx * scale,
		subGapPx: source.subGapPx * scale,
		subMarginTopPx: source.subMarginTopPx * scale,
		valueGapPx: source.valueGapPx * scale,
		label: scaleText(source.label),
		value: scaleText(source.value),
		sub: scaleText(source.sub),
		mono: scaleText(source.mono)
	};
}

export function hudCssVariables(mode: HudRenderMode): string {
	const hud = scaleHudModeDesign(HUD_DESIGN.domWidthPx, mode);
	return [
		`--hud-offset-x: ${hud.offsetXPx}px`,
		`--hud-offset-y: ${hud.offsetYPx}px`,
		`--hud-max-width: ${hud.maxWidthRatio ? `${hud.maxWidthRatio * 100}%` : 'none'}`,
		`--hud-padding-x: ${hud.paddingXPx}px`,
		`--hud-padding-y: ${hud.paddingYPx}px`,
		`--hud-radius: ${hud.radiusPx}px`,
		`--hud-row-gap: ${hud.rowGapPx}px`,
		`--hud-sub-gap: ${hud.subGapPx}px`,
		`--hud-sub-margin-top: ${hud.subMarginTopPx}px`,
		`--hud-bg: ${hud.background}`,
		`--hud-fg: ${hud.foreground}`,
		`--hud-label-family: ${hud.label.family}`,
		`--hud-label-size: ${hud.label.sizePx}px`,
		`--hud-label-weight: ${hud.label.weight}`,
		`--hud-label-letter-spacing: ${hud.label.letterSpacingEm}em`,
		`--hud-label-line-height: ${hud.label.lineHeight}`,
		`--hud-label-color: ${hud.label.color}`,
		`--hud-label-opacity: ${hud.label.opacity}`,
		`--hud-value-family: ${hud.value.family}`,
		`--hud-value-size: ${hud.value.sizePx}px`,
		`--hud-value-weight: ${hud.value.weight}`,
		`--hud-value-letter-spacing: ${hud.value.letterSpacingEm}em`,
		`--hud-value-line-height: ${hud.value.lineHeight}`,
		`--hud-value-color: ${hud.value.color}`,
		`--hud-value-opacity: ${hud.value.opacity}`,
		`--hud-sub-family: ${hud.sub.family}`,
		`--hud-sub-size: ${hud.sub.sizePx}px`,
		`--hud-sub-weight: ${hud.sub.weight}`,
		`--hud-sub-letter-spacing: ${hud.sub.letterSpacingEm}em`,
		`--hud-sub-line-height: ${hud.sub.lineHeight}`,
		`--hud-sub-color: ${hud.sub.color}`,
		`--hud-sub-opacity: ${hud.sub.opacity}`,
		`--hud-mono-family: ${hud.mono.family}`
	].join('; ');
}

export function canvasFont(style: HudTextStyle): string {
	return `${style.weight} ${style.sizePx}px ${style.family}`;
}

export function hudFontLoadDescriptors(widthPx: number, mode: HudRenderMode): string[] {
	const hud = scaleHudModeDesign(widthPx, mode);
	return [hud.label, hud.value, hud.sub, hud.mono].map(canvasFont);
}