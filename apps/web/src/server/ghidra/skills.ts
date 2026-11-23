import type { AppId } from '@/lib/apps';

// Ghidra's skills (the owner, 23 Nov: "we need only ghidra as one main ai and i need it to do all the work in this
// project"): every AI job on UniVerse is one of these, and every one is answered by Ghidra's brain (./brain.ts). People
// meet only Ghidra; a skill is how it knows which job it is doing. `own` names the Cloudflare path a skill may use
// first (UniVerse's own model, behind the owner's switch); the rest answer with Gemini. The exam (STAGE-5-PLAN.md,
// "Ghidra, the one AI", step 2) scores each skill by its id, and the 👍 / 👎 ratings (step 3) are kept per skill.

export interface Skill {
  /** The app the skill works for ('all' for shared parts: Messages, documents, the owner console). */
  app: AppId | 'all';
  /** What it does, in one line (the console and the exam show it). */
  does: string;
  /** UniVerse's own model on Cloudflare, tried first: the app agents' add-on or Hyperion's coding model. */
  own?: 'agents' | 'hyperion';
}

export const SKILLS = {
  // Ghidra's conversation
  assistant: { app: 'all', does: 'Answers anything in the chat on every page and the hub, and plans a request in steps' },
  // the agents (their playbooks: ../agents/playbooks.ts)
  research: { app: 'campus', does: 'Summarises a topic from real sources, citing each one', own: 'agents' },
  social: { app: 'all', does: 'Writes posts for brands, charities and schools', own: 'agents' },
  support: { app: 'trace', does: 'Answers a buyer from a product passport’s facts', own: 'agents' },
  travel: { app: 'travel', does: 'Gives practical tips for a trip', own: 'agents' },
  booking: { app: 'travel', does: 'Reads a pasted hotel booking into a trip' },
  // Hyperion
  hyperion: { app: 'lab', does: 'Writes, explains and fixes MATLAB / Octave code for Hyperion', own: 'hyperion' },
  // UniVersity: learning
  tutor: { app: 'campus', does: 'The course tutor: answers from the course’s own sources, flashcards, practice, homework hints' },
  whisper: { app: 'campus', does: 'Answers a student’s quiet question during a class call' },
  'class-notes': { app: 'campus', does: 'Turns a class call into notes and a study pack' },
  semester: { app: 'campus', does: 'Answers a student’s question about their semester' },
  'study-plan': { app: 'campus', does: 'Makes a 7-day study plan from grades and what’s due' },
  'reading-level': { app: 'campus', does: 'Rewrites course material at an easier or harder reading level' },
  revision: { app: 'campus', does: 'Makes a revision pack from a course’s materials' },
  oral: { app: 'campus', does: 'Coaches vivas, debates and language orals' },
  careers: { app: 'campus', does: 'Interview practice and feedback on applications' },
  passport: { app: 'campus', does: 'Drafts a student’s strengths and CV summary from their evidence' },
  'student-work': { app: 'campus', does: 'Checks a student’s draft against the rubric before they hand it in' },
  // UniVersity: teaching
  'quiz-draft': { app: 'campus', does: 'Writes a draft quiz for a teacher' },
  'quiz-marking': { app: 'campus', does: 'Suggests marks for short answers the key didn’t expect' },
  grading: { app: 'campus', does: 'Drafts rubric marks and feedback for written work (a teacher reviews every one)' },
  feedback: { app: 'campus', does: 'Helps a teacher write feedback' },
  syllabus: { app: 'campus', does: 'Drafts a syllabus' },
  'course-skills': { app: 'campus', does: 'Finds the skills a course builds' },
  concepts: { app: 'campus', does: 'Proposes a course’s concepts and maps a student’s learning' },
  discussion: { app: 'campus', does: 'Summarises and helps a course’s discussion board' },
  'group-work': { app: 'campus', does: 'Splits a group project and keeps it on track' },
  'support-plans': { app: 'campus', does: 'Suggests an action plan for a student who needs help' },
  'school-insights': { app: 'campus', does: 'Explains a school measure for admins' },
  // UniVersity: families and safety
  parents: { app: 'campus', does: 'Helps parents follow schoolwork and write to teachers' },
  safety: { app: 'campus', does: 'Checks messages and posts for young students’ safety' },
  // shared
  'daily-brief': { app: 'all', does: 'Says what matters today for one person' },
  chat: { app: 'all', does: 'Summaries, replies and tone in Messages' },
  transcribe: { app: 'all', does: 'Turns voice messages into text' },
  translate: { app: 'all', does: 'Translates messages and the app’s screens' },
  docs: { app: 'all', does: 'The writing helper in documents' },
  boards: { app: 'all', does: 'Sorts, sums up and turns sketches into cards on boards' },
  meetings: { app: 'all', does: 'Notes and actions from a meeting' },
  // Relief and Green's parts
  'impact-rooms': { app: 'relief', does: 'Summaries and updates in an NGO project’s room' },
  'home-energy': { app: 'campus', does: 'Reads a home energy bill for the footprint' },
  carbon: { app: 'trace', does: 'Reads a company’s documents for its carbon footprint' },
  // the owner console
  diagnose: { app: 'all', does: 'Explains a live error and how to fix it' },
  health: { app: 'all', does: 'The owner console’s health check' },
} as const satisfies Record<string, Skill>;

export type SkillId = keyof typeof SKILLS;
