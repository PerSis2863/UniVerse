import { geminiJson } from './gemini';
import type { StudentProgress } from './student-progress';

// The AI study planner: a 7-day plan from a student's grades and what's due. The plan is saved per
// student per day (ai-budget cachedAi/saveAi), so opening the page again costs no AI.

export interface PlanBlock { course: string; task: string; minutes: number; why: string }
export interface PlanDay { date: string; focus: string; blocks: PlanBlock[] }
export interface StudyPlan { summary: string; days: PlanDay[]; madeAt: string }

export const planKey = (userId: string, day: string) => ['study-plan', userId, day];

/** The student's local day (YYYY-MM-DD) and timezone as sent by the page, checked. */
export function localDay(todayParam: string | null, tzParam: string | null): { today: string; tz: string } {
  let tz = 'UTC';
  if (tzParam && tzParam.length <= 64) {
    try { new Intl.DateTimeFormat('en', { timeZone: tzParam }); tz = tzParam; } catch { /* unknown zone: use UTC */ }
  }
  const utc = new Date().toISOString().slice(0, 10);
  // Timezones put "today" at most a day either side of UTC; anything else is ignored.
  const ok = todayParam && /^\d{4}-\d{2}-\d{2}$/.test(todayParam) && Math.abs(Date.parse(todayParam) - Date.parse(utc)) <= 86_400_000;
  return { today: ok ? todayParam! : utc, tz };
}

const addDays = (day: string, n: number) => new Date(Date.parse(day) + n * 86_400_000).toISOString().slice(0, 10);
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });

const SYSTEM = `You are a friendly study coach for a university student. Make a realistic 7-day study plan.
Rules:
- Give more time to courses with lower grades, and to work that is due soon. Prepare for each deadline on the days BEFORE it is due, never after.
- 1 to 3 blocks a day. Weekdays at most about 150 minutes in total, weekends at most about 120. Each block 20 to 90 minutes. A light day is fine.
- "course" is the course code exactly as given (or "General" for study skills).
- "task" is one short, concrete action (e.g. "Redo the practice questions from week 3"), under 12 words.
- "why" is one short reason a student understands (e.g. "Your quiz is on Monday"), under 14 words.
- "focus" is 2 to 5 words naming the day's theme.
- "summary" is one encouraging sentence about the week.
- Use plain, simple English. Don't invent courses, grades or deadlines.
- Return exactly the 7 dates given, in order.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    days: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          date: { type: 'STRING' },
          focus: { type: 'STRING' },
          blocks: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: { course: { type: 'STRING' }, task: { type: 'STRING' }, minutes: { type: 'INTEGER' }, why: { type: 'STRING' } },
              required: ['course', 'task', 'minutes', 'why'],
            },
          },
        },
        required: ['date', 'focus', 'blocks'],
      },
    },
  },
  required: ['summary', 'days'],
};

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Asks Gemini for the plan; null when AI isn't set up or the answer is unusable. */
export async function makeStudyPlan(p: StudentProgress, today: string, tz: string): Promise<StudyPlan | null> {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const courses = p.courses.map((c) => {
    const grade = c.grade === null ? 'no grades yet' : `average ${c.grade}%`;
    const recent = c.recent.length ? `; recent: ${c.recent.map((r) => `${r.name} ${r.percent}%`).join(', ')}` : '';
    const att = c.attendance === null ? '' : `; attendance ${c.attendance}%`;
    return `- ${c.code} (${c.name}): ${grade}${recent}${att}`;
  });
  const due = p.deadlines
    .filter((d) => d.due.slice(0, 10) <= addDays(today, 10))
    .map((d) => `- ${d.kind === 'quiz' ? 'Quiz' : d.kind === 'exam' ? 'Exam' : 'Deadline'}: ${d.title}${d.course ? ` (${d.course.code})` : ''}, due ${when(d.due)}`);

  const prompt = [
    `Today is ${weekday(today)} ${today}. Plan these dates: ${dates.map((d) => `${d} (${weekday(d)})`).join(', ')}.`,
    '',
    'Courses:',
    ...(courses.length ? courses : ['- (none)']),
    '',
    'Due in the next 10 days:',
    ...(due.length ? due : ['- Nothing due. Plan steady review, focusing on the weakest courses.']),
  ].join('\n');

  const out = await geminiJson<{ summary?: unknown; days?: unknown }>(SYSTEM, prompt, SCHEMA, 3000);
  if (!out || !Array.isArray(out.days)) return null;

  // Keep the plan to the 7 dates asked for, with sensible numbers, whatever the model sent.
  const byDate = new Map<string, PlanDay>();
  for (const raw of out.days as Record<string, unknown>[]) {
    const date = clip(raw?.date, 10);
    if (!dates.includes(date) || byDate.has(date)) continue;
    const blocks = (Array.isArray(raw.blocks) ? (raw.blocks as Record<string, unknown>[]) : [])
      .slice(0, 4)
      .map((b) => ({
        course: clip(b?.course, 40) || 'General',
        task: clip(b?.task, 140),
        minutes: Math.min(120, Math.max(10, Math.round(Number(b?.minutes) || 30))),
        why: clip(b?.why, 160),
      }))
      .filter((b) => b.task);
    byDate.set(date, { date, focus: clip(raw.focus, 60), blocks });
  }
  if (!byDate.size) return null;
  return {
    summary: clip(out.summary, 300),
    days: dates.map((d) => byDate.get(d) ?? { date: d, focus: 'Rest and catch up', blocks: [] }),
    madeAt: new Date().toISOString(),
  };
}
