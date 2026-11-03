// M44 in the browser (dev server with demo login, or `pnpm local:serve`): the landing's live totals
// (from GET /api/impact/totals: rounded, nothing under 10) and the scroll story (the five apps'
// pictures one after another, the dots jumping to each). Axe and no sideways scroll at 390/1280.
//   node scripts/checks/landing-story-ui.mjs [http://localhost:3100]
import { createRequire } from 'node:module';
import { baseUrl, launch } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = baseUrl();
const fail = [];
const check = (ok, what) => { if (!ok) fail.push(what); };

const api = await fetch(base + '/api/impact/totals').then((r) => r.json());
check(api.totals && Object.values(api.totals).every((n) => n >= 10 && n % 10 === 0), `totals rounded, none under 10: ${JSON.stringify(api)}`);

const browser = await launch();
try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 860 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
    await page.goto(base + '/', { waitUntil: 'networkidle', timeout: 180_000 });
    const strip = page.getByRole('region', { name: 'UniVerse so far' });
    if (Object.keys(api.totals ?? {}).length) {
      await strip.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1800);
      check(/\d+\+/.test(await strip.innerText()), `totals ${width}: numbers shown`);
    }
    const story = page.locator('#story');
    const names = [];
    for (let i = 0; i < 5; i++) {
      await story.getByRole('list', { name: 'Apps' }).getByRole('button').nth(i).click();
      await page.waitForTimeout(1500);
      names.push(await story.locator('h2').innerText());
      check((await story.locator('[role="img"]:not([aria-hidden="true"] [role="img"])').count()) >= 1, `story ${width}: picture ${i} drawn`);
    }
    check(new Set(names).size === 5, `story ${width}: five apps in turn (${names.join(' / ')})`);
    await page.addScriptTag({ path: AXE });
    const bad = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
    for (const b of bad) fail.push(`${width} axe ${b}`);
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `${width}: sideways scrolling`);
    check(!errors.length, `${width}: page errors ${errors.join(' | ')}`);
    await page.close();
  }
} finally {
  await browser.close();
}

if (fail.length) { console.log(`FAILED (${fail.length}):\n- ${fail.join('\n- ')}`); process.exit(1); }
console.log('landing-story-ui: all good');
