import { BadgeCheck, CalendarCheck, ClipboardCheck, FileInput, ListChecks, Mail, TriangleAlert, Wallet, type LucideIcon } from 'lucide-react';

// The jobs UniVerse runs between people, drawn by FlowCard (the landing page and sign-in show the
// first; the owner console's Feature flows shows them all). Each one: something happens, one
// question, and the two ways it can go. Illustrations of how the features work, not live data.

export type Step = [title: string, detail: string];

export interface Flow {
  id: string;
  feature: string;
  name: string;
  icon: LucideIcon;
  start: Step;
  check: Step;
  yes: Step;
  no: Step;
  /** The way that asks a person (lit as "live"); the other runs by itself. */
  person: 'yes' | 'no';
  /** One line under the steps. */
  note: string;
}

export const FLOWS: Flow[] = [
  { id: 'late', feature: 'Assignments', name: 'Late hand-ins', icon: ClipboardCheck,
    start: ['Hand-in arrives', 'Maths essay, sent at 9:42'], check: ['Late?', 'It was due at 9:00'],
    yes: ['Ask the teacher', 'Accept it or give an extension'], no: ['Into the gradebook', 'Marked on time, the student sees it'],
    person: 'yes', note: 'Runs on every hand-in, in every course' },
  { id: 'register', feature: 'Attendance', name: 'Register from the class call', icon: CalendarCheck,
    start: ['Class call ends', 'Year 9 science, 28 joined'], check: ['Everyone there?', 'Checked against the class list'],
    yes: ['Register filled in', 'Present, with the minutes each joined'], no: ['Ask for a reason', 'The student or parent can send an excuse'],
    person: 'no', note: 'No roll call: the call is the register' },
  { id: 'quiz', feature: 'Quizzes', name: 'Quiz marking', icon: ListChecks,
    start: ['Quiz handed in', '10 questions, 8 kinds'], check: ['Marks itself?', 'Choice, numbers, matching, maths'],
    yes: ['Marked at once', 'Score and feedback straight away'], no: ['Teacher marks it', 'With an AI suggestion to check'],
    person: 'no', note: 'Teachers only see what needs a person' },
  { id: 'warning', feature: 'Early warning', name: 'Students at risk', icon: TriangleAlert,
    start: ['The week ends', 'Grades, attendance, hand-ins'], check: ['At risk?', 'Signals from the whole week'],
    yes: ['Tell the teacher', 'What changed, and since when'], no: ['Keep watching', 'Checked again next week'],
    person: 'yes', note: 'Spots a slide before the report card does' },
  { id: 'fees', feature: 'Money', name: 'Fee reminder', icon: Wallet,
    start: ['A fee falls due', 'Term 2 fees'], check: ['Paid?', 'Checked against the school’s payments'],
    yes: ['Receipt sent', 'The parent has it by email'], no: ['Remind the parent', 'With a link to pay'],
    person: 'no', note: 'Payments go to the school’s own account' },
  { id: 'admissions', feature: 'Admissions', name: 'New application', icon: FileInput,
    start: ['Application arrives', 'Online form and documents'], check: ['Complete?', 'Every required document there'],
    yes: ['Ready for review', 'In the admin’s admissions list'], no: ['Ask for what’s missing', 'The family gets the list'],
    person: 'yes', note: 'Admins only open complete applications' },
  { id: 'digest', feature: 'Parents', name: 'Parent digest', icon: Mail,
    start: ['School day ends', 'Grades, attendance, messages'], check: ['Anything new?', 'For each of the parent’s children'],
    yes: ['Send the digest', 'One short summary, by push or email'], no: ['Send nothing', 'No empty messages'],
    person: 'yes', note: 'One message a day instead of ten' },
  { id: 'credential', feature: 'Skills passport', name: 'Certificate', icon: BadgeCheck,
    start: ['Course completed', 'Final grade recorded'], check: ['Passed?', 'Against the course’s pass mark'],
    yes: ['Issue the certificate', 'Fingerprinted, anchored on Polygon'], no: ['Hold it', 'The teacher can review the grade'],
    person: 'no', note: 'Anyone can check it with its public link' },
];
