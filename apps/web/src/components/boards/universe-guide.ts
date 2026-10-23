import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform';

// "UniVerse explained" (owner console → Explain UniVerse): one whiteboard about the whole site,
// built from all ten whiteboard templates, each in its own named frame. Like any template it's
// added on the first open of the new, empty board, as ordinary shapes the owner can edit.
// Keep it true: when a big feature lands or goes, change the notes here (old boards keep theirs).

type El = ExcalidrawElementSkeleton & { id?: string; x?: number; y?: number; width?: number; height?: number };
const C = { student: '#a5d8ff', teacher: '#b2f2bb', admin: '#ffec99', parent: '#ffc9c9', owner: '#d0bfff', tech: '#99e9f2', warm: '#ffd8a8', grey: '#f1f3f5', white: '#ffffff' };

// Text in a box doesn't wrap by itself: break each line to the box's width (about 0.6 em a letter
// in the hand-drawn font), keeping a bullet's indent.
function wrap(t: string, width: number, fontSize: number) {
  const max = Math.max(8, Math.floor((width - 24) / (fontSize * 0.6)));
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
      els.push({ type: 'rectangle', id: id(), x, y, width, height, backgroundColor: bg, fillStyle: 'solid', roundness: { type: 3 }, label: { text: wrap(label, width, fontSize), fontSize, verticalAlign: 'top', textAlign: 'left', strokeColor: INK }, ...rest } as El);
    },
    note(x: number, y: number, width: number, height: number, t: string, bg: string, fontSize = 16) {
      // White and grey notes keep a soft edge, so they still show on a dark board.
      const edge = bg === C.white || bg === C.grey ? '#ced4da' : 'transparent';
      els.push({ type: 'rectangle', id: id(), x, y, width, height, backgroundColor: bg, fillStyle: 'solid', strokeColor: edge, roundness: { type: 3 }, label: { text: wrap(t, width, fontSize), fontSize, textAlign: 'left', verticalAlign: 'top', strokeColor: INK } } as El);
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

// ─── 1 · Blank canvas: start here (the banner across the top) ───────────────────────────────────
function startHere() {
  const s = section('start', '1 · Start here');
  s.text(0, 0, 'UniVerse, explained', 110);
  s.text(0, 170, lines(
    'One platform for a whole school, on the web and as a phone app.',
    'Students, teachers, parents, school admins and the owner each get their own menu.',
    'This board explains every part: what it does, how it works, and the technology underneath.',
    'Each framed area uses one of the ten whiteboard templates. Zoom in on any of them.',
  ), 42);
  // The numbers that describe it, as a strip under the words.
  ([['5', 'roles, one sign-in'], ['13', 'languages, 2 right to left'], ['8', 'quiz question types, auto-marked'], ['10', 'whiteboard templates'], ['$0', 'for students, always'], ['$5', 'a month to run (Cloudflare)']] as const)
    .forEach(([n, t], i) => s.note(i * 520, 430, 490, 160, `${n}\n${t}`, [C.student, C.teacher, C.admin, C.parent, C.owner, C.tech][i], 38));
  s.text(3200, 0, 'Colours on this board', 40);
  ([['Students', C.student], ['Teachers', C.teacher], ['School admins', C.admin], ['Parents', C.parent], ['Owner (you)', C.owner], ['Technical', C.tech]] as const)
    .forEach(([t, c], i) => s.note(3200 + (i % 2) * 400, 80 + Math.floor(i / 2) * 175, 380, 160, t, c, 28));
  s.text(4060, 0, 'The ten areas', 40);
  s.note(4060, 80, 1240, 510, lines(
    '1  Start here: this banner (Blank canvas)',
    '2  Every feature: a mind map of the whole site',
    '3  Where things stand: Kanban, done to do',
    '4  Strengths and risks: SWOT analysis',
    '5  Website and phone app: Venn diagram',
  ), C.grey, 28);
  s.note(5330, 80, 1240, 510, lines(
    '6  How it was built: Timeline',
    '7  The owner’s week: Weekly planner',
    '8  How it works, technically: Cornell notes',
    '9  Looking back: Retrospective',
    '10 Showing UniVerse to a school: Lesson plan',
  ), C.grey, 28);
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
    [60, 40, 360, `Who uses it\n\n${bullets('Students (always free)', 'Teachers and teaching assistants', 'School admins, one school or many', 'Parents, mentors and alumni', 'The owner (you)')}`, C.parent],
    [1800, 40, 360, `On every page\n\n${bullets('13 languages, 2 read right to left', 'Light and dark, Reduce Motion', 'Works on a patchy connection', 'Installs as an app on any phone')}`, C.student],
    [60, 1460, 250, `Where things live\n${bullets('D1 database, R2 files', 'Durable Objects: live rooms', 'Firebase: sign-in')}`, C.tech],
    [1800, 1460, 250, `What it costs to run\n${bullets('Workers Paid: $5 a month', 'A guard pauses at 90%', 'AI with daily allowances')}`, C.tech],
  ];
  corners.forEach(([x, y, h, t, c]) => s.note(x, y, 700, h, t, c, 26));
  return s;
}

// ─── 3 · Kanban: where things stand ─────────────────────────────────────────────────────────────
function whereThingsStand() {
  const s = section('kanban', '3 · Where things stand');
  s.text(0, 0, 'Where things stand (23 Oct 2026)', 36);
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
  return s;
}

// ─── 4 · SWOT ──────────────────────────────────────────────────────────────────────────────────
function swot() {
  const s = section('swot', '4 · Strengths and risks');
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
  const s = section('venn', '5 · Web and phone app');
  s.text(0, 0, 'Website and phone app: what’s the same, what’s different', 36);
  s.raw({ type: 'ellipse', x: 0, y: 80, width: 900, height: 820, backgroundColor: C.student, fillStyle: 'solid', opacity: 55 } as El);
  s.raw({ type: 'ellipse', x: 560, y: 80, width: 900, height: 820, backgroundColor: C.parent, fillStyle: 'solid', opacity: 55 } as El);
  s.text(150, 130, 'Website (a browser)', 30);
  s.text(80, 220, lines('Side menu, big screens', 'Search with ⌘K / Ctrl+K', 'Owner console and admin', '  screens at full size', 'Office editing at full size', 'Drag and drop files', 'Wide tables and charts', 'Keyboard shortcuts'), 22);
  s.text(1000, 130, 'Phone app', 30);
  s.text(1030, 220, lines('Installs from the browser', '  (a web app, “PWA”)', 'Tab bar at the bottom', 'Push notifications', 'Camera: scan, homework photos', 'Pages already opened', '  work without internet', 'Home-screen icon,', '  opens full screen'), 22);
  s.text(640, 300, 'Both', 30);
  s.text(600, 360, lines('One account, same data', 'Live updates', 'Every feature', 'Every language', 'Light and dark mode', 'Reduce Motion', 'Same code: one site', 'Same sign-in'), 22);
  return s;
}

// ─── 6 · Timeline: how it was built ─────────────────────────────────────────────────────────────
function howItWasBuilt() {
  const s = section('timeline', '6 · How it was built');
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
    s.raw({ type: 'ellipse', x: x - 14, y: 366, width: 28, height: 28, backgroundColor: '#7c3aed', fillStyle: 'solid' } as El);
    s.note(x - 170, i % 2 ? 430 : 90, 340, 250, `${when}\n\n${what}`, [C.student, C.teacher, C.admin, C.parent, C.owner, C.tech][i], 17);
    s.note(x - 170, i % 2 ? 90 : 430, 340, 250, why[i], C.white, 16);
  });
  return s;
}

// ─── 7 · Weekly planner: the owner's week ───────────────────────────────────────────────────────
function ownersWeek() {
  const s = section('week', '7 · The owner’s week');
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
  return s;
}

// ─── 8 · Cornell notes: how it works, technically ───────────────────────────────────────────────
function technical() {
  const s = section('cornell', '8 · How it works');
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
  const s = section('retro', '9 · Looking back');
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
  const s = section('lesson', '10 · Showing it to a school');
  s.text(0, 0, 'Lesson plan: showing UniVerse to a new school (45 minutes)', 36);
  s.box(0, 70, 1500, 190, `Learning aims (by the end, the school can…)\n\n${bullets('sign in as a student, teacher and admin', 'find any feature with search', 'set up its first course and class')}`, C.owner, { fontSize: 20 });
  s.box(0, 280, 480, 460, `Starter (10 min)\n\n${bullets('Open the public demo (no account needed)', 'Show a student’s home page and Up next', 'Switch to dark mode and another language')}`, C.admin, { fontSize: 20 });
  s.box(510, 280, 480, 460, `Main activity (25 min)\n\n${bullets('Teacher: make a course, an assignment, a quiz', 'Student: hand it in, try the AI tutor', 'Everyone: a live whiteboard together', 'Admin: attendance and the timetable')}`, C.teacher, { fontSize: 20 });
  s.box(1020, 280, 480, 460, `Plenary (10 min)\n\n${bullets('Show the grades a parent sees', 'Answer questions', 'Agree the next step: an admin account')}`, C.student, { fontSize: 20 });
  s.box(0, 760, 735, 250, `Resources\n\n${bullets('The demo site and its sample data', 'This whiteboard', 'Help pages and the blog')}`, C.grey, { fontSize: 20 });
  s.box(765, 760, 735, 250, `Checking understanding\n\n${bullets('Can they find “Attendance” with search?', 'Can a teacher grade a hand-in alone?', 'Do they know where to ask for help?')}`, C.warm, { fontSize: 20 });
  return s;
}

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

/**
 * The board, packed (the owner: "no room left, information everywhere"): "Start here" as a banner
 * across the top, then two bands. In a band every column is the same height and the band is exactly
 * as wide as the banner, so frames touch with only a thin gap; a column can hold two frames, one
 * above the other. Each frame is scaled as a whole to fit (text keeps its proportions).
 */
export function guideElements(): ExcalidrawElementSkeleton[] {
  const [start, map, kanban, swotS, venn, timeline, week, cornell, retro, lesson] =
    [startHere(), everyFeature(), whereThingsStand(), swot(), webAndApp(), howItWasBuilt(), ownersWeek(), technical(), lookingBack(), demoPlan()];
  const bands: Section[][][] = [[[start]], [[map], [timeline, week], [cornell]], [[kanban], [swotS], [venn], [retro], [lesson]]];
  const PAD = 70, GAP = 60, BAND_GAP = 160;
  const natural = (s: Section) => { const z = size(s); return { w: z.w + PAD * 2, h: z.h + PAD * 2 }; };
  const W = natural(start).w;
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
    y += H + BAND_GAP;
  }
  return out;
}
