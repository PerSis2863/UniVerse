// M420 Relief's own AI in the ask form: typing "grandpa is not breathing" shows "reads this as Critical · Medical",
// Use this sets both; nothing is posted. Axe at 1280 (dark) and 390 (light, a touch phone), no page errors.
//   BASE=http://localhost:3000 SHOTS=<folder> node scripts/checks/relief-own-ai-ui.mjs
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
const browser = await launch();
const out = {}, errors = [];
try {
  for (const [theme, width] of [['dark', 1280], ['light', 390]]) {
    const phone = width < 600, r = (out[`${theme} ${width}`] = {});
    const ctx = await signedIn(browser, base, 'alice@student.com', { width, height: phone ? 844 : 900 }, phone ? { isMobile: true, hasTouch: true } : {});
    await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${width}: ${e.message.slice(0, 160)}`));
    await page.goto(`${base}/relief`, { waitUntil: 'load', timeout: 180_000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.getByRole('button', { name: 'Ask or offer help' }).first().click();
    const form = page.locator('form[aria-label="Ask or offer help"]');
    await form.waitFor({ timeout: 20_000 }).catch(async (e) => { if (shots) await page.screenshot({ path: `${shots}/relief-own-ai-fail.png` }); throw e; });
    await form.getByPlaceholder('Food for a family of 5').fill('help, grandpa is not breathing');
    const hint = form.getByText('UniVerse’s own AI reads this as');
    await hint.waitFor({ timeout: 10_000 });
    r.hint = (await hint.innerText()).replace(/\s+/g, ' ');
    await form.getByRole('button', { name: 'Use this' }).click();
    r.urgency = await form.locator('select').first().inputValue();
    r.kindChosen = await form.getByRole('radio', { name: 'Medical' }).getAttribute('aria-checked');
    r.hintGone = !(await hint.isVisible());
    await form.getByPlaceholder('Food for a family of 5').fill('help, grandpa is not breathing!');
    await page.waitForTimeout(400);
    await page.addScriptTag({ path: AXE });
    r.axe = await page.evaluate(async () => (await window.axe.run({ exclude: [['canvas']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
    r.sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (shots) await page.screenshot({ path: `${shots}/relief-own-ai-${theme}-${width}.png` });
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
const bad = Object.values(out).some((r) => !/Critical · Medical/.test(r.hint) || r.urgency !== 'CRITICAL' || r.kindChosen !== 'true' || !r.hintGone || r.axe.length || r.sideways) || errors.length;
process.exit(bad ? 1 : 0);
