// Q21 languages and right to left, in the browser on the built Worker (pnpm local:serve).
// Arabic is filled with a stand-in for every text of public/i18n/catalog.json (Latin letters turned
// into Arabic ones, places such as {0} kept: real translations come from the AI on the live site),
// then the student app is opened in Arabic: right to left, menus on the other side, no sideways
// scrolling at 390 px, axe in light and dark, and how much of the screen's text was swapped (with the
// texts still in English, to find what the catalog misses). The dictionary route's 304 is checked.
// The stand-in Arabic is removed at the end.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launch, PAGES } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const APP = fileURLToPath(new URL('../..', import.meta.url));
const base = 'http://localhost:8787', S = 'demo@student.com';
const sqlFile = (path) => execSync(`npx wrangler d1 execute universe-db --local --file "${path}"`, { cwd: APP, stdio: 'ignore' });
const sql = (c) => execSync(`npx wrangler d1 execute universe-db --local --command "${c.replace(/"/g, '\\"')}"`, { cwd: APP, stdio: 'ignore' });

// ── Stand-in Arabic for the whole catalog (same parts as src/lib/ui-dictionary.ts) ──
const CHUNKS = 32;
const chunkOf = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0; return h % CHUNKS; };
const AR = 'ابتثجحخدذرزسشصضطظعغفقكلمنه';
const pseudo = (s) => s.split(/(\{\d\})/).map((p) => (/^\{\d\}$/.test(p) ? p : p.replace(/[A-Za-z]/g, (c) => AR[(c.toLowerCase().charCodeAt(0) - 97) % AR.length]))).join('');
const catalog = JSON.parse(readFileSync(new URL('../../public/i18n/catalog.json', import.meta.url), 'utf8')).strings;
const parts = Array.from({ length: CHUNKS }, () => ({ s: {}, r: [] }));
for (const s of catalog) parts[chunkOf(s)].s[s] = pseudo(s);
const now = new Date().toISOString().replace('Z', '+00:00');
const file = fileURLToPath(new URL('../../.wrangler/languages-check.sql', import.meta.url));
writeFileSync(file, parts.map((p, c) => `INSERT OR REPLACE INTO ui_translations (lang, chunk, data, count, reviewed, updatedAt) VALUES ('ar', ${c}, '${JSON.stringify(p).replace(/'/g, "''")}', ${Object.keys(p.s).length}, 0, '${now}');`).join('\n'));
sqlFile(file);

async function axe(page) {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
}
/** Letters on screen in Latin script vs. all letters (people's own content, marked translate="no", left out). */
const coverage = (page) => page.evaluate(() => {
  const counts = { latin: 0, all: 0 };
  const left = new Map();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const el = n.parentElement;
    if (!el || el.closest('[translate="no"],script,style,code,pre,svg,textarea')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
    const t = n.nodeValue.trim();
    const latin = (t.match(/[A-Za-z]/g) ?? []).length;
    counts.latin += latin;
    counts.all += latin + (t.match(/[؀-ۿ]/g) ?? []).length;
    if (latin >= 3) left.set(t.slice(0, 60), (left.get(t.slice(0, 60)) ?? 0) + 1);
  }
  return { swapped: counts.all ? Math.round((1 - counts.latin / counts.all) * 100) : 100, left: [...left.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t) };
});

const api = {};
try {
  const first = await fetch(`${base}/api/i18n/ar`);
  const body = await first.json();
  api.dictionary = [first.status, body.chunks?.length];
  api.unchanged = (await fetch(`${base}/api/i18n/ar`, { headers: { 'If-None-Match': first.headers.get('etag') } })).status; // 304
  api.unknownLanguage = (await fetch(`${base}/api/i18n/xx`)).status; // 404
  const me = await fetch(`${base}/api/core/auth/me`, { headers: { Authorization: `Bearer mock-token-${S}` } }).then((r) => r.json());
  const browser = await launch();
  try {
    for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
      const ctx = await browser.newContext({ viewport: { width, height: 844 } });
      await ctx.addInitScript(([t, u, th]) => {
        localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user: u }, version: 0 }));
        localStorage.setItem('theme', th); localStorage.setItem(`universe-tour-done:${u.id}`, '1');
        localStorage.setItem('universe-language', JSON.stringify({ state: { language: 'ar' }, version: 0 }));
      }, [`mock-token-${S}`, me, theme]);
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(`${new URL(page.url()).pathname}: ${e.message.slice(0, 120)}`));
      const pages = theme === 'light' && width === 390 ? PAGES[S] : PAGES[S].slice(0, 3);
      for (const path of pages) {
        await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60_000 });
        await page.waitForTimeout(1200); // the translator runs once the page is drawn
        const r = { theme, width, path };
        r.dir = await page.evaluate(() => document.documentElement.dir);
        r.wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        Object.assign(r, await coverage(page));
        if (path === '/student' || (theme === 'light' && width === 390)) r.axe = await axe(page);
        if (path === '/student' && width === 1280) r.navOnRight = await page.evaluate(() => { const nav = document.querySelector('aside, nav'); const b = nav?.getBoundingClientRect(); return b ? b.left > innerWidth / 2 : 'no nav'; });
        console.log(JSON.stringify(r));
      }
      if (errors.length) console.log(JSON.stringify({ theme, width, errors }));
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log('api', JSON.stringify(api));
} finally {
  sql(`DELETE FROM ui_translations WHERE lang='ar'`);
}
