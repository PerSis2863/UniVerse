import { route } from '@/server/assignments';
import { BadRequestException } from '@/server/http';
import { deleteInterview, interviewFeedback, interviewHistory, interviewQuestions } from '@/server/careers';

// Stage 5 · Q15: interview practice.
// GET: my recent answers · POST { action: 'questions', role | internshipId } or { action: 'feedback', role, question, answer }
// DELETE ?id= (one answer) or ?all=1

export const GET = (req: Request) => route(req, (user) => interviewHistory(user));
export const POST = (req: Request) => route(req, async (user) => {
  const b = await req.json().catch(() => ({}));
  if (b.action === 'questions') return interviewQuestions(user, b);
  if (b.action === 'feedback') return interviewFeedback(user, b);
  throw new BadRequestException('Unknown action.');
});
export const DELETE = (req: Request) => route(req, (user) => {
  const q = new URL(req.url).searchParams;
  const id = q.get('id');
  if (!id && q.get('all') !== '1') throw new BadRequestException('Say which answer to remove.');
  return deleteInterview(user, id);
});
