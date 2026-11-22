// M435 Hyperion's AI: Ask AI in Hyperion's script toolbar opens the panel (a question, "Ask about this script", Ask);
// a script that fails shows "Fix the error"; asking sends the question to POST /api/hyperion/ai (here answered by a
// stand-in, so no AI is used) and the answer's code goes into a new script with "Put in a new script". Axe at 1280
// (dark) and 1024 (light), no sideways scroll, no page errors. (Hyperion is for computers: phones are told to use one.)
//   BASE=http://localhost:3000 SHOTS=<folder> node scripts/checks/hyperion-ai-ui.mjs
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
const browser = await launch();
const out = {}, errors = [];
try {
  for (const [theme, width] of [['dark', 1280], ['light', 1024]]) {
    const r = (out[`${theme} ${width}`] = {});
    const ctx = await signedIn(browser, base, 'alice@student.com', { width, height: 900 });
    await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${width}: ${e.message.slice(0, 200)}`));
    let sent = null;
    await page.route('**/api/hyperion/ai', async (route) => {
      sent = JSON.parse(route.request().postData() ?? '{}');
      await route.fulfill({ json: { answer: 'This plots a damped sine wave.\n```matlab\nt = 0:0.01:5;\ny = exp(-t).*sin(4*t);\nplot(t, y); title("Damped sine"); xlabel("t"); ylabel("y");\n```' } });
    });
    await page.goto(`${base}/hyperion`, { waitUntil: 'load', timeout: 240_000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.getByRole('tab', { name: /editor/i }).click().catch(() => {});
    const askBtn = page.getByRole('button', { name: 'Ask AI' });
    await askBtn.waitFor({ timeout: 120_000 });
    await askBtn.click();
    const panel = page.getByRole('group', { name: 'Ask Hyperion’s AI' });
    await panel.waitFor();
    r.panel = true;
    await panel.getByLabel('Your question for Hyperion’s AI').fill('Plot a damped sine wave');
    await panel.getByRole('button', { name: 'Ask', exact: true }).click();
    await panel.getByText('This plots a damped sine wave.').waitFor({ timeout: 30_000 });
    r.sent = sent?.question;
    r.code = (await panel.locator('pre').innerText()).includes('exp(-t)');
    const before = await page.locator('input[value$=".m"]').first().inputValue().catch(() => '');
    await panel.getByRole('button', { name: 'Put in a new script' }).click();
    await page.waitForTimeout(400);
    r.newScript = (await page.locator('input[value^="ai"]').count()) > 0 || before;
    if (shots) await page.screenshot({ path: `${shots}/hyperion-ai-${theme}-${width}.png` });
    await page.addScriptTag({ path: AXE });
    const ax = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`));
    r.axe = ax;
    r.sideways = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
