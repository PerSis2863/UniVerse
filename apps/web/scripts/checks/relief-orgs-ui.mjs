// M106 Relief for organisations, in the browser (against `pnpm local:dev` on :3000 or the built
// Worker: pass its address). Alice starts an organisation with a base, adds two supplies and a
// two-place shift; Bob joins with the code, counts stock (allowed) but can't rename an item (refused),
// signs up for the shift; a third person can't take a place on a full shift; Alice takes a need near
// the base for the organisation and Bob (a volunteer) can't deliver it, then makes Bob a coordinator.
// The pages: Organisations, and each tab of the organisation, at 390 and 1280 px, light and dark,
// axe (serious/critical), no sideways scrolling, no page errors. Removes everything it made.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, signedIn } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const APP = fileURLToPath(new URL('../..', import.meta.url));
const base = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3000';
const A = 'alice@student.com', B = 'bob@student.com', C = 'demo@student.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => {
  const r = await fetch(`${base}/api/core${path}`, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, b: await r.json().catch(() => ({})) };
};
const sql = (command) => execSync(`npx wrangler d1 execute universe-db --local --command "${command.replace(/"/g, '\\"')}"`, { cwd: APP, stdio: 'ignore' });
let failures = 0;
const check = (ok, what) => { if (!ok) { failures++; console.log(`FAIL ${what}`); } };

const NAME = 'Relief UI Test Kitchen';
function cleanup() {
  sql(`DELETE FROM relief_posts WHERE title LIKE 'Relief UI need%'`);
  sql(`DELETE FROM relief_orgs WHERE name = '${NAME}'`);
  sql(`DELETE FROM notifications WHERE title LIKE '%Relief UI%' OR body LIKE '%Relief UI%'`);
}
cleanup();

// ── The rules, through the API ──────────────────────────────────────────────────────────────
const made = await call(A, '/relief/orgs', { name: NAME, kind: 'FOOD_BANK', about: 'Hot meals and parcels.', place: 'Test Town', lat: 51.5072, lng: -0.1276 });
check(made.s === 201, `start an organisation (${made.s} ${JSON.stringify(made.b)})`);
const org = made.b.id;
const water = await call(A, `/relief/orgs/${org}/supplies`, { name: 'Bottled water', kind: 'WATER', unit: 'bottles', quantity: 30, lowAt: 10 });
check(water.s === 201, 'add a supply');
await call(A, `/relief/orgs/${org}/supplies`, { name: 'Food parcels', kind: 'FOOD', unit: 'parcels', quantity: 4, lowAt: 5 });
const starts = new Date(Date.now() + 26 * 3_600_000).toISOString();
const shift = await call(A, `/relief/orgs/${org}/shifts`, { title: 'Relief UI sorting', startsAt: starts, hours: 3, slots: 2, place: 'The hall' });
check(shift.s === 201, 'add a shift');
const { b: dash } = await call(A, `/relief/orgs/${org}`);
check(/^[0-9A-Z]{6}$/.test(dash.org?.code ?? ''), 'the owner sees the join code');
check((await call(B, `/relief/orgs/${org}`)).s === 404, 'someone outside gets "not found"');
const joined = await call(B, '/relief/orgs/join', { code: dash.org.code.toLowerCase() });
check(joined.s === 200 && joined.b.id === org, 'join with the code (any case)');
const { b: bobView } = await call(B, `/relief/orgs/${org}`);
check(bobView.role === 'VOLUNTEER' && bobView.org.code === null, 'a volunteer does not see the code');
check((await call(B, `/relief/orgs/${org}/supplies/${water.b.id}`, { change: -5, note: 'Relief UI handed out' }, 'PATCH')).b.quantity === 25, 'a volunteer changes a count');
check((await call(B, `/relief/orgs/${org}/supplies/${water.b.id}`, { name: 'Renamed' }, 'PATCH')).s === 403, 'a volunteer cannot rename an item');
check((await call(B, `/relief/orgs/${org}/shifts`, { title: 'x', startsAt: starts, hours: 1, slots: 1 })).s === 403, 'a volunteer cannot add shifts');
check((await call(B, `/relief/shifts/${shift.b.id}/signup`, {})).s === 200, 'sign up for a shift');
check((await call(A, `/relief/shifts/${shift.b.id}/signup`, {})).s === 200, 'a second person signs up');
check((await call(C, `/relief/shifts/${shift.b.id}/signup`, {})).s === 400, 'a full shift takes no one else');
const { b: open } = await call(C, '/relief/orgs');
check(!open.shifts.some((s) => s.id === shift.b.id), 'a full shift is not listed as needing people');

// A need near the base, taken for the organisation.
const need = await call(C, '/relief/posts', { type: 'NEED', kind: 'FOOD', title: 'Relief UI need: meals for 3', people: 3, urgency: 'HIGH', lat: 51.51, lng: -0.12 });
check(need.s === 201, 'post a need near the base');
const { b: near } = await call(A, `/relief/orgs/${org}`);
check(near.near.some((p) => p.id === need.b.id), 'the need shows near the base');
check((await call(B, `/relief/posts/${need.b.id}/take`, { orgId: org })).s === 403, 'a volunteer cannot take needs for the organisation');
check((await call(A, `/relief/posts/${need.b.id}/take`, { orgId: org })).s === 200, 'the owner takes it for the organisation');
check((await call(B, `/relief/posts/${need.b.id}/done`, {})).s === 403, 'a volunteer cannot deliver it');
check((await call(A, `/relief/orgs/${org}/members/${bobView.members.find((m) => m.me).id}`, { role: 'COORDINATOR' }, 'PATCH')).s === 200, 'make Bob a coordinator');
check((await call(B, `/relief/posts/${need.b.id}/done`, {})).s === 200, 'a coordinator delivers what the organisation took');
const { b: map } = await call(C, '/relief/map');
check(JSON.stringify(map).indexOf('@') < 0, 'the map holds no email addresses');

// ── The pages ───────────────────────────────────────────────────────────────────────────────
const browser = await launch();
for (const [w, h] of [[390, 844], [1280, 900]]) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await signedIn(browser, base, A, { width: w, height: h }, { colorScheme: scheme });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const visit = async (url, wait, what) => {
      await page.goto(base + url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
      await page.getByText(wait, { exact: false }).first().waitFor({ timeout: 60_000 });
      await page.waitForTimeout(500);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(wide <= 1, `${what} ${w} ${scheme}: no sideways scrolling (${wide}px)`);
      await page.addScriptTag({ path: AXE });
      const bad = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
      check(bad.length === 0, `${what} ${w} ${scheme}: axe ${bad.join('; ')}`);
    };
    await visit('/relief/orgs', NAME, 'Organisations');
    await visit(`/relief/orgs?org=${org}`, 'Supplies running low', 'Overview');
    for (const tab of ['Needs', 'Supplies', 'Shifts', 'Members']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await page.waitForTimeout(400);
      await page.addScriptTag({ path: AXE });
      const bad = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
      check(bad.length === 0, `${tab} ${w} ${scheme}: axe ${bad.join('; ')}`);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(wide <= 1, `${tab} ${w} ${scheme}: no sideways scrolling (${wide}px)`);
    }
    if (w === 1280 && scheme === 'dark') {
      await page.getByRole('button', { name: 'Supplies', exact: true }).click();
      await page.getByRole('button', { name: 'One more Bottled water' }).click();
      await page.getByText('26', { exact: true }).first().waitFor({ timeout: 10_000 }).catch(() => check(false, 'the + button adds one'));
    }
    check(errors.length === 0, `${w} ${scheme}: page errors ${errors.join(' | ')}`);
    await ctx.close();
  }
}
await browser.close();
cleanup();
console.log(failures ? `${failures} failed` : 'relief-orgs-ui: all passed');
process.exit(failures ? 1 : 0);
