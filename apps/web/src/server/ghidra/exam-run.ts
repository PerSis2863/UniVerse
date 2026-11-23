import prisma from '@/lib/db';
import { featureOff } from '../moderation';
import { BadRequestException, HttpException, NotFoundException } from '../http';
import { ghidraJson, ghidraText } from './brain';
import { mark, papers, questions, SKILL_IDS, type Ask } from './exam';
import type { SkillId } from './skills';

// Ghidra's exam from the owner console (M445; STAGE-5-PLAN.md, "Ghidra, the one AI", step 2): the same questions as
// scripts/ai/ghidra-exam.mjs, asked through Ghidra's own brain on the live site, a few at a time. The console page asks
// for the next few while it is open (POST step), so no request runs long; a run picks up where it stopped. Questions
// with a picture, a recording or code to run (home-energy, transcribe, feedback, hyperion) need a browser, a voice or
// Hyperion's engine, so only the command asks them.

const STEP = 6;
const PER = [5, 10, 20] as const;

/** What a console run asks, in order: each skill's first `per` text and JSON questions. */
async function plan(per: number) {
  const all = await papers();
  return SKILL_IDS.flatMap((skill) => questions(skill, all[skill]).slice(0, per).map((ask, n) => ({ skill, n, ask })).filter((q) => q.ask.mode === 'json' || q.ask.mode === 'text'));
}

async function ask(skill: SkillId, a: Ask): Promise<unknown> {
  return a.mode === 'json' ? ghidraJson(skill, a.system, a.prompt, a.schema!, a.maxTokens, a.lite) : ghidraText(skill, a.system, a.prompt, a.maxTokens, a.lite);
}

/** POST /owner/ghidra-exam { action: 'start', per }: a new run (any unfinished one is stopped). */
export async function startExam(perRaw: unknown) {
  if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) throw new HttpException('AI is off on this site, so the exam can’t run.', 503);
  const per = PER.find((p) => p === Number(perRaw)) ?? 10;
  await prisma.ghidraExamRun.updateMany({ where: { status: 'RUNNING' }, data: { status: 'STOPPED', finishedAt: new Date() } });
  const run = await prisma.ghidraExamRun.create({ data: { per, total: (await plan(per)).length } });
  return examState(run.id);
}

/** POST /owner/ghidra-exam { action: 'step', id }: asks the next few questions and saves how they did. */
export async function stepExam(id: unknown) {
  const run = typeof id === 'string' ? await prisma.ghidraExamRun.findUnique({ where: { id } }) : null;
  if (!run) throw new NotFoundException('That exam run isn’t there any more.');
  if (run.status !== 'RUNNING') return examState(run.id);
  // Claim the next questions (no transactions on D1: only the request that moves the cursor asks them).
  const to = Math.min(run.total, run.cursor + STEP);
  const claimed = await prisma.ghidraExamRun.updateMany({ where: { id: run.id, cursor: run.cursor, status: 'RUNNING' }, data: { cursor: to, ...(to >= run.total ? { status: 'DONE', finishedAt: new Date() } : {}) } });
  if (!claimed.count) return examState(run.id);
  const batch = (await plan(run.per)).slice(run.cursor, to);
  const done = await Promise.all(batch.map(async (q) => {
    const got = await ask(q.skill, q.ask).catch(() => null);
    return { runId: run.id, skill: q.skill, n: q.n, failed: JSON.stringify(mark(q.ask, got)), answer: got === null ? null : (typeof got === 'string' ? got : JSON.stringify(got)).slice(0, 2000) };
  }));
  if (done.length) await prisma.ghidraExamAnswer.createMany({ data: done });
  return examState(run.id);
}

/** POST /owner/ghidra-exam { action: 'stop', id }. */
export async function stopExam(id: unknown) {
  if (typeof id !== 'string') throw new BadRequestException('Which run?');
  await prisma.ghidraExamRun.updateMany({ where: { id, status: 'RUNNING' }, data: { status: 'STOPPED', finishedAt: new Date() } });
  return examState(id);
}

export interface ExamSkill { skill: string; passed: number; asked: number; score: number; failed: [rule: string, times: number][] }

/** GET /owner/ghidra-exam (the latest run) and every action's answer: the run and its score card so far. */
export async function examState(id?: string) {
  const run = id ? await prisma.ghidraExamRun.findUnique({ where: { id } }) : await prisma.ghidraExamRun.findFirst({ orderBy: { startedAt: 'desc' } });
  if (!run) return { run: null, skills: [] as ExamSkill[], notAsked: NOT_HERE };
  const rows = await prisma.ghidraExamAnswer.findMany({ where: { runId: run.id }, select: { skill: true, failed: true } });
  const by = new Map<string, ExamSkill>();
  for (const r of rows) {
    const s = by.get(r.skill) ?? { skill: r.skill, passed: 0, asked: 0, score: 0, failed: [] };
    const failed = JSON.parse(r.failed) as string[];
    s.asked++; if (!failed.length) s.passed++;
    for (const f of failed) { const hit = s.failed.find((x) => x[0] === f); if (hit) hit[1]++; else s.failed.push([f, 1]); }
    by.set(r.skill, s);
  }
  const skills = [...by.values()].map((s) => ({ ...s, score: Math.round((100 * s.passed) / s.asked), failed: s.failed.sort((a, b) => b[1] - a[1]).slice(0, 3) })).sort((a, b) => a.score - b.score);
  return { run, skills, notAsked: NOT_HERE };
}
const NOT_HERE = ['home-energy', 'transcribe', 'feedback', 'hyperion'];
