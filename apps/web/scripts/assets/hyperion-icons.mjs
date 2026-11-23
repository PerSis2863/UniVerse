// Hyperion's app icons (M409): a white Σ (the menu's Sigma icon) on a violet tile, drawn by the browser and saved as
// PNG for the installed app (public/hyperion/). Run once from apps/web: node scripts/assets/hyperion-icons.mjs
import { playwright } from '../browser-session.mjs';
const { chromium } = playwright();
const SIGMA = 'M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2';
const svg = (size, full) => {
  const r = full ? 0 : size * 0.22, inner = full ? 0.5 : 0.62, s = (size * inner) / 24, o = (size - 24 * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#5b21b6"/></linearGradient></defs>
  <rect width="${size}" height="${size}" rx="${r}" fill="url(#g)"/>
  <g transform="translate(${o} ${o}) scale(${s})"><path d="${SIGMA}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
};
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, full] of [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-maskable.png', 512, true], ['icon-180.png', 180, true]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(size, full)}</body></html>`);
  await page.screenshot({ path: `public/hyperion/${name}`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
