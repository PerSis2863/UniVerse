// Films how the app appears on a phone, frame by frame: a reload of a page and a tap on the tab bar,
// on a 390 × 844 touch screen with the CPU slowed (4× by default, about a budget Android phone).
// Writes the frames and one contact sheet per scene (every frame with its time), to compare with a
// reference recording or with an earlier run: look for blank frames, jumps and parts that pop in.
//
//   pnpm local:serve --test-secret            (in another terminal: the built site)
//   node scripts/load-film.mjs [http://localhost:8787] [--out dir] [--slow 4] [--path /student] [--tab /student/courses]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { baseUrl, launch, signedIn } from './browser-session.mjs';

const base = baseUrl();
const arg = (name, d) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : d);
const out = resolve(arg('--out', 'load-film'));
const slow = Number(arg('--slow', '4'));
const path = arg('--path', '/student');
const tab = arg('--tab', '/student/courses');
mkdirSync(out, { recursive: true });

const browser = await launch();
const ctx = await signedIn(browser, base, 'demo@student.com', { width: 390, height: 844 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);

/** Records the screen while `act` runs and for `ms` after; returns [{ t, file }]. */
async function film(name, act, ms = 2200) {
  const frames = [];
  let t0 = 0;
  const onFrame = async ({ data, sessionId, metadata }) => {
    const t = Math.round(metadata.timestamp * 1000 - t0);
    const file = `${name}-${String(frames.length).padStart(3, '0')}.jpg`;
    writeFileSync(join(out, file), Buffer.from(data, 'base64'));
    frames.push({ t, file });
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  };
  cdp.on('Page.screencastFrame', onFrame);
  t0 = Date.now();
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: 390, maxHeight: 844, everyNthFrame: 1 });
  await act();
  await page.waitForTimeout(ms);
  await cdp.send('Page.stopScreencast');
  cdp.off('Page.screencastFrame', onFrame);
  return frames.filter((f) => f.t >= -50);
}

/** One picture with every frame in a grid, each labelled with its time. */
async function contactSheet(name, frames) {
  const cells = frames.map((f) => `<figure><img src="${f.file}"><figcaption>${f.t} ms</figcaption></figure>`).join('');
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#222;font:12px system-ui;color:#fff}
    main{display:grid;grid-template-columns:repeat(8,195px);gap:6px;padding:6px}figure{margin:0}img{width:195px;display:block;border:1px solid #444}
    figcaption{padding:2px 0}</style><main>${cells}</main>`;
  const file = join(out, `${name}.html`);
  writeFileSync(file, html);
  const sheet = await ctx.newPage();
  await sheet.setViewportSize({ width: 8 * 201 + 6, height: 800 });
  await sheet.goto(`file://${file}`);
  await sheet.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  await sheet.close();
  console.log(`${name}: ${frames.length} frames → ${join(out, `${name}.png`)}`);
}

await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60_000 });
await page.waitForTimeout(2000);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: slow });

// 1. A reload: what you see from the tap on reload until the page has settled.
await contactSheet('reload', await film('reload', () => page.reload({ waitUntil: 'commit' }), 3500));
await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(1500);

// 2. A tap on the tab bar.
const link = await page.locator(`nav[aria-label="Primary"] a[href="${tab}"]`).elementHandle({ timeout: 10_000 }).catch(() => null);
if (link) await contactSheet('tab', await film('tab', () => link.tap(), 2200));
else console.log(`no tab bar link to ${tab}`);

await browser.close();
