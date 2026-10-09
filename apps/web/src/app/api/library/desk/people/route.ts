import { route } from '@/server/assignments';
import { findBorrowers } from '@/server/library';

// Borrowers to lend to (Stage 5 · B15.4). GET ?q=. Needs library.manage.
export const GET = (req: Request) => route(req, (user) => findBorrowers(user, new URL(req.url).searchParams.get('q') ?? ''));
