import { build } from 'esbuild';
import fs from 'fs';
const out = await build({ entryPoints: ['src/i18n/locales/en.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const mod = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const en = mod.default ?? mod.en ?? Object.values(mod)[0];
const outAr = await build({ entryPoints: ['src/i18n/locales/ar.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const modAr = await import('data:text/javascript;base64,' + Buffer.from(outAr.outputFiles[0].text).toString('base64'));
const ar = modAr.default ?? modAr.ar ?? Object.values(modAr)[0];
const get = (o, k) => k.split('.').reduce((a, p) => (a && typeof a === 'object' ? a[p] : undefined), o);
const files = process.argv.slice(2);
let missing = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
    if (typeof get(en, m[1]) !== 'string') missing.push(`${f}: en ${m[1]}`);
    if (typeof get(ar, m[1]) !== 'string') missing.push(`${f}: ar ${m[1]}`);
  }
}
console.log(missing.length ? missing.join('\n') : 'all keys present');
