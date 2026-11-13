import crypto from 'node:crypto';
import prisma from '@/lib/db';
import { CITIES } from '@/components/trace/map/cities';
import { co2For, GREEN_KINDS, type GreenKind } from '@/lib/green';
import { AID_STEPS, RELIEF_KINDS, SKILLS, STOCK, URGENCIES, snap, type ReliefKind } from '@/lib/relief';
import { GAMES, GAME_IDS } from '@/lib/play';
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
// M170 (the owner, 13 Nov: "add a lot of sample data… for all the five apps so that i can try and test
// all features"): also a sample school (Sample Academy: 12 courses with timetables, enrolments,
// assignments with submissions and grades, quizzes with questions and answers, announcements, two
// weeks of attendance), Relief organisations (shelters with beds and stock, members, supplies, shifts,
// two emergencies with "I'm safe" check-ins, aid boxes on their way, helpers with skills), Trace's
// owners, repairs, take-backs and fake-label reports, and Play scores. The owner who fills it is let in
// to try things: a sample brand's owner (when they have no brand), a coordinator of a sample Relief
// organisation, a member of a Green team with a few weeks of actions, Play scores, and, as a student,
// enrolled in sample courses (as a teacher, teaching two). All of it goes with "Remove" (ids "smp…").

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
  ['Aurora Foods', 'food', '#fe81d1'], ['Nordlys Skincare', 'cosmetics', '#e46bdb'], ['Kaveri Spices', 'food', '#f59e0b'], ['Velo Parts', 'auto parts', '#60a5fa'],
  ['Maison Lumière', 'cosmetics', '#ff9fdc'], ['TerraBrew Coffee', 'drinks', '#a16207'], ['Pulse Pharma', 'pharma', '#34d399'], ['Atlas Footwear', 'fashion', '#818cf8'],
  ['Sakura Tea Co.', 'drinks', '#fb7185'], ['Andes Wool', 'fashion', '#a9b4ff'], ['Bolt Electronics', 'electronics', '#38bdf8'], ['Olivo Verde', 'food', '#84cc16'],
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

/** The owner filling the sample (let into some of it, to try things). */
export interface SampleOwner { id: string; role: string }

// Codes are unique across the site: the sample's carry "SA-" (Sample Academy) so they never meet a real school's.
const COURSES: [string, string, string, string, string][] = [
  ['CS101', 'Introduction to Computer Science', 'Computer Science', '#6366f1', '💻'], ['MATH201', 'Linear Algebra', 'Mathematics', '#f59e0b', '📐'],
  ['PHY110', 'Physics I: Mechanics', 'Physics', '#0ea5e9', '🪐'], ['BIO120', 'Cell Biology', 'Biology', '#10b981', '🧬'],
  ['ENG150', 'Academic Writing', 'English', '#e11d48', '✍️'], ['HIS210', 'World History', 'History', '#a16207', '🏛️'],
  ['ECO101', 'Principles of Economics', 'Economics', '#22c55e', '📈'], ['CHE130', 'General Chemistry', 'Chemistry', '#8b5cf6', '⚗️'],
  ['ART105', 'Design Basics', 'Arts', '#ec4899', '🎨'], ['ENV200', 'Climate and Society', 'Environmental Science', '#16a34a', '🌍'],
  ['DS220', 'Data Science with Python', 'Computer Science', '#3b82f6', '🐍'], ['PSY101', 'Introduction to Psychology', 'Psychology', '#f97316', '🧠'],
];
const WORK = ['Problem set', 'Reading response', 'Lab report', 'Short essay', 'Project proposal'];
const QUIZ = ['Week 2 check-in', 'Mid-term practice', 'Unit test'];
/** Days of the course each piece of work was due, from now (negative: past). */
const DUE = [-25, -15, -5, 4, 12];
const midnight = (ms: number) => { const d = new Date(ms); d.setUTCHours(0, 0, 0, 0); return d.getTime(); };

export function sampleSteps(me?: SampleOwner | null): SampleStep[] {
  const P = people(), now = Date.now();
  // The school: teachers 6–39, students 40–299 (and the owner, when they are a student).
  const teacherOf = (c: number) => (me?.role === 'TEACHER' && c >= 10 ? me.id : P[6 + c * 2].id);
  const students = [...P.slice(40).map((p) => p.id), ...(me?.role === 'STUDENT' ? [me.id] : [])];
  /** Each student's courses (5 of the 12), the same every time. */
  const enrolled = (() => { const r = rng(40), out: [string, number][] = []; for (const sid of students) { const pickd = new Set<number>(); while (pickd.size < 5) pickd.add(Math.floor(r() * COURSES.length)); for (const c of pickd) out.push([sid, c]); } return out; })();
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

    // ── M170: the school ──
    { label: 'School, courses and timetable', run: async () => {
      const r = rng(41);
      await insert('organizations', ['id', 'name', 'ownerId', 'createdAt', 'updatedAt'], [[id('or', 0), 'Sample Academy', P[0].id, iso(now - 120 * DAY), iso(now - 120 * DAY)]]);
      await prisma.$executeRawUnsafe(`UPDATE "users" SET "organizationId" = ? WHERE "email" LIKE '%${DOMAIN}'`, id('or', 0));
      await insert('courses', ['id', 'code', 'name', 'description', 'credits', 'department', 'status', 'teacherId', 'color', 'emoji', 'createdAt', 'updatedAt'],
        COURSES.map(([code, name, dept, color, emoji], c) => [id('cr', c), `SA-${code}`, name, `${name}: lectures, readings, weekly practice and a project.`, 3 + (c % 2), dept, 'PUBLISHED', teacherOf(c), color, emoji, iso(now - 100 * DAY), iso(now - 2 * DAY)]));
      const slots: unknown[][] = [];
      COURSES.forEach((_, c) => [c % 5, (c + 2) % 5].forEach((day, k) => { const h = 8 + ((c * 3 + k * 2) % 9); slots.push([id('ts', c * 2 + k), id('cr', c), day, `${String(h).padStart(2, '0')}:00`, `${String(h + 1).padStart(2, '0')}:30`, k ? 'LAB' : 'LECTURE', iso(now - 90 * DAY), iso(now - 90 * DAY)]); }));
      await insert('timetable_slots', ['id', 'courseId', 'dayOfWeek', 'startTime', 'endTime', 'type', 'createdAt', 'updatedAt'], slots);
      await insert('enrollments', ['id', 'studentId', 'courseId', 'enrolledAt'], enrolled.map(([sid, c], n) => [id('en', n), sid, id('cr', c), iso(now - (60 + r() * 30) * DAY)]));
      const NEWS = ['Welcome to the course', 'Room change this week', 'Project groups are up', 'Office hours moved to Thursday', 'Mid-term next week: what to revise'];
      const posts = COURSES.flatMap((_, c) => [0, 1].map((k) => [id('an', c * 2 + k), pick(r, NEWS), 'Details are in the course page. Ask in the class chat if anything is unclear.', 'COURSE', id('cr', c), teacherOf(c), iso(now - (k ? 3 : 40) * DAY), iso(now - (k ? 3 : 40) * DAY)]));
      posts.push(...['Sports day on Friday', 'Library open late during exams', 'New lab equipment arrived', 'School trip sign-ups'].map((t, k) => [id('an', 100 + k), t, 'All students and staff: see the details on the notice board.', 'ALL', null, P[k].id, iso(now - (2 + k * 6) * DAY), iso(now - (2 + k * 6) * DAY)]));
      await insert('announcements', ['id', 'title', 'body', 'target', 'courseId', 'authorId', 'createdAt', 'updatedAt'], posts);
      return COURSES.length + slots.length + enrolled.length + posts.length;
    } },
    { label: 'Assignments and quizzes', run: async () => {
      const rubric = JSON.stringify([{ id: 'c1', criterion: 'Understanding', points: 40 }, { id: 'c2', criterion: 'Reasoning and evidence', points: 40 }, { id: 'c3', criterion: 'Clarity', points: 20 }]);
      const work = COURSES.flatMap(([, name], c) => WORK.map((w, k) => [id('as', c * 5 + k), id('cr', c), teacherOf(c), `${w} ${k + 1}: ${name}`, `Answer the questions in the ${w.toLowerCase()} using this week's readings. Show your working.`, rubric, 100, 1, iso(now + DUE[k] * DAY), 'OPEN', iso(now + (DUE[k] - 10) * DAY), iso(now + (DUE[k] - 10) * DAY)]));
      await insert('assignments', ['id', 'courseId', 'createdById', 'title', 'instructions', 'rubric', 'maxScore', 'weight', 'dueDate', 'status', 'createdAt', 'updatedAt'], work);
      const quizzes = COURSES.flatMap(([, name], c) => QUIZ.map((q, k) => [id('qz', c * 3 + k), id('cr', c), `${q}: ${name}`, 'Five questions, twenty minutes.', iso(now + [-20, -8, 6][k] * DAY), 20, 'PUBLISHED', iso(now - 30 * DAY), iso(now - 30 * DAY)]));
      await insert('quizzes', ['id', 'courseId', 'title', 'description', 'dueDate', 'timeLimit', 'status', 'createdAt', 'updatedAt'], quizzes);
      const qs: unknown[][] = [];
      COURSES.forEach(([, name, dept], c) => QUIZ.forEach((_, k) => { for (let n = 0; n < 5; n++) {
        const opts = [`Option A about ${dept}`, `Option B about ${dept}`, `Option C about ${dept}`, `Option D about ${dept}`];
        qs.push([id('qq', (c * 3 + k) * 5 + n), id('qz', c * 3 + k), `Question ${n + 1} of ${name}: which of these is true?`, JSON.stringify(opts), opts[(c + k + n) % 4], 1, n, 'CHOICE']);
      } }));
      await insert('quiz_questions', ['id', 'quizId', 'question', 'options', 'correctAnswer', 'points', 'order', 'type'], qs);
      return work.length + quizzes.length + qs.length;
    } },
    { label: 'Submissions and grades', run: async () => {
      const r = rng(42);
      const subs: unknown[][] = [], grades: unknown[][] = [];
      const FB = ['Clear and well argued.', 'Good start: back your points with the readings.', 'Excellent work.', 'Check your calculations in part 2.', 'Well structured, a little short.'];
      enrolled.forEach(([sid, c], n) => {
        const skill = 0.55 + ((n * 7919) % 100) / 250; // each student's level, 55–95%
        DUE.forEach((d, k) => {
          if (d > 0 || r() > 0.88) return; // only past work, most of it handed in
          const score = Math.max(30, Math.min(100, Math.round((skill + (r() - 0.5) * 0.25) * 100)));
          const graded = d < -6 || r() < 0.5, at = now + (d - r() * 2) * DAY, title = `${WORK[k]} ${k + 1}: ${COURSES[c][1]}`;
          subs.push([id('su', n * 5 + k), id('as', c * 5 + k), sid, `My answer to the ${WORK[k].toLowerCase()}: worked through each question with the readings.`, graded ? 'RETURNED' : 'SUBMITTED', graded ? score : null, graded ? pick(r, FB) : null, iso(at), graded ? iso(at + 3 * DAY) : null, iso(at)]);
          if (graded) grades.push([id('gr', n * 5 + k), sid, id('cr', c), title, score, 100, 1, 'GRADED', pick(r, FB), iso(at + 3 * DAY), iso(at + 3 * DAY), iso(at + 3 * DAY)]);
        });
      });
      await insert('assignment_submissions', ['id', 'assignmentId', 'studentId', 'text', 'status', 'score', 'feedback', 'submittedAt', 'returnedAt', 'updatedAt'], subs);
      await insert('grades', ['id', 'studentId', 'courseId', 'assignmentName', 'score', 'maxScore', 'weight', 'status', 'feedback', 'gradedAt', 'createdAt', 'updatedAt'], grades);
      return subs.length + grades.length;
    } },
    { label: 'Quiz answers', run: async () => {
      const r = rng(43);
      const rows: unknown[][] = [];
      enrolled.forEach(([sid, c], n) => [0, 1].forEach((k) => {
        if (r() > 0.85) return;
        const quiz = c * 3 + k, answers: Record<string, string> = {};
        let right = 0;
        for (let q = 0; q < 5; q++) { const correct = r() < 0.72, opt = correct ? (c + k + q) % 4 : (c + k + q + 1 + Math.floor(r() * 3)) % 4; answers[id('qq', quiz * 5 + q)] = `Option ${'ABCD'[opt]} about ${COURSES[c][2]}`; if (correct) right++; }
        rows.push([id('qs', n * 2 + k), id('qz', quiz), sid, JSON.stringify(answers), right, 5, iso(now + ([-20, -8][k] - r()) * DAY)]);
      }));
      await insert('quiz_submissions', ['id', 'quizId', 'studentId', 'answers', 'score', 'maxScore', 'submittedAt'], rows);
      return rows.length;
    } },
    { label: 'Attendance (two weeks)', run: async () => {
      const r = rng(44);
      // The last ten school days, each course on its two days a week (stored at midnight UTC of the day).
      const days: number[] = [];
      for (let d = 1; days.length < 10; d++) { const t = midnight(now - d * DAY), w = new Date(t).getUTCDay(); if (w !== 0 && w !== 6) days.push(t); }
      const rows: unknown[][] = [];
      enrolled.forEach(([sid, c], n) => {
        const keen = 0.8 + ((n * 104729) % 100) / 600;
        days.forEach((t, k) => {
          const dow = (new Date(t).getUTCDay() + 6) % 7; // 0 = Monday
          if (dow !== c % 5 && dow !== (c + 2) % 5) return;
          const x = r(), status = x < keen ? 'PRESENT' : x < keen + 0.06 ? 'LATE' : x < keen + 0.13 ? 'ABSENT' : 'EXCUSED';
          rows.push([id('at', n * 10 + k), sid, id('cr', c), iso(t), status, status === 'EXCUSED' ? 'Doctor’s note' : null, iso(t + 10 * 3600_000)]);
        });
      });
      await insert('attendance', ['id', 'studentId', 'courseId', 'date', 'status', 'note', 'createdAt'], rows);
      return rows.length;
    } },
    // ── M170: Relief organisations, shelters, emergencies and aid ──
    { label: 'Relief organisations and aid', run: async () => {
      const r = rng(45);
      const ORGS: [string, string][] = [['Riverside Relief Network', 'NGO'], ['City Food Bank', 'FOOD_BANK'], ['Harbour Night Shelter', 'SHELTER'], ['St. Mary’s Clinic', 'CLINIC'], ['Unity Mosque Kitchen', 'FAITH'], ['Ward 12 Neighbours', 'COMMUNITY'], ['Sunrise School Volunteers', 'SCHOOL'], ['Red Lantern Aid', 'NGO'], ['Hilltop Family Shelter', 'SHELTER'], ['Open Hands Pantry', 'FOOD_BANK']];
      const city = ORGS.map(() => pick(r, BIG));
      const code = () => toBase32(crypto.randomBytes(5), 6);
      await insert('relief_orgs', ['id', 'name', 'kind', 'about', 'place', 'lat', 'lng', 'code', 'createdById', 'createdAt', 'openNow', 'bedsFree', 'bedsTotal', 'water', 'food', 'power', 'statusNote', 'statusAt'],
        ORGS.map(([name, kind], o) => { const beds = kind === 'SHELTER' ? 40 + Math.floor(r() * 80) : kind === 'CLINIC' ? 12 : null; return [id('ro', o), name, kind, `${name}: volunteers helping families in ${city[o][0]}.`, city[o][0], snap(city[o][1]), snap(city[o][2]), code(), P[20 + o].id, iso(now - (30 + r() * 60) * DAY), 1, beds === null ? null : Math.floor(beds * r() * 0.6), beds, pick(r, STOCK), pick(r, STOCK), pick(r, STOCK), pick(r, ['Doors open until 22:00', 'Hot meals at 19:00', 'Bring ID if you can', null]), iso(now - r() * 6 * 3600_000)]; }));
      const members: unknown[][] = [];
      ORGS.forEach((_, o) => { members.push([id('ro', o), P[20 + o].id, 'OWNER', iso(now - 50 * DAY)]); for (let k = 0; k < 10; k++) members.push([id('ro', o), P[60 + o * 12 + k].id, k < 2 ? 'COORDINATOR' : 'VOLUNTEER', iso(now - (5 + r() * 40) * DAY)]); });
      if (me) members.push([id('ro', 0), me.id, 'COORDINATOR', iso(now - 10 * DAY)], [id('ro', 2), me.id, 'VOLUNTEER', iso(now - 9 * DAY)]);
      await insert('relief_org_members', ['orgId', 'userId', 'role', 'createdAt'], members);
      const STUFF: [string, ReliefKind, string][] = [['Rice', 'FOOD', 'kg'], ['Drinking water', 'WATER', 'litres'], ['Blankets', 'SHELTER', 'items'], ['First-aid kits', 'MEDICAL', 'kits'], ['Baby formula', 'FOOD', 'tins'], ['Winter coats', 'CLOTHES', 'items']];
      await insert('relief_supplies', ['id', 'orgId', 'name', 'kind', 'unit', 'quantity', 'lowAt', 'updatedAt', 'createdAt'],
        ORGS.flatMap((_, o) => STUFF.map(([n, k, u], i) => [id('rs', o * 6 + i), id('ro', o), n, k, u, Math.floor(r() * 400), 50, iso(now - r() * 3 * DAY), iso(now - 30 * DAY)])));
      const shifts: unknown[][] = [], signups: unknown[][] = [];
      ORGS.forEach((_, o) => { for (let k = 0; k < 4; k++) { const start = midnight(now + (1 + k * 2) * DAY) + (8 + k * 2) * 3600_000, slots = 3 + Math.floor(r() * 6), filled = Math.floor(r() * slots); shifts.push([id('rh', o * 4 + k), id('ro', o), pick(r, ['Sorting donations', 'Kitchen shift', 'Night desk', 'Delivery run']), 'Meet at the front desk.', city[o][0], iso(start), iso(start + 4 * 3600_000), slots, filled, 0, P[20 + o].id, iso(now - 5 * DAY)]); for (let f = 0; f < filled; f++) signups.push([id('rh', o * 4 + k), P[60 + o * 12 + f].id, iso(now - r() * 4 * DAY)]); } });
      await insert('relief_shifts', ['id', 'orgId', 'title', 'details', 'place', 'startsAt', 'endsAt', 'slots', 'filled', 'membersOnly', 'createdById', 'createdAt'], shifts);
      await insert('relief_shift_signups', ['shiftId', 'userId', 'createdAt'], signups);
      // Two emergencies going on now, with people saying they're safe.
      await insert('relief_incidents', ['id', 'orgId', 'createdById', 'title', 'place', 'lat', 'lng', 'radiusKm', 'endsAt', 'createdAt'], [
        [id('ri', 0), id('ro', 0), P[20].id, `Flooding in ${city[0][0]}`, city[0][0], snap(city[0][1]), snap(city[0][2]), 20, iso(now + 2 * DAY), iso(now - 6 * 3600_000)],
        [id('ri', 1), id('ro', 3), P[23].id, `Heatwave in ${city[3][0]}`, city[3][0], snap(city[3][1]), snap(city[3][2]), 15, iso(now + DAY), iso(now - 3 * 3600_000)],
      ]);
      await insert('relief_safe', ['incidentId', 'userId', 'createdAt'], [...P.slice(60, 100).map((p) => [id('ri', 0), p.id, iso(now - r() * 5 * 3600_000)]), ...P.slice(100, 125).map((p) => [id('ri', 1), p.id, iso(now - r() * 2 * 3600_000)])]);
      // Aid boxes, each with its trip so far.
      const BOX = ['Hygiene kits and water for 20 families', 'Blankets and tarpaulins', 'School kits for 60 children', 'Medicines for the clinic', 'Dry food for a week', 'Baby supplies'];
      const aid: unknown[][] = [], steps: unknown[][] = [];
      for (let a = 0; a < 40; a++) {
        const o = a % ORGS.length, to = pick(r, BIG), at = now - (1 + r() * 12) * DAY, reach = Math.floor(r() * 3), status = AID_STEPS[reach];
        aid.push([id('ra', a), id('ro', o), toBase32(crypto.randomBytes(7), 10), pick(r, BOX), 1 + Math.floor(r() * 30), city[o][0], to[0], status, P[20 + o].id, iso(at), iso(at + reach * DAY)]);
        for (let k = 0; k <= reach; k++) { const where = k === 0 ? city[o] : k === 1 ? pick(r, BIG) : to; steps.push([id('rt', a * 3 + k), id('ra', a), AID_STEPS[k], where[0], k === 2 ? 'Handed to the families' : null, iso(at + k * DAY), snap(where[1]), snap(where[2]), pick(r, FIRST)]); }
      }
      await insert('relief_aid', ['id', 'orgId', 'code', 'contents', 'boxes', 'fromPlace', 'toPlace', 'status', 'createdById', 'createdAt', 'updatedAt'], aid);
      await insert('relief_aid_steps', ['id', 'aidId', 'status', 'place', 'note', 'createdAt', 'lat', 'lng', 'byName'], steps);
      // Helpers with their skills and alerts.
      const watches = P.slice(130, 220).map((p) => { const c = r() < 0.7 ? p.city : pick(r, BIG), n = 1 + Math.floor(r() * 3), sk = new Set<string>(); while (sk.size < n) sk.add(pick(r, SKILLS)); return [p.id, snap(c[1]), snap(c[2]), 5 + Math.floor(r() * 16), r() < 0.5 ? 1 : 0, r() < 0.3 ? pick(r, RELIEF_KINDS) : null, iso(now - r() * 30 * DAY), [...sk].join(','), 0]; });
      await insert('relief_watches', ['userId', 'lat', 'lng', 'radiusKm', 'urgentOnly', 'kinds', 'createdAt', 'skills', 'email'], watches);
      return ORGS.length + members.length + shifts.length + aid.length + steps.length + watches.length;
    } },
    // ── M170: Trace's owners, repairs, take-backs and fake-label reports ──
    { label: 'Trace owners, repairs and reports', run: async () => {
      const r = rng(46);
      const codes = await prisma.$queryRawUnsafe<{ id: string; brandId: string; productId: string }[]>(`SELECT "id", "brandId", "productId" FROM "trace_codes" WHERE "brandId" LIKE 'smp%' ORDER BY "id" LIMIT 700`);
      if (!codes.length) return 0;
      const owners = codes.slice(0, 320).map((c, i) => [id('ow', i), c.id, c.brandId, c.productId, pick(r, P).id, 1 + Math.floor(Math.pow(r(), 2) * 3), iso(now - r() * 200 * DAY), iso(now - r() * 200 * DAY)]);
      await insert('trace_owners', ['id', 'codeId', 'brandId', 'productId', 'userId', 'owners', 'since', 'createdAt'], owners);
      const FIX: [string, string | null][] = [['Replaced the battery', 'Battery'], ['New sole stitched on', 'Sole'], ['Screen repaired', 'Screen'], ['Zip replaced', 'Zip'], ['Serviced and cleaned', null], ['Strap replaced', 'Strap']];
      await insert('trace_repairs', ['id', 'codeId', 'brandId', 'productId', 'userId', 'by', 'what', 'parts', 'createdAt'],
        Array.from({ length: 260 }, (_, i) => { const c = codes[Math.floor(r() * 320)], [what, part] = pick(r, FIX), brand = r() < 0.4; return [id('rp', i), c.id, c.brandId, c.productId, brand ? null : pick(r, P).id, brand ? 'BRAND' : 'OWNER', what, part, iso(now - r() * 150 * DAY)]; }));
      await prisma.$executeRawUnsafe(`UPDATE "trace_products" SET "takeBackHow" = 'Hand it in at any partner store, or post it with the free label', "takeBackPoints" = 25 WHERE "brandId" LIKE 'smp%'`);
      await insert('trace_takebacks', ['id', 'codeId', 'brandId', 'productId', 'userId', 'status', 'dropCode', 'points', 'receivedAt', 'createdAt'],
        codes.slice(320, 460).map((c, i) => { const got = r() < 0.6, at = now - r() * 40 * DAY; return [id('tb', i), c.id, c.brandId, c.productId, pick(r, P).id, got ? 'RECEIVED' : 'ASKED', toBase32(crypto.randomBytes(5), 6), 25, got ? iso(at + (1 + r() * 6) * DAY) : null, iso(at)]; }));
      const SHOPS = ['Corner Market', 'Bazaar stall 14', 'Online: DealzHub', 'Night market', 'Station kiosk', 'MegaSave Outlet'];
      await insert('trace_fake_reports', ['id', 'codeId', 'brandId', 'productId', 'userId', 'shop', 'area', 'price', 'lat', 'lng', 'country', 'createdAt'],
        Array.from({ length: 150 }, (_, i) => { const c = pick(r, codes), city = pick(r, BIG); return [id('fk', i), c.id, c.brandId, c.productId, pick(r, P).id, pick(r, SHOPS), city[0], `${(3 + r() * 40).toFixed(2)} €`, Math.round(city[1] * 10) / 10, Math.round(city[2] * 10) / 10, cc(city[0]), iso(now - Math.pow(r(), 1.4) * 45 * DAY)]; }));
      // The owner runs a sample brand (when they have none: one brand per account).
      if (me) {
        const [{ n }] = await prisma.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(*) AS n FROM "trace_brand_members" WHERE "userId" = ?`, me.id);
        if (!Number(n)) await insert('trace_brand_members', ['brandId', 'userId', 'role', 'createdAt'], [[id('b', 0), me.id, 'OWNER', iso(now - 20 * DAY)]]);
      }
      return owners.length + 260 + 140 + 150;
    } },
    // ── M170: Play ──
    { label: 'Play scores', run: async () => {
      const r = rng(47);
      const rows = Array.from({ length: 3200 }, (_, i) => { const g = pick(r, GAME_IDS), multi = r() < 0.25; return [id('ps', i), pick(r, P).id, g, multi ? 'multi' : 'solo', Math.round(GAMES[g].maxScore * Math.pow(r(), 1.6) * 0.95), multi ? `S${toBase32(crypto.randomBytes(3), 4)}` : null, iso(now - Math.pow(r(), 1.3) * 45 * DAY)]; });
      if (me) GAME_IDS.forEach((g, k) => [0, 1, 2].forEach((t) => rows.push([id('pm', k * 3 + t), me.id, g, 'solo', Math.round(GAMES[g].maxScore * (0.3 + r() * 0.5)), null, iso(now - (k + t * 5) * DAY)])));
      await insert('game_scores', ['id', 'userId', 'game', 'mode', 'score', 'roomCode', 'createdAt'], rows);
      // The owner in a Green team, with a few weeks of actions (a streak, badges, the weekly challenge).
      if (me) {
        await insert('green_members', ['teamId', 'userId', 'createdAt'], [[id('gt', 0), me.id, iso(now - 21 * DAY)]]);
        const AMT: [GreenKind, number][] = [['CYCLE', 8], ['TRANSIT', 15], ['WALK', 3], ['RECYCLE', 4], ['MEATFREE', 1], ['TREE', 1]];
        const mine = Array.from({ length: 24 }, (_, d) => { const [k, a] = AMT[d % AMT.length]; return [id('gm', d), me.id, k, a, co2For(k, a), null, Math.round(P[0].city[1] * 10) / 10, Math.round(P[0].city[2] * 10) / 10, P[0].city[0], iso(now - d * DAY - 3 * 3600_000)]; });
        await insert('green_actions', ['id', 'userId', 'kind', 'amount', 'co2Kg', 'note', 'lat', 'lng', 'place', 'createdAt'], mine);
      }
      return rows.length;
    } },
  ];
  return steps;
}

/** How much sample data is in the database now. */
export async function sampleStatus() {
  const [people, brands, scans, relief, green, courses, orgs, scores] = await Promise.all([
    prisma.user.count({ where: { email: { endsWith: DOMAIN } } }),
    prisma.traceBrand.count({ where: { slug: { startsWith: 'sample-' } } }),
    prisma.traceScan.count({ where: { brandId: { startsWith: 'smp' } } }),
    prisma.reliefPost.count({ where: { id: { startsWith: 'smp' } } }),
    prisma.greenAction.count({ where: { id: { startsWith: 'smp' } } }),
    prisma.course.count({ where: { id: { startsWith: 'smp' } } }),
    prisma.reliefOrg.count({ where: { id: { startsWith: 'smp' } } }),
    prisma.gameScore.count({ where: { id: { startsWith: 'smp' } } }),
  ]);
  return { people, brands, scans, relief, green, courses, orgs, scores, steps: sampleSteps().map((s) => s.label) };
}

/** Removes exactly the sample data (in the order the database's links allow). */
export async function clearSample() {
  const [{ n }] = await prisma.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(*) AS n FROM "users" WHERE "email" LIKE '%${DOMAIN}'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "trace_brands" WHERE "slug" LIKE 'sample-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "error_reports" WHERE "fingerprint" LIKE 'sample:%'`);
  // (M170: announcements and courses before the people who wrote and teach them; their enrolments,
  // work, grades, attendance and quizzes go with the courses; the owner's memberships go with the
  // brand, organisation, team and courses they were let into.)
  for (const t of ['payments', 'conversations', 'audit_logs', 'green_teams', 'relief_posts', 'green_actions', 'announcements', 'courses', 'organizations', 'relief_orgs', 'trace_repairs', 'trace_takebacks', 'trace_fake_reports', 'trace_owners', 'game_scores']) await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "id" LIKE 'smp%'`);
  await prisma.$executeRawUnsafe(`UPDATE "trace_products" SET "takeBackHow" = NULL, "takeBackPoints" = 0 WHERE "brandId" LIKE 'smp%'`);
  // Their sign-ins, page visits, messages, points and cash-outs go with them (ON DELETE CASCADE).
  await prisma.$executeRawUnsafe(`DELETE FROM "users" WHERE "email" LIKE '%${DOMAIN}'`);
  return { removed: Number(n) };
}
