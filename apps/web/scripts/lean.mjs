// pnpm lean: keeps the project small (the Ponytail rules in .cursor/rules/universe.mdc).
//   · files under src/ that nothing imports (Next.js entry files, tests and the two files used only
//     by config, the test setup and the service worker, don't count);
//   · links in the code ("/…" in href, push, replace, redirect) that match no page in src/app.
// Prints what it finds and exits 1 when there is something to fix.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const code = (f) => /\.(tsx?|mjs|js|cjs)$/.test(f);
const src = walk(join(root, 'src')).filter(code);
const others = ['cloudflare', 'scripts', 'security-headers.ts', 'next.config.ts', 'vitest.config.ts']
  .flatMap((p) => { try { const full = join(root, p); return statSync(full).isDirectory() ? walk(full) : [full]; } catch { return []; } }).filter(code);

// ── Unused files ──
const ENTRY = /(^|\/)(page|layout|route|loading|error|not-found|global-error|template|default|opengraph-image|icon|sitemap|robots|manifest|instrumentation)\.(tsx?|js)$|\.test\.|\.d\.ts$/;
const BY_CONFIG = new Set(['src/server/test-setup.ts', 'src/worker/index.ts']); // vitest setupFiles; next-pwa customWorkerSrc
const exists = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const resolveSpec = (base) => ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx'].map((e) => base + e).find(exists);
const used = new Set();
for (const f of [...src, ...others]) {
  for (const m of readFileSync(f, 'utf8').matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)) {
    const s = m[1];
    const base = s.startsWith('@/') ? join(root, 'src', s.slice(2)) : s.startsWith('.') ? resolve(dirname(f), s) : null;
    const hit = base && resolveSpec(base);
    if (hit) used.add(hit);
  }
}
const unused = src.map((f) => relative(root, f)).filter((f) => !ENTRY.test(f) && !BY_CONFIG.has(f) && !used.has(join(root, f)));

// ── Links to pages that don't exist ──
const app = join(root, 'src/app');
const pages = walk(app).filter((f) => /\/(page|route)\.(tsx?|js)$/.test(f))
  .map((f) => relative(app, f).replace(/\/?(page|route)\.(tsx?|js)$/, '').split('/').filter((s) => s && !/^\(.*\)$/.test(s)));
const publicFiles = new Set(walk(join(root, 'public')).map((f) => '/' + relative(join(root, 'public'), f)));
const isPage = (segs) => pages.some((p) => {
  const last = p[p.length - 1] ?? '';
  if (/^\[\[?\.\.\./.test(last)) return segs.length >= p.length - 1 && p.slice(0, -1).every((s, i) => s.startsWith('[') || s === segs[i]);
  return p.length === segs.length && p.every((s, i) => s.startsWith('[') || s === segs[i]);
});
const broken = new Map();
for (const f of src.filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.'))) {
  for (const m of readFileSync(f, 'utf8').matchAll(/(?:href=|href:\s*|push\(|replace\(|redirect\()\s*\{?\s*['"`](\/[^'"`$\s]*)['"`]/g)) {
    const url = m[1].split(/[?#]/)[0];
    if (!url || url === '/' || url.startsWith('/api/') || url.startsWith('//') || publicFiles.has(url)) continue;
    if (!isPage(url.split('/').filter(Boolean))) broken.set(url, [...new Set([...(broken.get(url) ?? []), relative(root, f)])]);
  }
}

for (const f of unused) console.log(`unused file: ${f}`);
for (const [u, fs] of broken) console.log(`no page for ${u}  (${fs.slice(0, 3).join(', ')})`);
console.log(unused.length || broken.size ? `\n${unused.length} unused files, ${broken.size} broken links` : 'lean: nothing unused, no broken links');
process.exit(unused.length || broken.size ? 1 : 0);
