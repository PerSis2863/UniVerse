// First-load JavaScript per page, from a finished `pnpm build` (Stage 5 · A4).
//
//   pnpm build && node scripts/bundle-report.mjs [--top 25] [--json out.json]
//
// For each page: the gzipped size of every script it needs before it can run (the shared app
// shell + the page's own chunks and its layouts'), as in `.next/app-build-manifest.json`.
// Targets (STAGE-5-PLAN.md A4): dashboards < 200 KB, public pages < 120 KB. Also lists the
// heaviest chunks and how many pages load them. Exits 1 when a page is over its target.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const NEXT = new URL('../.next/', import.meta.url).pathname;
const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
const TOP = Number(arg('--top') ?? 25);
const jsonOut = arg('--json');

const read = (f) => JSON.parse(readFileSync(join(NEXT, f), 'utf8'));
if (!existsSync(join(NEXT, 'app-build-manifest.json'))) {
  console.error('No .next/app-build-manifest.json: run `pnpm build` first.');
  process.exit(2);
}
const app = read('app-build-manifest.json').pages;
const shared = read('build-manifest.json').rootMainFiles ?? [];

const sizes = new Map();
const gz = (file) => {
  if (!sizes.has(file)) {
    const p = join(NEXT, file);
    sizes.set(file, existsSync(p) ? gzipSync(readFileSync(p)).length : 0);
  }
  return sizes.get(file);
};
const kb = (b) => `${(b / 1024).toFixed(1)} KB`;

const PUBLIC = /^\/(page|\(auth\)|privacy|terms|security|accessibility|legal-notice|policies|contact|pricing|verify|passport|guest|join|privacy-choices)/;
const pages = Object.entries(app)
  .filter(([route]) => route.endsWith('/page'))
  .map(([route, files]) => {
    const js = [...new Set([...shared, ...files])].filter((f) => f.endsWith('.js'));
    const total = js.reduce((s, f) => s + gz(f), 0);
    const path = route.replace(/\/page$/, '').replace(/\/\([^)]+\)/g, '') || '/';
    const isPublic = PUBLIC.test(route) || path === '/';
    return { path, route, total, own: js.filter((f) => !shared.includes(f)).reduce((s, f) => s + gz(f), 0), target: isPublic ? 120 * 1024 : 200 * 1024, files: js };
  })
  .sort((a, b) => b.total - a.total);

const sharedTotal = shared.filter((f) => f.endsWith('.js')).reduce((s, f) => s + gz(f), 0);
console.log(`Shared by every page: ${kb(sharedTotal)} (${shared.length} files)\n`);
console.log(`Heaviest pages (first-load JS, gzipped):`);
for (const p of pages.slice(0, TOP)) console.log(`  ${p.total > p.target ? 'OVER' : 'ok  '} ${kb(p.total).padStart(9)}  (own ${kb(p.own).padStart(8)})  ${p.path}`);

const use = new Map();
for (const p of pages) for (const f of p.files) if (!shared.includes(f)) use.set(f, (use.get(f) ?? 0) + 1);
console.log(`\nHeaviest chunks (not in the shared shell):`);
for (const [f, n] of [...use].sort((a, b) => gz(b[0]) - gz(a[0])).slice(0, 20)) console.log(`  ${kb(gz(f)).padStart(9)}  ${String(n).padStart(3)} pages  ${f}`);

const over = pages.filter((p) => p.total > p.target);
console.log(`\n${pages.length - over.length}/${pages.length} pages within target (dashboards < 200 KB, public < 120 KB)`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ shared: sharedTotal, pages: pages.map((p) => ({ path: p.path, route: p.route, total: p.total, own: p.own, target: p.target })) }, null, 1));
process.exitCode = over.length ? 1 : 0;
