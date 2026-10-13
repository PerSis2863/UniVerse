import { route } from '@/server/assignments';
import type { Body } from '@/server/body';
import { BadRequestException } from '@/server/http';
import { finishOral, oralOverview, startOral } from '@/server/oral';

// Oral practice and oral checks for students (Stage 5 · D11, src/server/oral.ts). GET: the oral
// checks set in my courses and my recent practice. POST { action: 'start', … }: a voice session
// with the AI examiner; { action: 'finish', … }: the transcript (and, for a check, the recording).
export const GET = (req: Request) => route(req, (user) => oralOverview(user));
export const POST = (req: Request) => route(req, async (user) => {
  const b = ((await req.json().catch(() => null)) ?? {}) as Body;
  if (b.action === 'start') return startOral(user, b);
  if (b.action === 'finish') return finishOral(user, b);
  throw new BadRequestException('Unknown action.');
});
