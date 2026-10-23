import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform';

// "UniVerse explained" (owner console → Explain UniVerse): one whiteboard about the whole site,
// built from all ten whiteboard templates, each in its own named frame. Like any template it's
// added on the first open of the new, empty board, as ordinary shapes the owner can edit.
// Keep it true: when a big feature lands or goes, change the notes here (old boards keep theirs).

type El = ExcalidrawElementSkeleton & { id?: string; x?: number; y?: number; width?: number; height?: number };
const C = { student: '#a5d8ff', teacher: '#b2f2bb', admin: '#ffec99', parent: '#ffc9c9', owner: '#d0bfff', tech: '#99e9f2', warm: '#ffd8a8', grey: '#f1f3f5', white: '#ffffff' };

/** One frame's worth of shapes, in its own coordinates (0, 0 at its top left). */
function section(key: string, name: string) {
  const els: El[] = [];
  let n = 0;
  const id = (s?: string) => `${key}-${s ?? n++}`;
  return {
    id,
    els,
    text(x: number, y: number, t: string, fontSize = 28, extra: Partial<El> = {}) {
      els.push({ type: 'text', id: id(), x, y, text: t, fontSize, ...extra } as El);
    },
    box(x: number, y: number, width: number, height: number, label: string, bg = 'transparent', extra: Partial<El> & { fontSize?: number } = {}) {
      const { fontSize = 20, ...rest } = extra;
      els.push({ type: 'rectangle', id: id(), x, y, width, height, backgroundColor: bg, fillStyle: 'solid', roundness: { type: 3 }, label: { text: label, fontSize, verticalAlign: 'top', textAlign: 'left' }, ...rest } as El);
    },
    note(x: number, y: number, width: number, height: number, t: string, bg: string, fontSize = 16) {
      // White and grey notes keep a soft edge, so they still show on a dark board.
      const edge = bg === C.white || bg === C.grey ? '#ced4da' : 'transparent';
      els.push({ type: 'rectangle', id: id(), x, y, width, height, backgroundColor: bg, fillStyle: 'solid', strokeColor: edge, roundness: { type: 3 }, label: { text: t, fontSize, textAlign: 'left', verticalAlign: 'top' } } as El);
    },
    raw(e: El) { els.push({ id: id(), ...e } as El); },
    name,
  };
}
type Section = ReturnType<typeof section>;

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

// ─── 1 · Blank canvas: start here ───────────────────────────────────────────────────────────────
function startHere() {
  const s = section('start', '1 · Start here (Blank canvas)');
  s.text(0, 0, 'UniVerse, explained', 56);
  s.text(0, 90, lines(
    'UniVerse is one platform for a whole school, on the web and as a phone app.',
    'Students, teachers, parents, school admins and the owner each get their own menu.',
    'This board explains every part: what it does, how it works, and the technology underneath.',
    'Each framed area uses one of the ten whiteboard templates. Zoom out to see them all.',
  ), 24);
  s.text(0, 260, 'Colours on this board', 30);
  ([['Students', C.student], ['Teachers', C.teacher], ['School admins', C.admin], ['Parents', C.parent], ['Owner (you)', C.owner], ['Technical', C.tech]] as const)
    .forEach(([t, c], i) => s.note((i % 3) * 300, 320 + Math.floor(i / 3) * 110, 280, 90, t, c, 22));
  s.text(0, 560, 'The ten areas', 30);
  s.note(0, 620, 900, 330, lines(
    '1  Start here — this page (Blank canvas)',
    '2  Every feature — a mind map of the whole site',
    '3  Where things stand — Kanban: done, in progress, to do',
    '4  Strengths and risks — SWOT analysis',
    '5  Website and phone app — Venn diagram',
    '6  How it was built — Timeline',
    '7  The owner’s week — Weekly planner',
    '8  How it works, technically — Cornell notes',
    '9  Looking back — Retrospective',
    '10 Showing UniVerse to a new school — Lesson plan',
  ), C.grey, 20);
  return s;
}

// ─── 2 · Mind map: every feature ────────────────────────────────────────────────────────────────
function everyFeature() {
  const s = section('map', '2 · Every feature (Mind map)');
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
    s.raw({ type: 'arrow', x: cx, y: cy, start: { id: s.id('centre') }, end: { id } } as El);
    const right = Math.cos(a) > 0.2, left = Math.cos(a) < -0.2;
    const nx = right ? bx + 160 : left ? bx - 160 - 440 : bx - 220;
    const ny = right || left ? by - 60 : by < cy ? by - 60 - 230 : by + 70;
    s.note(nx, ny, 440, 220, body, C.white, 15);
  });
  return s;
}

// ─── 3 · Kanban: where things stand ─────────────────────────────────────────────────────────────
function whereThingsStand() {
  const s = section('kanban', '3 · Where things stand (Kanban)');
  s.text(0, 0, 'Where things stand (23 Oct 2026)', 36);
  const cols: [string, string, string[]][] = [
    ['To do (owner decides)', C.parent, [
      'Phone sign-in: turn on SMS in Firebase (needs billing: costs money)',
      'Keep Cloudflare Workers Paid on ($5 a month)',
      'Phone app in the app stores (needs Apple and Google accounts)',
      'Anything else that costs money or needs an account: always the owner’s call',
    ]],
    ['In progress', C.admin, [
      'The full bug and error review',
      'Check folders and code boxes on Safari and iPhone',
      'Parent link code and console codes as code boxes',
    ]],
    ['Done', C.teacher, [
      'Work queue Q1–Q23: courses, quizzes, attendance, calendar, AI tutor, search, notifications…',
      'Office suite: sheets, slides, Word features',
      'Security parts 1–7, payment keys encrypted, admins see only their school',
      'Motion M1–M6: page entrances, light trail, folders, code boxes',
      'Errors hub redesign; Cloudflare “code had hung” fixed',
    ]],
  ];
  cols.forEach(([title, colour, items], i) => {
    s.box(i * 470, 70, 440, 900, title, 'transparent', { strokeStyle: 'dashed', fontSize: 26 });
    items.forEach((t, j) => s.note(i * 470 + 20, 130 + j * 165, 400, 145, t, colour, 18));
  });
  return s;
}

// ─── 4 · SWOT ──────────────────────────────────────────────────────────────────────────────────
function swot() {
  const s = section('swot', '4 · Strengths and risks (SWOT analysis)');
  s.text(0, 0, 'UniVerse: strengths, weaknesses, opportunities, threats', 36);
  const q: [string, string, string][] = [
    ['Strengths', C.teacher, bullets('Everything a school needs in one place, one sign-in', 'Runs on Cloudflare’s network: fast everywhere, low cost', 'Works on phones, installs as an app, many languages', '  (Arabic and Urdu read right to left)', 'Accessible: screens checked with axe, light and dark', 'AI built in, with a daily allowance and an off switch')],
    ['Weaknesses', C.parent, bullets('So many features it can feel complicated', '  (breadcrumbs and simpler menus help)', 'One D1 database: at most 100 values a query', '  and 50 queries a request, so code must be careful', 'Some features wait on owner accounts (SMS, stores)', 'Tested mostly in Chrome: Safari needs checking')],
    ['Opportunities', C.student, bullets('Schools want one tool instead of ten', 'Many schools on one site (each admin sees only theirs)', 'Course and curriculum marketplace', 'Parents, sponsors and partner schools on the platform', 'Phone app in the app stores')],
    ['Threats', C.admin, bullets('Big rivals: Google Classroom, Canvas, Moodle', 'Price or limit changes at Cloudflare, Firebase, AI providers', 'Children’s data: privacy laws (GDPR and others)', 'Attacks on sign-in and payments', 'Outages of the services it depends on')],
  ];
  q.forEach(([title, colour, body], i) => s.box((i % 2) * 720, 70 + Math.floor(i / 2) * 440, 700, 420, `${title}\n\n${body}`, colour, { fontSize: 20 }));
  return s;
}

// ─── 5 · Venn: website and phone app ────────────────────────────────────────────────────────────
function webAndApp() {
  const s = section('venn', '5 · Website and phone app (Venn diagram)');
  s.text(0, 0, 'Website and phone app: what’s the same, what’s different', 36);
  s.raw({ type: 'ellipse', x: 0, y: 80, width: 900, height: 820, backgroundColor: C.student, fillStyle: 'solid', opacity: 55 } as El);
  s.raw({ type: 'ellipse', x: 560, y: 80, width: 900, height: 820, backgroundColor: C.parent, fillStyle: 'solid', opacity: 55 } as El);
  s.text(150, 130, 'Website (a browser)', 30);
  s.text(80, 220, lines('Side menu, big screens', 'Search with ⌘K / Ctrl+K', 'Owner console and admin', '  screens at full size', 'Office editing at full size', 'Drag and drop files'), 22);
  s.text(1000, 130, 'Phone app', 30);
  s.text(1030, 220, lines('Installs from the browser', '  (a web app, “PWA”)', 'Tab bar at the bottom', 'Push notifications', 'Camera: scan, homework photos', 'Pages already opened', '  work without internet'), 22);
  s.text(640, 300, 'Both', 30);
  s.text(600, 360, lines('One account, same data', 'Live updates', 'Every feature', 'Every language', 'Light and dark mode', 'Reduce Motion', 'Same code: one site'), 22);
  return s;
}

// ─── 6 · Timeline: how it was built ─────────────────────────────────────────────────────────────
function howItWasBuilt() {
  const s = section('timeline', '6 · How it was built (Timeline)');
  s.text(0, 0, 'How UniVerse was built', 36);
  s.raw({ type: 'arrow', x: 0, y: 380, width: 2100, height: 0, points: [[0, 0], [2100, 0]], strokeWidth: 3 } as El);
  const events: [string, string][] = [
    ['Stages 1–4', 'The core: accounts and roles, courses, messages, groups, files, the student, teacher and admin areas, Global Impact'],
    ['Stage 5 · Q1–Q23', 'The work queue: course copy, assignments, quizzes, live quiz, home pages, notifications, search, attendance, calendar, AI tutor, skills passport'],
    ['Office suite', 'Sheets, slides and Word features inside Collaborate → Docs'],
    ['Security', 'Parts 1–7 checked, payment keys encrypted, each admin limited to their school'],
    ['22 Oct 2026', 'Cloudflare Workers Paid: more time per request, a spending guard at 90%'],
    ['23 Oct 2026', 'New look and motion: light trail, opening folders, code boxes, errors hub; the “hung” requests fixed'],
  ];
  events.forEach(([when, what], i) => {
    const x = 100 + i * 380;
    s.raw({ type: 'ellipse', x: x - 14, y: 366, width: 28, height: 28, backgroundColor: '#7c3aed', fillStyle: 'solid' } as El);
    s.note(x - 170, i % 2 ? 430 : 90, 340, 250, `${when}\n\n${what}`, [C.student, C.teacher, C.admin, C.parent, C.owner, C.tech][i], 17);
  });
  return s;
}

// ─── 7 · Weekly planner: the owner's week ───────────────────────────────────────────────────────
function ownersWeek() {
  const s = section('week', '7 · The owner’s week (Weekly planner)');
  s.text(0, 0, 'A week of looking after UniVerse (owner console)', 36);
  const days: [string, string][] = [
    ['Monday', 'Health check and Errors: anything red? The errors hub explains each one and can suggest a fix.'],
    ['Tuesday', 'Moderation and safety reports: posts, chats and people flagged by schools.'],
    ['Wednesday', 'Schools and People: new schools, approvals, who needs help.'],
    ['Thursday', 'Money: payments, plans and billing. Payment keys stay encrypted.'],
    ['Friday', 'Server: Cloudflare usage, builds, visitors. The guard pauses at 90% of the plan.'],
    ['Saturday', 'Blog and Announce: tell schools what’s new.'],
    ['Sunday', 'Rest. Daily jobs keep running by themselves: digests, clean-ups, search index, sealing old keys.'],
  ];
  days.forEach(([d, t], i) => {
    s.box(i * 300, 70, 280, 620, d, i >= 5 ? C.grey : 'transparent', { fontSize: 24 });
    s.note(i * 300 + 15, 130, 250, 300, t, i === 6 ? C.tech : C.owner, 17);
  });
  return s;
}

// ─── 8 · Cornell notes: how it works, technically ───────────────────────────────────────────────
function technical() {
  const s = section('cornell', '8 · How it works, technically (Cornell notes)');
  s.text(0, 0, 'How UniVerse works, technically', 36);
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
  return s;
}

// ─── 9 · Retrospective ─────────────────────────────────────────────────────────────────────────
function lookingBack() {
  const s = section('retro', '9 · Looking back (Retrospective)');
  s.text(0, 0, 'Looking back on the latest work', 36);
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
  return s;
}

// ─── 10 · Lesson plan: showing UniVerse to a new school ─────────────────────────────────────────
function demoPlan() {
  const s = section('lesson', '10 · Showing UniVerse to a new school (Lesson plan)');
  s.text(0, 0, 'Lesson plan: showing UniVerse to a new school (45 minutes)', 36);
  s.box(0, 70, 1500, 170, 'Learning aims (by the end, the school can…)\n\n• sign in as a student, teacher and admin   • find any feature with search   • set up its first course and class', C.owner, { fontSize: 20 });
  s.box(0, 260, 480, 460, `Starter (10 min)\n\n${bullets('Open the public demo (no account needed)', 'Show a student’s home page and Up next', 'Switch to dark mode and another language')}`, C.admin, { fontSize: 20 });
  s.box(510, 260, 480, 460, `Main activity (25 min)\n\n${bullets('Teacher: make a course, an assignment, a quiz', 'Student: hand it in, try the AI tutor', 'Everyone: a live whiteboard together', 'Admin: attendance and the timetable')}`, C.teacher, { fontSize: 20 });
  s.box(1020, 260, 480, 460, `Plenary (10 min)\n\n${bullets('Show the grades a parent sees', 'Answer questions', 'Agree the next step: an admin account')}`, C.student, { fontSize: 20 });
  s.box(0, 740, 735, 250, `Resources\n\n${bullets('The demo site and its sample data', 'This whiteboard', 'Help pages and the blog')}`, C.grey, { fontSize: 20 });
  s.box(765, 740, 735, 250, `Checking understanding\n\n${bullets('Can they find “Attendance” with search?', 'Can a teacher grade a hand-in alone?', 'Do they know where to ask for help?')}`, C.warm, { fontSize: 20 });
  return s;
}

/** Every section, four to a row (the whole board fits a wide screen), each inside a named frame. */
export function guideElements(): ExcalidrawElementSkeleton[] {
  const sections = [startHere(), everyFeature(), whereThingsStand(), swot(), webAndApp(), howItWasBuilt(), ownersWeek(), technical(), lookingBack(), demoPlan()];
  const out: El[] = [];
  const PAD = 80, GAP = 700;
  let y = 0;
  for (let i = 0; i < sections.length; i += 4) {
    const pair = sections.slice(i, i + 4);
    const sizes = pair.map(size);
    let x = 0;
    pair.forEach((s, j) => {
      const { w, h } = sizes[j];
      for (const e of s.els) out.push({ ...e, x: (e.x ?? 0) + x + PAD, y: (e.y ?? 0) + y + PAD } as El);
      out.push({ type: 'frame', id: s.id('frame'), name: s.name, children: s.els.map((e) => e.id as string), x, y, width: w + PAD * 2, height: h + PAD * 2 } as unknown as El);
      x += w + PAD * 2 + GAP;
    });
    y += Math.max(...sizes.map((z) => z.h)) + PAD * 2 + GAP;
  }
  return out;
}
