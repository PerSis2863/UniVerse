/* eslint-disable @typescript-eslint/no-explicit-any */
// Example data for sample mode. Built once per session with dates relative to "now",
// so deadlines and schedules always look current. Everything here is fictional.

export type Me = { id: string; name: string; email: string; role: string };

const DAY = 86_400_000;
export const at = (days: number, h = 10, m = 0) => {
  const d = new Date(Date.now() + days * DAY);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
let seq = 0;
export const sid = (p = 's') => `sample-${p}-${Date.now().toString(36)}${(seq++).toString(36)}`;

export const LEVELS = [
  { level: 1, title: 'Changemaker Seed', minXP: 0, color: '#6b7280', emoji: '🌱' },
  { level: 2, title: 'Impact Explorer', minXP: 100, color: '#10b981', emoji: '🌿' },
  { level: 3, title: 'Social Innovator', minXP: 300, color: '#3b82f6', emoji: '⚡' },
  { level: 4, title: 'SDG Champion', minXP: 600, color: '#8b5cf6', emoji: '🏅' },
  { level: 5, title: 'Global Catalyst', minXP: 1000, color: '#f59e0b', emoji: '🌍' },
  { level: 6, title: 'Visionary Leader', minXP: 1500, color: '#ef4444', emoji: '🚀' },
  { level: 7, title: 'UniVerse Legend', minXP: 2500, color: '#f97316', emoji: '🌟' },
];
export function levelInfo(xp: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].minXP) i++;
  const current = LEVELS[i];
  const next = LEVELS[i + 1] ?? LEVELS[LEVELS.length - 1];
  const progress = next.minXP > current.minXP ? Math.round(((xp - current.minXP) / (next.minXP - current.minXP)) * 100) : 100;
  return { current, next, progress, xp };
}

export function buildSampleDb(me: Me) {
  const teacherView = me.role === 'TEACHER' || me.role === 'ADMIN';

  // ── People ────────────────────────────────────────────────────────────
  const people = {
    meera: { id: 'sample-u-meera', name: 'Dr. Meera Iyer', email: 'meera.iyer@example.edu', role: 'TEACHER', avatar: null },
    arjun: { id: 'sample-u-arjun', name: 'Prof. Arjun Rao', email: 'arjun.rao@example.edu', role: 'TEACHER', avatar: null },
    kavya: { id: 'sample-u-kavya', name: 'Dr. Kavya Nair', email: 'kavya.nair@example.edu', role: 'TEACHER', avatar: null },
    sam: { id: 'sample-u-sam', name: 'Prof. Sam Wilson', email: 'sam.wilson@example.edu', role: 'TEACHER', avatar: null },
    aarav: { id: 'sample-u-aarav', name: 'Aarav Shah', email: 'aarav.shah@example.edu', role: 'STUDENT', avatar: null },
    zoya: { id: 'sample-u-zoya', name: 'Zoya Khan', email: 'zoya.khan@example.edu', role: 'STUDENT', avatar: null },
    liam: { id: 'sample-u-liam', name: 'Liam Chen', email: 'liam.chen@example.edu', role: 'STUDENT', avatar: null },
    ananya: { id: 'sample-u-ananya', name: 'Ananya Gupta', email: 'ananya.gupta@example.edu', role: 'STUDENT', avatar: null },
    diego: { id: 'sample-u-diego', name: 'Diego Morales', email: 'diego.morales@example.edu', role: 'STUDENT', avatar: null },
    official: { id: 'sample-u-universe', name: 'UniVerse Impact', email: 'hello@universe.example', role: 'ADMIN', avatar: null },
  };
  const classmates = [people.aarav, people.zoya, people.liam, people.ananya, people.diego];
  const meCard = { id: me.id, name: me.name, email: me.email, role: me.role, avatar: null };

  // ── Courses ───────────────────────────────────────────────────────────
  const courses = [
    { id: 'sample-c-os', code: 'CS301', name: 'Operating Systems', credits: 4, department: 'Computer Science', color: '#6366f1', teacher: teacherView ? meCard : people.meera, description: 'Processes, threads, scheduling, memory and file systems.' },
    { id: 'sample-c-env', code: 'ENV210', name: 'Sustainable Development', credits: 3, department: 'Environmental Studies', color: '#10b981', teacher: people.arjun, description: 'The UN SDGs, climate policy and community-led change.' },
    { id: 'sample-c-ds', code: 'CS220', name: 'Data Structures', credits: 4, department: 'Computer Science', color: '#f59e0b', teacher: teacherView ? meCard : people.kavya, description: 'Lists, trees, graphs, hashing and complexity analysis.' },
    { id: 'sample-c-des', code: 'DES150', name: 'Design Thinking', credits: 2, department: 'Design', color: '#ec4899', teacher: people.sam, description: 'Human-centred design, prototyping and critique.' },
  ].map((c) => ({ ...c, status: 'PUBLISHED', emoji: null, teacherId: c.teacher.id }));
  const taught = teacherView ? courses.filter((c) => c.teacher.id === me.id) : [];

  // ── Timetable (0 = Monday) ────────────────────────────────────────────
  const rooms = { a: { id: 'sample-r-a', name: 'Room 402 · CS Block' }, b: { id: 'sample-r-b', name: 'Lecture Hall 2' }, c: { id: 'sample-r-c', name: 'Design Studio' }, lab: { id: 'sample-r-lab', name: 'Lab 3' } };
  const slots: any[] = [];
  const slot = (course: any, day: number, start: string, end: string, type: string, room: any) =>
    slots.push({ id: sid('slot'), courseId: course.id, dayOfWeek: day, startTime: start, endTime: end, type, room, roomId: room.id, course: { id: course.id, name: course.name, code: course.code, color: course.color, emoji: null } });
  const [os, env, ds, des] = courses;
  slot(os, 0, '09:00', '10:30', 'LECTURE', rooms.a); slot(ds, 0, '11:00', '12:30', 'LECTURE', rooms.b);
  slot(env, 1, '10:00', '11:30', 'LECTURE', rooms.b); slot(des, 1, '14:00', '16:00', 'TUTORIAL', rooms.c);
  slot(os, 2, '09:00', '10:30', 'LECTURE', rooms.a); slot(ds, 2, '13:00', '15:00', 'LAB', rooms.lab);
  slot(env, 3, '10:00', '11:30', 'TUTORIAL', rooms.b); slot(os, 3, '14:00', '16:00', 'LAB', rooms.lab);
  slot(ds, 4, '11:00', '12:30', 'LECTURE', rooms.b); slot(des, 4, '15:00', '16:30', 'LECTURE', rooms.c);

  // ── Grades ────────────────────────────────────────────────────────────
  const gradeRows: [any, string, number, number, number, string | null][] = [
    [os, 'Assignment 1 · Process scheduling', 46, 50, -21, 'Clear Gantt charts — watch the round-robin quantum.'],
    [os, 'Quiz 1 · Threads', 17, 20, -14, null],
    [os, 'Midterm exam', 78, 100, -6, 'Strong on paging; revisit deadlock avoidance.'],
    [env, 'SDG case study', 88, 100, -18, 'Excellent use of local data.'],
    [env, 'Policy brief', 36, 50, -4, 'Good argument; cite more primary sources.'],
    [ds, 'Lab 1 · Linked lists', 19, 20, -20, null],
    [ds, 'Assignment 2 · Trees', 41, 50, -9, 'Neat recursion. Add complexity analysis next time.'],
    [ds, 'Quiz 2 · Hashing', 13, 20, -2, null],
    [des, 'Empathy map', 28, 30, -12, 'Great interviews.'],
  ];
  const myGrades = gradeRows.map(([c, name, score, max, days, feedback]) => ({
    id: sid('g'), studentId: me.id, courseId: c.id, assignmentName: name, score, maxScore: max, weight: 1, status: 'GRADED', feedback, gradedAt: at(days, 16), createdAt: at(days, 16),
    course: { id: c.id, name: c.name, code: c.code, credits: c.credits },
  }));
  // Class gradebook (teacher view): a few grades per student per taught course.
  const classGrades: any[] = [];
  for (const c of taught) {
    classmates.forEach((s, i) => {
      [['Assignment 1', 50, -21], ['Midterm exam', 100, -6], ['Lab report', 20, -3]].forEach(([n, max, days], j) => {
        const score = Math.round((max as number) * [0.92, 0.81, 0.74, 0.88, 0.63][(i + j) % 5]);
        classGrades.push({ id: sid('g'), studentId: s.id, courseId: c.id, assignmentName: n, score, maxScore: max, weight: 1, status: 'GRADED', feedback: null, gradedAt: at(days as number, 15), createdAt: at(days as number, 15), student: s });
      });
    });
  }

  // ── Quizzes ───────────────────────────────────────────────────────────
  const q = (question: string, options: string[], correctAnswer: string, points = 1) => ({ id: sid('qq'), question, options, correctAnswer, points });
  const quizzes = [
    { id: 'sample-q-sched', courseId: os.id, title: 'CPU Scheduling', description: 'FCFS, SJF and round-robin.', dueDate: at(3, 23, 59), timeLimit: 15, status: 'PUBLISHED', questions: [
      q('Which algorithm can cause starvation?', ['FCFS', 'Round-robin', 'Shortest Job First', 'None of these'], 'Shortest Job First'),
      q('Round-robin is mainly designed for…', ['Batch systems', 'Time-sharing systems', 'Real-time only', 'Embedded ROMs'], 'Time-sharing systems'),
      q('A very large time quantum makes round-robin behave like…', ['SJF', 'FCFS', 'Priority', 'Multilevel queue'], 'FCFS'),
    ] },
    { id: 'sample-q-sdg', courseId: env.id, title: 'The 17 SDGs', description: 'Quick check on the Sustainable Development Goals.', dueDate: at(6, 23, 59), timeLimit: 10, status: 'PUBLISHED', questions: [
      q('How many Sustainable Development Goals are there?', ['8', '12', '17', '21'], '17'),
      q('SDG 4 is about…', ['Clean water', 'Quality education', 'Zero hunger', 'Life on land'], 'Quality education'),
      q('The SDGs target the year…', ['2025', '2030', '2040', '2050'], '2030'),
    ] },
    { id: 'sample-q-trees', courseId: ds.id, title: 'Binary Search Trees', description: 'Insertion, search and traversal.', dueDate: at(9, 23, 59), timeLimit: 20, status: 'PUBLISHED', questions: [
      q('Average search time in a balanced BST is…', ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'], 'O(log n)'),
      q('Which traversal of a BST gives sorted order?', ['Pre-order', 'In-order', 'Post-order', 'Level-order'], 'In-order'),
    ] },
    { id: 'sample-q-threads', courseId: os.id, title: 'Threads & Concurrency', description: 'Threads, races and locks.', dueDate: at(-8, 23, 59), timeLimit: 15, status: 'CLOSED', questions: [
      q('Threads of the same process share…', ['Stack', 'Registers', 'Heap memory', 'Program counter'], 'Heap memory'),
      q('A race condition happens when…', ['Two threads read a constant', 'Output depends on timing of shared access', 'A thread sleeps', 'A process forks'], 'Output depends on timing of shared access'),
    ] },
    { id: 'sample-q-hash', courseId: ds.id, title: 'Hashing', description: 'Hash functions and collisions.', dueDate: at(-3, 23, 59), timeLimit: 15, status: 'CLOSED', questions: [
      q('Chaining resolves collisions by…', ['Rehashing', 'Linked lists per bucket', 'Probing', 'Resizing only'], 'Linked lists per bucket'),
      q('A good load factor for open addressing stays below…', ['0.1', '0.7', '1.5', '3'], '0.7'),
    ] },
  ].map((qz) => ({ ...qz, questions: qz.questions.map((x, i) => ({ ...x, order: i, quizId: qz.id })) }));
  if (teacherView) quizzes.push({ id: 'sample-q-draft', courseId: taught[0]?.id ?? os.id, title: 'Memory Management (draft)', description: 'Paging and segmentation.', dueDate: at(14, 23, 59), timeLimit: 20, status: 'DRAFT', questions: [] } as any);
  const submissions: Record<string, { score: number; maxScore: number; answers: Record<string, string>; submittedAt: string }> = {};
  const done = (quizId: string, rightCount: number, days: number) => {
    const qz = quizzes.find((x) => x.id === quizId)!;
    const answers: Record<string, string> = {};
    qz.questions.forEach((x, i) => { answers[x.id] = i < rightCount ? x.correctAnswer : x.options.find((o) => o !== x.correctAnswer)!; });
    submissions[quizId] = { score: rightCount, maxScore: qz.questions.length, answers, submittedAt: at(days, 18) };
  };
  if (!teacherView) { done('sample-q-threads', 2, -9); done('sample-q-hash', 1, -4); }

  // ── Blackboard per course ─────────────────────────────────────────────
  const board: Record<string, any> = {};
  const materialsFor: Record<string, [string, string, string, string][]> = {
    [os.id]: [['Week 3 · Process scheduling slides', 'PDF', 'https://en.wikipedia.org/wiki/Scheduling_(computing)', '2.4 MB'], ['Lecture recording · Threads', 'VIDEO', 'https://www.youtube.com/results?search_query=operating+systems+threads+lecture', ''], ['Lab 2 handout', 'DOCX', 'https://en.wikipedia.org/wiki/Thread_(computing)', '310 KB']],
    [env.id]: [['SDG overview deck', 'PDF', 'https://sdgs.un.org/goals', '5.1 MB'], ['Local water-quality dataset', 'OTHER', 'https://en.wikipedia.org/wiki/Water_quality', '1.2 MB']],
    [ds.id]: [['Trees & traversals notes', 'PDF', 'https://en.wikipedia.org/wiki/Binary_search_tree', '1.8 MB'], ['Visualiser: hash tables', 'OTHER', 'https://en.wikipedia.org/wiki/Hash_table', '']],
    [des.id]: [['Empathy map template', 'IMAGE', 'https://en.wikipedia.org/wiki/Empathy_map', '640 KB']],
  };
  for (const c of courses) {
    const teacher = c.teacher;
    board[c.id] = {
      announcements: [
        { id: sid('a'), title: `Welcome to ${c.code}!`, body: `Hi everyone — materials for the first weeks are up. Office hours are Wednesdays 3–4 pm. Reach out on Messages any time.`, createdAt: at(-20, 9), author: { name: teacher.name } },
        { id: sid('a'), title: c.id === os.id ? 'Midterm results are out' : 'Reading for next week', body: c.id === os.id ? 'Average was 74%. Detailed feedback is in your grades. We will review deadlocks on Monday.' : 'Please go through the new items in the reading list before our next session.', createdAt: at(-2, 17), author: { name: teacher.name } },
      ],
      materials: (materialsFor[c.id] ?? []).map(([title, type, fileUrl, size], i) => ({ id: sid('m'), title, type, fileUrl, size: size || null, createdAt: at(-15 + i * 4, 12) })),
      readings: [
        { id: sid('rd'), title: c.id === env.id ? 'Doughnut Economics — Kate Raworth' : 'Operating Systems: Three Easy Pieces', description: 'Chapters 1–4 before the next tutorial.', url: c.id === env.id ? 'https://en.wikipedia.org/wiki/Doughnut_(economic_model)' : 'https://pages.cs.wisc.edu/~remzi/OSTEP/', category: 'Book' },
      ],
      events: [
        { id: sid('ev'), title: c.id === os.id ? 'Lab quiz' : 'Project check-in', description: 'Bring your laptop.', startAt: at(2, 14), endAt: at(2, 15), type: 'MEETING' },
        { id: sid('ev'), title: 'Assignment deadline', description: null, startAt: at(5, 23, 59), endAt: at(5, 23, 59), type: 'DEADLINE' },
        { id: sid('ev'), title: 'End-term exam', description: 'Hall 2 · 2 hours', startAt: at(24, 10), endAt: at(24, 12), type: 'EXAM' },
      ],
    };
  }

  // ── Attendance ────────────────────────────────────────────────────────
  const attendance: any[] = [];
  const pattern = ['PRESENT', 'PRESENT', 'PRESENT', 'LATE', 'PRESENT', 'PRESENT', 'ABSENT', 'PRESENT', 'PRESENT', 'EXCUSED', 'PRESENT', 'PRESENT'];
  courses.forEach((c, ci) => pattern.forEach((status, i) => {
    if ((i + ci) % 5 === 4 && status === 'PRESENT') return;
    attendance.push({ id: sid('at'), studentId: me.id, courseId: c.id, date: at(-(i * 3 + ci), 9), status, note: null, time: '09:00', course: { id: c.id, name: c.name, code: c.code } });
  }));

  // ── Calendar ──────────────────────────────────────────────────────────
  const calendar = [
    { id: sid('ce'), title: 'Study session · OS midterm review', description: 'Library, level 2', startAt: at(1, 17), endAt: at(1, 19), type: 'PERSONAL', color: '#6366f1', courseId: null },
    { id: sid('ce'), title: 'Policy brief due', description: 'ENV210', startAt: at(4, 23, 59), endAt: at(4, 23, 59), type: 'DEADLINE', color: '#f59e0b', courseId: env.id },
    { id: sid('ce'), title: 'Career fair', description: 'Main quad', startAt: at(8, 11), endAt: at(8, 15), type: 'MEETING', color: '#10b981', courseId: null },
  ];

  // ── Messages ──────────────────────────────────────────────────────────
  const msg = (conversationId: string, sender: any, body: string, minutesAgo: number, extra: any = {}) => ({
    id: sid('msg'), conversationId, senderId: sender.id, body, type: 'TEXT', attachmentUrl: null, attachmentName: null, attachmentSize: null, attachmentMime: null, metadata: null,
    createdAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(), editedAt: null, deletedAt: null, replyTo: null, reactions: {}, sender: { id: sender.id, name: sender.name, avatar: null }, ...extra,
  });
  const teacherContact = teacherView ? people.aarav : people.meera;
  const conversations: any[] = [
    { id: 'sample-conv-welcome', isGroup: false, isOfficial: true, title: 'UniVerse Impact', members: [meCard, people.official], messages: [] as any[] },
    { id: 'sample-conv-teacher', isGroup: false, isOfficial: false, title: teacherContact.name, members: [meCard, teacherContact], messages: [] as any[] },
    { id: 'sample-conv-aarav', isGroup: false, isOfficial: false, title: (teacherView ? people.zoya : people.aarav).name, members: [meCard, teacherView ? people.zoya : people.aarav], messages: [] as any[] },
    { id: 'sample-conv-group', isGroup: true, isOfficial: false, title: 'OS Study Group', members: [meCard, people.aarav, people.zoya, people.liam], messages: [] as any[] },
  ];
  conversations[0].messages.push(msg('sample-conv-welcome', people.official, `Welcome to UniVerse, ${me.name.split(' ')[0]}! 👋 This is sample mode — explore freely, nothing here is saved.`, 60 * 30));
  if (teacherView) {
    conversations[1].messages.push(
      msg('sample-conv-teacher', people.aarav, 'Hi! Could you explain question 3 from the midterm?', 180),
      msg('sample-conv-teacher', meCard, 'Of course — it is about deadlock avoidance. Come to office hours on Wednesday?', 170),
      msg('sample-conv-teacher', people.aarav, 'Perfect, see you then 🙏', 165),
    );
  } else {
    conversations[1].messages.push(
      msg('sample-conv-teacher', meCard, 'Hi Dr. Iyer, could I get feedback on my scheduling assignment?', 180),
      msg('sample-conv-teacher', people.meera, 'Sure! Your Gantt charts were great. Check the quantum choice in Q2.', 150),
      msg('sample-conv-teacher', meCard, 'Thank you, I’ll fix it tonight.', 140),
    );
  }
  conversations[2].messages.push(
    msg('sample-conv-aarav', conversations[2].members[1], 'Are you coming to the hackathon on Saturday?', 45),
    msg('sample-conv-aarav', meCard, 'Yes! Want to team up?', 40),
    msg('sample-conv-aarav', conversations[2].members[1], 'Let’s do it 🚀', 38, { reactions: { '❤️': [me.id] } }),
  );
  conversations[3].messages.push(
    msg('sample-conv-group', people.zoya, 'Sharing my notes on paging for Monday 📚', 400),
    msg('sample-conv-group', people.liam, 'Lifesaver, thanks Zoya!', 390),
    msg('sample-conv-group', people.aarav, 'Library at 5 tomorrow?', 25),
  );
  const directory = [people.meera, people.arjun, people.kavya, people.sam, ...classmates];

  // ── Notifications ─────────────────────────────────────────────────────
  const notifications = [
    { id: sid('n'), title: 'CS301: Midterm results are out', body: 'Average was 74%. Detailed feedback is in your grades.', type: 'announcement', read: false, link: teacherView ? '/teacher/blackboard' : '/student/blackboard', createdAt: at(-2, 17) },
    { id: sid('n'), title: 'New quiz: CPU Scheduling', body: 'Due in 3 days · 15 minutes', type: 'quiz', read: false, link: teacherView ? '/teacher/quizzes' : '/student/quizzes', createdAt: at(-1, 9) },
    { id: sid('n'), title: 'Aarav Shah sent you a message', body: 'Let’s do it 🚀', type: 'message', read: true, link: teacherView ? '/teacher/inbox' : '/student/inbox', createdAt: at(0, 8) },
    { id: sid('n'), title: 'Application update', body: 'Green Roots NGO accepted your application.', type: 'impact', read: true, link: '/student/impact/ngo-marketplace', createdAt: at(-5, 12) },
  ];

  // ── Groups ────────────────────────────────────────────────────────────
  const groups = [
    { id: 'sample-grp-os', name: 'OS Study Group', description: 'Weekly revision for CS301.', category: 'Study', isPublic: true, createdAt: at(-30), members: [meCard, people.aarav, people.zoya, people.liam], joined: true },
    { id: 'sample-grp-climate', name: 'Climate Action Club', description: 'Campus clean-ups and climate talks.', category: 'Social', isPublic: true, createdAt: at(-60), members: [people.ananya, people.diego, meCard], joined: true },
    { id: 'sample-grp-hack', name: 'Hackathon Crew', description: 'Building for the spring hackathon.', category: 'Project', isPublic: true, createdAt: at(-10), members: [people.aarav, people.diego], joined: false },
  ];
  const groupPosts: Record<string, any[]> = {
    'sample-grp-os': [
      { id: sid('gp'), body: 'Paging notes are in the files tab 📎', imageUrl: null, createdAt: at(-1, 18), updatedAt: at(-1, 18), author: people.zoya },
      { id: sid('gp'), body: 'Library at 5 tomorrow?', imageUrl: null, createdAt: at(0, 9), updatedAt: at(0, 9), author: people.aarav },
    ],
    'sample-grp-climate': [{ id: sid('gp'), body: 'Beach clean-up this Sunday — 40 volunteers signed up so far! 🌊', imageUrl: null, createdAt: at(-3, 11), updatedAt: at(-3, 11), author: people.ananya }],
    'sample-grp-hack': [{ id: sid('gp'), body: 'Idea board is open — drop your ideas here.', imageUrl: null, createdAt: at(-2, 20), updatedAt: at(-2, 20), author: people.diego }],
  };

  // ── Impact ────────────────────────────────────────────────────────────
  const xp = 420;
  const ngos = { roots: { name: 'Green Roots NGO', sector: 'Environment', isVerified: true }, learn: { name: 'City Learning Trust', sector: 'Education', isVerified: true }, care: { name: 'CareBridge Foundation', sector: 'Health', isVerified: false } };
  const ngoProjects = [
    { id: 'sample-p-tutor', name: 'Weekend Maths Tutoring', description: 'Help secondary-school students with algebra and geometry every Saturday morning.', type: 'Remote', location: 'Online', duration: '8 weeks', openings: 6, impactPoints: 50, skillsRequired: ['Mathematics', 'Teaching', 'Patience'], sdgNumber: 4, deadline: at(12), ngo: ngos.learn, _count: { applications: 11 } },
    { id: 'sample-p-garden', name: 'Community Garden Build', description: 'Design and build raised beds and a rain-water system for a neighbourhood garden.', type: 'On site', location: 'Riverside', duration: '3 weekends', openings: 12, impactPoints: 80, skillsRequired: ['Carpentry', 'Design', 'Teamwork'], sdgNumber: 11, deadline: at(5), ngo: ngos.roots, _count: { applications: 19 } },
    { id: 'sample-p-health', name: 'Health Camp Volunteers', description: 'Register patients and guide families at a free weekend health camp.', type: 'On site', location: 'Community Centre', duration: '2 days', openings: 20, impactPoints: 40, skillsRequired: ['Communication', 'Organisation'], sdgNumber: 3, deadline: at(20), ngo: ngos.care, _count: { applications: 4 } },
    { id: 'sample-p-data', name: 'Water-quality Data Dashboard', description: 'Build a simple dashboard for monthly water-quality readings from local wells.', type: 'Remote', location: 'Online', duration: '6 weeks', openings: 3, impactPoints: 120, skillsRequired: ['Python', 'Data visualisation'], sdgNumber: 6, deadline: at(30), ngo: ngos.roots, _count: { applications: 7 } },
  ].map((p) => ({ ...p, isActive: true, createdAt: at(-14), ngoId: p.ngo.name }));
  const impactActivities = [
    { date: at(-5, 12), title: 'Community Garden Build — day 1', hours: '80 Points Logged', ngo: 'NGO_PROJECT', hash: '0x9f3a…c21e' },
    { date: at(-12, 10), title: 'Weekend Maths Tutoring', hours: '50 Points Logged', ngo: 'NGO_PROJECT', hash: '0x71bd…04aa' },
    { date: at(-19, 15), title: 'Climate summit attendance', hours: '30 Points Logged', ngo: 'SUMMIT', hash: '0x2c88…9f10' },
  ];
  const leaderboard = [
    { ...people.ananya, impactXP: 1280, impactLevel: 5 }, { ...people.diego, impactXP: 930, impactLevel: 4 }, { ...people.zoya, impactXP: 610, impactLevel: 4 },
    { ...meCard, impactXP: xp, impactLevel: 3 }, { ...people.aarav, impactXP: 350, impactLevel: 3 }, { ...people.liam, impactXP: 120, impactLevel: 2 },
  ].map((u) => ({ id: u.id, name: u.name, avatar: null, impactXP: u.impactXP, impactLevel: u.impactLevel, totalPoints: u.impactXP, levelInfo: levelInfo(u.impactXP) }));
  const startups = [
    { id: 'sample-st-solar', name: 'SunShare', description: 'Pay-as-you-go solar kits for rural households, managed from a phone.', sector: 'Clean energy', stage: 'MVP', impactPoints: 100, websiteUrl: null, foundedBy: { id: people.diego.id, name: people.diego.name }, _count: { applications: 5 } },
    { id: 'sample-st-read', name: 'ReadAloud', description: 'An app that pairs volunteer readers with children who are learning to read.', sector: 'EdTech', stage: 'Idea', impactPoints: 60, websiteUrl: null, foundedBy: { id: people.ananya.id, name: people.ananya.name }, _count: { applications: 2 } },
  ].map((s) => ({ ...s, isActive: true, createdAt: at(-20) }));
  const summits = [
    { id: 'sample-sm-youth', title: 'Youth Climate Summit', description: 'Talks and workshops from young climate leaders.', location: 'Main Auditorium', isVirtual: false, startDate: at(10, 9), endDate: at(10, 17), capacity: 300, impactPoints: 30, coverUrl: null, _count: { registrations: 184 } },
    { id: 'sample-sm-ai', title: 'AI for Social Good', description: 'How AI is being used in health, education and agriculture.', location: 'Online', isVirtual: true, startDate: at(17, 15), endDate: at(17, 18), capacity: null, impactPoints: 20, coverUrl: null, _count: { registrations: 512 } },
  ];
  const credentials = [
    { id: 'sample-cred-1', certificateCode: 'UNV-SAMPLE-7F3A', title: 'Community Tutor', projectName: 'Weekend Maths Tutoring', organization: 'City Learning Trust', hoursCompleted: 24, peopleImpacted: 18, description: 'Tutored secondary students in algebra over 8 weeks.', evidenceUrl: null, status: 'ISSUED', blockchainHash: '9f3ac21e7b0d4c55a1e2f09b3d6c7a8e', signature: 'sample', signingKeyId: 'sample', verifiedByName: 'Prof. Arjun Rao', requestedAt: at(-30), issuedAt: at(-26), revokedAt: null, revokedReason: null, verifyUrl: null, blockchain: null },
    { id: 'sample-cred-2', certificateCode: 'UNV-SAMPLE-2B91', title: 'Garden Builder', projectName: 'Community Garden Build', organization: 'Green Roots NGO', hoursCompleted: 16, peopleImpacted: 120, description: 'Built raised beds and a rain-water system.', evidenceUrl: null, status: 'PENDING', blockchainHash: null, signature: null, signingKeyId: null, verifiedByName: null, requestedAt: at(-3), issuedAt: null, revokedAt: null, revokedReason: null, verifyUrl: null, blockchain: null },
  ];

  // ── Careers & campus ──────────────────────────────────────────────────
  const companies = {
    nova: { id: 'sample-co-nova', name: 'Nova Labs', sector: 'Software', description: 'Developer tools for education.', logoUrl: null, websiteUrl: null, location: 'Bengaluru' },
    terra: { id: 'sample-co-terra', name: 'TerraWorks', sector: 'Climate tech', description: 'Satellite data for farmers.', logoUrl: null, websiteUrl: null, location: 'Remote' },
    civic: { id: 'sample-co-civic', name: 'CivicAI', sector: 'Public sector', description: 'AI tools for city services.', logoUrl: null, websiteUrl: null, location: 'Pune' },
  };
  const internships = [
    { id: 'sample-in-fe', title: 'Frontend Developer Intern', description: 'Build accessible React components used by 200k students.', location: 'Bengaluru · Hybrid', duration: '3 months', isPaid: true, salary: '₹25,000 / month', openings: 2, deadline: at(14), startDate: at(40), isActive: true, type: 'FULL_TIME', company: companies.nova },
    { id: 'sample-in-data', title: 'Data Analyst Intern', description: 'Analyse crop-health data and build dashboards for farmers.', location: 'Remote', duration: '6 months', isPaid: true, salary: '₹20,000 / month', openings: 1, deadline: at(9), startDate: at(30), isActive: true, type: 'REMOTE', company: companies.terra },
    { id: 'sample-in-research', title: 'Research Intern · Responsible AI', description: 'Help evaluate fairness in public-service chatbots.', location: 'Pune', duration: '10 weeks', isPaid: false, salary: null, openings: 3, deadline: at(21), startDate: at(45), isActive: true, type: 'PART_TIME', company: companies.civic },
  ].map((i) => ({ ...i, companyId: i.company.id, createdAt: at(-7) }));
  const myApplications = [{ id: sid('ia'), internshipId: 'sample-in-data', studentId: me.id, status: 'REVIEWING', coverLetter: 'I love working with real-world data…', cvUrl: null, appliedAt: at(-4), updatedAt: at(-2), internship: internships[1] }];
  const placements = [{ id: sid('pl'), updatedAt: at(-120), internship: { title: 'Summer Intern · Web', location: 'Remote', type: 'REMOTE', duration: '8 weeks', startDate: at(-180), company: { name: 'Nova Labs', logoUrl: null, sector: 'Software' } } }];
  const partners = [
    { id: 'sample-pa-1', name: 'City Learning Trust', type: 'NGO', description: 'After-school learning for 3,000 children.', websiteUrl: null, logoUrl: null, country: 'India' },
    { id: 'sample-pa-2', name: 'Nova Labs', type: 'COMPANY', description: 'Internships and mentoring for CS students.', websiteUrl: null, logoUrl: null, country: 'India' },
    { id: 'sample-pa-3', name: 'Green Roots NGO', type: 'NGO', description: 'Urban greening and water projects.', websiteUrl: null, logoUrl: null, country: 'India' },
  ];
  const skills = [
    { id: sid('sk'), userId: me.id, name: 'Python', category: 'Technical', level: 'ADVANCED', endorsements: 4, createdAt: at(-40) },
    { id: sid('sk'), userId: me.id, name: 'React', category: 'Technical', level: 'INTERMEDIATE', endorsements: 2, createdAt: at(-30) },
    { id: sid('sk'), userId: me.id, name: 'Public speaking', category: 'Soft skill', level: 'INTERMEDIATE', endorsements: 3, createdAt: at(-20) },
    { id: sid('sk'), userId: me.id, name: 'Teamwork', category: 'Soft skill', level: 'EXPERT', endorsements: 6, createdAt: at(-10) },
  ];
  const tickets = [
    { id: sid('t'), subject: 'Wi-Fi not working in Hostel B', description: 'The network drops every evening after 9 pm.', category: 'IT', status: 'IN_PROGRESS', priority: 'MEDIUM', createdAt: at(-3), updatedAt: at(-1) },
    { id: sid('t'), subject: 'Library card replacement', description: 'Lost my card, need a new one.', category: 'Library', status: 'RESOLVED', priority: 'LOW', createdAt: at(-15), updatedAt: at(-12) },
  ];
  const associations = [
    { id: 'sample-as-robo', name: 'Robotics Society', description: 'Build robots, compete nationally.', category: 'Technology', members: 64, _count: { memberships: 64 }, createdAt: at(-200) },
    { id: 'sample-as-debate', name: 'Debate Union', description: 'Weekly debates and inter-college tournaments.', category: 'Academic', members: 41, _count: { memberships: 41 }, createdAt: at(-300) },
    { id: 'sample-as-music', name: 'Music Collective', description: 'Jam sessions, open mics and the annual concert.', category: 'Arts', members: 88, _count: { memberships: 88 }, createdAt: at(-250) },
  ];
  const myMemberships = [{ id: sid('am'), associationId: 'sample-as-robo', userId: me.id, role: 'MEMBER', status: 'APPROVED', association: associations[0] }];
  const knowledge = [
    { id: sid('kh'), title: 'How to write a great lab report', description: null, category: 'Study skills', url: 'https://en.wikipedia.org/wiki/Laboratory_report', isPublic: true, createdAt: at(-12), author: { name: people.kavya.name, email: people.kavya.email }, course: null },
    { id: sid('kh'), title: 'SDG data explorer', description: null, category: 'Research', url: 'https://sdgs.un.org/goals', isPublic: true, createdAt: at(-8), author: { name: people.arjun.name, email: people.arjun.email }, course: null },
  ];
  const documents = [
    { id: sid('doc'), title: 'Enrollment certificate', type: 'CERTIFICATE', fileUrl: 'https://en.wikipedia.org/wiki/Certificate', createdAt: at(-60), isVerified: true },
    { id: sid('doc'), title: 'Semester 3 transcript', type: 'TRANSCRIPT', fileUrl: 'https://en.wikipedia.org/wiki/Transcript_(education)', createdAt: at(-20), isVerified: true },
  ];
  const scholarships = [
    { id: 'sample-sch-merit', name: 'Merit Scholarship 2026', provider: 'University Trust', amount: 50000, description: 'For students with an average above 85%.', deadline: at(18), requirements: 'Transcript, one reference letter.' },
    { id: 'sample-sch-green', name: 'Green Futures Grant', provider: 'TerraWorks', amount: 30000, description: 'For students leading climate projects.', deadline: at(35), requirements: 'Project summary (500 words).' },
  ];
  const myScholarships = [{ id: sid('sa'), scholarshipId: 'sample-sch-green', status: 'PENDING', appliedAt: at(-6), scholarship: scholarships[1] }];

  const campusItems = [
    { id: sid('ci'), kind: 'SERVICE', category: 'Health', title: 'Campus Health Centre', description: 'Walk-in consultations and first aid.', url: null, location: 'Block C, ground floor', hours: 'Mon–Sat 8am–8pm', startAt: null },
    { id: sid('ci'), kind: 'SERVICE', category: 'Food', title: 'Central Cafeteria', description: 'Meals, snacks and coffee.', url: null, location: 'Student Centre', hours: 'Daily 7am–10pm', startAt: null },
    { id: sid('ci'), kind: 'LINK', category: 'Academics', title: 'Library catalogue', description: null, url: 'https://openlibrary.org', location: null, hours: null, startAt: null },
    { id: sid('ci'), kind: 'LINK', category: 'Wellbeing', title: 'Counselling booking', description: null, url: 'https://en.wikipedia.org/wiki/Student_counselling', location: null, hours: null, startAt: null },
    { id: sid('ci'), kind: 'EVENT', category: null, title: 'Freshers’ Welcome Night', description: 'Music, food and clubs fair.', url: null, location: 'Main Quad', hours: null, startAt: at(6, 18) },
    { id: sid('ci'), kind: 'EVENT', category: null, title: 'Guest lecture: Future of Energy', description: null, url: null, location: 'Lecture Hall 2', hours: null, startAt: at(11, 16) },
  ];

  const profile = {
    name: me.name, email: me.email, phone: '+91 98765 43210', role: me.role, status: 'ACTIVE', department: 'Computer Science', memberSince: at(-400),
    emergencyContacts: [{ name: 'Priya Sharma', relation: 'Mother', phone: '+91 98765 11111', email: '' }],
  };

  return {
    me, meCard, teacherView, people, classmates, directory, courses, taught, slots, myGrades, classGrades, quizzes, submissions, board, attendance, calendar,
    conversations, notifications, groups, groupPosts, xp, ngoProjects, impactActivities, leaderboard, startups, summits, summitRegs: ['sample-sm-youth'],
    credentials, internships, myApplications, placements, partners, skills, tickets, associations, myMemberships, knowledge, documents, scholarships, myScholarships,
    campusItems, profile,
  };
}

export type SampleDb = ReturnType<typeof buildSampleDb>;
