import { route } from '@/server/assignments';
import { getStudentImpactLedger } from '@/server/impact-scholarships';

export const GET = (req: Request) =>
  route(req, async (user) => getStudentImpactLedger(user.id));
