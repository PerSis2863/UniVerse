// The new screens of M291–M322 in a real browser (sample mode, so each has data): axe (serious/critical),
// sideways scrolling, console errors, at 390 and 1280 px, light and dark. Screenshots of a few for a look.
//   node scripts/checks/new-screens-ui.mjs http://localhost:8787 [folder for screenshots]   (ONLY=<part of a path> for one)
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.argv[2] ?? 'http://localhost:8787';
const OUT = process.argv[3] ?? null;
const PAGES = [
  ['demo@teacher.com', '/teacher/quizzes', 'Paper exams'],
  ['demo@teacher.com', '/teacher/early-warning'],
  ['demo@teacher.com', '/teacher/blackboard?course=sample-c-os&tab=lessons'],
  ['demo@teacher.com', '/teacher/blackboard?course=sample-c-os&tab=revision'],
  ['demo@teacher.com', '/calls'],
  ['demo@teacher.com', '/campus-map', 'Find a free room'],
  ['demo@student.com', '/student/passport'],
  ['demo@student.com', '/student/calendar'],
  ['demo@student.com', '/calls'],
  ['demo@student.com', '/trace/vault'],
  ['demo@student.com', '/trace/wallet'],
  ['demo@student.com', '/relief/mine'],
  ['demo@student.com', '/green'],
  ['demo@student.com', '/green?view=footprint'],
  ['demo@student.com', '/green?view=goals'],
  ['demo@student.com', '/green?view=swap'],
  ['demo@student.com', '/travel/trip?id=sample-trip-1&part=album'],
  ['demo@student.com', '/student/settings?section=privacy'],
  ['demo@student.com', '/student/settings?section=notifications'],
  ['demo@admin.com', '/admin/timetable'],
  ['demo@admin.com', '/trace/insights'],
  ['demo@admin.com', '/trace/radar'],
];
const only = process.env.ONLY;
const browser = await launch();
const fail = [];
let shots = 0;
for (const [email, path, click] of PAGES) {
  if (only && !path.includes(only)) continue;
  for (const width of [390, 1280]) {
    for (const theme of ['light', 'dark']) {
      const what = `${path} ${width} ${theme}`;
      const ctx = await signedIn(browser, base, email, { width, height: width < 600 ? 844 : 900 });
      await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t); sessionStorage.setItem('universe:sample-mode', '1'); } catch { /* locked */ } }, theme);
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
      page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|net::ERR|403|503/.test(m.text())) errors.push(m.text().slice(0, 160)); });
      try {
        await page.goto(`${base}${path}`, { waitUntil: 'load', timeout: 120_000 });
        await page.waitForTimeout(3500);
        if (click) { const b = page.getByRole('button', { name: click }).or(page.getByRole('radio', { name: click })).first(); if (await b.count()) { await b.click().catch(() => {}); await page.waitForTimeout(1800); } else fail.push(`${what}: no "${click}" to press`); }
        const wide = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
        if (wide > 2) fail.push(`${what}: scrolls sideways by ${wide}px`);
        await page.addScriptTag({ path: AXE });
        const bad = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
        for (const b of bad) fail.push(`${what} axe ${b}`);
        for (const e of errors.slice(0, 3)) fail.push(`${what} error: ${e}`);
        if (OUT && theme === 'light' && shots < 60) { await page.screenshot({ path: `${OUT}/${path.replace(/[^a-z0-9]+/gi, '_')}-${width}.png`, fullPage: false }); shots++; }
      } catch (e) { fail.push(`${what}: ${String(e).slice(0, 160)}`); }
      await ctx.close();
    }
  }
}
await browser.close();
console.log(fail.length ? fail.join('\n') : 'All new screens pass.');
process.exit(fail.length ? 1 : 0);
