import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { cachedAi, saveAi, spendAi } from '@/server/ai-budget';
import { featureOff } from '@/server/moderation';
import { studentProgress } from '@/server/student-progress';
import { localDay, makeStudyPlan, planKey, type StudyPlan } from '@/server/study-planner';

// The AI study planner (/student/planner).
// GET ?today=YYYY-MM-DD&tz=Area/City → courses, deadlines, today's saved plan (if any), whether AI is on.
// POST { today, tz, fresh? } → makes today's plan (one AI request) unless one is saved and fresh isn't set.

const NO_STORE = { 'Cache-Control': 'no-store' };
const AI_OFF = 'AI planning is switched off right now. Your deadlines are below, sorted by date.';

async function aiOn() {
  return !!process.env.GEMINI_API_KEY && !(await featureOff('ai'));
}

export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const { today } = localDay(sp.get('today'), sp.get('tz'));

  const [progress, plan, on] = await Promise.all([
    studentProgress(user.id),
    cachedAi<StudyPlan>(planKey(user.id, today), 2),
    aiOn(),
  ]);
  return NextResponse.json(
    { today, ...progress, plan, ai: { on, message: on ? null : AI_OFF } },
    { headers: NO_STORE },
  );
}

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const { today, tz } = localDay(typeof b.today === 'string' ? b.today : null, typeof b.tz === 'string' ? b.tz : null);

  if (!(await aiOn())) return NextResponse.json({ error: AI_OFF, code: 'ai-off' }, { status: 503 });

  // Coming back to the page the same day reuses the plan already made.
  if (!b.fresh) {
    const saved = await cachedAi<StudyPlan>(planKey(user.id, today), 2);
    if (saved) return NextResponse.json({ plan: saved }, { headers: NO_STORE });
  }

  const progress = await studentProgress(user.id);
  if (!progress.courses.length) {
    return NextResponse.json({ error: 'Join a course first, then your plan can be made from its grades and deadlines.', code: 'no-courses' }, { status: 409 });
  }

  const spend = await spendAi(user);
  if (!spend.ok) return NextResponse.json({ error: spend.message, code: 'ai-limit' }, { status: 429 });

  const plan = await makeStudyPlan(progress, today, tz);
  if (!plan) return NextResponse.json({ error: 'Couldn’t make a plan right now. Please try again in a minute.' }, { status: 503 });
  await saveAi(planKey(user.id, today), plan);
  return NextResponse.json({ plan, left: spend.left }, { headers: NO_STORE });
}
