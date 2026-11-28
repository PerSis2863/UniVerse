// M577 Simulate → Machines → Labeller: a scenario's camera frames draw, "Label every frame from the scenario's truth"
// boxes the cars on every frame, a drag draws a box of its own, a ROS bag's camera topic opens as frames (M578), the arrow buttons change frames, axe is clean
// (serious/critical) at 1280 in light and dark, no sideways scroll, no page errors. Computers only (M405).
//   BASE=http://localhost:3000 SHOTS=<folder> node scripts/checks/hyperion-labeller-ui.mjs
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
const browser = await launch();
const out = {}, errors = [], fail = [];
// M578: a ROS 1 bag holding two 64×48 rgb8 pictures on /camera (built from the rosbag 2.0 layout)
const n32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const fld = (k, v) => { const f = Buffer.concat([Buffer.from(`${k}=`), Buffer.from(v)]); return Buffer.concat([n32(f.length), f]); };
const rec = (h, d) => { const hd = Buffer.concat(h.map(([k, v]) => fld(k, v))); return Buffer.concat([n32(hd.length), hd, n32(d.length), d]); };
const DEF = 'Header header\nuint32 height\nuint32 width\nstring encoding\nuint8 is_bigendian\nuint32 step\nuint8[] data\n====\nMSG: std_msgs/Header\nuint32 seq\ntime stamp\nstring frame_id\n';
const conn = rec([['op', [7]], ['conn', n32(0)], ['topic', '/camera']], Buffer.concat([fld('topic', '/camera'), fld('type', 'sensor_msgs/Image'), fld('md5sum', '*'), fld('message_definition', DEF)]));
const pic = (s) => { const px = Buffer.alloc(64 * 48 * 3); for (let i = 0; i < 64 * 48; i++) px.set([s, 120, 255 - s], 3 * i); const str = (x) => Buffer.concat([n32(x.length), Buffer.from(x)]); return Buffer.concat([n32(0), n32(s), n32(0), str('cam'), n32(48), n32(64), str('rgb8'), Buffer.from([0]), n32(192), n32(px.length), px]); };
const msg = (s) => rec([['op', [2]], ['conn', n32(0)], ['time', Buffer.concat([n32(s), n32(0)])]], pic(s));
const inner = Buffer.concat([conn, msg(10), msg(11)]);
const BAG = Buffer.concat([Buffer.from('#ROSBAG V2.0\n'), rec([['op', [5]], ['compression', 'none'], ['size', n32(inner.length)]], inner), conn]);
const boxesOf = async (page) => Number(/: (\d+) boxes/.exec(await page.locator('section[aria-label="The frame"] canvas').getAttribute('aria-label'))?.[1] ?? -1);
try {
  for (const theme of ['light', 'dark']) {
    const ctx = await signedIn(browser, base, 'alice@student.com', { width: 1280, height: 900 });
    await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); sessionStorage.setItem('uv-sim-kind', 'machines'); sessionStorage.setItem('uv-sim-machine', 'labeller'); }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${theme}: ${e.message.slice(0, 200)}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|posthog/i.test(m.text())) errors.push(`${theme} console: ${m.text().slice(0, 200)}`); });
    await page.goto(`${base}/hyperion/simulate`, { waitUntil: 'load', timeout: 240_000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    const cv = page.locator('section[aria-label="The frame"] canvas');
    await cv.waitFor({ timeout: 120_000 });
    await page.waitForTimeout(800);
    const r = (out[theme] = {});
    r.inked = await cv.evaluate((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let k = 0; for (let j = 0; j < d.length; j += 4000) if (d[j + 3]) k++; return k; });
    if (r.inked < 50) fail.push(`${theme}: the frame is empty`);
    await page.getByRole('button', { name: /from the scenario/ }).click();
    await page.waitForTimeout(800);
    r.auto = await boxesOf(page);
    if (r.auto < 1) fail.push(`${theme}: no boxes from the truth (${r.auto})`);
    await page.getByRole('button', { name: 'Next frame' }).click();
    await page.waitForTimeout(300);
    r.next = await page.getByRole('slider', { name: 'Frame' }).inputValue();
    if (r.next !== '1') fail.push(`${theme}: Next frame went to ${r.next}`);
    const b = await cv.boundingBox(), before = await boxesOf(page);
    await page.mouse.move(b.x + b.width * 0.1, b.y + b.height * 0.1); await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.25, { steps: 5 }); await page.mouse.up();
    await page.waitForTimeout(300);
    r.drawn = await boxesOf(page);
    if (r.drawn !== before + 1) fail.push(`${theme}: drawing a box went ${before} → ${r.drawn}`);
    if (shots) await page.screenshot({ path: `${shots}/labeller-${theme}.png` });
    await page.locator('input[type="file"][accept*=".bag"]').setInputFiles({ name: 'drive.bag', mimeType: 'application/octet-stream', buffer: BAG });
    await page.waitForTimeout(800);
    r.bag = await page.getByRole('slider', { name: 'Frame' }).getAttribute('max');
    r.bagNote = await page.locator('p.bg-amber-50').allInnerTexts();
    if (r.bag !== '1' || r.bagNote.length) fail.push(`${theme}: the bag gave ${r.bag} (${r.bagNote.join(' ')})`);
    r.bagPx = await cv.evaluate((c) => [...c.getContext('2d').getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data].slice(0, 3).join(','));
    if (r.bagPx !== '10,120,245') fail.push(`${theme}: the bag's picture drew ${r.bagPx}`);
    await page.addScriptTag({ path: AXE });
    const axe = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`));
    if (axe.length) fail.push(`${theme} axe: ${axe.join('; ')}`);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) fail.push(`${theme}: sideways scroll`);
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
if (fail.length || errors.length) { console.error(fail.join('\n')); process.exit(1); }
console.log('labeller ok');
