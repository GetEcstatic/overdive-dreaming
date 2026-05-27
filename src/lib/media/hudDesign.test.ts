import { describe, expect, it } from 'vitest';
import { HUD_DESIGN, scaleHudModeDesign } from './hudDesign';

describe('HUD_DESIGN', () => {
	it('scales portrait dimensions from the reference width', () => {
		const reference = scaleHudModeDesign(HUD_DESIGN.referenceWidthPx, 'portrait');
		const half = scaleHudModeDesign(HUD_DESIGN.referenceWidthPx / 2, 'portrait');

		expect(half.paddingXPx).toBeCloseTo(reference.paddingXPx / 2);
		expect(half.radiusPx).toBeCloseTo(reference.radiusPx / 2);
		expect(half.value.sizePx).toBeCloseTo(reference.value.sizePx / 2);
	});

	it('keeps landscape width capped by design data', () => {
		const landscape = scaleHudModeDesign(1920, 'landscape');

		expect(landscape.maxWidthRatio).toBe(0.62);
		expect(landscape.label.sizePx).toBeGreaterThan(0);
		expect(landscape.value.family).toContain('ui-monospace');
	});

	it('scales cleanly across common export widths', () => {
		const widths = [720, 1080, 3840];
		const values = widths.map((width) => scaleHudModeDesign(width, 'portrait').value.sizePx);

		expect(values[1] / values[0]).toBeCloseTo(1080 / 720);
		expect(values[2] / values[1]).toBeCloseTo(3840 / 1080);
	});
});