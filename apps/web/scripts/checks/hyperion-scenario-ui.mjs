// M573 Simulate → Machines → Scenario designer: each ready scenario runs and draws (bird's-eye view and chase camera,
// detections counted, the crash scenario's crash found), a click adds a car, axe is clean (serious/critical) at 1280 in
// light and dark, no sideways scroll, no page errors. Computers only (M405).
//   BASE=http://localhost:3000 SHOTS=<folder> node scripts/checks/hyperion-scenario-ui.mjs
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
const browser = await launch();
const out = {}, errors = [], fail = [];
try {
  for (const theme of ['light', 'dark']) {
    const ctx = await signedIn(browser, base, 'alice@student.com', { width: 1280, height: 900 });
    await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); sessionStorage.setItem('uv-sim-kind', 'machines'); sessionStorage.setItem('uv-sim-machine', 'scenario'); }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${theme}: ${e.message.slice(0, 200)}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|posthog/i.test(m.text())) errors.push(`${theme} console: ${m.text().slice(0, 200)}`); });
    await page.goto(`${base}/hyperion/simulate`, { waitUntil: 'load', timeout: 240_000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    const pick = page.getByLabel('Start from');
    await pick.waitFor({ timeout: 120_000 });
    for (const [i, name] of ['Highway cut-in', 'Curve and a person crossing', 'Stop and go (a crash)'].entries()) {
      const r = (out[`${theme} ${i}`] = {});
      await pick.selectOption(String(i));
      await page.waitForTimeout(800);
      const slider = page.getByRole('slider', { name: 'Time in the run' });
      await slider.fill(String(Math.round(Number(await slider.getAttribute('max')) * 0.55)));
      await page.waitForTimeout(500);
      r.facts = (await page.locator('section[aria-label="The run"] .font-mono').allInnerTexts()).join(' | ');
      r.inked = await page.evaluate(() => [...document.querySelectorAll('section[aria-label="The run"] canvas')].map((c) => { const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let k = 0; for (let j = 0; j < d.length; j += 4000) if (d[j + 3]) k++; return k; }));
      if (r.inked.some((x) => x < 50)) fail.push(`${theme} ${name}: a canvas is empty`);
      if (!/^\d+ \| [1-9]\d* /.test(r.facts)) fail.push(`${theme} ${name}: no detections (${r.facts})`);
      r.side = await page.evaluate(() => { const [a, b] = [...document.querySelectorAll('section[aria-label="The run"] canvas')].map((c) => c.getBoundingClientRect()); return Math.abs(a.top - b.top) < 2; });
      if (!r.side) fail.push(`${theme} ${name}: the two views aren't side by side`);
      if (i === 2 && /none$/.test(r.facts)) fail.push(`${theme}: the crash wasn't found`);
      if (shots) await page.screenshot({ path: `${shots}/scenario-${i}-${theme}.png` });
    }
    // a click in "Add a car" adds an actor
    const before = Number((await page.locator('section[aria-label="The run"] .font-mono').first().innerText()).trim());
    await page.getByRole('button', { name: 'Add a car', exact: true }).click();
    const box = await page.locator('section[aria-label="The run"] canvas').first().boundingBox();
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
    await page.waitForTimeout(800);
    const after = Number((await page.locator('section[aria-label="The run"] .font-mono').first().innerText()).trim());
    if (after !== before + 1) fail.push(`${theme}: adding a car went ${before} → ${after}`);
    await page.addScriptTag({ path: AXE });
    const axe = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`));
    if (axe.length) fail.push(`${theme} axe: ${axe.join('; ')}`);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) fail.push(`${theme}: sideways scroll`);
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
if (fail.length || errors.length) { console.log(fail.join('\n')); process.exit(1); }
console.log('ok');
