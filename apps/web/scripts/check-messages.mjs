import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (l) => JSON.parse(readFileSync(join(root, 'messages', `${l}.json`), 'utf8'));

const keys = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );

const en = new Set(keys(load('en')));
const th = new Set(keys(load('th')));
const missingInTh = [...en].filter((k) => !th.has(k));
const missingInEn = [...th].filter((k) => !en.has(k));

if (missingInTh.length || missingInEn.length) {
  if (missingInTh.length) console.error('Missing in th.json:', missingInTh);
  if (missingInEn.length) console.error('Missing in en.json:', missingInEn);
  process.exit(1);
}
console.log(`OK — ${en.size} keys in both catalogs`);
