// Ghidra's corner chat opens like RunPod's assistant (the owner, 23 Nov): a few suggestions over one question box, no
// greeting; the button turns into a close; Escape closes it; a suggestion opens the conversation window; "New chat"
// goes back. Axe at 1280 and 390, light and dark, no sideways scrolling. Screenshots in the scratch folder (SHOTS=dir).
//   node scripts/checks/ghidra-open-ui.mjs [http://localhost:3000]
import { createRequire } from 'node:module';
import { baseUrl, launch, signedIn } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = baseUrl();
const shots = process.env.SHOTS;
const fail = [];
const browser = await launch();
try {
  for (const width of [1280, 390]) {
    for (const theme of ['light', 'dark']) {
      const what = `${width} ${theme}`;
      const ctx = await signedIn(browser, base, 'demo@student.com', { width, height: 900 }, width < 600 ? { isMobile: true, hasTouch: true } : {});
      await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t); sessionStorage.setItem('universe:sample-mode', '1'); } catch { /* a locked frame */ } }, theme);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => fail.push(`${what}: ${e.message}`));
      await page.goto(base + '/student', { waitUntil: 'load', timeout: 240_000 });
      await page.waitForTimeout(3000);
      if (width > 600) await page.getByRole('button', { name: 'Open Ghidra, your assistant' }).click();
      else await page.evaluate(() => window.dispatchEvent(new Event('universe:open-assistant')));
      const box = page.getByRole('textbox', { name: 'Message Ghidra' });
      await box.waitFor({ timeout: 10_000 }).catch(() => fail.push(`${what}: no question box`));
      await page.waitForTimeout(500);
      if (await page.getByText(/^Hi, I'm Ghidra/).count()) fail.push(`${what}: the old greeting is still there`);
      if (!(await page.getByRole('button', { name: 'What’s due this week?' }).count())) fail.push(`${what}: no suggestions`);
      if (width > 600 && !(await page.getByRole('button', { name: 'Close Ghidra', exact: true }).first().count())) fail.push(`${what}: the button doesn't close`);
      if (shots) await page.screenshot({ path: `${shots}/ghidra-open-${width}-${theme}.png` });
      await page.addScriptTag({ path: AXE });
      const bad = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} ${v.nodes[0]?.target}`));
      for (const b of bad) fail.push(`${what}: axe ${b}`);
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) fail.push(`${what}: sideways scrolling`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(900);
      if (await box.count()) fail.push(`${what}: Escape didn't close it`);
      if (width > 600 && theme === 'light') {
        await page.getByRole('button', { name: 'Open Ghidra, your assistant' }).click();
        await page.getByRole('button', { name: 'What’s due this week?' }).click();
        await page.getByRole('button', { name: 'New chat' }).waitFor({ timeout: 10_000 }).catch(() => fail.push(`${what}: no conversation window`));
        if (shots) { await page.waitForTimeout(2500); await page.screenshot({ path: `${shots}/ghidra-chat-${width}.png` }); }
        await page.getByRole('button', { name: 'New chat' }).click().catch(() => {});
        await page.getByRole('button', { name: 'What’s due this week?' }).waitFor({ timeout: 5000 }).catch(() => fail.push(`${what}: New chat didn't go back`));
      }
      await ctx.close();
    }
  }
} finally { await browser.close(); }
console.log(fail.length ? fail.join('\n') : 'ghidra-open: all good');
process.exit(fail.length ? 1 : 0);
