import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform';
import { FLOWS } from '../landing/flows';
import { GUIDE_AREAS as AREAS, GUIDE_ID_PREFIX } from './guide-title';
import { CORE, DEPS, DESCRIBED, ENUM_LIST, ENUMS, FIELDS, HISTORY, LANGUAGES, METHODS, MIGRATIONS, PAGES, ROUTES, TABLES, TEST_FILES, TESTS, VERSIONS } from './guide-data.gen';

// "UniVerse explained" (owner console → Explain UniVerse): one whiteboard about the whole site, in
// named frames: the ten whiteboard templates, every page by role, the jobs it runs by itself, how a
// request travels, safety, limits, a glossary, and charts and long lists made from the code itself
// (guide-data.gen.ts, written at build time: every route with its methods and purpose, page, table with
// its fields, core endpoint, described code file, test file, library and plan item). About 34,000 wide
// and 23,000 tall (M70), the whole of it on screen at about 4% zoom, with small even gaps. Like any template it's added on the first open of
// the new, empty board, as ordinary shapes the owner can edit; later openings add back any shape that
// never reached the room (guide-fill.ts), so the ids must stay fixed.
// Keep it true: when a big feature lands or goes, change the notes here (old boards keep theirs).

type El = ExcalidrawElementSkeleton & { id?: string; x?: number; y?: number; width?: number; height?: number };
const C = { student: '#a5d8ff', teacher: '#b2f2bb', admin: '#ffec99', parent: '#ffc9c9', owner: '#d0bfff', tech: '#99e9f2', warm: '#ffd8a8', grey: '#f1f3f5', white: '#ffffff' };

// Text in a box doesn't wrap by itself: break each line to the box's width, keeping a bullet's
// indent. M70: about 0.68 em a letter (0.6 was too little for the hand-drawn font, so Excalidraw
// wrapped again, the box grew taller and ran into the one below it).
const EM = 0.68;
function wrap(t: string, width: number, fontSize: number) {
  const max = Math.max(8, Math.floor((width - 24) / (fontSize * EM)));
  return t.split('\n').flatMap((line) => {
    const indent = /^(• |\s+)/.exec(line)?.[0].replace(/•/, ' ') ?? '';
    const out: string[] = [];
    let cur = '';
    for (const w of line.split(' ')) {
      if (cur && (cur + ' ' + w).length > max) { out.push(cur); cur = indent + w; } else cur = cur ? `${cur} ${w}` : w;
    }
    out.push(cur);
    return out;
  }).join('\n');
}
const INK = '#1e1e1e';
/** The biggest size (down to 12) at which the text fits its box's height, so no box has to grow. */
function fit(t: string, width: number, height: number, fontSize: number) {
  let f = fontSize;
  while (f > 12 && wrap(t, width, f).split('\n').length * f * 1.25 + 20 > height) f -= 1;
  return f;
}

/** One frame's worth of shapes, in its own coordinates (0, 0 at its top left). */
function section(key: string, name: string) {
  const els: El[] = [];
  let n = 0;
  const id = (s?: string) => `${GUIDE_ID_PREFIX}${key}-${s ?? n++}`;
  return {
    id,
    els,
    text(x: number, y: number, t: string, fontSize = 28, extra: Partial<El> = {}) {
      els.push({ type: 'text', id: id(), x, y, text: t, fontSize, ...extra } as El);
    },
    box(x: number, y: number, width: number, height: number, label: string, bg = 'transparent', extra: Partial<El> & { fontSize?: number } = {}) {
      const { fontSize: want = 20, ...rest } = extra;
      const fontSize = fit(label, width, height, want);
      els.push({ type: 'rectangle', id: id(), x, y, width, height, backgroundColor: bg, fillStyle: 'solid', roundness: { type: 3 }, label: { text: wrap(label, width, fontSize), fontSize, verticalAlign: 'top', textAlign: 'left', strokeColor: INK }, ...rest } as El);
    },
    note(x: number, y: number, width: number, height: number, t: string, bg: string, want = 16) {
      const fontSize = fit(t, width, height, want);
      // White and grey notes keep a soft edge, so they still show on a dark board.
      const edge = bg === C.white || bg === C.grey ? '#ced4da' : 'transparent';
      els.push({ type: 'rectangle', id: id(), x, y, width, height, backgroundColor: bg, fillStyle: 'solid', strokeColor: edge, roundness: { type: 3 }, label: { text: wrap(t, width, fontSize), fontSize, textAlign: 'left', verticalAlign: 'top', strokeColor: INK } } as El);
    },
    raw(e: El) { els.push({ id: id(), ...e } as El); },
    name,
  };
}
type Section = ReturnType<typeof section>;

/** The area's title bar, as wide as what's under it (content starts at y = 70). */
function titled(s: Section, title: string, colour: string) {
  const { w } = size(s);
  s.els.unshift({ type: 'rectangle', id: s.id('title'), x: 0, y: 0, width: w, height: 56, backgroundColor: colour, fillStyle: 'solid', strokeColor: 'transparent', roundness: { type: 3 },
    label: { text: title, fontSize: 30, textAlign: 'left', verticalAlign: 'middle', strokeColor: INK } } as El);
  return s;
}

// Rough size of a shape, for the frame around a section (text: by its longest line).
function bounds(e: El) {
  if (e.type === 'text') {
    const t = (e as { text: string; fontSize?: number });
    const lines = t.text.split('\n');
    const fs = t.fontSize ?? 20;
    return { x: e.x ?? 0, y: e.y ?? 0, w: Math.max(...lines.map((l) => l.length)) * fs * 0.56, h: lines.length * fs * 1.35 };
  }
  return { x: e.x ?? 0, y: e.y ?? 0, w: e.width ?? 0, h: e.height ?? 0 };
}
function size(s: Section) {
  const b = s.els.map(bounds);
  return { w: Math.max(...b.map((r) => r.x + r.w)), h: Math.max(...b.map((r) => r.y + r.h)) };
}

const lines = (...l: string[]) => l.join('\n');
const bullets = (...l: string[]) => l.map((x) => `• ${x}`).join('\n');

// ─── 1 · Blank canvas: start here (the banner across the top, as wide as the board) ─────────────
function startHere() {
  const s = section('start', '1 · Start here');
  s.text(0, 0, 'UniVerse, explained', 230);
  s.text(0, 330, 'One platform for a whole school, on the web and as a phone app.', 62);
  s.text(0, 450, lines(
    'Students, teachers, parents, school admins and the owner each get their own menu.',
    'This board explains every part: what it does, how it works, the technology underneath.',
    `${AREAS.length} kinds of area, each in its own frame: zoom in on any of them, or press Present to walk through.`,
  ), 44);
  // The numbers that describe it: eight tiles in two rows.
  ([['5', 'roles, one sign-in'], [String(LANGUAGES.length), `languages, ${LANGUAGES.filter((l) => l[3]).length} right to left`], ['8', 'quiz question types, marked for you'], ['8', 'jobs it runs by itself'],
    [String(ROUTES.length), 'server routes, each checks who asks'], [String(PAGES.length), 'pages, on phone and desktop'], ['$0', 'for students, always'], ['$5', 'a month to run it (Cloudflare)']] as const)
    .forEach(([n, t], i) => s.note(3000 + (i % 4) * 1060, Math.floor(i / 4) * 330, 1010, 300, `${n}\n${t}`, [C.student, C.teacher, C.admin, C.warm, C.tech, C.owner, C.parent, C.tech][i], 58));
  // The colours used across the board.
  s.text(7360, 0, 'Colours', 50);
  ([['Students', C.student], ['Teachers', C.teacher], ['School admins', C.admin], ['Parents', C.parent], ['Owner (you)', C.owner], ['Technical', C.tech]] as const)
    .forEach(([t, c], i) => s.note(7360 + (i % 2) * 700, 90 + Math.floor(i / 2) * 190, 660, 170, t, c, 44));
  // Every area on the board, in four columns.
  s.text(8820, 0, `The ${AREAS.length} areas`, 50);
  const per = Math.ceil(AREAS.length / 4);
  for (let col = 0; col < 4; col++) {
    s.note(8820 + col * 2030, 90, 1990, Math.max(560, 40 + per * 36), AREAS.slice(col * per, col * per + per).map((t, i) => `${col * per + i + 1}  ${t}`).join('\n'), C.grey, 28);
  }
  // The languages, and how to read the board.
  s.note(0, 700, 8320, 150, `Languages: ${LANGUAGES.map((l) => l[1]).join(', ')}`, C.white, 44);
  s.note(8820, 700, 8110, 150, 'Reading it: each area’s coloured bar names it; the colours say who it’s for; notes with a person icon ask a person', C.white, 44);
  return s;
}

// ─── 2 · Mind map: every feature ────────────────────────────────────────────────────────────────
function everyFeature() {
  const s = section('map', '2 · Every feature');
  const cx = 1300, cy = 900;
  s.raw({ type: 'ellipse', id: s.id('centre'), x: cx - 170, y: cy - 80, width: 340, height: 160, backgroundColor: C.owner, fillStyle: 'solid', label: { text: 'UniVerse', fontSize: 36 } } as El);
  const branches: [string, string, string][] = [
    ['Learning', C.student, bullets('Courses and the course marketplace', 'Blackboard: each course’s posts and materials', 'Assignments and grades, rubrics, feedback', 'Quizzes: 8 auto-marked types, maths answers,', '  question pools, exams, adaptive practice,', '  live quiz game, GIFT and QTI import', 'Copy a course to a new term; Common Cartridge')],
    ['Study tools', C.student, bullets('AI tutor: homework photo hints, tutor modes', 'Voice tutor', 'Flashcards with spaced repetition (FSRS)', 'Practice tests, study planner', 'Maths and chemistry shown properly (KaTeX)')],
    ['Collaborate', C.teacher, bullets('Spaces for classes and groups', 'Whiteboards: live, 10 templates, AI drawing', 'Docs, sheets and slides (Word, Excel, PowerPoint)', 'Files: folders that open, versions, previews', 'Tools, code and tasks')],
    ['Talk and stay informed', C.teacher, bullets('Messages, groups and communities', 'Calls and live classes', 'Notifications: push, daily digest, snooze', 'Announcements and the blog', 'Search everything (⌘K)')],
    ['Running the school', C.admin, bullets('Attendance: from calls, location check, seating chart', 'Timetable generator, calendar, exam timetable', 'Admissions, registers, staff, library desk', 'Fees and payments (the school’s own Razorpay/Stripe)', 'Early warning, safety reports, approvals', 'Import and export, LMS integration')],
    ['Student life and careers', C.parent, bullets('Campus board, events, room booking, campus map', 'Carpool, housing, food pre-orders, lost and found', 'Internships, skills match, application tracker', 'Skills passport: credentials anyone can verify', 'CV builder, interview practice, mentors and alumni', 'Parents: link with a code, see grades and attendance')],
    ['Global impact', C.warm, bullets('Impact rooms and the Impact League', 'Donations and the sponsor portal', 'Partner institutions and research between schools', 'Impact reports and certifications')],
    ['Owner console', C.owner, bullets('Schools, moderation, languages', 'Health check, health numbers, server (Cloudflare)', 'Analytics, live activity, live chats, calls', 'People, database, all data, money', 'Changes and undo, errors hub (AI fixes), deletions', 'This board: Explain UniVerse')],
  ];
  const r = 620;
  branches.forEach(([title, colour, body], i) => {
    const a = (i / branches.length) * Math.PI * 2 - Math.PI / 2;
    const bx = cx + Math.cos(a) * r, by = cy + Math.sin(a) * r * 0.82;
    const id = s.id(`b${i}`);
    s.raw({ type: 'ellipse', id, x: bx - 140, y: by - 50, width: 280, height: 100, backgroundColor: colour, fillStyle: 'solid', label: { text: title, fontSize: 24 } } as El);
    // Edge to edge (where the line leaves each ellipse), so it never crosses a label.
    const dx = Math.cos(a), dy = Math.sin(a) * 0.82, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
    const edge = (rx: number, ry: number) => 1 / Math.hypot(ux / rx, uy / ry);
    const sx = cx + ux * (edge(170, 80) + 8), sy = cy + uy * (edge(170, 80) + 8);
    const ex = bx - ux * (edge(140, 50) + 8), ey = by - uy * (edge(140, 50) + 8);
    s.raw({ type: 'arrow', x: sx, y: sy, width: ex - sx, height: ey - sy, points: [[0, 0], [ex - sx, ey - sy]], strokeWidth: 2 } as El);
    const right = Math.cos(a) > 0.2, left = Math.cos(a) < -0.2;
    const nx = right ? bx + 160 : left ? bx - 160 - 440 : bx - 220;
    const ny = right || left ? by - 60 : by < cy ? by - 60 - 230 : by + 70;
    s.note(nx, ny, 440, 220, body, C.white, 15);
  });
  // The corners the branches leave free: who it's for, what every page does, where things live, cost.
  const corners: [number, number, number, string, string][] = [
    [60, 80, 360, `Who uses it\n\n${bullets('Students (always free)', 'Teachers and teaching assistants', 'School admins, one school or many', 'Parents, mentors and alumni', 'The owner (you)')}`, C.parent],
    [1800, 80, 360, `On every page\n\n${bullets('13 languages, 2 read right to left', 'Light and dark, Reduce Motion', 'Works on a patchy connection', 'Installs as an app on any phone')}`, C.student],
    [60, 1460, 250, `Where things live\n${bullets('D1 database, R2 files', 'Durable Objects: live rooms', 'Firebase: sign-in')}`, C.tech],
    [1800, 1460, 250, `What it costs to run\n${bullets('Workers Paid: $5 a month', 'A guard pauses at 90%', 'AI with daily allowances')}`, C.tech],
  ];
  corners.forEach(([x, y, h, t, c]) => s.note(x, y, 700, h, t, c, 26));
  return titled(s, 'Every feature, on one map', C.owner);
}

// ─── 3 · Kanban: where things stand ─────────────────────────────────────────────────────────────
function whereThingsStand() {
  const s = section('kanban', '3 · Where things stand');
  const cols: [string, string, string[]][] = [
    ['To do (owner decides)', C.parent, [
      'Phone sign-in: turn on Firebase billing so SMS codes can be sent (costs money)',
      'Keep Cloudflare Workers Paid on ($5 a month)',
      'Phone app in the app stores (needs Apple and Google accounts)',
      'Anything else that costs money or needs an account: always the owner’s call',
    ]],
    ['In progress', C.admin, [
      'The full bug and error review',
      'Check every new screen on Safari and iPhone',
      'Parent link code and console codes as code boxes',
      'Watching the Cloudflare plan: the guard pauses at 90%',
    ]],
    ['Done', C.teacher, [
      'Work queue Q1–Q23: courses, quizzes, attendance, calendar, AI tutor, search, notifications…',
      'Office suite (sheets, slides, Word) and security parts 1–7; payment keys encrypted',
      'The look: light trail, folders, code boxes, the owner console deck and feature flows',
      'Launch list and lean code: cookie choice, icons, contrast, broken links, pnpm lean',
    ]],
  ];
  const tall = Math.max(...cols.map(([, , items]) => items.length)) * 165 + 80;
  cols.forEach(([title, colour, items], i) => {
    s.box(i * 470, 70, 440, tall, title, 'transparent', { strokeStyle: 'dashed', fontSize: 26 });
    items.forEach((t, j) => s.note(i * 470 + 20, 130 + j * 165, 400, 145, t, colour, 18));
  });
  return titled(s, 'Where things stand (23 Oct 2026)', C.parent);
}

// ─── 4 · SWOT ──────────────────────────────────────────────────────────────────────────────────
function swot() {
  const s = section('swot', '4 · Strengths and risks');
  const q: [string, string, string][] = [
    ['Strengths', C.teacher, bullets('Everything a school needs in one place, one sign-in', 'Runs on Cloudflare’s network: fast everywhere, low cost', 'Works on phones, installs as an app, many languages', '  (Arabic and Urdu read right to left)', 'Accessible: screens checked with axe, light and dark', 'AI built in, with a daily allowance and an off switch')],
    ['Weaknesses', C.parent, bullets('So many features it can feel complicated', '  (breadcrumbs and simpler menus help)', 'One D1 database: at most 100 values a query', '  and 50 queries a request, so code must be careful', 'Some features wait on owner accounts (SMS, stores)', 'Tested mostly in Chrome: Safari needs checking')],
    ['Opportunities', C.student, bullets('Schools want one tool instead of ten', 'Many schools on one site (each admin sees only theirs)', 'Course and curriculum marketplace', 'Parents, sponsors and partner schools on the platform', 'Phone app in the app stores')],
    ['Threats', C.admin, bullets('Big rivals: Google Classroom, Canvas, Moodle', 'Price or limit changes at Cloudflare, Firebase, AI providers', 'Children’s data: privacy laws (GDPR and others)', 'Attacks on sign-in and payments', 'Outages of the services it depends on')],
  ];
  q.forEach(([title, colour, body], i) => s.box((i % 2) * 720, 70 + Math.floor(i / 2) * 440, 700, 420, `${title}\n\n${body}`, colour, { fontSize: 20 }));
  return titled(s, 'UniVerse: strengths, weaknesses, opportunities, threats', C.teacher);
}

// ─── 5 · Venn: website and phone app ────────────────────────────────────────────────────────────
function webAndApp() {
  const s = section('venn', '5 · Web and phone app');
  s.raw({ type: 'ellipse', x: 0, y: 80, width: 900, height: 820, backgroundColor: C.student, fillStyle: 'solid', opacity: 55 } as El);
  s.raw({ type: 'ellipse', x: 560, y: 80, width: 900, height: 820, backgroundColor: C.parent, fillStyle: 'solid', opacity: 55 } as El);
  s.text(150, 130, 'Website (a browser)', 30);
  s.text(80, 220, lines('Side menu, big screens', 'Search with ⌘K / Ctrl+K', 'Owner console and admin', '  screens at full size', 'Office editing at full size', 'Drag and drop files', 'Wide tables and charts', 'Keyboard shortcuts'), 22);
  s.text(1000, 130, 'Phone app', 30);
  s.text(1030, 220, lines('Installs from the browser', '  (a web app, “PWA”)', 'Tab bar at the bottom', 'Push notifications', 'Camera: scan, homework photos', 'Pages already opened', '  work without internet', 'Home-screen icon,', '  opens full screen'), 22);
  s.text(640, 300, 'Both', 30);
  s.text(600, 360, lines('One account, same data', 'Live updates', 'Every feature', 'Every language', 'Light and dark mode', 'Reduce Motion', 'Same code: one site', 'Same sign-in'), 22);
  return titled(s, 'Website and phone app: what’s the same, what’s different', C.student);
}

// ─── 6 · Timeline: how it was built ─────────────────────────────────────────────────────────────
function howItWasBuilt() {
  const s = section('timeline', '6 · How it was built');
  s.raw({ type: 'arrow', x: 0, y: 380, width: 2100, height: 0, points: [[0, 0], [2100, 0]], strokeWidth: 3 } as El);
  const events: [string, string][] = [
    ['Stages 1–4', 'The core: accounts and roles, courses, messages, groups, files, the student, teacher and admin areas, Global Impact'],
    ['Stage 5 · Q1–Q23', 'The work queue: course copy, assignments, quizzes, live quiz, home pages, notifications, search, attendance, calendar, AI tutor, skills passport'],
    ['Office suite', 'Sheets, slides and Word features inside Collaborate → Docs'],
    ['Security', 'Parts 1–7 checked, payment keys encrypted, each admin limited to their school'],
    ['22 Oct 2026', 'Cloudflare Workers Paid: more time per request, a spending guard at 90%'],
    ['23 Oct 2026', 'New look and motion: light trail, opening folders, code boxes, errors hub; the “hung” requests fixed'],
  ];
  // What each step made possible (on the other side of the line).
  const why = [
    'Each role got its own area, with messages and files shared between them',
    '23 items, each tried in a real browser on phone and desktop before it was merged',
    'Word, Excel and PowerPoint files open and save inside UniVerse',
    'Every request checks who is asking; secrets never reach the browser',
    'A guard checks the plan’s usage every 15 minutes',
    'The look the owner asked for, and requests that no longer hang',
  ];
  events.forEach(([when, what], i) => {
    const x = 100 + i * 380;
    s.raw({ type: 'ellipse', x: x - 14, y: 366, width: 28, height: 28, backgroundColor: '#2b3568', fillStyle: 'solid' } as El);
    s.note(x - 170, i % 2 ? 430 : 90, 340, 250, `${when}\n\n${what}`, [C.student, C.teacher, C.admin, C.parent, C.owner, C.tech][i], 17);
    s.note(x - 170, i % 2 ? 90 : 430, 340, 250, why[i], C.white, 16);
  });
  return titled(s, 'How UniVerse was built', C.admin);
}

// ─── 7 · Weekly planner: the owner's week ───────────────────────────────────────────────────────
function ownersWeek() {
  const s = section('week', '7 · The owner’s week');
  const days: [string, string][] = [
    ['Monday', 'Health check and Errors: anything red? The errors hub explains each one and can suggest a fix.'],
    ['Tuesday', 'Moderation and safety reports: posts, chats and people flagged by schools.'],
    ['Wednesday', 'Schools and People: new schools, approvals, who needs help.'],
    ['Thursday', 'Money: payments, plans and billing. Payment keys stay encrypted.'],
    ['Friday', 'Server: Cloudflare usage, builds, visitors. The guard pauses at 90% of the plan.'],
    ['Saturday', 'Blog and Announce: tell schools what’s new.'],
    ['Sunday', 'Rest. Daily jobs keep running by themselves: digests, clean-ups, search index, sealing old keys.'],
  ];
  const where = [
    'Open: Health → Health check, Errors',
    'Open: People → Moderation',
    'Open: People → Schools, People',
    'Open: Data & money → Money',
    'Open: Health → Server',
    'Open: Content → Blog, and Live → Announce',
    'Nothing to open: the error digest email says if anything needs you',
  ];
  days.forEach(([d, t], i) => {
    s.box(i * 300, 70, 280, 620, d, i >= 5 ? C.grey : 'transparent', { fontSize: 24 });
    s.note(i * 300 + 15, 130, 250, 300, t, i === 6 ? C.tech : C.owner, 17);
    s.note(i * 300 + 15, 445, 250, 230, where[i], C.white, 16);
  });
  return titled(s, 'A week of looking after UniVerse (owner console)', C.owner);
}

// ─── 8 · Cornell notes: how it works, technically ───────────────────────────────────────────────
function technical() {
  const s = section('cornell', '8 · How it works');
  const rows: [string, string][] = [
    ['Where does it run?', 'On Cloudflare Workers: small servers in hundreds of cities, close to every user. The Next.js app is turned into a Worker by OpenNext.'],
    ['What is it built with?', 'Next.js 16 and React, written in TypeScript; Tailwind for styles; framer-motion and the browser’s own animations for motion.'],
    ['Where is the data?', 'In Cloudflare D1 (an SQLite database), reached through Prisma. Limits: 100 values a query, 50 queries a request; long lists are split automatically.'],
    ['How do live updates work?', 'Durable Objects: one live “room” per chat, whiteboard or call. The server publishes changes; screens without live updates check back gently (no constant polling).'],
    ['How does sign-in work?', 'Firebase Authentication (email, Google, phone). Admins and the owner add a second step: a passkey or a 6-digit emailed code.'],
    ['Where are files?', 'In Cloudflare R2 storage. Folders, versions and previews; each person and space has a storage quota.'],
    ['How is AI used?', 'Through the AI tutor, study tools, whiteboard drawing and the errors hub. Each person has a daily allowance, answers are cached, and the owner can switch AI off.'],
    ['How is it kept safe?', 'Every route checks who is asking; request data is checked before use; strict browser security headers; payment keys encrypted (AES-256); each admin sees only their school.'],
    ['How does it stay cheap?', 'The $5 Workers Paid plan, a guard that pauses at 90% of it, no polling, small first downloads, and links that load only when you point at them.'],
    ['How do updates go live?', 'Code is saved in GitHub; merging builds and deploys it on Cloudflare, and new database changes are applied by themselves.'],
  ];
  const top = 70, h = 112;
  s.box(0, top, 420, rows.length * h + 40, 'Questions', C.grey, { fontSize: 24 });
  s.box(440, top, 1260, rows.length * h + 40, 'Notes', 'transparent', { fontSize: 24 });
  rows.forEach(([q, a], i) => {
    s.note(15, top + 45 + i * h, 390, h - 12, q, C.tech, 18);
    s.note(455, top + 45 + i * h, 1230, h - 12, a, C.white, 17);
  });
  const sy = top + rows.length * h + 60;
  s.box(0, sy, 1700, 190, `Summary\n\nUniVerse is one Next.js app running on Cloudflare’s network: D1 for data, R2 for files, Durable Objects for live rooms, Firebase for sign-in and AI with daily limits. Safety checks run on every request, and the plan limits are watched so the bill stays small.`, '#fff9db', { fontSize: 20 });
  return titled(s, 'How UniVerse works, technically', C.tech);
}

// ─── 9 · Retrospective ─────────────────────────────────────────────────────────────────────────
function lookingBack() {
  const s = section('retro', '9 · Looking back');
  const cols: [string, string, string[]][] = [
    ['Went well 😊', C.teacher, ['The errors hub now explains problems and files bot noise away', 'Cloudflare “code had hung” found and fixed: each request gets its own database client', 'Folders and code boxes from the owner’s videos']],
    ['To improve 🤔', C.parent, ['Check Safari and iPhone before merging (the folder blur)', 'Don’t change the look too fast (the two-tone colours came back)', 'Sign-in errors must say the real reason']],
    ['Ideas 💡', C.admin, ['Phone app in the app stores', 'A short weekly report for the owner', 'Code boxes for the parent link code']],
    ['Actions ✅', C.student, ['Check Firebase phone sign-in settings (owner)', 'Finish the full bug and error review', 'Test every new screen on Safari']],
  ];
  cols.forEach(([title, colour, items], i) => {
    s.box(i * 400, 70, 380, 720, title, colour, { fontSize: 26 });
    items.forEach((t, j) => s.note(i * 400 + 20, 140 + j * 200, 340, 180, t, C.white, 17));
  });
  return titled(s, 'Looking back on the latest work', C.warm);
}

// ─── 10 · Lesson plan: showing UniVerse to a new school ─────────────────────────────────────────
function demoPlan() {
  const s = section('lesson', '10 · Showing it to a school');
  s.box(0, 70, 1500, 190, `Learning aims (by the end, the school can…)\n\n${bullets('sign in as a student, teacher and admin', 'find any feature with search', 'set up its first course and class')}`, C.owner, { fontSize: 20 });
  s.box(0, 280, 480, 460, `Starter (10 min)\n\n${bullets('Open the public demo (no account needed)', 'Show a student’s home page and Up next', 'Switch to dark mode and another language')}`, C.admin, { fontSize: 20 });
  s.box(510, 280, 480, 460, `Main activity (25 min)\n\n${bullets('Teacher: make a course, an assignment, a quiz', 'Student: hand it in, try the AI tutor', 'Everyone: a live whiteboard together', 'Admin: attendance and the timetable')}`, C.teacher, { fontSize: 20 });
  s.box(1020, 280, 480, 460, `Plenary (10 min)\n\n${bullets('Show the grades a parent sees', 'Answer questions', 'Agree the next step: an admin account')}`, C.student, { fontSize: 20 });
  s.box(0, 760, 735, 250, `Resources\n\n${bullets('The demo site and its sample data', 'This whiteboard', 'Help pages and the blog')}`, C.grey, { fontSize: 20 });
  s.box(765, 760, 735, 250, `Checking understanding\n\n${bullets('Can they find “Attendance” with search?', 'Can a teacher grade a hand-in alone?', 'Do they know where to ask for help?')}`, C.warm, { fontSize: 20 });
  return titled(s, 'Lesson plan: showing UniVerse to a new school (45 minutes)', C.owner);
}

// ─── 11 · Flowcharts: the jobs UniVerse runs by itself (the same 8 as the landing page) ─────────
function jobs() {
  const s = section('jobs', '11 · Jobs it runs by itself');
  FLOWS.forEach((f, i) => {
    const x = (i % 2) * 1300, y = 70 + Math.floor(i / 2) * 600;
    const asks = (w: 'yes' | 'no') => (f.person === w ? '👤 asks a person' : 'runs by itself');
    s.text(x, y, `${f.name} · ${f.feature}`, 30);
    s.note(x, y + 150, 300, 190, `${f.start[0]}\n\n${f.start[1]}`, C.student, 20);
    s.raw({ type: 'arrow', x: x + 305, y: y + 245, width: 60, height: 0, points: [[0, 0], [60, 0]], strokeWidth: 2 } as El);
    s.raw({ type: 'diamond', x: x + 370, y: y + 125, width: 330, height: 240, backgroundColor: C.warm, fillStyle: 'solid', label: { text: wrap(f.check[0], 200, 22), fontSize: 22, strokeColor: INK } } as El);
    s.text(x + 380, y + 385, wrap(f.check[1], 330, 17), 17);
    s.raw({ type: 'arrow', x: x + 705, y: y + 240, width: 90, height: -100, points: [[0, 0], [90, -100]], strokeWidth: 2, label: { text: 'yes', fontSize: 18 } } as El);
    s.raw({ type: 'arrow', x: x + 705, y: y + 250, width: 90, height: 110, points: [[0, 0], [90, 110]], strokeWidth: 2, label: { text: 'no', fontSize: 18 } } as El);
    s.note(x + 800, y + 60, 420, 200, `${f.yes[0]}\n${f.yes[1]}\n${asks('yes')}`, f.person === 'yes' ? C.parent : C.teacher, 20);
    s.note(x + 800, y + 290, 420, 200, `${f.no[0]}\n${f.no[1]}\n${asks('no')}`, f.person === 'no' ? C.parent : C.teacher, 20);
    s.note(x, y + 500, 1220, 70, f.note, C.white, 20);
  });
  return titled(s, 'Jobs UniVerse runs by itself: something happens, one question, two ways', C.warm);
}

// ─── 12 · How a request travels ─────────────────────────────────────────────────────────────────
function travels() {
  const s = section('travel', '12 · How a request travels');
  const hop = (x: number, w: number, t: string, c: string) => s.note(x, 90, w, 200, t, c, 22);
  hop(0, 460, 'Your phone or browser\n\nthe app, installed or in a tab', C.student);
  hop(560, 560, 'Cloudflare’s network\n\nthe nearest of hundreds of cities; files from its cache', C.tech);
  hop(1220, 620, 'The Worker: UniVerse’s server\n\nthe Next.js app, built for Cloudflare by OpenNext', C.owner);
  hop(1940, 560, 'Scheduled jobs\n\nevery 15 minutes: the spending guard; every day: digests, clean-ups, search index', C.admin);
  for (const [x1, x2] of [[460, 560], [1120, 1220], [1940, 1840]]) s.raw({ type: 'arrow', x: x1 + 5, y: 190, width: x2 - x1 - 10, height: 0, points: [[0, 0], [x2 - x1 - 10, 0]], strokeWidth: 2 } as El);
  const parts: [string, string][] = [
    ['D1 database', 'Everything people make, through Prisma: at most 100 values a query, 50 queries a request'],
    ['R2 files', 'Uploads, versions and previews, with a storage quota for each person and space'],
    ['Durable Objects', 'One live room per chat, whiteboard and call: changes reach everyone at once'],
    ['Firebase', 'Sign-in: email, Google, Microsoft, Apple, passkeys, phone; two steps for admins'],
    ['AI', 'Tutor, study tools, whiteboard drawing, errors hub: a daily allowance each, off switch'],
    ['Email and push', 'Notifications, digests and codes, only when settings allow them'],
  ];
  parts.forEach(([t, d], i) => {
    const x = i * 420;
    s.note(x, 430, 390, 260, `${t}\n\n${d}`, i === 3 ? C.parent : C.tech, 20);
    s.raw({ type: 'arrow', x: 1530, y: 295, width: x + 195 - 1530, height: 130, points: [[0, 0], [x + 195 - 1530, 130]], strokeWidth: 1 } as El);
  });
  s.text(0, 740, 'Every request, in order', 30);
  ([['1 · Who is asking?', 'The sign-in is checked first'], ['2 · Are they allowed?', 'Their role, and only their own school'], ['3 · Is the request sound?', 'Every value read and checked before use'],
    ['4 · Do the work', 'Within the database’s limits, split when long'], ['5 · Answer and record', 'Changes logged, so the owner can undo them']] as const)
    .forEach(([t, d], i) => s.note(i * 500, 800, 470, 170, `${t}\n${d}`, C.white, 20));
  s.note(0, 1010, 2480, 110, 'Going live: code is saved in GitHub; merging builds it on Cloudflare, and new database changes apply themselves.', C.grey, 22);
  return titled(s, 'How a request travels: from a tap to an answer', C.tech);
}

// ─── 13–17 · Every page, by role (from the menus in Sidebar.tsx and the owner console's groups) ─
function menu(key: string, name: string, title: string, colour: string, groups: [string, string[]][], cols: number) {
  const s = section(key, name);
  const W = 560, heights = Array(cols).fill(70);
  const last: (El | undefined)[] = Array(cols).fill(undefined);
  for (const [g, items] of groups) {
    const c = heights.indexOf(Math.min(...heights));
    const h = 90 + items.length * 31;
    s.note(c * (W + 30), heights[c], W, h, `${g}\n${bullets(...items)}`, colour, 22);
    last[c] = s.els[s.els.length - 1];
    heights[c] += h + 30;
  }
  // The last note in each column reaches the bottom, so no column stops short.
  const bottom = Math.max(...heights) - 30;
  for (const e of last) if (e) e.height = bottom - (e.y ?? 0);
  return titled(s, title, colour);
}
const students = () => menu('pg-student', '13 · Every page: students', 'Every page a student has', C.student, [
  ['Home', ['Dashboard: up next, goals, timetable', 'Inbox and calls', 'Notifications: snooze, mute, digest']],
  ['Schooling', ['Courses and the course marketplace', 'Groups and the blackboard', 'Assignments and grades', 'Quizzes and attendance', 'My choices (options)', 'Learning resources', 'Collaborate: boards, docs, files']],
  ['Study tools', ['AI tutor and voice tutor', 'Flashcards and practice tests', 'Study planner', 'Scan from the teacher’s screen']],
  ['Careers', ['Internships and skills match', 'Application tracker', 'Interview practice', 'Mentors and alumni', 'Skills passport and CV']],
  ['Global impact', ['AI project match', 'Opportunities with NGOs', 'Edu society', 'Credentials anyone can verify', 'Leaderboard, Impact rooms, League', 'My donations']],
  ['Campus life', ['Student life and community', 'Campus board: buy, sell, swap', 'Carpool, housing, food pre-orders', 'Room booking and campus map', 'Events, lost and found', 'Medical and disability']],
  ['Administrative', ['Personal data', 'School documents', 'Accounting', 'Scholarships']],
  ['Help and tools', ['Support and BeeSafe', 'Settings and language', 'Convert and compress files', 'Apps and links, directory']],
], 3);
const teachers = () => menu('pg-teacher', '14 · Every page: teachers', 'Every page a teacher has', C.teacher, [
  ['Home', ['Dashboard: who needs attention', 'Messages, calls, notifications']],
  ['Teaching', ['My courses and the marketplace', 'Blackboard and students', 'Assignments, rubrics, feedback', 'Quizzes: 8 types, pools, exams', 'Live quiz game', 'Grades and report cards', 'Attendance from the class call', 'Live class and timetable']],
  ['Tools', ['AI tutor from course sources', 'Send to phones with no internet', 'Collaborate and knowledge hub', 'Convert and compress files']],
  ['Global collaboration', ['Research between universities', 'NGO mentorship', 'Volunteer mentor', 'Impact rooms and League', 'My donations']],
  ['Campus', ['Room reservation', 'Campus map', 'Settings and profile']],
], 2);
const admins = () => menu('pg-admin', '15 · Every page: school admins', 'Every page a school admin has', C.admin, [
  ['Overview', ['The school’s numbers', 'Insights and activity log', 'Billing and plans, settings']],
  ['People', ['Users and approvals', 'Early warning', 'Safety reports', 'Messages, calls, notifications']],
  ['Academics', ['Courses and the marketplace', 'Attendance and quizzes', 'Timetable generator', 'Knowledge hub and library']],
  ['Operations', ['Administrative and admissions', 'Finances: fees and payments', 'Internships and student life', 'Registers', 'LMS integration']],
  ['Global impact', ['Partner institutions', 'Sponsor portal and donations', 'Impact reports', 'Certifications', 'Credential verification']],
  ['Campus monitoring', ['Room bookings', 'Associations', 'Campus board reports', 'Cafeteria pre-orders', 'Campus map with usage']],
], 2);
const parents = () => menu('pg-parent', '16 · Every page: parents', 'What a parent sees', C.parent, [
  ['Link a child', ['With the code the child makes in Settings', 'One account, every child']],
  ['Schoolwork', ['Courses with grade and attendance', 'What’s due', 'Recent achievements', 'The week in numbers', 'Published report cards']],
  ['Talk and sign', ['Messages with the child’s teachers', 'Meetings', 'Forms to sign']],
  ['Never shown', ['Contact details', 'The child’s messages', 'Anything personal']],
], 1);
const consoleMap = () => menu('pg-owner', '17 · Every page: owner console', 'The owner console, group by group', C.owner, [
  ['Overview', ['What needs you', 'Live numbers, plan usage', 'Sign-ins, devices, actions']],
  ['People', ['People and schools', 'Moderation', 'Deletion requests']],
  ['Live', ['Live activity and chats', 'Calls', 'Announce to everyone']],
  ['Health', ['Health check and numbers', 'Errors (with AI fixes)', 'Server and database']],
  ['Data & money', ['All data, edit any record', 'Changes and undo', 'Analytics and money']],
  ['Content', ['Feature flows', 'Explain UniVerse (this board)', 'Blog and languages']],
], 2);

// ─── 18 · Safety and privacy ────────────────────────────────────────────────────────────────────
function safety() {
  const s = section('safety', '18 · Safety and privacy');
  const items: [string, string][] = [
    ['Sign-in', 'Firebase; admins and the owner add a passkey or an emailed code'], ['Every route', 'Checks who is asking before anything else'],
    ['One school each', 'An admin only ever sees their own school'], ['Input', 'Every value read and checked; nothing trusted as sent'],
    ['Secrets', 'Keys stay on the server, never in the browser'], ['Payments', 'Each school’s keys encrypted (AES-256)'],
    ['Headers', 'HTTPS only, strict browser security rules'], ['Spam', 'Rate limits and reCAPTCHA on open forms'],
    ['Cookies', 'Essential only; the visitor chooses about anything else'], ['Your data', 'Download it any time; ask to delete it'],
    ['Undo', 'Owner changes are logged and can be undone'], ['Demo', 'The demo admin can look but not change'],
  ];
  items.forEach(([t, d], i) => s.note((i % 3) * 610, 70 + Math.floor(i / 3) * 230, 580, 200, `✓ ${t}\n${d}`, i % 2 ? C.teacher : C.student, 22));
  return titled(s, 'Safety and privacy: what protects people', C.teacher);
}

// ─── 19 · Limits and costs ──────────────────────────────────────────────────────────────────────
function limits() {
  const s = section('limits', '19 · Limits and costs');
  const rows: [string, string, string][] = [
    ['Cloudflare Workers Paid', '$5 a month', 'A guard pauses the site at 90% of the plan'],
    ['Database (D1)', '100 values a query', 'Long lists are split automatically'],
    ['Database (D1)', '50 queries a request', 'Pages load what they need in few calls'],
    ['AI', 'A daily allowance each', 'Answers cached; the owner can switch it off'],
    ['Files (R2)', 'A quota each', 'For every person and space'],
    ['SMS codes', 'Need Firebase billing', 'The owner’s choice: it costs money'],
    ['Builds', 'About 12 minutes', 'Small first downloads, checked each build'],
  ];
  rows.forEach(([a, b, c], i) => {
    const y = 70 + i * 150;
    s.note(0, y, 560, 130, a, C.tech, 24);
    s.note(580, y, 440, 130, b, C.admin, 24);
    s.note(1040, y, 700, 130, c, C.white, 22);
  });
  return titled(s, 'Limits and costs: what UniVerse stays within', C.tech);
}

// ─── 20 · Glossary ─────────────────────────────────────────────────────────────────────────────
function glossary() {
  const s = section('words', '20 · Words used here');
  const words: [string, string][] = [
    ['Worker', 'A small server Cloudflare runs close to each user'], ['D1', 'Cloudflare’s database (SQLite)'], ['R2', 'Cloudflare’s file storage'],
    ['Durable Object', 'A live room everyone in a chat or board shares'], ['OpenNext', 'Turns the Next.js app into a Worker'], ['Prisma', 'How the code talks to the database'],
    ['PWA', 'A website that installs like an app'], ['Passkey', 'Sign in with the phone’s lock: no password'], ['RTL', 'Right to left, for Arabic and Urdu'],
    ['FSRS', 'The schedule that decides when a flashcard comes back'], ['KaTeX', 'Draws maths and chemistry properly'], ['LTI', 'How other school systems plug in'],
    ['Common Cartridge', 'A course packed in one file, for other systems'], ['GIFT and QTI', 'Question file formats from other quiz tools'], ['Polygon', 'Where certificate fingerprints are anchored'],
  ];
  words.forEach(([t, d], i) => s.note((i % 3) * 610, 70 + Math.floor(i / 3) * 190, 580, 165, `${t}\n${d}`, C.grey, 22));
  return titled(s, 'Words used on this board', C.grey);
}

// ─── Charts and tables, from the code itself (counted on 23 Oct 2026) ───────────────────────────
/** A bar chart: a label, a bar as long as its share of the largest, and the number. */
function bars(s: Section, x: number, y: number, rows: [string, number][], colour: string, unit = '') {
  const max = Math.max(...rows.map(([, n]) => n));
  rows.forEach(([label, n], i) => {
    const by = y + i * 74;
    s.text(x, by + 12, label, 24);
    s.raw({ type: 'rectangle', x: x + 430, y: by, width: Math.max(16, (n / max) * 900), height: 56, backgroundColor: colour, fillStyle: 'solid', strokeColor: 'transparent', roundness: { type: 3 } } as El);
    s.text(x + 450 + Math.max(16, (n / max) * 900), by + 12, `${n.toLocaleString('en-US')}${unit}`, 24);
  });
  return y + rows.length * 74;
}
/** A table of notes: the first row and column are headings. */
function table(s: Section, x: number, y: number, rows: string[][], widths: number[], colour: string, rowH = 84) {
  rows.forEach((row, r) => {
    let cx = x;
    row.forEach((cell, c) => {
      const head = r === 0 || c === 0;
      s.note(cx, y + r * (rowH + 10), widths[c], rowH, cell, r === 0 ? colour : c === 0 ? C.grey : cell.startsWith('✓') ? C.teacher : C.white, head ? 22 : 24);
      cx += widths[c] + 10;
    });
  });
  return y + rows.length * (rowH + 10);
}

/** How many of `items` fall under each name `key` gives them, largest first. */
function countBy<T>(items: T[], key: (t: T) => string) {
  const m = new Map<string, number>();
  for (const t of items) m.set(key(t), (m.get(key(t)) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
}
const routeArea = (r: string) => r.split('/')[2] ?? '';
const pageArea = (p: string) => (['student', 'admin', 'teacher'].includes(p.split('/')[1]) ? p.split('/')[1] : 'other');
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1).replace(/-/g, ' ');

function codeNumbers() {
  const s = section('numbers', '21 · The code in numbers');
  s.text(0, 80, `Server routes, by area (${ROUTES.length} in all; each one checks who is asking)`, 28);
  const end = bars(s, 0, 140, countBy(ROUTES, routeArea).slice(0, 14).map(([a, n]) => [cap(a), n]), C.student);
  s.text(0, end + 40, `Pages, by who they are for (${PAGES.length} in all)`, 28);
  const names: Record<string, string> = { student: 'Students', admin: 'School admins', teacher: 'Teachers', other: 'Everyone else' };
  bars(s, 0, end + 100, countBy(PAGES, pageArea).map(([a, n]) => [names[a], n]), C.teacher);
  return titled(s, 'The code in numbers: routes and pages', C.student);
}

// The tables, grouped roughly by name (the first group whose pattern matches).
const TABLE_GROUPS: [string, RegExp][] = [
  ['Courses and learning', /Course|Lesson|Module|Assignment|Submission|Quiz|Question|Grade|Rubric|Exam|Flashcard|Tutor|Study|Practice|Blackboard|Syllabus|Curriculum|Learning|Mastery|Skill|Material|Lecture|Clicker|Poll|Game|Report|Attempt|Answer|Deck|Cartridge/],
  ['Messages and calls', /Conversation|Message|Chat|Call|Voice|Inbox|Mention|Reaction|Announcement|Broadcast/],
  ['People and accounts', /^User|Profile|Session|Login|Passkey|Consent|Guardian|Parent|Device|Invite|Role|Permission|Account|TwoStep|Otp|Verification|Follow/],
  ['Running the school', /School|Institution|Fee|Payment|Invoice|Admission|Register|Staff|Timetable|Attendance|Library|Book|Term|Class|Section|Department|Campus|Seat|Leave|Excuse|Scholarship|Finance|Budget|Expense|Document/],
  ['Collaborate', /Board|Doc|File|Space|Task|Folder|Sheet|Slide|Code|Note|Whiteboard|Comment|Version|Knowledge|Workspace|Project/],
  ['Careers and credentials', /Internship|Job|Application|Mentor|Passport|Credential|Certificat|Cv|Interview|Alumni|Employer|Portfolio|Badge|Proof/],
  ['Global impact', /Ngo|NGO|Impact|Donation|Sponsor|League|Volunteer|Partner|Research|Collaboration|Sdg|Pledge|Opportunit/],
  ['Campus life', /Event|Room|Booking|Club|Association|Housing|Ride|Meal|Lost|Market|Listing|Food|Menu|Carpool|Medical|Wellbeing|Safety|Incident|Community|Group|Post|Feed/],
  ['Platform and owner', /Notification|Push|Email|Audit|Error|Setting|Owner|Usage|Plan|Subscription|Billing|Organization|Feature|Ai|Cache|Cron|Search|Webhook|Integration|Lti|Translation|Language|Blog|Deletion|Change|Log|Key|Token|Rate/],
];
const tableGroup = (name: string) => TABLE_GROUPS.find(([, re]) => re.test(name))?.[0] ?? 'Everything else';

function database() {
  const s = section('db', '22 · The database');
  s.text(0, 80, `${TABLES.length} tables in D1, grouped roughly by name`, 28);
  const end = bars(s, 0, 140, countBy(TABLES, ([n]) => tableGroup(n)), C.admin);
  const biggest = [...TABLES].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const linked = [...TABLES].sort((a, b) => b[2] - a[2]).slice(0, 8);
  s.note(0, end + 40, 740, 430, `Most fields\n${biggest.map(([n, f]) => `${n}: ${f}`).join('\n')}`, C.white, 22);
  s.note(760, end + 40, 740, 430, `Most links to other tables\n${linked.map(([n, , l]) => `${n}: ${l}`).join('\n')}`, C.white, 22);
  return titled(s, `The database: ${TABLES.length} tables, ${ENUMS} lists of choices`, C.admin);
}

function permissions() {
  const s = section('who', '23 · Who can do what');
  const y = table(s, 0, 80, [
    ['', 'Student', 'Teacher', 'School admin', 'Parent', 'Owner'],
    ['Hand in work, take quizzes', '✓', '–', '–', '–', '–'],
    ['Make courses, quizzes, assignments', '–', '✓', '✓', '–', '–'],
    ['Mark work and give grades', '–', '✓', '–', '–', '–'],
    ['See grades and attendance', '✓ own', '✓ own classes', '✓ own school', '✓ own children', '✓ all'],
    ['Message teachers', '✓', '✓', '✓', '✓', '✓'],
    ['Approve new accounts', '–', '–', '✓', '–', '✓'],
    ['See other schools', '–', '–', '–', '–', '✓'],
    ['Edit any record, undo changes', '–', '–', '–', '–', '✓'],
  ], [620, 300, 340, 340, 340, 260], C.owner);
  s.note(0, y + 20, 2260, 90, 'Every route checks this on the server, on every request: hiding a button is never the only lock.', C.parent, 24);
  return titled(s, 'Who can do what: roles and what they may open', C.owner);
}

function signIn() {
  const s = section('signin', '24 · Signing in, step by step');
  const who = ['You', 'The app', 'Firebase', 'The Worker', 'D1 database'];
  who.forEach((t, i) => {
    s.note(i * 460, 80, 400, 90, t, [C.student, C.student, C.parent, C.owner, C.tech][i], 26);
    s.raw({ type: 'line', x: i * 460 + 200, y: 175, width: 0, height: 1010, points: [[0, 0], [0, 1010]], strokeStyle: 'dashed', strokeWidth: 1 } as El);
  });
  const steps: [number, number, string][] = [
    [0, 1, '1 · email and password, Google, Microsoft, Apple, a passkey or phone'], [1, 2, '2 · checks it'], [2, 1, '3 · a signed token, valid for an hour'],
    [1, 3, '4 · every request carries the token'], [3, 3, '5 · checks the signature with Google’s keys'], [3, 4, '6 · finds the account: role, school'],
    [4, 3, '7 · the account'], [3, 1, '8 · admins and the owner: a second step (passkey or emailed code)'], [3, 1, '9 · the answer, only what the role may see'],
  ];
  steps.forEach(([a, b, t], i) => {
    const y = 230 + i * 110, x1 = a * 460 + 200, x2 = b * 460 + 200;
    if (a === b) s.note(x1 - 150, y - 30, 420, 80, t, C.white, 18);
    else {
      s.raw({ type: 'arrow', x: x1, y, width: x2 - x1, height: 0, points: [[0, 0], [x2 - x1, 0]], strokeWidth: 2 } as El);
      s.text(Math.min(x1, x2) + 20, y - 40, t, 18);
    }
  });
  return titled(s, 'Signing in, step by step (a sequence diagram)', C.parent);
}

function assignmentLife() {
  const s = section('life', '25 · An assignment’s life');
  const st: [number, number, string, string][] = [
    [0, 100, 'Draft', 'The teacher writes it: rubric, due date, files'], [460, 100, 'Published', 'Students see it in the course and Up next'],
    [920, 100, 'Handed in', 'On time, or late: then the teacher is asked'], [1380, 100, 'Marked', 'With the rubric; AI can suggest, the teacher decides'],
    [1380, 420, 'Returned', 'Feedback and grade go back to the student'], [920, 420, 'In the gradebook', 'Counts toward the course grade'],
    [460, 420, 'Seen by parents', 'In the parent app and the daily digest'], [0, 420, 'On the report card', 'When the school publishes it'],
  ];
  st.forEach(([x, y, t, d], i) => s.note(x, y, 400, 220, `${t}\n\n${d}`, [C.teacher, C.teacher, C.student, C.teacher, C.student, C.admin, C.parent, C.admin][i], 22));
  const arrow = (x: number, y: number, w: number, h: number) => s.raw({ type: 'arrow', x, y, width: w, height: h, points: [[0, 0], [w, h]], strokeWidth: 2 } as El);
  arrow(405, 210, 50, 0); arrow(865, 210, 50, 0); arrow(1325, 210, 50, 0); arrow(1580, 325, 0, 90);
  arrow(1375, 530, -50, 0); arrow(915, 530, -50, 0); arrow(455, 530, -50, 0);
  s.note(0, 700, 1780, 100, 'Late hand-ins and quizzes run as flowcharts too: see “Jobs it runs by itself”.', C.grey, 22);
  return titled(s, 'An assignment’s life, from draft to report card', C.teacher);
}

function notifications() {
  const s = section('notify', '26 · Notifications');
  const y = table(s, 0, 80, [
    ['', 'In the app', 'Push', 'Email', 'Daily digest'],
    ['A new grade', '✓', '✓ if on', '✓ if on', '✓'],
    ['A message you missed', '✓', '✓ if on', '✓ if on', '✓'],
    ['A quiz reminder', '✓', '✓ if on', '✓ if on', '✓'],
    ['A credential decision', '✓', '✓ if on', '✓ if on', '–'],
    ['An announcement', '✓', '✓ if on', '–', '✓'],
  ], [520, 300, 300, 300, 320], C.student);
  s.note(0, y + 20, 1800, 120, 'Each kind can be switched off in Settings → Notifications; a course can be muted, a notification snoozed.', C.grey, 22);
  return titled(s, 'Notifications: what goes where', C.student);
}

function stack() {
  const s = section('stack', '27 · The stack');
  const what: Record<string, string> = {
    next: 'The app: pages and server routes', react: 'Every screen', '@opennextjs/cloudflare': 'Turns the app into a Worker', '@prisma/client': 'Talks to the D1 database',
    typescript: 'Every file is typed', tailwindcss: 'The look', 'framer-motion': 'Motion', '@excalidraw/excalidraw': 'Whiteboards, like this one', '@tiptap/react': 'Docs editor',
    yjs: 'Editing together, live', katex: 'Maths and chemistry', firebase: 'Sign-in', 'pdfjs-dist': 'PDFs in the browser', vitest: 'Unit tests', 'axe-core': 'Accessibility checks',
    wrangler: 'Runs Cloudflare locally', swr: 'Loading data, kept fresh', zustand: 'Who is signed in, on this device', sonner: 'The little messages', 'lucide-react': 'Icons', 'date-fns': 'Dates and times',
  };
  Object.entries(VERSIONS).forEach(([n, v], i) => {
    const x = (i % 3) * 760, y = 80 + Math.floor(i / 3) * 140;
    s.note(x, y, 730, 125, `${n} · ${v}\n${what[n] ?? ''}`, i % 2 ? C.tech : C.grey, 24);
  });
  return titled(s, 'The stack, with versions', C.tech);
}

function checks() {
  const s = section('checks', '28 · Checks');
  const steps: [string, string][] = [
    ['Types', 'pnpm typecheck: every file, both configs'], ['Lint', '0 errors, under 50 warnings, no switched-off rules'],
    ['Unit tests', '1,235 tests in 188 files, about 30 seconds'], ['Lean', 'no unused files, no links to missing pages'],
    ['Browser', 'Playwright on phone and desktop, light and dark'], ['Accessibility', 'axe: WCAG 2.2 AA, no problems allowed'],
    ['Build', 'about 12 minutes; first downloads measured'], ['Live', 'merged in GitHub, deployed by Cloudflare'],
  ];
  steps.forEach(([t, d], i) => {
    const x = (i % 4) * 560, y = 80 + Math.floor(i / 4) * 330;
    s.note(x, y, 500, 280, `${i + 1} · ${t}\n\n${d}`, i < 4 ? C.teacher : C.student, 24);
    if (i % 4 !== 3) s.raw({ type: 'arrow', x: x + 505, y: y + 140, width: 50, height: 0, points: [[0, 0], [50, 0]], strokeWidth: 2 } as El);
  });
  return titled(s, 'Checks every change passes before it goes live', C.teacher);
}

function weights() {
  const s = section('weight', '29 · What pages load');
  s.text(0, 80, 'Code shared by every page: 139 KB. The heaviest pages, in KB:', 28);
  const end = bars(s, 0, 140, [['Docs editor', 561], ['Owner console', 433], ['Sheets', 390], ['Slides', 384], ['Teacher blackboard', 371]], C.warm, ' KB');
  s.note(0, end + 40, 1500, 150, 'Measured on every build (public/build-size.json). Heavy parts such as editors load only on the page that needs them.', C.white, 22);
  return titled(s, 'What each page loads first', C.warm);
}

// ─── 30+ · Everything, listed (from guide-data.gen.ts) ──────────────────────────────────────────
/**
 * A frame of columns of lines (one note a column), `per` lines a column. Long lines wrap with an
 * indent, and one entry never splits across two columns.
 */
function listing(key: string, name: string, title: string, colour: string, lines: string[], per = 30) {
  const s = section(key, name);
  const cols: string[][] = [[]];
  for (const l of lines) {
    const w = wrap(l, 606, 19).split('\n').map((x, i) => (i ? `   ${x.trimStart()}` : x));
    if (cols[cols.length - 1].length && cols[cols.length - 1].length + w.length > per) cols.push([]);
    cols[cols.length - 1].push(...w);
  }
  const tall = Math.max(per, ...cols.map((c) => c.length)); // one entry can be longer than a column
  cols.forEach((c, i) => s.note(i * 660, 70, 640, 70 + tall * 26, c.join('\n'), i % 2 ? C.white : C.grey, 19));
  return titled(s, title, colour);
}
/** One frame per big area, the small areas together, `max` lines each. */
function grouped<T>(items: T[], area: (t: T) => string, line: (t: T, area: string, own: boolean) => string, frame: (title: string, lines: string[], i: number) => Section, max = 90, alone = 24, title = cap) {
  const out: Section[] = [];
  const small: string[] = [];
  for (const [a] of countBy(items, area)) {
    const own = items.filter((t) => area(t) === a).length >= alone;
    const mine = items.filter((t) => area(t) === a).map((t) => line(t, a, own));
    if (own) for (let i = 0; i < mine.length; i += max) out.push(frame(`${title(a)}${mine.length > max ? ` (${i / max + 1})` : ''}: ${mine.length}`, mine.slice(i, i + max), out.length));
    else small.push(...mine);
  }
  for (let i = 0; i < small.length; i += max) out.push(frame(`Smaller areas${small.length > max ? ` (${i / max + 1})` : ''}`, small.slice(i, i + max), out.length));
  return out;
}
// What each file says it does (its opening comment): routes by their address, pages by theirs.
const SAYS = new Map(DESCRIBED);
const PAGE_SAYS = new Map(DESCRIBED.filter(([f]) => /^src\/app\/(.*\/)?page\.tsx$/.test(f))
  .map(([f, t]) => [f.replace(/^src\/app/, '').replace(/\/\([^)]+\)/g, '').replace(/\/page\.tsx$/, '') || '/', t]));
const says = (t?: string) => (t ? ` — ${t}` : '');
const routeFrames = () => grouped(ROUTES, routeArea, (r, a, own) => `${METHODS[r] || 'ANY'}  ${(own ? r.slice(`/api/${a}`.length) || '/' : r.slice(5))}${says(SAYS.get(`src/app${r}/route.ts`))}`,
  (t, l, i) => listing(`routes${i}`, `Routes · ${t.replace('Smaller areas', 'more')}`, `Server routes: ${t}`, C.tech, l), 90, 24);
const PAGE_WHO: Record<string, string> = { student: 'students', admin: 'school admins', teacher: 'teachers', other: 'everyone else' };
const pageFrames = () => grouped(PAGES, pageArea, (p, a) => `${a === 'other' ? p : p.slice(a.length + 1) || '/'}${says(PAGE_SAYS.get(p))}`, (t, l, i) => listing(`pages${i}`, `Pages · ${t}`, `Every page address: ${t}`, C.student, l), 90, 20, (a) => PAGE_WHO[a]);
const tableFrames = () => grouped(TABLES, ([n]) => tableGroup(n), ([n, f, l]) => `${n} (${f} fields${l ? `, ${l} links` : ''}): ${FIELDS[n] ?? ''}`, (t, l, i) => listing(`tables${i}`, `Tables · ${t.split(' ')[0]}`, `Database tables and their fields: ${t}`, C.admin, l), 40, 1);
const coreFrames = () => grouped(CORE, (c) => c.split(' ')[1].split('/')[1], (c) => c, (t, l, i) => listing(`core${i}`, `Core · ${t.split(':')[0].replace('Smaller areas', 'more')}`, `The core API (/api/core/…): ${t}`, C.tech, l), 90, 12);
const codeArea = (f: string) => { const p = f.split('/'); return p[0] === 'src' ? p.slice(0, p[1] === 'components' ? 3 : 2).join('/') : p[0]; };
const codeFrames = () => grouped(DESCRIBED.filter(([f]) => !f.startsWith('src/app/')), ([f]) => codeArea(f), ([f, t], a) => `• ${f.slice(a.length + 1)} — ${t}`,
  (t, l, i) => listing(`code${i}`, `Code · ${t.split(':')[0].replace('Smaller areas', 'more').replace(/^src\/(components\/)?/, '')}`, `What each file does: ${t}`, C.grey, l), 70, 15, (a) => a);
const chunks = <T,>(items: T[], n: number) => Array.from({ length: Math.ceil(items.length / n) }, (_, i) => items.slice(i * n, i * n + n));
const historyFrames = () => chunks(HISTORY, 60).map((h, i) => listing(`history${i}`, `Built, step ${i * 60 + 1}+`, `How it was built, item by item (${i * 60 + 1}–${i * 60 + h.length} of ${HISTORY.length})`, C.owner, h.map(([id, t]) => `• ${id} · ${t}`)));
const testFrames = () => chunks(TEST_FILES, 90).map((t, i) => listing(`testfiles${i}`, `Test files ${i + 1}`, `Every unit test file and its cases (${TEST_FILES.reduce((a, [, n]) => a + n, 0).toLocaleString('en-US')} cases in all)${i ? ` (${i + 1})` : ''}`, C.teacher, t.map(([f, n]) => `${f} · ${n}`)));
const enumsFrame = () => listing('enums', 'Enums', `The ${ENUM_LIST.length} fixed lists the database uses`, C.admin, ENUM_LIST.map(([n, v]) => `• ${n}: ${v.join(', ')}`));
const depsFrame = () => listing('deps', 'Libraries', `Every library (${DEPS.length}) and its version`, C.tech, DEPS.map(([n, v, dev]) => `${n} · ${v}${dev ? ' (building and tests)' : ''}`));
const migrationFrames = () => {
  const lines = MIGRATIONS.map((m) => `${m.slice(0, 4)} · ${m.slice(5).replace(/_/g, ' ')}`);
  return Array.from({ length: Math.ceil(lines.length / 90) }, (_, i) => listing(`migrations${i}`, `DB changes ${i + 1}`, `How the database grew: changes ${i * 90 + 1}–${Math.min(lines.length, i * 90 + 90)} of ${lines.length}`, C.owner, lines.slice(i * 90, i * 90 + 90)));
};

function languages() {
  const s = section('langs', 'Languages');
  LANGUAGES.forEach(([code, name, own, rtl], i) => s.note((i % 5) * 470, 70 + Math.floor(i / 5) * 230, 440, 200, `${own}\n${name} · ${code}${rtl ? '\nreads right to left' : ''}`, rtl ? C.parent : C.student, 30));
  return titled(s, `${LANGUAGES.length} languages, every page`, C.student);
}

function testsChart() {
  const s = section('tests', 'Unit tests');
  const files = TESTS.reduce((a, [, n]) => a + n, 0);
  s.text(0, 80, `${files} test files, by folder (src/…)`, 28);
  bars(s, 0, 140, TESTS.slice(0, 8), C.teacher);
  return titled(s, 'Unit tests, by where they live', C.teacher);
}

function guards() {
  const s = section('guards', 'Guards and jobs');
  const col: [string, string, [string, string][]][] = [
    ['Rate limits (cloudflare/worker.ts)', C.parent, [['Every request', 'Per signed-in person, or per address when signed out'], ['Per address', 'Generous: stops floods from one place'], ['Costly work', 'Per person: AI, email and uploads'], ['Sign-in steps', 'Per address or per account, for codes']]],
    ['Scheduled jobs (UTC)', C.admin, [['07:30 every day', 'The owner’s morning summary email'], ['08:00 every day', 'Quiz reminders; health numbers keep 7 days of timings, 60 of counts'], ['Every 15 minutes', 'The spending guard, plan alerts at 70% and 90%, call reminders']]],
    ['Live rooms (Durable Objects)', C.tech, [['RealtimeHub', 'Each person’s live updates: up to 20 tabs and devices'], ['BoardRoom', 'One per whiteboard: up to 20,000 shapes, 60 people'], ['CodeRoom', 'Code written together'], ['CallRoom', 'Calls and live classes']]],
  ];
  col.forEach(([t, c, rows], i) => {
    s.note(i * 720, 70, 690, 90, t, c, 26);
    rows.forEach(([a, b], j) => s.note(i * 720, 180 + j * 200, 690, 180, `${a}\n${b}`, C.white, 24));
  });
  return titled(s, 'Guards and scheduled jobs: what runs by itself', C.parent);
}

// ─── M17 · More areas: Messages, Collaborate, the look, how-tos, journeys ───────────────────────
/** A grid of titled notes, `cols` a row. */
function cards(key: string, name: string, title: string, colour: string, items: [string, string][], cols = 4, w = 560, h = 190, fill = C.white) {
  const s = section(key, name);
  items.forEach(([t, d], i) => s.note((i % cols) * (w + 30), 70 + Math.floor(i / cols) * (h + 30), w, h, `${t}\n${d}`, i % 2 ? fill : C.grey, 22));
  return titled(s, title, colour);
}
/** Steps in a row of boxes joined by arrows, wrapping every `per` steps. */
function journey(key: string, name: string, title: string, colour: string, steps: [string, string][], per = 4) {
  const s = section(key, name);
  steps.forEach(([t, d], i) => {
    const x = (i % per) * 520, y = 70 + Math.floor(i / per) * 320;
    s.note(x, y, 460, 270, `${i + 1} · ${t}\n\n${d}`, i % 2 ? C.white : colour, 22);
    if (i % per !== per - 1 && i < steps.length - 1) s.raw({ type: 'arrow', x: x + 465, y: y + 135, width: 50, height: 0, points: [[0, 0], [50, 0]], strokeWidth: 2 } as El);
  });
  return titled(s, title, colour);
}

const messagesArea = () => cards('msg', 'Messages', 'Messages: everything it does', C.student, [
  ['Chats and groups', 'One-to-one and groups, with each person in their own colour'], ['Communities', 'Channels, roles and moderation, like Discord or a WhatsApp community'],
  ['Threads', 'Replies to one message open beside the chat'], ['Status updates', 'Photos and words for 24 hours, like stories'],
  ['Folders', 'Your own chips above the list: All, Unread, Direct, Groups, yours'], ['Voice notes', 'Keep playing in a mini player while you move around'],
  ['Video notes', 'Round videos up to a minute'], ['Huddles', 'A drop-in voice room inside any chat'],
  ['Calls', 'Voice and video, a knock to join, ringing with the app closed'], ['Private chats', 'End-to-end encrypted on the two devices, with a safety code'],
  ['Chat lock', 'A locked chat needs your passkey or PIN to open'], ['Scheduled messages', 'Pick when a message goes out'],
  ['Saved replies', 'Snippets and templates for answers you give often'], ['Polls and stickers', 'Quick votes; the school’s sticker packs and your own'],
  ['Translation', 'Read any message in your language'], ['Link cards', 'Docs, boards and task boards show live inside a chat'],
  ['Photos and files', 'Full-screen viewer; PDFs and code previewed'], ['Search', 'Filters typed in the box: from:, in:, has:file, before:'],
  ['Starred and export', 'Keep messages; download a whole chat'], ['Presence', 'Online, busy, away, with your own status line'],
  ['Broadcasts', 'Staff send one message to many people at once'], ['Safety', 'Report, block, and the school’s rules on who may message whom'],
  ['Message effects', 'Confetti, balloons, hearts, fireworks, lasers; slam, loud, gentle, invisible ink (after iMessage)'], ['Send silently', 'Arrives without a notification (after Telegram)'],
  ['Undo send', 'Messages wait four seconds so you can take them back (after Gmail)'], ['Rewrite with AI', 'Friendlier, formal, shorter, clearer (after Google Messages)'],
  ['Quick reaction', 'Each chat’s own one-tap emoji, sent big (after Messenger)'], ['Streaks', '🔥 days in a row you’ve both written (after Snapchat)'],
  ['Folder rail and pinned bubbles', 'Folders down the side (Telegram desktop); pinned chats float at the top (iMessage)'], ['Calls, notifications, announcements', 'Contact posters and a week of call minutes; notification stacks with Priority; a phone preview and “Seen by”'],
], 4);

const collaborateArea = () => cards('collab', 'Collaborate', 'Collaborate: every tool, all live together', C.teacher, [
  ['Spaces', 'Each class and study group: its call, docs, boards, tasks and files in one place'], ['Whiteboards', 'Live drawing, 10 templates, shapes for science and maths, AI drawing, votes, timer, presenting'],
  ['Docs', 'Word’s formatting, suggestions, comments, versions, @mentions, embeds, a wiki of pages'], ['Sheets', 'Excel in the browser: formulas, charts, many sheets, comments'],
  ['Slides', 'PowerPoint’s way: layouts, presenter view, written together'], ['Tasks', 'Boards of cards, calendar and timeline views, automations'],
  ['Code rooms', 'Code written together live, run in the browser'], ['Files', 'Folders, every version, previews, search inside files'],
  ['Tools', 'Photo, audio, video and PDF editors; convert and compress files'], ['Fair group work', 'Who did what in a space, for the teacher'],
  ['AI help', 'Writing help in docs, drawing on boards'], ['Works offline', 'Edits wait and catch up when the phone is back online'],
  ['Home', 'Recent work from every tool, one search across all of it, pins kept on your account'], ['Share by QR', 'Any item as a QR code for the projector'],
  ['Focus timer', '25/5, 50/10 or 15/3 rounds, with a pill beside the tabs while it runs'], ['Quick notes', 'A notepad that becomes a document in one tap'],
  ['Due this week and streaks', 'Your cards day by day; four weeks of activity'], ['Outline to mind map', 'Paste an indented list on a whiteboard'],
  ['Writing goals', 'A ring on the word count fills as you write'], ['Shortcuts', '/ to search; d s p b t to make something new; f for the timer'],
], 4);

const designArea = () => cards('look', 'The look', 'The look and the motion: the rules every page follows', C.owner, [
  ['Colours', 'Dark blue for everything you use; hot pink with a little purple for the light lines, glows and animations'], ['The light river', 'Fine strands of light down every page, answering the pointer'],
  ['Cards', 'Dark, slightly see-through, a two-tone edge glow on hover'], ['Type', 'Text that means something is 11 px or more; lines near 75 characters'],
  ['Entering', 'Ease-out, never ease-in; nothing grows from nothing (start at 0.9)'], ['Speed', 'Presses 100–160 ms, menus 150–250, sheets up to 500; exits faster'],
  ['Lists', 'Items arrive one after another, 30–80 ms apart'], ['Every day things', 'What you use many times a day barely moves'],
  ['Phones', 'Hover extras only where there is a mouse; big touch targets'], ['Reduce Motion', 'Turns every movement off; the page still works'],
  ['Contrast', 'Grey text checked against what is really behind it, in both themes'], ['Loading', 'Placeholders shaped like the page; parts arrive in turn'],
], 4);

const ownerHowTo = () => cards('howto', 'How do I…', 'How do I…? (the owner’s everyday jobs)', C.owner, [
  ['See what needs me', 'Owner console → Overview → What needs you'], ['Approve a school or person', 'Owner console → People → People and schools'],
  ['Undo a change', 'Owner console → Data & money → Changes and undo'], ['Fix an error', 'Owner console → Health → Errors (an AI suggests the fix)'],
  ['Tell everyone something', 'Owner console → Live → Announce to everyone'], ['Check the costs', 'Owner console → Overview → plan usage; the guard emails at 70%'],
  ['Edit any record', 'Owner console → Data & money → All data'], ['Handle a deletion request', 'Owner console → People → Deletion requests'],
  ['Write a blog post', 'Owner console → Content → Blog'], ['Get this board fresh', 'Owner console → Content → Explain UniVerse → Make a fresh one'],
  ['Switch AI models', 'Owner console → Server → AI models'], ['Put changes live', 'Say “merge”: GitHub merges, Cloudflare builds and deploys'],
], 3, 620);

const schoolFaq = () => cards('faq', 'Questions', 'Questions schools ask, answered', C.admin, [
  ['What does it cost students?', 'Nothing, always'], ['Where is our data?', 'On Cloudflare’s network; each school sees only its own'],
  ['Can we bring our students in?', 'A CSV import (with undo) or OneRoster'], ['Does it work with our LMS?', 'LTI, Common Cartridge, grade passback'],
  ['Which languages?', `${LANGUAGES.length}, including right-to-left ones`], ['Without internet?', 'It installs like an app; work waits and syncs later'],
  ['Is it accessible?', 'Checked against WCAG 2.2 AA on phone and desktop'], ['Our own payments?', 'Each school’s own Stripe or Razorpay, keys encrypted'],
  ['Can people take their data?', 'Download it any time, or ask to delete it'], ['Phones?', 'The website installs on phones; store apps need developer accounts'],
  ['Who sees children’s messages?', 'Not parents, not other schools; reports go to the school'], ['How do we start?', 'Sign up, the owner approves the school, invite staff'],
], 3, 620);

const waitingArea = () => cards('waiting', 'Waiting', 'Waiting on the owner (things only you can provide)', C.parent, [
  ['Phone sign-in', 'Firebase billing (SMS codes cost money)'], ['UPI payments', 'A Razorpay account and keys'],
  ['Calendar sync', 'A Google Cloud project and a Microsoft app'], ['Google Classroom import', 'A sample export or the Classroom API'],
  ['Phone apps in the stores', 'Apple and Google developer accounts'], ['GIF search in chat', 'A Tenor or Giphy key'],
  ['Exact Word / PowerPoint to PDF', 'A paid conversion service'], ['Live streaming to YouTube', 'Kept free for now (Stream Live is paid)'],
], 2, 620);

const messageLife = () => journey('msglife', 'A message', 'A message’s journey, from typing to read', C.student, [
  ['Typed', 'The message box keeps a draft per chat'], ['Sent', 'Shown at once, marked “sending”'], ['Checked', 'The server checks who you are and that you may write here'],
  ['Stored', 'Saved in the database (D1)'], ['Delivered', 'Each person’s live room passes it to every tab and device'], ['Pushed', 'People who are away get a notification'],
  ['Read', 'Read ticks go back to the sender'], ['Kept', 'Found again by search; starred, exported or deleted later'],
]);

const uploadLife = () => journey('filelife', 'A file', 'A file’s journey, from picking to finding it again', C.tech, [
  ['Picked', 'Dropped, pasted or chosen; photos are shrunk first'], ['Checked', 'Type and size checked; your quota counted'], ['Stored', 'Saved in R2 (Cloudflare’s storage)'],
  ['Read', 'The words inside are taken out, so search finds them'], ['Versioned', 'A new upload keeps the old one as a version'], ['Shared', 'Shown where it is used: a chat, a doc, a space'],
]);

const securityLayers = () => {
  const s = section('layers', 'Layers');
  const layers: [string, string][] = [
    ['Cloudflare’s edge', 'HTTPS only, strict browser rules'], ['Rate limits', 'Floods stopped per person and per address'], ['Sign-in token', 'Its signature checked on every request'],
    ['Role', 'Student, teacher, admin, parent or owner'], ['School', 'An admin only ever reaches their own school'], ['Input checks', 'Every value read and checked'], ['The data', 'Changes logged; the owner can undo'],
  ];
  layers.forEach(([t, d], i) => s.note(i * 60, 70 + i * 130, 1800 - i * 120, 115, `${t} — ${d}`, [C.owner, C.parent, C.admin, C.teacher, C.student, C.tech, C.warm][i], 24));
  return titled(s, 'Every request passes these layers, outside in', C.parent);
};

const glance = () => {
  const s = section('glance', 'At a glance');
  const cases = TEST_FILES.reduce((a, [, n]) => a + n, 0);
  const fields = TABLES.reduce((a, [, f]) => a + f, 0);
  ([[ROUTES.length, 'app routes'], [CORE.length, 'core API endpoints'], [PAGES.length, 'pages'], [TABLES.length, 'tables'], [fields, 'table fields'], [ENUM_LIST.length, 'fixed lists (enums)'],
    [MIGRATIONS.length, 'database changes'], [DESCRIBED.length, 'files that say what they do'], [TEST_FILES.length, 'test files'], [cases, 'test cases'], [DEPS.length, 'libraries'], [HISTORY.length, 'plan items built']] as const)
    .forEach(([n, t], i) => s.note((i % 4) * 470, 70 + Math.floor(i / 4) * 250, 440, 220, `${n.toLocaleString('en-US')}\n${t}`, [C.student, C.teacher, C.admin, C.parent, C.owner, C.tech][i % 6], 40));
  return titled(s, 'UniVerse at a glance, counted from the code', C.tech);
};

// Frame names are kept short (each area's template is named in the banner's list), so they don't
// run into each other when the whole board is zoomed out.
// Scaled copy of a shape: position, size, text and arrow points (frames are made separately).
function place(e: El, k: number, dx: number, dy: number): El {
  const o = { ...e, x: (e.x ?? 0) * k + dx, y: (e.y ?? 0) * k + dy } as El & { fontSize?: number; label?: { fontSize?: number }; points?: [number, number][] };
  if (e.width != null) o.width = e.width * k;
  if (e.height != null) o.height = e.height * k;
  if (o.fontSize) o.fontSize *= k;
  if (o.label) o.label = { ...o.label, fontSize: (o.label.fontSize ?? 20) * k };
  if (o.points) o.points = o.points.map(([px, py]): [number, number] => [px * k, py * k]);
  return o;
}

const PAD = 70, GAP = 220;
const natural = (s: Section) => { const z = size(s); return { w: z.w + PAD * 2, h: z.h + PAD * 2 }; };

/**
 * Frames in bands of similar height: tallest first, split into as many bands as fill the board's
 * width at a scale of about 1.3, each band taking an even share (so no band is left nearly empty).
 */
function packed(frames: Section[], W = 17070, scale = 1.3): Section[][][] {
  const sorted = [...frames].sort((a, b) => natural(b).h - natural(a).h);
  const width = (f: Section) => natural(f).w * scale + GAP;
  const total = sorted.reduce((a, f) => a + width(f), 0);
  const n = Math.max(1, Math.round(total / W));
  const bands: Section[][][] = Array.from({ length: n }, () => []);
  let run = 0;
  for (const f of sorted) {
    bands[Math.min(n - 1, Math.floor((run + width(f) / 2) / (total / n)))].push([f]);
    run += width(f);
  }
  return bands.filter((b) => b.length);
}

/**
 * The board (the owner: "fill the blank area at 10%… a little space between them… attractive"):
 * the banner across the top, then three bands, sized together to fill a wide screen at 10% zoom.
 * In a band every column is the same height and the band is exactly as wide as the banner, with
 * the same small gap everywhere; a column can hold two frames, one above the other. Each frame is
 * scaled as a whole to fit (text keeps its proportions). Gaps leave room for the frames' names.
 */
export function guideElements(): ExcalidrawElementSkeleton[] {
  // M70 (the owner: "make it like twice the size… I should be able to see it fully"): twice as wide
  // (about 34,000), the hand-made bands side by side in pairs, so it is about half as tall and the
  // whole board fits a screen at about 4% zoom (Excalidraw's limit is lowered to 2% by the patch in
  // patches/@excalidraw__excalidraw@0.18.1.patch).
  const banner = startHere();
  const W = natural(banner).w * 2;
  const bands: Section[][][] = [
    [[banner]],
    [[everyFeature()], [jobs()], [travels(), howItWasBuilt()], [technical(), ownersWeek()], [students()], [teachers()], [admins()], [parents()], [consoleMap()], [whereThingsStand()], [lookingBack()]],
    [[swot()], [webAndApp()], [demoPlan()], [safety()], [limits()], [glossary()], [codeNumbers()], [database()], [permissions(), notifications()], [signIn()], [assignmentLife(), checks()], [stack(), weights()]],
    [[messagesArea()], [collaborateArea()], [designArea()], [ownerHowTo(), waitingArea()], [schoolFaq()], [messageLife(), uploadLife()], [securityLayers(), glance()]],
    ...packed([languages(), testsChart(), guards(), enumsFrame(), depsFrame(), ...historyFrames(), ...testFrames(), ...coreFrames(), ...routeFrames(), ...pageFrames(), ...tableFrames(), ...codeFrames(), ...migrationFrames()], W),
  ];
  const out: El[] = [];
  let y = 0;
  for (const cols of bands) {
    // Column widths for one band height H: a column of m frames, scaled to one width, is
    // (H - GAP(m-1)) / R wide, where R adds up each frame's height over width. Solve for H.
    const R = cols.map((c) => c.reduce((a, s) => { const z = natural(s); return a + z.h / z.w; }, 0));
    const H = (W - GAP * (cols.length - 1) + GAP * cols.reduce((a, c, i) => a + (c.length - 1) / R[i], 0)) / R.reduce((a, r) => a + 1 / r, 0);
    let x = 0;
    cols.forEach((c, i) => {
      const cw = (H - GAP * (c.length - 1)) / R[i];
      let cy = y;
      for (const s of c) {
        const z = natural(s);
        const k = cw / z.w;
        for (const e of s.els) out.push(place(e, k, x + PAD * k, cy + PAD * k));
        out.push({ type: 'frame', id: s.id('frame'), name: s.name, children: s.els.map((e) => e.id as string), x, y: cy, width: cw, height: z.h * k } as unknown as El);
        cy += z.h * k + GAP;
      }
      x += cw + GAP;
    });
    y += H + GAP;
  }
  return out;
}
