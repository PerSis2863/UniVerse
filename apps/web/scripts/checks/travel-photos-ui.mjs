// M228 Travel's photos: each place's own photo, sharp at its size. On Explore, Find where to go, Trips and a guide
// (Kyoto, one of Explore's places; Ghent, any other place: its photo found by the server), at 1280 and 390 (a phone
// at 2x), light and dark: the cards' pictures are photos (not the 7:1 banners), the browser picked a width at least
// as wide as the picture is shown (no blowing up), cards below the fold wait (lazy), axe (serious/critical), no
// sideways scroll, no page errors. SHOTS=dir saves screenshots. Needs the internet (Wikivoyage, Wikimedia Commons).
// STAND_IN=1 answers the photo requests with a labelled stand-in of the asked width (for machines Wikimedia refuses,
// such as cloud sessions): the layout and the widths picked are checked, not the photos themselves.
// Runs against `local:serve` (or BASE=… for local:dev).
import { createRequire } from 'node:module';
import { playwright, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
async function axe(page) {
  await page.waitForTimeout(400);
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
}
/** The first few cover pictures: which file, the width the browser picked against the pixels it fills, lazy or not. */
const covers = (page, n) => page.evaluate((n) => [...document.querySelectorAll('img[srcset*="Special:FilePath"]')].slice(0, n).map((img) => {
  const u = new URL(img.currentSrc || img.src), file = decodeURIComponent(u.pathname.split('/').pop());
  return { file, picked: Number(u.searchParams.get('width')), needs: Math.round(img.getBoundingClientRect().width * devicePixelRatio), lazy: img.loading, loaded: img.naturalWidth };
}), n);

const browser = await playwright().chromium.launch();
const out = {};
for (const [theme, width] of [['light', 1280], ['dark', 1280], ['light', 390], ['dark', 390]]) {
  const phone = width < 600, r = (out[`${theme} ${width}`] = { axe: [] });
  const ctx = await signedIn(browser, base, 'alice@student.com', { width, height: phone ? 844 : 900 }, phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {});
  await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); localStorage.setItem('uv-travel-home', 'GB'); }, theme);
  const page = await ctx.newPage();
  if (process.env.STAND_IN) await page.route(/commons\.wikimedia\.org\/wiki\/Special:FilePath\//, (route) => {
    const u = new URL(route.request().url()), w = Number(u.searchParams.get('width')) || 960, h = Math.round(w / 1.5);
    const name = decodeURIComponent(u.pathname.split('/').pop()).replace(/[<&>]/g, '').slice(0, 40);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="#3b6ea5"/><stop offset="1" stop-color="#d9a441"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="40%" font-size="${w / 14}" text-anchor="middle" fill="#fff" font-family="sans-serif">${w}w</text><text x="50%" y="55%" font-size="${w / 30}" text-anchor="middle" fill="#fff" font-family="sans-serif">${name}</text></svg>`;
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  const visit = async (name, path, ready) => {
    await page.goto(`${base}${path}`, { waitUntil: 'load', timeout: 180_000 });
    await ready();
    await page.waitForTimeout(2500); // the photos arrive
    r[name] = await covers(page, phone ? 2 : 4);
    if (shots) await page.screenshot({ path: `${shots}/travel-${name}-${theme}-${width}.png` });
    r.axe.push(...(await axe(page)).map((x) => `${name} ${x}`));
    if (await wide()) r.axe.push(`${name}: sideways scroll`);
  };
  await visit('explore', '/travel', () => page.getByRole('heading', { name: /Places to start from/ }).waitFor({ timeout: 90_000 }));
  r.lazyBelow = await page.evaluate(() => [...document.querySelectorAll('img[srcset*="Special:FilePath"]')].slice(8).every((i) => i.loading === 'lazy'));
  await visit('find', '/travel?view=find', () => page.getByRole('group', { name: 'What you love' }).waitFor({ timeout: 90_000 }));
  await visit('trips', '/travel/saved', () => page.waitForLoadState('networkidle', { timeout: 90_000 }));
  await visit('guide', '/travel/guide?d=Kyoto', () => page.getByRole('heading', { name: 'Kyoto', level: 2 }).waitFor({ timeout: 120_000 }));
  if (!phone && theme === 'light') await visit('other', '/travel/guide?d=Ghent', () => page.getByRole('heading', { name: 'Ghent', level: 2 }).waitFor({ timeout: 120_000 }));
  r.errors = errors;
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
const all = Object.values(out);
const covered = all.flatMap((r) => ['explore', 'find', 'guide'].flatMap((k) => r[k] ?? []));
const ok = covered.length > 0 && covered.every((c) => !/banner/i.test(c.file) && c.picked >= Math.min(c.needs, 1920) * 0.9)
  && all.every((r) => !r.axe.length && !r.errors.length && r.lazyBelow);
console.log(ok ? 'OK' : 'PROBLEMS');
process.exit(ok ? 0 : 1);
