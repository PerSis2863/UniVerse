/* eslint-disable @typescript-eslint/no-explicit-any */
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth';
import { buildSampleDb, levelInfo, LEVELS, sid, at, type SampleDb } from './data';
import { sampleAsk, sampleMetric } from './analytics';
import { isMetricId } from '@/lib/school-metrics';
import { answerText, cleanQuestionInput, forStudent, markAnswer, metaOf, typeOf } from '@/lib/question-types';
import { DEFAULT_PREFS, GROUP_OF_TYPE, NOTE_GROUPS } from '@/lib/notify-prefs';
import { builtInQuestions, countFillers, lengthAdvice, starParts, wordCount } from '@/lib/careers';
import { carbonSummary, kgFor, activityOf } from '@/lib/carbon';
import { budgetSummary, dishesOf, prepList, tally } from '@/lib/student-life';

// Answers the app's API requests from example data while sample mode is on.
// GETs without a sample answer fall through to the real server (read-only);
// writes never reach the server — they update the in-memory sample data instead.

let db: SampleDb | null = null;
let dbKey = '';

function getDb(): SampleDb {
  const u = useAuthStore.getState().user;
  const me = { id: u?.id ?? 'sample-me', name: u?.name ?? 'You', email: u?.email ?? 'you@example.edu', role: u?.role ?? 'STUDENT' };
  const key = `${me.id}:${me.role}`;
  if (!db || key !== dbKey) { db = buildSampleDb(me); dbKey = key; }
  return db;
}
export function resetSampleDb() { db = null; }

/** Sample payments for pages that load transactions through a server action. */
export function sampleTransactions(onlyMine = false) {
  const d = getDb();
  return onlyMine ? d.transactions.filter((t) => t.user.id === d.people.aarav.id).map((t) => ({ ...t, user: { id: d.me.id, name: d.me.name, email: d.me.email } })) : d.transactions;
}

type Ctx = { db: SampleDb; m: RegExpMatchArray; q: URLSearchParams; body: any };
type Result = { status: number; data: any };
const ok = (data: any, status = 200): Result => ({ status, data });
const fail = (error: string, status = 400): Result => ({ status, data: { error, message: error } });

const pct = (s: number, m: number) => (m > 0 ? (s / m) * 100 : 0);
const course = (d: SampleDb, id: string) => d.courses.find((c) => c.id === id);
const counts = (d: SampleDb, id: string) => ({ materials: d.board[id]?.materials.length ?? 0, quizzes: d.quizzes.filter((x) => x.courseId === id).length });


const SAMPLE_TIME_BANK_LEDGER = {
  account: {
    id: 'acc_sample_student',
    userId: 'usr_student',
    balanceCredits: 4,
    creditsEarned: 6,
    creditsSpent: 2,
    sessionsCompletedAsTutor: 3,
    sessionsCompletedAsLearner: 2,
    totalMinutesTutored: 60,
    averageRating: 4.9,
    ratingsCount: 3,
  },
  transactions: [
    {
      id: 'tx_tutoring_3',
      amount: 1,
      balanceAfter: 4,
      type: 'SESSION_EARNED',
      description: 'Earned 1 Time Credit for peer tutoring on: Binary Search Trees',
      createdAt: '2026-10-12T14:30:00Z',
    },
    {
      id: 'tx_tutoring_2',
      amount: -1,
      balanceAfter: 3,
      type: 'SESSION_SPENT',
      description: 'Reserved 20-min peer tutoring on: Organic Chemistry Mechanisms',
      createdAt: '2026-10-11T10:15:00Z',
    },
    {
      id: 'tx_tutoring_1',
      amount: 3,
      balanceAfter: 3,
      type: 'INITIAL_GRANT',
      description: 'Welcome to UniVerse Peer Tutoring Time-Bank: 3 starter credits',
      createdAt: '2026-10-01T08:00:00Z',
    },
  ],
};

const SAMPLE_TUTORS = [
  {
    id: 'prof_tutor_1',
    userId: 'usr_alex',
    name: 'Alex Chen',
    email: 'alex.chen@universe.edu',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&h=128&fit=crop',
    headline: 'Senior CS Major · Algorithms TA & Math Enthusiast',
    bio: 'Passionate about simplifying complex recursive paradigms and helping peers ace midterm problem sets.',
    badgeIssued: true,
    badgeIssuedAt: '2026-10-05T12:00:00Z',
    subjects: [
      {
        courseId: 'c_ds',
        courseName: 'Data Structures & Algorithms',
        courseCode: 'CS201',
        conceptName: 'Dynamic Programming & Graphs',
        masteryLevel: 0.95,
        band: 'mastered',
        verifiedByD1: true,
      },
      {
        courseId: 'c_math',
        courseName: 'Discrete Mathematics',
        courseCode: 'MATH150',
        conceptName: 'Induction & Graph Theory',
        masteryLevel: 0.92,
        band: 'mastered',
        verifiedByD1: true,
      },
    ],
    stats: {
      averageRating: 4.9,
      ratingsCount: 14,
      sessionsCompletedAsTutor: 14,
      totalMinutesTutored: 280,
    },
    nextAvailableSlot: {
      id: 'slot_sample_1',
      startTime: '15:00',
      endTime: '15:20',
      date: '2026-10-15',
    },
  },
  {
    id: 'prof_tutor_2',
    userId: 'usr_maya',
    name: 'Maya Patel',
    email: 'maya.patel@universe.edu',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=128&h=128&fit=crop',
    headline: 'Biochemistry Honors · Organic Chemistry Specialist',
    bio: 'I break down reaction mechanisms step-by-step with visual diagrams and practice flashcards.',
    badgeIssued: true,
    badgeIssuedAt: '2026-10-08T15:00:00Z',
    subjects: [
      {
        courseId: 'c_chem',
        courseName: 'Organic Chemistry II',
        courseCode: 'CHEM220',
        conceptName: 'Carbonyl Condensations & NMR',
        masteryLevel: 0.94,
        band: 'mastered',
        verifiedByD1: true,
      },
    ],
    stats: {
      averageRating: 5.0,
      ratingsCount: 8,
      sessionsCompletedAsTutor: 8,
      totalMinutesTutored: 160,
    },
    nextAvailableSlot: {
      id: 'slot_sample_2',
      startTime: '16:30',
      endTime: '16:50',
      date: '2026-10-16',
    },
  },
];

const SAMPLE_MASTERED_SUBJECTS = [
  {
    courseId: 'c_ds',
    courseName: 'Data Structures & Algorithms',
    courseCode: 'CS201',
    conceptName: 'Dynamic Programming & Graphs',
    masteryLevel: 0.95,
    band: 'mastered',
    verifiedByD1: true,
  },
  {
    courseId: 'c_math',
    courseName: 'Discrete Mathematics',
    courseCode: 'MATH150',
    conceptName: 'Combinatorics & Induction',
    masteryLevel: 0.91,
    band: 'mastered',
    verifiedByD1: true,
  },
];

const SAMPLE_TUTOR_SLOTS = [
  {
    id: 'slot_sample_1',
    tutorId: 'usr_alex',
    dayOfWeek: 2,
    startTime: '15:00',
    endTime: '15:20',
    date: '2026-10-15',
    isBooked: false,
  },
  {
    id: 'slot_sample_2',
    tutorId: 'usr_alex',
    dayOfWeek: 4,
    startTime: '16:00',
    endTime: '16:20',
    date: '2026-10-17',
    isBooked: false,
  },
];

const SAMPLE_TUTOR_SESSIONS = [
  {
    id: 'sess_sample_1',
    tutorId: 'usr_alex',
    learnerId: 'usr_student',
    topic: 'Graph Traversal & Dijkstra Algorithm',
    conceptName: 'Graphs & BFS/DFS',
    scheduledAt: '2026-10-15T15:00:00Z',
    durationMinutes: 20,
    status: 'SCHEDULED',
    callRoomId: 'peer_tutoring_alex_demo',
    callDurationSeconds: 0,
    callVerified: false,
    learnerRating: null,
    learnerFeedback: null,
    feedbackTags: [],
    tutorNotes: 'Bring your recent homework questions.',
    tutor: { id: 'usr_alex', name: 'Alex Chen', email: 'alex.chen@universe.edu', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&h=128&fit=crop' },
    learner: { id: 'usr_student', name: 'Demo Student', email: 'student@universe.edu', avatar: null },
    course: { id: 'c_ds', name: 'Data Structures & Algorithms', code: 'CS201' },
  },
  {
    id: 'sess_sample_2',
    tutorId: 'usr_maya',
    learnerId: 'usr_student',
    topic: 'Aldol Condensations Walkthrough',
    conceptName: 'Enolates',
    scheduledAt: '2026-10-09T14:00:00Z',
    durationMinutes: 20,
    status: 'COMPLETED',
    callRoomId: 'peer_tutoring_maya_demo',
    callDurationSeconds: 1210,
    callVerified: true,
    learnerRating: 5,
    learnerFeedback: 'Super clear explanations, made arrow pushing intuitive!',
    feedbackTags: ['Clear explanations', 'Patient', 'Great examples'],
    tutorNotes: 'Reviewed aldol addition vs condensation dehydration steps.',
    tutor: { id: 'usr_maya', name: 'Maya Patel', email: 'maya.patel@universe.edu', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=128&h=128&fit=crop' },
    learner: { id: 'usr_student', name: 'Demo Student', email: 'student@universe.edu', avatar: null },
    course: { id: 'c_chem', name: 'Organic Chemistry II', code: 'CHEM220' },
  },
];

const SAMPLE_IMPACT_POOLS = [
  {
    id: 'pool_sample_1',
    organizationId: 'org_sample',
    title: 'Clean Energy & Climate Innovation Fellowship',
    sponsorName: 'Global EcoTech Foundation',
    sponsorType: 'NGO',
    description: 'Empowers students with verified environmental volunteering and clean energy credentials.',
    totalAmount: 25000,
    allocatedAmount: 5000,
    currency: 'USD',
    creditCostPerAward: 40,
    awardAmountPerStudent: 2500,
    minGpa: 3.2,
    status: 'ACTIVE',
    remainingAmount: 20000,
    remainingAwards: 8,
    studentBalance: 75,
    isEligible: true,
  },
  {
    id: 'pool_sample_2',
    organizationId: 'org_sample',
    title: 'Underrepresented Tech Leaders Grant',
    sponsorName: 'Google DeepMind Philanthropy',
    sponsorType: 'CORPORATE',
    description: 'Recognizes community peer tutoring and digital inclusion volunteering.',
    totalAmount: 50000,
    allocatedAmount: 15000,
    currency: 'USD',
    creditCostPerAward: 50,
    awardAmountPerStudent: 5000,
    minGpa: 3.4,
    status: 'ACTIVE',
    remainingAmount: 35000,
    remainingAwards: 7,
    studentBalance: 75,
    isEligible: true,
  },
  {
    id: 'pool_sample_3',
    organizationId: 'org_sample',
    title: 'Alumni Civic Impact Memorial Award',
    sponsorName: 'Class of 2004 Alumni Endowment',
    sponsorType: 'ALUMNI',
    description: 'Supports students dedicated to local humanitarian and community health service.',
    totalAmount: 15000,
    allocatedAmount: 12000,
    currency: 'USD',
    creditCostPerAward: 30,
    awardAmountPerStudent: 1500,
    minGpa: 3.0,
    status: 'ACTIVE',
    remainingAmount: 3000,
    remainingAwards: 2,
    studentBalance: 75,
    isEligible: true,
  },
];

const SAMPLE_IMPACT_CLAIMS = [
  {
    id: 'claim_sample_1',
    poolId: 'pool_sample_1',
    studentId: 'u_student_me',
    creditsRedeemed: 40,
    awardAmount: 2500,
    currency: 'USD',
    studentGpa: 3.72,
    academicStanding: 'HONORS',
    status: 'APPROVED',
    rejectionReason: null,
    qrVerificationToken: 'uv_sch_9f82ab7c10d34e',
    claimSignature: '8a9b23c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2',
    createdAt: '2026-10-10T14:30:00.000Z',
    pool: {
      title: 'Clean Energy & Climate Innovation Fellowship',
      sponsorName: 'Global EcoTech Foundation',
      sponsorType: 'NGO',
    },
  },
];

const SAMPLE_IMPACT_LEDGER = {
  currentBalance: 75,
  totalTransactions: 2,
  isChainValid: true,
  ledger: [
    {
      id: 'cr_1',
      actionType: 'VOLUNTEER_HOURS',
      credits: 40,
      balanceAfter: 40,
      description: '16 verified hours with Local Food Rescue initiative',
      previousHash: 'GENESIS',
      hash: '3a1f8e2b7c4d5e6a9f0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f',
      createdAt: '2026-09-15T09:00:00.000Z',
    },
    {
      id: 'cr_2',
      actionType: 'CREDENTIAL_ISSUED',
      credits: 35,
      balanceAfter: 75,
      description: 'Issued credential: UN SDG 7 Clean Energy Field Leader',
      previousHash: '3a1f8e2b7c4d5e6a9f0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f',
      hash: '7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a1f8e2b7c4d5e6a9f0b1c2d3e4f5a6b',
      createdAt: '2026-10-01T11:00:00.000Z',
    },
  ],
};

// Stage 5 · Q15: careers in sample mode: the tracker, practice answers, mentors and bookings, kept
// in this tab only (the people are the sample's fictional ones).
type SampleCareers = { apps: any[]; answers: any[]; alerts: boolean; profile: any; slots: any[]; bookings: any[]; mentors: any[] };
const careers = (d: SampleDb) => ((d as SampleDb & { careers?: SampleCareers }).careers ??= {
  apps: [
    { id: 'sample-app-1', title: 'Data analyst intern', company: 'Nova Labs', url: null, location: 'Remote', stage: 'INTERVIEW', onUniverse: true, appliedAt: at(-9), nextStep: 'Video interview', nextAt: at(2, 15), notes: 'Ask about the team’s data stack. Prepare the survey-cleaning project as an example.', documents: [{ name: 'CV.pdf', url: 'https://example.com/cv.pdf' }], updatedAt: at(-1) },
    { id: 'sample-app-2', title: 'Junior web developer (summer)', company: 'Brightside Studio', url: 'https://example.com/jobs/42', location: 'Bengaluru', stage: 'APPLIED', onUniverse: false, appliedAt: at(-4), nextStep: 'Follow-up email', nextAt: at(5, 10), notes: null, documents: [], updatedAt: at(-4) },
    { id: 'sample-app-3', title: 'Research assistant', company: 'Blue Earth', url: null, location: 'Hybrid', stage: 'SAVED', onUniverse: false, appliedAt: null, nextStep: null, nextAt: null, notes: 'Deadline end of month.', documents: [], updatedAt: at(-2) },
  ],
  answers: [],
  alerts: true,
  profile: null,
  slots: [],
  bookings: [],
  mentors: [
    { id: 'sample-mentor-1', company: 'Nova Labs', jobTitle: 'Data scientist', skills: ['Python', 'SQL', 'Interviews'], isAlumni: true, gradYear: 2021, bio: 'Studied CS here, then moved into data. Happy to talk about first internships and technical interviews.', user: { id: 'sample-u-priya', name: 'Priya Menon', avatar: null, role: 'STUDENT' }, slots: [{ id: 'sample-slot-1', startAt: at(3, 17), minutes: 30 }, { id: 'sample-slot-2', startAt: at(10, 17), minutes: 30 }] },
    { id: 'sample-mentor-2', company: 'UniVerse University', jobTitle: 'Careers lead', skills: ['CVs', 'Cover letters'], isAlumni: false, gradYear: null, bio: 'I help students turn coursework and volunteering into a strong CV.', user: { id: d.people.meera.id, name: d.people.meera.name, avatar: null, role: 'TEACHER' }, slots: [{ id: 'sample-slot-3', startAt: at(1, 11), minutes: 15 }] },
  ],
});
const mentoringView = (c: SampleCareers) => ({ profile: c.profile, slots: c.slots, bookings: c.bookings });

// Stage 5 · Q16: global impact in sample mode: donations, the volunteering map with UN goals, and a
// club's carbon tracker (kept in this tab only).
type SampleImpact = { carbon: any[] };
const impactQ16 = (d: SampleDb) => ((d as SampleDb & { q16?: SampleImpact }).q16 ??= {
  carbon: [
    { id: 'sample-co2-1', activity: 'bus', quantity: 720, kgCo2e: kgFor('bus', 720), note: 'Bus to the beach clean-up, 24 people × 30 km', occurredAt: at(-12), by: 'Zoya Khan', canDelete: false },
    { id: 'sample-co2-2', activity: 'diesel-generator', quantity: 12, kgCo2e: kgFor('diesel-generator', 12), note: 'Generator at the night market stall', occurredAt: at(-30), by: 'Aarav Shah', canDelete: false },
    { id: 'sample-co2-3', activity: 'walk-cycle', quantity: 40, kgCo2e: kgFor('walk-cycle', 40), note: 'Cycled to the tree planting', occurredAt: at(-5), by: 'Liam Chen', canDelete: false },
  ],
});
const carbonView = (d: SampleDb) => {
  const rows = impactQ16(d).carbon.map((e) => ({ ...e, label: activityOf(e.activity)?.label ?? e.activity, unit: activityOf(e.activity)?.unit ?? '', saving: !!activityOf(e.activity)?.saving }));
  return { club: { id: 'sample-club', name: 'Green Campus Club' }, canLog: true, entries: rows, summary: carbonSummary(rows) };
};
// Stage 5 · Q17: student life in sample mode: a club's elections and budget, the campus board and
// cafeteria pre-orders (kept in this tab only).
type SampleLife = { orders: any[] };
const lifeQ17 = (d: SampleDb) => ((d as SampleDb & { q17?: SampleLife }).q17 ??= { orders: [] });
const SAMPLE_CANDIDATES = [{ id: 'c1', name: 'Zoya Khan' }, { id: 'c2', name: 'Aarav Shah' }, { id: 'c3', name: 'Liam Chen' }];
const sampleElections = () => {
  const ballots = [['QK7M-2XPA-9DTE', 'c1'], ['B4RT-77QA-MMXP', 'c2'], ['H2NC-QW8E-KK3D', 'c1'], ['ZP9A-4RRT-DQ2M', 'c1'], ['M3XE-T7QP-6RAB', 'c3']].map(([receipt, choice]) => ({ receipt, choice }));
  return {
    club: { id: 'sample-as-robo', name: 'Robotics Club' }, member: true, runs: false, members: 18,
    elections: [
      { id: 'sample-el-open', title: 'Treasurer 2026', candidates: SAMPLE_CANDIDATES.slice(0, 2), opensAt: at(-1), closesAt: at(2, 18), state: 'OPEN', voted: false, turnout: 7, results: null },
      { id: 'sample-el-done', title: 'President 2026', candidates: SAMPLE_CANDIDATES, opensAt: at(-20), closesAt: at(-14, 18), state: 'CLOSED', voted: true, turnout: 5,
        results: { ...tally(SAMPLE_CANDIDATES, ballots), ballots, fingerprint: 'sample: open a real club to check a real fingerprint' } },
    ],
  };
};
const sampleBudget = () => {
  const entries = [
    { id: 'sample-b1', kind: 'EXPENSE', amount: 420_000, description: 'Motor kits for the line-follower workshop', occurredAt: at(-9), receiptUrl: null, by: 'Zoya Khan' },
    { id: 'sample-b2', kind: 'INCOME', amount: 250_000, description: 'Sponsorship from Nova Labs', occurredAt: at(-16), receiptUrl: null, by: 'Zoya Khan' },
    { id: 'sample-b3', kind: 'EXPENSE', amount: 60_000, description: 'Posters for the club fair', occurredAt: at(-30), receiptUrl: null, by: 'Aarav Shah' },
  ];
  return { club: { id: 'sample-as-robo', name: 'Robotics Club' }, runs: false, canSetBudget: false, summary: budgetSummary(1_500_000, entries), entries };
};
const sampleBoard = (d: SampleDb, section: string, mine: boolean) => {
  const p = d.people;
  const all = [
    { id: 'sample-l1', kind: 'SELL', title: 'Calculus: Early Transcendentals (8th ed.)', description: 'A few pencil notes, otherwise like new.', category: 'Books', price: 45_000, user: p.zoya },
    { id: 'sample-l2', kind: 'FREE', title: 'Desk lamp', description: 'Works fine; I’m moving out.', category: 'Furniture', price: null, user: p.liam },
    { id: 'sample-l3', kind: 'SWAP', title: 'Arduino Uno for a Raspberry Pi Zero', description: null, category: 'Electronics', price: null, user: p.aarav },
    { id: 'sample-l4', kind: 'RIDE_OFFER', title: 'Campus to the airport', fromPlace: 'Main gate', toPlace: 'Airport T2', departAt: at(3, 6, 30), seats: 3, price: 30_000, user: p.ananya },
    { id: 'sample-l5', kind: 'RIDE_WANT', title: 'Weekend ride to the city centre', fromPlace: 'Hostel B', toPlace: 'City centre', departAt: at(5, 10), price: null, user: p.diego },
    { id: 'sample-l6', kind: 'ROOM_OFFER', title: 'Room in a 3-bed flat near Gate 2', description: 'Furnished, Wi-Fi included, 10 minutes’ walk.', area: 'Koramangala', price: 1_200_000, availableFrom: at(14), user: p.zoya },
  ].map((l) => ({ description: null, category: null, photoUrl: null, fromPlace: null, toPlace: null, departAt: null, seats: null, area: null, availableFrom: null, status: 'ACTIVE', expiresAt: at(50), createdAt: at(-2), mine: false, reported: false, ...l, user: { id: l.user.id, name: l.user.name, avatar: null } }));
  const kinds: Record<string, string[]> = { market: ['SELL', 'SWAP', 'FREE', 'WANTED'], rides: ['RIDE_OFFER', 'RIDE_WANT'], housing: ['ROOM_OFFER', 'ROOM_WANT'] };
  return { section, listings: mine ? [] : all.filter((l) => (kinds[section] ?? kinds.market).includes(l.kind)) };
};
const sampleMeals = (d: SampleDb) => ({
  menus: d.campusItems.filter((c) => c.kind === 'MENU' && c.startAt && new Date(c.startAt).getTime() > Date.now() - 13 * 3_600_000 && new Date(c.startAt).getTime() < Date.now() + 37 * 3_600_000)
    .map((c) => ({ id: c.id, title: c.title, category: c.category, location: c.location, startAt: c.startAt, dishes: dishesOf(c.description) })),
  orders: lifeQ17(d).orders,
});

// Stage 5 · D18: skills match on the Internships page.
const SAMPLE_SKILLS_MATCH = {
  skills: [
    { key: 'python', label: 'Python', level: 'Advanced', count: 3 },
    { key: 'sql', label: 'SQL', level: 'Proficient', count: 2 },
    { key: 'teamwork', label: 'Teamwork', level: null, count: 1 },
  ],
  opportunities: [
    {
      kind: 'INTERNSHIP', id: 'int_sample_1', title: 'Data analyst intern', org: 'Nova Labs', location: 'Remote', deadline: '2026-11-30T00:00:00.000Z', applied: false,
      match: { matched: [{ skill: 'Python', level: 'Advanced', evidence: 3 }, { skill: 'SQL', level: 'Proficient', evidence: 2 }, { skill: 'Teamwork', level: null, evidence: 1 }], missing: ['Data visualisation'], percent: 75 },
      gaps: [{ skill: 'Data visualisation', module: { courseId: 'c_cs101', courseCode: 'CS101', courseName: 'Introduction to Computer Science', moduleTitle: 'Data visualisation', enrolled: true }, tutors: [{ userId: 'u_tutor', name: 'Asha Rao' }] }],
      summary: 'You match 3 of 4 skills; finish ‘Data visualisation’ in CS101 to match all.',
    },
    {
      kind: 'PROJECT', id: 'ngo_sample_1', title: 'Clean water survey app', org: 'Blue Earth', location: 'Hybrid', deadline: null, applied: false,
      match: { matched: [{ skill: 'Python', level: 'Advanced', evidence: 3 }], missing: ['Field research', 'Mapping'], percent: 33 },
      gaps: [{ skill: 'Field research', module: null, tutors: [] }, { skill: 'Mapping', module: null, tutors: [] }],
      summary: 'You match 1 of 3 skills; 2 to learn.',
    },
  ],
};

const SAMPLE_MICRO_LESSON = {
  id: 'lml_sample_1',
  sessionId: 'sess_sample_1',
  courseId: 'c_cs101',
  sessionTitle: 'CS101 Micro-Lesson: Algorithmic Thinking & Graph Theory',
  courseCode: 'CS101',
  courseName: 'Introduction to Computer Science',
  audioRecapDurationSec: 300,
  audioRecapScript: '🎯 [0:00 - 0:45] THE BIG PICTURE: Welcome to the 5-minute micro-recap for CS101 Graph Theory. In this session we broke down how real-world networks—from Google Maps routing to social graphs—reduce to nodes and weighted edges.\n\n💡 [0:45 - 2:00] FOUNDATIONAL CONCEPTS: We defined adjacency matrices versus adjacency lists. Matrices give O(1) edge lookups but cost O(V^2) space, whereas lists shine for sparse graphs.\n\n⚡ [2:00 - 3:15] MECHANICS & APPLICATION: Breadth-First Search uses a FIFO queue to guarantee shortest path on unweighted graphs, while Depth-First Search relies on recursive call stacks.\n\n🔍 [3:15 - 4:15] DEEP DIVE & CRITICAL MOMENT: Pay close attention to cycle detection in directed graphs using 3-color DFS states (white, grey, black).\n\n⚠️ [4:15 - 4:45] EXAM PITFALL ALERT: The number one mistake on the midterm is running Dijkstra with negative edge weights. Dijkstra assumes non-decreasing path costs!\n\n🏁 [4:45 - 5:00] 60-SECOND WRAP-UP: Remember: unweighted shortest path is BFS; minimum spanning tree is Prim or Kruskal; topological sort requires a DAG. You have got this!',
  audioRecapUrl: null,
  audioRecapStatus: 'READY',
  mindMap: {
    id: 'root_node',
    label: 'Graph Theory & Network Traversal',
    summary: 'Core data structures, traversal algorithms, and shortest path proofs.',
    icon: '🧠',
    color: '#8b5cf6',
    takeaways: [
      'Graphs model relational networks with vertices and edges',
      'BFS computes shortest path in unweighted networks in O(V + E)',
      'Topological sorting requires an acyclic directed graph (DAG)',
    ],
    children: [
      {
        id: 'b1',
        label: 'Graph Representations',
        icon: '🎯',
        color: '#6366f1',
        takeaways: ['Adjacency Matrix: O(1) edge lookup, O(V^2) space'],
        children: [
          { id: 'l1_1', label: 'Adjacency Matrix', takeaways: ['Dense graph optimal'] },
          { id: 'l1_2', label: 'Adjacency List', takeaways: ['Sparse graph optimal'] },
        ],
      },
      {
        id: 'b2',
        label: 'Traversal Algorithms',
        icon: '💡',
        color: '#ec4899',
        takeaways: ['BFS: Queue-driven; DFS: Stack/Recursion-driven'],
        children: [
          { id: 'l2_1', label: 'Breadth-First Search', takeaways: ['Guaranteed unweighted shortest path'] },
          { id: 'l2_2', label: 'Depth-First Search', takeaways: ['Cycle detection & topological ordering'] },
        ],
      },
      {
        id: 'b3',
        label: 'Exam Traps & Red Flags',
        icon: '⚠️',
        color: '#f59e0b',
        takeaways: ['Never apply Dijkstra to graphs with negative weight edges!'],
        children: [
          { id: 'l3_1', label: 'Negative Edge Weights', takeaways: ['Use Bellman-Ford instead of Dijkstra'] },
          { id: 'l3_2', label: 'Cyclic Dependencies', takeaways: ['Topological sort fails if a back-edge exists'] },
        ],
      },
    ],
  },
  reels: [
    {
      id: 'reel_1',
      chapterIndex: 0,
      title: 'Adjacency Matrices vs. Lists',
      timestampSec: 0,
      durationSec: 52,
      keyTakeaway: 'Choose adjacency lists for sparse real-world graphs to conserve memory.',
      gradient: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4338ca 100%)',
      hashtags: ['#cs101', '#graphs', '#datastructures', '#examprep'],
      captions: [
        { start: 0, end: 4, text: 'Why do we care about graph representations?' },
        { start: 4, end: 8, text: 'In a social network with 1 billion users, a matrix takes exabytes of RAM!' },
        { start: 8, end: 12, text: 'Adjacency lists only store edges that actually exist.' },
      ],
    },
    {
      id: 'reel_2',
      chapterIndex: 1,
      title: 'BFS & The Shortest Path Guarantee',
      timestampSec: 300,
      durationSec: 64,
      keyTakeaway: 'BFS visits vertices level by level using a queue, guaranteeing minimum hops.',
      gradient: 'linear-gradient(135deg, #022c22 0%, #064e3b 40%, #047857 100%)',
      hashtags: ['#cs101', '#bfs', '#algorithms', '#revisionreel'],
      captions: [
        { start: 0, end: 4, text: 'How does GPS navigation find the fewest turns?' },
        { start: 4, end: 8, text: 'Breadth-First Search radiates outward like a ripple in water.' },
        { start: 8, end: 12, text: 'The moment you pop the target from the queue, that path is optimal.' },
      ],
    },
    {
      id: 'reel_3',
      chapterIndex: 2,
      title: 'The #1 Midterm Trap: Dijkstra Fallacy',
      timestampSec: 600,
      durationSec: 48,
      keyTakeaway: 'Dijkstra fails on negative edge weights because greedy commitments cannot be relaxed backward.',
      gradient: 'linear-gradient(135deg, #450a0a 0%, #7f1d1d 40%, #b91c1c 100%)',
      hashtags: ['#cs101', '#examtrap', '#dijkstra', '#mustknow'],
      captions: [
        { start: 0, end: 4, text: 'Warning: professors love putting this on exams!' },
        { start: 4, end: 8, text: 'Does Dijkstra work with negative edge weights?' },
        { start: 8, end: 12, text: 'NO! The greedy assumption breaks. Use Bellman-Ford instead.' },
      ],
    },
  ],
  practiceQuiz: [
    {
      id: 'quiz_q_1',
      question: 'Which data structure is fundamentally required to implement Breadth-First Search?',
      options: ['Priority Queue / Min-Heap', 'First-In-First-Out Queue', 'LIFO Stack', 'Binary Search Tree'],
      answer: 1,
      explanation: 'BFS requires a FIFO queue to explore vertices layer-by-layer.',
    },
    {
      id: 'quiz_q_2',
      question: 'What is the time complexity of BFS or DFS on a graph with V vertices and E edges using an adjacency list?',
      options: ['O(V * E)', 'O(V^2)', 'O(V + E)', 'O(log(V + E))'],
      answer: 2,
      explanation: 'Every vertex is visited once and every edge is explored once, yielding O(V + E).',
    },
    {
      id: 'quiz_q_3',
      question: 'Why will Dijkstras algorithm produce incorrect results on graphs with negative edge weights?',
      options: [
        'It will enter an infinite loop even without negative cycles',
        'It greedily marks nodes as finalized and never revisits them to relax lower costs',
        'It only supports unweighted graphs',
        'It requires all edge weights to be prime numbers',
      ],
      answer: 1,
      explanation: 'Dijkstra assumes that adding edges can only increase total path weight.',
    },
  ],
  status: 'READY',
  viewCount: 138,
  createdAt: '2026-10-12T10:00:00.000Z',
  updatedAt: '2026-10-12T10:00:00.000Z',
};


/** A sample campus network (upgrade 9): three campuses, you at the first. */
function sampleNetwork() {
  const campus = (id: string, name: string, city: string, country: string, lat: number, lng: number, students: number, teachers: number, courses: number, shared: number, exchange: number) =>
    ({ id, name, city, country, logoUrl: null, lat, lng, students, teachers, courses, shared, exchange, domains: [`${name.split(' ')[0].toLowerCase()}.example.edu`] });
  return {
    campuses: [
      campus('sample-campus-1', 'Riverside University', 'Lyon', 'France', 45.76, 4.84, 1240, 86, 142, 3, 2),
      campus('sample-campus-2', 'Lakeside University', 'Geneva', 'Switzerland', 46.2, 6.14, 860, 61, 97, 5, 4),
      campus('sample-campus-3', 'Mountain Institute', 'Turin', 'Italy', 45.07, 7.69, 530, 38, 64, 2, 1),
    ],
    me: { campusId: 'sample-campus-1', campusName: 'Riverside University', networkVisible: false, exchange: null },
    unassigned: 12,
  };
}

function decorateMsg(d: SampleDb, m: any) {
  const out: any = { ...m, starred: d.starred.has(m.id), poll: null };
  if (m.type === 'POLL') {
    const votes = d.pollVotes[m.id] ?? {};
    const options: string[] = m.metadata?.options ?? [];
    out.poll = {
      counts: options.map((_, i) => Object.values(votes).filter((v) => v.includes(i)).length),
      mine: votes[d.me.id] ?? [],
      voters: Object.values(votes).filter((v) => v.length).length,
    };
  }
  return out;
}
const visible = (d: SampleDb, c: any) => c.messages.filter((m: any) => !d.hiddenMsgs.has(m.id));
function findMsg(d: SampleDb, id: string) {
  for (const c of d.conversations) { const m = c.messages.find((x: any) => x.id === id); if (m) return { c, m }; }
  return null;
}

function summary(d: SampleDb, c: any) {
  const msgs = visible(d, c);
  const last = msgs[msgs.length - 1];
  const other = c.members.find((x: any) => x.id !== d.me.id);
  return {
    id: c.id, isGroup: c.isGroup, isOfficial: c.isOfficial, title: c.title, avatarUrl: null,
    otherUserId: c.isGroup ? null : other?.id ?? null, online: !c.isGroup && !c.isOfficial && other?.id !== d.people.meera.id,
    lastSeenAt: at(0, 8), memberCount: c.members.length, typing: [],
    lastMessage: last ? { id: last.id, body: last.body.slice(0, 140), type: last.type, senderId: last.senderId, createdAt: last.createdAt, deletedAt: last.deletedAt, attachmentName: last.attachmentName, mine: last.senderId === d.me.id } : null,
    unread: Math.max(c.unread ?? (last && last.senderId !== d.me.id && c.id !== 'sample-conv-welcome' ? 1 : 0), c.prefs?.markedUnread ? 1 : 0),
    markedUnread: !!c.prefs?.markedUnread, pinned: !!c.prefs?.pinned, muted: !!c.prefs?.muted, archived: !!c.prefs?.archived,
    activityAt: last?.createdAt ?? at(-1),
  };
}

function groupOut(d: SampleDb, g: any) {
  return {
    id: g.id, name: g.name, description: g.description, category: g.category, isPublic: g.isPublic, createdAt: g.createdAt, avatarUrl: null, createdById: g.members[0].id,
    _count: { members: g.members.length, posts: d.groupPosts[g.id]?.length ?? 0 },
    members: g.members.slice(0, 4).map((u: any) => ({ user: { id: u.id, name: u.name, avatar: null } })),
  };
}

const quizOut = (d: SampleDb, qz: any, withAnswers: boolean) => ({
  id: qz.id, title: qz.title, description: qz.description, dueDate: qz.dueDate, timeLimit: qz.timeLimit, status: qz.status, courseId: qz.courseId, createdAt: at(-10),
  course: { name: course(d, qz.courseId)?.name },
  questions: qz.questions.map((x: any) => (withAnswers ? x : forStudent(x, null))),
});

// ── GET routes ─────────────────────────────────────────────────────────

interface SamplePackItem {
  title: string;
  kind?: string;
  body?: string | null;
  url?: string | null;
  position?: number;
}

interface SamplePackModule {
  title: string;
  summary?: string | null;
  position: number;
  items?: SamplePackItem[];
}

interface SamplePackReview {
  id: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  user?: { id: string; name: string };
}

interface SampleMarketplacePack {
  id: string;
  authorId: string;
  sourceCourseId: string | null;
  title: string;
  slug: string;
  summary: string;
  description: string | null;
  thumbnailUrl: string | null;
  category: string;
  level: string;
  priceMinor: number;
  currency: string;
  modulesCount: number;
  itemsCount: number;
  estimatedHours: number;
  ratingAvg: number;
  reviewsCount: number;
  downloadsCount: number;
  revenueSharePct: number;
  status: string;
  createdAt: string;
  author?: {
    id: string;
    name: string;
    email: string;
  };
  modules?: SamplePackModule[];
  reviews?: SamplePackReview[];
}

const SAMPLE_MARKETPLACE_PACKS: SampleMarketplacePack[] = [
  {
    id: 'pack_sample_cs_dsa',
    authorId: 'usr_teacher_thorne',
    sourceCourseId: null,
    title: 'Advanced Algorithms & Distributed System Design',
    slug: 'advanced-algorithms-distributed-system-design',
    summary: 'Comprehensive 12-week curriculum module pack covering distributed consensus, Raft protocol, dynamic programming, and high-throughput microservices.',
    description: 'Developed by university faculties for upper-level CS cohorts. Includes lecture notes, interactive coding challenges, and production architecture blueprints.',
    thumbnailUrl: null,
    category: 'Computer Science',
    level: 'ADVANCED',
    priceMinor: 0,
    currency: 'INR',
    modulesCount: 3,
    itemsCount: 7,
    estimatedHours: 24.0,
    ratingAvg: 4.9,
    reviewsCount: 42,
    downloadsCount: 624,
    revenueSharePct: 80,
    status: 'PUBLISHED',
    createdAt: '2026-09-15T10:00:00.000Z',
    author: {
      id: 'usr_teacher_thorne',
      name: 'Prof. Alan Thorne',
      email: 'alan.thorne@riverside.edu',
    },
    modules: [
      {
        title: 'Module 1: Distributed Consensus & Raft Protocol',
        summary: 'State machine replication, leader election, and log consistency.',
        position: 0,
        items: [
          { title: 'Syllabus & Protocol Architecture', kind: 'PAGE', body: 'Foundations of consensus under Byzantine and crash-fault models.', position: 0 },
          { title: 'Interactive Consensus Walkthrough', kind: 'VIDEO', url: 'https://example.com/raft-lecture.mp4', position: 1 },
          { title: 'Raft State Machine Simulation Lab', kind: 'ASSIGNMENT', body: 'Implement heartbeats and election timers in Python/Go.', position: 2 },
        ],
      },
      {
        title: 'Module 2: Advanced Dynamic Programming & Flows',
        summary: 'Network flow, bipartite matching, and interval optimization.',
        position: 1,
        items: [
          { title: 'Ford-Fulkerson & Max Flow Min Cut', kind: 'PAGE', body: 'Residual graphs and augmenting paths.', position: 0 },
          { title: 'Flow Problem Set & Rubrics', kind: 'QUIZ', body: '10 graph flow challenges with automated test cases.', position: 1 },
        ],
      },
      {
        title: 'Module 3: Scalable Microservice Architecture',
        summary: 'Message buses, idempotent event sourcing, and rate limiters.',
        position: 2,
        items: [
          { title: 'High-Throughput Design Case Study', kind: 'PAGE', body: 'Dissecting a 50k req/sec university enrollment portal.', position: 0 },
          { title: 'Architecture Review Rubric', kind: 'ASSIGNMENT', body: 'Submit your end-to-end distributed system blueprint.', position: 1 },
        ],
      },
    ],
    reviews: [
      { id: 'rev_1', rating: 5, comment: 'Phenomenal curriculum! Imported directly into my CS402 course and students loved the Raft simulator.', createdAt: '2026-10-01T14:20:00.000Z', user: { id: 'u1', name: 'Dr. Sarah Lin' } },
      { id: 'rev_2', rating: 5, comment: 'Very rigorous problem sets. Saved our department over 40 hours of curriculum prep.', createdAt: '2026-10-05T09:15:00.000Z', user: { id: 'u2', name: 'Prof. Marcus Vance' } },
    ],
  },
  {
    id: 'pack_sample_gen_ai',
    authorId: 'usr_teacher_maya',
    sourceCourseId: null,
    title: 'Applied Generative AI & Vector Search RAG',
    slug: 'applied-generative-ai-vector-search-rag',
    summary: 'Practical enterprise GenAI engineering: embeddings, hybrid search retrieval, tool calling, and multi-turn eval harnesses.',
    description: 'A modular course pack designed for fast integration into data science & software engineering courses.',
    thumbnailUrl: null,
    category: 'Computer Science',
    level: 'INTERMEDIATE',
    priceMinor: 149900,
    currency: 'INR',
    modulesCount: 3,
    itemsCount: 6,
    estimatedHours: 18.0,
    ratingAvg: 4.8,
    reviewsCount: 28,
    downloadsCount: 318,
    revenueSharePct: 80,
    status: 'PUBLISHED',
    createdAt: '2026-09-20T12:00:00.000Z',
    author: {
      id: 'usr_teacher_maya',
      name: 'Dr. Maya Raman',
      email: 'maya.raman@riverside.edu',
    },
    modules: [
      {
        title: 'Module 1: Embeddings & Vector Indexing',
        summary: 'HNSW indexing, distance metrics, and chunking strategies.',
        position: 0,
        items: [
          { title: 'Vector Space Foundations', kind: 'PAGE', body: 'Cosine similarity vs inner product in high dimensions.', position: 0 },
          { title: 'Chunking & Metadata Lab', kind: 'ASSIGNMENT', body: 'Benchmarking chunk sizes across academic papers.', position: 1 },
        ],
      },
      {
        title: 'Module 2: Hybrid Search & Re-ranking',
        summary: 'Combining BM25 keyword search with dense semantic embeddings.',
        position: 1,
        items: [
          { title: 'Hybrid Search Pipelines', kind: 'PAGE', body: 'Reciprocal Rank Fusion (RRF) implementation.', position: 0 },
          { title: 'Cross-Encoder Re-ranker Quiz', kind: 'QUIZ', body: 'Evaluating Precision@K and NDCG.', position: 1 },
        ],
      },
      {
        title: 'Module 3: Agent Tool-Use & Evaluation',
        summary: 'Function calling schemas, sandboxing, and LLM-as-a-judge.',
        position: 2,
        items: [
          { title: 'Agent Tool Routing Architecture', kind: 'PAGE', body: 'Structured outputs and JSON schema enforcement.', position: 0 },
          { title: 'Automated Eval Harness Capstone', kind: 'ASSIGNMENT', body: 'Build an end-to-end evaluation benchmark suite.', position: 1 },
        ],
      },
    ],
    reviews: [
      { id: 'rev_3', rating: 5, comment: 'Worth every rupee. The hybrid search code templates worked flawlessly.', createdAt: '2026-10-04T16:00:00.000Z', user: { id: 'u3', name: 'Prof. Vikram Rao' } },
    ],
  },
  {
    id: 'pack_sample_linear_alg',
    authorId: 'usr_teacher_meyer',
    sourceCourseId: null,
    title: 'Linear Algebra & Matrix Decompositions for ML',
    slug: 'linear-algebra-matrix-decompositions-for-ml',
    summary: 'Intuitive geometric approach to vector spaces, eigenvalues, singular value decomposition (SVD), and principal component analysis (PCA).',
    description: 'Designed to bridge undergraduate calculus with machine learning representations.',
    thumbnailUrl: null,
    category: 'Mathematics',
    level: 'BEGINNER',
    priceMinor: 0,
    currency: 'INR',
    modulesCount: 2,
    itemsCount: 5,
    estimatedHours: 15.0,
    ratingAvg: 4.7,
    reviewsCount: 19,
    downloadsCount: 452,
    revenueSharePct: 80,
    status: 'PUBLISHED',
    createdAt: '2026-09-10T08:30:00.000Z',
    author: {
      id: 'usr_teacher_meyer',
      name: 'Prof. Kenneth Meyer',
      email: 'kenneth.meyer@riverside.edu',
    },
    modules: [
      {
        title: 'Module 1: Vector Spaces & Transformations',
        summary: 'Basis, span, linear independence, and change of basis.',
        position: 0,
        items: [
          { title: 'Geometric Vector Spaces', kind: 'PAGE', body: 'Visualizing span and null space.', position: 0 },
          { title: 'Matrix Transformations Interactive Lab', kind: 'ASSIGNMENT', body: '2D/3D affine transformation visualizer.', position: 1 },
        ],
      },
      {
        title: 'Module 2: Eigenvalues & SVD',
        summary: 'Spectral theorem, PCA dimensionality reduction, and image compression.',
        position: 1,
        items: [
          { title: 'Diagonalization & Spectral Theorem', kind: 'PAGE', body: 'Orthogonal diagonalizability of symmetric matrices.', position: 0 },
          { title: 'SVD Image Compression Notebook', kind: 'ASSIGNMENT', body: 'Low-rank matrix approximations.', position: 1 },
          { title: 'Concept Check: Decomposition Quiz', kind: 'QUIZ', body: '15 questions testing geometric intuition.', position: 2 },
        ],
      },
    ],
    reviews: [
      { id: 'rev_4', rating: 5, comment: 'Clear, elegant explanations. Great introductory modules.', createdAt: '2026-09-28T11:20:00.000Z', user: { id: 'u4', name: 'Dr. Anita Joshi' } },
    ],
  },
  {
    id: 'pack_sample_fintech',
    authorId: 'usr_teacher_rostova',
    sourceCourseId: null,
    title: 'Fintech Rails & Digital Banking Architecture',
    slug: 'fintech-rails-digital-banking-architecture',
    summary: 'Case-study driven curriculum on UPI 2.0 protocols, ISO 20022 payment messaging, fraud risk scoring, and open banking APIs.',
    description: 'Prepared in collaboration with banking fintech architects for business & economics students.',
    thumbnailUrl: null,
    category: 'Business & Economics',
    level: 'INTERMEDIATE',
    priceMinor: 199900,
    currency: 'INR',
    modulesCount: 3,
    itemsCount: 6,
    estimatedHours: 20.0,
    ratingAvg: 4.9,
    reviewsCount: 15,
    downloadsCount: 184,
    revenueSharePct: 80,
    status: 'PUBLISHED',
    createdAt: '2026-09-25T14:15:00.000Z',
    author: {
      id: 'usr_teacher_rostova',
      name: 'Elena Rostova, CFA',
      email: 'elena.rostova@riverside.edu',
    },
    modules: [
      {
        title: 'Module 1: Real-Time Payment Rails (UPI & FedNow)',
        summary: 'Two-phase commit, settlement cycles, and webhook confirmation.',
        position: 0,
        items: [
          { title: 'Instant Payments Overview', kind: 'PAGE', body: 'Evolution of instant settlement rails.', position: 0 },
          { title: 'Payment Flow Sequence Simulator', kind: 'ASSIGNMENT', body: 'Trace order creation through bank gateway callbacks.', position: 1 },
        ],
      },
      {
        title: 'Module 2: Algorithmic Fraud Prevention',
        summary: 'Velocity checking, device fingerprinting, and risk-based 3DS.',
        position: 1,
        items: [
          { title: 'Fraud Vectors in Modern Fintech', kind: 'PAGE', body: 'Account takeover and synthetic identities.', position: 0 },
          { title: 'Fraud Case Studies Analysis', kind: 'ASSIGNMENT', body: 'Analyze 3 real-world fraud vectors.', position: 1 },
        ],
      },
      {
        title: 'Module 3: Open Finance & Regulatory Sandboxes',
        summary: 'Account aggregator networks and data minimization principles.',
        position: 2,
        items: [
          { title: 'Data Governance in Open Banking', kind: 'PAGE', body: 'Consent managers and DPDP Act compliance.', position: 0 },
          { title: 'Fintech Capstone Presentation Rubric', kind: 'ASSIGNMENT', body: 'Final project rubric and grading criteria.', position: 1 },
        ],
      },
    ],
    reviews: [
      { id: 'rev_5', rating: 5, comment: 'The UPI flow breakdown is the best instructional material available anywhere.', createdAt: '2026-10-06T18:00:00.000Z', user: { id: 'u5', name: 'Prof. Ramesh Gupta' } },
    ],
  },
  {
    id: 'pack_sample_climate',
    authorId: 'usr_teacher_lindqvist',
    sourceCourseId: null,
    title: 'Climate Resilience & Grid Decarbonization Policy',
    slug: 'climate-resilience-grid-decarbonization-policy',
    summary: 'Interdisciplinary course pack analyzing renewable energy integration, carbon accounting standards (GHG Protocol Scope 1-3), and climate mitigation.',
    description: 'Empowers university classrooms with data-backed case studies on clean energy transitions.',
    thumbnailUrl: null,
    category: 'Natural Sciences',
    level: 'ALL_LEVELS',
    priceMinor: 0,
    currency: 'INR',
    modulesCount: 2,
    itemsCount: 5,
    estimatedHours: 12.0,
    ratingAvg: 5.0,
    reviewsCount: 31,
    downloadsCount: 512,
    revenueSharePct: 80,
    status: 'PUBLISHED',
    createdAt: '2026-09-08T09:00:00.000Z',
    author: {
      id: 'usr_teacher_lindqvist',
      name: 'Dr. Soren Lindqvist',
      email: 'soren.lindqvist@riverside.edu',
    },
    modules: [
      {
        title: 'Module 1: Carbon Accounting & Life-Cycle Assessment',
        summary: 'GHG protocol standards, emission factor databases, and lifecycle scopes.',
        position: 0,
        items: [
          { title: 'Carbon Accounting Primer', kind: 'PAGE', body: 'Scope 1, 2, and 3 measurement frameworks.', position: 0 },
          { title: 'Campus Carbon Footprint Exercise', kind: 'ASSIGNMENT', body: 'Calculate university building energy emissions.', position: 1 },
        ],
      },
      {
        title: 'Module 2: Renewable Grid Integration & Storage',
        summary: 'Duck curve mitigation, battery energy storage systems (BESS), and demand response.',
        position: 1,
        items: [
          { title: 'Grid Modernization Notes', kind: 'PAGE', body: 'Intermittent renewables and frequency stability.', position: 0 },
          { title: 'Grid Storage Policy Case Study', kind: 'PAGE', body: 'Global comparative study of capacity markets.', position: 1 },
          { title: 'Policy Debates Quiz', kind: 'QUIZ', body: '10 questions on tariffs and renewable portfolio standards.', position: 2 },
        ],
      },
    ],
    reviews: [
      { id: 'rev_6', rating: 5, comment: 'Outstanding balance of environmental science and public policy analysis.', createdAt: '2026-09-25T13:40:00.000Z', user: { id: 'u6', name: 'Dr. Catherine Bell' } },
    ],
  },
];

const GET: [RegExp, (c: Ctx) => Result][] = [
  // Multi-school SaaS branding and admin settings (Stage 5 · C2)
  [/^\/api\/org\/branding$/, () => ok({
    isSchool: true,
    id: "sample-org-1",
    name: "Riverside University",
    slug: "riverside",
    customDomain: null,
    brandColor: "#4f46e5",
    logoUrl: null,
    appTitle: "Riverside UniVerse",
    tagline: "The Campus Operating System",
  })],
  [/^\/api\/admin\/settings$/, () => ok({
    organization: {
      id: "sample-org-1",
      name: "Riverside University",
      slug: "riverside",
      customDomain: null,
      brandColor: "#4f46e5",
      logoUrl: null,
      appTitle: "Riverside UniVerse",
      tagline: "The Campus Operating System",
      seats: 120,
      usedSeats: 48,
      plan: "PRO",
    },
    security: {
      demoLogin: false,
      email: true,
      credentialSigning: true,
      fileStorage: true,
      pendingApplications: 2,
      suspendedAccounts: 0,
    },
  })],
  // Enterprise SSO (Stage 5 · C3)
  [/^\/api\/auth\/sso\/lookup/, () => ok({
    hasSso: true,
    provider: "MICROSOFT",
    providerName: "Microsoft Entra ID (Office 365)",
    schoolName: "Riverside University",
    tenantId: "sample-entra-tenant",
    enforced: false,
  })],
  [/^\/api\/admin\/sso$/, () => ok({
    ssoEnabled: true,
    ssoProvider: "MICROSOFT",
    ssoDomain: "riverside.edu, students.riverside.edu",
    ssoTenantId: "sample-entra-tenant",
    ssoEnforced: false,
  })],
  // Compliance & Trust Center (Stage 5 · C5)
  [/^\/api\/trust\/status$/, () => ok({
    status: "ALL_SYSTEMS_OPERATIONAL",
    updatedAt: new Date().toISOString(),
    uptimePercent: "99.98%",
    complianceFrameworks: ["DPDP_2023", "FERPA", "COPPA", "GDPR"],
    systems: [
      { name: "Edge API & Workload Routing", status: "OPERATIONAL", latency: "6ms" },
      { name: "Cloudflare D1 Primary Database", status: "OPERATIONAL", encryption: "AES-256" },
      { name: "Cloudflare R2 Object Storage", status: "OPERATIONAL", encryption: "AES-256" },
      { name: "Authentication (Firebase / Entra ID)", status: "OPERATIONAL", protocol: "OIDC / SAML 2.0" },
      { name: "WebSockets & Live Collaboration", status: "OPERATIONAL", protocol: "WSS / TLS 1.3" },
      { name: "Verifiable Credentials Engine", status: "OPERATIONAL", standard: "W3C / Ed25519" },
    ],
  })],
  [/^\/api\/compliance\/retention$/, () => ok({
    dataRetentionDays: 730,
  })],
  [/^\/api\/compliance\/grievance$/, () => ok([
    {
      id: "sample-grievance-1",
      requestType: "NOMINATION",
      details: "Designation of legal representative under Section 14 DPDP Act 2023",
      nomineeName: "Dr. Evelyn Miller",
      nomineeEmail: "evelyn.miller@example.org",
      status: "RESOLVED",
      resolutionNote: "Representative nomination verified and stored in student record.",
      createdAt: "2026-10-10T14:30:00.000Z",
    },
  ])],
  [/^\/api\/compliance\/ferpa\/logs/, () => ok([
    {
      id: "sample-ferpa-1",
      recordType: "TRANSCRIPT",
      reason: "Official degree audit and graduation review",
      createdAt: "2026-10-08T10:15:00.000Z",
      actor: {
        name: "Dean Sarah Jenkins",
        email: "dean.jenkins@riverside.edu",
        role: "ADMIN",
      },
    },
  ])],
  // OneRoster 1.2 SIS Integration (Stage 5 · C3)
  [/^\/api\/admin\/oneroster\/history$/, () => ok([
    {
      id: "sample-sync-1",
      syncType: "CSV_BATCH",
      status: "SUCCESS",
      summary: "OneRoster sync: 48 users, 12 classes, 84 memberships synchronized",
      coursesCount: 12,
      classesCount: 12,
      usersCount: 48,
      enrollmentsCount: 84,
      createdAt: "2026-10-11T16:00:00.000Z",
      actor: { name: "Dean Sarah Jenkins", email: "dean.jenkins@riverside.edu" },
    },
  ])],
  [/^\/api\/oneroster\/v1p2\/orgs$/, () => ok({
    orgs: [
      {
        sourcedId: "sample-org-1",
        status: "active",
        dateLastModified: new Date().toISOString(),
        name: "Riverside University",
        type: "school",
        identifier: "riverside",
      },
    ],
  })],
  [/^\/api\/oneroster\/v1p2\/courses/, () => ok({
    courses: [
      {
        sourcedId: "course-cs101",
        status: "active",
        dateLastModified: new Date().toISOString(),
        title: "Introduction to Computer Science",
        courseCode: "CS101",
        grades: ["Higher Education"],
        orgSourcedId: "sample-org-1",
      },
    ],
  })],
  [/^\/api\/oneroster\/v1p2\/classes/, () => ok({
    classes: [
      {
        sourcedId: "class-cs101-a",
        status: "active",
        dateLastModified: new Date().toISOString(),
        title: "CS101 - Section A",
        classCode: "CS101-A",
        classType: "scheduled",
        courseSourcedId: "course-cs101",
      },
    ],
  })],
  [/^\/api\/oneroster\/v1p2\/users/, () => ok({
    users: [
      {
        sourcedId: "sample-student-1",
        status: "active",
        dateLastModified: new Date().toISOString(),
        enabledUser: true,
        username: "demo@student.com",
        givenName: "Alex",
        familyName: "Chen",
        role: "student",
        email: "demo@student.com",
      },
      {
        sourcedId: "sample-teacher-1",
        status: "active",
        dateLastModified: new Date().toISOString(),
        enabledUser: true,
        username: "demo@teacher.com",
        givenName: "Dr. Evelyn",
        familyName: "Miller",
        role: "teacher",
        email: "demo@teacher.com",
      },
    ],
  })],
  [/^\/api\/oneroster\/v1p2\/enrollments/, () => ok({
    enrollments: [
      {
        sourcedId: "sample-enr-1",
        status: "active",
        dateLastModified: new Date().toISOString(),
        classSourcedId: "class-cs101-a",
        schoolSourcedId: "sample-org-1",
        userSourcedId: "sample-student-1",
        role: "student",
        primary: true,
      },
    ],
  })],

  // Developer Platform & Public REST API (Stage 5 · C4)
  [/^\/api\/admin\/api-keys$/, () => ok([
    {
      id: "key-sample-1",
      name: "Canvas LMS Roster Sync",
      keyPrefix: "uv_live_4a9f",
      scopes: ["courses.read", "students.read", "grades.read"],
      rateLimit: 300,
      lastUsedAt: "2026-10-12T10:15:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
      createdAt: "2026-10-01T12:00:00.000Z",
    },
    {
      id: "key-sample-2",
      name: "Attendance Kiosk Service",
      keyPrefix: "uv_live_7b2c",
      scopes: ["attendance.read", "attendance.write"],
      rateLimit: 300,
      lastUsedAt: "2026-10-12T08:30:00.000Z",
      expiresAt: null,
      createdAt: "2026-10-05T09:00:00.000Z",
    },
  ])],
  [/^\/api\/admin\/report-schedules$/, () => ok({ schedules: [], max: 10, folder: 'Scheduled reports' })],
  [/^\/api\/admin\/chat-apps$/, () => ok({
    apps: [{ id: 'sample-app-1', name: 'Library desk', description: 'Looks books up in the school library catalogue.', url: 'https://library.example.edu/universe', commands: [{ name: 'library', hint: 'Find a book in the school library' }], permissions: ['post'], enabled: true, lastCalledAt: new Date(Date.now() - 3600_000).toISOString(), lastStatus: '200', createdAt: new Date(Date.now() - 7 * 86_400_000).toISOString() }],
    permissions: ['post', 'read_recent'], builtIn: ['ask', 'catchup', 'remind', 'poll', 'call', 'video', 'shrug'],
  })],
  [/^\/api\/admin\/webhooks$/, () => ok([
    {
      id: "wh-sample-1",
      url: "https://erp.riverside.edu/webhooks/universe",
      secret: "whsec_9f2a74c810d5b432e6a17f",
      events: ["assignment.submitted", "grade.posted", "attendance.marked"],
      isActive: true,
      description: "University Central ERP Event Dispatcher",
      createdAt: "2026-10-02T14:20:00.000Z",
      _count: { deliveries: 142 },
    },
  ])],
  [/^\/api\/admin\/webhooks\/([^/]+)\/deliveries$/, () => ok([
    {
      id: "del-sample-1",
      event: "grade.posted",
      payload: '{"id":"evt_1","event":"grade.posted","data":{"courseId":"cs101","grade":"A"}}',
      statusCode: 200,
      status: "SUCCESS",
      error: null,
      deliveredAt: "2026-10-12T11:45:00.000Z",
      createdAt: "2026-10-12T11:45:00.000Z",
    },
    {
      id: "del-sample-2",
      event: "assignment.submitted",
      payload: '{"id":"evt_2","event":"assignment.submitted","data":{"studentId":"st_1"}}',
      statusCode: 200,
      status: "SUCCESS",
      error: null,
      deliveredAt: "2026-10-12T09:30:00.000Z",
      createdAt: "2026-10-12T09:30:00.000Z",
    },
  ])],
  [/^\/api\/v1\/courses$/, () => ok({
    organization: { id: "sample-org-1", name: "Riverside University", slug: "riverside" },
    courses: [
      {
        id: "course-cs101",
        code: "CS101",
        name: "Introduction to Computer Science",
        description: "Foundations of computational thinking and programming.",
        credits: 4,
        department: "Computer Science",
        status: "PUBLISHED",
        teacher: { id: "tch_1", name: "Dr. Evelyn Miller", email: "evelyn@riverside.edu" },
      },
    ],
  })],
  [/^\/api\/v1\/students$/, () => ok({
    organization: { id: "sample-org-1", name: "Riverside University", slug: "riverside" },
    students: [
      {
        id: "usr_student_1",
        name: "Alex Chen",
        email: "alex.chen@riverside.edu",
        role: "STUDENT",
        status: "ACTIVE",
        enrolledCoursesCount: 4,
        attendanceRatePct: 94.2,
      },
    ],
  })],
  [/^\/api\/v1\/grades$/, () => ok({
    organization: { id: "sample-org-1", name: "Riverside University", slug: "riverside" },
    grades: [
      {
        id: "sub_1",
        score: 96,
        feedback: "Exceptional algorithm optimization and documentation.",
        submittedAt: "2026-10-10T14:00:00.000Z",
        assignment: { title: "Binary Search Trees", maxScore: 100 },
        student: { id: "usr_student_1", name: "Alex Chen", email: "alex.chen@riverside.edu" },
      },
    ],
  })],
  [/^\/api\/v1\/attendance$/, () => ok({
    organization: { id: "sample-org-1", name: "Riverside University", slug: "riverside" },
    attendance: [
      {
        id: "att_1",
        status: "PRESENT",
        notes: null,
        session: { date: "2026-10-12T09:00:00.000Z", course: { code: "CS101", name: "Computer Science" } },
        student: { id: "usr_student_1", name: "Alex Chen", email: "alex.chen@riverside.edu" },
      },
    ],
  })],
  [/^\/api\/v1\/openapi$/, () => ok({
    openapi: "3.1.0",
    info: {
      title: "UniVerse Public REST API",
      version: "1.0.0",
      description: "University management, courses, roster sync, and grading API.",
    },
    paths: {},
  })],

  // Unified Payments & Reconciliation (Stage 5 · C6)
  [/^\/api\/admin\/payments\/reconciliation/, () => ok({
    orgId: "sample-org-1",
    period: { from: "2026-09-12T00:00:00.000Z", to: "2026-10-12T00:00:00.000Z" },
    summary: {
      totalCollectedMinor: 48250000,
      totalTransactions: 38,
      totalRefundedMinor: 150000,
      netCollectedMinor: 48100000,
      currencyBreakdown: { INR: 42500000, USD: 575000 },
      providerBreakdown: {
        RAZORPAY: { count: 32, totalMinor: 42500000 },
        STRIPE: { count: 6, totalMinor: 575000 },
      },
      methodBreakdown: {
        "UPI / Netbanking": { count: 32, totalMinor: 42500000 },
        "Card": { count: 6, totalMinor: 575000 },
      },
    },
    transactions: [
      {
        id: "po-sample-1",
        orderRef: "order_Klm741982a",
        paymentRef: "pay_Klm741982b",
        amount: 250000,
        currency: "INR",
        provider: "RAZORPAY",
        purpose: "FEE",
        status: "COMPLETED",
        customerName: "Alex Chen",
        customerEmail: "alex.chen@riverside.edu",
        paidAt: "2026-10-11T14:30:00.000Z",
        createdAt: "2026-10-11T14:28:00.000Z",
      },
      {
        id: "po-sample-2",
        orderRef: "cs_test_984128410",
        paymentRef: "pi_test_984128410",
        amount: 12000,
        currency: "USD",
        provider: "STRIPE",
        purpose: "EVENT",
        status: "COMPLETED",
        customerName: "Sarah Connor",
        customerEmail: "sarah@riverside.edu",
        paidAt: "2026-10-10T11:00:00.000Z",
        createdAt: "2026-10-10T10:55:00.000Z",
      },
    ],
  })],
  [/^\/api\/admin\/payments\/settings$/, () => ok({
    paymentProvider: "AUTO",
    razorpayKeyId: "rzp_test_sample_12345",
    hasRazorpaySecret: true,
    stripePublishableKey: "pk_test_sample_12345",
    hasStripeSecret: true,
  })],

  // Content Marketplace & Course Packs (Stage 5 · C7)
  [/^\/api\/marketplace\/packs\/([^/]+)\/reviews$/, ({ m }) => {
    const pack = SAMPLE_MARKETPLACE_PACKS.find((p) => p.id === m[1] || p.slug === m[1]);
    return ok(pack?.reviews || []);
  }],
  [/^\/api\/marketplace\/packs\/([^/]+)$/, ({ m }) => {
    const pack = SAMPLE_MARKETPLACE_PACKS.find((p) => p.id === m[1] || p.slug === m[1]);
    if (!pack) return fail('Pack not found', 404);
    return ok(pack);
  }],
  [/^\/api\/marketplace\/packs$/, ({ q }) => {
    let list = [...SAMPLE_MARKETPLACE_PACKS];
    const search = q.get('q')?.toLowerCase()?.trim();
    if (search) {
      list = list.filter((p) =>
        p.title.toLowerCase().includes(search) ||
        p.summary.toLowerCase().includes(search) ||
        p.category.toLowerCase().includes(search)
      );
    }
    const cat = q.get('category');
    if (cat && cat !== 'All') {
      list = list.filter((p) => p.category === cat);
    }
    const lvl = q.get('level');
    if (lvl && lvl !== 'ALL_LEVELS') {
      list = list.filter((p) => p.level === lvl);
    }
    const price = q.get('priceFilter');
    if (price === 'free') {
      list = list.filter((p) => p.priceMinor === 0);
    } else if (price === 'paid') {
      list = list.filter((p) => p.priceMinor > 0);
    }
    const sort = q.get('sort');
    if (sort === 'rating') {
      list.sort((a, b) => b.ratingAvg - a.ratingAvg);
    } else if (sort === 'recent') {
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sort === 'price_asc') {
      list.sort((a, b) => a.priceMinor - b.priceMinor);
    } else if (sort === 'price_desc') {
      list.sort((a, b) => b.priceMinor - a.priceMinor);
    } else {
      list.sort((a, b) => b.downloadsCount - a.downloadsCount);
    }
    return ok({ packs: list, total: list.length });
  }],
  [/^\/api\/marketplace\/my-published$/, () => ok({
    packs: [SAMPLE_MARKETPLACE_PACKS[0], SAMPLE_MARKETPLACE_PACKS[1]],
    stats: {
      totalPacks: 2,
      totalDownloads: 942,
      totalEarningsMinor: 38134400,
      currency: 'INR',
    },
  })],

  // Learning Analytics Warehouse & xAPI (Stage 5 · C8)
  [/^\/api\/analytics\/warehouse\/terms$/, () => ok({
    organizationId: "sample-org-1",
    totalWarehouseStatements: 24800,
    terms: [
      {
        term: 'Fall 2026',
        period: 'Aug 2026 – Dec 2026',
        activeStudents: 1420,
        averageGpa: 3.52,
        retentionRatePct: 96.4,
        averageMasteryPct: 88.2,
        learningHoursTotal: 28400,
        courseCompletionRatePct: 94.1,
      },
      {
        term: 'Spring 2026',
        period: 'Jan 2026 – May 2026',
        activeStudents: 1380,
        averageGpa: 3.41,
        retentionRatePct: 94.8,
        averageMasteryPct: 85.0,
        learningHoursTotal: 25100,
        courseCompletionRatePct: 91.5,
      },
      {
        term: 'Fall 2025',
        period: 'Aug 2025 – Dec 2025',
        activeStudents: 1250,
        averageGpa: 3.34,
        retentionRatePct: 93.2,
        averageMasteryPct: 81.6,
        learningHoursTotal: 22000,
        courseCompletionRatePct: 89.0,
      },
    ],
    verbDistribution: {
      completed: 4120,
      attempted: 6850,
      passed: 3940,
      interacted: 11200,
      mastered: 2840,
    },
  })],
  [/^\/api\/analytics\/warehouse\/export$/, () => ok([
    {
      id: "exp-sample-1",
      periodStart: "2026-08-01T00:00:00.000Z",
      periodEnd: "2026-10-12T00:00:00.000Z",
      format: "CSV",
      anonymized: true,
      status: "GENERATED",
      recordCount: 2480,
      fileSizeBytes: 248900,
      sha256Hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      createdAt: "2026-10-10T14:30:00.000Z",
      generatedBy: { id: "usr_admin", name: "School Administrator", email: "admin@riverside.edu" },
    },
  ])],
  [/^\/api\/analytics\/warehouse\/research$/, () => ok([
    {
      id: "res-sample-1",
      title: "Cognitive Load and Multi-Modal Learning Pacing",
      institution: "MIT Media Lab & Harvard EdTech",
      purpose: "Evaluating correlation between interactive problem durations and concept mastery retention across diverse undergraduate cohorts.",
      datasetScope: "LEARNING_OUTCOMES",
      anonymized: true,
      status: "APPROVED",
      accessToken: "uv_research_mit_medialab_947192",
      expiresAt: "2027-01-10T00:00:00.000Z",
      createdAt: "2026-10-05T09:30:00.000Z",
      requestedBy: { id: "usr_prof_thorne", name: "Prof. Alan Thorne", email: "alan.thorne@riverside.edu" },
    },
  ])],
  [/^\/api\/analytics\/xapi/, ({ q }) => {
    const verb = q.get('verb')?.toLowerCase();
    const all = [
      {
        id: "xapi-stmt-1",
        actorId: "syn_usr_a14f92c019ba",
        actorType: "USER",
        verb: "completed",
        objectType: "assignment",
        objectId: "asgn_raft_lab",
        objectName: "Distributed Systems Raft Lab",
        resultScore: 98,
        resultSuccess: true,
        resultCompletion: true,
        durationSeconds: 1450,
        contextCourseId: "course_cs101",
        contextCourse: { id: "course_cs101", code: "CS101", name: "Computer Science Foundations" },
        timestamp: "2026-10-12T18:45:00.000Z",
      },
      {
        id: "xapi-stmt-2",
        actorId: "syn_usr_c38d10b74102",
        actorType: "USER",
        verb: "attempted",
        objectType: "quiz",
        objectId: "quiz_graph_flow",
        objectName: "Graph Flow Concept Check",
        resultScore: 85,
        resultSuccess: true,
        resultCompletion: true,
        durationSeconds: 620,
        contextCourseId: "course_cs101",
        contextCourse: { id: "course_cs101", code: "CS101", name: "Computer Science Foundations" },
        timestamp: "2026-10-12T18:40:00.000Z",
      },
      {
        id: "xapi-stmt-3",
        actorId: "syn_usr_99e120da331f",
        actorType: "USER",
        verb: "mastered",
        objectType: "concept",
        objectId: "concept_eigenvalues",
        objectName: "Spectral Decomposition Mastery",
        resultScore: 100,
        resultSuccess: true,
        resultCompletion: true,
        durationSeconds: 310,
        contextCourseId: "course_math201",
        contextCourse: { id: "course_math201", code: "MATH201", name: "Linear Algebra & Applications" },
        timestamp: "2026-10-12T18:32:00.000Z",
      },
      {
        id: "xapi-stmt-4",
        actorId: "syn_usr_72ba81401f89",
        actorType: "USER",
        verb: "interacted",
        objectType: "call",
        objectId: "call_whisper_ta",
        objectName: "Whisper TA Concept Clarification",
        resultScore: null,
        resultSuccess: true,
        resultCompletion: false,
        durationSeconds: 45,
        contextCourseId: "course_cs101",
        contextCourse: { id: "course_cs101", code: "CS101", name: "Computer Science Foundations" },
        timestamp: "2026-10-12T18:25:00.000Z",
      },
    ];
    const filtered = verb ? all.filter((s) => s.verb === verb) : all;
    return ok({ statements: filtered, total: filtered.length });
  }],


  [/^\/courses\/my$/, ({ db: d }) => d.teacherView
    ? ok(d.taught.map((c) => ({ ...c, _count: { enrollments: d.classmates.length, ...counts(d, c.id) } })))
    : ok(d.courses.map((c, i) => ({ enrolledAt: at(-90 + i), course: { ...c, teacher: { id: c.teacher.id, name: c.teacher.name, avatar: null }, _count: counts(d, c.id) } })))],

  // Offline quizzes finished late, waiting for the teacher (Quizzes page): none in the sample
  [/^\/quizzes\/teacher\/offline-pending$/, () => ok([])],
  // Verified volunteering (upgrade 5): shifts, the impact map and the yearly report
  [/^\/api\/volunteer\/shifts$/, () => ok([
    { id: 'sample-sh1', title: 'Saturday tree planting', startAt: at(3, 9), endAt: at(3, 13), location: 'Riverside Park', lat: 12.9716, lng: 77.5946, radiusM: 200, capacity: 25, taken: 14, project: { id: 'sample-p1', name: 'Green City Drive', sdgNumber: 13, ngo: { name: 'Earth Collective' } }, mine: null },
    { id: 'sample-sh2', title: 'Reading club for kids', startAt: at(-5, 15), endAt: at(-5, 17), location: 'Community library', lat: 12.9352, lng: 77.6245, radiusM: 150, capacity: 10, taken: 8, project: { id: 'sample-p2', name: 'Read Together', sdgNumber: 4, ngo: { name: 'Bright Minds' } }, mine: { checkInAt: at(-5, 15), checkOutAt: at(-5, 17), minutes: 120, verified: true, method: 'QR' } },
  ])],
  [/^\/api\/volunteer\/report$/, ({ q }) => {
    // Each place is one project's; ?sdg= keeps one UN goal's (Stage 5 · Q16).
    const all = [
      { lat: 12.9716, lng: 77.5946, label: 'Riverside Park', hours: 180, people: 31, shifts: 12, project: { name: 'Green City Drive', ngo: 'Earth Collective', sdg: 13 } },
      { lat: 13.0358, lng: 77.597, label: 'Shelter kitchen', hours: 136.5, people: 22, shifts: 10, project: { name: 'Shelter kitchen', ngo: 'Food For All', sdg: 2 } },
      { lat: 12.9352, lng: 77.6245, label: 'Community library', hours: 96, people: 14, shifts: 6, project: { name: 'Read Together', ngo: 'Bright Minds', sdg: 4 } },
    ];
    const sdg = Number(q.get('sdg')) || null;
    const shown = sdg ? all.filter((p) => p.project.sdg === sdg) : all;
    return ok({
      year: new Date().getFullYear(), sdg,
      totals: { hours: shown.reduce((t, p) => t + p.hours, 0), volunteers: shown.reduce((t, p) => t + p.people, 0), shifts: shown.reduce((t, p) => t + p.shifts, 0) },
      places: shown.map((p) => ({ lat: p.lat, lng: p.lng, label: p.label, hours: p.hours, people: p.people })),
      projects: shown.map((p) => ({ ...p.project, hours: p.hours, people: p.people })),
      sdgs: [{ sdg: 2, hours: 136.5 }, { sdg: 4, hours: 96 }, { sdg: 13, hours: 180 }],
    });
  }],
  [/^\/api\/volunteer\/shifts\/[^/]+\/roster$/, ({ db: d }) => ok({ people: d.classmates.slice(0, 3).map((u, i) => ({ id: `sample-c${i}`, checkInAt: i ? null : at(-5, 15), checkOutAt: i ? null : at(-5, 17), method: i ? null : 'QR', minutes: i ? 0 : 120, verified: !i, student: { id: u.id, name: u.name, email: u.email ?? `${u.id}@example.edu` } })) })],
  [/^\/api\/volunteer\/projects$/, () => ok([{ id: 'sample-p1', name: 'Green City Drive', ngo: { name: 'Earth Collective' } }])],
  // Campus super-app (upgrade 7): events with RSVPs, room status, lost & found
  [/^\/api\/campus\/events$/, ({ db: d }) => ok(d.campusItems.filter((c) => c.kind === 'EVENT').map((c, i) => ({ ...c, capacity: (c as { capacity?: number }).capacity ?? null, going: 34 + i * 11, waiting: 0, price: i === 1 ? 15_000 : null, currency: 'INR', mine: i === 0 && !d.teacherView ? { status: 'GOING', checkedInAt: null } : null })))],
  [/^\/api\/campus\/events\/[^/]+\/ticket$/, ({ db: d }) => ok({ code: 't1.sample-ticket.sampleSampleSampleSampl', name: d.me?.name ?? 'Sample Student', title: 'Freshers’ Welcome Night', startAt: at(6, 18), location: 'Main Quad', paid: false, usedAt: null })],
  [/^\/api\/campus\/events\/[^/]+\/attendees$/, ({ db: d }) => ok({ item: { id: 'sample', title: 'Event', capacity: null }, people: d.classmates.slice(0, 4).map((u, i) => ({ id: `sample-r${i}`, status: 'GOING', checkedInAt: i < 2 ? at(0, 18, i * 5) : null, createdAt: at(-2), user: { id: u.id, name: u.name, email: u.email ?? `${u.id}@example.edu` } })) })],
  [/^\/api\/campus\/events\/[^/]+\/code$/, () => ok({ code: 'e1.sample.0.sample-sample-sample-sa', expiresIn: 30 })],
  [/^\/api\/campus\/rooms$/, () => ok({})],
  // The parent co-pilot (Stage 5 · D16): a child's week, its summary and a question answered from the records.
  [/^\/api\/parent\/week$/, () => ok({
    child: 'Aarav', week: at(0).slice(0, 10), prefs: { lang: 'en', weekly: true, weekday: 6, hour: 18 },
    facts: { child: 'Aarav', from: at(-7).slice(0, 10), to: at(0).slice(0, 10), grades: [{ course: 'Operating Systems', title: 'Scheduling quiz', percent: 86 }], attendance: { present: 9, late: 0, absent: 1, excused: 0 }, absences: [{ course: 'Data Structures', date: at(-2).slice(0, 10) }], due: [{ course: 'Design Studio', title: 'Poster draft', kind: 'assignment', at: at(3) }], late: [], average: 82, averageBefore: 80, achievements: [], reportCards: [] },
    line: '1 new grade · 1 absence · 1 thing due', quiet: false,
    summary: { text: 'Aarav had a good week: 86% on the Operating Systems scheduling quiz, and the overall average went up from 80% to 82%. Aarav was at 9 of 10 classes, missing one Data Structures class on Tuesday. Next up is the Design Studio poster draft, due on Friday. A quick chat about the missed class could help Aarav catch up.', ai: true, at: at(0, 8) },
    questions: [{ id: 'sample-pq1', question: 'How is Aarav doing in Data Structures?', answer: 'Aarav’s Data Structures grade is 78%, with attendance at 90%. The last two marks were 74% and 82%, so it’s improving.', used: ['Grades', 'Attendance', 'Data Structures'], at: at(-1, 19) }],
    asksLeft: 9,
  })],
  // The live campus map (Stage 5 · D15): five buildings, the sample rooms with today's classes from the timetable.
  [/^\/api\/campus\/map$/, ({ db: d, q }) => {
    const dow = Number(q.get('dow')) || 0, min = Number(q.get('min')) || 600;
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const place: Record<string, [string, number]> = { 'sample-r-a': ['sample-b-cs', 4], 'sample-r-b': ['sample-b-main', 0], 'sample-r-c': ['sample-b-arts', 1], 'sample-r-lab': ['sample-b-sci', 2] };
    const rooms = [
      ...Object.values(d.rooms).map((r: any, i: number) => ({ id: r.id, name: r.name, type: ['CLASSROOM', 'LECTURE_HALL', 'STUDIO', 'LAB'][i], capacity: [40, 120, 30, 24][i], buildingId: place[r.id]?.[0] ?? null, floor: place[r.id]?.[1] ?? null })),
      { id: 'sample-r-s1', name: 'Group study room 1', type: 'Study room', capacity: 6, buildingId: 'sample-b-lib', floor: 1 },
      { id: 'sample-r-s2', name: 'Quiet pod 3', type: 'Study room', capacity: 2, buildingId: 'sample-b-lib', floor: 2 },
    ].map((r) => ({ ...r, busy: d.slots.filter((s: any) => s.roomId === r.id && s.dayOfWeek === dow).map((s: any) => ({ from: toMin(s.startTime), to: toMin(s.endTime), kind: 'class', label: `${s.course.code} · ${s.course.name}` })).concat(r.id === 'sample-r-s1' ? [{ from: min - 30, to: min + 30, kind: 'booking', label: 'Booked' }] : []) }));
    const mine = d.slots.filter((s: any) => s.dayOfWeek >= dow).sort((a: any, b: any) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime)).find((s: any) => s.dayOfWeek > dow || toMin(s.endTime) > min) ?? d.slots[0];
    const off = mine ? (mine.dayOfWeek - dow + 7) % 7 : 0;
    return ok({
      campus: { id: null, name: 'Our campus' }, campuses: [{ id: null, name: 'Our campus' }],
      buildings: [
        { id: 'sample-b-cs', name: 'Computer Science Block', code: 'CS', x: 60, y: 60, w: 240, h: 150, floors: 5, color: '#6366f1' },
        { id: 'sample-b-main', name: 'Main Hall', code: 'MH', x: 380, y: 60, w: 260, h: 140, floors: 2, color: '#0ea5e9' },
        { id: 'sample-b-lib', name: 'Library', code: 'LIB', x: 720, y: 60, w: 220, h: 200, floors: 3, color: '#10b981' },
        { id: 'sample-b-arts', name: 'Arts Centre', code: 'ART', x: 80, y: 340, w: 220, h: 160, floors: 2, color: '#ec4899' },
        { id: 'sample-b-sci', name: 'Science Labs', code: 'SCI', x: 420, y: 320, w: 280, h: 180, floors: 3, color: '#f59e0b' },
      ],
      rooms,
      live: [{ courseId: d.courses[0]?.id ?? 'sample-c', code: d.courses[0]?.code ?? 'CS204', name: d.courses[0]?.name ?? 'Operating Systems', checkedIn: 27, startedAt: at(0, 9), roomId: 'sample-r-a' }],
      online: [],
      events: d.campusItems.filter((c: any) => c.kind === 'EVENT').slice(0, 1).map((c: any) => ({ id: c.id, title: c.title, location: c.location ?? 'Main Hall', startAt: at(0, 18), buildingId: 'sample-b-main', now: false })),
      next: mine ? { courseId: mine.courseId, code: mine.course.code, name: mine.course.name, type: mine.type, start: mine.startTime, end: mine.endTime, day: off === 0 ? 'Today' : off === 1 ? 'Tomorrow' : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][mine.dayOfWeek], dayOffset: off, now: off === 0 && toMin(mine.startTime) <= min, roomId: mine.roomId, roomName: mine.room.name, buildingId: place[mine.roomId]?.[0] ?? null, floor: place[mine.roomId]?.[1] ?? null } : null,
      canEdit: false,
    });
  }],
  [/^\/api\/campus\/map\/usage$/, () => ok({ weeks: 4, from: at(-28).slice(0, 10), to: at(0).slice(0, 10), rooms: 6, bookings: 18,
    grid: Array.from({ length: 7 }, (_, dw) => Array.from({ length: 14 }, (_, h) => (dw > 4 ? 0 : Math.round(Math.max(0, Math.sin(((h - 1) / 12) * Math.PI)) * (0.5 + 0.1 * (dw % 3)) * 100) / 100))),
    use: [{ id: 'sample-r-b', name: 'Lecture Hall 2', hours: 64, share: 0.32 }, { id: 'sample-r-a', name: 'Room 402 · CS Block', hours: 48, share: 0.24 }, { id: 'sample-r-lab', name: 'Lab 3', hours: 40, share: 0.2 }, { id: 'sample-r-s1', name: 'Group study room 1', hours: 22, share: 0.11 }, { id: 'sample-r-c', name: 'Design Studio', hours: 14, share: 0.07 }, { id: 'sample-r-s2', name: 'Quiet pod 3', hours: 3, share: 0.02 }] })],
  [/^\/api\/campus\/lost-found$/, ({ db: d, q }) => ok([
    { id: 'sample-lf1', kind: 'FOUND', title: 'Blue water bottle', description: 'Left in Lecture Hall 2 after the 10am class.', photoUrl: null, location: 'Lecture Hall 2 → now at the front desk', status: 'OPEN', createdAt: at(-1, 11), expiresAt: at(29), reporter: { id: d.classmates[0]?.id ?? 'sample-u1', name: d.classmates[0]?.name ?? 'Rohan', avatar: null } },
    { id: 'sample-lf2', kind: 'LOST', title: 'Calculator (Casio fx-991)', description: 'Name sticker on the back.', photoUrl: null, location: 'Library, 2nd floor', status: 'OPEN', createdAt: at(-3, 15), expiresAt: at(27), reporter: { id: d.classmates[1]?.id ?? 'sample-u2', name: d.classmates[1]?.name ?? 'Ishita', avatar: null } },
  ].filter((x) => !q.get('kind') || x.kind === q.get('kind')).filter(() => q.get('mine') !== '1'))],
  // Smart study planner: a week of study sessions around classes (Study planner)
  [/^\/api\/student\/smart-plan$/, ({ db: d }) => {
    const code = (i: number) => d.courses[i % Math.max(1, d.courses.length)]?.code ?? 'CS301';
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(Date.now() + i * 86_400_000).toISOString().slice(0, 10);
      const blocks = d.teacherView || i === 6 ? [] : [
        { id: `sample-b${i}a`, date, start: '17:00', end: '18:00', kind: i % 3 === 0 ? 'QUIZ' : 'DEADLINE', title: i % 3 === 0 ? 'Prepare for the weekly quiz' : 'Work on the lab report (part 1)', courseCode: code(i), done: i === 0, pinned: false, movedFrom: null },
        ...(i % 2 ? [{ id: `sample-b${i}b`, date, start: '18:30', end: '19:00', kind: 'FLASHCARDS', title: 'Review due flashcards', courseCode: null, done: false, pinned: false, movedFrom: null }] : []),
      ];
      return { date, busy: i < 5 ? [{ start: '09:00', end: '12:00' }] : [], blocks };
    });
    return ok({ prefs: { capMin: 120, start: '16:00', end: '21:00', ical: false }, note: null, days });
  }],
  // Early help: a study plan from a teacher (shown in the Study planner)
  [/^\/api\/student\/support-plans$/, ({ db: d }) => ok({ plans: d.teacherView ? [] : [{
    id: 'sample-plan', course: { code: d.courses[0]?.code ?? 'CS301', name: d.courses[0]?.name ?? 'Operating Systems' }, from: d.courses[0]?.teacher.name ?? 'Your teacher',
    message: 'Come to office hours on Thursday if anything is unclear.', stepsDone: [0], active: true, createdAt: at(-2, 10),
    plan: {
      intro: `Hi ${d.me.name.split(' ')[0]}, here are a few steps to get the most out of this week.`,
      steps: [
        { title: 'Redo the scheduling practice questions', detail: 'Work through the FCFS and Round Robin examples from week 3 without looking at the answers first.', minutes: 40 },
        { title: 'Review your lab 2 feedback', detail: 'Read the comments on the concurrency criterion and fix the two points mentioned.', minutes: 30 },
        { title: 'Make 10 flashcards on deadlocks', detail: 'One card per condition and per prevention strategy, then review them twice this week.', minutes: 25 },
      ],
      closing: 'Reply to me in Messages any time if you want to talk it through.',
    },
  }] })],
  // Parent accounts (Stage 5 · B16.1): none linked in the sample.
  [/^\/api\/student\/guardian-accounts$/, () => ok({ links: [], code: null })],
  [/^\/api\/parent\/children$/, () => ok({ children: [] })],
  // Report cards (Stage 5 · B15.3): none in the sample.
  [/^\/api\/report-cards\/mine$/, () => ok({ cards: [] })],
  [/^\/api\/admin\/report-cards$/, () => ok({ runs: [], school: 'Sample University' })],
  // Question bank (Stage 5 · B4.1): empty in the sample.
  [/^\/api\/courses\/([^/]+)\/question-bank$/, () => ok({ questions: [], difficulties: ['EASY', 'MEDIUM', 'HARD'] })],
  // Gradebook categories (Stage 5 · B3.4): none in the sample, so finals are plain averages.
  [/^\/api\/courses\/([^/]+)\/grade-categories$/, () => ok({ categories: [], assessments: [] })],
  // Course calendar (Stage 5 · B2): the sample course's events.
  [/^\/api\/courses\/([^/]+)\/calendar$/, ({ db: d, m }) => {
    const c = course(d, m[1]);
    if (!c) return fail('Course not found.', 404);
    const events = ((d.board[c.id]?.events ?? []) as { id: string; title: string; startAt: string; endAt: string; type: string }[]);
    return ok({ course: { id: c.id, code: c.code, name: c.name }, canManage: false, weekly: [], items: events.map((e) => ({ id: e.id, kind: 'event', title: e.title, at: e.startAt, endAt: e.endAt, note: e.type === 'EXAM' ? 'Exam' : 'Event', href: null })) });
  }],
  // Class list (Stage 5 · B2): no limit, requests or sections in the sample.
  [/^\/api\/courses\/([^/]+)\/enrolment$/, ({ db: d, m }) => {
    const c = course(d, m[1]);
    if (!c) return fail('Course not found.', 404);
    return ok({ canManage: false, capacity: null, students: [], requests: [], waitlist: [], sections: [] });
  }],
  // Teaching team (Stage 5 · B2): just the teacher in the sample.
  [/^\/api\/courses\/([^/]+)\/staff$/, ({ db: d, m }) => {
    const c = course(d, m[1]);
    if (!c) return fail('Course not found.', 404);
    return ok({ canEdit: d.teacherView && c.teacher.id === d.me.id, teacher: { id: c.teacher.id, name: c.teacher.name, email: 'teacher@sample.edu', avatar: null }, staff: [] });
  }],
  // Discussion board (Stage 5 · B2): one answered question to look at.
  [/^\/api\/courses\/([^/]+)\/discussion$/, ({ db: d, m }) => {
    const c = course(d, m[1]);
    if (!c) return fail('Course not found.', 404);
    const canManage = d.teacherView && c.teacher.id === d.me.id;
    const at = new Date(Date.now() - 3 * 3600_000).toISOString();
    return ok({ course: { id: c.id, code: c.code, name: c.name }, canManage, threads: [
      { id: 'sample-thread', kind: 'QUESTION', title: 'When do we use a while loop instead of a for loop?', excerpt: 'I get the syntax but not when to pick which one.', pinned: false, locked: false, answered: true, endorsed: true, votes: 4, replies: 2, voted: false, author: { id: null, name: 'Anonymous classmate', avatar: null, staff: false, mine: false, anonymous: true }, createdAt: at, lastActivityAt: at },
    ] });
  }],
  [/^\/api\/courses\/([^/]+)\/discussion\/([^/]+)$/, ({ db: d, m }) => {
    const c = course(d, m[1]);
    if (!c) return fail('Course not found.', 404);
    const canManage = d.teacherView && c.teacher.id === d.me.id;
    const at = new Date(Date.now() - 3 * 3600_000).toISOString();
    const teacher = { id: c.teacher.id, name: c.teacher.name, avatar: null, staff: true, mine: false, anonymous: false };
    return ok({ course: { id: c.id, code: c.code, name: c.name }, canManage,
      thread: { id: m[2], kind: 'QUESTION', title: 'When do we use a while loop instead of a for loop?', body: 'I get the syntax but not when to pick which one.', pinned: false, locked: false, answered: true, votes: 4, voted: false, editedAt: null, createdAt: at, author: { id: null, name: 'Anonymous classmate', avatar: null, staff: false, mine: false, anonymous: true }, canEdit: false, canDelete: false, canAccept: false, canReply: true },
      replies: [
        { id: 'sample-reply-1', body: 'Use a for loop when you know how many times to repeat (each item in a list). Use a while loop when you repeat until something happens, like until the user types "quit".', votes: 6, voted: false, endorsed: true, accepted: true, editedAt: null, createdAt: at, author: teacher, canEdit: false, canDelete: false },
        { id: 'sample-reply-2', body: 'This helped me: a for loop counts, a while loop waits.', votes: 2, voted: false, endorsed: false, accepted: false, editedAt: null, createdAt: at, author: { id: 'sample-student', name: 'Priya Sharma', avatar: null, staff: false, mine: false, anonymous: false }, canEdit: false, canDelete: false },
      ] });
  }],
  // Course modules (Stage 5 · B2): three units made from the course's sample materials and quiz.
  // Common Cartridge export (Stage 5 · B2): the sample course's modules, so the download works.
  [/^\/api\/courses\/([^/]+)\/cartridge$/, ({ db: d, m }) => {
    const c = course(d, m[1]);
    if (!c) return fail('Course not found.', 404);
    return ok({ course: { code: c.code, name: c.name, description: null }, modules: [
      { title: 'Getting started', summary: null, items: [{ id: 'sm-i1', kind: 'PAGE', title: 'Welcome and course plan', body: `Welcome to ${c.name}!\n\nEach week has a module: read the slides, try the practice, then take the short quiz.`, rich: false }] },
      { title: 'Week 2', summary: null, items: [{ id: 'sm-i5', kind: 'VIDEO', title: 'Lecture recording', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }] },
    ] });
  }],
  // Hand-in receipts (Stage 5 · B3.5): none are made in sample mode.
  [/^\/api\/assignments\/receipts$/, () => ok({ valid: false })],
  // Adaptive practice (Stage 5 · B4.4): nothing to practise in sample mode.
  [/^\/api\/courses\/[^/]+\/practice$/, () => ok({ next: null, stats: { today: 0, rightFirst: 0 } })],
  // Short answers to check (Stage 5 · B4.1): none in sample mode.
  [/^\/api\/quizzes\/[^/]+\/short-answers$/, () => ok({ accepted: [], wrong: [] })],
  // Writing replays (Stage 5 · B3.6): none are kept in sample mode.
  [/^\/api\/assignments\/submissions\/[^/]+\/replay$/, () => fail('No writing replay was kept for this answer.', 404)],
  // The school's grading scale (Stage 5 · B3.4): the standard one.
  [/^\/api\/grade-scale$/, () => ok({ scale: [{ letter: 'A', min: 90, gpa: 4 }, { letter: 'B', min: 80, gpa: 3 }, { letter: 'C', min: 70, gpa: 2 }, { letter: 'D', min: 60, gpa: 1 }, { letter: 'F', min: 0, gpa: 0 }], maxGpa: 4, custom: false, canEdit: false })],
  // Grade history (Stage 5 · B3.4): none in sample mode.
  [/^\/api\/courses\/([^/]+)\/grade-history$/, () => ok([])],
  // Notes on a hand-in (Stage 5 · B3.3): none in sample mode.
  [/^\/api\/assignments\/submissions\/([^/]+)\/notes$/, () => ok({ notes: [], canEdit: false })],
  // Peer review (Stage 5 · B3.2): nothing to review in sample mode.
  [/^\/api\/assignments\/([^/]+)\/peer$/, () => ok({ rubric: [], maxScore: 0, peerDueDate: null, open: true, toDo: [], received: [], receivedLater: false })],
  // A rich lesson page (Stage 5 · B2): a callout, a video with chapters, a quick check and flashcards.
  [/^\/api\/courses\/([^/]+)\/modules\/([^/]+)$/, ({ m }) => {
    if (m[2] !== 'sm-i8') return fail('That page isn’t there any more.', 404);
    const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
    return ok({ id: 'sm-i8', title: 'How to study each week', body: JSON.stringify({ type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Three steps a week' }] },
      p('Watch the short lecture, try the practice question, then go over the key words.'),
      { type: 'callout', attrs: { tone: 'tip' }, content: [p('Little and often works best: twenty minutes a day beats three hours on Sunday.')] },
      { type: 'embed', attrs: { kind: 'youtube', src: 'dQw4w9WgXcQ', title: 'This week’s lecture', chapters: '0:00 Welcome\n0:43 What we cover\n1:55 How to practise' } },
      { type: 'quickCheck', attrs: { question: 'Which way of studying helps you remember more?', options: ['Reading the notes again', 'Testing yourself without looking', 'Highlighting'], answer: 1, explain: 'Pulling an answer out of memory makes it stick (it’s called retrieval practice).' } },
      { type: 'flashcards', attrs: { title: 'Key words', cards: [{ front: 'Retrieval practice', back: 'Testing yourself to remember something' }, { front: 'Spacing', back: 'Studying a little at a time, over days' }, { front: 'Interleaving', back: 'Mixing different kinds of problems' }] } },
    ] }) });
  }],
  [/^\/api\/courses\/([^/]+)\/modules$/, ({ db: d, m }) => {
    const c = course(d, m[1]);
    if (!c) return fail('Course not found.', 404);
    const canManage = d.teacherView && c.teacher.id === d.me.id;
    const b = d.board[c.id];
    const mats = (b?.materials ?? []) as { id: string; title: string; type: string; fileUrl: string }[];
    const quiz = d.quizzes.find((x) => x.courseId === c.id);
    const done = (d as SampleDb & { moduleDone?: Set<string> }).moduleDone ??= new Set(['sm-i1']);
    const item = (id: string, kind: string, title: string, extra: Record<string, unknown> = {}) => ({ id, kind, refId: null, title, body: null, url: null, href: null, meta: null, missing: false, done: done.has(id), doneCount: canManage ? 2 : undefined, ...extra });
    const mods = [
      { id: 'sm-1', title: 'Getting started', summary: 'How the course works and what you need.', items: [
        item('sm-i1', 'PAGE', 'Welcome and course plan', { body: `Welcome to ${c.name}!\n\nEach week has a module: read the slides, try the practice, then take the short quiz.` }),
        item('sm-i8', 'PAGE', 'How to study each week', { rich: true }),
        ...(mats[0] ? [item('sm-i2', 'FILE', mats[0].title, { refId: mats[0].id, href: mats[0].fileUrl, meta: mats[0].type })] : []),
      ] },
      { id: 'sm-2', title: 'Week 2', summary: null, items: [
        ...mats.slice(1, 3).map((x, i) => item(`sm-i${3 + i}`, 'FILE', x.title, { refId: x.id, href: x.fileUrl, meta: x.type })),
        item('sm-i5', 'VIDEO', 'Lecture recording', { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
        ...(quiz ? [item('sm-i6', 'QUIZ', quiz.title, { refId: quiz.id, href: canManage ? '/teacher/quizzes' : '/student/quizzes', meta: 'Due soon', done: !!d.submissions[quiz.id] })] : []),
      ] },
      { id: 'sm-3', title: 'Week 3', summary: 'Opens next week.', releaseAt: at(7, 8, 0), items: [item('sm-i7', 'PAGE', 'Reading for week 3', { body: 'Chapter 5, sections 1–3.' })] },
    ].map((x, i) => {
      const locked = !canManage && i === 2;
      const items = x.items.map((it) => (locked ? { ...it, href: null, body: null, url: null } : it));
      return { published: true, releaseAt: null, requireQuizId: null, requireScore: null, requireQuizTitle: null, summary: null, ...x, position: i, locked, lockReason: locked ? 'Opens next week' : null, items, doneItems: items.filter((it) => it.done).length };
    });
    const next = canManage ? null : mods.filter((x) => !x.locked).flatMap((x) => x.items.map((it) => ({ moduleId: x.id, itemId: it.id, done: it.done }))).find((x) => !x.done) ?? null;
    const choices = canManage ? { FILE: mats.map(({ id, title, type }) => ({ id, title, type })), QUIZ: d.quizzes.filter((x) => x.courseId === c.id).map(({ id, title, status }) => ({ id, title, status })), ASSIGNMENT: [], LIVE: [] } : null;
    return ok({ canManage, students: canManage ? d.classmates.length : 0, modules: mods, next: next && { moduleId: next.moduleId, itemId: next.itemId }, choices });
  }],
  [/^\/api\/courses\/([^/]+)\/board$/, ({ db: d, m }) => {
    const c = course(d, m[1]);
    if (!c) return fail('Course not found.', 404);
    const canManage = d.teacherView && c.teacher.id === d.me.id;
    const b = d.board[c.id];
    const base = { course: { ...c, _count: { enrollments: d.classmates.length + (canManage ? 0 : 1) } }, canManage, announcements: b.announcements, materials: b.materials, readings: b.readings, events: b.events, sessions: b.sessions ?? [] };
    if (canManage) {
      const roster = d.classmates.map((s) => {
        const gs = d.classGrades.filter((g) => g.courseId === c.id && g.studentId === s.id);
        return { id: s.id, name: s.name, email: s.email, graded: gs.length, average: gs.length ? Math.round(gs.reduce((a, g) => a + pct(g.score, g.maxScore), 0) / gs.length) : null };
      });
      const quizzes = d.quizzes.filter((x) => x.courseId === c.id).map((x) => ({ id: x.id, title: x.title, status: x.status, dueDate: x.dueDate, _count: { questions: x.questions.length, submissions: x.status === 'DRAFT' ? 0 : 4 } }));
      return ok({ ...base, quizzes, roster });
    }
    const grades = d.myGrades.filter((g) => g.courseId === c.id).map(({ id, assignmentName, score, maxScore, status, feedback, gradedAt }) => ({ id, assignmentName, score, maxScore, status, feedback, gradedAt }));
    const quizResults = d.quizzes.filter((x) => x.courseId === c.id && d.submissions[x.id]).map((x) => ({ id: `sub-${x.id}`, score: d.submissions[x.id].score, maxScore: d.submissions[x.id].maxScore, submittedAt: d.submissions[x.id].submittedAt, quiz: { id: x.id, title: x.title, status: x.status } }));
    return ok({ ...base, grades, quizResults });
  }],

  [/^\/api\/student\/overview$/, ({ db: d, q }) => {
    const dow = Number(q.get('dow') ?? (new Date().getDay() + 6) % 7);
    const stats = d.courses.map((c) => {
      const att = d.attendance.filter((a) => a.courseId === c.id);
      const attended = att.filter((a) => a.status !== 'ABSENT').length;
      const gs = d.myGrades.filter((g) => g.courseId === c.id);
      return { id: c.id, code: c.code, name: c.name, color: c.color, emoji: null, attendance: att.length ? Math.round((attended / att.length) * 100) : null, averageGrade: gs.length ? Math.round(gs.reduce((a, g) => a + pct(g.score, g.maxScore), 0) / gs.length) : null };
    });
    const allAtt = d.attendance.length ? Math.round((d.attendance.filter((a) => a.status !== 'ABSENT').length / d.attendance.length) * 100) : null;
    const avg = d.myGrades.length ? Math.round(d.myGrades.reduce((a, g) => a + pct(g.score, g.maxScore), 0) / d.myGrades.length) : null;
    const upcoming = d.quizzes.filter((x) => x.status === 'PUBLISHED' && !d.submissions[x.id] && new Date(x.dueDate) > new Date())
      .map((x) => ({ id: x.id, title: x.title, dueDate: x.dueDate, course: { code: course(d, x.courseId)!.code, name: course(d, x.courseId)!.name } }));
    return ok({
      name: d.me.name,
      stats: { courses: d.courses.length, attendance: allAtt, averageGrade: avg, upcoming: upcoming.length, impactPoints: d.xp },
      level: levelInfo(d.xp),
      courses: stats,
      schedule: d.slots.filter((s) => s.dayOfWeek === dow).map((s) => ({ id: s.id, start: s.startTime, end: s.endTime, type: s.type, room: s.room.name, course: { code: s.course.code, name: s.course.name, color: s.course.color } })),
      upcoming,
      recentGrades: [...d.myGrades].sort((a, b) => +new Date(b.gradedAt) - +new Date(a.gradedAt)).slice(0, 5).map((g) => ({ id: g.id, name: g.assignmentName, course: g.course.code, percent: Math.round(pct(g.score, g.maxScore)), gradedAt: g.gradedAt })),
    });
  }],

  // The home pages' layout, Up next, goal, needs-attention list and live numbers (Stage 5 · Q8).
  [/^\/api\/home$/, ({ db: d }) => {
    const now = new Date();
    const dow = (now.getDay() + 6) % 7;
    const todayAt = (hhmm: string) => { const [h, mi] = hhmm.split(':').map(Number); const t = new Date(now); t.setHours(h, mi, 0, 0); return t.getTime(); };
    const layout = { order: [], hidden: [], goal: 3 };
    const role = d.me.role;
    const classes = (d.slots as any[]).filter((s) => s.dayOfWeek === dow && (!d.teacherView || d.taught.some((c: any) => c.id === s.courseId)))
      .map((s) => ({ kind: 'class', id: s.id, title: s.course.name, sub: `${s.course.code} · ${String(s.type).toLowerCase()} · ${s.room.name}`, start: todayAt(s.startTime), end: todayAt(s.endTime), href: d.teacherView ? `/teacher/blackboard?course=${s.courseId}` : `/student/courses/${s.courseId}` }));
    if (role === 'ADMIN') return ok({ layout, upNext: [], live: { attendance: { marked: 412, present: 389, absent: 23 }, fees: [{ currency: 'INR', today: 4_850_000, month: 61_200_000, payments: 7 }], safety: { open: 2, high: 0 }, active: { now: 37, today: 318 }, pending: 4 } });
    if (d.teacherView) {
      return ok({
        layout, upNext: [...classes, { kind: 'grade', id: 'grade', title: '6 to grade', sub: '2 handed in late', count: 6, href: '/teacher/assignments' }],
        attention: {
          toGrade: 6, late: 2,
          missing: [{ id: 'sample-a-essay', title: 'Scheduling essay', code: 'CS301', due: now.getTime() - 2 * 86_400_000, missing: 3 }],
          atRisk: { total: 1, students: [{ id: d.people.liam.id, name: d.people.liam.name, code: 'CS220', score: 72 }] },
          questions: { total: 2, threads: [{ id: 'sample-t-1', title: 'Is the deadlock example in the notes right?', code: 'CS301', courseId: 'sample-c-os', at: now.getTime() - 3 * 3_600_000 }, { id: 'sample-t-2', title: 'Will hashing be on the quiz?', code: 'CS220', courseId: 'sample-c-ds', at: now.getTime() - 26 * 3_600_000 }] },
        },
      });
    }
    const quizzes = (d.quizzes as any[]).filter((x) => x.status === 'PUBLISHED' && !d.submissions[x.id] && new Date(x.dueDate) > now && +new Date(x.dueDate) - +now < 7 * 86_400_000)
      .map((x) => ({ kind: 'quiz', id: x.id, title: x.title, sub: course(d, x.courseId)?.code, due: +new Date(x.dueDate), href: '/student/quizzes' }));
    const day = (n: number) => { const t = new Date(now); t.setDate(t.getDate() - n); return t.toISOString().slice(0, 10); };
    const week = [6, 5, 4, 3, 2, 1, 0].map((n, i) => ({ day: day(n), actions: [2, 4, 0, 3, 5, 1, 2][i] }));
    return ok({ layout, upNext: [...classes, ...quizzes], study: { today: 2, week } });
  }],

  [/^\/grades\/student$/, ({ db: d }) => ok({ grades: d.myGrades, summary: [] })],
  [/^\/grades\/course\/([^/]+)$/, ({ db: d, m }) => ok({ enrollments: d.classmates.map((s) => ({ student: s })), grades: d.classGrades.filter((g) => g.courseId === m[1]) })],

  [/^\/quizzes\/student\/my-quizzes$/, ({ db: d }) => ok(d.quizzes.filter((x) => x.status !== 'DRAFT').map((x) => {
    const sub = d.submissions[x.id];
    return { id: x.id, title: x.title, description: x.description, dueDate: x.dueDate, timeLimit: x.timeLimit, status: x.status, courseId: x.courseId, course: { name: course(d, x.courseId)?.name }, _count: { questions: x.questions.length }, completed: !!sub, score: sub ? Math.round(pct(sub.score, sub.maxScore)) : null };
  }))],
  [/^\/quizzes\/teacher\/my-quizzes$/, ({ db: d }) => ok(d.quizzes.filter((x) => d.taught.some((c) => c.id === x.courseId)).map((x) => ({
    id: x.id, title: x.title, course: course(d, x.courseId)?.name, questions: x.questions.length, timeLimit: x.timeLimit ? `${x.timeLimit} mins` : 'No limit', status: x.status, submissions: x.status === 'DRAFT' ? 0 : 4, dueDate: x.dueDate.split('T')[0],
  })))],
  [/^\/quizzes\/([^/]+)$/, ({ db: d, m }) => { const x = d.quizzes.find((z) => z.id === m[1]); return x ? ok(quizOut(d, x, d.teacherView)) : fail('Quiz not found', 404); }],
  [/^\/api\/quizzes\/([^/]+)\/result$/, ({ db: d, m }) => {
    const x = d.quizzes.find((z) => z.id === m[1]); const sub = x && d.submissions[x.id];
    if (!x || !sub) return fail('You haven’t submitted this quiz.', 404);
    return ok({ title: x.title, score: sub.score, maxScore: sub.maxScore, submittedAt: sub.submittedAt, revealed: true, questions: x.questions.map((qq: any) => { const credit = markAnswer(qq, sub.answers[qq.id]).credit; return { id: qq.id, type: typeOf(qq), question: qq.question, options: forStudent(qq, null).options, points: qq.points, yourAnswer: sub.answers[qq.id] ?? null, yourText: answerText(qq, sub.answers[qq.id]), correct: credit >= 1, credit, correctAnswer: qq.correctAnswer, rightOptions: typeOf(qq) === 'MULTI' ? metaOf(qq).correct ?? [] : [qq.correctAnswer] }; }) });
  }],
  [/^\/api\/quizzes\/([^/]+)$/, ({ db: d, m }) => {
    const x = d.quizzes.find((z) => z.id === m[1]); if (!x) return fail('Quiz not found.', 404);
    const c = course(d, x.courseId)!;
    const submissions = x.status === 'DRAFT' ? [] : d.classmates.slice(0, 4).map((s, i) => ({ id: `sub-${x.id}-${i}`, score: Math.max(0, x.questions.length - (i % 2)), maxScore: x.questions.length, submittedAt: at(-i - 1, 20), student: { name: s.name } }));
    return ok({ id: x.id, title: x.title, status: x.status, dueDate: x.dueDate, timeLimit: x.timeLimit, course: { name: c.name, code: c.code }, questions: x.questions, submissions });
  }],

  [/^\/timetable\/my$/, ({ db: d }) => ok(d.teacherView ? d.slots.filter((s) => d.taught.some((c) => c.id === s.courseId)) : d.slots)],
  [/^\/calendar\/my$/, ({ db: d }) => ok(d.calendar)],
  [/^\/attendance\/student$/, ({ db: d }) => {
    const map = new Map<string, any>();
    for (const a of d.attendance) { const k = `${a.courseId}:${a.status}`; const e = map.get(k) ?? { courseId: a.courseId, status: a.status, _count: { status: 0 } }; e._count.status++; map.set(k, e); }
    return ok({ records: d.attendance, summary: [...map.values()] });
  }],
  [/^\/attendance\/course\/([^/]+)$/, ({ db: d }) => ok({ enrollments: d.classmates.map((s) => ({ student: s })), attendance: [] })],
  [/^\/courses\/my-students$/, ({ db: d }) => ok(d.taught.flatMap((c) => d.classmates.map((s, i) => {
    const gs = d.classGrades.filter((g) => g.courseId === c.id && g.studentId === s.id);
    const avg = gs.length ? gs.reduce((a, g) => a + pct(g.score, g.maxScore), 0) / gs.length : 0;
    return { id: `${s.id}-${c.id}`, name: s.name, email: s.email, avatar: null, course: c.name, grade: avg >= 90 ? 'A' : avg >= 80 ? 'B' : avg >= 70 ? 'C' : avg >= 60 ? 'D' : 'F', attendance: [96, 88, 79, 92, 71][i % 5] };
  })))],

  [/^\/dashboard\/teacher$/, ({ db: d }) => {
    const gs = d.classGrades;
    const avg = gs.length ? Math.round(gs.reduce((a, g) => a + pct(g.score, g.maxScore), 0) / gs.length) : 0;
    const letter = (p: number) => (p >= 90 ? 'A' : p >= 80 ? 'B' : p >= 70 ? 'C' : p >= 60 ? 'D' : 'F');
    return ok({
      activeCourses: d.taught.length, totalStudents: d.classmates.length, pendingGrades: 3, avgClassScore: avg,
      myCourses: d.taught.map((c) => ({ id: c.id, name: c.name, code: c.code, students: d.classmates.length, completion: 100, color: c.color })),
      gradeDistributionData: ['A', 'B', 'C', 'D', 'F'].map((grade) => ({ grade, count: gs.filter((g) => letter(pct(g.score, g.maxScore)) === grade).length })),
      performanceTrendData: [5, 4, 3, 2, 1, 0].map((mAgo, i) => ({ month: new Date(new Date().getFullYear(), new Date().getMonth() - mAgo, 1).toLocaleString('en', { month: 'short' }), avgScore: [71, 74, 73, 78, 80, avg][i] })),
      recentStudents: gs.slice(0, 5).map((g) => { const s = Math.round(pct(g.score, g.maxScore)); return { name: g.student.name, course: course(d, g.courseId)!.name, score: s, status: s >= 85 ? 'excellent' : s >= 70 ? 'good' : 'needs-help' }; }),
    });
  }],
  [/^\/dashboard\/admin$/, ({ db: d }) => ok({
    totalStudents: 1240, totalTeachers: 86, totalCourses: 142, revenue: 18400,
    departments: [{ name: 'Computer Science', students: 420, teachers: 28, color: '#6366f1' }, { name: 'Environmental Studies', students: 260, teachers: 17, color: '#10b981' }, { name: 'Design', students: 180, teachers: 12, color: '#ec4899' }, { name: 'Business', students: 380, teachers: 29, color: '#f59e0b' }],
    recentPayments: [{ name: d.people.aarav.name, type: 'TUITION', amount: 1200, status: 'completed' }, { name: d.people.zoya.name, type: 'HOSTEL', amount: 450, status: 'pending' }, { name: d.people.liam.name, type: 'EXAM_FEE', amount: 60, status: 'completed' }],
    pendingUsers: [{ id: 'sample-pu-1', name: 'Rohan Das', role: 'STUDENT', dept: 'Computer Science', applied: new Date().toLocaleDateString() }, { id: 'sample-pu-2', name: 'Dr. Leena Joseph', role: 'TEACHER', dept: 'Design', applied: new Date().toLocaleDateString() }],
  })],

  [/^\/api\/notifications$/, ({ db: d }) => ok(d.notifications)],
  // Attendance (Stage 5 · Q11): the register, the class call, excuses and the location check.
  [/^\/api\/attendance\/register\/([^/]+)$/, ({ db: d, m, q }) => {
    const c = course(d, m[1]) ?? d.courses[0];
    const day = q.get('day') ?? new Date().toISOString().slice(0, 10);
    const marks = ['PRESENT', 'PRESENT', 'LATE', 'ABSENT', 'PRESENT'];
    return ok({
      course: { id: c.id, code: c.code, name: c.name }, day,
      students: (d.classmates as any[]).map((s, i) => ({ id: s.id, name: s.name, email: s.email, avatar: null, mark: i === 3 ? null : marks[i % 5], record: { attended: 8 - (i % 3), counted: 9, rate: (8 - (i % 3)) / 9 }, recent: ['PRESENT', 'PRESENT', i === 2 ? 'ABSENT' : 'LATE', 'PRESENT'], chronic: false })),
      pendingExcuses: 1, seating: { rows: 3, cols: 4, seats: { '0-0': d.classmates[0].id, '0-1': d.classmates[1].id, '1-2': d.classmates[2].id } },
    });
  }],
  [/^\/api\/attendance\/register\/[^/]+\/call$/, () => ok({ day: new Date().toISOString().slice(0, 10), length: 0, threshold: 0.75, suggestions: [] })],
  [/^\/api\/attendance\/register\/[^/]+\/excuses$/, ({ db: d }) => ok([{ id: 'sample-ex-1', date: new Date(Date.now() - 86_400_000).toISOString(), reason: 'I had a fever and stayed home.', fileUrl: null, fileName: null, status: 'PENDING', note: null, student: { id: d.classmates[1].id, name: d.classmates[1].name }, course: { code: d.courses[0].code, name: d.courses[0].name } }])],
  [/^\/api\/attendance\/excuses$/, () => ok([])],
  [/^\/api\/attendance\/policy$/, () => ok({ on: false, radius: 300, lat: null, lng: null })],
  // Search everywhere (Stage 5 · Q10): the sample courses and quizzes by name.
  [/^\/api\/search$/, ({ db: d, q }) => {
    const term = (q.get('q') ?? '').toLowerCase().trim();
    if (term.length < 2) return ok({ results: [] });
    const has = (t: string) => t.toLowerCase().includes(term);
    return ok({ results: [
      ...(d.courses as any[]).filter((c) => has(`${c.name} ${c.code} ${c.description ?? ''}`)).map((c) => ({ type: 'course', id: c.id, title: c.name, subtitle: c.code, href: d.teacherView ? `/teacher/blackboard?course=${c.id}` : `/student/courses/${c.id}` })),
      ...(d.quizzes as any[]).filter((x) => has(`${x.title} ${x.description ?? ''}`)).map((x) => ({ type: 'assignment', id: x.id, title: x.title, subtitle: course(d, x.courseId)?.code, snippet: x.description ?? undefined, href: d.teacherView ? '/teacher/quizzes' : '/student/quizzes' })),
    ] });
  }],
  // The notification centre and its settings (Stage 5 · Q9).
  [/^\/api\/notifications\/centre$/, ({ db: d, q }) => {
    const group = q.get('group'), unreadOnly = q.get('unread') === '1';
    const all = (d.notifications as any[]).map((n) => ({ ...n, group: GROUP_OF_TYPE(n.type), course: null }));
    const unread: Record<string, number> = {};
    for (const n of all) if (!n.read) unread[n.group] = (unread[n.group] ?? 0) + 1;
    return ok({ items: all.filter((n) => (!group || n.group === group) && (!unreadOnly || !n.read)), next: null, unread, snoozed: 0 });
  }],
  [/^\/api\/notifications\/settings$/, ({ db: d }) => ok({
    prefs: DEFAULT_PREFS, groups: NOTE_GROUPS.map(({ id, label, hint }) => ({ id, label, hint })),
    courses: d.courses.map((c: any) => ({ id: c.id, code: c.code, name: c.name })), devices: 0, nextDigest: null,
  })],
  [/^\/api\/chat\/conversations$/, ({ db: d }) => ok({ conversations: d.conversations.map((c) => summary(d, c)).sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (+new Date(b.activityAt) - +new Date(a.activityAt))), me: d.me.id })],
  [/^\/api\/chat\/folders$/, () => ok({ folders: [] })],
  [/^\/api\/chat\/communities\/[^/]+\/moderation$/, () => ok({ reports: [], resolved: [], timeouts: [], automod: { words: [], mode: 'BLOCK' }, log: [] })],
  // School chat apps (Stage 5 · Q20): one example command in the "/" menu.
  [/^\/api\/chat\/apps$/, () => ok({ commands: [{ name: 'library', hint: 'Find a book in the school library', app: 'Library desk' }] })],
  [/^\/api\/chat\/snippets$/, () => ok({ max: 50, snippets: [{ id: 'sample-s1', title: 'Deadline reminder', shortcut: 'due', body: 'Hi {name}, a quick reminder: the lab report is due soon.' }] })],
  [/^\/api\/tasks$/, () => ok({ courses: [], boards: [], mine: [] })],
  [/^\/api\/docs$/, () => ok({ courses: [], docs: [] })],
  [/^\/api\/collab\/pins$/, () => ok({ pins: [] })],
  [/^\/api\/spaces$/, () => ok({ courses: [], groups: [] })],
  [/^\/api\/docs\/([^/]+)$/, () => fail('Documents aren’t in the sample yet.', 404)],
  [/^\/api\/tasks\/([^/]+)$/, () => fail('Task boards aren’t in the sample yet.', 404)],
  [/^\/api\/tasks\/items\/([^/]+)\/comments$/, () => ok([])],
  [/^\/api\/chat\/starred$/, ({ db: d }) => ok(d.conversations.flatMap((c) => visible(d, c).filter((m: any) => d.starred.has(m.id)).map((m: any) => ({ ...decorateMsg(d, m), chat: { id: c.id, title: c.title } }))))],
  [/^\/api\/chat\/conversations\/([^/]+)\/messages$/, ({ db: d, m, q }) => {
    const c = d.conversations.find((x) => x.id === m[1]); if (!c) return fail('Conversation not found.', 404);
    const term = q.get('q')?.toLowerCase();
    if (term) return ok({ results: visible(d, c).filter((m: any) => m.type !== 'DELETED' && `${m.body} ${m.attachmentName ?? ''}`.toLowerCase().includes(term)).reverse().map((m: any) => ({ id: m.id, body: m.body, type: m.type, attachmentName: m.attachmentName, createdAt: m.createdAt, sender: { id: m.sender.id, name: m.sender.name } })) });
    c.unread = 0;
    if (c.prefs) c.prefs.markedUnread = false;
    if (q.get('before')) return ok({ conversation: null, typing: [], messages: [], hasMore: false, me: d.me.id });
    return ok({
      conversation: { id: c.id, isGroup: c.isGroup, isOfficial: c.isOfficial, title: c.title, avatarUrl: null, myRole: 'ADMIN', disappearingSec: c.disappearingSec ?? null, pinned: !!c.prefs?.pinned, muted: !!c.prefs?.muted, archived: !!c.prefs?.archived, members: c.members.map((u: any) => ({ id: u.id, name: u.name, avatar: null, role: u.role, groupRole: u.id === d.me.id ? 'ADMIN' : 'MEMBER', online: u.id !== d.people.meera.id, lastSeenAt: at(0, 8), lastReadAt: new Date().toISOString() })) },
      typing: [], messages: visible(d, c).map((m: any) => decorateMsg(d, m)), hasMore: false, me: d.me.id,
    });
  }],
  [/^\/api\/chat\/users$/, ({ db: d, q }) => { const s = (q.get('q') ?? '').toLowerCase(); return ok(d.directory.filter((u) => u.name.toLowerCase().includes(s)).map((u) => ({ id: u.id, name: u.name, avatar: null, role: u.role, online: u.role === 'STUDENT' }))); }],
  [/^\/api\/chat\/incoming$/, () => ok([])],

  [/^\/groups$/, ({ db: d }) => ok(d.groups.map((g) => groupOut(d, g)))],
  [/^\/groups\/my$/, ({ db: d }) => ok(d.groups.filter((g) => g.joined).map((g) => ({ id: `m-${g.id}`, groupId: g.id, userId: d.me.id, role: 'MEMBER', group: groupOut(d, g) })))],
  [/^\/api\/groups\/activity$/, ({ db: d }) => ok(d.groups.filter((g) => g.joined).flatMap((g) => (d.groupPosts[g.id] ?? []).map((p) => ({ ...p, author: { id: p.author.id, name: p.author.name }, group: { id: g.id, name: g.name, category: g.category } }))).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)))],
  // Wellbeing radar (Stage 5 · D13): off in the sample.
  [/^\/api\/wellbeing$/, () => ok({ optedIn: false, counsellorOk: false, today: new Date().toISOString().slice(0, 10), checkins: [], nudges: [], requests: [], requestsGoTo: 'counsellors' })],
  [/^\/api\/wellbeing\/requests$/, () => ok({ requests: [] })],
  // Honest AI receipts (Stage 5 · D12): no AI help recorded in the sample.
  [/^\/api\/assignments\/([^/]+)\/ai-receipt$/, () => ok({ policy: 'FREE', since: new Date().toISOString(), uses: [] })],
  [/^\/api\/me\/ai-uses$/, () => ok({ keepDays: 180, uses: [] })],
  // Staff leave allowances (Stage 5 · Q22).
  [/^\/api\/staff\/settings$/, () => ok({ leaveDays: { SICK: 12, PERSONAL: 10, TRAINING: 0, OTHER: 0 }, yearStartMonth: 1 })],
  [/^\/api\/core\/quizzes\/([^/]+)\/ai-receipt$/, () => ok({ policy: 'FREE', since: new Date().toISOString(), during: false, uses: [] })],
  [/^\/api\/orals\/([^/]+)\/ai-receipt$/, () => ok({ policy: 'FREE', since: new Date().toISOString(), during: true, uses: [] })],
  // Oral practice and oral checks (Stage 5 · D11): none in the sample (the examiner needs AI).
  [/^\/api\/orals$/, () => ok({ checks: [], practice: [] })],
  [/^\/api\/orals\/([^/]+)$/, () => ok({ error: 'Not found.' }, 404)],
  [/^\/api\/courses\/([^/]+)\/oral-checks$/, () => ok({ checks: [], canManage: false })],
  [/^\/api\/oral-checks\/([^/]+)$/, () => ok({ error: 'Oral check not found.' }, 404)],
  // Course materials as text (Stage 5 · D8): no files are read in the sample.
  [/^\/api\/courses\/([^/]+)\/materials\/([^/]+)\/read$/, () => ok({ title: 'Sample material', status: 'NONE', error: null, sourceId: null, sections: [], canPrepare: false, canManage: false })],
  // In-person class (Stage 5 · D7): one sample class in memory for the visit.
  [/^\/api\/classroom$/, ({ db: d }) => ok({ session: classroom(d).on ? { id: 'sample-class' } : null })],
  [/^\/api\/classroom\/current$/, () => ok({ session: null })],
  // Stage 5 · D17: what a teacher can send to phones as moving QR codes.
  [/^\/api\/classroom\/relay$/, () => ok({
    announcements: [{ id: 'ann_sample_1', title: 'Lab moved to Room 204', createdAt: '2026-10-13T08:00:00.000Z', problem: null }],
    quizzes: [{ id: 'quiz_sample_1', title: 'Week 5 check', questions: 6, problem: null }, { id: 'quiz_sample_2', title: 'Diagrams quiz', questions: 4, problem: 'Has pictures' }],
  })],
  [/^\/api\/classroom\/([^/]+)\/code$/, () => ok({ code: 'ABC234', expiresIn: 30 })],
  [/^\/api\/classroom\/([^/]+)$/, ({ db: d }) => ok({
    id: 'sample-class', course: { id: d.courses[0]?.id ?? 'sample', code: d.courses[0]?.code ?? 'CS101', name: d.courses[0]?.name ?? 'Sample course' }, startedAt: classroom(d).startedAt, open: true, classSessionId: null, enrolled: 24,
    mood: { lost: 3, ok: 12, total: 18 }, notes: 0, pulse: [],
    questions: [{ id: 'q1', text: 'Why does the loop stop at n - 1?', answeredAt: null, createdAt: classroom(d).startedAt }, { id: 'q2', text: 'Will this be in the quiz?', answeredAt: classroom(d).startedAt, createdAt: classroom(d).startedAt }],
  })],
  // Project autopilot (Stage 5 · D6): a plan and reports kept in memory for the visit.
  [/^\/api\/courses\/([^/]+)\/group-projects$/, () => ok({ projects: [] })],
  [/^\/api\/groups\/([^/]+)\/autopilot\/plan$/, ({ db: d, m }) => ok({ plan: autopilot(d).plans[m[1]] ?? null, candidateMeetingSlots: sampleSlots(d) })],
  [/^\/api\/groups\/([^/]+)\/autopilot\/meeting-slots$/, ({ db: d }) => ok({ slots: sampleSlots(d) })],
  [/^\/api\/groups\/([^/]+)\/autopilot\/reports$/, ({ db: d, m }) => ok({ reports: autopilot(d).reports[m[1]] ?? [] })],
  [/^\/api\/groups\/([^/]+)\/posts$/, ({ db: d, m }) => ok({ posts: [...(d.groupPosts[m[1]] ?? [])].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)), isMember: !!d.groups.find((g) => g.id === m[1])?.joined, myId: d.me.id })],
  [/^\/api\/groups\/([^/]+)$/, ({ db: d, m }) => {
    const g = d.groups.find((x) => x.id === m[1]); if (!g) return fail('Group not found.', 404);
    return ok({ id: g.id, name: g.name, description: g.description, isPublic: g.isPublic, members: g.members.map((u: any, i: number) => ({ role: i === 0 ? 'ADMIN' : 'MEMBER', joinedAt: at(-20 + i), user: { id: u.id, name: u.name, avatar: null } })), isMember: g.joined, files: [] });
  }],

  [/^\/impact\/ngo-projects$/, ({ db: d }) => ok(d.ngoProjects)],
  [/^\/impact\/my-level$/, ({ db: d }) => ok({ ...levelInfo(d.xp), userName: d.me.name, levels: LEVELS })],
  // Points earned in the chosen period (week, month, semester); each person's share differs, so the order changes like it would.
  [/^\/impact\/leaderboard$/, ({ db: d, q }) => {
    const share = ({ week: [0.05, 0.11, 0.09, 0.14, 0.12, 0.3], month: [0.18, 0.26, 0.22, 0.31, 0.28, 0.6], semester: [0.62, 0.7, 0.58, 0.74, 0.66, 0.9] } as Record<string, number[]>)[q.get('period') ?? ''];
    if (!share) return ok(d.leaderboard);
    return ok(d.leaderboard.map((u, i) => ({ ...u, totalPoints: Math.round(u.totalPoints * share[i % share.length]) })).sort((a, b) => b.totalPoints - a.totalPoints));
  }],
  [/^\/impact\/dashboard\/stats$/, ({ db: d }) => ok({
    userName: d.me.name, totalPoints: d.xp, verifiedHours: Math.floor(d.xp / 10), completedNGOs: 2, grants: 0, activities: d.impactActivities, levelInfo: levelInfo(d.xp),
    sdgBadges: [{ num: 4, name: 'SDG 4 Objective', hours: 50, partner: 'City Learning Trust', status: 'Completed', color: 'from-rose-500 to-red-600' }, { num: 11, name: 'SDG 11 Objective', hours: 80, partner: 'Green Roots NGO', status: 'Completed', color: 'from-amber-500 to-orange-600' }],
  })],
  [/^\/impact\/startups$/, ({ db: d }) => ok(d.startups)],
  [/^\/impact\/summits$/, ({ db: d }) => ok(d.summits)],
  [/^\/consents\/my$/, () => ok([])],
  [/^\/medical\/my$/, () => ok(null)],
  [/^\/electives\/(available|my|major-requests)$/, () => ok([])],
  [/^\/impact\/summits\/my-registrations$/, ({ db: d }) => ok(d.summitRegs.map((id) => ({ id: `reg-${id}`, summitId: id, userId: d.me.id, registeredAt: at(-2), summit: d.summits.find((s) => s.id === id) })))],
  [/^\/impact\/blockchain-credentials$/, ({ db: d }) => ok(d.credentials)],

  [/^\/internships$/, ({ db: d }) => ok(d.internships)],
  [/^\/internships\/my-applications$/, ({ db: d }) => ok(d.myApplications)],
  [/^\/api\/internships\/placements$/, ({ db: d }) => ok(d.placements)],
  [/^\/api\/internships\/skills-match$/, () => ok(SAMPLE_SKILLS_MATCH)],
  [/^\/api\/profile\/([^/]+)$/, ({ db: d, m }) => { const p = Object.values(d.people).find((x) => x.id === decodeURIComponent(m[1]) || x.name === decodeURIComponent(m[1])) ?? d.people.zoya; return ok({ id: p.id, name: p.name, avatar: null, role: p.role, coverUrl: null, pronouns: p.id === d.people.zoya.id ? 'she/her' : null, bio: p.role === 'TEACHER' ? 'I teach operating systems and run the robotics club’s workshops.' : 'Second-year CS student. Into robotics, open data and chai.', links: [{ label: 'GitHub', url: 'https://github.com/' }], availability: p.role === 'TEACHER' ? 'Office hours Tue and Thu, 2–4 pm' : 'Usually free on Friday afternoons', memberSince: at(-200), department: 'Computer Science', year: p.role === 'STUDENT' ? 2 : null, designation: p.role === 'TEACHER' ? 'Associate Professor' : null, shared: [] }); }],
  [/^\/api\/campus\/clubs\/[^/]+\/elections$/, () => ok(sampleElections())],
  [/^\/api\/campus\/clubs\/[^/]+\/budget$/, () => ok(sampleBudget())],
  [/^\/api\/campus\/board$/, ({ db: d, q }) => ok(sampleBoard(d, q.get('section') ?? 'market', q.get('mine') === '1'))],
  [/^\/api\/admin\/campus-board$/, ({ db: d }) => ok({ listings: [{ id: 'sample-l9', kind: 'SELL', title: 'Exam answers for sale', description: 'All the answers for next week.', price: 50_000, status: 'HIDDEN', reports: 3, createdAt: at(-1), user: { id: d.people.diego.id, name: d.people.diego.name }, reportRows: [{ reason: 'Cheating', createdAt: at(-1) }, { reason: 'Not allowed', createdAt: at(-1) }, { reason: 'Scam', createdAt: at(0) }] }] })],
  [/^\/api\/campus\/meals$/, ({ db: d }) => ok(sampleMeals(d))],
  [/^\/api\/admin\/meal-orders$/, ({ db: d }) => ok({ menus: sampleMeals(d).menus.map((m, i) => { const orders = i ? [] : [{ id: 'sample-o1', items: [{ dish: m.dishes[0], qty: 2 }], pickupAt: at(0, 12, 45), note: null, code: 'K7QM', status: 'PLACED', user: { name: d.people.zoya.name } }, { id: 'sample-o2', items: [{ dish: m.dishes[1] ?? m.dishes[0], qty: 1 }], pickupAt: at(0, 13), note: 'No onions', code: 'B4RT', status: 'READY', user: { name: d.people.liam.name } }]; return { ...m, orders, prep: prepList(orders.filter((o) => o.status === 'PLACED')) }; }) })],
  [/^\/api\/impact\/donations$/, ({ q }) => ok(q.get('projectId') ? { raised: { INR: 1_250_000 }, donors: 14, supporters: ['Zoya', 'Liam', 'Ananya'] } : { donations: [{ id: 'sample-donation-1', projectName: 'Weekend Maths Tutoring', ngoName: 'City Learning Trust', amount: 50_000, currency: 'INR', status: 'PAID', receipt: 'D-000012', paidAt: at(-6), with80G: true }] })],
  [/^\/api\/impact\/donations\/([^/]+)$/, () => ok({ number: 'D-000012', status: 'PAID', paidAt: at(-6), amount: 50_000, currency: 'INR', project: 'Weekend Maths Tutoring', ngo: 'City Learning Trust', donor: { name: 'Sample Student', email: null, pan: 'ABCDE1234F', address: '12 Sample Street, Bengaluru' }, collectedBy: 'Sample School', payment: { method: 'Card (Stripe)', reference: 'pi_sample' }, tax80G: { ngoPan: 'AAATS0000A', reg80G: 'AAATS0000A20240', donorPanGiven: true } })],
  [/^\/api\/admin\/donations$/, () => ok({ ngos: [{ id: 'sample-ngo-1', name: 'City Learning Trust', donationsOn: true, reg80G: 'AAATS0000A20240', pan: 'AAATS0000A', isVerified: true, projects: 2, raised: [{ currency: 'INR', amount: 1_250_000, count: 14 }] }, { id: 'sample-ngo-2', name: 'Green Roots NGO', donationsOn: false, reg80G: null, pan: null, isVerified: true, projects: 1, raised: [] }], donations: [{ id: 'sample-donation-1', receipt: 'D-000012', paidAt: at(-6), status: 'PAID', amount: 50_000, currency: 'INR', projectName: 'Weekend Maths Tutoring', ngoName: 'City Learning Trust', donorName: 'Zoya Khan', donorEmail: null, pan: null, address: null, anonymous: false }] })],
  [/^\/api\/campus\/clubs\/[^/]+\/carbon$/, ({ db: d }) => ok(carbonView(d))],
  [/^\/api\/careers\/applications$/, ({ db: d }) => ok(careers(d).apps)],
  [/^\/api\/careers\/interview$/, ({ db: d }) => ok({ answers: careers(d).answers })],
  [/^\/api\/careers\/mentors$/, ({ db: d }) => ok({ mentors: careers(d).mentors.map((m) => ({ ...m, slots: m.slots.filter((s: any) => !careers(d).bookings.some((b) => b.slotId === s.id && b.status === 'CONFIRMED')) })) })],
  [/^\/api\/careers\/mentoring$/, ({ db: d }) => ok(mentoringView(careers(d)))],
  [/^\/api\/careers\/alerts$/, ({ db: d }) => ok({ on: careers(d).alerts })],
  [/^\/mentorship\/mentors$/, ({ db: d }) => ok(careers(d).mentors.map((m) => ({ id: m.id, company: m.company, jobTitle: m.jobTitle, skills: m.skills, hoursCommitted: 6, isAvailable: true, isAlumni: m.isAlumni, gradYear: m.gradYear, user: { id: m.user.id, name: m.user.name, avatar: null } })))],
  [/^\/api\/receipts\/([^/]+)$/, ({ m }) => ok({ id: m[1], amount: 499, currency: 'INR', description: 'Course fee: Data Structures', createdAt: '2026-10-10T09:30:00.000Z', user: { name: 'Alex Johnson', email: 'student@example.com' } })],
  [/^\/partners$/, ({ db: d }) => ok(d.partners)],
  [/^\/skills\/my$/, ({ db: d }) => ok(d.skills)],
  [/^\/tickets$/, ({ db: d }) => ok(d.tickets)],
  [/^\/associations$/, ({ db: d }) => ok(d.associations)],
  [/^\/associations\/my-memberships$/, ({ db: d }) => ok(d.myMemberships)],
  [/^\/knowledge-hub(\/public)?$/, ({ db: d }) => ok(d.knowledge)],
  [/^\/documents\/my$/, ({ db: d }) => ok(d.documents)],
  [/^\/scholarships$/, ({ db: d }) => ok(d.scholarships)],
  [/^\/scholarships\/my-applications$/, ({ db: d }) => ok(d.myScholarships)],
  [/^\/api\/campus-items$/, ({ db: d, q }) => ok(d.campusItems.filter((c) => !q.get('kind') || c.kind === q.get('kind')))],
  [/^\/api\/me$/, ({ db: d }) => ok(d.profile)],

  // ── Admin ──
  [/^\/users$/, ({ db: d, q }) => ok(d.users.filter((u) => !q.get('role') || u.role === q.get('role')))],
  [/^\/courses\/admin\/all$/, ({ db: d }) => ok(d.courses.map((c) => ({ ...c, teacher: { id: c.teacher.id, name: c.teacher.name }, _count: { enrollments: d.classmates.length + 1, ...counts(d, c.id) } })))],
  [/^\/announcements$/, ({ db: d }) => ok(d.adminAnnouncements)],
  [/^\/quizzes$/, ({ db: d }) => ok(d.quizzes.map((x) => ({ id: x.id, title: x.title, status: x.status, dueDate: x.dueDate, timeLimit: x.timeLimit, courseId: x.courseId, course: { name: course(d, x.courseId)?.name } })))],
  [/^\/impact\/certificates\/pending$/, ({ db: d }) => ok(d.pendingCertificates)],
  [/^\/safety$/, () => ok([])],
  [/^\/api\/assignments$/, () => ok([])],
  [/^\/api\/admin\/school-analytics$/, ({ q }) => {
    const many = q.get('metrics');
    if (many) return ok({ results: many.split(',').filter(isMetricId).slice(0, 4).map((id) => sampleMetric(id)) });
    const id = q.get('metric');
    return isMetricId(id) ? ok(sampleMetric(id, { days: Number(q.get('days')) || null, order: q.get('order'), department: q.get('department') })) : fail('Unknown measure.');
  }],
  [/^\/api\/admin\/insights$/, () => ok({ totals: { students: 0, teachers: 0, courses: 0, grade30: null, attendance30: null, flaggedStudents: 0 }, atRisk: [], departments: [], teachers: [] })],
  [/^\/api\/student\/guardians$/, () => ok({ enabled: false, contacts: [] })],
  [/^\/api\/code$/, () => ok({ courses: [], rooms: [] })],
  [/^\/api\/calls$/, () => ok([])],
  [/^\/api\/chat\/status$/, () => ok([])],
  [/^\/api\/chat\/communities$/, () => ok([])],
  [/^\/api\/chat\/communities\/discover$/, () => ok([
    { id: 'sample-open-1', name: 'Climate Action Network', description: 'Students across campuses working on climate projects', color: '#059669', members: 214, campus: 'Lakeside University' },
    { id: 'sample-open-2', name: 'Women in Tech', description: 'Mentoring, events and job tips', color: '#7c3aed', members: 98, campus: null },
  ])],
  [/^\/api\/network$/, () => ok(sampleNetwork())],
  [/^\/api\/network\/courses$/, ({ db: d }) => ok(d.courses.slice(0, 4).map((c, i) => ({ id: c.id, code: c.code, name: c.name, status: 'PUBLISHED', teacher: c.teacher.name, students: 24 + i * 7, home: { id: 'sample-campus-1', name: 'Riverside University' }, sharedWith: i === 0 ? [{ id: 'sample-campus-2', name: 'Lakeside University' }] : [] })))],
  [/^\/api\/network\/exchange$/, () => ok([
    { id: 'sample-ex-1', name: 'Lena Fischer', email: 'lena.fischer@example.edu', home: 'Riverside University', host: 'Lakeside University', from: at(-20), until: at(70), now: true },
  ])],
  [/^\/api\/network\/joint$/, () => ok({ courses: [
    { id: 'sample-joint-1', code: 'LAK210', name: 'Urban Water Systems', description: 'How cities manage water, with field data from both campuses.', credits: 4, color: '#0891b2', teacher: 'Dr. Hana Sato', campus: 'Lakeside University', viaExchange: false, enrolled: false, students: 31 },
    { id: 'sample-joint-2', code: 'MTN105', name: 'Data Ethics', description: null, credits: 3, color: '#7c3aed', teacher: 'Prof. Omar Haddad', campus: 'Mountain Institute', viaExchange: false, enrolled: true, students: 58 },
  ], exchange: null })],
  [/^\/api\/calls\/favorites$/, () => ok([])],
  [/^\/api\/me\/presence$/, () => ok({ presence: 'auto', statusText: null, statusEmoji: null, statusUntil: null, effective: { presence: 'auto', hidden: false } })],
  [/^\/api\/chat\/search$/, () => ok([])],
  [/^\/api\/calls\/scheduled$/, ({ q }) => ok(q.get('rooms') ? { classes: [], groups: [], chats: [] } : [])],
  [/^\/api\/live$/, ({ q }) => ok(q.get('courseId') ? { enrolled: 0, polls: [] } : [])],
  // Live quiz game (Stage 5 · B4.5): none in sample mode.
  [/^\/api\/live\/game$/, () => ok({ game: null })],
  [/^\/impact\/blockchain-credentials\/pending$/, ({ db: d }) => ok(d.pendingCredentials)],
  [/^\/collaborations\/projects$/, ({ db: d }) => ok(d.projects)],
  [/^\/collaborations\/projects\/([^/]+)$/, ({ db: d, m }) => { const p = d.projects.find((x) => x.id === m[1]); return p ? ok({ ...p, members: [], milestones: [] }) : fail('Not found', 404); }],
  [/^\/partners\/partnerships$/, ({ db: d }) => ok(d.partnerships)],
  [/^\/api\/admin\/rooms$/, ({ db: d }) => ok(d.adminRooms)],
  [/^\/rooms$/, ({ db: d }) => ok(d.adminRooms.map((r) => { const c = { ...r }; delete (c as { reservations?: unknown }).reservations; return c; }))],
  [/^\/api\/admin\/timetable$/, ({ db: d }) => ok({ slots: d.slots, courses: d.courses.map((c) => ({ id: c.id, code: c.code, name: c.name })), rooms: Object.values(d.rooms).map((r: any) => ({ id: r.id, name: r.name })) })],
  // The skills passport's CV data and portfolio (Stage 5 · Q14): the sample student, no public portfolio.
  [/^\/api\/passport\/cv$/, ({ db: d }) => ok({ name: d.me?.name ?? 'Sample Student', avatar: null, department: null, headline: 'Computer science student', memberSince: new Date(Date.now() - 200 * 86_400_000).toISOString(), strengths: null, theme: 'indigo', portfolioUrl: null, skills: [{ name: 'Python', category: null, level: 'INTERMEDIATE', endorsements: 2 }], evidence: [], credentials: [], courses: d.courses.slice(0, 3).map((c: any) => ({ code: c.code, name: c.name, credits: 3, department: null })), impact: { hours: 0, people: 0, credentials: 0, points: 0 } })],
  [/^\/api\/p\/[^/]+$/, () => fail('This portfolio doesn’t exist or isn’t public.', 404)],
  [/^\/api\/passport\/did$/, () => fail('Credential signing isn’t set up in the sample.', 503)],
  // The course tutor's rule and the class's common questions (Stage 5 · Q13): open, and none yet.
  [/^\/api\/tutor\/[^/]+\/rule$/, () => ok({ hintsOnly: false, off: false, offUntil: null, note: '' })],
  [/^\/api\/tutor\/[^/]+\/questions$/, () => ok({ since: new Date(Date.now() - 90 * 86_400_000).toISOString(), asked: 0, students: 0, groups: [] })],
  // The timetable and exam generators (Stage 5 · Q12): the sample's courses, rooms with seats, and courses sharing students.
  [/^\/api\/admin\/timetable\/plan$/, ({ db: d }) => ok({
    courses: d.courses.map((c: any, i: number) => ({ id: c.id, code: c.code, name: c.name, department: c.department ?? null, color: c.color ?? null, teacherId: `sample-t-${i % 2}`, teacher: i % 2 ? 'Tara Teacher' : 'Demo Teacher', students: 24 + i * 6 })),
    rooms: Object.values(d.rooms).map((r: any, i: number) => ({ id: r.id, name: r.name, capacity: [40, 120, 30, 24][i % 4], type: 'CLASSROOM' })),
    slots: d.slots.map((x: any) => ({ id: x.id, courseId: x.courseId, dayOfWeek: x.dayOfWeek, startTime: x.startTime, endTime: x.endTime, roomId: x.roomId ?? x.room?.id ?? null, type: x.type ?? 'LECTURE' })),
    overlaps: d.courses.slice(1).map((c: any, i: number) => [d.courses[i].id, c.id, 10 + i]),
    exams: [],
  })],
  [/^\/api\/premium\/analytics$/, ({ db: d }) => ok(d.analytics)],
  // A study pack in another language (Stage 4 · 4.1): the sample's packs are shown as they are.
  [/^\/api\/class-sessions\/([^/]+)\/translation$/, () => ok({ same: true, pack: null })],
  // Ask your semester (Stage 4 · 4.5): the sample's semester isn't indexed.
  [/^\/api\/semester$/, () => ok({ results: [], pending: 0 })],
  // Fair group work (Stage 4 · 4.3): the sample's spaces have no tracked work yet.
  [/^\/api\/spaces\/(course|group)\/([^/]+)\/contributions$/, () => ok({ days: 30, used: [], totals: {}, canManage: false, canVerify: false, ratings: false, size: 0, people: [], me: null, teammates: [] })],
  // Call recordings (Stage 4 · 2.9): the sample has none.
  [/^\/api\/call-recordings\/([^/]+)$/, () => fail('This recording isn’t available in the sample.', 404)],
  // Meeting notes (Stage 4 · 2.8): the sample has none.
  [/^\/api\/meeting-notes\/([^/]+)$/, () => fail('These notes aren’t available in the sample.', 404)],
  // Smart replay search (Stage 4 · 4.6): the sample's classes have no transcript.
  [/^\/api\/class-sessions\/([^/]+)\/replay$/, () => ok({ results: [] })],
  // Lecture to Everything: Micro-Lessons & Revision Reels (Stage 5 · D3)
  [/^\/api\/courses\/([^/]+)\/micro-lessons$/, () => ok([SAMPLE_MICRO_LESSON])],
  [/^\/api\/micro-lessons$/, () => ok([SAMPLE_MICRO_LESSON])],
  [/^\/api\/class-sessions\/([^/]+)\/micro-lesson$/, () => ok(SAMPLE_MICRO_LESSON)],
  // Impact-to-Scholarship Exchange (Stage 5 · D4)
  [/^\/api\/scholarships\/pools$/, () => ok(SAMPLE_IMPACT_POOLS)],
  [/^\/api\/scholarships\/claims$/, () => ok(SAMPLE_IMPACT_CLAIMS)],
  [/^\/api\/scholarships\/credits\/ledger$/, () => ok(SAMPLE_IMPACT_LEDGER)],
  [/^\/api\/scholarships\/verify\/([^/]+)$/, () => ok({
    verified: true,
    awardTitle: 'Clean Energy & Climate Innovation Fellowship',
    sponsorName: 'Global EcoTech Foundation',
    sponsorType: 'NGO',
    recipientName: 'Alice Scholar',
    awardAmount: 2500,
    currency: 'USD',
    academicStanding: 'HONORS',
    issuedAt: '2026-10-10T14:30:00.000Z',
    approvedBy: 'Dean Roberts',
    signatureProof: '8a9b23c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2',
  })],
  [/^\/api\/tutoring\/time-bank$/, () => ok(SAMPLE_TIME_BANK_LEDGER)],
  [/^\/api\/tutoring\/tutors$/, () => ok({ tutors: SAMPLE_TUTORS, pagination: { page: 1, limit: 20, total: 2, totalPages: 1 } })],
  [/^\/api\/tutoring\/tutors\/mastered-subjects$/, () => ok(SAMPLE_MASTERED_SUBJECTS)],
  [/^\/api\/tutoring\/slots$/, () => ok(SAMPLE_TUTOR_SLOTS)],
  [/^\/api\/tutoring\/sessions$/, () => ok(SAMPLE_TUTOR_SESSIONS)],
  [/^\/api\/tutoring\/sessions\/([^/]+)$/, () => ok(SAMPLE_TUTOR_SESSIONS[0])],
  // Safe by default (Stage 4 · 4.10): no flags in the sample; the default policy; quiet hours off.
  [/^\/api\/safety\/flags$/, () => ok({ open: 0, flags: [] })],
  [/^\/api\/safety\/flags\/([^/]+)$/, () => ok({ messages: [] })],
  [/^\/api\/safety\/policy$/, () => ok({ guard: true, recordMinors: false, quietMinors: true, quietStart: '22:00', quietEnd: '07:00', studentsMinors: false, parentMessaging: true, open: 0, ai: false })],
  [/^\/api\/me\/quiet$/, () => ok({ on: false, start: '22:00', end: '07:00', locked: false })],
  // Parent–teacher messages (Stage 5 · B16.2): the sample has no parent accounts.
  [/^\/api\/teacher\/parents$/, ({ q }) => ok({ allowed: true, student: { id: q.get('studentId') ?? '', name: 'Student' }, parents: [] })],
  [/^\/api\/teacher\/parent-hours$/, () => ok({ open: true, days: [1, 2, 3, 4, 5], start: '08:00', end: '16:00', timeZone: 'UTC', text: 'Mon–Fri, 08:00–16:00' })],
  // Registers (Stage 5 · B15.5): a school bus and a lent laptop.
  [/^\/api\/registers\/me$/, () => ok({ bus: { route: 'Route 3 · North', vehicle: 'KA 01 AB 1234', driver: 'Ravi', driverPhone: null, notes: 'Afternoon run leaves at 15:30.', stop: 'City Park', time: '07:42', stops: [{ name: 'Lake Road', time: '07:30' }, { name: 'City Park', time: '07:42' }, { name: 'School', time: '08:05' }] }, room: null, assets: [{ tag: 'A-204517', name: 'Laptop', category: 'IT' }] })],
  // Library (Stage 5 · B15.4): a few books, one borrowed.
  [/^\/api\/library$/, () => ok({ books: [
    { id: 'sample-book-1', isbn: '9780143107552', title: 'Thinking, Fast and Slow', authors: 'Daniel Kahneman', year: 2011, coverUrl: null, shelf: 'P2', copies: 3, available: 1, waiting: 0, myHold: null },
    { id: 'sample-book-2', isbn: null, title: 'Introduction to Algorithms', authors: 'Cormen, Leiserson, Rivest, Stein', year: 2009, coverUrl: null, shelf: 'C4', copies: 2, available: 0, waiting: 2, myHold: null },
  ] })],
  [/^\/api\/library\/me$/, () => ok({ rules: { loanDays: 14, maxRenewals: 2, maxLoans: 4, finePerDay: 500, currency: 'INR' }, out: [{ id: 'sample-loan-1', book: { id: 'sample-book-1', title: 'Thinking, Fast and Slow', authors: 'Daniel Kahneman', coverUrl: null }, issuedAt: at(-10), dueAt: at(4), renewals: 0, canRenew: true }], returned: [], holds: [], owed: 0, currency: 'INR' })],
  // Admissions (Stage 5 · B15.1): one open round.
  [/^\/api\/admissions$/, ({ db }) => ok({ school: 'Riverside University', courses: db.courses.slice(0, 6).map((c) => ({ id: c.id, code: c.code, name: c.name })), rounds: [
    { id: 'sample-adm-1', slug: 'admissions-2027-sample', title: 'Admissions 2027–28 · Year 1', opensAt: at(-14), closesAt: at(45), closedAt: null, open: true, phase: 'open', courseIds: [], total: 12, byStage: { RECEIVED: 5, REVIEW: 4, INTERVIEW: 1, OFFERED: 2 } },
  ] })],
  // School fees (Stage 5 · B15.2): one plan, partly collected; no student bills in the sample.
  [/^\/api\/fees\/report$/, () => ok({ totals: [{ currency: 'INR', bills: 4, billed: 9600000, discount: 400000, paid: 6000000, open: 3600000, overdue: 1200000, overdueBills: 1 }], byMethod: [{ currency: 'INR', method: 'UPI', total: 3600000, count: 3 }, { currency: 'INR', method: 'CASH', total: 2400000, count: 2 }], byMonth: [{ currency: 'INR', month: new Date().toISOString().slice(0, 7), total: 6000000 }], byStatus: { PAID: 2, PARTIAL: 1, DUE: 1 } })],
  [/^\/api\/fees\/plans$/, ({ db }) => ok({ currencies: ['INR', 'USD', 'EUR', 'GBP'], courses: db.courses.slice(0, 6).map((c) => ({ id: c.id, code: c.code, name: c.name })), plans: [
    { id: 'sample-fee-1', name: 'Term 1 2026–27', currency: 'INR', archived: false, createdAt: at(-30), to: 'Every student', courseId: null, items: [{ label: 'Tuition', amount: 2000000 }, { label: 'Transport', amount: 400000 }], instalments: [{ label: 'Instalment 1', dueAt: at(-10), amount: 1200000 }, { label: 'Instalment 2', dueAt: at(20), amount: 1200000 }], bills: 8, billed: 9600000, paid: 6000000, open: 3600000, overdue: 1200000 },
  ] })],
  [/^\/api\/fees\/invoices$/, () => ok({ invoices: [], shown: 0, owed: 0, currencies: [] })],
  [/^\/api\/student\/fees$/, () => ok({ bills: [], owed: {}, next: null, online: false })],
  // Parent meetings (Stage 5 · B16.3): an evening of times, one booked.
  [/^\/api\/teacher\/meetings$/, () => ok({ lengths: [10, 15, 20, 30, 45, 60], past: [], upcoming: [
    { id: 'sample-pm-1', startAt: at(2, 16), durationMin: 15, mode: 'VIDEO', location: null, topic: 'How Aarav is settling in after the move', bookedAt: at(-1), parent: { id: 'sample-parent-1', name: 'Priya Mehta', avatar: null, relation: 'Mother' }, student: { id: 's1', name: 'Aarav Mehta' }, notes: null, summary: null, summarySentAt: null },
    { id: 'sample-pm-2', startAt: at(2, 16, 15), durationMin: 15, mode: 'VIDEO', location: null, topic: null, bookedAt: null, parent: null, student: null, notes: null, summary: null, summarySentAt: null },
    { id: 'sample-pm-3', startAt: at(2, 16, 30), durationMin: 15, mode: 'VIDEO', location: null, topic: null, bookedAt: null, parent: null, student: null, notes: null, summary: null, summarySentAt: null },
  ] })],
  // Consent forms (Stage 5 · B16.4): one trip form, half answered (the sample has no parent accounts to sign).
  [/^\/api\/consent-forms$/, ({ db }) => ok({ canSendToSchool: db.me.role === 'ADMIN', courses: db.courses.slice(0, 6).map((c) => ({ id: c.id, code: c.code, name: c.name })), forms: [
    { id: 'sample-form-1', title: 'Science museum trip', dueAt: at(5, 23, 59), closed: false, createdAt: at(-2), from: db.me.name, to: 'Every student', students: 4, yes: 2, no: 0 },
  ] })],
  [/^\/api\/consent-forms\/([^/]+)$/, ({ db }) => ok({
    form: { id: 'sample-form-1', title: 'Science museum trip', body: 'We’re visiting the science museum on Friday, leaving at 9:00 and back by 15:00. Bring a packed lunch and a water bottle. The trip is free.', attachmentUrl: null, attachmentName: null, dueAt: at(5, 23, 59), allowDecline: true, closed: false, remindedAt: null, createdAt: at(-2), from: db.me.name, to: 'Every student' },
    counts: { students: 4, yes: 2, no: 0, waiting: 1, noParent: 1 },
    rows: [
      { studentId: 's1', name: 'Aarav Mehta', status: 'yes', answer: { by: 'Priya Mehta', signedName: 'Priya Mehta', signedAt: at(-1, 19), note: 'Peanut allergy: he has his own lunch.', drawn: true } },
      { studentId: 's2', name: 'Lena Fischer', status: 'yes', answer: { by: 'Jonas Fischer', signedName: 'Jonas Fischer', signedAt: at(-1, 8), note: null, drawn: false } },
      { studentId: 's3', name: 'Maya Chen', status: 'waiting', answer: null },
      { studentId: 's4', name: 'Omar Haddad', status: 'no-parent', answer: null },
    ],
  })],
  // Impact League (Stage 5 · D14): one open challenge with two teams; the sample student isn't in a team yet.
  [/^\/api\/impact-league$/, () => ok({ canCreate: false, challenges: [
    { id: 'sample-lg1', slug: 'clean-water-ideas', title: 'Clean water ideas', sdg: 6, sdgName: 'Clean water and sanitation', summary: 'Find a way to bring safe drinking water to a community near you.', status: 'OPEN', teamMin: 2, teamMax: 5, mixCampuses: false, isPublic: true, signupClosesAt: at(9, 23, 59), demoDayAt: at(24, 17), teams: 2, people: 5, signupOpen: true, demoOpen: false, myTeam: null, myRoles: [] },
  ] })],
  [/^\/api\/impact-league\/([^/]+)$/, ({ db: d }) => {
    const [a, b, c2] = d.classmates;
    const member = (u: { id: string; name: string }, campus: string, captain = false) => ({ id: u.id, name: u.name.split(' ')[0], avatar: null, campus, captain });
    const rubric = [
      { id: 'impact', name: 'Impact', desc: 'How much good it could do for the people affected.', max: 10 },
      { id: 'evidence', name: 'Evidence', desc: 'They talked to people affected and tested their idea.', max: 10 },
      { id: 'feasibility', name: 'Feasibility', desc: 'It could really be built and kept running.', max: 10 },
    ];
    return ok({
      challenge: {
        id: 'sample-lg1', slug: 'clean-water-ideas', title: 'Clean water ideas', sdg: 6, sdgName: 'Clean water and sanitation', summary: 'Find a way to bring safe drinking water to a community near you.',
        brief: 'Pick a community near one of our universities, talk to the people who live there, and build something small and real: a filter, a map of safe taps, a repair rota.',
        status: 'OPEN', teamMin: 2, teamMax: 5, mixCampuses: false, isPublic: true, creditHours: 20, signupClosesAt: at(9, 23, 59), demoDayAt: at(24, 17), finishedAt: null, updatedAt: at(-1),
        milestones: [
          { id: 'm1', title: 'Meet your team and pick the problem', notes: '', dueAt: at(5) },
          { id: 'm2', title: 'Talk to people affected', notes: '', dueAt: at(12) },
          { id: 'm3', title: 'Build a first version', notes: '', dueAt: at(19) },
          { id: 'm4', title: 'Get your pitch ready for demo day', notes: '', dueAt: at(23) },
        ],
        rubric,
        prizes: [{ id: 'p1', title: 'Best community impact', sponsor: 'BlueWell Foundation', description: 'A summer pilot with the foundation’s field team.', teamId: null, teamName: null }],
        publicUrl: '/league/clean-water-ideas',
      },
      me: { roles: [], organizer: false, judge: false, mentor: false, minor: false, teamId: null, captain: false, submitProblem: null, canJoin: true },
      people: [{ role: 'ORGANIZER', id: 'sample-t', name: 'Dr. Jane Smith', avatar: null, campus: 'Sample University' }, { role: 'MENTOR', id: 'sample-m', name: 'Ravi Menon', avatar: null, campus: null }],
      teams: [
        { id: 'sample-team1', name: 'Drop by Drop', lookingFor: 'Someone who likes building things with sensors.', status: 'FORMING', submittedAt: null, mine: false, mentoring: false, mentor: { id: 'sample-m', name: 'Ravi Menon' }, seats: 3, campuses: 2, members: [member(a, 'Sample University', true), member(b, 'Riverside College')], progress: { done: 1, total: 4 }, project: null },
        { id: 'sample-team2', name: 'Tap Map', lookingFor: '', status: 'SUBMITTED', submittedAt: at(-1), mine: false, mentoring: false, mentor: null, seats: 2, campuses: 1, members: [member(c2, 'Sample University', true), member(d.classmates[3], 'Sample University'), member(d.classmates[4], 'Sample University')], progress: { done: 4, total: 4 }, project: { title: 'A map of every safe tap in Riverside', pitch: 'We walked every street near campus and tested the water at 60 taps. Our map shows which are safe and who to call when one breaks.', link: '' } },
      ],
      demo: { at: at(24, 17), open: false, callId: 'lg_sample-lg1' },
      ranking: [],
      feedback: null,
    });
  }],
  // Impact rooms (Stage 4 · 4.12): one room, followed, with a planned impact call.
  [/^\/api\/impact-rooms$/, () => ok({ staff: false, rooms: [
    { id: 'sample-p1', name: 'Green City Drive', description: 'Planting trees and caring for them through their first summer.', location: 'Riverside Park', sdgNumber: 13, isPublic: true, ngo: { name: 'Earth Collective', logoUrl: null, isVerified: true }, followers: 18, following: 'VOLUNTEER', hours: 180, volunteers: 31, shifts: 9, nextCall: { startsAt: at(6, 17), title: 'Monthly impact call', open: false }, lastActivity: at(-1) },
    { id: 'sample-p2', name: 'Read Together', description: 'Reading clubs for children at the community library.', location: 'Community library', sdgNumber: 4, isPublic: false, ngo: { name: 'Bright Minds', logoUrl: null, isVerified: true }, followers: 7, following: null, hours: 96, volunteers: 14, shifts: 6, nextCall: null, lastActivity: at(-4) },
  ] })],
  [/^\/api\/impact-rooms\/([^/]+)$/, ({ db: d }) => ok({
    id: 'sample-p1', name: 'Green City Drive', description: 'Planting trees and caring for them through their first summer.', type: 'Field', location: 'Riverside Park', duration: '3 months', sdgNumber: 13, skills: ['Teamwork', 'Outdoor work'], active: true, isPublic: true, publicUrl: null,
    ngo: { name: 'Earth Collective', logoUrl: null, websiteUrl: null, sector: 'Environment', isVerified: true },
    total: { hours: 180, volunteers: 31, shifts: 9 }, month: { hours: 42, volunteers: 12, shifts: 2 }, pledged: { people: 6, hoursPerMonth: 38 },
    followers: { count: 18, byRole: { VOLUNTEER: 12, SPONSOR: 2, SUPPORTER: 4 }, people: d.classmates.slice(0, 5).map((u, i) => ({ id: u.id, name: u.name, avatar: null, role: 'STUDENT', followRole: i ? 'SUPPORTER' : 'VOLUNTEER' })) },
    following: 'VOLUNTEER', staff: false, canPost: true,
    pledge: { hoursPerMonth: 6, months: 3, skill: 'Outdoor work', note: null, startAt: at(-20), endsAt: at(70), running: true, hoursThisMonth: 4, hoursSoFar: 8 },
    updates: [
      { id: 'sample-u1', body: '120 saplings are in the ground. Thank you to everyone who came on Saturday!', kind: 'UPDATE', isPublic: true, callId: null, createdAt: at(-1), author: { id: 'sample-t', name: 'Dr. Jane Smith', avatar: null, role: 'TEACHER' }, mine: false, canDelete: false },
      { id: 'sample-u2', body: 'Can someone bring extra gloves next time? We ran out.', kind: 'UPDATE', isPublic: false, callId: null, createdAt: at(-3), author: { id: d.me.id, name: d.me.name, avatar: null, role: 'STUDENT' }, mine: true, canDelete: true },
    ],
    calls: { callId: 'i_sample-p1', canJoin: true, upcoming: [{ id: 'sample-c1', startsAt: at(6, 17), title: 'Monthly impact call', reportAt: null, open: false }], past: [] },
    shifts: [{ id: 'sample-sh1', title: 'Saturday tree planting', startAt: at(3, 9), endAt: at(3, 13), location: 'Riverside Park', left: 11 }],
  })],
  // Daily brief (Stage 4 · 4.9): the sample's day, from its timetable; no AI brief.
  [/^\/api\/brief$/, ({ db: d }) => {
    const wd = (new Date().getDay() + 6) % 7;
    const classes = (d.slots as { courseId: string; dayOfWeek: number; startTime: string; endTime: string; type?: string; room?: { name?: string } }[]).filter((x) => x.dayOfWeek === wd)
      .map((x) => { const c = d.courses.find((y) => y.id === x.courseId); return { courseId: x.courseId, code: c?.code ?? '', name: c?.name ?? '', start: x.startTime, end: x.endTime, type: x.type ?? 'LECTURE', room: x.room?.name ?? null }; });
    return ok({ day: new Date().toISOString().slice(0, 10), classes, due: [], calls: [], waiting: [], toGrade: 0, ai: null, aiOn: false, push: false, hour: 7 });
  }],
  // Watch together (Stage 4 · 4.8): the sample's courses have no videos (YouTube links still work).
  [/^\/api\/calls\/([^/]+)\/videos$/, () => ok({ videos: [] })],
  // Office hours (Stage 4 · 4.7): nobody in the sample keeps office hours right now.
  [/^\/api\/office-hours$/, ({ db: d }) => ok(d.me.role === 'TEACHER' || d.me.role === 'ADMIN' ? { role: 'teacher', open: false, until: null, topic: null, callId: 'o_sample', waiting: 0, inTurn: 0, avgMin: 5, notes: [] } : { role: 'student', open: [] })],
  [/^\/api\/office-hours\/notes$/, () => ok([])],
  [/^\/api\/billing\/subscription$/, () => ok({ organization: { id: 'sample-org', name: 'Sample University' }, plan: 'ENTERPRISE', subscribedPlan: 'ENTERPRISE', status: 'active', interval: 'year', currentPeriodEnd: at(200), cancelAtPeriodEnd: false, hasBillingAccount: false })],
  [/^\/api\/admin\/impact$/, ({ db: d }) => ok(d.adminImpact)],
  [/^\/documents$/, ({ db: d }) => ok(d.documents.map((doc) => ({ ...doc, issuedAt: doc.createdAt, user: { name: d.people.aarav.name } })))],
];

// ── Write routes (in-memory only) ──────────────────────────────────────
const WRITE: [string, RegExp, (c: Ctx) => Result][] = [
  ['POST', /^\/api\/campus\/events\/[^/]+\/buy$/, () => fail('Sample mode: no money is taken. Exit sample mode to buy a real ticket.', 400)],
  ['POST', /^\/api\/campus\/elections\/[^/]+\/vote$/, () => { notice(); return ok({ receipt: 'SAMP-LE00-RCPT' }); }],
  ['POST', /^\/api\/campus\/board\/[^/]+\/contact$/, () => ok({ conversationId: 'sample-conv-aarav' })],
  ['POST', /^\/api\/campus\/meals$/, ({ db: d, body }) => {
    const menu = sampleMeals(d).menus.find((m) => m.id === body?.menuId);
    if (!menu || !Array.isArray(body?.items) || !body.items.length) return fail('Pick at least one dish from the menu.', 400);
    notice();
    lifeQ17(d).orders.push({ id: sid('order'), items: body.items, pickupAt: body.pickupAt, note: body.note || null, code: 'SMPL', status: 'PLACED', menu: { title: menu.title, category: menu.category, location: menu.location } });
    return ok(sampleMeals(d));
  }],
  ['DELETE', /^\/api\/campus\/meals$/, ({ db: d, q }) => { notice(); const o = lifeQ17(d).orders.find((x) => x.id === q.get('order')); if (o) o.status = 'CANCELLED'; return ok(sampleMeals(d)); }],
  ['POST', /^\/api\/impact\/donations$/, () => fail('Sample mode: no money is taken. Exit sample mode to donate for real.', 400)],
  ['PATCH', /^\/api\/admin\/donations$/, () => { notice(); return ok({ ngos: [], donations: [] }); }],
  ['POST', /^\/api\/campus\/clubs\/[^/]+\/carbon$/, ({ db: d, body }) => {
    const kg = kgFor(body?.activity, body?.quantity);
    if (kg === null) return fail('Pick an activity and an amount above 0.', 400);
    notice();
    impactQ16(d).carbon.unshift({ id: sid('co2'), activity: String(body.activity), quantity: Number(body.quantity), kgCo2e: kg, note: body.note || null, occurredAt: body.occurredAt ?? new Date().toISOString(), by: d.me?.name ?? 'You', canDelete: true });
    return ok(carbonView(d));
  }],
  ['DELETE', /^\/api\/campus\/clubs\/[^/]+\/carbon$/, ({ db: d, q }) => { notice(); const c = impactQ16(d); c.carbon = c.carbon.filter((e) => e.id !== q.get('entry')); return ok(carbonView(d)); }],
  ['POST', /^\/api\/careers\/applications$/, ({ db: d, body }) => {
    notice();
    const c = careers(d);
    const old = body?.id ? c.apps.find((a) => a.id === body.id) : null;
    const next = { ...(old ?? { id: sid('app'), onUniverse: false, documents: [], url: null, location: null, appliedAt: at(0), nextStep: null, nextAt: null, notes: null, stage: 'APPLIED' }), ...body, updatedAt: new Date().toISOString() };
    c.apps = [next, ...c.apps.filter((a) => a.id !== next.id)];
    return ok(c.apps);
  }],
  ['DELETE', /^\/api\/careers\/applications$/, ({ db: d, q }) => { notice(); const c = careers(d); c.apps = c.apps.filter((a) => a.id !== q.get('id')); return ok(c.apps); }],
  ['POST', /^\/api\/careers\/interview$/, ({ db: d, body }) => {
    const role = String(body?.role ?? '').trim() || 'this role';
    if (body?.action === 'questions') return ok({ role, questions: builtInQuestions(role), ai: false, note: 'The sample has no AI: here are common questions.' });
    const answer = String(body?.answer ?? '');
    const words = wordCount(answer);
    if (words < 15) return fail('Say a bit more first: at least a few sentences.', 400);
    const fillers = countFillers(answer), star = starParts(answer);
    const row = { id: sid('ans'), role, question: String(body?.question ?? ''), fillers: fillers.total, star, score: null, createdAt: new Date().toISOString() };
    careers(d).answers.unshift(row);
    return ok({ id: row.id, createdAt: row.createdAt, checks: { words, minutes: Math.max(0.1, Math.round((words / 130) * 10) / 10), fillers, star, length: lengthAdvice(words) }, feedback: null, note: 'The sample has no AI feedback; the checks above still work.' });
  }],
  ['DELETE', /^\/api\/careers\/interview$/, ({ db: d, q }) => { const c = careers(d); c.answers = q.get('id') ? c.answers.filter((a) => a.id !== q.get('id')) : []; return ok({ answers: c.answers }); }],
  ['POST', /^\/api\/careers\/alerts$/, ({ db: d, body }) => { notice(); careers(d).alerts = body?.on !== false; return ok({ on: careers(d).alerts }); }],
  ['POST', /^\/api\/careers\/mentoring$/, ({ db: d, body }) => {
    notice();
    const c = careers(d);
    if (body?.action === 'book') {
      const m = c.mentors.find((x) => x.slots.some((s: any) => s.id === body.slotId));
      const slot = m?.slots.find((s: any) => s.id === body.slotId);
      if (!m || !slot) return fail('That time isn’t available any more.', 404);
      c.bookings.push({ id: sid('booking'), slotId: slot.id, at: slot.startAt, topic: String(body.topic ?? '').slice(0, 200), status: 'CONFIRMED', callId: null, with: { id: m.user.id, name: m.user.name }, as: 'student' });
    } else if (body?.action === 'cancel') {
      c.bookings = c.bookings.map((b) => (b.id === body.bookingId ? { ...b, status: 'CANCELLED' } : b));
    } else if (body?.action === 'profile') {
      c.profile = { id: 'sample-my-mentor', company: body.company || null, jobTitle: body.jobTitle || null, skills: Array.isArray(body.skills) ? body.skills.slice(0, 10) : [], isAlumni: !!body.isAlumni, gradYear: body.isAlumni ? body.gradYear ?? null : null, bio: body.bio || null, isAvailable: body.isAvailable !== false };
    } else if (body?.action === 'slots' && body.startAt) {
      const weeks = Math.min(8, Math.max(1, Number(body.weeks) || 1));
      for (let i = 0; i < weeks; i++) c.slots.push({ id: sid('slot'), startAt: new Date(new Date(body.startAt).getTime() + i * 7 * 86_400_000).toISOString(), minutes: Number(body.minutes) || 30, bookingId: null });
      c.slots.sort((a, b) => a.startAt.localeCompare(b.startAt));
    }
    return ok(mentoringView(c));
  }],
  ['DELETE', /^\/api\/careers\/mentoring$/, ({ db: d, q }) => { notice(); const c = careers(d); c.slots = c.slots.filter((x) => x.id !== q.get('slot')); return ok(mentoringView(c)); }],
  // Attendance changes (Stage 5 · Q11).
  ['POST', /^\/api\/attendance\/register\/[^/]+$/, ({ body }) => { notice(); return ok({ marked: Array.isArray(body?.marks) ? body.marks.length : 0 }); }],
  ['PUT', /^\/api\/attendance\/register\/[^/]+\/seating$/, ({ body }) => { notice(); return ok(body ?? {}); }],
  ['POST', /^\/api\/attendance\/excuses(\/[^/]+)?$/, () => { notice(); return ok({ ok: true }); }],
  ['PUT', /^\/api\/attendance\/policy$/, () => { notice(); return ok({ on: false, radius: 300, lat: null, lng: null }); }],
  // The CV's AI profile needs AI, which the sample doesn't have (Stage 5 · Q14).
  ['POST', /^\/api\/passport\/cv\/summary$/, () => fail('The sample has no AI. Write a short profile yourself.', 503)],
  // The tutor: its rule, the flashcard reminder; a homework photo needs AI, which the sample doesn't have (Stage 5 · Q13).
  ['PUT', /^\/api\/tutor\/[^/]+\/rule$/, ({ body }) => { notice(); return ok({ hintsOnly: !!body?.hintsOnly, off: !!body?.off, offUntil: body?.offUntil ?? null, note: body?.note ?? '' }); }],
  ['PUT', /^\/api\/tutor\/cards\/reminder$/, ({ body }) => { notice(); return ok({ reminder: !!body?.on, next: null }); }],
  ['POST', /^\/api\/tutor\/[^/]+\/photo$/, () => fail('The sample has no AI. Sign in to use the tutor with a photo.', 503)],
  // The timetable and exam generators, calendar events from a file (Stage 5 · Q12).
  ['POST', /^\/api\/admin\/timetable\/plan$/, ({ body }) => { notice(); return ok({ added: Array.isArray(body?.slots) ? body.slots.length : 0, removed: 0, kept: 0 }); }],
  ['POST', /^\/api\/admin\/timetable\/exams$/, ({ body }) => { notice(); return ok({ published: Array.isArray(body?.exams) ? body.exams.length : 0, replaced: 0, batch: 'exam:sample' }); }],
  ['DELETE', /^\/api\/admin\/timetable\/exams$/, () => { notice(); return ok({ removed: 0 }); }],
  ['POST', /^\/calendar\/import$/, ({ body }) => { notice(); return ok({ imported: Array.isArray(body?.events) ? body.events.length : 0, replaced: 0, name: 'Calendar' }); }],
  // Saving the home page's layout (Stage 5 · Q8).
  ['PUT', /^\/api\/home\/layout$/, ({ body }) => { notice(); return ok({ layout: body ?? {} }); }],
  // Reading levels (Stage 5 · D9): no AI in the sample, so no simpler versions (the original stays).
  ['POST', /^\/api\/reading-level$/, () => ok({ levels: {}, editable: [] })],
  ['POST', /^\/api\/reading-level\/text$/, () => ok({ error: 'Simpler versions aren’t available in the sample.' }, 503)],
  ["PATCH", /^\/api\/admin\/settings$/, ({ body }) => ok({ ok: true, organization: body })],
  ["PATCH", /^\/api\/admin\/sso$/, ({ body }) => ok({ ok: true, ...body })],
  ['PUT', /^\/api\/courses\/([^/]+)\/skills$/, ({ body }) => { notice(); return ok({ skills: Array.isArray(body?.skills) ? body.skills.slice(0, 6) : [] }); }],
  ['POST', /^\/api\/admin\/oneroster\/preview$/, () => ok({
    valid: true,
    summary: "OneRoster preview: 48 new users, 12 new classes, 84 memberships.",
    counts: {
      usersTotal: 48,
      usersToCreate: 48,
      usersExisting: 0,
      coursesTotal: 12,
      coursesToCreate: 12,
      coursesExisting: 0,
      enrollmentsTotal: 84,
      enrollmentsToCreate: 84,
      enrollmentsExisting: 0,
    },
    warnings: [],
    items: [],
  })],
  ['POST', /^\/api\/admin\/oneroster\/sync$/, () => {
    notice();
    return ok({
      status: "SUCCESS",
      summary: "OneRoster sync executed: 48 users provisioned, 12 classes mapped.",
      counts: { users: 48, classes: 12, enrollments: 84 },
    });
  }],
  // Developer Platform mutations (Stage 5 · C4)
  ['POST', /^\/api\/admin\/api-keys$/, ({ body }) => {
    notice();
    return ok({
      id: "key-sample-" + Date.now(),
      name: body?.name || "New API Key",
      keyPrefix: "uv_live_demo",
      scopes: body?.scopes || ["courses.read"],
      rateLimit: 300,
      expiresAt: null,
      createdAt: new Date().toISOString(),
      secretKey: "uv_live_sample_key_" + Math.random().toString(36).slice(2) + Date.now(),
    });
  }],
  ['DELETE', /^\/api\/admin\/api-keys\/[^/]+$/, () => {
    notice();
    return ok({ success: true, revokedAt: new Date().toISOString() });
  }],
  ['POST', /^\/api\/admin\/webhooks$/, ({ body }) => {
    notice();
    return ok({
      id: "wh-sample-" + Date.now(),
      url: body?.url || "https://example.edu/webhook",
      secret: "whsec_sample_" + Math.random().toString(36).slice(2),
      events: body?.events || ["assignment.submitted"],
      isActive: true,
      description: body?.description || null,
      createdAt: new Date().toISOString(),
      _count: { deliveries: 0 },
    });
  }],
  ['PATCH', /^\/api\/admin\/webhooks\/[^/]+$/, ({ body }) => {
    notice();
    return ok({ ok: true, ...body });
  }],
  ['DELETE', /^\/api\/admin\/webhooks\/[^/]+$/, () => {
    notice();
    return ok({ success: true });
  }],
  ['POST', /^\/api\/admin\/webhooks\/test$/, () => {
    notice();
    return ok({ dispatched: 1 });
  }],
  ['POST', /^\/api\/v1\/courses$/, ({ body }) => ok({
    id: "course-sample-new",
    code: body?.code || "CS102",
    name: body?.name || "Data Structures",
    status: "PUBLISHED",
  })],
  ['POST', /^\/api\/v1\/grades$/, ({ body }) => ok({
    id: body?.submissionId || "sub-1",
    score: body?.score || 100,
    feedback: body?.feedback || null,
  })],
  ['POST', /^\/api\/v1\/attendance$/, ({ body }) => ok({
    success: true,
    sessionId: body?.sessionId || "sess-1",
    count: Array.isArray(body?.records) ? body.records.length : 1,
  })],

  // Unified Payments & Checkout mutations (Stage 5 · C6)
  ['POST', /^\/api\/payments\/create-order$/, ({ body }) => {
    notice();
    return ok({
      orderId: "po-sample-" + Date.now(),
      provider: body?.currency === 'USD' ? 'STRIPE' : 'RAZORPAY',
      orderRef: "order_sample_" + Math.random().toString(36).slice(2),
      amount: body?.amount || 250000,
      currency: body?.currency || 'INR',
      keyId: "rzp_test_mock_12345",
      upiIntent: "upi://pay?pa=riverside%40icici&pn=Riverside+University&am=" + ((body?.amount || 250000) / 100).toFixed(2) + "&cu=INR&tr=order_123&tn=Fee+Payment",
      checkoutUrl: "https://checkout.stripe.com/pay/cs_test_sample",
    });
  }],
  ['POST', /^\/api\/payments\/verify$/, ({ body }) => {
    notice();
    return ok({
      success: true,
      orderId: body?.orderId || "po-sample-1",
      paymentRef: body?.paymentRef || "pay_mock_123",
      amount: 250000,
      currency: "INR",
      receiptNumber: 1042,
    });
  }],
  ['POST', /^\/api\/admin\/payments\/refund$/, ({ body }) => {
    notice();
    return ok({
      success: true,
      orderId: body?.orderId || "po-sample-1",
      refundId: "rfnd_sample_" + Date.now(),
      amount: body?.amount || 250000,
      status: "processed",
    });
  }],
  ['PATCH', /^\/api\/admin\/payments\/settings$/, ({ body }) => {
    notice();
    return ok({
      paymentProvider: body?.paymentProvider || "AUTO",
      razorpayKeyId: body?.razorpayKeyId || "rzp_test_sample",
      stripePublishableKey: body?.stripePublishableKey || "pk_test_sample",
    });
  }],

  // Content Marketplace & Course Packs mutations (Stage 5 · C7)
  ['POST', /^\/api\/marketplace\/packs\/([^/]+)\/import$/, ({ m, body }) => {
    notice();
    return ok({
      success: true,
      packId: m[1],
      courseId: body?.targetCourseId || 'sample-course-1',
      modulesImported: 3,
      itemsImported: 7,
    }, 201);
  }],
  ['POST', /^\/api\/marketplace\/packs\/([^/]+)\/reviews$/, ({ m, body }) => {
    notice();
    const pack = SAMPLE_MARKETPLACE_PACKS.find((p) => p.id === m[1] || p.slug === m[1]);
    const rev = {
      id: 'rev_sample_' + Date.now(),
      rating: body?.rating || 5,
      comment: body?.comment || null,
      createdAt: new Date().toISOString(),
      user: { id: 'usr_me', name: 'Dr. Jane Smith (You)' },
    };
    if (pack) {
      pack.reviews.unshift(rev);
      pack.reviewsCount++;
    }
    return ok(pack || rev);
  }],
  ['POST', /^\/api\/marketplace\/packs$/, ({ body }) => {
    notice();
    const newPack: SampleMarketplacePack = {
      id: 'pack_sample_' + Date.now(),
      authorId: 'usr_me',
      sourceCourseId: body?.sourceCourseId || null,
      title: body?.title || 'New Curriculum Pack',
      slug: (body?.title || 'new-pack').toLowerCase().replace(/\s+/g, '-'),
      summary: body?.summary || 'Curriculum pack published in sample mode.',
      description: body?.description || null,
      thumbnailUrl: null,
      category: body?.category || 'Computer Science',
      level: body?.level || 'ALL_LEVELS',
      priceMinor: Number(body?.priceMinor) || 0,
      currency: body?.currency || 'INR',
      modulesCount: 2,
      itemsCount: 4,
      estimatedHours: Number(body?.estimatedHours) || 8,
      ratingAvg: 5.0,
      reviewsCount: 1,
      downloadsCount: 0,
      revenueSharePct: 80,
      status: 'PUBLISHED',
      createdAt: new Date().toISOString(),
      author: {
        id: 'usr_me',
        name: 'Dr. Jane Smith (You)',
        email: 'jane.smith@riverside.edu',
      },
      modules: [
        {
          title: 'Module 1: Foundations & Scope',
          summary: 'Introduction and learning objectives.',
          position: 0,
          items: [
            { title: 'Welcome & Overview', kind: 'PAGE', position: 0 },
            { title: 'Foundational Video', kind: 'VIDEO', position: 1 },
          ],
        },
      ],
      reviews: [],
    };
    SAMPLE_MARKETPLACE_PACKS.unshift(newPack);
    return ok(newPack, 201);
  }],

  // Learning Analytics Warehouse mutations (Stage 5 · C8)
  ['POST', /^\/api\/analytics\/warehouse\/export$/, ({ body }) => {
    notice();
    const fmt = body?.format === 'JSON' ? 'JSON' : 'CSV';
    const fakeContent = fmt === 'CSV'
      ? 'statement_id,actor_id,verb,object_type,object_id,object_name,score,success,completed,duration_sec,course_id,timestamp\nstmt_1,syn_usr_9a4f21b8c9d0,completed,assignment,asgn_101,"Distributed Systems Raft Lab",98,1,1,1450,course-cs101,2026-10-12T10:00:00.000Z'
      : JSON.stringify([{ id: 'stmt_1', actorId: 'syn_usr_9a4f21b8c9d0', verb: 'completed' }]);
    return ok({
      exportRecord: {
        id: 'exp-sample-' + Date.now(),
        periodStart: body?.periodStart || '2026-08-01T00:00:00.000Z',
        periodEnd: body?.periodEnd || '2026-10-12T00:00:00.000Z',
        format: fmt,
        anonymized: body?.anonymized !== false,
        status: 'GENERATED',
        recordCount: 1,
        fileSizeBytes: 215,
        sha256Hash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
        createdAt: new Date().toISOString(),
      },
      fileContent: fakeContent,
      recordCount: 1,
      sha256Hash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
    }, 201);
  }],
  ['POST', /^\/api\/analytics\/warehouse\/research$/, ({ body }) => {
    notice();
    return ok({
      id: 'res-sample-' + Date.now(),
      title: body?.title || 'Academic Research Proposal',
      institution: body?.institution || 'Research Institute',
      purpose: body?.purpose || 'Methodology evaluation.',
      datasetScope: body?.datasetScope || 'LEARNING_OUTCOMES',
      anonymized: body?.anonymized !== false,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    }, 201);
  }],
  ['POST', /^\/api\/analytics\/warehouse\/research\/([^/]+)\/review$/, ({ body }) => {
    notice();
    const st = body?.status === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    return ok({
      id: 'res-sample-reviewed',
      status: st,
      accessToken: st === 'APPROVED' ? 'uv_research_sample_token_' + Math.random().toString(36).slice(2) : null,
      expiresAt: st === 'APPROVED' ? new Date(Date.now() + 90 * 86400 * 1000).toISOString() : null,
    });
  }],
  ['POST', /^\/api\/analytics\/xapi$/, ({ body }) => {
    return ok({
      id: 'xapi-stmt-' + Date.now(),
      actorId: 'syn_usr_me',
      verb: body?.verb || 'completed',
      objectType: body?.objectType || 'lesson',
      objectId: body?.objectId || 'obj_1',
      objectName: body?.objectName || null,
      resultScore: body?.resultScore || null,
      durationSeconds: body?.durationSeconds || null,
      timestamp: new Date().toISOString(),
    }, 201);
  }],


  ['POST', /^\/api\/courses\/([^/]+)\/skills$/, () => ok({ skills: ['Operating systems', 'Concurrency', 'C programming', 'Debugging', 'Technical writing'], aiLeft: null })],
  ['POST', /^\/api\/class-sessions\/([^/]+)\/flashcards$/, () => { notice(); return ok({ added: 4, already: 0 }); }],
  ['POST', /^\/api\/class-sessions\/([^/]+)\/micro-lesson$/, () => ok(SAMPLE_MICRO_LESSON)],
  ['POST', /^\/api\/class-sessions\/([^/]+)\/micro-lesson\/interact$/, () => ok({ success: true, viewCount: 139 })],
  ['POST', /^\/api\/scholarships\/pools$/, ({ body }) => ok({ id: 'pool_new', ...body, allocatedAmount: 0, status: 'ACTIVE' })],
  ['POST', /^\/api\/scholarships\/claims$/, () => ok(SAMPLE_IMPACT_CLAIMS[0])],
  ['POST', /^\/api\/scholarships\/claims\/([^/]+)\/review$/, ({ body }) => ok({ id: 'claim_sample_1', status: body.decision })],
  ['POST', /^\/api\/tutoring\/tutors$/, ({ body }) => ok({ id: 'prof_sample_new', ...body })],
  ['POST', /^\/api\/tutoring\/slots$/, ({ body }) => ok(body.slots ?? [])],
  ['DELETE', /^\/api\/tutoring\/slots$/, () => ok({ success: true })],
  ['POST', /^\/api\/tutoring\/sessions$/, ({ body }) => ok({ id: 'sess_new_1', ...body, status: 'SCHEDULED', callRoomId: 'peer_tutoring_call_new' })],
  ['DELETE', /^\/api\/tutoring\/sessions\/([^/]+)$/, () => ok({ id: 'sess_sample_1', status: 'CANCELLED' })],
  ['POST', /^\/api\/tutoring\/sessions\/([^/]+)\/complete$/, ({ body }) => ok({ session: { id: 'sess_sample_1', status: 'COMPLETED', ...body }, tutorStats: { balanceCredits: 5, averageRating: 4.9, sessionsCompletedAsTutor: 4, badgeAwarded: true } })],
  ['POST', /^\/api\/student\/guardian-accounts$/, () => { notice(); return ok({ links: [], code: null }); }],
  ['POST', /^\/api\/admin\/report-cards$/, () => { notice(); return ok({ ok: true }); }],
  ['POST', /^\/api\/courses\/([^/]+)\/question-bank$/, () => { notice(); return ok({ questions: [], imported: 0, added: 0 }); }],
  ['POST', /^\/api\/courses\/([^/]+)\/staff$/, () => { notice(); return ok({ ok: true }); }],
  ['POST', /^\/api\/courses\/([^/]+)\/enrolment$/, () => { notice(); return ok({ ok: true }); }],
  // Syllabus draft: a small example plan; adding it only shows that it isn't saved.
  ['POST', /^\/api\/courses\/([^/]+)\/syllabus\/draft$/, () => ok({ aiLeft: null, draft: { outcomes: ['Write programs that use loops and conditions', 'Explain how a program runs step by step'], skills: ['Programming', 'Debugging', 'Problem solving'], modules: [{ title: 'Getting started', summary: 'What programs are and how to run one.', topics: ['Your first program', 'Variables'] }, { title: 'Making decisions', summary: 'Programs that choose what to do.', topics: ['If statements', 'Boolean logic'] }] } })],
  ['POST', /^\/api\/courses\/([^/]+)\/syllabus$/, () => { notice(); return ok({ modules: 0, items: 0, skills: false }); }],
  // The discussion board: an example thread to look at; posting only shows that it isn't saved.
  ['POST', /^\/api\/courses\/([^/]+)\/discussion(\/[^/]+(\/suggest)?)?$/, () => { notice(); return ok({ ok: true }); }],
  // Assignment rules (Stage 5 · B3.1): extensions, another try and extra time aren't saved.
  ['POST', /^\/api\/assignments\/([^/]+)\/(extensions|groups|peer|peer\/assign|post-grades)$/, () => { notice(); return ok({ ok: true }); }],
  ['POST', /^\/api\/assignments\/submissions\/([^/]+)\/(reopen|notes)$/, () => { notice(); return ok({ ok: true }); }],
  ['POST', /^\/api\/courses\/([^/]+)\/accommodations$/, () => { notice(); return ok({ ok: true }); }],
  // Regrade requests and the rubric in plain words (Stage 5 · B3.5).
  ['POST', /^\/api\/assignments\/(submissions\/[^/]+\/regrade|regrades\/[^/]+)$/, () => { notice(); return ok({ ok: true }); }],
  ['POST', /^\/api\/live\/game(\/[^/]+)?$/, () => { notice(); return ok({ ok: true }); }],
  ['POST', /^\/api\/courses\/[^/]+\/practice$/, () => { notice(); return ok({ right: false, credit: 0, tries: 1, hint: null, correctAnswer: null, explain: null, done: true }); }],
  ['POST', /^\/api\/quizzes\/[^/]+\/short-answers(\/suggest)?$/, () => { notice(); return ok({ accepted: [], rescored: 0, suggestions: [] }); }],
  ['POST', /^\/api\/assignments\/([^/]+)\/rubric-help$/, () => ok({ criteria: [] })],
  // Common Cartridge import: sample mode only shows that it isn't saved.
  ['POST', /^\/api\/courses\/([^/]+)\/import$/, () => { notice(); return ok({ error: 'Sample mode: importing isn’t saved.' }, 400); }],
  // Copy to a new term: sample mode only shows that it can't be saved.
  ['POST', /^\/api\/courses\/([^/]+)\/copy$/, () => { notice(); return ok({ error: 'Sample mode: copying a course isn’t saved.' }, 400); }],
  ['POST', /^\/api\/courses\/([^/]+)\/copy\/step$/, () => ok({ copied: 0, after: null })],
  ['POST', /^\/api\/courses\/([^/]+)\/grade-categories$/, () => { notice(); return ok({ categories: [], assessments: [] }); }],
  ['POST', /^\/api\/courses\/([^/]+)\/modules$/, ({ db: d, body }) => {
    const done = (d as SampleDb & { moduleDone?: Set<string> }).moduleDone ??= new Set();
    if (body?.action === 'done') { if (body.done === false) done.delete(body.itemId); else done.add(body.itemId); return ok({ ok: true }); }
    notice();
    return ok({ ok: true });
  }],
  ['POST', /^\/api\/courses\/([^/]+)\/board$/, ({ db: d, m, body }) => {
    const b = d.board[m[1]]; if (!b) return fail('Course not found.', 404);
    const id = sid('b');
    if (body.kind === 'pin') { const a = b.announcements.find((x: any) => x.id === body.id); if (a) a.pinnedAt = body.on === false ? null : new Date().toISOString(); return ok({ ok: true }); }
    if (body.kind === 'announcement') b.announcements.unshift({ id, title: body.title, body: body.body, createdAt: new Date().toISOString(), publishAt: body.publishAt || null, sentAt: body.publishAt ? null : new Date().toISOString(), pinnedAt: null, author: { name: d.me.name }, _count: { reads: 0 } });
    else if (body.kind === 'material') b.materials.unshift({ id, title: body.title, type: 'OTHER', fileUrl: body.url, size: body.size || null, createdAt: new Date().toISOString() });
    else if (body.kind === 'reading') b.readings.unshift({ id, title: body.title, description: body.description || null, url: body.url || null, category: body.category || null });
    else if (body.kind === 'event') { const s = new Date(body.startAt); b.events.push({ id, title: body.title, description: body.description || null, startAt: s.toISOString(), endAt: new Date(+s + (Number(body.durationMinutes) || 60) * 60_000).toISOString(), type: body.type || 'MEETING' }); }
    return ok({ id }, 201);
  }],
  // "Seen" marks for announcements: nothing to record in the sample.
  ['POST', /^\/api\/courses\/([^/]+)\/announcements\/seen$/, () => ok({ seen: 0 })],
  ['DELETE', /^\/api\/courses\/([^/]+)\/board$/, ({ db: d, m, q }) => {
    const b = d.board[m[1]]; const list = ({ announcement: 'announcements', material: 'materials', reading: 'readings', event: 'events' } as any)[q.get('kind') ?? ''];
    if (b && list) b[list] = b[list].filter((x: any) => x.id !== q.get('itemId'));
    return ok({ ok: true });
  }],

  ['POST', /^\/api\/chat\/conversations$/, ({ db: d, body }) => {
    if (body.userId) {
      const existing = d.conversations.find((c) => !c.isGroup && c.members.some((u: any) => u.id === body.userId));
      if (existing) return ok({ id: existing.id });
      const other = d.directory.find((u) => u.id === body.userId) ?? { id: body.userId, name: 'New contact', role: 'STUDENT' };
      const c = { id: sid('conv'), isGroup: false, isOfficial: false, title: other.name, members: [d.meCard, other], messages: [] as any[] };
      d.conversations.push(c);
      return ok({ id: c.id }, 201);
    }
    const members = d.directory.filter((u) => (body.userIds ?? body.memberIds ?? []).includes(u.id));
    const c = { id: sid('conv'), isGroup: true, isOfficial: false, title: body.name || 'New group', members: [d.meCard, ...members], messages: [] as any[] };
    d.conversations.push(c);
    return ok({ id: c.id }, 201);
  }],
  ['POST', /^\/api\/chat\/conversations\/([^/]+)\/messages$/, ({ db: d, m, body }) => {
    const c = d.conversations.find((x) => x.id === m[1]); if (!c) return fail('Conversation not found.', 404);
    if (c.isOfficial) return fail('This is an announcements-only channel.', 403);
    const reply = body.replyToId ? c.messages.find((x: any) => x.id === body.replyToId) : null;
    let extra: any = {};
    if (body.forwardOf) {
      const src = findMsg(d, body.forwardOf)?.m;
      if (!src) return fail('Message not found.', 404);
      extra = { type: src.type, body: src.body, attachmentUrl: src.attachmentUrl, attachmentName: src.attachmentName, attachmentSize: src.attachmentSize, attachmentMime: src.attachmentMime, metadata: src.metadata, forwarded: true };
    } else if (body.type === 'POLL') {
      extra = { type: 'POLL', body: body.poll?.question, metadata: { question: body.poll?.question, options: body.poll?.options ?? [], multiple: !!body.poll?.multiple } };
    } else if (body.type === 'LOCATION') {
      extra = { type: 'LOCATION', body: body.location?.label || 'Location', metadata: { lat: body.location?.lat, lng: body.location?.lng, label: body.location?.label ?? null } };
    } else if (body.type === 'CONTACT') {
      const u = d.directory.find((x) => x.id === body.contactId);
      if (!u) return fail('Contact not found.', 404);
      extra = { type: 'CONTACT', body: u.name, metadata: { userId: u.id, name: u.name, role: u.role, avatar: null } };
    } else if (body.type === 'CALL') {
      return fail('Calls aren’t available in sample mode — exit sample mode to call real people.');
    }
    const message = {
      id: sid('msg'), conversationId: c.id, senderId: d.me.id, body: body.body ?? '', type: body.type ?? (body.attachmentUrl ? 'FILE' : 'TEXT'),
      attachmentUrl: body.attachmentUrl ?? null, attachmentName: body.attachmentName ?? null, attachmentSize: body.attachmentSize ?? null, attachmentMime: body.attachmentMime ?? null,
      metadata: body.metadata ?? null, createdAt: new Date().toISOString(), editedAt: null, deletedAt: null,
      replyTo: reply ? { id: reply.id, body: reply.body, type: reply.type, sender: { id: reply.senderId, name: reply.sender.name } } : null,
      reactions: {}, sender: { id: d.me.id, name: d.me.name, avatar: null },
      expiresAt: c.disappearingSec ? new Date(Date.now() + c.disappearingSec * 1000).toISOString() : null,
      ...extra,
    };
    c.messages.push(message);
    return ok(decorateMsg(d, message), 201);
  }],
  ['PUT', /^\/api\/chat\/snippets$/, ({ body }) => ok({ max: 50, snippets: Array.isArray(body?.snippets) ? body.snippets.slice(0, 50) : [] })],
  ['PUT', /^\/api\/chat\/folders$/, ({ body }) => ok({ folders: Array.isArray(body?.folders) ? body.folders.slice(0, 10) : [] })],
  ['PATCH', /^\/api\/chat\/conversations\/([^/]+)\/prefs$/, ({ db: d, m, body }) => {
    const c: any = d.conversations.find((x) => x.id === m[1]); if (!c) return fail('Conversation not found.', 404);
    if (typeof body.pinned === 'boolean') c.prefs.pinned = body.pinned;
    if ('muted' in body) c.prefs.muted = !!body.muted;
    if (typeof body.archived === 'boolean') { c.prefs.archived = body.archived; if (body.archived) c.prefs.pinned = false; }
    if (typeof body.unread === 'boolean') { c.prefs.markedUnread = body.unread; if (!body.unread) c.unread = 0; }
    return ok({ ok: true });
  }],
  ['PATCH', /^\/api\/chat\/conversations\/([^/]+)\/settings$/, ({ db: d, m, body }) => {
    const c: any = d.conversations.find((x) => x.id === m[1]); if (!c) return fail('Conversation not found.', 404);
    const sec = Number(body.disappearingSec) || 0;
    c.disappearingSec = sec || null;
    const label = ({ 86400: '24 hours', 604800: '7 days', 7776000: '90 days' } as any)[sec];
    c.messages.push({ id: sid('msg'), conversationId: c.id, senderId: d.me.id, type: 'SYSTEM', body: sec ? `You turned on disappearing messages. New messages will disappear after ${label}.` : 'You turned off disappearing messages.', attachmentUrl: null, attachmentName: null, attachmentSize: null, attachmentMime: null, metadata: null, createdAt: new Date().toISOString(), editedAt: null, deletedAt: null, replyTo: null, reactions: {}, sender: { id: d.me.id, name: d.me.name, avatar: null } });
    return ok({ ok: true });
  }],
  ['POST', /^\/api\/chat\/messages\/([^/]+)\/state$/, ({ db: d, m, body }) => {
    if (typeof body.starred === 'boolean') { if (body.starred) d.starred.add(m[1]); else d.starred.delete(m[1]); }
    if (body.hidden) { d.hiddenMsgs.add(m[1]); d.starred.delete(m[1]); }
    return ok({ ok: true });
  }],
  ['POST', /^\/api\/chat\/messages\/([^/]+)\/vote$/, ({ db: d, m, body }) => {
    const found = findMsg(d, m[1]); if (!found || found.m.type !== 'POLL') return fail('Poll not found.', 404);
    const votes = (d.pollVotes[m[1]] ??= {});
    const mine = votes[d.me.id] ?? [];
    const option = Number(body.option);
    votes[d.me.id] = mine.includes(option) ? mine.filter((o) => o !== option) : found.m.metadata?.multiple ? [...mine, option] : [option];
    return ok({ ok: true });
  }],
  ['POST', /^\/api\/chat\/messages\/([^/]+)\/reactions$/, ({ db: d, m, body }) => {
    for (const c of d.conversations) {
      const msg = c.messages.find((x: any) => x.id === m[1]);
      if (msg) { const list: string[] = msg.reactions[body.emoji] ?? []; msg.reactions[body.emoji] = list.includes(d.me.id) ? list.filter((u) => u !== d.me.id) : [...list, d.me.id]; if (!msg.reactions[body.emoji].length) delete msg.reactions[body.emoji]; return ok({ reactions: msg.reactions }); }
    }
    return ok({ ok: true });
  }],
  ['PATCH', /^\/api\/chat\/messages\/([^/]+)$/, ({ db: d, m, body }) => { for (const c of d.conversations) { const msg = c.messages.find((x: any) => x.id === m[1]); if (msg) { msg.body = body.body ?? msg.body; msg.editedAt = new Date().toISOString(); return ok(msg); } } return ok({ ok: true }); }],
  ['DELETE', /^\/api\/chat\/messages\/([^/]+)$/, ({ db: d, m }) => { for (const c of d.conversations) { const msg = c.messages.find((x: any) => x.id === m[1]); if (msg) { Object.assign(msg, { type: 'DELETED', body: '', deletedAt: new Date().toISOString(), attachmentUrl: null, reactions: {} }); } } return ok({ ok: true }); }],

  // One-way exams (Stage 5 · B4.3): sample quizzes aren't exams.
  ['POST', /^\/quizzes\/[^/]+\/(start|answer)$/, () => ok({ startedAt: null, endsAt: null, done: [] })],
  ['POST', /^\/quizzes\/([^/]+)\/submit$/, ({ db: d, m, body }) => {
    const x = d.quizzes.find((z) => z.id === m[1]); if (!x) return fail('Quiz not found', 404);
    const answers = body.answers ?? {};
    let score = 0, maxScore = 0;
    for (const qq of x.questions) { maxScore += qq.points; score += qq.points * markAnswer(qq, answers[qq.id]).credit; }
    d.submissions[x.id] = { score, maxScore, answers, submittedAt: new Date().toISOString() };
    return ok({ id: sid('sub'), quizId: x.id, score, maxScore });
  }],
  ['POST', /^\/quizzes$/, ({ db: d, body }) => { const x = { id: sid('quiz'), courseId: body.courseId, title: body.title, description: body.description ?? null, dueDate: at(7, 23, 59), timeLimit: body.timeLimit ?? 30, status: 'DRAFT', questions: [] as any[] }; d.quizzes.push(x as any); return ok(x, 201); }],
  ['DELETE', /^\/quizzes\/([^/]+)$/, ({ db: d, m }) => { const i = d.quizzes.findIndex((z) => z.id === m[1]); if (i >= 0) d.quizzes.splice(i, 1); return ok({ ok: true }); }],
  ['PATCH', /^\/api\/quizzes\/[^/]+\/questions$/, () => { notice(); return ok({ ok: true }); }],
  ['PATCH', /^\/api\/quizzes\/([^/]+)$/, ({ db: d, m, body }) => {
    const x: any = d.quizzes.find((z) => z.id === m[1]); if (!x) return fail('Quiz not found.', 404);
    if (body.status === 'PUBLISHED' && !x.questions.length) return fail('Add at least one question before publishing.');
    if (body.status) x.status = body.status;
    if ('dueDate' in body) x.dueDate = body.dueDate ?? x.dueDate;
    if ('timeLimit' in body) x.timeLimit = body.timeLimit;
    return ok({ ok: true });
  }],
  ['POST', /^\/api\/quizzes\/([^/]+)\/questions$/, ({ db: d, m, body }) => { const x = d.quizzes.find((z) => z.id === m[1]); if (!x) return fail('Quiz not found.', 404); const c = cleanQuestionInput(body); if (typeof c === 'string') return fail(c, 400); const qq = { id: sid('qq'), quizId: x.id, ...c, points: Number(body.points) || 1, order: x.questions.length }; x.questions.push(qq); return ok(qq, 201); }],
  ['DELETE', /^\/api\/quizzes\/([^/]+)\/questions$/, ({ db: d, m, q }) => { const x = d.quizzes.find((z) => z.id === m[1]); if (x) x.questions = x.questions.filter((qq: any) => qq.id !== q.get('qid')); return ok({ ok: true }); }],

  ['POST', /^\/grades\/course\/([^/]+)$/, ({ db: d, m, body }) => {
    const s = d.classmates.find((u) => u.id === body.studentId); if (!s) return fail('That student is not enrolled in this course');
    const g = { id: sid('g'), studentId: s.id, courseId: m[1], assignmentName: body.assignmentName, score: Number(body.score), maxScore: Number(body.maxScore) || 100, weight: 1, status: 'GRADED', feedback: body.feedback || null, gradedAt: new Date().toISOString(), createdAt: new Date().toISOString(), student: s };
    d.classGrades.unshift(g); return ok(g, 201);
  }],
  ['DELETE', /^\/grades\/([^/]+)$/, ({ db: d, m }) => { d.classGrades.splice(d.classGrades.findIndex((g) => g.id === m[1]) >>> 0, 1); return ok({ ok: true }); }],

  ['POST', /^\/api\/notifications\/centre$/, ({ db: d, body }) => {
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
    const hit = (n: any) => body?.all === true || ids.includes(n.id);
    if (body?.action === 'delete' || body?.action === 'snooze') d.notifications = d.notifications.filter((n: any) => !hit(n));
    else d.notifications.forEach((n: any) => { if (hit(n)) n.read = body?.action === 'read'; });
    return ok({ changed: ids.length });
  }],
  ['PUT', /^\/api\/notifications\/settings$/, ({ body }) => { notice(); return ok({ prefs: body?.prefs ?? DEFAULT_PREFS, nextDigest: null }); }],
  ['PATCH', /^\/api\/notifications$/, ({ db: d, body }) => { d.notifications.forEach((n) => { if (!body.ids?.length || body.ids.includes(n.id)) n.read = true; }); return ok({ ok: true }); }],
  ['PATCH', /^\/api\/me$/, ({ db: d, body }) => { Object.assign(d.profile, body); return ok(d.profile); }],
  ['POST', /^\/skills$/, ({ db: d, body }) => { const s = { id: sid('sk'), userId: d.me.id, name: body.name, category: body.category ?? null, level: body.level ?? 'BEGINNER', endorsements: 0, createdAt: new Date().toISOString() }; d.skills.push(s); return ok(s, 201); }],
  ['DELETE', /^\/skills\/([^/]+)$/, ({ db: d, m }) => { d.skills.splice(d.skills.findIndex((s) => s.id === m[1]) >>> 0, 1); return ok({ ok: true }); }],
  ['POST', /^\/tickets$/, ({ db: d, body }) => { const t = { id: sid('t'), subject: body.subject, description: body.description, category: body.category, status: 'OPEN', priority: 'MEDIUM', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; d.tickets.unshift(t); return ok(t, 201); }],
  ['POST', /^\/api\/classroom$/, ({ db: d }) => { notice(); Object.assign(classroom(d), { on: true, startedAt: new Date().toISOString() }); return ok({ id: 'sample-class' }); }],
  ['POST', /^\/api\/classroom\/join$/, () => { notice(); return ok({ sessionId: 'sample-class', course: { code: 'CS101', name: 'Sample course' }, attendance: 'PRESENT' }); }],
  ['POST', /^\/api\/classroom\/([^/]+)$/, ({ db: d, body }) => { notice(); if (body?.action === 'end') { classroom(d).on = false; return ok({ ok: true, message: 'Session ended.', classSessionId: null }); } return ok({ ok: true, notes: 0 }); }],
  ['POST', /^\/api\/groups\/([^/]+)\/autopilot\/plan$/, ({ db: d, m, body }) => {
    notice();
    const [a, b] = [d.me, d.people.zoya];
    const task = (title: string, who: { id: string; name: string }, why: string, skills: string[], days: number, priority = 'MEDIUM') => ({ title, notes: '', priority, estimateHours: 4, requiredSkills: skills, suggestedAssigneeId: who.id, suggestedAssigneeName: who.name, suggestedAssigneeReason: why, dueDaysFromStart: days });
    autopilot(d).plans[m[1]] = {
      id: sid('ap'), title: String(body?.title || 'Group project'), brief: String(body?.brief ?? ''), status: 'DRAFT', course: null, meetingSlot: null, board: null, scheduledCall: null,
      breakdown: [
        task('Research and problem statement', b, 'Good at Research', ['Research', 'Technical Writing'], 5, 'HIGH'),
        task('Design the screens', a, 'Good at UI/UX', ['UI/UX'], 9),
        task('Build the prototype', b, 'Keeps the work even', ['Programming'], 15, 'URGENT'),
        task('Report and slides', a, 'Good at Presentation', ['Presentation'], 21, 'HIGH'),
      ],
    };
    return ok({ planId: autopilot(d).plans[m[1]].id, aiUsed: false, tasks: 4 });
  }],
  ['POST', /^\/api\/groups\/([^/]+)\/autopilot\/apply$/, ({ db: d, m, body }) => {
    notice();
    const plan = autopilot(d).plans[m[1]];
    if (plan) Object.assign(plan, { status: 'ACTIVE', board: { id: 'sample-board', title: 'Group tasks' }, scheduledCall: body?.startAt ? { id: sid('call'), title: `${plan.title} · team meeting`, startAt: String(body.startAt), durationMin: 45 } : null });
    return ok({ ok: true, tasksCreated: 4, callScheduled: !!body?.startAt });
  }],
  ['POST', /^\/api\/groups\/([^/]+)\/autopilot\/reports$/, ({ db: d, m }) => {
    notice();
    const members = [
      { userId: d.me.id, name: d.me.name, tasksAssigned: 2, tasksCompleted: 1, tasksOverdue: 0, contributionSharePercent: 50, status: 'BALANCED' },
      { userId: d.people.zoya.id, name: d.people.zoya.name, tasksAssigned: 2, tasksCompleted: 1, tasksOverdue: 1, contributionSharePercent: 50, status: 'BALANCED' },
    ];
    const report = { id: sid('rep'), weekNumber: 1, summary: 'Week 1: 2 of 4 tasks done, 1 late. The project is at risk.', health: 'AT_RISK', createdAt: new Date().toISOString(), metrics: { members, totalTasks: 4, completedTasks: 2, overdueTasks: 1, fair: 1 }, nudges: [{ taskId: 'sample-task', taskTitle: 'Build the prototype', userId: d.people.zoya.id, userName: d.people.zoya.name }] };
    autopilot(d).reports[m[1]] = [report];
    return ok({ report });
  }],
  ['POST', /^\/api\/courses\/([^/]+)\/group-projects$/, () => { notice(); return ok({ report: null }); }],
  ['POST', /^\/api\/groups\/([^/]+)\/autopilot\/nudge$/, () => { notice(); return ok({ ok: true }); }],
  ['POST', /^\/api\/groups\/([^/]+)\/posts$/, ({ db: d, m, body }) => { const p = { id: sid('gp'), body: body.body ?? '', imageUrl: body.imageUrl ?? null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), author: { id: d.me.id, name: d.me.name, avatar: null } }; (d.groupPosts[m[1]] ??= []).push(p); return ok(p, 201); }],
  ['POST', /^\/groups\/([^/]+)\/join$/, ({ db: d, m }) => { const g = d.groups.find((x) => x.id === m[1]); if (g && !g.joined) { g.joined = true; g.members.push(d.meCard); } return ok({ ok: true }); }],
  ['DELETE', /^\/groups\/([^/]+)\/leave$/, ({ db: d, m }) => { const g = d.groups.find((x) => x.id === m[1]); if (g) { g.joined = false; g.members = g.members.filter((u: any) => u.id !== d.me.id); } return ok({ ok: true }); }],
  ['POST', /^\/groups$/, ({ db: d, body }) => { const g = { id: sid('grp'), name: body.name, description: body.description ?? null, category: body.category ?? 'Study', isPublic: true, createdAt: new Date().toISOString(), members: [d.meCard], joined: true }; d.groups.unshift(g); return ok(groupOut(d, g), 201); }],
  ['POST', /^\/impact\/summits\/([^/]+)\/register$/, ({ db: d, m }) => { if (!d.summitRegs.includes(m[1])) d.summitRegs.push(m[1]); return ok({ ok: true }); }],
  ['POST', /^\/impact\/certificates\/([^/]+)\/(approve|reject)$/, ({ db: d, m }) => { d.pendingCertificates.splice(d.pendingCertificates.findIndex((x) => x.id === m[1]) >>> 0, 1); return ok({ ok: true }); }],
  ['POST', /^\/impact\/blockchain-credentials\/([^/]+)\/(verify|approve|reject|issue)$/, ({ db: d, m }) => { d.pendingCredentials.splice(d.pendingCredentials.findIndex((x) => x.id === m[1]) >>> 0, 1); return ok({ ok: true }); }],
  ['PATCH', /^\/impact\/blockchain-credentials\/([^/]+)(\/[a-z-]+)?$/, ({ db: d, m }) => { d.pendingCredentials.splice(d.pendingCredentials.findIndex((x) => x.id === m[1]) >>> 0, 1); return ok({ ok: true }); }],
  ['PATCH', /^\/collaborations\/projects\/([^/]+)\/review$/, ({ db: d, m, body }) => { const p = d.projects.find((x) => x.id === m[1]); if (p) p.status = body.status ?? p.status; return ok(p ?? { ok: true }); }],
  ['POST', /^\/announcements$/, ({ db: d, body }) => { const a = { id: sid('ann'), title: body.title, body: body.body ?? body.content ?? '', content: body.body ?? body.content ?? '', createdAt: new Date().toISOString(), author: { name: d.me.name }, course: null }; d.adminAnnouncements.unshift(a); return ok(a, 201); }],
  ['DELETE', /^\/announcements\/([^/]+)$/, ({ db: d, m }) => { d.adminAnnouncements.splice(d.adminAnnouncements.findIndex((x) => x.id === m[1]) >>> 0, 1); return ok({ ok: true }); }],
  ['DELETE', /^\/users\/([^/]+)$/, ({ db: d, m }) => { d.users.splice(d.users.findIndex((x) => x.id === m[1]) >>> 0, 1); return ok({ ok: true }); }],
  ['PATCH', /^\/users\/([^/]+)(\/status)?$/, ({ db: d, m, body }) => { const u = d.users.find((x) => x.id === m[1]); if (u) Object.assign(u, body.status ? { status: body.status } : {}, body.role ? { role: body.role } : {}); return ok(u ?? { ok: true }); }],
  ['DELETE', /^\/api\/admin\/rooms$/, ({ db: d, q }) => { for (const r of d.adminRooms) r.reservations = r.reservations.filter((x: any) => x.id !== q.get('reservationId')); return ok({ ok: true }); }],
  ['DELETE', /^\/api\/admin\/timetable$/, ({ db: d, q }) => { d.slots.splice(d.slots.findIndex((x) => x.id === q.get('id')) >>> 0, 1); return ok({ ok: true }); }],
  ['POST', /^\/api\/admin\/school-analytics$/, ({ body }) => ok(sampleAsk(body.question))],
  ['POST', /^\/api\/premium\/ai-report$/, () => ok({ report: [
    '## Executive summary (sample)',
    'Engagement grew steadily this term: sign-ups peaked in the enrolment month and impact points are up about 10% month over month.',
    '',
    '## Highlights',
    '- 842 of 1,326 members were active in the last 30 days (63%).',
    '- 118 NGO applications were accepted; Education and Environment lead with 16 of 23 active projects.',
    '- Top contributors are earning Level 4–5 impact badges.',
    '',
    '## Recommendations',
    '1. Promote Health projects — only 4 are active despite high student interest.',
    '2. Follow up the 42 pending applications within a week to keep momentum.',
    '3. Recognise top contributors at the next campus event.',
    '',
    '_This is an example report generated in sample mode._',
  ].join('\n') })],
  ['POST', /^\/api\/upload(\/sized)?$/, () => ok({ url: '/icon-512x512.png' })],
  ['POST', /^\/api\/(billing|create-checkout-session)/, () => fail('Payments aren’t available in sample mode. Exit sample mode to subscribe.')],
];

// Requests that always go to the real server, even in sample mode.
const PASSTHROUGH = [/^\/auth\//, /^\/users\/me$/, /^\/api\/ai$/, /^\/api\/summarize$/, /^\/api\/invite/];

let lastNotice = 0;
const classroom = (d: SampleDb) => ((d as SampleDb & { classroom?: { on: boolean; startedAt: string } }).classroom ??= { on: false, startedAt: new Date().toISOString() });
type SampleAutopilot = { plans: Record<string, Record<string, unknown> & { id: string; title: string }>; reports: Record<string, unknown[]> };
const autopilot = (d: SampleDb) => ((d as SampleDb & { autopilot?: SampleAutopilot }).autopilot ??= { plans: {}, reports: {} });
const sampleSlots = (d: SampleDb) => [
  { dayOfWeek: 1, dayName: 'Tuesday', startTime: '14:00', endTime: '15:00', availableMemberIds: [d.me.id, d.people.zoya.id], totalMembers: 2, conflicts: [], score: 100 },
  { dayOfWeek: 3, dayName: 'Thursday', startTime: '15:30', endTime: '16:30', availableMemberIds: [d.me.id, d.people.zoya.id], totalMembers: 2, conflicts: [], score: 100 },
  { dayOfWeek: 0, dayName: 'Monday', startTime: '10:00', endTime: '11:00', availableMemberIds: [d.me.id], totalMembers: 2, conflicts: [{ userId: d.people.zoya.id, userName: d.people.zoya.name, reason: 'CS201 class' }], score: 50 },
];

function notice() {
  if (Date.now() - lastNotice < 8000) return;
  lastNotice = Date.now();
  toast('Sample mode — this change stays on your screen only', { description: 'Exit sample mode to use your real account.' });
}

/** Returns a sample response for a request, or null to let it reach the real server. */
export function resolveSample(method: string, rawUrl: string, body: unknown): Result | null {
  const url = new URL(rawUrl, 'http://sample.local');
  let path = url.pathname.replace(/\/+$/, '') || '/';
  if (/^https?:/.test(rawUrl) && !rawUrl.startsWith(window.location.origin)) path = path.replace(/^\/api(?=\/)/, ''); // absolute API_URL → Nest path
  if (PASSTHROUGH.some((r) => r.test(path))) return null;

  const d = getDb();
  const parsed = typeof body === 'string' ? (() => { try { return JSON.parse(body); } catch { return {}; } })() : (body ?? {});
  const verb = method.toUpperCase();
  if (verb === 'GET') {
    for (const [re, h] of GET) { const m = path.match(re); if (m) return h({ db: d, m, q: url.searchParams, body: parsed }); }
    return null;
  }
  for (const [v, re, h] of WRITE) {
    const m = path.match(re);
    if (m && v === verb) return h({ db: d, m, q: url.searchParams, body: parsed });
  }
  notice();
  return ok({ ok: true, id: sid('x'), ...(parsed && typeof parsed === 'object' ? parsed : {}) });
}
