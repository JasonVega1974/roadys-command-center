// One-shot extraction of static data blocks from vendors.html into a TS module.
// Reads line ranges identified by inspection; emits react-app/src/data/vendors.ts.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const src = readFileSync(resolve(root, 'vendors.html'), 'utf8').split(/\r?\n/);
const line = (n) => src[n - 1]; // 1-indexed
const slice = (a, b) => src.slice(a - 1, b).join('\n');

const L_MOS = line(399);
const L_MEMBERS = line(401);
const L_MANAGER_MAP = slice(403, 411);
const L_REGIONS = slice(412, 419);
const L_KPI_VP = slice(423, 426);
const L_VP_VENDORS = line(429);
const L_VP_TOP10 = line(430);
const L_VP_TOP10_NAMES = line(431);
const L_SYSCO_ENROLL_SEED = slice(442, 446);
const L_VP_TOP10_LIST = slice(488, 498);
const L_VP_REV_PER_STOP = line(501);

const L_SYSCO_ROI_SEED = line(511);
const L_FB_ROI_SEED = line(524);
const L_LYNCO_ROI_SEED = line(537);
const L_HL_ROI_SEED = line(563);
const L_ENT_ROI_SEED = line(581);
const L_AOM_ROI_SEED = line(599);
const L_TPC_ROI_SEED = line(617);
const L_COKE_ROI_SEED = line(635);
const L_DAS_ROI_SEED = line(653);

const L_ROI_DEFAULT_VENDOR_PRESETS = slice(2082, 2093);
const L_PROGRAM_DETAILS = slice(2106, 2217);

// Enrollment ID arrays embedded in seed IIFEs — extract just the array literal.
const arrayOnly = (src, desc) => {
  const m = src.match(/\[[^\]]*\]/);
  if (!m) { console.error('No array found for', desc, '—', src.slice(0, 80)); process.exit(1); }
  return m[0];
};
const L_FB_ENROLL_IDS = arrayOnly(line(478), 'FB enroll ids');
const L_LYNCO_ENROLL_IDS = arrayOnly(line(553), 'Lynco enroll ids');
const L_AOM_ENROLL_IDS = arrayOnly(line(607), 'AOM enroll ids');
const L_TPC_ENROLL_IDS = arrayOnly(line(625), 'TPC enroll ids');
const L_COKE_ENROLL_IDS = arrayOnly(line(643), 'Coke enroll ids');
const L_DAS_ENROLL_IDS = arrayOnly(line(661), 'DAS enroll ids');

const pairs = [
  [L_MOS, 'MOS'],
  [L_MEMBERS, 'MEMBERS'],
  [L_MANAGER_MAP, 'MANAGER_MAP'],
  [L_REGIONS, 'REGIONS'],
  [L_KPI_VP, 'KPI_VP'],
  [L_VP_VENDORS, 'VP_VENDORS'],
  [L_VP_TOP10, 'VP_TOP10'],
  [L_VP_TOP10_NAMES, 'VP_TOP10_NAMES'],
  [L_SYSCO_ENROLL_SEED, 'SYSCO_ENROLL_SEED'],
  [L_VP_TOP10_LIST, 'VP_TOP10_LIST'],
  [L_VP_REV_PER_STOP, 'VP_REV_PER_STOP'],
  [L_SYSCO_ROI_SEED, 'SYSCO_ROI_SEED'],
  [L_FB_ROI_SEED, 'FB_ROI_SEED'],
  [L_LYNCO_ROI_SEED, 'LYNCO_ROI_SEED'],
  [L_HL_ROI_SEED, 'HL_ROI_SEED'],
  [L_ENT_ROI_SEED, 'ENT_ROI_SEED'],
  [L_AOM_ROI_SEED, 'AOM_ROI_SEED'],
  [L_TPC_ROI_SEED, 'TPC_ROI_SEED'],
  [L_COKE_ROI_SEED, 'COKE_ROI_SEED'],
  [L_DAS_ROI_SEED, 'DAS_ROI_SEED'],
  [L_ROI_DEFAULT_VENDOR_PRESETS, 'ROI_DEFAULT_VENDOR_PRESETS'],
  [L_PROGRAM_DETAILS, 'PROGRAM_DETAILS'],
];
const checkName = (text, name) => {
  const rx = new RegExp(`^(let|const)\\s+${name}\\b`);
  if (!rx.test(text)) {
    console.error('Boundary mismatch for', name, '— got:', text.slice(0, 80));
    process.exit(1);
  }
};
for (const [text, name] of pairs) checkName(text, name);

// Strip trailing semicolons from each declaration so we can rewrite as `export const`.
const rewrite = (s, name) =>
  s.replace(new RegExp(`^(let|const)(\\s+)${name}(\\s*=)`), `export const$2${name}$3`);

const out = [
  '// AUTO-GENERATED from vendors.html via scripts/extract-vendors-data.mjs.',
  '// Do not edit by hand — regenerate by running `node scripts/extract-vendors-data.mjs`.',
  '// @ts-nocheck',
  '',
  rewrite(L_MOS, 'MOS'),
  '',
  rewrite(L_MEMBERS, 'MEMBERS'),
  '',
  rewrite(L_MANAGER_MAP, 'MANAGER_MAP'),
  '',
  rewrite(L_REGIONS, 'REGIONS'),
  '',
  rewrite(L_KPI_VP, 'KPI_VP'),
  '',
  rewrite(L_VP_VENDORS, 'VP_VENDORS'),
  rewrite(L_VP_TOP10, 'VP_TOP10'),
  rewrite(L_VP_TOP10_NAMES, 'VP_TOP10_NAMES'),
  '',
  rewrite(L_SYSCO_ENROLL_SEED, 'SYSCO_ENROLL_SEED'),
  '',
  rewrite(L_VP_TOP10_LIST, 'VP_TOP10_LIST'),
  '',
  rewrite(L_VP_REV_PER_STOP, 'VP_REV_PER_STOP'),
  '',
  rewrite(L_SYSCO_ROI_SEED, 'SYSCO_ROI_SEED'),
  rewrite(L_FB_ROI_SEED, 'FB_ROI_SEED'),
  rewrite(L_LYNCO_ROI_SEED, 'LYNCO_ROI_SEED'),
  rewrite(L_HL_ROI_SEED, 'HL_ROI_SEED'),
  rewrite(L_ENT_ROI_SEED, 'ENT_ROI_SEED'),
  rewrite(L_AOM_ROI_SEED, 'AOM_ROI_SEED'),
  rewrite(L_TPC_ROI_SEED, 'TPC_ROI_SEED'),
  rewrite(L_COKE_ROI_SEED, 'COKE_ROI_SEED'),
  rewrite(L_DAS_ROI_SEED, 'DAS_ROI_SEED'),
  '',
  rewrite(L_ROI_DEFAULT_VENDOR_PRESETS, 'ROI_DEFAULT_VENDOR_PRESETS'),
  '',
  rewrite(L_PROGRAM_DETAILS, 'PROGRAM_DETAILS'),
  '',
  `export const FB_ENROLL_IDS = ${L_FB_ENROLL_IDS};`,
  `export const LYNCO_ENROLL_IDS = ${L_LYNCO_ENROLL_IDS};`,
  `export const AOM_ENROLL_IDS = ${L_AOM_ENROLL_IDS};`,
  `export const TPC_ENROLL_IDS = ${L_TPC_ENROLL_IDS};`,
  `export const COKE_ENROLL_IDS = ${L_COKE_ENROLL_IDS};`,
  `export const DAS_ENROLL_IDS = ${L_DAS_ENROLL_IDS};`,
  '',
].join('\n');

const outPath = resolve(root, 'react-app/src/data/vendors.ts');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, out);
console.log('Wrote', outPath, '(' + out.length.toLocaleString() + ' bytes)');
