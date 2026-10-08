// Accessibility check (axe-core, WCAG 2.2 AA rules) on the main pages, in a real browser.
//
//   NEXT_PUBLIC_DEMO_LOGIN=true pnpm dev -p 3100        (in another terminal)
//   node scripts/a11y.mjs [http://localhost:3100] [--all] [--theme dark]
//
// Reports serious and critical issues (--all: every impact) per page, grouped by rule, with a few
// example elements. Exits 1 when there are serious/critical issues. Target: none on the main pages.

import { createRequire } from 'node:module';
import { PAGES, baseUrl, launch, signedIn } from './browser-session.mjs';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');
const base = baseUrl();
const all = process.argv.includes('--all');
const dark = process.argv.includes('--theme') && process.argv[process.argv.indexOf('--theme') + 1] === 'dark';

const browser = await launch();
const byRule = new Map();
let pagesChecked = 0;
for (const [email, pages] of Object.entries(PAGES)) {
  const ctx = await signedIn(browser, base, email);
  await ctx.addInitScript((d) => localStorage.setItem('theme', d ? 'dark' : 'light'), dark);
  for (const path of pages) {
    const page = await ctx.newPage();
    try {
      await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.waitForTimeout(1200);
      // A page that redirects (or swaps its URL) right after load: wait for it, then inject.
      await page.addScriptTag({ path: AXE }).catch(async () => {
        await page.waitForLoadState('networkidle');
        await page.addScriptTag({ path: AXE });
      });
      const res = await page.evaluate(async () => {
        const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] });
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 4), count: v.nodes.length }));
      });
      pagesChecked++;
      for (const v of res) {
        if (!all && v.impact !== 'serious' && v.impact !== 'critical') continue;
        const e = byRule.get(v.id) ?? { ...v, pages: [], total: 0 };
        e.pages.push(path); e.total += v.count;
        byRule.set(v.id, e);
      }
    } catch (err) {
      console.log(`ERR ${path}: ${String(err.message).slice(0, 120)}`);
    }
    await page.close();
  }
  await ctx.close();
}
await browser.close();

const rules = [...byRule.values()].sort((a, b) => b.total - a.total);
for (const r of rules) {
  console.log(`\n[${r.impact}] ${r.id}: ${r.help} (${r.total} elements, ${r.pages.length} pages)`);
  console.log(`  pages: ${r.pages.join(', ')}`);
  for (const n of r.nodes) console.log(`  e.g. ${n.slice(0, 140)}`);
}
console.log(`\n${pagesChecked} pages checked (${dark ? 'dark' : 'light'}), ${rules.length} ${all ? '' : 'serious/critical '}rules failing`);
process.exitCode = rules.length ? 1 : 0;
