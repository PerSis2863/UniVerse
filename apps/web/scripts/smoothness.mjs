// How smooth the app feels on a modest phone: taps on the tab bar, opening and closing sheets and
// the side menu, and scrolling long lists, on a 390 × 844 touch screen with the CPU slowed 4× (about
// a budget Android phone). For each action it records every frame for 1.5 s after the tap and the
// main thread's long tasks (> 50 ms, when taps feel stuck).
//
//   pnpm local:serve --test-secret            (in another terminal: the built site)
//   node scripts/smoothness.mjs [http://localhost:8787] [--slow 4] [--json out.json] [--profile "side menu"]
//
// Reports, per action: frames, slow frames (> 34 ms: under 30 per second), the slowest frame, and
// the long tasks' total; --profile adds the busiest functions for the actions whose name contains
// the text. Nothing is changed in the database except what opening pages records.
import { writeFileSync } from 'node:fs';
import { baseUrl, launch, signedIn } from './browser-session.mjs';

const base = baseUrl();
const arg = (name, d) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : d);
const slow = Number(arg('--slow', '4'));
const jsonOut = arg('--json', null);
const profileFor = arg('--profile', null);

const browser = await launch();
const ctx = await signedIn(browser, base, 'demo@student.com', { width: 390, height: 844 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  // Frames and long tasks, recorded between start() and stop().
  window.__smooth = { frames: [], long: 0, rec: false };
  new PerformanceObserver((list) => { if (window.__smooth.rec) for (const e of list.getEntries()) window.__smooth.long += e.duration; }).observe({ type: 'longtask', buffered: false });
  window.__smoothStart = () => {
    const s = window.__smooth; s.frames = []; s.long = 0; s.rec = true;
    let last = performance.now();
    const tick = (t) => { if (!s.rec) return; s.frames.push(t - last); last = t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  };
  window.__smoothStop = () => { const s = window.__smooth; s.rec = false; return { frames: s.frames, long: s.long }; };
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const results = [];

// `act` gets the target already found (finding a button by its name is itself a long task at 4×
// slower CPU, so it happens before the clock starts).
async function measure(name, act, ms = 1500, target = null) {
  const el = target ? await target.elementHandle({ timeout: 10_000 }) : null;
  const profiling = profileFor && name.includes(profileFor);
  if (profiling) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 250 }); await cdp.send('Profiler.start'); }
  await page.evaluate(() => window.__smoothStart());
  await act(el);
  await page.waitForTimeout(ms);
  const { frames, long } = await page.evaluate(() => window.__smoothStop());
  if (profiling) printProfile(name, (await cdp.send('Profiler.stop')).profile);
  const slowFrames = frames.filter((f) => f > 34).length;
  const r = { name, frames: frames.length, slow: slowFrames, worst: Math.round(Math.max(0, ...frames)), longTasks: Math.round(long) };
  results.push(r);
  console.log(`${name.padEnd(42)} frames ${String(r.frames).padStart(3)}  slow ${String(r.slow).padStart(3)}  worst ${String(r.worst).padStart(4)} ms  long tasks ${String(r.longTasks).padStart(5)} ms`);
}

// Self time per function (and its script), busiest first.
function printProfile(name, profile) {
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  profile.samples.forEach((id, i) => {
    const { functionName, url, lineNumber, columnNumber } = nodes.get(id).callFrame;
    if (['(idle)', '(program)', '(root)'].includes(functionName)) return;
    const key = `${functionName || '(anonymous)'}  ${url.replace(base, '') || '(native)'}:${lineNumber + 1}:${columnNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[i] ?? 0));
  });
  console.log(`  busiest in "${name}":`);
  for (const [key, us] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`    ${String(Math.round(us / 1000)).padStart(4)} ms  ${key}`);
}

const settle = async () => { await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {}); await page.waitForTimeout(800); };

await page.goto(`${base}/student`, { waitUntil: 'networkidle', timeout: 60_000 });
await page.waitForTimeout(2500); // the idle shell (palette, assistant) loads first
await cdp.send('Emulation.setCPUThrottlingRate', { rate: slow });

// The tab bar: each section, then back home.
const tabs = await page.locator('nav[aria-label="Primary"] a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
for (const href of [...tabs.slice(1), tabs[0]]) {
  await measure(`tab bar → ${href}`, (el) => el.tap(), 1500, page.locator(`nav[aria-label="Primary"] a[href="${href}"]`));
  await settle();
}
// The side menu ("More") open and closed; Quick create; notifications; search.
const more = page.locator('nav[aria-label="Primary"] button').last();
await measure('side menu opens', (el) => el.tap(), 1500, more);
await measure('side menu closes', () => page.keyboard.press('Escape'));
await settle();
await measure('quick create opens', (el) => el.tap(), 1500, page.getByRole('button', { name: 'Quick create' }));
await measure('quick create closes', () => page.keyboard.press('Escape'));
await measure('notifications open', (el) => el.tap(), 1500, page.getByRole('button', { name: /^Notifications/ }).first());
await measure('notifications close', () => page.keyboard.press('Escape'));
// Long lists: scrolling by finger.
for (const path of ['/student/courses', '/student/assignments', '/student/inbox', '/student/calendar', '/notifications']) {
  await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(1200);
  await measure(`scroll ${path}`, async () => {
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 450); await page.waitForTimeout(120); }
  }, 900);
}
// A course page from its tile (list → detail), and back.
await page.goto(`${base}/student/courses`, { waitUntil: 'networkidle', timeout: 60_000 });
await page.waitForTimeout(1000);
const course = page.locator('main a[href^="/student/courses/"], main a[href^="/student/blackboard"]').first();
if (await course.count()) {
  await measure('course tile → course page', (el) => el.tap(), 1500, course);
  await settle();
  await measure('back to courses', () => page.goBack());
  await settle();
}

await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
await browser.close();
const total = results.reduce((a, r) => ({ frames: a.frames + r.frames, slow: a.slow + r.slow }), { frames: 0, slow: 0 });
console.log(`\n${results.length} actions at ${slow}× slower CPU: ${total.slow} of ${total.frames} frames slow (${((total.slow / Math.max(1, total.frames)) * 100).toFixed(1)} %)`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 1));
