// M568 Hyperion Simulate → Mixed-signal: each tab (PLL, converters, SerDes, verification) opens and draws its charts
// with numbers (the PLL locks, the ADC's ENOB, the eye open with equalisers), axe is clean (serious/critical) at 1280 in
// light and dark, no sideways scroll, no page errors. Computers only (M405). M571: a 4-port Touchstone file (two lossy
// lines, as a differential pair) loaded into SerDes links draws its eye.
//   BASE=http://localhost:3000 SHOTS=<folder> node scripts/checks/hyperion-mixsig-ui.mjs
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
const TABS = [['pll', 'Phase-locked loop', 'Lock time', 4], ['conv', 'Data converters', 'ENOB', 4], ['serdes', 'SerDes links', 'Eye height', 4], ['verify', 'Verification', 'SystemVerilog DPI-C', 0]];
// two uncoupled lossy lines (ports 1-2 and 3-4), 18 dB at 12.5 GHz, 2 ns: a 4-port .s4p, version 1, RI
function s4p() {
  const out = ['! two lines', '# Hz S RI R 50'];
  for (let k = 1; k <= 2000; k++) {
    const f = k * 25e6, x = f / 12.5e9, a = (18 / 20) * Math.LN10 * (0.5 * Math.sqrt(x) + 0.5 * x), m = Math.exp(-a), ph = -2 * Math.PI * f * 2e-9 - a * 0.5;
    const t = [m * Math.cos(ph), m * Math.sin(ph)], z = [0, 0];
    // rows: port 1 [S11 S12 S13 S14] …; ports 1-3 at one end and 2-4 at the other (Hyperion's default pairs)
    const S = (i, j) => ((i === 0 && j === 1) || (i === 1 && j === 0) || (i === 2 && j === 3) || (i === 3 && j === 2) ? t : z);
    for (let i = 0; i < 4; i++) out.push(`${i === 0 ? f.toExponential(6) : ' '.repeat(12)} ${[0, 1, 2, 3].flatMap((j) => S(i, j)).map((v) => v.toExponential(6)).join(' ')}`);
  }
  return Buffer.from(`${out.join('\n')}\n`);
}
const browser = await launch();
const out = {}, errors = [], fail = [];
try {
  for (const theme of ['light', 'dark']) {
    const ctx = await signedIn(browser, base, 'alice@student.com', { width: 1280, height: 900 });
    await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); sessionStorage.setItem('uv-sim-kind', 'mixed'); }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${theme}: ${e.message.slice(0, 200)}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|posthog/i.test(m.text())) errors.push(`${theme} console: ${m.text().slice(0, 200)}`); });
    await page.goto(`${base}/hyperion/simulate`, { waitUntil: 'load', timeout: 240_000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    for (const [key, name, expectText, want] of TABS) {
      const r = (out[`${theme} ${key}`] = {});
      const seg = page.getByRole('button', { name, exact: true }).first();
      await seg.waitFor({ timeout: 120_000 });
      await seg.click();
      await page.getByText(expectText, { exact: false }).first().waitFor({ timeout: 60_000 });
      await page.waitForTimeout(1200);
      r.charts = await page.locator('section[aria-label="Results"] svg[role="img"]').count();
      r.facts = (await page.locator('section[aria-label="Results"] .font-mono').allInnerTexts()).slice(0, 6).join(' | ');
      if (r.charts < want) fail.push(`${theme} ${key}: ${r.charts} charts, not ${want}`);
      if (shots) await page.screenshot({ path: `${shots}/mixsig-${key}-${theme}.png`, fullPage: true });
      await page.addScriptTag({ path: AXE });
      r.axe = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`));
      if (r.axe.length) fail.push(`${theme} ${key} axe: ${r.axe.join('; ')}`);
      r.sideways = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      if (r.sideways) fail.push(`${theme} ${key}: sideways scroll`);
      if (key === 'serdes' && theme === 'light') {
        await page.locator('input[type="file"][accept*="s4p"]').setInputFiles({ name: 'pair.s4p', mimeType: 'text/plain', buffer: s4p() });
        await page.getByText('differential (SDD21)').first().waitFor({ timeout: 30_000 });
        await page.waitForTimeout(1500);
        r.file = (await page.locator('section[aria-label="Results"] .font-mono').allInnerTexts()).slice(0, 3).join(' | ');
        if (!/UI/.test(r.file)) fail.push(`serdes file: ${r.file}`);
        if (shots) await page.screenshot({ path: `${shots}/mixsig-serdes-file.png`, fullPage: true });
      }
    }
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
if (fail.length || errors.length) { console.log(fail.join('\n')); process.exit(1); }
console.log('ok');
