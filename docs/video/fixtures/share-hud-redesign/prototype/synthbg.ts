import { Resvg } from '../../../../../functions/node_modules/@resvg/resvg-js/index.js';
import { writeFileSync } from 'node:fs';
const [w, h, out] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4]];
const tile = Math.round(w / 14);
let grid = '';
for (let x = 0; x <= w; x += tile) grid += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="#0e7490" stroke-opacity="0.35" stroke-width="3"/>`;
for (let y = 0; y <= h; y += tile) grid += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#0e7490" stroke-opacity="0.35" stroke-width="3"/>`;
let caustics = '';
for (let i = 0; i < 40; i++) { const cx = (i * 397) % w, cy = (i * 653) % h; caustics += `<ellipse cx="${cx}" cy="${cy}" rx="${tile * 1.4}" ry="${tile * 0.5}" fill="none" stroke="#e0f2fe" stroke-opacity="0.18" stroke-width="5" transform="rotate(${(i * 37) % 180} ${cx} ${cy})"/>`; }
const laneY = h * 0.52, s = w / 1080;
const diver = `<g transform="translate(${w * 0.32} ${laneY - 40 * s}) scale(${s})" fill="#0b0f14" fill-opacity="0.9">
<ellipse cx="200" cy="0" rx="150" ry="34"/><circle cx="380" cy="-6" r="32" fill="#dc2626"/><rect x="230" y="-20" width="190" height="16" rx="8" transform="rotate(-4 230 -20)"/>
<path d="M 60 -10 L -120 -40 L -150 10 L 60 20 Z"/><path d="M -120 -40 L -230 -70 L -250 -20 L -150 10 Z" fill-opacity="0.75"/></g>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
<defs><linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#0284c7"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#water)"/>${grid}
<rect x="0" y="${laneY - 22 * s}" width="${w}" height="${44 * s}" fill="#1e3a8a" fill-opacity="0.85"/>${caustics}${diver}
</svg>`;
writeFileSync(out, new Resvg(svg, { fitTo: { mode: 'original' } }).render().asPng());
