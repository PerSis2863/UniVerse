// M561 Hyperion's last Octave wave in the Code window: a QR code drawn with imshow and impixelinfo's readout under
// the figure as the pointer moves over it; a Jupyter notebook opened from the computer becomes a script (its
// notebook view shows its parts) and saves back as .ipynb. Light and dark; axe; no page errors.
//   BASE=http://localhost:3000 node scripts/checks/hyperion-octave6-ui.mjs
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
const NB = JSON.stringify({ cells: [{ cell_type: 'markdown', source: ['# Squares\n', 'The first few.'] }, { cell_type: 'code', source: 'x = (1:4).^2' }], nbformat: 4 });
const browser = await launch();
const out = {}, errors = [];
try {
  for (const theme of ['light', 'dark']) {
    const r = (out[theme] = {});
    const ctx = await signedIn(browser, base, 'alice@student.com', { width: 1280, height: 900 });
    await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${theme}: ${e.message.slice(0, 200)}`));
    await page.goto(`${base}/hyperion`, { waitUntil: 'load', timeout: 240_000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    const cmd = page.getByPlaceholder('Type a command, then Enter');
    await cmd.waitFor({ timeout: 120_000 });
    await page.waitForTimeout(1500);
    await cmd.fill("q = qrcode('https://example.com'); imshow(~q); impixelinfo"); await cmd.press('Enter');
    const img = page.locator('[role=img][aria-label^="Figure"] image[data-px]').first();
    await img.waitFor({ timeout: 30_000 });
    const box = await img.evaluate((e) => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height }; });
    await page.mouse.move(box.x + 2, box.y + 2);
    await page.waitForTimeout(400);
    r.cornerReadout = await page.getByText(/^Pixel info:/).innerText();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(400);
    r.middleReadout = await page.getByText(/^Pixel info:/).innerText();
    if (shots) await page.screenshot({ path: `${shots}/octave6-${theme}.png` });
    await page.locator('input[type=file][accept*=".ipynb"]').setInputFiles({ name: 'squares.ipynb', mimeType: 'application/json', buffer: Buffer.from(NB) });
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Notebook view' }).click();
    r.parts = await page.locator('article h3').allInnerTexts();
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10_000 }), page.getByRole('button', { name: 'Jupyter notebook' }).click()]);
    r.saved = dl.suggestedFilename();
    await page.addScriptTag({ path: AXE });
    r.axe = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`));
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
