// Q16 global impact in the browser on the built Worker, served with `pnpm local:serve --payments-test`
// (no real gateway: the made-up checkout comes straight back as paid). Donations: an NGO project's
// Donate button, an 80G gift in rupees, back on My donations the payment is checked and the receipt
// numbered, the receipt page; the payment rules (someone else's order, made-up proof, out-of-range
// amounts, an NGO not taking donations). The 10-hour volunteering certificate, issued and signed by
// itself. The volunteering map's UN goal filter. A club's carbon tracker. Sample mode. Axe at
// 390/1280, light/dark. Adds a test school, NGO, project, shift with 11 verified hours for Alice and a
// club, and removes them (and everything the test made) at the end.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const APP = fileURLToPath(new URL('../..', import.meta.url));
const base = 'http://localhost:8787', A = 'alice@student.com', B = 'bob@student.com', ADMIN = 'demo@admin.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => {
  const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: who ? H(who) : { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, b: await r.json().catch(() => ({})) };
};
const sql = (command) => execSync(`npx wrangler d1 execute universe-db --local --command "${command.replace(/"/g, '\\"')}"`, { cwd: APP, stdio: 'ignore' });
const rows = (command) => JSON.parse(execSync(`npx wrangler d1 execute universe-db --local --json --command "${command.replace(/"/g, '\\"')}"`, { cwd: APP, stdio: ['ignore', 'pipe', 'ignore'] }).toString())[0].results;
const user = (email) => `(SELECT id FROM users WHERE email='${email}')`;
const now = Date.now(), iso = (ms) => new Date(ms).toISOString().replace('Z', '+00:00');

// ── Test data ─────────────────────────────────────────────────────────────
const ORG = 'impact-ui-org', NGO = 'impact-ui-ngo', NGO_OFF = 'impact-ui-ngo-off', PROJ = 'impact-ui-proj', PROJ_OFF = 'impact-ui-proj-off', SHIFT = 'impact-ui-shift', CLUB = 'impact-ui-club';
if (rows(`SELECT COUNT(*) AS n FROM shift_checkins WHERE verified=1 AND studentId=${user(A)} AND shiftId != '${SHIFT}'`)[0].n > 0) throw new Error('Alice already has verified hours: the milestone test would mix with them. Stopping.');
function cleanup() {
  sql(`DELETE FROM donations WHERE ngoId IN ('${NGO}', '${NGO_OFF}') OR projectName LIKE 'Impact UI%'`);
  sql(`DELETE FROM payment_orders WHERE organizationId='${ORG}'`);
  sql(`DELETE FROM impact_points WHERE userId=${user(A)} AND (sourceType='SHIFT' AND sourceId IN (SELECT id FROM shift_checkins WHERE shiftId='${SHIFT}') OR (sourceType='CREDENTIAL' AND sourceId IN (SELECT id FROM impact_certificates WHERE userId=${user(A)} AND milestoneHours IS NOT NULL)))`);
  sql(`DELETE FROM skill_evidence WHERE sourceId IN (SELECT id FROM shift_checkins WHERE shiftId='${SHIFT}')`);
  sql(`DELETE FROM impact_certificates WHERE userId=${user(A)} AND milestoneHours IS NOT NULL`);
  sql(`DELETE FROM shift_checkins WHERE shiftId='${SHIFT}'`);
  sql(`DELETE FROM volunteer_shifts WHERE id='${SHIFT}'`);
  sql(`DELETE FROM ngo_projects WHERE id IN ('${PROJ}', '${PROJ_OFF}')`);
  sql(`DELETE FROM ngos WHERE id IN ('${NGO}', '${NGO_OFF}')`);
  sql(`DELETE FROM club_carbon_entries WHERE associationId='${CLUB}'`);
  sql(`DELETE FROM association_memberships WHERE associationId='${CLUB}'`);
  sql(`DELETE FROM associations WHERE id='${CLUB}'`);
  sql(`DELETE FROM organizations WHERE id='${ORG}'`);
  sql(`DELETE FROM notifications WHERE userId=${user(A)} AND (title LIKE '%Impact UI%' OR title LIKE '%10-hour volunteering certificate%')`);
}
cleanup();
sql(`INSERT INTO organizations (id, name, ownerId, updatedAt) VALUES ('${ORG}', 'Impact UI School', ${user(ADMIN)}, '${iso(now)}')`);
sql(`INSERT INTO ngos (id, name, sector, sdgNumbers, isVerified, updatedAt) VALUES ('${NGO}', 'Impact UI Trust', 'Education', '[13]', 1, '${iso(now)}'), ('${NGO_OFF}', 'Impact UI Closed', 'Health', '[3]', 1, '${iso(now)}')`);
sql(`INSERT INTO ngo_projects (id, ngoId, name, description, skillsRequired, sdgNumber, openings, impactPoints, isActive, updatedAt) VALUES ('${PROJ}', '${NGO}', 'Impact UI Reading Club', 'Weekly reading sessions for primary children.', '[\"Reading\"]', 13, 4, 60, 1, '${iso(now)}'), ('${PROJ_OFF}', '${NGO_OFF}', 'Impact UI Health Camp', 'A test project that takes no donations.', '[]', 3, 2, 40, 1, '${iso(now)}')`);
// 11 verified hours for Alice this year, at a place on the map.
sql(`INSERT INTO volunteer_shifts (id, projectId, title, startAt, endAt, location, lat, lng, capacity) VALUES ('${SHIFT}', '${PROJ}', 'Impact UI reading morning', '${iso(now - 3 * 86_400_000)}', '${iso(now - 3 * 86_400_000 + 11 * 3_600_000)}', 'Impact UI Library', 12.97, 77.59, 10)`);
sql(`INSERT INTO shift_checkins (id, shiftId, studentId, checkInAt, checkOutAt, method, minutes, verified) VALUES ('impact-ui-checkin', '${SHIFT}', ${user(A)}, '${iso(now - 3 * 86_400_000)}', '${iso(now - 3 * 86_400_000 + 11 * 3_600_000)}', 'QR', 660, 1)`);
sql(`INSERT INTO associations (id, name, category, description, status, updatedAt) VALUES ('${CLUB}', 'Impact UI Green Club', 'Environment', 'A test club.', 'ACTIVE', '${iso(now)}')`);
sql(`INSERT INTO association_memberships (id, userId, associationId, role) VALUES ('impact-ui-member', ${user(A)}, '${CLUB}', 'FOUNDER')`);

// ── API rules ─────────────────────────────────────────────────────────────
const api = {};
api.demoAdminCantChange = (await call(ADMIN, '/api/admin/donations', { ngoId: NGO, donationsOn: true }, 'PATCH')).s;
api.adminSees = (await call(ADMIN, '/api/admin/donations')).b.ngos?.some((n) => n.id === NGO);
api.studentNoAdmin = (await call(A, '/api/admin/donations')).s;
// (The demo admin is read-only, so the NGO's settings are set here.)
sql(`UPDATE ngos SET donationsOn=1, reg80G='AAATI0000A20240', pan='AAATI0000A' WHERE id='${NGO}'`);
api.notTaking = (await call(A, '/api/impact/donations', { projectId: PROJ_OFF, amount: 500, currency: 'INR' })).s;
api.tooSmall = (await call(A, '/api/impact/donations', { projectId: PROJ, amount: 5, currency: 'INR' })).s;
api.badPan = (await call(A, '/api/impact/donations', { projectId: PROJ, amount: 500, currency: 'INR', pan: 'NOTAPAN', address: 'x' })).s;
api.panNoAddress = (await call(A, '/api/impact/donations', { projectId: PROJ, amount: 500, currency: 'INR', pan: 'ABCDE1234F' })).s;
// Bob's order: Alice can't confirm it, and Bob's own made-up proof is checked by the server.
const bobGift = (await call(B, '/api/impact/donations', { projectId: PROJ, amount: 10, currency: 'USD' })).b;
const bobOrder = rows(`SELECT orderId FROM donations WHERE id='${bobGift.donationId}'`)[0]?.orderId;
api.aliceConfirmsBobs = (await call(A, '/api/payments/verify', { orderId: bobOrder, paymentRef: 'pay_fake', signature: 'sig_verified_mock' })).s;
api.feeRouteNeedsBill = (await call(A, '/api/payments/create-order', { amount: 100, currency: 'INR', purpose: 'DONATION' })).s;
api.unsignedWebhook = (await fetch(`${base}/api/webhooks/razorpay`, { method: 'POST', body: '{"event":"payment.captured"}', headers: { 'x-razorpay-signature': 'nope' } })).status;
// The volunteering map: SDG 13 has Alice's 11 hours.
const report = (await call(A, '/api/volunteer/report?sdg=13')).b;
api.mapSdg = { sdg: report.sdg, hours: report.totals?.hours, chips: report.sdgs?.map((s) => s.sdg), places: report.places?.length };
api.mapOtherSdg = (await call(A, '/api/volunteer/report?sdg=3')).b.totals?.hours;
// Carbon: only members.
api.carbonBob = (await call(B, `/api/campus/clubs/${CLUB}/carbon`)).s;
api.carbonBad = (await call(A, `/api/campus/clubs/${CLUB}/carbon`, { activity: 'rocket', quantity: 1 })).s;

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

const browser = await launch();
let donationId = null;

for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const act = theme === 'light' && width === 390;
  const r = { theme, width };
  const errors = [];
  const ctx = await context(browser, A, { width, theme });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${new URL(page.url()).pathname}: ${e.message.slice(0, 120)}`));

  // NGO projects: Donate on the project that takes donations only.
  await open(page, '/student/impact/ngo-marketplace', page.getByText('Impact UI Reading Club').first());
  const card = (name) => page.locator('div').filter({ has: page.getByRole('heading', { name }) }).filter({ has: page.getByRole('button') }).last();
  r.donateButtons = { on: await card('Impact UI Reading Club').getByRole('button', { name: 'Donate' }).count(), off: await card('Impact UI Health Camp').getByRole('button', { name: 'Donate' }).count() };
  r.marketAxe = await axe(page);
  r.marketWide = await wide(page);
  await card('Impact UI Reading Club').getByRole('button', { name: 'Donate' }).click();
  const sheet = page.getByRole('dialog', { name: 'Donate to Impact UI Reading Club' });
  await sheet.waitFor({ timeout: 15_000 });
  if (act) {
    await sheet.getByRole('button', { name: '₹1,000' }).click();
    await sheet.getByLabel('I’d like an 80G tax receipt (India)').check();
    await sheet.getByLabel('Your PAN').fill('abcde1234f');
    await sheet.getByLabel('Your address').fill('12 Test Road, Bengaluru');
    await sheet.getByLabel('A message for the NGO (optional)').fill('Impact UI: keep reading!');
  }
  r.sheetAxe = await axe(page);
  r.sheetWide = await wide(page);
  if (act) {
    await sheet.getByRole('button', { name: /^Give/ }).click();
    // Test mode: the made-up checkout returns at once; the page asks the server, which marks it paid.
    await page.waitForURL('**/donations**', { timeout: 30_000 });
    r.paidToast = await toast(page, 'Payment received');
    await page.getByText('Impact UI Reading Club').first().waitFor({ timeout: 20_000 });
    r.addressTidied = !new URL(page.url()).search.includes('paid=');
    const d = rows(`SELECT id, status, amount, currency, receiptNo, pan, reg80G, orderId FROM donations WHERE projectId='${PROJ}' AND donorId=${user(A)}`)[0];
    donationId = d?.id;
    r.donation = d && { status: d.status, amount: d.amount, receipt: d.receiptNo != null, pan: d.pan, reg80G: d.reg80G };
    r.order = rows(`SELECT status, purpose, provider FROM payment_orders WHERE id='${d?.orderId}'`)[0];
    r.confirmAgain = (await call(A, '/api/payments/verify', { orderId: d?.orderId })).s;
    r.stillOneReceipt = rows(`SELECT COUNT(*) AS n FROM donations WHERE projectId='${PROJ}' AND donorId=${user(A)} AND status='PAID'`)[0].n;
    r.thanked = rows(`SELECT COUNT(*) AS n FROM notifications WHERE userId=${user(A)} AND title LIKE '%Impact UI Reading Club%'`)[0].n;
    r.bobReadsReceipt = (await call(B, `/api/impact/donations/${donationId}`)).s;
    r.supportShown = (await call(B, `/api/impact/donations?projectId=${PROJ}`)).b;
  }
  if (!act) {
    await page.keyboard.press('Escape');
    await open(page, '/donations', page.getByText('Impact UI Reading Club').first());
  }
  r.donationsAxe = await axe(page);
  r.donationsWide = await wide(page);

  // The receipt
  if (donationId) {
    await open(page, `/donation-receipt/${donationId}`, page.getByRole('heading', { name: 'Impact UI Trust' }));
    if (act) r.receipt = { tax: await page.getByRole('heading', { name: 'Section 80G (India)' }).count(), pan: await page.getByText('ABCDE1234F').count(), amount: await page.getByText('₹1,000.00').count() + await page.getByText('₹1,000').count() };
    r.receiptAxe = await axe(page);
    r.receiptWide = await wide(page);
  }

  // Volunteering: the 10-hour certificate (made when credentials are opened) and the map's goal filter.
  if (act) {
    const creds = (await call(A, '/api/core/impact/blockchain-credentials')).b;
    const cert = (Array.isArray(creds) ? creds : []).find((c) => c.title === '10 hours of verified volunteering');
    r.certificate = cert && { status: cert.status, signed: !!cert.signature, hours: cert.hoursCompleted, org: cert.organization };
    r.certificateOnce = rows(`SELECT COUNT(*) AS n FROM impact_certificates WHERE userId=${user(A)} AND milestoneHours=10`)[0].n;
    r.certificateNotice = rows(`SELECT COUNT(*) AS n FROM notifications WHERE userId=${user(A)} AND title LIKE '%10-hour volunteering certificate%'`)[0].n;
  }
  await open(page, '/student/impact/shifts', page.getByRole('group', { name: 'Show the UN goal' }));
  if (act) {
    await page.getByRole('group', { name: 'Show the UN goal' }).getByRole('button', { name: /SDG 13/ }).click();
    await page.getByText(/for SDG 13/).waitFor({ timeout: 15_000 });
    r.mapFiltered = await page.getByText(/for SDG 13/).innerText();
  }
  r.shiftsAxe = await axe(page);
  r.shiftsWide = await wide(page);

  // The club's carbon tracker
  await open(page, `/student/life/associations/carbon?club=${CLUB}`, page.getByRole('heading', { name: 'Impact UI Green Club' }));
  if (act) {
    await page.getByLabel('Activity').selectOption('bus');
    await page.getByLabel(/^Amount/).fill('100');
    r.carbonPreview = await page.getByText(/About .* CO₂e/).innerText();
    await page.getByLabel('Note (optional)').fill('Impact UI trip');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    r.carbonAdded = await toast(page, 'Added');
    await page.getByLabel('Activity').selectOption('walk-cycle');
    await page.getByLabel(/^Amount/).fill('20');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.waitForTimeout(800);
    r.carbonTotals = (await call(A, `/api/campus/clubs/${CLUB}/carbon`)).b.summary;
  }
  r.carbonAxe = await axe(page);
  r.carbonWide = await wide(page);
  if (act) {
    await page.getByRole('button', { name: /^Remove Walked or cycled/ }).click();
    await page.waitForTimeout(800);
    r.carbonRemoved = (await call(A, `/api/campus/clubs/${CLUB}/carbon`)).b.entries.length;
  }
  await open(page, '/student/life/associations', page.getByRole('link', { name: 'Carbon' }).first());
  r.clubsAxe = await axe(page);
  r.clubsWide = await wide(page);
  r.errors = errors;
  await ctx.close();

  // Admins: donations and NGO settings
  const actx = await context(browser, ADMIN, { width, theme });
  const apage = await actx.newPage();
  apage.on('pageerror', (e) => errors.push(`admin: ${e.message.slice(0, 120)}`));
  await open(apage, '/admin/impact-reports/donations', apage.getByText('Impact UI Trust').first());
  r.admin = { switch: await apage.getByRole('switch', { name: 'Impact UI Trust takes donations' }).isChecked(), listed: await apage.getByText('to Impact UI Reading Club').count() };
  r.adminAxe = await axe(apage);
  r.adminWide = await wide(apage);
  await actx.close();
  console.log(JSON.stringify(r));
}

// Sample mode: the new pages answer from sample data, and giving takes no money.
{
  const ctx = await context(browser, A, { sample: true });
  const page = await ctx.newPage();
  const sample = {};
  await open(page, '/donations', page.getByText('Weekend Maths Tutoring').first());
  sample.donations = true;
  await open(page, '/student/impact/ngo-marketplace', page.getByText('Weekend Maths Tutoring').first());
  sample.donateButtons = await page.getByRole('button', { name: 'Donate' }).count();
  await page.getByRole('button', { name: 'Donate' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /^Give/ }).click();
  sample.noMoney = await toast(page, 'Sample mode');
  await open(page, '/student/life/associations/carbon?club=sample', page.getByText('Green Campus Club'));
  sample.carbon = await page.getByText('Bus, per person: 720').count();
  await open(page, '/student/impact/shifts', page.getByRole('group', { name: 'Show the UN goal' }));
  sample.sdgChips = await page.getByRole('group', { name: 'Show the UN goal' }).getByRole('button').count();
  await page.getByRole('group', { name: 'Show the UN goal' }).getByRole('button', { name: /SDG 4/ }).click();
  sample.sdgFilter = await page.getByText(/for SDG 4/).innerText({ timeout: 15_000 }).catch(() => 'missing');
  console.log(JSON.stringify({ sample }));
  await ctx.close();
}

console.log(JSON.stringify({ api }));
await browser.close();
cleanup();
