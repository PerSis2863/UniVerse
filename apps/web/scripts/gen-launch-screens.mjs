// The iPhone and iPad launch screens (M46): what a home-screen UniVerse shows while it opens, instead
// of a white flash. iOS wants one picture per screen size (it ignores the manifest for this), so this
// draws the icon on the dark page colour for each size in the built-in browser, writes them to
// public/splash/ (not stored by the service worker: iOS fetches them once, when the app is added) and
// the <link> list to src/lib/launch-screens.gen.ts (used by src/app/layout.tsx).
// Run from apps/web: node scripts/gen-launch-screens.mjs  (portrait only; dark, the app's default).
import { launch } from './browser-session.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// [CSS width, CSS height, pixel ratio]: iPhones from the SE to the 17 Pro Max, then iPads.
const SCREENS = [
  [440, 956, 3], [420, 912, 3], [402, 874, 3], [430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3],
  [375, 812, 3], [414, 896, 3], [414, 896, 2], [414, 736, 3], [375, 667, 2], [320, 568, 2],
  [1032, 1376, 2], [1024, 1366, 2], [834, 1210, 2], [834, 1194, 2], [820, 1180, 2], [834, 1112, 2], [810, 1080, 2], [768, 1024, 2], [744, 1133, 2],
];

const icon = `data:image/png;base64,${readFileSync('public/icon-512x512.png').toString('base64')}`;
const page = `<!doctype html><body style="margin:0;height:100vh;display:grid;place-items:center;background:#0b0b0c">
<img src="${icon}" alt="" style="width:112px;height:112px;border-radius:26px;box-shadow:0 0 0 .5px rgba(255,255,255,.08)"></body>`;

mkdirSync('public/splash', { recursive: true });
const browser = await launch();
const links = [];
for (const [w, h, dpr] of SCREENS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const p = await ctx.newPage();
  await p.setContent(page);
  const file = `public/splash/launch-${w * dpr}x${h * dpr}.png`;
  await p.screenshot({ path: file });
  await ctx.close();
  // Smaller files: one colour and the icon, 256 colours are plenty.
  execFileSync('convert', [file, '-strip', '-colors', '256', '-define', 'png:compression-level=9', file]);
  links.push({ href: file.slice('public'.length), media: `screen and (device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)` });
}
await browser.close();
writeFileSync('src/lib/launch-screens.gen.ts', `// Made by scripts/gen-launch-screens.mjs: don't edit by hand.\nexport const LAUNCH_SCREENS: { href: string; media: string }[] = ${JSON.stringify(links, null, 2)};\n`);
console.log(`${links.length} launch screens`);
