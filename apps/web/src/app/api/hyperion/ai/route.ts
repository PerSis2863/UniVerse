import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { spendAi } from '@/server/ai-budget';
import { logAiUse } from '@/server/ai-receipts';
import { ghidraCode } from '@/server/ghidra/own-model';
import { guard, guardReply } from '@/lib/ghidra-guard';

// Ghidra in Hyperion (M435; Ghidra's skill "hyperion" since the one-AI plan): writes, explains and fixes MATLAB / Octave
// code. Which model answers is the brain's choice (src/server/ghidra/own-model.ts, ghidraCode). The answer's code is run by
// the person, in their own Hyperion window: nothing is run here.

const MAX = 6000;

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in to ask Ghidra.' }, { status: 401 });
  let body: { question?: unknown; code?: unknown; error?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, MAX) : '';
  const code = typeof body.code === 'string' ? body.code.slice(0, MAX) : '';
  const error = typeof body.error === 'string' ? body.error.slice(0, 600) : '';
  if (!question && !(code && error)) return NextResponse.json({ error: 'Ask a question.' }, { status: 400 });
  const g = guard(question);
  if (g) return NextResponse.json({ answer: guardReply(g) });

  const spend = await spendAi(user);
  if (!spend.ok) return NextResponse.json({ error: spend.message, code: 'ai-limit' }, { status: 429 });
  await logAiUse(user.id, { kind: 'assistant', detail: `Hyperion: ${question || error}` });

  const prompt = code && error
    ? `This script gives an error in Hyperion:\n\`\`\`matlab\n${code}\n\`\`\`\nThe error: ${error}\n${question ? `They also say: ${question}\n` : ''}Fix it.`
    : code ? `${question}\n\nTheir script:\n\`\`\`matlab\n${code}\n\`\`\`` : question;
  const answer = await ghidraCode(user, prompt);
  if (!answer) return NextResponse.json({ error: 'Ghidra can’t answer right now. Please try again soon.' }, { status: 503 });
  return NextResponse.json({ answer });
}
