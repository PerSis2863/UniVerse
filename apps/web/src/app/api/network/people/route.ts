import { route } from '@/server/assignments';
import { ForbiddenException } from '@/server/http';
import { assignByDomain, setPersonCampus } from '@/server/campus-network';

// Admins: POST puts everyone without a campus into the one their email domain belongs to;
// PUT { email, campusId } moves one person (campusId null: no campus).
export const POST = (req: Request) => route(req, async (user) => {
  if (user.role !== 'ADMIN') throw new ForbiddenException('Only admins can manage the campus network.');
  return { moved: await assignByDomain() };
});
export const PUT = (req: Request) => route(req, async (user) => setPersonCampus(user, await req.json().catch(() => ({}))));
