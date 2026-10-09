import { route } from '@/server/assignments';
import { audit } from '@/server/audit';
import { admissionRounds, createRound } from '@/server/admissions';

// Admissions (Stage 5 · B15.1; src/server/admissions.ts). GET: rounds with counts. POST: a new round.
export const GET = (req: Request) => route(req, (user) => admissionRounds(user));
export const POST = (req: Request) => route(req, async (user) => {
  const round = await createRound(user, await req.json().catch(() => ({})));
  audit(user, { action: 'admissions.round_created', summary: `Opened the admission round “${round.title}”`, targetType: 'admission-round', targetId: round.id }, req);
  return round;
});
