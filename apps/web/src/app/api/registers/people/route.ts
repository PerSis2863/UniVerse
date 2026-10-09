import { route } from '@/server/assignments';
import { findPeople } from '@/server/registers';

// People for the registers (Stage 5 · B15.5). GET ?q=&students=1.
export const GET = (req: Request) => route(req, (user) => { const q = new URL(req.url).searchParams; return findPeople(user, q.get('q') ?? '', q.get('students') === '1'); });
