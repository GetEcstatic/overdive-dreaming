import type { MetricHudFrame, MetricHudTextRun } from './metricHudFrame';

function escapeXmlText(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function textAnchor(run: MetricHudTextRun): 'start' | 'end' {
	return run.align === 'right' ? 'end' : 'start';
}

function textStyleAttributes(run: MetricHudTextRun): string {
	return [
		`font-family="${escapeXmlText(run.style.family)}"`,
		`font-size="${run.style.sizePx}"`,
		`font-weight="${run.style.weight}"`,
		`letter-spacing="${run.style.letterSpacingEm}em"`,
		'font-variant-numeric="tabular-nums"',
		`fill="${run.style.color}"`,
		`opacity="${run.style.opacity}"`
	].join(' ');
}

export function metricHudFrameSvgMarkup(frame: MetricHudFrame): string {
	return `<rect x="${frame.box.x}" y="${frame.box.y}" width="${frame.box.width}" height="${frame.box.height}" rx="${frame.box.radius}" fill="${frame.background}"/>\n${frame.textRuns
		.map(
			(run) =>
				`<text x="${run.x}" y="${run.y}" text-anchor="${textAnchor(run)}" dominant-baseline="text-before-edge" ${textStyleAttributes(run)}>${escapeXmlText(run.text)}</text>`
		)
		.join('\n')}`;
}

export function metricHudFrameSvgDocument(frame: MetricHudFrame): string {
	const viewHeight = frame.box.y + frame.box.height;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.widthPx}" height="${viewHeight}" viewBox="0 0 ${frame.widthPx} ${viewHeight}">\n${metricHudFrameSvgMarkup(frame)}\n</svg>\n`;
}