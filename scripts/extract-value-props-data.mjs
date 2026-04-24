// One-shot extraction of static data blocks from value-props.html into a TS module.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const src = readFileSync(resolve(root, 'value-props.html'), 'utf8').split(/\r?\n/);
const line = (n) => src[n - 1];

// Line 670 = FD (fleet data) — ~265KB
const L_FD = line(670);
// Line 680 = GEO city→coords cache
const L_GEO = line(680);
// Line 682 = ST_COORDS state→coords
const L_ST_COORDS = line(682);

// Strip `const NAME =` prefix and trailing `;`.
function stripConst(s, name) {
  const re = new RegExp('^const\\s+' + name + '\\s*=\\s*');
  const stripped = s.replace(re, '').replace(/;\s*$/, '');
  return stripped;
}

const fd = stripConst(L_FD, 'FD');
const geo = stripConst(L_GEO, 'GEO');
const stCoords = stripConst(L_ST_COORDS, 'ST_COORDS');

const out = `// AUTO-GENERATED — run scripts/extract-value-props-data.mjs to regenerate.
// Extracted from value-props.html.

export const FD = ${fd} as { f: string[]; r: Array<[number, string, string, number]> };

// FN = fleet names (parallel to FD.f), FR = rows [fleetIdx, city, state, gallons]
export const FN = FD.f;
export const FR = FD.r;

export const GEO: Record<string, [number, number]> = ${geo};

export const ST_COORDS: Record<string, [number, number]> = ${stCoords};
`;

const destDir = resolve(root, 'react-app/src/data');
mkdirSync(destDir, { recursive: true });
writeFileSync(resolve(destDir, 'valueProps.ts'), out);
console.log('Wrote', resolve(destDir, 'valueProps.ts'));
console.log('FD chars:', fd.length, 'GEO chars:', geo.length, 'ST_COORDS chars:', stCoords.length);
