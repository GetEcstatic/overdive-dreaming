import { overlaySvg } from './currentOverlay.ts';
import { timeline } from './timeline.ts';
import { Resvg } from '../../../../../functions/node_modules/@resvg/resvg-js/index.js';
import { writeFileSync } from 'node:fs';
const [w, h, atMs, out] = [Number(process.argv[2]), Number(process.argv[3]), Number(process.argv[4]), process.argv[5]];
const svg = overlaySvg({ timeline: timeline as any, poolLength: 50, durationSeconds: 198, width: w, height: h, atMs });
writeFileSync(out, new Resvg(svg, { fitTo: { mode: 'original' }, font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' } }).render().asPng());
