// M482–M491 Hyperion Simulate → Machines: each tab (robot arm, path planner, …) opens and draws, its main button
// works, axe is clean (serious/critical) at 1280 in light and dark, no sideways scroll, no page errors. Hyperion is
// for computers only (M405), so phones aren't checked.
//   BASE=http://localhost:3000 SHOTS=<folder> TABS=arm,planner node scripts/checks/hyperion-machines-ui.mjs
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
// The tab, its label, the button that shows it working, and a choice to press first (the left-outs' views, M486b–M491b).
const ALL = { arm: ['Robot arm', 'Reach it'], planner: ['Path planner', 'Drive it'], sensing: ['Sensing', 'Replay'], vehicle: ['Vehicle', 'Replay'], driving: ['Driving', 'Replay'], ev: ['Electric car', 'Regenerative braking'], flight: ['Aeroplane', 'Replay'], orbit: ['Orbit', 'Replay'], rail: ['Railway', 'Freight'], roll: ['Vehicle', 'Replay', 'Tall van'], turning: ['Aeroplane', 'Replay', 'Turning'], sunmoon: ['Orbit', 'Replay', 'The Sun’s and Moon’s pull (from 1 Jan 2026)'], line: ['Railway', 'Moving block', 'Several'], supply: ['Railway', 'The power supply (750 V DC)', 'Several'], hook: ['Vehicle', 'Replay', 'Hook'], drag: ['Orbit', 'Replay', 'Skimming'], single: ['Railway', 'Two', 'Single track'], six: ['Aeroplane', 'Replay', 'All six, wind'] };
const tabs = (process.env.TABS ?? Object.keys(ALL).join(',')).split(',');
const browser = await launch();
const out = {}, errors = [];
try {
  for (const theme of ['light', 'dark']) {
    const ctx = await signedIn(browser, base, 'alice@student.com', { width: 1280, height: 900 });
    await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); sessionStorage.setItem('uv-sim-kind', 'machines'); }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${theme}: ${e.message.slice(0, 200)}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|posthog/i.test(m.text())) errors.push(`${theme} console: ${m.text().slice(0, 200)}`); });
    await page.goto(`${base}/hyperion/simulate`, { waitUntil: 'load', timeout: 240_000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    for (const tab of tabs) {
      const [name, button, first] = ALL[tab], r = (out[`${theme} ${tab}`] = {});
      const seg = page.getByRole('button', { name, exact: true }).first();
      await seg.waitFor({ timeout: 120_000 });
      await seg.click();
      if (first) { const pre = page.getByRole('button', { name: first, exact: true }).or(page.getByRole('checkbox', { name: first, exact: true })).first(); await pre.waitFor({ timeout: 120_000 }); await pre.click(); }
      const btn = page.getByRole('button', { name: button }).or(page.getByRole('checkbox', { name: button })).first();
      await btn.waitFor({ timeout: 120_000 });
      await page.waitForTimeout(1500);
      await btn.click();
      await page.waitForTimeout(2500);
      r.drawn = await page.evaluate(() => [...document.querySelectorAll('canvas')].some((c) => c.width > 50 && c.height > 50));
      r.live = (await page.locator('[aria-live="polite"]').allInnerTexts()).join(' | ').replace(/\s+/g, ' ').slice(0, 300);
      if (shots) await page.screenshot({ path: `${shots}/machines-${tab}-${theme}.png` });
      await page.addScriptTag({ path: AXE });
      r.axe = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`));
      r.sideways = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    }
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
