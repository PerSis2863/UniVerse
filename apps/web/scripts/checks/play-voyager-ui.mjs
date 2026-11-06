// M123 Solar Voyager on the built Worker (or BASE=… for local:dev): a solo round draws (the canvas
// isn't black), the marker names the planet to survey next, flying forward from the start surveys
// Earth (the count, the score and Earth's card), no page errors, no sideways scroll. Axe on the game
// screen at 1280 (dark) and 390 (a touch phone, light). WebGL here is drawn in software (SwiftShader).
import { createRequire } from 'node:module';
import { playwright, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', who = 'alice@student.com';
async function axe(page) {
  await page.waitForTimeout(400);
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
}
const browser = await playwright().chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const out = {};
for (const [theme, width] of [['dark', 1280], ['light', 390]]) {
  const phone = width < 600;
  const r = (out[`${theme} ${width}`] = { axe: [] });
  const ctx = await signedIn(browser, base, who, { width, height: phone ? 844 : 800 }, phone ? { isMobile: true, hasTouch: true } : {});
  await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); localStorage.setItem('uv-play-gfx', 'smooth'); }, theme);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  await page.goto(`${base}/play/game?g=voyager`, { waitUntil: 'load', timeout: 180_000 });
  await page.getByRole('button', { name: /Play solo/ }).first().click({ timeout: 60_000 });
  await page.locator('.arena canvas').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(12_000);
  // Drawn: a frame read back in the same frame it was drawn (after the world's own).
  r.drawn = await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => {
    const c = document.querySelector('.arena canvas'), k = document.createElement('canvas'); k.width = 64; k.height = 40;
    const g = k.getContext('2d'); g.drawImage(c, 0, 0, 64, 40);
    const d = g.getImageData(0, 0, 64, 40).data; let lit = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 90) lit++;
    res(`${Math.round((100 * lit) / (64 * 40))}% of the picture lit`);
  })));
  r.marker = (await page.locator('.arena').innerText()).match(/Earth · \d+ s away/)?.[0] ?? 'no marker';
  r.axe.push(...(await axe(page)).map((x) => `game ${x}`));
  r.wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (!phone) {
    // Fly forward until Earth is surveyed (the card shows for 9 s after).
    await page.keyboard.down('w');
    r.surveyed = await page.waitForFunction(() => /SURVEYED\s*1\/8/i.test(document.querySelector('.arena')?.innerText ?? ''), null, { timeout: 30_000, polling: 250 }).then(() => 'Earth surveyed', () => 'not surveyed');
    await page.keyboard.up('w');
    r.card = /The only world we know with life/.test(await page.locator('.arena').innerText()) ? 'shown' : 'not shown';
  } else r.buttons = (await Promise.all(['Boost', 'Up', 'Down'].map((n) => page.getByRole('button', { name: n }).count()))).every((n) => n > 0) ? 'Boost, Up, Down' : 'missing';
  r.errors = errors;
  await ctx.close();
}
console.log(JSON.stringify(out, null, 2));
await browser.close();
