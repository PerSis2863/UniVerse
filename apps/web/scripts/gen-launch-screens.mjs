// The iPhone and iPad launch screens (M46, M47): what a home-screen UniVerse shows while it opens,
// instead of a white flash. iOS wants one picture per screen size and turn (it ignores the manifest
// for this), so this draws the icon on the page colour of each theme for each size in the built-in
// browser (iPhones upright, iPads upright and sideways), writes them to public/splash/ (not stored by
// the service worker: iOS fetches them when the app is added) and the size list to
// src/lib/launch-screens.gen.ts (the head script in src/lib/theme.ts links the chosen theme's ones).
// Run from apps/web: node scripts/gen-launch-screens.mjs
import { launch } from './browser-session.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

// [CSS width, CSS height, pixel ratio]: iPhones from the SE to the 17 Pro Max, then iPads (sideways too).
const FIRST_IPAD = 13; // SCREENS[13] on are iPads
const SCREENS = [
  [440, 956, 3], [420, 912, 3], [402, 874, 3], [430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3],
  [375, 812, 3], [414, 896, 3], [414, 896, 2], [414, 736, 3], [375, 667, 2], [320, 568, 2],
  [1032, 1376, 2], [1024, 1366, 2], [834, 1210, 2], [834, 1194, 2], [820, 1180, 2], [834, 1112, 2], [810, 1080, 2], [768, 1024, 2], [744, 1133, 2],
];

const icon = `data:image/png;base64,${readFileSync('public/icon-512x512.png').toString('base64')}`;
const THEMES = { dark: ['#171f44', 'rgba(255,255,255,.08)'], light: ['#f0f0f0', 'rgba(0,0,0,.08)'] };
const page = ([bg, line]) => `<!doctype html><body style="margin:0;height:100vh;display:grid;place-items:center;background:${bg}">
<img src="${icon}" alt="" style="width:112px;height:112px;border-radius:26px;box-shadow:0 0 0 .5px ${line}"></body>`;

rmSync('public/splash', { recursive: true, force: true });
mkdirSync('public/splash', { recursive: true });
const browser = await launch();
const list = [];
for (const [n, [w, h, dpr]] of SCREENS.entries()) {
  const turns = n >= FIRST_IPAD ? [false, true] : [false];
  list.push([w, h, dpr, turns.length - 1]);
  for (const [theme, colours] of Object.entries(THEMES)) {
    for (const side of turns) {
      const [vw, vh] = side ? [h, w] : [w, h];
      const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
      const p = await ctx.newPage();
      await p.setContent(page(colours));
      const file = `public/splash/${theme}-${vw * dpr}x${vh * dpr}.png`;
      await p.screenshot({ path: file });
      await ctx.close();
      // Smaller files: one colour and the icon, 256 colours are plenty.
      execFileSync('convert', [file, '-strip', '-colors', '256', '-define', 'png:compression-level=9', file]);
    }
  }
}
await browser.close();
writeFileSync('src/lib/launch-screens.gen.ts', `// Made by scripts/gen-launch-screens.mjs: don't edit by hand.\n/** [CSS width, CSS height, pixel ratio, 1 = also sideways]: public/splash/<theme>-<px wide>x<px high>.png */\nexport const LAUNCH: [number, number, number, 0 | 1][] = ${JSON.stringify(list)};\n`);
console.log(`${list.length} screens`);
