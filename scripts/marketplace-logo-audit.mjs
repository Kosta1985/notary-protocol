import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pngPath = path.join(root, 'web/marketplace-logo-400.png');
const svgPath = path.join(root, 'web/marketplace-logo-400.svg');

function fail(message) {
  console.error(`marketplace-logo audit failed: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(pngPath)) fail('missing web/marketplace-logo-400.png');
if (!fs.existsSync(svgPath)) fail('missing web/marketplace-logo-400.svg');

const png = fs.readFileSync(pngPath);
const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
if (png.length < 24 || !png.subarray(0, 8).equals(signature)) fail('asset is not a valid PNG signature');

const width = png.readUInt32BE(16);
const height = png.readUInt32BE(20);
if (width !== 400 || height !== 400) fail(`expected 400x400 PNG, got ${width}x${height}`);

const svg = fs.readFileSync(svgPath, 'utf8');
if (!/width="400"/.test(svg) || !/height="400"/.test(svg)) fail('SVG source must declare 400x400 dimensions');
if (!svg.includes('#111411') || !svg.includes('#b8f343')) fail('SVG source drifted from the current favicon palette');
if (!svg.includes('M17 47V17h7l16 20V17h7v30h-7L24 27v20z')) fail('SVG source drifted from the current favicon mark');

console.log(JSON.stringify({ status: 'ready', asset: 'web/marketplace-logo-400.png', width, height }));
