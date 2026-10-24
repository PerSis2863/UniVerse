import crypto from 'node:crypto';
import prisma from '@/lib/db';
import { CITIES } from '@/components/trace/map/cities';
import { co2For, GREEN_KINDS, type GreenKind } from '@/lib/green';
import { URGENCIES, snap, type ReliefKind } from '@/lib/relief';
import { KEY_LEN, toBase32 } from '@/lib/trace';
import { codeFor } from './trace';
import { pointHash } from './trace-wallet';

// Sample data for the owner console (the owner, 24 Oct 2026: "add some sample data in the owner
// console like a lot of data in it is fine if it is fake"). "Fill with sample data" writes a made-up
// world into the real database, in steps (each one request, so it stays inside a Worker's limits):
// 300 people with sign-ins and page visits, chats, the activity log, errors and payments, 20 brands
// with products, batches and thousands of scans, campaigns, points and cash-outs, recalls, reviews,
// prizes, warranties and grey-market alerts, Relief
// needs and offers, and Green actions and teams. Everything is marked so "Remove sample data" takes
// out exactly that: people's emails end in @sample.universe.test, brands' slugs start with
// "sample-", error fingerprints with "sample:".

const DOMAIN = '@sample.universe.test';
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().replace('Z', '+00:00');

/** A small seeded random generator (the same world every time it's filled). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T,>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length)];
const id = (prefix: string, n: number) => `smp${prefix}${n.toString(36).padStart(6, '0')}`;

/** A value written straight into the SQL (only this file's own made-up values ever reach it). */
const lit = (v: unknown) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? (Number.isFinite(v) ? String(v) : 'NULL') : `'${String(v).replace(/'/g, "''")}'`);

/**
 * Inserts rows with their values written into the statement, about 90 KB per statement: D1 allows
 * only 100 bound values per statement, so a step of a thousand rows takes a few queries instead of a
 * hundred. (The app runs on Workers Paid since Oct 2026, 1000 queries per request; the fill still
 * goes in steps so the console can show progress and a failed step loses nothing done before it.)
 */
async function insert(table: string, cols: string[], rows: unknown[][]) {
  const head = `INSERT OR IGNORE INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES `;
  let parts: string[] = [], size = 0;
  const flush = async () => { if (parts.length) await prisma.$executeRawUnsafe(head + parts.join(', ')); parts = []; size = 0; };
  for (const row of rows) {
    const v = `(${row.map(lit).join(', ')})`;
    if (size + v.length > 90_000) await flush();
    parts.push(v); size += v.length;
  }
  await flush();
}

const FIRST = ['Aarav', 'Maya', 'Lucas', 'Sofia', 'Omar', 'Yuki', 'Amara', 'Diego', 'Priya', 'Noah', 'Fatima', 'Leo', 'Chen', 'Zara', 'Mateo', 'Aisha', 'Ethan', 'Ines', 'Kofi', 'Elena', 'Ravi', 'Hana', 'Jonas', 'Lina', 'Samuel', 'Nadia', 'Arjun', 'Camille', 'Tomás', 'Mei', 'Ibrahim', 'Grace', 'Felix', 'Anika', 'Mohammed', 'Clara', 'Kenji', 'Layla', 'Marco', 'Sara'];
const LAST = ['Sharma', 'Rossi', 'Dubois', 'García', 'Haddad', 'Tanaka', 'Okafor', 'Silva', 'Patel', 'Müller', 'Khan', 'Martin', 'Wang', 'Ahmed', 'López', 'Nkosi', 'Schmidt', 'Costa', 'Mensah', 'Novak', 'Iyer', 'Kim', 'Larsen', 'Haddad', 'Owusu', 'Petrov', 'Singh', 'Moreau', 'Fernandes', 'Lin'];
const BIG = CITIES.filter((c) => c[3] < 3);
const COUNTRY: Record<string, string> = {};
const cc = (name: string) => COUNTRY[name] ?? 'FR';
for (const [n, lat, lng] of CITIES) COUNTRY[n] = lng < -30 ? (lat > 15 ? (n === 'Toronto' || n === 'Montreal' || n === 'Vancouver' ? 'CA' : n === 'Mexico City' ? 'MX' : 'US') : 'BR') : lng < 20 && lat > 35 ? 'FR' : lng > 60 && lng < 90 && lat < 35 ? 'IN' : lng > 100 && lat > 20 ? 'CN' : lat < 0 && lng > 100 ? 'AU' : lng > 30 && lng < 60 ? 'AE' : lat < 15 && lng < 50 ? 'NG' : 'DE';
const DEVICES = ['Chrome on Android', 'Safari on iPhone', 'Chrome on Windows', 'Safari on Mac', 'Edge on Windows', 'Firefox on Linux'];
const PATHS = ['/hub', '/trace', '/trace/map', '/trace/tracking', '/trace/wallet', '/relief', '/relief/mine', '/green', '/green/teams', '/student', '/student/courses', '/teacher', '/admin', '/student/inbox', '/collab', '/docs'];
const CLICKS = ['Log it', 'I can help', 'New product', 'Print codes', 'Start a campaign here', 'Send', 'Join', 'Open', 'Replay the period', 'Share with the driver'];
const BRANDS: [string, string, string][] = [
  ['Aurora Foods', 'food', '#ec4899'], ['Nordlys Skincare', 'cosmetics', '#d946ef'], ['Kaveri Spices', 'food', '#f59e0b'], ['Velo Parts', 'auto parts', '#60a5fa'],
  ['Maison Lumière', 'cosmetics', '#f472b6'], ['TerraBrew Coffee', 'drinks', '#a16207'], ['Pulse Pharma', 'pharma', '#34d399'], ['Atlas Footwear', 'fashion', '#818cf8'],
  ['Sakura Tea Co.', 'drinks', '#fb7185'], ['Andes Wool', 'fashion', '#c084fc'], ['Bolt Electronics', 'electronics', '#38bdf8'], ['Olivo Verde', 'food', '#84cc16'],
  ['Saffron & Co.', 'food', '#f97316'], ['Kinetic Toys', 'toys', '#facc15'], ['Harbor Wines', 'drinks', '#be123c'], ['Lumen Home', 'home', '#22d3ee'],
  ['Zenith Watches', 'fashion', '#94a3b8'], ['Masala Mills', 'food', '#ea580c'], ['Purely Organic', 'agriculture', '#16a34a'], ['Drivetrain Pro', 'auto parts', '#2563eb'],
];

export interface SampleStep { label: string; run: () => Promise<number> }

/** The people (all steps use them): ids and when each joined. */
function people() {
  const r = rng(11);
  return Array.from({ length: 300 }, (_, i) => {
    const role = i < 6 ? 'ADMIN' : i < 40 ? 'TEACHER' : 'STUDENT';
    const joined = Date.now() - Math.pow(r(), 1.6) * 150 * DAY;
    const city = pick(r, BIG);
    return { id: id('u', i), name: `${pick(r, FIRST)} ${pick(r, LAST)}`, role, joined, city, seen: Date.now() - Math.pow(r(), 2.2) * 25 * DAY };
  });
}

export function sampleSteps(): SampleStep[] {
  const P = people(), now = Date.now();
  const steps: SampleStep[] = [
    { label: 'People', run: async () => {
      const r = rng(12);
      await insert('users', ['id', 'name', 'email', 'role', 'status', 'createdAt', 'updatedAt', 'onboardedAt', 'lastSeenAt', 'accountType', 'termsVersion'],
        P.map((p, i) => [p.id, p.name, `${p.name.toLowerCase().normalize('NFKD').replace(/[^a-z]+/g, '.')}.${i}${DOMAIN}`, p.role, r() < 0.04 ? 'SUSPENDED' : r() < 0.05 ? 'PENDING' : 'ACTIVE', iso(p.joined), iso(p.joined), iso(p.joined), iso(p.seen), p.role === 'TEACHER' ? 'STAFF' : p.role === 'ADMIN' ? 'ORGANIZATION' : 'INDEPENDENT', '2026-10']));
      return P.length;
    } },
    { label: 'Sign-ins', run: async () => {
      const r = rng(13);
      const rows = Array.from({ length: 2400 }, (_, i) => { const p = pick(r, P), at = now - Math.pow(r(), 1.4) * 30 * DAY; return [id('l', i), p.id, r() < 0.7 ? 'SESSION' : 'SIGN_IN', pick(r, ['google', 'password', 'phone']), cc(p.city[0]), p.city[0], pick(r, DEVICES), iso(at)]; });
      await insert('login_events', ['id', 'userId', 'kind', 'method', 'country', 'city', 'device', 'createdAt'], rows);
      return rows.length;
    } },
    ...[0, 1, 2, 3, 4].map((half): SampleStep => ({ label: `Page visits ${half + 1} of 5`, run: async () => {
      const r = rng(50 + half);
      const rows = Array.from({ length: 1100 }, (_, i) => {
        const p = pick(r, P), at = now - Math.pow(r(), 1.3) * 30 * DAY, view = r() < 0.72;
        const hour = 7 + Math.floor(Math.pow(r(), 0.8) * 15), d = new Date(at); d.setUTCHours(hour);
        return [id(`v${half}`, i), p.id, view ? 'VIEW' : 'CLICK', view ? null : pick(r, CLICKS), pick(r, PATHS), iso(Math.min(now, d.getTime()))];
      });
      await insert('ui_events', ['id', 'userId', 'kind', 'label', 'path', 'createdAt'], rows);
      return rows.length;
    } })),
    { label: 'Chats', run: async () => {
      const r = rng(16);
      const LINES = ['Can we move the call to 4?', 'The new batch is on the map 🎉', 'Who is helping in Ward 12 today?', 'Sent you the deck', 'Our team just passed 1 tonne of CO₂!', 'Great work everyone', 'Is the warehouse open on Sunday?', 'I can take the water run', 'Thanks a lot!', 'Draft is in Docs', 'Quiz results are out', 'The driver is 20 min away', 'Let’s meet at the clinic', 'Love this idea', 'Checking now…'];
      const convs: unknown[][] = [], parts: unknown[][] = [], msgs: unknown[][] = [];
      let m = 0;
      for (let c = 0; c < 36; c++) {
        const group = c % 3 === 0, members = Array.from({ length: group ? 4 + Math.floor(r() * 6) : 2 }, () => pick(r, P)).filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i);
        const start = now - (5 + r() * 40) * DAY;
        convs.push([id('c', c), group ? 1 : 0, group ? pick(r, ['Launch team', 'Relief volunteers', 'Green club', 'Class 10B', 'Brand partners', 'Warehouse crew', 'Study group']) : null, members[0].id, iso(start), iso(now - r() * DAY)]);
        members.forEach((p, k) => parts.push([id('p', c * 20 + k), id('c', c), p.id, iso(start), iso(now - r() * 3 * DAY), k === 0 ? 'ADMIN' : 'MEMBER']));
        const n = 15 + Math.floor(r() * 35);
        for (let k = 0; k < n; k++) msgs.push([id('m', m++), id('c', c), pick(r, members).id, pick(r, LINES), 1, 'TEXT', iso(start + ((now - start) * k) / n)]);
      }
      await insert('conversations', ['id', 'isGroup', 'name', 'createdById', 'createdAt', 'updatedAt'], convs);
      await insert('conversation_participants', ['id', 'conversationId', 'userId', 'joinedAt', 'lastReadAt', 'role'], parts);
      await insert('messages', ['id', 'conversationId', 'senderId', 'body', 'read', 'type', 'createdAt'], msgs);
      return msgs.length;
    } },
    { label: 'Activity, errors and payments', run: async () => {
      const r = rng(17);
      const ACTS: [string, string][] = [['trace.brand_started', 'Started a brand on Trace'], ['user.role_changed', 'Changed a role'], ['relief.post', 'Posted a need on Relief'], ['green.team', 'Started a Green team'], ['course.created', 'Created a course'], ['grade.posted', 'Posted grades'], ['trace.recall', 'Recalled a batch'], ['payment.marked_paid', 'Marked a payment paid']];
      await insert('audit_logs', ['id', 'actorId', 'actorName', 'actorRole', 'action', 'summary', 'createdAt'],
        Array.from({ length: 320 }, (_, i) => { const p = pick(r, P), [a, s] = pick(r, ACTS); return [id('a', i), p.id, p.name, p.role, a, `${p.name}: ${s.toLowerCase()}`, iso(now - Math.pow(r(), 1.5) * 30 * DAY)]; }));
      const ERR = ['TypeError: Cannot read properties of undefined (reading \'map\')', 'ChunkLoadError: Loading chunk 482 failed', 'D1_ERROR: too many SQL variables', 'NetworkError when attempting to fetch resource', 'RangeError: Invalid time value', 'Unhandled rejection: AbortError', 'ReferenceError: ResizeObserver is not defined'];
      await insert('error_reports', ['id', 'fingerprint', 'source', 'kind', 'message', 'path', 'count', 'users', 'status', 'severity', 'firstSeen', 'lastSeen'],
        Array.from({ length: 24 }, (_, i) => [id('e', i), `sample:${i}`, i % 3 ? 'CLIENT' : 'SERVER', pick(r, ['runtime', 'promise', 'api', 'chunk']), pick(r, ERR), pick(r, PATHS), 1 + Math.floor(r() * 140), 1 + Math.floor(r() * 30), pick(r, ['NEW', 'NEW', 'DIAGNOSED', 'RESOLVED', 'IGNORED']), pick(r, ['low', 'medium', 'high']), iso(now - (3 + r() * 20) * DAY), iso(now - r() * 2 * DAY)]));
      const PAY: [string, string, number][] = [['ORGANIZATION', 'Trace PRO, monthly', 49], ['OTHER', 'Campaign fees', 12], ['TUITION', 'Semester tuition', 1200], ['ACTIVITY_FEE', 'Sports club', 35], ['EXAM_FEE', 'Exam fee', 60], ['ORGANIZATION', 'UniVersity school plan', 290]];
      await insert('payments', ['id', 'userId', 'amount', 'currency', 'type', 'description', 'status', 'createdAt', 'updatedAt'],
        Array.from({ length: 260 }, (_, i) => { const p = pick(r, P), [t, d, a] = pick(r, PAY), at = now - Math.pow(r(), 1.2) * 60 * DAY; return [id('$', i), p.id, Math.round(a * (0.8 + r() * 0.5) * 100) / 100, 'EUR', t, d, r() < 0.82 ? 'COMPLETED' : r() < 0.6 ? 'PENDING' : r() < 0.7 ? 'FAILED' : 'REFUNDED', iso(at), iso(at)]; }));
      return 604;
    } },
    { label: 'Brands and products', run: async () => {
      const r = rng(18);
      const brands = BRANDS.map(([name, category, color], b) => [id('b', b), name, `sample-${name.toLowerCase().replace(/[^a-z]+/g, '-')}-${b}`, category, color, b % 4 === 0 ? 'PRO' : 'FREE', 0.01, 'EUR', 500, P[40 + b].id, iso(now - (20 + b * 6) * DAY)]);
      await insert('trace_brands', ['id', 'name', 'slug', 'category', 'color', 'plan', 'pointValue', 'currency', 'minCashout', 'createdById', 'createdAt'], brands);
      await insert('trace_brand_members', ['brandId', 'userId', 'role', 'createdAt'], BRANDS.map((_, b) => [id('b', b), P[40 + b].id, 'OWNER', iso(now - 30 * DAY)]));
      const products: unknown[][] = [], batches: unknown[][] = [];
      BRANDS.forEach(([name, category], b) => {
        for (let k = 0; k < 2; k++) {
          const pid = id('pr', b * 2 + k);
          products.push([pid, `${name} ${pick(r, ['Classic', 'Reserve', 'Original', 'Pro', 'Organic', 'Signature'])} ${k + 1}`, category, `Sample product of ${name}.`, 10 + Math.floor(r() * 40), b % 5 === 0 ? 24 : 0, id('b', b), iso(now - 60 * DAY), iso(now - 60 * DAY), k === 0 && b % 3 === 0 ? 50 : null, k === 0 && b % 3 === 0 ? 'A free bottle' : null]);
          for (let n = 0; n < 2; n++) {
            const origin = pick(r, BIG), status = n === 0 ? 'DELIVERED' : r() < 0.6 ? 'IN_TRANSIT' : 'MADE', dest = pick(r, BIG);
            batches.push([id('ba', (b * 2 + k) * 2 + n), pid, `Batch ${2026}-${b + 1}${k}${n}`, origin[0], origin[1], origin[2], toBase32(crypto.randomBytes(8), KEY_LEN), crypto.randomBytes(32).toString('hex'), 5000, iso(now - (40 - n * 15) * DAY), id('b', b), status, status === 'IN_TRANSIT' ? dest[0] : null, status === 'IN_TRANSIT' ? dest[1] : null, status === 'IN_TRANSIT' ? dest[2] : null, iso(now - (40 - n * 15) * DAY)]);
          }
        }
      });
      await insert('trace_products', ['id', 'name', 'category', 'description', 'rewardPoints', 'warrantyMonths', 'brandId', 'createdAt', 'updatedAt', 'winOdds', 'winPrize'], products);
      await insert('trace_batches', ['id', 'productId', 'label', 'origin', 'lat', 'lng', 'codeKey', 'secret', 'quantity', 'madeAt', 'brandId', 'status', 'destPlace', 'destLat', 'destLng', 'createdAt'], batches);
      const events = batches.flatMap((x) => [[`${x[0]}e0`, x[0], x[10], 'MADE', x[3], x[4], x[5], x[9]], [`${x[0]}e1`, x[0], x[10], 'SHIPPED', `Port near ${x[3]}`, Number(x[4]) + 0.3, Number(x[5]) + 0.3, iso(Date.parse(String(x[9])) + 3 * DAY)]]);
      await insert('trace_events', ['id', 'batchId', 'brandId', 'stage', 'place', 'lat', 'lng', 'createdAt'], events);
      return products.length + batches.length;
    } },
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((part): SampleStep => ({ label: `Scans ${part + 1} of 8`, run: async () => {
      const r = rng(40 + part);
      const batches = await prisma.traceBatch.findMany({ where: { id: { startsWith: 'smpba' } }, select: { id: true, codeKey: true, secret: true, productId: true, brandId: true, product: { select: { category: true } } }, orderBy: { id: 'asc' } });
      const mine = batches.filter((_, i) => i % 8 === part);
      const codes: unknown[][] = [], scans: unknown[][] = [];
      for (const b of mine) {
        const home = pick(r, BIG);
        for (let s = 0; s < 75; s++) {
          const c = r() < 0.6 ? home : pick(r, BIG), at = now - Math.pow(r(), 1.5) * 30 * DAY;
          const code = codeFor(b, s), copy = s % 31 === 7, place = `${c[0]}, ${cc(c[0])}`;
          // Most genuine units are claimed by a shop (sales in the best-shops list): a few shops sell a lot.
          const shop = !copy && r() < 0.55 ? P[60 + Math.floor(Math.pow(r(), 2.2) * 80)].id : null;
          codes.push([code, b.id, b.productId, b.brandId, s, copy ? 2 : 1, iso(at), place, cc(c[0]), iso(at), shop, shop ? iso(at) : null]);
          scans.push([`${code}s`, code, b.brandId, b.productId, b.product.category, 'FIRST', c[1] + (r() - 0.5) * 0.15, c[2] + (r() - 0.5) * 0.15, place, cc(c[0]), pick(r, ['iPhone', 'Android', 'Android']), iso(at)]);
          if (copy) { const f = pick(r, BIG); scans.push([`${code}x`, code, b.brandId, b.productId, b.product.category, 'SUSPECT', f[1], f[2], `${f[0]}, ${cc(f[0])}`, cc(f[0]), 'Android', iso(Math.min(now, at + 2 * DAY))]); }
        }
      }
      await insert('trace_codes', ['id', 'batchId', 'productId', 'brandId', 'serial', 'scanCount', 'firstScanAt', 'firstPlace', 'firstCountry', 'createdAt', 'claimedById', 'claimedAt'], codes);
      await insert('trace_scans', ['id', 'codeId', 'brandId', 'productId', 'category', 'verdict', 'geoLat', 'geoLng', 'place', 'country', 'device', 'createdAt'], scans);
      return scans.length;
    } })),
    { label: 'Campaigns, points and recalls', run: async () => {
      const r = rng(30);
      await insert('trace_campaigns', ['id', 'brandId', 'title', 'bonusPoints', 'budgetPoints', 'spentPoints', 'scans', 'feeCents', 'lat', 'lng', 'radiusKm', 'place', 'status', 'createdAt'],
        BRANDS.slice(0, 14).map((_, b) => { const c = pick(r, BIG), bonus = 20 + Math.floor(r() * 60), sc = Math.floor(r() * 300); return [id('ca', b), id('b', b), `${c[0]} launch: +${bonus} points per sale`, bonus, 30_000, bonus * sc, sc, 5, c[1], c[2], 30, `${c[0]} (30 km)`, pick(r, ['ACTIVE', 'ACTIVE', 'PAUSED', 'ENDED']), iso(now - r() * 30 * DAY)]; }));
      const shops = P.slice(60, 140), points: unknown[][] = [], cash: unknown[][] = [];
      const chain = new Map<string, string>(), bal = new Map<string, number>();
      Array.from({ length: 420 }, (_, i) => ({ i, at: now - (1 - i / 420) * 30 * DAY })).forEach(({ i, at }) => {
        const shop = pick(r, shops), b = Math.floor(r() * 20), pts = 10 + Math.floor(r() * 50), key = `${shop.id}:${b}`;
        const after = (bal.get(key) ?? 0) + pts, prev = chain.get(shop.id) ?? 'GENESIS', when = new Date(Math.floor(at));
        const hash = pointHash({ userId: shop.id, brandId: id('b', b), kind: 'SCAN', points: pts, balanceAfter: after, previousHash: prev, at: when.toISOString() });
        points.push([id('pt', i), shop.id, id('b', b), 'SCAN', pts, after, 'Scanned a sample product', prev, hash, iso(when.getTime())]);
        chain.set(shop.id, hash); bal.set(key, after);
      });
      await insert('trace_points', ['id', 'userId', 'brandId', 'kind', 'points', 'balanceAfter', 'note', 'previousHash', 'hash', 'createdAt'], points);
      shops.slice(0, 24).forEach((s, i) => cash.push([id('co', i), s.id, id('b', i % 20), 600, 6, 'EUR', `${s.name.split(' ')[0].toLowerCase()}@upi`, pick(r, ['PENDING', 'PENDING', 'PAID', 'REJECTED']), iso(now - r() * 10 * DAY)]));
      await insert('trace_cashouts', ['id', 'userId', 'brandId', 'points', 'amount', 'currency', 'payTo', 'status', 'createdAt'], cash);
      await insert('trace_recalls', ['id', 'brandId', 'batchId', 'reason', 'advice', 'severity', 'status', 'createdAt'], [
        [id('rc', 0), id('b', 6), id('ba', 25), 'A labelling error lists the wrong dose', 'Stop using it and return it to the pharmacy for a refund.', 'HIGH', 'ACTIVE', iso(now - 2 * DAY)],
        [id('rc', 1), id('b', 3), id('ba', 13), 'Brake pads from this batch may wear early', 'Have them checked at any partner garage, free.', 'CRITICAL', 'ACTIVE', iso(now - 5 * DAY)],
        [id('rc', 2), id('b', 13), id('ba', 53), 'A small part can come loose', null, 'MEDIUM', 'ENDED', iso(now - 20 * DAY)],
      ]);
      return points.length + cash.length;
    } },
    { label: 'Reviews, prizes, warranties and alerts', run: async () => {
      const r = rng(33);
      const codes = await prisma.traceCode.findMany({ where: { brandId: { startsWith: 'smpb' } }, select: { id: true, brandId: true, productId: true, firstPlace: true, firstCountry: true, firstScanAt: true }, orderBy: { id: 'asc' }, take: 1200 });
      const TEXTS = ['You can taste the difference.', 'Good to know it’s the real one.', 'Lovely gift, the passport story is a nice touch.', 'Does what it says.', 'Packaging could be better.', 'My go-to now.', 'Arrived well packed and on time.', 'Not bad, a bit pricey.'];
      const at = (c: (typeof codes)[number]) => (c.firstScanAt ?? new Date(now - 5 * DAY)).getTime();
      const reviews = codes.filter((_, i) => i % 4 === 0).map((c, i) => { const stars = Math.min(5, Math.max(1, Math.round(5.2 - Math.pow(r(), 3.5) * 4.5))); return [id('rv', i), c.id, c.brandId, c.productId, null, stars, r() < 0.6 ? pick(r, TEXTS) : null, c.firstPlace, c.firstCountry, iso(Math.min(now, at(c) + r() * 3 * DAY))]; });
      await insert('trace_reviews', ['id', 'codeId', 'brandId', 'productId', 'userId', 'stars', 'text', 'place', 'country', 'createdAt'], reviews);
      const wins = codes.filter((_, i) => i % 37 === 5).map((c, i) => [id('wn', i), c.id, c.brandId, c.productId, 'A free bottle', `SMP${toBase32(crypto.randomBytes(5), 7)}`, c.firstPlace, r() < 0.7 ? iso(at(c) + DAY) : null, iso(at(c))]);
      await insert('trace_wins', ['id', 'codeId', 'brandId', 'productId', 'prize', 'claimCode', 'place', 'redeemedAt', 'createdAt'], wins);
      const warranties = codes.filter((_, i) => i % 9 === 2).map((c, i) => [id('wr', i), c.id, c.brandId, c.productId, null, `${pick(r, FIRST)} ${pick(r, LAST)}`, `owner${i}${DOMAIN}`, c.firstCountry, iso(at(c) + 730 * DAY), iso(at(c))]);
      await insert('trace_warranties', ['id', 'codeId', 'brandId', 'productId', 'userId', 'name', 'email', 'country', 'endsAt', 'createdAt'], warranties);
      // Grey market: the first batch of each brand is sold in France only; its checks elsewhere are flagged.
      const frOnly = BRANDS.map((_, b) => lit(id('ba', b * 4))).join(', ');
      await prisma.$executeRawUnsafe(`UPDATE "trace_batches" SET "allowedCountries" = 'FR' WHERE "id" IN (${frOnly})`);
      await prisma.$executeRawUnsafe(`UPDATE "trace_scans" SET "diverted" = 1 WHERE "brandId" LIKE 'smpb%' AND "country" <> 'FR' AND "codeId" IN (SELECT c."id" FROM "trace_codes" c JOIN "trace_batches" b ON b."id" = c."batchId" WHERE b."allowedCountries" = 'FR')`);
      await prisma.$executeRawUnsafe(`UPDATE "trace_batches" SET "blockedAt" = ? WHERE "id" = ?`, iso(now - 4 * DAY), id('ba', 41));
      return reviews.length + wins.length + warranties.length;
    } },
    { label: 'Relief needs and offers', run: async () => {
      const r = rng(31);
      const NEEDS: [ReliefKind, string][] = [['FOOD', 'Food for a family of'], ['WATER', 'Drinking water for'], ['SHELTER', 'Shelter tonight for'], ['MEDICAL', 'Insulin and a ride to the clinic for'], ['CLOTHES', 'Warm clothes for'], ['TRANSPORT', 'A van to move supplies for'], ['FOOD', 'Baby formula for']];
      const OFFERS: [ReliefKind, string][] = [['TRANSPORT', 'I can drive supplies on weekends'], ['SHELTER', 'Spare room for two nights'], ['FOOD', 'Hot meals every evening'], ['WATER', '40 L of water every day'], ['MEDICAL', 'First aid, I’m a nurse'], ['CLOTHES', 'Winter coats to give away']];
      const rows = Array.from({ length: 320 }, (_, i) => {
        const c = pick(r, BIG), need = r() < 0.75, people = 1 + Math.floor(r() * 12), at = now - Math.pow(r(), 1.3) * 28 * DAY;
        const what = pick(r, need ? NEEDS : OFFERS);
        const status = need ? pick(r, ['OPEN', 'OPEN', 'TAKEN', 'DONE', 'DONE', 'DONE']) : 'OPEN', helper = status === 'OPEN' ? null : pick(r, P).id;
        return [id('rl', i), pick(r, P).id, need ? 'NEED' : 'OFFER', what[0], need ? `${what[1]} ${people}` : what[1], null, people, need ? pick(r, URGENCIES) : 'LOW', snap(c[1] + (r() - 0.5) * 0.3), snap(c[2] + (r() - 0.5) * 0.3), c[0], status, helper, helper ? iso(at + 3600_000) : null, status === 'DONE' ? iso(at + (1 + r() * 20) * 3600_000) : null, iso(at)];
      });
      await insert('relief_posts', ['id', 'userId', 'type', 'kind', 'title', 'details', 'people', 'urgency', 'lat', 'lng', 'place', 'status', 'helperId', 'takenAt', 'doneAt', 'createdAt'], rows);
      return rows.length;
    } },
    { label: 'Green actions and teams', run: async () => {
      const r = rng(32);
      const TEAMS = ['Class 10B', 'Riverside Cycling Club', 'Marketing team', 'Green Ward 12', 'Engineering', 'Eco Warriors', 'Sunrise School', 'Climate Crew', 'Plant Parents', 'Zero Waste Hub', 'Office Bikers', 'Tree Huggers', 'Campus Greens', 'Night Shift', 'Ocean Savers'];
      await insert('green_teams', ['id', 'name', 'code', 'ownerId', 'createdAt'], TEAMS.map((n, i) => [id('gt', i), n, `S${toBase32(crypto.randomBytes(4), 5)}`, P[100 + i].id, iso(now - 30 * DAY)]));
      const members: unknown[][] = [];
      P.slice(100, 250).forEach((p, i) => members.push([id('gt', i % TEAMS.length), p.id, iso(now - 25 * DAY)]));
      await insert('green_members', ['teamId', 'userId', 'createdAt'], members);
      const AMT: Record<GreenKind, [number, number]> = { TREE: [1, 5], CYCLE: [2, 30], TRANSIT: [5, 60], WALK: [1, 8], RECYCLE: [1, 12], SOLAR: [5, 40], MEATFREE: [1, 3], CLEANUP: [1, 10] };
      const rows = Array.from({ length: 1800 }, (_, i) => {
        const p = P[100 + Math.floor(r() * 150)], k = pick(r, GREEN_KINDS), [lo, hi] = AMT[k], amount = Math.round((lo + r() * (hi - lo)) * 10) / 10, c = r() < 0.7 ? p.city : pick(r, BIG);
        return [id('ga', i), p.id, k, amount, co2For(k, amount), null, Math.round(c[1] * 10) / 10, Math.round(c[2] * 10) / 10, c[0], iso(now - Math.pow(r(), 1.2) * 60 * DAY)];
      });
      await insert('green_actions', ['id', 'userId', 'kind', 'amount', 'co2Kg', 'note', 'lat', 'lng', 'place', 'createdAt'], rows);
      return rows.length;
    } },
  ];
  return steps;
}

/** How much sample data is in the database now. */
export async function sampleStatus() {
  const [people, brands, scans, relief, green] = await Promise.all([
    prisma.user.count({ where: { email: { endsWith: DOMAIN } } }),
    prisma.traceBrand.count({ where: { slug: { startsWith: 'sample-' } } }),
    prisma.traceScan.count({ where: { brandId: { startsWith: 'smp' } } }),
    prisma.reliefPost.count({ where: { id: { startsWith: 'smp' } } }),
    prisma.greenAction.count({ where: { id: { startsWith: 'smp' } } }),
  ]);
  return { people, brands, scans, relief, green, steps: sampleSteps().map((s) => s.label) };
}

/** Removes exactly the sample data (in the order the database's links allow). */
export async function clearSample() {
  const [{ n }] = await prisma.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(*) AS n FROM "users" WHERE "email" LIKE '%${DOMAIN}'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "trace_brands" WHERE "slug" LIKE 'sample-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "error_reports" WHERE "fingerprint" LIKE 'sample:%'`);
  for (const t of ['payments', 'conversations', 'audit_logs', 'green_teams', 'relief_posts', 'green_actions']) await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "id" LIKE 'smp%'`);
  // Their sign-ins, page visits, messages, points and cash-outs go with them (ON DELETE CASCADE).
  await prisma.$executeRawUnsafe(`DELETE FROM "users" WHERE "email" LIKE '%${DOMAIN}'`);
  return { removed: Number(n) };
}
