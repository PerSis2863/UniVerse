// First-load JavaScript per page, from a finished `pnpm build` (Stage 5 · A4).
//
//   pnpm build && node scripts/bundle-report.mjs [--top 25] [--json out.json]
//
// Reads each prerendered page (.next/server/app/**/*.html), takes the scripts it loads before it
// can run (<script src="/_next/static/...">) and adds up their gzipped sizes. Pages with an id in
// the address aren't prerendered, so they aren't listed. Targets (STAGE-5-PLAN.md A4): dashboards
// < 200 KB, public pages < 120 KB. Also lists the heaviest chunks and how many pages load them.
// Exits 1 when a page is over its target.

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const NEXT = new URL('../.next/', import.meta.url).pathname;
const APP = join(NEXT, 'server/app');
const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
const TOP = Number(arg('--top') ?? 25);
const jsonOut = arg('--json');
if (!existsSync(APP)) {
  console.error('No .next/server/app: run `pnpm build` first.');
  process.exit(2);
}

const html = [];
(function walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (n.endsWith('.html') && !n.startsWith('_')) html.push(p);
  }
})(APP);

const sizes = new Map();
const gz = (file) => {
  if (!sizes.has(file)) {
    const p = join(NEXT, file.replace(/^\/_next\//, ''));
    sizes.set(file, existsSync(p) ? gzipSync(readFileSync(p)).length : 0);
  }
  return sizes.get(file);
};
const kb = (b) => `${(b / 1024).toFixed(1)} KB`;

const PUBLIC = /^\/(privacy|terms|security|accessibility|legal-notice|policies|contact|pricing|login|register|forgot-password|reset-password|privacy-choices|offline|impact|reports)?$|^\/(guardian|verify|passport)/;
const pages = html.map((file) => {
  const route = '/' + relative(APP, file).replace(/\.html$/, '').split(sep).filter((s) => !(s.startsWith('(') && s.endsWith(')'))).join('/');
  const path = route === '/index' ? '/' : route;
  const src = readFileSync(file, 'utf8');
  // Not the noModule polyfills: only very old browsers download those.
  const files = [...new Set([...src.matchAll(/<script([^>]+)>/g)].filter((m) => !/noModule/i.test(m[1])).map((m) => /src="(\/_next\/static\/[^"?]+\.js)/.exec(m[1])?.[1]).filter(Boolean))];
  const total = files.reduce((s, f) => s + gz(f), 0);
  const isPublic = PUBLIC.test(path);
  return { path, total, target: isPublic ? 120 * 1024 : 200 * 1024, public: isPublic, files };
}).sort((a, b) => b.total - a.total);

// What every page loads (the app shell).
const shared = pages.length ? pages.map((p) => new Set(p.files)).reduce((a, b) => new Set([...a].filter((f) => b.has(f)))) : new Set();
const sharedTotal = [...shared].reduce((s, f) => s + gz(f), 0);
console.log(`Shared by every page: ${kb(sharedTotal)} (${shared.size} files)\n`);
console.log('Heaviest pages (first-load JS, gzipped; own = beyond the shared shell):');
for (const p of pages.slice(0, TOP)) {
  const own = p.files.filter((f) => !shared.has(f)).reduce((s, f) => s + gz(f), 0);
  console.log(`  ${p.total > p.target ? 'OVER' : 'ok  '} ${kb(p.total).padStart(9)}  (own ${kb(own).padStart(8)})  ${p.path}${p.public ? '  [public]' : ''}`);
}

const use = new Map();
for (const p of pages) for (const f of p.files) if (!shared.has(f)) use.set(f, (use.get(f) ?? 0) + 1);
console.log('\nHeaviest chunks (not in the shared shell):');
for (const [f, n] of [...use].sort((a, b) => gz(b[0]) - gz(a[0])).slice(0, 20)) console.log(`  ${kb(gz(f)).padStart(9)}  ${String(n).padStart(3)} pages  ${f.replace('/_next/static/chunks/', '')}`);

const over = pages.filter((p) => p.total > p.target);
console.log(`\n${pages.length - over.length}/${pages.length} pages within target (dashboards < 200 KB, public < 120 KB)`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ shared: sharedTotal, pages: pages.map((p) => ({ path: p.path, total: p.total, target: p.target, files: p.files })) }, null, 1));
process.exitCode = over.length ? 1 : 0;
