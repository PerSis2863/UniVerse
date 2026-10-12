import { route } from '@/server/assignments';
import { detectStudentMasteredSubjects } from '@/server/peer-tutoring';

export const GET = (req: Request) =>
  route(req, async (user) => detectStudentMasteredSubjects(user.id));
