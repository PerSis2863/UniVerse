// M132 (built Worker or dev server): each app its own colour. On the landing (?app=…) and inside each
// app, <html data-app> names the page's app and the main button wears that app's colour; axe finds
// nothing serious (contrast included) in dark and light.
//   node scripts/checks/app-colours-ui.mjs [http://localhost:8787]
import { createRequire } from 'node:module';
import { baseUrl, launch, signedIn } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = baseUrl();
const fail = [];
const out = [];
/** The main button's colour per app and theme (globals.css M132; UniVersity keeps the M124 one). */
const CTA = {
  dark: { campus: 'rgb(198, 242, 74)', trace: 'rgb(244, 114, 182)', relief: 'rgb(251, 146, 60)', green: 'rgb(52, 211, 153)', play: 'rgb(232, 121, 249)' },
  light: { trace: 'rgb(219, 39, 119)', relief: 'rgb(194, 65, 12)', green: 'rgb(4, 120, 87)', play: 'rgb(192, 38, 211)' },
};
const axe = async (page, what) => {
  await page.addScriptTag({ path: AXE });
  const bad = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`));
  for (const b of bad) fail.push(`${what} axe ${b}`);
};
const browser = await launch();
try {
  for (const theme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript((t) => { try { localStorage.setItem('uv-cookies', 'essential'); localStorage.setItem('theme', t); } catch { /* a locked frame */ } }, theme);
    const page = await ctx.newPage();
    for (const app of ['campus', 'trace', 'relief', 'green', 'play']) {
      const what = `/?app=${app} ${theme}`;
      await page.goto(`${base}/?app=${app}`, { waitUntil: 'load', timeout: 240_000 });
      await page.waitForTimeout(2000);
      const seen = await page.evaluate(() => document.documentElement.dataset.app);
      if (seen !== app) fail.push(`${what}: data-app is ${seen}`);
      const cta = await page.getByRole('link', { name: /Get started/ }).first().evaluate((el) => getComputedStyle(el).backgroundColor);
      const want = CTA[theme][app];
      if (want && cta !== want) fail.push(`${what}: the main button is ${cta}, not ${want}`);
      await axe(page, what);
      out.push(`${what}: ${cta}`);
    }
    await ctx.close();
    for (const path of ['/trace', '/relief', '/green', '/play']) {
      const what = `${path} ${theme}`;
      const ictx = await signedIn(browser, base, 'demo@student.com', { width: 1280, height: 900 });
      await ictx.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch { /* a locked frame */ } }, theme);
      const p = await ictx.newPage();
      await p.goto(base + path, { waitUntil: 'load', timeout: 240_000 });
      await p.waitForTimeout(3000);
      if (await p.getByText('This page hit a problem').count()) fail.push(`${what}: the page hit a problem`);
      const seen = await p.evaluate(() => document.documentElement.dataset.app);
      if (seen !== path.slice(1)) fail.push(`${what}: data-app is ${seen}`);
      await axe(p, what);
      out.push(what);
      await ictx.close();
    }
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ out, fail }, null, 2));
process.exit(fail.length ? 1 : 0);
