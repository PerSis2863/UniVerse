// Q17 student life in the browser on the built Worker, served with `pnpm local:serve --payments-test --test-secret`.
// Tickets: buy a paid ticket (the made-up checkout comes straight back as paid), show it as a QR, a
// sold-out event, free seats and the waiting list; the door scanner (the demo admin is read-only, so
// the scan itself is unit-tested: src/server/event-tickets.test.ts). Club: call an election, a secret
// vote with a receipt, one vote each, results after closing with the receipt found and the fingerprint
// checked; the budget. Campus board: post, message the poster, reports hiding a post, rides. Cafeteria:
// pre-order, the code, cancel; the kitchen page. Sample mode. Axe at 390/1280, light/dark.
// Adds a test school, two events, a club and a menu, and removes them (and what the test made) at the end.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const APP = fileURLToPath(new URL('../..', import.meta.url));
const base = 'http://localhost:8787', A = 'alice@student.com', B = 'bob@student.com', S = 'demo@student.com', T = 'demo@teacher.com', ADMIN = 'demo@admin.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => {
  const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, b: await r.json().catch(() => ({})) };
};
const sql = (c) => execSync(`npx wrangler d1 execute universe-db --local --command "${c.replace(/"/g, '\\"')}"`, { cwd: APP, stdio: 'ignore' });
const rows = (c) => JSON.parse(execSync(`npx wrangler d1 execute universe-db --local --json --command "${c.replace(/"/g, '\\"')}"`, { cwd: APP, stdio: ['ignore', 'pipe', 'ignore'] }).toString())[0].results;
const user = (email) => `(SELECT id FROM users WHERE email='${email}')`;
const now = Date.now(), iso = (ms) => new Date(ms).toISOString().replace('Z', '+00:00');

// ── Test data ─────────────────────────────────────────────────────────────
const ORG = 'life-ui-org', PAID = 'life-ui-paid', FREE = 'life-ui-free', CLUB = 'life-ui-club', MENU = 'life-ui-menu';
const chatBefore = rows(`SELECT c.id FROM conversations c WHERE c.isGroup=0 AND EXISTS (SELECT 1 FROM conversation_participants p WHERE p.conversationId=c.id AND p.userId=${user(A)}) AND EXISTS (SELECT 1 FROM conversation_participants p WHERE p.conversationId=c.id AND p.userId=${user(B)})`).map((r) => r.id);
function cleanup() {
  sql(`DELETE FROM payment_orders WHERE organizationId='${ORG}'`);
  sql(`DELETE FROM event_rsvps WHERE itemId IN ('${PAID}', '${FREE}')`);
  sql(`DELETE FROM meal_orders WHERE menuId='${MENU}'`);
  sql(`DELETE FROM campus_items WHERE id IN ('${PAID}', '${FREE}', '${MENU}')`);
  sql(`DELETE FROM club_ballots WHERE electionId IN (SELECT id FROM club_elections WHERE associationId='${CLUB}')`);
  sql(`DELETE FROM club_voters WHERE electionId IN (SELECT id FROM club_elections WHERE associationId='${CLUB}')`);
  sql(`DELETE FROM club_elections WHERE associationId='${CLUB}'`);
  sql(`DELETE FROM club_budget_entries WHERE associationId='${CLUB}'`);
  sql(`DELETE FROM association_memberships WHERE associationId='${CLUB}'`);
  sql(`DELETE FROM associations WHERE id='${CLUB}'`);
  sql(`DELETE FROM listing_reports WHERE listingId IN (SELECT id FROM campus_listings WHERE title LIKE 'Life UI%')`);
  sql(`DELETE FROM campus_listings WHERE title LIKE 'Life UI%'`);
  sql(`DELETE FROM organizations WHERE id='${ORG}'`);
  sql(`DELETE FROM notifications WHERE title LIKE '%Life UI%'`);
  const chats = rows(`SELECT c.id FROM conversations c WHERE c.isGroup=0 AND EXISTS (SELECT 1 FROM conversation_participants p WHERE p.conversationId=c.id AND p.userId=${user(A)}) AND EXISTS (SELECT 1 FROM conversation_participants p WHERE p.conversationId=c.id AND p.userId=${user(B)})`).map((r) => r.id).filter((id) => !chatBefore.includes(id));
  for (const id of chats) { sql(`DELETE FROM conversation_participants WHERE conversationId='${id}'`); sql(`DELETE FROM conversations WHERE id='${id}'`); }
}
cleanup();
sql(`INSERT INTO organizations (id, name, ownerId, updatedAt) VALUES ('${ORG}', 'Life UI School', ${user(ADMIN)}, '${iso(now)}')`);
sql(`INSERT INTO campus_items (id, kind, title, startAt, capacity, price, currency, location, updatedAt) VALUES ('${PAID}', 'EVENT', 'Life UI Gala', '${iso(now + 5 * 86_400_000)}', 2, 15000, 'INR', 'Main Hall', '${iso(now)}'), ('${FREE}', 'EVENT', 'Life UI Talk', '${iso(now + 6 * 86_400_000)}', 1, NULL, NULL, 'Room 4', '${iso(now)}')`);
sql(`INSERT INTO campus_items (id, kind, category, title, location, description, startAt, updatedAt) VALUES ('${MENU}', 'MENU', 'Lunch', 'Life UI Canteen', 'Block C', 'Life UI dal\nLife UI rice\nLife UI salad', '${iso(now + 3_600_000)}', '${iso(now)}')`);
sql(`INSERT INTO associations (id, name, category, description, status, budget, updatedAt) VALUES ('${CLUB}', 'Life UI Debate Club', 'Academic', 'A test club.', 'ACTIVE', 5000, '${iso(now)}')`);
sql(`INSERT INTO association_memberships (id, userId, associationId, role) VALUES ('life-ui-m1', ${user(A)}, '${CLUB}', 'FOUNDER'), ('life-ui-m2', ${user(B)}, '${CLUB}', 'MEMBER')`);

const api = {};
// Free seats and the waiting list; paid events need a ticket.
api.bobFree = (await call(B, `/api/campus/events/${FREE}/rsvp`, { going: true })).b.status;
api.aliceFree = (await call(A, `/api/campus/events/${FREE}/rsvp`, { going: true })).b.status;
api.rsvpPaid = (await call(A, `/api/campus/events/${PAID}/rsvp`, { going: true })).s;

// ── Browser helpers ───────────────────────────────────────────────────────
async function context(browser, email, { width = 390, theme = 'light', sample = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 } });
  const token = `mock-token-${email}`;
  const me = await fetch(`${base}/api/core/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  await ctx.addInitScript(([t, u, th, s]) => {
    localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user: u }, version: 0 }));
    localStorage.setItem('theme', th); localStorage.setItem(`universe-tour-done:${u.id}`, '1');
    if (s) sessionStorage.setItem('universe:sample-mode', '1');
  }, [token, me, theme, sample]);
  return ctx;
}
async function axe(page) {
  await page.waitForTimeout(400);
  await page.waitForFunction(() => !document.getAnimations().some((x) => x.playState === 'running' && x.effect?.getTiming().iterations !== Infinity), null, { timeout: 5000 }).catch(() => {});
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
}
const wide = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const toast = async (page, text) => (await page.locator('[data-sonner-toast]', { hasText: text }).last().innerText({ timeout: 15_000 }).catch(() => 'missing')).split('\n')[0];
const open = async (page, path, ready) => { await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60_000 }); await ready.waitFor({ timeout: 20_000 }); };
const card = (page, text) => page.getByRole('listitem').filter({ hasText: text }).first();

const browser = await launch();
let receipt = null, listingId = null;

for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const act = theme === 'light' && width === 390;
  const r = { theme, width };
  const errors = [];
  const ctx = await context(browser, A, { width, theme });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${new URL(page.url()).pathname}: ${e.message.slice(0, 120)}`));

  // Events: buy the paid ticket, then show it.
  await open(page, '/student/life/events', page.getByText('Life UI Gala'));
  if (act) {
    r.waitlisted = await card(page, 'Life UI Talk').getByText('On the waiting list').count();
    await card(page, 'Life UI Gala').getByRole('button', { name: /Buy ticket/ }).click();
    await page.waitForURL('**/student/life/events**', { timeout: 30_000 });
    r.paid = await toast(page, 'Payment received');
    await card(page, 'Life UI Gala').getByRole('button', { name: 'Show ticket' }).waitFor({ timeout: 20_000 });
    const rsvp = rows(`SELECT r.status, r.orderId, o.status AS paid, o.purpose FROM event_rsvps r LEFT JOIN payment_orders o ON o.id=r.orderId WHERE r.itemId='${PAID}' AND r.userId=${user(A)}`)[0];
    r.ticket = rsvp;
    r.ticketCode = /^t1\./.test((await call(A, `/api/campus/events/${PAID}/ticket`)).b.code ?? '');
  }
  await card(page, 'Life UI Gala').getByRole('button', { name: 'Show ticket' }).click();
  r.qr = await page.getByRole('dialog', { name: 'Your ticket' }).getByRole('img', { name: 'Ticket for Life UI Gala' }).waitFor({ timeout: 15_000 }).then(() => true, () => false);
  r.ticketAxe = await axe(page);
  await page.keyboard.press('Escape');
  r.eventsAxe = await axe(page);
  r.eventsWide = await wide(page);

  // The club: elections and budget
  await open(page, `/student/life/associations/club?club=${CLUB}`, page.getByRole('group', { name: 'Club page' }));
  if (act) {
    await page.getByRole('button', { name: 'Call an election' }).click();
    await page.getByLabel('What for').fill('Life UI President');
    await page.getByLabel('Candidates').fill('Alice Johnson\nBob Smith');
    await page.getByLabel('Voting closes').fill(new Date(now + 3 * 3_600_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
    await page.getByRole('button', { name: 'Open voting now' }).click();
    r.called = await toast(page, 'Election called');
    await page.getByRole('radio', { name: 'Bob Smith' }).check();
    await page.getByRole('button', { name: 'Vote', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Vote' }).click();
    const box = page.getByRole('status').filter({ hasText: 'Your receipt' });
    await box.waitFor({ timeout: 15_000 });
    receipt = (await box.locator('strong').innerText()).trim();
    const el = rows(`SELECT id FROM club_elections WHERE associationId='${CLUB}'`)[0]?.id;
    r.vote = {
      receipt: /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(receipt),
      again: (await call(A, `/api/campus/elections/${el}/vote`, { choice: 'c1' })).s,
      notMember: (await call(S, `/api/campus/elections/${el}/vote`, { choice: 'c1' })).s,
      bob: (await call(B, `/api/campus/elections/${el}/vote`, { choice: 'c1' })).s,
      hiddenWhileOpen: (await call(B, `/api/campus/clubs/${CLUB}/elections`)).b.elections?.[0]?.results === null,
      ballotColumns: rows(`PRAGMA table_info(club_ballots)`).map((c) => c.name),
      withoutRowid: rows(`SELECT sql FROM sqlite_master WHERE name IN ('club_ballots', 'club_voters')`).every((t) => /WITHOUT ROWID/i.test(t.sql)),
    };
    // Close it, then check the results.
    sql(`UPDATE club_elections SET closesAt='${iso(Date.now() - 60_000)}' WHERE id='${el}'`);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('Check the count (2 ballots)').click();
    await page.getByLabel('Find my receipt').fill(receipt);
    r.found = await page.getByRole('status').filter({ hasText: /Found|Not found/ }).innerText();
    await page.getByRole('button', { name: 'Check it on this device' }).click();
    r.fingerprint = await page.getByRole('status').filter({ hasText: /matches/ }).innerText({ timeout: 10_000 }).catch(() => 'missing');
    r.result = (await call(A, `/api/campus/clubs/${CLUB}/elections`)).b.elections?.[0]?.results?.counts?.map((c) => `${c.name}:${c.votes}`);
  }
  r.electionsAxe = await axe(page);
  r.electionsWide = await wide(page);
  await page.getByRole('group', { name: 'Club page' }).getByRole('button', { name: 'Budget' }).click();
  await page.getByText('History').waitFor({ timeout: 15_000 });
  if (act) {
    await page.getByLabel('Amount (₹)').fill('1200');
    await page.getByLabel('What for').fill('Life UI posters');
    await page.getByRole('button', { name: 'Record', exact: true }).click();
    r.recorded = await toast(page, 'Recorded');
    r.budget = (await call(B, `/api/campus/clubs/${CLUB}/budget`)).b.summary;
    r.memberCantRecord = (await call(B, `/api/campus/clubs/${CLUB}/budget`, { kind: 'EXPENSE', amount: 1, description: 'x' })).s;
    r.outsiderCantSee = (await call(S, `/api/campus/clubs/${CLUB}/budget`)).s;
  }
  r.budgetAxe = await axe(page);
  r.budgetWide = await wide(page);

  // The campus board
  await open(page, '/student/life/board', page.getByRole('group', { name: 'Show' }));
  if (act) {
    await page.getByRole('button', { name: 'Post', exact: true }).first().click();
    const sheet = page.getByRole('dialog', { name: 'New post: Marketplace' });
    await sheet.getByLabel('Title').fill('Life UI calculus book');
    await sheet.getByLabel('Price (₹)').fill('350');
    r.postAxe = await axe(page);
    await sheet.getByRole('button', { name: 'Post', exact: true }).click();
    r.posted = await toast(page, 'Posted');
    listingId = rows(`SELECT id FROM campus_listings WHERE title='Life UI calculus book'`)[0]?.id;
    r.noPrice = (await call(A, '/api/campus/board', { kind: 'SELL', title: 'Life UI no price' })).s;
    r.teacherCantPost = (await call(T, '/api/campus/board', { kind: 'FREE', title: 'Life UI lamp' })).s;
    r.ride = (await call(A, '/api/campus/board', { kind: 'RIDE_OFFER', title: 'Life UI ride to the airport', fromPlace: 'Gate 1', toPlace: 'Airport', departAt: new Date(now + 2 * 86_400_000).toISOString(), seats: 2, price: 200 })).s;
    r.ridesListed = (await call(B, '/api/campus/board?section=rides')).b.listings?.some((l) => l.title === 'Life UI ride to the airport');
  }
  r.boardAxe = await axe(page);
  r.boardWide = await wide(page);

  // Cafeteria: pre-order from the test menu
  await open(page, '/student/life/everyday', page.getByText('Life UI Canteen').first());
  if (act) {
    await page.locator('div').filter({ has: page.getByText('Life UI Canteen', { exact: true }) }).getByRole('button', { name: 'Pre-order' }).last().click();
    const sheet = page.getByRole('dialog', { name: /Pre-order: Lunch/ });
    await sheet.getByRole('button', { name: 'One more Life UI dal' }).click();
    await sheet.getByRole('button', { name: 'One more Life UI dal' }).click();
    await sheet.getByLabel('Pick up at').fill(new Date(now + 3_600_000).toTimeString().slice(0, 5));
    r.orderAxe = await axe(page);
    await sheet.getByRole('button', { name: /^Order/ }).click();
    r.ordered = await toast(page, 'Ordered');
    const o = rows(`SELECT items, status, code FROM meal_orders WHERE menuId='${MENU}' AND userId=${user(A)}`)[0];
    r.order = o && { items: o.items, status: o.status, code: /^[A-Z0-9]{4}$/.test(o.code) };
    r.codeShown = await page.getByText(o?.code ?? 'none', { exact: true }).count();
    r.badDish = (await call(A, '/api/campus/meals', { menuId: MENU, items: [{ dish: 'Pizza', qty: 1 }], pickupAt: new Date(now + 3_600_000).toISOString() })).s;
    r.tooSoon = (await call(A, '/api/campus/meals', { menuId: MENU, items: [{ dish: 'Life UI rice', qty: 1 }], pickupAt: new Date(now + 5 * 60_000).toISOString() })).s;
  }
  r.everydayAxe = await axe(page);
  r.everydayWide = await wide(page);
  if (act) {
    await page.getByRole('region', { name: 'Your pre-orders' }).getByRole('button', { name: 'Cancel' }).click();
    r.cancelled = await toast(page, 'Cancelled');
    await call(B, '/api/campus/meals', { menuId: MENU, items: [{ dish: 'Life UI rice', qty: 1 }], pickupAt: new Date(now + 3_600_000).toISOString() });
  }
  r.errors = errors;
  await ctx.close();

  // Bob: message the seller; reports hide a post.
  if (act) {
    const bctx = await context(browser, B, { width, theme });
    const bpage = await bctx.newPage();
    await open(bpage, '/student/life/board', bpage.getByText('Life UI calculus book'));
    await card(bpage, 'Life UI calculus book').getByRole('button', { name: 'Message' }).click();
    await bpage.waitForURL('**/student/inbox?c=**', { timeout: 20_000 }).catch(() => {});
    r.messaged = new URL(bpage.url()).pathname + (new URL(bpage.url()).searchParams.has('c') ? '?c=…' : '');
    await bctx.close();
    r.report1 = (await call(B, `/api/campus/board/${listingId}/report`, { reason: 'Life UI test report' })).b;
    r.reportAgain = (await call(B, `/api/campus/board/${listingId}/report`, { reason: 'again' })).s;
    sql(`INSERT INTO listing_reports (id, listingId, userId, reason) VALUES ('life-ui-r2', '${listingId}', ${user(T)}, 'Life UI second report')`);
    r.report3 = (await call(S, `/api/campus/board/${listingId}/report`, { reason: 'Life UI third report' })).b;
    r.hiddenFromBoard = !(await call(B, '/api/campus/board?section=market')).b.listings?.some((l) => l.id === listingId);
    r.adminsTold = rows(`SELECT COUNT(*) AS n FROM notifications WHERE title LIKE '%Life UI calculus book%'`)[0].n;
  }

  // Admins: the door scanner, reported posts and the kitchen.
  const actx = await context(browser, ADMIN, { width, theme });
  const apage = await actx.newPage();
  apage.on('pageerror', (e) => errors.push(`admin: ${e.message.slice(0, 120)}`));
  await open(apage, '/admin/monitoring/events', apage.getByText('Life UI Gala'));
  await apage.getByRole('button', { name: /Life UI Gala/ }).click();
  await apage.getByRole('textbox', { name: 'Scan a ticket' }).waitFor({ timeout: 15_000 });
  if (act) {
    await apage.getByRole('textbox', { name: 'Scan a ticket' }).fill((await call(A, `/api/campus/events/${PAID}/ticket`)).b.code);
    await apage.getByRole('textbox', { name: 'Scan a ticket' }).press('Enter');
    r.demoScan = await apage.getByRole('status').innerText({ timeout: 15_000 }).catch(() => 'missing');
  }
  r.doorAxe = await axe(apage);
  r.doorWide = await wide(apage);
  await open(apage, '/admin/monitoring/board', apage.getByRole('heading', { name: 'Campus board' }).first());
  if (act) r.adminBoard = await apage.getByText('Life UI calculus book').count();
  r.adminBoardAxe = await axe(apage);
  r.adminBoardWide = await wide(apage);
  await open(apage, '/admin/monitoring/meals', apage.getByText(/Life UI Canteen/).first());
  if (act) r.kitchen = { code: await apage.getByText('Life UI rice', { exact: false }).count(), prep: await apage.getByText('Still to make').count() };
  r.kitchenAxe = await axe(apage);
  r.kitchenWide = await wide(apage);
  await actx.close();
  console.log(JSON.stringify(r));
}

// The sold-out paid event; Bob can't give back a paid ticket.
const bobBuy = (await call(B, `/api/campus/events/${PAID}/buy`, {})).b;
const bobOrder = rows(`SELECT orderId FROM event_rsvps WHERE itemId='${PAID}' AND userId=${user(B)}`)[0]?.orderId;
api.bobPaid = (await call(B, '/api/payments/verify', { orderId: bobOrder })).s + (bobBuy.checkoutUrl ? '' : ' (no checkout)');
api.soldOut = (await call(S, `/api/campus/events/${PAID}/buy`, {})).b.error;
api.paidNoGiveBack = (await call(B, `/api/campus/events/${PAID}/rsvp`, { going: false })).s;
api.studentCantScan = (await call(A, `/api/campus/events/${PAID}/scan`, { code: 'x' })).s;

// Sample mode
{
  const ctx = await context(browser, A, { sample: true });
  const page = await ctx.newPage();
  const sample = {};
  await open(page, '/student/life/events', page.getByRole('button', { name: /Buy ticket/ }).first());
  await page.getByRole('button', { name: /Buy ticket/ }).first().click();
  sample.noMoney = await toast(page, 'Sample mode');
  await open(page, '/student/life/board', page.getByText('Calculus: Early Transcendentals'));
  sample.board = true;
  await open(page, '/student/life/associations/club?club=sample-as-robo', page.getByText('President 2026'));
  sample.results = await page.getByText('Check the count (5 ballots)').count();
  await open(page, '/student/life/everyday', page.getByRole('button', { name: 'Pre-order' }).first());
  sample.preorder = await page.getByRole('button', { name: 'Pre-order' }).count();
  console.log(JSON.stringify({ sample }));
  await ctx.close();
}

console.log(JSON.stringify({ api }));
await browser.close();
cleanup();
