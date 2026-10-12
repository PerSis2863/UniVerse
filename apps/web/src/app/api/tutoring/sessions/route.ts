import { route } from '@/server/assignments';
import { listUserTutoringSessions, bookTutoringSession, type BookSessionInput } from '@/server/peer-tutoring';

export const GET = (req: Request) =>
  route(req, async (user) => {
    const url = new URL(req.url);
    const role = (url.searchParams.get('role') as 'all' | 'tutor' | 'learner') ?? 'all';
    const status = url.searchParams.get('status') ?? undefined;
    return listUserTutoringSessions(user.id, { role, status });
  });

export const POST = (req: Request) =>
  route(req, async (user) => {
    const body = (await req.json()) as BookSessionInput;
    return bookTutoringSession(user.id, body);
  });
