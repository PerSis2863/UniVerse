// M118 on the built Worker: a 3D game's Graphics button (Balanced → Sharp → Smooth → Balanced, kept
// on the device, its name saying the choice), none on the two flat games, the app's scene resting while a
// game covers the page (<html data-arena>) and waking after, and each round giving its WebGL context
// back when it ends. Axe on the game screen at 1280 and 390 (a touch phone), light and dark.
// The canvas is shrunk: WebGL here is drawn in software (SwiftShader), which is slow at full size.
import { createRequire } from 'node:module';
import { playwright, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = 'http://localhost:8787', who = 'alice@student.com';
async function axe(page) {
  await page.waitForTimeout(400);
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
}
const browser = await playwright().chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const out = {};
for (const [theme, width] of [['light', 1280], ['dark', 390]]) {
  const phone = width < 600;
  const r = (out[`${theme} ${width}`] = { axe: [] });
  const ctx = await signedIn(browser, base, who, { width, height: phone ? 844 : 860 }, phone ? { isMobile: true, hasTouch: true } : {});
  await ctx.addInitScript((th) => {
    localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential');
    document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '.arena canvas{width:320px!important;height:200px!important;inset:auto!important}'; document.head.appendChild(s); });
    window.__gl = { made: 0, lost: 0 };
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      const c = get.call(this, type, ...rest);
      if (c && /webgl/.test(type) && !this.__counted) { this.__counted = true; window.__gl.made++; this.addEventListener('webglcontextlost', () => window.__gl.lost++); }
      return c;
    };
  }, theme);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  const gfx = () => page.getByRole('button', { name: /^Graphics: / });
  await page.goto(`${base}/play/game?g=obby`, { waitUntil: 'load', timeout: 120_000 });
  await page.getByRole('button', { name: /Play solo/ }).first().click({ timeout: 60_000 });
  await page.waitForFunction(() => window.__gl.made > 0, null, { timeout: 90_000 });
  r.covered = await page.evaluate(() => document.documentElement.hasAttribute('data-arena'));
  r.names = [await gfx().textContent()];
  for (let i = 0; i < 3; i++) { await gfx().click(); r.names.push(await gfx().textContent()); }
  r.kept = await page.evaluate(() => localStorage.getItem('uv-play-gfx'));
  r.axe.push(...(await axe(page)).map((x) => `game ${x}`));
  r.wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  await page.getByRole('button', { name: 'Leave the game' }).click();
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await page.waitForTimeout(1500);
  r.uncovered = await page.evaluate(() => !document.documentElement.hasAttribute('data-arena'));
  r.contexts = await page.evaluate(() => `${window.__gl.made} made, ${window.__gl.lost} given back`);
  // A flat game: no graphics choice.
  await page.goto(`${base}/play/game?g=fakes`, { waitUntil: 'load', timeout: 120_000 });
  await page.getByRole('button', { name: /Play solo/ }).first().click({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Leave the game' }).waitFor({ timeout: 30_000 });
  r.flatButtons = await gfx().count();
  r.errors = errors;
  await ctx.close();
}
console.log(JSON.stringify(out, null, 2));
await browser.close();
