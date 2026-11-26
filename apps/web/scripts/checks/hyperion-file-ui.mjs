// M552 Simulate → 3D file: the sample bar solves on open (held Left, pushed Right), an STL file (a 60 × 30 × 15 mm
// block, binary) opens through the picker and solves. Axe at 1280, dark and light; no page errors.
//   BASE=http://localhost:3000 SHOTS=<folder> node scripts/checks/hyperion-file-ui.mjs
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
// A binary STL of a block.
const P = [[0, 0, 0], [60, 0, 0], [60, 30, 0], [0, 30, 0], [0, 0, 15], [60, 0, 15], [60, 30, 15], [0, 30, 15]];
const F = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
const buf = Buffer.alloc(84 + F.length * 50);
buf.writeUInt32LE(F.length, 80);
F.forEach((f, t) => f.forEach((i, v) => P[i].forEach((c, k) => buf.writeFloatLE(c, 84 + t * 50 + 12 + (v * 3 + k) * 4))));
const stl = join(tmpdir(), 'block.stl');
writeFileSync(stl, buf);
const browser = await launch();
const out = {}, errors = [];
try {
  for (const theme of ['dark', 'light']) {
    const r = (out[theme] = {});
    const ctx = await signedIn(browser, base, 'alice@student.com', { width: 1280, height: 900 });
    await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); localStorage.removeItem('uv-sim-file'); }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${theme}: ${e.message.slice(0, 200)}`));
    await page.goto(`${base}/hyperion/simulate`, { waitUntil: 'load', timeout: 240_000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.getByRole('group', { name: 'Kind of simulation' }).getByRole('button', { name: '3D file' }).click({ timeout: 120_000 });
    await page.locator('[data-file-verdict]').waitFor({ timeout: 90_000 });
    r.sample = await page.locator('[data-file-verdict]').innerText();
    await page.getByLabel('Open an STL file').setInputFiles(stl);
    await page.getByText('block.stl').waitFor({ timeout: 30_000 });
    await page.getByText(/^60 × 30 × 15 mm/).waitFor({ timeout: 90_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    r.block = await page.locator('[data-file-verdict]').innerText().catch(() => '');
    r.filled = await page.getByText(/filled with/).innerText().catch(() => '');
    r.solvedIn = await page.locator('dl').filter({ hasText: 'Solved in' }).innerText().then((t) => t.replace(/\n/g, ' ')).catch(() => '');
    if (shots) await page.screenshot({ path: `${shots}/file-${theme}.png` });
    await page.addScriptTag({ path: AXE });
    r.axe = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`));
    r.sideways = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
