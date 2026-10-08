// Layout shift (CLS) on the main pages, measured in a real browser.
//
//   NEXT_PUBLIC_DEMO_LOGIN=true pnpm dev -p 3100        (in another terminal)
//   node scripts/cls.mjs [http://localhost:3100] [--json out.json]
//
// Signs in as each demo role (mock token, so only with demo login on), opens each page on a phone
// screen and on a desktop, waits for it to settle, and sums the layout-shift entries that weren't
// caused by input (the Web Vitals CLS definition, without session windows: stricter). Target: < 0.05.
// Needs Playwright (globally installed, or `pnpm add -D playwright`); uses PLAYWRIGHT_BROWSERS_PATH.

import { writeFileSync } from 'node:fs';
import { PAGES, baseUrl, launch, signedIn } from './browser-session.mjs';

const base = baseUrl();
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const VIEWPORTS = { phone: { width: 390, height: 844 }, desktop: { width: 1366, height: 900 } };

// Sum of layout shifts not caused by input, from the start of the page load.
const OBSERVE = () => {
  window.__cls = 0;
  window.__shifts = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      window.__cls += e.value;
      window.__shifts.push({ value: +e.value.toFixed(4), nodes: (e.sources || []).map((s) => s.node && (s.node.id ? `#${s.node.id}` : `${s.node.nodeName.toLowerCase()}.${String(s.node.className || '').split(' ').slice(0, 3).join('.')}`)).filter(Boolean) });
    }
  }).observe({ type: 'layout-shift', buffered: true });
};

const browser = await launch();
const results = [];
for (const [email, pages] of Object.entries(PAGES)) {
  for (const [vp, size] of Object.entries(VIEWPORTS)) {
    const ctx = await signedIn(browser, base, email, size);
    await ctx.addInitScript(OBSERVE);
    for (const path of pages) {
      const page = await ctx.newPage();
      try {
        await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60_000 });
        await page.waitForTimeout(1500); // late data, fonts, images
        const { cls, shifts } = await page.evaluate(() => ({ cls: window.__cls, shifts: window.__shifts }));
        results.push({ role: email.split('@')[1].split('.')[0], path, vp, cls: +cls.toFixed(4), shifts: shifts.filter((s) => s.value >= 0.005) });
      } catch (e) {
        results.push({ role: email, path, vp, cls: null, error: String(e.message).slice(0, 120) });
      }
      await page.close();
    }
    await ctx.close();
  }
}
await browser.close();

results.sort((a, b) => (b.cls ?? 1) - (a.cls ?? 1));
for (const r of results) {
  const flag = r.cls == null ? 'ERR ' : r.cls >= 0.05 ? 'FAIL' : 'ok  ';
  console.log(`${flag} ${String(r.cls ?? '-').padEnd(7)} ${r.vp.padEnd(8)} ${r.path}${r.error ? `  ${r.error}` : ''}`);
  if (r.cls >= 0.05) for (const s of r.shifts.slice(0, 4)) console.log(`       ${s.value}  ${s.nodes.join(' ')}`);
}
const bad = results.filter((r) => r.cls == null || r.cls >= 0.05).length;
console.log(`\n${results.length - bad}/${results.length} under 0.05`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 1));
process.exitCode = bad ? 1 : 0;
