// Generates the PWA icons (192, 512, maskable 512, apple-touch, badge) from an inline SVG.
// Usage: node scripts/generate-icons.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, '..', 'public', 'icons');
mkdirSync(out, { recursive: true });

// Map pin with a route line, on a teal background. `pad` shrinks the artwork into the
// maskable safe zone (inner 80%).
const svg = (pad, rounded) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="#0f766e"/>
  <g transform="translate(${pad} ${pad}) scale(${(512 - 2 * pad) / 512})">
    <path d="M110 380 C 170 300, 250 420, 330 330" stroke="#99f6e4" stroke-width="22" fill="none" stroke-linecap="round" stroke-dasharray="2 44"/>
    <path d="M330 96c-62 0-112 50-112 112 0 84 112 196 112 196s112-112 112-196c0-62-50-112-112-112z" fill="#ffffff"/>
    <circle cx="330" cy="208" r="44" fill="#0f766e"/>
    <circle cx="110" cy="380" r="34" fill="#ffffff"/>
  </g>
</svg>`;

const badge = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <path d="M48 8c-17 0-30 13-30 30 0 23 30 50 30 50s30-27 30-50C78 21 65 8 48 8z" fill="#ffffff"/>
  <circle cx="48" cy="38" r="12" fill="#000000"/>
</svg>`;

const jobs = [
  ['icon-192.png', svg(0, true), 192],
  ['icon-512.png', svg(0, true), 512],
  ['icon-maskable-512.png', svg(64, false), 512],
  ['apple-touch-icon.png', svg(24, false), 180],
  ['badge-96.png', badge, 96],
];

for (const [name, source, size] of jobs) {
  await sharp(Buffer.from(source)).resize(size, size).png().toFile(path.join(out, name));
  console.log('wrote', name);
}
