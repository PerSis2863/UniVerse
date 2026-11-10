// M162 (dev server or built Worker): arrow buttons answer a press: the arrow darts the way it points (its
// `translate`), a plain button sinks (`scale`), and content an arrow changes slides in (`.swap`). On the
// staff register (day arrows) and the calendar (week arrows).
//   node scripts/checks/arrows-ui.mjs [http://localhost:8787]
import { baseUrl, launch, signedIn } from '../browser-session.mjs';
const B = baseUrl();
const browser = await launch();
const out = [], fail = [];
const cases = [
  ['demo@admin.com', '/admin/staff', /Previous day|Next day/],
  ['demo@teacher.com', '/teacher/calendar', /Previous|Next|Earlier|Later/],
];
for (const [who, path, name] of cases) {
  const ctx = await signedIn(browser, B, who, { width: 1280, height: 900 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail.push(`${path}: ${e.message.slice(0, 120)}`));
  await page.goto(B + path, { waitUntil: 'load', timeout: 240000 });
  await page.waitForTimeout(3000);
  // On the tasks page, choose the month view if there is one.
  const btn = page.getByRole('button', { name }).first();
  if (!(await btn.count())) { fail.push(`${path}: no arrow button matching ${name}`); await ctx.close(); continue; }
  await btn.click();
  await page.waitForTimeout(40);
  const r = await page.evaluate(() => {
    const anims = document.getAnimations().map((a) => (a.effect?.target instanceof Element ? `${a.effect.target.tagName.toLowerCase()}${a.effect.target.classList.contains('swap') ? '.swap' : ''}:${a.animationName ?? (a.effect.getKeyframes?.()[1] ? Object.keys(a.effect.getKeyframes()[1]).filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)).join('+') : '')}` : ''));
    return anims.filter((x) => /svg:translate|button:scale|\.swap|swap-|drp-turn|cal|slide/.test(x));
  });
  out.push(`${path}: ${[...new Set(r)].join(', ') || 'nothing moved'}`);
  if (!r.some((x) => x.startsWith('svg:translate'))) fail.push(`${path}: the arrow did not dart`);
  if (path === '/admin/staff' && !r.some((x) => x.startsWith('div.swap'))) fail.push(`${path}: the day did not slide in`);
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify({ out, fail }, null, 1));
process.exit(fail.length ? 1 : 0);
