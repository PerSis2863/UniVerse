// The owner, 26 Nov: Hyperion's Code window, the command window drawn over the editor's last lines. Now the editor
// and the command window share the width with a divider, never overlapping (also with Ask Ghidra open), and
// Variables / Files are tabs beside the figure. Sizes 1280×800 and 1920×1080, dark and light; axe; no page errors.
//   BASE=http://localhost:3000 SHOTS=<folder> node scripts/checks/hyperion-layout-ui.mjs
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
const browser = await launch();
const out = {}, errors = [];
try {
  for (const [w, h, theme] of [[1280, 800, 'light'], [1920, 1080, 'dark']]) {
    const r = (out[`${w}-${theme}`] = {});
    const ctx = await signedIn(browser, base, 'alice@student.com', { width: w, height: h });
    await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${theme}: ${e.message.slice(0, 200)}`));
    await page.goto(`${base}/hyperion`, { waitUntil: 'load', timeout: 240_000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    const ed = page.getByRole('region', { name: 'Script editor' }).or(page.locator('section[aria-label="Script editor"]')).first();
    const cw = page.locator('section[aria-label="Command window"]').first();
    await ed.waitFor({ timeout: 120_000 });
    const gap = async () => { const a = await ed.boundingBox(), b = await cw.boundingBox(); return a && b ? Math.round(b.y - (a.y + a.height)) : null; };
    r.gap = await gap();
    const ask = page.getByRole('button', { name: 'Ask Ghidra' }).first();
    if (await ask.count()) { await ask.click(); await page.waitForTimeout(400); r.gapWithAsk = await gap(); }
    r.sideTabs = await page.getByRole('group', { name: 'Side panel' }).getByRole('button').allInnerTexts().catch(() => []);
    r.editorWidth = Math.round((await ed.boundingBox())?.width ?? 0);
    if (shots) await page.screenshot({ path: `${shots}/lab-${w}-${theme}.png` });
    await page.getByRole('group', { name: 'Side panel' }).getByRole('button', { name: 'Variables' }).click().catch(() => {});
    r.variablesShown = await page.locator('section[aria-label="Variables"]').isVisible().catch(() => false);
    await page.addScriptTag({ path: AXE });
    r.axe = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`));
    r.sideways = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
